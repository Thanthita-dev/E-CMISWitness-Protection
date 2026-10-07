import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * ข้อเสนอแนะผู้ใช้ — "ประเมินเป็นกรณีปกติ แต่มี คบ.4 เข้ามาด้วย" (แฟ้ม WP-2569-000503 บน pacc-a6)
 *
 * ต้นเหตุ: ช่อง "แนบเข้าแฟ้ม" ตั้งค่าเริ่มต้นไว้ที่ คบ.4 — กดปุ่มโดยไม่ได้เลือกจึงแนบ คบ.4 เข้าแฟ้มกรณีปกติ
 * ผลที่คาดหวังตามผัง Tab 02 (WIT0410-0411): กรณีปกติไปเส้นทาง คบ.6 เท่านั้น ส่วน คบ.4/คบ.5 เป็นของเส้นทางเร่งด่วน
 *
 * หมายเหตุการแมปเคส: ไม่มี mock state ของ WP-2569-000503 — ใช้ WP-2569-000501 ตามแนวทางเดียวกับ
 * feedback/feedback-fb2-fb3-urgency-forms.spec.ts แล้วปรับสถานะตั้งต้นด้วย casePatch
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`

/** แฟ้มที่ประเมินแล้วว่าเป็นกรณีปกติ แต่มี คบ.4 ค้างอยู่ในรายการแนบเพิ่ม — สภาพเดียวกับแฟ้มที่ผู้ใช้แจ้ง */
const NORMAL_WITH_STALE_KB4 = {
  urgency: 'normal',
  urgent: false,
  urgencyAssessedAt: '13/09/2569 10:00',
  urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
  extraForms: [4],
}

function formRow(page: Page, code: string) {
  return page
    .getByTestId('dossier-forms')
    .locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

const attachSelect = (page: Page) => page.getByTestId('extra-form-select')
const attachButton = (page: Page) => page.getByTestId('extra-form-attach')

/** ตัวเลือกที่ผู้ใช้เลือกได้จริงในช่อง "แนบเข้าแฟ้ม" (ไม่รวมบรรทัดคำแนะนำ "— เลือกแบบฟอร์ม —") */
async function attachOptionLabels(page: Page) {
  return attachSelect(page).locator('option:not([disabled])').allTextContents()
}

test.describe('FB-KB4 · แฟ้มกรณีปกติต้องไม่มี คบ.4 / คบ.5 ในรายการแบบฟอร์ม', () => {
  test('FB-KB4-01 · แฟ้มกรณีปกติที่มี คบ.4 ค้างอยู่ — ซ่อน คบ.4 จากรายการ แต่ไม่ลบข้อมูลที่แนบไว้เดิม', async ({
    page,
  }) => {
    // Case 1.3 — staff_review เจ้าหน้าที่เจ้าของสำนวน (แก้ไขแฟ้มได้) ปรับเป็นกรณีปกติที่มี คบ.4 ค้าง
    await seedMockState(page, 'Case 1.3', 'officer', NORMAL_WITH_STALE_KB4)
    await page.goto(DOSSIER_URL)

    const formsCard = page.getByTestId('dossier-forms')
    await expect(formsCard.getByRole('heading', { name: /แบบฟอร์ม คบ\. ในแฟ้มนี้ \(3 แบบ\)/ })).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(formRow(page, 'คบ.5')).toHaveCount(0)

    // ซ่อนเท่านั้น — ข้อมูลเดิมในแฟ้มยังอยู่ ไม่ถูกลบทิ้งอย่างเงียบ ๆ
    expect((await readCase(page, CASE_NO))?.extraForms).toContain(4)
  })

  test('FB-KB4-02 · ช่อง "แนบเข้าแฟ้ม" ของแฟ้มกรณีปกติ ต้องไม่มี คบ.4 / คบ.5 ให้เลือก', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', NORMAL_WITH_STALE_KB4)
    await page.goto(DOSSIER_URL)

    await expect(attachSelect(page)).toBeVisible()
    const labels = await attachOptionLabels(page)
    expect(labels.length).toBeGreaterThan(0)
    expect(labels.some((l) => l.includes('คบ.4 '))).toBe(false)
    expect(labels.some((l) => l.includes('คบ.5 '))).toBe(false)
    // แบบที่ไม่เกี่ยวกับเส้นทางเร่งด่วนยังแนบได้ตามปกติ
    expect(labels.some((l) => l.includes('คบ.9 '))).toBe(true)
  })

  test('FB-KB4-03 · ต้องเลือกแบบฟอร์มก่อนจึงแนบได้ และแนบตรงกับที่เห็นบนจอ', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', NORMAL_WITH_STALE_KB4)
    await page.goto(DOSSIER_URL)

    // ยังไม่เลือก — ช่องแสดงคำแนะนำ และปุ่มกดไม่ได้ (เดิมกดแล้วได้ คบ.4 ทันที)
    await expect(attachSelect(page).locator('option:checked')).toHaveText(/เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม/)
    await expect(attachButton(page)).toBeDisabled()
    const extrasBefore = (await readCase(page, CASE_NO))?.extraForms

    // เลือก คบ.9 แล้วแนบ — ต้องได้ คบ.9 ตรงตามที่เลือก ไม่ใช่ฉบับอื่น
    await attachSelect(page).selectOption({ label: await nineLabel(page) })
    await expect(attachButton(page)).toBeEnabled()
    await attachButton(page).click()

    await expect(page.locator('.swal2-toast')).toContainText('คบ.9')
    await expect(formRow(page, 'คบ.9')).toBeVisible()
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    const extrasAfter = (await readCase(page, CASE_NO))?.extraForms as number[]
    expect(extrasAfter).toEqual([...((extrasBefore as number[]) || []), 9])

    // หลังแนบ ช่องกลับเป็น "ยังไม่เลือก" และ คบ.9 ไม่อยู่ในตัวเลือกอีก
    await expect(attachSelect(page).locator('option:checked')).toHaveText(/เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม/)
    await expect(attachButton(page)).toBeDisabled()
    expect((await attachOptionLabels(page)).some((l) => l.includes('คบ.9 '))).toBe(false)
  })
})

test.describe('FB-KB4 · กันถดถอยของเส้นทางเร่งด่วน', () => {
  test('FB-KB4-04 · แฟ้มกรณีเร่งด่วนยังแสดง คบ.4 และ คบ.5 ครบ และปุ่มแนบกดไม่ได้จนกว่าจะเลือก', async ({ page }) => {
    // Case 3 — staff_review ประเมินไว้แล้วว่าเร่งด่วน
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)

    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await expect(formRow(page, 'คบ.5')).toBeVisible()
    // กันบั๊กเดิม: จอแสดงแบบหนึ่งแต่ระบบแนบอีกแบบ — ต้องยังไม่มีค่าเลือกค้างไว้
    await expect(attachButton(page)).toBeDisabled()
  })

  test('FB-KB4-05 · แก้ผลประเมินกรณีปกติที่ซ่อน คบ.4 กลับเป็นเร่งด่วน — คบ.4 / คบ.5 กลับมาพร้อมข้อมูลเดิม', async ({
    page,
  }) => {
    // Case 3 — เร่งด่วน กรอกร่าง คบ.4 ผ่านหน้าจอจริงก่อน (มี คบ.4 ค้างใน extraForms ด้วย เหมือนแฟ้มที่ผู้ใช้แจ้ง)
    await seedMockState(page, 'Case 3', 'officer', { extraForms: [4] })
    await page.goto(KB4_FORM_URL)
    const behaviorField = page
      .locator('label:text-is("2.1 รายละเอียดพฤติการณ์แห่งคดี")')
      .locator('xpath=following-sibling::textarea[1]')
    await behaviorField.fill('พยานถูกข่มขู่ทางโทรศัพท์ให้ถอนคำให้การ')
    await behaviorField.blur()

    // เปลี่ยนเป็นกรณีปกติ — ต้องยืนยันก่อน แล้ว คบ.4 / คบ.5 ถูกซ่อน (แม้ คบ.4 จะอยู่ใน extraForms)
    await page.goto(DOSSIER_URL)
    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
    await page.getByRole('button', { name: /กรณีปกติ/ }).click()
    const confirmPopup = page.locator('.swal2-popup:not(.swal2-toast)')
    await expect(confirmPopup).toBeVisible()
    await page.getByRole('button', { name: 'ยืนยันเปลี่ยนเป็นกรณีปกติ' }).click()
    await confirmPopup.waitFor({ state: 'detached' })

    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(formRow(page, 'คบ.5')).toHaveCount(0)
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    expect((await readCase(page, CASE_NO))?.urgency).toBe('normal')

    // แก้กลับเป็นเร่งด่วน — คบ.4 / คบ.5 ต้องกลับมาในรายการ
    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
    await page
      .getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...')
      .fill('พบภัยคุกคามซ้ำ ปรับกลับเป็นกรณีจำเป็นเร่งด่วน')
    await page.getByRole('button', { name: /กรณีจำเป็นเร่งด่วน/ }).click()

    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await expect(formRow(page, 'คบ.5')).toBeVisible()
    expect((await readCase(page, CASE_NO))?.urgent).toBe(true)

    // ข้อมูลร่าง คบ.4 ที่กรอกไว้ก่อนซ่อนต้องยังอยู่ครบเมื่อเปิดแบบฟอร์มอีกครั้ง
    await formRow(page, 'คบ.4').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(
      page.locator('label:text-is("2.1 รายละเอียดพฤติการณ์แห่งคดี")').locator('xpath=following-sibling::textarea[1]')
    ).toHaveValue('พยานถูกข่มขู่ทางโทรศัพท์ให้ถอนคำให้การ')
  })
})

/** ป้ายตัวเลือกของ คบ.9 ในช่องแนบ — อ่านจากหน้าจอจริงแทนการพิมพ์ชื่อเต็มซ้ำ */
async function nineLabel(page: Page) {
  const labels = await attachOptionLabels(page)
  const label = labels.find((l) => l.includes('คบ.9 '))
  if (!label) throw new Error('ไม่พบตัวเลือก คบ.9 ในช่องแนบเข้าแฟ้ม')
  return label
}
