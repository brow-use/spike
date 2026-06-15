---
disable-model-invocation: true
description: Autonomously explore the current app and capture a per-page aria-tree log. Uses perceptual hashing to avoid loops; the whole run is recorded as a single Playwright trace for human verification. Run /bu:document afterwards to produce end-user feature docs from the log.
allowed-tools: Read, MCP(bu/health_check), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/get_accessibility_tree), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/clear_session), MCP(bu/page_fingerprint), MCP(bu/compare_fingerprint), MCP(bu/enumerate_interactive_elements), MCP(bu/record_run), MCP(bu/log_reasoning), MCP(bu/write_exploration_log), MCP(bu/write_skipped_log), MCP(bu/save_screenshot)
---

## Preflight: confirm URL and mode

1. Read `.brow-use/config.json` with the Read tool. Look at `currentMode`. If it is null, tell the user: "No mode is set. Run `/bu:use-managed-browser` (fresh Chromium) or `/bu:use-session` (your logged-in Chrome)." Stop.
2. Get the target URL: if the user has already stated one, use it. Otherwise ask: "What URL should I start from?"
3. Get an app description (optional): if the user has already provided one, use it. Otherwise ask: "Briefly describe the app for exploration bias — or press Enter to skip."
4. Confirm with the user, verbatim: "I'll run against **{url}** in **{currentMode}** mode. Continue or change mode?"
5. If the user says continue, proceed. If they say change mode, run `/bu:use-managed-browser` or `/bu:use-session`. After the mode change, re-confirm before proceeding.
6. Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop.

Use the description as exploration bias: prefer actions whose accessible names overlap with words in the description. If no description is provided, proceed without bias and tell the user.

## Budget

Ask the user for three values with these defaults; accept overrides:
- `maxSteps` (default 40) — hard cap on total captured pages.
- `maxLoopHits` (default 3) — consecutive duplicate fingerprints before giving up.
- `phashThreshold` (default 10) — Hamming distance for "same screen".

## Destructive-action policy

`enumerate_interactive_elements` applies the destructive-action filter server-side — elements whose accessible name matches `\b(delete|remove|cancel account|drop|destroy|deactivate|close account|erase)\b` (case-insensitive) are stripped before the list reaches you. You cannot accidentally invoke what you cannot see. Use this tool for enumeration; do not try to parse `get_accessibility_tree` output by hand to pick actions.

## Reasoning log (call sparingly)

Call `log_reasoning` with the run's `sessionId` only at **non-obvious** decision points. This is an audit trail, not a narrator. Do NOT call it on every step. The file lands at `output/reasoning/<sessionId>.jsonl`.

Required call sites:

1. **Plan** — once, after reading the knowledge stack and the app description, before `start_trace`. Payload: the one- to two-sentence plan narration (same text you say to the user). `kind: "plan"`.
2. **Decision** — only when you make a judgment call that a reader of the trace would not recover from the aria log alone. Examples:
   - Exploring a module whose name does NOT match any description keyword (explain why you picked it next).
   - Skipping an action because `compare_fingerprint` returned `aria-identical` and you recognised it as a loop.
   - Back-navigating from a leaf to the nearest parent URL.
   `kind: "decision"`.
3. **Observation** — once, at termination, just before `record_run`. Payload: termination reason + a one-liner on overall coverage. `kind: "observation"`.
4. **Error** — on any unrecoverable error (extension disconnect, repeated click failure, trace stop failure). `kind: "error"`.

Do NOT call on routine pops from the frontier, on every successful novel page, or to narrate the plan step by step.

## Coverage rule

Before descending into any single module, call `enumerate_interactive_elements` with `topLevelOnly: true, rolesFilter: ["link"]` on the initial page. This returns every top-level link (typically a hub of 5–15 modules). Add one `{kind: 'navigate', url, humanLabel}` frontier item per link in that list. Exploration proceeds breadth-first across these modules before depth-first within any one of them: visit every top-level module at least once before deepening any branch. Only after every top-level module has at least one visited step may you deepen the branches that best match the app description's keyword bias.

