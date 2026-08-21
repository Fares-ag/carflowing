import { enqueueEmail, tryDeliverOutboxRow } from './emailOutbox.js'

export async function sendEmail(input: {
  to: string
  subject: string
  html: string
}): Promise<string> {
  const id = await enqueueEmail(input)
  await tryDeliverOutboxRow(id, true)
  return id
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

export async function sendBookingDeclinedEmail(params: {
  to: string
  customerName: string
  vehicleName: string
  declineReason?: string
}) {
  const reason = params.declineReason
    ? `<p><strong>Reason:</strong> ${params.declineReason}</p>`
    : ''
  return sendEmail({
    to: params.to,
    subject: 'Your CarFlow booking request was declined',
    html: `<p>Hi ${params.customerName},</p>
<p>Your booking request for <strong>${params.vehicleName}</strong> was declined.</p>
${reason}
<p>Browse other vehicles or contact support if you need help.</p>`,
  })
}

export async function sendComplaintReplyEmail(params: {
  to: string
  customerName: string
  complaintSubject: string
  replyBody: string
  authorName: string
}) {
  return sendEmail({
    to: params.to,
    subject: `Re: ${params.complaintSubject}`,
    html: `<p>Hi ${params.customerName},</p>
<p>Support replied to your complaint <strong>${params.complaintSubject}</strong>:</p>
<blockquote>${params.replyBody}</blockquote>
<p>— ${params.authorName}, CarFlow Support</p>`,
  })
}

export async function sendPayoutPaidEmail(params: {
  to: string
  dealerName: string
  amount: number
  payoutId: string
}) {
  return sendEmail({
    to: params.to,
    subject: 'Your CarFlow payout has been sent',
    html: `<p>Hi,</p>
<p>Your payout for <strong>${params.dealerName}</strong> has been marked paid.</p>
<p><strong>Amount:</strong> QAR ${params.amount.toFixed(2)}<br/>
<strong>Reference:</strong> ${params.payoutId.slice(0, 8)}</p>
<p>Funds should arrive per your bank processing times.</p>`,
  })
}

export async function sendAccountSuspendedEmail(params: { to: string; name: string }) {
  return sendEmail({
    to: params.to,
    subject: 'Your CarFlow account has been suspended',
    html: `<p>Hi ${params.name},</p>
<p>Your CarFlow account has been suspended. You will not be able to sign in until the suspension is lifted.</p>
<p>Contact support if you believe this is a mistake or need assistance.</p>`,
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

export async function sendDealerApprovedEmail(params: { to: string; dealerName: string }) {
  const dealerAppUrl = process.env.DEALER_APP_URL || 'http://localhost:5175'
  return sendEmail({
    to: params.to,
    subject: 'Your CarFlow dealer account is approved',
    html: `<p>Hi,</p>
<p>Your dealer account for <strong>${params.dealerName}</strong> has been approved.</p>
<p>You can now sign in at <a href="${dealerAppUrl}">${dealerAppUrl}</a>, list vehicles, and receive booking requests.</p>`,
  })
}

export async function sendStaffInviteEmail(params: {
  to: string
  name: string
  role: string
  inviteUrl: string
}) {
  return sendEmail({
    to: params.to,
    subject: 'You are invited to CarFlow Admin',
    html: `<p>Hi ${params.name},</p>
<p>You have been invited as <strong>${params.role}</strong> on CarFlow Admin.</p>
<p><a href="${params.inviteUrl}">Accept your invite</a> (expires in 7 days).</p>`,
  })
}

export async function sendSmsCode(phone: string, code: string): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_FROM_NUMBER
  if (!sid || !token || !from) {
    console.log('[sms:dev]', phone, 'Your CarFlow verification code was generated')
    return
  }
  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Your CarFlow verification code is ${code}`,
  })
  const { fetchWithTimeout } = await import('../utils/http.js')
  const res = await fetchWithTimeout(
    `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    }
  )
  if (!res.ok) {
    console.error('Failed to send SMS', await res.text())
  }
}
