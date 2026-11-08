import { defineConfig, devices } from '@playwright/test'

const live = Boolean(process.env.PW_SUPABASE_SERVICE_KEY)
const port = 5182
const mobile = {
  ...devices['Pixel 7'],
  channel: process.env.PW_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
}

export default defineConfig({
  testDir: './tests',
  testMatch: live ? 'supabase.spec.ts' : 'mobile.spec.ts',
  fullyParallel: true,
  workers: 2,
  use: { ...mobile, baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure' },
  webServer: {
    command: live
      ? `npm run build && npm run preview -- --port ${port} --strictPort`
      : `npm run dev -- --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    timeout: 120_000,
    env: {
      VITE_SUPABASE_URL: live ? process.env.PW_SUPABASE_URL ?? '' : '',
      VITE_SUPABASE_ANON_KEY: live ? process.env.PW_SUPABASE_PUBLIC_KEY ?? '' : '',
      PW_SUPABASE_SERVICE_KEY: '',
    },
  },
})
