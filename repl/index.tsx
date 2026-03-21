import 'dotenv/config'
import React, { useState, useEffect, useCallback } from 'react'
import { render, Box, Text, Static, useInput, useApp } from 'ink'
import { Agent, type AgentEvent } from '../agent/index.js'
import { ExtensionWsServer } from '../server/ws-server.js'
import { BrowserBridge } from '../server/browser-bridge.js'
import { AppRepository } from '../repository/app-repository.js'
import type { App } from '../domain/app.js'

const WS_PORT = parseInt(process.env.WS_PORT ?? '3456', 10)

type MessageEntry = {
  id: number
  type: 'user' | 'agent' | 'tool' | 'error' | 'system'
  text: string
}

type SelectMode = {
  items: App[]
  cursor: number
} | null

type FormField = { key: string; label: string }
type FormMode = {
  title: string
  fields: FormField[]
  index: number
  values: Record<string, string>
  onComplete: (values: Record<string, string>) => void
} | null

let nextId = 0
const newEntry = (type: MessageEntry['type'], text: string): MessageEntry => ({ id: nextId++, type, text })

function prevWordBoundary(text: string, pos: number): number {
  let i = pos
  while (i > 0 && text[i - 1] === ' ') i--
  while (i > 0 && text[i - 1] !== ' ') i--
  return i
}

function nextWordBoundary(text: string, pos: number): number {
  let i = pos
  while (i < text.length && text[i] !== ' ') i++
  while (i < text.length && text[i] === ' ') i++
  return i
}

function MessageLine({ entry }: { entry: MessageEntry }) {
  const colorMap: Record<MessageEntry['type'], string> = {
    user: 'cyan', agent: 'white', tool: 'yellow', error: 'red', system: 'gray',
  }
  const prefixMap: Record<MessageEntry['type'], string> = {
    user: '> ', agent: '', tool: '[tool] ', error: '[error] ', system: '',
  }
  return (
    <Text color={colorMap[entry.type]}>
      {prefixMap[entry.type]}{entry.text}
    </Text>
  )
}

function AppSelectList({ items, cursor }: { items: App[]; cursor: number }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select an app:</Text>
      {items.map((app, i) => (
        <Text key={app.id} color={i === cursor ? 'cyan' : 'white'}>
          {i === cursor ? '▶ ' : '  '}{app.name} — {app.url}
        </Text>
      ))}
      <Text dimColor>↑↓ navigate  Enter select  Esc cancel</Text>
    </Box>
  )
}

function FormPrompt({ form, input, cursorPos }: { form: NonNullable<FormMode>; input: string; cursorPos: number }) {
  const field = form.fields[form.index]
  const before = input.slice(0, cursorPos)
  const at = input[cursorPos] ?? ' '
  const after = input.slice(cursorPos + 1)
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{form.title}</Text>
      {form.fields.slice(0, form.index).map(f => (
        <Text key={f.key} dimColor>  {f.label}: {form.values[f.key]}</Text>
      ))}
      <Box>
        <Text color="cyan">  {field.label}: </Text>
        <Text>{before}</Text>
        <Text inverse>{at}</Text>
        <Text>{after}</Text>
      </Box>
      <Text dimColor>Enter to confirm  Esc to cancel</Text>
    </Box>
  )
}

function InputLine({ value, cursorPos, isRunning }: { value: string; cursorPos: number; isRunning: boolean }) {
  const before = value.slice(0, cursorPos)
  const at = value[cursorPos] ?? ' '
  const after = value.slice(cursorPos + 1)
  return (
    <Box marginTop={1}>
      <Text color="cyan">{isRunning ? '... ' : '> '}</Text>
      {isRunning ? (
        <Text>{value}</Text>
      ) : (
        <>
          <Text>{before}</Text>
          <Text inverse>{at}</Text>
          <Text>{after}</Text>
        </>
      )}
    </Box>
  )
}

