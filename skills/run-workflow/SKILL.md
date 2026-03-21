---
description: Run an existing workflow for the current app without recording. Executes the steps live in the browser.
allowed-tools: MCP(brow-use/get_accessibility_tree), MCP(brow-use/snapshot), MCP(brow-use/navigate), MCP(brow-use/click), MCP(brow-use/type)
argument-hint: [workflow-name]
---

Read the `apps://current` resource to get the active app's URL and description.
If no app is set, tell the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.

The workflow to run is: $ARGUMENTS

1. Read the workflow file from `output/workflow/` matching the workflow name
2. Follow the steps defined in the workflow function:
   - Navigate to the starting URL
   - Use `get_accessibility_tree` before each interaction to get current selectors
   - Use `click` and `type` to perform actions
   - Use `snapshot` after significant state changes to verify progress
3. Report the outcome: success with a final snapshot, or the step where it failed and why

Do not use `start_trace` or `stop_trace` — this is an execution run, not a recording.
