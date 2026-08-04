import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  use: {
    baseURL: 'http://127.0.0.1:43127',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: /court-week\.devices\.spec\.ts/u, use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', testIgnore: /court-week\.devices\.spec\.ts/u, use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', testIgnore: /court-week\.devices\.spec\.ts/u, use: { ...devices['Desktop Safari'] } },
    { name: 'iphone-safari', testMatch: /court-week\.devices\.spec\.ts/u, use: { ...devices['iPhone 15'] } },
    { name: 'android-phone', testMatch: /court-week\.devices\.spec\.ts/u, use: { ...devices['Pixel 7a'] } },
    { name: 'ipad-safari', testMatch: /court-week\.devices\.spec\.ts/u, use: { ...devices['iPad (gen 11)'] } },
    { name: 'android-tablet', testMatch: /court-week\.devices\.spec\.ts/u, use: { ...devices['Galaxy Tab S9'] } },
  ],
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 43127 --strictPort',
    url: 'http://127.0.0.1:43127',
    reuseExistingServer: !process.env.CI,
  },
})
