---
disable-model-invocation: true
description: Record a reusable workflow function for the current app. Performs the steps live in the browser with tracing, then writes a TypeScript async function.
allowed-tools: Read, MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/write_workflow), MCP(bu/record_run)
---

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy`, then stop. Do not proceed.

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's URL and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first.

Derive `sessionId = "record-wf-<UNIX-millis>"` once. Note the current ISO timestamp as `startedAt`.

Ask the user what workflow they want to record before doing anything else.

1. Call `start_trace` to begin recording
2. Navigate to the starting page of the workflow
3. Perform each step using `click`, `type`, and `navigate` — call `get_accessibility_tree` before each interaction to get fresh selectors. If `get_accessibility_tree` does not provide enough information to proceed, ask the user whether to fall back to `snapshot` (screenshot) before calling it
4. Call `stop_trace` with `name = sessionId` (not the workflow name) so the trace zip lands at `output/trace/<sessionId>-<ts>.zip`. Note the returned path.
5. Write a TypeScript workflow function using `write_workflow`:
   - File name: kebab-case of the workflow name (e.g. `checkout-workflow`)
   - Export a single `async function` named in camelCase (e.g. `checkoutWorkflow`)
   - First parameter: `page: Page` from `@playwright/test`
   - Additional parameters for any variable inputs used during recording (e.g. credentials, item names)
   - Import and use Page Object classes from `../page/` for any pages involved
   - Only use methods that exist on the imported page objects — list all files in `output/page/` and read each one before writing
   - If a required action has no matching method on the relevant page object, ask the user how to proceed before writing the function
   - The function should be self-contained and replayable

After writing, confirm the file path and summarise the steps recorded.

## Record the run

At the very end, call `record_run` to register this run in `.brow-use/runs.json`:

- `sessionId` — the `record-wf-<unix-ms>` you derived up-front.
- `command: "record-workflow"`.
- `startedAt`, `endedAt` — ISO timestamps.
- `appId` — `currentAppId` from `.brow-use/apps.json`.
- `mode` — `"crx"` or `"playwright"`, whichever was active.
- `workflowName` — the camelCase function name.
- `workflowPath` — the full path returned by `write_workflow`.
- `inputs` — array of declared parameter names beyond `page` (e.g. `["username", "password"]`).
- `artifacts` — `{tracePath: "<path from stop_trace>", workflowPath: "<same as above>"}`.

Call `record_run` regardless of outcome.
