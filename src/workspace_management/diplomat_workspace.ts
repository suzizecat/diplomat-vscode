import { workspace, ExtensionContext, LogOutputChannel, commands, window, TreeViewOptions, TreeItem } from "vscode";
import { Uri } from "vscode";

import { DiplomatConfigNew, DiplomatProject } from "../exchange_types";
import { ProjectElement, ProjectFileTreeProvider } from "../gui/project_files_view";
import { HDLProject } from "../project_management/project";
import { send } from "node:process";
import path = require("node:path");



export class DiplomatWorkspace 
{
    protected _context : ExtensionContext;
    protected _config : DiplomatConfigNew;
    protected _projectFilesManager : ProjectFileTreeProvider;

    constructor(context : ExtensionContext) {
        this._context = context;
        this._projectFilesManager = new ProjectFileTreeProvider();
        this._setupConfigFile();

        this._config = {
            workspaceDirs : [],
            excludedPaths : [],
            excludedPatterns : [],
            excludedRegex : [],
            projects : [],
            excludedDiags : []
        }

    }
    

    public getProjectFromElement(elt : ProjectElement) : HDLProject | null {
        return this._projectFilesManager.getProjectFromElement(elt);
    }

    public setActiveProject(prj : HDLProject | string | ProjectElement | null | undefined) {
        if(prj instanceof HDLProject)
        {
         this._projectFilesManager.setActiveProject(prj.name);
        }
        else if(prj instanceof ProjectElement)
        {
            this.setActiveProject(this._projectFilesManager.getProjectFromElement(prj)); 
        }
        else if(prj)
        {
            this.setActiveProject(this._projectFilesManager.getProjectFromName(prj)); 
        }
        else
        {
            // Do nothing.
        }
    }

    public sendProjectToLSP(prj : HDLProject | string | ProjectElement | null | undefined) {
        if(prj instanceof HDLProject)
        {
            let toSend : DiplomatProject = prj.toJSON();
            if(! toSend.topLevel)
                toSend.topLevel = undefined;

            toSend.sourceList = toSend.sourceList.map((path : string) => {return this._projectFilesManager.getUriFromfilePath(path).fsPath});

            commands.executeCommand("diplomat-server.prj.set-project",toSend);
        }
        else if(prj instanceof ProjectElement)
        {
            this.sendProjectToLSP(this._projectFilesManager.getProjectFromElement(prj)); 
        }
        else if(prj)
        {
            this.sendProjectToLSP(this._projectFilesManager.getProjectFromName(prj)); 
        }
        else
        {
            // Do nothing.
        }
    }

    public get treeViewProvider() : TreeViewOptions<TreeItem> {
        return {
            treeDataProvider: this._projectFilesManager,
            dragAndDropController:this._projectFilesManager
        }
    }
    
    public refreshProjects()
    {
        this._projectFilesManager.refresh();
    }


    public async addProject(name ?: string) : Promise<HDLProject>
    {
        if(typeof name != "string")
                    name = await window.showInputBox({prompt : "Enter the new project name"});
        
        if(! name)
            return Promise.reject("No name provided");

        if(name.trim().length == 0)
        {
            await window.showErrorMessage("Can not create project with an empty name.");
            return Promise.reject("Empty name");
        }
        else if(this._projectFilesManager.registeredProjects.has(name))
        {
            await window.showErrorMessage(`A project with name ${name} seems to be already existing.`);
            return Promise.reject("Already exists");
        }
        else
        {
            let newPrj = new HDLProject(name);

            await this._projectFilesManager.processProject(newPrj);
            this._projectFilesManager.refresh();
            return Promise.resolve(newPrj);
            await window.showInformationMessage(`Project ${name} has been created.`);
        }
    }
    
    public get configFilePath() : Uri | null {
        let manual_location = workspace.getConfiguration("diplomatServer.projects")?.get<string>("projectFilePath");
        
        if(manual_location && manual_location.trim().length > 0)
        {
            if(path.isAbsolute(manual_location))
                return Uri.file(path.normalize(manual_location));
            else
                return Uri.file(path.join(this._config.workspaceDirs[0],manual_location));

        }
        if( this._context.storageUri !== undefined)
        {
            return Uri.joinPath(this._context.storageUri,"diplomat-settings-alpha.json");
        }
        else
        {
            return null;
        }
    }

    public get config() : DiplomatConfigNew {
        return this._config;
    }

    public clearConfig() 
    {
        this._config = {
            workspaceDirs : [],
            excludedPaths : [],
            excludedPatterns : [],
            excludedRegex : [],
            projects : [],
            excludedDiags : []
        }
    }
    
    protected _setupConfigFile() : void 
    {
        if( this._context.storageUri !== undefined)
        {
            workspace.fs.createDirectory(this._context.storageUri);
        }
    }

    protected async _readConfigFile() : Promise<void>
    {
        if(this.configFilePath === null)
            return;

        try {
            await workspace.fs.readFile(this.configFilePath).then(
                (data) => {
                    this._config = JSON.parse(new TextDecoder().decode(data));
                }
            )
            return Promise.resolve();
        } catch (error) {
            this.clearConfig();
            return Promise.reject();
        }
    }


    public async saveConfig() : Promise<void>
    {
        if(this.configFilePath === null)
            return;

        this.config.projects = [];
        for(let prj of this._projectFilesManager.registeredProjects.values())
            this._config.projects.push(prj.toJSON());

        try 
        {
            await workspace.fs.writeFile(this.configFilePath,new TextEncoder().encode(JSON.stringify(this._config,undefined,4)));
        } catch (error) {
            window.showErrorMessage(`Unable to write the configuration file ${this.configFilePath}`);
        }
    }

    public openProjectFromConfig()
    {
        console.log(`Restoring workspace from config file`)
        this._readConfigFile()
        .then(async () => {
            for(let prj of this.config.projects)
            {
                console.log(`Opening ${prj.name}...`)
                let newPrj : HDLProject = HDLProject.fromDiplomatProject(prj);
                await this._projectFilesManager.processProject(newPrj);
            }
            return Promise.resolve()
        })
        .then(() => {
            this._projectFilesManager.refresh();
            for(let prj of this.config.projects)
            {
                if(prj.active || this.config.projects.length == 1)
                {
                    this.sendProjectToLSP(prj.name);
                }
            }
        })
    }

    public removeProjectElement(elt : ProjectElement)
    {
       this._projectFilesManager.removePrjElement(elt);        
    }

    public async addFileToProject(file: Uri, prjName: string)
    {
        await this._projectFilesManager.addFileToProject(prjName, file);
    }

}