# brow-use

**Browser automation for Claude Code.** Drive a real browser from plain English —
get the answer back, or generate the Playwright tests.

brow-use is a Claude Code plugin: an MCP server plus a Chrome extension that give
an agent tools to navigate, perceive, and act on live web applications. The agent
reads the **accessibility tree** at every step — the same semantic view screen
readers use — so it sees what's actually on the page instead of guessing at
selectors from a screenshot.

> Status: spike / `v0.1.0`. APIs and artifact layouts are still moving.

---

## What you can do with it

Four capabilities, all powered by the same browser-driving loop. Each is usable on
its own; together they compose.

| | Capability |
|---|---|
| **Build test infrastructure** | Generate typed Playwright Page Object classes and reusable workflow functions from real, recorded interactions with a live app — not guessed from screenshots. |
| **Fetch data in natural language** | Describe what you need ("export the active subscriber list as CSV") and get it in the format you asked for. Works behind authentication without sharing credentials with the model. |
| **Perform actions in natural language** | Describe the outcome ("file this expense report"); the agent carries it out and leaves a forensic record — a Playwright trace plus a reasoning log. |
| **Document an application** | Produce end-user feature docs for a whole web app: one page per cluster of screens, embedded screenshots, a navigation map, no developer jargon. |

Everything the agent does is recorded as a Playwright trace, so a human can replay
and verify the run afterwards.

---

## How it works

```
Claude Code  ──MCP──▶  brow-use MCP server  ──┬──▶  Playwright Chromium   (managed mode)
                              │               │
                              │               └──▶  Chrome extension ─▶ your real Chrome  (session mode)
                              ▼
                      output/  ──▶  page objects · workflows · tests · docs · traces · results
```

The MCP server registers ~29 tools over stdio (or HTTP). Slash commands under
`/bu:*` are pure markdown playbooks that orchestrate those tools — no code
generation in the command layer.

### Two browser modes

| Mode | What it drives | Use when |
|---|---|---|
| **Managed** (`playwright`, default) | A fresh Chromium launched by Playwright — no cookies, no login state | Public apps, clean-room runs |
| **Session** (`crx`) | Your real Chrome, via the brow-use extension and `playwright-crx` | The target app needs your existing login |

Session mode means the agent works inside an already-authenticated browser, so
credentials never reach the model. Switch modes with `/bu:use-managed-browser` or
`/bu:use-session`.

---

## Requirements

- **Node 24.12.0** (pinned in `.nvmrc` — `nvm use`)
- **Claude Code** with plugin support
- **Google Chrome** (only for session mode)

## Install

Install brow-use as a plugin into Claude Code:

```bash
nvm use
npm install
make install        # builds, registers this repo as a marketplace, installs the `bu` plugin
```

Restart Claude Code so it picks up the plugin, then run `/bu:health` to verify the
server and browser are wired up.

To copy the plugin into a consuming project with no reference back to this repo:

```bash
make install-local PROJECT=../my-app
```

### Session mode setup (optional)

Session mode drives your own Chrome and needs the extension loaded once:

