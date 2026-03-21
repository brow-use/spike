---
description: Record a Page Object Model class for a page in the current app. Navigates to the page, inspects its elements, and writes a TypeScript POM class.
allowed-tools: MCP(brow-use/get_accessibility_tree), MCP(brow-use/snapshot), MCP(brow-use/navigate), MCP(brow-use/click), MCP(brow-use/type), MCP(brow-use/write_page_object)
argument-hint: [page-name]
---

Read the `apps://current` resource to get the active app's URL and description.
If no app is set, tell the user to run `/brow-use:create-app` and `/brow-use:set-current-app` first.

The page to record is: $ARGUMENTS

1. Navigate to the relevant page of the app (use the app URL as base, infer the path from the page name and app description)
2. Call `get_accessibility_tree` to discover all interactive elements and landmarks
3. Take a `snapshot` to visually confirm the page
4. Write a TypeScript Page Object class using `write_page_object`:
   - Class name: PascalCase of the page name + "Page" (e.g. `LoginPage`)
   - File name: kebab-case + "-page" (e.g. `login-page`)
   - Constructor accepts `Page` from `@playwright/test`
   - One `readonly` locator property per meaningful interactive element, using accessible selectors (role, label, placeholder) over CSS
   - One async method per distinct user action on the page (e.g. `login(username, password)`)
   - Methods return `void` or the next page object if navigation occurs

After writing, confirm the file path and list the locators and methods recorded.
