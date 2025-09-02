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
import * as lsp from "vscode-languageclient";
import { DiplomatProject, FileSymbolsLookupResult, HDLModule, HierarchyRecord, ModuleBlackBox, QualifiedHDLModule } from "./exchange_types";

/**
 * This namespace contains all function binding to the diplomat server custom functions.
 * It allows properly typed calls and listing of said functions.
 */
export namespace DiplomatSrvCmds {
    /**
     * @returns All available modules in the workspace
     */
    export async function get_modules() : Promise<QualifiedHDLModule[]>
    {
        return vscode.commands.executeCommand<QualifiedHDLModule[]>("diplomat-server.get-modules");
    }

    /**
     * @param mod Module to lookup
     * @returns the black-boxes related to the provided {@link HDLModule} if any. 
     * 
     * @note if the moduleName is not provided, all bb from the file will be returned.
     */
    export async function get_module_bbox(mod : HDLModule) : Promise<ModuleBlackBox[]>
    {
        return vscode.commands.executeCommand<ModuleBlackBox[]>("diplomat-server.get-module-bbox",mod);
    }

    /**
     * Require the LSP to process a specific file and return any detected bb.
     * @param file file to process
     * @returns a list of detected blackboxes
     * 
     * @todo replace by a usage of {@link get_module_bbox} (which requires server update)
     */
    export async function get_file_bbox(file : vscode.Uri) : Promise<ModuleBlackBox[]>
    {
        return vscode.commands.executeCommand<ModuleBlackBox[]>("diplomat-server.get-file-bbox", file.toString());
    }

    /**
     * Request the LSP to process the workspace and try to find all files required to build
     * a project from the provided module top.
     * @param mod module to start from
     * @returns the determined fileset of all dependencies
     */
    export async function get_project_tree_from_module(mod : HDLModule) : Promise<vscode.Uri[]>
    {
        return vscode.commands.executeCommand<string[]>("diplomat-server.prj.tree-from-module",mod)
                .then(val => val.map(txt => vscode.Uri.parse(txt)));
    }

    /**
     * Send information about projects to the LSP. 
     * @param prj Project to transmit
     * 
     * @todo update to sent array of projects, but requires server udpate
     */
    export async function set_project(prj : DiplomatProject) : Promise<void>
    {
        return vscode.commands.executeCommand("diplomat-server.prj.set-project",prj);
    }
    
    /**
     * Replace the top-level module name for the server.
     * @param new_top new top module name
     * 
     * @todo remove in favor of project commands, requires server update
     */
    export async function set_top(new_top ?:string) : Promise<void>
    {
        return vscode.commands.executeCommand("diplomat-server.set-top",new_top);
    }

    /**
     * Request the LSP for the definition location of a list of symbol, looked up by
     * fully qualified hierarchical path.
     * @param path_list hierarchical path list
     * @returns document locations of resolved symbols
     */
    export async function resolve_hier_path(path_list:string[]) : Promise<{[key : string] : lsp.Location | null}> 
    {
        return vscode.commands.executeCommand<{[key : string] : lsp.Location | null}>("diplomat-server.resolve-paths", path_list);
    }

    /**
     * Request the LSP for the full list of symbols that may be found in a given scope.
     * 
     * @param scope_path Hierarchical path of the scope to inspect
     * @returns The map between all found symbols and the list of all references locations.
     */
    export async function list_symbols(scope_path : string) : Promise<FileSymbolsLookupResult>
    {
        return vscode.commands.executeCommand<FileSymbolsLookupResult>("diplomat-server.list-symbols", scope_path);
    }

    /**
     * @returns A view of the design hierarchy, based upon currently selected top (if any)
     */
    export async function get_hierarchy() : Promise<HierarchyRecord[] | null>
    {
        return vscode.commands.executeCommand<HierarchyRecord[] | null>("diplomat-server.get-hierarchy");
    }
 }
