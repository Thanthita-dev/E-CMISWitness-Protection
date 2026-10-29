import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, readCase, seedMockState, switchRole, linkMainCaseAsOfficer } from '../helpers/seed'

/**
 * FB-1 / FB-5 · User Feedback — เดินหน้ากระบวนการ (Progress Forward)
 * อ้างอิง context/test-case/user-feedback/E-CMIS_UserTest_Feedback_TestCases.xlsx
 *
 * หมายเหตุการแม็ปเคส: ทุก mock state ใช้แฟ้มเดียวกันคือ 0501/2569 — ชีตทดสอบเดิมอ้างถึง
 * 0502/2569/000503 ซึ่งไม่มีอยู่จริงในระบบ (มีเฉพาะ 0501/2569) จึงใช้ 0501/2569
 * ร่วมกับ mock state ที่ใกล้เคียงขั้นตอนที่สุดแทนตลอดทั้งไฟล์นี้:
 *   - TC-001/TC-002 → 'Case 1' (receiver_intake) และ 'Case 1.3' (staff_review)
 *   - TC-013/TC-014/TC-015 → 'Case 1.3' (staff_review, คบ.1/คบ.3 พร้อมแล้ว รอทำ คบ.6)
 *
 * การ์ด "ส่งงานและดำเนินการในขั้นตอนนี้" คือ ForwardWorkflowCard.tsx — ถอดกล่อง checklist เงื่อนไขความพร้อมออกแล้ว
 * เงื่อนไขที่ยังไม่ครบแจ้งผ่าน title ของปุ่มส่งต่อและข้อความล็อกใต้ปุ่มแทน
 *
 * หมายเหตุกฎธุรกิจ (ยืนยันโดยเจ้าของระบบ): ข้อ 10 "ความเห็นผู้บังคับบัญชาชั้นต้น" ใน คบ.6 กรอกได้
 * เฉพาะผู้บังคับบัญชาชั้นต้นที่ขั้น supervisor_review เท่านั้น เจ้าหน้าที่เจ้าของสำนวนไม่กรอกข้อ 10-13
 * ปุ่ม "ลงนาม" ของ คบ.6 ย้ายไปอยู่ในหน้า /form/6 เอง (ไม่มีในรายการแบบฟอร์มของแฟ้มอีกต่อไป)
 */

