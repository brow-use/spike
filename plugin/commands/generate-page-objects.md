---
disable-model-invocation: true
description: Generate Playwright Page Object Model classes from the aria-tree log of an explore run. No browser required — works entirely from the captured exploration data.
allowed-tools: Read, Glob, MCP(bu/read_pom_summary), MCP(bu/write_page_object)
---

## Preflight

Read `.brow-use/runs.json`. Filter entries where `command === "explore"`. If no such entries exist, tell the user to run `/bu:explore` first and stop.

List the available runs to the user as a table with columns: index, sessionId, date (from `startedAt`), pages visited, termination reason.

Ask the user to pick one by index or sessionId. Wait for their answer before proceeding.

## Resolution

From the chosen run entry read:
- `artifacts.ariaLog` — required. If the key is missing or the file does not exist on disk, tell the user and stop.
- `appId` and `mode` — carry forward for `record_run`.

Read the aria log file. Each line is a JSON object: `{ stepId, url, title, ariaSummary, ariaTree, timestamp }`. Parse all lines into a working array `pages`.

## Deduplication

Group `pages` by URL. When the same URL appears more than once keep the entry with the longest `ariaTree`. Result: a deduplicated map of `url → page`.

## Pass 1 — Name map (in memory only, no files written)

For each unique page derive:

**Class name** — PascalCase from the URL path + "Page":
- Take the last two non-empty path segments; join with a space; PascalCase each word; append "Page".
- If the path is `/` or empty, use the page `title` instead.
- Examples: `/search/results` → `SearchResultsPage`, `/` with title "Home" → `HomePage`, `/admin/users/edit` → `UsersEditPage`.

**File name** — kebab-case of the class name: `SearchResultsPage` → `search-results-page`.

**Elements** — parse the `ariaTree` text. Collect every item whose role is one of: `button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `menuitem`, `tab`, `searchbox`. For each record `{ role, name }`. Discard items with an empty name or a name that is a single character.

**Navigation edges** — for each `link` element whose URL matches another page in the map, record the target class name as the return type of the navigation method for that link.

## Pass 2 — Generation

Before writing anything, list all files in `output/page/` using `Glob`. For each file found call `read_pom_summary` — returns `{ className, locators, methods, urlHints, siblingImports }`. Build a summary map keyed by file path.

For each page in the name map:

1. Determine whether an existing file covers this page:
   - **Exact match**: a file named `<file-name>.ts` already exists.
   - **Likely match**: a file with a different name has a `className` or `urlHints` entry that matches — ask the user to confirm before treating it as a match.
   - **No match**: no existing file is related.

2. On confirmed match (exact or user-confirmed): merge — add only locators and methods whose name is not already present in the summary, then overwrite using `write_page_object`.

3. On no match: create a new file using `write_page_object`. Follow these conventions:
   - Constructor accepts `Page` from `@playwright/test`.
   - One `readonly` locator property per element using accessible selectors (`getByRole`, `getByLabel`, `getByPlaceholder`). Avoid CSS selectors.
   - One `async` method per distinct user action (submit a form, trigger a primary action, navigate away).
   - Methods that navigate to another known page return the correct next page object type from the name map.
   - Import all referenced page classes from their file names in the same `output/page/` directory.
   - Include a `goto()` method if the page has a stable, non-parameterised URL.

After all files are written, tell the user: how many files were created, how many were updated, and list their paths.
