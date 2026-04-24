import { useEffect, useMemo, useRef, useState } from 'react'
import type { Bundle, Edge, TimelineEvent } from './types.js'

interface Props {
  bundle: Bundle
  onSelectEvent: (event: TimelineEvent | null) => void
  selectedKey: string | null
}

export function StepView({ bundle, onSelectEvent, selectedKey }: Props) {
  const steps = useMemo(
    () => bundle.events.filter(e => e.kind === 'visited-page'),
    [bundle.events],
  )

  const [stepIdx, setStepIdx] = useState(0)
  useEffect(() => { setStepIdx(0) }, [bundle.sessionId])

  const eventIdxMap = useMemo(() => {
    const map = new Map<TimelineEvent, number>()
    bundle.events.forEach((e, i) => map.set(e, i))
    return map
  }, [bundle.events])

  if (steps.length === 0) {
    return (
      <div style={{ padding: 24, color: '#666' }}>
        This run has no captured pages. Did you run <code>make extract SESSION={bundle.sessionId}</code>?
      </div>
    )
  }

  const step = steps[stepIdx]
  const stepId = (step.detail as { stepId?: string } | undefined)?.stepId ?? ''
  const prevT = stepIdx > 0 ? steps[stepIdx - 1].t : bundle.runStartMs
  const nextT = stepIdx + 1 < steps.length ? steps[stepIdx + 1].t : bundle.runEndMs

  const reasoningInWindow = bundle.events.filter(
    e => e.kind === 'agent-reasoning' && e.t >= prevT && e.t <= nextT,
  )
  const actionsOnPage = bundle.events.filter(
    e => e.kind === 'trace-action' && e.t > step.t && e.t <= nextT,
  )
  const incomingEdges = bundle.edges.filter(e => e.toStepId === stepId)
  const outgoingEdges = bundle.edges.filter(e => e.fromStepId === stepId)

  const emitSelect = (event: TimelineEvent) => {
    onSelectEvent(event)
  }

  const jumpToStep = (targetStepId: string | null) => {
    if (!targetStepId) return
    const idx = steps.findIndex(
      s => (s.detail as { stepId?: string } | undefined)?.stepId === targetStepId,
    )
    if (idx >= 0) setStepIdx(idx)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <Header bundle={bundle} stepIdx={stepIdx} totalSteps={steps.length} step={step} />
      <Filmstrip
        steps={steps}
        selectedIdx={stepIdx}
        onSelect={setStepIdx}
      />
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <StepDetail
          step={step}
          reasoning={reasoningInWindow}
          actionsOnPage={actionsOnPage}
          incomingEdges={incomingEdges}
          outgoingEdges={outgoingEdges}
          selectedKey={selectedKey}
          eventIdxMap={eventIdxMap}
          onSelectEvent={emitSelect}
          onJumpToStep={jumpToStep}
        />
      </div>
    </div>
  )
}

function Header({
  bundle,
  stepIdx,
  totalSteps,
  step,
}: {
  bundle: Bundle
  stepIdx: number
  totalSteps: number
  step: TimelineEvent
}) {
  const d = step.detail as { url?: string; title?: string; stepId?: string } | undefined
  return (
    <header style={{ padding: '10px 16px', borderBottom: '1px solid #eee', background: '#fafafa' }}>
      <div style={{ fontWeight: 600 }}>{bundle.app?.name ?? '(no app)'}</div>
      <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>
        {bundle.sessionId} · {bundle.command} · {totalSteps} pages captured
      </div>
      <div style={{ marginTop: 6, fontSize: 13, color: '#333' }}>
        Step <strong>{stepIdx + 1} of {totalSteps}</strong> · <code>{d?.stepId}</code> · {d?.title || '(no title)'}
      </div>
    </header>
  )
}

