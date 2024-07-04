import { spawn, ChildProcess, exec } from 'node:child_process';
import { resolve } from 'node:path';
import { integer } from 'vscode-languageclient';


abstract class BaseViewer {
    protected viewerProcess : null | ChildProcess  = null;
    protected spawnArgs : Array<string>;
    protected executable : string
    protected validWavesExtension: Array<string>;

    protected viewerClosed : Promise<void> = Promise.resolve();

    public verboseLog : boolean = false;

    private periodicCalls : NodeJS.Timeout[] = []

    constructor(execPath : string, execArgs : Array<string>, validWavesFiles : string[] = []) {
        this.executable = execPath;
        this.spawnArgs = execArgs;
        this.validWavesExtension = validWavesFiles;
    } 

    abstract openWave(wavefile : string) : void;
    abstract addSignalToWave(signals : string[]) : void;
    abstract close() : void;

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
            this.viewerProcess.stdout?.on('data', (data) => {
                console.log(`stdout: ${data}`);
            });
            this.viewerProcess.stderr?.on('data', (data) => {
                console.log(`stderr: ${data}`);
            });
        }

        await this.sendCommand(`source /mnt/hspeed/Linux/Projets/VSCODE-Extensions/diplomat/diplomat-vscode/src/gtkwave_setup.tcl`)

        this.addPeriodicCommand(() => {
            this.sendCommand("tell_info");
        },500)
        // await this.sendCommand(`proc demo {varname args} {
        //         upvar 0 $varname var
        //         set signal [ string trim $var ".{}" ]
        //         set val [ gtkwave::getTraceValueAtMarkerFromName $signal ]
        //         puts "Selected $varname, value is $signal = $val!"

        //     }
        //         trace add variable gtkwave::cbTreeSigDoubleClick write "demo gtkwave::cbTreeSigDoubleClick" 
        //     `);
        
    }

    public async  addSignalToWave(signals: string[]): Promise<void> {
        await this.sendCommand("set signal_to_add [list]");
        for(let sig of signals) {
            await this.sendCommand('lappend signal_to_add "' + sig + '"');
        }

        await this.sendCommand(`gtkwave::addSignalsFromList ${signals.join(' ')}`)
        
    }

    public close() {
        if(this.viewerProcess !== null) {
            this.viewerProcess.stdin?.write("exit\n");
        }
    }

    
}