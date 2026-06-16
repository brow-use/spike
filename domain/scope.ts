export function toPath(u: string): string {
  try {
    return new URL(u).pathname
  } catch {
    return u.split('?')[0].split('#')[0]
  }
}

export function isWithinScope(candidate: string, scope: string): boolean {
  const sp = toPath(scope).replace(/\/+$/, '')
  if (sp === '') return true
  const cp = toPath(candidate)
  return cp === sp || cp.startsWith(sp + '/')
}
