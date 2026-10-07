import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole, linkMainCaseAsOfficer } from '../helpers/seed'

/**
 * Sheet 05 · เส้นทางปกติ: กลั่นกรอง คบ.6 (WIT0501 → WIT0514)
 *
 * ผู้บังคับบัญชาชั้นต้น → ผอ.สำนัก/กอง ตรวจชุดเสนอ คบ.1/คบ.3/คบ.6 ลงนามความเห็นตามลำดับชั้น
 * (ข้อ 10–13 ของ คบ.6 กรอกความเห็นในหน้ากรอกแบบ /form/6 แล้วลงนามจากปุ่ม "ลงนาม" ท้ายหน้าเดียวกัน)
 * แล้วส่งรองเลขาธิการฯ กลั่นกรองก่อนถึงเลขาธิการฯ (แท็บ 07)
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

function formRow(page: Page, code: string) {
  return page
    .getByTestId('dossier-forms')
    .locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/** ช่อง textarea ของข้อความเห็นแต่ละข้อ อ้างจาก label ตรงตัวในแบบ คบ.6 */
function opinionArea(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

/**
 * ลงนามความเห็นข้อ 10-13 ใน คบ.6 จากปุ่ม "ลงนาม" ท้ายหน้ากรอกแบบ /form/6 (WIT0507)
 * ความเห็นกรอกในแบบฟอร์มเอง (บางข้อยังไม่มีความเห็นตั้งต้นในร่าง ต้องกรอกก่อนจึงลงนามรับรองได้)
 */
async function signKb6(page: Page, caseNo: string, no: string, label: string) {
  await page.goto(`/form/6?caseNo=${caseNo}`)
  const area = opinionArea(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill('เห็นชอบตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  const nameInput = page.getByTestId('signature-name-input')
  if (!(await nameInput.inputValue())) await nameInput.fill('ผู้ลงนามทดสอบ')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

async function forwardAndConfirm(page: Page, expectedText?: string | RegExp) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
}

test.describe('TC-032 — ผู้บังคับบัญชาชั้นต้นและ ผอ. เห็นชอบและลงนาม คบ.6', () => {
  test('TC-032 · [Happy] ลงนามครบตามลำดับชั้นแล้วส่งแจ้งเตือนรองเลขาธิการฯ', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')

    await signKb6(page, CASE_NO, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    let after = await readCase(page, CASE_NO)
    expect(after?.kb6SupervisorSignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'ผอ.สำนัก/กอง')
    after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('director_review')
    expect(after?.owner).toBe(DIRECTOR)

    await switchRole(page, 'director')
    await signKb6(page, CASE_NO, '11', 'ความเห็นผู้อำนวยการสำนัก')
    after = await readCase(page, CASE_NO)
    expect(after?.kb6DirectorSignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'รองเลขาธิการ')
    after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('deputy_review')
    expect(after?.owner).toBe(DEPUTY)
    expect(after?.deputyReviewState).toBe('pending')

    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.length).toBeGreaterThan(0)
  })
})

test.describe('TC-033 — ผู้บังคับบัญชาตีกลับเอกสารไม่ครบ แล้วเจ้าหน้าที่แก้ไขเป็นเวอร์ชันใหม่', () => {
  test('TC-033 · [Happy] ตีกลับแล้วเจ้าหน้าที่แก้ไข และประวัติแสดงเหตุผลตีกลับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false })
    await page.goto(DOSSIER_URL)

    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('evidence_missing')
    await page.getByTestId('return-note-input').fill('ขาดหลักฐานการข่มขู่')
    await page.getByTestId('return-confirm-button').click()

    const returned = await readCase(page, CASE_NO)
    expect(returned?.stage).toBe('staff_review')
    expect(returned?.returned).toBe(true)
    expect(returned?.returnNote).toBe('ขาดหลักฐานการข่มขู่')
    const history = (returned?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history[history.length - 1].detail).toContain('ขาดหลักฐานการข่มขู่')

    // เจ้าหน้าที่แก้ไข คบ.3 — คาดหวังว่าฉบับเดิมถูกเก็บไว้และเปิดเป็นเวอร์ชันใหม่
    await switchRole(page, 'officer')
    await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    // WIT0506 — ตีกลับแล้วระบบเปิดฉบับใหม่ของ คบ.3 ให้แก้ โดยเก็บฉบับที่ถูกตีกลับไว้ในประวัติเวอร์ชัน
    await expect(page.getByText('ฉบับที่ 2')).toBeVisible()
  })
})

test.describe('TC-034 — ผอ. ไม่เห็นชอบและส่งกลับตรงถึงเจ้าหน้าที่ผู้รับผิดชอบ', () => {
  test('TC-034 · [Happy] ส่งกลับตรงเจ้าหน้าที่ ข้าม ผบช.ชั้นต้น แล้วแก้แล้วส่งกลับ ผอ. โดยตรง', async ({ page }) => {
    await seedMockState(page, 'Case 1.5', 'director')
    await page.goto(DOSSIER_URL)

    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('fact_discrepancy')
    await page.getByTestId('return-note-input').fill('ความเห็นใน คบ.6 ไม่สอดคล้องข้อเท็จจริง')
    await page.getByTestId('return-confirm-button').click()

    const returned = await readCase(page, CASE_NO)
    expect(returned?.stage).toBe('staff_review')
    expect(returned?.directorReturn).toBe(true)

    await switchRole(page, 'officer')
    await expect(page.getByTestId('director-rework-banner')).toBeVisible()
    await expect(page.getByTestId('director-rework-banner')).toContainText('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')

    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('ผอ.สำนัก/กอง')
    await forwardButton.click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('director_review')
    expect(after?.owner).toBe(DIRECTOR)
  })
})

test.describe('TC-035 — พยายามแก้ไข คบ.6 ฉบับที่ลงนามแล้ว', () => {
  test('TC-035 · [Negative] คบ.6 ควรถูกล็อกหลัง ผอ. ลงนาม ห้ามแก้ทับ', async ({ page }) => {
    // Case 1.6 — ผบช. และ ผอ. ลงนามแล้ว (kb6DirectorSignedAt มีค่า)
    await seedMockState(page, 'Case 1.6', 'officer')
    await page.goto(DOSSIER_URL)

    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)

    const opinionField = areaField(page, '2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย')
    // WIT0513 — ฉบับที่ลงนามความเห็นตามลำดับชั้นแล้วถูกล็อก แก้ทับไม่ได้ ต้องสร้างเวอร์ชันใหม่ก่อน
    await expect(opinionField).toBeDisabled()
  })
})