function Filmstrip({
  steps,
  selectedIdx,
  onSelect,
}: {
  steps: TimelineEvent[]
  selectedIdx: number
  onSelect: (idx: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Keep the selected thumbnail in view when step changes.
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current.querySelector<HTMLElement>(`[data-step-idx="${selectedIdx}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [selectedIdx])

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        gap: 8,
        padding: '10px 16px',
        overflowX: 'auto',
        borderBottom: '1px solid #eee',
        background: 'white',
      }}
    >
      {steps.map((s, i) => {
        const d = s.detail as { stepId?: string; title?: string } | undefined
        const screenshot = s.links?.screenshot
        const selected = i === selectedIdx
        return (
          <button
            key={i}
            data-step-idx={i}
            onClick={() => onSelect(i)}
            title={d?.title ?? ''}
            style={{
              flex: '0 0 auto',
              padding: 0,
              border: selected ? '2px solid #1565c0' : '1px solid #ddd',
              borderRadius: 4,
              background: 'white',
              cursor: 'pointer',
              width: 112,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              overflow: 'hidden',
              boxShadow: selected ? '0 0 0 3px rgba(21, 101, 192, 0.15)' : 'none',
            }}
          >
            {screenshot ? (
              <img
                src={screenshot}
                alt={d?.title ?? ''}
                style={{
                  width: '100%',
                  height: 72,
                  objectFit: 'cover',
                  objectPosition: 'top',
                  display: 'block',
                  background: '#f0f0f0',
                }}
              />
            ) : (
              <div style={{
                width: '100%',
                height: 72,
                background: '#f0f0f0',
                color: '#aaa',
                fontSize: 11,
                display: 'grid',
                placeItems: 'center',
              }}>no image</div>
            )}
            <div style={{
              padding: '4px 6px',
              fontSize: 10,
              textAlign: 'left',
              lineHeight: 1.3,
              color: '#444',
              borderTop: '1px solid #eee',
            }}>
              <div style={{ fontFamily: 'monospace', color: '#999', fontSize: 9 }}>{d?.stepId}</div>
              <div style={{
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
              }}>{d?.title || '—'}</div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

function StepDetail({
  step,
  reasoning,
  actionsOnPage,
  incomingEdges,
  outgoingEdges,
  selectedKey,
  eventIdxMap,
  onSelectEvent,
  onJumpToStep,
}: {
  step: TimelineEvent
  reasoning: TimelineEvent[]
  actionsOnPage: TimelineEvent[]
  incomingEdges: Edge[]
  outgoingEdges: Edge[]
  selectedKey: string | null
  eventIdxMap: Map<TimelineEvent, number>
  onSelectEvent: (event: TimelineEvent) => void
  onJumpToStep: (stepId: string | null) => void
}) {
  const d = step.detail as {
    url?: string
    title?: string
    ariaSummary?: string
    ariaTree?: string
  } | undefined
  const [showAria, setShowAria] = useState(false)
  const screenshot = step.links?.screenshot

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(360px, 480px) 1fr', gap: 32, alignItems: 'start' }}>
      <div>
        {screenshot ? (
          <a href={screenshot} target="_blank" rel="noreferrer">
            <img
              src={screenshot}
              alt={d?.title ?? ''}
              style={{
                width: '100%',
                border: '1px solid #ddd',
                borderRadius: 6,
                display: 'block',
                cursor: 'zoom-in',
              }}
            />
          </a>
        ) : (
          <div style={{
            width: '100%',
            aspectRatio: '3/2',
            background: '#f5f5f5',
            border: '1px dashed #ccc',
            borderRadius: 6,
            display: 'grid',
            placeItems: 'center',
            color: '#999',
          }}>no screenshot</div>
        )}
        <div style={{ marginTop: 12, fontSize: 13 }}>
          <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>URL</div>
          <code style={{ fontSize: 12, wordBreak: 'break-all' }}>{d?.url}</code>
          <div style={{ color: '#777', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12, marginBottom: 4 }}>Summary</div>
          <div>{d?.ariaSummary || '—'}</div>
          <button onClick={() => setShowAria(s => !s)} style={toggleButton}>
            {showAria ? 'Hide aria tree' : 'Show aria tree'}
          </button>
          {showAria && (
            <pre style={{
              marginTop: 12,
              padding: 12,
              background: '#f8f8f8',
              border: '1px solid #ddd',
              borderRadius: 4,
              fontSize: 11,
              overflow: 'auto',
              maxHeight: 480,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.4,
            }}>{d?.ariaTree}</pre>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <Section title="How you got here" empty="This is the first step.">
          {incomingEdges.map((e, i) => (
            <EdgeItem key={i} edge={e} side="from" onJumpToStep={onJumpToStep} />
          ))}
        </Section>

        <Section title="What the agent thought" empty="No reasoning recorded in this window.">
          {reasoning.map(r => (
            <ReasoningItem
              key={eventIdxMap.get(r)}
              event={r}
              selected={selectedKey === `${r.sessionId}::${eventIdxMap.get(r)}`}
              onClick={() => onSelectEvent(r)}
            />
          ))}
        </Section>

        <Section title="Actions on this page" empty="No trace actions captured on this page.">
          {actionsOnPage.map(a => (
            <TraceActionItem
              key={eventIdxMap.get(a)}
              event={a}
              selected={selectedKey === `${a.sessionId}::${eventIdxMap.get(a)}`}
              onClick={() => onSelectEvent(a)}
            />
          ))}
        </Section>

        <Section title="Where you went next" empty="This is the last step.">
          {outgoingEdges.map((e, i) => (
            <EdgeItem key={i} edge={e} side="to" onJumpToStep={onJumpToStep} />
          ))}
        </Section>
      </div>
    </div>
  )
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const count = Array.isArray(children) ? children.filter(Boolean).length : (children ? 1 : 0)
  return (
    <div>
      <h3 style={{
        margin: 0,
        marginBottom: 8,
        fontSize: 12,
        color: '#555',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: 600,
      }}>{title} {count > 0 && <span style={{ color: '#aaa', fontWeight: 400 }}>({count})</span>}</h3>
      {count === 0
        ? <div style={{ color: '#999', fontSize: 13, fontStyle: 'italic' }}>{empty}</div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>}
    </div>
  )
}

function EdgeItem({ edge, side, onJumpToStep }: {
  edge: Edge
  side: 'from' | 'to'
  onJumpToStep: (stepId: string | null) => void
}) {
  const otherTitle = side === 'from' ? edge.fromTitle : edge.toTitle
  const otherUrl = side === 'from' ? edge.fromUrl : edge.toUrl
  const otherStepId = side === 'from' ? edge.fromStepId : edge.toStepId
  const arrow = side === 'from' ? '←' : '→'
  return (
    <button
      onClick={() => onJumpToStep(otherStepId)}
      disabled={!otherStepId}
      style={{
        padding: '8px 10px',
        border: '1px solid #ddd',
        borderLeft: `3px solid ${edge.isRevisit ? '#ef6c00' : '#1565c0'}`,
        borderRadius: 4,
        background: 'white',
        textAlign: 'left',
        cursor: otherStepId ? 'pointer' : 'default',
        fontSize: 13,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ color: '#888' }}>{arrow}</span>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#666' }}>{otherStepId ?? '∅'}</span>
        <span style={{ fontWeight: 500 }}>{otherTitle ?? otherUrl ?? '(unknown)'}</span>
        {edge.isRevisit && (
          <span style={{ fontSize: 10, color: '#ef6c00', textTransform: 'uppercase', marginLeft: 'auto' }}>revisit</span>
        )}
      </div>
      <div style={{ color: '#777', fontSize: 12, marginTop: 2 }}>via {formatTrigger(edge)}</div>
    </button>
  )
}

function ReasoningItem({ event, selected, onClick }: {
  event: TimelineEvent
  selected: boolean
  onClick: () => void
}) {
  const d = event.detail as { kind?: string; text?: string } | undefined
  const kind = d?.kind ?? 'decision'
  const colors: Record<string, string> = {
    plan: '#2e7d32',
    decision: '#6b5b95',
    observation: '#00695c',
    error: '#c62828',
  }
  const color = colors[kind] ?? '#555'
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 10px',
        border: '1px solid #ddd',
        borderLeft: `3px solid ${color}`,
        borderRadius: 4,
        background: selected ? '#eef5fc' : 'white',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 13,
      }}
    >
      <span style={{
        fontSize: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color,
        fontWeight: 600,
        marginRight: 8,
      }}>{kind}</span>
      <span style={{ color: '#333' }}>{d?.text ?? event.label}</span>
    </button>
  )
}

function TraceActionItem({ event, selected, onClick }: {
  event: TimelineEvent
  selected: boolean
  onClick: () => void
}) {
  const d = event.detail as { method?: string; params?: Record<string, unknown> } | undefined
  const method = d?.method ?? event.label
  const selector = d?.params?.selector as string | undefined
  const url = d?.params?.url as string | undefined
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 10px',
        border: '1px solid #eee',
        borderRadius: 4,
        background: selected ? '#eef5fc' : '#fafafa',
        textAlign: 'left',
        cursor: 'pointer',
        fontSize: 12,
        fontFamily: 'monospace',
      }}
    >
      <span style={{ color: '#1565c0', fontWeight: 600 }}>{method}</span>
      {selector && <span style={{ color: '#666' }}> {selector}</span>}
      {url && <span style={{ color: '#666' }}> {url}</span>}
      {event.duration != null && (
        <span style={{ color: '#aaa', marginLeft: 8 }}>({event.duration} ms)</span>
      )}
    </button>
  )
}

function formatTrigger(edge: Edge): string {
  const m = edge.via.method
  if (m === 'unknown') return 'no trigger recorded'
  if (m === 'goto' || m === 'navigate') return `goto ${edge.via.url ?? ''}`
  const parts: string[] = [m]
  if (edge.via.selector) parts.push(edge.via.selector)
  if (edge.via.text) parts.push(`"${edge.via.text}"`)
  return parts.join(' ')
}

const toggleButton: React.CSSProperties = {
  marginTop: 10,
  padding: '4px 10px',
  border: '1px solid #ccc',
  background: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 12,
}
