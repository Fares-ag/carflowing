import { apiRequest } from './apiClient'

export type CustomerDocumentType = 'qid' | 'drivers_license'

export async function uploadVehicleImage(file: File, prefix = 'temp'): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('prefix', prefix)
  const result = await apiRequest<{ url: string }>('/uploads/vehicle-image', {
    method: 'POST',
    body: form,
  })
  return result.url
}

export async function deleteVehicleImage(url: string): Promise<void> {
  try {
    await apiRequest('/uploads/by-url', { method: 'DELETE', body: { url } })
  } catch {
    // ignore
  }
}

export async function uploadAvatar(file: File, _userId: string): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const result = await apiRequest<{ url: string }>('/uploads/avatar', {
    method: 'POST',
    body: form,
  })
  return result.url
}

export async function deleteAvatar(url: string): Promise<void> {
  try {
    await apiRequest('/uploads/by-url', { method: 'DELETE', body: { url } })
  } catch {
    // ignore
  }
}

export async function uploadCustomerDocument(
  file: File,
  _userId: string,
  type: CustomerDocumentType
): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  form.append('type', type)
  const result = await apiRequest<{ path: string }>('/uploads/document', {
    method: 'POST',
    body: form,
  })
  return result.path
}

export async function getSignedDocumentUrl(path: string, _expiresInSeconds = 60): Promise<string> {
  const result = await apiRequest<{ url: string }>('/uploads/documents', {
    params: { path },
  })
  return result.url
}

export const DOCUMENTS_BUCKET = 'documents'
