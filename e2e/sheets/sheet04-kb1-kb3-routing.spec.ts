import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, readCase, seedMockState, switchRole, linkMainCaseAsOfficer } from '../helpers/seed'
import { sendConsentLink, witnessSigns } from '../helpers/consent'
import { submitFastTrackToDirector } from '../journeys/journey-helpers'

/**
 * ลำดับงานเจ้าของสำนวน: คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรอง → คบ.3
 * เทสต์ที่ทดสอบ คบ.3 ตั้งต้นจากแฟ้มที่ผ่านสามขั้นแรกแล้ว (บันทึก คบ.1 · ไม่พบคดีพร้อมเหตุผล · กรณีปกติ)
 */
const SCREENED = {
  ...KB1_DONE,
  mainCaseNotFound: true,
  mainCaseNotFoundReason: 'ค้นแล้วไม่พบสำนวนที่ตรงกันในระบบ E-CMIS',
  mainCaseStatus: 'not_found',
  urgency: 'normal',
  urgent: false,
  urgencyAssessedAt: '10/09/2569 09:00',
  urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
}

/**
 * Sheet 04 · จัดทำ คบ.1 / คบ.3 และแยกเส้นทาง (WIT0401 → WIT0412)
 *
 * เจ้าหน้าที่เจ้าของสำนวน (staff_review) จัดทำ คบ.1 จากข้อมูล คบ.2 พร้อมลงนามยินยอม
 * ตัดสินใจข้าม/ไม่ข้าม คบ.3 แล้วประเมินความเร่งด่วนเพื่อแยกเส้นทาง:
 *   ปกติ  → คบ.6 → แท็บ 05 (ผู้บังคับบัญชาชั้นต้นกลั่นกรอง)
 *   เร่งด่วน → คบ.4/คบ.5 → แท็บ 06 (Fast Track)
 */

const CASE_NO = '0501/2569'
const DOSSIER_URL = `/dossier/${encodeURIComponent(CASE_NO)}`
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ช่องกรอกของ FormKit ไม่มี htmlFor/id เชื่อมกับ label — หาโดยอิงป้ายข้อความข้างช่อง */
function fieldInput(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::input[1]')
}
function areaInput(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" — อิงจากรหัสแบบ เช่น "คบ.1" */
function formRow(page: Page, code: string) {
  return page
    .getByTestId('dossier-forms')
    .locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/**
 * WIT0406 — พยานลงนามยินยอมใน คบ.1: เจ้าหน้าที่ส่งลิงก์จากการ์ดส่งงาน แล้วผู้ขอคุ้มครองลงชื่อเองในหน้าลิงก์
 * (เจ้าหน้าที่ลงชื่อแทนพยานไม่ได้)
 */
async function signKb1Consent(page: Page) {
  const url = await sendConsentLink(page)
  await witnessSigns(page, url)
  await page.goto(DOSSIER_URL)
}

test.describe('TC-022 — จัดทำ คบ.1 จากข้อมูล คบ.2 พร้อมลงนามยินยอม', () => {
  test('TC-022 · [Happy] คบ.1 ดึงข้อมูลตั้งต้นมาให้ และบันทึกลายมือชื่อยินยอมพร้อมวันเวลา', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', { kb1SignaturePending: true })
    await page.goto(DOSSIER_URL)
    // ลำดับงาน: จัดทำ คบ.1 ก่อน — การ์ดคดีหลักยังเชื่อมโยงไม่ได้
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()

    // WIT0404 — เปิด คบ.1 ต้องมีข้อมูลตั้งต้นให้แล้ว (จำลองมาจาก คบ.2)
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    await expect(fieldInput(page, 'ชื่อ')).toHaveValue('กมลชนก')
    await expect(fieldInput(page, 'นามสกุล')).toHaveValue('บุญรักษา')
    // บันทึก คบ.1 จากส่วนท้ายของแบบ — ปลดล็อกขั้นเชื่อมโยงคดีหลักและกลั่นกรอง
    await page.getByRole('button', { name: '8. ลายมือชื่อ' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
    expect((await readCase(page, CASE_NO))?.kb1CompletedAt).toBeTruthy()

    await expect(page.getByText('รับแจ้งทางโทรศัพท์ (คบ.2) — รอพยานเข้ามาลงนามยินยอมใน คบ.1')).toBeVisible()

    // เชื่อมโยงคดีหลักแล้วกลั่นกรอง จึงจะเห็นทางลัดลงนามยินยอม คบ.1 (ลำดับบล็อกเกอร์ในการ์ด)
    await linkMainCaseAsOfficer(page)
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()

    // WIT0406 — ลงนามยินยอม
    await signKb1Consent(page)

    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toHaveCount(0)
    const after = await readCase(page, CASE_NO)
    expect(after?.kb1SignaturePending).toBe(false)
    expect(after?.kb1SignedAt).toBeTruthy()
  })
})

test.describe('TC-023 — ข้าม คบ.3 ได้เมื่อ คบ.1 ครบถ้วน', () => {
  test('TC-023 · [Happy] บันทึก Skip Record พร้อมเหตุผล ผู้บันทึก และวันเวลา', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', SCREENED)
    await page.goto(DOSSIER_URL)

    await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.getByRole('textbox').fill('คบ.1 มีข้อเท็จจริงครบถ้วนแล้ว')
    await dialog.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()
    await dialog.waitFor({ state: 'detached' })

    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล: คบ\.1 มีข้อเท็จจริงครบถ้วนแล้ว/)).toBeVisible()
    // แบบ คบ.3 เปิดไม่ได้อีกจนกว่าจะกู้คืน
    await expect(formRow(page, 'คบ.3').getByText('เปิดแบบฟอร์ม')).toBeVisible()
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)

    const after = await readCase(page, CASE_NO)
    expect(after?.kb3Skipped).toBe(true)
    expect(after?.kb3SkipReason).toBe('คบ.1 มีข้อเท็จจริงครบถ้วนแล้ว')
    expect(after?.kb3SkippedAt).toBeTruthy()
    expect(after?.kb3SkippedBy).toBeTruthy()
  })
})

