import { defineConfig, devices } from '@playwright/test'

/**
 * ถ่ายวิดีโอดิบจากเทสต์ Journey (e2e/journeys) — เฉพาะเส้นหลักของแต่ละ journey (ไม่รวมทางแยก) รันด้วย `pnpm video:journeys`
 * ไม่แก้ไฟล์ journey: เปิด video + slowMo ให้ดูทัน แล้ว e2e-video/journey-reporter.ts เก็บวิดีโอและ chapter จาก test.step
 * ไว้ที่ e2e-video/output-journeys/raw/ จากนั้น build-videos.mjs แปลงเป็น MP4 พร้อมหน้ารวม e2e-video/output-journeys/index.html
 *
 *   VIDEO_SLOWMO=300 pnpm video:journeys          # หน่วงต่อคำสั่ง (ค่าเริ่มต้น 250 ms) — VIDEO_SHOW_MS ปรับเวลาค้างกรอบต่อการกด (1200 ms)
 *   pnpm playwright test -c playwright.journey-video.config.ts j06   # ถ่ายเฉพาะไฟล์ที่ตรงชื่อ
 */
const PORT = 5174
const BASE_URL = `http://127.0.0.1:${PORT}`
const SLOWMO = Number(process.env.VIDEO_SLOWMO ?? 250)
/** เวลาที่กรอบไฮไลต์ค้างอยู่ต่อการกดหนึ่งครั้ง (ms) */
const SHOW_MS = Number(process.env.VIDEO_SHOW_MS ?? 1200)

export default defineConfig({
  testDir: './e2e/journeys',
  // เส้นหลัก = เทสต์ที่ไม่มี "[ทางแยก]" ในชื่อ — J13 มีแต่ทางแยก จึงใช้ J13-A แทนเส้นหลัก
  grep: /^(?!.*\[ทางแยก\])|J13-A · /,
  fullyParallel: true,
  workers: process.env.VIDEO_WORKERS ? Number(process.env.VIDEO_WORKERS) : 3,
  reporter: [['list'], ['./e2e-video/journey-reporter.ts']],
  // เทสต์ journey ตั้ง test.setTimeout ของตัวเอง (180–300 วิ) ซึ่งทับค่านี้ — ถ้า slowMo สูงจนเกินเวลา ให้ลด VIDEO_SLOWMO
  timeout: 45 * 60_000,
  outputDir: process.env.VIDEO_OUT || './test-results/journey-video',
  use: {
    baseURL: BASE_URL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    video: {
      mode: 'on',
      size: { width: 1920, height: 1080 },
      // เคอร์เซอร์ที่เลื่อนจากจุดกดก่อนหน้าไปจุดถัดไป + กรอบไฮไลต์องค์ประกอบที่กด (ไม่มีข้อความซ้อน: fontSize 0)
      show: { actions: { cursor: 'pointer', duration: SHOW_MS, fontSize: 0 } },
    },
    launchOptions: { slowMo: SLOWMO },
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
