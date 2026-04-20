PLUGIN_DIR := /Users/viveksingh/projects/brow-use/spike

.PHONY: build install reinstall list dev-mcp

build:
	npm run build

install: build
	claude plugin marketplace add $(PLUGIN_DIR)
	claude plugin install bu

reinstall: build
	claude plugin uninstall bu
	claude plugin install bu

list:
	claude plugin list
	claude plugin marketplace list

dev-mcp:
	npx tsx mcp/index.ts