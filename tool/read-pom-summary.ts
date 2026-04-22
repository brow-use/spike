import path from 'path'
import fs from 'fs'
import type { Tool, ToolContext } from './tool.js'

export const readPomSummary: Tool = {
  name: 'read_pom_summary',
  description: 'Parse a Playwright Page Object Model TypeScript file and return a structured summary: className, locator property names (with selector hints where available), method names, any URL hints from goto() calls, and sibling imports. Use this during Pass 2 of /bu:record-page-objects to decide whether an existing file already covers a discovered page, without reading the full file contents into context.',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Path to the .ts file. Absolute or relative to cwd.',
      },
    },
    required: ['filePath'],
  },
  async execute(input, _ctx: ToolContext): Promise<string> {
    const filePath = input.filePath as string
    const abs = path.isAbsolute(filePath) ? filePath : path.resolve(process.cwd(), filePath)

    if (!fs.existsSync(abs)) {
      return JSON.stringify({ error: `File not found: ${abs}` })
    }
    const src = fs.readFileSync(abs, 'utf-8')

    const classMatch = src.match(/export\s+class\s+(\w+)/)
    const className = classMatch?.[1] ?? null

    const locators: { name: string; selectorHint?: string }[] = []
    const locatorPattern = /readonly\s+(\w+)\s*:\s*Locator/g
    let m: RegExpExecArray | null
    while ((m = locatorPattern.exec(src)) !== null) {
      locators.push({ name: m[1] })
    }
    for (const loc of locators) {
      const initRe = new RegExp(`this\\.${loc.name}\\s*=\\s*([^\\n;]+)`)
      const im = src.match(initRe)
      if (im) loc.selectorHint = im[1].trim()
    }

    const methods: string[] = []
    const methodPattern = /(?:^|\s)async\s+(\w+)\s*\(/g
    while ((m = methodPattern.exec(src)) !== null) {
      if (m[1] !== 'constructor') methods.push(m[1])
    }

    const urlHints: string[] = []
    const gotoPattern = /\.goto\(\s*['"`]([^'"`]+)['"`]/g
    while ((m = gotoPattern.exec(src)) !== null) {
      urlHints.push(m[1])
    }

    const siblingImports: string[] = []
    const importPattern = /from\s+['"](\.\/[^'"]+)['"]/g
    while ((m = importPattern.exec(src)) !== null) {
      siblingImports.push(m[1])
    }

    return JSON.stringify({
      filePath: abs,
      className,
      locators,
      methods,
      urlHints,
      siblingImports,
    })
  },
}
