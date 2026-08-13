import { describe, expect, it } from 'vitest'
import { hashPassword, verifyPassword } from '../password.js'

describe('password helpers', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('secret123')
    expect(hash).not.toBe('secret123')
    expect(await verifyPassword('secret123', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })
})
