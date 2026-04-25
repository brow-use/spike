import type { Tool, ToolContext } from './tool.js'
import { computeObservedEdges } from './observed-edges.js'

export const readObservedEdges: Tool = {
  name: 'read_observed_edges',
  description: 'Build the canonical list of navigation edges for an explore run by correlating output/trace/<sessionId>-actions.jsonl (the sidecar, ground-truth clicks/navigates recorded while the agent ran) with output/exploration/<sessionId>.jsonl (per-page aria snapshots). Call this once at the start of /bu:document and /bu:generate-page-objects instead of re-deriving edges from aria alone. Returns { edges: [{ fromStepId, fromUrl, fromTitle, toStepId, toUrl, toTitle, trigger: { method, role, name, selector, text, url }, phrasing, confidence, source }], sidecarFound, sidecarActions, ariaPages, counts }. confidence is "high" for sidecar-matched edges and strong aria link/url matches, "medium" for aria link-name-match guesses, "low" when no signal was found. source indicates where the match came from: "sidecar" (observed click/navigate), "aria-heuristic" (inferred from page contents), "none" (neutral fallback). Requires that `make extract SESSION=<sessionId>` has been run first to produce the aria log. Read-only — no browser needed.',
  inputSchema: {
    type: 'object',
    properties: {
      sessionId: {
        type: 'string',
        description: 'Explore run session id. Used to locate output/exploration/<sessionId>.jsonl and output/trace/<sessionId>-actions.jsonl.',
      },
    },
    required: ['sessionId'],
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const sessionId = input.sessionId as string
    const result = computeObservedEdges(sessionId, ctx.outputDir)
    return JSON.stringify(result)
  },
}