## Exploration

1. Derive `sessionId = "explore-<UNIX-millis>"` once.
2. Call `start_trace` with `name = sessionId`. The trace is the rich audit artifact (screenshots, DOM), flushed to disk in chunks under `output/trace/<sessionId>/`. In session (crx) mode the extension service worker can restart mid-run and drop un-flushed trace chunks, so the trace alone is not a reliable record of which pages were seen — that is why each novel page is also persisted to the aria log incrementally in step g.
3. Call `write_exploration_log` once with `sessionId`, `entries: []`, and `append: false` to truncate any stale log from a previous run with this id.
4. Navigate to `url`.
5. Call `page_fingerprint`. Parse the returned JSON; keep `{ phash, ariaHash, structuralHash, url, title }` as the first entry in an in-memory `visited` array. Call `get_accessibility_tree`, then persist this first page exactly as step g describes. Maintain `contiguousLoopHits = 0` and an empty `frontier` list.

Repeat until a termination condition below is met:

a. Call `enumerate_interactive_elements` (no args — all interactive roles, all depths). The tool returns a filtered list of `{role, name, url?, depth, selector}`. Destructive names are already stripped.

b. If `frontier` is empty, pick up to 5 promising items from the enumerated list (bias by description keyword overlap against each item's `name`). Use the `selector` field verbatim in your frontier entry: `{ kind: 'click'|'type'|'navigate', selector, humanLabel: name }`. For links you may prefer `kind: 'navigate'` with the `url` field instead. For `type`, include a reasonable `text` value (e.g. a sample search term from the description).

For the full aria-tree audit trail (needed when you record into `visited` in step g), call `get_accessibility_tree` separately — once per novel page is enough.

c. Pop the next unexplored action from `frontier` and execute it via `click`, `type`, or `navigate`.

d. Call `page_fingerprint` again.

e. Call `compare_fingerprint` with `candidate` = the new `{phash, ariaHash, structuralHash, url}` and `known` = `visited.map(v => ({phash: v.phash, ariaHash: v.ariaHash, structuralHash: v.structuralHash, url: v.url}))`, with optional `phashThreshold`. Parse the returned JSON.

f. Branch on `reason`:
   - `reason === 'aria-identical'` — a definite loop (same interactive state already seen). Increment `contiguousLoopHits`, drop the action you just took, do NOT enqueue new actions from this page, continue to the next frontier item.
   - `reason === 'same-template'` — this page is a fresh instance of an archetype you have already sampled (same skeleton + same URL template as `visited[matchedIndex]`, e.g. the 2nd, 3rd, … row of a list opened to its detail page). Do NOT explore it and do NOT enqueue its children. Record it once: call `write_skipped_log` with `append: true` and a single-element `entries` array holding `{ url, urlTemplate, structuralHash, representativeStepId, representativeUrl, title, reason: 'same-template', timestamp }`, where `representativeStepId`/`representativeUrl` come from `visited[matchedIndex]`. Do NOT increment `contiguousLoopHits` (this is intentional sampling, not a stuck loop). Then navigate back to the list/parent URL and continue to the next frontier item. This is what makes "explore one representative row, skip the identical siblings" work.
   - `reason === 'phash-close'` — only a loop if the current URL is already in `visited`; otherwise it's a sparse-hash false positive, so treat the page as novel and fall through to step g.
   - `reason === 'no-match'` — novel page, go to step g.

g. For a novel page (`reason === 'no-match'`, or `phash-close` with a URL not in `visited`):
   - Reset `contiguousLoopHits` to 0.
   - Append `{ phash, ariaHash, structuralHash, url }` to `visited` for loop and template detection.
   - Persist the page immediately: call `write_exploration_log` with `append: true` and `entries` set to a single-element array holding `{ stepId, phash, ariaHash, structuralHash, url, title, ariaSummary, ariaTree, timestamp }`, where `stepId` is the zero-padded index of this page in `visited` (e.g. `"0003"`), `ariaTree` is the tree from the `get_accessibility_tree` call for this page, `ariaSummary` is a one-line summary of it, and `timestamp` is the current ISO time. This writes to `output/exploration/<sessionId>.jsonl` on disk, so the page survives even if the extension service worker restarts and the trace chunk is lost. Use the real `url` from `page_fingerprint`/`navigate` — do not rely on the trace to recover it.
   - Capture the screenshot immediately, in the same step: call `save_screenshot` with this run's `sessionId` and `name: "page-<stepId>"`, using the exact same zero-padded `stepId` you just wrote to the aria log (e.g. `"page-0003"`). This writes `output/exploration/<sessionId>/page-<stepId>.png` live, keyed to the agent's real step index, so every captured page gets a screenshot that stays aligned with its aria-log entry and survives a trace-chunk loss. Do NOT defer screenshots to `make extract` — the trace is lossy in crx mode and its frame numbering does not match the aria log.
   - Return to step a.

h. Back-navigation: after exploring what appears to be a leaf (no new actions surface), call `navigate` to the nearest parent URL from `visited` rather than relying on browser history.

## Termination

Stop ONLY when one of the three conditions below holds. Do not terminate on any other criterion — no "I've covered enough", no "the description only mentions a few features", no judgment calls. Continue exploring until the budget enforces a stop.

- `frontier` is empty after considering the current page.
- `visited.length >= maxSteps`.
- `contiguousLoopHits >= maxLoopHits`.

Then:
1. Call `stop_trace` with `name = sessionId`. Note the returned path.
2. Tell the user briefly: number of pages visited, termination reason, and the trace path. Tell them the next step before `/bu:document` is to extract downstream artifacts from the shell:
   ```
   make extract SESSION=<sessionId>
   ```
   Both the aria-tree log `output/exploration/<sessionId>.jsonl` and the per-step screenshots `output/exploration/<sessionId>/page-<stepId>.png` are already written incrementally by this command (step g), with correct per-page URLs and step-aligned screenshots. `make extract` back-fills the aria log and trace-derived screenshots only when the log is missing — it will not overwrite or renumber what this command wrote. Its remaining job here is the action sidecar and the rich trace for human verification.

## Record the run

At the very end, call `record_run` to register this run in the brow-use run database (`.brow-use/runs.json`):

- `sessionId` — this run's id.
- `command: "explore"`.
- `startedAt` — ISO timestamp from when you derived the sessionId (you can reconstruct it from the unix-ms portion).
- `endedAt` — ISO timestamp of now.
- `url` — the URL this run started from.
- `mode` — `"crx"` or `"playwright"`, whichever was active (check `health_check`'s `mode` field at preflight).
- `pagesVisited` — `visited.length` at termination.
- `terminationReason` — `"frontier-empty"` | `"maxSteps"` | `"maxLoopHits"`.
- `artifacts` — object with `tracePath`, `ariaLog` = `"output/exploration/<sessionId>.jsonl"`, and (if any page was skipped as `same-template`) `skippedLog` = `"output/exploration/<sessionId>-skipped.jsonl"`. The ariaLog, per-step screenshots, and skipped log are all written incrementally during the run (steps f and g), so they already exist at this point. Downstream consumers (`/bu:document`, `/bu:generate-page-objects`, `/bu:run-instruction`) read the ariaLog directly.

Do this regardless of success or partial completion — it is the audit trail for every run.

## Failure modes

- If `page_fingerprint` errors, navigate back to the last good URL from `visited` and try the next frontier item.
- If two consecutive actions produce `matched=true`, the current page is not progressing — navigate back to the nearest parent URL.
- If the extension disconnects mid-run (crx mode), stop tracing, write whatever you have, and surface the error to the user.
