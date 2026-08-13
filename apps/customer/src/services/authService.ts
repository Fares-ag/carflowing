import type { User } from '@carflow/shared'
import { apiRequest } from '@carflow/shared'

export interface AuthSession {
  userId: string
  role: 'customer'
  name: string
  email: string
  email_confirmed_at?: string | null
}

export async function getProfileAvatar(): Promise<string | null> {
  const me = await apiRequest<{ user?: User }>('/auth/me')
  return me.user?.avatarUrl ?? null
}

export async function updateProfileAvatar(avatarUrl: string): Promise<void> {
  await apiRequest('/customer/profile/avatar', { method: 'PATCH', body: { avatarUrl } })
}

export async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.userId ?? null
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    const data = await apiRequest<{
      userId: string
      role: string
      name: string
      email: string
      email_confirmed_at?: string | null
    }>('/auth/me')
    if (data.role !== 'customer') return null
    return {
      userId: data.userId,
      role: 'customer',
      name: data.name,
      email: data.email,
      email_confirmed_at: data.email_confirmed_at ?? null,
    }
  } catch {
    return null
  }
}

export interface SignUpInput {
  email: string
  password: string
  name: string
}

export async function signUp({ email, password, name }: SignUpInput): Promise<AuthSession> {
  const data = await apiRequest<AuthSession>('/auth/signup', {
    method: 'POST',
    body: { email, password, name, expectedRole: 'customer' },
  })
  return data
}

export async function login(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password, expectedRole: 'customer' },
  })
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
    role: 'customer',
    createdAt: new Date().toISOString(),
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiRequest('/auth/forgot-password', { method: 'POST', body: { email } })
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await apiRequest('/auth/reset-password', { method: 'POST', body: { token, password } })
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiRequest('/auth/change-password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  })
}
