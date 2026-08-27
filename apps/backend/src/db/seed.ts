import { pathToFileURL } from 'url'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import {
  dealerPlans,
  dealers,
  invoices,
  plans,
  profiles,
  subscriptions,
  vehicles,
  customerProfiles,
  appSettings,
} from './schema.js'
import { db } from './index.js'
import { resolveDatabaseUrl } from './databaseUrl.js'

const DEMO_PASSWORD = 'password123'

function databaseHost(connection: string): string {
  try {
    return new URL(connection.replace(/^postgresql:/, 'http:')).hostname
  } catch {
    return connection
  }
}

/**
 * The demo seed plants well-known accounts (admin@/dealer@/customer@carflow.dev)
 * whose password is published in docs/ of a public repo, so running it against a
 * real database hands anyone admin access. Refuse anywhere that is not obviously
 * a disposable local database.
 */
function assertSeedTargetIsDisposable(): void {
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'Refusing to seed: NODE_ENV=production. db:seed creates the demo accounts ' +
        'admin@carflow.dev / dealer@carflow.dev / customer@carflow.dev with the password ' +
        '"password123", which is published in the public repo. There is no override for ' +
        'production — point DATABASE_URL at a disposable database instead.'
    )
  }

  const host = databaseHost(resolveDatabaseUrl())
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  if (!isLocal && process.env.ALLOW_DESTRUCTIVE_SEED !== 'true') {
    throw new Error(
      `Refusing to seed: DATABASE_URL host "${host}" is not localhost/127.0.0.1, so this is a ` +
        'remote (possibly production) database. db:seed creates the demo accounts ' +
        'admin@carflow.dev / dealer@carflow.dev / customer@carflow.dev with the password ' +
        '"password123", which is published in the public repo. Set ALLOW_DESTRUCTIVE_SEED=true ' +
        'only if you are certain this database is disposable.'
    )
  }
}

async function upsertProfile(
  email: string,
  name: string,
  role: 'admin' | 'dealer' | 'customer' | 'finance' | 'ops' | 'support'
) {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10)
  const existing = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1)
  if (existing[0]) {
    await db
      .update(profiles)
      .set({ name, role, status: 'active', passwordHash, emailVerifiedAt: new Date() })
      .where(eq(profiles.id, existing[0].id))
    return existing[0].id
  }
  const [row] = await db
    .insert(profiles)
    .values({
      email,
      name,
      role,
      status: 'active',
      passwordHash,
      emailVerifiedAt: new Date(),
    })
    .returning()
  return row.id
}

