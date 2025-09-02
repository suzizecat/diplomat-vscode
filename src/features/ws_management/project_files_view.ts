import * as vscode from 'vscode';
import { Utils } from "vscode-uri"
import { DiplomatProject } from '../../exchange_types';
import path = require('path');

import { get_workspace_base_uri, getFileExtensionsForLanguageId } from '../../utils';
import { HDLProject } from './project';
import { BaseProjectElement, ProjectElementKind_t, ProjectFile, ProjectFolder } from './base_prj_element';

// type ProjectElement = ProjectFolder | ProjectFile;

export enum ProjectFileKind {
	Source,
	Test,
	Other
}

/**
 * Lightweight container to keep stuff somewhat tidy in {@link ProjectFileTreeProvider}
 */
class _PFTPEvents {
	public file_dropped = new vscode.EventEmitter<{project : string, element : vscode.Uri[]}>();
}


// Drag and drop "documentation" from link from https://code.visualstudio.com/updates/v1_66#_tree-drag-and-drop-api
export class ProjectFileTreeProvider implements vscode.TreeDataProvider<BaseProjectElement>, vscode.TreeDragAndDropController<BaseProjectElement> {
	

	protected static SVExtensions : string[] = getFileExtensionsForLanguageId("systemverilog").concat(getFileExtensionsForLanguageId("verilog"));
		
	public roots : Map<string,ProjectFolder> = new Map();
	// public registeredProjects : Map<string, HDLProject> = new Map();

	protected _activeProject : string | null = null;
	
	/** Mapping project - top file */
	protected _top_files : Map<string, BaseProjectElement | null > = new Map();
	

	static addExternalFolder(parent : BaseProjectElement) : ProjectFolder
	{
		return new ProjectFolder("External","ext",parent,undefined,vscode.TreeItemCollapsibleState.None)
	}

	// Events
	// ----------------------------------------------------------------------------
	protected _evt : _PFTPEvents = new _PFTPEvents();
	
	public get on_file_dropped() {return this._evt.file_dropped.event;}
	
	// #############################################################################
	// Constructor
	// #############################################################################
	

	constructor() {}
	
	// #############################################################################
	// Interface specialization
	// #############################################################################
	
