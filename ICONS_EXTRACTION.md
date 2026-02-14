# Figma Icons Extraction Guide

This document tracks all icons extracted from Figma designs across the CarFlow platform.

## Icon Organization

Icons are organized by:
- **App**: customer, dealer, admin
- **Page/Component**: dashboard, analytics, leads, etc.
- **Type**: navigation, action, status, etc.

## Icon URLs from Figma Designs

### Dealer Portal - Dashboard
- **Logo Icon**: `https://www.figma.com/api/mcp/asset/e55c844f-3c92-482b-9827-f6fdbc44e86f`
- **Dashboard Nav Icon**: `https://www.figma.com/api/mcp/asset/5a1ba687-b67b-4681-aed8-4aa48e65a416`
- **Analytics Nav Icon**: `https://www.figma.com/api/mcp/asset/4afaa217-c4bc-4030-b2f4-4e899aa85f68`
- **Inventory Nav Icon**: `https://www.figma.com/api/mcp/asset/c17cd6a8-a014-4f24-bfdf-cad76b26871c`
- **Leads Nav Icon**: `https://www.figma.com/api/mcp/asset/fc181918-83ca-4a0b-a0d5-f44ef1b5c5a7`
- **Notifications Nav Icon**: `https://www.figma.com/api/mcp/asset/bcb0b280-d621-42f2-84ba-387ba26ecb4a`
- **Subscription Nav Icon**: `https://www.figma.com/api/mcp/asset/6f834cfd-d908-48ae-9749-24fcf099b57b`
- **Settings Nav Icon**: `https://www.figma.com/api/mcp/asset/b1eb9b9f-6a9d-443c-8703-be1b2adc2052`
- **Logout Icon**: `https://www.figma.com/api/mcp/asset/d59019a2-bc08-4470-9e0e-09e01e5fa3d0`
- **Edit Icon**: `https://www.figma.com/api/mcp/asset/c84d6675-6141-45ca-b81a-b4f9fad4ccfd`
- **Back Button Icon**: `https://www.figma.com/api/mcp/asset/b6aabe39-9c6d-4271-9ba9-fbd54515555d`
- **Home Icon**: `https://www.figma.com/api/mcp/asset/97b3fa69-d048-4f97-b09b-f33814689894`

### Stat Card Icons
- **Revenue Icon**: `https://www.figma.com/api/mcp/asset/1deea0cb-2081-4522-aa14-f0d76a1d350b`
- **Bookings Icon**: `https://www.figma.com/api/mcp/asset/92c7b839-700e-4a6b-88ca-319d014eca83`
- **Vehicles Icon**: `https://www.figma.com/api/mcp/asset/cdcd8b36-3f2e-4348-815a-054be572f847`
- **Customers Icon**: `https://www.figma.com/api/mcp/asset/8b90d624-c207-4fcf-bd16-1321fc424899`

### Chart/Vector Icons
- **Chart Vector 1**: `https://www.figma.com/api/mcp/asset/df44f1d4-13a5-46a9-9b2d-a0799831d893`
- **Chart Vector 2**: `https://www.figma.com/api/mcp/asset/313d74e2-515f-477a-864a-191bd7537f26`
- **Chart Vector 3**: `https://www.figma.com/api/mcp/asset/57a70cab-25bd-40d2-872b-3ad6e9e7ff4c`
- **Chart Vector 4**: `https://www.figma.com/api/mcp/asset/08b33dcc-9ba7-4dc0-8ca9-51da79305536`
- **Chart Vector 5**: `https://www.figma.com/api/mcp/asset/de39afb8-d0bc-4878-9f5d-67179c60953a`
- **Chart Vector 6**: `https://www.figma.com/api/mcp/asset/1288b623-f40d-42ab-943a-01ba25f4e5cc`
- **Chart Vector 7**: `https://www.figma.com/api/mcp/asset/95c1daee-6fb6-4e37-9bc0-c8b4ff522899`
- **Chart Vector 8**: `https://www.figma.com/api/mcp/asset/8972c95b-32a7-46d2-8ec9-03da81c22343`

### Group Icons
- **Group Icon 1**: `https://www.figma.com/api/mcp/asset/c1751605-a8c8-400c-a5f8-f477eb37338e`
- **Group Icon 2**: `https://www.figma.com/api/mcp/asset/bff4628b-8bf0-4d05-8085-198016dfed4a`
- **Group Icon 3**: `https://www.figma.com/api/mcp/asset/fa0e25d3-51cb-4432-b14e-9e93651ba613`

## Usage Notes

⚠️ **Important**: These Figma asset URLs are temporary and expire after 7 days. 

### Next Steps:
1. Download all icons to local storage
2. Convert to SVG format where possible
3. Organize into component library
4. Create icon component wrapper for consistent usage
5. Update all components to use local icons instead of Figma URLs

## Icon Component Pattern

```tsx
// Example usage
import { Icon } from '@/components/shared/Icon'

<Icon name="dashboard" size={24} />
<Icon name="analytics" size={20} />
```

## Download Instructions

To download icons, use the Figma API URLs. These can be:
1. Downloaded directly via browser
2. Fetched programmatically using a script
3. Exported from Figma directly if you have access

## Status

- ✅ Icon URLs extracted from Dashboard design
- ✅ Icon URLs extracted from Analytics design  
- ✅ Icon URLs extracted from Leads design
- ✅ Icon URLs extracted from Customer Subscription & Billing design
- ✅ Icon component library created (`packages/shared/src/components/Icon.tsx`)
- ✅ Icon mapping created (`packages/shared/src/icons/figma-icons.ts`)
- ⏳ Icons need to be downloaded and saved locally (URLs expire in 7 days)
- ⏳ Components need to be updated to use Icon component

## Implementation

All icons are now available through the shared package:

```tsx
import { Icon } from '@carflow/shared'
import { FigmaIcons, getFigmaIcon } from '@carflow/shared'

// Use the Icon component
<Icon name="dashboard" size={20} />

// Or get URL directly
const iconUrl = getFigmaIcon('dashboard')
```
