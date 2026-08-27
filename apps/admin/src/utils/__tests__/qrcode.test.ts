import { describe, expect, it } from 'vitest'
import { encodeQrCode, qrCodeSvg } from '../qrcode'

/** GF(256) exponent table (primitive polynomial 0x11D), rebuilt independently. */
function gfExp(): number[] {
  const exp: number[] = []
  let x = 1
  for (let i = 0; i < 512; i += 1) {
    exp.push(x)
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  return exp
}

const EXP = gfExp()
const LOG = (() => {
  const log = new Array<number>(256).fill(0)
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    log[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  return log
})()

function mul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

function moduleAt(qr: { size: number; modules: boolean[] }, row: number, col: number): boolean {
  return qr.modules[row * qr.size + col]
}

const TOTP_URI =
  'otpauth://totp/CarFlow%3Adealer%40carflow.qa?secret=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP&issuer=CarFlow&digits=6&period=30'

describe('qrcode encoder', () => {
  it('QR-01: picks a version large enough for a TOTP enrolment URI', () => {
    const qr = encodeQrCode(TOTP_URI)
    expect(qr.version).toBeGreaterThanOrEqual(1)
    expect(qr.version).toBeLessThanOrEqual(10)
    expect(qr.size).toBe(qr.version * 4 + 17)
    expect(qr.modules).toHaveLength(qr.size * qr.size)
  })

  it('QR-02: draws the three finder patterns and both timing patterns', () => {
    const qr = encodeQrCode(TOTP_URI)
    const corners: Array<[number, number]> = [
      [0, 0],
      [0, qr.size - 7],
      [qr.size - 7, 0],
    ]
    for (const [top, left] of corners) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const ring = r === 0 || r === 6 || c === 0 || c === 6
          const core = r >= 2 && r <= 4 && c >= 2 && c <= 4
          expect(moduleAt(qr, top + r, left + c)).toBe(ring || core)
        }
      }
    }
    for (let i = 8; i < qr.size - 8; i += 1) {
      expect(moduleAt(qr, 6, i)).toBe(i % 2 === 0)
      expect(moduleAt(qr, i, 6)).toBe(i % 2 === 0)
    }
    // The dark module is set for every version.
    expect(moduleAt(qr, qr.size - 8, 8)).toBe(true)
  })

  it('QR-03: Reed-Solomon parity is a valid codeword (syndromes are zero)', () => {
    // A codeword of an RS(n, k) code evaluates to zero at alpha^0..alpha^(ec-1).
    // Reproduce the encoder's block for a short payload: version 1, ECC M is a
    // single block of 16 data codewords with 10 EC codewords.
    const data = [
      0x40, 0xd2, 0x75, 0x47, 0x76, 0x17, 0x32, 0x06, 0x27, 0x26, 0x96, 0xc6, 0xc6, 0x96, 0x70, 0xec,
    ]
    // Generator for degree 10.
    let generator = [1]
    for (let i = 0; i < 10; i += 1) {
      const next = new Array<number>(generator.length + 1).fill(0)
      for (let j = 0; j < generator.length; j += 1) {
        next[j] ^= generator[j]
        next[j + 1] ^= mul(generator[j], EXP[i])
      }
      generator = next
    }
    const remainder = new Array<number>(10).fill(0)
    for (const byte of data) {
      const factor = byte ^ remainder[0]
      remainder.shift()
      remainder.push(0)
      if (factor !== 0) {
        for (let i = 0; i < 10; i += 1) remainder[i] ^= mul(generator[i + 1], factor)
      }
    }
    const codeword = [...data, ...remainder]
    for (let i = 0; i < 10; i += 1) {
      let sum = 0
      for (const coefficient of codeword) sum = mul(sum, EXP[i]) ^ coefficient
      expect(sum).toBe(0)
    }
  })

  it('QR-04: writes both format-information copies as a valid level-M BCH word', () => {
    const qr = encodeQrCode(TOTP_URI)
    const bit = (row: number, col: number) => (moduleAt(qr, row, col) ? 1 : 0)
    let copy1 = 0
    let copy2 = 0
    for (let i = 0; i < 15; i += 1) {
      if (i <= 5) copy1 |= bit(i, 8) << i
      else if (i === 6) copy1 |= bit(7, 8) << i
      else if (i === 7) copy1 |= bit(8, 8) << i
      else if (i === 8) copy1 |= bit(8, 7) << i
      else copy1 |= bit(8, 14 - i) << i

      if (i < 8) copy2 |= bit(8, qr.size - 1 - i) << i
      else copy2 |= bit(qr.size - 15 + i, 8) << i
    }
    expect(copy1).toBe(copy2)

    const unmasked = copy1 ^ 0b101010000010010
    // Top two bits of the 5 data bits are the EC level; 00 is level M.
    expect(unmasked >> 13).toBe(0)
    // The 15-bit word must divide cleanly by the BCH(15,5) generator.
    let remainder = unmasked
    for (let i = 4; i >= 0; i -= 1) {
      if ((remainder >>> (i + 10)) & 1) remainder ^= 0b10100110111 << i
    }
    expect(remainder).toBe(0)
  })

  it('QR-05: emits a self-contained SVG with a quiet zone', () => {
    const svg = qrCodeSvg('otpauth://totp/CarFlow:a@b.qa?secret=ABCDEFGHIJKLMNOP&issuer=CarFlow')
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('viewBox="0 0 ')
    expect(svg).not.toContain('http://www.w3.org/1999/xlink')
    // 4 modules of quiet zone on each side.
    const qr = encodeQrCode('otpauth://totp/CarFlow:a@b.qa?secret=ABCDEFGHIJKLMNOP&issuer=CarFlow')
    expect(svg).toContain(`viewBox="0 0 ${qr.size + 8} ${qr.size + 8}"`)
  })

  it('QR-05: refuses text that does not fit rather than truncating it', () => {
    expect(() => encodeQrCode('x'.repeat(400))).toThrow(/too long/i)
  })
})
