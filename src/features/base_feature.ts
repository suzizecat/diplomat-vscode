import { commands, ExtensionContext, LogOutputChannel } from "vscode";

export type ExtensionEnvironment = {
    logger ?: LogOutputChannel,
    context : ExtensionContext
}

export class BaseFeature {

    constructor(protected _name : string, protected _ext : ExtensionEnvironment)
    {
        _ext.logger?.info(`Building feature ${_name}`);
    }

    protected get logger() : LogOutputChannel | undefined {
        return this._ext.logger;
    }

    protected get context() : ExtensionContext {
        return this._ext.context;
    }

    protected bind(command: string, callback: (...args: any[]) => any, thisArg?: any)
    {
        this.logger?.info(`Feature ${this._name} register command ${command}`);
        this.context.subscriptions.push(commands.registerCommand(command,callback,thisArg)); 
    }
}