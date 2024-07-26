import { spawn, ChildProcess, exec } from 'node:child_process';
import path = require('node:path');
import { ExtensionContext } from 'vscode';
import { integer } from 'vscode-languageclient';
import { SignalData, WaveformViewerCbArgs } from './exchange_types';
import { EventEmitter } from 'node:stream';
import { assertEquals } from "typia"
import { once } from 'node:events';
import { assert } from 'node:console';

const b64decode = (str: string):string => Buffer.from(str, 'base64').toString('binary');
const b64encode = (str: string):string => Buffer.from(str, 'binary').toString('base64');


abstract class BaseViewer {
    protected viewerProcess : null | ChildProcess  = null;
    protected spawnArgs : Array<string>;
    protected executable : string
    protected validWavesExtension: Array<string>;
    protected context: ExtensionContext;

    protected viewerClosed : Promise<void> = Promise.resolve();

    public verboseLog : boolean = false;

    private periodicCalls: NodeJS.Timeout[] = []
    protected stdoutChunks: Array<string> = [];

    protected stdoutCb: (args: WaveformViewerCbArgs) => Promise<void>;

    constructor(context : ExtensionContext, execPath : string, execArgs : Array<string>, stdoutCallBack : (args: WaveformViewerCbArgs) => Promise<void>, validWavesFiles : string[] = []) {
        this.executable = execPath;
        this.spawnArgs = execArgs;
        this.validWavesExtension = validWavesFiles;
        this.context = context;
        this.stdoutCb = stdoutCallBack;
    } 

    abstract openWave(wavefile : string) : void;
    abstract addSignalToWave(signals: string[]): void;
    abstract getSignals(signals: string[]): Promise<SignalData[]>;
    abstract close(): void;
    
    protected forwardToCallback(data: any) {
        
        let command = this.stdoutChunks.join("");
        this.stdoutChunks = [];

        let cbArgs : WaveformViewerCbArgs | undefined = undefined;
        try {
            cbArgs = assertEquals<WaveformViewerCbArgs>(data);
        } catch (error) {
            if (this.verboseLog) {
                console.log("Failed to parse viewer output\n%s", command);
                cbArgs = undefined;
            }
        }

        if (cbArgs !== undefined) {
            
            this.stdoutCb(cbArgs);
        }
        


    }

    protected async ensureClosed() {

        this.stopAllPeriodic();

        if(this.viewerProcess !== null) {
            
            if( this.viewerProcess.exitCode === null) {
                // Still running
                console.log("Force closing of a previous running instance.")
                this.viewerProcess.kill("SIGKILL");
            }
    
            this.viewerProcess = null;
            this.spawnArgs = []; // Clear the args
        }

        await this.viewerClosed;
    }

    private stopAllPeriodic() {
        for (let periodicId in this.periodicCalls) {
            clearInterval(periodicId);
        }

        this.periodicCalls = []
    }

    protected addPeriodicCommand(cmd : () => void, delay : integer) {
        this.periodicCalls.push(setInterval(cmd,delay));
    }

    protected sendCommand(cmd : string) {
        if(this.viewerProcess !== null) {
            if(!this.viewerProcess.stdin?.write(cmd + "\n")) {
                return new Promise((resolve) => {
                    this.viewerProcess?.stdin?.once("drain",resolve);
                });
            }
        }
        return Promise.resolve();
    }

    
    public get running() : boolean {
        return this.viewerProcess !== null;
    }

    public get supportedExtensions() : string[] {
        return this.validWavesExtension;
    }

    public get pid() : number | undefined {
        return this.viewerProcess?.pid;
    }
   
    public dispose() {
        this.ensureClosed();
    }
    
};


export class GTKWaveViewer extends BaseViewer {


    /**
     * openWave
     */
    public events = new EventEmitter();

    private handleStdout(data: string) {
        let trimmed: string = data.toString().trimEnd()
        if (this.verboseLog) {
            console.log(`stdout: ${data}`);
        }
        if (trimmed.slice(-1) == '§') {
            this.stdoutChunks.push(trimmed.slice(0, -1));

            let data = this.stdoutChunks.join("");
            this.stdoutChunks = [];
            let catchedJson: JSON | undefined = undefined;
            
            try {
                catchedJson = JSON.parse(data);
            } catch (error) {
                if (this.verboseLog) {
                    console.log("Failed to parse viewer output\n%s", data);
                }
            }
            
            if(catchedJson) {
                this.events.emit("replyReceived", data);
            }

            if (this.verboseLog) {
                console.log(`End of command`);
            }
        }
        else {
            this.stdoutChunks.push(data);
        }
    }

    public async openWave(wavefile : string) {
        await this.ensureClosed();
        let arglist = this.spawnArgs;
        
        if(! arglist.includes("-W")) {
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

        if (this.verboseLog) {
            let env_dump: string = "";
            Object.keys(execEnv).forEach(function (key) {
                env_dump = env_dump + key + '="' + execEnv[key] + "\n";
            });
            console.log(`Environement is :\n${env_dump}`);
        }
        this.viewerProcess = spawn(this.executable, arglist,{"env":execEnv});
        //this.viewerProcess = spawn("env",[],{"env":execEnv});
        //this.viewerProcess = spawn("gnome-terminal",[],{"env":execEnv});

        this.viewerClosed = new Promise( (resolve) => {
            this.viewerProcess?.on("close",resolve);
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
        if (this.verboseLog)
        {
            // this.viewerProcess.stdout?.on('data', (data) => {
            //     console.log(`stdout: ${data}`);
            // });
            this.viewerProcess.stderr?.on('data', (data) => {
                console.log(`stderr: ${data}`);
            });
        }

        this.viewerProcess.stdout?.on("data", (data) => this.handleStdout);




        const init_path = this.context.asAbsolutePath(path.join("resources", "gtkwave_setup.tcl"));
        await this.sendCommand(`source ${init_path}`);

        // this.addPeriodicCommand(() => {
        //     this.sendCommand("tell_info");
        // },1000)

        this.addPeriodicCommand(() => {
            this.events.once("replyReceived", this.forwardToCallback);
            this.sendCommand("tell_selected");
        }, 500);
        
    }

    public async  addSignalToWave(signals: string[]): Promise<void> {
        await this.sendCommand("set signal_to_add [list]");
        for(let sig of signals) {
            await this.sendCommand('lappend signal_to_add "' + sig + '"');
        }

        await this.sendCommand(`gtkwave::addSignalsFromList ${signals.join(' ')}`)
        
    }

    public async getSignals(signals: string[]): Promise<SignalData[]> {
        await this.sendCommand(`set signals_to_get { ${signals.join(" ")} }`);
        this.sendCommand(`get_signals_values $signals_to_get`);

        let result: any = await once(this.events, "replyReceived");

        return assertEquals<SignalData[]>(JSON.parse(result));        
    }

    public close() {
        if(this.viewerProcess !== null) {
            this.viewerProcess.stdin?.write("exit\n");
        }
    }

    
}