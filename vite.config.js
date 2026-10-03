import { defineConfig } from 'vite'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

const here = import.meta.dirname
const root = resolve(here, 'src/renderer')

// Each screen is its own page so Electron can load it into its own window.
const pages = ['panel', 'simulator', 'names', 'test', 'conflicts', 'overlay']
const input = { index: resolve(root, 'index.html') }
for (const page of pages) {
  const file = resolve(root, page, 'index.html')
  if (existsSync(file)) input[page] = file
}

export default defineConfig({
  root,
  // Relative asset paths so the built pages load from file:// in Electron.
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The engine lives outside the renderer root.
    fs: { allow: [here] },
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
    rollupOptions: { input },
  },
})
