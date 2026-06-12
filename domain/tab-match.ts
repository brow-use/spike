export interface TabInfo {
  id: number
  url: string
  active: boolean
}

function parsed(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

export function matchTab(tabs: TabInfo[], lastKnownUrl: string | null): TabInfo | null {
  if (!lastKnownUrl) return null
  const target = parsed(lastKnownUrl)
  if (!target) return null

  const exact = tabs.filter(t => t.url === lastKnownUrl)
  const samePath = tabs.filter(t => {
    const u = parsed(t.url)
    return u !== null && u.origin === target.origin && u.pathname === target.pathname
  })
  const sameOrigin = tabs.filter(t => {
    const u = parsed(t.url)
    return u !== null && u.origin === target.origin
  })

  const pool = exact.length > 0 ? exact : samePath.length > 0 ? samePath : sameOrigin
  if (pool.length === 0) return null
  return pool.find(t => t.active) ?? pool[0]
}
