// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, commands, ExtensionContext } from 'vscode';
import { showQuickPick, showInputBox } from './basicInput';
import { multiStepInput } from './multiStepInput';
import { quickOpen } from './quickOpen';

import * as diplomat from './diplomatclient';
import {showInstanciate} from './diplomatclient';
//import * as globalvar from "./global";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: ExtensionContext) {
	//outputchan = window.createOutputChannel("[diplomat] Client");
	diplomat.activateLspClient(context);
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "diplomat-host" is now active!');
	
	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(commands.registerCommand('diplomat-host.helloWorld', () => {
		// The code you place here will be executed every time your command is executed

		// Display a message box to the user
		window.showInformationMessage('Hello from diplomat-host!');
	}));

	context.subscriptions.push(commands.registerCommand('diplomat-host.instanciate', async () => {
		showInstanciate();
	}));
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