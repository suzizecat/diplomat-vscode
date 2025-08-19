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
import { DiplomatConfigNew } from "../../exchange_types";
import { ExtensionEnvironment } from "../base_feature";
import { does_path_exist } from "../../utils";


/**
 * Lightweight container to keep stuff somewhat tidy in {@link WorkspaceState}
 */
class _WSStateEvents {
	public config_loaded = new EventEmitter<Uri>();
}


export class WorkspaceState {

	// #############################################################################
	// Variables declaration
	// #############################################################################

    public _config : DiplomatConfigNew;
	public get config() {return this._config;}
		
	// Events
	// ----------------------------------------------------------------------------
	protected _evt : _WSStateEvents;
	
	public get on_config_loaded() {return this._evt.config_loaded.event;}

	
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

		this._evt = new _WSStateEvents();

        this._setup_config_file();
    }



    protected async _setup_config_file()
	{

		let param_filepath = workspace.getConfiguration("diplomatServer.projects").get<string>("projectFilePath");
		if(! param_filepath || param_filepath.length == 0)
		{
			this._env.logger?.info("Setting up default config file path");

			if(this._env.context.storageUri === undefined)
			{
				this._env.logger?.error("A workspace shall have been opened");
				throw new Error("Trying to work with workspace features without an active workspace.");
			}

			if( ! await does_path_exist(this._env.context.storageUri))
			{
				await workspace.fs.createDirectory(this._env.context.storageUri);
			}

			this._config_file_path = Uri.joinPath(this._env.context.storageUri,dconst.DEFAULT_WS_CONF_FILE_NAME);
		}
		else
		{
			this._config_file_path = Uri.file(param_filepath);
		}

		this._env.logger?.info(`Selected workspace file ${this._config_file_path.fsPath}`);

		// Initialize the file
		if(! await does_path_exist(this._config_file_path))
			workspace.fs.writeFile(this._config_file_path,new TextEncoder().encode(JSON.stringify(this._config,undefined,4)));
		else
 			this.load();
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
            )
			this._evt.config_loaded.fire(path);
            return Promise.resolve();
        } 
		catch (error) 
		{
			this._env.logger?.error(`Failed to load the config file ${path.fsPath} : ${error}`);
            this._config = old_config;
            return Promise.reject();
        }
    }
 }