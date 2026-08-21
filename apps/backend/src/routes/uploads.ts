import fs from 'fs'
import path from 'path'
import { and, eq, or, sql } from 'drizzle-orm'
import { Router } from 'express'
import multer from 'multer'
import { db } from '../db/index.js'
import { customerProfiles, dealers, profiles, vehicles } from '../db/schema.js'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import {
  dealerCanAccessCustomerDocuments,
  userOwnsStoredPath,
} from '../services/documentAccess.js'
import {
  storeFile,
  deleteStoredFile,
  getStoredFile,
  resolveLocalPath,
  storageKeyFromReference,
  uploadRoot,
} from '../storage/index.js'
import { asyncHandler } from '../utils/http.js'
import {
  AVATAR_MIMES,
  DOCUMENT_MIMES,
  setAttachmentResponseHeaders,
  validateUploadContent,
  VEHICLE_IMAGE_MIMES,
} from '../utils/uploadContent.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

export const uploadsRouter = Router()

function sanitizeName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
}

/** Whitelist vehicle-image prefix segments; reject traversal outside vehicle-images/. */
function sanitizeVehicleImagePrefix(raw: string): string | null {
  const prefix = String(raw || 'temp').trim()
  if (!prefix || !/^[a-z0-9/_-]+$/i.test(prefix) || prefix.includes('..')) {
    return null
  }
  const normalizedKey = path.posix.normalize(path.posix.join('vehicle-images', prefix))
  if (!normalizedKey.startsWith('vehicle-images/') || normalizedKey.includes('..')) {
    return null
  }
  return normalizedKey.slice('vehicle-images/'.length) || 'temp'
}

function storageKeyFromUrl(url: string): string | null {
  return storageKeyFromReference(url)
}

async function dealerOwnsVehicleImage(dealerUserId: string, url: string): Promise<boolean> {
  const key = storageKeyFromUrl(url)
  if (!key?.startsWith('vehicle-images/')) return false
  const [dealer] = await db
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.ownerUserId, dealerUserId))
    .limit(1)
  if (!dealer) return false
  const [vehicle] = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(
      and(
        eq(vehicles.dealerId, dealer.id),
        or(
          eq(vehicles.imageUrl, url),
          sql`${vehicles.imageUrl} LIKE ${'%' + key + '%'}`,
          sql`${url} = ANY(${vehicles.imageUrls})`
        )
      )
    )
    .limit(1)
  return !!vehicle
}

/** Public proxy for marketplace images stored in a private Vercel Blob store. */
uploadsRouter.get(
  '/media',
  asyncHandler(async (req, res) => {
    const docPath = String(req.query.path || '')
    if (!docPath || docPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }
    if (!docPath.startsWith('vehicle-images/') && !docPath.startsWith('user-avatars/')) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    const file = await getStoredFile(docPath)
    if (!file) {
      res.status(404).json({ error: 'File not found' })
      return
    }
    // Allow customer/dealer/admin frontends on other origins to render <img> tags.
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    if (file.contentType) res.type(file.contentType)
    res.send(file.buffer)
  })
)

uploadsRouter.post(
  '/vehicle-image',
  requireAuth,
  requireRole('admin', 'dealer'),
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'file is required' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be under 5MB' })
      return
    }
    const validated = validateUploadContent(file.buffer, file.mimetype, VEHICLE_IMAGE_MIMES)
    if ('error' in validated) {
      res.status(400).json({ error: validated.error })
      return
    }
    const prefix = sanitizeVehicleImagePrefix(String(req.body.prefix || 'temp'))
    if (!prefix) {
      res.status(400).json({ error: 'Invalid upload prefix' })
      return
    }
    const relative = `${prefix}/${sanitizeName(file.originalname)}-${Date.now()}${validated.ext}`
    const stored = await storeFile('vehicle-images', relative, file.buffer, validated.mime)
    res.json({ url: stored.url, path: stored.path })
  })
)

uploadsRouter.post(
  '/avatar',
  requireAuth,
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const file = req.file
    if (!file) {
      res.status(400).json({ error: 'file is required' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Avatar must be under 2MB' })
      return
    }
    const validated = validateUploadContent(file.buffer, file.mimetype, AVATAR_MIMES)
    if ('error' in validated) {
      res.status(400).json({ error: validated.error })
      return
    }
    const relative = `profiles/${req.user!.sub}/avatar-${Date.now()}${validated.ext}`
    const stored = await storeFile('user-avatars', relative, file.buffer, validated.mime)
    await db.update(profiles).set({ avatarUrl: stored.url }).where(eq(profiles.id, req.user!.sub))
    res.json({ url: stored.url, path: stored.path })
  })
)

