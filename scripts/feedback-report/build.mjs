// รายงานผลการปรับปรุงตามข้อเสนอแนะ (ฉบับส่งลูกค้า) — รันเทสต์ Playwright ของประเด็นที่แก้แล้ว เก็บภาพหลักฐาน
// แล้วรวมเป็นไฟล์ HTML ไฟล์เดียว (ฝังภาพในไฟล์ ส่งต่อได้ทันที)
//   pnpm report:feedback                 รันเทสต์ใหม่แล้วสร้างรายงาน
//   pnpm report:feedback --skip-tests    สร้างรายงานจากผลและภาพของรอบล่าสุด
//   pnpm report:feedback --items <json>  ใช้รายการประเด็นชุดอื่น (ค่าตั้งต้น items-15oct.json)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')
const evidenceDir = resolve(root, 'e2e-evidence')
const args = process.argv.slice(2)
const argValue = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined)

const itemsPath = resolve(here, argValue('--items') ?? 'items-15oct.json')
const config = JSON.parse(readFileSync(itemsPath, 'utf-8'))
const ids = config.items.map((i) => i.id)
const resultsPath = resolve(evidenceDir, `results-${ids[0]}-${ids.at(-1)}.json`)

if (!args.includes('--skip-tests')) {
  // ล้างภาพของรอบก่อน ไม่ให้ภาพเก่าค้างในรายงานเมื่อเทสต์ไม่ผ่านก่อนถึงจุดถ่ายภาพ
  mkdirSync(evidenceDir, { recursive: true })
  for (const f of readdirSync(evidenceDir)) {
    if (ids.some((id) => f.startsWith(`${id}-`))) rmSync(resolve(evidenceDir, f))
  }
  console.log(`รันเทสต์ ${config.specs.length} ไฟล์ (EVIDENCE=1)…`)
  const run = spawnSync('pnpm', ['exec', 'playwright', 'test', ...config.specs, '--reporter=list,json'], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, EVIDENCE: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: resultsPath },
  })
  // เทสต์ไม่ผ่านก็ยังสร้างรายงาน — รายงานแสดงผลตามจริง
  if (run.status !== 0) console.warn(`playwright จบด้วยสถานะ ${run.status} — ดูรายการที่ไม่ผ่านด้านบน`)
}

if (!existsSync(resultsPath)) {
  console.error(`ไม่พบผลเทสต์ ${resultsPath} — รันโดยไม่ใส่ --skip-tests ก่อน`)
  process.exit(1)
}

/** แบนผล JSON reporter เป็นรายการ { title, ok } ต่อเทสต์ */
function flattenResults(json) {
  const out = []
  const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.at(-1)
        out.push({ title: spec.title, ok: t.status === 'expected' || last?.status === 'passed' })
      }
    }
    for (const s of suite.suites ?? []) walk(s)
  }
  for (const s of json.suites ?? []) walk(s)
  return out
}

const results = JSON.parse(readFileSync(resultsPath, 'utf-8'))
const tests = flattenResults(results)
const ranAt = new Date(results.stats?.startTime ?? Date.now())

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const thaiDate = (d, withTime) =>
  d.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', ...(withTime ? { timeStyle: 'short' } : {}) })

function loadShot(id) {
  const png = resolve(evidenceDir, `${id}.png`)
  if (!existsSync(png)) return null
  const metaPath = resolve(evidenceDir, `${id}.json`)
  const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf-8')) : {}
  const buf = readFileSync(png)
  // ขนาดจริงจาก IHDR ของ PNG — ใส่ width/height ให้เบราว์เซอร์จองพื้นที่ภาพก่อนถอดรหัส
  return { id, label: meta.label ?? '', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), src: `data:image/png;base64,${buf.toString('base64')}` }
}

const items = config.items.map((item) => {
  const re = new RegExp(`\\b${item.id}\\b`)
  const mine = tests.filter((t) => re.test(t.title))
  const passed = mine.filter((t) => t.ok).length
  const shots = item.evidence.map((id) => loadShot(id) ?? { id, missing: true })
  const verdict = mine.length === 0 ? 'none' : passed === mine.length ? 'pass' : 'fail'
  return { ...item, total: mine.length, passed, verdict, shots }
})

