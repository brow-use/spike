---
description: Run a small action in the browser and investigate something about it. The user provides what to run and what to investigate; the agent picks the investigation method. No prior run knowledge is used.
allowed-tools: Read, Write, MCP(bu/health_check), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/enumerate_interactive_elements), MCP(bu/save_screenshot), MCP(bu/page_fingerprint), MCP(bu/list_tabs), MCP(bu/select_tab), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/record_run), MCP(bu/log_reasoning)
---

## Pre-supplied inputs (composable invocation)

This command can be driven interactively by a human, OR called as a sub-step from another slash command with pre-supplied inputs.

Before doing anything else, scan `$ARGUMENTS` for a JSON object (it may appear anywhere in the user's message; if a JSON object is present, the rest of the message is ignored). Supported fields:

- `url` (string) — the URL to run against. Overrides the interactively supplied URL.
- `mode` (string, `"playwright"` or `"crx"`) — overrides `currentMode`.
- `tabHint` (string, crx-only) — matched (case-insensitive substring) against tab title and URL via `list_tabs` + `select_tab`. If no tab matches, the non-interactive flow raises an error; the interactive flow falls through to the currently pinned tab.
- `whatToRun` (string) — the action sequence (same semantics as interactive input #1 below).
- `howToHelp` (string) — the investigation question (same semantics as interactive input #2 below).
- `nonInteractive` (boolean) — when `true`, suppress all user-facing confirmation prompts.

If `$ARGUMENTS` contains no parsable JSON object, treat the command as a fully interactive invocation and follow the original interactive flow below.

If a JSON object is present, use its fields as defaults for the corresponding interactive steps. When `nonInteractive` is true, additional behaviour changes are described below.

## Preflight: confirm URL and mode

### Interactive flow (when `nonInteractive` is not true)

1. Read `.brow-use/config.json` with the Read tool. Determine the effective mode: use `mode` from the JSON if provided, otherwise `currentMode`. If it is null, tell the user: "No mode is set. Run `/bu:use-managed-browser` (fresh Chromium) or `/bu:use-session` (your logged-in Chrome)." Stop.
2. Determine the effective URL: use `url` from the JSON if provided, otherwise ask the user: "What URL should I run against?"
3. Confirm with the user, verbatim: "I'll run against **{url}** in **{effectiveMode}** mode. Continue or change mode?"
4. If the user says continue, proceed. If they say change mode, run `/bu:use-managed-browser` or `/bu:use-session`. After the mode change, re-confirm before proceeding.
5. If the effective mode is `crx`, ask the user: "Use the currently pinned tab, or pick a different one?" If they want to switch, call `list_tabs`, match their input against tab titles and URLs, and call `select_tab` with the chosen id. Confirm the active tab back to them before proceeding.
6. Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop. Do not start a trace.

### Non-interactive flow (when `nonInteractive` is true)

The caller has asked for a clean, prompt-free run. Do not fall back to interactive prompts on any failure — print the specific problem and stop.

1. Read `.brow-use/config.json` with the Read tool. If the file is missing:
   - If `mode` is provided in the JSON input, create `.brow-use/config.json` with `{ "currentMode": "<mode>" }` and continue.
   - If `mode` is not provided, print: "`.brow-use/config.json` not found and no `mode` was supplied. Provide `mode` in the JSON input or run `/bu:use-managed-browser` / `/bu:use-session` first." Stop.
2. Determine the effective URL: prefer `url` from the JSON. If not supplied, print: "Required input `url` was not supplied." Stop.
3. Determine the effective mode: prefer `mode` from the JSON, otherwise `currentMode`. If neither is set, print: "No mode supplied and `currentMode` is null." Stop. If supplied but not `"playwright"` or `"crx"`, print: "Mode `<value>` is invalid; expected `playwright` or `crx`." Stop.
4. Skip the "Continue or change mode?" prompt entirely.
5. If the effective mode is `crx`:
   - Skip the "use the pinned tab, or pick a different one?" prompt.
   - If `tabHint` is provided, call `list_tabs` and pick the first tab whose title or URL contains `tabHint` (case-insensitive); call `select_tab` with that id. If no tab matches, print: "No tab matching `tabHint` value `<tabHint>` was found. Available tabs: <list titles and URLs>." Stop.
   - If `tabHint` is absent, use the currently pinned tab silently.
6. Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop. Do not start a trace.

Keep `url` as the navigation entry point unless the user's instruction specifies otherwise.

## Inputs

Two inputs are required: **what to run** and **how to help with investigation**.

- If both `whatToRun` and `howToHelp` are present in the JSON, use them directly without asking.
- If either is missing and `nonInteractive` is true, print: "Required input `<field>` was not supplied." Stop. Do not fall back to an interactive prompt.
- Otherwise (interactive flow):
  1. **What to run** (required, plain text). The action or short sequence to perform in the browser. For example: *"Click 'Submit' on the contact form after typing 'test' into the name field."* Keep it focused — one feature, one path. Do NOT ask for detailed selectors; the agent decides how to carry it out.
  2. **How to help with investigation** (required, plain text). What the user wants observed, captured, or explained. For example: *"Tell me which elements change state after Submit"*, *"Figure out why the form refuses to submit"*, *"Trace what changes in the DOM when the modal opens"*, *"Identify which field validation is failing"*.

  If the user has stated only one of the two in their original message, ask for the missing piece. Do not infer "how to investigate" from "what to run" — they are distinct.

## No grounding

This command does NOT read `.brow-use/runs.json`, `output/docs/`, `output/page/`, `output/workflow/`, or any prior run's aria log. The investigation is live — derive everything from what you observe in this session. If a prior explore run would have helped, say so in `findings.md` but do not block on it.

## Session setup

1. Derive `sessionId = "investigate-<UNIX-millis>"`.
2. Call `start_trace` with `name = sessionId`.
3. Call `log_reasoning` once with `kind: "plan"` describing — in one or two sentences — how you intend to satisfy the investigation request (what you will capture and when).

## Approach — agent decides

You decide the investigation method based on what the user asked. Pick the smallest set of techniques that will answer them. Examples — not prescriptive, not exhaustive:

- **State-change observation** — call `get_accessibility_tree` before and after each significant step; describe what changed.
- **Visual evidence** — call `save_screenshot` at moments where the difference matters (just before the action, just after, on an error toast).
- **DOM inspection** — call `snapshot` to get the full HTML when the accessibility tree is insufficient (e.g., hidden attributes, data-* values, raw form state).
- **Interactive surface mapping** — call `enumerate_interactive_elements` to see what is clickable/typeable at a step. Useful for "is the button enabled?" or "is the field present?" questions.
- **Page identity** — call `page_fingerprint` to verify the current view, e.g. to confirm a navigation actually happened.

Combine techniques freely. The user is paying for the investigation; do not under-capture. But also do not over-capture — if one screenshot answers the question, one is enough.

## Execution

1. Navigate to the URL most relevant to "what to run". If unclear, start at the app's `url`.
2. Carry out the user's stated action — `navigate`, `click`, `type`, `get_accessibility_tree`, `snapshot` as needed. Use `enumerate_interactive_elements` when picking what to click.
3. Apply your chosen investigation techniques at the moments they help — before, during, and after the action.
4. Call `log_reasoning` with `kind: "decision"` only when you make a non-trivial judgment call (e.g. "I captured a screenshot after step 3 because the toast disappeared too quickly to confirm via aria"). This is an audit trail, not narration.

## Destructive-action policy (hard block)

`enumerate_interactive_elements` strips destructive-action elements (delete, remove, drop, deactivate…) server-side by default. If the user's "what to run" requests a destructive action, refuse at the input-parsing stage:

- Tell the user this command does not perform destructive actions.
- Direct them to perform the action manually in the browser; the agent can still investigate the surrounding state if they ask.
- Do not call `start_trace`.

Investigation alone (without a destructive action) is fine — observing a delete confirmation dialog without clicking through it is allowed.

## Runaway guard

Maintain `stepCount` across browser-interaction calls (`navigate`, `click`, `type`, `get_accessibility_tree`, `snapshot`). If `stepCount` reaches **40**, stop execution, write whatever findings you have, and note in `findings.md` that the step budget was hit.

## Output

Write `output/investigation/<sessionId>/findings.md` using the Write tool. Plain prose, structured around the user's investigation question. Suggested structure:

```
# Investigation: <one-line restatement of the user's question>

## What I ran
<one or two sentences naming the action sequence>

## How I investigated
<one or two sentences naming the technique(s) you picked and why>

## Findings
<3–15 lines answering the user's investigation question, with specific
observations: elements that changed, attribute values, what was missing,
what was present but disabled, etc.>

## Evidence
- Screenshots: <list any saved screenshot paths>
- Trace: <the trace path>
```

Then call `stop_trace` with `name = sessionId`. The trace zip lands at `output/trace/<sessionId>-<timestamp>.zip`.

## Record the run

After writing `findings.md` and stopping the trace, call `record_run` to register this run in `.brow-use/runs.json`:

- `sessionId`
- `command: "investigate"`
- `startedAt`, `endedAt` — ISO timestamps.
- `url` — the URL this run started from.
- `mode` — `"crx"` or `"playwright"`.
- `intent` — combined two-part input formatted as: `"Run: {whatToRun} | Investigate: {howToHelp}"`.
- `artifacts` — `{ tracePath, findingsPath: "output/investigation/<sessionId>/findings.md" }`.

Call it regardless of outcome.

## Termination

Stop when any of these holds:

- The user's investigation question has been answered and `findings.md` is written.
- The action cannot be carried out (feature missing, requires login the agent can't perform, destructive). Write `findings.md` explaining what stopped it; do not pretend the investigation completed.
- Step budget reached. Write partial findings with a note.
- The extension disconnects mid-run (crx mode). Call `stop_trace`, write whatever you have, surface the error.

Always call `stop_trace` before the final summary, so the trace zip is on disk regardless of which stop reason fires.

## Final summary to the user

Print, in order:

1. One sentence stating the answer to the investigation question.
2. The Findings section inline (so the user does not have to open the file).
3. The two paths:
   - `output/investigation/<sessionId>/findings.md`
   - `output/trace/<sessionId>-<ts>.zip`
