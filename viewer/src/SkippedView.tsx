import { useMemo } from 'react'
import type { Bundle, TimelineEvent } from './types.js'

interface SkippedDetail {
  url?: string
  urlTemplate?: string
  structuralHash?: string
  representativeStepId?: string
  representativeUrl?: string
  title?: string
  reason?: string
}

interface Group {
  template: string
  repStepId?: string
  repUrl?: string
  events: TimelineEvent[]
}

export function SkippedView({
  bundle,
  onSelectEvent,
  selectedKey,
  eventIdxMap,
}: {
  bundle: Bundle
  onSelectEvent: (event: TimelineEvent) => void
  selectedKey: string | null
  eventIdxMap: Map<TimelineEvent, number>
}) {
  const skipped = useMemo(
    () => bundle.events.filter(e => e.kind === 'skipped-page'),
    [bundle.events],
  )

  const groups = useMemo<Group[]>(() => {
    const m = new Map<string, Group>()
    for (const e of skipped) {
      const d = e.detail as SkippedDetail
      const key = d.urlTemplate || d.representativeStepId || d.url || '(unknown)'
      if (!m.has(key)) {
        m.set(key, {
          template: d.urlTemplate || '(no template)',
          repStepId: d.representativeStepId,
          repUrl: d.representativeUrl,
          events: [],
        })
      }
      m.get(key)!.events.push(e)
    }
    return [...m.values()].sort((a, b) => b.events.length - a.events.length)
  }, [skipped])

  if (skipped.length === 0) {
    return (
      <div style={{ padding: 24, color: '#666' }}>
        No pages were skipped as duplicates in this run. Pages get listed here when exploration
        recognises a repeat of an already-sampled archetype (same structural hash + URL template).
      </div>
    )
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <div style={{ marginBottom: 16, color: '#555', fontSize: 13 }}>
        <strong>{skipped.length}</strong> page{skipped.length === 1 ? '' : 's'} skipped as repeats of an
        already-sampled archetype, across <strong>{groups.length}</strong> template{groups.length === 1 ? '' : 's'}.
        Each was recognised by matching structural hash and URL template against a representative that was explored.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ border: '1px solid #eee', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '10px 12px', background: '#fafafa', borderBottom: '1px solid #eee' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <code style={{ fontSize: 12, color: '#333', wordBreak: 'break-all' }}>{g.template}</code>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#ef6c00', fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {g.events.length} skipped
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>
                representative: <span style={{ fontFamily: 'monospace' }}>{g.repStepId ?? '∅'}</span>
                {g.repUrl ? <span style={{ wordBreak: 'break-all' }}> · {g.repUrl}</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {g.events.map(e => {
                const d = e.detail as SkippedDetail
                const selected = selectedKey === `${e.sessionId}::${eventIdxMap.get(e)}`
                return (
                  <button
                    key={eventIdxMap.get(e)}
                    onClick={() => onSelectEvent(e)}
                    style={{
                      padding: '8px 12px',
                      border: 'none',
                      borderBottom: '1px solid #f3f3f3',
                      borderLeft: `3px solid ${selected ? '#1565c0' : '#ef6c00'}`,
                      background: selected ? '#eef5fc' : 'white',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: 13,
                    }}
                  >
                    <span style={{ fontWeight: 500 }}>{d.title || d.url}</span>
                    {d.url && <div style={{ color: '#777', fontSize: 12, marginTop: 2, wordBreak: 'break-all' }}>{d.url}</div>}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