const CASE_NO = '0501/2569'
const DOSSIER_URL = `/dossier/${encodeURIComponent(CASE_NO)}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" — อิงจากรหัสแบบ เช่น "คบ.1" (ตามแบบแผนไฟล์อื่น) */
function formRow(page: Page, code: string) {
  return page
    .getByTestId('dossier-forms')
    .locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/** กล่อง checklist "ตรวจสอบเงื่อนไขความพร้อม" เดิมในการ์ดส่งงาน — ถอดออกแล้ว ใช้ยืนยันว่าไม่กลับมาแสดง */
function readinessChecklist(page: Page) {
  return page
    .locator('section', { has: page.getByText('ส่งงานและดำเนินการในขั้นตอนนี้') })
    .locator('div.bg-slate-50.border-slate-200')
}

/**
 * ตั้งค่าร่างแบบ คบ.6 ในสโตร์ฟอร์ม (ecmis-form-draft-storage-v2) ก่อนโหลดหน้า
 * ใช้จำลองเนื้อหาความเห็นข้อ 10-12 โดยไม่ต้องพึ่งพาข้อความ default ตั้งต้นของระบบ (ซึ่งกำลังถูกลบออก
 * ตามกฎใหม่: เจ้าหน้าที่เจ้าของสำนวนไม่กรอกข้อ 10-13 — ผู้บังคับบัญชาตามลำดับชั้นเป็นผู้กรอกเองที่ขั้นของตน)
 */
async function seedKb6OpinionField(page: Page, field: string, value: string) {
  await page.addInitScript(
    ({ field, value }: { field: string; value: string }) => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
      store.state = store.state || {}
      store.state.drafts = store.state.drafts || {}
      store.state.drafts['6'] = { ...(store.state.drafts['6'] || {}), [field]: value }
      localStorage.setItem('ecmis-form-draft-storage-v2', JSON.stringify(store))
    },
    { field, value }
  )
}

test.describe('FB-1 · การ์ดส่งงานไม่แสดง checklist เงื่อนไขความพร้อม', () => {
  test('TC-001 · [High] รับเรื่อง (คบ.1) แล้วส่งต่อ ผอ. — การ์ดส่งงานไม่มีกล่อง checklist', async ({
    page,
  }) => {
    // Case 1 = receiver_intake — kb1SignaturePending: false ตั้งต้นอยู่แล้ว (พยานลงนามยินยอมใน คบ.1 ครบถ้วนแล้ว)
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.kb1SignaturePending).toBeFalsy()

    // ขั้นที่ 1 — ธุรการไม่เห็นการ์ดเชื่อมโยงคดีหลัก เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยงภายหลัง
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)

    await expect(page.getByText('ส่งงานและดำเนินการในขั้นตอนนี้')).toBeVisible()
    await expect(readinessChecklist(page)).toHaveCount(0)

    // ส่งต่อให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('director_assign')
  })

  test('TC-002 · [High] ขั้นเจ้าของสำนวน — ปุ่มส่งต่อล็อกจนบันทึก คบ.6 แล้วจึงปลดล็อก', async ({
    page,
  }) => {
    // Case 1.3 = staff_review — "ก่อนถึงขั้นจัดทำ คบ.6" คือก่อนมอบหมาย/ประเมินความเร่งด่วน/จัดการ คบ.3 เสร็จ
    await seedMockState(page, 'Case 1.3', 'officer', KB1_DONE)
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)

    const before = await readCase(page, CASE_NO)
    expect(before?.urgency).toBeFalsy()
    expect(before?.kb6PreparedAt).toBeFalsy()

    // เดินหน้าสู่ "ขั้นเตรียม คบ.6" ตามเงื่อนไขในสเปค — ประเมินความเร่งด่วนเป็น "ปกติ" ผ่าน UI จริง
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()
    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()

    // ข้าม คบ.3 ผ่าน UI จริง (ระบุเหตุผลตามที่ระบบบังคับ)
    await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
    await page.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()
    await expect(page.getByText('บันทึกการข้าม คบ.3 พร้อมเหตุผลเรียบร้อยแล้ว')).toBeVisible()

    // ยังไม่ได้จัดทำ คบ.6 — แจ้งผ่าน title ของปุ่มส่งต่อ
    await expect(page.getByTestId('forward-case-button')).toHaveAttribute('title', /ยังไม่ได้จัดทำแบบ คบ\.6/)

    // จัดทำและบันทึกแบบ คบ.6
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)
    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await expect(page.getByText('บันทึกแบบ คบ.6 เรียบร้อยแล้ว')).toBeVisible()

    const afterSave = await readCase(page, CASE_NO)
    expect(afterSave?.kb6PreparedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    // หลังบันทึก คบ.6 แล้ว ปุ่มส่งต่อต้องปลดล็อก
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
  })
})

test.describe('FB-5 · เดินหน้ากระบวนการหลังจัดทำ คบ.6 ระดับเจ้าหน้าที่', () => {
  test('TC-013 · [High] บันทึกแบบ คบ.6 แล้วกลับมาที่การ์ด ต้องเห็นปุ่มส่งต่อที่กดได้', async ({
    page,
  }) => {
    // Case 1.3 = staff_review — เติมผลประเมินความเร่งด่วน (ปกติ) และข้าม คบ.3 ให้ครบตามเงื่อนไขที่โจทย์ระบุ
    // (การประเมินความเร่งด่วนเป็นขั้นตอนก่อนหน้าที่ทดสอบแยกไว้ในชีตอื่นแล้ว จึงตั้งต้นด้วย casePatch)
    await seedMockState(page, 'Case 1.3', 'officer', {
      urgency: 'normal',
      urgencyAssessedAt: '09/09/2569 15:00',
      urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
      kb3Skipped: true,
      kb3SkipReason: 'ระบุข้อเท็จจริงและพฤติการณ์ภัยคุกคามไว้ครบถ้วนแล้วในแบบ คบ.1',
    })
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)

    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)

    // เจ้าหน้าที่เจ้าของสำนวนกรอกเฉพาะเนื้อหาของตน — ไม่แตะข้อ 10 (ความเห็นผู้บังคับบัญชาชั้นต้น)
    // เพราะข้อ 10 เป็นหน้าที่ของผู้บังคับบัญชาชั้นต้นที่ขั้น supervisor_review เท่านั้น
    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await expect(page.getByText('บันทึกแบบ คบ.6 เรียบร้อยแล้ว')).toBeVisible()

    const saved = await readCase(page, CASE_NO)
    expect(saved?.kb6PreparedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)

    // Expected: ต้องมีปุ่ม "ส่งผู้บังคับบัญชาชั้นต้น" ที่กดได้ (ไม่ค้าง/ไม่ถูก disable)
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('ผู้บังคับบัญชาชั้นต้น')
    await expect(forwardButton).toBeEnabled()
  })

  test('TC-014 · [High] ส่งผู้บังคับบัญชาชั้นต้นสำเร็จ — สถานะ/สเต็ปเปอร์อัปเดต งานปรากฏในคิว และมี Audit Log', async ({
    page,
  }) => {
    // Case 1.3 พร้อมด้วยผลประเมินความเร่งด่วน (ปกติ), ข้าม คบ.3 และ kb6PreparedAt (จำลองว่าบันทึกแบบ คบ.6 แล้วตาม TC-013)
    await seedMockState(page, 'Case 1.3', 'officer', {
      urgency: 'normal',
      urgencyAssessedAt: '09/09/2569 15:00',
      urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
      kb3Skipped: true,
      kb3SkipReason: 'ระบุข้อเท็จจริงและพฤติการณ์ภัยคุกคามไว้ครบถ้วนแล้วในแบบ คบ.1',
      kb6PreparedAt: '09/09/2569 16:00',
    })
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)

    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('supervisor_review')
    // สถานะที่ระบบใช้จริงเมื่อเข้าสู่ขั้นกลั่นกรองของผู้บังคับบัญชาชั้นต้นคือ "รอกลั่นกรอง" (ดู useCaseStore.forwardCase)
    expect(after?.status).toBe('รอกลั่นกรอง')

    // สเต็ปเปอร์/ประวัติแฟ้มต้องบันทึกการส่งต่อครั้งนี้ (Audit Log)
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.length).toBeGreaterThan(0)
    const lastEntry = history[history.length - 1]
    expect(lastEntry.detail || lastEntry.action).toBeTruthy()

    // สลับเป็นผู้บังคับบัญชาชั้นต้น เปิด "งานของฉัน" (คิวงานตามบทบาท) ต้องเห็นแฟ้มนี้
    await switchRole(page, 'supervisor')
    await page.getByRole('link', { name: /งานของฉัน/ }).click()
    await expect(page).toHaveURL(/\/queue\/supervisor/)
    const queueRow = page.locator('tr', { has: page.getByText(CASE_NO) })
    await expect(queueRow).toBeVisible()
    // สถานะที่แสดงใน UI จริง (คอลัมน์ "ขั้นตอน / สถานะ" ของคิวงาน) ต้องสื่อความหมายว่า "รอผู้บังคับบัญชาตรวจ/กลั่นกรอง"
    await expect(queueRow).toContainText(/รอ(ผู้บังคับบัญชา(ชั้นต้น)?ตรวจ|กลั่นกรอง)/)

    // เปิดแฟ้ม — ต้องเห็นชุดเอกสาร คบ.1 + คบ.3 + คบ.6 ครบในส่วนแบบฟอร์มของแฟ้ม
    await queueRow.getByRole('link', { name: new RegExp(CASE_NO) }).click()
    await expect(page).toHaveURL(DOSSIER_URL)

    // สเต็ปเปอร์ (DossierStageTracker) ต้องอัปเดตมาที่หมุด "กลั่นกรอง" (ขั้นที่ 4 — ผู้บังคับบัญชาชั้นต้น) แล้ว
    await expect(page.getByText('กลั่นกรอง', { exact: true })).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()

    // Audit Log / ประวัติ ต้องบันทึกการส่งต่อนี้ไว้
    await page.getByTestId('dossier-tab-audit').click()
    await expect(page.getByTestId('dossier-audit-log-list')).toContainText(/ส่งต่อ/)
  })

  test('TC-015 · [Medium] ข้อ 10 ในแบบ คบ.6 ยังไม่ได้ลงนามที่ขั้นกลั่นกรอง — ระบบบล็อกการเสนอ ผอ. และให้ลงนามได้ทันที', async ({
    page,
  }) => {
    // Case 1.4 = supervisor_review, ประเมินไว้แล้วว่ากรณีปกติ, คบ.3 ถูกข้ามแล้ว, จัดทำ คบ.6 (kb6PreparedAt)
    // มาจากขั้นเจ้าหน้าที่แล้ว — ตามกฎใหม่ ผู้บังคับบัญชาชั้นต้นเป็นผู้กรอกข้อ 10 เองที่ขั้นนี้ ยังไม่ได้กรอกเลย
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb6PreparedAt: '09/09/2569 16:00' })
    await seedKb6OpinionField(page, 'ความเห็นผู้บังคับบัญชาชั้นต้น', '')
    await page.goto(DOSSIER_URL)

    // ปุ่ม "เสนอ ผอ.สำนัก/กอง" ต้องถูกปิดกั้น (disabled) พร้อม title ระบุชัดว่ายังไม่ได้ลงนาม คบ.6
    // โหมดสาธิต: ไม่บังคับกรอกความเห็นก่อน — มีปุ่ม "ลงนาม" ให้กดได้ทันทีจากหน้าแฟ้ม
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()
    await expect(forwardButton).toHaveAttribute('title', /ยังไม่ได้ลงนามความเห็นใน คบ\.6/)
    await expect(page.getByTestId('kb6-sign-button')).toBeVisible()

    // แม้พยายามคลิก แฟ้มก็ต้องยังคงอยู่ที่ supervisor_review เดิม ห้ามเลื่อนขั้นไป director_review
    await forwardButton.click({ force: true })
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('supervisor_review')
  })
})