function AppComponent({ agent, wsServer, appRepo }: { agent: Agent; wsServer: ExtensionWsServer; appRepo: AppRepository }) {
  const { exit } = useApp()
  const [messages, setMessages] = useState<MessageEntry[]>([
    newEntry('system', 'brow-use — browser automation agent'),
    newEntry('system', 'Type /help for available commands'),
  ])
  const [input, setInput] = useState('')
  const [cursorPos, setCursorPos] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [extensionConnected, setExtensionConnected] = useState(false)
  const [selectMode, setSelectMode] = useState<SelectMode>(null)
  const [formMode, setFormMode] = useState<FormMode>(null)
  const [currentApp, setCurrentApp] = useState<App | null>(() => appRepo.getCurrentApp())
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [savedInput, setSavedInput] = useState('')
  const [savedCursor, setSavedCursor] = useState(0)

  const addMessage = useCallback((type: MessageEntry['type'], text: string) => {
    setMessages(prev => [...prev, newEntry(type, text)])
  }, [])

  const setLine = useCallback((value: string, cursor?: number) => {
    setInput(value)
    setCursorPos(cursor ?? value.length)
  }, [])

  const openForm = useCallback((
    title: string,
    fields: FormField[],
    initial: Record<string, string>,
    onComplete: (values: Record<string, string>) => void,
  ) => {
    setLine(initial[fields[0].key] ?? '')
    setFormMode({ title, fields, index: 0, values: initial, onComplete })
  }, [setLine])

  useEffect(() => {
    wsServer.on('extension:connected', () => {
      setExtensionConnected(true)
      addMessage('system', 'Chrome extension connected')
    })
    wsServer.on('extension:disconnected', () => {
      setExtensionConnected(false)
      addMessage('system', 'Chrome extension disconnected')
    })
  }, [])

  const APP_FIELDS: FormField[] = [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'url', label: 'URL' },
  ]

  const handleSlashCommand = useCallback((cmd: string) => {
    const command = cmd.split(' ')[0]

    switch (command) {
      case '/help':
        addMessage('system', [
          'Commands:',
          '  /help          Show this help',
          '  /create-app    Create a new app',
          '  /edit-app      Edit the current app',
          '  /current-app   Show the currently selected app',
          '  /list-app      List apps and select one',
          '  /status        Show connection and session status',
          '  /reset         Reset conversation session',
          '',
          'Shortcuts:',
          '  ←→          Move cursor',
          '  ↑↓          Command history',
          '  Ctrl+A/E    Beginning / end of line',
          '  Ctrl+←/→    Jump word',
          '  Ctrl+W      Delete word back',
          '  Ctrl+K      Kill to end of line',
          '  Ctrl+U      Kill to beginning of line',
          '  Ctrl+C      Exit',
        ].join('\n'))
        break

      case '/create-app':
        openForm('Create app', APP_FIELDS, { name: '', description: '', url: '' }, values => {
          const app = appRepo.createApp(values.name, values.description, values.url)
          addMessage('system', `Created app: ${app.name}`)
        })
        break

      case '/edit-app': {
        const app = appRepo.getCurrentApp()
        if (!app) {
          addMessage('error', 'No app selected. Use /list-app to select one first.')
          break
        }
        openForm('Edit app', APP_FIELDS, { name: app.name, description: app.description, url: app.url }, values => {
          const updated = appRepo.updateApp(app.id, values.name, values.description, values.url)
          if (updated) {
            agent.updateApp(updated)
            setCurrentApp(updated)
            addMessage('system', `Updated app: ${updated.name}`)
          }
        })
        break
      }

      case '/list-app': {
        const apps = appRepo.listApps()
        if (apps.length === 0) {
          addMessage('system', 'No apps yet. Use /create-app to create one.')
          break
        }
        const currentId = appRepo.getCurrentApp()?.id
        const cursor = Math.max(0, apps.findIndex(a => a.id === currentId))
        setSelectMode({ items: apps, cursor })
        break
      }

      case '/current-app': {
        const app = appRepo.getCurrentApp()
        if (!app) {
          addMessage('system', 'No app selected. Use /list-app to select one.')
        } else {
          addMessage('system', `App:  ${app.name}\nURL:  ${app.url}\n${app.description}`)
        }
        break
      }

      case '/status':
        addMessage('system', [
          `Session:   ${agent.sessionId()}`,
          `App:       ${currentApp ? currentApp.name : 'none'}`,
          `Extension: ${agent.isExtensionConnected() ? 'connected' : 'disconnected'}`,
        ].join('\n'))
        break

      case '/reset':
        agent.resetSession()
        addMessage('system', 'Session reset. Browser state preserved.')
        break

      default:
        addMessage('error', `Unknown command: ${command}. Type /help for available commands.`)
    }
  }, [agent, appRepo, addMessage, currentApp, openForm])

  const handleSubmit = useCallback(async (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return
    setHistory(prev => [trimmed, ...prev])
    setHistoryIndex(-1)
    setSavedInput('')
    setSavedCursor(0)
    addMessage('user', trimmed)
    if (trimmed.startsWith('/')) {
      handleSlashCommand(trimmed)
      return
    }
    setIsRunning(true)
    try {
      await agent.run(trimmed, (event: AgentEvent) => {
        if (event.type === 'text') addMessage('agent', event.text)
        else if (event.type === 'tool') addMessage('tool', `${event.name}(${JSON.stringify(event.input)})`)
        else if (event.type === 'tool_error') addMessage('error', event.message)
      })
    } catch (err) {
      addMessage('error', err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
    }
  }, [agent, addMessage, handleSlashCommand])

  useInput((char, key) => {
    if (key.ctrl && char === 'c') {
      agent.close().then(() => { wsServer.close(); exit() })
      return
    }

    if (selectMode) {
      if (key.upArrow) {
        setSelectMode(prev => prev ? { ...prev, cursor: Math.max(0, prev.cursor - 1) } : null)
      } else if (key.downArrow) {
        setSelectMode(prev => prev ? { ...prev, cursor: Math.min(prev.items.length - 1, prev.cursor + 1) } : null)
      } else if (key.return) {
        const app = selectMode.items[selectMode.cursor]
        appRepo.setCurrentApp(app.id)
        agent.updateApp(app)
        setCurrentApp(app)
        addMessage('system', `Switched to app: ${app.name}`)
        setSelectMode(null)
      } else if (key.escape) {
        setSelectMode(null)
      }
      return
    }

    if (formMode) {
      if (key.escape) {
        setFormMode(null)
        setLine('')
        addMessage('system', 'Cancelled.')
        return
      }
      if (key.return) {
        const field = formMode.fields[formMode.index]
        const updatedValues = { ...formMode.values, [field.key]: input }
        const nextIndex = formMode.index + 1
        if (nextIndex < formMode.fields.length) {
          const nextField = formMode.fields[nextIndex]
          setLine(updatedValues[nextField.key] ?? '')
          setFormMode({ ...formMode, index: nextIndex, values: updatedValues })
        } else {
          setFormMode(null)
          setLine('')
          formMode.onComplete(updatedValues)
        }
        return
      }
      // Fall through to text editing below
    }

    if (!formMode && isRunning) return

    if (!formMode && key.return) {
      const line = input
      setLine('')
      handleSubmit(line)
      return
    }

    if (!formMode) {
      if (key.upArrow) {
        const nextIndex = historyIndex + 1
        if (nextIndex < history.length) {
          if (historyIndex === -1) { setSavedInput(input); setSavedCursor(cursorPos) }
          setHistoryIndex(nextIndex)
          setLine(history[nextIndex])
        }
        return
      }
      if (key.downArrow) {
        if (historyIndex > 0) {
          const nextIndex = historyIndex - 1
          setHistoryIndex(nextIndex)
          setLine(history[nextIndex])
        } else if (historyIndex === 0) {
          setHistoryIndex(-1)
          setLine(savedInput, savedCursor)
        }
        return
      }
    }

    if (key.leftArrow) {
      if (key.ctrl) setCursorPos(prevWordBoundary(input, cursorPos))
      else setCursorPos(Math.max(0, cursorPos - 1))
      return
    }
    if (key.rightArrow) {
      if (key.ctrl) setCursorPos(nextWordBoundary(input, cursorPos))
      else setCursorPos(Math.min(input.length, cursorPos + 1))
      return
    }

    if (key.ctrl) {
      if (char === 'a') { setCursorPos(0); return }
      if (char === 'e') { setCursorPos(input.length); return }
      if (char === 'k') { setLine(input.slice(0, cursorPos), cursorPos); return }
      if (char === 'u') { setLine(input.slice(cursorPos), 0); return }
      if (char === 'w') {
        const boundary = prevWordBoundary(input, cursorPos)
        setLine(input.slice(0, boundary) + input.slice(cursorPos), boundary)
        return
      }
    }

    if (key.backspace || key.delete) {
      if (cursorPos === 0) return
      setLine(input.slice(0, cursorPos - 1) + input.slice(cursorPos), cursorPos - 1)
      return
    }

    if (char && !key.ctrl && !key.meta) {
      setLine(input.slice(0, cursorPos) + char + input.slice(cursorPos), cursorPos + 1)
    }
  })

  return (
    <Box flexDirection="column">
      <Static items={messages}>
        {(entry) => <MessageLine key={entry.id} entry={entry} />}
      </Static>
      {selectMode ? (
        <AppSelectList items={selectMode.items} cursor={selectMode.cursor} />
      ) : formMode ? (
        <FormPrompt form={formMode} input={input} cursorPos={cursorPos} />
      ) : (
        <InputLine value={input} cursorPos={cursorPos} isRunning={isRunning} />
      )}
      <Box>
        <Text dimColor>
          {'App: '}{currentApp ? currentApp.name : 'none'}{'  '}
          {'Extension: '}{extensionConnected ? '● connected' : '○ disconnected'}
        </Text>
      </Box>
    </Box>
  )
}

async function main() {
  const wsServer = new ExtensionWsServer(WS_PORT)
  const bridge = new BrowserBridge(wsServer)
  const appRepo = new AppRepository()
  const agent = new Agent(bridge, appRepo.getCurrentApp())
  await agent.init()
  render(<AppComponent agent={agent} wsServer={wsServer} appRepo={appRepo} />)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
