/** Canonical vehicle feature labels (browse filter + dealer forms). */
export const VEHICLE_FEATURE_OPTIONS = [
  'GPS Navigation',
  'Bluetooth',
  'Apple CarPlay',
  'Sunroof',
  'Leather Seats',
  'Heated Seats',
] as const

export type VehicleFeatureOption = (typeof VEHICLE_FEATURE_OPTIONS)[number]

export function parseVehicleFeatures(raw: unknown): string[] {
  if (raw === undefined || raw === null) return []
  if (Array.isArray(raw)) {
    return raw
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  if (typeof raw === 'string') {
    return raw
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  }
  return []
}

export function vehicleGalleryUrls(row: {
  imageUrl?: string | null
  imageUrls?: string[] | null
}): string[] {
  const urls = (row.imageUrls ?? []).filter(Boolean)
  if (urls.length) return urls
  if (row.imageUrl) return [row.imageUrl]
  return []
}
