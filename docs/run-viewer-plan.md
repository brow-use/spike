# Run Viewer — plan

A local web app that merges every artifact from a `/bu:explore-and-document` (or `/bu:do`) run onto a single interactive timeline, and lets you compare multiple runs side by side. The goal is to stop digging through `output/` folders, the MCP log, and the Playwright trace separately — they all belong on one time axis.

## Context

Each run already produces:

- `output/trace/<sessionId>-<ts>.zip` — full Playwright trace (per-action screenshots, DOM snapshots, network, console, sources)
- `output/exploration/<sessionId>.jsonl` — one line per visited page: `{stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp}`
- `output/exploration/<sessionId>/*.png` — deliberate screenshots embedded in docs
- `output/docs/<sessionId>/*.md` — generated end-user docs (feature files + README)
- `output/results/<sessionId>/` — from `/bu:do`: `result.<ext>` + `how.md`
- `.brow-use/mcp.log` — every tool call + result + mode switch + extension connect/disconnect

What's **not** on disk today: the agent's reasoning prose between tool calls. That's a gap this plan addresses.

The requirement: everything above, per run and across runs, on a timeline, with drill-in detail panes. No log-grepping.

## Is Playwright's trace viewer a programmable library?

Partly. Three modes, in descending order of official support:

| Mode | How | Use when |
|---|---|---|
| **CLI + embedded iframe** | `npx playwright show-trace --port 9322 <file.zip>` serves the viewer on localhost | You want the full viewer for a selected run; iframe it in |
| **Hosted viewer** | Drop the zip at `trace.playwright.dev` (runs client-side) | One-off inspection; not for an app |
| **Parse the format yourself** | The zip contains `trace.trace` (NDJSON of events), `trace.network`, `resources/*` (DOM + screenshots keyed by content hash), `trace.stacks` | Merging trace events with other data sources on a unified timeline — **this is our case** |

There is no official `import { TraceViewer } from '@playwright/...'` React component. For a custom multi-source viewer, parse the trace yourself for event merging and optionally iframe the CLI viewer as the "zoom into one specific action" view.

Format is stable. `trace.trace` lines look like:
```json
{"type":"before","callId":"...","startTime":1700000000000,"method":"click","params":{"selector":"..."}}
{"type":"after","callId":"...","endTime":1700000000050}
{"type":"resource","url":"...","status":200,"requestStart":...,"responseEnd":...}
```

`yauzl` (already a transitive dep via playwright-crx) or `adm-zip` to read the zip; stream-parse NDJSON; done.

## Recommended stack

Stay in JS/TS to match the project.

### Framework
**Vite + React + TypeScript** — same language as the rest of the project, fastest dev loop, static build works offline.

### Timeline component
**`vis-timeline`** as primary. Battle-tested, native groups/swimlanes, scroll/zoom/drag, tens of thousands of items without choking. Not React-native but wraps with a small effect-hook (or `react-vis-timeline-2`).

Alternatives considered:
- `react-calendar-timeline` — simpler API, React-native, less performant at volume
- Perfetto UI — Chrome's perf tracing UI; overkill but worth knowing if vis-timeline runs out
- D3 from scratch — too much effort for the payoff here
- `@nivo/*` — prettier charts but not event-timeline-shaped

### Detail pane content

| Content type | Library |
|---|---|
| Markdown (feature docs, `how.md`) | `react-markdown` + `remark-gfm` |
| Aria trees, JSON, code | `shiki` or `prism-react-renderer` |
| Network/MCP-log tables | `@tanstack/react-table` |
| Screenshots | `<img>` + `<dialog>` or `yet-another-react-lightbox` |
| DOM snapshot replay | iframe → extracted snapshot HTML, or iframe the Playwright viewer at the matching `callId` |
| Step-to-step aria diff | `diff2html` or Monaco's inline diff |

### Parsing + data layer

- Zip: `yauzl` or `adm-zip`
- NDJSON: `readline` + `JSON.parse` (no library)
- Markdown front-matter (if we add it): `gray-matter`
- File watching in dev: `chokidar` for live refresh when a new run completes

No backend. Data volume is small (a few hundred events per run, dozens of runs). Ingestion script produces one normalized JSON per run. Client loads JSON directly. If cross-run queries get slow, drop in `better-sqlite3` + a tiny Fastify API.

## Unified timeline schema

