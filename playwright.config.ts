import { defineConfig, devices } from '@playwright/test'

const port = 5182
export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile.spec.ts',
  fullyParallel: true,
  workers: 2,
  use: {
    ...devices['Pixel 7'],
    channel: process.env.PW_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && npm run preview -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
  },
})
