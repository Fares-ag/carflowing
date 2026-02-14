import type { FigmaDesign, FigmaNode } from './figmaService'

export interface GeneratedComponent {
  name: string
  code: string
  css?: string
  type: 'component' | 'style'
}

/**
 * Converts Figma color to CSS color
 */
function figmaColorToCSS(color: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round(color.r * 255)
  const g = Math.round(color.g * 255)
  const b = Math.round(color.b * 255)
  const a = color.a !== undefined ? color.a : 1
  
  if (a < 1) {
    return `rgba(${r}, ${g}, ${b}, ${a})`
  }
  return `rgb(${r}, ${g}, ${b})`
}

/**
 * Converts Figma solid fill to CSS background
 */
function convertFills(fills: any[]): string {
  if (!fills || fills.length === 0) return ''
  
  const solidFill = fills.find((fill: any) => fill.type === 'SOLID')
  if (solidFill && solidFill.color) {
    return `background: ${figmaColorToCSS(solidFill.color)};`
  }
  
  return ''
}

/**
 * Converts Figma effects (shadows, etc.) to CSS
 */
function convertEffects(effects: any[]): string {
  if (!effects || effects.length === 0) return ''
  
  const shadows: string[] = []
  effects.forEach((effect: any) => {
    if (effect.type === 'DROP_SHADOW' || effect.type === 'INNER_SHADOW') {
      const { r, g, b, a } = effect.color || { r: 0, g: 0, b: 0, a: 0.25 }
      const color = figmaColorToCSS({ r, g, b, a: a || 0.25 })
      const x = effect.offset?.x || 0
      const y = effect.offset?.y || 0
      const blur = effect.radius || 0
      const spread = effect.spread || 0
      const inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''
      shadows.push(`${inset}${x}px ${y}px ${blur}px ${spread}px ${color}`)
    }
  })
  
  if (shadows.length > 0) {
    return `box-shadow: ${shadows.join(', ')};`
  }
  
  return ''
}

/**
 * Converts Figma layout constraints to CSS
 */
function convertLayoutConstraints(constraints: any): string {
  if (!constraints) return ''
  
  const styles: string[] = []
  
  if (constraints.horizontal === 'LEFT') {
    styles.push('align-self: flex-start;')
  } else if (constraints.horizontal === 'RIGHT') {
    styles.push('align-self: flex-end;')
  } else if (constraints.horizontal === 'CENTER') {
    styles.push('align-self: center;')
  } else if (constraints.horizontal === 'LEFT_RIGHT') {
    styles.push('width: 100%;')
  }
  
  if (constraints.vertical === 'TOP') {
    styles.push('align-self: flex-start;')
  } else if (constraints.vertical === 'BOTTOM') {
    styles.push('align-self: flex-end;')
  } else if (constraints.vertical === 'CENTER') {
    styles.push('align-self: center;')
  } else if (constraints.vertical === 'TOP_BOTTOM') {
    styles.push('height: 100%;')
  }
  
  return styles.join(' ')
}

/**
 * Converts Figma node to CSS styles
 */
