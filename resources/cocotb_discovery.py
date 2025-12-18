from cocotb import RegressionManager
import argparse
import sys
import os
import json

import inspect

parser = argparse.ArgumentParser("Cocotb Test Discovery")

parser.add_argument("--mk",default="Makefile",help="Makefile path")
parser.add_argument("--output","-o",default=".",help="Output folder")
parser.add_argument("--file","-f",default=None,help="Output filename")

args = parser.parse_args()

sys.path.append(os.getcwd())

def get_recursive_wrapped(fct) :
	ret = fct
	while hasattr(ret,"__wrapped__") :
		ret = ret.__wrapped__

	return ret

def testinfo(test) :
	orig_fct = get_recursive_wrapped(test._func)
	sourcelines, start_line = inspect.getsourcelines(orig_fct)
	return {
		"name":test.name,
		"file":inspect.getsourcefile(orig_fct),
		"comment" : orig_fct.__doc__.strip() if orig_fct.__doc__ is not None else None,
		"startLine": start_line,
		"lastLine" : start_line + len(sourcelines),
		"lastChar" : len(sourcelines[-1])
	}

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

testinfo_list = list()


for test in testlist :
	testinfo_list.append(testinfo(test))
	# curr_stage = int(test.stage)

	# if curr_stage not in stages:
	# 	stages[curr_stage] = [testinfo(test)]
	# else :
	# 	stages[curr_stage].append(testinfo(test))


output["tests"] = testinfo_list
	
if args.file is None :
	print(json.dumps(output, indent=2))
else :
	with open(f"{args.output}/{args.file}","w") as mfile :
		json.dump(output,mfile)

