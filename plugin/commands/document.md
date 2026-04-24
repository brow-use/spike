---
disable-model-invocation: true
description: Generate end-user feature documentation from the aria-tree log of an earlier /bu:explore run. Uses the live browser only to capture screenshots; all narrative is derived from the recorded aria trees, so the doc pass is deterministic and re-runnable.
allowed-tools: Read, Glob, MCP(bu/health_check), MCP(bu/navigate), MCP(bu/save_screenshot), MCP(bu/write_feature_doc), MCP(bu/write_docs_index), MCP(bu/log_reasoning)
---

## Preflight

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy` and stop.

Read `.brow-use/runs.json`. Filter entries where `command === "explore"`. If none exist, tell the user to run `/bu:explore` first and stop.

List the available runs as a table: index, sessionId, date (from `startedAt`), pages visited, termination reason. Ask the user to pick by index or sessionId. Wait for their answer before proceeding.

## Resolution

From the chosen run read:
- `sessionId` — call it `sourceExploreId`. All outputs this command writes are scoped under this id, so re-running the command overwrites cleanly.
- `artifacts.ariaLog` — required. If the key is missing or the file does not exist on disk, tell the user and stop.
- `appId` — needed for looking up app metadata below.

Read `.brow-use/apps.json` and find the app whose id matches the run's `appId`. Keep its `name`, `url`, and `description` — you will pass them to `write_docs_index` later. If the app is no longer in `apps.json`, proceed with the sessionId alone and note it in the summary.

Read the aria log file line by line. Each line is a JSON object: `{ stepId, url, title, ariaSummary, ariaTree, timestamp }`. Parse all lines into a working array `pages` sorted by `stepId` ascending.

## Feature clustering

Group `pages` into **features** — each feature is a contiguous or URL-related sequence that accomplishes one user-meaningful outcome (e.g. "sign in", "browse subjects", "configure the app").

Signals to use:
- **URL path prefix** — pages sharing the same leading hash-path segment usually belong together (e.g. `/#/app` and `/#/app/search` are both "Data Entry App"; `/#/admin/*` pages are "Admin").
- **`ariaSummary`** — two pages whose summaries describe related UI (e.g. a search form and its results page) belong to the same feature even if paths differ.
- **stepId adjacency** — consecutive steps often belong together, but not always (the exploration command is breadth-first across top-level modules).

A single page belongs to only one feature. Pages that serve as navigation hubs (the root/home) may form a single "Getting around" feature.

## Navigation inference (covers the subtle risk)

To narrate "the user selects X to get to the next page" you need to know which click caused each transition. The aria log records resulting page states, not actions taken — so infer navigation edges up-front and reuse them throughout the command.

For every consecutive pair `(pages[N], pages[N+1])` run the following rules in order and record an `edge` object:

1. **Link-with-URL match.** Scan `pages[N].ariaTree` for `link <Name> <url>` entries. If a link's URL matches `pages[N+1].url`, the trigger is `"select <Name>"`. Set `confidence = "high"`.
2. **Link-name match (SPA click handlers).** If no link URL matches (common in SPA apps that use click handlers without `href`), scan for a `link <Name>` or `button <Name>` on `pages[N]` whose name appears prominently in `pages[N+1].title` or `ariaSummary`. The trigger is still `"select <Name>"`. Set `confidence = "medium"`.
3. **Fallback.** If neither matches, use neutral phrasing (`"open the record"`, `"go to the next screen"`), set `confidence = "low"`, and record one `log_reasoning` entry of `kind: "decision"` explaining that the edge could not be recovered from the aria log for step `N → N+1`. Do not call `log_reasoning` again for the same edge.

Shape of each `edge` object (keep it in memory for the rest of the command):

```
{
  fromStepId, fromUrl, fromTitle,
  toStepId,   toUrl,   toTitle,
  viaRole,     // "link" | "button" | null
  viaName,     // accessible name of the trigger, or null
  phrasing,    // the plain-language phrase to use in docs: "select Save", "open the record", etc.
  confidence,  // "high" | "medium" | "low"
  crossFeature // bool, filled in later after feature clustering
}
```

Do not manufacture steps that aren't in the aria log. If a feature has only one page, the narrative describes that single page.

After feature clustering runs, set `edge.crossFeature = true` whenever `fromStepId` and `toStepId` belong to different features. These edges power the "How to get here" and "Where you can go next" sections of each feature doc.

## Reasoning log (call sparingly)

