import { spawn, ChildProcess } from 'node:child_process';
import path = require('node:path');

import { commands, workspace } from 'vscode';
import { assertEquals } from "typia"

import { BaseViewer } from "./base_viewer";
import { SignalData } from '../exchange_types';


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