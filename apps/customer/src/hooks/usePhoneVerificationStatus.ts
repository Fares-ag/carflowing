import { useQuery } from '@tanstack/react-query'
import {
  getSecurityStatus,
  type SecurityStatus,
} from '../services/customerService'

export const PHONE_VERIFICATION_QUERY_KEY = ['phoneVerificationStatus'] as const

export function usePhoneVerificationStatus() {
  return useQuery({
    queryKey: PHONE_VERIFICATION_QUERY_KEY,
    queryFn: getSecurityStatus,
  })
}

export function phoneVerificationBadge(status: SecurityStatus | undefined): {
  label: string
  tone: 'verified' | 'pending' | 'neutral'
} {
  if (!status?.smsVerificationAvailable) {
    return { label: 'Unavailable', tone: 'neutral' }
  }
  if (status.smsVerified) {
    return { label: 'Verified', tone: 'verified' }
  }
  return { label: 'Unverified', tone: 'pending' }
}

export function phoneVerificationDisplay(
  status: SecurityStatus | undefined,
  profilePhone: string | null | undefined
): string {
  if (status?.smsVerified && status.smsPhone) {
    return status.smsPhone
  }
  const trimmed = profilePhone?.trim()
  return trimmed || '—'
}
