/**
 * Minimal QR Code encoder (byte mode, error-correction level M, versions 1-10).
 *
 * Exists because 2FA enrolment needs a scannable `otpauth://` code and neither
 * SPA ships a QR dependency. Scope is deliberately the smallest thing that
 * encodes a TOTP URI (~140 bytes at most): byte mode only, ECC level M only,
 * and it throws rather than silently truncating anything that does not fit
 * version 10. Callers must handle that throw by falling back to manual secret
 * entry — never render a partial code.
 *
 * NOTE: an identical copy lives in apps/dealer/src/utils/qrcode.ts. Both apps
 * need it and neither may import from the other; it belongs in
 * packages/shared once that package is being edited again.
 */

/** Total codewords (data + error correction) per version, index 1-10. */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346]

/**
 * ECC level M block layout per version: error-correction codewords per block,
 * then the block groups as [blockCount, dataCodewordsPerBlock].
 */
const ECC_M: Array<{ ecPerBlock: number; groups: Array<[number, number]> }> = [
  { ecPerBlock: 0, groups: [] }, // version 0 placeholder
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

/** Alignment-pattern centre coordinates per version. */
const ALIGNMENT_POSITIONS: number[][] = [
  [], // version 0 placeholder
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
]

const MAX_VERSION = 10

// ---------------------------------------------------------------------------
// GF(256) arithmetic for Reed-Solomon, primitive polynomial 0x11D.
// ---------------------------------------------------------------------------

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)

;(function buildGaloisTables() {
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) {
    GF_EXP[i] = GF_EXP[i - 255]
  }
})()

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return GF_EXP[GF_LOG[a] + GF_LOG[b]]
}

/** Reed-Solomon generator polynomial of the given degree. */
function rsGenerator(degree: number): Uint8Array {
  let poly = new Uint8Array([1])
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], GF_EXP[i])
    }
    poly = next
  }
  return poly
}

/** Error-correction codewords for one data block. */
function rsEncode(data: Uint8Array, ecCount: number): Uint8Array {
  const generator = rsGenerator(ecCount)
  const remainder = new Uint8Array(ecCount)
  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.copyWithin(0, 1)
    remainder[ecCount - 1] = 0
    if (factor !== 0) {
      for (let i = 0; i < ecCount; i += 1) {
        remainder[i] ^= gfMul(generator[i + 1], factor)
      }
    }
  }
  return remainder
}

// ---------------------------------------------------------------------------
// Bit buffer
// ---------------------------------------------------------------------------

class BitBuffer {
  private bits: number[] = []

