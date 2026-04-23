import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: path.resolve(HERE, 'viewer'),
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },
  build: {
    outDir: path.resolve(HERE, 'dist/viewer'),
    emptyOutDir: true,
  },
})
