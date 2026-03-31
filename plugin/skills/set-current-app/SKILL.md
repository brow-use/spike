---
description: Switch to an app and navigate the browser to its URL. Use when the user wants to select or switch the active app.
allowed-tools: MCP(bu/set_current_app)
---

Read the `apps://list` resource, show the available apps, and ask the user which one to switch to.

Call `set_current_app` with the selected app's id.
After switching, confirm the active app and the URL the browser navigated to.
