import bcrypt from 'bcryptjs'
import request from 'supertest'
import { createApp } from '../app.js'
import { db, sqlClient } from '../db/index.js'
import { appSettings, customerProfiles, dealers, plans, profiles, vehicles } from '../db/schema.js'

export const DEMO_PASSWORD = 'password123'

export function buildTestApp() {
  return createApp()
}

/**
 * Truncates every application table. Called between tests so each test
 * starts from a known-empty database instead of leaking state.
 */
export async function resetDb() {
  await sqlClient.unsafe(`
    TRUNCATE TABLE
      analytics_rollups,
      analytics_events,
      broadcasts,
      email_outbox,
      staff_invites,
      payment_disputes,
      job_runs,
      promo_redemptions,
      promo_codes,
      rental_extensions,
      rental_reviews,
      user_security,
      user_preferences,
      audit_logs,
      rental_events,
      swap_requests,
      maintenance_records,
      commission_ledger,
      payouts,
      refresh_sessions,
      two_fa_challenges,
      email_verification_tokens,
      password_reset_tokens,
      payment_methods,
      invoices,
      payments,
      notifications,
      messages,
      complaint_replies,
      complaints,
      leads,
      favorites,
      booking_requests,
      rentals,
      subscriptions,
      vehicles,
      customer_profiles,
      dealers,
      plans,
      app_settings,
      profiles
    RESTART IDENTITY CASCADE;
  `)
}

export interface SeededUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'dealer' | 'customer' | 'finance' | 'ops' | 'support'
}

export interface SeededFixtures {
  admin: SeededUser
  finance: SeededUser
  ops: SeededUser
  support: SeededUser
  dealer: SeededUser & { dealerId: string }
  dealer2: SeededUser & { dealerId: string }
  customer: SeededUser
  customer2: SeededUser
  plan: { id: string }
  vehicles: { id: string; pricePerDay: number }[]
  dealer2Vehicle: { id: string }
}

async function createUser(
  email: string,
  name: string,
  role: SeededUser['role'],
  extra: Partial<{ status: 'active' | 'suspended' | 'pending' }> = {}
): Promise<SeededUser> {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 4)
  const [row] = await db
    .insert(profiles)
    .values({
      email,
      name,
      role,
      passwordHash,
      status: extra.status ?? 'active',
      emailVerifiedAt: new Date(),
    })
    .returning()
  return { id: row.id, email: row.email, name: row.name, role }
}

/**
 * Seeds a minimal but realistic dataset: one admin, two dealers (each with
 * their own vehicle inventory, for tenant-isolation tests), and two
 * customers. Returns every id/credential a test is likely to need.
 */
export async function seedFixtures(): Promise<SeededFixtures> {
  await resetDb()
  const admin = await createUser('admin@test.dev', 'Test Admin', 'admin')
  const finance = await createUser('finance@test.dev', 'Test Finance', 'finance')
  const ops = await createUser('ops@test.dev', 'Test Ops', 'ops')
  const support = await createUser('support@test.dev', 'Test Support', 'support')
  const dealerUser = await createUser('dealer@test.dev', 'Test Dealer', 'dealer')
  const dealer2User = await createUser('dealer2@test.dev', 'Second Dealer', 'dealer')
  const customer = await createUser('customer@test.dev', 'Test Customer', 'customer')
  const customer2 = await createUser('customer2@test.dev', 'Second Customer', 'customer')

  await db.insert(customerProfiles).values({ userId: customer.id, status: 'verified' })
  await db.insert(customerProfiles).values({ userId: customer2.id, status: 'unverified' })

  await db.insert(appSettings).values({})

  const [plan] = await db
    .insert(plans)
    .values({
      name: 'Starter',
      tier: 'starter',
      status: 'active',
      priceMonthly: '99',
      priceYearly: '999',
      features: ['listing'],
    })
    .returning()

  const [dealerRow] = await db
    .insert(dealers)
    .values({
      name: 'Test Motors',
      ownerUserId: dealerUser.id,
      status: 'active',
      planId: plan.id,
      contactEmail: dealerUser.email,
    })
    .returning()

  const [dealer2Row] = await db
    .insert(dealers)
    .values({
      name: 'Rival Motors',
      ownerUserId: dealer2User.id,
      status: 'active',
      planId: plan.id,
      contactEmail: dealer2User.email,
    })
    .returning()

  const vehicleRows = await db
    .insert(vehicles)
    .values([
      {
        dealerId: dealerRow.id,
        name: 'BMW X5',
        make: 'BMW',
        model: 'X5',
        year: 2024,
        category: 'suv',
        status: 'available',
        pricePerDay: '450',
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 5,
        locationCity: 'Doha',
        locationArea: 'West Bay',
      },
      {
        dealerId: dealerRow.id,
        name: 'Honda Accord',
        make: 'Honda',
        model: 'Accord',
        year: 2023,
        category: 'sedan',
        status: 'available',
        pricePerDay: '200',
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 5,
        locationCity: 'Al Wakrah',
        locationArea: 'Al Wukair',
      },
    ])
    .returning()

  const [dealer2Vehicle] = await db
    .insert(vehicles)
    .values({
      dealerId: dealer2Row.id,
      name: 'Tesla Model 3',
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      category: 'ev',
      status: 'available',
      pricePerDay: '380',
      transmission: 'automatic',
      fuelType: 'electric',
      seats: 5,
      locationCity: 'Lusail',
      locationArea: 'Marina District',
    })
    .returning()

  return {
    admin,
    finance,
    ops,
    support,
    dealer: { ...dealerUser, dealerId: dealerRow.id },
    dealer2: { ...dealer2User, dealerId: dealer2Row.id },
    customer,
    customer2,
    plan: { id: plan.id },
    vehicles: vehicleRows.map((v) => ({ id: v.id, pricePerDay: Number(v.pricePerDay) })),
    dealer2Vehicle: { id: dealer2Vehicle.id },
  }
}

/**
 * Logs in as a seeded user and returns a cookie-persisting supertest agent
 * plus the raw login response body.
 */
export async function loginAs(
  app: ReturnType<typeof createApp>,
  email: string,
  role: SeededUser['role'] | 'admin',
  password = DEMO_PASSWORD
) {
  const agent = request.agent(app)
  const expectedRole = role === 'finance' || role === 'ops' || role === 'support' ? 'admin' : role
  const res = await agent
    .post('/api/auth/login')
    .send({ email, password, expectedRole })
  return { agent, res }
}

export { tinyPngBuffer, tinyPdfBuffer } from './fixtures/index.js'
