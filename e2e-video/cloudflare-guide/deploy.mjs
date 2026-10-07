// ดีพลอยคู่มือภาพหน้าจอ demo ขึ้น Cloudflare Worker (static assets) ด้วยคำสั่งเดียว
//   pnpm deploy:guide                                      # คัดลอก output-guide แล้ว deploy
//   node e2e-video/cloudflare-guide/deploy.mjs --dry-run   # แสดงแผนเฉย ๆ ไม่ deploy
// ต้องการ: wrangler (บน PATH หรือผ่าน npx) และ `wrangler login` แล้ว · ใช้ e2e-video/cloudflare-guide/wrangler.jsonc
import { spawn } from 'node:child_process'
import { cp, readdir, rm, stat } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'output-guide')
const PUBLIC = join(HERE, 'public')
const MAX_ASSET = 25 * 1024 * 1024 // ขีดจำกัด static assets ต่อไฟล์

const DRY = process.argv.includes('--dry-run')
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1) }
const exists = (p) => stat(p).then(() => true, () => false)

const hasWrangler = await new Promise((res) => {
  const p = spawn('wrangler', ['--version'], { stdio: 'ignore' })
  p.on('error', () => res(false))
  p.on('exit', (c) => res(c === 0))
})
const WR = hasWrangler ? ['wrangler'] : ['npx', '--yes', 'wrangler']

const wrangler = (wargs, { inherit = false } = {}) => new Promise((res) => {
  const p = spawn(WR[0], [...WR.slice(1), ...wargs], { cwd: HERE, stdio: ['inherit', 'pipe', 'pipe'] })
  let out = ''
  p.stdout.on('data', (d) => { out += d; if (inherit) process.stdout.write(d) })
  p.stderr.on('data', (d) => { out += d; if (inherit) process.stderr.write(d) })
  p.on('error', (e) => res({ code: 1, out: String(e) }))
  p.on('exit', (code) => res({ code: code ?? 1, out }))
})

async function walk(dir) {
  const out = []
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else if (e.isFile()) out.push(p)
  }
  return out
}

// 1) ตรวจต้นทาง
if (!(await exists(join(SRC, 'index.html')))) fail(`ไม่พบ ${join(SRC, 'index.html')} — สร้างด้วย pnpm guide (หรือ pnpm guide:build) ก่อน`)
const flowIds = []
for (const e of await readdir(SRC, { withFileTypes: true })) {
  if (e.isDirectory() && !e.name.startsWith('_') && (await exists(join(SRC, e.name, 'guide.json')))) flowIds.push(e.name)
}
flowIds.sort()
if (!flowIds.length) console.warn('⚠ ไม่พบโฟลเดอร์เส้นทางที่มี guide.json — หน้าเว็บจะไม่มีแท็บ')
else console.log(`▶ พบ ${flowIds.length} เส้นทาง: ${flowIds.join(', ')}`)
const files = (await walk(SRC)).filter((f) => !relative(SRC, f).startsWith('_') && !f.endsWith('.DS_Store'))
let total = 0
for (const f of files) {
  const { size } = await stat(f)
  total += size
  if (size > MAX_ASSET) fail(`${relative(SRC, f)} ขนาด ${mb(size)} เกิน 25 MiB ต่อไฟล์ของ static assets`)
}
console.log(`▶ ต้นทาง ${relative(process.cwd(), SRC)} · ${files.length} ไฟล์ · ${mb(total)}`)

if (DRY) {
  console.log(`• [dry-run] จะล้างและคัดลอกลง ${PUBLIC} แล้วรัน wrangler deploy (${WR.join(' ')}) · ไม่ได้เขียนไฟล์ใด ๆ`)
  process.exit(0)
}

// 2) ตรวจ login
const who = await wrangler(['whoami'])
if (who.code !== 0 || /not authenticated|not logged in/i.test(who.out)) fail('ยังไม่ได้ล็อกอิน Cloudflare — รัน `wrangler login` ก่อน แล้วสั่ง deploy ใหม่')
console.log('✔ ล็อกอิน Cloudflare แล้ว')

// 3) จัด public/
await rm(PUBLIC, { recursive: true, force: true })
await cp(SRC, PUBLIC, { recursive: true, filter: (src) => !relative(SRC, src).startsWith('_') && !src.endsWith('.DS_Store') })
console.log('✔ จัด public/ แล้ว')

// 4) deploy
console.log('\n▶ wrangler deploy')
const d = await wrangler(['deploy'], { inherit: true })
if (d.code !== 0) fail('wrangler deploy ล้มเหลว')
const url = d.out.match(/https:\/\/[\w.-]+\.workers\.dev\S*/)?.[0]
console.log(url ? `\n✔ เสร็จสิ้น · เปิดดูที่ ${url}` : '\n✔ deploy เสร็จสิ้น')
