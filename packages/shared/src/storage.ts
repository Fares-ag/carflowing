import { supabase } from './supabaseClient'

const VEHICLE_BUCKET = 'vehicle-images'
const AVATAR_BUCKET = 'user-avatars'
export const DOCUMENTS_BUCKET = 'documents'
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const DOCUMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10MB
const DOCUMENT_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

function generatePath(vehicleIdOrPrefix: string, file: File): string {
  const ext = file.name.split('.').pop() || 'jpg'
  const slug = file.name.replace(/\.[^.]+$/, '').replace(/[^a-z0-9-]/gi, '-').toLowerCase()
  const timestamp = Date.now()
  return `${vehicleIdOrPrefix}/${slug}-${timestamp}.${ext}`
}

export async function uploadVehicleImage(
  file: File,
  prefix = 'temp'
): Promise<string> {
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(`Image must be under ${MAX_SIZE_BYTES / 1024 / 1024}MB`)
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Allowed formats: JPEG, PNG, WebP')
  }
  const path = generatePath(prefix, file)
  const { data, error } = await supabase.storage
    .from(VEHICLE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    })
  if (error) {
    throw new Error(error.message ?? 'Upload failed')
  }
  const { data: urlData } = supabase.storage.from(VEHICLE_BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

export async function deleteVehicleImage(url: string): Promise<void> {
  try {
    const path = url.split(`/object/public/${VEHICLE_BUCKET}/`)[1]
    if (path) {
      await supabase.storage.from(VEHICLE_BUCKET).remove([path])
    }
  } catch {
    // Ignore delete failures
  }
}

const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024 // 2MB
const AVATAR_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    throw new Error(`Avatar must be under ${AVATAR_MAX_SIZE_BYTES / 1024 / 1024}MB`)
  }
  if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Allowed formats: JPEG, PNG, WebP, GIF')
  }
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `profiles/${userId}/avatar-${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true })
  if (error) {
    throw new Error(error.message ?? 'Upload failed')
  }
  const { data: urlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(data.path)
  return urlData.publicUrl
}

export async function deleteAvatar(url: string): Promise<void> {
  try {
    const path = url.split(`/object/public/${AVATAR_BUCKET}/`)[1]
    if (path) {
      await supabase.storage.from(AVATAR_BUCKET).remove([path])
    }
  } catch {
    // Ignore delete failures
  }
}

export type CustomerDocumentType = 'qid' | 'drivers_license'

/**
 * Upload QID or driver's license to the private documents bucket.
 * Path is {userId}/{type}-{timestamp}.{ext}. Returns the storage path to store in customer_profiles.
 */
export async function uploadCustomerDocument(
  file: File,
  userId: string,
  type: CustomerDocumentType
): Promise<string> {
  if (file.size > DOCUMENT_MAX_SIZE_BYTES) {
    throw new Error(`Document must be under ${DOCUMENT_MAX_SIZE_BYTES / 1024 / 1024}MB`)
  }
  if (!DOCUMENT_ALLOWED_TYPES.includes(file.type)) {
    throw new Error('Allowed formats: JPEG, PNG, WebP, PDF')
  }
  const ext = file.name.split('.').pop()?.toLowerCase() || 'pdf'
  const path = `${userId}/${type}-${Date.now()}.${ext}`
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: true })
  if (error) {
    throw new Error(error.message ?? 'Upload failed')
  }
  return data.path
}

/**
 * Create a short-lived signed URL for a document path (e.g. for "View" in UI).
 * Path must be the value stored in customer_profiles (qid_document_path or drivers_license_path).
 */
export async function getSignedDocumentUrl(path: string, expiresInSeconds = 60): Promise<string> {
  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresInSeconds)
  if (error) {
    throw new Error(error.message ?? 'Could not get document URL')
  }
  return data.signedUrl
}
