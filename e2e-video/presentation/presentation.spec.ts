import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, type Page } from '@playwright/test'
import { roleName } from '../director'
import type { ScenarioScript } from '../types'
import { narrationFor } from './brief'
import { runNewIntake } from './intake-new'
import { BEFORE, CUT, CUT_TITLE, PARTS, PARTS_DIR, ROUTE, SEGMENTS, TAB_TITLES, checkpointLabel, checkpointRole } from './plan'
import { Presenter } from './presenter'
import { emit } from './progress'

/**
 * วิดีโอนำเสนอ Journey 02–11 คลิปเดียว: เส้นทางปกติของแฟ้ม WP-2569-000501 ต่อเนื่องตั้งแต่รับเรื่องจนปิดงาน
 * แทรกทางแยกสั้น ๆ 5 จุด (06 เร่งด่วน · 09 ไม่อนุมัติ/อุทธรณ์ · 08A-2/08A-3/08B วิธีที่ 2–4 · 11B ขยายเวลา · 08C ข้อ 14)
 * แล้วกลับเส้นหลัก ครบทุกแท็บ 02–11 ใน flow-map
 * ใช้สคริปต์การกดเดิมใน e2e-video/scenarios/ และบทพากย์ใน narration.ts — ลำดับฉากและการแบ่งส่วนอยู่ใน plan.ts
 * ถ่ายเป็นหลายส่วนพร้อมกัน (PRESENT_WORKERS) แล้ว build-presentation.mjs ต่อเป็นคลิปเดียว
 * ค่าเริ่มต้นเป็นฉบับกระชับ (brief/) — PRESENT_FULL=1 พากย์ทุกป้ายแบบเดิม · PRESENT_CUT เลือกฉบับรวม/แยก case (plan.ts)
 *
 *   pnpm video:presentation                     # คลิปรวม → e2e-video/output-presentation/presentation.mp4
 *   pnpm video:presentation:cases               # แยก case: presentation-main.mp4 + ทางแยกเส้นละคลิป
 *   pnpm video:presentation:all                 # ทั้งสองแบบ
 *   VIDEO_NO_VOICE=1 VIDEO_PACE=0.3 pnpm playwright test -c playwright.presentation.config.ts   # ตรวจสคริปต์เร็ว ไม่มีเสียง
 */

const here = dirname(fileURLToPath(import.meta.url))

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const introHtml = (main: boolean) => `
  <div style="width:1500px;animation:__vidIn .6s ease-out">
    <div style="font-size:21px;letter-spacing:.12em;color:#caa631;font-weight:500">E-CMIS · ระบบคุ้มครองพยาน</div>
    <h1 style="font-size:58px;line-height:1.25;font-weight:600;margin:16px 0 18px">เส้นทางคำร้องขอคุ้มครองพยาน<br>ตั้งแต่รับเรื่องจนปิดงาน</h1>
    <p style="font-size:24px;color:#cbd5e1;margin:0 0 30px">แฟ้มตัวอย่าง WP-2569-000501${
      main ? ' · เส้นทางหลัก' : ' · พร้อมทางแยกกรณีเร่งด่วน อุทธรณ์ วิธีคุ้มครองอื่น ขยายเวลา และส่งต่อตามข้อ 14'
    }</p>
    <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">${ROUTE.map(
      (r, i) =>
        `<span style="padding:8px 16px;border-radius:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.22);font-size:20px">
          <b style="color:#caa631">${r}</b></span>${i < ROUTE.length - 1 ? '<span style="color:#6b829b">→</span>' : ''}`
    ).join('')}</div>
  </div>`

const outroHtml = (main: boolean) => `
  <div style="text-align:center;max-width:1200px;animation:__vidIn .6s ease-out">
    <div style="font-size:22px;color:#caa631;letter-spacing:.1em">สรุปเส้นทาง</div>
    <h1 style="font-size:52px;font-weight:600;margin:16px 0 26px">รับเรื่อง → พิจารณา → คุ้มครอง → ติดตาม ทบทวน → ยุติและปิดงาน</h1>
    ${main ? '' : '<p style="font-size:24px;color:#cbd5e1">ทางแยกที่ได้เห็น: เส้นทางเร่งด่วน · ไม่อนุมัติและอุทธรณ์ · วิธีคุ้มครองที่ 2–4 · ขยายระยะเวลา · ส่งกรมตามข้อ 14</p>'}
  </div>`

