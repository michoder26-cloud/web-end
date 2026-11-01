import { defineConfig, devices } from '@playwright/test'

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
import 'dotenv/config'

const baseURL = process.env.BASE_URL || 'http://localhost:3000'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* The tests share one database, so they run one at a time. */
  workers: 1,
  reporter: 'list',
  use: {
    baseURL,
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], channel: 'chromium' },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        env: { WEBEND_DB_DIR: '.gates-db/e2e-dev' },
        reuseExistingServer: false,
        timeout: 120000,
        url: baseURL,
      },
})
