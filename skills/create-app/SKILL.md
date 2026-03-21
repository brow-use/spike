---
description: Create a new app entry with a name, description, and URL. Use when the user wants to register a new web application.
allowed-tools: MCP(brow-use/create_app)
argument-hint: [name] [url]
---

Create a new app using the `create_app` tool.

If $ARGUMENTS is provided, extract the name and URL from it and ask only for any missing fields.
If $ARGUMENTS is empty, ask the user for name, description, and URL before calling the tool.

After creating, confirm the app was saved and show its id.
