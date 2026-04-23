import { Highlight, themes } from 'prism-react-renderer'
import type { TimelineEvent } from '../types.js'

export function TraceAction({ event }: { event: TimelineEvent }) {
  const d = event.detail as { callId?: string; method?: string; params?: unknown } | undefined
  const params = d?.params
  const paramsJson = params ? JSON.stringify(params, null, 2) : ''

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
