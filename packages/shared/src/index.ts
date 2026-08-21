/**
 * Shared types and utilities for CarFlow monorepo
 */

import carflowLogoSrc from './assets/CarflowLogo.png'

export * from './types'
export * from './mocks'
export * from './utils'
export * from './utils/authRedirect'
export * from './labels/statusLabels'
export * from './constants/events'
export * from './dev/serviceMode'
export * from './password'
export * from './subscription'
export * from './vehicleFeatures'
export * from './vehicleLocation'
export * from './apiClient'
export * from './mockDb'
export * from './mappers'
export * from './storage'
export * from './useLiveListRefresh'

/** Resolved URL for the Carflow mark (PNG). Used in customer, dealer, and admin UIs. */
export const CarflowLogo: string = carflowLogoSrc

// Icons
export * from './icons/figma-icons'
export * from './components/Icon'
export * from './components/ErrorBoundary'
export * from './components/ProtectedRoute'
export * from './validation'
export * from './analytics/events'
