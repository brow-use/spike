---
description: Record a reusable workflow function for the current app. Performs the steps live in the browser with tracing, then writes a TypeScript async function.
allowed-tools: MCP(brow-use/get_accessibility_tree), MCP(brow-use/snapshot), MCP(brow-use/navigate), MCP(brow-use/click), MCP(brow-use/type), MCP(brow-use/start_trace), MCP(brow-use/stop_trace), MCP(brow-use/write_workflow)
argument-hint: [workflow-name]
---

Read the `apps://current` resource to get the active app's URL and description.
If no app is set, tell the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.

The workflow to record is: $ARGUMENTS

1. Call `start_trace` to begin recording
2. Navigate to the starting page of the workflow
3. Perform each step using `click`, `type`, and `navigate` — call `get_accessibility_tree` before each interaction to get fresh selectors, and `snapshot` after significant state changes
4. Call `stop_trace` with the workflow name when all steps are complete
5. Write a TypeScript workflow function using `write_workflow`:
   - File name: kebab-case of the workflow name (e.g. `checkout-workflow`)
   - Export a single `async function` named in camelCase (e.g. `checkoutWorkflow`)
   - First parameter: `page: Page` from `@playwright/test`
   - Additional parameters for any variable inputs used during recording (e.g. credentials, item names)
   - Import and use Page Object classes from `../page/` for any pages involved
   - The function should be self-contained and replayable

After writing, confirm the file path and summarise the steps recorded.
