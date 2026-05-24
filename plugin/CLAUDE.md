# brow-use plugin

brow-use drives a real browser. The `mcp__bu__*` tools navigate, perceive
(accessibility tree, screenshots), interact (click, type), record traces, and
write artifacts (page objects, workflows, tests, feature docs, extracted
results) under `output/`.

## Read app context before any browser action

App state lives in `.brow-use/apps.json` in the current working directory.
There is no `apps://` MCP resource — read the file directly with the Read
tool. Shape:

```json
{ "currentAppId": "<id or null>", "apps": [{ "id": "", "name": "", "url": "", "description": "", "createdAt": "" }] }
```

Find the app whose `id` matches `currentAppId`. Use its `url` as the
navigation entry point and its `description` to inform element identification
and workflow choices.

If the file does not exist or `currentAppId` is null, tell the user to run
`/bu:apps` and stop.

## Modes

- **Playwright** (default) — fresh Chromium, no login state.
- **Session (crx)** — drives the user's real Chrome via the brow-use
  extension. Use when the target app requires authentication.

Switch with `mcp__bu__set_mode`.

## Conventions

- Prefer `mcp__bu__get_accessibility_tree` over `mcp__bu__snapshot` for
  perception — it's cheaper and gives stable accessible selectors.
- End every browser-driving run with `mcp__bu__record_run` so downstream
  commands can discover it via `.brow-use/runs.json`.

## Driven by a skill rather than a slash command?

The same conventions apply. The full per-tool reference and a skill template
live at `docs/agent-integration.html` in the brow-use repo.