const branchHtml = (kind: 'branch' | 'return', branch: string, tabs: string[]) => `
  <div style="text-align:center;max-width:1200px;animation:__vidIn .5s ease-out">
    <div style="display:inline-flex;align-items:center;gap:12px;padding:10px 28px;border-radius:999px;font-size:26px;font-weight:600;
      background:${kind === 'branch' ? '#f59e0b' : '#22704a'};color:${kind === 'branch' ? '#1f2937' : '#fff'}">
      ${kind === 'branch' ? '⤷ ทางแยก' : '⤶ กลับสู่เส้นทางหลัก'}</div>
    <h2 style="font-size:46px;font-weight:600;margin:24px 0 14px">${kind === 'branch' ? esc(branch) : esc(TAB_TITLES[tabs[0]])}</h2>
    <div style="font-size:22px;color:#93c5fd">แท็บ ${tabs.map(esc).join(' → ')}</div>
  </div>`

test.describe.configure({ mode: 'parallel' })

for (const [n, part] of PARTS.entries()) {
  test(`presentation · ${CUT} · ส่วน ${n + 1}/${PARTS.length} (ฉาก ${part[0] + 1}–${part[part.length - 1] + 1})`, async ({ page }) => {
    test.setTimeout(150 * 60_000)
    await recordPart(page, n + 1, part)
  })
}

const scripts = new Map<string, ScenarioScript>()
async function scriptOf(id: string) {
  if (!scripts.has(id)) scripts.set(id, (await import(`../scenarios/${id}.ts`)).default)
  return scripts.get(id)!
}

