import crypto from 'crypto'

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Buffer {
  const cleaned = input.replace(/=+$/, '').toUpperCase()
  let bits = 0
  let value = 0
  const bytes: number[] = []
  for (const char of cleaned) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function hotp(secret: Buffer, counter: bigint): string {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(counter)
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(code % 1_000_000).padStart(6, '0')
}

export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20))
}

export function totpUri(secret: string, email: string, issuer = 'CarFlow'): string {
  const label = encodeURIComponent(`${issuer}:${email}`)
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const normalized = String(token).replace(/\s/g, '')
  if (!/^\d{6}$/.test(normalized)) return false
  const key = base32Decode(secret)
  const step = BigInt(Math.floor(Date.now() / 1000 / 30))
  for (let w = -window; w <= window; w++) {
    if (hotp(key, step + BigInt(w)) === normalized) return true
  }
  return false
}

/** Returns the current 6-digit TOTP for tests and tooling. */
export function currentTotpCode(secret: string): string {
  const key = base32Decode(secret)
  const step = BigInt(Math.floor(Date.now() / 1000 / 30))
  return hotp(key, step)
}

export function generateSmsCode(): string {
  return String(crypto.randomInt(100_000, 999_999))
}

export function hashSmsCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex')
}
