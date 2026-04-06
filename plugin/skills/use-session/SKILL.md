---
description: Switch to extension mode for automating the user's logged-in Chrome session using playwright-crx.
allowed-tools: MCP(bu/set_mode)
---

Call `set_mode` with `mode: "crx"`.

Then confirm to the user:
- Mode 2 (extension) is now active
- Automation will run in their real Chrome browser with their logged-in session
- The brow-use extension must be loaded in Chrome (`chrome://extensions` → Load unpacked → `dist/extension/`)
- The yellow "DevTools is debugging this browser" banner is expected and normal

To switch back to a fresh Chromium session, call `set_mode` with `mode: "playwright"`.
