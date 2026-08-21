import { and, asc, eq, inArray } from 'drizzle-orm'
import type { DbOrTx } from './audit.js'
import { payments } from '../db/schema.js'

export interface DepositResolutionInput {
  releaseAmount: number
  withheldAmount: number
  note?: string
}

const MONEY_EPS = 0.001

export function validateDepositResolution(
  rental: { depositAmount: string | number; depositRefundable: boolean },
  input: DepositResolutionInput | undefined
): string | null {
  const deposit = Number(rental.depositAmount ?? 0)
  if (deposit <= MONEY_EPS) {
    if (!input) return null
    if (input.releaseAmount > MONEY_EPS || input.withheldAmount > MONEY_EPS) {
      return 'This rental has no deposit to resolve'
    }
    return null
  }

  if (!input) {
    return 'Deposit resolution is required for this return'
  }

  const release = Number(input.releaseAmount)
  const withheld = Number(input.withheldAmount)
  if (!Number.isFinite(release) || release < 0) return 'Invalid release amount'
  if (!Number.isFinite(withheld) || withheld < 0) return 'Invalid withheld amount'
  if (release + withheld > deposit + MONEY_EPS) {
    return 'Released and withheld amounts cannot exceed the deposit'
  }
  if (Math.abs(release + withheld - deposit) > MONEY_EPS) {
    return 'Released and withheld amounts must account for the full deposit'
  }
  if (withheld > MONEY_EPS && !input.note?.trim()) {
    return 'A reason is required when withholding deposit'
  }
  if (release > MONEY_EPS && !rental.depositRefundable) {
    return 'This deposit is not marked refundable'
  }
  return null
}

/** Flags the original rental payment for finance — no silent money movement. */
export async function flagDepositReleaseForFinance(
  tx: DbOrTx,
  rentalId: string,
  releaseAmount: number
): Promise<void> {
  if (releaseAmount <= MONEY_EPS) return

  const [payment] = await tx
    .select()
    .from(payments)
    .where(
      and(
        eq(payments.rentalId, rentalId),
        eq(payments.status, 'completed'),
        inArray(payments.type, ['rental', 'subscription'])
      )
    )
    .orderBy(asc(payments.createdAt))
    .limit(1)

  if (!payment) return

  const financeNote = `Deposit release on return: QAR ${releaseAmount.toFixed(2)} — finance action required`
  await tx
    .update(payments)
    .set({
      needsRefund: true,
      note: payment.note ? `${payment.note}\n${financeNote}` : financeNote,
    })
    .where(eq(payments.id, payment.id))
}
