import { workspace, ExtensionContext, LogOutputChannel, commands } from "vscode";
import { Uri } from "vscode";

import { DiplomatConfig } from "../exchange_types";



class DiplomatWorkspace 
{
    protected _context : ExtensionContext;
    protected _config : DiplomatConfig | null = null;

    constructor(context : ExtensionContext) {
        this._context = context;
        this._setupConfigFile();

    }
    
    public get configFilePath() : Uri | null {
        if( this._context.storageUri !== undefined)
        {
            return Uri.joinPath(this._context.storageUri,"diplomat-settings.json");
        }
        else
        {
            return null;
        }
    }

    public get config() : DiplomatConfig | null {
        return this._config;
    }
    
    protected _setupConfigFile() : void 
    {
        if( this._context.storageUri !== undefined)
        {
            workspace.fs.createDirectory(this._context.storageUri);
        }
    }

    protected _readConfigFile() : void
    {
        if(this.configFilePath === null)
            return;

        try {
            workspace.fs.readFile(this.configFilePath).then(
                (data) => {
                    this._config = JSON.parse(new TextDecoder().decode(data));
                }
            )
        } catch (error) {
            this._config = null;
        }
    }

}