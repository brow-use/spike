import type { IndexEntry } from './types.js'

interface Props {
  index: IndexEntry[]
  selectedSessionIds: string[]
  onSelect: (sessionIds: string[]) => void
}

export function SessionPicker({ index, selectedSessionIds, onSelect }: Props) {
  if (index.length === 0) {
    return (
      <div style={{ padding: 16, color: '#888' }}>
        No runs yet. Run <code>npm run viewer:ingest</code> after a brow-use command completes.
      </div>
    )
  }

  const sorted = [...index].sort((a, b) => (b.startedAt ?? '').localeCompare(a.startedAt ?? ''))
  const selectedSet = new Set(selectedSessionIds)

  function handleClick(e: React.MouseEvent, sessionId: string, canSelect: boolean) {
    if (!canSelect) return
    const modifier = e.metaKey || e.ctrlKey
    if (modifier) {
      // Toggle membership.
      if (selectedSet.has(sessionId)) {
        onSelect(selectedSessionIds.filter(id => id !== sessionId))
      } else {
        onSelect([...selectedSessionIds, sessionId])
      }
    } else {
      // Single-select (replace).
      onSelect([sessionId])
    }
  }

  return (
    <div>
      <div style={{
        padding: '8px 16px',
        fontSize: 11,
        color: '#999',
        borderBottom: '1px solid #f0f0f0',
      }}>
        click to select · ⌘/ctrl-click to compare
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {sorted.map(entry => {
          const isSelected = selectedSet.has(entry.sessionId)
          const canSelect = entry.hasTimeline
          return (
            <li
              key={entry.sessionId}
              onClick={e => handleClick(e, entry.sessionId, canSelect)}
              style={{
                padding: '10px 16px',
                borderBottom: '1px solid #f0f0f0',
                cursor: canSelect ? 'pointer' : 'not-allowed',
                background: isSelected ? '#e8f0fe' : undefined,
                borderLeft: isSelected ? '3px solid #1565c0' : '3px solid transparent',
                color: canSelect ? undefined : '#999',
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 600 }}>{entry.sessionId}</div>
              <div style={{ color: '#666', marginTop: 2 }}>
                {entry.command} · {entry.appName ?? '(no app)'}
              </div>
              <div style={{ color: '#888', marginTop: 2, fontSize: 11 }}>
                {entry.startedAt?.slice(0, 19).replace('T', ' ')}
                {entry.eventCount != null && ` · ${entry.eventCount} events`}
              </div>
              {entry.command === 'do' && entry.intent && (
                <div style={{ color: '#555', marginTop: 4, fontStyle: 'italic', fontSize: 12 }}>
                  "{entry.intent.slice(0, 60)}{entry.intent.length > 60 ? '…' : ''}"
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
