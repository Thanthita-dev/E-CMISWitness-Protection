import { defineConfig, devices } from '@playwright/test'

/**
 * ชุดถ่ายวิดีโอสอนใช้งาน (ไม่ใช่ชุดทดสอบหลัก) — รันด้วย `pnpm video`
 * วิดีโอดิบอยู่ที่ e2e-video/output/raw/ แล้ว build-videos.mjs แปลงเป็น MP4 พร้อมหน้ารวม e2e-video/output/index.html
 */
const PORT = 5174
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-video',
  testMatch: 'videos.spec.ts',
  fullyParallel: true,
  workers: process.env.VIDEO_WORKERS ? Number(process.env.VIDEO_WORKERS) : 3,
  reporter: 'list',
  timeout: 45 * 60_000,
  // แยกโฟลเดอร์ชั่วคราวต่อรอบได้ (VIDEO_OUT) — Playwright ล้าง outputDir ทุกครั้งที่เริ่ม จึงรันพร้อมกันหลายรอบได้
  outputDir: process.env.VIDEO_OUT || './test-results/video',
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    video: { mode: 'on', size: { width: 1920, height: 1080 } },
  },
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
