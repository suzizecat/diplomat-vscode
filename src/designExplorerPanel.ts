import * as vscode from 'vscode';
import { HierarchyRecord } from './exchange_types';


export class DesignElement extends vscode.TreeItem {
	private _parent : DesignElement | null = null;
	private _childs : DesignElement[] = [];
	public defined : boolean = true;
	constructor(
		public readonly label: string,
		parent : DesignElement | null = null,
		private kind: string = "module",
		public  collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
	  ) {
		super(label, collapsibleState);
		this.description = this.kind;

		this.parent = parent;
	  };

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

	public async fetchData() : Promise<DesignElement[]> {
		console.log("Run fetch data !")
		const rawData : HierarchyRecord[] = await vscode.commands.executeCommand<HierarchyRecord[]>("diplomat-server.get-hierarchy");
		console.log(rawData);
		this.roots = []

		for(let elt of rawData) {
			this.roots.push(this.elementFromRecord(elt));
		}

		return Promise.resolve(this.roots);
	}

	protected elementFromRecord(rec : HierarchyRecord, parent : DesignElement | null = null) : DesignElement {
		let ret = new DesignElement(rec.name,parent);
		ret.defined = rec.def;
		// if(rec.def) {
		// 	ret.iconPath = "$(file-code)"
		// } else {
		// 	ret.iconPath = "$(warning)"
		// }
		// console.log(`${parent?.hierPath} - ${rec.name}`);
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