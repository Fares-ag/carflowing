# CarFlow Monorepo

A monorepo containing the CarFlow platform with three main applications: **Admin**, **Customer**, and **Dealer**, plus a shared backend API server.

## Project Structure

```
carflow-monorepo/
├── apps/
│   ├── admin/          # Admin dashboard application
│   ├── customer/       # Customer-facing application
│   ├── dealer/         # Dealer portal application
│   └── backend/        # Backend API server (MCP integration)
├── packages/
│   └── shared/         # Shared types and utilities
├── package.json        # Root workspace configuration
└── README.md
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn/pnpm
- Figma MCP server configured (for design integration)

### Installation

1. Install all dependencies:
```bash
npm install
```

This will install dependencies for all workspaces.

### Development

#### Run all apps (recommended for development):
```bash
npm run dev
```

#### Run individual apps:

**Backend API Server** (required for Figma integration):
```bash
npm run dev:backend
# Runs on http://localhost:3001
```

**Customer App**:
```bash
npm run dev:customer
# Runs on http://localhost:5173
```

**Admin App**:
```bash
npm run dev:admin
# Runs on http://localhost:5174
```

**Dealer App**:
```bash
npm run dev:dealer
# Runs on http://localhost:5175
```

### Building

Build all apps:
```bash
npm run build
```

Build individual apps:
```bash
npm run build:backend
npm run build:customer
npm run build:admin
npm run build:dealer
```

## Figma Integration

The project uses **MCP (Model Context Protocol)** for Figma design integration. The backend API server handles all Figma MCP calls.

### Setup

1. **Configure MCP Server**: Ensure your Figma MCP server is properly configured in your MCP settings.

2. **Backend API**: The backend server (`apps/backend`) provides REST endpoints that use MCP tools:
   - `GET /api/figma/design?url={figmaUrl}` - Fetch design context
   - `GET /api/figma/metadata?url={figmaUrl}` - Fetch metadata
   - `GET /api/figma/screenshot?url={figmaUrl}` - Get screenshot

3. **Frontend Integration**: All frontend apps are configured to proxy `/api` requests to the backend server.

### Using Figma Integration

1. Start the backend server: `npm run dev:backend`
2. Start the customer app: `npm run dev:customer`
3. Enter a Figma URL in the customer app's Figma integration UI
4. The app will fetch designs through the backend API using MCP

### Example Figma URLs

- Design URL: `https://www.figma.com/design/ABC123xyz/MyDesign?node-id=123-456`
- File URL: `https://www.figma.com/file/ABC123xyz/MyDesign`

## Supabase Backend

The platform uses **Supabase** for auth, database, storage, and realtime.

### Setup

1. Create a Supabase project at [supabase.com](https://supabase.com).

2. Copy `.env.example` to `.env` in the project root and set:
   - `VITE_SUPABASE_URL` - Your Supabase project URL
   - `VITE_SUPABASE_ANON_KEY` - Your Supabase anon (public) key
   - `VITE_USE_MOCK_API` - Set to `false` to use Supabase (default). Set to `true` to use MSW mocks for local dev without Supabase.

3. Run the schema and RLS migrations in the Supabase SQL editor:
   - `supabase/schema.sql` - Tables, enums, storage buckets
   - `supabase/rls.sql` - Row Level Security policies
   - `supabase/seed.sql` - Optional seed data (after creating auth users)

4. Create auth users (admin, dealer, customer) in Supabase Auth, then run seed.sql to link profiles.

### Edge Functions

Supabase Edge Functions are in `supabase/functions/`:
- `payments-webhook` - Payment gateway webhook handler
- `send-email` - Email sending (Resend/SendGrid integration)
- `analytics-rollup` - Analytics aggregation

Deploy with: `supabase functions deploy <function-name>`

## Workspace Scripts

### Root Level

- `npm run dev` - Start all apps in development mode
- `npm run build` - Build all apps
- `npm run lint` - Lint all workspaces
- `npm run clean` - Clean all node_modules and build artifacts

### Individual Workspaces

Each app has its own scripts defined in its `package.json`:
- `dev` - Development server
- `build` - Production build
- `preview` - Preview production build
- `lint` - Run linter

## Technologies

### Frontend Apps
- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server

### Backend
- **Express** - Web framework
- **TypeScript** - Type safety
- **MCP** - Model Context Protocol for Figma integration

### Monorepo
- **npm workspaces** - Package management

## Development Workflow

1. **Start the backend first**: `npm run dev:backend`
2. **Start the frontend apps** you need: `npm run dev:customer`, `npm run dev:admin`, etc.
3. **Make changes** in any workspace - hot reloading is enabled
4. **Shared code**: Use `@carflow/shared` package for common types and utilities

## Next Steps

1. ✅ Monorepo structure created
2. ✅ Backend API server with MCP integration setup
3. ✅ Customer app with Figma integration
4. ✅ Admin and Dealer apps scaffolded
5. ⏳ Implement MCP client in backend (connect to your MCP server)
6. ⏳ Build out admin dashboard features
7. ⏳ Build out dealer portal features
8. ⏳ Add shared components and utilities
9. ⏳ Set up authentication and routing

## Notes

- The backend MCP integration (`apps/backend/src/services/figmaMCP.ts`) currently has placeholder implementations. You'll need to integrate with your actual MCP client library.
- All frontend apps proxy API requests to the backend server automatically.
- The customer app contains the Figma design integration UI from the original project.
