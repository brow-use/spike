# `/bu:explore-and-document` — token profile and model choice

## 1. Token consumption profile

The command's cost is dominated by a few hotspots. Order-of-magnitude breakdown from a 23-step run against a real-world SPA (not exact):

| Phase | Per call | Calls | Subtotal (approx) | Share |
|---|---|---|---|---|
| Exploration loop input — aria trees, fingerprints, compare results held in conversation context | ~1.5K in / ~500 out | 23 | ~46K | ~30% |
| `known` array growth on `compare_fingerprint` input | 23 × ~80 bytes × cumulative | — | <1K | negligible |
| Feature-doc generation — reading conversation state + writing prose | ~3K out | 12 | ~36K out | ~25% |
| Aria-log JSONL write (one big `Write` call embedding every `ariaTree`) | ~30K out (single call) | 1 | ~30K out | ~20% |
| Screenshots — `save_screenshot` returns JSON only, no image in context | ~100 bytes | 11 | <2K | negligible |
| Fixed overhead — command markdown, `apps.json`, system prompt, system reminders | — | — | ~15K in | ~10% |
| Reasoning prose between steps | varies | throughout | ~10K out | ~10% |

**Total ballpark: 80–150K tokens for a run up to ~25 steps.** A full `maxSteps=40` exploration on a richer app easily pushes 300K+.

### The biggest expense: aria trees accumulating in context

Every `get_accessibility_tree` result stays visible for the rest of the conversation (until auto-compaction kicks in). Three things to know:

- Compact apps (short aria trees, lots of empty/error states) compress well. A richer app with 200-line aria trees per page scales worse than step count alone suggests.
- The `ariaTree` field the command writes into `output/exploration/<sessionId>.jsonl` is full accessibility text. Writing that file means the content appears in the agent's output and, depending on reply shape, in its context too. On a 40-step run this alone can be 50–100K tokens of duplicated text.
- The Playwright trace zip lives on disk only; it never enters the model's context.

## 2. Is Opus the right model?

Breaking the command into the tasks it actually performs:

| Task | Cognitive load | Model fit |
|---|---|---|
| Reading aria trees, enumerating links | Low pattern-matching | Haiku is enough |
| Picking the next frontier item | Low ordering logic | Haiku |
| Feature clustering (grouping `visited[]` into user journeys) | Moderate semantic judgment | Sonnet sweet spot |
| Writing plain-language docs for end users | Moderate creative writing | Sonnet sweet spot |
| Computing hashes, loop detection | **Offloaded to tools** — no model involved | — |

Nothing in this command requires Opus-level reasoning. The hardest decision — feature clustering — is moderate. Doc-writing quality is fine on Sonnet.

**Recommendation**

- **Default to Sonnet 4.6** for this command. Set it with `/model sonnet-4-6` before invoking. Expect roughly 1/5 the cost of Opus with comparable doc quality.
- Stick to Opus if you're debugging an unusual app or want polished docs on a first pass and cost isn't the concern.
- Avoid Haiku for this command as written — the final writing step will suffer.

## 3. Can a skill use multiple models for different tasks?

Yes, with caveats. Three approaches, in order of architectural fit:

### a) Split the command into stages, each runnable as a subagent with its own model

Claude Code subagents accept an explicit `model` parameter. Architecture:

- `subagents/explorer.md` — model: `haiku-4-5`. Runs the exploration loop; writes `output/exploration/<sessionId>.jsonl` and the Playwright trace. Returns the sessionId.
- `subagents/doc-writer.md` — model: `sonnet-4-6`. Reads the jsonl, clusters into features, writes `output/docs/<sessionId>/`. Returns the README path.

Then `/bu:explore-and-document` becomes a thin shell that dispatches to both. You pay Haiku rates for the high-volume, low-judgment exploration loop and Sonnet rates only on the final write-up. This is the cleanest pattern for this use case.

### b) Single skill, switched at runtime via `/model`

The user runs `/model sonnet-4-6` before invoking. Works today with zero code changes. Downside: the user has to remember to switch, and it doesn't distinguish stages within one run.

### c) Separate slash commands, chained manually

Split into `/bu:explore` and `/bu:document <sessionId>`. User runs them back-to-back with different models. Simpler than subagents but loses single-command UX.

### What is not possible

Switching model mid-run without a subagent boundary. The command prompt runs on whatever model invoked it.

## 4. Opportunities to replace model work with deterministic code

Before (or in addition to) moving to a cheaper model, check whether the model is doing anything a tool could do. Every token spent on mechanical work is a token paid at model rates for something that would be free in Node.

### What the model currently does that could be deterministic

