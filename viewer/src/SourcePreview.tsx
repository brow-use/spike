import { useEffect, useState } from 'react'
import { HighlightedCode } from './HighlightedCode.js'
import { useSourceViewer } from './SourceViewer.js'
import { languageForFile } from './source-lang.js'

interface Props {
  name: string
  url?: string
  content?: string
  defaultOpen?: boolean
}

export function SourcePreview({ name, url, content: preloaded, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const [content, setContent] = useState<string | null>(preloaded ?? null)
  const [error, setError] = useState<string | null>(null)
  const { openSource } = useSourceViewer()
  const language = languageForFile(name)

  useEffect(() => {
    if (!open || content != null || !url) return
    let cancelled = false
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(text => { if (!cancelled) setContent(text) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [open, url, content])

  return (
    <div style={{ border: '1px solid #e3e3e3', borderRadius: 4, overflow: 'hidden' }}>
      <div style={barStyle}>
        <button onClick={() => setOpen(o => !o)} style={toggleStyle}>
          <span style={{ display: 'inline-block', width: 12, color: '#888' }}>{open ? '▾' : '▸'}</span>
          <code style={{ fontSize: 12, color: '#444' }}>{name}</code>
        </button>
        {url && (
          <button
            onClick={() => openSource({ url, name, content: content ?? preloaded })}
            style={openStyle}
            title="Open in full source viewer"
          >open</button>
        )}
      </div>
      {open && (
        <div>
          {error ? (
            <div style={{ padding: 12, color: '#b71c1c', fontSize: 13 }}>Failed to load source: {error}</div>
          ) : content == null ? (
            <div style={{ padding: 12, color: '#888', fontSize: 13 }}>Loading source…</div>
          ) : (
            <HighlightedCode content={content} language={language} style={{ border: 'none', borderRadius: 0 }} />
          )}
        </div>
      )}
    </div>
  )
}

const barStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 8px',
  background: '#fafafa',
  borderBottom: '1px solid #f0f0f0',
}

const toggleStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  padding: 0,
}

const openStyle: React.CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 8px',
  border: '1px solid #ccc',
  background: 'white',
  borderRadius: 3,
  fontSize: 11,
  cursor: 'pointer',
  color: '#1565c0',
}
