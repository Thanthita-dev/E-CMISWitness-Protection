import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from '@playwright/test'
import { GuideDirector } from './guide-director'
import common from './flows/common'
import main from './flows/main'
import article14 from './flows/article14'
import article14Ceiling from './flows/article14-ceiling'
import appeal from './flows/appeal'
import methods from './flows/methods'
import method4 from './flows/method4'
import fastTrack from './flows/fast-track'
import fastTrackDenied from './flows/fast-track-denied'
import returns from './flows/returns'
import extension from './flows/extension'
import intake from './flows/intake'
import type { GuideFlow } from './types'

/**
 * คู่มือภาพหน้าจอ demo — เรื่อง WP-2569-000612 “สูบบุหรี่ในที่ทำงาน” (พยาน ตรีรุด หล่อจัง)
 * เริ่มจากข้อมูลตั้งต้น Demo แล้วเดินต่อเนื่องในข้อมูลชุดเดียว (ไม่โหลดจุดพักกลางทาง)
 *
 *   main     ช่วงร่วม (ทะเบียน → เลขาธิการฯ) + อนุมัติ → คุ้มครอง → ปิดงาน
 *   ทางแยก  เดิน prefix (ค่าเริ่มต้น: ช่วงร่วมทั้งหมด) โดยไม่ถ่ายภาพ แล้วถ่ายเฉพาะช่วงที่ต่างจากเส้นหลัก
 *
 * ลำดับในรายการนี้คือลำดับแท็บในหน้าคู่มือ
 * รัน: pnpm guide   (เฉพาะเส้น: pnpm guide -- -g article14)
 */

const here = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(here, '../../output-guide')

export const FLOWS: GuideFlow[] = [main, article14, article14Ceiling, appeal, methods, method4, fastTrack, fastTrackDenied, returns, extension, intake]

FLOWS.forEach((flow, order) => {
  test(flow.id, async ({ page }) => {
    const d = new GuideDirector(page, resolve(OUT, flow.id))
    await d.install()
    await d.loadCheckpoint('Demo', 'receiver', '/registry')
    d.currentRole = 'receiver'

    if (flow.id === 'main') {
      await common.run(d)
    } else {
      d.recording = false
      await (flow.prefix ?? common.run)(d)
      d.recording = true
    }
    await flow.run(d)

    d.save({
      id: flow.id,
      title: flow.title,
      summary: flow.summary,
      order,
      branchFrom: flow.id === 'main' ? undefined : common.title,
      branchSection: flow.branchSection,
      caseNo: flow.caseNo,
    })
  })
})
