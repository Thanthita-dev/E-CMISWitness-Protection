// ซิงก์บทบาท/หน่วยงาน/ผู้ใช้ใน src/mock-states/*.json ให้ตรงกับบัญชีทดลองปัจจุบัน (src/lib/loginAccounts.ts)
// รันซ้ำได้ — ควรรันหลังสร้าง mock state ใหม่ด้วยสคริปต์ generate-*.mjs หรือบันทึกจากหน้า /mock-state
// หมายเหตุ: บัญชีของแต่ละ state หาจากชุดบทบาทใน `ecmis-role-set` ของ state นั้น (ไม่มี = ชุดตั้งต้น; ชุดอื่นอาจ override mockStateAccounts) — state ที่แตะแล้วไม่ต้อง re-baseline src/data/mock-state-baseline-users.json (FROZEN)
//   node scripts/sync-mock-state-accounts.mjs          เขียนทับไฟล์ที่ไม่ตรง
//   node scripts/sync-mock-state-accounts.mjs --check  ตรวจอย่างเดียว (exit 1 ถ้ามีไฟล์ไม่ตรง)
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('..', import.meta.url))
const dir = new URL('../src/mock-states/', import.meta.url)
const checkOnly = process.argv.includes('--check')

const vite = await createServer({ root, configFile: false, logLevel: 'error', server: { middlewareMode: true }, appType: 'custom' })
try {
  const { syncMockStateAccounts } = await vite.ssrLoadModule('/src/lib/mockStateAccounts.ts')
  const changed = []
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
    const url = new URL(encodeURIComponent(file), dir)
    const raw = await readFile(url, 'utf8')
    const next = JSON.stringify(syncMockStateAccounts(JSON.parse(raw)), null, 2) + (raw.endsWith('\n') ? '\n' : '')
    if (next === raw) continue
    changed.push(file)
    if (!checkOnly) await writeFile(url, next)
  }
  console.log(`${checkOnly ? 'ไม่ตรง' : 'ปรับแล้ว'} ${changed.length} ไฟล์${changed.length ? `: ${changed.join(', ')}` : ''}`)
  if (checkOnly && changed.length) process.exitCode = 1
} finally {
  await vite.close()
}
