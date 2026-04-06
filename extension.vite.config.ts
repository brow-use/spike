import { defineConfig, type Plugin } from 'vite'

function stubPlaywrightInternals(): Plugin {
  const stubs: Record<string, string> = {
    '../playwright': 'export default {}; export function createPlaywright() { return {}; }',
    './bidiOverCdp': 'export default {}; export function connectBidiOverCdp() { return {}; }',
  }
  return {
    name: 'stub-playwright-internals',
    resolveId(id) {
      if (id in stubs) return `\0virtual:${id}`
    },
    load(id) {
      const key = id.replace('\0virtual:', '')
      if (key in stubs) return stubs[key]
    },
  }
}

export default defineConfig({
  plugins: [stubPlaywrightInternals()],
  build: {
    lib: {
      entry: 'extension/background.ts',
      formats: ['es'],
      fileName: () => 'background.js',
    },
    outDir: 'dist/extension',
    emptyOutDir: false,
    target: 'chrome120',
    minify: false,
  },
})
