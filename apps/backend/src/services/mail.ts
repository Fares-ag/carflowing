export async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.FROM_EMAIL || 'noreply@carflow.dev'
  if (!apiKey) {
    console.log('[mail:dev]', input.to, input.subject, input.html)
    return
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: input.to, subject: input.subject, html: input.html }),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error('Failed to send email', text)
  }
}

export async function sendBookingConfirmationEmail(params: {
  to: string
  customerName: string
  vehicleName: string
  startDate: string
  endDate: string
  totalPrice: number
}) {
  const { to, customerName, vehicleName, startDate, endDate, totalPrice } = params
  return sendEmail({
    to,
    subject: 'Your CarFlow booking is confirmed',
    html: `<p>Hi ${customerName},</p>
<p>Your booking for <strong>${vehicleName}</strong> has been confirmed.</p>
<p><strong>Dates:</strong> ${startDate} to ${endDate}</p>
<p><strong>Total:</strong> QAR ${totalPrice.toFixed(2)}</p>
<p>Thank you for choosing CarFlow.</p>`,
  })
}

export async function sendDealerInviteEmail(params: {
  to: string
  dealerName: string
  temporaryPassword: string
}) {
  const { to, dealerName, temporaryPassword } = params
  const dealerAppUrl = process.env.DEALER_APP_URL || 'http://localhost:5175'
  return sendEmail({
    to,
    subject: 'Your CarFlow dealer account',
    html: `<p>Hi,</p>
<p>An admin created a dealer account for <strong>${dealerName}</strong> on CarFlow.</p>
<p><strong>Email:</strong> ${to}<br/>
<strong>Temporary password:</strong> ${temporaryPassword}</p>
<p>Sign in at <a href="${dealerAppUrl}">${dealerAppUrl}</a> and change your password after logging in.</p>`,
  })
}
