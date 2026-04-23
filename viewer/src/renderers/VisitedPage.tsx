import { useState } from 'react'
import type { TimelineEvent } from '../types.js'

interface Props {
  event: TimelineEvent
  screenshots: TimelineEvent[]
  onCompareWithPrevious?: () => void
  onJumpToTrace?: () => void
}

export function VisitedPage({ event, screenshots, onCompareWithPrevious, onJumpToTrace }: Props) {
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
      <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setShowTree(!showTree)} style={buttonStyle}>
          {showTree ? 'Hide aria tree' : 'Show aria tree'}
        </button>
        {onJumpToTrace && (
          <button onClick={onJumpToTrace} style={{ ...buttonStyle, borderColor: '#616161', color: '#444' }}>
            ↳ Jump to trace action
          </button>
        )}
        {onCompareWithPrevious && (
          <button onClick={onCompareWithPrevious} style={buttonStyle}>
            Compare with previous
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
      {/* Matched screenshot (from ingest URL→name heuristic) */}
      {event.links?.screenshot && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: '#555', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
            Screenshot
          </div>
          <a href={event.links.screenshot} target="_blank" rel="noreferrer">
            <img
              src={event.links.screenshot}
              alt="page screenshot"
              style={{
                maxWidth: '100%',
                border: '1px solid #ddd',
                borderRadius: 4,
                cursor: 'zoom-in',
                display: 'block',
              }}
            />
          </a>
        </div>
      )}
      {/* Fallback: gallery of all session screenshots when no match found */}
      {!event.links?.screenshot && screenshots.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ color: '#555', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Session screenshots <span style={{ color: '#aaa', fontWeight: 400 }}>(no exact match — showing all)</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {screenshots.map((ss, i) => {
              const src = ss.links?.screenshot
              const name = (ss.detail as { name?: string } | undefined)?.name ?? ''
              return src ? (
                <a key={i} href={src} target="_blank" rel="noreferrer" title={name}>
                  <img
                    src={src}
                    alt={name}
                    style={{
                      width: 88,
                      height: 58,
                      objectFit: 'cover',
                      border: '1px solid #ddd',
                      borderRadius: 3,
                      cursor: 'pointer',
                    }}
                  />
                </a>
              ) : null
            })}
          </div>
        </div>
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
