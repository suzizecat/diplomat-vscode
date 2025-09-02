"use strict";

import * as net from "net";
import * as path from "path";
import { ExtensionContext, workspace, commands, window, QuickPickItem, QuickPickItemKind, TextEditor, Uri, FileStat } from "vscode";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

import * as extypes from "./exchange_types";

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

	
	context.subscriptions.push(client);
	return client;
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

export async function pushParameters(context : ExtensionContext) : Promise<void> {
	if (context.storageUri !== undefined) {
		workspace.fs.createDirectory(context.storageUri);
		const config_path : Uri = Uri.joinPath(context.storageUri,"diplomat-settings.json");
		console.log(`Pushing parameters from ${config_path}`);
		try {
			let exist = await workspace.fs.stat(config_path); // Check if file exists, throw otherwise.
			let content = await workspace.fs.readFile(config_path);
			let params : extypes.DiplomatConfig = JSON.parse(new TextDecoder().decode(content));
			await commands.executeCommand("diplomat-server.push-config",params);
			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
		
	}
	return Promise.reject("Storage URI is invalid, no workspace seems to be open.");
}


export async function pullParameters(context : ExtensionContext) : Promise<void> {
	
	if (context.storageUri !== undefined) {
		workspace.fs.createDirectory(context.storageUri);
		const config_path : Uri = Uri.joinPath(context.storageUri,"diplomat-settings.json");
		console.log(`Pulling parameters to ${config_path}`);
		try {
			let params = await commands.executeCommand<extypes.DiplomatConfig>("diplomat-server.pull-config");
			let content = JSON.stringify(params);
			await workspace.fs.writeFile(config_path,new TextEncoder().encode(content));
			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
	}
	return Promise.reject("Storage URI is invalid, no workspace seems to be open.");
}

export async function openParameterFile(context: ExtensionContext): Promise<void> {
	if (context.storageUri)	{
		const config_path: Uri = Uri.joinPath(context.storageUri, "diplomat-settings.json");
		workspace.fs.stat(config_path).then((_: FileStat) => {
			return commands.executeCommand("vscode.open", config_path);
		},() => {});
	}
}

export function deactivate(): Thenable<void> {
	console.log("Deactivate the LSP");
	return client ? client.stop() : Promise.resolve();
}
