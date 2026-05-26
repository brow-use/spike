import fs from 'fs'
import path from 'path'
import type { App } from '../domain/app.js'

const STORE_DIR = path.resolve(process.cwd(), '.brow-use')
const STORE_FILE = path.join(STORE_DIR, 'apps.json')

export type ExecutionMode = 'playwright' | 'crx'

interface Store {
  currentAppId: string | null
  currentMode: ExecutionMode | null
  apps: App[]
}

function load(): Store {
  if (!fs.existsSync(STORE_FILE)) return { currentAppId: null, currentMode: null, apps: [] }
  const raw = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8')) as Partial<Store>
  return {
    currentAppId: raw.currentAppId ?? null,
    currentMode: raw.currentMode ?? null,
    apps: raw.apps ?? [],
  }
}

function save(store: Store): void {
  fs.mkdirSync(STORE_DIR, { recursive: true })
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8')
}

export class AppRepository {
  listApps(): App[] {
    return load().apps
  }

  getCurrentApp(): App | null {
    const store = load()
    return store.apps.find(a => a.id === store.currentAppId) ?? null
  }

  createApp(name: string, description: string, url: string): App {
    const store = load()
    const app: App = { id: crypto.randomUUID(), name, description, url, createdAt: new Date().toISOString() }
    store.apps.push(app)
    save(store)
    return app
  }

  updateApp(id: string, name: string, description: string, url: string): App | null {
    const store = load()
    const app = store.apps.find(a => a.id === id)
    if (!app) return null
    app.name = name
    app.description = description
    app.url = url
    save(store)
    return app
  }

  deleteApp(id: string): boolean {
    const store = load()
    const index = store.apps.findIndex(a => a.id === id)
    if (index === -1) return false
    store.apps.splice(index, 1)
    if (store.currentAppId === id) store.currentAppId = null
    save(store)
    return true
  }

  setCurrentApp(id: string): App | null {
    const store = load()
    const app = store.apps.find(a => a.id === id)
    if (!app) return null
    store.currentAppId = id
    save(store)
    return app
  }

  getCurrentMode(): ExecutionMode | null {
    return load().currentMode
  }

  setCurrentMode(mode: ExecutionMode): void {
    const store = load()
    store.currentMode = mode
    save(store)
  }
}
