/**
 * Shared types and utilities for CarFlow monorepo
 */

import carflowLogoSrc from './assets/CarflowLogo.png'

export * from './types'
export * from './mocks'
export * from './utils'
export * from './password'
export * from './pricing'
export * from './apiClient'
export * from './mockDb'
export * from './mappers'
export * from './storage'

/** Resolved URL for the Carflow mark (PNG). Used in customer, dealer, and admin UIs. */
export const CarflowLogo: string = carflowLogoSrc

// Icons
export * from './icons/figma-icons'
export * from './components/Icon'
