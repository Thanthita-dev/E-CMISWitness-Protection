import { defineConfig, devices } from '@playwright/test'

/**
 * คู่มือภาพหน้าจอ demo (ไฮไลต์จุดกดทีละขั้น) — รันด้วย `pnpm guide`
 * ภาพและข้อมูลอยู่ที่ e2e-video/output-guide/<เส้นทาง>/ แล้ว presentation/guide/build-guide.mjs สร้าง output-guide/index.html
 */
const PORT = Number(process.env.GUIDE_PORT || 5195)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-video/presentation/guide',
  testMatch: process.env.GUIDE_MATCH || 'guide.spec.ts',
  fullyParallel: true,
  workers: Number(process.env.GUIDE_WORKERS || 5),
  reporter: [['list']],
  timeout: 30 * 60_000,
  outputDir: './test-results/guide',
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `pnpm vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !!process.env.GUIDE_REUSE,
    timeout: 120_000,
  },
})
