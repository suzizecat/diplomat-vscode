// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { window, commands, ExtensionContext, workspace, Uri, Range, Selection, DecorationOptions, LogOutputChannel } from 'vscode';
import { showQuickPick, showInputBox } from './basicInput';
import { multiStepInput } from './multiStepInput';
import { quickOpen } from './quickOpen';

import * as diplomat from './diplomatclient';
import {showInstanciate} from './diplomatclient';

import {GTKWaveViewer} from "./support_waveform_viewers/gtkwave";
import { DiplomatProject, FileSymbolsLookupResult, SignalData, WaveformViewerCbArgs } from './exchange_types';
import { Location } from 'vscode-languageclient';

import { DesignElement, DesignHierarchyTreeProvider } from "./gui/designExplorerPanel";

import { TextAnnotator } from './text_annotator';

import { DiplomatTestController } from './tests_controller';
import { ProjectFileTreeProvider } from './gui/project_files_view';
//import * as globalvar from "./global";
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed


var waveViewer: GTKWaveViewer;
var currHierLocation: DesignElement | null = null;
var currLocationSymbols: string[] | null = null;
var editorFollowsWaveform : boolean = true;

var logger : LogOutputChannel;


export function activate(context: ExtensionContext) {
	
	// ########################################################################
	// Logger setup
	// ########################################################################
	logger = window.createOutputChannel("[diplomat] Host", { log: true });
	context.subscriptions.push(commands.registerCommand('diplomat-host.private.get-logger',() => {return logger;}));

	// ########################################################################
	// Context setup
	// ########################################################################
	commands.executeCommand('setContext', 'diplomat-host:followWaveSelection', true)
	commands.executeCommand('setContext', 'diplomat-host:supportedDesignFiles', workspace.getConfiguration("diplomatServer.index").get<string[]>("validExtensions"));
	commands.executeCommand("setContext", "diplomat-host:viewerEnabled", false);

	
	const gtkwaveExecutable = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string>("path");
	const gtkwaveOptions = workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string[]>("options");

	/**
	 * Decoration used for value annotation from the waveform viewer
	 */
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
				// If the feature is disabled, just return without running anything.
				logger.debug("Viewer requested selection bind");
				if(! editorFollowsWaveform)
					return;
				const result = await commands.executeCommand<{[key : string] : Location | null}>("diplomat-server.resolve-paths",...args);
				for (let key in result)
				{
					const value = result[key];
					if(value !== null)
					{
						logger.trace(`Open file ${value.uri}`);
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
				commands.executeCommand<FileSymbolsLookupResult>("diplomat-server.list-symbols", designPath)
					.then((signals) => {
						fileLookup = signals;
						currLocationSymbols = Object.keys(signals);
						return waveViewer.getSignals(currLocationSymbols.map((s) => { return `${designPath}.${s}` }));
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
	
	commands.executeCommand('setContext', 'diplomat-host:supportedWavesFiles', waveViewer.supportedExtensions);
	
	const testController = new DiplomatTestController(context,waveViewer.refreshWaves);
	context.subscriptions.push(testController);

	
	let designHierarchyDataProvider = new DesignHierarchyTreeProvider();
	window.createTreeView("design-hierarchy",{treeDataProvider: designHierarchyDataProvider});

	let projectDataProvider = new ProjectFileTreeProvider();
	window.createTreeView("diplomat-prj", {treeDataProvider: projectDataProvider,dragAndDropController:projectDataProvider});

	let demoPrj : DiplomatProject = {name : "Demo project",
		topLevel: "demo_top",
		sourceList : ["toto/demo_top.sv","tata/tutu/demo_sub.sv","rtl/top/core_top.sv"],
		active : true
	}

	projectDataProvider.processProject(demoPrj);
	projectDataProvider.refresh();


	console.log('Adding some commands...');
	context.subscriptions.push(commands.registerCommand("diplomat-host.open-waves", async (args : Uri) => {
		console.log("Opening waveform...");
		waveViewer.openWave(args.fsPath);
	}));

	/**
	 * This commands adds the symbol currently under the editor cursor to the waveform.
	 */
	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.add-signal", async () => {
		let editor = window.activeTextEditor;
		if (currHierLocation && editor && currLocationSymbols) {
			
			let symbolName = editor.document.getText(editor.document.getWordRangeAtPosition(editor.selection.start));
			let symbolPath = `${currHierLocation.hierPath}.${symbolName}`;
			
			if (currLocationSymbols.includes(symbolName)) {
				logger.info(`Adding symbol ${symbolPath} to waveform`);
				console.log(`Adding symbol ${symbolPath} to waveform`);
				waveViewer.addSignalToWave([symbolPath]);
			}
			else
			{
				logger.warn(`Symbol ${symbolPath} not found in current waveform context.`);
				console.log(`Symbol ${symbolPath} not found in current waveform context.`);
			}
		}
	}));


	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.reload", async () => {
		logger.info("Requested waveform reload from diplomat-host.");
		if (waveViewer.running)
		{
			waveViewer.refreshWaves();
		}
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

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.enable-follow", async () => {
		void commands.executeCommand('setContext', 'diplomat-host:followWaveSelection', true);
		waveViewer.setWaveFollow(true);
		editorFollowsWaveform = true;
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.disable-follow", async () => {
		void commands.executeCommand('setContext', 'diplomat-host:followWaveSelection', false);
		waveViewer.setWaveFollow(false);
		
	}));
	
	
	context.subscriptions.push(commands.registerCommand("diplomat-host.select-hierarchy", async (eltPath: string) => {
		console.log("Select hierarchy");
		currHierLocation = designHierarchyDataProvider.findElement(eltPath);
		await updateAnnotation();
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.refresh-annotations", async () => {
		await updateAnnotation();
	}));

	context.subscriptions.push(commands.registerCommand("diplomat-host.waves.clear-annotations", () => {
		currLocationSymbols = null;
		window.activeTextEditor?.setDecorations(annotationDecorationType, []);
	}))
	
	context.subscriptions.push(commands.registerCommand("diplomat-host.refresh-hierarchy", async () => {
		designHierarchyDataProvider.refresh();
	}));

	console.log('Starting Diplomat LSP');
	//outputchan = window.createOutputChannel("[diplomat] Client");
	diplomat.activateLspClient(context)
		.then(() => {
			setTimeout(() => {
				diplomat.pushParameters(context).then(() => designHierarchyDataProvider.refresh())
				// Elements may use this variable to toggle visibility on extension availability.
				void commands.executeCommand('setContext', 'diplomat-host:enabled', true);
				console.log('Diplomat activation completed');
			},500)
			});
	
}


// this method is called when your extension is deactivated
export function deactivate() {
	console.log('Diplomat extension is being disabled. Bye !');
	commands.executeCommand('setContext', 'diplomat-host:enabled', false);

}