function areaField(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

test.describe('TC-036 — ส่งชุดเสนอโดยขาด คบ.6', () => {
  test('TC-036 · [Negative] ควรตรวจความครบถ้วนของชุดเสนอก่อนอนุญาตให้ส่ง', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)

    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()

    // WIT0501 — ยังไม่ได้จัดทำ คบ.6 ระบบจึงปิดปุ่มส่งต่อและระบุเอกสารที่ขาดให้เห็น
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()
    await expect(page.getByText('ชุดเสนอยังไม่ครบ — ยังไม่ได้จัดทำแบบ คบ.6')).toBeVisible()
  })
})

test.describe('TC-037 — ผู้บังคับบัญชาลงนามโดยไม่บันทึกความเห็น', () => {
  test('TC-037 · [Demo] ลงนามได้ทันทีโดยไม่ต้องกรอกความเห็น — ระบบเติมความเห็นตั้งต้นในข้อ 10 ให้', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(`/form/6?caseNo=${CASE_NO}`)

    // โหมดสาธิต — ไม่บังคับกรอกความเห็นก่อน: ลายมือชื่อข้อ 10 ยังต้องมีความเห็นรองรับ
    // ระบบจึงเติมความเห็นตั้งต้น "เห็นควรดำเนินการตามที่เสนอ" ให้ตอนลงนาม
    await opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น').fill('')

    await page.getByRole('button', { name: /^ลงนาม$/ }).click()
    await expect(page.getByTestId('signature-name-input')).toBeVisible()
    await page.getByTestId('signature-certify-checkbox').check()
    await page.getByTestId('signature-confirm-button').click()

    await expect(opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toHaveValue('เห็นควรดำเนินการตามที่เสนอ')
    const after = await readCase(page, CASE_NO)
    expect(after?.kb6SupervisorSignedAt).toBeTruthy()
  })
})