  put(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1)
    }
  }

  get length(): number {
    return this.bits.length
  }

  toCodewords(byteCount: number): Uint8Array {
    const out = new Uint8Array(byteCount)
    for (let i = 0; i < this.bits.length; i += 1) {
      if (this.bits[i]) out[i >> 3] |= 0x80 >> (i & 7)
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

function dataCodewordCount(version: number): number {
  const spec = ECC_M[version]
  const blocks = spec.groups.reduce((sum, [count]) => sum + count, 0)
  return TOTAL_CODEWORDS[version] - spec.ecPerBlock * blocks
}

function pickVersion(byteLength: number): number {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    // 4 mode bits + character-count bits + payload, rounded up to codewords.
    const countBits = version < 10 ? 8 : 16
    const needed = Math.ceil((4 + countBits + byteLength * 8) / 8)
    if (needed <= dataCodewordCount(version)) return version
  }
  throw new Error(`Text is too long for a version ${MAX_VERSION} QR code`)
}

/** Builds the interleaved data + error-correction codeword stream. */
function buildCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const spec = ECC_M[version]
  const capacity = dataCodewordCount(version)
  const buffer = new BitBuffer()
  buffer.put(0b0100, 4) // byte mode
  buffer.put(bytes.length, version < 10 ? 8 : 16)
  for (const byte of bytes) buffer.put(byte, 8)

  // Terminator, then pad to a whole codeword, then the standard pad bytes.
  const terminator = Math.min(4, capacity * 8 - buffer.length)
  buffer.put(0, terminator)
  if (buffer.length % 8 !== 0) buffer.put(0, 8 - (buffer.length % 8))
  const data = buffer.toCodewords(capacity)
  for (let i = buffer.length / 8, pad = 0; i < capacity; i += 1, pad += 1) {
    data[i] = pad % 2 === 0 ? 0xec : 0x11
  }

  const dataBlocks: Uint8Array[] = []
  const ecBlocks: Uint8Array[] = []
  let offset = 0
  for (const [blockCount, blockSize] of spec.groups) {
    for (let i = 0; i < blockCount; i += 1) {
      const block = data.subarray(offset, offset + blockSize)
      offset += blockSize
      dataBlocks.push(block)
      ecBlocks.push(rsEncode(block, spec.ecPerBlock))
    }
  }

  const out = new Uint8Array(TOTAL_CODEWORDS[version])
  let index = 0
  const maxDataLength = Math.max(...dataBlocks.map((b) => b.length))
  for (let i = 0; i < maxDataLength; i += 1) {
    for (const block of dataBlocks) {
      if (i < block.length) out[index++] = block[i]
    }
  }
  for (let i = 0; i < spec.ecPerBlock; i += 1) {
    for (const block of ecBlocks) {
      out[index++] = block[i]
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Matrix construction
// ---------------------------------------------------------------------------

type Matrix = {
  size: number
  /** 1 dark, 0 light. */
  modules: Uint8Array
  /** 1 when the module is a function pattern and must not carry data. */
  reserved: Uint8Array
}

function createMatrix(size: number): Matrix {
  return { size, modules: new Uint8Array(size * size), reserved: new Uint8Array(size * size) }
}

function setModule(m: Matrix, row: number, col: number, dark: boolean, reserved = true): void {
  m.modules[row * m.size + col] = dark ? 1 : 0
  if (reserved) m.reserved[row * m.size + col] = 1
}

function placeFinder(m: Matrix, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r
      const cc = col + c
      if (rr < 0 || rr >= m.size || cc < 0 || cc >= m.size) continue
      const inRing = (r >= 0 && r <= 6 && (c === 0 || c === 6)) || (c >= 0 && c <= 6 && (r === 0 || r === 6))
      const inCore = r >= 2 && r <= 4 && c >= 2 && c <= 4
      setModule(m, rr, cc, inRing || inCore)
    }
  }
}

function placeFunctionPatterns(m: Matrix, version: number): void {
  placeFinder(m, 0, 0)
  placeFinder(m, 0, m.size - 7)
  placeFinder(m, m.size - 7, 0)

  // Timing patterns.
  for (let i = 8; i < m.size - 8; i += 1) {
    const dark = i % 2 === 0
    setModule(m, 6, i, dark)
    setModule(m, i, 6, dark)
  }

  // Alignment patterns, skipping the three finder corners.
  const positions = ALIGNMENT_POSITIONS[version]
  for (const row of positions) {
    for (const col of positions) {
      const nearFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === m.size - 7) ||
        (row === m.size - 7 && col === 6)
      if (nearFinder) continue
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const isDark = Math.max(Math.abs(r), Math.abs(c)) !== 1
          setModule(m, row + r, col + c, isDark)
        }
      }
    }
  }

  // Dark module, always set for every version.
  setModule(m, m.size - 8, 8, true)

  // Reserve the format-information areas (written after masking).
  for (let i = 0; i <= 8; i += 1) {
    if (i !== 6) {
      setModule(m, 8, i, false)
      setModule(m, i, 8, false)
    }
  }
  for (let i = 0; i < 8; i += 1) {
    setModule(m, 8, m.size - 1 - i, false)
    if (m.size - 1 - i !== m.size - 8) setModule(m, m.size - 1 - i, 8, false)
  }

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3)
      const col = m.size - 11 + (i % 3)
      setModule(m, row, col, false)
      setModule(m, col, row, false)
    }
  }
}

function placeData(m: Matrix, codewords: Uint8Array): void {
  let bitIndex = 0
  let upward = true
  for (let right = m.size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is skipped entirely.
    if (right === 6) right = 5
    for (let step = 0; step < m.size; step += 1) {
      const row = upward ? m.size - 1 - step : step
      for (let offset = 0; offset < 2; offset += 1) {
        const col = right - offset
        if (m.reserved[row * m.size + col]) continue
        const byte = codewords[bitIndex >> 3]
        const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1
        m.modules[row * m.size + col] = bit
        bitIndex += 1
      }
    }
    upward = !upward
  }
}

const MASK_FUNCTIONS: Array<(row: number, col: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
]

function applyMask(m: Matrix, mask: number): void {
  const fn = MASK_FUNCTIONS[mask]
  for (let row = 0; row < m.size; row += 1) {
    for (let col = 0; col < m.size; col += 1) {
      if (m.reserved[row * m.size + col]) continue
      if (fn(row, col)) m.modules[row * m.size + col] ^= 1
    }
  }
}

/** BCH(15,5) format information, ECC level M (indicator 0b00). */
function formatBits(mask: number): number {
  const data = (0b00 << 3) | mask
  let value = data << 10
  for (let i = 4; i >= 0; i -= 1) {
    if ((value >>> (i + 10)) & 1) value ^= 0b10100110111 << i
  }
  return ((data << 10) | value) ^ 0b101010000010010
}

/** BCH(18,6) version information, only written for versions 7 and up. */
function versionBits(version: number): number {
  let value = version << 12
  for (let i = 5; i >= 0; i -= 1) {
    if ((value >>> (i + 12)) & 1) value ^= 0b1111100100101 << i
  }
  return (version << 12) | value
}

