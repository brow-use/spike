---
description: Walk through a scenario across multiple pages and record or update Page Object Model classes for every page encountered.
allowed-tools: MCP(bu/get_accessibility_tree), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/write_page_object)
---

Read the `apps://current` resource from MCP server `plugin:bu:bu` to get the active app's URL and description.
If no app is set, tell the user to run `/bu:create-app` and `/bu:set-current-app` first.

Ask the user to describe the scenario they want to walk through before doing anything else.

## Pass 1 — Discovery (do not write any files)

Walk the entire scenario from start to finish. For every page reached:
1. Call `get_accessibility_tree` to inspect the page
2. Record the following in a working name map (keep in memory only):
   - Page URL or route
   - Assigned class name: PascalCase + "Page" (e.g. `LoginPage`)
   - Assigned file name: kebab-case + "-page" (e.g. `login-page`)
   - All interactive elements found
   - Which actions navigate to which other page (use the class name from the map)
3. Continue — navigate, click, type — until the full scenario is complete

Do not call `write_page_object` during this pass.

## Pass 2 — Generation (write all files with full name map available)

With the complete name map from Pass 1, generate each page object. For every page in the map:
1. Check if a file already exists in `output/page/` for this page:
   - If it does not exist, create it using `write_page_object`
   - If it exists, read it and add only elements not already present, then overwrite using `write_page_object`
2. Page object conventions:
   - Constructor accepts `Page` from `@playwright/test`
   - One `readonly` locator property per meaningful interactive element, using accessible selectors (role, label, placeholder) over CSS
   - One async method per distinct user action on the page
   - Methods that navigate return the correct next page object type — use the class names from the name map
   - Import all referenced page classes from their correct file names in the same directory

After all files are written, summarise what was created or updated.
