import { db } from '../db/index.js'
import { appSettings, type appSettings as AppSettingsTable } from '../db/schema.js'
import { desc } from 'drizzle-orm'

export type AppSettingsRow = typeof AppSettingsTable.$inferSelect

const CACHE_TTL_MS = 30_000

export interface RuntimeAppSettings {
  id: string
  companyName: string
  supportEmail: string
  supportPhone: string | null
  platformCommissionRate: number
  billingGraceDays: number
  paymentHoldTtlMinutes: number
  cancelNoticeDays: number
  swapEligibleDays: number
  maxPauseDays: number
  subscriptionDepositAmount: number
  signupsEnabled: boolean
  dealerSignupsEnabled: boolean
  onlinePaymentsEnabled: boolean
  newBookingsEnabled: boolean
  updatedAt: Date
}

export interface FeatureFlags {
  checkoutEnabled: boolean
  onlinePaymentsEnabled: boolean
  signupsEnabled: boolean
  dealerSignupsEnabled: boolean
  updatedAt: string
}

export interface BusinessSettings {
  platformCommissionRate: number
  billingGraceDays: number
  paymentHoldTtlMinutes: number
  cancelNoticeDays: number
  swapEligibleDays: number
  maxPauseDays: number
  subscriptionDepositAmount: number
  updatedAt: string
}

let cached: { settings: RuntimeAppSettings; expiresAt: number } | null = null

export function invalidateAppSettingsCache(): void {
  cached = null
}

function envNumber(name: string, fallback: number, opts?: { min?: number; max?: number }): number {
  const n = Number(process.env[name])
  if (!Number.isFinite(n)) return fallback
  if (opts?.min !== undefined && n < opts.min) return fallback
  if (opts?.max !== undefined && n > opts.max) return fallback
  return n
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return fallback
}

function parseRate(value: string | null | undefined): number {
  if (value != null && value !== '') {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0 && n <= 1) return n
  }
  return envNumber('PLATFORM_COMMISSION_RATE', 0.1, { min: 0, max: 1 })
}

function parseNonNegativeInt(
  value: number | null | undefined,
  envName: string,
  fallback: number
): number {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value
  return envNumber(envName, fallback, { min: 0 })
}

function parsePositiveInt(value: number | null | undefined, envName: string, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value
  const fromEnv = envNumber(envName, fallback, { min: 1 })
  return fromEnv > 0 ? fromEnv : fallback
}

function parseNonNegativeAmount(value: string | null | undefined): number {
  if (value != null && value !== '') {
    const n = Number(value)
    if (Number.isFinite(n) && n >= 0) return n
  }
  return envNumber('SUBSCRIPTION_DEPOSIT_AMOUNT', 0, { min: 0 })
}

function parseFlag(value: boolean | null | undefined, envName: string, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  return envBoolean(envName, fallback)
}

export function mapRuntimeAppSettings(row: AppSettingsRow): RuntimeAppSettings {
  return {
    id: row.id,
    companyName: row.companyName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    platformCommissionRate: parseRate(row.platformCommissionRate),
    billingGraceDays: parseNonNegativeInt(row.billingGraceDays, 'BILLING_GRACE_DAYS', 3),
    paymentHoldTtlMinutes: parsePositiveInt(row.paymentHoldTtlMinutes, 'PAYMENT_HOLD_TTL_MINUTES', 45),
    cancelNoticeDays: parseNonNegativeInt(row.cancelNoticeDays, 'CANCEL_NOTICE_DAYS', 30),
    swapEligibleDays: parseNonNegativeInt(row.swapEligibleDays, 'SWAP_ELIGIBLE_DAYS', 30),
    maxPauseDays: parsePositiveInt(row.maxPauseDays, 'MAX_PAUSE_DAYS', 90),
    subscriptionDepositAmount: parseNonNegativeAmount(row.subscriptionDepositAmount),
    signupsEnabled: parseFlag(row.signupsEnabled, 'SIGNUPS_ENABLED', true),
    dealerSignupsEnabled: parseFlag(row.dealerSignupsEnabled, 'DEALER_SIGNUPS_ENABLED', true),
    onlinePaymentsEnabled: parseFlag(row.onlinePaymentsEnabled, 'ONLINE_PAYMENTS_ENABLED', true),
    newBookingsEnabled: parseFlag(row.newBookingsEnabled, 'NEW_BOOKINGS_ENABLED', true),
    updatedAt: row.updatedAt,
  }
}

async function fetchRuntimeAppSettingsFromDb(): Promise<RuntimeAppSettings> {
  let [row] = await db.select().from(appSettings).orderBy(desc(appSettings.updatedAt)).limit(1)
  if (!row) {
    [row] = await db.insert(appSettings).values({}).returning()
  }
  return mapRuntimeAppSettings(row)
}

/** Ensures the singleton settings row exists and returns merged runtime values. */
export async function getRuntimeAppSettings(): Promise<RuntimeAppSettings> {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings
  }
  const settings = await fetchRuntimeAppSettingsFromDb()
  cached = { settings, expiresAt: Date.now() + CACHE_TTL_MS }
  return settings
}

export async function getPlatformCommissionRate(): Promise<number> {
  return (await getRuntimeAppSettings()).platformCommissionRate
}

export async function getBillingGraceDays(): Promise<number> {
  return (await getRuntimeAppSettings()).billingGraceDays
}

export async function getPaymentHoldTtlMinutes(): Promise<number> {
  return (await getRuntimeAppSettings()).paymentHoldTtlMinutes
}

export async function getCancelNoticeDays(): Promise<number> {
  return (await getRuntimeAppSettings()).cancelNoticeDays
}

export async function getSwapEligibleDays(): Promise<number> {
  return (await getRuntimeAppSettings()).swapEligibleDays
}

