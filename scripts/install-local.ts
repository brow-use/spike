/**
 * Copies the brow-use plugin into a target project so the project has no
 * dependency on the spike repo's location on disk.
 *
 * What gets written into <project>:
 *   .bu/dist/          ← built MCP server + tools (copied from spike/dist/)
 *   .bu/package.json   ← server-side deps only; npm install runs here
 *   .bu/node_modules/  ← installed by this script
 *   .claude/commands/bu:<name>.md  ← one file per plugin command
 *   .claude/CLAUDE.md  ← plugin system-prompt instructions (appended if exists)
 *   .claude/settings.json          ← mcpServers.bu entry merged in
 *
 * Usage:
 *   npx tsx scripts/install-local.ts <project-path>
 * or via make:
 *   make install-local PROJECT=<project-path>
 */

import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

const spikeRoot = path.resolve(import.meta.dirname, '..')

function usage(): never {
  console.error('usage: install-local <project-path>')
  console.error('       make install-local PROJECT=<project-path>')
  process.exit(1)
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true })
}

function copyDir(src: string, dest: string) {
  ensureDir(dest)
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

function readJson(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {}
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function writeJson(filePath: string, data: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

const projectPath = process.argv[2]
if (!projectPath) usage()

const project = path.resolve(projectPath)

if (!fs.existsSync(project)) {
  console.error(`error: project path does not exist: ${project}`)
  process.exit(1)
}

const distSrc = path.join(spikeRoot, 'dist')
if (!fs.existsSync(distSrc)) {
  console.error('error: dist/ not found — run `make build` first')
  process.exit(1)
}

const buDir = path.join(project, '.bu')
const claudeDir = path.join(project, '.claude')
const commandsDir = path.join(claudeDir, 'commands')

console.log(`Installing brow-use into: ${project}`)

// 1. Copy dist/ → .bu/dist/
console.log('  Copying MCP server...')
const buDist = path.join(buDir, 'dist')
copyDir(distSrc, buDist)

// 2. Write a minimal package.json for server-side deps into .bu/
const spikePkg = readJson(path.join(spikeRoot, 'package.json')) as {
  dependencies?: Record<string, string>
}
const serverDeps: Record<string, string> = {}
const serverDepNames = [
  '@modelcontextprotocol/sdk',
  'playwright',
  'pngjs',
  'ws',
  'yauzl',
]
for (const dep of serverDepNames) {
  if (spikePkg.dependencies?.[dep]) {
    serverDeps[dep] = spikePkg.dependencies[dep]
  }
}
writeJson(path.join(buDir, 'package.json'), {
  name: 'bu-mcp',
  version: '0.1.0',
  type: 'module',
  private: true,
  dependencies: serverDeps,
})

// 3. npm install inside .bu/
console.log('  Installing server dependencies (this may take a moment)...')
execSync('npm install --omit=dev --silent', { cwd: buDir, stdio: 'inherit' })

// 4. Copy plugin commands → .claude/commands/bu:<name>.md
console.log('  Copying commands...')
ensureDir(commandsDir)
const commandsSrc = path.join(spikeRoot, 'plugin', 'commands')
for (const file of fs.readdirSync(commandsSrc)) {
  if (!file.endsWith('.md')) continue
  const dest = path.join(commandsDir, `bu:${file}`)
  fs.copyFileSync(path.join(commandsSrc, file), dest)
}

// 5. Merge MCP server entry into .claude/settings.json
console.log('  Configuring MCP server...')
const settingsPath = path.join(claudeDir, 'settings.json')
ensureDir(claudeDir)
const settings = readJson(settingsPath) as {
  mcpServers?: Record<string, unknown>
}
settings.mcpServers = settings.mcpServers ?? {}
settings.mcpServers['bu'] = {
  command: 'node',
  args: [path.join(buDir, 'dist', 'mcp', 'index.js')],
}
writeJson(settingsPath, settings)

// 6. Append plugin CLAUDE.md to .claude/CLAUDE.md
console.log('  Writing plugin instructions...')
const claudeMdPath = path.join(claudeDir, 'CLAUDE.md')
const pluginMd = fs.readFileSync(path.join(spikeRoot, 'plugin', 'CLAUDE.md'), 'utf8')
const marker = '<!-- brow-use plugin instructions -->'
let existing = fs.existsSync(claudeMdPath) ? fs.readFileSync(claudeMdPath, 'utf8') : ''

if (existing.includes(marker)) {
  const before = existing.slice(0, existing.indexOf(marker))
  existing = before + marker + '\n' + pluginMd
} else {
  existing = existing ? existing + '\n\n' + marker + '\n' + pluginMd : marker + '\n' + pluginMd
}
fs.writeFileSync(claudeMdPath, existing)

console.log()
console.log('Done. brow-use is installed locally in this project.')
console.log()
console.log('  MCP server:  .bu/dist/mcp/index.js')
console.log('  Commands:    .claude/commands/bu:*.md')
console.log('  Settings:    .claude/settings.json  (mcpServers.bu)')
console.log('  Instructions:.claude/CLAUDE.md')
console.log()
console.log('Restart Claude Code to load the MCP server.')
console.log()
console.log('To update after brow-use changes, re-run:')
console.log('  make install-local PROJECT=' + project)
