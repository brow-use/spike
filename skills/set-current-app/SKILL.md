---
description: Switch to an app and navigate the browser to its URL. Use when the user wants to select or switch the active app.
allowed-tools: MCP(brow-use/set_current_app)
argument-hint: [app name or id]
---

Switch to the app matching $ARGUMENTS and navigate the browser to its URL using the `set_current_app` tool.

If $ARGUMENTS is empty or ambiguous, read the `apps://list` resource, show the available apps, and ask the user which one to switch to.

Look up the app by name (case-insensitive) or id, then call `set_current_app` with the id.
After switching, confirm the active app and the URL the browser navigated to.
