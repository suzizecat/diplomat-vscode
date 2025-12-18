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
import {ModuleBlackBox } from "../../exchange_types";
import { DiplomatSrvCmds } from "../../language_server_cmds";

/**
 * @param bb Blackbox to instanciate
 * @returns The SV code relative to the BB instanciation.
 */
export function generate_bb_instance_as_string(bb : ModuleBlackBox) : string
{
    let to_insert = `${bb.module}`;
    if(bb.parameters.length > 0)
    {
        to_insert += " #(\n";
        for(let param of bb.parameters)
        {
            to_insert += `\t.${param.name}(${param.default ? param.default : param.name}),\n`;
        }
        to_insert = to_insert.slice(0,-2) + ")\n";
    }

    to_insert += `u_${bb.module.toLowerCase()} (\n`;
    for(let port of bb.ports)
    {
        to_insert += `\t.${port.name}(${port.name}), ${port.comment}\n`;
    }
    to_insert = to_insert.slice(0,-2) + "\n);";

    return to_insert;
}

/**
 * @param bb Blackbox to instanciate
 * @returns The SV code relative to the BB instanciation.
 */
export function generate_bb_instance_as_snippet(bb : ModuleBlackBox) : vscode.SnippetString
{
    // Assuming that the currently opened editor is the proper target.
    let indent = "\t";
    const editor = vscode.window.activeTextEditor;
    if(editor)
    {
        if(editor.options.insertSpaces)
            indent = " ".repeat(Number(editor.options.indentSize ?? 4));
    }


    let to_insert = `${indent}${bb.module} `;
    if(bb.parameters.length > 0)
    {
        to_insert += "#(\n";
        for(let param of bb.parameters)
        {
            to_insert += `\t.${param.name}(${param.default ? param.default : param.name}),\n`;
        }
        to_insert = to_insert.slice(0,-2) + ")\n";
    }

    to_insert += `\${1:u_${bb.module.toLowerCase()}} (\n`;
    for(let port of bb.ports)
    {
        to_insert += `\t.${port.name}(${port.name}), ${port.comment}\n`;
    }
    to_insert = to_insert.slice(0,-2) + "\n);\n$0";

    to_insert = to_insert.replace("\t",indent).replace(/\n/g,`\n${indent}`);

    return new vscode.SnippetString(to_insert);
}


/**
 * Handler for SVFiles drop to instanciate
 */
export class SVFileEditorDropEditProvider implements vscode.DocumentDropEditProvider<vscode.DocumentDropEdit>
{
    public provideDocumentDropEdits(document: vscode.TextDocument, position: vscode.Position, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): vscode.ProviderResult<vscode.DocumentDropEdit | vscode.DocumentDropEdit[]>
    {
        let dropped_uri : string = dataTransfer.get("text/uri-list")?.value;
        if(! dropped_uri)
            return Promise.reject("Invalid drop kind");
        return DiplomatSrvCmds.get_file_bbox(vscode.Uri.parse(dropped_uri)).then((available_bb) => {
        
            let ret : vscode.DocumentDropEdit[] = []

            for(let bb of available_bb)
            {
                ret.push(new vscode.DocumentDropEdit(generate_bb_instance_as_snippet(bb), bb.module ));
            }

            if(ret.length == 0)
                return Promise.resolve(undefined);
            else
                return Promise.resolve(ret);
        });
    }
}