import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { validatePassword } from './validatePassword.js'

const ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

/** Ambiguous glyphs (0/O, 1/l/I) left out — these get read off an email. */
const TEMP_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ'
const TEMP_DIGITS = '23456789'
const TEMP_ALPHABET = TEMP_LETTERS + TEMP_DIGITS
export const TEMPORARY_PASSWORD_LENGTH = 16

function pick(alphabet: string): string {
  return alphabet[crypto.randomInt(alphabet.length)]
}

/**
 * Temporary password for admin-created accounts, guaranteed to satisfy
 * `validatePassword`. `crypto.randomBytes(n).toString('base64url')` — the old
 * idiom — can come out with no digit at all and below the 8-character floor,
 * so it could mint an account whose password the owner could never re-set to
 * something equivalent.
 */
export function generateTemporaryPassword(length = TEMPORARY_PASSWORD_LENGTH): string {
  const chars = [pick(TEMP_LETTERS), pick(TEMP_DIGITS)]
  while (chars.length < Math.max(length, 8)) {
    chars.push(pick(TEMP_ALPHABET))
  }
  // Shuffle so the guaranteed letter/digit are not always in the same slots.
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  const password = chars.join('')
  /* c8 ignore next 3 -- defence in depth: the alphabet above cannot fail the policy */
  if (validatePassword(password)) {
    throw new Error('Generated temporary password failed the password policy')
  }
  return password
}
