 /*
 * Diplomat for Visual Studio Code is a language server protocol client for Diplomat language server.
 * Copyright (C) 2025  Julien FAUCHER
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

import * as vscode from 'vscode';
import { Utils } from "vscode-uri"
import path = require('path');

import { get_workspace_base_uri } from '../../utils';



export enum ProjectElementKind_t {
    Project,
    Folder,
    File,
    Undefined
};

export abstract class BaseProjectElement extends vscode.TreeItem
{   
    // Force an empty string in case of doubt.
    // The underlying instanciation SHALL replace the id.
    public id : string = "";
    /**
     * The logical name should be used for local lookup and so on.
     */
    public logicalName : string = "" 
    protected _parent : BaseProjectElement | null = null;
    protected _children : BaseProjectElement[] = [];

    public abstract get kind() : ProjectElementKind_t;
    
    /** Unless otherwise specified, any element should be concrete */
    // protected _is_virtual : boolean = false;
    // public get is_virtual() {return this._is_virtual;}

    public get name() : string { return this.logicalName; }
    public set name(value : string) 
    { 
        if(value != this.logicalName)
        {
            this.logicalName = value;
            this.regenerateId();
        } 
    }


    public set parent(nParent : BaseProjectElement | null | undefined) 
    {
        if(this._parent != nParent)
        {
            if(this._parent)
                this._parent.removeChild(this);
            
            if (nParent) 
            {
                this._parent = nParent._add_child(this);
                this.regenerateId();
            }
        }
    }

    public get parent() : BaseProjectElement | null | undefined
    {
        return this._parent;
    }

    public regenerateId()
    {
        let idBase = this._parent ? `${this._parent.logicalPath}` : "";
        this.id = `${idBase}:${this.logicalName}`;

        for(let child of this._children)
            child.regenerateId();
    }

    public get root() : BaseProjectElement
    {
        let ret : BaseProjectElement = this;

        while(ret._parent)
            ret = ret._parent;

        return ret;
    }

    /**
     * This function will return the uri path of the current element relative to
     * the workspace.
     * 
     * @returns the relative path or null if the current element has no URI.
     */
    public get prjRelativePath() : string | null
    {
        if(! this.resourceUri)
            return null;
        let ws_uri = get_workspace_base_uri();
        if(! ws_uri)
            return this.resourceUri.path;
        
        let thisPath : string = this.resourceUri.path;
        let wsPath : string = ws_uri.path

        let relative = path.relative(wsPath,thisPath);
        
        if(relative.startsWith(".."))
            return thisPath;
        else
            return relative;

    }

    public get logicalPath() : string 
    {
        let pathElt : string[] = []
        let pos : BaseProjectElement | null = this;

        do
        {
            pathElt.push(pos.logicalName);
            pos = pos._parent;
        } while(pos);

        return pathElt.reverse().join(":");

    }


    public get children() : Array<BaseProjectElement> 
    {
        return this._children;
    }


    /**
     * This function adds a child to the current element.
     * 
     * It will also build all the required chain of parents to insert the new child.
     * @see {@link _getUsedParent()}
     * @param v Element to add as a child of the current element
     * @returns The parent used if the insertion worked, null otherwise.
     */
    protected _add_child(v : BaseProjectElement) : BaseProjectElement | null 
    {
        if(v.id == this.id)
            return null;

        console.log(`Add child ${v.label} with URI path ${v.resourceUri?.fsPath} to folder ${this.label}`);
        let usedParent : BaseProjectElement | null = this;
        
        // If the new child has an URI, build the chain of parents leading to the proper URI
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

        if(usedParent != this)
            console.log(`Actually use ${usedParent.id} as a parent for ${v.label}`);
        
        usedParent._pushChildren(v);

        usedParent.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        // The responsibility to actually bind the child to its parent is kept to the caller.
        return usedParent;		
    }


    /**
     * Remove a child from the current node and cleanup the project element tree.
     * @param v Child to lookup and remove if exists
     * @returns The higher level project element still existing after removal (usually this)
     */
    public removeChild(v : BaseProjectElement | string) : BaseProjectElement
    {
        if(v instanceof BaseProjectElement)
        {
            if(v._parent == this)
                v._parent = null;
            this._children = this._children.filter((elt,_) =>  {return elt !== v});
            
            // Also remove the hierarchy, if relevant
            if(this._children.length == 0 && this._parent)
                return this._parent.removeChild(this);
            else
                return this;
        }
        else
        {
            // v is string, so lookup by ID and then remove the found child (by ProjectElement call)
            for(let child of this._children)
            {
                if(child.id == v)
                    return this.removeChild(child);
            }

            return this;
        }

    }

    /**
     * Finds the nearest element of the design from the URI provided (downstream only)
     * @param v URI to lookup
     * @returns The project element nearest to the target URI. 
     */
    public lookupUri(v : vscode.Uri, thisDefaultUri ?: vscode.Uri) : BaseProjectElement | null 
    {

        // Initialize the lookup starting point to be either:
        // - The current element URI if any
        // - The default URI, passed in parameter
        // - The workspace uri
        let lookup_start_uri = this.resourceUri ? this.resourceUri : (thisDefaultUri ? thisDefaultUri : get_workspace_base_uri());
        if(! lookup_start_uri || ! v)
            return null;

        let thisPath : string = lookup_start_uri.fsPath;
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
        
        // If we are acutally looking up something we should be finding
        let retFolder : BaseProjectElement = this;
        let tgtUri = lookup_start_uri;

        // Perform the lookup by visiting each subdirectory until match or not found.
        while(neededFolders.length > 0)
        {
            let newFolderName = neededFolders.pop();
            if(newFolderName === undefined)
                throw Error("Needed folder empty");

            tgtUri = vscode.Uri.joinPath(tgtUri,newFolderName);

            let luResult = retFolder.getChildByLocName(newFolderName);
            
            if(luResult) // If match of the next element, set it as a new step and continue
                retFolder = luResult;
            else         // Otherwise, return the last valid step.
                return retFolder;

        }

        return retFolder;
    }

    /**
     * Resolves the chain of parents to use to insert a "document" ({@link BaseProjectElement})
     * under the current element.
     * 
     * This function is mainly used to build on the fly and find all elements corresponding to sub-folders
     * in filepaths.
     * @param v URI of the element to insert
     * @param build set to true to build the chain of (new) parents required
     * @returns The ProjectElement to actually use as a parent when inserting something with the provided
     * URI.
     */
    protected _getUsedParent(v : vscode.Uri, build : boolean = false ) : BaseProjectElement | null
    {
        let thisUri = this.resourceUri ? this.resourceUri : get_workspace_base_uri();
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


        let retFolder : BaseProjectElement = this;
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

            // Build the successives URIs
            tgtUri = vscode.Uri.joinPath(tgtUri,newFolderName);
            
            // Find the next element if it exists
            let luResult = retFolder.getChildByLocName(newFolderName);
            
            // If the next element exists, select it (and loop again)
            if(luResult && luResult.kind == ProjectElementKind_t.Folder)
                retFolder = luResult;
            else if(build)
                // If it is not found, but we get to build it, create a new element
                // and select it.

                // TODO Rework the logic and remove the Base -> Specialization dependency.
                retFolder = ProjectFolder.fromUri(tgtUri,retFolder);
            else
                // Otherwise (cannot find path and cannot build it) return null
                return null;
        }

        return retFolder;
    }

    /**
     * This function is the low level access to the push command for the children
     * @param v Child to add to the current node
     */
    protected _pushChildren(v : BaseProjectElement) : void 
    {
        // If the element has no URI or if this URI is not within self, add it.
        if(! v.resourceUri || (! this.getChildByUri(v.resourceUri)))
        {
            this._children.push(v);
        }

        if(this.collapsibleState == vscode.TreeItemCollapsibleState.None)
            this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded ;
    }

    getChildById(id : string ) : BaseProjectElement | null
    {
        for(let child of this._children)
            if (child.id == id)
                return child;
        
        return null;
    }

    getChildByLocName(locname : string) : BaseProjectElement | null 
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

    getChildByUri(uri : vscode.Uri ) : BaseProjectElement | null
    {
        for(let child of this._children)
            if (child.resourceUri === uri)
                return child;
        
        return null;
    }
}

