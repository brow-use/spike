import { useEffect, useState, useCallback, useMemo } from 'react'
import type { Bundle, IndexEntry, TimelineEvent } from './types.js'
import { SessionPicker } from './SessionPicker.js'
import { StepView } from './StepView.js'
import { SkippedView } from './SkippedView.js'
import { DocsView } from './DocsView.js'
import { DetailPane } from './DetailPane.js'
import { AriaDiff } from './renderers/AriaDiff.js'

interface SelectedEventRef {
  sessionId: string
  eventIdx: number
}

type ViewMode = 'steps' | 'skipped' | 'docs'

export default function App() {
  const [index, setIndex] = useState<IndexEntry[] | null>(null)
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([])
  const [bundles, setBundles] = useState<Bundle[]>([])
  const [loadingBundles, setLoadingBundles] = useState(false)
  const [selectedEventRef, setSelectedEventRef] = useState<SelectedEventRef | null>(null)
  const [diffPair, setDiffPair] = useState<{ prev: TimelineEvent; curr: TimelineEvent } | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('steps')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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
    setViewMode('steps')
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

  const handleEventSelect = useCallback((event: TimelineEvent | null) => {
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

  const eventIdxMap = useMemo(() => {
    const m = new Map<TimelineEvent, number>()
    bundles[0]?.events.forEach((e, i) => m.set(e, i))
    return m
  }, [bundles])

  const skippedCount = useMemo(
    () => bundles[0]?.events.filter(e => e.kind === 'skipped-page').length ?? 0,
    [bundles],
  )

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
    <div style={{ display: 'grid', gridTemplateColumns: sidebarCollapsed ? '36px 1fr' : '320px 1fr', height: '100%' }}>
      {sidebarCollapsed ? (
        <aside style={{ borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
          <button
            onClick={() => setSidebarCollapsed(false)}
            title="Expand sidebar"
            style={collapseButtonStyle}
          >»</button>
        </aside>
      ) : (
        <aside style={{ borderRight: '1px solid #ddd', overflow: 'auto' }}>
          <h2 style={{ padding: '12px 16px', margin: 0, borderBottom: '1px solid #eee', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>brow-use runs</span>
            <button
              onClick={() => setSidebarCollapsed(true)}
              title="Collapse sidebar"
              style={collapseButtonStyle}
            >«</button>
          </h2>
          <SessionPicker
            index={index}
            selectedSessionIds={selectedSessionIds}
            onSelect={setSelectedSessionIds}
          />
        </aside>
      )}
      <main style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {loadingBundles && <div style={{ padding: 12 }}>Loading run…</div>}
        {!loadingBundles && bundles.length > 1 && (
          <div style={{ padding: '8px 16px', background: '#fff7e6', borderBottom: '1px solid #f1d9a8', fontSize: 12, color: '#664d03' }}>
            Showing {bundles[0].sessionId} — multi-run comparison is not supported in step view yet. Pick one run at a time.
          </div>
        )}
        {!loadingBundles && bundles.length > 0 && (
          <>
            <ViewSwitcher
              mode={viewMode}
              onChange={setViewMode}
              hasDocs={!!bundles[0].docs}
              skippedCount={skippedCount}
            />
            {viewMode === 'steps' ? (
              <StepView
                bundle={bundles[0]}
                onSelectEvent={handleEventSelect}
                selectedKey={selectedKey}
              />
            ) : viewMode === 'skipped' ? (
              <SkippedView
                bundle={bundles[0]}
                onSelectEvent={handleEventSelect}
                selectedKey={selectedKey}
                eventIdxMap={eventIdxMap}
              />
            ) : bundles[0].docs ? (
              <DocsView docs={bundles[0].docs} sessionId={bundles[0].sessionId} />
            ) : (
              <div style={{ padding: 16, color: '#888' }}>
                No docs for this run. Run <code>/bu:document</code> then <code>npm run viewer:ingest</code>.
              </div>
            )}
          </>
        )}
        {!loadingBundles && bundles.length === 0 && selectedSessionIds.length > 0 && (
          <div style={{ padding: 16 }}>
            No data for selected session(s). Did you run <code>make extract SESSION=&lt;id&gt;</code> then <code>npm run viewer:ingest</code>?
          </div>
        )}
        {!loadingBundles && selectedSessionIds.length === 0 && (
          <div style={{ padding: 16, color: '#888' }}>
            Select a run from the left to view its steps.
          </div>
        )}
      </main>
      {bundles.length > 0 && (viewMode === 'steps' || viewMode === 'skipped') && (
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

const collapseButtonStyle: React.CSSProperties = {
  border: '1px solid #ccc',
  background: 'white',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 14,
  lineHeight: 1,
  padding: '4px 8px',
  color: '#555',
}

function ViewSwitcher({
  mode,
  onChange,
  hasDocs,
  skippedCount,
}: {
  mode: ViewMode
  onChange: (m: ViewMode) => void
  hasDocs: boolean
  skippedCount: number
}) {
  return (
    <div style={{
      padding: '8px 16px',
      borderBottom: '1px solid #eee',
      background: 'white',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
    }}>
      <div style={{
        display: 'inline-flex',
        border: '1px solid #ccc',
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <ViewSwitchButton active={mode === 'steps'} onClick={() => onChange('steps')} divider>Steps</ViewSwitchButton>
        <ViewSwitchButton
          active={mode === 'skipped'}
          onClick={() => onChange('skipped')}
          disabled={skippedCount === 0}
          title={skippedCount === 0 ? 'No pages were skipped as duplicates in this run.' : ''}
          divider
        >Skipped{skippedCount > 0 ? ` (${skippedCount})` : ''}</ViewSwitchButton>
        <ViewSwitchButton
          active={mode === 'docs'}
          onClick={() => onChange('docs')}
          disabled={!hasDocs}
          title={hasDocs ? '' : 'No docs found for this run — run /bu:document then re-ingest.'}
        >Docs</ViewSwitchButton>
      </div>
    </div>
  )
}

function ViewSwitchButton({
  active,
  disabled,
  onClick,
  title,
  divider,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  title?: string
  divider?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '5px 14px',
        border: 'none',
        borderRight: divider ? '1px solid #ccc' : 'none',
        background: active ? '#1565c0' : 'white',
        color: active ? 'white' : (disabled ? '#aaa' : '#333'),
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >{children}</button>
  )
}
