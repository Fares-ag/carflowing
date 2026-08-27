import { eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { profiles, userPreferences } from '../db/schema.js'
import { sendEmail } from './mail.js'
import {
  buildWhatsAppBodyText,
  isWhatsAppProviderConfigured,
  sendWhatsAppTemplate,
  type WhatsAppTemplateEvent,
} from './whatsapp.js'

export interface CustomerNotificationContext {
  userId: string
  event: WhatsAppTemplateEvent
  /** Ordered template parameters (customer name first when applicable). */
  parameters: string[]
  email?: { subject: string; html: string }
}

async function loadCustomerContact(userId: string): Promise<{
  phone: string | null
  email: string | null
  whatsappEnabled: boolean
  emailEnabled: boolean
}> {
  const [profile] = await db
    .select({ phone: profiles.phone, email: profiles.email })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1)
  const [prefs] = await db
    .select({
      whatsappNotifications: userPreferences.whatsappNotifications,
      emailNotifications: userPreferences.emailNotifications,
    })
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1)

  return {
    phone: profile?.phone?.trim() || null,
    email: profile?.email?.trim() || null,
    whatsappEnabled: prefs?.whatsappNotifications ?? false,
    emailEnabled: prefs?.emailNotifications ?? true,
  }
}

/**
 * Sends a transactional WhatsApp message when the customer opted in and a
 * provider is configured; otherwise falls back to email (if enabled) and logs.
 * Never throws — callers already wrote in-app notifications.
 */
export async function dispatchCustomerTransactionalChannels(
  ctx: CustomerNotificationContext
): Promise<void> {
  const contact = await loadCustomerContact(ctx.userId)
  const bodyText = buildWhatsAppBodyText(ctx.event, ctx.parameters)

  const tryWhatsApp =
    contact.whatsappEnabled && contact.phone && isWhatsAppProviderConfigured()

  if (tryWhatsApp) {
    const result = await sendWhatsAppTemplate({
      to: contact.phone!,
      event: ctx.event,
      parameters: ctx.parameters,
      bodyText,
    })
    if (result.ok) {
      console.log('[whatsapp] sent', ctx.event, 'user', ctx.userId, result.providerMessageId ?? '')
      return
    }
    console.warn('[whatsapp] send failed', ctx.event, 'user', ctx.userId, result.error ?? 'unknown')
  } else if (contact.whatsappEnabled && !isWhatsAppProviderConfigured()) {
    console.log('[whatsapp] skipped — provider not configured', ctx.event, 'user', ctx.userId)
  } else if (contact.whatsappEnabled && !contact.phone) {
    console.log('[whatsapp] skipped — no phone on profile', ctx.event, 'user', ctx.userId)
  }

  if (ctx.email && contact.emailEnabled && contact.email) {
    try {
      await sendEmail({ to: contact.email, subject: ctx.email.subject, html: ctx.email.html })
    } catch (err) {
      console.error('[notify] email fallback failed', ctx.event, ctx.userId, err)
    }
  } else if (ctx.email && !contact.emailEnabled) {
    console.log('[notify] email skipped — disabled in preferences', ctx.event, 'user', ctx.userId)
  }
}

/** Fire-and-forget wrapper for use after DB transactions commit. */
export function dispatchCustomerTransactionalChannelsSafe(ctx: CustomerNotificationContext): void {
  void dispatchCustomerTransactionalChannels(ctx).catch((err) => {
    console.error('[notify] channel dispatch failed', ctx.event, ctx.userId, err)
  })
}
