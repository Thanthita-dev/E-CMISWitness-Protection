import type { FullConfig, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { PARTS } from './plan'
import { PROGRESS_TAG, type ProgressEvent } from './progress'

/**
 * แสดงความคืบหน้าการถ่ายวิดีโอนำเสนออย่างละเอียด — อ่านบรรทัด "@@progress" จากทุก worker
 * - เริ่ม/จบแต่ละส่วนและแต่ละฉาก (ลำดับฉาก บทบาท ชื่อขั้น) พร้อมเปอร์เซ็นต์รวมและเวลาที่เหลือโดยประมาณ
 * - ทุกการกด/ป้าย (🔊 พากย์ · 🔇 ทำเงียบในฉบับกระชับ)
 * - ทุก 30 วิที่ไม่มีความเคลื่อนไหว แสดงสถานะว่าแต่ละส่วนค้างอยู่ฉากไหนนานเท่าไร
 * PRESENT_PROGRESS=scenes แสดงเฉพาะระดับฉาก (ไม่แสดงทุกการกด)
 */

const C = process.stdout.isTTY ? { dim: '\x1b[2m', b: '\x1b[1m', g: '\x1b[32m', y: '\x1b[33m', r: '\x1b[31m', c: '\x1b[36m', x: '\x1b[0m' } : { dim: '', b: '', g: '', y: '', r: '', c: '', x: '' }
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

export default class ProgressReporter implements Reporter {
  private started = Date.now()
  /** จำนวนฉากทั้งรอบ (ทุกส่วนรวมกัน) จากการแบ่งส่วนเดียวกับ worker */
  private readonly total = PARTS.flat().length
  private done = 0
  private actions = 0
  private lastEvent = Date.now()
  private readonly current = new Map<number, { key: string; title: string; since: number; index: number }>()
  private readonly parts = new Map<number, { of: number; scenes: number; done: number }>()
  private timer?: NodeJS.Timeout
  private readonly detail = process.env.PRESENT_PROGRESS !== 'scenes'

  onBegin(config: FullConfig, suite: Suite) {
    const cut = process.env.PRESENT_CUT || 'full'
    const mode = process.env.PRESENT_FULL === '1' ? 'ฉบับเต็ม' : 'ฉบับกระชับ'
    const voice = process.env.VIDEO_NO_VOICE === '1' ? ' · ไม่มีเสียง' : ''
    console.log(`${C.b}▶ ถ่ายวิดีโอนำเสนอ · ${cut} · ${mode}${voice}${C.x} — ${suite.allTests().length} ส่วน · ${this.total} ฉาก · ${config.workers} worker · pace ${process.env.VIDEO_PACE}`)
    this.timer = setInterval(() => this.heartbeat(), 5_000)
    this.timer.unref()
  }

  private elapsed() {
    return mmss((Date.now() - this.started) / 1000)
  }

  /** เปอร์เซ็นต์ฉากที่เสร็จ + เวลาที่เหลือ (ประมาณจากความเร็วเฉลี่ยของฉากที่เสร็จแล้ว) */
  private overall() {
    if (!this.total) return ''
    const pct = Math.floor((this.done / this.total) * 100)
    const spent = (Date.now() - this.started) / 1000
    const eta = this.done ? ` · เหลือ ~${mmss((spent / this.done) * (this.total - this.done))}` : ''
    return `${C.c}${this.done}/${this.total} ฉาก ${pct}%${eta}${C.x}`
  }

  private line(part: number, text: string) {
    const of = this.parts.get(part)?.of ?? '?'
    console.log(`${C.dim}[${this.elapsed()}]${C.x} ส่วน ${part}/${of} │ ${text}`)
  }

  private handle(e: ProgressEvent) {
    this.lastEvent = Date.now()
    switch (e.type) {
      case 'part-start':
        this.parts.set(e.part, { of: e.of, scenes: e.scenes, done: 0 })
        this.line(e.part, `${C.b}เริ่มถ่าย${C.x} ฉาก ${e.first}–${e.last} (${e.scenes} ฉาก)`)
        break
      case 'scene-start': {
        this.current.set(e.part, { key: e.key, title: e.title, since: Date.now(), index: e.index })
        const who = e.role ? ` · 👤 ${e.role}` : ''
        this.line(e.part, `${C.y}▸ ฉาก ${e.index}/${e.total}${C.x} ${C.b}${e.key}${C.x}${who} — ${e.title}`)
        break
      }
      case 'action':
        this.actions++
        if (this.detail) console.log(`${C.dim}           ${e.voiced ? '🔊' : '🔇'} ${e.note}${C.x}`)
        break
      case 'scene-end': {
        this.done++
        const p = this.parts.get(e.part)
        if (p) p.done++
        this.current.delete(e.part)
        this.line(e.part, `${C.g}✓ ${e.key}${C.x} ${mmss(e.seconds)} · ส่วนนี้ ${p?.done ?? '?'}/${p?.scenes ?? '?'} · รวม ${this.overall()}`)
        break
      }
      case 'part-end':
        this.line(e.part, `${C.g}${C.b}■ ส่วนนี้เสร็จ${C.x} วิดีโอดิบ ${mmss(e.seconds)} → ${e.video}`)
        break
    }
  }

  /** ไม่มีความเคลื่อนไหวเกิน 30 วิ — บอกว่าแต่ละส่วนอยู่ฉากไหน (ช่วยดูว่าค้างหรือแค่รอเสียงพากย์) */
  private heartbeat() {
    if (Date.now() - this.lastEvent < 30_000 || !this.current.size) return
    this.lastEvent = Date.now()
    const now = [...this.current.entries()]
      .sort(([a], [b]) => a - b)
      .map(([part, c]) => `ส่วน ${part}: ${c.key} (${mmss((Date.now() - c.since) / 1000)})`)
      .join(' · ')
    console.log(`${C.dim}[${this.elapsed()}] ⏳ กำลังถ่าย — ${now} · รวม ${this.overall()}${C.x}`)
  }

  onStdOut(chunk: string | Buffer) {
    for (const raw of chunk.toString().split('\n')) {
      if (!raw.trim()) continue
      if (raw.startsWith(PROGRESS_TAG)) {
        try {
          this.handle(JSON.parse(raw.slice(PROGRESS_TAG.length)))
        } catch {
          console.log(raw)
        }
      } else console.log(raw)
    }
  }

  onStdErr(chunk: string | Buffer) {
    process.stderr.write(chunk)
  }

  onTestEnd(test: TestCase, result: TestResult) {
    if (result.status === 'passed') return
    console.log(`${C.r}${C.b}✗ ${test.title} — ${result.status} (${mmss(result.duration / 1000)})${C.x}`)
    for (const err of result.errors) console.log(`${C.r}${(err.stack || err.message || '').split('\n').slice(0, 12).join('\n')}${C.x}`)
  }

  onEnd(result: { status: string }) {
    clearInterval(this.timer)
    const ok = result.status === 'passed'
    console.log(
      `${ok ? C.g : C.r}${C.b}${ok ? '✔ ถ่ายเสร็จ' : '✘ ถ่ายไม่สำเร็จ'}${C.x} ใช้เวลา ${this.elapsed()} · ${this.done}/${this.total} ฉาก · ${this.actions} การกด/ป้าย`
    )
  }

  printsToStdio() {
    return true
  }
}
