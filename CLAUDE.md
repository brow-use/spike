# brow-use (spike)

A Claude Code plugin: an MCP server (Node) + Chrome extension that exposes
browser-driving tools to other Claude Code projects. Installed into a
consuming project via `make install`.

## Two CLAUDE.md files in this repo — don't confuse them

- **This file** (root `CLAUDE.md`) — for agents working **on** brow-use
  (developing it).
- **`plugin/CLAUDE.md`** — injected into _consuming_ projects when the plugin
  is enabled there. Edit it only when changing the plugin's runtime contract,
  not when changing this repo's structure.

## Repo layout

- `mcp/` — MCP server entry point (`mcp/index.ts`) that registers every tool.
- `tool/` — one MCP tool per file (`tool/<name>.ts`); colocated tests
  (`tool/<name>.test.ts`).
- `plugin/` — plugin packaging. `plugin/commands/<name>.md` slash commands;
  `plugin/CLAUDE.md` consumer-side prompt.
- `extension/` — Chrome MV3 extension (session mode). Built into
  `dist/extension/`.
- `viewer/` — React UI for browsing recorded runs.
- `docs/` — public website (static HTML): Product, Architecture, User guide,
  Developer guide, Agent integration.
- `domain/`, `repository/`, `config/` — the project follows the building-block
  pattern from `~/.claude/CLAUDE.md` (domain objects, repositories for I/O,
  config). Currently small (`app.ts`, `app-repository.ts`).
- `scripts/` — utility scripts (trace extraction, watchers, icon generation).
- `output/` — generated artifacts (page objects, workflows, tests, traces,
  screenshots, results). Runtime; gitignored.
- `.brow-use/` — runtime state per project (`apps.json`, `runs.json`).
  Gitignored.
- `dist/` — build output. Gitignored.

Architecture and contributing details are canonical in
`docs/architecture.html` and `docs/developer-guide.html`. The per-MCP-tool
reference lives in `docs/agent-integration.html` — keep it in sync when
adding or removing tools.

## Common commands

| Task | Command |
|---|---|
| Build everything | `make build` |
| Install into Claude Code | `make install` |
| Rebuild + reinstall | `make reinstall` |
| Run MCP server in dev (direct, not via plugin) | `make dev-mcp` |
| Extract a trace into downstream artifacts | `make extract SESSION=<id>` |
| Start Chrome with remote debug port (session mode) | `make chrome` |
| Run tests | `npm test` |
| Viewer (dev) | `npm run viewer:dev` |

## Conventions

- **Adding an MCP tool** — create `tool/<name>.ts`, implement the `Tool`
  interface, register explicitly in `mcp/index.ts`. The input schema is the
  contract. Add `tool/<name>.test.ts` if behavior warrants it. Update
  `docs/agent-integration.html` so the tool appears in the reference.
- **Adding a slash command** — pure markdown in `plugin/commands/<name>.md`.
  The agent executes the markdown verbatim; no code generation.
- **Tests** — run via `node --import tsx --test` against `tool/*.test.ts` and
  `mcp/*.test.ts`. Don't introduce a separate test runner.
- **File naming** — lowercase with hyphens (per global rules); folders
  singular.

## Dev loop reality (a common trip-up)

The installed plugin runs from `dist/mcp/index.js` — the absolute path is
baked into the registered `plugin.json` at install time. After changing
code:

1. `make reinstall` (rebuilds + re-registers), and
2. restart Claude Code to load the new binary.

`make dev-mcp` runs the server directly from source for fast iteration, but
it does not flow through the installed plugin — use it when iterating on
tool logic, not on plugin packaging.

## When changes affect the public surface

If you add/remove an MCP tool, change a slash command, alter the install
flow, or change where output artifacts land, update the relevant page under
`docs/`. The HTML site is the canonical user-facing reference.
