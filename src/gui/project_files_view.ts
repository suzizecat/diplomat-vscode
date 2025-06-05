import * as vscode from 'vscode';
import { Utils } from "vscode-uri"
import { DiplomatProject } from '../exchange_types';
import path = require('path');

import { getFileExtensionsForLanguageId } from '../utils';

// type ProjectElement = ProjectFolder | ProjectFile;

export enum ProjectFileKind {
	Source,
	Test,
	Other
}

abstract class ProjectElement extends vscode.TreeItem
{
	public id : string = "";
	/**
	 * The logical name should be used for local lookup and so on.
	 */
	public logicalName : string = "" 
	protected _parent : ProjectElement | null = null;
	protected _children : ProjectElement[] = [];


	public set parent(nParent : ProjectElement | null | undefined) 
	{
		if(this._parent != nParent)
		{
			if(this._parent)
				this._parent.removeChild(this);
			
			if (nParent) 
			{
				this._parent = nParent.add_child(this);
				this.regenerateId();
			}
		}
	}

	public regenerateId()
	{
		let idBase = this._parent ? `${this._parent.logicalPath}` : "";
		this.id = `${idBase}:${this.logicalName}`;
	}

	public get root() : ProjectElement
	{
		let ret : ProjectElement = this;

		while(ret._parent)
			ret = ret._parent;

		return ret;
	}

	public get logicalPath() : string 
	{
		let pathElt : string[] = []
		let pos : ProjectElement | null = this;

		do
		{
			pathElt.push(pos.logicalName);
			pos = pos._parent;
		} while(pos);

		return pathElt.reverse().join(":");

	}


	public get children() : Array<ProjectElement> 
	{
		return this._children;
	}

	public add_child(v : ProjectElement) : ProjectElement | null 
	{
		if(v.id == this.id)
			return null;

		console.log(`Add child ${v.label} with URI path ${v.resourceUri?.fsPath} to folder ${this.label}`);
		let usedParent : ProjectElement | null = this;
		if(v.resourceUri)
		{
			usedParent = this._getUsedParent(v.resourceUri,true);
		}
		if(! usedParent)
		{
			// If a failure occured, just fall back to the original parent as a parent.
			usedParent = this;
		} 
		else if(usedParent.id == v.id)
		{
			console.error(`Parent lookup returned the new element itself. Defaulting to original parent.`);
			usedParent = this;
		}	

		console.log(`Actually use ${usedParent.id} as a parent for ${v.label}`);
		
		usedParent._pushChildren(v);

		usedParent.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
		// The responsibility to actually bind the child to its parent is kept to the caller.
		return usedParent;

		
	}


	public removeChild(v : ProjectElement | string)
	{
		if(v instanceof ProjectElement)
		{
			if(v._parent == this)
				v._parent = null;
			this._children = this._children.filter((elt,_) =>  {return elt !== v});
		}
		else
		{
			// v is string, so lookup by ID and then remove the found child (by ProjectElement call)
			for(let child of this._children)
			{
				if(child.id == v)
					this.removeChild(child)
					break;
			}
		}

	}

	/**
	 * Finds the nearest element of the design from the URI provided.
	 * @param v URI to lookup
	 * @returns The project element nearest to the target URI. 
	 */
	public lookupUri(v : vscode.Uri, thisDefaultUri ?: vscode.Uri) : ProjectElement | null 
	{

		let thisUri = this.resourceUri ? this.resourceUri : (thisDefaultUri ? thisDefaultUri :ProjectFolder.workspaceBaseUri);
		if(! thisUri || ! v)
			return null;

		let thisPath : string = thisUri.fsPath;
		let tgtPath : string = v.fsPath;

		if(! tgtPath.startsWith(thisPath))
			return null;

		let remainingPath = path.relative(thisPath,tgtPath);
		let neededFolders = remainingPath.split(path.sep).reverse();

		// If remaining path is empty, needed folder will be ['']
		// So it's better to use "remainingPath" length instead of needed folder length.
		if(remainingPath.length == 0)
			return this;
		if(neededFolders.at(-1) == "..")
			return null;
		
		let retFolder : ProjectElement = this;
		let tgtUri = thisUri;

		while(neededFolders.length > 0)
		{
			let newFolderName = neededFolders.pop();
			if(newFolderName === undefined)
				throw Error("Needed folder empty");

			tgtUri = vscode.Uri.joinPath(tgtUri,newFolderName);

			let luResult = retFolder.getChildByLocName(newFolderName);
			if(luResult)
			{
				retFolder = luResult;
			}

		}

		return retFolder;
	}