The load-bearing design decision. Every data source normalizes into this:

```ts
type EventKind =
  | 'nav' | 'click' | 'type' | 'screenshot'
  | 'fingerprint' | 'aria-snapshot'
  | 'trace-action' | 'trace-network' | 'trace-console'
  | 'doc-write' | 'result-write'
  | 'agent-reasoning' | 'mcp-call' | 'mcp-result' | 'error'

interface TimelineEvent {
  sessionId: string
  t: number          // unix ms (authoritative)
  kind: EventKind
  lane: string       // swimlane id
  label: string      // one-line summary
  detail?: unknown   // kind-specific payload
  duration?: number  // for spans (trace actions)
  links?: {
    screenshot?: string
    traceAction?: { zipPath: string, callId: string }
    doc?: string
  }
}
```

Lanes:

1. **Agent** — reasoning + plan narration + termination message
2. **MCP** — tool calls and results (from `.brow-use/mcp.log`)
3. **Browser** — nav, click, type, fingerprint, aria-snapshot (from `exploration/*.jsonl`)
4. **Trace** — Playwright trace actions, network requests, console (from the zip)
5. **Files** — `write_feature_doc`, `write_result`, `save_screenshot`

Click any event → detail pane. Adjacent fingerprint events → aria-tree diff button.

## The missing data: agent reasoning

Reasoning between tool calls is only in the Claude Code conversation transcript today. To get it on the timeline we need to persist it.

Three ways, in priority order:

| Option | Effort | Fidelity | Recommendation |
|---|---|---|---|
| **Add a `log_reasoning(text)` tool** the command calls between major steps. Appends to `output/exploration/<sessionId>.reasoning.jsonl` | Small — tool + a few command-prompt edits | Exactly what the agent wants you to see | **Do this** |
| **Read Claude Code's transcript store** (`~/.claude/projects/<hash>/<uuid>.jsonl`) and post-process | Medium — stable format, but mapping back to a session takes work | Verbose; lots of internal reasoning noise | Skip |
| OpenTelemetry instrumentation of the MCP server with reason attributes | Medium-High — needs a backend (Jaeger/Honeycomb) | Best long-term observability | Skip for local tool |

Option 1 same pattern as `write_exploration_log`. One-liner per major decision in the command prompt. Scope stays with the command.

## MVP — build order

Each step is independently useful.

1. **Ingestion script** (`viewer/ingest.ts`) — tsx script that scans `output/` + `.brow-use/mcp.log`, produces `viewer/data/<sessionId>.json` and `viewer/data/_index.json`. No UI yet; eyeball the JSON. **~1–2 hours.**
2. **`log_reasoning` tool + command prompt hook** — future runs emit reasoning as it happens. Same shape as the offloads. **~30 minutes.**
3. **Vite + React skeleton** — session picker, vis-timeline swimlanes, no detail pane yet. **~2–3 hours.**
4. **Detail pane** — react-markdown, shiki, screenshots. **~2–3 hours.**
5. **Playwright trace iframe embed** — on each `trace-action`, a Node helper spawns `npx playwright show-trace --port=<N>` and the UI iframes `http://localhost:<N>/trace/...`. **~1 hour.**
6. **Cross-run comparison** — multi-select in picker, merged timeline, session-color-coding. **~1–2 hours.**

Total: solid weekend.

## What to skip

- **OpenTelemetry / Jaeger / Grafana Tempo** — heavyweight for a local dev tool. Revisit if the tool leaves local machines.
- **Custom D3 timeline** — hours you won't get back. vis-timeline covers 95% of what you'd build.
- **A backend server** — data is tiny and static.
- **Observable Framework** — good for analytical notebooks, hard to make truly drill-in interactive with iframes.

## Location

Suggest `viewer/` at the repo root — same level as `tool/`, `mcp/`, `extension/`. Has its own `package.json` (uses React; keeps root deps clean). Ingestion script can either live inside `viewer/` or at `scripts/ingest-run.ts` if we want it callable via `npm run ingest`.

## Open questions for later

- Should historical runs be ingested on demand, or is there a watch mode that ingests as runs complete?
- What about diff-style comparison of the same scenario across two runs (e.g. "what changed in Avni between Monday and Friday")? That's a second-pass feature but worth sketching early.
- Retention: when does an old session get archived vs. deleted? Right now `output/` grows monotonically.
