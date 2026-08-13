import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

interface ApiCall {
  method: string
  path: string
}

/** Extract `apiRequest('/path', { method: 'POST' })` calls from a service file. */
function extractApiCalls(serviceFile: string): ApiCall[] {
  const src = fs.readFileSync(serviceFile, 'utf8')
  const calls: ApiCall[] = []
  const tplPattern =
    /apiRequest(?:<[^>]*>)?\(\s*`([^`]+)`(?:\s*,\s*\{[^}]*method:\s*['"`](\w+)['"`])?/g
  let match: RegExpExecArray | null
  while ((match = tplPattern.exec(src)) !== null) {
    calls.push({ path: match[1], method: (match[2] ?? 'GET').toUpperCase() })
  }
  const staticPattern =
    /apiRequest(?:<[^>]*>)?\(\s*['"]([^'"]+)['"](?:\s*,\s*\{[^}]*method:\s*['"`](\w+)['"`])?/g
  while ((match = staticPattern.exec(src)) !== null) {
    calls.push({ path: match[1], method: (match[2] ?? 'GET').toUpperCase() })
  }
  return calls
}

/** Extract MSW handler routes from a handlers.ts file. */
function extractHandlerRoutes(handlersFile: string): ApiCall[] {
  const src = fs.readFileSync(handlersFile, 'utf8')
  const routes: ApiCall[] = []
  const pattern = /http\.(get|post|put|patch|delete)\(\s*['"`]\/api([^'"`]+)['"`]/gi
  let match: RegExpExecArray | null
  while ((match = pattern.exec(src)) !== null) {
    routes.push({ method: match[1].toUpperCase(), path: match[2] })
  }
  return routes
}

/** Normalize `:param` segments so `/vehicles/:id` matches `/vehicles/abc`. */
function normalizePath(p: string): string {
  return p.replace(/\/:[^/]+/g, '/:param').replace(/\$\{[^}]+\}/g, ':param')
}

function handlerMatches(call: ApiCall, handler: ApiCall): boolean {
  return (
    call.method === handler.method && normalizePath(call.path) === normalizePath(handler.path)
  )
}

const apps = [
  { name: 'customer', servicesDir: 'apps/customer/src/services', handlers: 'apps/customer/src/mocks/handlers.ts' },
  { name: 'dealer', servicesDir: 'apps/dealer/src/services', handlers: 'apps/dealer/src/mocks/handlers.ts' },
  { name: 'admin', servicesDir: 'apps/admin/src/services', handlers: 'apps/admin/src/mocks/handlers.ts' },
] as const

describe('MSW alignment convention', () => {
  for (const app of apps) {
    it(`${app.name}: every apiRequest path in *Service.ts has a matching MSW handler`, () => {
      const servicesDir = path.join(root, app.servicesDir)
      const handlersFile = path.join(root, app.handlers)
      const serviceFiles = fs
        .readdirSync(servicesDir)
        .filter((f) => f.endsWith('Service.ts'))
        .map((f) => path.join(servicesDir, f))

      const apiCalls = serviceFiles.flatMap(extractApiCalls)
      const handlerRoutes = extractHandlerRoutes(handlersFile)

      const missing = apiCalls.filter(
        (call) => !handlerRoutes.some((handler) => handlerMatches(call, handler))
      )

      expect(
        missing,
        `Missing MSW handlers in ${app.name}:\n${missing.map((m) => `  ${m.method} ${m.path}`).join('\n')}`
      ).toEqual([])
    })
  }

  it('all three apps warn on unhandled MSW requests in dev', () => {
    for (const app of ['customer', 'dealer', 'admin'] as const) {
      const main = fs.readFileSync(path.join(root, `apps/${app}/src/main.tsx`), 'utf8')
      expect(main).toMatch(/onUnhandledRequest:\s*['"]warn['"]/)
    }
  })
})
