const EXT_TO_LANGUAGE: Record<string, string> = {
  ts: 'tsx',
  tsx: 'tsx',
  js: 'jsx',
  jsx: 'jsx',
  mjs: 'jsx',
  cjs: 'jsx',
  json: 'json',
  css: 'css',
  html: 'markup',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'bash',
  py: 'python',
}

const SOURCE_EXTENSIONS = new Set(Object.keys(EXT_TO_LANGUAGE))

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return ''
  return name.slice(dot + 1).toLowerCase()
}

export function languageForFile(name: string): string {
  return EXT_TO_LANGUAGE[extensionOf(name)] ?? 'tsx'
}

export function isSourceFile(name: string): boolean {
  return SOURCE_EXTENSIONS.has(extensionOf(name))
}