async function recordPart(page: Page, n: number, part: number[]) {
  // อุ่นแอปก่อน (dev server เพิ่งเริ่มอาจ optimize dependency แล้วรีโหลดหน้า) — ช่วงนี้ถูกตัดทิ้งจากวิดีโอ
  await page.goto('/')
  await page.locator('#topbar-role-select').waitFor({ timeout: 120_000 })
  await page.waitForTimeout(1500)

  const d = new Presenter(page)
  d.part = n
  await d.install()
  emit({ type: 'part-start', part: n, of: PARTS.length, first: part[0] + 1, last: part[part.length - 1] + 1, scenes: part.length })
  // ส่วนที่เริ่มกลางเรื่องตั้งต้นด้วยบทบาท/แท็บเดียวกับตอนถ่ายต่อเนื่อง — ขั้นแรกจึงสลับบทบาทด้วยเมาส์เหมือนคลิปเดียว
  d.currentRole = BEFORE[part[0]].role
  let lastMainTab = BEFORE[part[0]].lastMainTab
  let loaded = false
  /** วินาทีที่ตัดหัววิดีโอทิ้ง (ช่วงรอแอปโหลดครั้งแรก) */
  let trim = 0

  for (const i of part) {
    const seg = SEGMENTS[i]
    d.segment = seg.key
    const text = narrationFor(seg.key)
    if (!text) throw new Error(`ไม่มีบทพากย์ "${seg.key}"`)
    const sceneStarted = Date.now()
    emit({
      type: 'scene-start', part: n, index: i + 1, total: SEGMENTS.length, key: seg.key, kind: seg.kind,
      title: seg.kind === 'step' ? checkpointLabel(seg.scenario, seg.key) : text.slice(0, 60),
      role: seg.kind === 'step' ? roleName(checkpointRole(seg.scenario, seg.key)) : undefined,
    })
    const sceneEnd = () => emit({ type: 'scene-end', part: n, index: i + 1, key: seg.key, seconds: (Date.now() - sceneStarted) / 1000 })

    if (seg.kind === 'intake') {
      // ธุรการกด "รับคำร้องใหม่" กรอกย่อแล้วบันทึก — ขั้นถัดไป (Case 1) โหลดแฟ้มตัวอย่างใหม่ทับ
      await d.loadCheckpoint('Case 1', 'receiver', '/registry')
      if (!loaded) trim = Math.max(0, (Date.now() - d.t0) / 1000 - 0.5)
      loaded = true
      d.currentRole = 'receiver'
      d.mark('receiver', 'ธุรการรับคำร้องใหม่')
      await d.setStage({
        tab: '02', title: TAB_TITLES['02'], step: 'ธุรการรับคำร้องใหม่', role: 'receiver', route: ROUTE, doneTabs: [],
      })
      await d.say(seg.key, text)
      await runNewIntake(d)
      await d.waitVoice()
      await d.pause(400)
      sceneEnd()
      continue
    }

    if (seg.kind !== 'step') {
      if (!loaded) {
        // ฉากเปิดต้องมีหน้าแอปอยู่ข้างหลัง — โหลดจุดพักของขั้นแรกในส่วนนี้ไว้ก่อน
        const first = part.map((k) => SEGMENTS[k]).find((s) => s.kind === 'step')
        const role = first?.kind === 'step' ? checkpointRole(first.scenario, first.key) : 'receiver'
        await d.loadCheckpoint(first?.kind === 'step' ? first.key : 'Case 1', role)
        d.currentRole = role
        loaded = true
        trim = Math.max(0, (Date.now() - d.t0) / 1000 - 0.3)
      }
      d.mark(d.currentRole ?? 'receiver', seg.kind === 'intro' ? 'เปิดเรื่อง' : seg.kind === 'outro' ? 'สรุป' : text.slice(0, 40))
      const main = CUT === 'main'
      const html =
        seg.kind === 'branch' || seg.kind === 'return'
          ? branchHtml(seg.kind, seg.branch, seg.tabs)
          : seg.kind === 'intro' ? introHtml(main) : outroHtml(main)
      // ฉบับแยกทางแยกเปิดด้วยการ์ดทางแยกแบบทึบ (ยังไม่มีเรื่องก่อนหน้าให้เห็นข้างหลัง)
      const opaque = seg.kind === 'intro' || seg.kind === 'outro' || i === 0
      await d.narratedCard(seg.key, text, html, opaque)
      sceneEnd()
      continue
    }

    const script = (await scriptOf(seg.scenario)).steps[seg.key]
    if (!script) throw new Error(`${seg.scenario}: ไม่มีสคริปต์ของจุดพัก "${seg.key}"`)
    const role = checkpointRole(seg.scenario, seg.key)
    const prev = d.currentRole

    // เปิดจุดพักด้วยบทบาทเดิมก่อน แล้วสลับบทบาทด้วยเมาส์ให้เห็นบน TopBar
    await d.loadCheckpoint(seg.key, prev && prev !== role ? prev : role, script.path)
    // เก็บช่วงจางจากพื้นกรมท่า (~0.45 วิ ท้าย loadCheckpoint) ไว้ — ต้นส่วนกลางเรื่องจึงต่อกับส่วนก่อนเหมือนเปลี่ยนฉากปกติ
    if (!loaded) trim = Math.max(0, (Date.now() - d.t0) / 1000 - 0.5)
    loaded = true
    if (!seg.branch) lastMainTab = seg.tab
    const stage = {
      tab: seg.tab, title: TAB_TITLES[seg.tab], step: checkpointLabel(seg.scenario, seg.key), role,
      branch: seg.branch, route: ROUTE,
      doneTabs: ROUTE.slice(0, ROUTE.indexOf(lastMainTab) + (seg.branch ? 1 : 0)),
    }
    if (prev && prev !== role) {
      await d.setStage({ ...stage, role: prev })
      await d.pause(500)
      await d.switchRoleByMouse(role)
      const want = script.path || readTo(seg.key)
      if (want && !page.url().includes(want)) await d.goto(want)
    }
    d.currentRole = role
    d.mark(role, stage.step)
    await d.setStage(stage)
    await d.say(seg.key, text)
    await script.run(d)
    await d.waitVoice()
    await d.pause(600)
    sceneEnd()
  }

  // ปิดป้ายขั้นตอนเฉพาะท้ายคลิป — ส่วนกลางเรื่องตัดต่อกับส่วนถัดไปทันที
  if (n === PARTS.length) {
    await d.setStage(null)
    await d.pause(800)
  }
  const wall = (Date.now() - d.t0) / 1000
  const video = page.video()
  await page.close()
  const id = String(n).padStart(2, '0')
  await video?.saveAs(resolve(PARTS_DIR, `${id}.webm`))
  emit({ type: 'part-end', part: n, seconds: wall, video: `${id}.webm` })
  writeFileSync(
    resolve(PARTS_DIR, `${id}.json`),
    JSON.stringify(
      {
        part: n,
        of: PARTS.length,
        title: CUT_TITLE,
        cut: CUT,
        wall,
        trim,
        cues: d.cues,
        notes: d.notes,
        stages: d.stages,
        chapters: d.chapters.map((c) => ({ ...c, roleName: roleName(c.role) })),
      },
      null,
      2
    )
  )
}

function readTo(mockState: string): string | null {
  const raw = JSON.parse(readFileSync(resolve(here, '../../src/mock-states', `${mockState}.json`), 'utf-8'))
  return raw.to ?? null
}
