import type { TimelineEvent } from '../types.js'

const LEVEL_COLOR: Record<string, string> = {
  log: '#616161',
  info: '#1565c0',
  warning: '#ef6c00',
  error: '#c62828',
  debug: '#8d6e63',
}

export function TraceConsole({ event }: { event: TimelineEvent }) {
  const d = event.detail as { level?: string; text?: string } | undefined
  const level = d?.level ?? 'log'
  const color = LEVEL_COLOR[level] ?? '#616161'

  return (
    <div>
      <span style={{
        display: 'inline-block',
        padding: '3px 10px',
        borderRadius: 4,
        background: color,
        color: 'white',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>{level}</span>
      <pre style={{
        padding: 12,
        background: '#f5f5f5',
        border: '1px solid #ddd',
        borderRadius: 4,
        fontSize: 12,
        overflow: 'auto',
        maxHeight: 500,
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
      }}>{d?.text}</pre>
    </div>
  )
}