	dropMimeTypes = ['text/uri-list'];
	dragMimeTypes = []; // 

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}
	
	getChildren(element?: BaseProjectElement): Thenable<Array<BaseProjectElement>> {
		if(element) {
			console.log("Get elements from " + element.label + " giving " + element.children.map((x) => {return `'${x.id}': ${x.label}`}));
			return Promise.resolve(element.children);
		} else {
			return Promise.resolve(Array.from(this.roots.values()));
		}
	}

	async handleDrop(target: BaseProjectElement | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		console.log(`An element got dropped ! ${dataTransfer}`);
		let prjName : string | null | undefined = target?.root?.id;

		// If there is only one project open or if one project is active,
		// assume that this is the expected target instead of "nothing"
		if(! prjName)
			if(this.roots.size == 1)
				prjName = Array.from(this.roots.keys())[0];
			else if (this._activeProject)
				prjName = this._activeProject;
			else 
				return Promise.reject();

		
		const items : string = dataTransfer.get("text/uri-list")?.value;
		if(! items)
			return Promise.reject();
		let droppedUri : vscode.Uri[] = items.split("\r\n").map((v) => {return vscode.Uri.parse(v);});

		for(let uri of droppedUri)
		{
			await this.addFileToProject(prjName,uri);
		}
		this._evt.file_dropped.fire({project: prjName, element : droppedUri});
		return Promise.resolve();
	}


	// #############################################################################
	// Additional functions
	// #############################################################################


	/**
	* processProject
	* 
	* @remarks
	*
	* Don't forget to call {@link refresh} after.
	*
	*/
	public async processProject(prj : HDLProject) {
		console.log(`Starting handling project ${prj.name}...`);
		if(this.roots.has(prj.name))
			this.removeProject(prj.name);
		
		let root = new ProjectFolder(prj.name,prj.name);
		root.contextValue = "project";
		this.roots.set(root.id,root);
			
		for(let file of prj.sourceFiles)
		{
			let usedUri = this.getUriFromfilePath(file);
			let new_file = await this.addFileToProject(root.name,usedUri,true);

			if(prj.topLevel?.file == usedUri.toString())
			{
				this.set_file_as_top(new_file,root.name);
			}
		}
	}

	/**
	 * Set the top-file for a given project
	 * @param file File to set
	 * @param project 
	 * @returns 
	 */
	public set_file_as_top(file : ProjectFile | vscode.Uri | null, project : string)
	{
		let prj = this.roots.get(project);
		let tgt : BaseProjectElement  | null;
		if(! prj)
			return;

		if(! file)
			tgt = null;
		else if(! (file instanceof ProjectFile))
			tgt = prj?.getChildByUri(file);	
		else 
			tgt = file;

		let prev_file = this._top_files.get(project);
		if(prev_file)
			prev_file.iconPath = undefined;

		if(tgt)
		{
			tgt.iconPath = new vscode.ThemeIcon("chip");
			this._top_files.set(project,tgt);
		}
		else
		{
			this._top_files.set(project,null);
		}
	}

	/**
	 * This function will convert a path (potentially relative to the workspace root) into a
	 * clean URI.
	 * @param path Path to convert to URI
	 */
	public getUriFromfilePath(path : string) : vscode.Uri
	{
		// If absolute path, use it "as is"
		let usedUri : vscode.Uri;
		if(path.startsWith("/"))
			usedUri = vscode.Uri.file(path)
		else
		{
			let ws_uri = get_workspace_base_uri();
			// If relative without a workspace open, don't know what we are doing here...
			if(! ws_uri)
				throw Error("Relative path detected without open workspace");

			// Append the relative path to the current workspace.
			usedUri = vscode.Uri.joinPath(ws_uri,path);
			
		}
		return usedUri;
	}
	

	/**
	 * Add a file (by its path) to an already registered project
	 * @param prj Project name to target
	 * @param fpath URI to the file to add
	 * @param fromLoad If set, skip the attempt to add the file to the HDL project.
	 * This is used in {@link processProject}, as the file already comes from the HDL project
	 * @returns the ProjectFile element created
	 */
	public async addFileToProject(prj : string, fpath : vscode.Uri, fromLoad : boolean = false) : Promise<ProjectFile>
	{
		let ws_uri = get_workspace_base_uri();
		if(! ws_uri)
			throw Error("A workspace shall be opened beforehand.");

		console.log(`Add file to project ${prj} : ${fpath.fsPath}`);
		let stats = await vscode.workspace.fs.stat(fpath);
		if(stats.type != vscode.FileType.File )
		{
			console.error(`${fpath.fsPath} is not a file.`)
			return Promise.reject();
		}
		let root = this.roots.get(prj);

		if(!root)
		{
			console.error(`File added to non-existing project ${prj}`);
			return Promise.reject();
		}
	
		let destination : BaseProjectElement; 
		let isExternal : boolean = ! fpath.path.startsWith(ws_uri.path);


		if(ProjectFileTreeProvider.SVExtensions.includes(path.extname(fpath.path)))
			destination = this.getProjectBaseDirForFileKind(root, ProjectFileKind.Source, isExternal);
		else 
			destination = this.getProjectBaseDirForFileKind(root, ProjectFileKind.Other, isExternal);

		if(! (destination instanceof ProjectFolder))
		{
			console.error(`Project ${prj} is not properly setup`);
			return Promise.reject();
		}

		let nearest = destination.lookupUri(fpath, isExternal ? vscode.Uri.file("/") : undefined);
		// If already exists, get out.
		if(nearest?.resourceUri?.path === fpath.path)
			return Promise.reject(nearest);
		if(! nearest)
			nearest = destination;


		let ret = new ProjectFile(fpath,nearest);

		this.refresh();
		return Promise.resolve(ret);
	}

	protected getProjectBaseDirForFileKind(prjRoot : BaseProjectElement, kind : ProjectFileKind, external : boolean = false)
	{
		let ret : BaseProjectElement | null;
		switch(kind)
		{
			case ProjectFileKind.Source :
				ret = prjRoot.getChildByLocName("src");
				if(! ret)
					ret = new ProjectFolder("Sources","src",prjRoot,undefined,vscode.TreeItemCollapsibleState.Collapsed);
				break;

			case ProjectFileKind.Test :
				ret = prjRoot.getChildByLocName("tst");
				if(! ret)
					ret = new ProjectFolder("Tests","tst",prjRoot,undefined,vscode.TreeItemCollapsibleState.Collapsed);
				break;

			case ProjectFileKind.Other:
			default:
				ret = prjRoot.getChildByLocName("misc");
				if(! ret)
					ret = new ProjectFolder("Others","misc",prjRoot,undefined,vscode.TreeItemCollapsibleState.Collapsed);
				break;
		}

		if(external)
		{
			let ext = ret.getChildByLocName("ext");
			if(ext)
				ret = ext;
			else
				ret = new ProjectFolder("External","ext",ret,undefined,vscode.TreeItemCollapsibleState.Collapsed);
		}
		// Always force "virtual" here, should be done only on creation but much more easy that way.
		ret.contextValue = "virtual";
		return ret;
	}

	public removeProject(prjName : string) {
		this.roots.delete(prjName);
	}

	public renameProject(oldName : string, newName : string) {
		if(this.getProjectFromName(newName))
			return;

		let prj = this.getProjectFromName(oldName);

		if(! prj)
			return;

		// this.removeProject(oldName);

		prj.name = newName;
		// this.processProject(prj);

	}


	public removePrjElement(elt : BaseProjectElement)
	{
		if(elt.parent)
		{
			let rel = elt.prjRelativePath;

			if(! rel)
				return;
            elt.parent.removeChild(elt);
		}
		else if(elt.kind === ProjectElementKind_t.Project)
		{
			// We want to remove a Project
			this.removeProject(elt.logicalName);
		}
		else
		{
			return;
		}
		this.refresh();


	}
	
	public getProjectFromElement(elt : BaseProjectElement) : ProjectFolder | null {
		return this.getProjectFromName(elt.root.logicalName);
	}

	public getProjectFromName(name : string) : ProjectFolder | null {
		let ret = this.roots.get(name);
		return ret ? ret : null;
	}

	public setActiveProject(name ?: string)
	{
		if(name == this._activeProject)
			return;
		this._activeProject = null
		for(let prj of this.roots.values())
		{
			if(prj.logicalName === name)
			{
				prj.iconPath = new vscode.ThemeIcon("star-full");
				this._activeProject = name;
			}
			else
			{
				prj.iconPath = undefined;
			}
		}
		this.refresh();
	}

	private _onDidChangeTreeData: vscode.EventEmitter<BaseProjectElement | undefined | null | void> = new vscode.EventEmitter<BaseProjectElement | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<BaseProjectElement | undefined | null | void> = this._onDidChangeTreeData.event;
	
	refresh(): void {
		console.log("Refresh PFTP");
		this._onDidChangeTreeData.fire();
	}
};