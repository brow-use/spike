import { useEffect, useRef } from 'react'
import { createPatch } from 'diff'
import { html as diff2htmlHtml } from 'diff2html'
import 'diff2html/bundles/css/diff2html.min.css'
import type { TimelineEvent } from '../types.js'

interface Props {
  previous: TimelineEvent
  current: TimelineEvent
  onClose: () => void
}

export function AriaDiff({ previous, current, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)

  const prevDetail = previous.detail as { stepId?: string; url?: string; ariaTree?: string } | undefined
  const currDetail = current.detail as { stepId?: string; url?: string; ariaTree?: string } | undefined
  const leftLabel = `${prevDetail?.stepId ?? '?'} ${prevDetail?.url ?? ''}`
  const rightLabel = `${currDetail?.stepId ?? '?'} ${currDetail?.url ?? ''}`

  useEffect(() => {
    if (!containerRef.current) return
    const left = prevDetail?.ariaTree ?? ''
    const right = currDetail?.ariaTree ?? ''
    const patch = createPatch('ariaTree', left, right, leftLabel, rightLabel, { context: 2 })
    const htmlStr = diff2htmlHtml(patch, {
      drawFileList: false,
      outputFormat: 'side-by-side',
      matching: 'lines',
      renderNothingWhenEmpty: false,
    })
    containerRef.current.innerHTML = htmlStr
  }, [prevDetail?.ariaTree, currDetail?.ariaTree, leftLabel, rightLabel])

  // Close on Esc.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white',
          borderRadius: 8,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
          width: 'min(1400px, 95vw)',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '12px 20px',
          borderBottom: '1px solid #eee',
        }}>
          <div>
            <div style={{ fontWeight: 600 }}>Aria tree diff</div>
            <div style={{ fontSize: 12, color: '#777', marginTop: 2 }}>
              <span style={{ color: '#c62828' }}>{leftLabel}</span>
              <span style={{ margin: '0 8px', color: '#aaa' }}>→</span>
              <span style={{ color: '#2e7d32' }}>{rightLabel}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: 'auto',
              padding: '6px 14px',
              border: '1px solid #ccc',
              background: 'white',
              borderRadius: 4,
              cursor: 'pointer',
              fontSize: 13,
            }}
          >close (esc)</button>
        </header>
        <div style={{ flex: 1, overflow: 'auto', padding: 16, background: '#fafbfc' }}>
          <div ref={containerRef} style={{ fontSize: 12 }} />
        </div>
      </div>
    </div>
  )
}
