import { cpus } from 'node:os'
import { defineConfig, devices } from '@playwright/test'

/**
 * วิดีโอนำเสนอ Journey 02–11 คลิปเดียว (เสียงพากย์ + ซับไตเติล + ป้ายขั้นตอน) — รันด้วย `pnpm video:presentation`
 * วิดีโอดิบและ cue เสียงอยู่ที่ e2e-video/output-presentation/raw/ แล้ว build-presentation.mjs ประกอบเสียงเป็น MP4
 * ต้องมี edge-tts (`pip install edge-tts` หรือ EDGE_TTS=/path/to/edge-tts) และ ffmpeg ใน PATH
 *
 * ถ่ายแบ่งเป็นหลายส่วนพร้อมกัน (e2e-video/presentation/plan.ts) — PRESENT_WORKERS=1 ถ่ายคลิปเดียวต่อเนื่องแบบเดิม
 * PRESENT_CUT=full|main|fast-track|appeal|methods|extension|article14 เลือกฉบับรวม/แยก case (run-cuts.mjs ถ่ายต่อกันทุกฉบับ)
 */
// ค่าเริ่มต้น ครึ่งหนึ่งของจำนวนแกน ไม่เกิน 4 (ถ่าย 1080p หลายตัวพร้อมกันกิน CPU) — ตั้งใน env ให้ worker ทุกตัวแบ่งส่วนตรงกัน
process.env.PRESENT_WORKERS ||= String(Math.max(1, Math.min(4, Math.floor(cpus().length / 2))))
const WORKERS = Number(process.env.PRESENT_WORKERS)
// ฉบับกระชับ (ค่าเริ่มต้น) เร่งจังหวะการกด/ค้างจอ — ฉบับเต็ม PRESENT_FULL=1 ใช้จังหวะเดิม
process.env.VIDEO_PACE ||= process.env.PRESENT_FULL === '1' ? '1' : '0.6'
// พอร์ตแยกจากชุดวิดีโออื่น (5174)
const PORT = Number(process.env.PRESENT_PORT || 5193)
const BASE_URL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './e2e-video/presentation',
  testMatch: 'presentation.spec.ts',
  globalSetup: './e2e-video/presentation/global-setup.ts',
  fullyParallel: true,
  workers: WORKERS,
  // ความคืบหน้าอย่างละเอียด (ทุกฉาก/การกด + เปอร์เซ็นต์และเวลาที่เหลือ) — PRESENT_PROGRESS=scenes แสดงเฉพาะระดับฉาก
  reporter: [['./e2e-video/presentation/progress-reporter.ts']],
  timeout: 150 * 60_000,
  outputDir: process.env.VIDEO_OUT || './test-results/presentation',
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
    // ไม่ใช้ server ที่เปิดค้างอยู่ — พอร์ตเดียวกันอาจเป็น dev server ของ worktree อื่น
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
