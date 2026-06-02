---
disable-model-invocation: true
description: Execute a user-described intention in the browser with a recording. No prior explore run needed — the agent navigates live, carries out the task, and leaves behind a Playwright trace and aria log.
allowed-tools: Read, MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/page_fingerprint), MCP(bu/record_run), MCP(bu/log_reasoning)
---

## Preflight: confirm URL and mode

1. Read `.brow-use/config.json` with the Read tool. Look at `currentMode`. If it is null, tell the user: "No mode is set. Run `/bu:use-managed-browser` (fresh Chromium) or `/bu:use-session` (your logged-in Chrome)." Stop.
2. Get the target URL: if the user has already stated one, use it. Otherwise ask: "What URL should I start from?"
3. Get an app description (optional): if the user has already provided one, use it. Otherwise ask: "Briefly describe the app — or press Enter to skip."
4. Confirm with the user, verbatim: "I'll run against **{url}** in **{currentMode}** mode. Continue or change mode?"
5. If the user says continue, proceed. If they say change mode, run `/bu:use-managed-browser` or `/bu:use-session`. After the mode change, re-confirm before proceeding.
6. Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop.

Keep `url` as the navigation entry point. Use the description to inform element identification and workflow choices if provided.

## Session setup

Before asking the user for their intent:

1. Derive `sessionId = "explore-guided-<UNIX-millis>"` once.
2. Call `start_trace`.

The trace is the source of truth. You do NOT need to maintain an in-memory `visited` array, compute fingerprints, or save per-step screenshots during execution — the trace captures every `get_accessibility_tree` call, every navigation, and a screencast. Downstream artifacts (aria-tree log, per-step screenshots) are produced by the shell command `make extract SESSION=<sessionId>` afterwards, not by this command.

## Ask

Ask the user what they want to do in the browser if they haven't already stated it.

After they answer, call `log_reasoning` once with `kind: "plan"` carrying a one- to two-sentence plan narration (same text you would say to the user).

## Execution loop

Use `get_accessibility_tree` to understand the current state of the page before each interaction.
If `get_accessibility_tree` does not provide enough information to proceed, fall back to `snapshot`.

Carry out the user's intention step by step using `navigate`, `click`, and `type` as needed.
After each significant action, call `get_accessibility_tree` to verify the outcome before proceeding.

### Per-step capture

No explicit per-step capture is required. The `get_accessibility_tree` call you already make to verify the outcome is recorded inside the trace as an `ariaSnapshot` event, and Playwright's trace screencast captures the visual state. `make extract SESSION=<sessionId>` turns those into the aria log and `page-<stepId>.{jpg,png}` files at the end.

Do NOT call `page_fingerprint` or `compare_fingerprint` — this command is intent-driven, not loop-driven. Duplicates are fine; the aria-log dedup happens at extraction time.

### Reasoning log (sparingly)

Call `log_reasoning` with the run's `sessionId` only at non-obvious decision points:

- `kind: "decision"` — only when you make a judgment call a reader could not recover from the trace + aria log alone (e.g., choosing between two plausible paths to fulfil the intent).
- `kind: "error"` — on any unrecoverable error (extension disconnect, repeated action failure, trace stop failure).

Do NOT call on every step.

## Completion

When the intention is complete:

1. Call `log_reasoning` once with `kind: "observation"` summarizing the outcome.
2. Call `stop_trace` with `name = sessionId`. Keep the returned `tracePath`.
3. Call `record_run` with:
   - `sessionId`
   - `command: "explore-guided"`
   - `startedAt` — ISO timestamp derived from the unix-ms portion of `sessionId`.
   - `endedAt` — ISO timestamp of now.
   - `url` — the URL this run started from.
   - `mode` — `"crx"` or `"playwright"` from `health_check`'s `mode`.
   - `artifacts: { tracePath, ariaLog: "output/exploration/<sessionId>.jsonl" }`. The `ariaLog` path is predictable but the file will not exist until the user runs `make extract SESSION=<sessionId>`.
   - `intent` — the plain-text user intent.
4. Confirm to the user in one sentence what was accomplished and give the trace path. Then instruct them: `make extract SESSION=<sessionId>` produces the aria-tree log and per-step screenshots from the trace.
