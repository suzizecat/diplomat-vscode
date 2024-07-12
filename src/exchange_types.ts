"use strict";


export type DiplomatConfig = {
    workspaceDirs: Array<string>,
    excludedPaths: Array<string>,
    excludedDiags: Array<{subsystem : number, code : number}>
};
  
export type WaveformViewerCbArgs = {
  name: string,
  args: Array<any>
};