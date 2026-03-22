PLUGIN_DIR := /Users/viveksingh/projects/brow-use/spike

.PHONY: build install reinstall list

build:
	npm run build

install: build
	claude plugin marketplace add $(PLUGIN_DIR)
	claude plugin install brow-use

reinstall: build
	claude plugin uninstall brow-use
	claude plugin install brow-use

list:
	claude plugin list
	claude plugin marketplace list