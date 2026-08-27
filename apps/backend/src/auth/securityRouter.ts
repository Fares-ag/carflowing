import { isAdminPortalRole } from '@carflow/shared/types'
import { eq } from 'drizzle-orm'
import { Router } from 'express'
import { db } from '../db/index.js'
import { profiles, userSecurity } from '../db/schema.js'
import type { AuthedRequest } from '../middleware/auth.js'
import { sendSmsCode } from '../services/mail.js'
import {
  getSmsVerificationCapabilities,
  isSmsVerificationAvailable,
} from '../services/smsVerification.js'
import {
  generateSmsCode,
  generateTotpSecret,
  hashSmsCode,
  totpUri,
  verifyTotp,
} from '../services/totp.js'
import { asyncHandler } from '../utils/http.js'
import { consumeSmsSendAllowance } from './smsSendLimits.js'
import { STAFF_2FA_REQUIRED_ERROR, isStaffTwoFactorRequired } from './staffTwoFactor.js'

/**
 * Account-security endpoints (TOTP enrolment + SMS verification). Deliberately
 * role-agnostic: these used to live behind the customer role gate, which left
 * every admin, finance, ops, support and dealer account permanently
 * password-only. Mounted twice — under /api/auth/security for every
 * authenticated role, and under /api/customer/security so the customer app
 * keeps its existing paths.
 *
 * The mount point supplies `requireAuth`; this router never adds a role gate.
 */
export const securityRouter = Router()

securityRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const [row] = await db
      .select()
      .from(userSecurity)
      .where(eq(userSecurity.userId, req.user!.sub))
      .limit(1)
    res.json({
      totpEnabled: row?.totpEnabled ?? false,
      totpRequired: isStaffTwoFactorRequired() && isAdminPortalRole(req.user!.role),
      smsVerified: !!row?.smsVerifiedAt,
      smsPhone: row?.smsPhone ? row.smsPhone.replace(/(\+\d{2,3})\d+(\d{3})$/, '$1****$2') : null,
      ...getSmsVerificationCapabilities(),
    })
  })
)

securityRouter.post(
  '/2fa/setup',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { code } = req.body as { code?: string }
    const [user] = await db.select().from(profiles).where(eq(profiles.id, req.user!.sub)).limit(1)
    if (!user) {
      res.status(401).json({ error: 'Not authenticated' })
      return
    }
    const [existing] = await db
      .select()
      .from(userSecurity)
      .where(eq(userSecurity.userId, req.user!.sub))
      .limit(1)
    if (existing?.totpEnabled && existing.totpSecret) {
      // Re-running setup rotates the secret, which is a 2FA disable in
      // disguise. Demand a currently-valid code from the enrolled
      // authenticator, and never clear `totpEnabled` here — /2fa/disable is
      // the only way off, and it has its own code check.
      if (!verifyTotp(existing.totpSecret, String(code ?? ''))) {
        res.status(409).json({
          error:
            'Two-factor authentication is already enabled. Send a current authentication code to re-enrol, or disable it first.',
          totpEnabled: true,
        })
        return
      }
    }
    const secret = generateTotpSecret()
    const [row] = await db
      .insert(userSecurity)
      .values({ userId: req.user!.sub, totpSecret: secret })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: { totpSecret: secret, updatedAt: new Date() },
      })
      .returning()
    res.json({
      secret: row.totpSecret,
      uri: totpUri(row.totpSecret!, user.email),
    })
  })
)

securityRouter.post(
  '/2fa/enable',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { code } = req.body as { code?: string }
    const [row] = await db
      .select()
      .from(userSecurity)
      .where(eq(userSecurity.userId, req.user!.sub))
      .limit(1)
    if (!row?.totpSecret) {
      res.status(400).json({ error: 'Run 2FA setup first' })
      return
    }
    if (!verifyTotp(row.totpSecret, String(code ?? ''))) {
      res.status(400).json({ error: 'Invalid authentication code' })
      return
    }
    await db
      .update(userSecurity)
      .set({ totpEnabled: true, updatedAt: new Date() })
      .where(eq(userSecurity.userId, req.user!.sub))
    res.json({ ok: true })
  })
)

