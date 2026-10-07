import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * FB-2 / FB-3 — ข้อเสนอแนะจากผู้ใช้ (E-CMIS_UserTest_Feedback_TestCases.xlsx)
 *
 * FB-2: กล่องสรุปข้อมูลแฟ้ม "สรุปข้อมูลแฟ้ม" ต้องแสดงผลประเมินความเร่งด่วนที่ถูกต้องเสมอ (TC-003 .. TC-005)
 * FB-3: การ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" ต้องแสดงชุดแบบฟอร์มให้ตรงกับเส้นทางที่ประเมินไว้ (TC-006 .. TC-008)
 *
 * หมายเหตุการแมปเคส: ชีททดสอบอ้างคดี WP-2569-000502 / 000503 ซึ่งไม่มีอยู่จริงในระบบ (มี mock state
 * เดียวคือ WP-2569-000501 ในทุกไฟล์ src/mock-states/*.json) — ทุกเทสต์ในไฟล์นี้จึงใช้ WP-2569-000501
 * ร่วมกับ mock state ที่ใกล้เคียงขั้นตอนที่ต้องการทดสอบที่สุด (ระบุไว้ในแต่ละเทสต์)
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`

/** ช่องแสดงค่า "ความเร่งด่วน:" ในกล่อง "สรุปข้อมูลแฟ้ม" ทางขวาของแฟ้ม */
function urgencySummaryValue(page: Page) {
  return page
    .locator('span.text-slate-500', { hasText: 'ความเร่งด่วน:' })
    .locator('xpath=following-sibling::span[1]')
}

/** แถวของแบบฟอร์ม คบ. หนึ่งรายการในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" — เทียบรูปแบบกับ sheet05/sheet03 */
function formRow(page: Page, code: string) {
  return page
    .getByTestId('dossier-forms')
    .locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/** ช่องคำอธิบายย่อยใต้ชื่อหมุดหนึ่งหมุดของเส้นทาง (DossierStageTracker) — ใช้อ่านสถานะย่อยของขั้น "จัดทำเอกสาร" */
function stageDescFor(page: Page, label: string) {
  return page.locator(`strong:text-is("${label}")`).locator('xpath=following-sibling::small[1]')
}

test.describe('FB-2 · กล่องสรุปข้อมูลแฟ้มต้องแสดงผลประเมินความเร่งด่วนให้ถูกต้อง', () => {
  test('TC-003 · ประเมินเป็น "ไม่เร่งด่วน (กรณีปกติ)" ครั้งแรก แล้วสรุปข้อมูลแฟ้มต้องอัปเดตและคงอยู่หลังรีโหลด', async ({
    page,
  }) => {
    // ไม่มี Case 1.x ที่ตรงกับ WP-2569-000502 ในชีท — ใช้ Case 1.3 (staff_review, ยังไม่ประเมินความเร่งด่วน)
    // ซึ่งเป็นขั้นที่ใกล้เคียงที่สุดกับ "เปิดคำร้อง → ไปประเมินความเร่งด่วน" ตามที่ TC-003 ต้องการ
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)

    // ก่อนประเมิน กล่องสรุปต้องยังไม่ระบุผล
    await expect(urgencySummaryValue(page)).toHaveText('ยังไม่ประเมิน')
    expect((await readCase(page, CASE_NO))?.urgency).toBeFalsy()

    // เลือก "ไม่เร่งด่วน (กรณีปกติ)" — ป้ายจริงของระบบคือ "กรณีปกติ (→ คบ.3 → คบ.6)" ซึ่งสื่อความหมายเดียวกัน
    await page
      .getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...')
      .fill('ไม่ปรากฏภัยคุกคามเฉพาะหน้า')
    await page.getByRole('button', { name: /กรณีปกติ/ }).click()

    // กล่อง "สรุปข้อมูลแฟ้ม" ต้องแสดง "ปกติ" ไม่ใช่ค่าว่างหรือ "ยังไม่ประเมิน"
    await expect(urgencySummaryValue(page)).toHaveText('ปกติ')
    await expect(urgencySummaryValue(page)).not.toHaveText('ยังไม่ประเมิน')

    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessmentNote).toBe('ไม่ปรากฏภัยคุกคามเฉพาะหน้า')

    // เส้นทางในหมุด "จัดทำเอกสาร" ต้องขยับจาก "รอประเมินความเร่งด่วน" ไปสู่คำอธิบายของเส้นทางปกติ (คบ.1/3/6)
    // — หมายเหตุ: แฟ้มยังอยู่ที่หมุดเดิม (staff_review) เพราะการประเมินไม่ได้ส่งต่อแฟ้มเอง มีเพียงคำอธิบาย
    // ย่อยของหมุดที่เปลี่ยนไปตามเส้นทางที่เลือก — ถือเป็นการ "ขยับสู่ขั้นตอนเส้นทางปกติ" ตามที่ TC-003 คาดหวัง
    await expect(stageDescFor(page, 'จัดทำเอกสาร')).not.toHaveText('รอประเมินความเร่งด่วน')
    // ป้ายจริงของขั้นนี้เป็น "คบ.1/3/6" (รวม คบ.1/คบ.3/คบ.6 ไว้ในข้อความเดียว) — ยืนยันว่าขยับไปเส้นทางปกติแล้ว
    await expect(stageDescFor(page, 'จัดทำเอกสาร')).toHaveText('คบ.1/3/6')

    // ค่าต้องคงอยู่หลังรีโหลดหน้า
    await page.reload()
    await expect(urgencySummaryValue(page)).toHaveText('ปกติ')
    const persisted = await readCase(page, CASE_NO)
    expect(persisted?.urgency).toBe('normal')
    expect(persisted?.urgencyAssessmentNote).toBe('ไม่ปรากฏภัยคุกคามเฉพาะหน้า')
  })
})

