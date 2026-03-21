interface BrowserCommand {
  id: string
  type: string
  payload: Record<string, unknown>
}

chrome.runtime.onMessage.addListener((cmd: BrowserCommand, _sender, sendResponse) => {
  handleCommand(cmd).then(sendResponse).catch(err => {
    sendResponse({ id: cmd.id, success: false, error: String(err) })
  })
  return true
})

async function handleCommand(cmd: BrowserCommand) {
  const { id, type, payload } = cmd

  if (type === 'click') {
    const el = document.querySelector(payload.selector as string) as HTMLElement | null
    if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
    el.click()
    return { id, success: true }
  }

  if (type === 'type') {
    const el = document.querySelector(payload.selector as string) as HTMLInputElement | null
    if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
    el.focus()
    el.value = payload.text as string
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return { id, success: true }
  }

  if (type === 'scroll') {
    window.scrollBy((payload.x as number) ?? 0, (payload.y as number) ?? 0)
    return { id, success: true }
  }

  if (type === 'read_dom') {
    const selector = payload.selector as string | undefined
    const el = selector ? document.querySelector(selector) : document.body
    return { id, success: true, data: el?.innerHTML ?? '' }
  }

  if (type === 'highlight') {
    const el = document.querySelector(payload.selector as string) as HTMLElement | null
    if (!el) return { id, success: false, error: `Element not found: ${payload.selector}` }
    const prev = el.style.outline
    el.style.outline = '3px solid red'
    setTimeout(() => { el.style.outline = prev }, 2000)
    return { id, success: true }
  }

  return { id, success: false, error: `Unknown command type: ${type}` }
}
