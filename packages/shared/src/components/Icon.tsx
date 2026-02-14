import { memo } from 'react'
import { getFigmaIcon, type FigmaIconName } from '../icons/figma-icons'

interface IconProps {
  name: FigmaIconName
  size?: number
  className?: string
  alt?: string
}

/**
 * Icon component that uses Figma icons
 * 
 * TODO: Replace with local SVG icons or icon library
 */
export const Icon = memo(function Icon({ 
  name, 
  size = 16, 
  className = '',
  alt = name 
}: IconProps) {
  const iconUrl = getFigmaIcon(name)
  
  return (
    <img 
      src={iconUrl}
      alt={alt}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block' }}
    />
  )
})
