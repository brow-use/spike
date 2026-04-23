import type { TimelineEvent } from '../types.js'

const KIND_COLOR: Record<string, string> = {
  plan: '#2e7d32',
  decision: '#6b5b95',
  observation: '#1565c0',
  error: '#c62828',
}

export function AgentReasoning({ event }: { event: TimelineEvent }) {
  const d = event.detail as { kind?: string; text?: string } | undefined
  const kind = d?.kind ?? 'decision'
  const text = d?.text ?? ''
  const color = KIND_COLOR[kind] ?? '#555'

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
        letterSpacing: 0.3,
        textTransform: 'uppercase',
        marginBottom: 12,
      }}>{kind}</span>
      <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{text}</div>
    </div>
  )
}
