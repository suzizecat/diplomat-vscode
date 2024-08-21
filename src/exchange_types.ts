"use strict";

import * as lsp from "vscode-languageclient";


export type DiplomatConfig = {
    workspaceDirs: Array<string>,
    excludedPaths: Array<string>,
    excludedDiags: Array<{subsystem : number, code : number}>
};
  
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