import { Highlight, themes } from 'prism-react-renderer'

interface Props {
  content: string
  language: string
  style?: React.CSSProperties
}

export function HighlightedCode({ content, language, style }: Props) {
  return (
    <Highlight theme={themes.github} code={content} language={language}>
      {({ tokens, getLineProps, getTokenProps }) => (
        <pre style={{ ...defaultPreStyle, ...style }}>
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

const defaultPreStyle: React.CSSProperties = {
  padding: 12,
  background: '#f6f8fa',
  border: '1px solid #ddd',
  borderRadius: 4,
  fontSize: 12,
  overflow: 'auto',
  maxHeight: 520,
  whiteSpace: 'pre-wrap',
}
