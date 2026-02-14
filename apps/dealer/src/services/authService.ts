import type { User } from '@carflow/shared'
import { supabase } from '@carflow/shared'

export interface AuthSession {
  userId: string
  role: 'dealer'
  name: string
  email: string
}

async function fetchProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, name, role')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new Error(error?.message ?? 'Unable to load profile')
  }

  return data
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
  if (profile.role !== 'dealer') {
    return null
  }
  return {
    userId: profile.id,
    role: 'dealer',
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
  if (profile.role !== 'dealer') {
    await supabase.auth.signOut()
    throw new Error('Not authorized for dealer access')
  }
  return {
    userId: profile.id,
    role: 'dealer',
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
    role: 'dealer',
    createdAt: new Date().toISOString(),
  }
}
