import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import { switchRole } from '../e2e/helpers/seed'

const here = dirname(fileURLToPath(import.meta.url))
export const OUTPUT_DIR = resolve(here, 'output')

export const ROLE_LABELS: Record<string, string> = {
  officer: 'เจ้าหน้าที่',
  supervisor: 'ผบช.ชั้นต้น',
  deputy_secretary: 'รองเลขาธิการฯ',
  secretary: 'เลขาธิการฯ',
  committee: 'คณะกรรมการ ป.ป.ท.',
}

interface Step {
  n: number
  title: string
  detail: string
  role: string
  file: string
}

/**
 * ตัวบันทึกภาพของหนึ่งสถานการณ์ — ภาพเรียงเลขตามลำดับขั้น และเขียน steps.json ให้สคริปต์สร้างหน้ารวมภาพอ่าน
 */
export function createRecorder(
  page: Page,
  scenario: { id: string; flow: 'appeal' | 'article14'; order: number; title: string; summary: string; testRef: string },
  initialRole: string
) {
  const dir = resolve(OUTPUT_DIR, scenario.id)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const steps: Step[] = []
  let role = initialRole

  const save = () =>
    writeFileSync(resolve(dir, 'steps.json'), JSON.stringify({ ...scenario, steps }, null, 2), 'utf-8')

  /**
   * ถ่ายภาพเฉพาะส่วนที่อยู่บนจอ (16:9) — ถ้าระบุ `focus` จะเลื่อนส่วนนั้นเข้ากลางจอก่อน
   * ไม่ระบุ = ถ่ายตำแหน่งที่ผู้ใช้เห็นอยู่ตอนนั้น (เช่น หลังกดปุ่ม หน้าจอยังค้างอยู่ที่เดิม)
   */
  async function shot(title: string, detail = '', focus?: Locator, block: 'center' | 'start' = 'center') {
    if (focus) {
      await focus.first().evaluate((el, b) => el.scrollIntoView({ block: b as ScrollLogicalPosition }), block)
    }
    // รอให้แอนิเมชันของจอยืนยัน/toast และการเลื่อนจอนิ่งก่อนถ่าย
    await page.waitForTimeout(450)
    const n = steps.length + 1
    const file = `${String(n).padStart(2, '0')}.png`
    await page.screenshot({ path: resolve(dir, file) })
    steps.push({ n, title, detail, role: ROLE_LABELS[role] ?? role, file })
    save()
  }

  /** สลับผู้ใช้แล้วถ่ายภาพหน้าที่ผู้ใช้คนนั้นเห็น */
  async function asRole(nextRole: string, url?: string) {
    role = nextRole
    await switchRole(page, nextRole)
    if (url) await page.goto(url)
    await page.waitForLoadState('networkidle')
  }

  /** ถ่ายจอยืนยันก่อนกด แล้วถ่ายผลหลังกด */
  async function confirm(buttonName: string, title: string, detail = '', resultFocus?: Locator) {
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await shot(`จอยืนยัน — ${title}`, 'ระบบสรุปสิ่งที่จะเกิดขึ้นก่อนให้ผู้ใช้กดยืนยัน')
    await page.getByRole('button', { name: buttonName, exact: true }).click()
    await dialog.waitFor({ state: 'detached' })
    await shot(`ผลลัพธ์ — ${title}`, detail, resultFocus)
  }

  return { shot, asRole, confirm, save }
}

/** หา input/select/textarea ที่เป็น sibling ถัดจาก label ข้อความที่ระบุ */
export function fieldAfterLabel(scope: Locator, labelText: string) {
  return scope.locator('label', { hasText: labelText }).locator('xpath=following-sibling::*[1]')
}
