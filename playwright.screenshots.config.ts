import { defineConfig, devices } from '@playwright/test'

/**
 * ชุดถ่ายภาพหน้าจอทีละขั้น (ไม่ใช่ชุดทดสอบหลัก) — รันด้วย
 *   pnpm playwright test -c playwright.screenshots.config.ts && node e2e-screenshots/build-report.mjs
 * ภาพและหน้ารวมภาพอยู่ที่ e2e-screenshots/output/
 */
const PORT = 5174
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-screenshots',
  fullyParallel: true,
  reporter: 'list',
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
  },
  // ภาพ 16:9 Full HD — ถ่ายเฉพาะส่วนที่อยู่บนจอ ไม่ใช่ทั้งหน้า
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 } },
  ],
  webServer: {
    command: `pnpm vite --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
