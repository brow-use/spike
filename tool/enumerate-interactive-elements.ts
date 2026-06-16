import type { Tool, ToolContext } from './tool.js'
import { isWithinScope } from '../domain/scope.js'

export const DESTRUCTIVE_REGEX = /\b(delete|remove|cancel account|drop|destroy|deactivate|close account|erase)\b/i

const INTERACTIVE_ROLES = new Set([
  'link', 'button', 'textbox', 'combobox', 'checkbox', 'radio', 'menuitem', 'tab', 'switch',
])

export interface InteractiveElement {
  role: string
  name: string
  url?: string
  depth: number
  selector: string
  destructive?: boolean
}

export function applyEnumerationFilters(
  items: InteractiveElement[],
  opts: { includeDestructive?: boolean; topLevelOnly?: boolean; rolesFilter?: string[]; urlPrefix?: string },
): InteractiveElement[] {
  let out = opts.includeDestructive
    ? items.map(e => ({ ...e, destructive: DESTRUCTIVE_REGEX.test(e.name) }))
    : filterDestructive(items)
  if (opts.topLevelOnly) out = out.filter(e => e.depth <= 1)
  if (opts.rolesFilter?.length) out = out.filter(e => opts.rolesFilter!.includes(e.role))
  if (opts.urlPrefix) out = out.filter(e => !e.url || isWithinScope(e.url, opts.urlPrefix!))
  return out
}

function indentOf(line: string): number {
  let i = 0
  while (i < line.length && line[i] === ' ') i++
  return i
}

export function parseInteractive(ariaText: string): InteractiveElement[] {
  const lines = ariaText.split('\n')
  const items: InteractiveElement[] = []
  let pendingItem: InteractiveElement | null = null
  let pendingIndent = -1

  const itemPattern = /^\s*-\s+([a-z]+)\s+"([^"]+)"/
  const urlPattern = /^\s*-\s+\/url:\s*"?([^"\n]+?)"?\s*$/

  for (const line of lines) {
    if (line.trim().length === 0) continue
    const indent = indentOf(line)
    const itemMatch = line.match(itemPattern)
    const urlMatch = line.match(urlPattern)

    if (itemMatch) {
      const role = itemMatch[1]
      const name = itemMatch[2]
      if (!INTERACTIVE_ROLES.has(role)) continue
      if (pendingItem) items.push(pendingItem)
      pendingItem = {
        role,
        name,
        depth: Math.floor(indent / 2),
        selector: `role=${role}[name="${name.replace(/"/g, '\\"')}"]`,
      }
      pendingIndent = indent
    } else if (urlMatch && pendingItem && pendingItem.role === 'link' && indent > pendingIndent) {
      if (!pendingItem.url) pendingItem.url = urlMatch[1]
    }
  }
  if (pendingItem) items.push(pendingItem)
  return items
}

export function filterDestructive(items: InteractiveElement[]): InteractiveElement[] {
  return items.filter(e => !DESTRUCTIVE_REGEX.test(e.name))
}

export const enumerateInteractiveElements: Tool = {
  name: 'enumerate_interactive_elements',
  description: 'Return a list of interactive elements on the current page (links, buttons, inputs, etc.), ready to add to an exploration frontier. By default, destructive-action names (delete, remove, drop, erase, destroy, deactivate, cancel account, close account) are stripped server-side — the agent cannot accidentally invoke what it cannot see. Pass includeDestructive:true to see them (marked destructive:true) when you need to RECORD them without clicking. Each item includes role, name, optional url (for links), depth, and a ready-to-use selector of the form role=<role>[name="..."].',
  inputSchema: {
    type: 'object',
    properties: {
      topLevelOnly: {
        type: 'boolean',
        description: 'If true, return only elements at depth <= 1 (outermost links/buttons, typical hub-level enumeration). Default false.',
      },
      rolesFilter: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional restriction to specific roles (e.g. ["link"] for navigation-only enumeration). Default: all interactive roles.',
      },
      includeDestructive: {
        type: 'boolean',
        description: 'If true, destructive-action elements are included in the result with destructive:true. If false (default), they are stripped.',
      },
      urlPrefix: {
        type: 'string',
        description: 'Optional scope restriction. When set, link elements whose target path is not within this prefix (e.g. "/cloud/dashboard/devices") are stripped server-side, so out-of-scope navigation never enters the frontier. Buttons and other elements without a resolvable url are kept (judge them after clicking).',
      },
    },
  },
  async execute(input, ctx: ToolContext): Promise<string> {
    const ariaText = await ctx.page.locator('body').ariaSnapshot()
    const items = applyEnumerationFilters(parseInteractive(ariaText), {
      topLevelOnly: (input.topLevelOnly as boolean | undefined) ?? false,
      rolesFilter: input.rolesFilter as string[] | undefined,
      includeDestructive: (input.includeDestructive as boolean | undefined) ?? false,
      urlPrefix: input.urlPrefix as string | undefined,
    })
    return JSON.stringify(items)
  },
}
