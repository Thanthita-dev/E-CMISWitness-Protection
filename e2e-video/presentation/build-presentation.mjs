// ประกอบวิดีโอนำเสนอ: วิดีโอดิบของทุกส่วน (WebM) + เสียงพากย์ตามเวลา cue → MP4 1080p พร้อมซับไตเติล .srt/.vtt รายการบท
// และ <ชื่อ>.meta.json (ซับไตเติล บท ป้ายขั้นตอน) ให้หน้าเว็บ index.html แสดงข้างเครื่องเล่น — ภาพในวิดีโอไม่ฝังซับ/ป้ายแล้ว
// รันหลังถ่าย: node e2e-video/presentation/build-presentation.mjs [ชื่อไฟล์ดิบ ค่าเริ่มต้น presentation]
// เข้ารหัสทุกส่วนพร้อมกัน แล้วต่อภาพแบบ stream copy และวางเสียงทั้งคลิปเป็นแทร็กเดียว (ไม่มีรอยต่อเสียงระหว่างส่วน)
import { execFile } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { cpus } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const out = resolve(dirname(fileURLToPath(import.meta.url)), '../output-presentation')
const base = process.argv[2] || 'presentation'
const dir = resolve(out, 'raw', `${base}.parts`)
if (!existsSync(dir)) throw new Error(`ไม่พบ ${dir} — ถ่ายก่อนด้วย pnpm video:presentation`)

const parts = readdirSync(dir)
  .filter((f) => /^\d+\.json$/.test(f))
  .sort()
  .map((f) => ({ ...JSON.parse(readFileSync(resolve(dir, f), 'utf-8')), webm: resolve(dir, f.replace(/\.json$/, '.webm')) }))
if (!parts.length) throw new Error(`ไม่มีวิดีโอดิบใน ${dir}`)
const missing = parts[0].of - parts.length
if (missing || parts.some((p) => !existsSync(p.webm))) throw new Error(`วิดีโอดิบไม่ครบ (${parts.length}/${parts[0].of} ส่วน) — ถ่ายใหม่`)

const duration = async (f) =>
  Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])).stdout.trim())

/** ทำงานพร้อมกันไม่เกิน limit งาน คืนผลตามลำดับเดิม */
async function pool(items, limit, fn) {
  const res = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        res[i] = await fn(items[i], i)
      }
    })
  )
  return res
}

const started = Date.now()
const CORES = cpus().length
const secs = () => `${((Date.now() - started) / 1000).toFixed(0)} วิ`
console.log(`▶ ประกอบ ${base}: ${parts.length} ส่วน · ${CORES} แกน`)

// 1) ภาพของแต่ละส่วน → MP4 ไม่มีเสียง (พร้อมกันทุกส่วน แบ่งแกนให้เท่ากัน)
// preset veryfast: ภาพหน้าจอได้ SSIM ใกล้ medium (≈0.996) แต่เร็วกว่าหลายเท่า — PRESENT_PRESET=medium ถ้าต้องการไฟล์เล็กสุด
// วิดีโอเริ่มบันทึกตอนเปิดหน้า ซึ่งก่อนนาฬิกาของ cue เล็กน้อย — ชดเชยด้วยส่วนต่างความยาววิดีโอกับเวลาจริง (lead)
// แล้วตัดหัววิดีโอช่วงรอแอปโหลดครั้งแรกออก (trim) — เวลาในไฟล์ผลลัพธ์ของส่วนนั้นจึงเท่ากับ cue.at - trim
const threads = String(Math.max(1, Math.floor(CORES / parts.length)))
await Promise.all(
  parts.map(async (p) => {
    const lead = Math.max(0, (await duration(p.webm)) - p.wall)
    p.mp4 = p.webm.replace(/\.webm$/, '.mp4')
    await run('ffmpeg', [
      '-y', '-loglevel', 'error', '-ss', String(p.trim + lead), '-i', p.webm, '-an',
      '-c:v', 'libx264', '-preset', process.env.PRESENT_PRESET || 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', '30', '-threads', threads, p.mp4,
    ])
    p.seconds = await duration(p.mp4)
    console.log(`  🎞  ภาพส่วน ${p.part}/${parts.length} เข้ารหัสแล้ว — ยาว ${(p.seconds / 60).toFixed(1)} นาที (${secs()})`)
  })
)
let offset = 0
for (const p of parts) {
  p.offset = offset
  offset += p.seconds
}
const total = offset
console.log(`ภาพ ${parts.length} ส่วน · รวม ${(total / 60).toFixed(1)} นาที (${((Date.now() - started) / 1000).toFixed(0)} วิ)`)

// เวลาของ cue/บทในคลิปรวม
const cues = parts.flatMap((p) => p.cues.map((c) => ({ ...c, at: p.offset + c.at - p.trim })))
const chaptersAll = parts.flatMap((p) => p.chapters.map((c) => ({ ...c, at: p.offset + Math.max(0, c.at - p.trim) })))
const stagesAll = parts.flatMap((p) => (p.stages ?? []).map((s) => ({ ...s, at: p.offset + Math.max(0, s.at - p.trim) })))

