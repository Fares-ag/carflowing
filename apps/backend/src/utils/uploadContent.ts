import path from 'path'
import type { Response } from 'express'

const MIME_CONFIG = {
  'image/jpeg': { ext: '.jpg', detect: isJpeg },
  'image/png': { ext: '.png', detect: isPng },
  'image/webp': { ext: '.webp', detect: isWebp },
  'image/gif': { ext: '.gif', detect: isGif },
  'application/pdf': { ext: '.pdf', detect: isPdf },
} as const

export type AllowedUploadMime = keyof typeof MIME_CONFIG

export const VEHICLE_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const satisfies readonly AllowedUploadMime[]
export const AVATAR_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const satisfies readonly AllowedUploadMime[]
export const DOCUMENT_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const satisfies readonly AllowedUploadMime[]

export const UPLOAD_EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
}

function isPng(buffer: Buffer): boolean {
  return (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  )
}

function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
}

function isGif(buffer: Buffer): boolean {
  return buffer.length >= 6 && buffer.subarray(0, 3).toString('ascii') === 'GIF'
}

function isWebp(buffer: Buffer): boolean {
  return (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  )
}

function isPdf(buffer: Buffer): boolean {
  return buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-'
}

export function validateUploadContent(
  buffer: Buffer,
  claimedMime: string,
  allowed: readonly AllowedUploadMime[]
): { mime: AllowedUploadMime; ext: string } | { error: string } {
  const mime = claimedMime.trim().toLowerCase()
  if (!allowed.includes(mime as AllowedUploadMime)) {
    return { error: `Unsupported file type: ${mime || 'unknown'}` }
  }

  const config = MIME_CONFIG[mime as AllowedUploadMime]
  if (!config.detect(buffer)) {
    return { error: 'File content does not match the declared type' }
  }

  return { mime: mime as AllowedUploadMime, ext: config.ext }
}

export function restrictiveContentTypeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return UPLOAD_EXTENSION_CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

export function setAttachmentResponseHeaders(res: Response, filePath: string, contentType?: string): void {
  res.setHeader('Content-Disposition', 'attachment')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Content-Type', contentType ?? restrictiveContentTypeForPath(filePath))
}
