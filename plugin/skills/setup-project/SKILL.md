---
description: Set up or complete a Playwright TypeScript project in the current directory. Creates missing config files and adds missing dependencies to existing ones.
allowed-tools: Read, Write, Edit, Bash
---

Inspect the current project directory and ensure it is a complete Playwright TypeScript project.

Check each of the following and act only on what is missing or incomplete:

**package.json**
- If absent, create it with name derived from the current directory, `"type": "module"`, and the required dependencies
- If present, read it and add any missing entries:
  - `devDependencies`: `@playwright/test`, `typescript`, `@types/node`
  - `scripts`: `"test": "playwright test"`, `"test:ui": "playwright test --ui"`

**tsconfig.json**
- If absent, create it:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "outDir": "dist"
  },
  "include": ["**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```
- If present, read it and add only missing `compilerOptions`

**playwright.config.ts**
- If absent, create it:
```ts
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './test',
  use: {
    headless: false,
  },
})
```
- If present, leave it unchanged

**Directory structure**
- Create `output/page/`, `output/workflow/`, `output/trace/` if they do not exist
- Create `test/` if it does not exist

**Install dependencies**
- Run `npm install` after any changes to `package.json`

After completing, summarise what was created, what was updated, and what was already in place.
