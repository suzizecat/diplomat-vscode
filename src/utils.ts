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
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

import * as vscode from 'vscode';
import * as lsp from 'vscode-languageclient';
import path = require('path');

// Example usage:
// const extensions = getFileExtensionsForLanguageId('typescript');
// console.log(extensions); // e.g., ['.ts', '.tsx']

export function getFileExtensionsForLanguageId(languageId: string, specificDiplomat = true): string[] {
    const result: string[] = [];

    for (const ext of vscode.extensions.all) {
        const extName = ext.packageJSON?.name;
        if(specificDiplomat && (!extName || extName != "diplomat-host"))
            continue;

        const contributes = ext.packageJSON?.contributes;
        if (!contributes || !contributes.languages) 
            continue;

        for (const language of contributes.languages) {
            if (language.id === languageId && language.extensions) {
                result.push(...language.extensions);
            }
        }
    }

    // Remove duplicates
    return Array.from(new Set(result));
}

export function vscode_in_debug_mode() : boolean {
    return process.env.VSCODE_DEBUG_MODE === "true";
}

export enum ContextVar {
    DiplomatEnabled = "diplomat-host:enabled",
};


export async function reveal_file(file : vscode.Uri, pos ?: vscode.Location | lsp.Range | vscode.Range)
{
    let document = await vscode.workspace.openTextDocument(file);
    let editor = await vscode.window.showTextDocument(document);

    if(pos)
    {
        if(pos instanceof vscode.Range)
        {
            editor.revealRange(pos);
            editor.selection = new vscode.Selection(pos.start, pos.end);
        }
        else if(pos instanceof vscode.Location)
        {
            editor.revealRange(pos.range);
            editor.selection = new vscode.Selection(pos.range.start, pos.range.end);
        }
        else
        {
            editor.revealRange(new vscode.Range(pos.start.line, pos.start.character, pos.end.line, pos.end.character));
            editor.selection = new vscode.Selection(pos.start.line,pos.start.character,pos.end.line,pos.end.character);
        }
    }
}

export async function does_path_exist(path : vscode.Uri) : Promise<boolean>
{
    try
    {
        await vscode.workspace.fs.stat(path); // Check if file exists, throw otherwise.
        return true;
    }
    catch (_)
    {
        return false;
    }
    
}

export function get_workspace_base_uri() : vscode.Uri | undefined
{
    return vscode.workspace.workspaceFolders?.at(0)?.uri;
}

export function get_prj_filepath_from_uri(fpath: vscode.Uri, ref_loc?: vscode.Uri) : string
{
    
    if (!ref_loc)
        ref_loc = get_workspace_base_uri();

    if (!ref_loc)
        throw new Error("No workspace available and not reference location provided.");
    
    let tgt_path = path.relative(ref_loc.fsPath, fpath.fsPath);
    if (tgt_path.startsWith(".."))
        return fpath.fsPath;
    else
        return tgt_path;
}

/**
 * Resolves the provided path considering CWD as the workspace location.
 * @param path Path to process
 */
export function get_uri_from_path(tgt : string) : vscode.Uri | undefined
{
    if(path.isAbsolute(tgt))
    {
        return vscode.Uri.file(tgt);
    }
    else
    {
        let ws_basepath = get_workspace_base_uri()?.path;
        if(ws_basepath)
        {
            let new_path = path.resolve(ws_basepath,tgt);
            return vscode.Uri.file(new_path);
        }

        return undefined;

    }
}