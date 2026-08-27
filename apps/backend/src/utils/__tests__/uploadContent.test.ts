import { describe, expect, it } from 'vitest'
import { tinyPdfBuffer, tinyPngBuffer, fakePngBuffer } from '../../test/fixtures/index.js'
import { validateUploadContent, VEHICLE_IMAGE_MIMES } from '../uploadContent.js'

describe('validateUploadContent', () => {
  it('accepts real PNG bytes and maps extension from MIME', () => {
    const result = validateUploadContent(tinyPngBuffer, 'image/png', VEHICLE_IMAGE_MIMES)
    expect(result).toEqual({ mime: 'image/png', ext: '.png' })
  })

  it('rejects spoofed image MIME when magic bytes do not match', () => {
    const result = validateUploadContent(fakePngBuffer, 'image/png', VEHICLE_IMAGE_MIMES)
    expect(result).toEqual({ error: 'File content does not match the declared type' })
  })

  it('accepts PDF bytes for document uploads', () => {
    const result = validateUploadContent(tinyPdfBuffer, 'application/pdf', ['application/pdf'])
    expect(result).toEqual({ mime: 'application/pdf', ext: '.pdf' })
  })

  it('rejects SVG even when claimed as an allowed image type', () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect(validateUploadContent(svg, 'image/svg+xml', VEHICLE_IMAGE_MIMES)).toEqual({
      error: 'SVG uploads are not allowed',
    })
  })
})
