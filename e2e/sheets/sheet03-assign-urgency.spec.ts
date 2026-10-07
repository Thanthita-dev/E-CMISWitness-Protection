import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { newCaseNoAfterIntake } from '../helpers/seed'

/**
 * Sheet 03 · มอบหมาย / ประเมินความเร่งด่วน (WIT0301 → WIT0313)
 *
 * ครอบคลุมการมอบหมายเจ้าของสำนวนโดย ผอ.สำนัก/กอง (WIT0304-0306), การประเมินความเร่งด่วน
 * โดยเจ้าหน้าที่ผู้รับผิดชอบเมื่อยังไม่มีผลประเมิน (WIT0309-0310), การจำแนกเอกสารตั้งต้นเพื่อส่งงาน
 * ต่อแท็บ 04 (WIT0311-0313), สิทธิ์การมอบหมาย/เข้าถึงตาม Role และ Need-to-Know
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const OFFICER_A = 'นางสาวอรุณี ใจมั่น' // OFF-001
const OFFICER_B = 'นายธนาธิป สุวรรณเวช' // OFF-002

/** ช่องเลือกเจ้าหน้าที่ในการ์ด "ขั้นที่ 2 · มอบหมายและจัดสรรผู้รับผิดชอบ" — ต้อง scope เพราะหน้ามี <select> ของ TopBar ปนอยู่ด้วย */
const assignSelect = (page: Page) =>
  page.locator('section', { hasText: 'มอบหมายและจัดสรรผู้รับผิดชอบ' }).getByRole('combobox')

/**
 * สลับ "ตัวตน" เจ้าหน้าที่ที่ล็อกอินอยู่ (currentOfficerUserId) โดยไม่เปลี่ยน role — ใช้จำลองเจ้าหน้าที่
 * คนละคนที่มี/ไม่มีสิทธิ์เป็นเจ้าของสำนวนคดีนี้ (ต่างจาก switchRole ที่สลับ role ทั้งบทบาท)
 * เป็น helper เฉพาะไฟล์นี้ตามข้อกำหนดใน BRIEF — ไม่แก้ e2e/helpers/seed.ts
 */
async function switchOfficer(page: Page, officerUserId: string) {
  await page.addInitScript((id: string) => {
    const raw = localStorage.getItem('ecmis-auth-storage')
    if (!raw) return
    const auth = JSON.parse(raw)
    auth.state.currentOfficerUserId = id
    localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
  }, officerUserId)
  await page.reload()
}

/**
 * เดินคำขอจากขั้นรับเรื่อง (หลังสร้างผ่าน /intake) ไปจนถึง staff_review — เชื่อมโยงคดีหลัก, ส่งต่อ ผอ.,
 * ผอ. มอบหมายเจ้าของสำนวน (ค่าตั้งต้น) แล้วส่งต่ออีกครั้ง — ใช้ยืนยันป้าย "ต้องจัดทำ" ที่เห็นได้จริงบนแฟ้ม
 */
/** อ่านบันทึกการเข้าถึงแฟ้มจากสโตร์ Audit — ใช้ยืนยันว่า "บันทึกทุกการเข้าถึง" จริงแม้ผู้เข้าถึงจะไม่มีสิทธิ์ดู */
async function readAccessLogs(page: Page, caseNo: string) {
  return page.evaluate((no: string) => {
    const raw = localStorage.getItem('ecmis-audit-storage')
    if (!raw) return [] as Array<Record<string, string>>
    const logs = JSON.parse(raw).state.logs as Array<Record<string, string>>
    return logs.filter((l) => l.caseNo === no)
  }, caseNo)
}

async function advanceToStaffReview(page: Page, caseNo: string) {
  await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
  await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
  await page.getByTestId('forward-case-button').click()
  await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
  await expect.poll(async () => (await readCase(page, caseNo))?.stage).toBe('director_assign')

  await switchRole(page, 'director')
  await page.goto(`/dossier/${caseNo}`)
  await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
  await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
  await page.getByTestId('forward-case-button').click()
  await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
  await expect.poll(async () => (await readCase(page, caseNo))?.stage).toBe('staff_review')

  await switchRole(page, 'officer')
  await page.goto(`/dossier/${caseNo}`)
}

