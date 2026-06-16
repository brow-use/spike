import { Highlight, themes } from 'prism-react-renderer'
import type { TimelineEvent } from '../types.js'

interface PageObjectSource {
  stepId?: string
  url?: string
  tab?: string
}

interface Props {
  event: TimelineEvent
  onJumpToEvent?: (eventIdx: number) => void
}

export function PageObject({ event, onJumpToEvent }: Props) {
  const d = event.detail as { name?: string; content?: string; sources?: PageObjectSource[] } | undefined
  const name = d?.name ?? 'page-object.ts'
  const content = d?.content ?? ''
  const sources = d?.sources ?? []
  const file = event.links?.pageObjectFile
  const linkedIdxs = event.links?.linkedVisitedPageEventIdxs ?? []

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <code style={{ fontSize: 13, color: '#555' }}>{name}</code>
        {file && (
          <a href={file} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: '#1565c0' }}>
            open source
          </a>
        )}
      </div>

      {sources.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: '#555', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
            Built from {sources.length} captured {sources.length === 1 ? 'step' : 'steps'}
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sources.map((s, i) => {
              const jumpIdx = linkedIdxs[i]
              return (
                <li key={i} style={{
                  padding: '6px 8px',
                  borderLeft: '3px solid #2e7d32',
                  background: '#fafafa',
                  marginBottom: 4,
                  fontSize: 13,
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ color: '#555', fontFamily: 'monospace', fontSize: 11 }}>{s.stepId ?? '∅'}</span>
                    {s.tab && <span style={{ fontSize: 10, color: '#1565c0', textTransform: 'uppercase' }}>tab: {s.tab}</span>}
                    {jumpIdx != null && onJumpToEvent && (
                      <button
                        onClick={() => onJumpToEvent(jumpIdx)}
                        style={{
                          marginLeft: 'auto',
                          padding: '2px 6px',
                          border: '1px solid #ccc',
                          background: 'white',
                          borderRadius: 3,
                          fontSize: 11,
                          cursor: 'pointer',
                        }}
                      >jump</button>
                    )}
                  </div>
                  {s.url && (
                    <div style={{ color: '#888', fontSize: 11, fontFamily: 'monospace', marginTop: 2, wordBreak: 'break-all' }}>
                      {s.url}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <Highlight theme={themes.github} code={content} language="tsx">
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre style={preStyle}>
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
    </div>
  )
}

const preStyle: React.CSSProperties = {
  padding: 12,
  background: '#f6f8fa',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 12,
  overflow: 'auto',
  maxHeight: 520,
  whiteSpace: 'pre-wrap',
}
