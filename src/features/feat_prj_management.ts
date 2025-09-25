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
import { ProjectFileTreeProvider } from "./ws_management/project_files_view";
import {DiplomatProject, HDLModule, ModuleBlackBox } from "../exchange_types";
import * as utils from "../utils";
import { WorkspaceState } from './ws_management/ws_state';
import { HDLProject } from './ws_management/project';
import { BaseProjectElement, ProjectFile, ProjectFolder } from './ws_management/base_prj_element';
import { DiplomatSrvCmds } from '../language_server_cmds';



export class FeatureProjectManagement extends BaseFeature {

	protected _model : WorkspaceState;
	protected _view : ProjectFileTreeProvider;

	/** URI to the config file related to the project */
	protected _user_config_file_path ?: vscode.Uri;

	

	public get on_config_loaded() {return this._model.on_config_loaded};

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
		this._model.on_prj_registered(this._load_projects_handler, this);
		this._model.on_prj_updated((prj) => this.send_projects_to_lsp(prj.map(p => p.name)),this);
		this._model.on_prj_activated((prj) => this.send_projects_to_lsp([prj.name]),this);
		this._model.on_config_loaded((_) => this.send_active_projects_to_lsp(),this);
	}

	protected _bind_commands()
	{
		this.bind("diplomat-host.prj.create-project", this.add_new_project, this);
		this.bind("diplomat-host.prj.create-project-from-top", this.create_prj_from_top_file, this);
		this.bind("diplomat-host.prj.remove-file", this._remove_element_from_prj, this);
		this.bind("diplomat-host.prj.set-project", this.set_active_project, this);
		this.bind("diplomat-host.set-top", this.set_top_from_file, this);
		
		this.bind("diplomat-host.save-config", this.save_config, this);
		this.bind("diplomat-host.show-config", this.open_config_file, this);

		this.bind("diplomat-host.prj.refresh-prj",this.reprocess_project,this);

		this.bind("diplomat-host.prj.ignore", this._h_ignore_path,this);
	}

	protected _build_gui()
	{
		vscode.window.createTreeView(dconst.VIEWS_ID_PRJ, { treeDataProvider: this._view, dragAndDropController: this._view });
		// this._view.refresh();
	}

	public async start()
	{
		await this._model.load();
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
			this._view.removePrjElement(target);
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

	/**
	 * This function will request the language server to attempts to build the full project
	 * through black-boxes dependencies.
	 * 
	 * Once done, the HDL project object is created and integrated in the workspace.
	 * 
	 * @param target Top file to use
	 * @returns the created project
	 */
	public async create_prj_from_top_file(target?: vscode.Uri): Promise<HDLProject>
	{
		if(! target)
		{
			let valid_extensions = vscode.workspace.getConfiguration("diplomat.index").get<string[]>("validExtensions");
			if(! valid_extensions)
				valid_extensions = ["sv", "v"]
			valid_extensions = valid_extensions.map((elt) => {return elt.charAt(0) == "." ? elt.slice(1): elt;} );
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
		let bblist = await DiplomatSrvCmds.get_file_bbox(target);
		let bb = bblist.at(0);
		if (! bb)
			return Promise.reject();

		this.logger?.info(`Building project from file ${bb.module}`);

		let prj = new HDLProject(bb.module); // await diplomatWorkspace.addProject(bb.module,true);
		let hdl_module: HDLModule = { file: target.toString(), moduleName: bb.module }
		let uri_list = await DiplomatSrvCmds.get_project_tree_from_module(hdl_module);
		
		for (let elt of uri_list) {
			console.log(`    Adds file ${elt} to the project`);
			this.logger?.info(`    Adds file ${elt} to the project`);
			prj.addFileToProject(utils.get_prj_filepath_from_uri(elt));
		}

		prj.active = true;
		prj.topLevel = {file : utils.get_prj_filepath_from_uri(target), moduleName : bb.module};
		this._model.register_projects(prj);
	
		this.logger?.info(`Project '${prj.name}' successfuly built.`);
		this.save_config();
		return Promise.resolve(prj);
	}


	/**
	 * Sets the provided project as an active project
	 * @param prj Project to activate
	 */
	public set_active_project(prj : HDLProject | string | BaseProjectElement | null | undefined) 
	{
		if(prj instanceof HDLProject)
		{
			this.set_active_project(prj.name);
		}
		else if(prj instanceof BaseProjectElement)
		{
			this.set_active_project(this._view.getProjectFromElement(prj)?.logicalName); 
		}
		else if(prj)
		{
			// Prj is a string
			this._view.setActiveProject(prj);
			this._model.set_active_project(prj);

		}
		else
		{
			// If nothing specified, remove active project...
			// May be useful at some point
			this._view.setActiveProject();
			this._model.set_active_project();
		}
	}


	// #############################################################################
	// LSP Communication
	// #############################################################################
	
	public send_active_projects_to_lsp()
	{
		let to_send : string[] = this._model.config.projects
		                             .filter((prj) => prj.active)
									 .map((prj) => prj.name);
		if(to_send.length > 0)
			this.set_active_project(to_send.at(-1))					 
		// this.send_projects_to_lsp(to_send);
	}

	public async reprocess_project(project : ProjectFolder)
	{
		await this.send_projects_to_lsp([project.name])
	}

	public async send_projects_to_lsp(projects ?: string[]  )
	{
		let to_send : DiplomatProject[] = [];
		if(! projects)
			to_send = structuredClone(this._model.config.projects);
		else
 			to_send = structuredClone(this._model.resolve_project_names(projects));


		for(let prj of to_send)
		{

			prj.sourceList = prj.sourceList.map(
				(path) => {
					try {
						return vscode.Uri.parse(path,true).toString();
					} catch (error) {
						return utils.get_uri_from_path(path).toString();
					}
				}
				);
			if(! prj.topLevel)
				prj.topLevel = undefined;
		}

		// As of today, only send ONE active project (for the server to handle).
		// If/when upgrading, just send active (or even the whole to_send, to disable other projects).
		let active : DiplomatProject[] = to_send.filter(prj => prj.active);

		if(active.length > 0)
		{
			if(active.length > 1)
				this.logger?.warn(`Sending multiple active projet is not yet supported. Sent project will be ${active[0].name}.`)
			await DiplomatSrvCmds.set_project(active[0]);
		}
	}

	/**
	 * Set the top level module from a file.
	 * If no file is passed as an argument, request a file from the user.
	 * If the file contains several modules, request a selection from the user.
	 * 
	 * @param file File to handle
	 * @returns The name of the new top module
	 */
	public async set_top_from_file(file : vscode.Uri | ProjectFile)
	{
		let tgt_uri : vscode.Uri;

		if(file instanceof ProjectFile)
			tgt_uri = file.resourceUri;
		else
			tgt_uri = file;

		let bbs = await DiplomatSrvCmds.get_file_bbox(tgt_uri); 
		let newTop : string | undefined;
		if(bbs.length == 0)
		{
			vscode.window.showWarningMessage(`No module found in ${tgt_uri.fsPath}`);
			return Promise.reject()
		}
		else if(bbs.length > 1)
		{
			newTop = await vscode.window.showQuickPick(bbs.map((elt) => {return elt.module}));
		}
		else
		{
			newTop = bbs.at(0)?.module;
		}
		
		if(newTop)
		{
			if(this._model.active_project)
			{
				this._model.active_project.topLevel = { file: utils.get_prj_filepath_from_uri(tgt_uri), moduleName : newTop};
				this._view.set_file_as_top(tgt_uri,this._model.active_project?.name);
			}
			await DiplomatSrvCmds.set_top(newTop);
			vscode.window.showInformationMessage(`New top is ${newTop}`);
		}
		else
		{
			vscode.window.showInformationMessage("No top-module selected (nothing has been done).");
		}

		return Promise.resolve(newTop);
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

	public async save_config()
	{
		this.logger?.info("Configuration save requested.")
		await this._model.save();
	}
	
	/**
	 * Handler for the ignore command (to ignore paths for the LSP)
	 * @param _ Main selection, not used here
	 * @param paths The full list of selected paths
	 */
	public async _h_ignore_path(_ : any, paths: vscode.Uri[])
	{

		this._model.ignore_paths(paths)
	}

}