| Work | Currently | Could be | Rough savings |
|---|---|---|---|
| **Filter destructive actions** (regex on aria-tree element names before adding to frontier) | Model reads every aria element and applies the regex itself | New tool `enumerate_interactive_elements(ariaText, bias?)` returns `{role, name, selector, href, kind}[]` **with destructive elements already stripped server-side** | ~10–15% input reduction (model never sees filtered-out rows) plus stronger safety — the model cannot accidentally invoke what it cannot see |
| **Enumerate top-level links for Coverage rule** | Model parses the first page's aria tree and queues up to 8–15 `{kind:'navigate', url, humanLabel}` items | Same `enumerate_interactive_elements` tool with a `topLevelOnly: true` flag that returns only items marked `role=link` at depth ≤ 1 | Few K tokens per run; more importantly, deterministic consistency (the model sometimes misses a link or duplicates one) |
| **Write the aria-tree JSONL log** | Model types the entire `output/exploration/<sessionId>.jsonl` as a single `Write` call — includes every `ariaTree` verbatim, often 30K+ output tokens | New tool `write_exploration_log(sessionId, entries)` that takes `entries: [{stepId, phash, ariaHash, url, title, ariaSummary, ariaTree, timestamp}]` and writes the file | **~30K output tokens saved per run** — the single biggest line-item after the exploration loop. Also avoids JSON-escape bugs |
| **Build README TOC** | Model writes the table linking each feature file, with a hand-authored one-line summary per feature | New tool `write_docs_index(sessionId, entries)` that takes `entries: [{slug, title, summary}]` and writes the `README.md` table. The model supplies the 3 fields; the tool renders Markdown | ~2–3K output tokens and zero formatting drift |
| **Compose Markdown image links** | Model writes `![alt](../../exploration/.../foo.png)` by hand, often with a typo after the first few | `save_screenshot` returns `markdownSnippet: "![${alt}](${relToDocs})"` as a bonus field; model embeds it verbatim | Small token savings, bigger reliability win |
| **Step counter** | Model maintains `stepId` in conversation state and often renumbers mid-run when it loses track | Either `page_fingerprint` returns a monotonic `stepId`, or the counter lives in the `write_exploration_log` side | Avoids the occasional renumber bug; negligible tokens |

### What is genuinely model work and should stay

- **Feature clustering.** Deciding that steps 5, 6, 7 together form "Finding a subject" is semantic judgement that needs an LLM. A simple URL-prefix heuristic clusters everything under `/#/app/` into one bucket, which is wrong.
- **Plain-language doc writing.** Generative prose at an end-user reading level is exactly what a model is for. No deterministic substitute.
- **One-line feature summaries for the README.** Close to clustering; could in theory be the first sentence of each feature doc, but the model writes better summaries than a `split('.')[0]`.
- **Bias selection by app description keyword overlap.** Fuzzy. A token-intersection scorer would work for "Data Entry App" but miss "individuals" → Subject Types. Keep this in the model.
- **Plan narration ("I'll go to Search, filter Excavating Machine…")** — user-facing context that the model is uniquely good at.

### Priority order for implementation

1. **`write_exploration_log`** — biggest single win, ~30K out tokens, pure file-writer with no browser dependency. Trivial to add.
2. **`enumerate_interactive_elements`** — improves both cost and safety. Needs an aria-tree parser (or can be a thin `page.locator(...)` pair in the tool, running in the same page context as `get_accessibility_tree`). Moderate effort.
3. **`write_docs_index`** — small win, but makes the output structure more consistent across runs.
4. **`save_screenshot` markdown-snippet bonus field** — one line added to the existing tool.

Steps 1 and 4 are ~30-line changes each. Step 2 is a new tool (~50 lines). Step 3 mirrors step 1. None touch the extension; all live in `tool/` + `mcp/index.ts`.

### Combined with model choice

The deterministic offloads stack multiplicatively with switching to Sonnet:

- Current: Opus, everything in model → baseline (call it 1×).
- Sonnet only → ~0.2× cost, same work profile.
- Opus + offloads → ~0.7× cost (saves ~30% of tokens that were doing mechanical work), same model quality.
- Sonnet + offloads → ~0.14× cost.
- Subagent split (Haiku for loop + Sonnet for write-up) + offloads → ~0.08× cost, with the lowest-cost model doing work that is now even smaller.

## Recommendation

Do **the deterministic offloads first**, then switch models. The offloads pay back within one run and help every model (including Opus when you choose to use it). Specifically:

1. Add `write_exploration_log` and `enumerate_interactive_elements` as new tools. Update the command to use them. This is ~100 lines of code and cuts cost ~30% at any model tier.
2. Default the command to **Sonnet 4.6** once the offloads are in place.
3. If cost still matters, pursue the subagent split (§3a): Haiku runs the exploration loop against a small context; Sonnet does the feature clustering and doc writing against the jsonl.

If you just want to confirm Opus is worth it today, try §3b — run the same command on Sonnet once and diff the output.
