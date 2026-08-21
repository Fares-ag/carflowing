import { parseVehicleFeatures } from '@carflow/shared/vehicleFeatures'

export function normalizeVehicleImages(body: Record<string, unknown>): {
  imageUrls: string[]
  imageUrl: string | null
} {
  const fromArray = parseVehicleFeatures(body.imageUrls ?? body.image_urls)
  const single =
    typeof body.imageUrl === 'string'
      ? body.imageUrl
      : typeof body.image_url === 'string'
        ? body.image_url
        : undefined

  const imageUrls = fromArray.length ? fromArray : single ? [single] : []
  const imageUrl = imageUrls[0] ?? single ?? null
  return { imageUrls, imageUrl }
}

export function parseOptionalVehicleFeatures(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined
  return parseVehicleFeatures(raw)
}

export { parseVehicleFeatures, vehicleGalleryUrls } from '@carflow/shared/vehicleFeatures'
