// สร้างหน้ารวมภาพ e2e-screenshots/output/index.html จาก steps.json ของแต่ละสถานการณ์
// รันหลังชุดถ่ายภาพ: node e2e-screenshots/build-report.mjs
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = resolve(dirname(fileURLToPath(import.meta.url)), 'output')
const scenarios = readdirSync(out, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(resolve(out, d.name, 'steps.json')))
  .map((d) => {
    const s = JSON.parse(readFileSync(resolve(out, d.name, 'steps.json'), 'utf-8'))
    s.steps = s.steps.map((st) => ({ ...st, src: `${d.name}/${st.file}` }))
    return s
  })
  .sort((a, b) => (a.flow === b.flow ? a.order - b.order : a.flow === 'appeal' ? -1 : 1))

const generatedAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' })
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

const FLOWS = {
  appeal: {
    label: 'อุทธรณ์',
    path: '09A → 09B',
    intro:
      'ผลพิจารณาไม่อนุมัติ → แจ้ง คบ.10 พร้อมสิทธิอุทธรณ์ 30 วัน → รับคำอุทธรณ์ในแฟ้มเดิม → เสนอตามลำดับชั้น → คณะกรรมการ ป.ป.ท. วินิจฉัย → แจ้งผล',
  },
  article14: {
    label: 'ส่งกรมคุ้มครองสิทธิและเสรีภาพ',
    path: '08C · ข้อ 14',
    intro:
      'คุ้มครองใกล้ครบเพดาน 180 วันแต่ยังมีภัย → จัดทำข้อเสนอ → ผบช.ชั้นต้น → เลขาธิการฯ → มติคณะกรรมการ → ออกหนังสือถึงกรม → ส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่',
  },
}

let figIndex = 0
const allShots = []

function renderScenario(s, letter) {
  const steps = s.steps
    .map((st) => {
      const i = figIndex++
      allShots.push({ src: st.src, caption: `${letter}${s.order}.${st.n} · ${st.title}`, role: st.role })
      const isConfirm = st.title.startsWith('จอยืนยัน')
      const isResult = st.title.startsWith('ผลลัพธ์')
      const kind = isConfirm ? 'confirm' : isResult ? 'result' : 'action'
      const kindLabel = isConfirm ? 'จอยืนยัน' : isResult ? 'ผลลัพธ์' : 'ขั้นตอน'
      const title = st.title.replace(/^(จอยืนยัน|ผลลัพธ์) — /, '')
      return `
      <li class="step step--${kind}">
        <div class="step-meta">
          <span class="step-no">${letter}${s.order}.${st.n}</span>
          <span class="role">${esc(st.role)}</span>
          <span class="kind kind--${kind}">${kindLabel}</span>
          <h4>${esc(title)}</h4>
          ${st.detail ? `<p>${esc(st.detail)}</p>` : ''}
        </div>
        <button class="shot" type="button" data-i="${i}" aria-label="ขยายภาพ ${esc(title)}">
          <img src="${st.src}" alt="${esc(st.title)}" loading="lazy" />
          <span class="zoom">ดูภาพเต็ม</span>
        </button>
      </li>`
    })
    .join('')
  return `
    <section class="scenario" id="${s.id}">
      <header class="scenario-head">
        <div class="scenario-tag">${letter}${s.order}</div>
        <div>
          <h3>${esc(s.title)}</h3>
          <p class="summary">${esc(s.summary)}</p>
          <p class="ref"><span>Playwright ต้นฉบับ</span> <code>${esc(s.testRef)}</code> · ${s.steps.length} ภาพ</p>
        </div>
      </header>
      <ol class="steps">${steps}</ol>
    </section>`
}

const flowSections = Object.entries(FLOWS)
  .map(([key, f]) => {
    const list = scenarios.filter((s) => s.flow === key)
    const letter = key === 'appeal' ? 'A' : 'B'
    const toc = list
      .map((s) => `<li><a href="#${s.id}"><b>${letter}${s.order}</b> ${esc(s.title)} <small>${s.steps.length} ภาพ</small></a></li>`)
      .join('')
    return `
  <section class="flow" id="flow-${key}" data-flow="${key}">
    <div class="flow-head">
      <p class="eyebrow">${f.path}</p>
      <h2>${f.label}</h2>
      <p class="flow-intro">${f.intro}</p>
      <ol class="toc">${toc}</ol>
    </div>
    ${list.map((s) => renderScenario(s, letter)).join('')}
  </section>`
  })
  .join('')

