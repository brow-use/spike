---
disable-model-invocation: true
description: List all saved apps. Use when the user wants to see what apps are registered.
allowed-tools: MCP(bu/list_apps)
---

Read the `apps://list` resource and display the saved apps in a readable table showing id, name, URL, and description.

If no apps exist, tell the user to run /bu:create-app to add one.
