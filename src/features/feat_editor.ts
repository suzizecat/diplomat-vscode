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
import { HDLModule, ModuleBlackBox } from "../exchange_types";
import { DiplomatSrvCmds } from "../language_server_cmds";
import { generate_bb_instance_as_string, SVFileEditorDropEditProvider } from "./editor/module_instanciation";

/**
 * This class provides all features related to the editor itself.
 */
export class FeatureEditor extends BaseFeature {

    public constructor(ext_context : ExtensionEnvironment)
    {
        super("editor",ext_context);

		this.bind("diplomat-host.instanciate",this.instanciate_module,this);

		vscode.languages.registerDocumentDropEditProvider(
			{scheme: 'file', language: 'systemverilog'},
			new SVFileEditorDropEditProvider()
		);
    }


	/**
	 * This function is an helper to request a module (any module) from the workspace
	 * @returns The selected module if any
	 */
	public async select_ws_module() : Promise<HDLModule>
	{
		let avail_modules = await DiplomatSrvCmds.get_modules();

		let to_pick_item : vscode.QuickPickItem[] = [];
		for(let mod of avail_modules)
		{
			if(! mod.moduleName)
				continue;
			to_pick_item.push({label:mod.moduleName, description:vscode.Uri.parse(mod.file).fsPath});
		}
		
		let selected = await vscode.window.showQuickPick(to_pick_item,{title : 'Select module to instanciate',canPickMany : false});
		if(! selected?.description || ! selected?.label)
			return Promise.reject("No selection has been made");
		else
			return Promise.resolve({file:selected.description, moduleName : selected.label});
	}

	/**
	 * This function will instanciate a given module in the currently opened editor
	 * @param module module to instanciate if any
	 */
	public async instanciate_module(module ?: HDLModule)
	{
		if(! vscode.window.activeTextEditor)
			return Promise.reject("Require an active text editor");

		if(!module)
			module = await this.select_ws_module();

		if(! module?.file || ! module?.moduleName)
			return Promise.reject("Invalid module retrieved");

		let bb = (await DiplomatSrvCmds.get_module_bbox(module)).at(0);
 		if(!bb)
			return Promise.reject("BB Lookup failed");

		this.logger?.info(`Got black-box for module ${bb.module}`);

		let to_insert = generate_bb_instance_as_string(bb);

		let pos = vscode.window.activeTextEditor.selection.start;
		vscode.window.activeTextEditor.edit((builder) => builder.insert(pos,to_insert));
	}

}