function writeFormatInfo(m: Matrix, mask: number): void {
  const bits = formatBits(mask)
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    // Copy 1: down column 8 past the top-left finder, then along row 8.
    if (i <= 5) setModule(m, i, 8, dark)
    else if (i === 6) setModule(m, 7, 8, dark)
    else if (i === 7) setModule(m, 8, 8, dark)
    else if (i === 8) setModule(m, 8, 7, dark)
    else setModule(m, 8, 14 - i, dark)
    // Copy 2: along row 8 by the top-right finder, then up column 8 from the
    // bottom-left one.
    if (i < 8) setModule(m, 8, m.size - 1 - i, dark)
    else setModule(m, m.size - 15 + i, 8, dark)
  }
}

function writeVersionInfo(m: Matrix, version: number): void {
  if (version < 7) return
  const bits = versionBits(version)
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    const row = Math.floor(i / 3)
    const col = m.size - 11 + (i % 3)
    setModule(m, row, col, dark)
    setModule(m, col, row, dark)
  }
}

/** Standard mask-selection penalty (ISO/IEC 18004 rules 1-4). */
function maskPenalty(m: Matrix): number {
  const at = (r: number, c: number) => m.modules[r * m.size + c]
  let penalty = 0

  // Rule 1: runs of five or more same-coloured modules in a row or column.
  for (let i = 0; i < m.size; i += 1) {
    let rowRun = 1
    let colRun = 1
    for (let j = 1; j < m.size; j += 1) {
      rowRun = at(i, j) === at(i, j - 1) ? rowRun + 1 : 1
      if (rowRun === 5) penalty += 3
      else if (rowRun > 5) penalty += 1
      colRun = at(j, i) === at(j - 1, i) ? colRun + 1 : 1
      if (colRun === 5) penalty += 3
      else if (colRun > 5) penalty += 1
    }
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let r = 0; r < m.size - 1; r += 1) {
    for (let c = 0; c < m.size - 1; c += 1) {
      const v = at(r, c)
      if (v === at(r, c + 1) && v === at(r + 1, c) && v === at(r + 1, c + 1)) penalty += 3
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules either side.
  const pattern = [1, 0, 1, 1, 1, 0, 1]
  const light4 = [0, 0, 0, 0]
  const matches = (values: number[], start: number, seq: number[]) =>
    seq.every((bit, k) => values[start + k] === bit)
  for (let i = 0; i < m.size; i += 1) {
    const rowValues: number[] = []
    const colValues: number[] = []
    for (let j = 0; j < m.size; j += 1) {
      rowValues.push(at(i, j))
      colValues.push(at(j, i))
    }
    for (const values of [rowValues, colValues]) {
      for (let j = 0; j + 7 <= values.length; j += 1) {
        if (!matches(values, j, pattern)) continue
        const before = j >= 4 && matches(values, j - 4, light4)
        const after = j + 11 <= values.length && matches(values, j + 7, light4)
        if (before || after) penalty += 40
      }
    }
  }

  // Rule 4: deviation from an even light/dark split.
  let dark = 0
  for (let i = 0; i < m.modules.length; i += 1) dark += m.modules[i]
  const ratio = (dark * 100) / m.modules.length
  penalty += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return penalty
}

export interface QrCode {
  /** Modules per side, excluding the quiet zone. */
  size: number
  /** Row-major booleans; true is a dark module. */
  modules: boolean[]
  version: number
}

/**
 * Encodes `text` as a QR code (byte mode, ECC level M).
 * Throws when the text does not fit version 10 — callers must fall back to
 * manual entry rather than rendering an incomplete code.
 */
export function encodeQrCode(text: string): QrCode {
  const bytes = new TextEncoder().encode(text)
  const version = pickVersion(bytes.length)
  const codewords = buildCodewords(bytes, version)
  const size = version * 4 + 17

  let best: Matrix | null = null
  let bestPenalty = Number.POSITIVE_INFINITY
  for (let mask = 0; mask < 8; mask += 1) {
    const matrix = createMatrix(size)
    placeFunctionPatterns(matrix, version)
    placeData(matrix, codewords)
    applyMask(matrix, mask)
    writeFormatInfo(matrix, mask)
    writeVersionInfo(matrix, version)
    const penalty = maskPenalty(matrix)
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      best = matrix
    }
  }

  const chosen = best!
  return {
    size,
    version,
    modules: Array.from(chosen.modules, (value) => value === 1),
  }
}

/**
 * Renders `text` as a standalone SVG string, sized in modules so the caller can
 * scale it with CSS. `quietZone` is in modules (the spec requires 4).
 */
export function qrCodeSvg(text: string, quietZone = 4): string {
  const qr = encodeQrCode(text)
  const total = qr.size + quietZone * 2
  const paths: string[] = []
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.modules[row * qr.size + col]) continue
      paths.push(`M${col + quietZone} ${row + quietZone}h1v1h-1z`)
    }
  }
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">`,
    `<rect width="${total}" height="${total}" fill="#ffffff"/>`,
    `<path d="${paths.join('')}" fill="#000000"/>`,
    '</svg>',
  ].join('')
}
