---
disable-model-invocation: true
description: Generate Playwright Page Object Model classes from the aria-tree log of an explore run. No browser required — works entirely from the captured exploration data.
allowed-tools: Read, Glob, MCP(bu/read_observed_edges), MCP(bu/read_pom_summary), MCP(bu/write_page_object)
---

## Preflight: pick a run

Read `.brow-use/runs.json`. Filter entries where `command === "explore"`. If no such entries exist, tell the user to run `/bu:explore` first and stop.

List the available runs to the user as a table with columns: index, sessionId, date (from `startedAt`), pages visited, termination reason.

Ask the user to pick one by index or sessionId. Wait for their answer before proceeding.

## Resolution

From the chosen run entry read:
- `artifacts.ariaLog` — required. If the key is missing or the file does not exist on disk, tell the user to run `make extract SESSION=<sessionId>` first, then re-run this command. Stop.
- `mode` — carry forward for `record_run`.

Read the aria log file. Each line is a JSON object: `{ stepId, url, title, ariaSummary, ariaTree, tab?, timestamp }`. Parse all lines into a working array `pages`. The optional `tab` field is present on tab-panel entries: pages whose `stepId` has the form `<baseStepId>-<n>` (e.g. `0004-1`) and whose `url` is the base url with a `#tab=<...>` fragment. These are the panels captured by the explore Tab sweep — one entry per in-page tab of a tabbed page.

## Deduplication

Compute a **base URL** for every page by stripping any `#tab=...` fragment from its `url`. Group `pages` by base URL. Each group becomes one page object (a tabbed page is a single class, never one class per panel). Within a group:

- The **base page** is the entry whose `stepId` has no `-<n>` panel suffix (the entry whose `url` has no `#tab=` fragment). If several share the base URL with no fragment, keep the one with the longest `ariaTree`.
- The **panels** are the remaining entries (those with a `tab` field / `#tab=` fragment), one per tab, keyed by `tab` name.

Result: a deduplicated map of `baseUrl → { base, panels: [{ tab, stepId, url, ariaTree, ... }] }`. A page with no tabs simply has `panels: []`.

## Pass 1 — Name map (in memory only, no files written)

For each unique page derive:

**Class name** — PascalCase from the URL path + "Page":
- Take the last two non-empty path segments; join with a space; PascalCase each word; append "Page".
- If the path is `/` or empty, use the page `title` instead.
- Examples: `/search/results` → `SearchResultsPage`, `/` with title "Home" → `HomePage`, `/admin/users/edit` → `UsersEditPage`.

**File name** — kebab-case of the class name: `SearchResultsPage` → `search-results-page`.

**Elements** — parse the `ariaTree` text. Collect every item whose role is one of: `button`, `link`, `textbox`, `combobox`, `checkbox`, `radio`, `menuitem`, `tab`, `searchbox`. For each record `{ role, name }`. Discard items with an empty name or a name that is a single character.

For a **tabbed page** (one with panels), attribute elements so each panel's controls stay scoped and names don't collide:

- **Parent elements**: every `role: tab` element (the tablist), plus any element present in the base page *and* in every panel (shared chrome). These go on the parent class.
- **Panel elements**: for each panel, the elements in that panel's `ariaTree` that are not parent elements. These go on that panel's own class.
- Derive a **panel key** from the `tab` name: camelCase the tab name and append `Panel` (e.g. "Apple Apps" → `appleAppsPanel`; class `AppleAppsPanel`). Derive a **tab locator** name the same way with a `Tab` suffix (e.g. `appleAppsTab`).

**Navigation edges** — call `read_observed_edges` once with the chosen `sessionId`. It returns ground-truth transitions recorded in the trace sidecar (every click and navigate the agent actually performed), with a trigger element `{ role, name, selector, text, url }` and a `confidence` field. Use this list as the primary source for typing navigation methods:

1. For each edge with `source: "sidecar"` and a `trigger.role + trigger.name`:
   - Find the element in the `from` page's element list whose role+name match the trigger. The `async` method that clicks (or types into, for form submits) that element returns the `to` page's class.
   - For edges whose trigger is a `navigate`/`goto` with no clickable element in the `from` page (e.g. same-URL state changes triggered by `button` clicks), still type the relevant element's method based on `trigger.selector` / `trigger.name`.