test.describe('TC-024 — จัดทำ คบ.3 บันทึกข้อเท็จจริงประกอบคำร้อง', () => {
  test('TC-024 · [Happy] คบ.3 ถูกสร้างผูกกับ คบ.1 ในแฟ้มเดียวกัน พร้อมเลขเวอร์ชันเริ่มต้น', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', SCREENED)
    await page.goto(DOSSIER_URL)

    await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/3\?caseNo=0501(\/|%2F)2569/)
    // เลขเวอร์ชันเริ่มต้นของฉบับแรก
    await expect(page.getByText('ฉบับที่ 1')).toBeVisible()

    await areaInput(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(
      'พฤติการณ์เพิ่มเติมที่บันทึกจากการสัมภาษณ์ครั้งที่ 1'
    )
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')

    await page.goto(DOSSIER_URL)
    // ยังอยู่ในแฟ้มเดียวกับ คบ.1
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
  })
})

test.describe('TC-025 — กรณีไม่เร่งด่วน → จัดทำ คบ.6 และไปแท็บ 05', () => {
  test('TC-025 · [Happy] ส่งชุดเสนอไปเส้นทางปกติ (แท็บ 05) แจ้งเตือนผู้บังคับบัญชาชั้นต้น', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', KB1_DONE)
    await page.goto(DOSSIER_URL)
    // บันทึก คบ.1 แล้ว — เจ้าของสำนวนเชื่อมโยงคดีหลัก แล้วกลั่นกรองในการ์ดเดียวกัน
    await linkMainCaseAsOfficer(page)

    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()
    await expect(page.getByText(/กรณีปกติ — คบ\.3 → คบ\.6/)).toBeVisible()

    // WIT0501 — เส้นทางปกติต้องจัดทำแบบ คบ.6 เข้าชุดเสนอก่อน จึงจะส่ง ผบช.ชั้นต้น กลั่นกรองได้
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))

    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('supervisor_review')
    expect(after?.owner).toBe(SUPERVISOR)
    expect(after?.urgency).toBe('normal')
  })
})

