# Diplomat LSP Host

This VSCode extension allows interfacing with the Diplomat Language Server, available as `slang-lsp` in [slang-lsp](https://github.com/suzizecat/slang-lsp-tools) repository.

Diplomat is a language server based upon [slang](https://github.com/MikePopoloski/slang) and written in C++ .
It works by actually elaborating the designs in your workspace, thus enabling checks across files that takes instanciations into account. 

## Howto build

```
git clone git@github.com:suzizecat/diplomat-vscode.git
cd diplomat-vscode
npm install
npm run publish
code --install-extension diplomat*.vsix
```

## Documentation

The detailed documentation will be available [here](https://suzizecat.github.io/diplomat-lsp/index.html)

## Features

This extension brings support for SystemVerilog language in VSCode.
The following feature are supported:
 - Workspace files detections
 - Error and warning checking
 - Go to definition (across files)
 - Go to/Find all references (across files)
 - Code coloration
 - Instanciate module
 - Set top level of the design
 - Open waveforms in GTKWave (if available)
 - Ignore files and patterns
 - Format file (ongoing)

## Requirements

Have a compiled version of `slang-lsp` available.
See [slang-lsp repository](https://github.com/suzizecat/slang-lsp-tools) for more information.

## Extension Settings

This extension contributes the following settings:

* `diplomatServer.serverArgs`: Arguments used when invoking the server.
* `diplomatServer.index.validExtensions`: Files extension to read for indexing
* `diplomatServer.server.useTCP`: Connect to an instance of Diplomat Server that have been started in TCP mode.
* `diplomatServer.serverPath`: Command to use for Diplomat Server
* `diplomatServer.tools.GTKWave.path`: Command to use for GTKWave
* `diplomatServer.tools.GTKWave.verbose`: Makes GTKWave verbose by forwaring all STDIO outputs to the extension output
* `diplomatServer.tools.GTKWave.options`: Other options to pass to GTKWave on invokation.
