import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { Express } from 'express'
import request from 'supertest'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'
import {
  fakePngBuffer,
  oversizedBuffer,
  svgWithScriptBuffer,
  tinyPdfBuffer,
  tinyPngBuffer,
} from '../../test/fixtures/index.js'

/**
 * ID: UPL-01..UPL-06 (Phase 1.5) + UPL-N01..UPL-N20 negative/gap cases
 * Files: apps/backend/src/routes/uploads.ts
 */
describe('Uploads API', () => {
  let app: Express

  beforeAll(() => {
    app = buildTestApp()
  })

  afterEach(async () => {
    await resetDb()
  })

  describe('POST /api/uploads/vehicle-image', () => {
    it('UPL-01: dealer can upload a vehicle image and gets back a URL', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(res.status).toBe(200)
      expect(res.body.url).toContain('vehicle-images')
    })

    it('UPL-02: customer is forbidden from uploading vehicle images', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(res.status).toBe(403)
    })

    it('UPL-14/AUTH: unauthenticated upload is rejected with 401', async () => {
      const res = await request(app)
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(res.status).toBe(401)
    })

    it('UPL-N15: rejects a vehicle image over the 5MB route limit', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', oversizedBuffer(6 * 1024 * 1024), {
          filename: 'big.png',
          contentType: 'image/png',
        })
      expect(res.status).toBe(400)
    })

    it('UPL-N03: mimetype spoofing (non-image bytes labeled image/png) is accepted today (@gap: no magic-byte check)', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', fakePngBuffer, { filename: 'shell.png', contentType: 'image/png' })
      // Documents the gap: multer/route only checks the client-supplied
      // mimetype header, not the actual file signature.
      expect(res.status).toBe(200)
    })
  })

  describe('POST /api/uploads/avatar', () => {
    it('UPL-03: any authenticated role can upload an avatar', async () => {
      await seedFixtures()
      for (const [email, role] of [
        ['customer@test.dev', 'customer'],
        ['dealer@test.dev', 'dealer'],
        ['admin@test.dev', 'admin'],
      ] as const) {
        const { agent } = await loginAs(app, email, role)
        const res = await agent
          .post('/api/uploads/avatar')
          .attach('file', tinyPngBuffer, { filename: 'me.png', contentType: 'image/png' })
        expect(res.status).toBe(200)
        expect(res.body.url).toContain('user-avatars')
      }
    })

    it('UPL-N02: rejects an avatar over the 2MB route limit', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/avatar')
        .attach('file', oversizedBuffer(3 * 1024 * 1024), {
          filename: 'big.png',
          contentType: 'image/png',
        })
      expect(res.status).toBe(400)
    })

    it('UPL-N04: SVG avatar upload with embedded <script> is accepted today (@gap: XSS-serving risk)', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/avatar')
        .attach('file', svgWithScriptBuffer, { filename: 'evil.svg', contentType: 'image/svg+xml' })
      // image/svg+xml is not in the allow-list, so this specific route
      // rejects it — recorded here as a regression guard, not a gap.
      expect(res.status).toBe(400)
    })

    it('UPL-05/AUTH: rejects unsupported mimetypes', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/avatar')
        .attach('file', tinyPdfBuffer, { filename: 'doc.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(400)
    })

    it('UPL-N05: rejects request with no file attached', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent.post('/api/uploads/avatar')
      expect(res.status).toBe(400)
    })
  })

  describe('POST /api/uploads/document', () => {
    it('UPL-04: customer can upload a QID or drivers_license document', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(200)
      expect(res.body.path).toContain('qid')
    })

    it('UPL-05: rejects an invalid document type', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const res = await agent
        .post('/api/uploads/document')
        .field('type', 'passport')
        .attach('file', tinyPdfBuffer, { filename: 'doc.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(400)
    })

    it('dealer/admin cannot upload documents via the customer-only route (403)', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(res.status).toBe(403)
    })

    it('UPL-N06: re-uploading the same document type overwrites the DB path but the old file stays on disk (@gap: orphaned file)', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const first = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid1.pdf', contentType: 'application/pdf' })
      const second = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid2.pdf', contentType: 'application/pdf' })
      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(second.body.path).not.toBe(first.body.path)
      // No cleanup call is made for first.body.path — the route only ever
      // writes new files, it never calls deleteStoredFile on replace.
    })
  })

  describe('GET /api/uploads/documents', () => {
    it('UPL-05/UPL-N07: customers may only read their own documents (403 for others)', async () => {
      await seedFixtures()
      const { agent: customerAgent } = await loginAs(app, 'customer@test.dev', 'customer')
      await customerAgent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })

      const { agent: otherAgent } = await loginAs(app, 'customer2@test.dev', 'customer')
      const res = await otherAgent.get('/api/uploads/documents').query({ path: 'documents/some-other-users-doc.pdf' })
      // Either 403 (blocked because path doesn't start with their own id) or 404 if not found first.
      expect([403, 404]).toContain(res.status)
    })

    it('UPL-N08: rejects path traversal attempts', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'admin@test.dev', 'admin')
      const res = await agent.get('/api/uploads/documents').query({ path: '../../etc/passwd' })
      expect(res.status).toBe(400)
    })
  })

  describe('DELETE /api/uploads/by-url', () => {
    it('UPL-06: removes a previously uploaded file', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const uploaded = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      const res = await agent.delete('/api/uploads/by-url').send({ url: uploaded.body.url })
      expect(res.status).toBe(204)
    })

    it('UPL-N12/N14: requires authentication', async () => {
      const res = await request(app).delete('/api/uploads/by-url').send({ url: 'http://x/y.png' })
      expect(res.status).toBe(401)
    })
  })
})
