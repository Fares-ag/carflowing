import { Router } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { eq } from 'drizzle-orm'
import { requireAuth, requireRole, type AuthedRequest } from '../middleware/auth.js'
import { storeFile, deleteStoredFile, resolveLocalPath, uploadRoot } from '../storage/index.js'
import { db } from '../db/index.js'
import { customerProfiles, dealers, profiles } from '../db/schema.js'
import { asyncHandler } from '../utils/http.js'
import {
  dealerCanAccessCustomerDocuments,
  userOwnsStoredPath,
} from '../services/documentAccess.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
})

export const uploadsRouter = Router()

function sanitizeName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
}

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
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      res.status(400).json({ error: 'Allowed formats: JPEG, PNG, WebP' })
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      res.status(400).json({ error: 'Image must be under 5MB' })
      return
    }
    const prefix = String(req.body.prefix || 'temp')
    const ext = path.extname(file.originalname) || '.jpg'
    const relative = `${prefix}/${sanitizeName(file.originalname)}-${Date.now()}${ext}`
    const stored = await storeFile('vehicle-images', relative, file.buffer, file.mimetype)
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
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.mimetype)) {
      res.status(400).json({ error: 'Allowed formats: JPEG, PNG, WebP, GIF' })
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      res.status(400).json({ error: 'Avatar must be under 2MB' })
      return
    }
    const ext = path.extname(file.originalname) || '.jpg'
    const relative = `profiles/${req.user!.sub}/avatar-${Date.now()}${ext}`
    const stored = await storeFile('user-avatars', relative, file.buffer, file.mimetype)
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
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.mimetype)
    ) {
      res.status(400).json({ error: 'Allowed formats: JPEG, PNG, WebP, PDF' })
      return
    }
    const ext = path.extname(file.originalname)?.toLowerCase() || '.pdf'
    const relative = `${req.user!.sub}/${type}-${Date.now()}${ext}`
    const stored = await storeFile('documents', relative, file.buffer, file.mimetype)

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

    const candidates = [
      resolveLocalPath(docPath),
      resolveLocalPath(docPath.startsWith('documents/') ? docPath : `documents/${docPath}`),
    ]
    const filePath = candidates.find((p) => fs.existsSync(p))
    if (!filePath) {
      res.status(404).json({ error: 'Document not found' })
      return
    }
    res.sendFile(filePath)
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
      const dealerVehicleImage =
        req.user!.role === 'dealer' && url.includes('vehicle-images/')
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
  const root = uploadRoot()
  fs.mkdirSync(root, { recursive: true })
}
