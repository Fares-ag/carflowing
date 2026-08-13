import { Router } from 'express'
import { and, eq, gt, isNull } from 'drizzle-orm'
import crypto from 'crypto'
import type { UserRole } from '@carflow/shared'
import { db } from '../db/index.js'
import { customerProfiles, dealers, emailVerificationTokens, passwordResetTokens, profiles } from '../db/schema.js'
import { mapProfileToUser } from '../db/mappers.js'
import { hashPassword, verifyPassword } from '../auth/password.js'
import { validatePassword } from '../auth/validatePassword.js'
import {
  clearAuthCookies,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../auth/tokens.js'
import {
  createRefreshSession,
  isRefreshSessionActive,
  revokeAllRefreshSessions,
  revokeRefreshSession,
} from '../auth/sessions.js'
import { getRefreshCookie, requireAuth, type AuthedRequest } from '../middleware/auth.js'
import { sendEmail } from '../services/mail.js'

export const authRouter = Router()

async function issueSession(
  res: import('express').Response,
  user: { id: string; role: UserRole; email: string; name: string; emailVerifiedAt?: Date | null }
) {
  const payload = { sub: user.id, role: user.role, email: user.email }
  const accessToken = await signAccessToken(payload)
  const { token: refreshToken, jti } = await signRefreshToken(payload)
  await createRefreshSession(user.id, jti)
  setAuthCookies(res, accessToken, refreshToken)
  return {
    userId: user.id,
    role: user.role,
    name: user.name,
    email: user.email,
    email_confirmed_at: user.emailVerifiedAt?.toISOString() ?? null,
  }
}

async function sendVerificationEmail(user: { id: string; email: string }) {
  const raw = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
  await db.insert(emailVerificationTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  })
  const frontend = process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
  const link = `${frontend}/verify-email?token=${raw}`
  await sendEmail({
    to: user.email,
    subject: 'Verify your CarFlow email',
    html: `<p>Verify your email: <a href="${link}">${link}</a></p><p>This link expires in 24 hours.</p>`,
  })
}

authRouter.post('/signup', async (req, res) => {
  try {
    const { email, password, name, expectedRole, meta } = req.body as {
      email?: string
      password?: string
      name?: string
      expectedRole?: UserRole
      meta?: { businessName?: string; phone?: string; address?: string }
    }
    if (!email || !password || !name?.trim()) {
      res.status(400).json({ error: 'email, password, and name are required' })
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      res.status(400).json({ error: passwordError })
      return
    }
    const role: UserRole = expectedRole === 'dealer' ? 'dealer' : 'customer'
    const existing = await db.select().from(profiles).where(eq(profiles.email, email.toLowerCase())).limit(1)
    if (existing[0]) {
      res.status(409).json({ error: 'An account with this email already exists' })
      return
    }
    const passwordHash = await hashPassword(password)
    const [user] = await db
      .insert(profiles)
      .values({
        email: email.toLowerCase(),
        name: name.trim(),
        passwordHash,
        role,
        status: 'active',
      })
      .returning()

    if (role === 'dealer') {
      // Dealer applications start `pending`; an admin activates them from
      // the admin dealers page before the dealer appears in customer search.
      await db.insert(dealers).values({
        name: meta?.businessName?.trim() || user.name,
        ownerUserId: user.id,
        status: 'pending',
        contactEmail: user.email,
        contactPhone: meta?.phone?.trim() || null,
        address: meta?.address?.trim() || null,
      })
    } else {
      await db.insert(customerProfiles).values({ userId: user.id, status: 'unverified' })
      await sendVerificationEmail(user).catch((err) => console.error('verify email send failed', err))
    }

    const session = await issueSession(res, user)
    res.status(201).json(session)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to create account' })
  }
})

authRouter.post('/login', async (req, res) => {
  try {
    const { email, password, expectedRole } = req.body as {
      email?: string
      password?: string
      expectedRole?: UserRole
    }
    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' })
      return
    }
    const [user] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.email, email.toLowerCase()))
      .limit(1)
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }
    if (user.status === 'suspended') {
      res.status(403).json({ error: 'Account is suspended' })
      return
    }
    if (expectedRole && user.role !== expectedRole) {
      res.status(403).json({ error: `Not authorized for ${expectedRole} access` })
      return
    }
    if (expectedRole === 'dealer' && user.role === 'dealer') {
      const [dealer] = await db
        .select({ status: dealers.status })
        .from(dealers)
        .where(eq(dealers.ownerUserId, user.id))
        .limit(1)
      if (!dealer || dealer.status !== 'active') {
        res.status(403).json({ error: 'Your dealer account is pending admin approval' })
        return
      }
    }
    const session = await issueSession(res, user)
    res.json(session)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to login' })
  }
})

