import { Router } from 'express'
import { getDesignContext, getMetadata, getScreenshot } from '../services/figmaMCP.js'

const router = Router()

/**
 * Extract file key and node ID from Figma URL
 */
function extractFigmaInfo(url: string): { fileKey: string; nodeId?: string } {
  // Try new format: https://www.figma.com/design/{fileKey}/...
  let match = url.match(/figma\.com\/design\/([a-zA-Z0-9]+)/)
  if (match && match[1]) {
    const fileKey = match[1]
    const nodeMatch = url.match(/node-id=([^&]+)/)
    const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : undefined
    return { fileKey, nodeId }
  }

  // Try old format: https://www.figma.com/file/{fileKey}/...
  match = url.match(/figma\.com\/file\/([a-zA-Z0-9]+)/)
  if (match && match[1]) {
    const fileKey = match[1]
    const nodeMatch = url.match(/node-id=([^&]+)/)
    const nodeId = nodeMatch ? nodeMatch[1].replace(/-/g, ':') : undefined
    return { fileKey, nodeId }
  }

  throw new Error('Invalid Figma URL format')
}

/**
 * GET /api/figma/design
 * Fetches design context from Figma using MCP
 */
router.get('/design', async (req, res) => {
  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Figma URL is required' })
    }

    const { fileKey, nodeId } = extractFigmaInfo(url)

    if (!nodeId) {
      return res.status(400).json({ error: 'Node ID is required in the Figma URL' })
    }

    // Use MCP to get design context
    const designContext = await getDesignContext(fileKey, nodeId)

    res.json({
      success: true,
      data: designContext,
      fileKey,
      nodeId,
    })
  } catch (error) {
    console.error('Error fetching Figma design:', error)
    res.status(500).json({
      error: 'Failed to fetch Figma design',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/figma/metadata
 * Fetches metadata from Figma using MCP
 */
router.get('/metadata', async (req, res) => {
  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Figma URL is required' })
    }

    const { fileKey, nodeId } = extractFigmaInfo(url)

    if (!nodeId) {
      return res.status(400).json({ error: 'Node ID is required in the Figma URL' })
    }

    const metadata = await getMetadata(fileKey, nodeId)

    res.json({
      success: true,
      data: metadata,
      fileKey,
      nodeId,
    })
  } catch (error) {
    console.error('Error fetching Figma metadata:', error)
    res.status(500).json({
      error: 'Failed to fetch Figma metadata',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

/**
 * GET /api/figma/screenshot
 * Gets a screenshot from Figma using MCP
 */
router.get('/screenshot', async (req, res) => {
  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'Figma URL is required' })
    }

    const { fileKey, nodeId } = extractFigmaInfo(url)

    if (!nodeId) {
      return res.status(400).json({ error: 'Node ID is required in the Figma URL' })
    }

    const screenshot = await getScreenshot(fileKey, nodeId)

    res.json({
      success: true,
      data: screenshot,
      fileKey,
      nodeId,
    })
  } catch (error) {
    console.error('Error fetching Figma screenshot:', error)
    res.status(500).json({
      error: 'Failed to fetch Figma screenshot',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})

export { router as figmaRouter }

