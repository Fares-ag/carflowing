import { fetchWithTimeout } from '../utils/http.js'

/** Transactional WhatsApp templates mapped to CarFlow business events. */
export type WhatsAppTemplateEvent =
  | 'booking_approved'
  | 'invoice_due'
  | 'invoice_overdue'
  | 'payment_received'

export interface WhatsAppTemplateMessage {
  to: string
  event: WhatsAppTemplateEvent
  /** Ordered body parameters for the provider template. */
  parameters: string[]
  /** Fallback plain text when a provider does not use named templates. */
  bodyText: string
}

export interface WhatsAppSendResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export interface WhatsAppProvider {
  readonly name: string
  sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult>
}

function templateNameForEvent(event: WhatsAppTemplateEvent): string {
  const envKey = `WHATSAPP_TEMPLATE_${event.toUpperCase()}`
  const fromEnv = process.env[envKey]?.trim()
  if (fromEnv) return fromEnv
  return `carflow_${event}`
}

function normalizeWhatsAppTo(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits
}

class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'meta'

  constructor(
    private accessToken: string,
    private phoneNumberId: string,
    private apiVersion: string
  ) {}

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const to = normalizeWhatsAppTo(message.to)
    if (!to) return { ok: false, error: 'invalid phone' }

    const template = {
      name: templateNameForEvent(message.event),
      language: { code: process.env.WHATSAPP_META_LANGUAGE?.trim() || 'en' },
      components: [
        {
          type: 'body',
          parameters: message.parameters.map((text) => ({ type: 'text', text })),
        },
      ],
    }

    const res = await fetchWithTimeout(
      `https://graph.facebook.com/${this.apiVersion}/${this.phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template,
        }),
      }
    )

    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>
      error?: { message?: string }
    }
    if (!res.ok) {
      return { ok: false, error: json.error?.message || `Meta WhatsApp HTTP ${res.status}` }
    }
    return { ok: true, providerMessageId: json.messages?.[0]?.id }
  }
}

class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'twilio'

  constructor(
    private accountSid: string,
    private authToken: string,
    private from: string
  ) {}

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const toDigits = normalizeWhatsAppTo(message.to)
    if (!toDigits) return { ok: false, error: 'invalid phone' }

    const contentSidEnv = `WHATSAPP_TWILIO_CONTENT_${message.event.toUpperCase()}`
    const contentSid = process.env[contentSidEnv]?.trim()

    const body = new URLSearchParams({
      From: this.from.startsWith('whatsapp:') ? this.from : `whatsapp:${this.from}`,
      To: `whatsapp:+${toDigits}`,
    })

    if (contentSid) {
      body.set('ContentSid', contentSid)
      const vars: Record<string, string> = {}
      message.parameters.forEach((value, index) => {
        vars[String(index + 1)] = value
      })
      body.set('ContentVariables', JSON.stringify(vars))
    } else {
      body.set('Body', message.bodyText)
    }

    const res = await fetchWithTimeout(
      `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    )

    const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string }
    if (!res.ok) {
      return { ok: false, error: json.message || `Twilio WhatsApp HTTP ${res.status}` }
    }
    return { ok: true, providerMessageId: json.sid }
  }
}

class NullWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'none'

  async sendTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    console.log('[whatsapp:disabled]', message.event, message.to.replace(/\d(?=\d{4})/g, '*'))
    return { ok: false, error: 'provider not configured' }
  }
}

let cachedProvider: WhatsAppProvider | null | undefined

/** Returns null when no provider credentials are configured. */
export function resolveWhatsAppProvider(): WhatsAppProvider | null {
  if (cachedProvider !== undefined) return cachedProvider

  const vendor = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase()
  if (vendor === 'meta') {
    const token = process.env.WHATSAPP_META_ACCESS_TOKEN?.trim()
    const phoneNumberId = process.env.WHATSAPP_META_PHONE_NUMBER_ID?.trim()
    if (token && phoneNumberId) {
      cachedProvider = new MetaCloudWhatsAppProvider(
        token,
        phoneNumberId,
        process.env.WHATSAPP_META_API_VERSION?.trim() || 'v21.0'
      )
      return cachedProvider
    }
    cachedProvider = null
    return cachedProvider
  }

  if (vendor === 'twilio') {
    const sid = process.env.TWILIO_ACCOUNT_SID?.trim()
    const token = process.env.TWILIO_AUTH_TOKEN?.trim()
    const from = process.env.TWILIO_WHATSAPP_FROM?.trim()
    if (sid && token && from) {
      cachedProvider = new TwilioWhatsAppProvider(sid, token, from)
      return cachedProvider
    }
    cachedProvider = null
    return cachedProvider
  }

  cachedProvider = null
  return cachedProvider
}

/** Clears cached provider (tests). */
export function resetWhatsAppProviderCache(): void {
  cachedProvider = undefined
}

export function isWhatsAppProviderConfigured(): boolean {
  return resolveWhatsAppProvider() !== null
}

export async function sendWhatsAppTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
  const provider = resolveWhatsAppProvider()
  if (!provider) {
    const nullProvider = new NullWhatsAppProvider()
    return nullProvider.sendTemplate(message)
  }
  try {
    return await provider.sendTemplate(message)
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'WhatsApp send failed',
    }
  }
}

export function buildWhatsAppBodyText(event: WhatsAppTemplateEvent, parameters: string[]): string {
  switch (event) {
    case 'booking_approved':
      return `CarFlow: Your booking for ${parameters[1] ?? 'your vehicle'} is approved.${parameters[2] ? ` ${parameters[2]}` : ''}`
    case 'invoice_due':
      return `CarFlow: Your monthly payment of QAR ${parameters[1] ?? ''} for ${parameters[2] ?? 'your subscription'} is due. Pay from My Booking.`
    case 'invoice_overdue':
      return `CarFlow: Your payment of QAR ${parameters[1] ?? parameters[0] ?? ''} is overdue. Please pay to keep your subscription active.`
    case 'payment_received':
      return `CarFlow: We received your payment of QAR ${parameters[0] ?? ''}. Thank you!`
    default:
      return parameters.join(' ')
  }
}
