---
description: Walk through a scenario across multiple pages and record or update Page Object Model classes for every page encountered.
allowed-tools: MCP(brow-use/get_accessibility_tree), MCP(brow-use/navigate), MCP(brow-use/click), MCP(brow-use/type), MCP(brow-use/write_page_object)
---

Read the `apps://current` resource to get the active app's URL and description.
If no app is set, tell the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.

Ask the user to describe the scenario they want to walk through before doing anything else.

Execute the scenario step by step. For every page reached during the scenario:

1. Call `get_accessibility_tree` to discover all interactive elements and landmarks
2. Check if a page object file already exists in `output/page/` for this page:
   - If it does not exist, create it using `write_page_object`
   - If it exists, read it and add only the elements not already present, then overwrite it using `write_page_object`
4. Page object conventions:
   - Class name: PascalCase page name + "Page" (e.g. `LoginPage`)
   - File name: kebab-case + "-page" (e.g. `login-page`)
   - Constructor accepts `Page` from `@playwright/test`
   - One `readonly` locator property per meaningful interactive element, using accessible selectors (role, label, placeholder) over CSS
   - One async method per distinct user action on the page
   - Methods return `void` or the next page object if navigation occurs
5. Continue executing the scenario — navigate, click, type as needed — then repeat from step 1 for each new page

After the scenario completes, summarise all page object files created or updated.
