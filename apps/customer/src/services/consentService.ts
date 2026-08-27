import { apiRequest } from '@carflow/shared'
import {
  LEGAL_DOCUMENT_VERSION,
  type LegalDocumentKind,
} from '../constants/legal'

export interface ConsentAcceptance {
  /** Mirrors `consent_records.document_kind`. */
  documentKind: LegalDocumentKind
  /** Mirrors `consent_records.document_version`. */
  documentVersion: string
}

/**
 * Records that the signed-in customer accepted a set of legal documents.
 *
 * The API stores one append-only row per document in `consent_records`; the IP
 * address and user agent are captured server-side, so the client only sends
 * what it knows. Re-accepting a newer version inserts another row.
 */
export async function recordConsents(kinds: LegalDocumentKind[]): Promise<void> {
  const consents: ConsentAcceptance[] = kinds.map((documentKind) => ({
    documentKind,
    documentVersion: LEGAL_DOCUMENT_VERSION,
  }))
  await apiRequest('/customer/consents', { method: 'POST', body: { consents } })
}

/**
 * Best-effort variant for the signup and checkout funnels.
 *
 * The blocking tick box is what makes the acceptance real for the customer, so
 * a transport failure while filing the evidence must not strand a paid booking
 * or a freshly created account. Failures are logged for follow-up instead.
 */
export async function recordConsentsSafely(kinds: LegalDocumentKind[]): Promise<void> {
  try {
    await recordConsents(kinds)
  } catch (err) {
    console.error('Failed to record legal consent', { kinds, version: LEGAL_DOCUMENT_VERSION, err })
  }
}
