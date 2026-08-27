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
  referralCode?: string
}

export async function signUp({ email, password, name, referralCode }: SignUpInput): Promise<AuthSession> {
  const data = await apiRequest<AuthSession>('/auth/signup', {
    method: 'POST',
    body: { email, password, name, expectedRole: 'customer', referralCode: referralCode?.trim() || undefined },
  })
  return data
}

export interface LoginRequires2fa {
  requires2fa: true
  challengeToken: string
  userId: string
}

export type LoginResult = AuthSession | LoginRequires2fa

export function isLoginRequires2fa(result: LoginResult): result is LoginRequires2fa {
  return 'requires2fa' in result && result.requires2fa === true
}

export async function login(email: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>('/auth/login', {
    method: 'POST',
    body: { email, password, expectedRole: 'customer' },
  })
}

export async function verify2faLogin(challengeToken: string, code: string): Promise<AuthSession> {
  return apiRequest<AuthSession>('/auth/2fa/verify-login', {
    method: 'POST',
    body: { challengeToken, code },
  })
}

export async function logout(): Promise<void> {
  await apiRequest('/auth/logout', { method: 'POST' })
}

export async function logoutAllDevices(): Promise<void> {
  await apiRequest('/auth/logout-all', { method: 'POST' })
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

/**
 * Re-sends the signup verification email to the signed-in user. Used when an
 * online payment is blocked with a 403 "Verify your email" error.
 */
export async function resendVerificationEmail(): Promise<void> {
  await apiRequest('/auth/resend-verification', { method: 'POST' })
}
