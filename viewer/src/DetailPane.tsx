import type { TimelineEvent } from './types.js'
import { AgentReasoning } from './renderers/AgentReasoning.js'
import { VisitedPage } from './renderers/VisitedPage.js'
import { ScreenshotSaved } from './renderers/ScreenshotSaved.js'
import { DocWrite } from './renderers/DocWrite.js'
import { ResultWrite } from './renderers/ResultWrite.js'
import { TraceAction } from './renderers/TraceAction.js'
import { TraceConsole } from './renderers/TraceConsole.js'
import { RunStart, RunEnd } from './renderers/RunStartEnd.js'

interface Props {
  event: TimelineEvent | null
  sessionId: string
  onClose: () => void
  onCompareWithPrevious?: (event: TimelineEvent) => void
}

export function DetailPane({ event, sessionId, onClose, onCompareWithPrevious }: Props) {
  if (!event) return null

  return (
    <aside style={{
      position: 'fixed',
      right: 0,
      top: 0,
      bottom: 0,
      width: 480,
      background: 'white',
      borderLeft: '1px solid #ddd',
      boxShadow: '-2px 0 8px rgba(0,0,0,0.06)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 10,
    }}>
      <header style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid #eee',
      }}>
        <span style={{
          fontFamily: 'monospace',
          fontSize: 11,
          color: '#666',
          padding: '3px 8px',
          border: '1px solid #ddd',
          borderRadius: 3,
        }}>{event.kind}</span>
        <span style={{ fontSize: 12, color: '#888' }}>{event.lane}</span>
        <button
          onClick={onClose}
          style={{
            marginLeft: 'auto',
            padding: '4px 10px',
            border: '1px solid #ccc',
            background: 'white',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12,
          }}
        >close</button>
      </header>
      <div style={{ padding: 16, overflow: 'auto', flex: 1 }}>
        {render(event, sessionId, onCompareWithPrevious)}
      </div>
    </aside>
  )
}

function render(
  event: TimelineEvent,
  sessionId: string,
  onCompareWithPrevious?: (event: TimelineEvent) => void,
) {
  switch (event.kind) {
    case 'agent-reasoning':
      return <AgentReasoning event={event} />
    case 'run-start':
      return <RunStart event={event} />
    case 'run-end':
      return <RunEnd event={event} />
    case 'visited-page':
      return (
        <VisitedPage
          event={event}
          onCompareWithPrevious={onCompareWithPrevious ? () => onCompareWithPrevious(event) : undefined}
        />
      )
    case 'screenshot-saved':
      return <ScreenshotSaved event={event} />
    case 'doc-write':
      return <DocWrite event={event} sessionId={sessionId} />
    case 'result-write':
      return <ResultWrite event={event} />
    case 'trace-action':
      return <TraceAction event={event} />
    case 'trace-console':
      return <TraceConsole event={event} />
    case 'trace-network':
      return (
        <pre style={{
          padding: 12,
          background: '#f5f5f5',
          border: '1px solid #ddd',
          borderRadius: 4,
          fontSize: 12,
        }}>{JSON.stringify(event.detail, null, 2)}</pre>
      )
    default: {
      const _exhaustive: never = event.kind
      return <div>Unknown kind: {String(_exhaustive)}</div>
    }
  }
}
