import fs from 'fs'
import path from 'path'

const STORE_DIR = path.resolve(process.cwd(), '.brow-use')
const STORE_FILE = path.join(STORE_DIR, 'config.json')

export type ExecutionMode = 'playwright' | 'crx'

interface Config {
  currentMode: ExecutionMode | null
}

function load(): Config {
  if (!fs.existsSync(STORE_FILE)) return { currentMode: null }
  const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Partial<Config>
  return { currentMode: raw.currentMode ?? null }
}

function save(config: Config): void {
  fs.mkdirSync(STORE_DIR, { recursive: true })
  fs.writeFileSync(STORE_FILE, JSON.stringify(config, null, 2), 'utf-8')
}

export class ModeRepository {
  getCurrentMode(): ExecutionMode | null {
    return load().currentMode
  }

  setCurrentMode(mode: ExecutionMode): void {
    save({ currentMode: mode })
  }
}
