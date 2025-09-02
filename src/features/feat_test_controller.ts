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


// const testController = new DiplomatTestController(context, waveViewer.refreshWaves);
 

import * as vscode from "vscode";
import { BaseFeature, ExtensionEnvironment } from "./base_feature";
import { DesignElement, DesignHierarchyTreeProvider } from "../gui/designExplorerPanel";
import { DiplomatTestController } from "../tests_controller";



class _TestEvents {
	public test_finished = new vscode.EventEmitter<void>();
}

/**
 * This class provides all features related to the editor itself.
 */
export class FeatureTestController extends BaseFeature {

	protected _controller : DiplomatTestController;


	protected _evt = new _TestEvents();
	readonly on_test_finished = this._evt.test_finished.event;

	public constructor(ext_context : ExtensionEnvironment)
	{
		super("test-ctrl", ext_context);

		this._controller = new DiplomatTestController(this._ext.context, this._h_on_test_finished);

	}

	/**
	 * Handler for the test-finished action, to use as callback and convert it into an event.
	 * @param elt Element which has been selected
	 */
	protected async _h_on_test_finished()
	{
		this._evt.test_finished.fire();
	}

}