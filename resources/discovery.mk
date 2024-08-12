# Usage:
# $cd emplacement of test
# set in the env (or for the make call) Target, ODIR, OFILE
# $ make -f discover.mk discovery
.PHONY: discovery discodbg

LOCAL_PWD=$(dir $(realpath $(firstword $(MAKEFILE_LIST))))
# $(info LIST = $(MAKEFILE_LIST))
# $(info PWD = $(LOCAL_PWD))

DISCO_SCRIPT ?= $(LOCAL_PWD)/cocotb_discovery.py
TARGET ?= Makefile

ODIR ?=.
OFILE ?=cocotb_discovery.json

discovery:
	MODULE=$(MODULE) python3 $(DISCO_SCRIPT) -o $(ODIR) -f $(OFILE) --mk $(TARGET)

discodbg:
	MODULE=$(MODULE) python3 $(DISCO_SCRIPT) --mk $(TARGET)

include ./$(TARGET)
