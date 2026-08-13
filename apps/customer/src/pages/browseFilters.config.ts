import type { LucideIcon } from 'lucide-react'
import { Bolt, Fuel, Leaf, User } from 'lucide-react'

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
  /** Optional until vehicles expose features in the API */
  features: string[]
  /** Optional until vehicles expose ratings in the API */
  rating: number
}

export type BrowseFilterState = {
  sortBy: string
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
  brands: [],
  categories: [],
  features: [],
  fuelTypes: [],
  transmissions: [],
  seats: [],
  priceMin: 0,
  priceMax: 5000,
  minRating: 0,
  maxMileage: 50000,
  yearMin: YEAR_FILTER_MIN,
  yearMax: YEAR_FILTER_MAX,
}

/**
 * Add a new filter by appending a section here, extending BrowseFilterState /
 * DEFAULT_FILTER_STATE, and teaching applyBrowseFilters how to use it.
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
    type: 'dualRange',
    id: 'price',
    label: 'Price Range',
    min: 0,
    max: 5000,
    step: 50,
    formatLabel: (min, max) => `Price Range: QAR ${min.toLocaleString()} – QAR ${max.toLocaleString()}`,
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
    // Vehicles do not expose features in the API yet — hide until they do.
    enabled: false,
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

function matchesCategory(car: BrowseCar, selected: string[]): boolean {
  if (selected.length === 0) return true
  return selected.some((cat) => {
    if (cat === 'Electric') return car.type === 'Electric' || car.isElectric
    if (cat === 'Economy') return car.type === 'Other' || car.type === 'Economy'
    if (cat === 'Sports') return car.type === 'Sports'
    return car.type === cat
  })
}

export function applyBrowseFilters(cars: BrowseCar[], state: BrowseFilterState): BrowseCar[] {
  return cars
    .filter((car) => {
      if (state.brands.length === 0) return true
      return state.brands.includes(car.make)
    })
    .filter((car) => matchesCategory(car, state.categories))
    .filter((car) => {
      if (state.features.length === 0) return true
      // Until vehicles expose feature data, don't empty the catalog.
      if (car.features.length === 0) return true
      return state.features.every((feature) => car.features.includes(feature))
    })
    .filter((car) => {
      if (state.fuelTypes.length === 0) return true
      const fuelLabel = car.fuelType === 'gas' ? 'petrol' : car.fuelType
      return state.fuelTypes.includes(fuelLabel)
    })
    .filter((car) => {
      if (state.transmissions.length === 0) return true
      return state.transmissions.includes(car.transmission)
    })
    .filter((car) => {
      if (state.seats.length === 0) return true
      return state.seats.includes(car.seats)
    })
    .filter((car) => car.price >= state.priceMin && car.price <= state.priceMax)
    .filter((car) => {
      // Unrated vehicles (0) stay visible until ratings ship in the API.
      if (car.rating <= 0) return true
      return car.rating >= state.minRating
    })
    .filter((car) => car.mileage <= state.maxMileage)
    .filter((car) => car.year >= state.yearMin && car.year <= state.yearMax)
    .sort((a, b) => {
      if (state.sortBy === 'Price: Low to High') return a.price - b.price
      if (state.sortBy === 'Price: High to Low') return b.price - a.price
      if (state.sortBy === 'Newest') return b.year - a.year
      return 0
    })
}

export function countActiveBrowseFilters(state: BrowseFilterState): number {
  let count = 0
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
