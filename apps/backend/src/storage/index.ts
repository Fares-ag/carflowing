import fs from 'fs/promises'
import path from 'path'
import { put, del } from '@vercel/blob'

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
    const access = kind === 'documents' ? 'private' : 'public'
    const result = await put(key, buffer, {
      access,
      contentType,
      token,
      addRandomSuffix: false,
    })
    return { url: result.url, path: key }
  }

  const fullPath = path.join(uploadRoot(), key)
  await fs.mkdir(path.dirname(fullPath), { recursive: true })
  await fs.writeFile(fullPath, buffer)
  const url = `${publicBaseUrl()}/uploads/${key}`
  return { url, path: key }
}

export async function deleteStoredFile(storedPathOrUrl: string): Promise<void> {
  try {
    if (driver() === 'blob') {
      const token = process.env.BLOB_READ_WRITE_TOKEN
      if (!token) return
      await del(storedPathOrUrl, { token })
      return
    }
    let relative = storedPathOrUrl
    const marker = '/uploads/'
    const idx = storedPathOrUrl.indexOf(marker)
    if (idx >= 0) relative = storedPathOrUrl.slice(idx + marker.length)
    const fullPath = path.join(uploadRoot(), relative)
    await fs.unlink(fullPath).catch(() => undefined)
  } catch {
    // ignore
  }
}

export function resolveLocalPath(key: string): string {
  return path.join(uploadRoot(), key)
}

export { uploadRoot }
