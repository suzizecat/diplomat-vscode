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


import { Socket } from "net";
import { commands, EventEmitter, ExtensionContext, window, workspace } from "vscode";
import { InitializeResult, LanguageClientOptions } from "vscode-languageclient";
import { LanguageClient, ServerOptions } from "vscode-languageclient/node";

import {BaseFeature, ExtensionEnvironment} from "./base_feature";


const semver = require('semver');

const REQUIRED_DIPLOMAT_LS_VERSION : string = "~0.3.0-dev";

export class FeatureDiplomatLSPClient extends BaseFeature {

    private _client_options : LanguageClientOptions;
    protected _client ?: LanguageClient;

    /**
     * Event used to notify that the server has actually been started and that
     * other part of the extension may use it.
     */
    public server_started : EventEmitter<void> = new EventEmitter<void>();

    public constructor(ext_context : ExtensionEnvironment)
    {
        // Base setup of a feature
        super("lsp-client",ext_context);

        // Client options used downstream.
        this._client_options = 
        {
            // Register the server for SystemVerilog
            documentSelector: [
                { scheme: "file", language: "systemverilog" },
                { scheme: "untitled", language: "systemverilog" },
            ],
            outputChannelName: "[diplomat] Server"
        };
    }


    /**
     * This function actually starts the server client (and the server itself if required).
     * To syncronize on the server boot, you may want to work with the {@link server_started} event.
     */
    public async start() : Promise<void> 
    {
        this.logger?.info("Starting the language server client.");
        this._build_lspclient();

        if(!this._client)
            throw new Error("Failed to build the language server client");

        await this._client.start();
        this.check_lsp_compat(this._client.initializeResult);

        this.server_started.fire();
        this.logger?.info("The language server has been started.");
    }

    /**
     * This function builds the LS client depending on proper parameters
     * and regardless of the kind of LS wanted.
     */
    protected _build_lspclient()
    {
        if ( workspace.getConfiguration("diplomatServer.server").get<boolean>("useTCP")) {
            // Development - Run the server in TCP mode
            console.log("Start the server in TCP mode...");
            this._client = this._build_lsclient_tcp(8080);
        } else {
            console.log("Start the server in IO mode...");
            // Production - Client is going to run the server (for use within `.vsix` package)
            const serverExecutable = workspace.getConfiguration("diplomatServer").get<string>("serverPath");
            const serverArgs = workspace.getConfiguration("diplomatServer").get<Array<string>>("serverArgs");
            
            if (!serverExecutable) {
                throw new Error("`diplomatServer.serverPath` is not set"); 
            }
            if (serverArgs === undefined) {
                throw new Error("`diplomatServer.serverArgs` is not set");
            }
            
            console.log("    Command is " + serverExecutable + " " + serverArgs);
            console.log("Starting through " + serverExecutable, "'" + serverArgs.join("' '") + "'");
            this._client = this._build_lsclient_stdio(serverExecutable, serverArgs, ".");
        }
        
        this.context?.subscriptions?.push(this._client);
    }

    /**
     * Create the language client object required to interface through the LSP
     * using TCP connection to a local server (used for debug)
     * @param bind_port TCP port to bind the connection to
     * @returns Language client object, ready to be 'start'-ed
     */
    protected _build_lsclient_tcp(bind_port : number) : LanguageClient {
        const serverOptions: ServerOptions = () => {
            return new Promise((resolve, reject) => {
                const clientSocket = new Socket();
                clientSocket.connect(bind_port, "127.0.0.1", () => {
                    resolve({
                        reader: clientSocket,
                        writer: clientSocket,
                    });
                });
            });
        };
        
        return new LanguageClient(`Diplomat Server`, serverOptions, this._client_options);
    }

    /**
     * Create the language client object required to interface through the LSP
     * using basic 'STDIO' communication.
     * @param command Command used to boot the server
     * @param args Arguments to be forwarded to the server
     * @param cwd Working directory of the server
     * @returns Language client object, ready to be started
     */
    protected _build_lsclient_stdio(
        command: string, args: string[], cwd: string,
    ): LanguageClient {
        const serverOptions: ServerOptions = {
            command:command,
            args:args,
            //transport:TransportKind.stdio,
            //options: { cwd },
        };
        
        return new LanguageClient(command, serverOptions, this._client_options);
    }

    /**
     * This function check various parameter sent by the language server and return a boolean
     * indicating if all those checks have been passed.
     * 
     * It checks for: 
     *  - Server name
     *  - Server version number using semver
     * @param init_info Information retrieved from the LS upon boot
     * @returns True if the server is compatible, false otherwise
     */
    public check_lsp_compat(init_info ?: InitializeResult) : boolean {
        if(init_info) {
            if(init_info.serverInfo?.name === "Diplomat-LSP")
            {
                const vinfo = init_info.serverInfo?.version
                if(! vinfo)
                {
                    window.showErrorMessage("Diplomat LSP has not returned any version number");
                }
                else
                {
                    if(vinfo === "custom-build" || semver.satisfies(vinfo,REQUIRED_DIPLOMAT_LS_VERSION))
                    {
                        this.logger?.info( `Got server version info ${vinfo}`);
                        return true;
                    }
                    else
                    {
                        this.logger?.warn( `Got mismatching server version info ${vinfo} (requires ${REQUIRED_DIPLOMAT_LS_VERSION})`);
                        window.showWarningMessage(`The Lanquage server returned a mismatching version number ${vinfo} (requires ${REQUIRED_DIPLOMAT_LS_VERSION})`);
                    }

                }
            }
        }
        else
        {
            this.logger?.warn("Skipped the server version check (no info from server)");
            return true; 
        }
        return false;
    }
}