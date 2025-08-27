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
import { DiplomatConfigNew } from "../exchange_types";
import { does_path_exist } from "../utils";
import { WorkspaceState } from './ws_management/ws_state';



export class WorkspaceManagement extends BaseFeature {

	protected _state : WorkspaceState;
	protected _view : ProjectFileTreeProvider;

	/** URI to the config file related to the project */
	protected _user_config_file_path ?: vscode.Uri;


	constructor(ext_env: ExtensionEnvironment) {
		super("workspace-manager", ext_env);

		
		this._state = new WorkspaceState(ext_env);
		this._view = new ProjectFileTreeProvider();

		this._bind_events();

		vscode.window.createTreeView("diplomat-prj", {treeDataProvider : this._view, dragAndDropController : this._view});

	}


	protected _bind_events()
	{
		// Here perform the event bindings
	}

	public start()
	{
		this._workspace.openProjectFromConfig();
	}

	




}