// 2) วางเสียงทุกช่วงลงแทร็กเดียวตามเวลา (PCM 24 kHz โมโน) — ถอดไฟล์เสียงพร้อมกัน
const RATE = 24000
const voiced = cues.filter((c) => c.file && existsSync(c.file))
let decoded = 0
const clips = await pool(voiced, CORES, async (c) => {
  const { stdout } = await run('ffmpeg', ['-loglevel', 'error', '-i', c.file, '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], {
    encoding: 'buffer',
    maxBuffer: 1 << 28,
  })
  if (++decoded % 25 === 0 || decoded === voiced.length) console.log(`  🔊 ถอดเสียง ${decoded}/${voiced.length} ช่วง (${secs()})`)
  return stdout
})
const totalSamples = Math.ceil((total + 2) * RATE)
const track = new Int16Array(totalSamples)
voiced.forEach((c, k) => {
  const clip = clips[k]
  const samples = new Int16Array(clip.buffer, clip.byteOffset, clip.length >> 1)
  const at = Math.max(0, Math.round(c.at * RATE))
  for (let i = 0; i < samples.length && at + i < totalSamples; i++) {
    track[at + i] = Math.max(-32768, Math.min(32767, track[at + i] + samples[i]))
  }
})
const wav = resolve(out, 'raw', `${base}.voice.wav`)
const header = Buffer.alloc(44)
header.write('RIFF', 0); header.writeUInt32LE(36 + track.byteLength, 4); header.write('WAVE', 8)
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22)
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34)
header.write('data', 36); header.writeUInt32LE(track.byteLength, 40)
writeFileSync(wav, Buffer.concat([header, Buffer.from(track.buffer)]))
console.log(`เสียง ${voiced.length} ช่วง (${((Date.now() - started) / 1000).toFixed(0)} วิ)`)

// 3) ต่อภาพทุกส่วน (stream copy ไม่เข้ารหัสซ้ำ) + เสียง → MP4
const list = resolve(dir, 'concat.txt')
writeFileSync(list, parts.map((p) => `file '${p.mp4.replace(/'/g, "'\\''")}'`).join('\n') + '\n')
const mp4 = resolve(out, `${base}.mp4`)
console.log(`  📦 ต่อภาพ ${parts.length} ส่วน + เสียง → ${base}.mp4 (${secs()})`)
await run('ffmpeg', [
  '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-i', wav,
  '-map', '0:v', '-map', '1:a', '-shortest', '-c:v', 'copy',
  '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', mp4,
])

// ซับไตเติล .srt (แยกช่วงเหมือนบนจอ) — ใช้ตอนอัปโหลดขึ้นแพลตฟอร์มที่เปิด/ปิดซับได้
const chunk = (text, max = 78) => {
  const out = []
  let cur = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (cur && (cur + ' ' + w).length > max) { out.push(cur); cur = w } else cur = cur ? `${cur} ${w}` : w
  }
  if (cur) out.push(cur)
  return out
}
const ts = (s) => {
  const ms = Math.max(0, Math.round(s * 1000))
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`
}
/** ซับไตเติลเป็นช่วง ๆ ตามสัดส่วนความยาวข้อความของแต่ละประโยคพากย์ */
const subtitles = cues.flatMap((c) => {
  const parts = chunk(c.text)
  const total = parts.reduce((a, p) => a + p.length, 0)
  let from = c.at
  return parts.map((text) => {
    const span = (c.seconds * text.length) / total
    const sub = { from: +from.toFixed(3), to: +(from + span).toFixed(3), text }
    from += span
    return sub
  })
})
const srt = subtitles.map((s, i) => `${i + 1}\n${ts(s.from)} --> ${ts(s.to)}\n${s.text}\n`).join('\n')
writeFileSync(resolve(out, `${base}.srt`), srt)
const vtt = subtitles.map((s) => `${ts(s.from).replace(',', '.')} --> ${ts(s.to).replace(',', '.')}\n${s.text}\n`).join('\n')
writeFileSync(resolve(out, `${base}.vtt`), `WEBVTT\n\n${vtt}`)

const title = parts[0].title
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
const chapters = chaptersAll.map((c) => `${mmss(c.at)}  ${c.roleName} — ${c.label}`).join('\n')
writeFileSync(resolve(out, `${base}.chapters.txt`), `${title}\n\n${chapters}\n`)

console.log(`  📝 ซับไตเติล ${subtitles.length} ช่วง → ${base}.srt / ${base}.vtt · บท ${chaptersAll.length} รายการ`)

// ข้อมูลของหน้าเว็บ (build-page.mjs ฝังลงใน index.html)
writeFileSync(
  resolve(out, `${base}.meta.json`),
  JSON.stringify({
    base, cut: parts[0].cut ?? 'full', title, duration: total, video: `${base}.mp4`, vtt: `${base}.vtt`, subtitles,
    chapters: chaptersAll.map((c) => ({ at: c.at, roleName: c.roleName, label: c.label })),
    stages: stagesAll,
  })
)

// รวม cue/ป้ายของทุกส่วนตามเวลาคลิป — plan.ts ใช้ประมาณความยาวฉากเพื่อแบ่งส่วนรอบถัดไป และใช้เขียนบทใน note-speech.ts
writeFileSync(
  resolve(out, 'raw', `${base}.json`),
  JSON.stringify({ title, wall: total, trim: 0, cues, notes: parts.flatMap((p) => p.notes), chapters: chaptersAll }, null, 2)
)
await run('node', [resolve(dirname(fileURLToPath(import.meta.url)), 'build-page.mjs')]).then((r) => process.stdout.write(r.stdout))
console.log(`เสร็จ: ${mp4} (${(total / 60).toFixed(1)} นาที · ประกอบ ${((Date.now() - started) / 1000).toFixed(0)} วิ)`)
