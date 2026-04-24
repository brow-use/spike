import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Bundle, IndexEntry, TimelineEvent } from './types.js'
import { SessionPicker } from './SessionPicker.js'
import { Timeline } from './Timeline.js'
import { DetailPane } from './DetailPane.js'
import { AriaDiff } from './renderers/AriaDiff.js'

interface SelectedEventRef {
  sessionId: string
  eventIdx: number
}

export default function App() {
  const [index, setIndex] = useState<IndexEntry[] | null>(null)
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingBundles, setLoadingBundles] = useState(false)
  const [selectedEventRef, setSelectedEventRef] = useState<SelectedEventRef | null>(null)
  const [diffPair, setDiffPair] = useState<{ prev: TimelineEvent; curr: TimelineEvent } | null>(null)

  useEffect(() => {
    fetch('/data/_index.json')
      .then(r => {
        if (!r.ok) throw new Error(`index fetch: ${r.status}`)
        return r.json() as Promise<IndexEntry[]>
      })
      .then(data => {
        setIndex(data)
        const firstTimeline = data.find(e => e.hasTimeline)
        if (firstTimeline) setSelectedSessionIds([firstTimeline.sessionId])
      })
      .catch(err => {
        console.error('failed to load index:', err)
        setIndex([])
      })
  }, [])

  useEffect(() => {
    setSelectedEventRef(null)
    if (selectedSessionIds.length === 0) {
      setBundles([])
      return
    }
    setLoadingBundles(true)
    Promise.all(
      selectedSessionIds.map(id =>
        fetch(`/data/${id}.json`).then(r => {
          if (!r.ok) throw new Error(`bundle ${id}: ${r.status}`)
          return r.json() as Promise<Bundle>
        }),
      ),
    )
      .then(bs => setBundles(bs))
      .catch(err => {
        console.error('failed to load bundles:', err)
        setBundles([])
      })
      .finally(() => setLoadingBundles(false))
  }, [selectedSessionIds])

  const handleTimelineSelect = useCallback((event: TimelineEvent | null) => {
    if (!event) {
      setSelectedEventRef(null)
      return
    }
    const bundle = bundles.find(b => b.sessionId === event.sessionId)
    if (!bundle) return
    const eventIdx = bundle.events.indexOf(event)
    if (eventIdx < 0) return
    setSelectedEventRef({ sessionId: event.sessionId, eventIdx })
  }, [bundles])

  const selectedEvent = useMemo<TimelineEvent | null>(() => {
    if (!selectedEventRef) return null
    const bundle = bundles.find(b => b.sessionId === selectedEventRef.sessionId)
    return bundle?.events[selectedEventRef.eventIdx] ?? null
  }, [selectedEventRef, bundles])

  const selectedKey = selectedEventRef
    ? `${selectedEventRef.sessionId}::${selectedEventRef.eventIdx}`
    : null

  // "Compare with previous" logic — scoped to the selected event's own session.
  const handleCompareWithPrevious = useCallback((current: TimelineEvent) => {
    const bundle = bundles.find(b => b.sessionId === current.sessionId)
    if (!bundle) return
    const visitedInSession = bundle.events.filter(e => e.kind === 'visited-page')
    const idx = visitedInSession.indexOf(current)
    if (idx <= 0) return
    setDiffPair({ prev: visitedInSession[idx - 1], curr: current })
  }, [bundles])

  const handleJumpToEvent = useCallback((eventIdx: number) => {
    if (!selectedEvent) return
    setSelectedEventRef({ sessionId: selectedEvent.sessionId, eventIdx })
  }, [selectedEvent])

  const hasPrevVisited = (() => {
    if (!selectedEvent) return false
    if (selectedEvent.kind !== 'visited-page') return false
    const bundle = bundles.find(b => b.sessionId === selectedEvent.sessionId)
    if (!bundle) return false
    const visitedInSession = bundle.events.filter(e => e.kind === 'visited-page')
    return visitedInSession.indexOf(selectedEvent) > 0
  })()

  if (index == null) {
    return <div style={{ padding: 16 }}>Loading…</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', height: '100%' }}>
      <aside style={{ borderRight: '1px solid #ddd', overflow: 'auto' }}>
        <h2 style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid #eee', fontSize: 16 }}>
          brow-use runs
        </h2>
        <SessionPicker
          index={index}
          selectedSessionIds={selectedSessionIds}
          onSelect={setSelectedSessionIds}
        />
      </aside>
      <main style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loadingBundles && <div style={{ padding: 12 }}>Loading timeline…</div>}
        {!loadingBundles && bundles.length > 0 && (
          <Timeline
            bundles={bundles}
            onSelect={handleTimelineSelect}
            selectedKey={selectedKey}
          />
        )}
        {!loadingBundles && bundles.length === 0 && selectedSessionIds.length > 0 && (
          <div style={{ padding: 16 }}>
            No timeline data for selected session(s) — the command type may not be visualised in MVP.
          </div>
        )}
        {!loadingBundles && selectedSessionIds.length === 0 && (
          <div style={{ padding: 16, color: '#888' }}>
            Select a run from the left to view its timeline.
          </div>
        )}
      </main>
      {bundles.length > 0 && (
        <DetailPane
          event={selectedEvent}
          eventIdx={selectedEventRef?.eventIdx ?? null}
          sessionId={selectedEvent?.sessionId ?? ''}
          screenshots={
            bundles
              .find(b => b.sessionId === (selectedEvent?.sessionId ?? ''))
              ?.events.filter(e => e.kind === 'screenshot-saved') ?? []
          }
          edges={
            bundles.find(b => b.sessionId === (selectedEvent?.sessionId ?? ''))?.edges ?? []
          }
          onClose={() => setSelectedEventRef(null)}
          onCompareWithPrevious={hasPrevVisited ? handleCompareWithPrevious : undefined}
          onJumpToEvent={handleJumpToEvent}
        />
      )}
      {diffPair && (
        <AriaDiff
          previous={diffPair.prev}
          current={diffPair.curr}
          onClose={() => setDiffPair(null)}
        />
      )}
    </div>
  )
}
