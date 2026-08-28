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
import { DesignElement, DesignHierarchyTreeProvider } from "../gui/designExplorerPanel";
import { ContextVar, HierClickMode } from "../utils";



class _HierEvents {
	public elt_select = new vscode.EventEmitter<DesignElement>();
}

/**
 * This class provides all features related to the editor itself.
 */
export class FeatureHierarchyManagement extends BaseFeature {

	protected _gui = new DesignHierarchyTreeProvider();

    protected _hier_sel_mode : HierClickMode = HierClickMode.Alternate;



	protected _evt = new _HierEvents();
	readonly on_elt_select = this._evt.elt_select.event;

    public constructor(ext_context : ExtensionEnvironment)
    {
		super("hier", ext_context);
		this.set_click_mode(HierClickMode.Alternate);
		
		
		this.bind("diplomat-host.refresh-hierarchy", this._gui.refresh, this._gui);
		this.bind("diplomat-host.select-hierarchy", this._h_on_select, this);
		this.bind("diplomat-host.gui.hier-mode.alt_to_ref",this._h_rotate_click_mode,this);
		this.bind("diplomat-host.gui.hier-mode.ref_to_def",this._h_rotate_click_mode,this);
		this.bind("diplomat-host.gui.hier-mode.def_to_alt",this._h_rotate_click_mode,this);

		
		vscode.window.createTreeView("design-hierarchy", { treeDataProvider: this._gui });
    }

	
	public get click_mode() : HierClickMode {
		return this._hier_sel_mode;
	}
	

	/**
	 * Triggers the refresh of the hierarchy view
	 */
	public refresh()
	{
		this._gui.refresh();
	}
	
	/**
	 * Handler for the select action, to catch the vscode command call and convert it into an event.
	 * @param elt Element which has been selected
	 */
	protected _h_on_select(elt : DesignElement)
	{
		this._evt.elt_select.fire(elt);
	}

	public set_click_mode(new_mode ?: HierClickMode)
	{
		if(new_mode)
			this._hier_sel_mode = new_mode;	
		else
		{
			switch (this._hier_sel_mode) {
				case HierClickMode.Alternate:
					this._hier_sel_mode = HierClickMode.Reference;
					break;
				case HierClickMode.Reference:
					this._hier_sel_mode = HierClickMode.Definition;
					break;
				case HierClickMode.Definition:
					this._hier_sel_mode = HierClickMode.Alternate;
					break;
				default:
					this._hier_sel_mode = HierClickMode.Alternate;
					break;
			}
		}
		vscode.commands.executeCommand("setContext", ContextVar.HierClickMode,this._hier_sel_mode);
	}

	protected _h_rotate_click_mode()
	{
		this.set_click_mode();
	}
}