import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { HighlightedCode } from './HighlightedCode.js'
import { languageForFile } from './source-lang.js'

export interface OpenSourceArgs {
  url: string
  name?: string
  content?: string
}

interface SourceViewerContextValue {
  openSource: (args: OpenSourceArgs) => void
}

const SourceViewerContext = createContext<SourceViewerContextValue | null>(null)

export function useSourceViewer(): SourceViewerContextValue {
  const ctx = useContext(SourceViewerContext)
  if (!ctx) throw new Error('useSourceViewer must be used within a SourceViewerProvider')
  return ctx
}

export function SourceViewerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<OpenSourceArgs | null>(null)
  const openSource = useCallback((args: OpenSourceArgs) => setOpen(args), [])
  return (
    <SourceViewerContext.Provider value={{ openSource }}>
      {children}
      {open && <SourceModal args={open} onClose={() => setOpen(null)} />}
    </SourceViewerContext.Provider>
  )
}

function nameFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0]
  return clean.split('/').pop() || 'source'
}

function SourceModal({ args, onClose }: { args: OpenSourceArgs; onClose: () => void }) {
  const name = args.name ?? nameFromUrl(args.url)
  const language = languageForFile(name)
  const [content, setContent] = useState<string | null>(args.content ?? null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (args.content != null) return
    let cancelled = false
    fetch(args.url)
      .then(r => {
        if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
        return r.text()
      })
      .then(text => { if (!cancelled) setContent(text) })
      .catch(err => { if (!cancelled) setError(String(err)) })
    return () => { cancelled = true }
  }, [args])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleCopy = () => {
    if (content == null) return
    navigator.clipboard?.writeText(content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={e => e.stopPropagation()} style={panelStyle}>
        <header style={headerStyle}>
          <code style={{ fontSize: 13, color: '#333' }}>{name}</code>
          <span style={{ fontSize: 11, color: '#999' }}>{language}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button onClick={handleCopy} style={actionStyle} disabled={content == null}>
              {copied ? 'copied' : 'copy'}
            </button>
            <a href={args.url} target="_blank" rel="noreferrer" style={{ ...actionStyle, textDecoration: 'none' }}>
              raw
            </a>
            <button onClick={onClose} style={actionStyle}>close</button>
          </div>
        </header>
        <div style={bodyStyle}>
          {error ? (
            <div style={{ color: '#b71c1c', fontSize: 13 }}>Failed to load source: {error}</div>
          ) : content == null ? (
            <div style={{ color: '#888', fontSize: 13 }}>Loading source…</div>
          ) : (
            <HighlightedCode content={content} language={language} style={{ maxHeight: 'none', border: 'none', borderRadius: 0 }} />
          )}
        </div>
      </div>
    </div>
  )
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  padding: 32,
}

const panelStyle: React.CSSProperties = {
  background: 'white',
  borderRadius: 8,
  width: 'min(960px, 100%)',
  maxHeight: '100%',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  overflow: 'hidden',
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  padding: '10px 16px',
  borderBottom: '1px solid #eee',
}

const bodyStyle: React.CSSProperties = {
  overflow: 'auto',
  padding: 16,
  flex: 1,
}

const actionStyle: React.CSSProperties = {
  padding: '4px 10px',
  border: '1px solid #ccc',
  background: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
  color: '#333',
}
