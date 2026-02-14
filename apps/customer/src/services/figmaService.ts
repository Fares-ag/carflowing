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
 * Fetches a design from Figma using the backend API (which uses MCP)
 * 
 * @param urlOrKey - Figma file URL or file key
 * @param accessToken - Optional (kept for backward compatibility, not used with MCP)
 * @returns Promise resolving to the Figma design data
 */
export async function fetchFigmaDesign(urlOrKey: string, accessToken?: string): Promise<FigmaDesign> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001'
  
  try {
    const response = await fetch(`${backendUrl}/api/figma/design?url=${encodeURIComponent(urlOrKey)}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Failed to fetch Figma design: ${response.status} ${response.statusText}. ` +
        (errorData.message || errorData.error || '')
      )
    }

    const result = await response.json()
    
    // Transform MCP response to our design format
    // The MCP response structure may vary, so we'll adapt it
    const mcpData = result.data || {}
    
    // If MCP returns code directly, we need to parse it or structure it differently
    // For now, we'll create a basic structure that works with our code generator
    const design: FigmaDesign = {
      name: `Figma Design ${result.fileKey || 'Unknown'}`,
      document: mcpData.metadata || mcpData,
      nodes: result.nodeId ? { [result.nodeId]: { document: mcpData.metadata || mcpData } } : {},
      components: {},
      styles: {},
      componentSets: {},
    }

    return design
  } catch (error) {
    throw new Error(
      `Error fetching Figma design: ${error instanceof Error ? error.message : 'Unknown error'}`
    )
  }
}

// Note: convertFigmaToReact has been moved to codeGenerator.ts
// Use generateReactComponents from './codeGenerator' instead

