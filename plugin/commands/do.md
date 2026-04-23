---
disable-model-invocation: true
description: Carry out a plain-English user intention against the current app, grounded in docs/exploration/POM/workflow artifacts from an earlier run. Extracts data and presents it in the requested format plus a short plain-language narrative of how it was obtained. The whole run is recorded as a Playwright trace.
allowed-tools: Read, Glob, Write, MCP(bu/health_check), MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/get_accessibility_tree), MCP(bu/enumerate_interactive_elements), MCP(bu/snapshot), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/write_result), MCP(bu/record_run)
---

## Preflight

1. Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop. Do not start a trace.
2. Read `.brow-use/apps.json` and find the app whose id matches `currentAppId`. If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first and stop.

## Inputs

Ask the user for three things (if they have not already stated them):

1. **Intent** (required, plain text). The business-level goal — e.g. *"Export the full list of Excavating Machines with registration date and address as CSV."* Do NOT ask them for detailed steps; the agent decides how to achieve the intent.
2. **Run id** (required). The bare Unix-ms portion of an earlier `/bu:explore-and-document` session, e.g. `1745296800000`. Do NOT auto-pick. If the user does not know an id, run `Glob` on `output/docs/*/` and list the available session folders. If none exist, tell the user to run `/bu:explore-and-document` first and stop.
3. **Output format** (optional). One of `markdown` | `csv` | `json` | `txt`. Default: `markdown`. If the user's intent text already implies a format (e.g. "as CSV"), use that and skip asking.

## Resolution

Resolve the user's `<id>` to the artifacts on disk:

- Docs folder: `output/docs/explore-<id>/` — **required**. If missing, abort and list the available ids from `output/docs/*/`.
- Aria-tree log: `output/exploration/explore-<id>.jsonl` — optional; skip silently if missing.
- Screenshots: `output/exploration/explore-<id>/*.png` — optional; list filenames but do not preload images.

Page objects (`output/page/*.ts`) and workflows (`output/workflow/*.ts`) are not id-scoped — read them regardless.

Derive this run's own `sessionId = "do-<UNIX-millis>"`. Call `start_trace` after successful resolution.

## Knowledge stack

Build up app understanding in this order. Treat everything as a **hint**, not a fact — verify with `get_accessibility_tree` when live state looks inconsistent with the recorded knowledge.

1. **Docs folder** — read every `.md` in `output/docs/explore-<id>/` using `Glob` + `Read`. Includes `README.md` (feature index) and one file per feature. Semantic layer: what the app does and what a user does on each page.
2. **Aria log** — read `output/exploration/explore-<id>.jsonl` line by line. Each line has `url`, `title`, `ariaSummary`, and the full `ariaTree`. Use this as a sitemap (the URLs visited in the explore run) plus pre-scraped selectors.
3. **Page objects** — read every `.ts` in `output/page/`. These are Playwright POM classes with locator definitions per interactive element. Prefer these for selectors when they cover the page in question.
4. **Workflows** — read every `.ts` in `output/workflow/`. If any workflow's function name or inputs match the user's intent, follow its steps rather than improvising. Name the matched workflow in `how.md` at the end.
5. **Screenshots** — do not preload. If aria + docs + POM together are not enough to decide a specific step, `Read` the single relevant screenshot in `output/exploration/explore-<id>/<name>.png`.

After reading, state the execution plan aloud to the user in one or two sentences — the concrete sequence you intend to take. Example: *"I'll go to the Data Entry App, search Excavating Machine with no filters, open each row for the registration date, and write the result as CSV."* This keeps intent visible before you click anything.

## Destructive-action policy (hard block)

`enumerate_interactive_elements` strips destructive-action elements server-side by default (names matching `\b(delete|remove|cancel account|drop|destroy|deactivate|close account|erase)\b`, case-insensitive). Always use `enumerate_interactive_elements` when picking what to click — not your own regex on `get_accessibility_tree`. You cannot invoke what you cannot see.

Even if the user's intent appears to request a delete/remove, refuse at the intent-parsing stage:

- Tell the user this command does not perform destructive actions.
- Direct them to perform the action manually in the browser.
- Call `stop_trace` immediately.
- Do not write a `result.*` file.
- Still write a short `how.md` explaining that the intent was refused and why.

## Execution

