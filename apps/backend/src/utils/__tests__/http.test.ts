import { describe, expect, it, vi } from 'vitest'
import { paginated, parsePagination } from '../http.js'

describe('http utils', () => {
  it('parsePagination clamps pageSize and computes offset', () => {
    expect(parsePagination({ page: '2', pageSize: '500' })).toEqual({
      page: 2,
      pageSize: 100,
      offset: 100,
      limit: 100,
    })
  })

  it('paginated wraps list metadata', () => {
    expect(paginated(['a'], 1, 1, 10)).toEqual({ items: ['a'], total: 1, page: 1, pageSize: 10 })
  })
})

describe('mail service', () => {
  it('enqueues to outbox when RESEND_API_KEY is unset', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const { sendEmail } = await import('../../services/mail.js')
    const { db } = await import('../../db/index.js')
    const { emailOutbox } = await import('../../db/schema.js')
    const { eq } = await import('drizzle-orm')
    const id = await sendEmail({ to: 'a@test.dev', subject: 'Hi', html: '<p>x</p>' })
    const [row] = await db.select().from(emailOutbox).where(eq(emailOutbox.id, id))
    expect(row.subject).toBe('Hi')
    expect(row.status).toBe('sent')
  })
})

describe('storage local driver', () => {
  it('stores and deletes a local file', async () => {
    vi.stubEnv('UPLOAD_DRIVER', 'local')
    vi.stubEnv('UPLOAD_DIR', './.uploads-unit-test')
    vi.stubEnv('PUBLIC_API_URL', 'http://localhost:3001')
    const { storeFile, deleteStoredFile } = await import('../../storage/index.js')
    const buf = Buffer.from('hello')
    const stored = await storeFile('vehicle-images', 'unit/test.png', buf, 'image/png')
    expect(stored.url).toContain('/uploads/vehicle-images/')
    await deleteStoredFile(stored.url)
  })
})

describe('mappers', () => {
  it('maps profile rows to user DTOs', async () => {
    const { mapProfileToUser } = await import('../../db/mappers.js')
    const user = mapProfileToUser({
      id: '1',
      email: 'a@test.dev',
      name: 'A',
      role: 'customer',
      createdAt: new Date('2024-01-01'),
    })
    expect(user.email).toBe('a@test.dev')
  })
})
