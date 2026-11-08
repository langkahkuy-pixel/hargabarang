import { defineConfig, devices } from '@playwright/test'

const live = process.env.PW_REAL_DB === '1'
if (live && (!/^asisten_harga_test_ui(?:_[a-z0-9]+)?$/.test(process.env.MARIADB_DATABASE ?? '')
  || !['127.0.0.1', 'localhost', '::1'].includes(process.env.MARIADB_HOST ?? ''))) {
  throw new Error('Tes browser dengan MariaDB memerlukan database lokal asisten_harga_test_ui.')
}

const port = 5182
export default defineConfig({
  testDir: './tests',
  testMatch: 'mobile.spec.ts',
  fullyParallel: !live,
  workers: live ? 1 : 2,
  use: {
    ...devices['Pixel 7'],
    channel: process.env.PW_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: live
      ? `npm run build && npm run preview -- --port ${port} --strictPort`
      : `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
  },
})
