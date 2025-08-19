import { window, workspace } from "vscode";
import { BaseFeature, ExtensionEnvironment } from "./base_feature";
import { DiplomatWorkspace } from "./prj_management/diplomat_workspace";


export class FeatureWaveformViewer extends BaseFeature {

	protected _workspace: DiplomatWorkspace;

	constructor(ext_env: ExtensionEnvironment) {
		super("prj-manager", ext_env);

		this._workspace = new DiplomatWorkspace(this.context);

		window.createTreeView("diplomat-prj", this._workspace.treeViewProvider);
	}

	public start()
	{
		this._workspace.openProjectFromConfig();
	}



}