import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { newCaseNoAfterIntake } from '../helpers/seed'
import { areaField, confirmDialog, expectStage, formRow } from './journey-helpers'

/**
 * J03 · รับเรื่องใหม่จากทะเบียน (เข้าพบ คบ.1 / ธุรการรับคำร้อง) → ผอ. มอบหมาย → จัดทำ คบ.1 / คบ.3 / คบ.6 → ผบช.ชั้นต้น
 *
 * เส้นทางหลัก: เจ้าหน้าที่ ป.ป.ท. กด "รับคำร้องใหม่" จาก /registry เลือก คบ.1 (เข้าพบ) → เชื่อมโยงเลขสำนวน → ส่ง ผอ.
 * → ผอ. มอบหมาย (แท็บ 03) → เจ้าของสำนวนจัดทำ คบ.1 / "ไม่ข้าม" คบ.3 (WIT0407 → WIT0408) / คบ.6 (แท็บ 04)
 * → ส่งผู้บังคับบัญชาชั้นต้นเห็นชุดเสนอที่มี คบ.3 (scenario `kb3-prepared`: Case 1.3 → 6.3)
 *
 * ทางแยก (◇) ในแท็บ 02 / 03 / 04:
 *   J03-a  ธุรการรับคำร้อง (WIT0203/0206 แนบไฟล์) → เจ้าของสำนวนประเมินปกติ (WIT0310) → ข้าม คบ.3 (WIT0409)
 *   J03-b  กลั่นกรองเป็นเร่งด่วนตั้งแต่ /intake → เข้าเส้นทางเร่งด่วน (แท็บ 06)
 *   J03-c  ธุรการรับคำร้อง → เจ้าของสำนวนประเมินเป็นเร่งด่วน (WIT0310/0410) → เข้าเส้นทางเร่งด่วน (แท็บ 06)
 *   J03-d  ข้าม คบ.3 แล้วเปลี่ยนใจกู้คืนและจัดทำ คบ.3 (WIT0407 สองทางในแฟ้มเดียว)
 *
 * ทุกเทสต์ seed "Case 1" ครั้งเดียวเป็นฐาน (store เริ่มต้น) แล้วสร้างแฟ้มใหม่ผ่าน UI /intake — เลขแฟ้มอ่านจาก URL
 */

const pdfFile = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024, 0x20) })
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const NORMAL_BTN = 'กรณีปกติ (→ คบ.3 → คบ.6)'
const URGENT_BTN = 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)'

async function newCaseNoFromUrl(page: Page): Promise<string> {
  return newCaseNoAfterIntake(page)
}

/** เปิดหน้า /intake ด้วยการกด "รับคำร้องใหม่" จากทะเบียน (ไม่พิมพ์ URL เอง) */
async function openIntakeFromRegistry(page: Page) {
  await page.goto('/registry')
  await page.getByRole('link', { name: 'รับคำร้องใหม่' }).click()
  await expect(page).toHaveURL(/\/intake$/)
}

/** เจ้าหน้าที่กลั่นกรองความเร่งด่วนบน /intake (WIT0207/0208) */
async function screenUrgency(page: Page, kind: 'normal' | 'urgent', reason: string) {
  await page.getByRole('radio', { name: kind === 'normal' ? /^กรณีปกติ/ : /^กรณีจำเป็นเร่งด่วน/ }).click()
  await page.locator('#intakeScreeningNote').fill(reason)
}

/** เชื่อมโยงเลขสำนวนหลัก (WIT0212-0214) — ทำได้เฉพาะเจ้าของสำนวนที่ ผอ. มอบหมาย หรือเจ้าหน้าที่ที่รับคำร้องเอง */
async function linkMainCaseAsOwner(page: Page, caseNo: string) {
  await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
  await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
  expect((await readCase(page, caseNo))?.mainCaseStatus).toBe('linked')
}

