import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: /court-week\.visual\.spec\.ts/u,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:43131',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43131 --strictPort',
    url: 'http://127.0.0.1:43131',
    reuseExistingServer: false,
  },
})
