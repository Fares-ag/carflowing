/**
 * Figma MCP Service
 * 
 * This service handles fetching designs from Figma using MCP (Model Context Protocol).
 * 
 * To use this service, you'll need:
 * 1. A Figma MCP server configured in your MCP settings
 * 2. A Figma file URL or file key
 * 3. Proper authentication tokens if required
 */

export interface FigmaDesign {
  name: string
  components?: Record<string, FigmaComponent>
  styles?: Record<string, FigmaStyle>
  nodes?: Record<string, { document: FigmaNode }>
  document?: FigmaNode
  schemaVersion?: number
  componentSets?: Record<string, any>
}

export interface FigmaComponent {
  id: string
  name: string
  type: string
  properties?: Record<string, any>
}

export interface FigmaStyle {
  id: string
  name: string
  styleType: string
  properties?: Record<string, any>
}

export interface FigmaNode {
  id: string
  name: string
  type: string
  children?: FigmaNode[]
  styles?: Record<string, any>
  properties?: Record<string, any>
}

/**
 * Extracts file key and node ID from a Figma URL
 * @param urlOrKey - Figma URL or file key
 * @returns Object with fileKey and optional nodeId
 */
function extractFigmaInfo(urlOrKey: string): { fileKey: string; nodeId?: string } {
  // If it's already a key (no URL structure), return as is
  if (!urlOrKey.includes('figma.com')) {
    return { fileKey: urlOrKey }
  }

  // Try new format: https://www.figma.com/design/{fileKey}/...
  let match = urlOrKey.match(/figma\.com\/design\/([a-zA-Z0-9]+)/)
  if (match && match[1]) {
    const fileKey = match[1]
    // Extract node-id from query params
    const nodeMatch = urlOrKey.match(/node-id=([^&]+)/)
    const nodeId = nodeMatch ? nodeMatch[1] : undefined
    return { fileKey, nodeId }
  }

  // Try old format: https://www.figma.com/file/{fileKey}/...
  match = urlOrKey.match(/figma\.com\/file\/([a-zA-Z0-9]+)/)
  if (match && match[1]) {
    const fileKey = match[1]
    const nodeMatch = urlOrKey.match(/node-id=([^&]+)/)
    const nodeId = nodeMatch ? nodeMatch[1] : undefined
    return { fileKey, nodeId }
  }

  throw new Error('Invalid Figma URL format. Expected: https://www.figma.com/design/{fileKey}/... or https://www.figma.com/file/{fileKey}/...')
}

/**
 * Fetches a design from Figma using REST API
 * 
 * Note: This requires a Figma access token. You can get one from:
 * https://www.figma.com/developers/api#access-tokens
 * 
 * For production, store the token in environment variables or use a backend proxy.
 * 
 * @param urlOrKey - Figma file URL or file key
 * @param accessToken - Optional Figma access token (or use VITE_FIGMA_TOKEN env var)
 * @returns Promise resolving to the Figma design data
 */
export async function fetchFigmaDesign(urlOrKey: string, accessToken?: string): Promise<FigmaDesign> {
  const { fileKey, nodeId } = extractFigmaInfo(urlOrKey)
  
  // Get token from parameter, environment variable, or prompt user
  const token = accessToken || import.meta.env.VITE_FIGMA_TOKEN

  if (!token) {
    throw new Error(
      'Figma access token is required. ' +
      'Please provide it via VITE_FIGMA_TOKEN environment variable or pass it as a parameter. ' +
      'Get your token from: https://www.figma.com/developers/api#access-tokens'
    )
  }

  try {
    // Build the API URL
    let apiUrl = `https://api.figma.com/v1/files/${fileKey}`
    
    // If node ID is provided, fetch specific nodes
    if (nodeId) {
      // Convert node-id format (e.g., "219-39305") to node IDs format
      const nodeIds = nodeId.replace(/-/g, ':')
      apiUrl += `/nodes?ids=${encodeURIComponent(nodeIds)}`
    }

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'X-Figma-Token': token,
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to fetch Figma design: ${response.status} ${response.statusText}. ` +
        (errorData.message || errorData.err || '')
      )
    }

    const data = await response.json()

    // Transform Figma API response to our design format
    const design: FigmaDesign = {
      name: data.name || `Figma Design ${fileKey}`,
      nodes: nodeId && data.nodes ? data.nodes : {},
      document: data.document,
      schemaVersion: data.schemaVersion,
      styles: data.styles || {},
      components: data.components || {},
      componentSets: data.componentSets || {},
    }

    return design
  } catch (error) {
    if (error instanceof Error && error.message.includes('access token')) {
      throw error
    }
    throw new Error(
      `Error fetching Figma design: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// Note: convertFigmaToReact has been moved to codeGenerator.ts
// Use generateReactComponents from './codeGenerator' instead

