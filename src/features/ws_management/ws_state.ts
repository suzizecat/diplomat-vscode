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

import { EventEmitter, Uri, workspace , Event} from "vscode";
import * as dconst from "../../constants" ;
import { DiplomatConfigNew, DiplomatProject } from "../../exchange_types";
import { ExtensionEnvironment } from "../base_feature";
import * as utils from "../../utils";
import { HDLProject } from "./project";
import { DiplomatSrvCmds } from "../../language_server_cmds";


/**
 * Lightweight container to keep stuff somewhat tidy in {@link WorkspaceState}
 */
class _WSStateEvents {
	public config_loaded = new EventEmitter<DiplomatConfigNew>();
	public prj_registered = new EventEmitter<HDLProject[]>();
	public prj_removed = new EventEmitter<HDLProject[]>();
	public prj_updated = new EventEmitter<HDLProject[]>();
	public prj_activated = new EventEmitter<HDLProject>();
}


export class WorkspaceState {

	// #############################################################################
	// Variables declaration
	// #############################################################################

    protected _config : DiplomatConfigNew;
	public get config() {return this._config;}

	protected _registered_projects : Map<string, HDLProject> = new Map();

	protected _active_project ?: HDLProject;
	public get active_project() {return this._active_project;}
		
	// Events
	// ----------------------------------------------------------------------------
	protected _evt  = new _WSStateEvents();
	
	readonly on_config_loaded =  this._evt.config_loaded.event;
	readonly on_prj_registered =  this._evt.prj_registered.event;
	readonly on_prj_removed =  this._evt.prj_removed.event;
	readonly on_prj_updated =  this._evt.prj_updated.event;
	readonly on_prj_activated =  this._evt.prj_activated.event;

	
    protected _config_file_path ?: Uri;
    public get fpath() {return this._config_file_path;}
	

    constructor(protected _env : ExtensionEnvironment)
    {
        this._config = {
                    workspaceDirs : [],
                    excludedPaths : [],
                    excludedPatterns : [],
                    excludedRegex : [],
                    projects : [],
                    excludedDiags : []
                }

        this._setup_config_file();
    }

	protected async _setup_storage_space()
	{
		if(this._env.context.storageUri === undefined)
		{
			this._env.logger?.error("A workspace shall have been opened");
			throw new Error("Trying to work with workspace features without an active workspace.");
		}

		if( ! await utils.does_path_exist(this._env.context.storageUri))
		{
			await workspace.fs.createDirectory(this._env.context.storageUri);
		}
	}

	/**
	 * This function ensure that the config file is in a sane state.
	 * It means that the file exists and is initialized.
	 */
    protected async _setup_config_file()
	{

		await this._setup_storage_space();

		if(!this._env.context.storageUri)
			throw new Error("Trying to work with workspace features without an active workspace.");

		let param_filepath = workspace.getConfiguration("diplomatServer.projects").get<string>("projectFilePath");
		
		if(param_filepath && param_filepath.length > 0)
		{
			this._config_file_path = utils.get_uri_from_path(param_filepath);
		}

		if(! this._config_file_path)
		{
			this._env.logger?.info("Setting up default config file path");
			this._config_file_path = Uri.joinPath(this._env.context.storageUri,dconst.DEFAULT_WS_CONF_FILE_NAME);
		}
		

		this._env.logger?.info(`Selected workspace file ${this._config_file_path.fsPath}`);

		// Initialize the file
		if (! await utils.does_path_exist(this._config_file_path)) {
			this._env.logger?.warn("Workspace configuration file not found, creating a fresh one.");
			workspace.fs.writeFile(this._config_file_path, new TextEncoder().encode(JSON.stringify(this._config, undefined, 4)));
		}
	}


    /**
	 * Save the current workspace configuration either in the settings defined location
	 * or to a manually provided location.
	 * 
	 * @param path Path to write the new configuration. If not set, will use {@link _config_file_path}
	 */
	public async save(path ?: Uri | null)
	{
		this._env.logger?.info(`Save workspace configuration${path ? ('  to' + path.fsPath) : ''}.`);
		if(! path)
			path = this._config_file_path;
		if(! path)
			throw new Error("No path to save the configuration");

		this._refresh_projects_to_config();
		workspace.fs.writeFile(path,new TextEncoder().encode(JSON.stringify(this._config,undefined,4)));
	}

	/**
	 * Load the workspace configuration either in the settings defined location
	 * or from a manually provided location.
	 * 
	 * @param path Path to read the new configuration from. If not set, will use {@link _config_file_path}
	 */
    public async load(path ?: Uri | null)
    {
		this._env.logger?.info(`Load workspace configuration${path ? (' from' + path.fsPath) : ''}.`);
        // Check the path validity, and select the internal path if needed.
		if(! path)
			path = this._config_file_path;
		if(! path)
			throw new Error("No path to save the configuration");

		// Save the 'old' configuration for restoration in case of a downstream issue.
		let old_config = this._config;

		 try 
		 {
			await workspace.fs.readFile(path).then(
				(data) => {
					this._config = JSON.parse(new TextDecoder().decode(data));
				}
			);
			
			let paths_to_ignore = this._config.excludedPaths.map(utils.get_uri_from_path).filter((p) => {return p !== undefined;})

			await this.ignore_paths(paths_to_ignore);
			this._refresh_projects_from_config();
			this._evt.config_loaded.fire(this._config);
            return Promise.resolve();
        } 
		catch (error) 
		{
			this._env.logger?.error(`Failed to load the config file ${path.fsPath} : ${error}`);
            this._config = old_config;
            return Promise.reject();
        }
    }


