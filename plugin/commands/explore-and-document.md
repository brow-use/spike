---
disable-model-invocation: true
description: Autonomously explore the current app and produce end-user documentation of its features. Uses perceptual hashing to avoid loops; the whole run is recorded as a single Playwright trace for human verification.
allowed-tools: Read, Write, MCP(bu/health_check), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/clear_session), MCP(bu/page_fingerprint), MCP(bu/compare_fingerprint), MCP(bu/write_feature_doc), MCP(bu/save_screenshot), MCP(bu/enumerate_interactive_elements), MCP(bu/write_exploration_log), MCP(bu/write_docs_index), MCP(bu/record_run)
---

## Preflight

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` to the user, then stop. Do not proceed.

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's URL and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first and stop.

Use the app's `description` as exploration bias: prefer actions whose accessible names overlap with words in the description. If no description is present, proceed without bias and tell the user.

## Budget

Ask the user for three values with these defaults; accept overrides:
- `maxSteps` (default 40) — hard cap on total captured pages.
- `maxLoopHits` (default 3) — consecutive duplicate fingerprints before giving up.
- `phashThreshold` (default 10) — Hamming distance for "same screen".

## Destructive-action policy

`enumerate_interactive_elements` applies the destructive-action filter server-side — elements whose accessible name matches `\b(delete|remove|cancel account|drop|destroy|deactivate|close account|erase)\b` (case-insensitive) are stripped before the list reaches you. You cannot accidentally invoke what you cannot see. Use this tool for enumeration; do not try to parse `get_accessibility_tree` output by hand to pick actions.

## Coverage rule

Before descending into any single module, call `enumerate_interactive_elements` with `topLevelOnly: true, rolesFilter: ["link"]` on the initial page. This returns every top-level link (typically a hub of 5–15 modules). Add one `{kind: 'navigate', url, humanLabel}` frontier item per link in that list. Exploration proceeds breadth-first across these modules before depth-first within any one of them: visit every top-level module at least once before deepening any branch. Only after every top-level module has at least one visited step may you deepen the branches that best match the app description's keyword bias.

## Exploration

1. Derive `sessionId = "explore-<UNIX-millis>"` once.
2. Call `start_trace`. This is the single audit artifact.
3. Navigate to the app's `url`.
4. Call `page_fingerprint`. Parse the returned JSON; keep `{ phash, ariaHash, url, title }` as the first entry in an in-memory `visited` array. Maintain `contiguousLoopHits = 0` and an empty `frontier` list.

Repeat until a termination condition below is met:

a. Call `enumerate_interactive_elements` (no args — all interactive roles, all depths). The tool returns a filtered list of `{role, name, url?, depth, selector}`. Destructive names are already stripped.

b. If `frontier` is empty, pick up to 5 promising items from the enumerated list (bias by description keyword overlap against each item's `name`). Use the `selector` field verbatim in your frontier entry: `{ kind: 'click'|'type'|'navigate', selector, humanLabel: name }`. For links you may prefer `kind: 'navigate'` with the `url` field instead. For `type`, include a reasonable `text` value (e.g. a sample search term from the description).

For the full aria-tree audit trail (needed when you record into `visited` in step g), call `get_accessibility_tree` separately — once per novel page is enough.

c. Pop the next unexplored action from `frontier` and execute it via `click`, `type`, or `navigate`.

d. Call `page_fingerprint` again.

e. Call `compare_fingerprint` with `candidate` = the new `{phash, ariaHash}` and `known` = `visited.map(v => ({phash: v.phash, ariaHash: v.ariaHash}))`, with optional `phashThreshold`. Parse the returned JSON.

f. If `matched` is true:
   - The primary loop signal is `reason === 'aria-identical'` — treat that as a definite duplicate.
   - `reason === 'phash-close'` is only a loop if the current URL is already in `visited`; otherwise it's a sparse-hash false positive (keep exploring).
   - On a confirmed duplicate: increment `contiguousLoopHits`, drop the action you just took, do NOT enqueue new actions from this page, continue to the next frontier item.

g. If `matched` is false (or `phash-close` but the URL is new):
   - Reset `contiguousLoopHits` to 0.
   - Append `{ stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp }` to `visited`. `stepId` is the current step number (zero-padded, e.g. `"0007"`). `ariaSummary` is a one-line description (e.g. "form with Name, Email, Submit" — used later to cluster features). `ariaTree` is the full text returned by `get_accessibility_tree` for this page.
   - Return to step a.

h. Back-navigation: after exploring what appears to be a leaf (no new actions surface), call `navigate` to the nearest parent URL from `visited` rather than relying on browser history.

## Termination

Stop ONLY when one of the three conditions below holds. Do not terminate on any other criterion — no "I've covered enough", no "the description only mentions a few features", no judgment calls. Continue exploring until the budget enforces a stop.

- `frontier` is empty after considering the current page.
- `visited.length >= maxSteps`.
- `contiguousLoopHits >= maxLoopHits`.

Then:
1. Call `stop_trace` with `name = sessionId`. Note the returned path.
2. Persist the aria-tree log with `write_exploration_log`: pass `sessionId` and `entries` = your `visited` array. The tool writes `output/exploration/<sessionId>.jsonl` with one JSON line per entry. Do NOT hand-write the jsonl via the `Write` tool — that would spend tens of thousands of output tokens re-emitting the aria trees.
3. Tell the user briefly: number of pages visited, termination reason, trace path, aria-log path.

## Documentation

Cluster `visited` into **features** — contiguous sequences that accomplish a user-meaningful outcome (e.g. "sign in", "create an invoice", "browse products"). Use URL paths and the `ariaSummary` you recorded to group. A single visited page can belong to one feature.

For each feature:

1. For every step you want to show visually in the doc (typically: the feature's entry page and each page where the user is required to make a decision), re-navigate there if needed and call `save_screenshot` with `sessionId`, a descriptive kebab-case `name` (e.g. `creating-invoice-step-2`), and optionally an `alt` text. The tool returns `markdownSnippet` — paste it verbatim into the doc. Do not hand-type `![...](../../exploration/...)` — use the snippet.

2. Call `write_feature_doc` with `sessionId`, `name` = kebab-case feature name, and `content` following this template:

```
# <Human title>

