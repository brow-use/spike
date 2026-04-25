import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import type { DocsBundle } from './types.js'

interface Props {
  docs: DocsBundle
  sessionId: string
}

const README_SLUG = '__readme__'

export function DocsView({ docs, sessionId }: Props) {
  const [selectedSlug, setSelectedSlug] = useState<string>(README_SLUG)

  useEffect(() => { setSelectedSlug(README_SLUG) }, [sessionId])

  const selected = useMemo(() => {
    if (selectedSlug === README_SLUG) return { title: 'Overview', content: docs.readme }
    const entry = docs.entries.find(e => e.slug === selectedSlug)
    return entry ? { title: entry.title, content: entry.content } : null
  }, [selectedSlug, docs])

  const components: Components = {
    a: ({ href, children, ...rest }) => {
      if (typeof href === 'string') {
        const m = href.match(/^\.\/([^.]+)\.md$/)
        if (m) {
          const targetSlug = m[1]
          return (
            <a
              href="#"
              onClick={(e) => { e.preventDefault(); setSelectedSlug(targetSlug) }}
              style={{ color: '#1565c0', textDecoration: 'none' }}
              {...rest}
            >{children}</a>
          )
        }
      }
      return (
        <a href={href} target="_blank" rel="noreferrer" style={{ color: '#1565c0' }} {...rest}>{children}</a>
      )
    },
    img: ({ src, alt, ...rest }) => (
      <img
        src={typeof src === 'string' ? src : undefined}
        alt={alt}
        style={{
          maxWidth: '100%',
          border: '1px solid #ddd',
          borderRadius: 6,
          display: 'block',
          margin: '12px 0',
        }}
        {...rest}
      />
    ),
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', height: '100%', overflow: 'hidden' }}>
      <aside style={{
        borderRight: '1px solid #eee',
        overflow: 'auto',
        padding: '12px 8px',
        background: '#fafafa',
      }}>
        <TocItem
          title="Overview"
          active={selectedSlug === README_SLUG}
          onClick={() => setSelectedSlug(README_SLUG)}
        />
        <div style={{
          margin: '14px 6px 6px',
          fontSize: 11,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          fontWeight: 600,
        }}>Features</div>
        {docs.entries.map(e => (
          <TocItem
            key={e.slug}
            title={e.title}
            active={selectedSlug === e.slug}
            onClick={() => setSelectedSlug(e.slug)}
          />
        ))}
      </aside>
      <main style={{ overflow: 'auto', padding: '24px 32px', background: 'white' }}>
        {selected ? (
          <div className="docs-md" style={{ maxWidth: 820, fontSize: 14, lineHeight: 1.65, color: '#222' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {selected.content}
            </ReactMarkdown>
          </div>
        ) : (
          <div style={{ color: '#888' }}>Document not found.</div>
        )}
      </main>
      <style>{`
        .docs-md h1 { font-size: 24px; margin: 0 0 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; }
        .docs-md h2 { font-size: 18px; margin: 24px 0 10px; color: #333; }
        .docs-md h3 { font-size: 15px; margin: 18px 0 8px; color: #444; }
        .docs-md p { margin: 10px 0; }
        .docs-md ol, .docs-md ul { padding-left: 22px; margin: 10px 0; }
        .docs-md li { margin: 6px 0; }
        .docs-md code { background: #f4f4f6; padding: 1px 5px; border-radius: 3px; font-size: 12.5px; }
        .docs-md pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow: auto; }
        .docs-md pre code { background: transparent; padding: 0; }
        .docs-md table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 13px; }
        .docs-md th, .docs-md td { border: 1px solid #e3e3e3; padding: 7px 10px; text-align: left; vertical-align: top; }
        .docs-md th { background: #f7f7f8; font-weight: 600; }
        .docs-md tr:nth-child(even) td { background: #fafafa; }
        .docs-md strong { color: #111; }
        .docs-md blockquote { border-left: 3px solid #ddd; margin: 10px 0; padding: 2px 14px; color: #555; }
      `}</style>
    </div>
  )
}

function TocItem({ title, active, onClick }: { title: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        padding: '7px 10px',
        textAlign: 'left',
        background: active ? '#1565c0' : 'transparent',
        color: active ? 'white' : '#333',
        border: 'none',
        borderRadius: 4,
        cursor: 'pointer',
        fontSize: 13,
        marginBottom: 2,
        fontWeight: active ? 600 : 400,
      }}
    >{title}</button>
  )
}
