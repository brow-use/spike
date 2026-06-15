import type { TimelineEvent } from '../types.js'

interface SkippedDetail {
  url?: string
  urlTemplate?: string
  structuralHash?: string
  representativeStepId?: string
  representativeUrl?: string
  title?: string
  reason?: string
}

export function SkippedPage({
  event,
  onJumpToStep,
}: {
  event: TimelineEvent
  onJumpToStep?: (stepId: string) => void
}) {
  const d = (event.detail ?? {}) as SkippedDetail

  return (
    <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{
        padding: '6px 10px',
        background: '#fff7e6',
        border: '1px solid #f1d9a8',
        borderRadius: 4,
        color: '#664d03',
        fontSize: 12,
      }}>
        Skipped as <strong>{d.reason ?? 'same-template'}</strong> — a repeat of an
        already-sampled page archetype, not explored.
      </div>

      <Field label="Title">{d.title || '—'}</Field>
      <Field label="URL"><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{d.url}</code></Field>
      <Field label="URL template"><code style={{ fontSize: 12, wordBreak: 'break-all' }}>{d.urlTemplate || '—'}</code></Field>
      <Field label="Structural hash"><code style={{ fontSize: 11, color: '#666' }}>{d.structuralHash || '—'}</code></Field>

      <Field label="Representative (sampled) page">
        {d.representativeStepId ? (
          <button
            onClick={() => onJumpToStep?.(d.representativeStepId!)}
            disabled={!onJumpToStep}
            style={{
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderLeft: '3px solid #1565c0',
              borderRadius: 4,
              background: 'white',
              textAlign: 'left',
              cursor: onJumpToStep ? 'pointer' : 'default',
              fontSize: 13,
            }}
          >
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666', marginRight: 8 }}>{d.representativeStepId}</span>
            {d.representativeUrl ?? '(open)'}
          </button>
        ) : '—'}
      </Field>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div>{children}</div>
    </div>
  )
}
