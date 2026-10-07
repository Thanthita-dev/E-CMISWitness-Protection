import { mkdirSync, rmSync } from 'node:fs'
import { BRIEF, keptNotes, narrationFor } from './brief'
import { NOTE_SPEECH } from './note-speech'
import { BASE, PARTS, PARTS_DIR, SEGMENTS, previousRun } from './plan'
import { speechFor } from './presenter'
import { prewarm } from './tts'

/** ก่อนถ่าย: ล้างวิดีโอดิบของส่วนรอบเก่า แล้วสร้างเสียงพากย์ที่คาดว่าจะใช้ล่วงหน้าแบบขนาน (ตอนถ่ายจะไม่ต้องรอ edge-tts) */
export default async function globalSetup() {
  rmSync(PARTS_DIR, { recursive: true, force: true })
  mkdirSync(PARTS_DIR, { recursive: true })
  console.log(`${BASE}: ${PARTS.length} ส่วนถ่ายพร้อมกัน → ฉาก ${PARTS.map((p) => `${p[0] + 1}–${p[p.length - 1] + 1}`).join(' · ')}`)
  if (process.env.VIDEO_NO_VOICE === '1') return

  const keys = new Set(PARTS.flat().map((i) => SEGMENTS[i].key))
  const prev = previousRun()
  const texts = [...keys].map((k) => narrationFor(k)).filter((t): t is string => !!t)
  // ฉบับกระชับพากย์เฉพาะป้ายใน brief/ — ฉบับเต็มใช้ป้ายที่ขึ้นในรอบก่อน
  if (BRIEF) texts.push(...keptNotes(keys).map(speechFor))
  // ป้ายที่ขึ้นในรอบก่อน (อ่านตามบทใน note-speech.ts) — ไม่มีรอบก่อนก็สร้างบทของป้ายทั้งหมดไว้
  else if (prev?.notes?.length) texts.push(...prev.notes.filter((n) => keys.has(n.segment)).map((n) => speechFor(n.note)))
  else texts.push(...Object.values(NOTE_SPEECH))
  const started = Date.now()
  const made = await prewarm(texts, undefined, (done, total, text, cached) => {
    if (!done) console.log(`เสียงพากย์ ${total + cached} ประโยค · มีในแคชแล้ว ${cached} · ต้องสร้างใหม่ ${total}`)
    else console.log(`  🔊 สร้างเสียง ${done}/${total} (${Math.floor((done / total) * 100)}%) — ${text.slice(0, 50)}`)
  })
  if (made) console.log(`สร้างเสียงพากย์ล่วงหน้า ${made} ไฟล์ (${((Date.now() - started) / 1000).toFixed(1)} วิ)`)
}