test.describe('FB-2 · แก้ไขผลประเมินจาก "ไม่เร่งด่วน" เป็น "เร่งด่วน" ต้องเปลี่ยนเส้นทางและบันทึกลง Audit Log', () => {
  test('TC-004 · แก้ผลประเมินเป็นเร่งด่วนพร้อมเหตุผล — สรุปข้อมูลแฟ้ม เส้นทาง และ Audit Log ต้องตรงกัน', async ({
    page,
  }) => {
    // Case 1.4 — supervisor_review ที่ประเมินไว้แล้วว่า "กรณีปกติ" ตรงกับสถานะตั้งต้นของ TC-004 มากที่สุด
    // (ไม่มี Case ที่ตรงกับ WP-2569-000503 ในชีท) ผู้แก้ไขในขั้นนี้คือผู้บังคับบัญชาชั้นต้น (WIT0410)
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    await expect(urgencySummaryValue(page)).toHaveText('ปกติ')
    expect((await readCase(page, CASE_NO))?.urgency).toBe('normal')

    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
    await page
      .getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...')
      .fill('พบหลักฐานภัยคุกคามใหม่ระหว่างกลั่นกรอง — เปลี่ยนเป็นกรณีจำเป็นเร่งด่วน')
    await page.getByRole('button', { name: /กรณีจำเป็นเร่งด่วน/ }).click()

    // ที่ขั้นกลั่นกรอง (supervisor_review) การแก้เป็นเร่งด่วนจะส่งต่อ ผอ.ทันทีตาม WIT0410 — สรุปข้อมูลแฟ้มยังต้อง
    // แสดงผลถูกต้องแม้สถานะแฟ้มเปลี่ยนไปแล้ว (กล่อง "สรุปข้อมูลแฟ้ม" ไม่ผูกกับสิทธิ์ตามขั้น จึงยังเห็นได้)
    await expect(urgencySummaryValue(page)).toHaveText(/เร่งด่วน/)

    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('urgent')
    expect(after?.urgent).toBe(true)
    expect(after?.stage).toBe('director_review')

    // เส้นทาง (stepper) ต้องสลับไปเส้นทางเร่งด่วน — หมุด "กลั่นกรอง" (ผบช.ชั้นต้น) ต้องถูกข้าม (Fast Track)
    await expect(stageDescFor(page, 'กลั่นกรอง')).toHaveText('ข้าม (Fast Track)')

    // Audit Log ต้องบันทึกการเปลี่ยนผลประเมิน (ไม่ใช่แค่การประเมินครั้งแรก)
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    const revisionEntry = history.find((h) => (h.action ?? '').includes('แก้ผลการประเมินความเร่งด่วน'))
    expect(revisionEntry).toBeTruthy()
    expect(revisionEntry?.action).toContain('กรณีจำเป็นเร่งด่วน')

    // รายการแบบฟอร์มต้องเปิด คบ.4/คบ.5 ให้แล้ว — ตรวจในมุมมอง ผอ. ผู้ถือแฟ้มขั้นถัดไป
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await expect(formRow(page, 'คบ.5')).toBeVisible()

    // เปิดแท็บ Audit Log ในหน้าจอจริงเพื่อยืนยันว่าเห็นรายการเปลี่ยนแปลงนี้ด้วย (ไม่ใช่แค่ข้อมูลใน store)
    await page.getByTestId('dossier-tab-audit').click()
    await expect(page.getByTestId('dossier-audit-log-list')).toContainText('แก้ผลการประเมินความเร่งด่วน')
  })
})