test.describe('Sheet 03 — มอบหมาย / ประเมินความเร่งด่วน', () => {
  test('TC-012 · [Happy] ผอ. มอบหมายเจ้าหน้าที่ผู้รับผิดชอบงานคุ้มครองพยาน', async ({ page }) => {
    await seedMockState(page, 'Case 1.2', 'director')
    await page.goto(DOSSIER_URL)

    await expect(page.getByText('รอมอบหมายเจ้าของสำนวน')).toBeVisible()
    // ใช้ทำเนียบผู้ใช้จริงของระบบ (ไม่มีชื่อ "นางสาวสุดา ข." ตามข้อมูลทดสอบ) — เลือกค่าตั้งต้นที่ระบบเสนอให้
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()

    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    const assigned = await readCase(page, CASE_NO)
    expect(assigned?.assignedOfficerUserId).toBeTruthy()
    expect(assigned?.assignedAt).toBeTruthy()
    expect(assigned?.assignedBy).toBeTruthy()

    // Expected เพิ่มเติม: ระบบแจ้งเตือนงานไปยังเจ้าหน้าที่ที่ถูกมอบหมาย (WIT0306) — ตรวจว่ามีรายการแจ้งเตือนจริง
    // เกิดขึ้น (ไม่ใช่แค่ข้อความหัวข้อหน้าที่พูดถึงคำว่า "มอบหมาย" ทั่วไป) — พบว่าไม่มีการแจ้งเตือนใด ๆ เกิดขึ้นจริง
    await switchRole(page, 'officer')
    await page.goto('/notifications')
    await expect(page.getByText('ไม่มีรายการแจ้งเตือนในขณะนี้')).toHaveCount(0)
  })

  test('TC-013 · [Happy] ผอ. มอบหมายให้เจ้าหน้าที่คนอื่นที่ไม่ใช่เจ้าของสำนวนคดีเดิม', async ({ page }) => {
    // Case 1.2 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — patch ให้เชื่อมโยงแล้วโดยเจ้าของสำนวนคดีหลักเดิม (mainCaseLeadOfficer)
    // คือ "ร.ต.อ.สมชาย ตรวจสอบธรรม" ซึ่งอยู่นอกทะเบียน
    await seedMockState(page, 'Case 1.2', 'director', {
      linkedMainCaseId: 'GBK-2569-0001',
      mainCaseNo: 'กบค. 001/2569',
      mainCaseTitle: 'คดีทุจริตโครงการจัดซื้ออุปกรณ์เทศบาลตำบลโคกสะอาด',
      mainCaseScore: '100%',
      mainCaseRelation: 'ภัยคุกคามเกิดจากการให้ถ้อยคำเป็นพยานในสำนวนคดีหลักนี้',
      mainCaseStatus: 'linked',
      mainCaseNotFound: false,
      mainCaseLeadOfficer: 'ร.ต.อ.สมชาย ตรวจสอบธรรม',
    })
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.mainCaseLeadOfficer).toBe('ร.ต.อ.สมชาย ตรวจสอบธรรม')

    await assignSelect(page).selectOption('OFF-002')
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()

    await expect(page.getByText(`มอบหมายแล้ว: ${OFFICER_B}`)).toBeVisible()
    const after = await readCase(page, CASE_NO)
    expect(after?.assignedOfficer).toBe(OFFICER_B)
    // เจ้าของสำนวนคดีหลักเดิมไม่ถูกแทนที่ในข้อมูล — ยังคงอยู่ในแฟ้ม (ตรวจผ่าน store)
    expect(after?.mainCaseLeadOfficer).toBe('ร.ต.อ.สมชาย ตรวจสอบธรรม')

    // Expected: ต้อง "แสดงทั้งสองบทบาทในแฟ้ม" พร้อมกันโดยไม่แทนที่กัน — หัวแฟ้มแสดงทั้งเจ้าของสำนวนคดีหลักเดิม
    // และผู้รับผิดชอบงานคุ้มครองพยานคนใหม่
    const officerRoles = page.getByTestId('case-officer-roles')
    await expect(officerRoles).toContainText('เจ้าของสำนวนคดีหลักเดิม: ร.ต.อ.สมชาย ตรวจสอบธรรม')
    await expect(officerRoles).toContainText(`ผู้รับผิดชอบงานคุ้มครองพยาน: ${OFFICER_B}`)
  })

  test('TC-014 · [Happy] เจ้าหน้าที่ประเมินความเร่งด่วนเองเมื่อยังไม่มีผลประเมิน', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.urgency).toBeFalsy()

    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()

    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessedBy).toBeTruthy()
    // ขั้นนี้ต้องไม่มีการสร้างเลขแบบ คบ. ใด ๆ — ยังอยู่ที่ staff_review เดิม ไม่เปลี่ยน form ปัจจุบัน
    expect(after?.stage).toBe('staff_review')
    expect(after?.form).toBe(before?.form)
  })

  test('TC-015 · [Happy] เอกสารตั้งต้นเป็น คบ.2 → ส่งไปจัดทำ คบ.1 ที่แท็บ 04', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')
    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('กรณีปกติ')
    await page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' }).click()
    const caseNo = await newCaseNoAfterIntake(page, { expectForm: 2 })

    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('kb2')
    expect(created?.pendingIntakeForms).toEqual(expect.arrayContaining(['คบ.1', 'คบ.3']))

    // ส่งงานต่อจนถึงแท็บ 04 (staff_review) — ป้าย "ต้องจัดทำ" ต้องระบุ คบ.1 ให้เห็นชัดในการ์ดส่งงาน
    await advanceToStaffReview(page, caseNo)
    await expect(page.getByText(/ต้องจัดทำ.*คบ\.1/)).toBeVisible()

    // ปัจจุบัน: ฟอร์ม คบ.1 แสดงค่า "กมลชนก บุญรักษา" ในช่อง "ชื่อ" เสมอ — นี่คือ DEFAULT_KB1_DRAFT ที่ hardcode
    // ไว้ตายตัวในสโตร์ (ใช้ปนกันทุกแฟ้ม) ไม่ใช่ข้อมูลจาก คบ.2 ของคำขอนี้จริง (คำขอนี้ยังไม่เคยมีใครกรอกชื่อเลย)
    // (การเช็ค input ตัวแรกแบบเดิมก็ผ่านด้วยเหตุผลเดียวกัน คือค่า default ของหัวเอกสาร ไม่ใช่ข้อมูลจาก คบ.2 จริง)
    // Expected เพิ่มเติม: นำข้อมูลจาก คบ.2 ของคำขอนี้ไปแสดงเป็นค่าตั้งต้น — เมื่อยังไม่เคยมีข้อมูลนี้ ช่องควรว่างเปล่า ไม่ใช่ค่า demo ของคำขออื่น
    await page.goto(`/form/1?caseNo=${caseNo}`)
    const nameInput = page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]')
    await expect(nameInput).toHaveValue('')
  })

  test('TC-016 · [Happy] เอกสารตั้งต้นเป็น คบ.1 แล้ว → ส่งไปตรวจ คบ.1/คบ.3 โดยไม่บังคับสร้างซ้ำ', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')
    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('กรณีปกติ')
    await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
    const caseNo = await newCaseNoAfterIntake(page, { expectForm: 1 })

    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('kb1')
    // งานที่เหลือมีเฉพาะ คบ.3 — ไม่บังคับให้สร้าง คบ.1 ซ้ำ
    expect(created?.pendingIntakeForms).toEqual(['คบ.3'])
    expect(created?.pendingIntakeForms).not.toContain('คบ.1')

    await advanceToStaffReview(page, caseNo)
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
  })

  test('TC-017 · [Negative] คำขอที่ Case Link = not_found ต้องเสนอ ผอ. ได้ ห้ามปัดตก', async ({ page }) => {
    await seedMockState(page, 'Case 1.2', 'director', {
      mainCaseNotFound: true,
      mainCaseStatus: 'not_found',
      linkedMainCaseId: undefined,
      mainCaseNo: undefined,
    })
    await page.goto(DOSSIER_URL)

    // หน้าจอ ผอ. แสดงสถานะ Case Link ชัดเจนพร้อมเหตุผล
    await expect(page.getByText('ยังไม่ได้เชื่อมโยงเลขสำนวนหลัก', { exact: true })).toBeVisible()
    await expect(page.getByText('ห้ามปัดตกคำร้องด้วยเหตุนี้')).toBeVisible()

    // ยังมอบหมายได้ตามปกติ ไม่มีการบล็อกหรือปัดตกอัตโนมัติ
    await expect(page.getByRole('button', { name: /ปัดตก|ปฏิเสธคำร้อง/ })).toHaveCount(0)
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    expect((await readCase(page, CASE_NO))?.assignedOfficerUserId).toBeTruthy()
  })

  test('TC-018 · [Negative] ผู้ที่ไม่ใช่ ผอ. พยายามมอบหมายผู้รับผิดชอบ', async ({ page }) => {
    await seedMockState(page, 'Case 1.2', 'receiver')
    await page.goto(DOSSIER_URL)

    // ระบบไม่แสดงการ์ด/ปุ่มมอบหมายเลยสำหรับบทบาทที่ไม่ใช่ ผอ.
    await expect(page.getByText('มอบหมายและจัดสรรผู้รับผิดชอบ')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' })).toHaveCount(0)

    // Expected เพิ่มเติม: บันทึกความพยายามลง Audit Log — ไม่มีกลไกบันทึก/แสดง Audit Log ของความพยายามเข้าถึงเลย
    await expect(page.getByText(/Audit Log|ประวัติการเข้าถึง/i)).toBeVisible()
  })

  test('TC-019 · [Negative] มอบหมายโดยไม่เลือกผู้รับผิดชอบ', async ({ page }) => {
    // Blocked: ช่องเลือกผู้รับผิดชอบเป็น <select> ที่มีค่าเริ่มต้นเสมอ (เลือกเจ้าหน้าที่คนแรกไว้ล่วงหน้าโดย
    // อัตโนมัติ) ไม่มีตัวเลือกว่าง — จึงไม่มีทางกดบันทึกโดย "เว้นช่องผู้รับผิดชอบ" ได้จริงผ่าน UI
    await seedMockState(page, 'Case 1.2', 'director')
    await page.goto(DOSSIER_URL)
    test.skip(true, 'ช่องเลือกเจ้าหน้าที่มีค่าเริ่มต้นเสมอ ไม่มีตัวเลือกว่าง จึงจำลองการ "ไม่เลือก" ไม่ได้ผ่าน UI จริง')
  })

  test('TC-020 · [Edge] เปลี่ยนตัวผู้รับผิดชอบหลังมอบหมายไปแล้ว', async ({ page }) => {
    await seedMockState(page, 'Case 1.2', 'director', {
      assignedOfficer: OFFICER_A,
      assignedOfficerUserId: 'OFF-001',
      assignedAt: '08/09/2569 10:00',
      assignedBy: 'นายวีระยุทธ พิทักษ์ธรรม',
      status: 'มอบหมายเจ้าของสำนวนแล้ว — รอส่งต่อ',
    })
    await page.goto(DOSSIER_URL)

    await expect(page.getByText(`มอบหมายแล้ว: ${OFFICER_A}`)).toBeVisible()
    await page.getByRole('button', { name: 'เปลี่ยนเจ้าของสำนวน' }).click()
    await assignSelect(page).selectOption('OFF-002')
    await page.getByRole('button', { name: 'ยืนยันเปลี่ยนเจ้าของสำนวน' }).click()

    await expect(page.getByText(`มอบหมายแล้ว: ${OFFICER_B}`)).toBeVisible()
    const changed = await readCase(page, CASE_NO)
    expect(changed?.assignedOfficerUserId).toBe('OFF-002')
    const history = (changed?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.detail?.includes(OFFICER_B))).toBe(true)

    // ส่งต่อเข้าสู่ staff_review เพื่อให้เคสปรากฏในคิวงานของเจ้าหน้าที่ (ก่อนหน้านี้ยังค้างที่ ผอ. ไม่มีในคิวใครเลย)
    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    // B (เจ้าของสำนวนคนใหม่) ต้องเห็นงานในคิว
    await switchRole(page, 'officer')
    await switchOfficer(page, 'OFF-002')
    await page.goto('/queue/officer')
    await expect(page.getByText(CASE_NO)).toBeVisible()

    // Expected: A ต้องไม่เห็นงานนี้ในคิวแล้ว — แต่คิวงาน /queue/officer กรองตามบทบาท+สถานะเท่านั้น ไม่ได้กรอง
    // ตามตัวเจ้าหน้าที่ที่ได้รับมอบหมายจริง (assignedOfficerUserId) จึง A ยังเห็นงานนี้อยู่เช่นกัน
    await switchOfficer(page, 'OFF-001')
    await page.goto('/queue/officer')
    await expect(page.getByText(CASE_NO)).toHaveCount(0)
  })

  test('TC-021 · [Edge] เจ้าหน้าที่ที่ไม่ได้รับมอบหมายเปิดคำขอ (Need-to-Know)', async ({ page }) => {
    // Case 1.3 มอบหมายให้ OFF-001 (นางสาวอรุณี ใจมั่น) แล้ว — จำลอง "เจ้าหน้าที่ต่างหน่วย" ด้วย OFF-002
    await seedMockState(page, 'Case 1.3', 'officer')
    await switchOfficer(page, 'OFF-002')
    await page.goto(DOSSIER_URL)

    // จำกัดการเข้าถึงตามสิทธิ์/Need-to-Know — ไม่เห็นส่วนแบบฟอร์ม คบ. และการ์ดเชื่อมโยงคดีหลัก/ส่งงานของสำนวนนี้
    await expect(page.getByTestId('dossier-forms')).toHaveCount(0)
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toHaveCount(0)

    // บันทึกการเข้าถึงลง Audit Log ทุกครั้ง แม้ผู้เข้าถึงจะถูกจำกัดสิทธิ์ (ข้อมูลพยานอ่อนไหว ต้องตรวจย้อนหลังได้)
    await expect
      .poll(async () => (await readAccessLogs(page, CASE_NO)).length)
      .toBeGreaterThan(0)
    const denied = (await readAccessLogs(page, CASE_NO)).filter((l) => l.actorUserId === 'OFF-002')
    expect(denied.length).toBeGreaterThan(0)
    expect(denied[0].action).toContain('พยายามเข้าถึงแฟ้มโดยไม่ได้รับมอบหมาย')

    // แต่ตัวผู้ที่ไม่มีสิทธิ์ต้องไม่เห็นแท็บประวัติ/Audit Log ของแฟ้มนี้ (Need-to-Know)
    await expect(page.getByTestId('dossier-tab-audit')).toHaveCount(0)

    // ผู้มีสิทธิ์ (ผอ.สำนัก/กอง) เปิดดูบันทึกการเข้าถึงย้อนหลังได้
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await page.getByTestId('dossier-tab-audit').click()
    await expect(page.getByTestId('dossier-audit-log-list')).toContainText(OFFICER_B)
    await expect(page.getByTestId('dossier-audit-log-list')).toContainText(
      'พยายามเข้าถึงแฟ้มโดยไม่ได้รับมอบหมาย'
    )
  })
})
