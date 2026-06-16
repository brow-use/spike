export interface PanelStep {
  stepId: string
  tab?: string
}

export interface PanelGroup<T extends PanelStep> {
  baseStepId: string
  base: T
  panels: T[]
}

export function deriveBaseStepId(stepId: string): string {
  const m = /^(\d+)-\d+$/.exec(stepId)
  return m ? m[1] : stepId
}

export function isPanelStep(step: PanelStep): boolean {
  return /^\d+-\d+$/.test(step.stepId)
}

export function groupVisitedByBase<T extends PanelStep>(steps: T[]): PanelGroup<T>[] {
  const byBase = new Map<string, T[]>()
  const order: string[] = []
  for (const s of steps) {
    const base = deriveBaseStepId(s.stepId)
    if (!byBase.has(base)) {
      byBase.set(base, [])
      order.push(base)
    }
    byBase.get(base)!.push(s)
  }
  return order.map(baseStepId => {
    const members = byBase.get(baseStepId)!
    const base = members.find(m => m.stepId === baseStepId) ?? members[0]
    const panels = members.filter(m => m !== base)
    return { baseStepId, base, panels }
  })
}
