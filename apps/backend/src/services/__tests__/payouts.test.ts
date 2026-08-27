import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db } from '../../db/index.js'
import { commissionLedger, dealers, payouts } from '../../db/schema.js'
import { resetDb, seedFixtures } from '../../test/helpers.js'
import { generateDealerPayouts } from '../payouts.js'

async function seedVerifiedDealer() {
  const fixtures = await seedFixtures()
  await db
    .update(dealers)
    .set({
      bankAccountName: 'Premium Cars QA',
      bankName: 'QNB',
      bankIban: 'QA58QNBA000000000000000000001',
      bankDetailsVerifiedAt: new Date(),
    })
    .where(eq(dealers.id, fixtures.dealer.dealerId))
  return fixtures
}

async function addLedgerRow(dealerId: string, netAmount: string) {
  await db.insert(commissionLedger).values({
    dealerId,
    grossAmount: netAmount,
    commissionRate: '0.1',
    commissionAmount: '0',
    netAmount,
    status: 'pending',
  })
}

describe('dealer payouts', () => {
  afterEach(async () => {
    vi.unstubAllEnvs()
    await resetDb()
  })

  it('PAYOUT-01: the automatic sweep batches a dealer at most once per cadence window', async () => {
    const fixtures = await seedVerifiedDealer()
    await addLedgerRow(fixtures.dealer.dealerId, '500')

    expect(await generateDealerPayouts()).toBe(1)

    // New earnings in the same window do not mint a second micro-payout.
    await addLedgerRow(fixtures.dealer.dealerId, '400')
    expect(await generateDealerPayouts()).toBe(0)
    expect(await db.select().from(payouts)).toHaveLength(1)

    // An admin can still force a batch.
    expect(await generateDealerPayouts({ force: true })).toBe(1)
    expect(await db.select().from(payouts)).toHaveLength(2)
  })

  it('PAYOUT-02: balances below the minimum carry forward instead of being paid out', async () => {
    const fixtures = await seedVerifiedDealer()
    vi.stubEnv('PAYOUT_MIN_BATCH_QAR', '100')
    await addLedgerRow(fixtures.dealer.dealerId, '40')

    expect(await generateDealerPayouts()).toBe(0)
    expect(await db.select().from(payouts)).toHaveLength(0)
    const stillPending = await db
      .select()
      .from(commissionLedger)
      .where(eq(commissionLedger.status, 'pending'))
    expect(stillPending).toHaveLength(1)

    await addLedgerRow(fixtures.dealer.dealerId, '75')
    expect(await generateDealerPayouts()).toBe(1)
    const [batch] = await db.select().from(payouts)
    expect(Number(batch.amount)).toBe(115)
  })

  it('PAYOUT-03: a refund after payout carries the negative forward, never an unpayable row', async () => {
    const fixtures = await seedVerifiedDealer()
    vi.stubEnv('PAYOUT_MIN_BATCH_QAR', '0')
    // Commission reversed after the batch it belonged to was already paid.
    await addLedgerRow(fixtures.dealer.dealerId, '-30')

    expect(await generateDealerPayouts()).toBe(0)
    expect(await db.select().from(payouts)).toHaveLength(0)
    expect(
      await db.select().from(commissionLedger).where(eq(commissionLedger.status, 'pending'))
    ).toHaveLength(1)

    await addLedgerRow(fixtures.dealer.dealerId, '200')
    expect(await generateDealerPayouts({ force: true })).toBe(1)
    const [batch] = await db.select().from(payouts)
    expect(Number(batch.amount)).toBe(170)
    expect(
      await db.select().from(commissionLedger).where(eq(commissionLedger.status, 'pending'))
    ).toHaveLength(0)
  })
})