1. Navigate to the app's home URL if not already there.
2. Work through your stated plan using `navigate`, `click`, `type`, `enumerate_interactive_elements`, `get_accessibility_tree`, `snapshot`. Guidelines:
   - For picking *what to click* on the current page, prefer `enumerate_interactive_elements` — it returns a filtered, already-selector-ready list of safe interactive items.
   - Use `get_accessibility_tree` when you need the full page content (e.g. reading table cells for extraction), not for picking actions.
   - Prefer POM-class selectors when a matching page object exists. Otherwise use the `selector` field from `enumerate_interactive_elements`. Fall back to CSS only as a last resort.
   - For paginated tables, iterate pages until you have all rows the intent requires.
3. Extract the data incrementally as you find it. Keep a simple in-memory structure: an array of flat objects keyed by the column names the user cares about.
4. Stop as soon as the intent is satisfied. Do not wander into unrelated parts of the app.

## Runaway guard

Maintain `stepCount` across browser-interaction calls (`navigate`, `click`, `type`, `get_accessibility_tree`, `snapshot`). If `stepCount` reaches **50**, stop execution, write whatever result you have with a note in `how.md` that the step budget was hit.

## Output

Write two files. Use the dedicated tools — do NOT hand-format the result file via `Write`.

1. **Result** — call `write_result` with:
   - `sessionId`
   - `format` (`markdown` | `csv` | `json` | `txt`)
   - `records` — the structured array you built during extraction. For csv/markdown each element must be a flat object keyed by column name. For json it can be any JSON value. For txt, an array of strings.
   - `columns` (optional) — column order for csv/markdown. Defaults to keys of the first record.
   - `title` (optional) — used as the heading of markdown output.
   The tool writes `output/results/<sessionId>/result.<ext>`, handling CSV quoting, JSON indentation, and Markdown table alignment.

2. **`how.md`** — use the `Write` tool for this one (short prose, 5–15 lines). Contents:
   - Which pages you visited (e.g. "the Data Entry App search page").
   - Which filters or inputs you applied.
   - How many records you collected.
   - If you followed a recorded workflow, name it.
   - If you fell back to ad-hoc aria scraping because no POM covered the page, say so.
   - No code, no selectors, no jargon.
   Path: `output/results/<sessionId>/how.md`.

Then call `stop_trace` with `name = sessionId`. The trace zip lands at `output/trace/<sessionId>-<timestamp>.zip`.

## Record the run

After writing result + how.md and stopping the trace, call `record_run` to register this run in `.brow-use/runs.json`:

- `sessionId` — this run's id (the `do-<unix-ms>` one).
- `command: "do"`.
- `startedAt`, `endedAt` — ISO timestamps.
- `appId` — from `.brow-use/apps.json`.
- `mode` — `"crx"` or `"playwright"`.
- `intent` — the user's plain-text intent.
- `format` — `"markdown"` | `"csv"` | `"json"` | `"txt"`.
- `recordsExtracted` — the number of records in the result. `0` if the intent was refused or no data found.
- `sourceExploreId` — the id the user supplied for grounding (e.g. `1745296800000`).
- `artifacts` — object with `tracePath`, `resultPath`, `howPath`. Omit `resultPath` if no result file was written (refused/failed run).

Call it regardless of outcome (success, refusal, partial). It is the audit trail.

## Termination

Stop when any of these holds:

- The intent has been satisfied and both output files are written.
- The intent cannot be carried out (feature missing in the app, insufficient privileges, requires destructive action). Write `how.md` explaining why; do not write `result.<ext>`.
- Step budget reached (50 browser actions). Write partial result with a note.
- The extension disconnects mid-run (crx mode). Call `stop_trace`, write whatever you have, surface the error.

Always call `stop_trace` before the final summary, so the trace zip is on disk regardless of which stop reason fires.

## Final summary to the user

Print, in order:

1. One sentence on what was retrieved or why nothing was retrieved.
2. A preview of the result — first ~10 rows of a table, first ~10 items of a list, or the whole content if it's short. Render inline so the user sees it without opening a file.
3. The three paths:
   - `output/results/<sessionId>/result.<ext>`
   - `output/results/<sessionId>/how.md`
   - `output/trace/<sessionId>-<ts>.zip` (or note that no trace was produced if the command aborted before `start_trace`)

## Failure modes

- **Unknown id** — list available ids from `output/docs/*/` and stop before starting a trace.
- **Missing docs for id** — same as unknown id.
- **Destructive intent** — refuse per the hard block above.
- **Page element cannot be located** — re-read the aria tree once, try a different selector strategy, and if still stuck, write `how.md` naming the step that failed and what the agent saw.
- **Data not present in the app** — stop; write `how.md` explaining that the data the user asked for does not exist in the current view.