uploadsRouter.post(
  '/document',
  requireAuth,
  requireRole('customer'),
  upload.single('file'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const file = req.file
    const type = String(req.body.type || '')
    if (!file) {
      res.status(400).json({ error: 'file is required' })
      return
    }
    if (!['qid', 'drivers_license'].includes(type)) {
      res.status(400).json({ error: 'type must be qid or drivers_license' })
      return
    }
    const validated = validateUploadContent(file.buffer, file.mimetype, DOCUMENT_MIMES)
    if ('error' in validated) {
      res.status(400).json({ error: validated.error })
      return
    }
    const relative = `${req.user!.sub}/${type}-${Date.now()}${validated.ext}`
    const stored = await storeFile('documents', relative, file.buffer, validated.mime)

    const [cp] = await db
      .select()
      .from(customerProfiles)
      .where(eq(customerProfiles.userId, req.user!.sub))
      .limit(1)
    if (cp) {
      await db
        .update(customerProfiles)
        .set(
          type === 'qid'
            ? { qidDocumentPath: stored.path }
            : { driversLicensePath: stored.path }
        )
        .where(eq(customerProfiles.id, cp.id))
    } else {
      await db.insert(customerProfiles).values({
        userId: req.user!.sub,
        ...(type === 'qid'
          ? { qidDocumentPath: stored.path }
          : { driversLicensePath: stored.path }),
      })
    }

    res.json({ path: stored.path })
  })
)

uploadsRouter.get(
  '/documents',
  requireAuth,
  requireRole('admin', 'dealer', 'customer'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const docPath = String(req.query.path || '')
    if (!docPath || docPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }
    // Customers may only read their own docs
    if (req.user!.role === 'customer' && !docPath.startsWith(req.user!.sub)) {
      res.status(403).json({ error: 'Forbidden' })
      return
    }
    if (req.user!.role === 'dealer') {
      const [dealer] = await db
        .select({ id: dealers.id })
        .from(dealers)
        .where(eq(dealers.ownerUserId, req.user!.sub))
        .limit(1)
      if (!dealer) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      const customerId = docPath.split('/').find((part) => part.length === 36) ?? ''
      if (!customerId || !(await dealerCanAccessCustomerDocuments(dealer.id, customerId))) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }
    // Admin role bypasses ownership/relationship checks (full KYC review access).

    if (process.env.UPLOAD_DRIVER === 'blob') {
      // Private blob URLs from put() may already be accessible with token; return path-based API URL
      res.json({ url: `/api/uploads/documents/file?path=${encodeURIComponent(docPath)}` })
      return
    }

    const full = resolveLocalPath(docPath.startsWith('documents/') ? docPath : `documents/${docPath}`)
    // Also try raw key as stored
    const alt = resolveLocalPath(docPath)
    const filePath = fs.existsSync(full) ? full : alt
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.json({
      url: `/api/uploads/documents/file?path=${encodeURIComponent(docPath)}`,
    })
  })
)

uploadsRouter.get(
  '/documents/file',
  requireAuth,
  requireRole('admin', 'dealer', 'customer'),
  asyncHandler(async (req: AuthedRequest, res) => {
    const docPath = String(req.query.path || '')
    if (!docPath || docPath.includes('..')) {
      res.status(400).json({ error: 'Invalid path' })
      return
    }
    if (req.user!.role === 'customer' && !docPath.startsWith(req.user!.sub) && !docPath.includes(`/${req.user!.sub}/`) && !docPath.startsWith(`documents/${req.user!.sub}`)) {
      // allow keys like documents/{userId}/... or {userId}/...
      const ok =
        docPath.startsWith(req.user!.sub) ||
        docPath.startsWith(`documents/${req.user!.sub}`)
      if (!ok) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }
    if (req.user!.role === 'dealer') {
      const [dealer] = await db
        .select({ id: dealers.id })
        .from(dealers)
        .where(eq(dealers.ownerUserId, req.user!.sub))
        .limit(1)
      if (!dealer) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
      const customerId = docPath.split('/').find((part) => part.length === 36) ?? ''
      if (!customerId || !(await dealerCanAccessCustomerDocuments(dealer.id, customerId))) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }
    // Admin role bypasses ownership/relationship checks (full KYC review access).

    // Works for both drivers: local disk in dev, server-side blob proxy in
    // production (blob URLs are never handed to clients for documents).
    const keys = [docPath, docPath.startsWith('documents/') ? docPath : `documents/${docPath}`]
    for (const key of keys) {
      const file = await getStoredFile(key)
      if (file) {
        setAttachmentResponseHeaders(res, key, file.contentType)
        res.send(file.buffer)
        return
      }
    }
    res.status(404).json({ error: 'Document not found' })
  })
)

uploadsRouter.delete(
  '/by-url',
  requireAuth,
  asyncHandler(async (req: AuthedRequest, res) => {
    const { url } = req.body as { url?: string }
    if (!url) {
      res.status(400).json({ error: 'url required' })
      return
    }
    if (req.user!.role !== 'admin') {
      const ownsPath = userOwnsStoredPath(req.user!.sub, url)
      let dealerVehicleImage = false
      if (req.user!.role === 'dealer' && url.includes('vehicle-images/')) {
        dealerVehicleImage = await dealerOwnsVehicleImage(req.user!.sub, url)
      }
      if (!ownsPath && !dealerVehicleImage) {
        res.status(403).json({ error: 'Forbidden' })
        return
      }
    }
    await deleteStoredFile(url)
    res.status(204).end()
  })
)

export function ensureUploadDir() {
  if (process.env.UPLOAD_DRIVER === 'blob') return
  const root = uploadRoot()
  fs.mkdirSync(root, { recursive: true })
}
