import fs from 'fs'
import { eq } from 'drizzle-orm'
import type { Express } from 'express'
import request from 'supertest'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { db } from '../../db/index.js'
import { vehicles } from '../../db/schema.js'
import { resolveLocalPath } from '../../storage/index.js'
import {
  evilHtmlBuffer,
  fakePngBuffer,
  oversizedBuffer,
  svgWithScriptBuffer,
  tinyPdfBuffer,
  tinyPngBuffer,
} from '../../test/fixtures/index.js'
import { buildTestApp, loginAs, resetDb, seedFixtures } from '../../test/helpers.js'

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

    it('UPL-N03: rejects mimetype spoofing when magic bytes do not match', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', fakePngBuffer, { filename: 'shell.png', contentType: 'image/png' })
      expect(res.status).toBe(400)
      expect(res.body.error).toMatch(/content does not match/i)
    })

    it('UPL-N16: rejects path traversal in vehicle-image prefix', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .field('prefix', '../../etc')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(res.status).toBe(400)
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

    it('UPL-N04: SVG avatar upload with embedded <script> is rejected', async () => {
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

    it('UPL-N06: re-uploading the same document type deletes the superseded scan', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const first = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid1.pdf', contentType: 'application/pdf' })
      expect(first.status).toBe(200)
      expect(fs.existsSync(resolveLocalPath(first.body.path))).toBe(true)

      const second = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid2.pdf', contentType: 'application/pdf' })
      expect(second.status).toBe(200)
      expect(second.body.path).not.toBe(first.body.path)
      // The replaced scan is gone: keeping it contradicts the retention copy
      // the app shows customers.
      expect(fs.existsSync(resolveLocalPath(first.body.path))).toBe(false)
      expect(fs.existsSync(resolveLocalPath(second.body.path))).toBe(true)

      // Replacing the other document type leaves this one alone.
      const licence = await agent
        .post('/api/uploads/document')
        .field('type', 'drivers_license')
        .attach('file', tinyPdfBuffer, { filename: 'dl.pdf', contentType: 'application/pdf' })
      expect(licence.status).toBe(200)
      expect(fs.existsSync(resolveLocalPath(second.body.path))).toBe(true)
    })

    it('UPL-AVATAR-01: uploading a new avatar deletes the one it replaces', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const first = await agent
        .post('/api/uploads/avatar')
        .attach('file', tinyPngBuffer, { filename: 'me1.png', contentType: 'image/png' })
      expect(first.status).toBe(200)
      const second = await agent
        .post('/api/uploads/avatar')
        .attach('file', tinyPngBuffer, { filename: 'me2.png', contentType: 'image/png' })
      expect(second.status).toBe(200)
      expect(second.body.path).not.toBe(first.body.path)
      expect(fs.existsSync(resolveLocalPath(first.body.path))).toBe(false)
      expect(fs.existsSync(resolveLocalPath(second.body.path))).toBe(true)
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

    it('SEC-DOC-01: identity documents are not served from /uploads static mount', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'customer@test.dev', 'customer')
      const uploaded = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(uploaded.status).toBe(200)
      const staticRes = await request(app).get(`/uploads/${uploaded.body.path}`)
      expect(staticRes.status).toBe(404)
      const authed = await agent.get('/api/uploads/documents/file').query({ path: uploaded.body.path })
      expect(authed.status).toBe(200)
    })

    it('SEC-DOC-02: admin may fetch any customer identity document via auth proxy', async () => {
      const fixtures = await seedFixtures()
      const { agent: customerAgent } = await loginAs(app, fixtures.customer.email, 'customer')
      const uploaded = await customerAgent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(uploaded.status).toBe(200)

      const { agent: adminAgent } = await loginAs(app, fixtures.admin.email, 'admin')
      const adminFetch = await adminAgent
        .get('/api/uploads/documents/file')
        .query({ path: uploaded.body.path })
      expect(adminFetch.status).toBe(200)
      expect(adminFetch.headers['content-type']).toMatch(/pdf/i)
    })
  })

  describe('DELETE /api/uploads/by-url', () => {
    it('UPL-06: removes a previously uploaded file', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
      const uploaded = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      await db
        .update(vehicles)
        .set({ imageUrl: uploaded.body.url })
        .where(eq(vehicles.id, fixtures.vehicles[0].id))
      const res = await agent.delete('/api/uploads/by-url').send({ url: uploaded.body.url })
      expect(res.status).toBe(204)
    })

    it('UPL-N17: dealer cannot delete another dealer vehicle image', async () => {
      const fixtures = await seedFixtures()
      const { agent: dealerAgent } = await loginAs(app, fixtures.dealer.email, 'dealer')
      const uploaded = await dealerAgent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(uploaded.status).toBe(200)
      await db
        .update(vehicles)
        .set({ imageUrl: uploaded.body.url })
        .where(eq(vehicles.id, fixtures.vehicles[0].id))

      const { agent: dealer2Agent } = await loginAs(app, fixtures.dealer2.email, 'dealer')
      const res = await dealer2Agent.delete('/api/uploads/by-url').send({ url: uploaded.body.url })
      expect(res.status).toBe(403)
    })

    it('UPL-N18: owners can delete blob-style URLs (media/document proxy shapes)', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')

      const avatar = await agent
        .post('/api/uploads/avatar')
        .attach('file', tinyPngBuffer, { filename: 'me.png', contentType: 'image/png' })
      expect(avatar.status).toBe(200)
      const document = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(document.status).toBe(200)

      // Exactly what storeFile hands back under UPLOAD_DRIVER=blob: the key
      // only appears percent-encoded in a query string, never as a prefix.
      const avatarBlobUrl = `http://localhost:3001/api/uploads/media?path=${encodeURIComponent(avatar.body.path)}`
      const documentBlobUrl = `/api/uploads/documents/file?path=${encodeURIComponent(document.body.path)}`

      const deletedAvatar = await agent.delete('/api/uploads/by-url').send({ url: avatarBlobUrl })
      expect(deletedAvatar.status).toBe(204)
      expect(fs.existsSync(resolveLocalPath(avatar.body.path))).toBe(false)

      const deletedDocument = await agent
        .delete('/api/uploads/by-url')
        .send({ url: documentBlobUrl })
      expect(deletedDocument.status).toBe(204)
      expect(fs.existsSync(resolveLocalPath(document.body.path))).toBe(false)
    })

    it('UPL-N19: another customer cannot delete a blob-style URL they do not own', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.customer.email, 'customer')
      const document = await agent
        .post('/api/uploads/document')
        .field('type', 'qid')
        .attach('file', tinyPdfBuffer, { filename: 'qid.pdf', contentType: 'application/pdf' })
      expect(document.status).toBe(200)

      const { agent: otherAgent } = await loginAs(app, fixtures.customer2.email, 'customer')
      const res = await otherAgent
        .delete('/api/uploads/by-url')
        .send({ url: `/api/uploads/documents/file?path=${encodeURIComponent(document.body.path)}` })
      expect(res.status).toBe(403)
      expect(fs.existsSync(resolveLocalPath(document.body.path))).toBe(true)
    })

    it('UPL-N20: dealer can delete a blob-style vehicle image URL of their own car', async () => {
      const fixtures = await seedFixtures()
      const { agent } = await loginAs(app, fixtures.dealer.email, 'dealer')
      const uploaded = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(uploaded.status).toBe(200)
      const blobUrl = `http://localhost:3001/api/uploads/media?path=${encodeURIComponent(uploaded.body.path)}`
      await db
        .update(vehicles)
        .set({ imageUrl: blobUrl })
        .where(eq(vehicles.id, fixtures.vehicles[0].id))

      const { agent: rivalAgent } = await loginAs(app, fixtures.dealer2.email, 'dealer')
      const forbidden = await rivalAgent.delete('/api/uploads/by-url').send({ url: blobUrl })
      expect(forbidden.status).toBe(403)

      const res = await agent.delete('/api/uploads/by-url').send({ url: blobUrl })
      expect(res.status).toBe(204)
      expect(fs.existsSync(resolveLocalPath(uploaded.body.path))).toBe(false)
    })

    it('UPL-N12/N14: requires authentication', async () => {
      const res = await request(app).delete('/api/uploads/by-url').send({ url: 'http://x/y.png' })
      expect(res.status).toBe(401)
    })
  })

  describe('Security hardening', () => {
    it('SEC-UPL-01: rejects evil.html bytes with a spoofed image MIME', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', evilHtmlBuffer, { filename: 'evil.html', contentType: 'image/png' })
      expect(res.status).toBe(400)
    })

    it('SEC-UPL-02: stores PNG bytes with a .png extension even when filename is evil.html', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const res = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'evil.html', contentType: 'image/png' })
      expect(res.status).toBe(200)
      expect(res.body.url).toMatch(/\.png($|\?)/)
    })

    it('SEC-UPL-03: static upload routes are served as attachment with restrictive Content-Type', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const uploaded = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(uploaded.status).toBe(200)

      const staticRes = await request(app).get(uploaded.body.url.replace(/^https?:\/\/[^/]+/, ''))
      expect(staticRes.status).toBe(200)
      expect(staticRes.headers['content-disposition']).toBe('attachment')
      expect(staticRes.headers['content-type']).toMatch(/^image\/png/)
      expect(staticRes.headers['x-content-type-options']).toBe('nosniff')
    })

    it('SEC-CSP-01: sets Content-Security-Policy-Report-Only by default', async () => {
      const res = await request(app).get('/health')
      expect(res.headers['content-security-policy-report-only']).toBe("default-src 'self'")
      expect(res.headers['content-security-policy']).toBeUndefined()
    })

    it('SEC-CSP-02: enforces CSP when CSP_ENFORCE=true', async () => {
      const previous = process.env.CSP_ENFORCE
      process.env.CSP_ENFORCE = 'true'
      const enforcedApp = buildTestApp()
      try {
        const res = await request(enforcedApp).get('/health')
        expect(res.headers['content-security-policy']).toBe("default-src 'self'")
        expect(res.headers['content-security-policy-report-only']).toBeUndefined()
      } finally {
        if (previous === undefined) delete process.env.CSP_ENFORCE
        else process.env.CSP_ENFORCE = previous
      }
    })
  })

  describe('GET /api/uploads/media', () => {
    it('UPL-MEDIA-01: serves a stored vehicle image by path', async () => {
      await seedFixtures()
      const { agent } = await loginAs(app, 'dealer@test.dev', 'dealer')
      const uploaded = await agent
        .post('/api/uploads/vehicle-image')
        .attach('file', tinyPngBuffer, { filename: 'car.png', contentType: 'image/png' })
      expect(uploaded.status).toBe(200)
      const media = await request(app)
        .get('/api/uploads/media')
        .query({ path: uploaded.body.path })
      expect(media.status).toBe(200)
      expect(media.headers['content-type']).toMatch(/image\/png/)
    })

    it('UPL-MEDIA-02: rejects document paths and traversal', async () => {
      await seedFixtures()
      const docs = await request(app)
        .get('/api/uploads/media')
        .query({ path: 'documents/someone/qid.png' })
      expect(docs.status).toBe(400)
      const traversal = await request(app)
        .get('/api/uploads/media')
        .query({ path: '../package.json' })
      expect(traversal.status).toBe(400)
    })
  })
})
