import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/conventions/**/*.test.ts', 'tests/gaps/**/*.test.ts', 'tests/ui-scenarios/**/*.test.ts'],
    testTimeout: 30000,
  },
})
