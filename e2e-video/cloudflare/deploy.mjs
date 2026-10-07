// ดีพลอยเว็บนำเสนอขึ้น Cloudflare Worker + R2 ด้วยคำสั่งเดียว
//   pnpm deploy:presentation                  # อัปโหลดวิดีโอที่เปลี่ยน แล้ว deploy เว็บ
//   node e2e-video/cloudflare/deploy.mjs --dry-run       # แสดงแผนเฉย ๆ ไม่อัปโหลด ไม่เขียนไฟล์
//   node e2e-video/cloudflare/deploy.mjs --force         # อัปโหลดใหม่ทุกไฟล์ (ไม่สน manifest)
//   node e2e-video/cloudflare/deploy.mjs --skip-videos   # deploy เฉพาะหน้าเว็บ
// ต้องการ: wrangler (บน PATH หรือผ่าน npx) และ `wrangler login` แล้ว · ใช้ e2e-video/cloudflare/wrangler.jsonc
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'output-presentation')
const PUBLIC = join(HERE, 'public')
const MANIFEST = join(HERE, '.upload-manifest.json')
const BUCKET = 'ecmis-witness-presentation-videos'
const PAGE_EXTS = new Set(['.html', '.vtt', '.srt', '.txt', '.json'])
const MAX_PUT = 300 * 1024 * 1024 // ขีดจำกัด wrangler r2 object put

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const FORCE = args.has('--force')
const SKIP_VIDEOS = args.has('--skip-videos')
const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`
const fail = (msg) => { console.error(`\n✖ ${msg}`); process.exit(1) }

const exists = (p) => stat(p).then(() => true, () => false)

// รัน wrangler: คืน {code, out} โดยสะท้อน output ลงจอด้วยถ้า inherit=true (ไม่เก็บ out)
const hasWrangler = await new Promise((res) => {
  const p = spawn('wrangler', ['--version'], { stdio: 'ignore' })
  p.on('error', () => res(false))
  p.on('exit', (c) => res(c === 0))
})
const WR = hasWrangler ? ['wrangler'] : ['npx', '--yes', 'wrangler']

const wrangler = (wargs, { inherit = false } = {}) => new Promise((res) => {
  const p = spawn(WR[0], [...WR.slice(1), ...wargs], { cwd: HERE, stdio: inherit ? ['inherit', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'] })
  let out = ''
  const tee = (stream, sink) => (d) => { out += d; if (inherit) sink.write(d) }
  p.stdout.on('data', tee(p.stdout, process.stdout))
  p.stderr.on('data', tee(p.stderr, process.stderr))
  p.on('error', (e) => res({ code: 1, out: String(e) }))
  p.on('exit', (code) => res({ code: code ?? 1, out }))
})

const sha256 = (file) => new Promise((res, rej) => {
  const h = createHash('sha256')
  createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej)
})

// 1) ตรวจ wrangler + login
console.log(`▶ wrangler: ${WR.join(' ')}${DRY ? ' · โหมด --dry-run' : ''}`)
if (!DRY) {
  const who = await wrangler(['whoami'])
  if (who.code !== 0 || /not authenticated|not logged in/i.test(who.out)) {
    fail('ยังไม่ได้ล็อกอิน Cloudflare — รัน `wrangler login` ก่อน แล้วสั่ง deploy ใหม่')
  }
  console.log('✔ ล็อกอิน Cloudflare แล้ว')
} else {
  console.log('• ข้ามการตรวจ login (dry-run)')
}

// 2) ตรวจต้นทาง
const indexPath = join(SRC, 'index.html')
if (!(await exists(indexPath))) fail(`ไม่พบ ${indexPath} — สร้างด้วย pnpm video:presentation:page ก่อน`)
const entries = (await readdir(SRC, { withFileTypes: true })).filter((e) => e.isFile())
const names = entries.map((e) => e.name)
const mp4s = names.filter((n) => extname(n) === '.mp4').sort()
const pageFiles = names.filter((n) => PAGE_EXTS.has(extname(n).toLowerCase())).sort()
const html = await readFile(indexPath, 'utf8')
for (const ref of new Set(html.match(/[\w.-]+\.mp4/g) ?? [])) {
  if (!mp4s.includes(ref)) console.warn(`⚠ index.html อ้างถึง ${ref} แต่ไม่มีไฟล์ในเครื่อง (ลิงก์นี้จะเล่นไม่ได้)`)
}

// 3) วิดีโอ → R2
let manifest = {}
try { manifest = JSON.parse(await readFile(MANIFEST, 'utf8')) } catch { /* ยังไม่เคยอัปโหลด */ }

if (SKIP_VIDEOS) {
  console.log('• ข้ามวิดีโอ (--skip-videos)')
} else {
  for (const f of mp4s) {
    const size = (await stat(join(SRC, f))).size
    if (size > MAX_PUT) fail(`${f} ขนาด ${mb(size)} เกิน 300 MiB ที่ wrangler r2 object put รับได้ — ย่อไฟล์ หรืออัปโหลดด้วย rclone/S3 API แทน`)
  }
  if (!DRY) {
    const b = await wrangler(['r2', 'bucket', 'create', BUCKET])
    if (b.code !== 0 && !/already exists/i.test(b.out)) fail(`สร้าง bucket ${BUCKET} ไม่สำเร็จ\n${b.out}`)
    console.log(`✔ bucket ${BUCKET} พร้อมใช้`)
  } else {
    console.log(`• [dry-run] จะสร้าง bucket ${BUCKET} (ถ้ายังไม่มี)`)
  }

  let n = 0
  for (const f of mp4s) {
    n++
    const file = join(SRC, f)
    const { size } = await stat(file)
    const hash = await sha256(file)
    const tag = `[${n}/${mp4s.length}] ${f} (${mb(size)})`
    if (!FORCE && manifest[f]?.sha256 === hash && manifest[f]?.size === size) {
      console.log(`${tag} · ไม่เปลี่ยน ข้าม`)
      continue
    }
    if (DRY) { console.log(`${tag} · [dry-run] จะอัปโหลดไป ${BUCKET}/${f}`); continue }
    console.log(`${tag} · กำลังอัปโหลด…`)
    const r = await wrangler(['r2', 'object', 'put', `${BUCKET}/${f}`, '--file', file, '--content-type', 'video/mp4', '--cache-control', 'public, max-age=86400', '--remote'], { inherit: true })
    if (r.code !== 0) fail(`อัปโหลด ${f} ไม่สำเร็จ`)
    manifest[f] = { size, sha256: hash, uploadedAt: new Date().toISOString() }
    await writeFile(MANIFEST, JSON.stringify(manifest, null, 2) + '\n')
    console.log(`✔ ${f} อัปโหลดแล้ว`)
  }
}

// 4) จัด public/ (ไม่รวม mp4 — assets จำกัด 25 MiB ต่อไฟล์)
if (DRY) {
  console.log(`• [dry-run] จะล้างและสร้าง ${PUBLIC} ด้วย ${pageFiles.length} ไฟล์: ${pageFiles.join(', ')}`)
  console.log('• [dry-run] จะรัน wrangler deploy · ไม่ได้อัปโหลดหรือเขียนไฟล์ใด ๆ')
  process.exit(0)
}
await rm(PUBLIC, { recursive: true, force: true })
await mkdir(PUBLIC, { recursive: true })
for (const f of pageFiles) await copyFile(join(SRC, f), join(PUBLIC, f))
console.log(`✔ จัด public/ แล้ว ${pageFiles.length} ไฟล์`)

// 5) deploy
console.log('\n▶ wrangler deploy')
const d = await wrangler(['deploy'], { inherit: true })
if (d.code !== 0) fail('wrangler deploy ล้มเหลว')
const url = d.out.match(/https:\/\/[\w.-]+\.workers\.dev\S*/)?.[0]
console.log(url ? `\n✔ เสร็จสิ้น · เปิดดูที่ ${url}` : '\n✔ deploy เสร็จสิ้น')
