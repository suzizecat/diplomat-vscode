 /*
 * Diplomat for Visual Studio Code is a language server protocol client for Diplomat language server.
 * Copyright (C) 2025  Julien FAUCHER
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */


import { spawn, ChildProcess } from 'node:child_process';
// import { EventEmitter } from 'node:stream';
import {EventEmitter} from "node:events";
import { once } from 'node:events';

import { commands, ExtensionContext, workspace } from 'vscode';

import { assertEquals } from "typia"
import Semaphore = require('ts-semaphore');

import { SignalData, WaveformViewerCbArgs } from '../../exchange_types';

// const  cmdAccess = new Semaphore(1);

/**
 * This class is responsible for providing the high-level interfaces
 * and requirements to provide support for a waveform viewer in Diplomat Host.
 * 
 * This class also provides base functions to help such implementation and define
 * basic behavior.
 */
export abstract class BaseViewer {


    /** Holds the process object (if any) that will be used to hold the viewer. */
    protected viewerProcess: null | ChildProcess = null;
    /** List of arguments used to spawn the viewer process */
    protected spawnArgs: Array<string>;
    /** Base command to run in order to start the viewer */
    protected executable: string
    /** List of all extensions supported by the viewer */
    protected validWavesExtension: Array<string>;
    /** Extension context, propagated to the viewer manager */
    protected context: ExtensionContext;

    /** Holds the internal capability related to following signals */
    protected _followWavesEnabled : boolean = false;
    /** Is set to true to avoid calling setup multiple time. */
    protected setupDone : boolean = false; 
    /** Is used to provide the capability of following signals in overriden managers */
    public abstract readonly canFollowWaveSelection : boolean;
    
    /** Events used to interface with the viewer. */
    public events = new EventEmitter(); 

    /** 
     * Promise that resolved once the viewer is closed.
     * Should be an already resolved promise if no viewer is open.
     */
    protected viewerClosed: Promise<void> = Promise.resolve();

    public verboseLog: boolean = false;

    /**
     * Holder for periodic calls related to the viewer.
     * The manager will dispose of all the periodic calls upon destruction.
     * 
     * @see {@link addPeriodicCommand} to store periodic calls.
     * @see {@link stopAllPeriodic} to dispose of the periodic calls.
     */
    private periodicCalls: NodeJS.Timeout[] = []

    /**
     * This semaphore ensures that only one command has access to the 
     * actual viewer, assuming that the connexion is made 
     * through STDIO.
     */
    private cmdAccess = new Semaphore(1);

    /**
     * Command that is called upon receiving an element from the viewer.
     * This allows interactions initiated by the viewer.
     * 
     * The supported commands are defined by stdoutCb rather than the viewer.
     */
    protected stdoutCb: (args: WaveformViewerCbArgs) => Promise<void>;

    /**
     * 
     * @param context Extension context to work on
     * @param execPath Waveform viewer execution path/command, without arguments
     * @param execArgs List of arguments to use
     * @param stdoutCallBack Callback to use when the viewer provides commands
     * @param validWavesFiles List of valid waveform files extensions.
     */
    constructor(context: ExtensionContext, execPath : string | undefined, execArgs : Array<string> | undefined, stdoutCallBack: (args: WaveformViewerCbArgs) => Promise<void>, validWavesFiles: string[] = []) {
        if(! execPath)
            throw new Error("Waveform viewer command cannot be unset.")
        this.executable = execPath;
        this.spawnArgs = execArgs ? execArgs : [];
        this.validWavesExtension = validWavesFiles;
        this.context = context;
        
        this.stdoutCb = stdoutCallBack;
        commands.executeCommand("setContext", "diplomat-host:viewerEnabled", false);
    }

    protected setUpCapabilities() : void
    {
        if(! this.setupDone){
            this.setupDone = true;
            this._followWavesEnabled = this.canFollowWaveSelection;
            console.log(`Set "follow" capability to ${this.canFollowWaveSelection}`);
            commands.executeCommand("setContext", "diplomat-host:viewerCanFollowSignal", this.canFollowWaveSelection);
        }
    }