authRouter.post('/logout', async (req, res) => {
  try {
    const token = getRefreshCookie(req)
    if (token) {
      const payload = await verifyRefreshToken(token)
      await revokeRefreshSession(payload.sub, payload.jti)
    }
  } catch {
    // Ignore invalid refresh tokens on logout.
  }
  clearAuthCookies(res)
  res.status(204).end()
})

authRouter.get('/me', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    res.json({
      userId: user.id,
      role: user.role,
      name: user.name,
      email: user.email,
      email_confirmed_at: user.emailVerifiedAt?.toISOString() ?? null,
      user: mapProfileToUser(user),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to load session' })
  }
})

authRouter.post('/refresh', async (req, res) => {
  try {
    const token = getRefreshCookie(req)
    if (!token) {
      res.status(401).json({ error: 'No refresh token' })
      return
    }
    const payload = await verifyRefreshToken(token)
    if (!(await isRefreshSessionActive(payload.sub, payload.jti))) {
      clearAuthCookies(res)
      res.status(401).json({ error: 'Session revoked' })
      return
    }
    const [user] = await db.select().from(profiles).where(eq(profiles.id, payload.sub)).limit(1)
    if (!user) {
      clearAuthCookies(res)
      res.status(401).json({ error: 'User not found' })
      return
    }
    if (user.status === 'suspended') {
      clearAuthCookies(res)
      res.status(403).json({ error: 'Account is suspended' })
      return
    }
    await revokeRefreshSession(payload.sub, payload.jti)
    const session = await issueSession(res, user)
    res.json(session)
  } catch {
    clearAuthCookies(res)
    res.status(401).json({ error: 'Invalid refresh token' })
  }
})

authRouter.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body as { email?: string }
    // Always return success to avoid email enumeration
    if (email) {
      const [user] = await db
        .select()
        .from(profiles)
        .where(eq(profiles.email, email.toLowerCase()))
        .limit(1)
      if (user) {
        const raw = crypto.randomBytes(32).toString('hex')
        const tokenHash = crypto.createHash('sha256').update(raw).digest('hex')
        await db.insert(passwordResetTokens).values({
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        })
        const frontend = process.env.CUSTOMER_APP_URL || 'http://localhost:5173'
        const link = `${frontend}/reset-password?token=${raw}`
        await sendEmail({
          to: user.email,
          subject: 'Reset your CarFlow password',
          html: `<p>Reset your password: <a href="${link}">${link}</a></p><p>This link expires in 1 hour.</p>`,
        })
      }
    }
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to process request' })
  }
})

authRouter.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body as { token?: string; password?: string }
    if (!token || !password) {
      res.status(400).json({ error: 'token and password are required' })
      return
    }
    const passwordError = validatePassword(password)
    if (passwordError) {
      res.status(400).json({ error: passwordError })
      return
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const [row] = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.tokenHash, tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, new Date())
        )
      )
      .limit(1)
    if (!row) {
      res.status(400).json({ error: 'Invalid or expired token' })
      return
    }
    const passwordHash = await hashPassword(password)
    await db.update(profiles).set({ passwordHash }).where(eq(profiles.id, row.userId))
    await revokeAllRefreshSessions(row.userId)
    await db
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(eq(passwordResetTokens.id, row.id))
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to reset password' })
  }
})

authRouter.post('/change-password', requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string
      newPassword?: string
    }
    if (!currentPassword || !newPassword) {
      res.status(400).json({ error: 'currentPassword and newPassword are required' })
      return
    }
    const passwordError = validatePassword(newPassword)
    if (passwordError) {
      res.status(400).json({ error: passwordError })
      return
    }
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      res.status(401).json({ error: 'Current password is incorrect' })
      return
    }
    const passwordHash = await hashPassword(newPassword)
    await db.update(profiles).set({ passwordHash }).where(eq(profiles.id, user.id))
    await revokeAllRefreshSessions(user.id)
    clearAuthCookies(res)
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to change password' })
  }
})

authRouter.post('/verify-email', async (req, res) => {
  try {
    const { token } = req.body as { token?: string }
    if (!token) {
      res.status(400).json({ error: 'token is required' })
      return
    }
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
    const [row] = await db
      .select()
      .from(emailVerificationTokens)
      .where(
        and(
          eq(emailVerificationTokens.tokenHash, tokenHash),
          isNull(emailVerificationTokens.usedAt),
          gt(emailVerificationTokens.expiresAt, new Date())
        )
      )
      .limit(1)
    if (!row) {
      res.status(400).json({ error: 'Invalid or expired verification link' })
      return
    }
    await db
      .update(profiles)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(profiles.id, row.userId))
    await db
      .update(customerProfiles)
      .set({ status: 'verified' })
      .where(eq(customerProfiles.userId, row.userId))
    await db
      .update(emailVerificationTokens)
      .set({ usedAt: new Date() })
      .where(eq(emailVerificationTokens.id, row.id))
    res.json({ ok: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Unable to verify email' })
  }
})