/**
 * ส่ง ผอ. มอบหมาย (WIT0216) — ธุรการไม่เห็นการ์ดเชื่อมโยง ส่งต่อได้เลยโดยยังไม่เชื่อมโยง
 * ส่วนเจ้าหน้าที่ผู้รับเรื่องเอง (officer-receiver) เชื่อมโยงก่อนส่งได้
 */
async function linkAndForwardToDirector(page: Page, caseNo: string, opts: { link: boolean } = { link: true }) {
  if (opts.link) await linkMainCaseAsOwner(page, caseNo)
  else await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expectStage(page, 'director_assign', caseNo)
}

/** ผอ. มอบหมายเจ้าของสำนวนแล้วส่งต่อให้เจ้าหน้าที่ (WIT0301-0306) */
async function directorAssigns(page: Page, caseNo: string, opts: { linkAfterAssign: boolean } = { linkAfterAssign: false }) {
  await switchRole(page, 'director')
  await page.goto(`/queue/director`)
  await expect(page.getByText(caseNo)).toBeVisible()
  await page.goto(`/dossier/${caseNo}`)
  await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
  await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
  expect((await readCase(page, caseNo))?.assignedOfficerUserId).toBeTruthy()
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expectStage(page, 'staff_review', caseNo)
  await switchRole(page, 'officer')
  await page.goto(`/dossier/${caseNo}`)
  // ธุรการส่งมาโดยไม่เชื่อมโยง — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงต่อ
  if (opts.linkAfterAssign) await linkMainCaseAsOwner(page, caseNo)
}

/** จัดทำ คบ.1 (WIT0404/0405): กรอกชื่อ-นามสกุลที่ส่วนแรก เดินจนท้ายฟอร์มแล้วบันทึก */
async function fillKb1(page: Page, caseNo: string) {
  await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/1/)
  await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').fill('กมลชนก')
  await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').fill('บุญรักษา')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
  await page.goto(`/dossier/${caseNo}`)
}

/** จัดทำ คบ.3 (WIT0408) */
async function fillKb3(page: Page, caseNo: string, text: string) {
  await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/3\?caseNo=/)
  await areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(text)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
  await page.goto(`/dossier/${caseNo}`)
}