	protected _getUsedParent(v : vscode.Uri, build : boolean = false ) : ProjectElement | null
	{
		let thisUri = this.resourceUri ? this.resourceUri : ProjectFolder.workspaceBaseUri;
		if(! thisUri || ! v)
			return this;

		let thisPath : string = thisUri.fsPath;
		let tgtPath : string = v.fsPath;

		let remainingPath : string;
		// If the path is unrelated to the workspace, keep it as-is to build 
		// the full path
		if(tgtPath.startsWith(thisPath))
			remainingPath = path.relative(thisPath,path.dirname(tgtPath));
		else 
			remainingPath = path.dirname(tgtPath);

		let neededFolders = remainingPath.split(path.sep).reverse();

		// If remaining path is empty, needed folder will be ['']
		// So it's better to use "remainingPath" length instead.
		if(remainingPath.length == 0)
			return this;
		if(neededFolders.at(-1) == "..")
			return this;


		let retFolder : ProjectElement = this;
		let tgtUri = thisUri;

		if(remainingPath.startsWith("/"))
		{
			// If we have an absolute path
			// The first element of remaining folders will be an empty string, that we remove.
			neededFolders.pop();
			tgtUri = vscode.Uri.file("/");

			// Here, we are dealing with the first level of an absolute path.
			// We need to force the current location (expected a virtual top level)
			// as a return, otherwise we will infinitely recurse
			if(neededFolders.length == 1)
				return this;
		}
		

		while(neededFolders.length > 0)
		{
			let newFolderName = neededFolders.pop();
			if(newFolderName === undefined)
				throw Error("Needed folder empty");

			tgtUri = vscode.Uri.joinPath(tgtUri,newFolderName);

			let luResult = retFolder.getChildByLocName(newFolderName);
			if(luResult && (luResult instanceof ProjectFolder ))
			{
				retFolder = luResult;
			}
			else if(build)
			{
				retFolder = ProjectFolder.fromUri(tgtUri,retFolder);
			}
			else
			{
				return null;
			}
		}

		return retFolder;
	}

		/**
		 * This function is the low level access to the push command for the children
		 * @param v Child to add to the current node
		 */
		protected _pushChildren(v : ProjectElement) : void 
		{
			// If the element has no URI or if this URI is not within self, add it.
			if(! v.resourceUri || (! this.getChildByUri(v.resourceUri)))
			{
				this._children.push(v);
			}

			if(this.collapsibleState == vscode.TreeItemCollapsibleState.None)
				this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded ;
		}

	getChildById(id : string ) : ProjectElement | null
	{
		for(let child of this._children)
			if (child.id == id)
				return child;
		
		return null;
	}

	getChildByLocName(locname : string) : ProjectElement | null 
	{
		for(let child of this._children)
		{
			if (child.logicalName == locname)
			{
				return child;
			}
		}
		return null;
	}

	getChildByUri(uri : vscode.Uri ) : ProjectElement | null
	{
		for(let child of this._children)
			if (child.resourceUri === uri)
				return child;
		
		return null;
	}
}


export class ProjectFolder extends ProjectElement {
	//private _children : Array<ProjectElement> = [];
	public static readonly workspaceBaseUri : vscode.Uri | null = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : null;
	
	constructor(
		label: string,
		public logicalName : string = label,
		parent ?: ProjectFolder,
		public resourceUri ?: vscode.Uri,
		public  collapsibleState ?: vscode.TreeItemCollapsibleState
	) {
		super(label, collapsibleState);
		this.id = label;
		this.parent = parent;

		// Command revealInExplorer is undocumented in the API website...
		// Information retrieved from Copilot.
		// More annoying than anything actually...
		// if(resourceUri)
		// 	this.command = { command: "revealInExplorer", title: "reveal", arguments: [resourceUri] };
	};
	
	public static fromUri(uri : vscode.Uri, parent ?: ProjectElement) : ProjectFolder
	{
		let newFolderName = path.basename(uri.path);
		let ret =  new ProjectFolder(newFolderName,newFolderName,parent,uri);
		return ret;

	}

}

export class ProjectFile extends ProjectElement {
	public defined: boolean = true;
	public fileUri: vscode.Uri | null = null;

	constructor(
		public resourceUri: vscode.Uri,
		parent ?: ProjectFolder
	) {
		
		super(Utils.basename(resourceUri), vscode.TreeItemCollapsibleState.None);

		this.logicalName = Utils.basename(resourceUri);
		this.tooltip = resourceUri.fsPath;
		this.parent = parent;

		if(resourceUri)
			this.command = { command: "vscode.open", title: "open", arguments: [resourceUri] };
	};
	
