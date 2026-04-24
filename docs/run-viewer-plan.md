# Run Viewer — executable plan

A local web app that merges every artifact from a recorded run onto a single interactive timeline, with drill-in detail panes, and lets you compare multiple runs side by side.

## Decisions locked for MVP

| # | Decision | Chosen |
|---|---|---|
| 1 | Reasoning log path | `output/reasoning/<sessionId>.jsonl` (standalone dir, command-agnostic) |
| 2 | MCP log partitioning | **Skip the MCP lane for MVP.** The global `.brow-use/mcp.log` is not partitioned per-session. Revisit later. |
| 3 | Playwright trace rendering | **Custom parser only.** No iframe of `npx playwright show-trace`. Render trace-actions/network/console as our own timeline pins with the screenshots extracted from the zip. |
| 4 | `log_reasoning` call frequency | **Non-obvious only** — plan at start, deviations from default bias, loop detection, back-navigation, termination. |
| 5 | Build target | **Dev-only** — `viewer:dev` runs Vite locally. No `viewer:build` in MVP. |

## Project structure

Single-package, no new `package.json`. Shares root `node_modules`. Mirrors the existing `extension.vite.config.ts` pattern.

New at repo root:
- `viewer.vite.config.ts` — Vite config for the viewer.
- `viewer/index.html` — entry point.
- `viewer/src/main.tsx` + components.
- `viewer/tsconfig.json` — extends root tsconfig with React JSX settings.
- `viewer/ingest.ts` — standalone tsx ingestion script (not part of the Vite build).
- `viewer/data/` — **generated**; added to `.gitignore`.

New in root `package.json`:
- Deps: `react`, `react-dom`, `vis-timeline`, `vis-data`, `react-markdown`, `remark-gfm`, `shiki`, `@tanstack/react-table`, `yauzl`, `diff2html`.
- DevDeps: `@types/react`, `@types/react-dom`, `@types/yauzl`.
- Scripts: `viewer:ingest`, `viewer:dev`.

New at filesystem root (not in repo, created at runtime by the server):
- `output/reasoning/<sessionId>.jsonl` — target of the `log_reasoning` tool.

## Scope

`.brow-use/runs.json` is the authoritative index. Today it tracks four commands: `explore`, `do`, `record-page-objects`, `record-workflow`. The viewer **visualises** only the first two (content-shaped artifacts). The other two appear in the session picker with metadata only (no timeline). They remain candidates for later if we add `log_reasoning` hooks to them.

## Timeline schema

```ts
type EventKind =
  // From output/reasoning/<sessionId>.jsonl
  | 'agent-reasoning'
  // From .brow-use/runs.json
  | 'run-start' | 'run-end'
  // From output/exploration/<sessionId>.jsonl (explore runs only)
  | 'visited-page'
  // From listing output/exploration/<sessionId>/*.png (file mtime as t)
  | 'screenshot-saved'
  // From listing output/docs/<sessionId>/*.md and output/results/<sessionId>/*
  | 'doc-write' | 'result-write'
  // Parsed out of output/trace/<sessionId>-<ts>.zip (trace.trace NDJSON)
  | 'trace-action' | 'trace-network' | 'trace-console'

interface TimelineEvent {
  sessionId: string
  t: number            // unix ms
  kind: EventKind
  lane: 'agent' | 'browser' | 'trace' | 'files'
  label: string
  detail?: unknown
  duration?: number    // for trace-action spans
  links?: {
    screenshot?: string                                    // relative URL under /data/
    doc?: string                                           // relative URL under /data/
    resultFile?: string
    ariaFingerprint?: { phash: string; ariaHash: string }  // used for aria-diff between two visited-page events
  }
}
```

