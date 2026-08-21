import { eq } from 'drizzle-orm'
import { hashPassword } from '../auth/password.js'
import { validatePassword } from '../auth/validatePassword.js'
import { db } from '../db/index.js'
import { profiles } from '../db/schema.js'

export class BootstrapAdminError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BootstrapAdminError'
  }
}

export async function bootstrapFirstAdmin(params: {
  email: string
  name: string
  password: string
}): Promise<{ id: string; email: string }> {
  const email = params.email.trim().toLowerCase()
  const name = params.name.trim()
  const password = params.password

  if (!email || !name || !password) {
    throw new BootstrapAdminError('email, name, and password are required')
  }

  const passwordError = validatePassword(password)
  if (passwordError) {
    throw new BootstrapAdminError(`Invalid password: ${passwordError}`)
  }

  const existingAdmins = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.role, 'admin'))
    .limit(1)
  if (existingAdmins.length > 0) {
    throw new BootstrapAdminError('An admin account already exists')
  }

  const duplicate = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.email, email)).limit(1)
  if (duplicate.length > 0) {
    throw new BootstrapAdminError(`Email ${email} is already registered`)
  }

  const passwordHash = await hashPassword(password)
  const [admin] = await db
    .insert(profiles)
    .values({
      email,
      name,
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    })
    .returning({ id: profiles.id, email: profiles.email })

  return admin
}
