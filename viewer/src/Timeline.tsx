import { useEffect, useRef, useMemo } from 'react'
import { Timeline as VisTimeline, DataSet } from 'vis-timeline/standalone'
import 'vis-timeline/styles/vis-timeline-graph2d.min.css'
import type { Bundle, Lane, TimelineEvent } from './types.js'

const LANE_ORDER: Lane[] = ['agent', 'browser', 'trace', 'files']
const LANE_LABEL: Record<string, string> = {
  agent: 'Agent',
  browser: 'Browser',
  trace: 'Trace',
  files: 'Files',
}

const KIND_COLOR: Record<string, string> = {
  'agent-reasoning': '#6b5b95',
  'run-start': '#2e7d32',
  'run-end': '#c62828',
  'visited-page': '#1565c0',
  'screenshot-saved': '#ef6c00',
  'doc-write': '#00695c',
  'result-write': '#00695c',
  'trace-action': '#616161',
  'trace-network': '#424242',
  'trace-console': '#8d6e63',
}

const SESSION_COLORS = ['#1565c0', '#ef6c00', '#2e7d32', '#c62828', '#6b5b95', '#00695c']

interface Props {
  bundles: Bundle[]
  onSelect?: (event: TimelineEvent | null) => void
  selectedKey?: string | null   // `${sessionId}::${index}` of the selected event
}

interface TimelineItemPayload {
  sessionId: string
  eventIdx: number
}

