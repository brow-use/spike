import { useState } from 'react'
import type { TimelineEvent } from '../types.js'

export function ScreenshotSaved({ event }: { event: TimelineEvent }) {
  const src = event.links?.screenshot
  const d = event.detail as { name?: string } | undefined
  const [expanded, setExpanded] = useState(false)

  if (!src) return <div style={{ color: '#888' }}>(no screenshot path)</div>

  return (
    <div>
      <div style={{ color: '#555', fontSize: 13, marginBottom: 8 }}>{d?.name}</div>
      <img
        src={src}
        alt={d?.name ?? 'screenshot'}
        onClick={() => setExpanded(!expanded)}
        style={{
          maxWidth: '100%',
          maxHeight: expanded ? 'none' : 300,
          cursor: 'zoom-in',
          border: '1px solid #ddd',
          borderRadius: 4,
        }}
      />
      <div style={{ marginTop: 4, fontSize: 11, color: '#888' }}>
        click to {expanded ? 'collapse' : 'expand'}
      </div>
    </div>
  )
}
