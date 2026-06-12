PLUGIN_DIR := /Users/viveksingh/projects/brow-use/spike
EXT_VERSION := $(shell node -p "require('./extension/manifest.json').version")
EXT_ZIP := dist/brow-use-extension-$(EXT_VERSION).zip

.DEFAULT_GOAL := help

.PHONY: help build package-extension install reinstall install-local list dev-mcp extract

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nUsage:\n  make \033[36m<target>\033[0m\n"} \
		/^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5); next } \
		/^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""

##@ Build
build: ## Build everything (MCP server + Chrome extension)
	npm run build

package-extension: build ## Zip the built extension into a distributable (dist/brow-use-extension-<version>.zip)
	rm -f $(EXT_ZIP)
	cd dist/extension && zip -r -FS ../brow-use-extension-$(EXT_VERSION).zip . -x '*.DS_Store'
	@echo "Wrote $(EXT_ZIP)"

##@ Install
install: build ## Add this repo as a marketplace and install the bu plugin
	claude plugin marketplace add $(PLUGIN_DIR)
	claude plugin install bu

reinstall: build ## Rebuild, then uninstall and reinstall the bu plugin
	claude plugin uninstall bu
	claude plugin install bu

# Copy the plugin into a target project — no reference back to this repo.
# Usage: make install-local PROJECT=<absolute-or-relative path to consuming project>
install-local: build ## Copy the plugin into a consuming project (PROJECT=<path>)
ifndef PROJECT
	$(error PROJECT is required — e.g. make install-local PROJECT=../my-app)
endif
	npx tsx scripts/install-local.ts $(PROJECT)

##@ Dev
dev-mcp: ## Run the MCP server directly from source (bypasses installed plugin)
	npx tsx mcp/index.ts

list: ## List installed plugins and configured marketplaces
	claude plugin list
	claude plugin marketplace list

##@ Artifacts
# Post-process a completed /bu:explore or /bu:run trace into the downstream
# artifacts (aria-tree log + per-step screenshots + action sidecar) that
# /bu:document, /bu:generate-page-objects, /bu:do, and the viewer consume.
#
# Usage:  make extract SESSION=<sessionId>
#                 e.g. make extract SESSION=explore-1745385600000
#         make extract SESSION=<sessionId> TRACE=<path>    # explicit trace zip
extract: ## Extract a trace into downstream artifacts (SESSION=<id> [TRACE=<path>])
ifndef SESSION
	$(error SESSION is required — e.g. make extract SESSION=explore-1745385600000)
endif
	npx tsx scripts/extract-trace.ts $(SESSION) $(if $(TRACE),--trace=$(TRACE))
