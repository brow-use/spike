---
disable-model-invocation: true
description: Run the user's intention in the browser using whichever execution mode is currently active. The run is recorded (Playwright trace + per-step aria-tree log + runs.json entry) so it is forensically reviewable afterwards.
allowed-tools: Read, MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/page_fingerprint), MCP(bu/write_exploration_log), MCP(bu/record_run), MCP(bu/log_reasoning)
---

## Preflight

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy`, then stop. Do not proceed.

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's `url` and `description`.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first and stop.

## Session setup

Before asking the user for their intent:

1. Derive `sessionId = "run-<UNIX-millis>"` once.
2. Call `start_trace`.
3. Initialize an in-memory `visited` array and `stepCounter = 0`.

## Ask

Ask the user what they want to do in the browser if they haven't already stated it.

After they answer, call `log_reasoning` once with `kind: "plan"` carrying a one- to two-sentence plan narration (same text you would say to the user).

## Execution loop

Use `get_accessibility_tree` to understand the current state of the page before each interaction.
If `get_accessibility_tree` does not provide enough information to proceed, fall back to `snapshot`.

Carry out the user's intention step by step using `navigate`, `click`, and `type` as needed.
After each significant action, call `get_accessibility_tree` to verify the outcome before proceeding.

### Per-step capture

After each successful action that lands on a new page state:

1. Call `page_fingerprint`. Parse the returned JSON; keep `{phash, ariaHash, url, title}`.
2. Use the `ariaTree` text from the verification `get_accessibility_tree` call above — do not call it twice.
3. Append `{stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp}` to `visited`, where:
   - `stepId = String(++stepCounter).padStart(4, '0')`.
   - `ariaSummary` is a one-line description (e.g. "form with Name, Email, Submit").
   - `timestamp` is an ISO string of now.

Do NOT call `compare_fingerprint`. The user's intent drives progression; duplicates are fine to record.

### Reasoning log (sparingly)

Call `log_reasoning` with the run's `sessionId` only at non-obvious decision points:

- `kind: "decision"` — only when you make a judgment call a reader could not recover from the trace + aria log alone (e.g., choosing between two plausible paths to fulfil the intent).
- `kind: "error"` — on any unrecoverable error (extension disconnect, repeated action failure, trace stop failure).

Do NOT call on every step.

## Completion

When the intention is complete:

1. Call `log_reasoning` once with `kind: "observation"` summarizing the outcome.
2. Call `stop_trace` with `name = sessionId`. Keep the returned `tracePath`.
3. Call `write_exploration_log` with `sessionId` and `entries = visited`. Get back the `ariaLog` path. Do NOT hand-write the jsonl via the `Write` tool.
4. Call `record_run` with:
   - `sessionId`
   - `command: "run"`
   - `startedAt` — ISO timestamp derived from the unix-ms portion of `sessionId`.
   - `endedAt` — ISO timestamp of now.
   - `appId` — `currentAppId` from `.brow-use/apps.json`.
   - `mode` — `"crx"` or `"playwright"` from `health_check`'s `mode`.
   - `artifacts: { tracePath, ariaLog }`.
   - `intent` — the plain-text user intent.
5. Confirm to the user in one sentence: what was accomplished + the trace path + aria-log path.