const total = scenarios.reduce((n, s) => n + s.steps.length, 0)

const html = `<title>ภาพขั้นตอน อุทธรณ์และข้อ 14</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;600;700&family=IBM+Plex+Sans+Thai:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" />
<style>
:root {
  --ground: #f3f5f9;
  --surface: #ffffff;
  --ink: #14203a;
  --ink-soft: #4d5a73;
  --line: #d9dfea;
  --navy: #13254a;
  --gold: #b8871c;
  --gold-soft: #fbf3df;
  --confirm: #1f5fae;
  --confirm-soft: #e6effb;
  --ok: #1e7a4c;
  --ok-soft: #e3f4ea;
  --shadow: 0 1px 2px rgba(20, 32, 58, .06), 0 8px 24px -12px rgba(20, 32, 58, .18);
  --f-display: 'Anuphan', 'IBM Plex Sans Thai', 'Sukhumvit Set', 'Thonburi', sans-serif;
  --f-body: 'IBM Plex Sans Thai', 'Sukhumvit Set', 'Thonburi', system-ui, sans-serif;
  --f-mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
    --ground: #0c1322; --surface: #141d31; --ink: #e6ebf5; --ink-soft: #9aa7c0; --line: #26324b;
    --navy: #0a1224; --gold: #e0b453; --gold-soft: #2c2512; --confirm: #7fb0f0; --confirm-soft: #16284a;
    --ok: #6cd39c; --ok-soft: #12301f; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
  --ground: #0c1322; --surface: #141d31; --ink: #e6ebf5; --ink-soft: #9aa7c0; --line: #26324b;
  --navy: #0a1224; --gold: #e0b453; --gold-soft: #2c2512; --confirm: #7fb0f0; --confirm-soft: #16284a;
  --ok: #6cd39c; --ok-soft: #12301f; --shadow: 0 1px 2px rgba(0,0,0,.4), 0 10px 28px -14px rgba(0,0,0,.7);
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { background: var(--ground); color: var(--ink); font: 15px/1.65 var(--f-body); }
.masthead { background: var(--navy); color: #eef2fa; padding-block: 36px 28px; padding-inline: 16px; }
.wrap { max-width: 1180px; margin-inline: auto; }
.masthead .eyebrow { color: #e0b453; }
.masthead h1 { font: 700 clamp(26px, 4vw, 38px)/1.25 var(--f-display); margin: 6px 0 10px; text-wrap: balance; }
.masthead p { margin: 0; color: #b9c4da; max-width: 70ch; }
.stats { display: flex; flex-wrap: wrap; gap: 8px 22px; margin-top: 18px; font-size: 13.5px; color: #cfd8ea; }
.stats b { font: 600 15px var(--f-display); color: #fff; font-variant-numeric: tabular-nums; }
.tabs { position: sticky; top: env(safe-area-inset-top, 0px); z-index: 5; background: var(--surface); border-bottom: 1px solid var(--line); padding-inline: 16px; }
.tabs .wrap { display: flex; gap: 4px; overflow-x: auto; }
.tab { font: 600 15px var(--f-display); color: var(--ink-soft); background: none; border: 0; padding: 14px 16px 12px; border-bottom: 3px solid transparent; cursor: pointer; white-space: nowrap; }
.tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--gold); }
.tab:focus-visible, .shot:focus-visible, .lb button:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
main { padding-inline: 16px; padding-block: 28px 64px; }
.eyebrow { font: 500 12px var(--f-mono); letter-spacing: .08em; text-transform: uppercase; color: var(--gold); margin: 0; }
.flow-head { margin-bottom: 28px; }
.flow-head h2 { font: 700 clamp(22px, 3vw, 30px)/1.3 var(--f-display); margin: 4px 0 8px; }
.flow-intro { margin: 0 0 16px; color: var(--ink-soft); max-width: 75ch; }
.toc { list-style: none; padding: 0; margin: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 8px; }
.toc a { display: block; text-decoration: none; color: var(--ink); background: var(--surface); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 14px; }
.toc a:hover { border-color: var(--gold); }
.toc b { font-family: var(--f-mono); color: var(--gold); margin-right: 4px; }
.toc small { color: var(--ink-soft); margin-left: 4px; }
.scenario { margin-top: 44px; scroll-margin-top: 64px; }
.scenario-head { display: flex; gap: 16px; align-items: flex-start; padding-bottom: 14px; border-bottom: 2px solid var(--ink); margin-bottom: 8px; }
.scenario-tag { flex: none; font: 700 18px var(--f-mono); background: var(--gold-soft); color: var(--gold); border-radius: 6px; padding: 6px 10px; }
.scenario-head h3 { font: 700 21px/1.35 var(--f-display); margin: 0 0 4px; }
.summary { margin: 0 0 6px; color: var(--ink-soft); max-width: 80ch; }
.ref { margin: 0; font-size: 13px; color: var(--ink-soft); }
.ref span { font-weight: 600; }
code { font: 12.5px var(--f-mono); background: var(--ground); border: 1px solid var(--line); border-radius: 4px; padding: 1px 6px; overflow-wrap: anywhere; }
.steps { list-style: none; padding: 0; margin: 0; }
.step { display: grid; grid-template-columns: minmax(220px, 300px) 1fr; gap: 24px; padding-block: 22px; border-bottom: 1px solid var(--line); }
.step-meta { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.step-no { font: 500 13px var(--f-mono); color: var(--ink-soft); font-variant-numeric: tabular-nums; }
.role { font-size: 12.5px; font-weight: 600; color: var(--navy); background: var(--gold-soft); border: 1px solid color-mix(in srgb, var(--gold) 35%, transparent); padding: 1px 10px; border-radius: 999px; }
:root[data-theme="dark"] .role { color: var(--gold); }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) .role { color: var(--gold); } }
.kind { font: 500 11px var(--f-mono); letter-spacing: .06em; text-transform: uppercase; padding: 1px 8px; border-radius: 4px; color: var(--ink-soft); border: 1px solid var(--line); }
.kind--confirm { color: var(--confirm); background: var(--confirm-soft); border-color: transparent; }
.kind--result { color: var(--ok); background: var(--ok-soft); border-color: transparent; }
.step h4 { font: 600 16.5px/1.45 var(--f-display); margin: 2px 0 0; text-wrap: balance; }
.step p { margin: 0; font-size: 14px; color: var(--ink-soft); }
.shot { position: relative; display: block; width: 100%; padding: 0; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); box-shadow: var(--shadow); cursor: zoom-in; overflow: hidden; aspect-ratio: 16 / 9; max-width: 100%; }
.shot img { display: block; width: 100%; height: auto; }
.zoom { position: absolute; right: 10px; bottom: 10px; z-index: 1; font-size: 12.5px; font-weight: 600; background: var(--navy); color: #fff; padding: 4px 10px; border-radius: 999px; }
.lb { position: fixed; inset: 0; z-index: 20; background: rgba(8, 13, 25, .92); display: flex; flex-direction: column; }
.lb-bar { display: flex; align-items: center; gap: 12px; padding: 12px 16px; padding-top: calc(12px + env(safe-area-inset-top, 0px)); color: #e6ebf5; }
.lb-cap { flex: 1; min-width: 0; font: 600 15px var(--f-display); }
.lb-cap small { display: block; font: 400 12.5px var(--f-body); color: #9aa7c0; }
.lb button { font: 600 14px var(--f-body); background: #22304f; color: #fff; border: 0; border-radius: 6px; padding: 8px 12px; cursor: pointer; }
.lb-body { flex: 1; overflow: auto; padding: 0 16px 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom, 0px)); }
.lb-body { display: flex; align-items: center; }
.lb-body img { display: block; margin: 0 auto; max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 6px; }
footer { color: var(--ink-soft); font-size: 13px; padding-block: 24px; border-top: 1px solid var(--line); margin-top: 40px; }
@media (max-width: 760px) {
  .step { grid-template-columns: 1fr; gap: 12px; }
  .scenario-head { flex-direction: column; gap: 8px; }
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
</style>

<header class="masthead">
  <div class="wrap">
    <p class="eyebrow">E-CMIS · กิจกรรมที่ 6 ระบบคุ้มครองพยาน · Prototype</p>
    <h1>ภาพหน้าจอทีละขั้น: อุทธรณ์ และส่งกรมคุ้มครองสิทธิและเสรีภาพ</h1>
    <p>ถ่ายจากการรัน Playwright บนเส้นทางหลัก (happy path) ของ prototype — ภาพ 16:9 (1920×1080) เลื่อนไปยังส่วนที่เกี่ยวข้องของแต่ละขั้น ถ่ายทุกขั้นที่เปลี่ยนสถานะ เปลี่ยนผู้ใช้ และทั้งจอยืนยันกับผลลัพธ์หลังกดยืนยัน กดที่ภาพเพื่อดูเต็มหน้าจอ</p>
    <div class="stats">
      <span><b>${scenarios.length}</b> สถานการณ์</span>
      <span><b>${total}</b> ภาพ</span>
      <span>แฟ้มตัวอย่าง <b>WP-2569-000501</b></span>
      <span>ถ่ายเมื่อ ${esc(generatedAt)}</span>
    </div>
  </div>
</header>

<nav class="tabs" aria-label="เลือกเส้นทาง">
  <div class="wrap" role="tablist">
    ${Object.entries(FLOWS)
      .map(
        ([k, f], i) =>
          `<button class="tab" role="tab" id="tab-${k}" aria-controls="flow-${k}" aria-selected="${i === 0}" data-flow="${k}">${f.label} <span style="font-weight:500;color:var(--ink-soft)">${f.path}</span></button>`
      )
      .join('')}
  </div>
</nav>

<main>
  <div class="wrap">
    ${flowSections}
    <footer>สร้างจาก <code>e2e-screenshots/</code> · รันซ้ำ: <code>pnpm playwright test -c playwright.screenshots.config.ts && node e2e-screenshots/build-report.mjs</code></footer>
  </div>
</main>

<div class="lb" id="lb" hidden role="dialog" aria-modal="true" aria-label="ภาพเต็ม">
  <div class="lb-bar">
    <div class="lb-cap" id="lb-cap"></div>
    <button type="button" id="lb-prev" aria-label="ภาพก่อนหน้า">← ก่อนหน้า</button>
    <button type="button" id="lb-next" aria-label="ภาพถัดไป">ถัดไป →</button>
    <button type="button" id="lb-close" aria-label="ปิด">ปิด ✕</button>
  </div>
  <div class="lb-body" id="lb-body"><img id="lb-img" alt="" /></div>
</div>

<script>
const SHOTS = ${JSON.stringify(allShots)};
const flows = [...document.querySelectorAll('.flow')];
const tabs = [...document.querySelectorAll('.tab')];
function showFlow(key, scroll) {
  flows.forEach((f) => (f.hidden = f.dataset.flow !== key));
  tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.flow === key)));
  try { localStorage.setItem('flow', key); } catch (e) {}
  if (scroll) window.scrollTo({ top: 0 });
}
tabs.forEach((t) => t.addEventListener('click', () => showFlow(t.dataset.flow, true)));
const hash = location.hash.slice(1);
const fromHash = hash && document.getElementById(hash)?.closest('.flow')?.dataset.flow;
let saved = null; try { saved = localStorage.getItem('flow'); } catch (e) {}
showFlow(fromHash || (hash === 'article14' ? 'article14' : saved) || 'appeal');

const lb = document.getElementById('lb'), img = document.getElementById('lb-img'), cap = document.getElementById('lb-cap'), body = document.getElementById('lb-body');
let cur = 0;
function open(i) {
  cur = (i + SHOTS.length) % SHOTS.length;
  const s = SHOTS[cur];
  img.src = s.src; img.alt = s.caption;
  cap.innerHTML = '';
  cap.append(s.caption);
  const sm = document.createElement('small'); sm.textContent = 'ผู้ใช้: ' + s.role + ' · ภาพ ' + (cur + 1) + '/' + SHOTS.length; cap.append(sm);
  body.scrollTop = 0;
  lb.hidden = false; document.body.style.overflow = 'hidden';
}
function close() { lb.hidden = true; document.body.style.overflow = ''; }
document.querySelectorAll('.shot').forEach((b) => b.addEventListener('click', () => open(+b.dataset.i)));
document.getElementById('lb-prev').onclick = () => open(cur - 1);
document.getElementById('lb-next').onclick = () => open(cur + 1);
document.getElementById('lb-close').onclick = close;
lb.addEventListener('click', (e) => { if (e.target === lb || e.target === body) close(); });
document.addEventListener('keydown', (e) => {
  if (lb.hidden) return;
  if (e.key === 'Escape') close();
  if (e.key === 'ArrowRight') open(cur + 1);
  if (e.key === 'ArrowLeft') open(cur - 1);
});
</script>
`

writeFileSync(resolve(out, 'index.html'), html, 'utf-8')
console.log(`เขียน ${resolve(out, 'index.html')} — ${scenarios.length} สถานการณ์ ${total} ภาพ`)