1. `make build` (produces `dist/extension/`)
2. Chrome → `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `dist/extension/`
3. In Claude Code: `/bu:use-session`

`make package-extension` zips the built extension for distribution.

---

## Usage

From any project where the plugin is enabled:

```
/bu:use-session                  # or /bu:use-managed-browser
/bu:health                       # verify server + extension + browser
/bu:explore                      # autonomously crawl the app, capture an aria log per page
/bu:document                     # turn that log into plain-English feature docs
/bu:generate-page-objects        # turn that log into Playwright Page Objects
/bu:run-instruction              # "get me the list of active users as CSV"
```

### All slash commands

| Command | What it does |
|---|---|
| `/bu:use-managed-browser` | Switch to a fresh Playwright Chromium |
| `/bu:use-session` | Switch to your logged-in Chrome via the extension |
| `/bu:health` | Check MCP server, extension, and browser connectivity |
| `/bu:explore` | Autonomously explore an app; perceptual hashing prevents loops |
| `/bu:explore-guided` | Explore while carrying out a described intention |
| `/bu:document` | Generate end-user feature docs from an explore run (no browser) |
| `/bu:generate-page-objects` | Generate Playwright Page Objects from an explore run (no browser) |
| `/bu:generate-workflow-function` | Generate a reusable Playwright workflow function for a stated goal |
| `/bu:run-instruction` | Carry out a plain-English intention and return extracted data |
| `/bu:investigate` | Run a small browser action and investigate something about it |
| `/bu:setup-project` | Scaffold or complete a Playwright TypeScript project |

The doc/codegen commands are **read-only over recorded artifacts** — they launch no
browser, so they're deterministic and cheap to re-run.

### Where output lands

Runtime state and artifacts are written into the *consuming* project:

```
.brow-use/           config.json (currentMode) · runs.json (run index) · mcp.log
output/
  page/              generated Page Object classes
  workflow/          generated workflow functions
  trace/             Playwright traces (replayable)
  docs/              generated feature documentation
  exploration/       per-page aria logs + screenshots
  reasoning/         agent reasoning logs
```

Both directories are gitignored. Browse recorded runs visually with
`npm run viewer:dev`.

---

## Development

```bash
make build            # MCP server + Chrome extension
make dev-mcp          # run the MCP server from source (stdio) — fast iteration
make serve-mcp        # run standalone over HTTP at http://127.0.0.1:3457/mcp
make serve-mcp-dev    # same, restarting on source changes
npm test              # node --import tsx --test
npm run viewer:dev    # React viewer for recorded runs
make extract SESSION=<id>   # post-process a trace into downstream artifacts
make help             # all targets
```

### Dev loop gotcha

The **installed** plugin runs from `dist/mcp/index.js` — that absolute path is baked
into `plugin.json` at install time. After changing code you must `make reinstall`
**and restart Claude Code**. `make dev-mcp` bypasses the installed plugin entirely;
use it when iterating on tool logic, not on plugin packaging.

### Repo layout

| Path | Contents |
|---|---|
| `mcp/` | MCP server entry point; registers every tool, owns stdio/HTTP transports and the extension WebSocket |
| `tool/` | One MCP tool per file (`tool/<name>.ts`) with colocated `*.test.ts` |
| `plugin/` | Plugin packaging — `commands/*.md` slash commands, `CLAUDE.md` injected into consuming projects |
| `extension/` | Chrome MV3 extension for session mode |
| `viewer/` | React UI for browsing recorded runs |
| `domain/`, `repository/`, `config/` | Domain objects, I/O boundaries, configuration |
| `scripts/` | Trace extraction, watchers, icon generation |
| `docs/` | Public static site — canonical user-facing reference |

### Conventions

- **Adding a tool** — create `tool/<name>.ts` implementing the `Tool` interface,
  register it explicitly in `mcp/index.ts`, and update `docs/agent-integration.html`.
  The input schema is the contract.
- **Adding a slash command** — pure markdown in `plugin/commands/<name>.md`. The
  agent executes it verbatim.
- **Tests** — `node --import tsx --test`. Don't introduce a second test runner.
- **File naming** — lowercase-with-hyphens; folder names singular.
- **Two CLAUDE.md files** — the root one is for agents working *on* brow-use;
  `plugin/CLAUDE.md` is injected into *consuming* projects. Don't confuse them.

Anything touching the public surface (tools, commands, install flow, artifact
locations) should be reflected in `docs/`.

## Docs

The static site under `docs/` is the canonical reference:

- `docs/index.html` — product overview
- `docs/architecture.html` — how the pieces fit
- `docs/user-guide.html` — day-to-day usage
- `docs/developer-guide.html` — contributing
- `docs/agent-integration.html` — per-tool MCP reference
- `docs/session-mode.html`, `docs/chrome-extension.html` — session mode internals