/** จัดทำ คบ.6 ที่ระดับเจ้าหน้าที่ (WIT0411) */
async function fillKb6(page: Page, caseNo: string) {
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6/)
  await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
  await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${caseNo}`))
}

/** กดข้าม คบ.3 พร้อมเหตุผล (WIT0409) */
async function skipKb3(page: Page, reason: string) {
  await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await dialog.getByRole('textbox').fill(reason)
  await dialog.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ธุรการรับคำร้องใหม่จากทะเบียน แนบไฟล์สแกน แล้วเปิดแฟ้ม (WIT0203/0206) */
async function receiverIntakesPetition(page: Page): Promise<string> {
  await seedMockState(page, 'Case 1', 'receiver')
  await openIntakeFromRegistry(page)
  // ธุรการไม่ต้องกลั่นกรองความเร่งด่วน (ผังวางไว้เลนเดียวกันกับเจ้าหน้าที่ — โปรโตไทป์ต่าง)
  await expect(page.getByText('กลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ. *')).toHaveCount(0)
  await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นางสาวกมลชนก บุญรักษา')
  // WIT0206 — แนบไฟล์สแกน (ไม่มีขั้นสแกนแยก ระบบบันทึกเพียง scanStatus = pending)
  await page.getByLabel('เลือกไฟล์เอกสารต้นทาง').setInputFiles(pdfFile('petition-scan.pdf'))
  await expect(page.getByText('petition-scan.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
  const caseNo = await newCaseNoFromUrl(page)
  const created = await readCase(page, caseNo)
  expect(created?.intakeDocType).toBe('petition')
  expect(created?.intakeChannel).toBe('document')
  expect(created?.scanStatus).toBe('pending')
  expect(created?.urgency).toBeFalsy()
  expect(created?.pendingIntakeForms).toEqual(expect.arrayContaining(['คบ.1', 'คบ.3']))
  await expectStage(page, 'receiver_intake', caseNo)
  return caseNo
}

/** เจ้าหน้าที่รับเข้าพบ: เลือกผลกลั่นกรอง + คบ.1 + แนบไฟล์ แล้วบันทึก (WIT0207-0211) */
async function officerIntakesKb1(page: Page, kind: 'normal' | 'urgent', reason: string): Promise<string> {
  await seedMockState(page, 'Case 1', 'officer')
  await openIntakeFromRegistry(page)
  await screenUrgency(page, kind, reason)
  await page.getByLabel('อัปโหลดไฟล์ คบ.1').setInputFiles(pdfFile('kb1-evidence.pdf'))
  await expect(page.getByText('kb1-evidence.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
  const caseNo = await newCaseNoFromUrl(page)
  const created = await readCase(page, caseNo)
  expect(created?.intakeDocType).toBe('kb1')
  expect(created?.intakeChannel).toBe('walkin')
  expect(created?.pendingIntakeForms).toEqual(['คบ.3'])
  expect(created?.urgency).toBe(kind)
  return caseNo
}

test('J03 · เจ้าหน้าที่รับเข้าพบ คบ.1 จากทะเบียน → ผอ. มอบหมาย → จัดทำ คบ.1 + คบ.3 (ไม่ข้าม) + คบ.6 → ผบช.ชั้นต้นตรวจชุดเสนอ', async ({ page }) => {
  test.setTimeout(240_000)
  let caseNo = ''

  await test.step('WIT0204/0211 · พยานเข้าพบ (นอกระบบ) เจ้าหน้าที่กด "รับคำร้องใหม่" จากทะเบียน กลั่นกรองปกติ เลือก คบ.1 แนบหลักฐาน', async () => {
    // WIT0201/0202/0204 ⚙️ นอกระบบ — ช่องทางเข้าพบ = ประเภทเอกสาร คบ.1 (ผังให้พยานเลือกช่องทางเอง)
    caseNo = await officerIntakesKb1(page, 'normal', 'พยานเข้าพบเอง ไม่พบภัยคุกคามเฉพาะหน้า')
    // WIT0207/0208 — ผลกลั่นกรองถูกบันทึกพร้อมเหตุผล ผู้ประเมิน และเวลา
    const created = await readCase(page, caseNo)
    expect(created?.urgencyAssessedAt).toBeTruthy()
    expect(created?.urgencyAssessedBy).toBeTruthy()
    expect(created?.urgencyAssessmentNote).toContain('ไม่พบภัยคุกคามเฉพาะหน้า')
    // WIT0209 ◇ คบ.1 → งานค้างเหลือเพียง คบ.3 ไม่ต้องทำ คบ.1 ซ้ำ
    expect(created?.kb1SignaturePending).toBeFalsy()
    // ผังให้กรอกข้อมูลพยานตอนสัมภาษณ์ แต่โปรโตไทป์ไม่มีช่องกรอกในขั้นรับเรื่อง (กรอกที่ /form/1 ภายหลัง)
  })

  await test.step('WIT0212/0213/0214 · ค้นและยืนยันเชื่อมโยงเลขสำนวนหลัก (พบคดี)', async () => {
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    const linked = await readCase(page, caseNo)
    expect(linked?.mainCaseStatus).toBe('linked')
    expect(linked?.linkedMainCaseId).toBeTruthy()
  })

  await test.step('WIT0216 · ส่งคำขอให้ ผอ. มอบหมาย', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expectStage(page, 'director_assign', caseNo)
  })

  await test.step('WIT0301/0302/0303 · ผอ. รับงานจากคิว ตรวจ Case Link และผลกลั่นกรอง', async () => {
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(caseNo)).toBeVisible()
    await page.goto(`/dossier/${caseNo}`)
    await expect(page.getByText('รอมอบหมายเจ้าของสำนวน')).toBeVisible()
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()
    // ผังให้ ผอ. ตรวจเอกสารตั้งต้นได้ แต่โปรโตไทป์ซ่อนรายการแบบฟอร์ม/ไฟล์แนบก่อนมอบหมาย
    await expect(page.getByTestId('dossier-forms')).toHaveCount(0)
  })

  await test.step('WIT0304/0305 · ผอ. เลือกผู้รับผิดชอบและมอบหมาย (บันทึกผู้มอบหมาย/เวลา)', async () => {
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    const assigned = await readCase(page, caseNo)
    expect(assigned?.assignedOfficerUserId).toBeTruthy()
    expect(assigned?.assignedAt).toBeTruthy()
    expect(assigned?.assignedBy).toBeTruthy()
  })

  await test.step('WIT0306 · ส่งงานให้เจ้าของสำนวน (แฟ้มเข้าคิวเจ้าหน้าที่เมื่อกดส่งต่อ ผังคือแจ้งเตือนทันที)', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expectStage(page, 'staff_review', caseNo)
  })

  await test.step('WIT0307/0308 · เจ้าของสำนวนรับงาน เปิดแฟ้ม ตรวจเอกสารตั้งต้นและผลประเมิน', async () => {
    await switchRole(page, 'officer')
    await page.goto('/queue/officer')
    await expect(page.getByText(caseNo)).toBeVisible()
    await page.goto(`/dossier/${caseNo}`)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(page.getByText('kb1-evidence.pdf')).toBeVisible()
  })

  await test.step('WIT0309 · มีผลประเมินแล้ว (กลั่นกรองตอนรับเรื่อง) — ไม่ต้องประเมินซ้ำ ข้าม WIT0310', async () => {
    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toHaveCount(0)
  })

  await test.step('WIT0311/0313 · เอกสารตั้งต้นเป็น คบ.1 → ต้องจัดทำเพียง คบ.3 ไปแท็บ 04 ตรวจ คบ.1/คบ.3', async () => {
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
  })

  await test.step('WIT0401/0402/0403 · รับงานแท็บ 04 เห็น Case Link ผลประเมิน แบบฟอร์ม; ◇ คบ.1 มีฉบับเดียว ไม่สร้างซ้ำ', async () => {
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    await expect(page.getByTestId('dossier-forms').getByText('คบ.1', { exact: true })).toHaveCount(1)
    await expect(page.getByTestId('dossier-forms').getByText('คบ.3', { exact: true })).toHaveCount(1)
  })

  await test.step('WIT0404/0405 · เจ้าหน้าที่ตรวจและบันทึก คบ.1 (ชื่อ-นามสกุลบังคับ)', async () => {
    await fillKb1(page, caseNo)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
  })

  await test.step('WIT0406 · แฟ้มที่รับเป็น คบ.1 ไม่มีด่านลายมือชื่อยินยอมบังคับ (ผังให้พยานลงนามใน คบ.1)', async () => {
    // ด่านบังคับลงนามมีเฉพาะ kb1SignaturePending (รับเรื่องด้วย คบ.2 — ดู J02)
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)
    expect((await readCase(page, caseNo))?.kb1SignaturePending).toBeFalsy()
  })

  await test.step('WIT0407 ◇ · เลือก "ไม่ข้าม" คบ.3 (แถว คบ.3 ยังเปิดแบบฟอร์มได้)', async () => {
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' })).toBeVisible()
  })

  await test.step('WIT0408 · จัดทำ คบ.3 บันทึกข้อเท็จจริงประกอบคำร้อง', async () => {
    await fillKb3(page, caseNo, 'พฤติการณ์เพิ่มเติมจากการสัมภาษณ์พยานที่เข้าพบ')
    const after = await readCase(page, caseNo)
    expect(after?.kb3Skipped).toBeFalsy()
  })

  await test.step('WIT0410 ◇ · ผลประเมิน = ไม่เร่งด่วน → เส้นทางปกติ (ไม่มี คบ.4 / Fast Track)', async () => {
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-card')).toHaveCount(0)
  })

  await test.step('WIT0411 · จัดทำ คบ.6 บันทึกเสนอความเห็น (ก่อนมี คบ.6 ปุ่มส่งต่อถูกล็อก)', async () => {
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ชุดเสนอยังไม่ครบ — ยังไม่ได้จัดทำแบบ คบ.6')).toBeVisible()
    await fillKb6(page, caseNo)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
  })

  await test.step('WIT0501/0502 · ส่งชุดเสนอ คบ.1 + คบ.3 + คบ.6 ถึงผู้บังคับบัญชาชั้นต้น (แท็บ 05)', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expectStage(page, 'supervisor_review', caseNo)
    expect((await readCase(page, caseNo))?.owner).toBe(SUPERVISOR)
  })

  await test.step('WIT0503 · ผบช.ชั้นต้นตรวจชุดเสนอที่มี คบ.3 (ไม่มี Skip Record)', async () => {
    await switchRole(page, 'supervisor')
    await page.goto('/queue/supervisor')
    await expect(page.getByText(caseNo)).toBeVisible()
    await page.goto(`/dossier/${caseNo}`)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว/)).toHaveCount(0)
    await expect(page.getByTestId('return-case-button')).toBeVisible()
    const final = await readCase(page, caseNo)
    expect(final?.kb3Skipped).toBeFalsy()
    expect(final?.urgency).toBe('normal')
  })
})

test('J03-a · [ทางแยก] ธุรการรับคำร้อง (แนบไฟล์สแกน) → เจ้าของสำนวนประเมินปกติ → ข้าม คบ.3 พร้อมเหตุผล → ผบช.ชั้นต้น', async ({ page }) => {
  test.setTimeout(240_000)

  let caseNo = ''
  await test.step('WIT0203/0206 · ธุรการรับคำร้องใหม่จากทะเบียน แนบไฟล์สแกน (ไม่ต้องกลั่นกรองความเร่งด่วน)', async () => {
    caseNo = await receiverIntakesPetition(page)
  })

  await test.step('WIT0216 · ธุรการส่ง ผอ. โดยไม่เชื่อมโยง (ธุรการไม่เห็นการ์ดคดีหลัก)', async () => {
    await linkAndForwardToDirector(page, caseNo, { link: false })
  })

  await test.step('WIT0301-0306 · ผอ. มอบหมายและส่งต่อเจ้าของสำนวน แล้วเจ้าของสำนวนเชื่อมโยงคดีหลัก', async () => {
    await directorAssigns(page, caseNo, { linkAfterAssign: true })
  })

  await test.step('WIT0309 ◇ · ยังไม่มีผลประเมิน (ธุรการไม่ได้กลั่นกรอง) → บังคับให้เจ้าของสำนวนประเมิน', async () => {
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
  })

  await test.step('WIT0310 · เจ้าของสำนวนประเมินเป็น "กรณีปกติ" (ไม่สร้างเลขแบบ คบ. ใด ๆ)', async () => {
    const before = await readCase(page, caseNo)
    await page.getByRole('button', { name: NORMAL_BTN }).click()
    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
    const after = await readCase(page, caseNo)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessedBy).toBeTruthy()
    expect(after?.stage).toBe('staff_review')
    expect(after?.form).toBe(before?.form)
  })

  await test.step('WIT0311/0312 · เอกสารตั้งต้นเป็นคำร้อง → ต้องจัดทำ คบ.1 + คบ.3 (แท็บ 04)', async () => {
    await expect(page.getByText(/ต้องจัดทำ.*คบ\.1.*คบ\.3/)).toBeVisible()
  })

  await test.step('WIT0404/0405 · จัดทำ คบ.1', async () => {
    await fillKb1(page, caseNo)
  })

  await test.step('WIT0407 ◇ → WIT0409 · เลือกข้าม คบ.3 (ต้องระบุเหตุผล, Skip Record เก็บผู้บันทึกและเวลา)', async () => {
    // ไม่กรอกเหตุผล → ถูกปฏิเสธ
    await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.getByRole('textbox').fill('')
    await dialog.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ต้องระบุเหตุผลในการกดข้าม คบ.3')
    expect((await readCase(page, caseNo))?.kb3Skipped).toBeFalsy()
    // กล่องปิดไปหลังเตือน — เปิดใหม่แล้วกรอกเหตุผลครบ
    await skipKb3(page, 'คบ.1 ระบุข้อเท็จจริงครบถ้วนแล้ว')

    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล: คบ\.1 ระบุข้อเท็จจริงครบถ้วนแล้ว/)).toBeVisible()
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)
    const skipped = await readCase(page, caseNo)
    expect(skipped?.kb3Skipped).toBe(true)
    expect(skipped?.kb3SkipReason).toBe('คบ.1 ระบุข้อเท็จจริงครบถ้วนแล้ว')
    expect(skipped?.kb3SkippedAt).toBeTruthy()
    expect(skipped?.kb3SkippedBy).toBeTruthy()
    // ผังให้ข้ามได้เมื่อ คบ.1 ครบถ้วน แต่โปรโตไทป์บังคับเพียงเหตุผล ไม่ตรวจความครบของ คบ.1
  })

  await test.step('WIT0411 → WIT0501/0502 · จัดทำ คบ.6 แล้วส่งผู้บังคับบัญชาชั้นต้น (ชุดเสนอ = คบ.1 + Skip Record + คบ.6)', async () => {
    await fillKb6(page, caseNo)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expectStage(page, 'supervisor_review', caseNo)

    await switchRole(page, 'supervisor')
    await page.goto(`/dossier/${caseNo}`)
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว/)).toBeVisible()
    expect((await readCase(page, caseNo))?.owner).toBe(SUPERVISOR)
  })
})

test('J03-b · [ทางแยก] เจ้าหน้าที่กลั่นกรองเป็นเร่งด่วนตั้งแต่ /intake → เข้าเส้นทางเร่งด่วน (แท็บ 06) ผ่าน ผอ.', async ({ page }) => {
  test.setTimeout(240_000)
  let caseNo = ''

  await test.step('WIT0207/0208 · กลั่นกรอง "กรณีจำเป็นเร่งด่วน" พร้อมเหตุผล แล้วรับ คบ.1 (WIT0211)', async () => {
    caseNo = await officerIntakesKb1(page, 'urgent', 'ถูกข่มขู่คุกคามถึงชีวิต')
    const created = await readCase(page, caseNo)
    expect(created?.risk).toBe('วิกฤต')
    expect(created?.urgent).toBe(true)
    expect(created?.urgencyAssessmentNote).toContain('ข่มขู่คุกคามถึงชีวิต')
  })

  await test.step('WIT0212-0216 · เชื่อมโยงเลขสำนวนหลักและส่ง ผอ.', async () => {
    await linkAndForwardToDirector(page, caseNo)
  })

  await test.step('WIT0301-0306 · ผอ. มอบหมาย (ผอ. เห็นผลกลั่นกรองเร่งด่วนที่สรุปข้อมูลแฟ้ม)', async () => {
    await switchRole(page, 'director')
    await page.goto(`/dossier/${caseNo}`)
    await expect(page.locator('span.text-slate-500', { hasText: 'ความเร่งด่วน:' }).locator('xpath=following-sibling::*[1]')).toContainText('เร่งด่วน')
    await directorAssigns(page, caseNo)
  })

  await test.step('WIT0309 ◇ มีผลประเมินแล้ว (เร่งด่วน) → ไม่ต้องประเมินซ้ำ; WIT0410 ◇ → WIT0412 เส้นทางเร่งด่วน', async () => {
    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()
    // เส้นทางเร่งด่วนไม่บังคับ คบ.6 ก่อนส่ง
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
  })

  await test.step('WIT0412 · ส่งตรงถึง ผอ.สำนัก/กอง ข้าม ผบช.ชั้นต้น → การ์ด Fast Track (แท็บ 06)', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผอ.สำนัก/กอง')
    await expectStage(page, 'director_review', caseNo)
    const after = await readCase(page, caseNo)
    expect(after?.owner).toBe(DIRECTOR)
    expect(after?.fastTracked).toBe(true)
    await expect(page.getByTestId('fast-track-card')).toBeVisible()

    await switchRole(page, 'director')
    await page.goto(`/dossier/${caseNo}`)
    await expect(page.getByTestId('fast-track-card')).toBeVisible()
  })
})

test('J03-c · [ทางแยก] ธุรการรับคำร้อง → เจ้าของสำนวนประเมินเป็นเร่งด่วน (WIT0310) → เข้าเส้นทางเร่งด่วน (แท็บ 06)', async ({ page }) => {
  test.setTimeout(240_000)

  const caseNo = await receiverIntakesPetition(page)
  await test.step('WIT0216 · ธุรการส่ง ผอ. โดยไม่เชื่อมโยง (ธุรการไม่เห็นการ์ดคดีหลัก)', async () => {
    await linkAndForwardToDirector(page, caseNo, { link: false })
  })
  await test.step('WIT0301-0306 · ผอ. มอบหมายและส่งต่อเจ้าของสำนวน แล้วเจ้าของสำนวนเชื่อมโยงคดีหลัก', async () => {
    await directorAssigns(page, caseNo, { linkAfterAssign: true })
  })

  await test.step('WIT0309 ◇ ไม่มีผลประเมิน → WIT0310 เจ้าของสำนวนเลือก "กรณีจำเป็นเร่งด่วน"', async () => {
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await page.getByRole('button', { name: URGENT_BTN }).click()
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()
    const after = await readCase(page, caseNo)
    expect(after?.urgency).toBe('urgent')
    expect(after?.urgent).toBe(true)
    expect(after?.urgencyAssessedBy).toBeTruthy()
    expect(after?.stage).toBe('staff_review')
  })

  await test.step('WIT0410 ◇ → WIT0412 · ส่งตรง ผอ. (Fast Track) ไปแท็บ 06', async () => {
    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผอ.สำนัก/กอง')
    await expectStage(page, 'director_review', caseNo)
    const after = await readCase(page, caseNo)
    expect(after?.fastTracked).toBe(true)
    expect(after?.owner).toBe(DIRECTOR)
    await expect(page.getByTestId('fast-track-card')).toBeVisible()
  })
})

test('J03-d · [ทางแยก] ข้าม คบ.3 แล้วกู้คืน จัดทำ คบ.3 แทน (WIT0409 → WIT0407 → WIT0408)', async ({ page }) => {
  test.setTimeout(240_000)

  const caseNo = await officerIntakesKb1(page, 'normal', 'พยานเข้าพบเอง กรณีปกติ')
  await linkAndForwardToDirector(page, caseNo)
  await directorAssigns(page, caseNo)

  await test.step('WIT0409 · ข้าม คบ.3 พร้อมเหตุผล', async () => {
    await skipKb3(page, 'เห็นว่า คบ.1 ครบถ้วนแล้ว')
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล:/)).toBeVisible()
    expect((await readCase(page, caseNo))?.kb3Skipped).toBe(true)
  })

  await test.step('WIT0407 · เปลี่ยนใจ กด "กู้คืน คบ.3" แล้วจัดทำ คบ.3 (WIT0408)', async () => {
    await page.getByRole('button', { name: 'กู้คืน คบ.3' }).click()
    await expect.poll(async () => (await readCase(page, caseNo))?.kb3Skipped).toBeFalsy()
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toBeVisible()
    await fillKb3(page, caseNo, 'ข้อเท็จจริงเพิ่มเติมหลังกู้คืน คบ.3')
  })

  await test.step('WIT0410 → WIT0411 → WIT0501 · ประเมินปกติ จัดทำ คบ.6 ส่ง ผบช.ชั้นต้น (ชุดเสนอมี คบ.3)', async () => {
    await fillKb1(page, caseNo)
    await fillKb6(page, caseNo)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expectStage(page, 'supervisor_review', caseNo)
    expect((await readCase(page, caseNo))?.kb3Skipped).toBeFalsy()
  })
})