Call `log_reasoning` with `sessionId = sourceExploreId` only at **non-obvious** decisions:
- A feature clustering call a reader couldn't re-derive from URL + `ariaSummary` alone (e.g. merging two different URL prefixes into one feature).
- A navigation edge that fell back to neutral phrasing (rule 3 above).
- Skipping a page from the docs entirely (e.g. it was a redirect page with no user content).

Do NOT narrate every feature, every screenshot, or every successful navigation inference.

## Documentation

For each feature:

1. Decide which pages warrant a screenshot — typically the feature's entry page and each page where the user makes a meaningful decision. Skip intermediate loading screens and pages that duplicate what a prior screenshot already shows.

2. For each screenshot point:
   - Call `navigate` with the exact `url` from the aria log entry.
   - Call `save_screenshot` with `sessionId = sourceExploreId`, a descriptive kebab-case `name` (e.g. `data-entry-app-step-2`), and an `alt` text. Use the returned `markdownSnippet` verbatim in the doc.
   - Do NOT hand-type `![...](../../exploration/...)` — always use the snippet.

3. Call `write_feature_doc` with `sessionId = sourceExploreId`, `name` = kebab-case feature name, and `content` following this template:

```
# <Human title>

<one-sentence plain-language summary>

## How to get here

<One line per incoming cross-feature edge: "From the **<fromTitle>** screen, <phrasing>."; omit the heading if there are none.>

## Before you start

<prerequisites like login or existing data; omit the heading if none>

## Steps

1. <what the user sees + does, in plain language. When narrating a transition from the prior step, reuse the edge's `phrasing` verbatim so the wording stays consistent with page-transitions.md.>

   ![Step description](<relativeToDocs from save_screenshot>)

2. ...

## What happens next

<observed outcome>

## Where you can go next

<One line per outgoing cross-feature edge: "To reach **<toTitle>**, <phrasing>."; omit the heading if there are none.>

## Tips

<optional>
```

Tone rules:
- Second person ("you").
- No developer jargon: no "selector", "DOM", "click handler", "element", code fences.
- Describe what the user sees and does, not how the app implements it.
- Embed screenshots only where they aid user understanding.

## Page transitions index

After all feature docs are written, emit a single run-wide index of every inferred edge. Call `write_feature_doc` with:
- `sessionId = sourceExploreId`
- `name = "page-transitions"`
- `content` matching the template below.

```
# Page transitions

One row per inferred navigation edge from this exploration. `Trigger` is the human-readable phrase used elsewhere in the docs. Low-confidence rows are edges where the aria log did not contain an explicit link or button matching the landing page — the trigger there is a plain-language guess.

| From | To | Trigger | Confidence | Feature |
|------|----|---------|------------|---------|
| <fromTitle> (<fromStepId>) | <toTitle> (<toStepId>) | <phrasing> | <confidence> | <same-feature name, or "cross: <from-feature> → <to-feature>"> |
| ... | ... | ... | ... | ... |
```

Sort rows by `fromStepId` ascending, then `toStepId`. Emit one row per edge even when multiple edges share the same (from, to) with different triggers. If the edges list is empty (single-page run), write only the heading paragraph and skip the table.

Finally, call `write_docs_index` to emit the README:
- `sessionId = sourceExploreId`, `appName`, `appUrl`, `appDescription` (from the `apps.json` lookup above; pass empty strings if the app entry was missing).
- `entries` — an array of `{slug, title, summary}`, one per feature doc written. `slug` matches the doc filename without `.md`; `title` is the human title; `summary` is one plain-language sentence.
- `stats` — optionally `{pagesVisited: pages.length}`.

The tool renders the TOC table and the standard footer. Do NOT write the README via `write_feature_doc(name="README", ...)` — that path requires you to hand-format the table + footer and drifts across runs.

All feature docs, the README, and the screenshots are scoped under `<sourceExploreId>`, so re-running the command on the same explore overwrites its own output cleanly.

## Summary to the user

Print briefly:
- Number of features documented and their names.
- Docs path: `output/docs/<sourceExploreId>/` (lists `page-transitions.md` alongside the feature docs and README).
- Screenshots path: `output/exploration/<sourceExploreId>/`.
- Number of edges: total, split by confidence (`high`/`medium`/`low`).
- Any features whose narratives fell back to neutral navigation phrasing (rule 3).

## Failure modes

- If `save_screenshot` fails for a page (e.g. the app requires state that is no longer present), skip that image — write the doc without it and record a `log_reasoning` entry of `kind: "error"`. Do not abort the whole run.
- If the extension disconnects (crx mode), stop at the current feature, write a README with whatever features completed, and surface the error.
- If a feature has zero pages worth screenshotting, write its doc text-only — that is a valid output.
