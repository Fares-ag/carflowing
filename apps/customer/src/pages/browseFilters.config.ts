import type { LucideIcon } from 'lucide-react'
import { Bolt, Fuel, Leaf, User } from 'lucide-react'
import { BROWSE_LOCATION_OPTIONS, formatCurrency } from '@carflow/shared'

/** Catalog row shape used by browse filtering. Extend fields as data grows. */
export type BrowseCar = {
  id: string
  name: string
  type: string
  price: number
  pricePeriod: 'month' | 'day'
  seats: number
  transmission: string
  fuelType: string
  isElectric: boolean
  make: string
  model: string
  mileage: number
  year: number
  image?: string
  location?: string
  features: string[]
  rating: number
  reviewCount?: number
}

export type BrowseFilterState = {
  sortBy: string
  location: string
  startDate: string
  brands: string[]
  categories: string[]
  features: string[]
  fuelTypes: string[]
  transmissions: string[]
  seats: number[]
  priceMin: number
  priceMax: number
  minRating: number
  maxMileage: number
  yearMin: number
  yearMax: number
}

export type CheckboxOption = {
  value: string
  label: string
  icon?: LucideIcon
}

export type CollapsibleFilterMeta = {
  /** Section can collapse via its header. Default true for list sections. */
  collapsible?: boolean
  /** Whether the section starts expanded. Default true. */
  defaultOpen?: boolean
  /**
   * When set and options exceed this count, show a “Show more” control
   * inside an open section. Omit or set 0 to always show all options.
   */
  previewCount?: number
  /**
   * When false, the section is omitted from the sidebar (kept in config for
   * future catalog fields). Default true.
   */
  enabled?: boolean
}

export type FilterSectionConfig =
  | ({
      type: 'sort'
      id: 'sort'
      label: string
      options: string[]
    } & CollapsibleFilterMeta)
  | ({
      type: 'dualRange'
      id: 'price' | 'year'
      label: string
      min: number
      max: number
      step?: number
      formatLabel: (min: number, max: number) => string
    } & CollapsibleFilterMeta)
  | ({
      type: 'range'
      id: 'minRating' | 'maxMileage'
      label: string
      min: number
      max: number
      step?: number
      formatLabel: (value: number) => string
    } & CollapsibleFilterMeta)
  | ({
      type: 'checkbox'
      id: 'brands' | 'categories' | 'features' | 'fuelTypes' | 'transmissions'
      label: string
      options: CheckboxOption[]
    } & CollapsibleFilterMeta)
  | ({
      type: 'seatGrid'
      id: 'seats'
      label: string
      options: number[]
      optionIcon?: LucideIcon
    } & CollapsibleFilterMeta)
  | ({
      type: 'select'
      id: 'location'
      label: string
      options: CheckboxOption[]
    } & CollapsibleFilterMeta)
  | ({
      type: 'date'
      id: 'startDate'
      label: string
    } & CollapsibleFilterMeta)

export const SORT_OPTIONS = [
  'Recommended',
  'Price: Low to High',
  'Price: High to Low',
  'Newest',
] as const

/** Inclusive slider bounds — keep defaults equal so year does not silently filter the fleet. */
export const YEAR_FILTER_MIN = 2015
export const YEAR_FILTER_MAX = new Date().getFullYear() + 1

export const DEFAULT_FILTER_STATE: BrowseFilterState = {
  sortBy: SORT_OPTIONS[0],
  location: '',
  startDate: '',
  brands: [],
  categories: [],
  features: [],
  fuelTypes: [],
  transmissions: [],
  seats: [],
  priceMin: 0,
  priceMax: 20000,
  minRating: 0,
  maxMileage: 50000,
  yearMin: YEAR_FILTER_MIN,
  yearMax: YEAR_FILTER_MAX,
}

/**
 * Add a new filter by appending a section here, extending BrowseFilterState /
 * DEFAULT_FILTER_STATE, and mapping it in browseCatalogQuery.ts for the API.
 * Use `collapsible`, `defaultOpen`, and `previewCount` to control expand UX.
 */
