import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:stream';
import { once } from 'node:events';

import { commands, ExtensionContext, workspace } from 'vscode';

import { assertEquals } from "typia"
import Semaphore = require('ts-semaphore');

import { SignalData, WaveformViewerCbArgs } from '../exchange_types';

const  cmdAccess = new Semaphore(1);


export abstract class BaseViewer {

    protected viewerProcess: null | ChildProcess = null;
    protected spawnArgs: Array<string>;
    protected executable: string
    protected validWavesExtension: Array<string>;
    protected context: ExtensionContext;

    protected _followWavesEnabled : boolean = false;
    protected setupDone : boolean = false; // Is set to true to avoid calling setup multiple time.
    public abstract readonly canFollowWaveSelection : boolean;
    
    public events = new EventEmitter(); //! Events used to interface with the viewer.


    protected viewerClosed: Promise<void> = Promise.resolve();

    public verboseLog: boolean = false;

    private periodicCalls: NodeJS.Timeout[] = []
    protected llGetRemaining: string = "";

    //private cmdAccess = new Semaphore(1);

    protected stdoutCb: (args: WaveformViewerCbArgs) => Promise<void>;

    constructor(context: ExtensionContext, execPath: string, execArgs: Array<string>, stdoutCallBack: (args: WaveformViewerCbArgs) => Promise<void>, validWavesFiles: string[] = []) {
        this.executable = execPath;
        this.spawnArgs = execArgs;
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
        this.llGetRemaining = "";
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
            await cmdAccess.use(async () => { await this._lowLevelSendData(cmd); });
        }
    }

    protected async exchangeCommand(cmd: string) {
        if (this.running) {
            return await cmdAccess.use(
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