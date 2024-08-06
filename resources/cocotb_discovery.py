from cocotb import RegressionManager
import argparse
import sys
import os
import json

parser = argparse.ArgumentParser("Cocotb Test Discovery")

parser.add_argument("--mk",default="Makefile",help="Makefile path")
parser.add_argument("--output","-o",default=".",help="Output folder")
parser.add_argument("--file","-f",default=None,help="Output filename")

args = parser.parse_args()

sys.path.append(os.getcwd())

# print(f"Lookup in {os.getcwd()}")
testlist = RegressionManager._discover_tests()
output = dict()
output = {
	"testsuite" : os.environ["MODULE"],
	"kind" : "cocotb",
	"location" : os.path.abspath(os.getcwd()),
	"makefile" : args.mk,
	"tests" : list()
}

stages = dict()

for test in testlist :
	curr_stage = int(test.stage)
	if curr_stage not in stages:
		stages[curr_stage] = [test.name]
	else :
		stages[curr_stage].append(test.name)


output["tests"] = stages
	
if args.file is None :
	print(json.dumps(output, indent=2))
else :
	with open(f"{args.output}/{args.file}","w") as mfile :
		json.dump(output,mfile)

