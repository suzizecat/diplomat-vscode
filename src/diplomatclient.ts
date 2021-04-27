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
import { ExtensionContext, workspace, commands, window } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions } from "vscode-languageclient/node";

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
    args,
    command,
    options: { cwd },
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
    const python = workspace.getConfiguration("diplomatServer").get<string>("pythonCommand");
    const servercommand = workspace.getConfiguration("diplomatServer").get<string>("serverCommand");

    if (!python) {
      throw new Error("`diplomatServer.pythonCommand` is not set"); 
    }
    if (!servercommand) {
      throw new Error("`diplomatServer.serverCommand` is not set");
    }

    console.log("    Command is " + python + " " + servercommand);
    const args = servercommand.split(" ");
    console.log("Starting through " + python, "'" + args.join("' '") + "'");
    client = startLangServer(python, args, args[0]);
  }


  context.subscriptions.push(client.start());
  commands.executeCommand("diplomat-server.get-configuration");
}

export function deactivate(): Thenable<void> {
  return client ? client.stop() : Promise.resolve();
}