2. For edges with `source: "aria-heuristic"` and `confidence: "high"` or `"medium"` (URL-match or name-match fallbacks the tool derived when the sidecar was silent): apply the same element→return-type rule — these are best-guess but still more reliable than pure URL-equality.
3. For edges with `source: "none"` (`confidence: "low"`): do NOT type the destination. Leave the corresponding action method returning `Promise<void>` and note the limitation in a comment on the class — we don't claim destinations we didn't observe.
4. Additional URL-match fallback for links that were never exercised: for any `link` element in a page whose `/url` matches another page in the map but for which no edge was recorded, type the method with that page's class. This gives typed coverage for unvisited-but-linkable pages.

Prefer (1) over (4): if the same link was both visited (observed edge) and URL-matchable, the observed edge's trigger is the source of truth.

## Pass 2 — Generation

Before writing anything, list all files in `output/page/` using `Glob`. For each file found call `read_pom_summary` — returns `{ className, locators, methods, urlHints, siblingImports }`. Build a summary map keyed by file path.

For each page in the name map:

1. Determine whether an existing file covers this page:
   - **Exact match**: a file named `<file-name>.ts` already exists.
   - **Likely match**: a file with a different name has a `className` or `urlHints` entry that matches — ask the user to confirm before treating it as a match.
   - **No match**: no existing file is related.

2. On confirmed match (exact or user-confirmed): merge — add only locators and methods whose name is not already present in the summary, then overwrite using `write_page_object`. Ensure the recorded-URL comment (see below) is present at the top; add it if the existing file lacks one.

3. On no match: create a new file using `write_page_object`. Follow these conventions:
   - The first line of the file is a comment recording the URL the page was captured from: `// Recorded from: <baseUrl>`. This ties the generated class back to the exact page in the explore run.
   - Constructor accepts `Page` from `@playwright/test`.
   - One `readonly` locator property per element using accessible selectors (`getByRole`, `getByLabel`, `getByPlaceholder`). Avoid CSS selectors.
   - One `async` method per distinct user action (submit a form, trigger a primary action, navigate away).
   - Methods that navigate to another known page return the correct next page object type from the name map.
   - Import all referenced page classes from their file names in the same `output/page/` directory.
   - Include a `goto()` method if the page has a stable, non-parameterised URL.

### Tabbed pages — composed panel classes

When the page has panels, generate one parent class plus one panel class per tab, all in the **same file** (panels are not independently navigable, so they don't get their own files):

- The **parent class** owns: the `goto()`, one `readonly` tab locator per tab (`getByRole('tab', { name })`), the parent (shared) element locators, and one `readonly` panel property per tab instantiated as `new <TabName>Panel(this.page)`. Add one `async open<TabName>()` method per tab that clicks the tab locator and returns the corresponding panel property (typed as that panel class).
- Each **panel class** is a plain class in the same file taking `Page` in its constructor, holding only that panel's scoped element locators. It is not exported as the page's default; only the parent class is the page object.
- Do not flatten panel elements onto the parent, and do not emit a `selectTab` string-enum method — the typed `open<TabName>()` methods replace it.

Shape:

```ts
// Recorded from: https://app/apps/mlp
import { Page } from '@playwright/test';

export class AppsMlpPage {
  constructor(private page: Page) {}
  readonly appleAppsTab = this.page.getByRole('tab', { name: 'Apple Apps' });
  readonly enterpriseStoreTab = this.page.getByRole('tab', { name: 'Enterprise Store' });
  readonly applePanel = new AppleAppsPanel(this.page);
  readonly enterprisePanel = new EnterpriseStorePanel(this.page);

  async goto() { await this.page.goto('https://app/apps/mlp'); }
  async openApple() { await this.appleAppsTab.click(); return this.applePanel; }
  async openEnterprise() { await this.enterpriseStoreTab.click(); return this.enterprisePanel; }
}

class AppleAppsPanel {
  constructor(private page: Page) {}
  readonly search = this.page.getByRole('textbox', { name: 'Search apps' });
}

class EnterpriseStorePanel {
  constructor(private page: Page) {}
  readonly addAppButton = this.page.getByRole('button', { name: 'Add App' });
}
```

### Provenance (every `write_page_object` call)

Pass these so the viewer can link the class back to its screenshots, aria trees, and tab panels:

- `sessionId` — the chosen explore run's sessionId.
- `sources` — one entry per captured step this class was built from: `{ stepId, url, tab? }`. Include the base page (`{ stepId: <baseStepId>, url: <baseUrl> }`) and, for a tabbed page, one entry per panel (`{ stepId: <baseStepId>-<n>, url: <panel url>, tab: <tab name> }`). Use the exact `stepId` and `url` values from the aria-log entries — the ingest matches on `stepId` first, then `url`.

After all files are written, tell the user: how many files were created, how many were updated, and list their paths.