export function Timeline({ bundles, onSelect, selectedKey }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<VisTimeline | null>(null)
  const isMultiRun = bundles.length > 1

  // Stable mapping from vis-timeline item id → (sessionId, eventIdx) for click handling.
  const itemPayloads = useMemo(() => {
    const map = new Map<string, TimelineItemPayload>()
    for (const bundle of bundles) {
      bundle.events.forEach((_e, i) => {
        map.set(`${bundle.sessionId}::${i}`, { sessionId: bundle.sessionId, eventIdx: i })
      })
    }
    return map
  }, [bundles])

  useEffect(() => {
    if (!containerRef.current) return
    if (bundles.length === 0) return

    // Build groups. Single-run: one per lane present. Multi-run: one per (lane, session).
    const lanesPresent = new Set<Lane>()
    for (const b of bundles) for (const e of b.events) lanesPresent.add(e.lane)
    const lanes = LANE_ORDER.filter(l => lanesPresent.has(l))

    const groups = new DataSet<{ id: string; content: string; order: number }>()
    if (isMultiRun) {
      let order = 0
      for (const lane of lanes) {
        for (let si = 0; si < bundles.length; si++) {
          const bundle = bundles[si]
          const color = SESSION_COLORS[si % SESSION_COLORS.length]
          const shortId = shortenSessionId(bundle.sessionId)
          groups.add({
            id: `${bundle.sessionId}::${lane}`,
            content: `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;vertical-align:middle"></span>${LANE_LABEL[lane]} · <code style="font-size:10px;color:#777">${shortId}</code>`,
            order: order++,
          })
        }
      }
    } else {
      lanes.forEach((l, i) => groups.add({ id: l, content: LANE_LABEL[l], order: i }))
    }

    // Build items.
    interface VisItem {
      id: string
      group: string
      content: string
      start: Date
      end?: Date
      type: 'box' | 'range'
      style: string
      className?: string
    }
    const items = new DataSet<VisItem>()
    const allOffsets: number[] = []  // for choosing initial view
    for (let si = 0; si < bundles.length; si++) {
      const bundle = bundles[si]
      const sessionColor = SESSION_COLORS[si % SESSION_COLORS.length]
      const runStart = bundle.runStartMs
      bundle.events.forEach((e: TimelineEvent, idx: number) => {
        const baseColor = KIND_COLOR[e.kind] ?? '#666'
        // In multi-run, override with session colour so events from one run are colour-tagged.
        const color = isMultiRun ? sessionColor : baseColor
        const isSpan = typeof e.duration === 'number' && e.duration > 0
        // In multi-run, normalise to ms since run start (relative to epoch = 0).
        const startMs = isMultiRun ? (e.t - runStart) : e.t
        const endMs = isMultiRun ? startMs + (e.duration ?? 0) : e.t + (e.duration ?? 0)
        const start = new Date(startMs)
        const end = isSpan ? new Date(endMs) : undefined
        const group = isMultiRun ? `${bundle.sessionId}::${e.lane}` : e.lane
        allOffsets.push(startMs)
        items.add({
          id: `${bundle.sessionId}::${idx}`,
          group,
          content: escapeHtml(e.label),
          start,
          end,
          type: isSpan ? 'range' : 'box',
          style: `background-color: ${color}; color: white; border-color: ${color};`,
        })
      })
    }

    // Initial view bounds.
    let viewStart: Date
    let viewEnd: Date
    if (isMultiRun) {
      const minT = Math.min(...allOffsets, 0)
      const maxT = Math.max(...allOffsets, 1000)
      viewStart = new Date(minT - 1000)
      viewEnd = new Date(maxT + 1000)
    } else {
      viewStart = new Date(bundles[0].runStartMs - 1000)
      viewEnd = new Date(bundles[0].runEndMs + 1000)
    }

    const timeline = new VisTimeline(containerRef.current, items, groups, {
      orientation: 'top',
      stack: true,
      zoomMin: 1000,
      zoomMax: 1000 * 60 * 60 * 24 * 7,
      margin: { item: 8 },
      showCurrentTime: false,
      start: viewStart,
      end: viewEnd,
      ...(isMultiRun
        ? {
            // Hide full date; show elapsed time.
            showMajorLabels: false,
            format: {
              minorLabels: {
                millisecond: 'SSS',
                second: 'ss[s]',
                minute: 'mm:ss',
                hour: 'HH:mm:ss',
                weekday: 'HH:mm',
                day: '[+]DD[d]',
                week: 'D MMM',
                month: 'MMM',
                year: 'YYYY',
              },
            },
          }
        : {}),
    })
    timelineRef.current = timeline

    if (onSelect) {
      timeline.on('select', (props: { items: (string | number)[] }) => {
        const id = props.items[0]
        if (id == null) {
          onSelect(null)
          return
        }
        const payload = itemPayloads.get(String(id))
        if (!payload) {
          onSelect(null)
          return
        }
        const bundle = bundles.find(b => b.sessionId === payload.sessionId)
        const event = bundle?.events[payload.eventIdx] ?? null
        onSelect(event)
      })
    }

    return () => {
      timeline.destroy()
      timelineRef.current = null
    }
  }, [bundles, isMultiRun, itemPayloads, onSelect])

  // Mirror external selection into vis-timeline.
  useEffect(() => {
    if (!timelineRef.current) return
    if (!selectedKey) {
      timelineRef.current.setSelection([])
    } else {
      timelineRef.current.setSelection([selectedKey])
    }
  }, [selectedKey])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header style={{ padding: '10px 16px', borderBottom: '1px solid #eee' }}>
        {isMultiRun ? (
          <>
            <div style={{ fontWeight: 600 }}>Comparing {bundles.length} runs</div>
            <div style={{ color: '#666', fontSize: 13, marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {bundles.map((b, i) => (
                <span key={b.sessionId} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: SESSION_COLORS[i % SESSION_COLORS.length],
                  }} />
                  <code style={{ fontSize: 12 }}>{shortenSessionId(b.sessionId)}</code>
                  <span style={{ color: '#888' }}>· {b.events.length} events</span>
                </span>
              ))}
            </div>
            <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>
              Axis shows time since each run's start (runs aligned at t=0)
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 600 }}>{bundles[0].app?.name ?? '(no app)'}</div>
            <div style={{ color: '#666', fontSize: 13, marginTop: 2 }}>
              {bundles[0].sessionId} · {bundles[0].command} · {bundles[0].events.length} events
            </div>
          </>
        )}
      </header>
      <div ref={containerRef} style={{ flex: 1, padding: 8 }} />
    </div>
  )
}

function shortenSessionId(id: string): string {
  // "explore-1745385600000" → "explore-…5600000"
  const match = id.match(/^([a-z-]+)-(\d+)$/)
  if (match) return `${match[1]}-…${match[2].slice(-7)}`
  return id
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}
