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
import { HierarchyRecord } from '../exchange_types';
import { DiplomatSrvCmds } from '../language_server_cmds';


export class DesignElement extends vscode.TreeItem {
	private _parent : DesignElement | null = null;
	private _childs : DesignElement[] = [];
	public defined: boolean = true;
	public fileUri: vscode.Uri | null = null;
	constructor(
		public readonly label: string,
		parent : DesignElement | null = null,
		private kind: string = "module",
		public  collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
	  ) {
		super(label, collapsibleState);

		this.parent = parent;
	};
	
	public get name(): string {	return this.label; }

	/**
	 * Getting the parent is straightforward
	 */
	public get parent() : DesignElement | null {
		return this._parent;
	}

	public set children(nChilds : DesignElement[]) {
		this._childs = nChilds;
		if(nChilds.length > 0) {
			this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		} else {
			this.collapsibleState = vscode.TreeItemCollapsibleState.None;
		}
	}

	public get children() : DesignElement[] {
		return this._childs;
	}

	protected addChild(child : DesignElement) {
		this.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
		this._childs.push(child);
	}
	/**
	 * When setting the parent, first detach current from its parent.
	 * Then, reattach to the new parent, if necessary.
	 * 
	 * Finally, update the tooltip, as the path will have changed.
	 */
	public set parent(nParent : DesignElement | null) {
		if(this._parent !== null) {
			this._parent.children = this._parent._childs.filter((elt,idx) => {return elt !== this});
			this._parent = null;
		}

		if (nParent !== null) {
			nParent.addChild(this);
			this._parent = nParent;
		}

		this.tooltip = this.hierPath;
	}

	public get hierPath() : string {
		if(this._parent === null) {
			return this.label;
		} else {
			return `${this._parent.hierPath}.${this.label}`;
		}

	}
};


export class DesignHierarchyTreeProvider implements vscode.TreeDataProvider<DesignElement> {
	public roots : DesignElement[] = [];
	constructor(rootsElements : DesignElement[] = []) {
		this.roots = rootsElements;
	}

	getTreeItem(element: DesignElement): vscode.TreeItem {
		return element;
	  }
	
	getChildren(element?: DesignElement): Thenable<DesignElement[]> {
		if(element) {
			return Promise.resolve(element.children);
		} else {
			return this.fetchData();
		}
	}

	public findElement(hierPath : string) : DesignElement | null {
		let path = hierPath.split(".");
		let currentLookup = this.roots;
		let lastElt: DesignElement | null = null;
		
		let pathElement: string | undefined = undefined;
		while ((pathElement = path.shift())) {
			findLabel: {
				for (let elt of currentLookup) {
					if (elt.label == pathElement) {
						lastElt = elt;
						currentLookup = lastElt.children;
						break findLabel;
					}
				}
				// If we didn't break, return null as we have not found the element.
				console.log(`Hierarchy lookup failed. Path is ${hierPath}, ${pathElement} not found.`);
				return null;
			}
		}
		console.log(`Hierarchy lookup of ${hierPath}.`);
		return lastElt;
		
	}

	public async fetchData() : Promise<DesignElement[]> {
		console.log("Run fetch data !")
		const rawData : HierarchyRecord[] | null = await DiplomatSrvCmds.get_hierarchy();
		console.log(rawData);
		this.roots = []

		if (rawData) {
			for (let elt of rawData) {
				this.roots.push(this.elementFromRecord(elt));
			}
		}

		return Promise.resolve(this.roots);
	}

	protected elementFromRecord(rec : HierarchyRecord, parent : DesignElement | null = null) : DesignElement {
		
		
		let ret = new DesignElement(rec.name != "" ? rec.name : rec.module , parent);
		ret.defined = rec.def;
		ret.description = rec.module;
		// if(rec.def) {
		// 	ret.iconPath = "$(file-code)"
		// } else {
		// 	ret.iconPath = "$(warning)"
		// }
		// console.log(`${parent?.hierPath} - ${rec.name}`);
		if (rec.file) {
			ret.tooltip = rec.file;
			let fileUri: vscode.Uri;

			try {
				fileUri = vscode.Uri.parse(rec.file,true);
			} catch {
				fileUri = vscode.Uri.file(rec.file);
			}
			//console.log(`Request open ${rec.file}`);
			ret.fileUri = fileUri
			//ret.command = { command: "vscode.open", title: "open", arguments: [fileUri] };
			ret.command = { command: "diplomat-host.select-hierarchy", title: "Select hierarchy", arguments: [ret] };
		}
		if(rec.childs) {
			for(let subrec of rec.childs) {
				this.elementFromRecord(subrec,ret);
			}
		}

		return ret;
	}

	private _onDidChangeTreeData: vscode.EventEmitter<DesignElement | undefined | null | void> = new vscode.EventEmitter<DesignElement | undefined | null | void>();
  	readonly onDidChangeTreeData: vscode.Event<DesignElement | undefined | null | void> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire();
	}
};