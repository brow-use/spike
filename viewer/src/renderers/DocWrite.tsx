import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TimelineEvent } from '../types.js'

export function DocWrite({ event, sessionId }: { event: TimelineEvent; sessionId: string }) {
  const d = event.detail as { name?: string; content?: string } | undefined
  const content = d?.content ?? ''

  return (
    <div>
      <div style={{ color: '#555', fontSize: 13, marginBottom: 12 }}>
        <code>{d?.name}</code>
      </div>
      <div style={markdownStyle}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => {
            // Rewrite `../../exploration/<sessionId>/foo.png` refs in feature docs
            // to the viewer's served path under /data/<sessionId>/screenshots/.
            if (!url) return url
            const match = url.match(/exploration\/[^/]+\/([^/]+\.png)/)
            if (match) return `/data/${sessionId}/screenshots/${match[1]}`
            return url
          }}
        >{content}</ReactMarkdown>
      </div>
    </div>
  )
}

const markdownStyle: React.CSSProperties = {
  lineHeight: 1.6,
  fontSize: 14,
}