function nodeToCSS(node: any): string {
  const styles: string[] = []
  
  // Position and size
  if (node.absoluteBoundingBox) {
    const { x, y, width, height } = node.absoluteBoundingBox
    styles.push(`position: absolute;`)
    styles.push(`left: ${x}px;`)
    styles.push(`top: ${y}px;`)
    styles.push(`width: ${width}px;`)
    styles.push(`height: ${height}px;`)
  } else if (node.absoluteRenderBounds) {
    const { x, y, width, height } = node.absoluteRenderBounds
    styles.push(`position: absolute;`)
    styles.push(`left: ${x}px;`)
    styles.push(`top: ${y}px;`)
    styles.push(`width: ${width}px;`)
    styles.push(`height: ${height}px;`)
  }
  
  // Background
  if (node.fills) {
    const fillCSS = convertFills(node.fills)
    if (fillCSS) styles.push(fillCSS)
  }
  
  // Border radius
  if (node.cornerRadius !== undefined) {
    styles.push(`border-radius: ${node.cornerRadius}px;`)
  }
  
  // Effects (shadows)
  if (node.effects) {
    const effectsCSS = convertEffects(node.effects)
    if (effectsCSS) styles.push(effectsCSS)
  }
  
  // Opacity
  if (node.opacity !== undefined && node.opacity < 1) {
    styles.push(`opacity: ${node.opacity};`)
  }
  
  // Layout
  if (node.layoutMode === 'HORIZONTAL' || node.layoutMode === 'VERTICAL') {
    styles.push(`display: flex;`)
    styles.push(`flex-direction: ${node.layoutMode === 'HORIZONTAL' ? 'row' : 'column'};`)
    
    if (node.paddingLeft) styles.push(`padding-left: ${node.paddingLeft}px;`)
    if (node.paddingRight) styles.push(`padding-right: ${node.paddingRight}px;`)
    if (node.paddingTop) styles.push(`padding-top: ${node.paddingTop}px;`)
    if (node.paddingBottom) styles.push(`padding-bottom: ${node.paddingBottom}px;`)
    
    if (node.itemSpacing) {
      styles.push(`gap: ${node.itemSpacing}px;`)
    }
  }
  
  // Constraints
  if (node.constraints) {
    const constraintsCSS = convertLayoutConstraints(node.constraints)
    if (constraintsCSS) styles.push(constraintsCSS)
  }
  
  // Text styles
  if (node.style) {
    if (node.style.fontFamily) {
      styles.push(`font-family: ${node.style.fontFamily};`)
    }
    if (node.style.fontSize) {
      styles.push(`font-size: ${node.style.fontSize}px;`)
    }
    if (node.style.fontWeight) {
      styles.push(`font-weight: ${node.style.fontWeight};`)
    }
    if (node.style.lineHeightPx) {
      styles.push(`line-height: ${node.style.lineHeightPx}px;`)
    }
    if (node.style.letterSpacing) {
      styles.push(`letter-spacing: ${node.style.letterSpacing}px;`)
    }
    if (node.style.textAlignHorizontal) {
      styles.push(`text-align: ${node.style.textAlignHorizontal.toLowerCase()};`)
    }
    if (node.fills && node.fills.length > 0) {
      const textFill = convertFills(node.fills)
      if (textFill) {
        styles.push(textFill.replace('background', 'color'))
      }
    }
  }
  
  // Border
  if (node.strokes && node.strokes.length > 0) {
    const stroke = node.strokes[0]
    if (stroke.type === 'SOLID' && stroke.color) {
      const color = figmaColorToCSS(stroke.color)
      const width = node.strokeWeight || 1
      styles.push(`border: ${width}px solid ${color};`)
    }
  }
  
  return styles.join(' ')
}

/**
 * Sanitizes a name for use as a component or variable name
 */
function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]/g, '_')
    .replace(/^[0-9]/, '_$&')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    || 'Component'
}

/**
 * Converts a Figma node to a React component
 */
function nodeToReactComponent(
  node: any,
  componentName: string,
  depth: number = 0,
  parentStyles: string = ''
): { jsx: string; css: string; components: string[] } {
  const indent = '  '.repeat(depth)
  const name = sanitizeName(node.name || 'Element')
  const className = `${componentName}_${name}`.toLowerCase()
  
  let jsx = ''
  let css = ''
  const childComponents: string[] = []
  
  // Generate CSS for this node
  const nodeCSS = nodeToCSS(node)
  if (nodeCSS) {
    // Format CSS properly - split by semicolon and add proper indentation
    const formattedCSS = nodeCSS
      .split(';')
      .filter(s => s.trim())
      .map(s => s.trim() + ';')
      .join('\n  ')
    css += `.${className} {\n  ${formattedCSS}\n}\n\n`
  }
  
  // Handle different node types
  switch (node.type) {
    case 'TEXT':
      const textContent = node.characters || ''
      jsx = `${indent}<p className="${className}">${textContent}</p>`
      break
      
    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'POLYGON':
    case 'STAR':
    case 'VECTOR':
      jsx = `${indent}<div className="${className}" />`
      break
      
    case 'FRAME':
    case 'GROUP':
    case 'COMPONENT':
    case 'INSTANCE':
      if (node.children && node.children.length > 0) {
        const childrenJSX: string[] = []
        const childrenCSS: string[] = []
        
        node.children.forEach((child: any) => {
          const childResult = nodeToReactComponent(child, componentName, depth + 1)
          childrenJSX.push(childResult.jsx)
          childrenCSS.push(childResult.css)
          childComponents.push(...childResult.components)
        })
        
        jsx = `${indent}<div className="${className}">\n${childrenJSX.join('\n')}\n${indent}</div>`
        css += childrenCSS.join('')
      } else {
        jsx = `${indent}<div className="${className}" />`
      }
      break
      
    default:
      jsx = `${indent}<div className="${className}" />`
  }
  
  return { jsx, css, components: childComponents }
}

