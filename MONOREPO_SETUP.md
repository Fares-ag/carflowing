# CarFlow Monorepo Setup Complete! 🎉

## What's Been Created

### ✅ Monorepo Structure
- Root `package.json` with npm workspaces configured
- Three frontend apps: `admin`, `customer`, `dealer`
- Backend API server: `backend`
- Shared package: `shared`

### ✅ Backend API Server (`apps/backend`)
- Express server with CORS enabled
- Figma MCP integration endpoints:
  - `GET /api/figma/design?url={figmaUrl}`
  - `GET /api/figma/metadata?url={figmaUrl}`
  - `GET /api/figma/screenshot?url={figmaUrl}`
- Placeholder MCP service that needs your MCP client integration

### ✅ Customer App (`apps/customer`)
- Moved from root directory
- Updated to use backend API instead of direct REST calls
- Figma design integration UI
- React component generator

### ✅ Admin App (`apps/admin`)
- Basic React + TypeScript setup
- Port: 5174
- Ready for admin dashboard development

### ✅ Dealer App (`apps/dealer`)
- Basic React + TypeScript setup
- Port: 5175
- Ready for dealer portal development

### ✅ Shared Package (`packages/shared`)
- Common types (User, ApiResponse)
- Utility functions (formatDate, formatCurrency)
- Ready to expand with shared components

## Next Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Integrate MCP Client in Backend
The backend needs to actually call MCP tools. Update `apps/backend/src/services/figmaMCP.ts`:

```typescript
// You'll need to install an MCP client library or create your own
// Example structure:
import { MCPClient } from '@modelcontextprotocol/client'

const mcpClient = new MCPClient({
  // Your MCP server configuration
})

export async function getDesignContext(fileKey: string, nodeId: string) {
  const result = await mcpClient.callTool('mcp_figma_get_design_context', {
    fileKey,
    nodeId,
    clientLanguages: 'typescript',
    clientFrameworks: 'react'
  })
  return result
}
```

### 3. Start Development
```bash
# Terminal 1: Backend
npm run dev:backend

# Terminal 2: Customer App
npm run dev:customer

# Terminal 3: Admin App (optional)
npm run dev:admin

# Terminal 4: Dealer App (optional)
npm run dev:dealer
```

### 4. Build Out Features
- **Admin**: Dashboard, user management, analytics
- **Customer**: Car browsing, booking, profile management
- **Dealer**: Inventory management, bookings, analytics
- **Shared**: Common components, hooks, utilities

## Port Configuration

- Backend: `http://localhost:3001`
- Customer: `http://localhost:5173`
- Admin: `http://localhost:5174`
- Dealer: `http://localhost:5175`

## Environment Variables

Create `.env` files in each app as needed:

**Backend** (`apps/backend/.env`):
```
PORT=3001
# Add MCP server configuration if needed
```

**Customer** (`apps/customer/.env`):
```
VITE_BACKEND_URL=http://localhost:3001
```

## Project Structure

```
carflow-monorepo/
├── apps/
│   ├── admin/
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── customer/
│   │   ├── src/
│   │   │   ├── services/
│   │   │   │   ├── figmaService.ts (uses backend API)
│   │   │   │   └── codeGenerator.ts
│   │   ├── package.json
│   │   └── vite.config.ts
│   ├── dealer/
│   │   ├── src/
│   │   ├── package.json
│   │   └── vite.config.ts
│   └── backend/
│       ├── src/
│       │   ├── routes/
│       │   │   └── figma.ts
│       │   ├── services/
│       │   │   └── figmaMCP.ts (needs MCP client)
│       │   └── index.ts
│       └── package.json
├── packages/
│   └── shared/
│       ├── src/
│       │   └── index.ts
│       └── package.json
├── package.json (root workspace)
└── README.md
```

## Tips

1. **Hot Reloading**: All apps support hot reloading during development
2. **Shared Code**: Import from `@carflow/shared` in any app
3. **API Proxy**: Frontend apps automatically proxy `/api` to backend
4. **TypeScript**: All apps use strict TypeScript configuration
5. **Workspaces**: Use `npm run <script> --workspace=<app>` to run scripts in specific apps

## Troubleshooting

- **Port conflicts**: Change ports in `vite.config.ts` if needed
- **MCP errors**: Ensure MCP server is properly configured
- **Build errors**: Run `npm install` from root to ensure all dependencies are installed

