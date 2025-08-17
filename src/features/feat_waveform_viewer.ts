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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import { commands, EventEmitter, Uri, window, workspace, Range, Selection, DecorationOptions } from "vscode";
import * as lsp from "vscode-languageclient";

import { BaseFeature, ExtensionEnvironment } from "./base_feature";
import { GTKWaveViewer } from "./waveform/gtkwave";
import { reveal_file } from "../utils";
import { FileSymbolsLookupResult, WaveformViewerCbArgs } from "../exchange_types";
import { DesignElement } from "../gui/designExplorerPanel";
import { BaseViewer } from "./waveform/base_viewer";
import { TextAnnotator } from "../text_annotator";


export class FeatureWaveformViewer extends BaseFeature {


	protected get _gtkwave_path() 
	{ return workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string>("path");}
	protected get _gtkwave_options() 
	{ return workspace.getConfiguration("diplomatServer.tools.GTKWave").get<string[]>("options");}
	protected get _gtkwave_verbose() 
	{ return workspace.getConfiguration("diplomatServer.tools.GTKWave").get<boolean>("verbose");}

	
	// ########################################################################
	// General data
	// ########################################################################

	/** Flag to know if the editor is expected to follow the waveforms upon selection. */
	protected _editor_follows_wave = false;
	/** Represents the current waveform viewer (if any). */
	protected _viewer ?: BaseViewer;

	/**
	 * Represents the selected location in the design explorer (and therefore the
	 * hierarchy element we might want to inspect).
	 */
	protected _curr_location : DesignElement | null = null;
	
	/** Contains all symbols for the current location. */
	protected _curr_location_symbols: string[] | null = null;

	/**
	 * This map binds a function name to an asynchronous callback.
	 * This allows the viewer to initiate function calls as required.
	 * 
	 * See the bound function for more information abour the arguments.
	 */
	protected _viewer_cb_bindings : { [key: string] : (args: Array<any>) => Promise<void>} = {
		"select" : this._h_viewer_select, 
	};

	/**
	 * Decoration used for value annotation from the waveform viewer
	 */
	protected _text_decoration_signal_value = window.createTextEditorDecorationType({});

	public constructor(ext_context : ExtensionEnvironment)
	{
		// Base setup of a feature
		super("waveform-manager",ext_context);

		commands.executeCommand('setContext', 'diplomat-host:followWaveSelection', false);
		commands.executeCommand("setContext", "diplomat-host:viewerEnabled", false);

		commands.executeCommand('setContext', 'diplomat-host:supportedWavesFiles', [".vcd", ".fst", ".gtkw", ".ghw"]);

		this.bind("diplomat-host.open-waves",this.open_wave);
		this.bind("diplomat-host.waves.reload", this.refresh_waves);
		this.bind("diplomat-host.waves.enable-follow",() => {this.set_follow_mode(true);});
		this.bind("diplomat-host.waves.disable-follow",() => {this.set_follow_mode(false);});
		this.bind("diplomat-host.waves.refresh-annotations", this.update_annotations);
		this.bind("diplomat-host.waves.clear-annotations", this.clear_annotations);
	}

	
	/**
	 * This command will request opening the file through the waveform viewer.
	 * @param file Waveform file to open
	 */
	public async open_wave(file : Uri) 
	{
		this.logger?.info(`Opening waveform file ${file.fsPath}`);
		this._select_viewer(file);
		this._viewer?.openWave(file.fsPath);
		this.set_follow_mode(this._editor_follows_wave);
	}

	/**
	 * This command requires the viewer to refresh the visible waves.
	 */
	public async refresh_waves()
	{
		if(this._viewer?.running)
			this._viewer.refreshWaves();
	}


	/**
	 * This function sets the status of the "follow wave" feature.
	 * @param enabled set the feature status
	 */
	public async set_follow_mode(enabled : boolean)
	{
		commands.executeCommand('setContext', 'diplomat-host:followWaveSelection', enabled);
		this._viewer?.setWaveFollow(enabled);
		this._editor_follows_wave = enabled;
	}

	/**
	 * This commands adds the symbol currently under the editor cursor to the waveform.
	 */
	public async add_symbol_to_signals()
	{
		let editor = window.activeTextEditor;
		if(editor && this._curr_location && this._curr_location_symbols && this._viewer)
		{
			let symbol_name = editor.document.getText(editor.document.getWordRangeAtPosition(editor.selection.start));
			let symbol_path = `${this._curr_location.hierPath}.${symbol_name}`;
			
			if (this._curr_location_symbols.includes(symbol_name)) {
				this.logger?.info(`Adding symbol ${symbol_path} to waveform`);
				this._viewer.addSignalToWave([symbol_path]);
			}
			else
			{
				this.logger?.warn(`Symbol ${symbol_path} not found in current waveform context.`);
			}
		}
	}

