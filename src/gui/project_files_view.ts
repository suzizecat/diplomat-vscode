import * as vscode from 'vscode';
import { Utils } from "vscode-uri"
import { DiplomatProject } from '../exchange_types';
import path = require('path');

import { getFileExtensionsForLanguageId } from '../utils';

// type ProjectElement = ProjectFolder | ProjectFile;

abstract class ProjectElement extends vscode.TreeItem
{
	protected _parent : ProjectElement | null = null;
	protected _children : ProjectElement[] = [];


	public set parent(nParent : ProjectElement | null) {

		if(this._parent !== null)
			this._parent.removeChild(this);
		
		if (nParent !== null) 
		{
			nParent.add_child(this);
		}
	}

	public get root() : ProjectElement
	{
		let ret : ProjectElement = this;

		while(ret._parent)
			ret = ret._parent;

		return ret;
	}


	public get children() : Array<ProjectElement> {
		return this._children;
	}

	public add_child(v : ProjectElement) : void {
		if(v.id == this.id)
			return;

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

	protected _getUsedParent(v : vscode.Uri, build : boolean = false ) : ProjectElement | null
	{
		let thisUri = this.resourceUri ? this.resourceUri : ProjectFolder.workspaceBaseUri;
		if(! thisUri || ! v)
			return this;

		let thisPath : string = thisUri.fsPath;
		let tgtPath : string = v.fsPath;

		if(! tgtPath.startsWith(thisPath))
			return this;

		let remainingPath = path.relative(thisPath,path.dirname(tgtPath));
		let neededFolders = remainingPath.split(path.sep).reverse();

		// If remaining path is empty, needed folder will be ['']
		// So it's better to use "remainingPath" length instead.
		if(remainingPath.length == 0)
			return this;
		if(neededFolders.at(-1) == "..")
			return this;
		
		let retFolder : ProjectElement = this;
		let tgtUri = thisUri;

		while(neededFolders.length > 0)
		{
			let newFolderName = neededFolders.pop();
			if(newFolderName === undefined)
				throw Error("Needed folder empty");

			tgtUri = vscode.Uri.joinPath(tgtUri,newFolderName);

			let luResult = this.getChildById(tgtUri.path);
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
		public readonly label: string,
		public readonly id : string = label,
		parent : ProjectFolder | null = null,
		public  collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
	) {
		super(label, collapsibleState);
		
		this.parent = parent;
		
	};
	
	public static fromUri(uri : vscode.Uri, parent : ProjectElement | null = null ) : ProjectFolder
	{
		let newFolderName = path.basename(uri.path);
		let ret =  new ProjectFolder(newFolderName,uri.path,null);
		ret.resourceUri = uri;
		ret.parent = parent;
		return ret;

	}

}

export class ProjectFile extends ProjectElement {
	public defined: boolean = true;
	protected _parent : ProjectFolder | null = null;
	public fileUri: vscode.Uri | null = null;
	constructor(
		public resourceUri: vscode.Uri,
		parent : ProjectFolder,
		private kind: string = "design",
		public  collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
	) {
		
		super(Utils.basename(resourceUri), collapsibleState);
		
		this.parent = parent;
		this.id  = resourceUri.path;
		this.tooltip = resourceUri.fsPath;
	};
	
	public set parent(nParent : ProjectFolder | null) {
		super.parent = nParent;
	}
	
	public add_child(v : ProjectElement) : void {
		throw Error("File should not have child");
	}	
};

// Drag and drop "documentation" from link from https://code.visualstudio.com/updates/v1_66#_tree-drag-and-drop-api
export class ProjectFileTreeProvider implements vscode.TreeDataProvider<ProjectElement>, vscode.TreeDragAndDropController<ProjectElement> {
	

	protected static SVExtensions : string[] = getFileExtensionsForLanguageId("systemverilog");
	public static readonly workspaceBaseUri : vscode.Uri | null = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri : null;
	
	dropMimeTypes = ['text/uri-list'];
	dragMimeTypes = []; // 
	public roots : Map<string,ProjectFolder> = new Map();
	public registeredProjects : Map<string, DiplomatProject> = new Map();
	
	/**
	* Produces all virtual folder used later on in the hierarchy.
	* 
	* @param parent Potential parent to the various virtual folders
	* @returns The virtual folders.
	* 
	* @example
	* ```typescript
	* let root = new ProjectFolder("My-Project");
	* root.children = ProjectFileTreeProvider.projectVirtualFolders();
	* ``` 
	*/
	static projectVirtualFolders(parent : ProjectFolder | null = null) : ProjectFolder[]
	{
		let ret = new Array<ProjectFolder>();
		
		ret.push(new ProjectFolder("Sources","src",parent,vscode.TreeItemCollapsibleState.Collapsed));
		ret.push(new ProjectFolder("Tests", "tst" ,parent,vscode.TreeItemCollapsibleState.Collapsed));
		ret.push(new ProjectFolder("Others", "other" ,parent,vscode.TreeItemCollapsibleState.Collapsed));
		
		return ret;
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

		
		let droppedUri : vscode.Uri[] = [];

		dataTransfer.forEach((item, mime, dtransfer) => {
			let ressourceUri : vscode.Uri = vscode.Uri.parse(item.value);
			droppedUri.push(ressourceUri);
		})

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
	public processProject(prj : DiplomatProject) {
		console.log(`Starting handling project ${prj.name}...`);
		if(this.registeredProjects.has(prj.name))
			this.removeProject(prj.name);
		
		this.registeredProjects.set(prj.name,prj);
		
		let root = new ProjectFolder(prj.name);

		ProjectFileTreeProvider.projectVirtualFolders(root);
		
		let sources = root.getChildById("src");
		if(! (sources instanceof ProjectFolder))
			throw Error("Source folder ID is not src or it returned a file instead of a folder.");
		
		
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

			new ProjectFile(usedUri,sources);
		}
		
		this.roots.set(prj.name,root);
	}
	
	public async addFileToProject(prj : string, fpath : vscode.Uri) : Promise<ProjectFile>
	{
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
	
		let destination : ProjectElement | null | undefined; 

		if(ProjectFileTreeProvider.SVExtensions.includes("." + path.extname(fpath.path)))
			destination = root?.getChildById("src");
		else 
			destination = root?.getChildById("other");

		if(! (destination instanceof ProjectFolder))
		{
			console.error(`Project ${prj} is not properly setup`);
			return Promise.reject();
		}

		let ret = new ProjectFile(fpath,destination);
		this.refresh();

		return Promise.resolve(ret);
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