import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Highlight, themes } from 'prism-react-renderer'
import { useMemo } from 'react'
import type { TimelineEvent } from '../types.js'

export function ResultWrite({ event }: { event: TimelineEvent }) {
  const d = event.detail as { name?: string; content?: string } | undefined
  const name = d?.name ?? 'result'
  const content = d?.content ?? ''
  const ext = name.split('.').pop()?.toLowerCase() ?? ''

  return (
    <div>
      <div style={{ color: '#555', fontSize: 13, marginBottom: 12 }}>
        <code>{name}</code>
      </div>
      <div>
        {ext === 'md' && <Md content={content} />}
        {ext === 'json' && <Code content={prettyJson(content)} language="json" />}
        {ext === 'csv' && <CsvTable content={content} />}
        {(ext === 'txt' || (ext !== 'md' && ext !== 'json' && ext !== 'csv')) && (
          <pre style={preStyle}>{content}</pre>
        )}
      </div>
    </div>
  )
}

function Md({ content }: { content: string }) {
  return (
    <div style={{ lineHeight: 1.6, fontSize: 14 }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}

function Code({ content, language }: { content: string; language: string }) {
  return (
    <Highlight theme={themes.github} code={content} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre style={{ ...preStyle, background: '#f6f8fa' }}>
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
  )
}

function CsvTable({ content }: { content: string }) {
  const parsed = useMemo(() => parseCsv(content), [content])
  if (parsed.rows.length === 0) return <pre style={preStyle}>{content}</pre>

  return (
    <div style={{ overflow: 'auto', border: '1px solid #ddd', borderRadius: 4 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
        <thead>
          <tr>
            {parsed.headers.map((h, i) => (
              <th key={i} style={thStyle}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {parsed.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} style={tdStyle}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split('\n').filter(l => l.length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }
  const parseLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQuotes) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
        else if (c === '"') inQuotes = false
        else cur += c
      } else {
        if (c === '"') inQuotes = true
        else if (c === ',') { out.push(cur); cur = '' }
        else cur += c
      }
    }
    out.push(cur)
    return out
  }
  const [headerLine, ...rest] = lines
  return { headers: parseLine(headerLine), rows: rest.map(parseLine) }
}

function prettyJson(content: string): string {
  try { return JSON.stringify(JSON.parse(content), null, 2) }
  catch { return content }
}

const preStyle: React.CSSProperties = {
  padding: 12,
  background: '#f5f5f5',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 12,
  overflow: 'auto',
  maxHeight: 500,
  whiteSpace: 'pre-wrap',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #ccc',
  background: '#fafafa',
  fontWeight: 600,
  position: 'sticky',
  top: 0,
}

const tdStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderBottom: '1px solid #eee',
  verticalAlign: 'top',
}
