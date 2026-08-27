import { describe, expect, it } from 'vitest'
import { encodeQrCode } from '../qrcode'

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346]
const ECC_M: Array<{ ecPerBlock: number; groups: Array<[number, number]> }> = [
  { ecPerBlock: 0, groups: [] },
  { ecPerBlock: 10, groups: [[1, 16]] },
  { ecPerBlock: 16, groups: [[1, 28]] },
  { ecPerBlock: 26, groups: [[1, 44]] },
  { ecPerBlock: 18, groups: [[2, 32]] },
  { ecPerBlock: 24, groups: [[2, 43]] },
  { ecPerBlock: 16, groups: [[4, 27]] },
  { ecPerBlock: 18, groups: [[4, 31]] },
  { ecPerBlock: 22, groups: [[2, 38], [2, 39]] },
  { ecPerBlock: 22, groups: [[3, 36], [2, 37]] },
  { ecPerBlock: 26, groups: [[4, 43], [1, 44]] },
]
const ALIGN: number[][] = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]]

const EXP: number[] = []
const LOG = new Array<number>(256).fill(0)
;(() => {
  let x = 1
  for (let i = 0; i < 512; i += 1) {
    EXP.push(x)
    if (i < 255) LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
})()
const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

const MASKS: Array<(r: number, c: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function reservedMap(version: number, size: number): Uint8Array {
  const res = new Uint8Array(size * size)
  const mark = (r: number, c: number) => {
    if (r >= 0 && r < size && c >= 0 && c < size) res[r * size + c] = 1
  }
  for (const [row, col] of [[0, 0], [0, size - 7], [size - 7, 0]] as Array<[number, number]>) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) mark(row + r, col + c)
  }
  for (let i = 0; i < size; i += 1) {
    mark(6, i)
    mark(i, 6)
  }
  const pos = ALIGN[version]
  for (const row of pos)
    for (const col of pos) {
      if ((row === 6 && col === 6) || (row === 6 && col === size - 7) || (row === size - 7 && col === 6)) continue
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) mark(row + r, col + c)
    }
  mark(size - 8, 8)
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      mark(8, i)
      mark(i, 8)
    }
  }
  for (let i = 0; i < 8; i += 1) {
    mark(8, size - 1 - i)
    mark(size - 1 - i, 8)
  }
  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const r = Math.floor(i / 3)
      const c = size - 11 + (i % 3)
      mark(r, c)
      mark(c, r)
    }
  }
  return res
}

function decode(text: string): string {
  const qr = encodeQrCode(text)
  const size = qr.size
  const version = qr.version
  const mods = qr.modules.map((b) => (b ? 1 : 0))
  const res = reservedMap(version, size)

  // Recover mask from format info copy 1.
  let fmt = 0
  const bit = (r: number, c: number) => mods[r * size + c]
  for (let i = 0; i < 15; i += 1) {
    if (i <= 5) fmt |= bit(i, 8) << i
    else if (i === 6) fmt |= bit(7, 8) << i
    else if (i === 7) fmt |= bit(8, 8) << i
    else if (i === 8) fmt |= bit(8, 7) << i
    else fmt |= bit(8, 14 - i) << i
  }
  const mask = ((fmt ^ 0b101010000010010) >> 10) & 0b111

  const unmasked = mods.slice()
  for (let r = 0; r < size; r += 1)
    for (let c = 0; c < size; c += 1) {
      if (res[r * size + c]) continue
      if (MASKS[mask](r, c)) unmasked[r * size + c] ^= 1
    }

  // Read the zigzag.
  const bits: number[] = []
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step
      for (let off = 0; off < 2; off += 1) {
        const col = right - off
        if (res[row * size + col]) continue
        bits.push(unmasked[row * size + col])
      }
    }
    upward = !upward
  }
  const stream: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    let v = 0
    for (let j = 0; j < 8; j += 1) v = (v << 1) | bits[i + j]
    stream.push(v)
  }
  expect(stream.length).toBeGreaterThanOrEqual(TOTAL_CODEWORDS[version])

  // De-interleave.
  const spec = ECC_M[version]
  const blockSizes: number[] = []
  for (const [count, len] of spec.groups) for (let i = 0; i < count; i += 1) blockSizes.push(len)
  const dataBlocks: number[][] = blockSizes.map(() => [])
  const maxLen = Math.max(...blockSizes)
  let idx = 0
  for (let i = 0; i < maxLen; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) {
      if (i < blockSizes[b]) dataBlocks[b].push(stream[idx++])
    }
  }
  const ecBlocks: number[][] = blockSizes.map(() => [])
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (let b = 0; b < blockSizes.length; b += 1) ecBlocks[b].push(stream[idx++])
  }

  // Verify syndromes of every block.
  for (let b = 0; b < blockSizes.length; b += 1) {
    const cw = [...dataBlocks[b], ...ecBlocks[b]]
    for (let i = 0; i < spec.ecPerBlock; i += 1) {
      let sum = 0
      for (const coefficient of cw) sum = mul(sum, EXP[i]) ^ coefficient
      expect(sum).toBe(0)
    }
  }

  const data = dataBlocks.flat()
  const dataBits: number[] = []
  for (const byte of data) for (let i = 7; i >= 0; i -= 1) dataBits.push((byte >> i) & 1)
  let p = 0
  const take = (n: number) => {
    let v = 0
    for (let i = 0; i < n; i += 1) v = (v << 1) | dataBits[p++]
    return v
  }
  expect(take(4)).toBe(0b0100)
  const count = take(version < 10 ? 8 : 16)
  const out: number[] = []
  for (let i = 0; i < count; i += 1) out.push(take(8))
  return new TextDecoder().decode(Uint8Array.from(out))
}

describe('qr round trip', () => {
  for (const sample of [
    'a',
    'otpauth://totp/CarFlow:a@b.qa?secret=ABCDEFGHIJKLMNOP&issuer=CarFlow',
    'otpauth://totp/CarFlow%3Adealer%40carflow.qa?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CarFlow&digits=6&period=30',
    'x'.repeat(40),
    'x'.repeat(80),
    'x'.repeat(110),
    'x'.repeat(140),
    'x'.repeat(170),
    'x'.repeat(200),
  ]) {
    it(`round trips ${sample.length} bytes`, () => {
      expect(decode(sample)).toBe(sample)
    })
  }
})
