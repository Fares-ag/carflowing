import { describe, expect, it } from 'vitest'
import { buildCatalogQueryParams } from '../browseCatalogQuery'
import { DEFAULT_FILTER_STATE } from '../browseFilters.config'

describe('buildCatalogQueryParams', () => {
  it('maps browse filters to catalog API params', () => {
    const params = buildCatalogQueryParams(
      {
        ...DEFAULT_FILTER_STATE,
        categories: ['Sedan'],
        fuelTypes: ['electric'],
        brands: ['Toyota'],
        sortBy: 'Price: Low to High',
      },
      'accord',
      2,
      20
    )

    expect(params).toMatchObject({
      page: 2,
      pageSize: 20,
      search: 'accord',
      category: 'sedan',
      fuelType: 'electric',
      make: 'Toyota',
      sort: 'price_asc',
    })
  })
})