export async function getMaxPauseDays(): Promise<number> {
  return (await getRuntimeAppSettings()).maxPauseDays
}

export async function getSubscriptionDepositAmount(): Promise<number> {
  return (await getRuntimeAppSettings()).subscriptionDepositAmount
}

export async function areSignupsEnabled(): Promise<boolean> {
  return (await getRuntimeAppSettings()).signupsEnabled
}

export async function areDealerSignupsEnabled(): Promise<boolean> {
  return (await getRuntimeAppSettings()).dealerSignupsEnabled
}

export async function areOnlinePaymentsEnabled(): Promise<boolean> {
  return (await getRuntimeAppSettings()).onlinePaymentsEnabled
}

export async function areCheckoutEnabled(): Promise<boolean> {
  return (await getRuntimeAppSettings()).newBookingsEnabled
}

/** @deprecated Use areCheckoutEnabled */
export async function areNewBookingsEnabled(): Promise<boolean> {
  return areCheckoutEnabled()
}

export function featureFlagsFromRuntime(settings: RuntimeAppSettings): FeatureFlags {
  return {
    checkoutEnabled: settings.newBookingsEnabled,
    onlinePaymentsEnabled: settings.onlinePaymentsEnabled,
    signupsEnabled: settings.signupsEnabled,
    dealerSignupsEnabled: settings.dealerSignupsEnabled,
    updatedAt: settings.updatedAt.toISOString(),
  }
}

export function featureFlagsAuditSnapshot(row: AppSettingsRow): Record<string, unknown> {
  return {
    checkoutEnabled: row.newBookingsEnabled,
    onlinePaymentsEnabled: row.onlinePaymentsEnabled,
    signupsEnabled: row.signupsEnabled,
    dealerSignupsEnabled: row.dealerSignupsEnabled,
  }
}

export function featureFlagsPatchFromBody(body: {
  checkoutEnabled?: boolean
  onlinePaymentsEnabled?: boolean
  signupsEnabled?: boolean
  dealerSignupsEnabled?: boolean
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (body.checkoutEnabled !== undefined) patch.newBookingsEnabled = body.checkoutEnabled
  if (body.onlinePaymentsEnabled !== undefined) patch.onlinePaymentsEnabled = body.onlinePaymentsEnabled
  if (body.signupsEnabled !== undefined) patch.signupsEnabled = body.signupsEnabled
  if (body.dealerSignupsEnabled !== undefined) patch.dealerSignupsEnabled = body.dealerSignupsEnabled
  return patch
}

export function businessSettingsFromRuntime(settings: RuntimeAppSettings): BusinessSettings {
  return {
    platformCommissionRate: settings.platformCommissionRate,
    billingGraceDays: settings.billingGraceDays,
    paymentHoldTtlMinutes: settings.paymentHoldTtlMinutes,
    cancelNoticeDays: settings.cancelNoticeDays,
    swapEligibleDays: settings.swapEligibleDays,
    maxPauseDays: settings.maxPauseDays,
    subscriptionDepositAmount: settings.subscriptionDepositAmount,
    updatedAt: settings.updatedAt.toISOString(),
  }
}

export function businessSettingsAuditSnapshot(row: AppSettingsRow): Record<string, unknown> {
  return {
    platformCommissionRate: row.platformCommissionRate,
    billingGraceDays: row.billingGraceDays,
    paymentHoldTtlMinutes: row.paymentHoldTtlMinutes,
    cancelNoticeDays: row.cancelNoticeDays,
    swapEligibleDays: row.swapEligibleDays,
    subscriptionDepositAmount: row.subscriptionDepositAmount,
  }
}

export function settingsAuditSnapshot(row: AppSettingsRow): Record<string, unknown> {
  return {
    companyName: row.companyName,
    supportEmail: row.supportEmail,
    supportPhone: row.supportPhone,
    ...businessSettingsAuditSnapshot(row),
    signupsEnabled: row.signupsEnabled,
    dealerSignupsEnabled: row.dealerSignupsEnabled,
    onlinePaymentsEnabled: row.onlinePaymentsEnabled,
    newBookingsEnabled: row.newBookingsEnabled,
  }
}

export function settingsApiPayload(row: AppSettingsRow): Record<string, unknown> {
  const mapped = mapRuntimeAppSettings(row)
  return {
    id: mapped.id,
    companyName: mapped.companyName,
    supportEmail: mapped.supportEmail,
    supportPhone: mapped.supportPhone ?? undefined,
    platformCommissionRate: mapped.platformCommissionRate,
    billingGraceDays: mapped.billingGraceDays,
    paymentHoldTtlMinutes: mapped.paymentHoldTtlMinutes,
    cancelNoticeDays: mapped.cancelNoticeDays,
    swapEligibleDays: mapped.swapEligibleDays,
    subscriptionDepositAmount: mapped.subscriptionDepositAmount,
    signupsEnabled: mapped.signupsEnabled,
    dealerSignupsEnabled: mapped.dealerSignupsEnabled,
    onlinePaymentsEnabled: mapped.onlinePaymentsEnabled,
    newBookingsEnabled: mapped.newBookingsEnabled,
    updatedAt: mapped.updatedAt.toISOString(),
  }
}

export function businessSettingsApiPayload(row: AppSettingsRow): BusinessSettings {
  return businessSettingsFromRuntime(mapRuntimeAppSettings(row))
}

export async function ensureAppSettingsRow(): Promise<AppSettingsRow> {
  let [row] = await db.select().from(appSettings).orderBy(desc(appSettings.updatedAt)).limit(1)
  if (!row) {
    [row] = await db.insert(appSettings).values({}).returning()
  }
  return row
}
