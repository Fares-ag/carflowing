import type { User } from '@carflow/shared'
import { apiRequest } from '@carflow/shared'

export interface AuthSession {
  userId: string
  role: 'dealer'
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
    if (data.role !== 'dealer') return null
    return {
      userId: data.userId,
      role: 'dealer',
      name: data.name,
      email: data.email,
    }
  } catch {
    return null
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: { email, password, expectedRole: 'dealer' },
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
    role: 'dealer',
    createdAt: new Date().toISOString(),
  }
}
