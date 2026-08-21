/**
 * Minimal binary fixtures for upload tests, kept tiny and inline so the
 * repository doesn't need committed binary blobs.
 */
export const tinyPngBuffer = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

export const tinyPdfBuffer = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF', 'utf8')

export const oversizedBuffer = (sizeBytes: number) => Buffer.alloc(sizeBytes, 1)

/** A file whose bytes are plain text but whose name/mimetype claim to be a PNG. */
export const fakePngBuffer = Buffer.from('#!/bin/sh\necho not-really-an-image\n', 'utf8')

export const evilHtmlBuffer = Buffer.from('<html><body><script>alert(1)</script></body></html>', 'utf8')

export const svgWithScriptBuffer = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8'
)
