---
disable-model-invocation: true
description: Create a Playwright test using existing page objects in the project. Asks for the scenario, reads available page objects, and writes a spec file.
allowed-tools: Read, Write, Bash
---

Read `.brow-use/apps.json` and find the app whose id matches `currentAppId` to get the active app's name and description.
If the file does not exist or `currentAppId` is null, tell the user to run `/bu:apps` first.

Ask the user to describe the test scenario they want to create.

1. List all files in `output/page/` to discover available page objects, then read each one to understand the locators and methods available
2. Write the test to `output/test/<name>.spec.ts`:
   - File name: kebab-case description of the scenario (e.g. `login.spec.ts`, `search-and-open-subject.spec.ts`)
   - Use `import { test, expect } from '@playwright/test'`
   - Import only the page objects needed for this test from `../page/`
   - One `test()` block per distinct scenario
   - Use page object methods for all interactions — no raw locators in the test body
   - Add `expect` assertions at meaningful checkpoints (page title, visible element, URL)
3. If `output/test/` does not exist, create it before writing

After writing, confirm the file path and list the page objects used.
