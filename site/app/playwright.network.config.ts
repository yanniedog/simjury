import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: /court-week\.network\.spec\.ts/u,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:43130/jury/',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'production-static-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview -- --outDir ../public --host 127.0.0.1 --port 43130 --strictPort',
    url: 'http://127.0.0.1:43130/jury/',
    reuseExistingServer: false,
  },
})