securityRouter.post(
  '/2fa/disable',
  asyncHandler(async (req: AuthedRequest, res) => {
    const { code } = req.body as { code?: string }
    if (isStaffTwoFactorRequired() && isAdminPortalRole(req.user!.role)) {
      // Letting staff disable it would lock them straight out of the portal on
      // their next login, since issueSession refuses staff without TOTP.
      res.status(403).json({ error: STAFF_2FA_REQUIRED_ERROR, requires2faEnrolment: true })
      return
    }
    const [row] = await db
      .select()
      .from(userSecurity)
      .where(eq(userSecurity.userId, req.user!.sub))
      .limit(1)
    if (!row?.totpEnabled || !row.totpSecret) {
      res.status(400).json({ error: '2FA is not enabled' })
      return
    }
    if (!verifyTotp(row.totpSecret, String(code ?? ''))) {
      res.status(400).json({ error: 'Invalid authentication code' })
      return
    }
    await db
      .update(userSecurity)
      .set({ totpEnabled: false, totpSecret: null, updatedAt: new Date() })
      .where(eq(userSecurity.userId, req.user!.sub))
    res.json({ ok: true })
  })
)

securityRouter.post(
  '/sms/send',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!isSmsVerificationAvailable()) {
      res.status(503).json({ error: 'SMS verification is not available in this environment' })
      return
    }
    const { phone } = req.body as { phone?: string }
    const normalized = String(phone ?? '').trim()
    if (normalized.length < 8) {
      res.status(400).json({ error: 'Valid phone number required' })
      return
    }
    // Every send bills Twilio and the destination is caller-supplied, so the
    // cooldown + daily caps are checked before anything is generated or sent.
    const allowance = consumeSmsSendAllowance(req.user!.sub, normalized)
    if (!allowance.allowed) {
      res.setHeader('Retry-After', String(allowance.retryAfterSeconds))
      res.status(429).json({ error: allowance.error, retryAfterSeconds: allowance.retryAfterSeconds })
      return
    }
    const code = generateSmsCode()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000)
    await db
      .insert(userSecurity)
      .values({
        userId: req.user!.sub,
        smsPhone: normalized,
        smsCodeHash: hashSmsCode(code),
        smsCodeExpiresAt: expiresAt,
      })
      .onConflictDoUpdate({
        target: userSecurity.userId,
        set: {
          smsPhone: normalized,
          smsCodeHash: hashSmsCode(code),
          smsCodeExpiresAt: expiresAt,
          smsVerifiedAt: null,
          updatedAt: new Date(),
        },
      })
    await sendSmsCode(normalized, code)
    res.json({ ok: true })
  })
)

securityRouter.post(
  '/sms/verify',
  asyncHandler(async (req: AuthedRequest, res) => {
    if (!isSmsVerificationAvailable()) {
      res.status(503).json({ error: 'SMS verification is not available in this environment' })
      return
    }
    const { code } = req.body as { code?: string }
    const [row] = await db
      .select()
      .from(userSecurity)
      .where(eq(userSecurity.userId, req.user!.sub))
      .limit(1)
    if (!row?.smsCodeHash || !row.smsCodeExpiresAt || row.smsCodeExpiresAt < new Date()) {
      res.status(400).json({ error: 'SMS code expired. Request a new one.' })
      return
    }
    if (row.smsCodeHash !== hashSmsCode(String(code ?? ''))) {
      res.status(400).json({ error: 'Invalid SMS code' })
      return
    }
    await db
      .update(userSecurity)
      .set({
        smsVerifiedAt: new Date(),
        smsCodeHash: null,
        smsCodeExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(userSecurity.userId, req.user!.sub))
    if (row.smsPhone) {
      await db.update(profiles).set({ phone: row.smsPhone }).where(eq(profiles.id, req.user!.sub))
    }
    res.json({ ok: true })
  })
)