export async function seedDemoData() {
  assertSeedTargetIsDisposable()
  console.log('Seeding database...')

  const adminId = await upsertProfile('admin@carflow.dev', 'Admin', 'admin')
  await upsertProfile('finance@carflow.dev', 'Finance Admin', 'finance')
  await upsertProfile('ops@carflow.dev', 'Ops Admin', 'ops')
  await upsertProfile('support@carflow.dev', 'Support Admin', 'support')
  const dealerUserId = await upsertProfile('dealer@carflow.dev', 'Dealer', 'dealer')
  const customerId = await upsertProfile('customer@carflow.dev', 'Customer', 'customer')

  const existingCustomerProfile = await db
    .select()
    .from(customerProfiles)
    .where(eq(customerProfiles.userId, customerId))
    .limit(1)
  if (!existingCustomerProfile[0]) {
    // Demo customer has completed KYC: checkout requires both identity documents
    // on file (CheckoutPage validate -> hasQid/hasDriversLicense) and handover
    // requires them too (rentalLifecycle kycBlockerForHandover).
    await db.insert(customerProfiles).values({
      userId: customerId,
      status: 'verified',
      qidDocumentPath: 'demo/customer-qid.png',
      driversLicensePath: 'demo/customer-licence.png',
    })
  }

  let starterPlan = (
    await db.select().from(plans).where(eq(plans.tier, 'starter')).limit(1)
  )[0]
  if (!starterPlan) {
    [starterPlan] = await db
      .insert(plans)
      .values({
        name: 'Starter',
        tier: 'starter',
        status: 'active',
        priceMonthly: '99',
        priceYearly: '999',
        features: ['Up to 10 listings', 'Email support'],
      })
      .returning()
  }

  const proExists = await db.select().from(plans).where(eq(plans.tier, 'professional')).limit(1)
  if (!proExists[0]) {
    await db.insert(plans).values({
      name: 'Professional',
      tier: 'professional',
      status: 'active',
      priceMonthly: '299',
      priceYearly: '2990',
      features: ['Up to 25 vehicles', 'Advanced analytics', 'Priority support', 'API access'],
    })
  }

  // Dealer SaaS billing catalogue. Mirrors the tiers the dealer app renders today
  // (Starter 99 / Professional 299) plus the Enterprise tier the plan_tier enum
  // already allows; Enterprise pricing is provisional until finance confirms it.
  const dealerPlanRows: {
    code: string
    name: string
    priceQar: string
    vehicleLimit: number | null
    features: string[]
  }[] = [
    {
      code: 'starter',
      name: 'Starter',
      priceQar: '99',
      vehicleLimit: 10,
      features: ['Up to 10 listings', 'Email support'],
    },
    {
      code: 'professional',
      name: 'Professional',
      priceQar: '299',
      vehicleLimit: 25,
      features: [
        'Up to 25 vehicles',
        'Advanced analytics',
        'Priority support',
        'Custom branding',
        'API access',
      ],
    },
    {
      code: 'enterprise',
      name: 'Enterprise',
      priceQar: '999',
      vehicleLimit: null,
      features: ['Unlimited vehicles', 'Custom analytics', 'Dedicated support'],
    },
  ]
  for (const dealerPlan of dealerPlanRows) {
    const existingDealerPlan = await db
      .select()
      .from(dealerPlans)
      .where(eq(dealerPlans.code, dealerPlan.code))
      .limit(1)
    if (!existingDealerPlan[0]) {
      await db.insert(dealerPlans).values(dealerPlan)
    }
  }

  let dealer = (
    await db.select().from(dealers).where(eq(dealers.ownerUserId, dealerUserId)).limit(1)
  )[0]
  if (!dealer) {
    [dealer] = await db
      .insert(dealers)
      .values({
        name: 'Prime Auto Group',
        ownerUserId: dealerUserId,
        status: 'active',
        planId: starterPlan.id,
        rating: '4.6',
        totalRevenue: '12000',
        activeRentals: 2,
        vehiclesCount: 5,
        contactEmail: 'dealer@carflow.dev',
      })
      .returning()
  }

  const vehicleCount = await db.select().from(vehicles).where(eq(vehicles.dealerId, dealer.id))
  if (vehicleCount.length === 0) {
    await db.insert(vehicles).values([
      {
        dealerId: dealer.id,
        name: 'BMW X5 xDrive40i',
        make: 'BMW',
        model: 'X5',
        year: 2024,
        category: 'suv',
        status: 'available',
        pricePerDay: '450',
        mileage: 15000,
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 5,
        locationCity: 'Doha',
        locationArea: 'West Bay',
      },
      {
        dealerId: dealer.id,
        name: 'Mercedes C 300',
        make: 'Mercedes',
        model: 'C 300',
        year: 2023,
        category: 'sedan',
        status: 'available',
        pricePerDay: '350',
        mileage: 22000,
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 5,
        locationCity: 'Doha',
        locationArea: 'The Pearl',
      },
      {
        dealerId: dealer.id,
        name: 'Tesla Model 3',
        make: 'Tesla',
        model: 'Model 3',
        year: 2024,
        category: 'ev',
        status: 'available',
        pricePerDay: '380',
        mileage: 8000,
        transmission: 'automatic',
        fuelType: 'electric',
        seats: 5,
        locationCity: 'Lusail',
        locationArea: 'Marina District',
      },
      {
        dealerId: dealer.id,
        name: 'Toyota Land Cruiser',
        make: 'Toyota',
        model: 'Land Cruiser',
        year: 2023,
        category: 'suv',
        status: 'available',
        pricePerDay: '550',
        mileage: 12000,
        transmission: 'automatic',
        fuelType: 'diesel',
        seats: 7,
        locationCity: 'Al Wakrah',
        locationArea: 'Al Wukair',
      },
      {
        dealerId: dealer.id,
        name: 'Honda Accord',
        make: 'Honda',
        model: 'Accord',
        year: 2024,
        category: 'sedan',
        status: 'available',
        pricePerDay: '200',
        mileage: 5000,
        transmission: 'automatic',
        fuelType: 'gas',
        seats: 5,
        locationCity: 'Al Rayyan',
        locationArea: 'Education City',
      },
    ])
  }

  const subExists = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.ownerId, dealerUserId))
    .limit(1)
  if (!subExists[0]) {
    await db.insert(subscriptions).values({
      ownerId: dealerUserId,
      ownerType: 'dealer',
      planId: starterPlan.id,
      status: 'active',
      usage: { rentals: 2, listings: 5, messages: 1247 },
    })
  }

  const invExists = await db
    .select()
    .from(invoices)
    .where(eq(invoices.ownerId, dealerUserId))
    .limit(1)
  if (!invExists[0]) {
    await db.insert(invoices).values({
      ownerId: dealerUserId,
      ownerType: 'dealer',
      amount: '99',
      status: 'paid',
      description: 'Starter plan - Monthly',
    })
  }

  const settings = await db.select().from(appSettings).limit(1)
  if (!settings[0]) {
    await db.insert(appSettings).values({})
  }

  console.log('Seed complete.')
  console.log('Demo accounts (password: password123):')
  console.log('  admin@carflow.dev / finance@ / ops@ / support@ / dealer@ / customer@carflow.dev')
  console.log(`  ids: admin=${adminId} dealer=${dealerUserId} customer=${customerId}`)
  return { adminId, dealerUserId, customerId, dealerId: dealer.id }
}

// Only run as a CLI side effect when executed directly (`npm run db:seed`),
// not when imported by e2e/global-setup or other scripts.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  seedDemoData().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
