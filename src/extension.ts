// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, commands, ExtensionContext, workspace, Uri } from 'vscode';
import { showQuickPick, showInputBox } from './basicInput';
import { multiStepInput } from './multiStepInput';
import { quickOpen } from './quickOpen';

import * as diplomat from './diplomatclient';
import {showInstanciate} from './diplomatclient';

import {GTKWaveViewer} from "./waveform_viewer";
//import * as globalvar from "./global";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed


var waveViewer : GTKWaveViewer;

export function activate(context: ExtensionContext) {
	
	const gtkwaveExecutable = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string>("path");
	const gtkwaveOptions = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string[]>("options");
	if (!gtkwaveExecutable) {
		throw new Error("`DiplomatServer.tools.GTKWave.path` is not set"); 
	}
	if (gtkwaveOptions === undefined) {
		throw new Error("`DiplomatServer.tools.GTKWave.options` is not set");
	}
	
	waveViewer = new GTKWaveViewer(context,gtkwaveExecutable, gtkwaveOptions, [".vcd",".fst",".gtkw"]);
	waveViewer.verboseLog = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<boolean>("verbose",true);
	context.subscriptions.push(waveViewer);
	
	commands.executeCommand('setContext', 'diplomat-host.supportedWavesFiles', waveViewer.supportedExtensions);
	commands.executeCommand('setContext', 'diplomat-host.supportedDesignFiles', workspace.getConfiguration("diplomatServer.index").get<string[]>("validExtensions"));

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(commands.registerCommand('diplomat-host.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		
		// Display a message box to the user
		window.showInformationMessage('Hello from diplomat-host!');
	}));

	console.log('Starting Diplomat LSP');
	//outputchan = window.createOutputChannel("[diplomat] Client");
	diplomat.activateLspClient(context);
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	
	console.log('Adding some commands...');
	context.subscriptions.push(commands.registerCommand("diplomat-host.open-waves", async (args : Uri) => {
		console.log("Opening waveform...");
		waveViewer.openWave(args.fsPath);
	}));
	context.subscriptions.push(commands.registerCommand('diplomat-host.instanciate', async () => {
		showInstanciate();
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.force-pull-config", async () => {
		diplomat.pullParameters(context);
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.force-push-config", async () => {
		diplomat.pushParameters(context);
	}));
	
	console.log('Congratulations, your extension "diplomat-host" is now active!');
}

/*
			{
				"command": "diplomat-server.get-module-bbox",
				"title": "Instanciate module"
			},
			*/


// this method is called when your extension is deactivated
export function deactivate() {
	console.log('Diplomat extension is being disabled. Bye !');
	
}


/*
		"grammars": [
			{
				"language": "systemverilog",
				"scopeName": "source.systemverilog",
				"path": "./syntaxes/systemverilog.tmLanguage"
			}],
			*/