export const BROWSE_FILTER_SECTIONS: FilterSectionConfig[] = [
  {
    type: 'sort',
    id: 'sort',
    label: 'Sort By',
    options: [...SORT_OPTIONS],
    collapsible: false,
  },
  {
    type: 'select',
    id: 'location',
    label: 'Location',
    options: [
      { value: '', label: 'All areas' },
      ...BROWSE_LOCATION_OPTIONS.map((value) => ({ value, label: value })),
    ],
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'date',
    id: 'startDate',
    label: 'Available from',
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'dualRange',
    id: 'price',
    label: 'Price Range',
    min: 0,
    max: 20000,
    step: 50,
    formatLabel: (min, max) => `Price Range: ${formatCurrency(min)} – ${formatCurrency(max)}`,
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'checkbox',
    id: 'brands',
    label: 'Brands',
    options: ['BMW', 'Mercedes', 'Tesla', 'Toyota', 'Honda', 'Porsche'].map((value) => ({
      value,
      label: value,
    })),
    collapsible: true,
    defaultOpen: true,
    previewCount: 4,
  },
  {
    type: 'checkbox',
    id: 'categories',
    label: 'Categories',
    options: ['Luxury', 'Electric', 'Economy', 'Sedan', 'Sports', 'SUV'].map((value) => ({
      value,
      label: value,
    })),
    collapsible: true,
    defaultOpen: true,
    previewCount: 4,
  },
  {
    type: 'checkbox',
    id: 'features',
    label: 'Features',
    options: [
      'GPS Navigation',
      'Bluetooth',
      'Apple CarPlay',
      'Sunroof',
      'Leather Seats',
      'Heated Seats',
    ].map((value) => ({ value, label: value })),
    collapsible: true,
    defaultOpen: false,
    previewCount: 4,
    enabled: true,
  },
  {
    type: 'checkbox',
    id: 'fuelTypes',
    label: 'Fuel Type',
    options: [
      { value: 'petrol', label: 'Petrol', icon: Fuel },
      { value: 'electric', label: 'Electric', icon: Bolt },
      { value: 'hybrid', label: 'Hybrid', icon: Leaf },
      { value: 'diesel', label: 'Diesel', icon: Fuel },
    ],
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'checkbox',
    id: 'transmissions',
    label: 'Transmission',
    options: ['Automatic', 'Manual', 'CVT'].map((value) => ({ value, label: value })),
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'seatGrid',
    id: 'seats',
    label: 'Number of Seats',
    options: [2, 4, 5, 7],
    optionIcon: User,
    collapsible: true,
    defaultOpen: true,
  },
  {
    type: 'range',
    id: 'minRating',
    label: 'Minimum Rating',
    min: 0,
    max: 5,
    step: 0.5,
    formatLabel: (value) => `Minimum Rating: ${value.toFixed(1)}`,
    collapsible: true,
    defaultOpen: false,
    // Vehicles do not expose ratings in the API yet — hide until they do.
    enabled: false,
  },
  {
    type: 'range',
    id: 'maxMileage',
    label: 'Maximum Mileage',
    min: 10000,
    max: 50000,
    step: 1000,
    formatLabel: (value) => `Maximum Mileage: ${value.toLocaleString()} km`,
    collapsible: true,
    defaultOpen: false,
  },
  {
    type: 'dualRange',
    id: 'year',
    label: 'Year Range',
    min: YEAR_FILTER_MIN,
    max: YEAR_FILTER_MAX,
    step: 1,
    formatLabel: (min, max) => `Year Range: ${min} – ${max}`,
    collapsible: true,
    defaultOpen: false,
  },
]

export function countActiveBrowseFilters(state: BrowseFilterState): number {
  let count = 0
  if (state.location) count += 1
  if (state.startDate) count += 1
  count += state.brands.length
  count += state.categories.length
  count += state.features.length
  count += state.fuelTypes.length
  count += state.transmissions.length
  count += state.seats.length
  if (state.priceMin > DEFAULT_FILTER_STATE.priceMin || state.priceMax < DEFAULT_FILTER_STATE.priceMax) {
    count += 1
  }
  if (state.minRating > DEFAULT_FILTER_STATE.minRating) count += 1
  if (state.maxMileage < DEFAULT_FILTER_STATE.maxMileage) count += 1
  if (state.yearMin > DEFAULT_FILTER_STATE.yearMin || state.yearMax < DEFAULT_FILTER_STATE.yearMax) {
    count += 1
  }
  return count
}

export function toggleListValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}
