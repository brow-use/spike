---
disable-model-invocation: true
description: Run an existing workflow for the current app without recording. Executes the steps live in the browser.
allowed-tools: MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type)
---

Read the `apps://current` resource from MCP server `plugin:bu:bu` to get the active app's URL and description.
If no app is set, tell the user to run `/bu:create-app` and `/bu:set-current-app` first.

List available workflows from `output/workflow/` and ask the user which one to run.

1. Read the selected workflow file from `output/workflow/`
2. Follow the steps defined in the workflow function:
   - Navigate to the starting URL
   - Use `get_accessibility_tree` before each interaction to get current selectors
   - Use `click` and `type` to perform actions
   - Use `snapshot` after significant state changes to verify progress
3. Report the outcome: success with a final snapshot, or the step where it failed and why

Do not use `start_trace` or `stop_trace` — this is an execution run, not a recording.
