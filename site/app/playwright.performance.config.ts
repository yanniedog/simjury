import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/performance',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  reporter: process.env.CI ? [['line'], ['html', { open: 'never', outputFolder: 'playwright-performance-report' }]] : 'line',
  use: {
    ...devices['Pixel 7a'],
    baseURL: 'http://127.0.0.1:43129',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'mid-range-android-4g', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview -- --outDir ../public --host 127.0.0.1 --port 43129 --strictPort',
    url: 'http://127.0.0.1:43129/jury/',
    reuseExistingServer: false,
  },
})
