import type { CatalogListParams } from '../services/customerService'
import {
  DEFAULT_FILTER_STATE,
  SORT_OPTIONS,
  type BrowseFilterState,
} from './browseFilters.config'

function mapUiCategoryToApi(category: string): string {
  if (category === 'Electric') return 'ev'
  if (category === 'Economy') return 'other'
  if (category === 'Sports') return 'luxury'
  return category.toLowerCase()
}

function mapSort(sortBy: string): CatalogListParams['sort'] {
  if (sortBy === 'Price: Low to High') return 'price_asc'
  if (sortBy === 'Price: High to Low') return 'price_desc'
  if (sortBy === 'Newest') return 'newest'
  return 'recommended'
}

/** Maps browse UI filter state to GET /customer/vehicles query params. */
export function buildCatalogQueryParams(
  filters: BrowseFilterState,
  search: string,
  page: number,
  pageSize: number
): CatalogListParams {
  const params: CatalogListParams = {
    page,
    pageSize,
    sort: mapSort(filters.sortBy),
  }

  const trimmedSearch = search.trim()
  if (trimmedSearch) params.search = trimmedSearch

  if (filters.brands.length) params.make = filters.brands.join(',')

  if (filters.categories.length) {
    params.category = filters.categories.map(mapUiCategoryToApi).join(',')
  }

  if (filters.fuelTypes.length) params.fuelType = filters.fuelTypes.join(',')

  const transmissions = filters.transmissions
    .map((value) => value.toLowerCase())
    .filter((value) => value === 'automatic' || value === 'manual')
  if (transmissions.length) params.transmission = transmissions.join(',')

  if (filters.seats.length) params.seats = filters.seats.join(',')

  if (filters.priceMin > DEFAULT_FILTER_STATE.priceMin) params.priceMin = filters.priceMin
  if (filters.priceMax < DEFAULT_FILTER_STATE.priceMax) params.priceMax = filters.priceMax
  if (filters.minRating > DEFAULT_FILTER_STATE.minRating) params.minRating = filters.minRating
  if (filters.maxMileage < DEFAULT_FILTER_STATE.maxMileage) params.maxMileage = filters.maxMileage
  if (filters.yearMin > DEFAULT_FILTER_STATE.yearMin) params.yearMin = filters.yearMin
  if (filters.yearMax < DEFAULT_FILTER_STATE.yearMax) params.yearMax = filters.yearMax
  if (filters.features.length) params.features = filters.features.join(',')
  if (filters.location) params.location = filters.location
  if (filters.startDate) params.startDate = filters.startDate

  return params
}

export const BROWSE_PAGE_SIZE = 20

export function isDefaultSort(sortBy: string): boolean {
  return sortBy === SORT_OPTIONS[0]
}