const passCount = items.filter((i) => i.verdict === 'pass').length
const checkCount = items.reduce((n, i) => n + i.total, 0)
const checkPassed = items.reduce((n, i) => n + i.passed, 0)

const VERDICT = {
  pass: { cls: 'success', icon: '✓', text: 'ตรวจผ่าน' },
  fail: { cls: 'danger', icon: '!', text: 'อยู่ระหว่างตรวจสอบ' },
  none: { cls: '', icon: '–', text: 'ยังไม่มีผลตรวจ' },
}

function renderItem(item) {
  const v = VERDICT[item.verdict]
  const shots = item.shots
    .map((s, i) =>
      s.missing
        ? `<figure class="shot missing"><div class="ph">ไม่มีภาพในรอบนี้</div><figcaption>ภาพที่ ${i + 1}</figcaption></figure>`
        : `<figure class="shot"><button type="button" class="zoom" data-src="${s.id}" aria-label="ขยายภาพ: ${esc(s.label)}"><img src="${s.src}" alt="${esc(s.label)}" width="${s.width}" height="${s.height}"></button><figcaption><span class="n">ภาพที่ ${i + 1}</span> ${esc(s.label)}</figcaption></figure>`
    )
    .join('')
  return `
  <article class="item" id="${item.id}">
    <header class="item-head">
      <div class="item-ref">
        <span class="ref">${item.id}</span>
        <span class="cat">${esc(item.category)}${item.forms ? ` · ${esc(item.forms)}` : ''}</span>
      </div>
      <span class="status ${v.cls}"><span aria-hidden="true">${v.icon}</span> ${v.text}${item.total ? ` <span class="count">${item.passed}/${item.total} รายการตรวจ</span>` : ''}</span>
    </header>
    <h2>${esc(item.request)}</h2>
    <div class="cols">
      <section class="block">
        <h3>สิ่งที่ปรับในระบบ</h3>
        <ul>${item.change.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      </section>
    </div>
    <div class="shots">${shots}</div>
  </article>`
}