// #############################################################################
// Project element specializations
// #############################################################################


export class ProjectFolder extends BaseProjectElement {
    
    public get kind() {return ProjectElementKind_t.Folder;}

    constructor(
        label: string,
        public logicalName : string = label,
        parent ?: ProjectFolder,
        public resourceUri ?: vscode.Uri,
        public collapsibleState ?: vscode.TreeItemCollapsibleState
    ) {
        super(label, collapsibleState);
        this.id = label;
        this.parent = parent;
        this.contextValue = "folder"

        // Command revealInExplorer is undocumented in the API website...
        // Information retrieved from Copilot.
        // More annoying than anything actually...
        // if(resourceUri)
        // 	this.command = { command: "revealInExplorer", title: "reveal", arguments: [resourceUri] };
    };
    
    public static fromUri(uri : vscode.Uri, parent ?: ProjectFolder) : ProjectFolder
    {
        let newFolderName = path.basename(uri.path);
        let ret =  new ProjectFolder(newFolderName,newFolderName,parent,uri);
        return ret;

    }

    
    public get name() : string { return this.logicalName; }
    public set name(value : string) 
    { 
        if(value != this.logicalName)
        {
            this.logicalName = value;
            this.label = value;
            this.regenerateId();
        } 
    }

    
    

}


export class ProjectFile extends BaseProjectElement {
    public defined: boolean = true;
    public get kind() {return ProjectElementKind_t.File;}

    constructor(
        public resourceUri: vscode.Uri,
        parent ?: ProjectFolder
    ) {
        
        super(Utils.basename(resourceUri), vscode.TreeItemCollapsibleState.None);

        this.logicalName = Utils.basename(resourceUri);
        this.tooltip = resourceUri.fsPath;
        this.parent = parent;
        this.contextValue = "file"

        if(resourceUri)
            this.command = { command: "vscode.open", title: "open", arguments: [resourceUri] };
    };
    
    protected _add_child(v : BaseProjectElement) : BaseProjectElement | null {
        throw Error("File should not have child");
        return null;
    }	
}
