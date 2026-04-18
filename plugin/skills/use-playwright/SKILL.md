---
description: Switch back to default Playwright mode — launches a fresh Chromium instance managed by Playwright.
allowed-tools: MCP(bu/set_mode)
---

Call `set_mode` with `mode: "playwright"`.

Then confirm to the user:
- Mode 1 (Playwright) is now active
- Automation will run in a fresh Chromium instance with no login state or cookies
- A separate browser window will appear when the next browser command runs
