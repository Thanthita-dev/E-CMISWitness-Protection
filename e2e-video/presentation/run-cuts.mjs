// ถ่ายและประกอบวิดีโอนำเสนอหลายฉบับต่อกัน — ค่าเริ่มต้นฉบับแยก case (เส้นทางหลัก + ทางแยกเส้นละคลิป)
//   node e2e-video/presentation/run-cuts.mjs                 # main fast-track appeal methods extension article14
//   node e2e-video/presentation/run-cuts.mjs full main       # เลือกเฉพาะฉบับ (full = คลิปรวม)
// ผลลัพธ์: e2e-video/output-presentation/presentation.mp4 (full) · presentation-<ฉบับ>.mp4 และหน้าเว็บ index.html รวมทุกคลิป
import { spawnSync } from 'node:child_process'

const CUTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['main', 'fast-track', 'appeal', 'methods', 'extension', 'article14']

const run = (cmd, args, env = {}) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} ล้มเหลว (${r.status})`)
}

const started = Date.now()
const mmss = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const summary = []

for (const [k, cut] of CUTS.entries()) {
  const base = cut === 'full' ? 'presentation' : `presentation-${cut}`
  const t0 = Date.now()
  console.log(`\n${'═'.repeat(70)}\n▶ ฉบับ ${k + 1}/${CUTS.length}: ${cut} → ${base}.mp4 · เริ่ม ${mmss(t0 - started)} จากต้นรอบ\n${'═'.repeat(70)}`)
  console.log(`\n[${k + 1}/${CUTS.length}] ขั้น 1/2 ถ่ายวิดีโอ`)
  run('pnpm', ['playwright', 'test', '-c', 'playwright.presentation.config.ts'], { PRESENT_CUT: cut })
  const shot = Date.now()
  console.log(`\n[${k + 1}/${CUTS.length}] ขั้น 2/2 ประกอบเสียง ซับ และหน้าเว็บ`)
  run('node', ['e2e-video/presentation/build-presentation.mjs', base])
  summary.push({ cut, base, shoot: shot - t0, build: Date.now() - shot })
  const left = CUTS.length - k - 1
  const avg = (Date.now() - started) / (k + 1)
  console.log(`\n✔ ${cut} เสร็จใน ${mmss(Date.now() - t0)} · เหลือ ${left} ฉบับ${left ? ` (~${mmss(avg * left)})` : ''}`)
}

console.log(`\n${'═'.repeat(70)}\nสรุป (รวม ${mmss(Date.now() - started)})`)
for (const s of summary) console.log(`  ${s.cut.padEnd(11)} ถ่าย ${mmss(s.shoot).padStart(6)} · ประกอบ ${mmss(s.build).padStart(6)} → ${s.base}.mp4`)
console.log('หน้าเว็บ: e2e-video/output-presentation/index.html')
