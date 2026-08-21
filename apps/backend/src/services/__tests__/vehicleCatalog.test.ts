import { describe, expect, it } from 'vitest'
import { buildCatalogConditions, parseCatalogQuery } from '../vehicleCatalog.js'
import { sql } from 'drizzle-orm'

describe('vehicleCatalog', () => {
  it('CAT-01: parses comma-separated filters and sort', () => {
    const filters = parseCatalogQuery({
      search: 'bmw',
      category: 'sedan,suv',
      make: 'BMW,Toyota',
      fuelType: 'petrol,electric',
      transmission: 'automatic,manual',
      seats: '4,5',
      priceMin: '1000',
      priceMax: '8000',
      sort: 'price_asc',
    })

    expect(filters).toMatchObject({
      search: 'bmw',
      category: ['sedan', 'suv'],
      make: ['BMW', 'Toyota'],
      fuelType: ['gas', 'electric'],
      transmission: ['automatic', 'manual'],
      seats: [4, 5],
      priceMin: 1000,
      priceMax: 8000,
      sort: 'price_asc',
    })
  })

  it('CAT-02: buildCatalogConditions returns SQL for active filters', () => {
    const filters = parseCatalogQuery({ category: 'sedan', sort: 'recommended' })
    const where = buildCatalogConditions(filters, sql`true`)
    expect(where).toBeTruthy()
  })
})
