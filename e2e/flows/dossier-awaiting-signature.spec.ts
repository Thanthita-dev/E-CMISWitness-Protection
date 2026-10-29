import { expect, test } from '@playwright/test'
import { seedMockState } from '../helpers/seed'

/**
 * รายการแบบฟอร์มในแฟ้ม — แบบที่ถึงคิวลงนามของบทบาทที่ล็อกอินอยู่ขึ้นกรอบแดง
 * พร้อมป้ายระบุตำแหน่งผู้ลงนาม ส่วนบทบาทที่ยังไม่ถึงคิวไม่เห็นกรอบแดง
 */

const CASE_NO = '0501/2569'
const DOSSIER_URL = `/dossier/${encodeURIComponent(CASE_NO)}`

test('ผอ. เห็น คบ.6 ขึ้นกรอบแดงพร้อมป้าย "รอลงนาม" ข้อ 11', async ({ page }) => {
  // Case 1.5 — แฟ้มอยู่ขั้น ผอ.สำนัก/กอง พิจารณา (WIT0508)
  await seedMockState(page, 'Case 1.5', 'director')
  await page.goto(DOSSIER_URL)

  const kb6 = page.locator('[data-testid="dossier-form-row"][data-form-number="6"]')
  await expect(kb6).toHaveAttribute('data-awaiting-signature', 'true')
  await expect(kb6.getByTestId('awaiting-signature-badge')).toHaveText(/รอลงนาม: ผู้อำนวยการสำนัก\/กอง/)
  await expect(kb6).toHaveCSS('border-top-color', 'rgb(165, 44, 37)')
  await page.getByTestId('dossier-forms').screenshot({ path: 'test-results/dossier-awaiting-signature.png' })
})

test('เลขาธิการฯ ยังไม่ถึงคิว — ไม่มีแบบใดขึ้นกรอบแดง', async ({ page }) => {
  await seedMockState(page, 'Case 1.5', 'secretary')
  await page.goto(DOSSIER_URL)

  await expect(page.getByTestId('dossier-form-row').first()).toBeVisible()
  await expect(page.locator('[data-awaiting-signature="true"]')).toHaveCount(0)
})
