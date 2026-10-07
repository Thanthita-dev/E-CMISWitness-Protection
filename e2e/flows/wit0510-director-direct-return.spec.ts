import { expect, test } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 05 · WIT0510 → WIT0511
 *
 * ผัง: WIT0509 "ไม่เห็นชอบ / ไม่ครบ" → WIT0510 ผอ. บันทึกเหตุผลและส่งกลับ **ตรง**
 * เจ้าหน้าที่ผู้รับผิดชอบ → WIT0511 แก้ คบ.3/คบ.6 เป็นฉบับใหม่ แล้ว **ส่งกลับ ผอ.**
 * → วนเข้า WIT0508 ผอ. ตรวจใหม่ · ทั้งวงต้องไม่ผ่านผู้บังคับบัญชาชั้นต้นอีกรอบ
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'

test.describe('WIT0510 / WIT0511 — ผอ. ตีกลับตรงเจ้าหน้าที่ และรอบแก้ไขกลับขึ้น ผอ. โดยตรง', () => {
  test.beforeEach(async ({ page }) => {
    // Case 1.5 — แฟ้มอยู่ขั้น ผอ.สำนัก/กอง พิจารณา (WIT0508) และล็อกอินเป็น ผอ.
    await seedMockState(page, 'Case 1.5', 'director')
    await page.goto(DOSSIER_URL)
  })

  test('ผอ. ไม่เห็นชอบ → งานลงตรงถึงเจ้าหน้าที่ผู้รับผิดชอบ ไม่แวะผู้บังคับบัญชาชั้นต้น', async ({ page }) => {
    const before = await readCase(page, CASE_NO)
    expect(before?.stage).toBe('director_review')

    await page.getByTestId('return-case-button').click()

    // ทุกประเด็นในเมนูของ ผอ. ต้องส่งกลับตรงเจ้าหน้าที่ รวมถึงข้อ "ความเห็น ผบช.ชั้นต้นไม่ชัดเจน"
    await page.getByTestId('return-issue-select').selectOption('supervisor_opinion_unclear')
    await page
      .getByTestId('return-note-input')
      .fill('ความเห็นผู้บังคับบัญชาชั้นต้นใน คบ.6 ยังไม่ชัดเจน ให้เรียบเรียงเหตุผลและระดับภัยใหม่')
    await page.getByTestId('return-confirm-button').click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    const after = await readCase(page, CASE_NO)
    expect(after?.owner).toBe(OFFICER)
    expect(after?.owner).not.toBe(SUPERVISOR)
    expect(after?.returned).toBe(true)
    expect(after?.returnedByRole).toBe('director')
    expect(after?.directorReturn).toBe(true)

    // ผบช.ชั้นต้น ได้รับแจ้งให้ทราบ แต่ไม่มีงานเข้าคิวของตัวเอง
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action === 'แจ้งผู้บังคับบัญชาชั้นต้นทราบ')).toBe(true)
  })

  test('รอบแก้ไขตามคำสั่ง ผอ. ส่งกลับขึ้น ผอ. โดยตรง ไม่วนผ่านผู้บังคับบัญชาชั้นต้น', async ({ page }) => {
    // WIT0510 — ผอ. ตีกลับ
    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('fact_discrepancy')
    await page.getByTestId('return-note-input').fill('ข้อเท็จจริงใน คบ.3 และ คบ.6 ขัดแย้งกัน ให้ตรวจสอบและแก้เป็นฉบับใหม่')
    await page.getByTestId('return-confirm-button').click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    // WIT0511 — เจ้าหน้าที่ผู้รับผิดชอบเปิดแฟ้มเพื่อแก้ไข
    await switchRole(page, 'officer')

    const banner = page.getByTestId('director-rework-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('ส่งกลับ ผอ.สำนัก/กอง ตรวจใหม่โดยตรง ไม่ผ่านผู้บังคับบัญชาชั้นต้น')

    // ปุ่มส่งต่อต้องชี้ไป ผอ. ไม่ใช่ ผบช.ชั้นต้น
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('เสนอ ผอ.สำนัก/กอง')
    await expect(forwardButton).not.toContainText('ผู้บังคับบัญชาชั้นต้น')

    await forwardButton.click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')

    const after = await readCase(page, CASE_NO)
    expect(after?.owner).toBe(DIRECTOR)
    // วงสั้นตามผัง — ไม่ใช่ Fast Track และธงตีกลับถูกเคลียร์แล้ว
    expect(after?.fastTracked).toBe(false)
    expect(after?.directorReturn).toBe(false)
    expect(after?.returned).toBe(false)

    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    const last = history[history.length - 1]
    expect(last.detail).toContain('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    // ตลอดวง WIT0510 → WIT0511 ต้องไม่มีขั้นที่งานตกไปอยู่กับ ผบช.ชั้นต้น
    expect(history.some((h) => (h.detail ?? '').includes('รอกลั่นกรอง'))).toBe(false)
  })
})
