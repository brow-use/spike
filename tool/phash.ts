import { PNG } from 'pngjs'

export function dhash(pngBuffer: Buffer): string {
  const png = PNG.sync.read(pngBuffer)
  const { width, height, data } = png

  const cols = 9
  const rows = 8
  const gray = new Uint8Array(cols * rows)

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = Math.min(width - 1, Math.floor((c * width) / cols))
      const sy = Math.min(height - 1, Math.floor((r * height) / rows))
      const idx = (sy * width + sx) * 4
      const rv = data[idx]
      const gv = data[idx + 1]
      const bv = data[idx + 2]
      gray[r * cols + c] = Math.round(0.299 * rv + 0.587 * gv + 0.114 * bv)
    }
  }

  let bits = 0n
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const left = gray[r * cols + c]
      const right = gray[r * cols + c + 1]
      bits = (bits << 1n) | (left > right ? 1n : 0n)
    }
  }

  return bits.toString(16).padStart(16, '0')
}

export function hamming(a: string, b: string): number {
  const xor = BigInt('0x' + a) ^ BigInt('0x' + b)
  let n = xor
  let count = 0
  while (n > 0n) {
    count += Number(n & 1n)
    n >>= 1n
  }
  return count
}
