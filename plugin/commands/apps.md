---
disable-model-invocation: true
description: Manage saved apps — list, create, delete, or set the current app. Use when the user wants to view, add, remove, or switch apps.
allowed-tools: Read, Write, Bash
---

Apps are stored in `.brow-use/apps.json` in the current working directory. The file has this shape:
```json
{ "currentAppId": "<id or null>", "apps": [{ "id": "", "name": "", "description": "", "url": "", "createdAt": "" }] }
```

Read the file if it exists. If it does not exist, treat the store as `{ "currentAppId": null, "apps": [] }`.

Ask the user what they want to do if they haven't already stated it. Options: list, create, delete, set current.

**List** — display apps in a table showing id, name, URL, and description. Mark the current app.

**Create** — ask for name, URL, and description. Generate a UUID for id and use the current ISO timestamp for createdAt. Append to apps array and write the file.

**Delete** — show the list, ask which app to delete, confirm, then remove it. If it was the current app, set currentAppId to null.

**Set current** — show the list, ask which app to set as current, update currentAppId, and write the file.
