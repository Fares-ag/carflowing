import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    globalSetup: ['./src/test/global-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    // Embedded Postgres is a single instance shared by the whole run, and
    // resetDb() truncates every table between tests, so route test files
    // must not execute concurrently against it.
    fileParallelism: false,
    include: ['src/**/*.test.ts'],
  },
})
