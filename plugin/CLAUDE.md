# brow-use plugin

brow-use drives a real browser. The `mcp__bu__*` tools navigate, perceive
(accessibility tree, screenshots), interact (click, type), record traces, and
write artifacts (page objects, workflows, tests, feature docs, extracted
results) under `output/`.

## Confirm URL and mode before any browser action

`currentMode` lives in `.brow-use/config.json` in the current working directory.
Read the file directly with the Read tool. Shape:

```json
{ "currentMode": "playwright" | "crx" | null }
```

Rule: before any browser action, `currentMode` must be set. If it is null,
tell the user to run `/bu:use-managed-browser` or `/bu:use-session` and stop.
When mode is set, ask for the target URL if the user has not supplied one,
then confirm (URL + mode) and let them change mode before proceeding.
The `/bu:*` commands enforce this in detail — apply the same rule when driven
by a skill or an ad-hoc request.

Use the supplied URL as the navigation entry point. If the user also provides
a description, use it to inform element identification and exploration bias.

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
