
import {ExtensionContext, FileType, Position, Range, TestController, TestItem, TestRunRequest, tests, Uri, workspace}  from "vscode";
import { TestDiscoveryResults } from "./exchange_types";
import { spawn, ChildProcess, exec, spawnSync} from 'node:child_process';
import path = require("node:path");
import { assertEquals } from "typia";
import { CancellationToken } from "vscode-languageclient";


class DiplomatTestController {
	public controller: TestController
	protected context : ExtensionContext


	constructor(context: ExtensionContext) {
		this.context = context;
		this.controller = tests.createTestController('diplomatTests', 'Diplomat Tests');

		this.controller.resolveHandler = async test => {
			if (!test) {
				let validMakefiles = await this.findAllMakefiles();
				for(let mkFile of validMakefiles)
				{
					let discovery : TestDiscoveryResults = await this.discoverFromMakefile(mkFile);
					const testId = path.join(discovery.location,discovery.makefile)
					let testsuite = this.controller.createTestItem(testId,discovery.testsuite,Uri.file(testId));
					testsuite.canResolveChildren = true;
				}
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
					{
						const newMakeFile = Uri.joinPath(currDir, infos[0])
						var isValidMakefile = await workspace.fs.readFile(newMakeFile)
							.then((data) => {
								let fileData : string = new TextDecoder().decode(data);
								return Promise.resolve(fileData.includes("include $(shell cocotb-config --makefiles)/Makefile.sim"));
							});

						if(isValidMakefile)
							ret.push(newMakeFile);
					}
				}
			}
		}

		if (next_targets.length > 0)
			ret.push(... await this.findAllMakefiles(next_targets));

		return Promise.resolve(ret)
	}

	protected async discoverFromMakefile(makefile : Uri) : Promise<TestDiscoveryResults> {
		let execEnv = process.env;

		if(! this.context.storageUri)
			return Promise.reject("No context setup");

		const outputFile : Uri = Uri.joinPath(this.context.storageUri,"cocotb-discovery.json");
		execEnv.TARGET = makefile.fsPath;
		execEnv.ODIR = this.context.storageUri.fsPath;
		execEnv.OFILE = "cocotb-discovery.json";

		let discoveryMakefile : string = this.context.asAbsolutePath(path.join("resources","discovery.mk"));
		let theProcess = spawnSync("make",["-f", discoveryMakefile],{"env" : execEnv, cwd : path.dirname(makefile.fsPath)});

		if(theProcess.error)
		{
			return Promise.reject(theProcess.error.message);
		}

		return Promise.resolve(assertEquals<TestDiscoveryResults>(JSON.parse(
			await workspace.fs.readFile(outputFile).then((data) => {
				return new TextDecoder().decode(data);
			})
		)))
	}

	protected testsFromDiscoveryResults(discovery : TestDiscoveryResults) : TestItem[] {
		let ret : TestItem[] = []
		const testSuiteId = path.join(discovery.location,discovery.makefile)

		let testsuite = this.controller.createTestItem(testSuiteId,discovery.testsuite,Uri.file(testSuiteId))
		this.controller.items.add(testsuite)

		for(let testInfos of discovery.tests) {
			let test = this.controller.createTestItem(`${testsuite}:${testInfos.name}`,testInfos.name,Uri.file(testInfos.file));
			test.range = new Range(
				testInfos.startLine,
				0,
				testInfos.lastLine,
				testInfos.lastChar
			);

			testsuite.children.add(test);
			test.canResolveChildren = false;

		}

		return ret;
	}

	private runCocotbHandler(
		shouldDebug: boolean,
		request : TestRunRequest,
		token : CancellationToken
	) {
		const run = this.controller.createTestRun(request);
		const testlist : TestItem[] = []

		if(request.include) {
			request.include.forEach(test => request.exclude?.includes(test) ? null : testlist.push(test));
		}

		let testsuites : {[key:string] : string[]} = {};

		for(let test of testlist)
		{
			if(test.parent === undefined)
			{
				testsuites[test.id] = []
			}
			else
			{
				if(! Object.keys(testsuites).includes(test.parent.id))
					testsuites[test.parent.id] = [];
				testsuites[test.parent.id].push(test.label);
			}
		}

		for(let runSuite in testsuites)
		{
			let execEnv = process.env

			if(testsuites[runSuite].length > 0) {
				execEnv.TESTCASE = testsuites[runSuite].join(",");
			} else {
				delete execEnv.TESTCASE;
			}
			
			let execOptions = {"env":execEnv, cwd : path.dirname(runSuite)};

			(
				async () => {
					let runner = spawnSync("make",[],execOptions);

					await done;
				}
			)

		}




		let runner = spawn("make", [], {"env":execEnv, cwd:})

	}
}

  