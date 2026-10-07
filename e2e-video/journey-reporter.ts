import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Reporter, TestCase, TestResult, TestStep } from '@playwright/test/reporter'

/**
 * Reporter ของชุดวิดีโอ Journey — คัดลอก video.webm ของแต่ละเทสต์ไปที่ e2e-video/output-journeys/raw/
 * พร้อมไฟล์ .json (ชื่อ, ขั้นตอนจาก test.step ระดับบนสุดพร้อมเวลาในวิดีโอ) ให้ build-videos.mjs ใช้สร้างหน้ารวม
 */

const here = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = resolve(here, 'output-journeys/raw')

interface Chapter {
  at: number
  label: string
}

export default class JourneyVideoReporter implements Reporter {
  /** เวลาเริ่มอัดวิดีโอ (ตอนสร้าง page fixture เสร็จ) และขั้นตอนของแต่ละเทสต์ */
  private readonly runs = new Map<TestResult, { videoStart?: number; steps: Array<{ start: number; label: string }> }>()

  private run(result: TestResult) {
    let r = this.runs.get(result)
    if (!r) this.runs.set(result, (r = { steps: [] }))
    return r
  }

  onStepEnd(_test: TestCase, result: TestResult, step: TestStep) {
    // วิดีโอเริ่มเมื่อ context เปิดหน้าแรก — ใช้เวลาจบของ fixture "page" เป็นจุด 0 ของวิดีโอ
    if (step.category === 'fixture' && step.title.includes('page')) {
      const r = this.run(result)
      r.videoStart ??= step.startTime.getTime() + step.duration
    }
  }

  onStepBegin(_test: TestCase, result: TestResult, step: TestStep) {
    if (step.category !== 'test.step' || step.parent) return
    this.run(result).steps.push({ start: step.startTime.getTime(), label: step.title })
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const video = result.attachments.find((a) => a.name === 'video' && a.path)
    const r = this.runs.get(result)
    this.runs.delete(result)
    if (!video?.path) return

    const [code, ...rest] = test.title.split(' · ')
    const id = code.trim().toLowerCase()
    const base = basename(test.location.file, '.spec.ts')
    const origin = r?.videoStart ?? result.startTime.getTime()
    const chapters: Chapter[] = (r?.steps ?? []).map((s) => ({ at: Math.max(0, (s.start - origin) / 1000), label: s.label }))
    const describe = test.parent.type === 'describe' ? test.parent.title : ''

    mkdirSync(RAW_DIR, { recursive: true })
    copyFileSync(video.path, resolve(RAW_DIR, `${base}.webm`))
    writeFileSync(
      resolve(RAW_DIR, `${base}.json`),
      JSON.stringify(
        {
          order: Number(code.match(/\d+/)?.[0] ?? 0),
          id,
          code: code.trim(),
          title: rest.join(' · ').trim() || test.title,
          group: describe,
          status: result.status,
          chapters,
        },
        null,
        2
      )
    )
  }
}