	/**
	 * This function will switch and select the 'right' viewer for the given
	 * file.
	 * @param file Waveform file to open
	 */
	protected _select_viewer(file : Uri) 
	{
		// As of today, only gtkwave supported.
		let selected_viewer = GTKWaveViewer;
		if(this._viewer)
		{
			if(! (this._viewer instanceof selected_viewer))
			{
				this.logger?.info("Switching to GTKWave viewer");

				this._viewer.close();
				this._viewer.dispose();
			}
		}

		if(selected_viewer === GTKWaveViewer)
			this._select_gtkwave();
		else
			throw new Error(`No Viewer selected for file ${file.fsPath}`);
	}

	/**
	 * This low level function will setup an instance of the gtkwave viewer handler
	 */
	protected _select_gtkwave() 
	{
		this._viewer = new GTKWaveViewer(
					this.context, 
					this._gtkwave_path, 
					this._gtkwave_options, 
					this.forward_viewer_command, 
					[".vcd", ".fst", ".gtkw", ".ghw"]
				);

		this._viewer.verboseLog = <boolean>(this._gtkwave_verbose);

	}


	// ########################################################################
	// Viewer callbacks handlers
	// ########################################################################

	/**
	 * This function is called to forward a call from the viewer to the client side.
	 * It is registered within the viewer manager itself.
	 * @param args Name of the command and list of (string) arguments
	 */
	public async forward_viewer_command(args : WaveformViewerCbArgs) 
	{
		this.logger?.info(`Forwarding command ${args.name} from the waveform viewer.`);

		if(this._viewer_cb_bindings.hasOwnProperty(args.name))
			await this._viewer_cb_bindings[args.name](args.args);
	}

	/**
	 * This function, given a list of signals, will retrieve from the LS the definition location of 
	 * each of those signals, open the associated file, and show the proper location.
	 * 
	 * @param args A list of hierarchical paths within the design that are supposed to be selected.
	 * @returns A promise, without value.
	 */
	protected async _h_viewer_select(args : Array<string>) : Promise<void>
	{
		// If the feature is disabled, just return without running anything.
		if (!this._editor_follows_wave)
			return;
		
		this.logger?.debug("Viewer requested selection bind");

		let opened : string[] =  [];
		const result = await commands.executeCommand<{ [key: string]: lsp.Location | null }>("diplomat-server.resolve-paths", ...args);
		for (let key in result) 
		{
			const value : lsp.Location | null = result[key];
			if (value !== null && ! opened.includes(value.uri)) 
			{
				opened.push(value.uri);
				this.logger?.trace(`Open file ${value.uri}`);
				reveal_file(Uri.parse(value.uri),value.range);
			}
		}
	}


	// ########################################################################
	// Annotations functions
	// ########################################################################

	/**
	 * This function update the value annotation in the current text editor
	 */
	public async update_annotations()
	{
		if(! this._curr_location || ! this._viewer?.running)
		{	
			this.clear_annotations();
			return;
		}
		
		await commands.executeCommand("vscode.open", this._curr_location.fileUri);
		let editor = window.activeTextEditor;

		if(! editor)
		{	
			this.clear_annotations();
			return;
		}

		let design_path = this._curr_location.hierPath;
		let scope_symbols = await commands.executeCommand<FileSymbolsLookupResult>("diplomat-server.list-symbols", design_path);
		this._curr_location_symbols = Object.keys(scope_symbols);

		let signal_values = await this._viewer.getSignals(this._curr_location_symbols.map((s) => { return `${design_path}.${s}` }));
		const annotations: DecorationOptions[] = [];

		for (let elt of signal_values) 
		{
			if (elt.val) 
			{
				let elt_name = elt.sig.split(".").slice(-1)[0];
				
				// console.log(`Pushing annotations for ${elt_name}`)
				for (let range of scope_symbols[elt_name]) 
				{
					annotations.push(TextAnnotator.inTextAnnotationAfter(
						`${elt.val}`,
						range as Range
					));
				}
			}
		}

		editor.setDecorations(this._text_decoration_signal_value, annotations);
	}

	public clear_annotations()
	{
		this._curr_location = null;
		window.activeTextEditor?.setDecorations(this._text_decoration_signal_value, []);
	}
   
}