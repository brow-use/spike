---
disable-model-invocation: true
description: Generate a reusable Playwright workflow function (using Playwright APIs directly — no Page Object Model) for a user-described workflow goal. Grounded in an explore run's documentation when available, falling back to the run's aria log + observed edges. No browser launched.
allowed-tools: Read, Glob, MCP(bu/read_observed_edges), MCP(bu/write_workflow)
---

## Inputs

Ask the user (if not already stated):

1. **Workflow goal** — plain English description of what the function should accomplish. Example: *"log in with the supplied credentials, then navigate to Subjects and search by name."*
2. **Function name** — camelCase (e.g. `loginAndSearchSubjects`). Used both as the exported function name and (kebab-cased + `-workflow`) as the file name.
3. **Inputs** — typed parameter list beyond `page` (e.g. `username: string, password: string, searchTerm: string`). Defer the `page: Page` parameter — the command always adds it as the first parameter.

## Grounding chain (pick the best tier; fall back as needed)

This command does NOT launch a browser. All grounding comes from prior `/bu:explore` or `/bu:explore-guided` runs.

Read `.brow-use/runs.json`. Filter entries where `command` is `"explore"` or `"explore-guided"`.

Classify each run into a tier:

- **Tier 1 — docs + aria log** *(best)*: `artifacts.ariaLog` is set, that file exists on disk, AND `output/docs/<sessionId>/README.md` exists. The user has run `make extract` followed by `/bu:document` for this session. Feature docs give semantic mapping from goal phrases ("log in", "search Subjects") to specific page transitions.
- **Tier 2 — aria log only** *(fallback)*: `artifacts.ariaLog` is set and exists, but no docs folder. The agent must map the workflow goal to pages from raw aria summaries and URL paths.
- **Tier 3 — none** *(reject)*: aria log missing on disk. The user has run explore/explore-guided but never `make extract`.

Listing rules:

1. List Tier 1 runs first (most useful), then Tier 2 runs, with a column showing the tier label.
2. If both tiers are empty: tell the user to run `/bu:explore` (or `/bu:explore-guided`) followed by `make extract SESSION=<id>` and `/bu:document` for the best results, and stop.
3. If only Tier 3 entries exist: tell the user to run `make extract SESSION=<id>` first, then re-run this command. Stop.

Ask the user to pick a run by index or sessionId. Wait for their answer.

## Resolution

From the chosen run read:

- `sessionId` — call it `sourceExploreId`.
- `artifacts.ariaLog` — required. Parse line by line: `{ stepId, url, title, ariaSummary, ariaTree, timestamp }` into a `pages` array sorted by `stepId`.
- `appId` — only used for the summary printed at the end.

If Tier 1: read every `.md` file in `output/docs/<sourceExploreId>/` using `Glob` + `Read`. Build a quick map keyed by feature slug.

Call `read_observed_edges` once with `sessionId = sourceExploreId`. Returns one edge per consecutive aria pair with `{ fromUrl, toUrl, trigger: { method, role, name, selector }, phrasing, confidence, source }`. Use this as the ground truth for navigation triggers — every `source: "sidecar"` edge is a click or navigate the agent actually performed.

## Mapping the goal to a page sequence

From the workflow goal, identify the sequence of pages the function must traverse:

1. **Tier 1 path** — read the feature docs first. Match goal phrases to features (e.g. goal = "log in" → look for a feature whose README summary mentions login). For each matched feature, read its `Steps` section to extract the sequence of pages and the verbal triggers (which carry `phrasing` from `read_observed_edges` verbatim).
2. **Tier 2 path** — work directly from `pages` (URL + ariaSummary) and the edges list. Match goal phrases to URLs / aria summaries; let edges drive transitions between consecutive pages.

State the planned page sequence to the user in one or two sentences before generating. If two plausible sequences exist (e.g. multiple login flows), ask the user which one. Otherwise proceed.

## Generation

Generate one TypeScript file. File name: kebab-case of the function name + `-workflow` (e.g. `login-and-search-subjects-workflow`). Function name: the camelCase the user provided.

Conventions:

1. **Imports** — only `import { Page } from '@playwright/test';`. **No** imports from `output/page/`. This command does not use POMs by design.
2. **Signature** — `export async function <name>(page: Page, <user-provided params>): Promise<void>`.
3. **Selectors** — derive from the aria log + observed-edges triggers, in this priority order:
   - `page.getByRole('<role>', { name: '<name>' })` whenever the aria entry's role is one of `button | link | textbox | combobox | checkbox | radio | menuitem | tab | searchbox | heading` and a non-empty name is available.
   - `page.getByLabel('<label>')` for inputs whose `ariaTree` shows a label more stable than the placeholder/name.
   - `page.getByPlaceholder('<placeholder>')` only when neither role+name nor label is available.
   - `page.locator('<selector>')` using a CSS selector copied from `edge.trigger.selector` — last resort, only when nothing semantic is available.
4. **Navigation triggers** — for every page transition in the sequence, use `edge.trigger` from `read_observed_edges`:
   - `source: "sidecar"` and `method: "click"` → emit `await page.getByRole(<role>, { name: <trigger.name> }).click();`. Trust the trigger over your own derivation.
   - `source: "sidecar"` and `method: "navigate"` → emit `await page.goto('<trigger.url>');`.
   - `source: "aria-heuristic"` (medium confidence) → emit the same form but add a one-line comment `// inferred trigger — verify if the test fails`.
   - `source: "none"` (low confidence) → don't emit a navigation step blindly. Pause and ask the user how the transition happens before continuing generation.
5. **Filling inputs** — `await page.getByRole('textbox', { name: '<name>' }).fill(<paramName>);`. Map workflow input parameters to specific aria textbox names.
6. **Waits** — for landing-page confirmation include `await page.waitForURL('<toUrl>');` only when the edge has a definite `toUrl` AND the URL is parameter-free. Otherwise skip — the workflow is a function, not a test, and overreach on assertions makes it brittle.
7. **No test assertions** beyond the URL wait above. Don't add `expect()` calls. The caller (a test, a `/bu:run-instruction` invocation, or another workflow) handles correctness checks.
8. **Comments**:
   - Tier 1 grounding: one-line comment above each logical phase, paraphrasing the feature doc's step description (not copied verbatim — keep prose tight).
   - Tier 2 grounding: no comments. The selectors speak for themselves.

## Output

Call `write_workflow` with:
- `name` — kebab-case file name including the `-workflow` suffix.
- `content` — the complete TypeScript source.

The tool writes `output/workflow/<file-name>.ts`.

## Final summary to the user

Print, in order:

1. Path to the generated file.
2. Function signature (just the line, including parameter types).
3. Grounding tier used: *"docs + aria log"* or *"aria log only"*, plus the `sourceExploreId`.
4. Edge confidence breakdown if any non-`high` edges were used: e.g. *"3 sidecar-confirmed transitions, 1 aria-heuristic, 0 unresolved."*
5. Reminder: the file uses Playwright directly — no POM imports, no test assertions — and can be called from any test or workflow with a live `Page`.

## Failure modes

- **No qualifying explore runs** — print the exact `/bu:explore` + `make extract` + `/bu:document` sequence and stop.
- **Goal cannot be mapped to any feature/page sequence** — say so plainly, list which features were considered, and ask the user to either rename the goal or run `/bu:explore` against a different starting point. Do not write a file.
- **An edge in the planned path has `source: "none"`** — pause generation and ask the user how the transition happens. Resume only with a user-supplied trigger.
