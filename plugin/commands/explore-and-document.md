---
disable-model-invocation: true
description: Autonomously explore the current app and produce end-user documentation of its features. Uses perceptual hashing to avoid loops; the whole run is recorded as a single Playwright trace for human verification.
allowed-tools: Read, MCP(bu/navigate), MCP(bu/click), MCP(bu/type), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/start_trace), MCP(bu/stop_trace), MCP(bu/clear_session), MCP(bu/visual_fingerprint), MCP(bu/compare_phash), MCP(bu/write_feature_doc)
---

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's URL and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first and stop.

Use the app's `description` as exploration bias: prefer actions whose accessible names overlap with words in the description. If no description is present, proceed without bias and tell the user.

## Budget

Ask the user for three values with these defaults; accept overrides:
- `maxSteps` (default 40) — hard cap on total captured pages.
- `maxLoopHits` (default 3) — consecutive duplicate fingerprints before giving up.
- `phashThreshold` (default 10) — Hamming distance for "same screen".

## Destructive-action policy

Never click, type into, or otherwise invoke an element whose accessible name matches this regex (case-insensitive):
`\b(delete|remove|cancel account|drop|destroy|deactivate|close account|erase)\b`
Skip these during enumeration; do not add them to the frontier.

## Exploration

1. Derive `sessionId = "explore-<UNIX-millis>"` once.
2. Call `start_trace`. This is the single audit artifact.
3. Navigate to the app's `url`.
4. Call `visual_fingerprint`. Parse the returned JSON; keep `{ phash, url, title }` as the first entry in an in-memory `visited` array. Maintain `contiguousLoopHits = 0` and an empty `frontier` list.

Repeat until a termination condition below is met:

a. Call `get_accessibility_tree`. From it, enumerate interactive elements (links, buttons, inputs with labels). Filter out destructive ones per the policy above.

b. If `frontier` is empty, add up to 5 promising elements from the current page (bias by description keyword overlap). Each frontier entry is `{ kind: 'click'|'type'|'navigate', selector, humanLabel }`. For `type`, include a reasonable `text` value (e.g. a sample search term from the description).

c. Pop the next unexplored action from `frontier` and execute it via `click`, `type`, or `navigate`.

d. Call `visual_fingerprint` again.

e. Call `compare_phash` with `candidate` = new phash, `known` = all phashes in `visited`, and `threshold` = `phashThreshold`. Parse the returned JSON.

f. If `matched` is true:
   - Increment `contiguousLoopHits`.
   - Drop the action you just took from consideration (it produced a duplicate).
   - Do NOT enqueue new actions from this page.
   - Continue to the next frontier item.

g. If `matched` is false:
   - Reset `contiguousLoopHits` to 0.
   - Append `{ phash, url, title }` to `visited` along with a one-line `ariaSummary` derived from the aria tree (something like "form with Name, Email, Submit" — used later to cluster features).
   - Return to step a.

h. Back-navigation: after exploring what appears to be a leaf (no new actions surface), call `navigate` to the nearest parent URL from `visited` rather than relying on browser history.

## Termination

Stop when any of the following holds:
- `frontier` is empty after considering the current page.
- `visited.length >= maxSteps`.
- `contiguousLoopHits >= maxLoopHits`.

Then:
1. Call `stop_trace` with `name = sessionId`. Note the returned path.
2. Tell the user briefly: number of pages visited, termination reason, trace path.

## Documentation

Cluster `visited` into **features** — contiguous sequences that accomplish a user-meaningful outcome (e.g. "sign in", "create an invoice", "browse products"). Use URL paths and the `ariaSummary` you recorded to group. A single visited page can belong to one feature.

For each feature, call `write_feature_doc` with `name` = kebab-case feature name and `content` following this template:

```
# <Human title>

<one-sentence plain-language summary>

## Before you start

<prerequisites like login or existing data; omit the heading if none>

## Steps

1. <what the user sees + does, in plain language>
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
- Do not embed screenshots. Visual verification is the trace.

Finally, call `write_feature_doc` once with `name = "README"` and content containing:
- The app name, URL, and description.
- A Markdown table of contents linking each feature doc written this run (one row per feature, with its one-line summary).
- A "How this was generated" footer that names the trace file: `output/trace/<sessionId>-<timestamp>.zip` and the command `npx playwright show-trace <that file>`.

## Failure modes

- If `visual_fingerprint` errors, navigate back to the last good URL from `visited` and try the next frontier item.
- If two consecutive actions produce `matched=true`, the current page is not progressing — navigate back to the nearest parent URL.
- If the extension disconnects mid-run (crx mode), stop tracing, write whatever docs you have, and surface the error to the user.
