import type { TimelineEvent } from '../types.js'

export function RunStart({ event }: { event: TimelineEvent }) {
  const d = event.detail as { mode?: string; intent?: string; scenario?: string; workflowName?: string } | undefined
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#2e7d32', marginBottom: 12 }}>▶ Run started</div>
      <Grid>
        <Cell label="Start time">{new Date(event.t).toISOString()}</Cell>
        {d?.mode && <Cell label="Mode">{d.mode}</Cell>}
        {d?.intent && <Cell label="Intent">"{d.intent}"</Cell>}
        {d?.scenario && <Cell label="Scenario">{d.scenario}</Cell>}
        {d?.workflowName && <Cell label="Workflow">{d.workflowName}</Cell>}
      </Grid>
    </div>
  )
}

export function RunEnd({ event }: { event: TimelineEvent }) {
  const d = event.detail as {
    pagesVisited?: number
    terminationReason?: string
    recordsExtracted?: number
  } | undefined
  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 600, color: '#c62828', marginBottom: 12 }}>■ Run ended</div>
      <Grid>
        <Cell label="End time">{new Date(event.t).toISOString()}</Cell>
        {d?.pagesVisited != null && <Cell label="Pages visited">{d.pagesVisited}</Cell>}
        {d?.terminationReason && <Cell label="Reason">{d.terminationReason}</Cell>}
        {d?.recordsExtracted != null && <Cell label="Records">{d.recordsExtracted}</Cell>}
      </Grid>
    </div>
  )
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '6px 16px', fontSize: 14 }}>
      {children}
    </div>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div style={{ color: '#777' }}>{label}</div>
      <div>{children}</div>
    </>
  )
}
