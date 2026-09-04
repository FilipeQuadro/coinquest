import { defineConfig, devices } from '@playwright/test'

const useManagedServer = process.env.PLAYWRIGHT_MANAGED_SERVER === '1'

export default defineConfig({
  testDir: './e2e',
  outputDir: 'test-results/e2e',
  timeout: 90_000,
  expect: {
    timeout: 8_000,
  },
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: useManagedServer
    ? undefined
    : {
        command: 'node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --strictPort',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: false,
        timeout: 30_000,
        env: {
          PLAYWRIGHT: '1',
        },
      },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