const toc = items
  .map((i) => {
    const v = VERDICT[i.verdict]
    return `<li><a href="#${i.id}"><span class="ref">${i.id}</span><span class="t">${esc(i.request)}</span><span class="dot ${v.cls}" aria-label="${v.text}" title="${v.text}">${v.icon}</span></a></li>`
  })
  .join('')

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.title)}</title>
<style>
  :root {
    --ws-navy: #082b50; --ws-navy-2: #0f416f; --ws-ink: #172434; --ws-muted: #687789;
    --ws-gold: #caa631; --ws-gold-soft: #f7edcb; --ws-paper: #f4f5f6; --ws-line: #dce3e9;
    --ws-white: #ffffff; --ws-success: #22704a; --ws-danger: #a52c25;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f6f2; color: var(--ws-ink); font-family: 'Sarabun', 'Noto Sans Thai', Tahoma, sans-serif; font-size: 1rem; line-height: 1.65; }
  .top { background: linear-gradient(135deg, #061d35, var(--ws-navy-2)); border-bottom: 3px solid var(--ws-gold); color: #fff; }
  .top .inner, main, footer { max-width: 1100px; margin: 0 auto; padding-left: 1.5rem; padding-right: 1.5rem; }
  .top .inner { padding-top: 1.75rem; padding-bottom: 1.5rem; }
  .kicker { font-size: .8rem; font-weight: 600; letter-spacing: .02em; color: var(--ws-gold-soft); margin: 0; }
  h1 { font-size: clamp(1.55rem, 2.4vw, 2.1rem); line-height: 1.25; margin: .25rem 0 .35rem; font-weight: 700; }
  .sub { margin: 0; color: #d7e2ee; }
  main { padding-top: 1.5rem; padding-bottom: 4rem; }
  .summary { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .75rem; margin-bottom: 1rem; }
  .stat { background: var(--ws-white); border: 1px solid var(--ws-line); border-radius: 12px; padding: 1rem 1.1rem; box-shadow: 0 8px 25px rgba(8,43,80,.06); min-width: 0; }
  .stat .v { font-size: 1.9rem; font-weight: 700; color: var(--ws-navy); line-height: 1.1; }
  .stat .l { font-size: .85rem; color: var(--ws-muted); }
  .callout { padding: .8rem .9rem; border-left: 4px solid var(--ws-gold); background: #fff8e5; color: #5f5027; border-radius: 8px; font-size: .92rem; margin: 0 0 1.5rem; }
  .card { background: var(--ws-white); border: 1px solid var(--ws-line); border-radius: 12px; box-shadow: 0 8px 25px rgba(8,43,80,.06); }
  .toc { padding: 1rem 1.1rem; margin-bottom: 2rem; }
  .toc h2 { font-size: 1rem; margin: 0 0 .5rem; color: var(--ws-navy); }
  .toc ol { list-style: none; margin: 0; padding: 0; }
  .toc a { display: grid; grid-template-columns: 4.6rem minmax(0, 1fr) auto; gap: .75rem; align-items: start; padding: .45rem .25rem; border-top: 1px solid #e8edf1; color: var(--ws-ink); text-decoration: none; }
  .toc li:first-child a { border-top: 0; }
  .toc a:hover .t, .toc a:focus-visible .t { color: var(--ws-navy); text-decoration: underline; }
  .toc a:focus-visible { outline: 3px solid rgba(202,166,49,.45); border-radius: 6px; }
  .ref { font-weight: 700; color: var(--ws-navy); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .dot { display: inline-grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: 99px; font-size: .8rem; font-weight: 700; background: var(--ws-gold-soft); color: #654b08; }
  .dot.success { background: #dff0e7; color: #1e6141; }
  .dot.danger { background: #f9e1df; color: #8c261f; }
  .item { background: var(--ws-white); border: 1px solid var(--ws-line); border-radius: 12px; box-shadow: 0 8px 25px rgba(8,43,80,.06); padding: 1.25rem 1.4rem 1.4rem; margin-bottom: 1.5rem; scroll-margin-top: 1rem; }
  .item-head { display: flex; flex-wrap: wrap; gap: .5rem 1rem; align-items: center; justify-content: space-between; }
  .item-ref { display: flex; flex-wrap: wrap; gap: .25rem .75rem; align-items: baseline; min-width: 0; }
  .cat { color: var(--ws-muted); font-size: .88rem; }
  .status { display: inline-flex; align-items: center; gap: .35rem; padding: .28rem .7rem; border-radius: 99px; font-size: .8rem; font-weight: 600; background: var(--ws-gold-soft); color: #654b08; }
  .status.success { background: #dff0e7; color: #1e6141; }
  .status.danger { background: #f9e1df; color: #8c261f; }
  .status .count { font-weight: 400; opacity: .85; }
  .item h2 { font-size: 1.2rem; line-height: 1.45; color: var(--ws-navy); margin: .6rem 0 .9rem; }
  .block h3 { font-size: .8rem; font-weight: 600; color: var(--ws-muted); margin: 0 0 .25rem; }
  .block ul { margin: 0; padding-left: 1.2rem; }
  .block li + li { margin-top: .2rem; }
  .shots { display: grid; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); gap: 1rem; margin-top: 1.1rem; }
  .shot { margin: 0; min-width: 0; }
  .zoom { display: block; width: 100%; padding: 0; border: 1px solid var(--ws-line); border-radius: 8px; overflow: hidden; background: var(--ws-paper); cursor: zoom-in; }
  .zoom:focus-visible { outline: 3px solid rgba(202,166,49,.6); outline-offset: 2px; }
  .zoom img { display: block; width: 100%; height: auto; }
  figcaption { font-size: .88rem; margin-top: .4rem; color: var(--ws-ink); }
  figcaption .n { font-weight: 600; color: var(--ws-navy); margin-right: .25rem; }
  .missing .ph { display: grid; place-items: center; aspect-ratio: 16 / 9; border: 1px dashed #aebdca; border-radius: 8px; color: var(--ws-muted); background: var(--ws-paper); font-size: .9rem; }
  footer { color: var(--ws-muted); font-size: .85rem; padding-bottom: 2.5rem; }
  dialog { border: 0; padding: 0; background: transparent; max-width: min(96vw, 1600px); max-height: 94vh; }
  dialog::backdrop { background: rgba(6,29,53,.82); }
  dialog img { display: block; max-width: 100%; max-height: calc(94vh - 3.5rem); border-radius: 8px; }
  dialog .bar { display: flex; justify-content: space-between; gap: 1rem; align-items: center; color: #fff; padding-bottom: .5rem; font-size: .9rem; }
  dialog button { min-height: 44px; padding: .6rem 1rem; border-radius: 8px; border: 1px solid #9aabba; background: #fff; color: var(--ws-navy); font: inherit; font-weight: 600; cursor: pointer; }
  @media (max-width: 720px) {
    .top .inner, main, footer { padding-left: 1rem; padding-right: 1rem; }
    .summary { grid-template-columns: minmax(0, 1fr); }
    .item { padding: 1rem; }
    .toc a { grid-template-columns: 4.2rem minmax(0, 1fr) auto; gap: .5rem; }
    .shots { grid-template-columns: minmax(0, 1fr); }
  }
  @media print {
    body { background: #fff; }
    .top { background: none; color: var(--ws-ink); border-bottom-color: var(--ws-gold); }
    .sub, .kicker { color: var(--ws-muted); }
    .item, .stat, .card { box-shadow: none; break-inside: avoid; }
    .shot { break-inside: avoid; }
    .shots { grid-template-columns: minmax(0, 1fr); }
    .toc { break-after: page; }
    dialog { display: none; }
  }
</style>
</head>
<body>
<header class="top">
  <div class="inner">
    <p class="kicker">สำนักงาน ป.ป.ท. · E-CMIS</p>
    <h1>${esc(config.title)}</h1>
    <p class="sub">${esc(config.subtitle)}</p>
  </div>
</header>
<main>
  <section class="summary" aria-label="สรุป">
    <div class="stat"><div class="v">${items.length}</div><div class="l">ประเด็นที่ปรับปรุงแล้ว</div></div>
    <div class="stat"><div class="v">${passCount}/${items.length}</div><div class="l">ประเด็นที่ตรวจผ่านทุกรายการ</div></div>
    <div class="stat"><div class="v">${checkPassed}/${checkCount}</div><div class="l">รายการตรวจด้วยระบบทดสอบอัตโนมัติ</div></div>
  </section>
  <p class="callout">ตรวจด้วยระบบทดสอบอัตโนมัติที่ใช้งานหน้าจอจริงของต้นแบบ เมื่อ ${esc(thaiDate(ranAt, true))} น. ภาพประกอบถ่ายระหว่างการตรวจ กรอบสีแดงชี้จุดที่ปรับปรุง · ${esc(config.scopeNote)}</p>
  <nav class="card toc" aria-label="สารบัญประเด็น">
    <h2>ประเด็นในรายงาน</h2>
    <ol>${toc}</ol>
  </nav>
  ${items.map(renderItem).join('\n')}
</main>
<footer>จัดทำเมื่อ ${esc(thaiDate(new Date(), true))} น. · ข้อมูลในภาพเป็นข้อมูลจำลองสำหรับสาธิตเท่านั้น</footer>
<dialog id="viewer" aria-label="ภาพขยาย">
  <div class="bar"><span id="viewer-cap"></span><button type="button" id="viewer-close">ปิด</button></div>
  <img id="viewer-img" alt="">
</dialog>
<script>
  const viewer = document.getElementById('viewer')
  const vimg = document.getElementById('viewer-img')
  let opener = null
  document.querySelectorAll('.zoom').forEach((b) => b.addEventListener('click', () => {
    const img = b.querySelector('img')
    vimg.src = img.src
    vimg.alt = img.alt
    document.getElementById('viewer-cap').textContent = img.alt
    opener = b
    viewer.showModal()
  }))
  document.getElementById('viewer-close').addEventListener('click', () => viewer.close())
  viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close() })
  viewer.addEventListener('close', () => opener && opener.focus())
</script>
</body>
</html>
`

const outPath = resolve(root, config.output)
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, html)
const missing = items.flatMap((i) => i.shots.filter((s) => s.missing).map((s) => s.id))
console.log(`\nรายงาน: ${config.output}`)
console.log(`ประเด็นตรวจผ่าน ${passCount}/${items.length} · รายการตรวจผ่าน ${checkPassed}/${checkCount}`)
for (const i of items.filter((x) => x.verdict !== 'pass')) console.log(`  ${i.id}: ${VERDICT[i.verdict].text} (${i.passed}/${i.total})`)
if (missing.length) console.log(`ไม่มีภาพ: ${missing.join(', ')}`)
