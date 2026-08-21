import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

describe('BP-PERF performance gates', () => {
  it('BP-PERF-03: route pages use React.lazy in App.tsx', () => {
    for (const app of ['customer', 'dealer', 'admin']) {
      const appTsx = fs.readFileSync(path.join(root, `apps/${app}/src/App.tsx`), 'utf8')
      expect(appTsx).toMatch(/React\.lazy|lazy\(/)
    }
  })

  it('BP-PERF-05: upload route enforces multer size limits', () => {
    const uploads = fs.readFileSync(path.join(root, 'apps/backend/src/routes/uploads.ts'), 'utf8')
    expect(uploads).toMatch(/limits:\s*\{\s*fileSize/)
  })
})
