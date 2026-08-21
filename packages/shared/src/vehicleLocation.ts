import type { Vehicle } from './types'

/** Qatar metro areas shown in customer browse filters. */
export const BROWSE_LOCATION_OPTIONS = [
  'Doha',
  'Al Rayyan',
  'Al Wakrah',
  'Lusail',
  'Al Khor',
] as const

export type BrowseLocationOption = (typeof BROWSE_LOCATION_OPTIONS)[number]

export function formatVehicleLocation(
  vehicle: Pick<Vehicle, 'locationCity' | 'locationArea'>
): string | undefined {
  const city = vehicle.locationCity?.trim()
  const area = vehicle.locationArea?.trim()
  if (area && city) return `${area}, ${city}`
  return city ?? area ?? undefined
}