/**
 * Generates React components from Figma design
 */
export function generateReactComponents(design: FigmaDesign): GeneratedComponent[] {
  const components: GeneratedComponent[] = []
  
  // Generate components from document
  if (design.document) {
    const componentName = sanitizeName(design.name || 'Design')
    const result = nodeToReactComponent(design.document, componentName, 0)
    
    const componentCode = `import React from 'react'
import './${componentName}.css'

interface ${componentName}Props {
  // Add your props here
}

export const ${componentName}: React.FC<${componentName}Props> = () => {
  return (
    <div className="${componentName.toLowerCase()}_container">
${result.jsx}
    </div>
  )
}

export default ${componentName}
`

    const cssCode = `.${componentName.toLowerCase()}_container {
  position: relative;
  width: 100%;
  height: 100%;
}

${result.css}
`

    components.push({
      name: componentName,
      code: componentCode,
      css: cssCode,
      type: 'component'
    })
  }
  
  // Generate components from nodes (if specific nodes were fetched)
  if (design.nodes) {
    Object.entries(design.nodes).forEach(([nodeId, nodeData]) => {
      const node = nodeData.document
      if (node) {
        const componentName = sanitizeName(node.name || `Node_${nodeId}`)
        const result = nodeToReactComponent(node, componentName, 0)
        
        const componentCode = `import React from 'react'
import './${componentName}.css'

interface ${componentName}Props {
  // Add your props here
}

export const ${componentName}: React.FC<${componentName}Props> = () => {
  return (
    <div className="${componentName.toLowerCase()}_container">
${result.jsx}
    </div>
  )
}

export default ${componentName}
`

        const cssCode = `.${componentName.toLowerCase()}_container {
  position: relative;
  width: 100%;
  height: 100%;
}

${result.css}
`

        components.push({
          name: componentName,
          code: componentCode,
          css: cssCode,
          type: 'component'
        })
      }
    })
  }
  
  // Generate global styles if available
  if (design.styles && Object.keys(design.styles).length > 0) {
    let stylesCode = '/* Global styles from Figma */\n\n'
    
    Object.entries(design.styles).forEach(([styleId, style]: [string, any]) => {
      if (style.styleType === 'FILL') {
        stylesCode += `/* Fill Style: ${style.name} */\n`
        // Add style implementation
      } else if (style.styleType === 'TEXT') {
        stylesCode += `/* Text Style: ${style.name} */\n`
        // Add style implementation
      }
    })
    
    components.push({
      name: 'GlobalStyles',
      code: stylesCode,
      css: stylesCode,
      type: 'style'
    })
  }
  
  return components
}

/**
 * Converts Figma design to React components (legacy function for backward compatibility)
 */
export function convertFigmaToReact(design: FigmaDesign): string {
  const components = generateReactComponents(design)
  
  if (components.length === 0) {
    return `// No components generated from Figma design: ${design.name}\n// The design may not contain any valid nodes.`
  }
  
  return components.map(comp => comp.code).join('\n\n// ============================================\n\n')
}

