
import {ExtensionContext, FileType, Position, Range, TestController, TestItem, TestMessage, TestRunProfileKind, TestRunRequest, tests, Uri, workspace}  from "vscode";
import { TestDiscoveryResults } from "./exchange_types";
import { spawn, ChildProcess, exec, spawnSync} from 'node:child_process';
import path = require("node:path");
import { assertEquals } from "typia";
import { CancellationToken } from "vscode-languageclient";
import { XMLParser } from "fast-xml-parser";

import * as nodefs from  "node:fs/promises" ;
import test from "node:test";
export class DiplomatTestController {
	public controller: TestController
	protected context: ExtensionContext
	protected xmlParser : XMLParser = new XMLParser()


	constructor(context: ExtensionContext) {
		this.context = context;
		this.controller = tests.createTestController('diplomatTests', 'Diplomat Tests');

		this.controller.resolveHandler = async test => {
			console.log("Start test resolution");
			if (!test) {
				let validMakefiles = await this.findAllMakefiles();
				for(let mkFile of validMakefiles)
				{
					console.log(`Processing makefile ${mkFile}`);
					await this.discoverFromMakefile(mkFile).then((discovery) => {this.testsFromDiscoveryResults(discovery);},(reason) => (console.log("    Failed to process.")));
					
				}
			}
		}

		this.controller.createRunProfile("Run Cocotb", TestRunProfileKind.Run, (request, token) => runCocotbHandler(this.controller, request, token), true);
	}

	public dispose() {
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
							}, (reason) => { return Promise.resolve(false) });

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
		console.log(`Discover from makefile ${makefile.toString()}`);
		let execEnv = process.env;

		if(! this.context.storageUri)
			return Promise.reject("No context setup");

		const outputFile : Uri = Uri.joinPath(this.context.storageUri,"cocotb-discovery.json");
		execEnv.TARGET = makefile.fsPath;
		execEnv.ODIR = this.context.storageUri.fsPath;
		execEnv.OFILE = "cocotb-discovery.json";



		let discoveryMakefile : string = this.context.asAbsolutePath(path.join("resources","discovery.mk"));
		let theProcess = spawnSync("make",["-f", discoveryMakefile],{"env" : execEnv, cwd : path.dirname(makefile.fsPath)});

		console.log("Discovery result:");
		if(theProcess.error || theProcess.status != 0)
		{
			console.log("Error : " + theProcess.stderr.toString());
			return Promise.reject(theProcess.error?.message);
		} else 
		{
			console.log(theProcess.stdout.toString());
		}


		return Promise.resolve(assertEquals<TestDiscoveryResults>(JSON.parse(
			await workspace.fs.readFile(outputFile).then((data) => {
				return new TextDecoder().decode(data);
			})
		)))
	}

	protected testsFromDiscoveryResults(discovery : TestDiscoveryResults) {

		const testSuiteId = discovery.makefile

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
	}

	}

	async function  runCocotbHandler(
	    controller : TestController,
		request : TestRunRequest,
		token : CancellationToken
	) {

		const run = controller.createTestRun(request);
		let testlist: TestItem[] = []
		
		let xmlParser = new XMLParser({ignoreAttributes : false});

		if(request.include) {
			request.include.forEach(test => request.exclude?.includes(test) ? null : testlist.push(test));
		}

		let testsuites: { [key: string]: string[] } = {};
		let testmap: { [key: string]: TestItem } = {}
		
		testlist.forEach(test => { testmap[test.parent === undefined ? test.id : test.label] = test; });

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
			execEnv.COCOTB_ANSI_OUTPUT = "1"
			let testsNames: string[] = [];
			if(testsuites[runSuite].length > 0) {
				execEnv.TESTCASE = testsuites[runSuite].join(",");
				testsNames = testsuites[runSuite];
			} else {
				delete execEnv.TESTCASE;
				testsNames = [runSuite];
			}
			
			let execOptions = {"env":execEnv, cwd : path.dirname(runSuite)};
			console.log(`Start runner for ${runSuite} at ${path.dirname(runSuite)}`);
			let runner = spawn("make", execOptions);

			token.onCancellationRequested(() => {
				console.log("Request to kill the runner.")
				if (runner.connected)
					runner.kill();
			});

			runner.stderr.on("data", (data) => {
				run.appendOutput(data);
			});
			runner.stdout.on("data", (data) => {
				let toPrint : string = data.toString();

				run.appendOutput(toPrint.replace(/\n/g,"\r\n"));
			});

			runner.on("error", (err) => { console.log(err); });

			let runnerDone = new Promise((resolve) => {
				runner.on("close", resolve);
				runner.on("error", resolve);
			});
			
			await runnerDone;

			if (Object.keys(testmap).includes(runSuite) && testmap[runSuite].parent === undefined) {
				testsNames = []
				testmap[runSuite].children.forEach((item) => {
					testsNames.push(item.label)
					testsuites[runSuite].push(item.label);
					testmap[item.label] = item;
				});

			}

				if (runner.exitCode != 0) {
					testsNames.forEach((tname) => { run.failed(testmap[tname],new TestMessage(`Failed with exit code ${runner.exitCode}`)) });	
				}
				else {
					let resultUri = Uri.file(path.join(execOptions.cwd, "results.xml"));
					let resultBuffer = await workspace.fs.readFile(resultUri);
					let resultText = new TextDecoder().decode(resultBuffer);
					let resultObj = xmlParser.parse(resultText);

					// Pass everything, we'll come to this later. 
					let isPassed = true;

					if (testsNames.length == 1) {
						isPassed = false;
						let currTestName = testsNames[0];
						let currTest = testmap[currTestName];
						
						if (resultObj?.testsuites?.testsuite?.testcase)
							if (resultObj.testsuites.testsuite.testcase["@_name"] == currTestName)
								if (resultObj.testsuites.testsuite.testcase.failure === undefined)
								{
									run.passed(currTest);
									isPassed = true
								}
								else
									run.failed(currTest, new TestMessage("Test failed"));
							else
								run.failed(currTest, new TestMessage("Test missing from results"));
						else
							run.failed(currTest, new TestMessage("Malformed results.xml"));							
					}
					else {
						
						if (resultObj?.testsuites?.testsuite?.testcase)
						{
							resultObj.testsuites.testsuite.testcase.forEach((element: any) => {
								if (Object.keys(testmap).includes(element["@_name"]))
									if (!element.failure)
										run.passed(testmap[element["@_name"]]);
									else
										run.failed(testmap[element["@_name"]], new TestMessage("Test failed"));
							});
						}
						else
							testsNames.forEach((tname) => { run.failed(testmap[tname], new TestMessage("Malformed results.xml")) });
					}
					console.log(resultObj);
				}
		}

		run.end();
	}