	public add_child(v : ProjectElement) : ProjectElement | null {
		throw Error("File should not have child");
		return null;
	}	
};

// Drag and drop "documentation" from link from https://code.visualstudio.com/updates/v1_66#_tree-drag-and-drop-api
export class ProjectFileTreeProvider implements vscode.TreeDataProvider<ProjectElement>, vscode.TreeDragAndDropController<ProjectElement> {
	

	protected static SVExtensions : string[] = 
		getFileExtensionsForLanguageId("systemverilog").concat(getFileExtensionsForLanguageId("verilog"));
	

	public static readonly workspaceBaseUri : vscode.Uri | null = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : null;
	
	dropMimeTypes = ['text/uri-list'];
	dragMimeTypes = []; // 
	public roots : Map<string,ProjectFolder> = new Map();
	public registeredProjects : Map<string, DiplomatProject> = new Map();
	

	static addExternalFolder(parent : ProjectElement) : ProjectFolder
	{
		return new ProjectFolder("External","ext",parent,undefined,vscode.TreeItemCollapsibleState.None)
	}
	
	constructor() {}
	
	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}
	
	getChildren(element?: ProjectElement): Thenable<Array<ProjectElement>> {
		if(element) {
			console.log("Get elements from " + element.label + " giving " + element.children.map((x) => {return `'${x.id}': ${x.label}`}));
			return Promise.resolve(element.children);
		} else {
			return Promise.resolve(Array.from(this.roots.values()));
		}
	}

	async handleDrop(target: ProjectElement, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
		console.log(`An element got dropped ! ${dataTransfer}`);
		let prjName : string | null | undefined = target.root?.id;

		if(! prjName)
			return Promise.reject();

		
		const items : string = dataTransfer.get("text/uri-list")?.value;
		if(! items)
			return;
		let droppedUri : vscode.Uri[] = items.split("\r\n").map((v) => {return vscode.Uri.parse(v);});

		for(let uri of droppedUri)
		{
			await this.addFileToProject(prjName,uri);
		}
		
		return Promise.resolve();
	}

	/**
	* processProject
	* 
	* @remarks
	*
	* Don't forget to call {@link refresh} after.
	*
	*/
	public async processProject(prj : DiplomatProject) {
		console.log(`Starting handling project ${prj.name}...`);
		if(this.registeredProjects.has(prj.name))
			this.removeProject(prj.name);
		
		
		this.registeredProjects.set(prj.name,prj);
		let root = new ProjectFolder(prj.name,prj.name);
		this.roots.set(root.id,root);
			
		
		for(let file of prj.sourceList)
		{
			// If absolute path, register it "as is"
			let usedUri : vscode.Uri;
			if(file.startsWith("/"))
				usedUri = vscode.Uri.file(file)
				
			else
			{
				// If relative without a workspace open, don't know what we are doing here...
				if(! ProjectFileTreeProvider.workspaceBaseUri)
					throw Error("Relative path detected without open workspace");

				// Append the relative path to the current workspace.
				usedUri = vscode.Uri.joinPath(ProjectFileTreeProvider.workspaceBaseUri,file);
				
			}

			await this.addFileToProject(root.id,usedUri);

		}
		
	}
	
	public async addFileToProject(prj : string, fpath : vscode.Uri) : Promise<ProjectFile>
	{
		if(! ProjectFileTreeProvider.workspaceBaseUri)
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
	
		let destination : ProjectElement; 
		let isExternal : boolean = ! fpath.path.startsWith(ProjectFileTreeProvider.workspaceBaseUri.path);


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

	protected getProjectBaseDirForFileKind(prjRoot : ProjectElement, kind : ProjectFileKind, external : boolean = false)
	{
		let ret : ProjectElement | null;
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

		return ret;
	}

	public removeProject(prjName : string) {
		this.roots.delete(prjName);
		this.registeredProjects.delete(prjName);
	}
	
	private _onDidChangeTreeData: vscode.EventEmitter<ProjectElement | undefined | null | void> = new vscode.EventEmitter<ProjectElement | undefined | null | void>();
	readonly onDidChangeTreeData: vscode.Event<ProjectElement | undefined | null | void> = this._onDidChangeTreeData.event;
	
	refresh(): void {
		console.log("Refresh PFTP");
		this._onDidChangeTreeData.fire();
	}
};