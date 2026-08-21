import crypto from 'node:crypto'
import { db } from '../db/index.js'
import { emailVerificationTokens } from '../db/schema.js'
import { sendEmail } from '../services/mail.js'

/** Issue a fresh verification token and email (signup or email change). */
export async function sendVerificationEmail(user: { id: string; email: string }): Promise<void> {
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
