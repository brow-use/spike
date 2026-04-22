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

## Recommendation

If token cost is hurting, pursue **(a)** — split the command into subagents with distinct model assignments. It's the biggest structural win and the pattern generalises to other brow-use commands that mix cheap mechanical work with expensive writing. If cost is fine and you just want to confirm Opus is worth it, try **(b)** — run the same command on Sonnet once and diff the output.
