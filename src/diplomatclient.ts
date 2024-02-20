/* -------------------------------------------------------------------------
 * Original work Copyright (c) Microsoft Corporation. All rights reserved.
 * Original work licensed under the MIT License.
 * See ThirdPartyNotices.txt in the project root for license information.
 * All modifications Copyright (c) Open Law Library. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License")
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http: // www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * ----------------------------------------------------------------------- */
"use strict";

import * as net from "net";
import * as path from "path";
import { ExtensionContext, workspace, commands, window, QuickPickItem, QuickPickItemKind, TextEditor } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

let client: LanguageClient;

function getClientOptions(): LanguageClientOptions {
  return {
    // Register the server for plain text documents
    documentSelector: [
      { scheme: "file", language: "systemverilog" },
      { scheme: "untitled", language: "systemverilog" },
    ],
    outputChannelName: "[diplomat] Server",
    synchronize: {
      // Notify the server about file changes to '.clientrc files contain in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/.clientrc"),
    },
  };
}

function isStartedInDebugMode(): boolean {
  return process.env.VSCODE_DEBUG_MODE === "true";
}

function startLangServerTCP(addr: number): LanguageClient {
  const serverOptions: ServerOptions = () => {
    return new Promise((resolve, reject) => {
      const clientSocket = new net.Socket();
      clientSocket.connect(addr, "127.0.0.1", () => {
        resolve({
          reader: clientSocket,
          writer: clientSocket,
        });
      });
    });
  };

  return new LanguageClient(`tcp lang server (port ${addr})`, serverOptions, getClientOptions());
}

function startLangServer(
  command: string, args: string[], cwd: string,
): LanguageClient {
  const serverOptions: ServerOptions = {
    command:command,
    args:args,
    //transport:TransportKind.stdio,
    //options: { cwd },
  };

  return new LanguageClient(command, serverOptions, getClientOptions());
}

export function activateLspClient(context: ExtensionContext) {
  if ( workspace.getConfiguration("diplomatServer.server").get<boolean>("useTCP")) {
    // Development - Run the server manually
    console.log("Start the server in TCP mode...");
    client = startLangServerTCP(8080);
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
    client = startLangServer(serverExecutable, serverArgs, ".");
  }

  client.start();
  context.subscriptions.push(client);
  //client.start();
  //commands.executeCommand("diplomat-server.get-configuration");
}


class ModuleItem implements QuickPickItem {

  constructor(public label: string, public description : string) {}
}

type ModuleDesc =  {file: string, name: string};
type ModuleHead = {
  module:      string,
  parameters : Array<{default : string, name: string, type:string}>,
  ports :      Array<{kind:string,name:string,type:string,size:string,direction:string,is_interface:boolean,modport:string,comment:string}>
};

export async function showInstanciate() {
	
  //const avail_modules : JSON = JSON.parse();
  let availModules = await commands.executeCommand<Array< ModuleDesc>>("diplomat-server.get-modules");
  console.log("Server modules : " + availModules.toString());
  
  let items : Array<ModuleItem> = [];

  for(let mod of availModules)
  {
    items.push(new ModuleItem(mod.name, mod.file));
  }

	const result = await window.showQuickPick(items, {
		placeHolder: 'Module to instanciate'
	});

  if(result !== undefined)
  {
    let moduleHead = await commands.executeCommand<ModuleHead>("diplomat-server.get-module-bbox",{file:result.description, module:result.label});
    window.showInformationMessage(`Got informations for module ${moduleHead.module}`);
    let toInsert = `${moduleHead.module} `;
    if( moduleHead.parameters.length > 0)
    {
      toInsert += " #(\n\t";
      for(let param of moduleHead.parameters)
      {
        toInsert += `.${param.name}(`;
        if(param.default !== undefined)
        {
          toInsert += `${param.default}`;
        }
        else
        {
          toInsert += `${param.name}`;
        }
        
        toInsert += ")";

        if(param !== moduleHead.parameters.at(-1))
        {
          toInsert += ",";
        }
        toInsert += "\n";
      }
      toInsert += ") ";
    }
    toInsert += `u_${moduleHead.module} (\n\t`;

    for(let port of moduleHead.ports)
    {
      toInsert += `.${port.name}( ${port.name} )`;
      if(port !== moduleHead.ports.at(-1))
      {
        toInsert += `, ${port.comment}\n\t`;
      }
      else
      {
        toInsert += `  ${port.comment}`;
      }
    }

    toInsert += `\n);`;
    if(window.activeTextEditor !== undefined)
    {
      const textEditor : TextEditor =  window.activeTextEditor;
      textEditor.edit((builder) => {
        builder.insert(textEditor.selection.start,toInsert);
      });
    }
  }
}



export function deactivate(): Thenable<void> {
  console.log("Deactivate the LSP");
  return client ? client.stop() : Promise.resolve();
}