**Lanes for MVP:** `agent`, `browser`, `trace`, `files`. No `mcp` lane (Decision #2).

## Execution order

Tasks are totally ordered. Each ends with acceptance criteria that must pass before moving on.

---

### Task 1 — `log_reasoning` tool

**Goal.** A new MCP tool that appends one JSON line per call to `output/reasoning/<sessionId>.jsonl`.

**Files to create.**
- `tool/log-reasoning.ts` — the tool. Input schema:
  ```
  sessionId: string (required)
  text: string (required)
  kind: 'plan' | 'observation' | 'decision' | 'error' (optional, default 'decision')
  ```
  Effect: `fs.appendFileSync(path, JSON.stringify({t: new Date().toISOString(), kind, text}) + '\n')`.
  Returns: `{path, linesTotal}`.
- `tool/log-reasoning.test.ts` — unit tests mirroring `tool/write-exploration-log.test.ts`. Cover: first append creates file + dir, subsequent appends add lines, default kind is `'decision'`, each line is valid JSON.

**Files to modify.**
- `mcp/index.ts`:
  - Import `logReasoning`; add to `browserTools`.
  - Add `'log_reasoning'` to `fileOnlyTools` set (so it never routes through the extension and doesn't spin up a browser).
  - Add `'reasoning'` to the `ensureOutputDirs` list alongside `'page', 'workflow', 'trace', 'docs', 'exploration'`.

**Acceptance.**
- `npx tsc -p tsconfig.json --noEmit` passes.
- `npm test` passes (including the new test file).
- Smoke: from a temporary `tsx` script, call `log_reasoning.execute({sessionId: 'test-1', text: 'hello', kind: 'plan'})` → file at `output/reasoning/test-1.jsonl` exists with one line `{"t":"…","kind":"plan","text":"hello"}`.

**Effort.** ~30 minutes.

---

### Task 2 — Wire `log_reasoning` into explore and do

**Goal.** Both commands emit reasoning at prompt-sanctioned points. Non-obvious only (Decision #4).

**Files to modify.**
- `plugin/commands/explore.md`:
  - `allowed-tools`: append `MCP(bu/log_reasoning)`.
  - Add a section **"Reasoning log (call sparingly)"** before Exploration, listing exactly when to call:
    1. **Plan** — after the knowledge stack is built and before `start_trace`. Payload: the execution plan narration (one to two sentences).
    2. **Decision** — when picking a frontier item that does NOT match the description keyword bias (e.g. exploring Admin after the bias said Data Entry App), OR when skipping a page due to `aria-identical` loop detection, OR when back-navigating from a leaf.
    3. **Observation** — at termination (just before `record_run`). Payload: the reason for stopping and one-line summary of coverage.
    4. **Error** — on extension disconnect, stop_trace failure, or any unrecoverable error.
  - Do NOT call on every step. This is an audit trail of non-obvious judgment, not a narrator.
- `plugin/commands/do.md` — same treatment:
  - `allowed-tools`: append `MCP(bu/log_reasoning)`.
  - Call sites: plan after the knowledge stack and before `start_trace`; decision when picking a non-obvious next action (selector-ambiguous situations); observation at termination; error on refusal (destructive intent) and on any failure.

**Acceptance.**
- A real `/bu:explore` run with `maxSteps=5` against the Avni app produces an `output/reasoning/<sessionId>.jsonl` with at least a plan line and a termination-observation line. Zero-entry runs are acceptable only if nothing non-obvious happened.
- Running `jq -c . output/reasoning/<sessionId>.jsonl` parses cleanly.

**Effort.** ~30 minutes (prompt edits + one smoke run).

---

### Task 3 — Ingestion script

**Goal.** `viewer/ingest.ts` reads the filesystem and produces one JSON per run plus an index, shaped for the browser.

**Files to create.**
- `viewer/ingest.ts`. Behaviour:
  1. Read `.brow-use/runs.json` and `.brow-use/apps.json`.
  2. For each run where `command` ∈ {`explore`, `do`}:
     - Join `appId` → app name/url/description.
     - Emit `run-start` and `run-end` events (from `startedAt` / `endedAt`).
     - If `output/reasoning/<sessionId>.jsonl` exists: emit one `agent-reasoning` event per line.
     - Explore: parse `output/exploration/<sessionId>.jsonl` → one `visited-page` per line, populating `detail.ariaSummary`, `links.ariaFingerprint`, etc.
     - List `output/exploration/<sessionId>/*.png` with their mtimes → `screenshot-saved` events; copy the PNGs to `viewer/data/<sessionId>/screenshots/<name>.png` so the Vite server can serve them.
     - List `output/docs/<sessionId>/*.md` with mtimes → `doc-write` events; copy `.md` contents into the per-session JSON (no separate file fetch needed).
     - `do` runs: same pattern for `output/results/<sessionId>/result.<ext>` (copy into JSON if small; else leave as a link) and `how.md`.
     - Open `output/trace/<sessionId>-*.zip` with `yauzl`. Stream `trace.trace` as NDJSON. Merge `before`/`after` action entries into single `trace-action` events with `duration = endTime - startTime`. Also emit `trace-network` and `trace-console` events. Extract action screenshots (keyed by `pageId`/`sha1` per Playwright's format) into `viewer/data/<sessionId>/trace-screenshots/<hash>.png` and reference them via `links.screenshot`.
  3. Write `viewer/data/<sessionId>.json` — the full timeline bundle for that session.
  4. Write `viewer/data/_index.json` — array of `{sessionId, command, startedAt, endedAt, appName, pagesVisited?, intent?, thumbUrl?}` for the session picker.
  5. Runs with `command` ∈ {`record-page-objects`, `record-workflow`} still appear in `_index.json` (metadata only); no per-session JSON is emitted.

- `viewer/tsconfig.json` — extends root, adds `"jsx": "react-jsx"` and `"lib": ["DOM", "ES2022"]`.

**Files to modify.**
- `.gitignore` — add `viewer/data/` and `dist/viewer/`.
- `package.json` scripts: add `"viewer:ingest": "tsx viewer/ingest.ts"`.
- `package.json` deps: add `yauzl` and `@types/yauzl` (devDep).

**Acceptance.**
- `npm run viewer:ingest` exits 0 against current repo state.
- `viewer/data/_index.json` contains at least the `explore-1745385600000` run (the Avni one already in `runs.json`).
- `viewer/data/explore-1745385600000.json` contains: 2 run-start/end events + ≥10 visited-page events + ≥7 screenshot-saved events + ≥7 doc-write events + trace-action events extracted from the zip.
- `jq '.events | map(.kind) | unique' viewer/data/explore-1745385600000.json` returns a list that includes at least `visited-page`, `screenshot-saved`, `doc-write`, `trace-action`, `run-start`, `run-end`.

**Effort.** ~2 hours. The tricky part is the trace-zip parser — handling Playwright's exact resource layout.

---

### Task 4 — Vite + React skeleton with session picker and timeline

**Goal.** Running `npm run viewer:dev` shows a working single-run timeline for the Avni explore run.

**Files to create.**
- `viewer.vite.config.ts` at repo root — mirrors `extension.vite.config.ts`, but:
  - Entry: `viewer/index.html`.
  - Serves `viewer/data/` as static assets at `/data/*`.
- `viewer/index.html` — minimal HTML with root div and `<script type="module" src="/src/main.tsx">`.
- `viewer/src/main.tsx` — React bootstrapping.
- `viewer/src/App.tsx` — top-level component with two-pane layout: left sidebar session picker, main area timeline (later: right detail pane).
- `viewer/src/SessionPicker.tsx` — fetches `/data/_index.json`, renders a list.
- `viewer/src/Timeline.tsx` — takes a sessionId; fetches `/data/<sessionId>.json`; initialises vis-timeline with 4 groups (agent/browser/trace/files).

**Files to modify.**
- Root `package.json`:
  - Deps: add `react`, `react-dom`, `vis-timeline`, `vis-data`.
  - DevDeps: add `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`.
  - Script: add `"viewer:dev": "vite --config viewer.vite.config.ts"`.

**Acceptance.**
- `npm run viewer:dev` starts a Vite server on (default) port 5173.
- Navigating to the URL shows the left-side session picker with the Avni explore run selectable.
- Selecting it renders a vis-timeline with events across 4 lanes. Events are visibly positioned by `t`; swim lanes are labelled; no console errors.

**Effort.** ~2 hours.

---

### Task 5 — Detail pane per kind

**Goal.** Clicking any event opens a right-side pane that renders the event's content using a kind-appropriate view.

**Files to create.**
- `viewer/src/DetailPane.tsx` — switches on `kind`.
- One small component per renderer:
  - `renderers/AgentReasoning.tsx` — shows `kind` badge + plain-wrapped text.
  - `renderers/VisitedPage.tsx` — URL, title, ariaSummary; collapsed by default `ariaTree` syntax-highlighted with `shiki`; "Compare with previous visited-page" button (wire in Task 6).
  - `renderers/ScreenshotSaved.tsx` — `<img src={links.screenshot}>` full-size, click to open in a modal.
  - `renderers/DocWrite.tsx` — `react-markdown` + `remark-gfm` rendering the embedded `.md` content.
  - `renderers/ResultWrite.tsx` — routes by extension: `.md` → react-markdown; `.json` → `shiki` with `json` grammar; `.csv` → `@tanstack/react-table` with headers; `.txt` → `<pre>`.
  - `renderers/TraceAction.tsx` — method + params + start/end times + duration + before/after screenshot strip (uses the hash paths the ingest copied into `viewer/data/<sessionId>/trace-screenshots/`).
  - `renderers/TraceNetwork.tsx` — URL, method, status, timing, request/response header tables.
  - `renderers/TraceConsole.tsx` — level badge + text.
  - `renderers/RunStart.tsx` / `renderers/RunEnd.tsx` — command, app, mode, per-command fields from `runs.json`.

**Files to modify.**
- `viewer/src/Timeline.tsx` — on event click, set selected event and open the detail pane.
- `viewer.vite.config.ts` — make sure `shiki`'s WASM grammars resolve (may need `optimizeDeps.include` or `assetsInclude` tuning).

**Acceptance.**
- For each of the 8 event kinds, clicking an event of that kind in the Avni run opens a pane that renders its content without errors and is actually readable (not a JSON dump).
- Screenshots render (both saved screenshots and extracted trace screenshots).
- Feature-doc Markdown renders with embedded images that load from the viewer's data dir.

**Effort.** ~2–3 hours.

---

### Task 6 — Aria-tree diff between visited pages

**Goal.** On a `visited-page` detail pane, "Compare with previous visited-page" renders a side-by-side diff of the two aria trees.

**Files to create.**
- `viewer/src/renderers/AriaDiff.tsx` — takes two `ariaTree` strings; uses `diff2html` to render side-by-side.

**Files to modify.**
- `renderers/VisitedPage.tsx` — button enabled when a previous visited-page exists in the same session; opens a modal / panel with `AriaDiff`.

**Acceptance.**
- Pick step 1 (Data Entry App) and step 2 (Admin) in the Avni run; diff shows both the top-bar changes and the body changes clearly.
- Diff of a page against itself (debug button) shows no changes.

**Effort.** ~1 hour.

---

### Task 7 — Cross-run view

**Goal.** Multi-select in the session picker renders a merged timeline across the selected runs with a normalised axis (time-since-run-start).

**Files to modify.**
- `viewer/src/SessionPicker.tsx` — multi-select; emits an array of sessionIds.
- `viewer/src/Timeline.tsx` — when more than one sessionId is selected:
  - Fetch each session's JSON in parallel.
  - Normalise `t` to `t - session.runStartT` (offset per session).
  - Render with one group per (session × lane) — colour-coded per session.
  - Add a legend.

**Acceptance.**
- Selecting two explore sessions (say, the current Avni run plus a second one created for the test) shows them on a shared offset axis. Events in each session occupy their own colour. Lane grouping remains readable.
- Selecting a single session still works unchanged.

**Effort.** ~1–2 hours.

---

## Out of scope (explicit)

- **MCP lane / `.brow-use/mcp.log` integration.** Deferred. Revisit when we make the MCP server tag each log line with an active sessionId, or when we decide timestamp-bucketing is good enough.
- **Playwright trace viewer iframe.** Explicitly replaced by custom parser. Interactive DOM-snapshot replay is lost; users who need it can open the zip with `npx playwright show-trace` externally.
- **Production build / `viewer:build`.** Dev-only for MVP.
- **Watch-mode ingest.** `npm run viewer:ingest` is manual; re-run after each new brow-use run.
- **`record-page-objects` / `record-workflow` timeline rendering.** Still indexed but not drawn.
- **Cross-run diff of the same scenario** (e.g. "what changed between Monday and Friday"). Second-pass feature.
- **Retention / archival of `output/`.** Separate concern.
- **Visual unit tests of the React components.** The ingest script gets unit tests; the UI is validated by a manual smoke of the Avni run end-to-end.

## Open questions for later (not blocking MVP)

- Partitioning `.brow-use/mcp.log` per session — requires a `set_active_session` protocol in the MCP server or post-hoc timestamp-bucketing.
- Wall-clock vs. normalised axis for cross-run view — currently normalised; wall-clock may be a toggle.
- Reasoning log hooks in `record-page-objects` / `record-workflow` to bring them into the viewer.
- Whether to persist parsed trace data (to skip re-parsing on repeat viewer loads) — currently the ingest runs each time and overwrites.
