export interface ReconnectBackoffOptions {
  baseMs: number
  maxMs: number
  jitterRatio?: number
  random?: () => number
}

export function reconnectDelayMs(attempt: number, options: ReconnectBackoffOptions): number {
  const { baseMs, maxMs, jitterRatio = 0.3, random = Math.random } = options
  const capped = Math.min(baseMs * 2 ** attempt, maxMs)
  const jitter = capped * jitterRatio * random()
  return Math.round(capped + jitter)
}
