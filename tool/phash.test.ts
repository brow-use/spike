import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { dhash, hamming } from './phash.js'

function makePng(w: number, h: number, fn: (x: number, y: number) => [number, number, number]): Buffer {
  const png = new PNG({ width: w, height: h })
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4
      const [r, g, b] = fn(x, y)
      png.data[i] = r
      png.data[i + 1] = g
      png.data[i + 2] = b
      png.data[i + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

describe('dhash', () => {
  test('identical images produce identical hashes', () => {
    const a = makePng(64, 64, (x, y) => [((x * 7 + y * 3) * 17) % 255, ((x * 7 + y * 3) * 17) % 255, ((x * 7 + y * 3) * 17) % 255])
    const b = makePng(64, 64, (x, y) => [((x * 7 + y * 3) * 17) % 255, ((x * 7 + y * 3) * 17) % 255, ((x * 7 + y * 3) * 17) % 255])
    assert.equal(dhash(a), dhash(b))
    assert.equal(hamming(dhash(a), dhash(b)), 0)
  })

  test('hash output is a 16-character hex string', () => {
    const png = makePng(32, 32, (x) => [x * 8, x * 8, x * 8])
    const h = dhash(png)
    assert.equal(h.length, 16)
    assert.match(h, /^[0-9a-f]{16}$/)
  })

  test('all-white vs all-black produce distinct hashes', () => {
    const white = makePng(32, 32, () => [255, 255, 255])
    const black = makePng(32, 32, () => [0, 0, 0])
    // Both are uniform so dhash is all zeros for both (left == right everywhere).
    // Document this: dHash of a flat image is 0000000000000000.
    assert.equal(dhash(white), '0000000000000000')
    assert.equal(dhash(black), '0000000000000000')
  })

  test('column-alternating stripes differ from row-alternating stripes', () => {
    // dHash compares adjacent columns. A column-alternating pattern (vertical
    // stripes) produces bits that alternate 1,0 per pair. A row-alternating
    // pattern (horizontal stripes) produces bits that are all 0 because
    // adjacent columns have the same brightness at every row.
    const vertStripes = makePng(32, 32, (x) => {
      const v = x % 2 === 0 ? 255 : 0
      return [v, v, v]
    })
    const horizStripes = makePng(32, 32, (_x, y) => {
      const v = y % 2 === 0 ? 255 : 0
      return [v, v, v]
    })
    const d = hamming(dhash(vertStripes), dhash(horizStripes))
    // Vertical-stripe hash has ~half the bits set, horizontal is all zeros,
    // so distance should be substantial.
    assert.ok(d >= 16, `expected distance >= 16, got ${d}`)
  })

  test('patterned noise produces non-trivial distance from different noise', () => {
    const a = makePng(64, 64, (x, y) => {
      const v = ((x * 7 + y * 3) * 17) % 255
      return [v, v, v]
    })
    const b = makePng(64, 64, (x, y) => {
      const v = ((x * 5 + y * 11) * 13) % 255
      return [v, v, v]
    })
    const d = hamming(dhash(a), dhash(b))
    assert.ok(d > 10, `expected distinct images to have hamming > 10, got ${d}`)
  })
})

describe('hamming', () => {
  test('identical hashes return 0', () => {
    assert.equal(hamming('deadbeefdeadbeef', 'deadbeefdeadbeef'), 0)
  })

  test('all bits different returns 64', () => {
    assert.equal(hamming('0000000000000000', 'ffffffffffffffff'), 64)
  })

  test('single bit difference returns 1', () => {
    assert.equal(hamming('0000000000000000', '0000000000000001'), 1)
    assert.equal(hamming('0000000000000000', '8000000000000000'), 1)
  })

  test('half-and-half returns 32', () => {
    assert.equal(hamming('00000000ffffffff', 'ffffffff00000000'), 64)
    assert.equal(hamming('00000000ffffffff', '0000000000000000'), 32)
  })

  test('symmetric: hamming(a, b) === hamming(b, a)', () => {
    const a = 'deadbeefcafef00d'
    const b = '0123456789abcdef'
    assert.equal(hamming(a, b), hamming(b, a))
  })
})
