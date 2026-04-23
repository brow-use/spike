import { useState } from 'react'
import type { TimelineEvent } from '../types.js'

interface Props {
  event: TimelineEvent
  onCompareWithPrevious?: () => void
}

export function VisitedPage({ event, onCompareWithPrevious }: Props) {
  const d = event.detail as {
    stepId?: string
    url?: string
    title?: string
    ariaSummary?: string
    ariaTree?: string
  } | undefined
  const fp = event.links?.ariaFingerprint
  const [showTree, setShowTree] = useState(false)

  return (
    <div>
      <Row label="Step">{d?.stepId}</Row>
      <Row label="Title">{d?.title}</Row>
      <Row label="URL"><code>{d?.url}</code></Row>
      <Row label="Summary">{d?.ariaSummary}</Row>
      {fp && (
        <Row label="Fingerprint">
          <div style={{ fontFamily: 'monospace', fontSize: 12, color: '#555' }}>
            phash <span style={{ color: '#333' }}>{fp.phash}</span><br />
            aria&nbsp; <span style={{ color: '#333' }}>{fp.ariaHash}</span>
          </div>
        </Row>
      )}
      <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
        <button
          onClick={() => setShowTree(!showTree)}
          style={buttonStyle}
        >
          {showTree ? 'Hide aria tree' : 'Show aria tree'}
        </button>
        {onCompareWithPrevious && (
          <button onClick={onCompareWithPrevious} style={buttonStyle}>
            Compare with previous visited page
          </button>
        )}
      </div>
      {showTree && (
        <pre style={{
          marginTop: 12,
          padding: 12,
          background: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 12,
          overflow: 'auto',
          maxHeight: 400,
          whiteSpace: 'pre-wrap',
        }}>{d?.ariaTree}</pre>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', marginBottom: 8 }}>
      <div style={{ color: '#777', fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #ccc',
  background: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
}
