PLUGIN_DIR := /Users/viveksingh/projects/brow-use/spike

.PHONY: build install reinstall list dev-mcp extract

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

# Post-process a completed /bu:explore or /bu:run trace into the downstream
# artifacts (aria-tree log + per-step screenshots + action sidecar) that
# /bu:document, /bu:generate-page-objects, /bu:do, and the viewer consume.
#
# Usage:  make extract SESSION=<sessionId>
#                 e.g. make extract SESSION=explore-1745385600000
#         make extract SESSION=<sessionId> TRACE=<path>    # explicit trace zip
extract:
ifndef SESSION
	$(error SESSION is required — e.g. make extract SESSION=explore-1745385600000)
endif
	npx tsx scripts/extract-trace.ts $(SESSION) $(if $(TRACE),--trace=$(TRACE))