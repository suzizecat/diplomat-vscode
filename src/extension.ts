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

import { ExtensionContext, window } from "vscode";
import { DiplomatExtension } from "./diplomat_core";
import { ExtensionEnvironment } from "./features/base_feature";

var extension: DiplomatExtension;

export async function activate(context: ExtensionContext) {

	const ext_env: ExtensionEnvironment = {
		context: context,
		logger :  window.createOutputChannel("[diplomat] Host", { log: true })
	}

	extension = new DiplomatExtension(ext_env);
	context.subscriptions.push(extension);
	await extension.start();
}

export function deactivate()
{
	console.log("Extension deactivate has been called.");
	// Extension is stopped upon disposal.
}