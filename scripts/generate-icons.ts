import { chromium } from 'playwright'
import { mkdir, writeFile } from 'fs/promises'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = resolve(ROOT, 'extension', 'icons')

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="22" fill="#1a1f2e"/>
  <rect x="14" y="30" width="100" height="72" rx="7" fill="none" stroke="#4a90d9" stroke-width="7"/>
  <line x1="14" y1="50" x2="114" y2="50" stroke="#4a90d9" stroke-width="7"/>
  <circle cx="27" cy="40" r="4" fill="#4a90d9"/>
  <circle cx="41" cy="40" r="4" fill="#4a90d9"/>
  <polygon points="52,67 52,95 80,81" fill="#4a90d9"/>
</svg>
`

const html = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; }
  body { width: 128px; height: 128px; overflow: hidden; background: transparent; }
  svg { width: 128px; height: 128px; }
</style>
</head>
<body>${svg}</body>
</html>`

const SIZES = [16, 32, 48, 128]

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 128, height: 128 })
await page.setContent(html)

await mkdir(OUT, { recursive: true })

for (const size of SIZES) {
  const buf = await page.locator('svg').screenshot({ type: 'png', omitBackground: true })
  if (size === 128) {
    await writeFile(resolve(OUT, `icon-${size}.png`), buf)
  } else {
    const resizePage = await browser.newPage()
    await resizePage.setViewportSize({ width: size, height: size })
    await resizePage.setContent(`<!DOCTYPE html>
<html><head><style>
  * { margin: 0; padding: 0; }
  body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  svg { width: ${size}px; height: ${size}px; }
</style></head><body>${svg}</body></html>`)
    const resized = await resizePage.locator('svg').screenshot({ type: 'png', omitBackground: true })
    await writeFile(resolve(OUT, `icon-${size}.png`), resized)
    await resizePage.close()
  }
  console.log(`[icons] Generated icon-${size}.png`)
}

await browser.close()
