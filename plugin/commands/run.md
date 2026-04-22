---
disable-model-invocation: true
description: Run the user's intention in the browser using whichever execution mode is currently active.
allowed-tools: MCP(bu/health_check), MCP(bu/get_accessibility_tree), MCP(bu/snapshot), MCP(bu/navigate), MCP(bu/click), MCP(bu/type)
---

Call `health_check`. If the returned `ok` is `false`, print each issue's `message` and `remedy`, then stop. Do not proceed.

Ask the user what they want to do in the browser if they haven't already stated it.

Use `get_accessibility_tree` to understand the current state of the page before each interaction.
If `get_accessibility_tree` does not provide enough information to proceed, fall back to `snapshot`.

Carry out the user's intention step by step using `navigate`, `click`, and `type` as needed.
After each significant action, call `get_accessibility_tree` to verify the outcome before proceeding.

When the intention is complete, confirm what was done.
