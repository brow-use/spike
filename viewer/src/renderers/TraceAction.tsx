import { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'
import type { TimelineEvent } from '../types.js'

export function TraceAction({ event, onJumpToPage }: { event: TimelineEvent; onJumpToPage?: () => void }) {
  const d = event.detail as { callId?: string; method?: string; params?: unknown } | undefined
  const params = d?.params
  const paramsJson = params ? JSON.stringify(params, null, 2) : ''
  const screenshotSrc = event.links?.screenshot
  const [imgExpanded, setImgExpanded] = useState(false)

  return (
    <div>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{d?.method}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '4px 16px', fontSize: 13, marginBottom: 12 }}>
        <div style={{ color: '#777' }}>Call id</div>
        <div><code>{d?.callId}</code></div>
        <div style={{ color: '#777' }}>Start</div>
        <div>{new Date(event.t).toISOString()}</div>
        <div style={{ color: '#777' }}>Duration</div>
        <div>{event.duration?.toFixed(1)} ms</div>
      </div>
      {onJumpToPage && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={onJumpToPage}
            style={{
              padding: '6px 12px',
              border: '1px solid #1565c0',
              background: 'white',
              color: '#1565c0',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            ↑ Jump to browser page
          </button>
        </div>
      )}

      {screenshotSrc && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#555', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Page state after action
          </div>
          <img
            src={screenshotSrc}
            alt="page after action"
            onClick={() => setImgExpanded(!imgExpanded)}
            style={{
              maxWidth: '100%',
              maxHeight: imgExpanded ? 'none' : 220,
              objectFit: 'cover',
              objectPosition: 'top',
              border: '1px solid #ddd',
              borderRadius: 4,
              display: 'block',
              cursor: 'zoom-in',
            }}
          />
          <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
            click to {imgExpanded ? 'collapse' : 'expand'} · <a href={screenshotSrc} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }}>open full size</a>
          </div>
        </div>
      )}

      {!screenshotSrc && (
        <div style={{ color: '#bbb', fontSize: 12, marginBottom: 12 }}>
          No screenshot available for this action. Re-run <code>npm run viewer:ingest</code> — screenshots are extracted from the trace zip when present.
        </div>
      )}

      {paramsJson && (
        <>
          <div style={{ color: '#555', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Params</div>
          <Highlight theme={themes.github} code={paramsJson} language="json">
            {({ tokens, getLineProps, getTokenProps }) => (
              <pre style={{
                padding: 10,
                background: '#f6f8fa',
                border: '1px solid #ddd',
                borderRadius: 4,
                fontSize: 12,
                overflow: 'auto',
                maxHeight: 300,
              }}>
                {tokens.map((line, i) => (
                  <div key={i} {...getLineProps({ line })}>
                    {line.map((token, j) => (
                      <span key={j} {...getTokenProps({ token })} />
                    ))}
                  </div>
                ))}
              </pre>
            )}
          </Highlight>
        </>
      )}
    </div>
  )
}