test.describe('TC-026 — กรณีเร่งด่วน → ไปแท็บ 06 Fast Track', () => {
  test('TC-026 · [Happy] ส่งตรงถึง ผอ.สำนัก/กอง โดยไม่บังคับให้ทำ คบ.6 ก่อน', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', KB1_DONE)
    await page.goto(DOSSIER_URL)
    // บันทึก คบ.1 แล้ว — เจ้าของสำนวนเชื่อมโยงคดีหลัก แล้วกลั่นกรองในการ์ดเดียวกัน
    await linkMainCaseAsOfficer(page)

    await page.getByRole('button', { name: 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)' }).click()
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()

    await submitFastTrackToDirector(page, CASE_NO)

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('director_review')
    expect(after?.owner).toBe(DIRECTOR)
    expect(after?.fastTracked).toBe(true)

    // แท็บ 06 — ผอ.สำนัก/กอง เห็นส่วนตรวจเรื่องคุ้มครองชั่วคราวในการ์ดส่งงาน ไม่บังคับให้ลงนาม คบ.6 ก่อน
    await switchRole(page, 'director')
    await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'director_review')
    await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
  })
})

test.describe('TC-027 — ส่งต่อโดยไม่ลงนามยินยอมใน คบ.1', () => {
  test('TC-027 · [Negative] ระบบไม่อนุญาตให้ส่งต่อจนกว่าจะมีลายมือชื่อยินยอมใน คบ.1', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', {
      ...KB1_DONE,
      kb1SignaturePending: true,
      urgency: 'normal',
      urgent: false,
      urgencyAssessedAt: '10/09/2569 09:00',
      urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
    })
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)

    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toBeVisible()
    await expect(page.getByTestId('applicant-consent-panel').getByTestId('consent-send-button')).toBeVisible()
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('staff_review')
    expect(after?.kb1SignaturePending).toBe(true)
  })
})

test.describe('TC-028 — เลือกข้าม คบ.3 โดยไม่กรอกเหตุผล', () => {
  test('TC-028 · [Negative] ระบบบังคับให้ระบุเหตุผลก่อนบันทึก Skip Record', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer', SCREENED)
    await page.goto(DOSSIER_URL)

    await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.getByRole('textbox').fill('')
    await dialog.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()

    // แจ้งเตือนให้กรอกเหตุผล และไม่บันทึก Skip Record
    await expect(page.locator('.swal2-toast')).toContainText('ต้องระบุเหตุผลในการกดข้าม คบ.3')

    const after = await readCase(page, CASE_NO)
    expect(after?.kb3Skipped).toBeFalsy()
  })
})

test.describe('TC-029 — จัดทำ คบ.1 ซ้ำในคำขอที่มี คบ.1 อยู่แล้ว', () => {
  test('TC-029 · [Negative] ไม่มีทางสร้าง คบ.1 ฉบับที่สองซ้ำในแฟ้มเดียวกัน', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)

    // มี คบ.1 อยู่แล้วหนึ่งแถวเท่านั้นในรายการแบบฟอร์ม — เปิดซ้ำจะเปิดฉบับเดิม ไม่ใช่สร้างใหม่
    await expect(page.getByTestId('dossier-forms').getByText('คบ.1', { exact: true })).toHaveCount(1)

    // ตัวเลือก "แนบเข้าแฟ้ม" (สำหรับแนบแบบฟอร์มเพิ่ม) ต้องไม่มี คบ.1 ให้เลือกซ้ำ
    const options = page.locator('option', { hasText: 'แนบ คบ.1 -' })
    await expect(options).toHaveCount(0)

    // เปิดแบบฟอร์มซ้ำ — ได้ข้อมูลฉบับเดิม ไม่ใช่แบบเปล่าฉบับใหม่
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(fieldInput(page, 'ชื่อ')).toHaveValue('กมลชนก')
  })
})

