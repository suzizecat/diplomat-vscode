
import { fstat } from "fs";
import {ExtensionContext, FileType, TestController, tests, Uri, workspace}  from "vscode";



class DiplomatTestController {
	public controller: TestController
	protected context : ExtensionContext


	constructor(context: ExtensionContext) {
		this.context = context;
		this.controller = tests.createTestController('diplomatTests', 'Diplomat Tests');

		this.controller.resolveHandler = async test => {
			if (!test) {
				
			}
		}
	}

	protected async findAllMakefiles(root : Uri[] | null = null): Promise<Uri[]> {
		let ret: Uri[] = [];
		let next_targets: Uri[] = [];
		const targets : Uri[] = root ? root : (workspace.workspaceFolders) ? workspace.workspaceFolders.map((f) => { return f.uri }) : [];

		for (let currDir of targets)
		{
			let currDirContent = await workspace.fs.readDirectory(currDir)

			for (let infos of currDirContent)
			{
				if (infos[1] == FileType.Directory)
					next_targets.push(Uri.joinPath(currDir, infos[0]));
				else {
					if(infos[0] == "Makefile")
						ret.push(Uri.joinPath(currDir, infos[0]));
				}
			}
		}

		if (next_targets.length > 0)
			ret.push(... await this.findAllMakefiles(next_targets));

		return Promise.resolve(ret)
	}
}

  