	/**
	 * Align the registered projects from the loaded configuration.
	 */
	protected _refresh_projects_from_config()
	{
		this.remove_projects();
		this.register_projects(this._config.projects.map((prj) => HDLProject.fromDiplomatProject(prj) ));
	}

	/**
	 * Update the configuration with the registered projects.
	 * This should be used every time the configuration is saved.
	 */
	protected _refresh_projects_to_config()
	{
		this._config.projects = Array.from(this._registered_projects.values());
	}

	/**
	 * This function will register provided project in the workspace state.
	 * @param prj_list The project (or list of projects) to register
	 */
	public register_projects(prj_list : HDLProject | HDLProject[])
	{
		if(! Array.isArray(prj_list))
			prj_list = [prj_list];

		let added_projects : HDLProject[] = [];
		for(let prj of prj_list)
		{
			this._env.logger?.info(`Registering project ${prj.name}`);
			if(! this._registered_projects.has(prj.name))
			{
				this._registered_projects.set(prj.name,prj);
				added_projects.push(prj);
			}
		}

		this._refresh_projects_to_config();

		if(added_projects.length > 0)
		{
			this._evt.prj_registered.fire(added_projects);
		}
	}

	/**
	 * Remove all provided projects from the workspace state.
	 * @param prj_list List of projects (matched by project name, as registered) to remove.
	 * Remove everything if not specififed.
	 */
	public remove_projects(prj_list ?: HDLProject | Array<HDLProject|string> | string)
	{
		let clean_prj_list :  Array<HDLProject| string>;
		let removed_projects : Array<HDLProject> = [];

		if(! prj_list)
		{
			removed_projects = Array.from(this._registered_projects.values());
			this._registered_projects.clear();
		}
		else
		{
			if(! Array.isArray(prj_list))
				clean_prj_list = [prj_list];
			else
				clean_prj_list = prj_list
			

			for(let prj of clean_prj_list)
			{
				let confirmed_tgt : string;
				
				if(prj instanceof HDLProject)
					confirmed_tgt = prj.name;
				else
					confirmed_tgt = prj;

				let to_del_prj = this._registered_projects.get(confirmed_tgt);
				if(to_del_prj)
				{
					this._registered_projects.delete(confirmed_tgt);
					removed_projects.push(to_del_prj);
				}
			}
		}

		if(removed_projects.length > 0)
			this._evt.prj_removed.fire(removed_projects);
	} 

	/**
	 * 
	 * @param project Project to add the files into
	 * @param files Files URI to add. Will be converted to appropriate path with regards to the workspace.
	 */
	public add_files(project: string, files: Uri[])
	{
		let tgt_prj = this._registered_projects.get(project);

		if (!tgt_prj)
			throw new Error(`Invalid project name ${project}`);

		for (let fpath of files)
			tgt_prj.addFileToProject(utils.get_prj_filepath_from_uri(fpath));

		this._evt.prj_updated.fire([tgt_prj]);
	}

	/**
	 * 
	 * @param project Project to remove the files from
	 * @param files Files URI to remove from the project. 
	 */
	public remove_files(project: string, files: Uri[])
	{
		let tgt_prj = this._registered_projects.get(project);

		if (!tgt_prj)
			throw new Error(`Invalid project name ${project}`);

		for (let fpath of files)
			tgt_prj.removeFileFromProject(utils.get_prj_filepath_from_uri(fpath));

		this._evt.prj_updated.fire([tgt_prj]);
	}

	/**
	 * This function update the 'active' atribute of the workspace projects
	 * @param project The project name to enable. if omitted, disable all projects.
	 */
	public set_active_project(project ?: string)
	{
		
		let found_prj : HDLProject | undefined = undefined;
		for(let prj of this.config.projects)
		{
			if(prj.name === project)
			{
				this._active_project = this._registered_projects.get(prj.name);
				prj.active = true;
				found_prj = this._registered_projects.get(prj.name);
			}
			else
			{
				prj.active = false;
			}
		}

		if(found_prj)
			this._evt.prj_activated.fire(found_prj);
	}

	/**
	 * Resolve project names
	 * @param names Names of projects to lookup
	 * @returns The resolved projects
	 */
	public resolve_project_names(names : string[]) : DiplomatProject[]
	{
		return this._config.projects.filter(prj => names.includes(prj.name));
	}

	/**
	 * Update the list of paths to be ignored.
	 * @param p New paths to ignore
	 */
	public async ignore_paths(p : Uri[])
	{
		if(p.length == 0)
			return; 

		for(let path of p.map(u => utils.get_prj_filepath_from_uri(u)))
		{
			this._env.logger?.info(`Requesting ignore for ${path}`);
			if(! this.config.excludedPaths.includes(path))
				this.config.excludedPaths.push(path);
		}

		await DiplomatSrvCmds.ignore_paths(p);
	}
	
	public async send_current_project()
	{
		if(this._active_project)
		{
			await DiplomatSrvCmds.set_project(this._active_project as HDLProject);
		}
	}
 }