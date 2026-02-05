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

import * as vscode from "vscode";
import { BaseFeature, ExtensionEnvironment } from "./base_feature";
import { DiplomatSrvCmds } from "../language_server_cmds";
import { get_prj_filepath_from_uri } from "../utils";

/**
 * This class provides debug tools
 */
export class FeatureDebug extends BaseFeature {

	protected debug_decorator_listener ?: vscode.Disposable = undefined

	protected _text_decoration_valid_ref = vscode.window.createTextEditorDecorationType({
		backgroundColor : new vscode.ThemeColor("diplomathost.annotation.debug.ref.bg"),
		borderRadius : "0.25em"
	});

	protected _text_decoration_valid_refext = vscode.window.createTextEditorDecorationType({
		backgroundColor : new vscode.ThemeColor("diplomathost.annotation.debug.refext.bg"),
		borderRadius : "0.25em"
	});


	protected _text_decoration_valid_def = vscode.window.createTextEditorDecorationType({
		backgroundColor : new vscode.ThemeColor("diplomathost.annotation.debug.def.bg"),
		borderRadius : "0.25em"
	});

    public constructor(ext_context : ExtensionEnvironment)
    {
		super("debug", ext_context);
		
		this.bind("diplomat-host.debug.expose-file-data", this.enable_show_file_elements, this);
		this.bind("diplomat-host.debug.clear-file-data", this.disable_show_file_elements, this);
    }

	public async enable_show_file_elements()
	{
		if(this.debug_decorator_listener)
			this.debug_decorator_listener.dispose()
		this.debug_decorator_listener = vscode.window.onDidChangeActiveTextEditor(async (e) => {if(e) await this.show_current_file_elements();}, this);
		this.show_current_file_elements();
	}

	public async disable_show_file_elements()
	{
		if(this.debug_decorator_listener)
			this.debug_decorator_listener.dispose()
		this.debug_decorator_listener = undefined;
		this.clear_debug_decorations();
	}

	/**
	 * Reveal through decoration various LSP elements
	 */
	public async show_current_file_elements()
	{
		let editor = vscode.window.activeTextEditor
		let curr_f = editor?.document.uri;
		if(! editor || ! curr_f)
			return ;

		let file_data = await DiplomatSrvCmds.get_file_abstract_content(curr_f);

		let deco_ref : vscode.DecorationOptions[] = [];
		let deco_ref_ext : vscode.DecorationOptions[] = [];
		let deco_def : vscode.DecorationOptions[] = [];

		for (let symb of file_data.symbols)
		{
			deco_def.push({
				range : symb.defRange.range as vscode.Range,
				hoverMessage :  new vscode.MarkdownString(
					`**Symbol definition location for ${symb.name}**  \n`+
					`SymbolKind : ${symb.kind}`
				)
			});

			for (let ref of symb.refs) 
			{
				if(ref.uri != curr_f.toString())
					continue;

				let ruri = vscode.Uri.parse(symb.defRange.uri);
 				let defpos = `${symb.defRange.range.start.line}:${symb.defRange.range.start.character}`;
				deco_ref.push({
					range : ref.range as vscode.Range,
					hoverMessage :  new vscode.MarkdownString(
						`**Symbol reference to ${symb.name}**  \n`+
						`SymbolKind : ${symb.kind}  \n`+
						`[${get_prj_filepath_from_uri(ruri)}](${symb.defRange.uri}:${defpos})  \n`
					)
				});
			}
		}

		for (let symb of file_data.externalRefs)
		{
			for (let ref of symb.refs) 
			{
				if(ref.uri != curr_f.toString())
					continue;

				let ruri = vscode.Uri.parse(symb.defRange.uri);
 				let defpos = `${symb.defRange.range.start.line}:${symb.defRange.range.start.character}`;
				deco_ref_ext.push({
					range : ref.range as vscode.Range,
					hoverMessage :  new vscode.MarkdownString(
						`**External symbol reference of ${symb.name}**  \n`+
						`SymbolKind : ${symb.kind}  \n` +
						`[${get_prj_filepath_from_uri(ruri)}](${symb.defRange.uri}:${defpos})  \n`						
					)
				});
			}
		}

		editor.setDecorations(this._text_decoration_valid_def, deco_def);
		editor.setDecorations(this._text_decoration_valid_ref, deco_ref);
		editor.setDecorations(this._text_decoration_valid_refext, deco_ref_ext);

		this._ext.logger?.info("File elements display done.");
	}

	public async clear_debug_decorations()
	{
		this._ext.logger?.info("Requested clear of debug decorations");
		vscode.window.activeTextEditor?.setDecorations(this._text_decoration_valid_ref, []);
		vscode.window.activeTextEditor?.setDecorations(this._text_decoration_valid_def, []);
		vscode.window.activeTextEditor?.setDecorations(this._text_decoration_valid_refext, []);
	}
}
