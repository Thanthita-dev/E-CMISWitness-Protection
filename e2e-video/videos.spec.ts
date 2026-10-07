import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'
import type { FlowGuideData } from '../src/lib/flowGuide'
import type { UserRole } from '../src/types/user'
import { Director, mockStateRole, roleName } from './director'
import type { ScenarioScript } from './types'

/**
 * วิดีโอสอนใช้งาน 1 คลิปต่อ 1 เส้นทางตัวอย่างใน flow-map.json (ลำดับและจุดพักมาจาก flow-map ทั้งหมด)
 * สคริปต์การกดของแต่ละจุดพักอยู่ที่ e2e-video/scenarios/<id>.ts
 *
 *   pnpm video                          # ถ่ายทุกเส้นทาง + แปลง MP4 + หน้ารวม
 *   VIDEO_ONLY=appeal,extension pnpm playwright test -c playwright.video.config.ts
 */

const here = dirname(fileURLToPath(import.meta.url))
const RAW_DIR = resolve(here, 'output/raw')
const flowMap = JSON.parse(readFileSync(resolve(here, '../src/flow-guide/flow-map.json'), 'utf-8')) as FlowGuideData

const only = (process.env.VIDEO_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean)
/** ถ่ายเฉพาะช่วงจุดพัก (นับจาก 1) — ใช้ตอนแก้สคริปต์ส่วนเดียวของเส้นทางยาว เช่น VIDEO_FROM=11 */
const FROM = Number(process.env.VIDEO_FROM || 1)
const TO = Number(process.env.VIDEO_TO || Infinity)

flowMap.scenarios.forEach((scenario, i) => {
  const order = i + 1
  if (only.length && !only.includes(scenario.id)) return

  test(`${String(order).padStart(2, '0')} ${scenario.id} · ${scenario.title}`, async ({ page }) => {
    // โหลดสคริปต์เฉพาะเส้นทางที่ถ่าย — ไฟล์ของเส้นทางอื่นที่ยังแก้ไม่เสร็จจึงไม่ทำให้รอบนี้พัง
    const script: ScenarioScript = (await import(`./scenarios/${scenario.id}.ts`)).default
    const steps = scenario.checkpoints.map((c) => {
      const s = script.steps[c.mock_state]
      if (!s) throw new Error(`${scenario.id}: ไม่มีสคริปต์ของจุดพัก "${c.mock_state}"`)
      return { ...c, role: (c.role as UserRole | null) ?? mockStateRole(c.mock_state), script: s }
    })
    const partial = FROM > 1 || TO < steps.length

    const d = new Director(page)
    await d.install()

    for (const [k, step] of steps.entries()) {
      if (k + 1 < FROM || k + 1 > TO) continue
      await d.loadCheckpoint(step.mock_state, step.role, step.script.path)
      if (k + 1 === FROM) {
        await d.titleCard({
          order, title: scenario.title, summary: scenario.summary, tabs: scenario.tabs,
          steps: steps.map((s) => ({ role: s.role, label: s.label })),
        })
      }
      d.mark(step.role, step.label)
      const info = { index: k + 1, total: steps.length, role: step.role, label: step.label }
      if (step.role !== d.currentRole) await d.roleCard({ ...info, detail: step.script.detail })
      else await d.stepBadge(info)
      d.currentRole = step.role
      await step.script.run(d)
      await d.pause(900)
    }

    const video = page.video()
    await page.close()
    const base = `${String(order).padStart(2, '0')}-${scenario.id}${partial ? `.part-${FROM}-${Math.min(TO, steps.length)}` : ''}`
    mkdirSync(RAW_DIR, { recursive: true })
    await video?.saveAs(resolve(RAW_DIR, `${base}.webm`))
    if (partial) return
    writeFileSync(
      resolve(RAW_DIR, `${base}.json`),
      JSON.stringify(
        {
          order, id: scenario.id, title: scenario.title, summary: scenario.summary, tabs: scenario.tabs,
          roles: [...new Set(steps.map((s) => s.role))].map((r) => ({ role: r, name: roleName(r) })),
          chapters: d.chapters.map((m) => ({ ...m, roleName: roleName(m.role) })),
        },
        null,
        2
      )
    )
  })
})
