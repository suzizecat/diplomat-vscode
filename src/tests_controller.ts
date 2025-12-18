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
import { ExtensionContext, FileType, Position, Progress, ProgressLocation, Range, TestController, TestItem, TestMessage, TestRunProfileKind, TestRunRequest, tests, Uri, window, workspace } from "vscode";
import { TestDiscoveryResults } from "./exchange_types";
import { spawn, ChildProcess, exec, spawnSync} from 'node:child_process';
import path = require("node:path");
import { CancellationToken } from "vscode-languageclient";
import { XMLParser } from "fast-xml-parser";

import * as nodefs from  "node:fs/promises" ;
export class DiplomatTestController {
	public controller: TestController
	protected context: ExtensionContext
	protected xmlParser : XMLParser = new XMLParser()

	protected discoveryMap: { [key: string]: Uri } = {};
	protected mkfileList: Uri[] = [];

	protected progressController: Progress<{
		message?: string;
		increment?: number;
	}> | null = null;

	protected postRunCb: () => Promise<void>;

	constructor(context: ExtensionContext, postRunCb : () => Promise<void> = () => Promise.resolve()) {
		this.context = context;
		this.postRunCb = postRunCb;
		this.controller = tests.createTestController('diplomatTests', 'Diplomat Tests');
		this.controller.resolveHandler = async test => {
			console.log("Start test resolution");
			if (test && !Object.keys(this.discoveryMap).includes(test.id))
			{
				console.log(`Test ${test.id} not found in discovery map, relaunching full discovery`);
				test = undefined;
			}
			if (!test) {
				await window.withProgress({ location: ProgressLocation.Notification, title: "Test discovery" },
					async (progress) => {
						this.progressController = progress;
						await this.findAllMakefiles();
						for(let mkFile of this.mkfileList)
						{
							console.log(`Processing makefile ${mkFile}`);
							this.progressController.report({ message: `Processing ${mkFile.path}...`, increment: (100/this.mkfileList.length) });
							await this.processMakefile(mkFile);					
						}
						return Promise.resolve();
					})
					.then(() => {
						this.progressController = null;
					});
			}
			else {
				// console.log(`Refresh discoverty of test ${test.id}`);
				// if (Object.keys(this.discoveryMap).includes(test.id))
				// {
				// 	await this.processMakefile(this.discoveryMap[test.id]);
				// }
			}
		}

		this.controller.refreshHandler = async (token) => {
			if (this.controller.resolveHandler)
				await this.controller.resolveHandler(undefined);
		};

		this.controller.createRunProfile("Run Cocotb", TestRunProfileKind.Run, (request, token) => {
			runCocotbHandler(this.controller, request, token);
			this.postRunCb();
		}, true);
	}

	public dispose() {
	}
	
	protected async processMakefile(makefile: Uri): Promise<void> {
		await this.discoverFromMakefile(makefile)
			.then((discovery) => {
				this.testsFromDiscoveryResults(discovery);
			},
				(reason) => {
					console.log("    Failed to process.");
				}
		);
		
		return Promise.resolve();
	}

	protected async findAllMakefiles(root: Uri[] | null = null): Promise<void> {

		if(!root)
			this.mkfileList = [];
		let ret: Uri[] = [];
		let next_targets: Uri[] = [];
		const targets : Uri[] = root ? root : (workspace.workspaceFolders) ? workspace.workspaceFolders.map((f) => { return f.uri }) : [];

		for (let currDir of targets)
		{
			let currDirContent = await workspace.fs.readDirectory(currDir)

			for (let infos of currDirContent)
			{
				const targetPath = Uri.joinPath(currDir, infos[0]);

				if (infos[1] == FileType.Directory)
					next_targets.push(targetPath);
				else {
					if(infos[0] == "Makefile")
					{
						if (this.progressController)
							this.progressController.report({ message: `Checking ${targetPath.path}`});
						console.log(`    Checking ${targetPath.path}`);

						var isValidMakefile = await workspace.fs.readFile(targetPath)
							.then((data) => {
								let fileData : string = new TextDecoder().decode(data);
								return Promise.resolve(fileData.includes("include $(shell cocotb-config --makefiles)/Makefile.sim"));
							}, (reason) => { return Promise.resolve(false) });

						if (isValidMakefile) {
							this.mkfileList.push(targetPath);
							ret.push(targetPath);
						}
					}
				}
			}
		}

		if (next_targets.length > 0)
			await this.findAllMakefiles(next_targets);
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


		// return Promise.resolve(assertEquals<TestDiscoveryResults>(JSON.parse(
		// 	await workspace.fs.readFile(outputFile).then((data) => {
		// 		return new TextDecoder().decode(data);
		// 	})
		// )))
		return Promise.resolve(JSON.parse(
			await workspace.fs.readFile(outputFile).then((data) => {
				return new TextDecoder().decode(data);
			})) as TestDiscoveryResults);
	}

