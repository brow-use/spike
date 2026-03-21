import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { App } from '../domain/app.js'

type Store = {
  currentAppId: string | null
  apps: App[]
}

export class AppRepository {
  private dbPath: string

  constructor() {
    const dir = path.resolve(process.cwd(), '.brow-use')
    fs.mkdirSync(dir, { recursive: true })
    this.dbPath = path.join(dir, 'apps.json')
  }

  private read(): Store {
    if (!fs.existsSync(this.dbPath)) return { currentAppId: null, apps: [] }
    return JSON.parse(fs.readFileSync(this.dbPath, 'utf-8')) as Store
  }

  private write(store: Store): void {
    fs.writeFileSync(this.dbPath, JSON.stringify(store, null, 2))
  }

  createApp(name: string, description: string, url: string): App {
    const store = this.read()
    const app: App = {
      id: randomUUID(),
      name,
      description,
      url,
      createdAt: new Date().toISOString(),
    }
    store.apps.push(app)
    this.write(store)
    return app
  }

  listApps(): App[] {
    return this.read().apps
  }

  getCurrentApp(): App | null {
    const store = this.read()
    if (!store.currentAppId) return null
    return store.apps.find(a => a.id === store.currentAppId) ?? null
  }

  setCurrentApp(id: string): void {
    const store = this.read()
    this.write({ ...store, currentAppId: id })
  }

  updateApp(id: string, name: string, description: string, url: string): App | null {
    const store = this.read()
    const index = store.apps.findIndex(a => a.id === id)
    if (index === -1) return null
    store.apps[index] = { ...store.apps[index], name, description, url }
    this.write(store)
    return store.apps[index]
  }
}
