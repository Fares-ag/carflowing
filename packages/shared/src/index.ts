/**
 * Shared types and utilities for CarFlow monorepo
 */

export * from './types'
export * from './mocks'
export * from './utils'
export * from './apiClient'
export * from './mockDb'
export * from './supabaseClient'
export * from './supabaseMappers'

// Assets
export { default as CarflowLogo } from './assets/CarflowLogo.png'

// Common utilities
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount)
}

// Icons
export * from './icons/figma-icons'
export * from './components/Icon'

