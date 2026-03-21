---
description: Delete a saved app by name or id. Use when the user wants to remove an app.
allowed-tools: MCP(brow-use/delete_app)
argument-hint: [app name or id]
---

Delete the app matching $ARGUMENTS using the `delete_app` tool.

If $ARGUMENTS is empty or ambiguous, read the `apps://list` resource, show the available apps, and ask the user which one to delete.

Look up the app by name (case-insensitive) or id. Ask the user to confirm before calling `delete_app`.
After deleting, confirm the app has been removed.
