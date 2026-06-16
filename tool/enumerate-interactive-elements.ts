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

function makeItem(role: string, name: string, indent: number): InteractiveElement {
  return {
    role,
    name,
    depth: Math.floor(indent / 2),
    selector: `role=${role}[name="${name.replace(/"/g, '\\"')}"]`,
  }
}

export function parseInteractive(ariaText: string): InteractiveElement[] {
  const lines = ariaText.split('\n')
  const items: InteractiveElement[] = []
  let pendingItem: InteractiveElement | null = null
  let pendingIndent = -1
  let pendingNeedsName = false

  const namedPattern = /^\s*-\s+([a-z]+)\s+"([^"]+)"/
  const unnamedPattern = /^\s*-\s+([a-z]+)\s*(?:"")?\s*:?\s*$/
  const imgPattern = /^\s*-\s+img\s+"([^"]+)"/
  const urlPattern = /^\s*-\s+\/url:\s*"?([^"\n]+?)"?\s*$/

  const flush = (): void => {
    if (pendingItem && pendingItem.name.length > 0) items.push(pendingItem)
    pendingItem = null
    pendingIndent = -1
    pendingNeedsName = false
  }

  for (const line of lines) {
    if (line.trim().length === 0) continue
    const indent = indentOf(line)

    // A line at or shallower than the pending element closes its subtree, so the
    // pending element can no longer adopt a name from a deeper img child.
    if (pendingItem && indent <= pendingIndent) flush()

    // Adopt a nested img's alt text as the name of an otherwise-nameless
    // interactive element (e.g. an icon-only button rendered as `- button:` /
    // `  - img "menu-toggle"`).
    const imgMatch = line.match(imgPattern)
    if (imgMatch && pendingItem && pendingNeedsName && !pendingItem.name && indent > pendingIndent) {
      pendingItem.name = imgMatch[1]
      pendingItem.selector = `role=${pendingItem.role}[name="${imgMatch[1].replace(/"/g, '\\"')}"]`
      pendingNeedsName = false
      continue
    }

    const namedMatch = line.match(namedPattern)
    if (namedMatch) {
      const role = namedMatch[1]
      if (!INTERACTIVE_ROLES.has(role)) continue
      flush()
      pendingItem = makeItem(role, namedMatch[2], indent)
      pendingIndent = indent
      pendingNeedsName = false
      continue
    }

    const unnamedMatch = line.match(unnamedPattern)
    if (unnamedMatch) {
      const role = unnamedMatch[1]
      if (!INTERACTIVE_ROLES.has(role)) continue
      flush()
      pendingItem = makeItem(role, '', indent)
      pendingIndent = indent
      pendingNeedsName = true
      continue
    }

    const urlMatch = line.match(urlPattern)
    if (urlMatch && pendingItem && pendingItem.role === 'link' && indent > pendingIndent) {
      if (!pendingItem.url) pendingItem.url = urlMatch[1]
    }
  }
  flush()
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
