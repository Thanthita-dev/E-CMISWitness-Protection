import { execFile, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

/**
 * เสียงพากย์ไทยจาก Microsoft Edge TTS (เสียง Neural) — ต้องมีคำสั่ง edge-tts (`pip install edge-tts`)
 * หรือระบุตำแหน่งด้วย EDGE_TTS=/path/to/edge-tts (ถ้ามี venv ที่ e2e-video/output-presentation/.venv จะใช้ตัวนั้นก่อน)
 * ไฟล์เสียงเก็บแคชตามข้อความ จึงสร้างใหม่เฉพาะประโยคที่แก้ — prewarm() สร้างล่วงหน้าแบบขนานก่อนเริ่มถ่าย
 *
 *   TTS_VOICE=th-TH-PremwadeeNeural (ค่าเริ่มต้น เสียงผู้หญิง) · TTS_RATE=-4% · TTS_PITCH=+0Hz
 *   TTS_CONCURRENCY=16 จำนวนประโยคที่สร้างพร้อมกันตอน prewarm (วัดแล้ว 16 ประโยคพร้อมกัน ~8 วิ เทียบทีละประโยค ~6 วิ/ประโยค)
 */

const here = dirname(fileURLToPath(import.meta.url))
export const TTS_DIR = resolve(here, '../output-presentation/tts')

const LOCAL_BIN = resolve(here, '../output-presentation/.venv/bin/edge-tts')
const BIN = process.env.EDGE_TTS || (existsSync(LOCAL_BIN) ? LOCAL_BIN : 'edge-tts')
const VOICE = process.env.TTS_VOICE || 'th-TH-PremwadeeNeural'
const RATE = process.env.TTS_RATE || '-4%'
const PITCH = process.env.TTS_PITCH || '+0Hz'

/** คำย่อที่เครื่องอ่านออกเสียงผิด → คำอ่าน (ซับไตเติลยังแสดงคำย่อตามหน้าจอ) */
const SPOKEN: Array<[RegExp, string]> = [
  [/คบ\.\s?(\d+)/g, 'คอบอ $1'],
  [/ป\.ป\.ท\./g, 'ปอปอทอ'],
  [/ผบช\.\s?ชั้นต้น/g, 'ผู้บังคับบัญชาชั้นต้น'],
  [/ผบช\./g, 'ผู้บังคับบัญชา'],
  [/ผอ\.สำนัก\/กอง/g, 'ผู้อำนวยการสำนักหรือกอง'],
  [/ผอ\./g, 'ผู้อำนวยการ'],
  [/กบค\./g, 'กอบอคอ'],
  [/สำนัก\/กอง/g, 'สำนักหรือกอง'],
  [/(\S)ฯ/g, '$1'],
  [/\s*\/\s*/g, ' หรือ '],
  [/(\d+)\s*\((\d+)\)/g, '$1 อนุ $2'],
]

export function spoken(text: string) {
  return SPOKEN.reduce((s, [re, to]) => s.replace(re, to), text).replace(/\s+/g, ' ').trim()
}

export interface Voice {
  file: string
  seconds: number
}

/** ความยาวไฟล์เสียง (วินาที) — คืน null ถ้าไฟล์เสีย/ว่าง */
function duration(file: string): number | null {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const seconds = Number(out.toString().trim())
    return seconds > 0 ? seconds : null
  } catch {
    return null
  }
}

const RETRIES = 5
const run = promisify(execFile)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function target(text: string) {
  const say = spoken(text)
  const hash = createHash('sha1').update(`${VOICE}|${RATE}|${PITCH}|${say}`).digest('hex').slice(0, 16)
  return { say, file: resolve(TTS_DIR, `${hash}.mp3`) }
}

const ttsArgs = (say: string, file: string) => ['--voice', VOICE, `--rate=${RATE}`, `--pitch=${PITCH}`, '--text', say, '--write-media', file]

export function synth(text: string): Voice {
  mkdirSync(TTS_DIR, { recursive: true })
  const { say, file } = target(text)
  const cached = existsSync(file) ? duration(file) : null
  if (cached) return { file, seconds: cached }

  // บริการ edge-tts บางครั้งตอบ "No audio was received" ชั่วคราว → ลองใหม่ และไม่เก็บไฟล์เสียไว้ในแคช
  for (let attempt = 1; ; attempt++) {
    rmSync(file, { force: true })
    try {
      execFileSync(BIN, ttsArgs(say, file), { stdio: ['ignore', 'ignore', 'pipe'] })
      const seconds = duration(file)
      if (seconds) return { file, seconds }
    } catch (error) {
      if (attempt > RETRIES) {
        rmSync(file, { force: true })
        throw error
      }
    }
    if (attempt > RETRIES) {
      rmSync(file, { force: true })
      throw new Error(`edge-tts ได้ไฟล์เสียงที่ใช้ไม่ได้: "${say}"`)
    }
    console.warn(`edge-tts ล้มเหลว ลองใหม่ ${attempt}/${RETRIES}: "${say.slice(0, 40)}"`)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 2000)
  }
}

async function synthAsync(text: string) {
  const { say, file } = target(text)
  if (existsSync(file) && duration(file)) return
  for (let attempt = 1; ; attempt++) {
    rmSync(file, { force: true })
    try {
      await run(BIN, ttsArgs(say, file))
      if (duration(file)) return
    } catch (error) {
      if (attempt > RETRIES) throw error
    }
    if (attempt > RETRIES) throw new Error(`edge-tts ได้ไฟล์เสียงที่ใช้ไม่ได้: "${say}"`)
    await sleep(attempt * 2000)
  }
}

/** สร้างไฟล์เสียงของทุกข้อความล่วงหน้าแบบขนาน (ข้ามที่มีในแคชแล้ว) — ตอนถ่าย synth() จะได้ไฟล์จากแคชทันที */
export async function prewarm(
  texts: Iterable<string>,
  concurrency = Number(process.env.TTS_CONCURRENCY || 16),
  onProgress?: (done: number, total: number, text: string, cached: number) => void
) {
  mkdirSync(TTS_DIR, { recursive: true })
  // เช็กแค่มีไฟล์ (ไม่เรียก ffprobe ทีละไฟล์) — ไฟล์เสียถูกสร้างใหม่ตอน synth() อยู่แล้ว
  const all = [...new Set(texts)]
  const todo = all.filter((t) => !existsSync(target(t).file))
  onProgress?.(0, todo.length, '', all.length - todo.length)
  if (!todo.length) return 0
  let next = 0
  let done = 0
  await Promise.all(
    Array.from({ length: Math.min(concurrency, todo.length) }, async () => {
      while (next < todo.length) {
        const text = todo[next++]
        await synthAsync(text)
        onProgress?.(++done, todo.length, text, all.length - todo.length)
      }
    })
  )
  return todo.length
}
