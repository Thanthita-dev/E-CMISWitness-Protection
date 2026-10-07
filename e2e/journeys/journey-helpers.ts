import { expect, type Locator, type Page } from '@playwright/test'
import { readCase } from '../helpers/seed'

/**
 * ตัวช่วยร่วมของเทสต์แบบเดินต่อเนื่องตามเส้นทางในผัง (e2e/journeys)
 * แต่ละไฟล์ journey ใช้ฟังก์ชันชุดนี้ร่วมกัน ส่วนตัวช่วยที่ใช้เฉพาะเส้นทางเดียวให้ประกาศไว้ในไฟล์ journey นั้น
 */

export const CASE_NO = 'WP-2569-000501'
export const DOSSIER_URL = `/dossier/${CASE_NO}`

/** กดยืนยันใน SweetAlert (ไม่ใช่ toast) แล้วรอให้ปิด — ตรวจข้อความในกล่องได้ถ้าระบุ */
export async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** กด "ยกเลิก" ใน SweetAlert */
export async function cancelDialog(page: Page) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** กรอกและยืนยันกล่องลงนามอิเล็กทรอนิกส์ (signature modal) */
export async function signInModal(page: Page, signerName = 'ผู้ลงนามทดสอบ') {
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  if (!(await nameInput.inputValue())) await nameInput.fill(signerName)
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" — อิงจากรหัสแบบ เช่น "คบ.1" */
export function formRow(page: Page, code: string): Locator {
  return page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/** textarea ของ FormKit ที่อยู่ถัดจาก label (ไม่มี htmlFor เชื่อม) */
export function areaField(page: Page, label: string): Locator {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

/** input/select/textarea ตัวแรกที่เป็น sibling ถัดจาก label ข้อความที่ระบุ */
export function fieldAfterLabel(scope: Page | Locator, labelText: string): Locator {
  return scope.locator('label', { hasText: labelText }).locator('xpath=following-sibling::*[1]')
}

/** รอจนแฟ้มอยู่ขั้น (stage) ที่คาดไว้ใน store */
export async function expectStage(page: Page, stage: string | RegExp, caseNo = CASE_NO) {
  const poll = expect.poll(async () => (await readCase(page, caseNo))?.stage as string | undefined, {
    message: `แฟ้ม ${caseNo} ควรอยู่ขั้น ${stage}`,
  })
  if (typeof stage === 'string') await poll.toBe(stage)
  else await poll.toMatch(stage)
}
