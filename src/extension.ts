// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, commands, ExtensionContext, workspace, Uri, Range, Selection, DecorationOptions } from 'vscode';
import { showQuickPick, showInputBox } from './basicInput';
import { multiStepInput } from './multiStepInput';
import { quickOpen } from './quickOpen';

import * as diplomat from './diplomatclient';
import {showInstanciate} from './diplomatclient';

import {GTKWaveViewer} from "./waveform_viewer";
import { FileSymbolsLookupResult, SignalData, WaveformViewerCbArgs } from './exchange_types';
import { Location } from 'vscode-languageclient';

import { DesignElement, DesignHierarchyTreeProvider } from "./designExplorerPanel";

import { TextAnnotator } from './text_annotator';

import { DiplomatTestController } from './tests_controller';
//import * as globalvar from "./global";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed


var waveViewer: GTKWaveViewer;
var currHierLocation: DesignElement | null = null;

export function activate(context: ExtensionContext) {
	
	const gtkwaveExecutable = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string>("path");
	const gtkwaveOptions = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string[]>("options");
	
	const testController = new DiplomatTestController(context)

	context.subscriptions.push(testController);

	const annotationDecorationType = window.createTextEditorDecorationType({})

	if (!gtkwaveExecutable) {
		throw new Error("`DiplomatServer.tools.GTKWave.path` is not set"); 
	}
	if (gtkwaveOptions === undefined) {
		throw new Error("`DiplomatServer.tools.GTKWave.options` is not set");
	}
	

	const forwardViewerCommands = async (args: WaveformViewerCbArgs) => {
		let fcts : {
			[key:string] : ( args : Array<any>) => Promise<void>;
		} = {
			"select" : async (args : Array<string>) => {
				const result = await commands.executeCommand<{[key : string] : Location | null}>("diplomat-server.resolve-paths",...args);
				for (let key in result)
				{
					const value = result[key];
					if(value !== null)
					{
						console.log(`Open file ${value.uri}`);
						workspace.openTextDocument(Uri.parse(value.uri))
						.then(doc =>  {window.showTextDocument(doc)
							.then(editor => {
							
							let position : Range = new Range(
								value.range.start.line,
								value.range.start.character,
								value.range.end.line,
								value.range.end.character);
							editor.revealRange(position);
							editor.selection = new Selection(value.range.start.line,
								value.range.start.character,
								value.range.end.line,
								value.range.end.character);
						})})
						;
					}
				}
			}
		}
		console.log(`Request ${args.name} command with args ${args.args}`);

		if(fcts.hasOwnProperty(args.name))
		{
			await fcts[args.name](args.args);
		}
		//await commands.executeCommand(`diplomat-server.${args.name}`, args.args);
	}

	const updateAnnotation = async () => {
		if (currHierLocation) {
			await commands.executeCommand("vscode.open", currHierLocation.fileUri)
			if(waveViewer.running)
			{
				let designPath = currHierLocation.hierPath;
				var fileLookup: FileSymbolsLookupResult;
				commands.executeCommand<FileSymbolsLookupResult>("displomat-server.list-symbols", designPath)
					.then((signals) => {
						fileLookup = signals;
						return waveViewer.getSignals(Object.keys(signals).map((s) => { return `${designPath}.${s}` }));
					})
					.then((sigDataArray) => {
						let editor = window.activeTextEditor;
						if (editor) {
							var text = editor.document.getText();
							const annotations: DecorationOptions[] = [];
							
							for (let elt of sigDataArray) {
								if (elt.val) {
									let elt_name = elt.sig.split(".").slice(-1)[0];
									
									console.log(`Pushing annotations for ${elt_name}`)
									for (let range  of fileLookup[elt_name])
									{
										annotations.push(TextAnnotator.inTextAnnotationAfter(
											`${elt.val}`,
											range as Range
										));
									}
								}
							}

							editor.setDecorations(annotationDecorationType, annotations);
						}
					});
			}
			else
			{
				await commands.executeCommand("diplomat-host.waves.clear-annotations");
			}
		}
		else
		{
			await commands.executeCommand("diplomat-host.waves.clear-annotations");
		}
	}

	waveViewer = new GTKWaveViewer(context,gtkwaveExecutable, gtkwaveOptions, forwardViewerCommands, [".vcd",".fst",".gtkw",".ghw"]);
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


	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	
	let dataprovider = new DesignHierarchyTreeProvider();

	window.createTreeView("design-hierarchy",{treeDataProvider: dataprovider});

	console.log('Adding some commands...');
	context.subscriptions.push(commands.registerCommand("diplomat-host.open-waves", async (args : Uri) => {
		console.log("Opening waveform...");
		waveViewer.openWave(args.fsPath);
	}));
	context.subscriptions.push(commands.registerCommand('diplomat-host.instanciate',showInstanciate));

	context.subscriptions.push(commands.registerCommand("diplomat-host.force-pull-config", async () => {
		diplomat.pullParameters(context);
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.force-push-config", async () => {
		diplomat.pushParameters(context);
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.show-config", async () => {
		diplomat.openParameterFile(context);
	}));
	
	context.subscriptions.push(commands.registerCommand("diplomat-host.select-hierarchy", async (eltPath: string) => {
		console.log("Select hierarchy");
		currHierLocation = dataprovider.findElement(eltPath);
		await updateAnnotation();
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.refresh-annotations", async () => {
		await updateAnnotation();
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.clear-annotations", () => {window.activeTextEditor?.setDecorations(annotationDecorationType, []);}))
	
	context.subscriptions.push(commands.registerCommand("diplomat-host.refresh-hierarchy", async () => {
		dataprovider.refresh();
	}));

	console.log('Starting Diplomat LSP');
	//outputchan = window.createOutputChannel("[diplomat] Client");
	diplomat.activateLspClient(context)
		.then(() => { return diplomat.pushParameters(context) })
		.then(() => { return dataprovider.refresh()});
	
	// Elements may use this variable to toggle visibility on extension availability.
	void commands.executeCommand('setContext', 'diplomat-host:enabled', true)
	console.log('Diplomat activation completed');
}


// this method is called when your extension is deactivated
export function deactivate() {
	console.log('Diplomat extension is being disabled. Bye !');
	
}
