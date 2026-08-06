import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/browser',
  testMatch: /court-week\.network\.spec\.ts/u,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  retries: process.env.CI ? 1 : 0,
  preserveOutput: 'always',
  // The standard matrix owns playwright-report/. The HAR remains in the
  // uploaded test-results/ tree, so this follow-on run must not erase it.
  reporter: 'line',
  use: {
    ...devices['Desktop Chrome'],
    // Vite preview serves the built files but does not implement Cloudflare's
    // `_redirects` proxy. Exercise the internal shell that `/` maps to in
    // production instead of accidentally testing the marketing fallback.
    baseURL: 'http://127.0.0.1:43130/jury/court-week.html',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [{ name: 'production-static-chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run preview -- --outDir ../public --host 127.0.0.1 --port 43130 --strictPort',
    url: 'http://127.0.0.1:43130/jury/court-week.html',
    reuseExistingServer: false,
  },
})
