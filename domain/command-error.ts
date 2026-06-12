export type CommandErrorCode =
  | 'timeout'
  | 'element-not-found'
  | 'tab-gone'
  | 'trace-lost'
  | 'extension-disconnected'
  | 'navigation-failed'
  | 'unknown'

export class CommandError extends Error {
  code: CommandErrorCode

  constructor(code: CommandErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

const ACTION_COMMANDS = new Set(['click', 'type'])

export function classifyErrorMessage(message: string, command?: string): CommandErrorCode {
  if (/element not found/i.test(message)) return 'element-not-found'
  if (/strict mode violation/i.test(message)) return 'element-not-found'
  if (/Timeout \d+ms exceeded/i.test(message)) {
    return command !== undefined && ACTION_COMMANDS.has(command) ? 'element-not-found' : 'timeout'
  }
  if (/net::ERR_|NS_ERROR_/.test(message)) return 'navigation-failed'
  return 'unknown'
}
