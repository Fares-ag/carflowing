import fs from 'fs/promises'
import path from 'path'
import { put, del, get } from '@vercel/blob'

export type UploadKind = 'vehicle-images' | 'user-avatars' | 'documents'

function driver(): 'local' | 'blob' {
  return process.env.UPLOAD_DRIVER === 'blob' ? 'blob' : 'local'
}

function uploadRoot() {
  return process.env.UPLOAD_DIR || path.resolve(process.cwd(), 'uploads')
}

function publicBaseUrl() {
  const port = process.env.PORT || '3001'
  return process.env.PUBLIC_API_URL || `http://localhost:${port}`
}

function publicMediaUrl(pathname: string): string {
  return `${publicBaseUrl()}/api/uploads/media?path=${encodeURIComponent(pathname)}`
}

function blobAccess(): 'public' | 'private' {
  const configured = process.env.BLOB_ACCESS?.trim().toLowerCase()
  if (configured === 'public' || configured === 'private') return configured
  // Default private — matches Vercel Blob stores created with private access.
  return 'private'
}

/**
 * Stores a file and returns { url, path }. `path` is the storage key persisted
 * in the DB and later passed to getStoredFile / access-control checks.
 *
 * Private blob stores reject `access: 'public'`. Vehicle images and avatars are
 * served through `/api/uploads/media` so customer/dealer UIs can render them
 * without handing out raw blob URLs. Identity documents stay behind the
 * authenticated `/api/uploads/documents/file` proxy.
 */
export async function storeFile(
  kind: UploadKind,
  relativePath: string,
  buffer: Buffer,
  contentType: string
): Promise<{ url: string; path: string }> {
  const key = `${kind}/${relativePath}`.replace(/\\/g, '/')

  if (driver() === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) throw new Error('BLOB_READ_WRITE_TOKEN is not configured')
    const sensitive = kind === 'documents'
    const access = blobAccess()
    const result = await put(key, buffer, {
      access,
      contentType,
      token,
      addRandomSuffix: sensitive,
    })
    const pathname = result.pathname
    let url: string
    if (sensitive) {
      url = `/api/uploads/documents/file?path=${encodeURIComponent(pathname)}`
    } else if (access === 'private') {
      url = publicMediaUrl(pathname)
    } else {
      url = result.url
    }
    return { url, path: pathname }
  }

  const fullPath = path.join(uploadRoot(), key)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, buffer)
  const url =
    kind === 'documents'
      ? `/api/uploads/documents/file?path=${encodeURIComponent(key)}`
      : `${publicBaseUrl()}/uploads/${key}`
  return { url, path: key }
}

export interface StoredFile {
  buffer: Buffer
  contentType?: string
}

/**
 * Reads a stored file back for an authenticated response. Local driver reads
 * from disk; blob driver resolves the blob by its exact pathname and fetches
 * it server-side, so document access control always runs in our API.
 */
async function readableStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) chunks.push(value)
  }
  return Buffer.concat(chunks)
}

export async function getStoredFile(key: string): Promise<StoredFile | null> {
  if (driver() === 'blob') {
    const token = process.env.BLOB_READ_WRITE_TOKEN
    if (!token) return null
    const result = await get(key, { access: blobAccess(), token })
    if (!result || result.statusCode !== 200 || !result.stream) return null
    const buffer = await readableStreamToBuffer(result.stream)
    return { buffer, contentType: result.blob.contentType ?? undefined }
  }
  try {
    const buffer = await fs.readFile(path.join(uploadRoot(), key))
    return { buffer }
  } catch {
    return null
  }
}

export async function deleteStoredFile(storedPathOrUrl: string): Promise<void> {
  try {
    if (driver() === 'blob') {
      const token = process.env.BLOB_READ_WRITE_TOKEN
      if (!token) return
      const key = storageKeyFromReference(storedPathOrUrl)
      if (!key) return
      await del(key, { token })
      return
    }
    let relative = storedPathOrUrl
    const marker = '/uploads/'
    const idx = storedPathOrUrl.indexOf(marker)
    if (idx >= 0) relative = storedPathOrUrl.slice(idx + marker.length)
    const fullPath = path.join(uploadRoot(), relative)
    await fs.unlink(fullPath).catch(() => undefined)
  } catch (err) {
    console.error('[storage] deleteStoredFile failed', { path: storedPathOrUrl, err })
  }
}

export function resolveLocalPath(key: string): string {
  return path.join(uploadRoot(), key)
}

/** Resolve a DB-stored url/path reference to a blob/disk storage key. */
export function storageKeyFromReference(storedPathOrUrl: string): string | null {
  if (!storedPathOrUrl) return null
  if (storedPathOrUrl.startsWith('vehicle-images/') || storedPathOrUrl.startsWith('user-avatars/') || storedPathOrUrl.startsWith('documents/')) {
    return storedPathOrUrl
  }
  try {
    const asUrl = storedPathOrUrl.startsWith('http')
      ? new URL(storedPathOrUrl)
      : new URL(storedPathOrUrl, 'http://local')
    const mediaPath = asUrl.searchParams.get('path')
    if (mediaPath && !mediaPath.includes('..')) return mediaPath
    const docPath = asUrl.searchParams.get('path')
    if (asUrl.pathname.includes('/documents/file') && docPath) return docPath
  } catch {
    // fall through
  }
  const marker = '/uploads/'
  const idx = storedPathOrUrl.indexOf(marker)
  if (idx >= 0) return storedPathOrUrl.slice(idx + marker.length)
  return null
}

export { uploadRoot }
