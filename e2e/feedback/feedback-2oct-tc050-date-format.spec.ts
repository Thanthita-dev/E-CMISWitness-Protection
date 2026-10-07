import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Feedback 2 Oct · TC-050 (ชีต 11D, Mock State "Case 1.16", ผอ.สำนัก/กอง)
 *
 * คบ.16 วันที่มีผลต้องเลือกจากปฏิทิน (เก็บ ISO ค.ศ.) แล้วแสดงเป็น วว/ดด/ปปปป พ.ศ.
 * เดิมช่องเป็นข้อความอิสระ — พิมพ์ 01/10/2569 แล้วหลังลงนามแสดง 10/01/3112
 */

const CASE_NO = 'WP-2569-000501'
const TERM_URL = `/termination/${CASE_NO}`
const EFFECTIVE_ISO = '2026-10-01'
const EFFECTIVE_BE = '01/10/2569'

async function confirmDialog(page: Page, buttonName: string) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

test.describe('Feedback 2 Oct · TC-050 รูปแบบวันที่ คบ.16', () => {
  test('TC-050 · เลือกวันที่มีผลจากปฏิทิน แล้วหลังลงนามแสดง 01/10/2569 (ไม่ใช่ 10/01/3112)', async ({ page }) => {
    await seedMockState(page, 'Case 1.16', 'director')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ')
    await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')

    // เจ้าหน้าที่ร่าง คบ.16 ที่ 11D — ช่องวันที่เป็นปฏิทิน และมี พ.ศ. แสดงใต้ช่อง
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('คำสั่งที่').fill('001/2569')
    await page.getByLabel('วันที่ออกคำสั่ง').fill(EFFECTIVE_ISO)
    await page.getByLabel('วันที่คำสั่งมีผล').fill(EFFECTIVE_ISO)
    await expect(page.getByLabel('วันที่คำสั่งมีผล')).toHaveAttribute('type', 'date')
    await expect(page.getByTestId('kb16-effective-be')).toContainText(EFFECTIVE_BE)
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    // แบบ คบ.16 ในแฟ้ม — เลขที่คำสั่ง + เลือกวันที่มีผลจากปฏิทิน
    await page.goto(`/form/16?caseNo=${CASE_NO}`)
    await page.getByPlaceholder('088').fill('คส.QA-001')
    await page.getByPlaceholder('2569').fill('2569')
    const dates = page.locator('input[type="date"]')
    await expect(dates).toHaveCount(3)
    await dates.nth(1).fill(EFFECTIVE_ISO)
    await expect(page.getByText(`พ.ศ. ${EFFECTIVE_BE}`).first()).toBeVisible()
    await captureEvidence(page, 'TC-050-b', dates.nth(1), 'ช่องวันที่เป็นปฏิทิน เก็บ ISO และแสดง พ.ศ. 01/10/2569 ใต้ช่อง')

    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: /ส่งให้ผู้มีอำนาจอนุมัติ|ส่งให้อนุมัติ|ส่งคำสั่ง/ }).first().click()
    await confirmDialog(page, 'ส่งให้อนุมัติ')

    const submitted = (await readCase(page, CASE_NO))?.kb16 as Record<string, unknown>
    expect(submitted.orderNo).toBe('คส.QA-001/2569')
    expect(submitted.effectiveAt).toBe(EFFECTIVE_ISO)

    await switchRole(page, 'secretary')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')

    await expect(page.getByText('คำสั่งที่ คส.QA-001/2569')).toBeVisible()
    const effectiveCell = page.locator('dt', { hasText: 'วันที่มีผล' }).locator('xpath=following-sibling::dd[1]')
    await expect(effectiveCell).toHaveText(EFFECTIVE_BE)
    await expect(page.getByText('3112')).toHaveCount(0)
    await captureEvidence(page, 'TC-050-a', effectiveCell, 'วันที่มีผลหลังลงนามแสดง 01/10/2569 (ไม่ใช่ 10/01/3112)')
  })
})
