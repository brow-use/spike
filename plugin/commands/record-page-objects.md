---
disable-model-invocation: true
description: Walk through a scenario across multiple pages and record or update Page Object Model classes for every page encountered.
allowed-tools: Read, Glob, MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/enumerate_interactive_elements), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/write_page_object), MCP(bu/read_pom_summary), MCP(bu/clear_session)
---

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy`, then stop. Do not proceed.

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's URL and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first.

Ask the user if they want to clear the browser session (cookies, localStorage, sessionStorage) before starting. If yes, call `clear_session`.

Ask the user to describe the scenario they want to walk through before doing anything else.

## Pass 1 — Discovery (do not write any files)

Walk the entire scenario from start to finish. For every page reached:
1. Call `enumerate_interactive_elements` with `includeDestructive: true` — this returns a structured list of `{role, name, url?, depth, selector, destructive?}` for every interactive element on the page, already parsed. You want destructive elements visible in Pass 1 because they need to live in the generated POM as locators/methods (they won't be invoked by the agent — they are recorded for future use). Call `get_accessibility_tree` only if you need context beyond the interactive elements (e.g. headings, text content) to decide what the page IS.
2. Record the following in a working name map (keep in memory only):
   - Page URL or route
   - Assigned class name: PascalCase + "Page" (e.g. `LoginPage`)
   - Assigned file name: kebab-case + "-page" (e.g. `login-page`)
   - Each interactive element from the enumeration (use its `name`, `role`, `selector` verbatim)
   - Which actions navigate to which other page (use the class name from the map)
3. Continue — navigate, click, type — until the full scenario is complete. Do NOT click elements marked `destructive: true`; they are for recording only. If the scenario genuinely requires a destructive click, pause and ask the user.

Do not call `write_page_object` during this pass.

## Pass 2 — Generation (write all files with full name map available)

Before writing anything, list all files in `output/page/` using `Glob`. For each file found, call `read_pom_summary` with its path — this returns `{className, locators: [{name, selectorHint}], methods, urlHints, siblingImports}` without pulling the full file text into context. Use these summaries to decide whether each file covers a page in your name map.

With the complete name map from Pass 1, generate each page object. For every page in the map:
1. Determine whether an existing file covers the same page:
   - Exact match: a file named `<file-name>.ts` already exists
   - Likely match: a file with a different name appears to cover the same page based on its class name, URL, or elements — ask the user to confirm before treating it as a match
   - No match: no existing file is related — create a new one
2. On confirmed match (exact or user-confirmed):
   - Merge — add only elements not already present, then overwrite using `write_page_object`
3. On no match:
   - Create it using `write_page_object`
2. Page object conventions:
   - Constructor accepts `Page` from `@playwright/test`
   - One `readonly` locator property per meaningful interactive element, using accessible selectors (role, label, placeholder) over CSS
   - One async method per distinct user action on the page
   - Methods that navigate return the correct next page object type — use the class names from the name map
   - Import all referenced page classes from their correct file names in the same directory

After all files are written, summarise what was created or updated.
