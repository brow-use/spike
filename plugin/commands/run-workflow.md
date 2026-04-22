---
disable-model-invocation: true
description: Run an existing workflow for the current app without recording. Executes the steps live in the browser.
allowed-tools: Read, MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type)
---

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy`, then stop. Do not proceed.

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's URL and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first.

List available workflows from `output/workflow/` and ask the user which one to run.

1. Read the selected workflow file from `output/workflow/`
2. Follow the steps defined in the workflow function:
   - Navigate to the starting URL
   - Use `get_accessibility_tree` before each interaction to get current selectors
   - Use `click` and `type` to perform actions
   - Use `snapshot` after significant state changes to verify progress
3. Report the outcome: success with a final snapshot, or the step where it failed and why

Do not use `start_trace` or `stop_trace` — this is an execution run, not a recording.
