import type { User } from '@carflow/shared'
import { ADMIN_PORTAL_ROLES, isAdminPortalRole, type AdminPortalRole } from '@carflow/shared/types'
import { apiRequest } from '@carflow/shared'

export { ADMIN_PORTAL_ROLES, isAdminPortalRole }
export type { AdminPortalRole }

export interface AuthSession {
  userId: string
  role: AdminPortalRole
  name: string
  email: string
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const data = await apiRequest<{
      userId: string
      role: string
      name: string
      email: string
    }>('/auth/me')
    if (!isAdminPortalRole(data.role)) return null
    return {
      userId: data.userId,
      role: data.role,
      name: data.name,
      email: data.email,
    }
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const data = await apiRequest<{
    userId: string
    role: string
    name: string
    email: string
  }>('/auth/login', {
    method: 'POST',
    body: { email, password, expectedRole: 'admin' },
  })
  if (!isAdminPortalRole(data.role)) {
    throw new Error('Not authorized for admin portal access')
  }
  return {
    userId: data.userId,
    role: data.role,
    name: data.name,
    email: data.email,
  }
}

export async function logout(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' })
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session) return null
  return {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: session.role,
    createdAt: new Date().toISOString(),
  }
}

export async function acceptStaffInvite(input: {
  token: string
  password: string
  name?: string
}): Promise<{ userId: string; email: string; role: AdminPortalRole }> {
  return apiRequest('/auth/staff-invite/accept', { method: 'POST', body: input })
}
