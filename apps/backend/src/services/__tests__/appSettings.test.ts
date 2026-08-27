import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getPlatformCommissionRate,
  invalidateAppSettingsCache,
  mapRuntimeAppSettings,
} from '../appSettings.js'

describe('appSettings accessor', () => {
  const env = process.env

  afterEach(() => {
    process.env = { ...env }
    invalidateAppSettingsCache()
    vi.restoreAllMocks()
  })

  it('uses env fallback when DB override is null', () => {
    process.env.PLATFORM_COMMISSION_RATE = '0.17'
    const mapped = mapRuntimeAppSettings({
      id: 'x',
      companyName: 'CarFlow',
      supportEmail: 'support@carflow.dev',
      supportPhone: null,
      defaultTaxRate: '0',
      platformCommissionRate: null,
      billingGraceDays: null,
      paymentHoldTtlMinutes: null,
      cancelNoticeDays: null,
      swapEligibleDays: null,
      maxPauseDays: null,
      subscriptionDepositAmount: null,
      signupsEnabled: true,
      dealerSignupsEnabled: true,
      onlinePaymentsEnabled: true,
      newBookingsEnabled: true,
      lastJobsSweepAt: null,
      updatedAt: new Date(),
    })
    expect(mapped.platformCommissionRate).toBe(0.17)
    expect(mapped.subscriptionDepositAmount).toBe(0)
  })

  it('prefers DB override over env', () => {
    process.env.PLATFORM_COMMISSION_RATE = '0.17'
    const mapped = mapRuntimeAppSettings({
      id: 'x',
      companyName: 'CarFlow',
      supportEmail: 'support@carflow.dev',
      supportPhone: null,
      defaultTaxRate: '0',
      platformCommissionRate: '0.25',
      billingGraceDays: null,
      paymentHoldTtlMinutes: null,
      cancelNoticeDays: null,
      swapEligibleDays: null,
      maxPauseDays: null,
      subscriptionDepositAmount: '750',
      signupsEnabled: true,
      dealerSignupsEnabled: true,
      onlinePaymentsEnabled: true,
      newBookingsEnabled: true,
      lastJobsSweepAt: null,
      updatedAt: new Date(),
    })
    expect(mapped.platformCommissionRate).toBe(0.25)
    expect(mapped.subscriptionDepositAmount).toBe(750)
  })

  it('caches runtime settings for a short TTL', async () => {
    vi.useFakeTimers()
    const dbModule = await import('../../db/index.js')
    const selectSpy = vi.spyOn(dbModule.db, 'select').mockReturnValue({
      from: () => ({
        orderBy: () => ({
          limit: async () => [
            {
              id: 'cached',
              companyName: 'CarFlow',
              supportEmail: 'support@carflow.dev',
              supportPhone: null,
              defaultTaxRate: '0',
              platformCommissionRate: '0.11',
              billingGraceDays: 3,
              paymentHoldTtlMinutes: 45,
              cancelNoticeDays: 30,
              swapEligibleDays: 30,
              maxPauseDays: null,
              subscriptionDepositAmount: null,
              signupsEnabled: true,
              dealerSignupsEnabled: true,
              onlinePaymentsEnabled: true,
              newBookingsEnabled: true,
              lastJobsSweepAt: null,
              updatedAt: new Date(),
            },
          ],
        }),
      }),
    } as never)

    invalidateAppSettingsCache()
    expect(await getPlatformCommissionRate()).toBe(0.11)
    expect(await getPlatformCommissionRate()).toBe(0.11)
    expect(selectSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(31_000)
    expect(await getPlatformCommissionRate()).toBe(0.11)
    expect(selectSpy).toHaveBeenCalledTimes(2)

    vi.useRealTimers()
  })
})
