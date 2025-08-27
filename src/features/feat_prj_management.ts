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

import * as vscode from 'vscode'; // Use VSCode to keep the separation when using "workspace"
import * as dconst from "../constants" ;
import { BaseFeature, ExtensionEnvironment } from "./base_feature";
import { DiplomatWorkspace } from "./ws_management/diplomat_workspace";
import { ProjectFileTreeProvider } from "./ws_management/project_files_view";
import { DiplomatConfigNew, HDLModule, ModuleBlackBox } from "../exchange_types";
import * as utils from "../utils";
import { WorkspaceState } from './ws_management/ws_state';
import { HDLProject } from './ws_management/project';
import { BaseProjectElement, ProjectElementKind_t } from './ws_management/base_prj_element';



export class WorkspaceManagement extends BaseFeature {

	protected _model : WorkspaceState;
	protected _view : ProjectFileTreeProvider;

	/** URI to the config file related to the project */
	protected _user_config_file_path ?: vscode.Uri;


	constructor(ext_env: ExtensionEnvironment) {
		super("workspace-manager", ext_env);

		
		this._model = new WorkspaceState(ext_env);
		this._view = new ProjectFileTreeProvider();

		this._bind_events();
		this._bind_commands();
		this._build_gui();

	}


	protected _bind_events()
	{
		// Here perform the event bindings
		this._model.on_prj_registered(this._load_projects_handler);
	}

	protected _bind_commands()
	{
		this.bind("diplomat-host.prj.create-project", this.add_new_project);
		this.bind("diplomat-host.prj.create-project-from-top", this.create_prj_from_top_file);
		this.bind("diplomat-host.prj.remove-file", this._remove_element_from_prj);
		
		this.bind("diplomat-host.show-config", this.open_config_file);
	}

	protected _build_gui()
	{
		vscode.window.createTreeView("diplomat-prj", { treeDataProvider: this._view, dragAndDropController: this._view });
		this._view.refresh();
	}

	public start()
	{
		this._model.load();
	}

	// #############################################################################
	// Events handlers
	// #############################################################################
	

	protected _load_projects_handler(prjs: HDLProject[])
	{
		for (let prj of prjs)
		{
			this._view.processProject(prj);
		}
		this._view.refresh();
	}

	protected _remove_element_from_prj(target?: BaseProjectElement)
	{
		if(target)
		{
			this._view.removePrjElement(target);
			let prj = target.root.logicalName;
		
			let flist = [];

			for (let elt of target.leaves)
			{
				if (elt.resourceUri)
				{
					flist.push(elt.resourceUri);
				}
			}

			this._model.remove_files(prj, flist);

		}	
		
	}

	// #############################################################################
	// Project management functions
	// #############################################################################
	

	/**
	 * This function create an empty project and adds it to the current workspace.
	 * @param name Name of the new project. If left empty, the user will be prompted.
	 * @param suggestName Provide a suggestd name and force prompt
	 * @returns A promise resolving to the built project
	 */
	public async add_new_project(name ?: string, suggestName : boolean = false) : Promise<HDLProject>
	{
		
		// Builds the project name is required
		if(suggestName || typeof name != "string")
					name = await vscode.window.showInputBox({
				prompt : "Enter the new project name",
				title : "Project name",
				value : typeof name == "string" ? name.trim() : undefined
			});
		
		if(! name)
			return Promise.reject("No name provided");

		name = name.trim();
		if(name.length == 0)
		{
			vscode.window.showErrorMessage("Can not create project with an empty name.");
			return Promise.reject("Empty name");
		}

		// Actually generate the project
		let new_prj = new HDLProject(name);
		this._model.register_projects(new_prj);
		
		return Promise.resolve(new_prj);		
	}

	public async create_prj_from_top_file(target?: vscode.Uri): Promise<HDLProject>
	{
		if(! target)
		{
			let valid_extensions = vscode.workspace.getConfiguration("diplomatServer.index").get<string[]>("validExtensions");
			if(! valid_extensions)
				valid_extensions = [".sv", ".v"]
			let selection = await vscode.window.showOpenDialog({
				canSelectFiles : true, 
				canSelectFolders : false, 
				canSelectMany : false,
				filters: {
					"Supported extensions" :  valid_extensions,
					"SystemVerilog" : ["sv","svi","v"],
					"Verilog" : ["v"]
				},
				title : "Select the root file of your project",
				openLabel :"Select as top"
			})

			if(! selection)
				return Promise.reject();
			else
				target = selection[0];
		}
		let bblist = await vscode.commands.executeCommand<ModuleBlackBox[]>("diplomat-server.get-file-bbox", target.toString());
		
		if (bblist.length == 0)
			return Promise.reject();

		let bb = bblist[0];

		this.logger?.info(`Building project from file ${bb.module}`);

		let prj = new HDLProject(bb.module); // await diplomatWorkspace.addProject(bb.module,true);
		let hdl_module: HDLModule = { file: target.toString(), moduleName: bb.module }
		let uri_list_raw = await vscode.commands.executeCommand<string[]>("diplomat-server.prj.tree-from-module",hdl_module);
		let uri_list = uri_list_raw.map((elt) => vscode.Uri.parse(elt));
		
		
		for (let elt of uri_list) {
			console.log(`    Adds file ${elt} to the project`);
			this.logger?.info(`    Adds file ${elt} to the project`);
			prj.addFileToProject(utils.get_prj_filepath_from_uri(elt));
		}

		this._model.register_projects(prj);
	
		this.logger?.info(`Project '${prj.name}' successfuly built.`);
		return Promise.resolve(prj);
	}



	// #############################################################################
	// Miscellaneous
	// #############################################################################

	/**
	 * Request VS Code to open the current configuration file in the editor.
	 */
	public open_config_file()
	{
		let config_path = this._model?.fpath;
		if (config_path) {
			vscode.workspace.fs.stat(config_path).then((_: vscode.FileStat) => {
				return vscode.commands.executeCommand("vscode.open", config_path);
			}, () => { });
		}

	}
	

}