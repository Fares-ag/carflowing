import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm'
import { dealers, vehicles } from '../db/schema.js'
import { parseCatalogStartDate } from './vehicleAvailability.js'

export type CatalogSort = 'recommended' | 'price_asc' | 'price_desc' | 'newest'

export interface CatalogQueryFilters {
  search?: string
  category?: string[]
  make?: string[]
  fuelType?: string[]
  transmission?: ('automatic' | 'manual')[]
  seats?: number[]
  priceMin?: number
  priceMax?: number
  minRating?: number
  maxMileage?: number
  yearMin?: number
  yearMax?: number
  features?: string[]
  location?: string
  locationArea?: string
  startDate?: string
  sort: CatalogSort
}

function parseCsv(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) return []
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

function parseNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function parseSort(value: unknown): CatalogSort {
  if (value === 'price_asc' || value === 'price_desc' || value === 'newest') return value
  return 'recommended'
}

const VALID_CATEGORIES = new Set(['sedan', 'suv', 'truck', 'luxury', 'ev', 'other'])
const VALID_FUEL = new Set(['gas', 'diesel', 'electric', 'hybrid'])

function normalizeCategory(value: string): string | null {
  const key = value.toLowerCase()
  if (VALID_CATEGORIES.has(key)) return key
  if (key === 'electric') return 'ev'
  if (key === 'economy') return 'other'
  if (key === 'sports') return 'luxury'
  return null
}

function normalizeFuel(value: string): string | null {
  const key = value.toLowerCase()
  if (key === 'petrol') return 'gas'
  if (VALID_FUEL.has(key)) return key
  return null
}

/** Parses browse/catalog query params from GET /customer/vehicles. */
export function parseCatalogQuery(query: Record<string, unknown>): CatalogQueryFilters {
  const category = parseCsv(query.category)
    .map(normalizeCategory)
    .filter((value): value is string => !!value)
  const fuelType = parseCsv(query.fuelType)
    .map(normalizeFuel)
    .filter((value): value is string => !!value)
  const transmission = parseCsv(query.transmission)
    .map((value) => value.toLowerCase())
    .filter((value): value is 'automatic' | 'manual' => value === 'automatic' || value === 'manual')
  const seats = parseCsv(query.seats)
    .map(Number)
    .filter((value) => Number.isFinite(value))

  return {
    search: typeof query.search === 'string' ? query.search.trim() : undefined,
    category: category.length ? category : undefined,
    make: parseCsv(query.make).length ? parseCsv(query.make) : undefined,
    fuelType: fuelType.length ? fuelType : undefined,
    transmission: transmission.length ? transmission : undefined,
    seats: seats.length ? seats : undefined,
    priceMin: parseNumber(query.priceMin),
    priceMax: parseNumber(query.priceMax),
    minRating: parseNumber(query.minRating),
    maxMileage: parseNumber(query.maxMileage),
    yearMin: parseNumber(query.yearMin),
    yearMax: parseNumber(query.yearMax),
    features: parseCsv(query.features).length ? parseCsv(query.features) : undefined,
    location:
      typeof query.location === 'string' && query.location.trim()
        ? query.location.trim()
        : undefined,
    locationArea:
      typeof query.area === 'string' && query.area.trim() ? query.area.trim() : undefined,
    startDate: parseCatalogStartDate(query.startDate),
    sort: parseSort(query.sort),
  }
}

export function catalogNeedsDealerJoin(filters: CatalogQueryFilters): boolean {
  return filters.minRating !== undefined && filters.minRating > 0
}

/** Builds SQL conditions on top of the base catalog visibility filter. */
export function buildCatalogConditions(
  filters: CatalogQueryFilters,
  catalogWhere: SQL
): SQL {
  const conditions: SQL[] = [catalogWhere]

  if (filters.search) {
    const sanitized = filters.search.replace(/[%_\\]/g, ' ').trim()
    if (sanitized) {
      const pattern = `%${sanitized}%`
      conditions.push(
        or(
          ilike(vehicles.name, pattern),
          ilike(vehicles.make, pattern),
          ilike(vehicles.model, pattern)
        )!
      )
    }
  }

  if (filters.category?.length) {
    conditions.push(inArray(vehicles.category, filters.category as any))
  }

  if (filters.make?.length) {
    conditions.push(inArray(vehicles.make, filters.make))
  }

  if (filters.fuelType?.length) {
    conditions.push(inArray(vehicles.fuelType, filters.fuelType as any))
  }

  if (filters.transmission?.length) {
    conditions.push(inArray(vehicles.transmission, filters.transmission))
  }

  if (filters.seats?.length) {
    conditions.push(inArray(vehicles.seats, filters.seats))
  }

  if (filters.priceMin !== undefined) {
    conditions.push(gte(sql`${vehicles.pricePerDay} * 30`, filters.priceMin))
  }

  if (filters.priceMax !== undefined) {
    conditions.push(lte(sql`${vehicles.pricePerDay} * 30`, filters.priceMax))
  }

  if (filters.maxMileage !== undefined) {
    conditions.push(lte(vehicles.mileage, filters.maxMileage))
  }

  if (filters.yearMin !== undefined) {
    conditions.push(gte(vehicles.year, filters.yearMin))
  }

  if (filters.yearMax !== undefined) {
    conditions.push(lte(vehicles.year, filters.yearMax))
  }

  if (filters.features?.length) {
    conditions.push(sql`${vehicles.features} @> ${JSON.stringify(filters.features)}::jsonb`)
  }

  if (filters.location) {
    conditions.push(eq(vehicles.locationCity, filters.location))
  }

  if (filters.locationArea) {
    conditions.push(ilike(vehicles.locationArea, `%${filters.locationArea.replace(/[%_\\]/g, ' ')}%`))
  }

  if (filters.minRating !== undefined && filters.minRating > 0) {
    conditions.push(gte(dealers.rating, String(filters.minRating)))
  }

  return and(...conditions)!
}

export function catalogOrderBy(sort: CatalogSort) {
  switch (sort) {
    case 'price_asc':
      return [asc(vehicles.pricePerDay), asc(vehicles.id)]
    case 'price_desc':
      return [desc(vehicles.pricePerDay), asc(vehicles.id)]
    case 'newest':
      return [desc(vehicles.year), desc(vehicles.id)]
    default:
      return [asc(vehicles.name), asc(vehicles.id)]
  }
}