    abstract openWave(wavefile: string): void;
    abstract addSignalToWave(signals: string[]): void;
    abstract getSignals(signals: string[]): Promise<SignalData[]>;
    abstract refreshWaves(): void;
    abstract close(): void;

    protected forwardToCallback(data: any) {

        let cbArgs: WaveformViewerCbArgs | undefined = undefined;
        try {
            cbArgs = assertEquals<WaveformViewerCbArgs>(data);
        } catch (error) {
            if (this.verboseLog) {
                console.log("Failed to parse viewer output\n%s", data);
                cbArgs = undefined;
            }
        }

        if (cbArgs !== undefined) {

            this.stdoutCb(cbArgs);
        }
    }

    protected async ensureClosed() {
        
        this.stopAllPeriodic();
        commands.executeCommand("diplomat-host.waves.clear-annotations");
        

        if (this.viewerProcess !== null) {

            if (this.viewerProcess.exitCode === null) {
                // Still running
                console.log("Force closing of a previous running instance.")
                this.viewerProcess.kill("SIGKILL");
            }

            this.viewerProcess = null;
            this.spawnArgs = []; // Clear the args
        }

        await this.viewerClosed;
        // Disable all context
        commands.executeCommand("setContext", "diplomat-host:viewerEnabled", false);
    }

    private stopAllPeriodic() {
        for (let periodicId of this.periodicCalls) {
            clearInterval(periodicId);
        }

        this.periodicCalls = []
    }

    protected addPeriodicCommand(cmd: () => void, delay: number) {
        this.periodicCalls.push(setInterval(cmd, delay));
    }


    private _lowLevelSendData(cmd :string) {
        if (this.viewerProcess !== null) {

            if (!this.viewerProcess.stdin?.write(cmd + "\n")) {
                return new Promise((resolve) => {
                    this.viewerProcess?.stdin?.once("drain", resolve);
                });
            }
        }
    }

    private async _lowLevelGetData() : Promise<string> {
        let buffer : string[] = [];
        if (this.viewerProcess?.stdout?.readable)
        {
            
            let rawData : null | Buffer = this.viewerProcess.stdout.read();
            let endFound : boolean = false;
            while(!endFound)
            {
                
                let data : string = "";

                if(rawData !== null)
                {
                        data = rawData.toString("utf8");

                        let position : number;
                        if((position = data.indexOf("§")) == -1)
                        {
                            buffer.push(data);
                        }
                        else {
                            buffer.push(data.slice(0,position));
                            endFound = true;
                        }
                }

                if(rawData === null || ! endFound)
                    rawData = (await once(this.viewerProcess.stdout,"data"))[0];
                // else
                //     console.log("Clean exit of LL get");

            } 
        }
        let ret : string = buffer.join("").trimEnd();
        await this._lowLevelFlushStdout();
        return ret;
    }

    private async _lowLevelFlushStdout() 
    {
        if (this.viewerProcess?.stdout?.readable)
        {
            let data;
            while((data = this.viewerProcess.stdout.read()) !== null)
            { // Nothing
            } 
        }
    }


    protected async sendCommand(cmd: string) {
        if (this.running) {
            await this.cmdAccess.use(async () => { await this._lowLevelSendData(cmd); });
        }
    }

    protected async exchangeCommand(cmd: string) {
        if (this.running) {
            return await this.cmdAccess.use(
                async () => {
                    await this._lowLevelFlushStdout();
                    await this._lowLevelSendData(cmd);
                    return await this._lowLevelGetData();
                });
        }
        else {
            return Promise.reject("The waveform viewer is not running");
        }
    }

 
    public get running(): boolean {
        return this.viewerProcess !== null;
    }

    public get supportedExtensions(): string[] {
        return this.validWavesExtension;
    }

    public get pid(): number | undefined {
        return this.viewerProcess?.pid;
    }

    public dispose() {
        (async () => {await this.ensureClosed();});        
    }

    public setWaveFollow(newValue : boolean) {
        if(this.canFollowWaveSelection)
            this._followWavesEnabled = newValue;
    }

    public get waveFollowingEnabled() : boolean
    {
        return this._followWavesEnabled;
    }

};