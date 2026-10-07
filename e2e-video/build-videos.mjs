// แปลงวิดีโอดิบ (WebM จาก Playwright) เป็น MP4 1080p พร้อมภาพปก แล้วสร้างหน้ารวม e2e-video/output/index.html
// รันหลังชุดถ่ายวิดีโอ: node e2e-video/build-videos.mjs (ต้องมี ffmpeg ใน PATH)
// ชุดวิดีโอ Journey: node e2e-video/build-videos.mjs journeys → e2e-video/output-journeys/
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const suites = {
  flows: { dir: 'output', heading: 'วิดีโอสอนใช้งาน E-CMIS · คุ้มครองพยาน กิจกรรมที่ 6', unit: 'เส้นทาง' },
  journeys: { dir: 'output-journeys', heading: 'วิดีโอ Journey E-CMIS · คุ้มครองพยาน กิจกรรมที่ 6', unit: 'Journey' },
}
const suite = suites[process.argv[2] || 'flows']
if (!suite) throw new Error(`ไม่รู้จักชุด "${process.argv[2]}" — ใช้ ${Object.keys(suites).join(' / ')}`)
const out = resolve(dirname(fileURLToPath(import.meta.url)), suite.dir)
const raw = resolve(out, 'raw')
const videosDir = resolve(out, 'videos')
mkdirSync(videosDir, { recursive: true })

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args], { stdio: 'inherit' })
const duration = (file) =>
  Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())

const items = readdirSync(raw)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .map((f) => {
    const meta = JSON.parse(readFileSync(resolve(raw, f), 'utf-8'))
    const base = f.replace(/\.json$/, '')
    const webm = resolve(raw, `${base}.webm`)
    if (!existsSync(webm)) return null
    const mp4 = resolve(videosDir, `${base}.mp4`)
    const poster = resolve(videosDir, `${base}.jpg`)
    console.log(`แปลง ${base}.webm → MP4`)
    ffmpeg(['-i', webm, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-movflags', '+faststart', '-an', mp4])
    ffmpeg(['-ss', '2.5', '-i', mp4, '-frames:v', '1', '-q:v', '3', '-vf', 'scale=960:-2', poster])
    return { ...meta, base, seconds: duration(mp4) }
  })
  .filter(Boolean)

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const generatedAt = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'long', timeStyle: 'short' })
const total = items.reduce((a, v) => a + v.seconds, 0)

const cards = items
  .map(
    (v) => `
  <article class="card" id="${esc(v.id)}">
    <div class="player">
      <video controls preload="metadata" poster="videos/${v.base}.jpg" src="videos/${v.base}.mp4"></video>
    </div>
    <div class="body">
      <div class="eyebrow">${v.code ? esc(v.code) : `เส้นทางที่ ${v.order}`} · ${mmss(v.seconds)} นาที${v.tabs ? ` · แท็บ ${v.tabs.map(esc).join(' · ')}` : ''}${v.group ? ` · ${esc(v.group)}` : ''}</div>
      <h2>${esc(v.title)}</h2>
      ${v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
      ${v.roles ? `<div class="roles">${v.roles.map((r) => `<span class="chip">${esc(r.name)}</span>`).join('')}</div>` : ''}
      <ol class="chapters">
        ${v.chapters
          .map(
            (c) => `<li><button type="button" data-t="${c.at.toFixed(1)}"><span class="at">${mmss(c.at)}</span>${c.roleName ? `<span class="who">${esc(c.roleName)}</span>` : ''}<span class="what">${esc(c.label)}</span></button></li>`
          )
          .join('')}
      </ol>
      <a class="dl" href="videos/${v.base}.mp4" download>ดาวน์โหลด MP4</a>
    </div>
  </article>`
  )
  .join('')

const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(suite.heading.split(' · ')[0])}</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  :root { --bg:#eef2f7; --card:#fff; --ink:#172943; --muted:#5b6b82; --line:#dbe3ee; --accent:#f59e0b; --brand:#1e3a8a; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1324; --card:#121c33; --ink:#e6ecf5; --muted:#9aa8bf; --line:#24314f; --brand:#93c5fd; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:400 16px/1.6 Kanit, 'Noto Sans Thai', sans-serif; }
  header { max-width:1280px; margin:0 auto; padding:40px 16px 8px; }
  header h1 { margin:0; font-size:32px; font-weight:600; }
  header p { margin:6px 0 0; color:var(--muted); }
  nav { max-width:1280px; margin:16px auto 0; padding:0 16px; display:flex; flex-wrap:wrap; gap:8px; }
  nav a { text-decoration:none; color:var(--brand); border:1px solid var(--line); background:var(--card); padding:4px 12px; border-radius:999px; font-size:14px; }
  main { max-width:1280px; margin:0 auto; padding:24px 16px 64px; display:grid; gap:28px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; display:grid; grid-template-columns: 1.6fr 1fr; }
  .player video { width:100%; display:block; background:#000; aspect-ratio:16/9; }
  .body { padding:20px 22px; display:flex; flex-direction:column; gap:10px; min-width:0; }
  .eyebrow { color:var(--muted); font-size:13px; }
  h2 { margin:0; font-size:21px; font-weight:600; line-height:1.35; }
  .summary { margin:0; color:var(--muted); font-size:14px; }
  .roles { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { font-size:12.5px; padding:2px 10px; border-radius:999px; background:rgba(245,158,11,.15); border:1px solid rgba(245,158,11,.45); }
  .chapters { list-style:none; margin:0; padding:0; max-height:260px; overflow:auto; border-top:1px solid var(--line); }
  .chapters button { all:unset; cursor:pointer; display:grid; grid-template-columns:44px 1fr; gap:0 10px; padding:6px 4px; width:100%; border-bottom:1px solid var(--line); font-size:13.5px; }
  .chapters button:hover { background:rgba(245,158,11,.08); }
  .chapters .at { color:var(--brand); font-variant-numeric:tabular-nums; grid-row:span 2; }
  .chapters .who { color:var(--accent); font-size:12px; }
  .dl { align-self:flex-start; color:var(--brand); font-size:14px; }
  @media (max-width: 900px) { .card { grid-template-columns:1fr; } }
</style>
</head>
<body>
<header>
  <h1>${esc(suite.heading)}</h1>
  <p>${items.length} ${suite.unit} · ความยาวรวม ${mmss(total)} นาที · สร้างเมื่อ ${esc(generatedAt)} · กดเวลาในรายการขั้นเพื่อข้ามไปยังขั้นนั้น</p>
</header>
<nav>${items.map((v) => `<a href="#${esc(v.id)}">${v.code ? esc(v.code) : `${v.order}.`} ${esc(v.title.split(':')[0])}</a>`).join('')}</nav>
<main>${cards}</main>
<script>
  document.querySelectorAll('.chapters button').forEach((b) => b.addEventListener('click', () => {
    const v = b.closest('.card').querySelector('video')
    v.currentTime = Number(b.dataset.t)
    v.play()
  }))
</script>
</body>
</html>`

writeFileSync(resolve(out, 'index.html'), html)
console.log(`สร้าง ${resolve(out, 'index.html')} (${items.length} วิดีโอ, รวม ${mmss(total)})`)