	protected testsFromDiscoveryResults(discovery : TestDiscoveryResults) {

		const testSuiteId = discovery.makefile;
		const makefileUri = Uri.file(discovery.makefile);
		this.discoveryMap[testSuiteId] = makefileUri;

		let testsuite = this.controller.createTestItem(testSuiteId, discovery.testsuite, Uri.file(testSuiteId))
		testsuite.canResolveChildren = true;

		this.controller.items.add(testsuite)

		for (let testInfos of discovery.tests) {
			const testId: string = `${testsuite}:${testInfos.name}`;
			this.discoveryMap[testId] = makefileUri;
			let test = this.controller.createTestItem(testId,testInfos.name,Uri.file(testInfos.file));
			test.range = new Range(
				testInfos.startLine,
				0,
				testInfos.lastLine,
				testInfos.lastChar
			);

			if (testInfos.comment)
				test.description = testInfos.comment.split("\n")[0];	
			
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

		// Do NOT replace [^\n] by dot.
		
		let testlist: TestItem[] = []
		
		let xmlParser = new XMLParser({ignoreAttributes : false});

		if(request.include) {
			request.include.forEach(test => request.exclude?.includes(test) ? null : testlist.push(test));
		}

		let testsuites: { [key: string]: string[] } = {};
		let testErrors: { [key: string]: string[] } = {};
		let testmap: { [key: string]: TestItem } = {}

		testlist.forEach(test => { testmap[test.parent === undefined ? test.id : test.label] = test; });

		let numberOfTests: number = testlist.length;

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
			let requestedTestNames: string[] = [];
			let effectiveTestsNames: string[] = [];

			let execEnv = process.env
			execEnv.COCOTB_ANSI_OUTPUT = "1"

			if(testsuites[runSuite].length > 0) {
				execEnv.TESTCASE = testsuites[runSuite].join(",");
				requestedTestNames = testsuites[runSuite];
			} else {
				delete execEnv.TESTCASE;
				requestedTestNames = [runSuite];
			}

			effectiveTestsNames = requestedTestNames;

			if (Object.keys(testmap).includes(runSuite) && testmap[runSuite].parent === undefined) {
				effectiveTestsNames = []
				testmap[runSuite].children.forEach((item) => {
					effectiveTestsNames.push(item.label)
					testsuites[runSuite].push(item.label);
					testmap[item.label] = item;
				});

			}
			
			let execOptions = {"env":execEnv, cwd : path.dirname(runSuite)};
			console.log(`Start runner for ${runSuite} at ${path.dirname(runSuite)}`);
			let runner = spawn("make", execOptions);
			var runningTest: TestItem | undefined = undefined;
			token.onCancellationRequested(() => {
				console.log("Request to kill the runner.")
				if (runner.connected)
					runner.kill();
			});

			runner.stderr.on("data", (data) => {
				run.appendOutput(data,undefined,runningTest);
			});
			
			var testData: string[] = [];
			var leftoverDataToPrint: string | undefined = "";

			runner.stdout.on("data", (data) => {
				let toPrint: string[] = data.toString().split("\n");

				const cocotbNextTestRegex = new RegExp(/[^\n]+cocotb\.regression\s+[^\n]*running[^\n]* (\w+) /, "g");
				const cocotbErrorMsgRegex = new RegExp(/\s*(?:-\.--|\d+\.\d+)\ws\s+\S*(?:ERROR|FATAL)/, "g");
				let regexResult;

				for (let line of toPrint.slice(0,-1))
				{
					// Adds leftover data, if relevant.
					// As the last line should be an empty string (if the whole text ends with \n)
					// leftoverDataToPrint should be empty if all data has been handled properly.
					if (leftoverDataToPrint && leftoverDataToPrint != "")
					{
						line = leftoverDataToPrint + line;
						leftoverDataToPrint = "";
					}	

					// If we start a new test section
					if ((regexResult = cocotbNextTestRegex.exec(line)) !== null)
					{
						runningTest = testmap[regexResult[1]];
						console.log(`Switching to ${regexResult[1]}`);
					}

					
					if (runningTest && cocotbErrorMsgRegex.test(line))
					{
						console.log(`Adding error to test id ${runningTest.id}`);
						if (! Object.keys(testErrors).includes(runningTest.id))
							testErrors[runningTest.id] = []
						testErrors[runningTest.id].push(line);
					}
					
					run.appendOutput(`${line}\r\n`, undefined, runningTest);	
				}

				leftoverDataToPrint = toPrint.at(-1);

			});

			runner.on("error", (err) => { console.log(err); });

			let runnerDone = new Promise((resolve) => {
				runner.on("close", resolve);
				runner.on("error", resolve);
			});
			
			await runnerDone; 

			if (runner.exitCode != 0) {
				effectiveTestsNames.forEach((tname) => { run.failed(testmap[tname],new TestMessage(`Failed with exit code ${runner.exitCode}`)) });	
			}
			else {
				let resultUri = Uri.file(path.join(execOptions.cwd, "results.xml"));
				let resultBuffer = await workspace.fs.readFile(resultUri);
				let resultText = new TextDecoder().decode(resultBuffer);
				let resultObj = xmlParser.parse(resultText);

				// Pass everything, we'll come to this later. 
				let isPassed = true;

				if (effectiveTestsNames.length == 1) {
					isPassed = false;
					let currTestName = effectiveTestsNames[0];
					let currTest = testmap[currTestName];
					
					if (resultObj?.testsuites?.testsuite?.testcase)
						if (resultObj.testsuites.testsuite.testcase["@_name"] == currTestName)
							if (resultObj.testsuites.testsuite.testcase.failure === undefined) {
								run.passed(currTest);
								isPassed = true
							}
							else
							{
								if (Object.keys(testErrors).includes(currTest.id))
									run.failed(currTest, new TestMessage("Test failed.\n" + testErrors[currTest.id].join("\n")));
								else
									run.failed(currTest, new TestMessage("Test failed"));
							}
						else
							run.errored(currTest, new TestMessage("Test missing from results"));
					else
						run.errored(currTest, new TestMessage("Malformed results.xml"));							
				}
				else {
					
					if (resultObj?.testsuites?.testsuite?.testcase)
					{
						resultObj.testsuites.testsuite.testcase.forEach((element: any) => {
							if (Object.keys(testmap).includes(element["@_name"])) {
								let currTest = testmap[element["@_name"]];
								if (!element.failure)
									run.passed(testmap[element["@_name"]]);
								else {
									
									if (Object.keys(testErrors).includes(currTest.id))
										run.failed(currTest,new TestMessage("Test failed.\n" + testErrors[currTest.id].join("\n")));
									else
										run.failed(currTest, new TestMessage("Test failed"));
								}
								//run.failed(testmap[element["@_name"]], new TestMessage("Test failed"));
							}
						});
					}
					else
						effectiveTestsNames.forEach((tname) => { run.errored(testmap[tname], new TestMessage("Malformed results.xml")) });
				}
				// console.log(resultObj);
			}
		}

		run.end();

		let reloadMode = vscode.workspace.getConfiguration("diplomat.waveformViewer").get<string>("reloadOnTestEnd");

		if (reloadMode == "always")
		{
			vscode.commands.executeCommand("diplomat-host.waves.reload");
		}
		else if (reloadMode == "onSingle" && numberOfTests == 1)
		{
			vscode.commands.executeCommand("diplomat-host.waves.reload");
		}
		// numberOfTests

	}
