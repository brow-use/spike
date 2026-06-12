import { parseInteractive } from './enumerate-interactive-elements.js'

export interface HealedSelector {
  selector: string
  role: string
  name: string
  score: number
}

function tokenize(s: string): string[] {
  return s.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length > 1)
}

export function extractHintTokens(selector: string): string[] {
  const quoted = [...selector.matchAll(/"([^"]+)"|'([^']+)'/g)].map(m => m[1] ?? m[2])
  const source = quoted.length > 0 ? quoted.join(' ') : selector.replace(/^text=/, '')
  return tokenize(source)
}

export function healSelector(ariaText: string, failedSelector: string): HealedSelector | null {
  const hint = extractHintTokens(failedSelector)
  if (hint.length === 0) return null
  const roleHint = failedSelector.match(/^role=([a-z]+)/)?.[1] ?? null

  let best: HealedSelector | null = null
  for (const item of parseInteractive(ariaText)) {
    const nameTokens = new Set(tokenize(item.name))
    const matched = hint.filter(t => nameTokens.has(t)).length
    if (matched === 0) continue
    let score = matched / hint.length
    if (roleHint !== null && item.role === roleHint) score += 0.2
    if (score > (best?.score ?? 0)) {
      best = { selector: item.selector, role: item.role, name: item.name, score }
    }
  }
  return best !== null && best.score >= 0.5 ? best : null
}
