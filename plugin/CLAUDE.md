# brow-use plugin

brow-use drives a real browser. The `mcp__bu__*` tools navigate, perceive
(accessibility tree, screenshots), interact (click, type), record traces, and
write artifacts (page objects, workflows, tests, feature docs, extracted
results) under `output/`.

## Confirm app and mode before any browser action

Both `currentAppId` and `currentMode` live in `.brow-use/apps.json` in the
current working directory. There is no `apps://` MCP resource — read the
file directly with the Read tool. Shape:

```json
{ "currentAppId": "<id or null>", "currentMode": "playwright" | "crx" | null, "apps": [{ "id": "", "name": "", "url": "", "description": "", "createdAt": "" }] }
```

Rule: before any browser action, both fields must be set. If `currentAppId`
is null, tell the user to run `/bu:apps` and stop; if `currentMode` is null,
tell them to run `/bu:use-managed-browser` or `/bu:use-session` and stop.
When both are set, confirm with the user (app name + URL + mode) and let
them change either before proceeding. The `/bu:*` commands enforce this in
detail — apply the same rule when driven by a skill or an ad-hoc request.

Use the app's `url` as the navigation entry point and its `description` to
inform element identification and workflow choices.

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
