import type { Page } from '@playwright/test'
import { passSarabanCheckpoint } from './saraban'
import { switchRole } from './seed'

/**
 * ยุติการคุ้มครอง (คบ.15/16/17/7) — เอกสารข้ามหน่วย ↔ สำนักงานเลขาธิการต้องผ่านธุรการทั้งสองฝั่ง
 * ขาไป: ธุรการหน่วย (ลงเลขส่ง) → ธุรการสำนักงานเลขาธิการ (ลงเลขรับ) → เลขาธิการ
 */
export async function termUpLeg(page: Page, caseNo: string, afterRole = 'secretary') {
  await passSarabanCheckpoint(page, caseNo, 'receiver')
  await passSarabanCheckpoint(page, caseNo, 'secretary_receiver', { afterRole })
}

/** ขากลับ: ธุรการสำนักงานเลขาธิการ (ลงเลขส่ง) → ธุรการหน่วย (ลงเลขรับ) → ผู้รับปลายทาง */
export async function termDownLeg(page: Page, caseNo: string, afterRole = 'officer') {
  await passSarabanCheckpoint(page, caseNo, 'secretary_receiver')
  await passSarabanCheckpoint(page, caseNo, 'receiver', { afterRole })
}

/**
 * WIT1131-WIT1134 — ลงนาม คบ.15 ตามลำดับชั้น: ผอ.สำนัก/กอง → (ธุรการขาไป) → รองเลขาธิการ → เลขาธิการ
 * จบที่เลขาธิการลงนามแล้ว พร้อมพิจารณาอนุมัติยุติ (WIT1136) ในหน้าเดียวกัน
 */
export async function signKb15Chain(page: Page, caseNo: string) {
  const termUrl = `/termination/${encodeURIComponent(caseNo)}`
  const act = async (role: string, button: string | RegExp, confirm: string) => {
    await switchRole(page, role)
    await page.goto(termUrl)
    await page.getByRole('button', { name: button }).click()
    await page.locator('.swal2-popup').getByRole('button', { name: confirm, exact: true }).click()
    await page.locator('.swal2-popup').waitFor({ state: 'hidden' })
  }
  await act('director', 'เห็นชอบ · ส่งรองเลขาธิการ', 'ยืนยันครบถ้วน')
  await termUpLeg(page, caseNo, 'deputy_secretary')
  await act('deputy_secretary', 'เห็นชอบ · ส่งเลขาธิการ', 'ยืนยันครบถ้วน')
  await act('secretary', /^ลงนาม คบ\.15$/, 'ยืนยันลงนาม')
}

/**
 * WIT1138 → WIT1139 — บันทึกแบบ คบ.16 ที่ /form/16 แล้วส่งจากแถว คบ.16 ในแฟ้มคำร้อง (ทางเดียวกับ คบ.15/คบ.17)
 * เริ่มจากหน้าแบบฟอร์ม คบ.16 ที่กรอกครบแล้ว
 */
export async function saveAndSubmitKb16(page: Page, caseNo: string) {
  await page.getByRole('button', { name: /บันทึกแบบ คบ\.16$/ }).click()
  await page.waitForURL(new RegExp(`/termination/${encodeURIComponent(caseNo)}$`))
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
  await page.locator('[data-testid="dossier-form-row"][data-form-number="16"]').getByRole('button', { name: /ส่งให้อนุมัติ$/ }).click()
  await page.locator('.swal2-popup .swal2-confirm').click()
  await page.locator('.swal2-popup:not(.swal2-toast)').waitFor({ state: 'hidden' })
}
