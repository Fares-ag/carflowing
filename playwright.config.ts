import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

/**
 * Root Playwright config. `webServer` boots a self-seeding backend
 * (apps/backend/scripts/e2e-server.ts) plus the three Vite dev servers;
 * `e2e/global-setup.ts` waits until all four are actually responsive
 * before any spec runs.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  globalSetup: './e2e/global-setup.ts',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'customer',
      testDir: './e2e/customer',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'dealer',
      testDir: './e2e/dealer',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5175' },
    },
    {
      name: 'admin',
      testDir: './e2e/admin',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5174' },
    },
    {
      name: 'cross-app',
      testDir: './e2e/cross-app',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'a11y',
      testDir: './e2e/a11y',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:5173' },
    },
    {
      name: 'mobile',
      testDir: './e2e/mobile',
      use: { ...devices['iPhone 13'], baseURL: 'http://localhost:5173' },
    },
  ],
  webServer: [
    {
      command: 'npm run e2e:server --workspace=apps/backend',
      url: 'http://localhost:3001/health',
      timeout: 120_000,
      reuseExistingServer: !CI,
    },
    {
      command: 'npm run dev --workspace=apps/customer',
      url: 'http://localhost:5173',
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
    {
      command: 'npm run dev --workspace=apps/dealer',
      url: 'http://localhost:5175',
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
    {
      command: 'npm run dev --workspace=apps/admin',
      url: 'http://localhost:5174',
      timeout: 60_000,
      reuseExistingServer: !CI,
    },
  ],
})