test.describe('TC-030 — แก้ไขผลประเมินความเร่งด่วนหลังส่งเข้าเส้นทางปกติแล้ว', () => {
  test('TC-030 · [Edge] ผู้ถือแฟ้มแก้ผลประเมินเป็นเร่งด่วนได้ และระบบเปิดเส้นทางเร่งด่วนให้ทันที', async ({ page }) => {
    // Case 1.4 — ส่งเข้าเส้นทางปกติแล้ว (supervisor_review, urgency: normal)
    // ผู้ถือแฟ้มในขั้นนี้คือผู้บังคับบัญชาชั้นต้น จึงเป็นผู้มีสิทธิ์แก้ผลการประเมิน
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    const formsBefore = before?.forms

    // WIT0410 — ยังมีช่องทางแก้ผลการประเมินหลังส่งต่อเข้าเส้นทางปกติแล้ว
    await expect(page.getByText('ทบทวนผลการประเมินความเร่งด่วน', { exact: false })).toBeVisible()
    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()

    await page
      .getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...')
      .fill('เกิดเหตุข่มขู่เพิ่มเติมหลังส่งเรื่องเข้าเส้นทางปกติ')
    await page.getByRole('button', { name: 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)' }).click()

    // บันทึกการเปลี่ยนผลประเมินพร้อมเหตุผลและวันเวลา และเปิดเส้นทางเร่งด่วน (แท็บ 06) ทันที
    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('urgent')
    expect(after?.urgent).toBe(true)
    expect(after?.urgencyAssessmentNote).toBe('เกิดเหตุข่มขู่เพิ่มเติมหลังส่งเรื่องเข้าเส้นทางปกติ')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessedBy).toBe(SUPERVISOR)
    expect(after?.stage).toBe('director_review')
    expect(after?.owner).toBe(DIRECTOR)
    expect(after?.fastTracked).toBe(true)

    // เอกสารเดิมในแฟ้มยังอยู่ครบ และมีร่องรอยการเปลี่ยนผลประเมินในประวัติ
    expect(after?.forms).toEqual(formsBefore)
    const history = (after?.assignmentHistory || []) as Array<{ detail?: string }>
    expect(history.some((h) => (h.detail || '').includes('เปลี่ยนเส้นทางจากปกติเป็นเร่งด่วน'))).toBe(true)

    // แท็บ 06 — ผอ.สำนัก/กอง เห็นว่ายังไม่มี คบ.4 / ร่าง คบ.5 ต้องส่งกลับให้จัดทำก่อน (WIT0615)
    await switchRole(page, 'director')
    await expect(page.getByTestId('fast-track-decision-required-banner')).toContainText('ยังไม่มี คบ.4 / ร่าง คบ.5')
  })
})

test.describe('TC-031 — ข้อมูลจาก คบ.2 ไม่ครบ ต้องสัมภาษณ์เพิ่ม', () => {
  test('TC-031 · [Edge] ดึงข้อมูลเท่าที่มีมาเป็นค่าตั้งต้น และให้กรอกฟิลด์บังคับที่เหลือ', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    // จำลอง คบ.2 ที่กรอกไม่ครบ — มีเฉพาะชื่อและเบอร์โทร
    await page.addInitScript(() => {
      localStorage.setItem(
        'ecmis-form-draft-storage-v2',
        JSON.stringify({ state: { drafts: { 1: { 'ชื่อ': 'สมชาย', 'เบอร์โทรศัพท์': '081-000-0000' } } }, version: 0 })
      )
    })
    await page.goto(DOSSIER_URL)

    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()

    // ค่าที่มีจาก คบ.2 ถูกดึงมาเป็นค่าตั้งต้น
    await expect(fieldInput(page, 'ชื่อ')).toHaveValue('สมชาย')
    // ฟิลด์บังคับที่เหลือว่างอยู่ และมีเครื่องหมาย * กำกับ
    await expect(fieldInput(page, 'นามสกุล')).toHaveValue('')
    await expect(page.locator('label:text-is("นามสกุล")')).toContainText('*')

    // ปัจจุบัน: กดบันทึกได้ทันทีแม้ฟิลด์บังคับ (นามสกุล) ยังว่าง — ไม่มีการบังคับตรวจสอบจริงก่อนบันทึก
    // Expected: ยังต้องบังคับให้กรอกฟิลด์บังคับที่เหลือของ คบ.1 ให้ครบก่อนจึงจะบันทึกสำเร็จได้
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณากรอกฟิลด์บังคับ')
  })
})
