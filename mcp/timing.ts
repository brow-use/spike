export interface TimingSummary {
  name: string
  count: number
  lastMs: number
  maxMs: number
  avgMs: number
}

export class TimingStats {
  private stats = new Map<string, { count: number; totalMs: number; maxMs: number; lastMs: number }>()

  record(name: string, ms: number): void {
    const s = this.stats.get(name) ?? { count: 0, totalMs: 0, maxMs: 0, lastMs: 0 }
    s.count += 1
    s.totalMs += ms
    s.maxMs = Math.max(s.maxMs, ms)
    s.lastMs = ms
    this.stats.set(name, s)
  }

  summary(): TimingSummary[] {
    return [...this.stats.entries()]
      .map(([name, s]) => ({ name, count: s.count, lastMs: s.lastMs, maxMs: s.maxMs, avgMs: Math.round(s.totalMs / s.count) }))
      .sort((a, b) => b.maxMs - a.maxMs)
  }
}
