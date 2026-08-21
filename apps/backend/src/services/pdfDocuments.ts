/** Minimal PDF generator for invoices and contracts (text-only, no external deps). */

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

function wrapLines(text: string, maxLen = 72): string[] {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (next.length > maxLen) {
      if (line) lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

export function buildSimplePdf(title: string, lines: string[]): Buffer {
  const contentLines = [`(${escapePdfText(title)}) Tj`, '0 -16 Td']
  for (const line of lines.flatMap((l) => wrapLines(l))) {
    contentLines.push(`(${escapePdfText(line)}) Tj`, '0 -14 Td')
  }
  const stream = `BT /F1 12 Tf 50 750 Td ${contentLines.join('\n')} ET`
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = [0]
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body))
    body += `${obj}\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n`
  body += '0000000000 65535 f \n'
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body)
}

export function buildInvoicePdf(input: {
  companyName: string
  invoiceId: string
  date: string
  description: string
  amount: number
  status: string
  customerName: string
}): Buffer {
  return buildSimplePdf('CarFlow Invoice', [
    `Company: ${input.companyName}`,
    `Invoice ID: ${input.invoiceId}`,
    `Date: ${input.date}`,
    `Customer: ${input.customerName}`,
    `Description: ${input.description}`,
    `Amount: QAR ${input.amount.toFixed(2)}`,
    `Status: ${input.status}`,
    '',
    'Thank you for choosing CarFlow.',
  ])
}

export function buildContractPdf(input: {
  companyName: string
  customerName: string
  vehicleName: string
  startDate: string
  endDate: string
  monthlyAmount: number
  termMonths: number
}): Buffer {
  return buildSimplePdf('CarFlow Subscription Agreement', [
    `This agreement is between ${input.companyName} and ${input.customerName}.`,
    `Vehicle: ${input.vehicleName}`,
    `Term: ${input.termMonths} month(s) minimum, then rolling monthly.`,
    `Period: ${input.startDate} to ${input.endDate}`,
    `Monthly amount: QAR ${input.monthlyAmount.toFixed(2)}`,
    '',
    'By subscribing you agree to CarFlow terms, including 30-day cancellation notice after the minimum term.',
  ])
}
