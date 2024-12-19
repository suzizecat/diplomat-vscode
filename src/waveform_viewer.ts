import { spawn, ChildProcess, exec } from 'node:child_process';
import path = require('node:path');
import { commands, ExtensionContext, workspace } from 'vscode';
import { integer } from 'vscode-languageclient';
import { SignalData, WaveformViewerCbArgs } from './exchange_types';
import { EventEmitter } from 'node:stream';
import { assertEquals } from "typia"
import { once } from 'node:events';
import { assert } from 'node:console';
import Semaphore = require('ts-semaphore');

const b64decode = (str: string): string => Buffer.from(str, 'base64').toString('binary');
const b64encode = (str: string): string => Buffer.from(str, 'binary').toString('base64');

const  cmdAccess = new Semaphore(1);

abstract class BaseViewer {

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

    protected addPeriodicCommand(cmd: () => void, delay: integer) {
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

                        let position : integer;
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


export class GTKWaveViewer extends BaseViewer {

    public readonly canFollowWaveSelection : boolean = true;

    /**
     * openWave
     */


    // protected setUpCapabilities() {
    //     this._followWavesEnabled = this.canFollowWaveSelection;
    //     console.log(`Set "follow" capability to ${this.canFollowWaveSelection}`);
    //     commands.executeCommand("setContext", "diplomat-host:viewerCanFollowSignal", this.canFollowWaveSelection);
    // }

    public async openWave(wavefile: string) {

        this.setUpCapabilities();
        await this.ensureClosed();
        let arglist = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string[]>("options");
        
        if(! arglist)
            arglist = [];

        if (!arglist.includes("-W")) {
            arglist.push("-W");
        }

        let execEnv = process.env;
        arglist.push(wavefile);

        console.log("Removing environment variables known to prevent GTKWave to start:");
        console.log("    GTK_PATH................ %s", delete execEnv.GTK_PATH);
        console.log("    GTK_EXE_PREFIX.......... %s", delete execEnv.GTK_EXE_PREFIX);
        console.log("    GDK_PIXBUF_MODULE_FILE.. %s", delete execEnv.GDK_PIXBUF_MODULE_FILE);
        console.log("    GIO_MODULE_DIR.......... %s", delete execEnv.GIO_MODULE_DIR);
        console.log(`Spawning command line '${this.executable} ${arglist.join(" ")}'`);

        // if (this.verboseLog) {
        //     let env_dump: string = "";
        //     Object.keys(execEnv).forEach(function (key) {
        //         env_dump = env_dump + key + '="' + execEnv[key] + "\n";
        //     });
        //     console.log(`Environement is :\n${env_dump}`);
        // }
        this.viewerProcess = spawn(this.executable, arglist, { "env": execEnv });

        this.viewerClosed = new Promise((resolve) => {
            this.viewerProcess?.on("close", resolve);
        })

        this.viewerProcess.on("close", (code) => {
            console.log(`Gtkwave is being closed with exit code ${code}`);
            const currPid = structuredClone(this.pid);
            this.ensureClosed();
        });


        this.viewerProcess.on("error", (err) => {
            console.error("Gtkwave encountered an error");
            console.error(err);
        });
        if (this.verboseLog) {
            this.viewerProcess.stderr?.on('data', (data) => {
                console.log(`stderr: ${data}`);
            });
        }
        

        const init_path = this.context.asAbsolutePath(path.join("resources", "gtkwave_setup.tcl"));
        
        await this.exchangeCommand(`source ${init_path}`);

        this.addPeriodicCommand(() => {
           
            this.exchangeCommand("tell_time_updated")
                .then((result: string) => {
                    let newtime = result.trim();
                    if (newtime != "") {
                        commands.executeCommand("diplomat-host.waves.refresh-annotations");
                    }
                });
                
        }, 500);

        this.addPeriodicCommand(() => {
            if(this._followWavesEnabled)
            {
                this.exchangeCommand("tell_selected")
                    .then((result: string) => {
                        if(result.trim() != "")
                        {
                            this.forwardToCallback(JSON.parse(result));
                        }
                    });
            }
                
        }, 500);

        commands.executeCommand("setContext", "diplomat-host:viewerEnabled", true);
    }

    public async addSignalToWave(signals: string[]): Promise<void> {
        await this.sendCommand("set signal_to_add [list]");
        for (let sig of signals) {
            await this.sendCommand('lappend signal_to_add "' + sig + '"');
        }

        await this.sendCommand(`gtkwave::addSignalsFromList ${signals.join(' ')}`)

    }

    public async getSignals(signals: string[]): Promise<SignalData[]> {
        console.log(`Request get signals from GTKWave of ${signals}`);
        await this.sendCommand(`set signals_to_get { ${signals.join(" ")} }`);
        let result: string = await this.exchangeCommand(`get_signals_values $signals_to_get`);
        console.log(`Got values`)
        return assertEquals<SignalData[]>(JSON.parse(result));
    }

    public async refreshWaves(): Promise<void> {
        console.log("Refresh wave display");
        await this.sendCommand("gtkwave::reLoadFile");
    }

    public close() {

        if (this.viewerProcess !== null) {
            this.viewerProcess.stdin?.write("\nexit\n");
        }
    }


}