test.describe('TC-037b — ลงนาม คบ.6 จากหน้าแฟ้มโดยตรง (โหมดสาธิต)', () => {
  test('TC-037b · ผบช.ชั้นต้นกด "ลงนาม" ในการ์ดส่งงาน แล้วเสนอ ผอ. ได้ โดยไม่ต้องเปิดแบบฟอร์ม', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(`/dossier/${CASE_NO}`)
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()

    await page.getByTestId('kb6-sign-button').click()
    await page.getByTestId('signature-certify-checkbox').check()
    await page.getByTestId('signature-confirm-button').click()

    await expect(forwardButton).toBeEnabled()
    const after = await readCase(page, CASE_NO)
    expect(after?.kb6SupervisorSignedAt).toBeTruthy()
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).not.toHaveValue('')
  })
})

test.describe('TC-038 — ตีกลับซ้ำหลายรอบ ตรวจสอบการนับเวอร์ชัน', () => {
  test('TC-038 · [Edge] คาดหวัง v1-v4 ครบพร้อมเหตุผลแต่ละรอบ', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    const issues = ['risk_incomplete', 'evidence_missing', 'main_case_mismatch']
    for (const issue of issues) {
      await page.getByTestId('return-case-button').click()
      await page.getByTestId('return-issue-select').selectOption(issue)
      await page.getByTestId('return-note-input').fill(`ตีกลับรอบ ${issue}`)
      await page.getByTestId('return-confirm-button').click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

      await switchRole(page, 'officer')
      await page.getByTestId('forward-case-button').click()
      await confirmDialog(page, 'ยืนยันส่งต่อ')
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('supervisor_review')
      await switchRole(page, 'supervisor')
    }

    await switchRole(page, 'officer')
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    // WIT0506 — ตีกลับ 3 รอบ = ฉบับที่ 4 และประวัติเวอร์ชันเก็บเหตุผลตีกลับของแต่ละรอบไว้ครบ
    await expect(page.getByText('ฉบับที่ 4')).toBeVisible()

    await page.getByTestId('form-revision-history-toggle').click()
    for (const [version, issue] of [
      [1, 'ตีกลับรอบ risk_incomplete'],
      [2, 'ตีกลับรอบ evidence_missing'],
      [3, 'ตีกลับรอบ main_case_mismatch'],
    ] as const) {
      await expect(page.getByTestId(`form-revision-item-${version}`)).toContainText(issue)
    }
  })
})

test.describe('TC-039 — Snapshot ที่ส่งไปแท็บ 07 ต้องไม่ผ่านสารบรรณอัตโนมัติ', () => {
  test('TC-039 · [Edge] ส่งรองเลขาธิการฯ แล้วไม่มีเลขหนังสือสารบรรณเกิดขึ้นอัตโนมัติ', async ({ page }) => {
    await seedMockState(page, 'Case 1.6', 'deputy_secretary')

    await signKb6(page, CASE_NO, '12', 'ความเห็นรองเลขาธิการฯ')
    let after = await readCase(page, CASE_NO)
    expect(after?.kb6DeputySignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'เลขาธิการ')
    after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('external_pending')
    expect(after?.deputyScreenedBy).toBeTruthy()
    // ไม่มีการออกเลขที่หนังสือ/เลขสารบรรณอัตโนมัติระหว่างส่งภายในระบบ
    expect((after as Record<string, unknown> | null)?.['documentNo']).toBeUndefined()
    expect((after as Record<string, unknown> | null)?.['registryNo']).toBeUndefined()

    await switchRole(page, 'secretary')
    await expect(page.getByText('รอเสนอเลขาธิการ ป.ป.ท. พิจารณา')).toBeVisible()
  })
})