<one-sentence plain-language summary>

## Before you start

<prerequisites like login or existing data; omit the heading if none>

## Steps

1. <what the user sees + does, in plain language>

   ![Step description](<relativeToDocs from save_screenshot>)

2. ...

## What happens next

<observed outcome>

## Tips

<optional>
```

Tone rules:
- Second person ("you").
- No developer jargon: no "selector", "DOM", "click handler", "element", code fences.
- Describe what the user sees and does, not how the app implements it.
- Embed screenshots where they aid user understanding. Screenshots come from `save_screenshot`; the full trace zip remains the deeper audit artifact for anyone who wants to replay the exploration.

Finally, call `write_docs_index` to emit the README. Pass:
- `sessionId`, `appName`, `appUrl`, `appDescription` (from `.brow-use/apps.json`).
- `entries` — an array of `{slug, title, summary}`, one per feature doc written this run. `slug` matches the doc filename without `.md`; `title` is the human title; `summary` is one plain-language sentence (same content you'd normally write into the TOC row).
- `stats` — optionally `{pagesVisited: visited.length, terminationReason: "frontier-empty"|"maxSteps"|"maxLoopHits"}`.

The tool renders the TOC table and the standard "How this was generated" footer. Do NOT write the README via `write_feature_doc(name="README", ...)` — that path requires you to format the table + footer by hand and drifts across runs.

All feature docs, the README, the aria log, the trace zip, and the screenshots are scoped under `<sessionId>` so this run cannot overwrite artifacts from a previous run.

## Record the run

At the very end, after all docs are written, call `record_run` to register this run in the brow-use run database (`.brow-use/runs.json`):

- `sessionId` — this run's id.
- `command: "explore-and-document"`.
- `startedAt` — ISO timestamp from when you derived the sessionId (you can reconstruct it from the unix-ms portion).
- `endedAt` — ISO timestamp of now.
- `appId` — the `currentAppId` value from `.brow-use/apps.json`.
- `mode` — `"crx"` or `"playwright"`, whichever was active (check `health_check`'s `mode` field at preflight).
- `pagesVisited` — `visited.length`.
- `terminationReason` — `"frontier-empty"` | `"maxSteps"` | `"maxLoopHits"`.
- `artifacts` — object with `tracePath`, `docsDir`, `ariaLog`, `screenshotsDir`.

Do this regardless of success or partial completion — it is the audit trail for every run.

## Failure modes

- If `page_fingerprint` errors, navigate back to the last good URL from `visited` and try the next frontier item.
- If two consecutive actions produce `matched=true`, the current page is not progressing — navigate back to the nearest parent URL.
- If the extension disconnects mid-run (crx mode), stop tracing, write whatever docs you have, and surface the error to the user.
