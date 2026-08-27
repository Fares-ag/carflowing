import { describe, expect, it } from 'vitest'
import { TEMPORARY_PASSWORD_LENGTH, generateTemporaryPassword, hashPassword, verifyPassword } from '../password.js'
import { validatePassword } from '../validatePassword.js'

describe('password helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  describe('generateTemporaryPassword', () => {
    it('always satisfies the shared password policy', () => {
      // base64url of 9 random bytes (the previous admin-create idiom) can come
      // out digit-free; this must never happen.
      for (let i = 0; i < 200; i += 1) {
        const password = generateTemporaryPassword()
        expect(validatePassword(password)).toBeNull()
        expect(password).toHaveLength(TEMPORARY_PASSWORD_LENGTH)
      }
    })

    it('never drops below the 8-character policy floor even when asked for less', () => {
      const password = generateTemporaryPassword(4)
      expect(password.length).toBeGreaterThanOrEqual(8)
      expect(validatePassword(password)).toBeNull()
    })

    it('does not repeat itself', () => {
      const generated = new Set(Array.from({ length: 50 }, () => generateTemporaryPassword()))
      expect(generated.size).toBe(50)
    })
  })
})
