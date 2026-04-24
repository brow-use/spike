---
disable-model-invocation: true
description: Verify the MCP server, Chrome extension, and their connection are working. Run before long-running commands like /bu:explore.
allowed-tools: MCP(bu/health_check)
---

Call `health_check` once. Parse the returned JSON and render a short human summary:

- Overall: OK or NOT OK.
- Mode: `crx` or `playwright`.
- If crx: extension version, ping round-trip (ms), selected tab URL and title (or "no tab selected").
- If playwright: whether a browser page is open, and its URL and title if so.
- MCP uptime and PID.

Then, for each entry in `issues`, show `message` followed by the `remedy` verbatim on the next line. If there are no issues, say "Everything looks good."

Do not call any other tools.