test.describe('FB-2 · แฟ้มที่ยังไม่ประเมินความเร่งด่วนต้องไม่เปิด คบ.4/คบ.6 ให้กดพลาด', () => {
  test('TC-005 · ยังไม่ประเมินความเร่งด่วน — สรุปข้อมูลแฟ้มต้องขึ้น "ยังไม่ประเมิน" และห้ามเปิด คบ.4/คบ.6 ได้', async ({
    page,
  }) => {
    // Case 1.3 — staff_review รับ คบ.1 เข้าทะเบียนแล้ว (form ไม่ใช่ คบ.2) แต่ยังไม่มีผลประเมินความเร่งด่วน
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)

    await expect(urgencySummaryValue(page)).toHaveText('ยังไม่ประเมิน')

    // ต้องไม่มี คบ.4 ให้เปิด — ผ่านจริงเพราะยังไม่ติดธง urgent
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)

    // getCaseFormNumbers() ต้องรอผลประเมินความเร่งด่วนก่อนจึงตัดสินเส้นทาง — ยังไม่ประเมิน จึงไม่เติม
    // คบ.6 เข้ารายการล่วงหน้า (เดิมสันนิษฐานว่า "กรณีปกติ" ไปก่อนทันที)
    await expect(formRow(page, 'คบ.6')).toHaveCount(0)

    // ต้องมีข้อความแนะนำให้ประเมินความเร่งด่วนก่อนจึงจะเห็นแบบฟอร์มเส้นทางถัดไป
    await expect(page.getByText(/ประเมินความเร่งด่วนก่อน|กรุณาประเมินความเร่งด่วน/)).toBeVisible()
  })
})

test.describe('FB-3 · การ์ดแบบฟอร์ม คบ. ต้องตรงกับเส้นทางกรณีปกติ', () => {
  test('TC-006 · กรณีปกติ — แสดงเฉพาะ คบ.1, คบ.3, คบ.6 (3 แบบ) และต้องไม่มี คบ.4', async ({ page }) => {
    // Case 1.4 — supervisor_review ประเมินไว้แล้วว่า "กรณีปกติ"
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    const formsCard = page.getByTestId('dossier-forms')
    await expect(formsCard.getByRole('heading', { name: /แบบฟอร์ม คบ\. ในแฟ้มนี้ \(3 แบบ\)/ })).toBeVisible()

    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()

    // ต้องไม่มี คบ.4 "บันทึกขอความคุ้มครองพยานชั่วคราวกรณีจำเป็นเร่งด่วน" ปนอยู่ในรายการของเคสกรณีปกติ
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(formsCard.getByText('บันทึกขอความคุ้มครองพยานชั่วคราวกรณีจำเป็นเร่งด่วน')).toHaveCount(0)
  })
})

test.describe('FB-3 · การ์ดแบบฟอร์ม คบ. ต้องตรงกับเส้นทางกรณีเร่งด่วน', () => {
  test('TC-007 · กรณีเร่งด่วน — แสดง คบ.1, คบ.4 และร่าง คบ.5 · เปิด คบ.4 ได้ปกติ · คบ.6 ยังไม่ปรากฏ (รอเข้าคำร้องหลัก)', async ({
    page,
  }) => {
    // Case 3 — staff_review ประเมินไว้แล้วว่าเร่งด่วน ยังไม่ได้เลือกวิธีคุ้มครองใน คบ.4 (ขั้นจัดทำ)
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)

    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await expect(formRow(page, 'คบ.5')).toBeVisible()

    // คบ.6 ยังไม่อยู่ในรายการของเส้นทางเร่งด่วนขั้นนี้ — "ยังอยู่ในเส้นทางคำร้องหลัก" ตามที่ TC-007 ระบุ
    // (จะปรากฏอีกครั้งเมื่อคำร้องหลักเดินต่อไปตามปกติ WIT0614 หลังตัดสินเรื่องคุ้มครองชั่วคราวแล้ว)
    await expect(formRow(page, 'คบ.6')).toHaveCount(0)

    // เปิดแบบฟอร์ม คบ.4 ต้องเข้าฟอร์มได้ตามปกติ ไม่มีการบล็อกใด ๆ
    await formRow(page, 'คบ.4').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page.getByText('บันทึกข้อความ การขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน')).toBeVisible()
    await expect(page.getByText('เจ้าพนักงานเสนอผู้อำนวยการสำนัก/กอง/ศูนย์ พิจารณาอนุมัติมาตรการชั่วคราวทันที')).toBeVisible()
  })
})

