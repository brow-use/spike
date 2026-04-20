---
disable-model-invocation: true
description: Switch to managed browser mode — launches a fresh Chromium instance fully controlled by Playwright with no login state or cookies.
allowed-tools: MCP(bu/set_mode)
---

Call `set_mode` with `mode: "playwright"`.

Then confirm to the user:
- Managed browser mode is now active
- Automation will run in a fresh Chromium instance with no login state or cookies
- A separate browser window will appear when the next browser command runs
