import { serve } from 'https://deno.land/std@0.210.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM_EMAIL = Deno.env.get('FROM_EMAIL') || 'noreply@carflow.ai'

interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    const payload: EmailPayload = await req.json()

    if (!payload.to || !payload.subject || !payload.html) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: to, subject, html' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — logging email instead of sending')
      console.log('Email:', { to: payload.to, subject: payload.subject })
      return new Response(
        JSON.stringify({ ok: true, mode: 'dry-run', message: 'RESEND_API_KEY not configured' }),
        { headers: { 'Content-Type': 'application/json' } }
      )
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error('Resend API error:', res.status, body)
      return new Response(
        JSON.stringify({ error: `Email provider error: ${res.status}` }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      )
    }

    const result = await res.json()
    return new Response(JSON.stringify({ ok: true, id: result.id }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('send-email error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