test.describe('FB-3 · เปลี่ยนผลประเมินจากเร่งด่วนกลับเป็นปกติต้องมีคำเตือนและไม่ทำลายข้อมูลเดิม', () => {
  test('TC-008 · เคสเร่งด่วนมีร่าง คบ.4 ค้างอยู่ → เปลี่ยนเป็นไม่เร่งด่วน → ต้องมีคำเตือนยืนยันก่อน และห้ามลบข้อมูลเดิมอย่างเงียบ ๆ', async ({
    page,
  }) => {
    // Case 3 — staff_review เร่งด่วน ใช้กรอกร่าง คบ.4 บางส่วนผ่านหน้าจอจริงก่อน (ผ่าน UI ตามข้อกำหนด)
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(KB4_FORM_URL)

    const behaviorField = page
      .locator('label:text-is("2.1 รายละเอียดพฤติการณ์แห่งคดี")')
      .locator('xpath=following-sibling::textarea[1]')
    await behaviorField.fill('พยานถูกข่มขู่ทางโทรศัพท์ให้ถอนคำให้การ เมื่อคืนวันที่ 9 กันยายน 2569')
    await behaviorField.blur()

    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.4')).toBeVisible()

    const historyBefore = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<
      Record<string, string>
    >

    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
    await page
      .getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...')
      .fill('ตรวจสอบแล้วไม่พบภัยคุกคามเฉพาะหน้าจริง ปรับเป็นกรณีปกติ')
    await page.getByRole('button', { name: /กรณีปกติ/ }).click()

    // ระบบต้องแสดงคำเตือนยืนยันก่อนเปลี่ยนผล (มีร่าง คบ.4 ค้างอยู่) แล้วกดยืนยันเพื่อดำเนินการต่อ
    const confirmPopup = page.locator('.swal2-popup:not(.swal2-toast)')
    await expect(confirmPopup).toBeVisible()
    await expect(confirmPopup).toContainText('พยานถูกข่มขู่ทางโทรศัพท์')
    await expect(confirmPopup).toContainText(/ไม่ถูกลบ/)
    await page.getByRole('button', { name: 'ยืนยันเปลี่ยนเป็นกรณีปกติ' }).click()
    await confirmPopup.waitFor({ state: 'detached' })

    // หลังเปลี่ยนผล — คบ.4 ต้องหายไปจากรายการแบบฟอร์มที่เปิดได้
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('normal')

    // ข้อมูลร่าง คบ.4 เดิมต้องไม่ถูกลบทิ้งอย่างเงียบ ๆ — ตรวจที่ store ของแบบฟอร์มโดยตรง (ยังไม่ถูกล้าง)
    const kb4DraftKept = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      if (!raw) return ''
      const drafts = JSON.parse(raw).state.drafts as Record<string, Record<string, unknown>>
      return String(drafts?.['4']?.['พฤติการณ์แห่งคดี'] ?? '')
    })
    expect(kb4DraftKept).toContain('พยานถูกข่มขู่ทางโทรศัพท์')

    // ข้อมูลเดิมของ คบ.4 ต้อง "เก็บไว้ใน Audit Log" ด้วย ไม่ใช่แค่ข้อความสรุปการเปลี่ยนผลประเมินเฉย ๆ
    const history = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.length).toBeGreaterThan(historyBefore.length)
    const revisionEntry = history.find((h) => (h.action ?? '').includes('แก้ผลการประเมินความเร่งด่วน'))
    expect(revisionEntry).toBeTruthy()
    expect(revisionEntry?.detail).toContain('พยานถูกข่มขู่ทางโทรศัพท์')
    await page.getByTestId('dossier-tab-audit').click()
    await expect(page.getByTestId('dossier-audit-log-list')).toContainText('พยานถูกข่มขู่ทางโทรศัพท์')
  })
})
