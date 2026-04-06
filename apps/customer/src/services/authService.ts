import type { User } from '@carflow/shared'
import { supabase } from '@carflow/shared'

export interface AuthSession {
  userId: string
  role: 'customer'
  name: string
  email: string
  email_confirmed_at?: string | null
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role, avatar_url')
    .eq('id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(error.message ?? 'Unable to load profile')
  }

  if (!data) {
    throw new Error('Profile not found for this account')
  }

  return data
}

export async function getProfileAvatar(): Promise<string | null> {
  const session = await getSession()
  if (!session) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', session.userId)
    .single()
  if (error || !data) return null
  return data.avatar_url ?? null
}

export async function updateProfileAvatar(avatarUrl: string): Promise<void> {
  const session = await getSession()
  if (!session) {
    throw new Error('Not authenticated')
  }
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', session.userId)
  if (error) {
    throw new Error(error.message ?? 'Failed to update avatar')
  }
}

export async function getUserId(): Promise<string | null> {
  const session = await getSession()
  return session?.userId ?? null
}

export async function getSession(): Promise<AuthSession | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    throw new Error(error.message)
  }
  const user = data.session?.user
  if (!user) {
    return null
  }
  const profile = await fetchProfile(user.id)
  if (profile.role !== 'customer') {
    return null
  }
  return {
    userId: profile.id,
    role: 'customer',
    name: profile.name,
    email: profile.email,
    email_confirmed_at: user.email_confirmed_at ?? null,
  }
}

export interface SignUpInput {
  email: string
  password: string
  name: string
}

export async function signUp({ email, password, name }: SignUpInput): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: name.trim() || undefined },
    },
  })
  if (error) {
    throw new Error(error.message ?? 'Unable to create account')
  }
  if (!data.user) {
    throw new Error('Account created but unable to sign in')
  }
  const profile = await fetchProfile(data.user.id)
  if (profile.role !== 'customer') {
    await supabase.auth.signOut()
    throw new Error('Not authorized for customer access')
  }
  return {
    userId: profile.id,
    role: 'customer',
    name: profile.name,
    email: profile.email,
  }
}

export async function login(email: string, password: string): Promise<AuthSession> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !data.user) {
    throw new Error(error?.message ?? 'Unable to login')
  }
  const profile = await fetchProfile(data.user.id)
  if (profile.role !== 'customer') {
    await supabase.auth.signOut()
    throw new Error('Not authorized for customer access')
  }
  return {
    userId: profile.id,
    role: 'customer',
    name: profile.name,
    email: profile.email,
  }
}

export async function logout(): Promise<void> {
  await supabase.auth.signOut()
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session) {
    return null
  }
  return {
    id: session.userId,
    name: session.name,
    email: session.email,
    role: 'customer',
    createdAt: new Date().toISOString(),
  }
}
