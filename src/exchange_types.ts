"use strict";

import * as lsp from "vscode-languageclient";


export type ModuleParam =
{
  name : string;
  default : string;
  type : string;
};

export type ModulePort = 
{
  name : string;
  size : string;
  type : string;
  direction : string;
  is_interface : boolean;
  modport : string;
  comment : string;
}

export type ModuleBlackBox = 
{
  module : string;
  parameters : Array<ModuleParam>;
  ports : Array<ModulePort>;

  dependencies : Array<string>;
}

/**
 * Represents the configuration of a diplomat workspace, exchanged with 
 * diplomat LSP.
 */
export type DiplomatConfig = {
    workspaceDirs: Array<string>, 
    excludedPaths: Array<string>,
    excludedPatterns: Array<string>,
    excludedRegex : Array<string>,
    topLevel : string,
    includeDirs : Array<string>,
    excludedDiags: Array<{subsystem : number, code : number}>
};

/**
 * Represents the configuration of a diplomat workspace, exchanged with 
 * diplomat LSP.
 */
export type DiplomatConfigNew = {
    workspaceDirs: Array<string>, 
    excludedPaths: Array<string>,
    excludedPatterns: Array<string>,
    excludedRegex : Array<string>,
    
    projects : Array<DiplomatProject>,

    excludedDiags: Array<{subsystem : number, code : number}>
};
  
export type HDLModule = {
  file : string | lsp.URI,
  module ?: string
}

export type DiplomatProject = {
  /** Name of the top-level entity if any */
  topLevel ?: HDLModule | null;
  /** Name of the project */
  name : string;
  /** List of all source files in the project */
  sourceList : string[] | lsp.URI[];
  /** List of folders to add to the include path */
  includeDirs : Array<string>,

  /** Active state of the project */
  active : boolean;
}



export type WaveformViewerCbArgs = {
  name: string,
  args: Array<any>
};

export type HierarchyRecord =  {
  childs?: HierarchyRecord[],
  def: boolean,
  name: string,
  module: string,
  file?: string
}

export type SignalData = {
  sig: string,
  val: string | number | null,
  flag: number | null
}

export type FileSymbolsLookupResult = {
  [key:string] : lsp.Range[];
}

export type TestDiscoveryResults = {
  testsuite: string,
  kind: string,
  location: string,
  makefile: string
  tests: Array<{
      name: string,
      file: string,
      comment:string | null,
      startLine: number,
      lastLine: number,
      lastChar: number
}>
}