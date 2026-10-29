import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, linkMainCaseAsOfficer, newCaseNoAfterIntake, promoteToCaseOwner, readCase, seedMockState, switchRole } from '../helpers/seed'
import { sendConsentLink, witnessSigns } from '../helpers/consent'
import { snap } from '../helpers/snapshot'
import { confirmDialog, CASE_NO, DOSSIER_URL, expectStage, formRow, submitFastTrackToDirector } from '../journeys/journey-helpers'

/**
 * เส้นทางตามผังแท็บ 02 / 03 / 04 (ฉบับปรับตามโค้ดปัจจุบัน) — เดินผ่าน UI จริงทีละแขนง
 *
 * ลำดับงานปัจจุบัน: ขั้นรับเรื่องไม่กลั่นกรอง — เจ้าหน้าที่ที่รับเรื่องเองเชื่อมโยงคดีหลักก่อนส่ง ผอ.
 *   เรื่องที่ธุรการรับ เจ้าของสำนวนเชื่อมโยงหลัง ผอ. มอบหมาย
 *   คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรองความเร่งด่วน → คบ.3 → คบ.6 หรือ คบ.4/คบ.5
 *
 * แท็บ 02 รับคำขอ
 *   02-A  ธุรการรับ "คำร้อง" แนบไฟล์ ส่ง ผอ. ทันทีโดยไม่เชื่อมโยง ........ WIT0201 0202 0203 0206 0216
 *   02-B  เจ้าหน้าที่รับ "คำร้อง" เอง → เชื่อมโยงคดี → ส่ง ผอ. .............. WIT0209 0217 0212 0216
 *   02-C  เจ้าหน้าที่รับ คบ.1 (เข้าพบ) → กรอก/บันทึก คบ.1 → เชื่อมโยง → ส่ง ผอ.  WIT0204 0209 0211 0218 0212 0216
 *   02-D  เจ้าหน้าที่รับ คบ.2 (โทรศัพท์) → บันทึก คบ.2 → ไม่พบคดี → ส่ง ผอ. .. WIT0205 0209 0210 0218 0215 0216
 *   02-E  กลั่นกรอง "เร่งด่วน" หลังจัดทำ คบ.1 (เก็บผล/ระดับวิกฤต) .......... WIT0207 0208 0212 0214
 *   02-F  validation: ไม่ระบุผู้ส่ง .............................................. WIT0203
 * แท็บ 03 มอบหมาย
 *   03-A  ผอ. รับงานจากคิว ตรวจ มอบหมาย ส่งต่อ แจ้งเตือนเจ้าหน้าที่ ........ WIT0301-0306 0314 0307
 *   03-B  ผอ. เปลี่ยนเจ้าของสำนวนก่อนยืนยันส่งต่อ ............................ WIT0315
 *   03-C  เจ้าของสำนวน: คบ.1 → เชื่อมโยง → กลั่นกรองเอง ..................... WIT0307 0308 0309 0310 0311 0312
 *   03-D  แฟ้ม คบ.2 ยังไม่มีผลกลั่นกรอง → จัดทำ คบ.1 ก่อน .................... WIT0309 0311 0312
 *   03-E  เอกสารตั้งต้นเป็น คบ.1 → งานค้างเหลือ คบ.3 ........................ WIT0311 0313
 * แท็บ 04 จัดทำ คบ.1 / คบ.3 และแยกเส้นทาง
 *   04-A  เส้นทางปกติ: คบ.1 → เชื่อมโยง → กลั่นกรอง → คบ.3 → คบ.6 → ผบช.ชั้นต้น  WIT0401 0402 0403 0404 0405 0413 0410 0407 0408 0411
 *   04-B  ข้าม คบ.3 พร้อมเหตุผล → คบ.6 → ผบช.ชั้นต้น .......................... WIT0407 0409 0410 0411
 *   04-C  ข้าม คบ.3 แล้วกู้คืน จัดทำ คบ.3 แทน ................................. WIT0409 0414 0407 0408
 *   04-D  แฟ้ม คบ.2: คบ.1 → ค้นไม่พบ ระบุเหตุผล → กลั่นกรอง → พยานลงนามผ่านลิงก์  WIT0404 0405 0213 0215 0406
 *   04-E  เส้นทางเร่งด่วน: ส่งตรง ผอ. ไปแท็บ 06 ............................... WIT0410 0412
 *   04-F  แฟ้มที่รับเป็น คบ.1 (มี คบ.1 แล้ว) → ตรวจ/บันทึก คบ.1 ไม่มีด่านลงนาม  WIT0403 0405 0406
 *
 * ทุกเทสต์ seed mock state ครั้งเดียว แล้วสร้างแฟ้มใหม่ผ่าน /intake หรือเดินต่อจาก mock state ที่ระบุ
 */

const pdfFile = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024, 0x20) })
const SUPERVISOR_LABEL = 'ผู้บังคับบัญชาชั้นต้น'
const NORMAL_BTN = 'กรณีปกติ (→ คบ.3 → คบ.6)'
const URGENT_BTN = 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)'
const NOT_FOUND_REASON = 'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5'

/** เปิด /intake ด้วยการกด "รับคำร้องใหม่" จากทะเบียน */
async function openIntakeFromRegistry(page: Page) {
  await page.goto('/registry')
  await page.getByRole('link', { name: 'รับคำร้องใหม่' }).click()
  await expect(page).toHaveURL(/\/intake$/)
}

/** เจ้าของสำนวนกลั่นกรองความเร่งด่วน (WIT0207/0208/0310) — แผงในการ์ดคดีหลัก แสดงหลังบันทึก คบ.1 และเชื่อมโยงคดีแล้ว */
async function screenUrgency(page: Page, kind: 'normal' | 'urgent', reason: string) {
  const panel = page.getByTestId('urgency-screening-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('textbox').fill(reason)
  await page.getByRole('button', { name: kind === 'normal' ? NORMAL_BTN : URGENT_BTN }).click()
  await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
}

/** เชื่อมโยงเลขสำนวนหลัก (WIT0212-0214) */
async function linkMainCase(page: Page, caseNo: string) {
  await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
  await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
  expect((await readCase(page, caseNo))?.mainCaseStatus).toBe('linked')
}

/** ส่ง ผอ. มอบหมาย (WIT0216) แล้วรอแฟ้มเข้า director_assign */
async function forwardToDirector(page: Page, caseNo: string) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expectStage(page, 'director_assign', caseNo)
}

/** กรอกและบันทึก คบ.1 ที่หน้า /form/1 (ชื่อ-นามสกุลบังคับ) — เปิดอยู่ที่หน้าแบบฟอร์มแล้ว */
async function fillAndSaveKb1OnForm(page: Page) {
  await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').first().fill('กมลชนก')
  await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').first().fill('บุญรักษา')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
}

/** เปิด คบ.1 จากแถวแบบฟอร์มในแฟ้มแล้วบันทึกกลับแฟ้ม (WIT0404/0405) */
async function fillKb1FromDossier(page: Page, caseNo: string) {
  await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/1/)
  await fillAndSaveKb1OnForm(page)
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
}

/** จัดทำ คบ.3 (WIT0408) */
async function fillKb3(page: Page, caseNo: string, text: string) {
  await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/3\?caseNo=/)
  // label ของช่องบังคับมีเครื่องหมาย * ต่อท้ายและผูก for/id กับ textarea (ไม่ใช่ sibling โดยตรง) จึงจับด้วย getByLabel
  await page.getByLabel('ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').first().fill(text)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
}

/** จัดทำ คบ.6 ที่ระดับเจ้าหน้าที่ (WIT0411) */
async function fillKb6(page: Page, caseNo: string) {
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6/)
  await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
  await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(caseNo)}`))
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

/** เปิดแฟ้มใน Case 1.3 (staff_review, บันทึก คบ.1 แล้ว) แล้วเชื่อมโยงคดี + กลั่นกรองความเร่งด่วน (WIT0413 / WIT0310) */
async function openCase13Linked(page: Page, assess: 'normal' | 'urgent' | null, patch?: Record<string, unknown>) {
  await seedMockState(page, 'Case 1.3', 'officer', { ...KB1_DONE, ...patch })
  await page.goto(DOSSIER_URL)
  await linkMainCaseAsOfficer(page)
  if (assess) await page.getByRole('button', { name: assess === 'normal' ? NORMAL_BTN : URGENT_BTN }).click()
}

/* ------------------------------------------------------------------ */
/* แท็บ 02                                                             */
/* ------------------------------------------------------------------ */
test.describe('แท็บ 02 · รับคำขอและเชื่อมโยงเลขสำนวน', () => {
  test('02-A · ธุรการ: รับ "คำร้อง" แนบไฟล์ (ไม่กลั่นกรอง) → ส่ง ผอ. ทันทีโดยไม่เชื่อมโยง [WIT0203 0206 0216]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto('/registry')
    const idle = 'ยังไม่มีคำขอใหม่ — ธุรการอยู่ที่ทะเบียน (พยานต้องการขอรับการคุ้มครองเกิดนอกระบบ)'
    await snap(page, ['node:02:start', 'edge:02:E01', 'node:02:WIT0201', 'edge:02:E02', 'node:02:WIT0202'], { label: idle, role: 'receiver' })
    await openIntakeFromRegistry(page)
    await snap(page, ['edge:02:E03', 'node:02:WIT0203'], { label: 'ธุรการเปิดหน้า /intake พร้อมรับคำร้องเข้าทะเบียน (ยังไม่กรอกผู้ส่ง)', role: 'receiver' })

    // ธุรการไม่เห็นการ์ดคัดกรอง และรับได้เฉพาะ "คำร้อง"
    await expect(page.getByTestId('intake-triage')).toHaveCount(0)
    await expect(page.getByTestId('intake-source-card')).toBeVisible()
    await expect(page.getByTestId('intake-kb1-card')).toHaveCount(0)
    await expect(page.getByTestId('intake-kb2-card')).toHaveCount(0)

    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นางสาวกมลชนก บุญรักษา')
    // WIT0206 แนบไฟล์สแกน (ไม่บังคับ) — ไม่มีขั้นสแกนแยก
    await page.getByLabel('เลือกไฟล์เอกสารต้นทาง').setInputFiles(pdfFile('petition-scan.pdf'))
    await expect(page.getByText('petition-scan.pdf')).toBeVisible()
    await snap(page, ['edge:02:E06', 'node:02:WIT0206'], { label: 'ธุรการกรอกผู้ส่งและแนบไฟล์สแกนหนังสือต้นทางแล้ว ก่อนกดรับเข้าทะเบียน', role: 'receiver' })
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()

    const caseNo = await newCaseNoAfterIntake(page)
    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('petition')
    expect(created?.intakeChannel).toBe('document')
    expect(created?.scanStatus).toBe('pending')
    expect(created?.urgency).toBeFalsy()
    expect(created?.pendingIntakeForms).toEqual(expect.arrayContaining(['คบ.1', 'คบ.3']))
    await expectStage(page, 'receiver_intake', caseNo)

    // WIT0212 ธุรการไม่เห็นการ์ดเชื่อมโยงคดี — ส่ง ผอ. ได้เลย
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await snap(page, ['edge:02:E09', 'node:02:WIT0216'], { label: 'ธุรการรับคำร้องเข้าทะเบียนแล้ว (ไม่เชื่อมโยงคดี) รอกดส่ง ผอ. มอบหมาย', role: 'receiver' })
    await forwardToDirector(page, caseNo)
    expect((await readCase(page, caseNo))?.status).toBe('รอ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน')

    // เข้าคิว ผอ. (ไปต่อที่แท็บ 03)
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(caseNo).first()).toBeVisible()
    await snap(page, 'overview:02>03', { label: 'แท็บ 02 ส่งต่อแล้ว — แฟ้มเข้าคิว ผอ.สำนัก/กอง รอมอบหมายเจ้าของสำนวน', role: 'director' })
  })

  test('02-B · เจ้าหน้าที่: รับ "คำร้อง" เอง (officer_intake) โดยไม่กลั่นกรอง → เชื่อมโยงคดีหลัก → ส่ง ผอ. [WIT0209 0217 0212 0216]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1', 'officer')
    await openIntakeFromRegistry(page)

    // ขั้นรับเรื่องไม่มีการ์ดคัดกรอง ปุ่มรับเข้าทะเบียนกดได้ทันที
    await expect(page.getByTestId('intake-triage')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' })).toBeEnabled()
    await snap(page, ['edge:02:E11', 'node:02:WIT0209', 'edge:02:E12', 'node:02:WIT0217'], { label: 'เจ้าหน้าที่เปิดหน้า /intake เลือกประเภทเอกสารที่รับ (ขั้นรับเรื่องไม่มีการกลั่นกรองแยก) — เลือกการ์ด "คำร้อง"', role: 'officer' })

    // WIT0209 เลือกการ์ด "คำร้อง", WIT0217 รับเข้าทะเบียนเอง
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    const caseNo = await newCaseNoAfterIntake(page)
    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('petition')
    expect(created?.urgency).toBeFalsy()
    expect(created?.scanStatus).toBeFalsy()
    await expectStage(page, 'officer_intake', caseNo)

    // เจ้าหน้าที่ผู้รับเรื่องต้องเชื่อมโยงคดีหลักก่อนส่ง ผอ. — ขั้นนี้ยังไม่มีแผงกลั่นกรอง
    await expect(page.getByTestId('main-case-link-deferred')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await linkMainCase(page, caseNo)
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await forwardToDirector(page, caseNo)
  })

  test('02-C · เจ้าหน้าที่: พยานเข้าพบ → รับ คบ.1 → กรอก/บันทึก คบ.1 ที่ระบบเปิดให้ → ส่ง ผอ. [WIT0204 0209 0211 0218 0216]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1', 'officer')
    await openIntakeFromRegistry(page)
    await snap(page, ['edge:02:E04', 'node:02:WIT0204', 'edge:02:E13'], { label: 'พยานเข้าพบเจ้าหน้าที่ ป.ป.ท. — เจ้าหน้าที่เปิดหน้า /intake เพื่อรับเป็น คบ.1', role: 'officer' })
    await page.getByLabel('อัปโหลดไฟล์ คบ.1').setInputFiles(pdfFile('kb1-evidence.pdf'))
    await expect(page.getByText('kb1-evidence.pdf')).toBeVisible()
    await snap(page, 'node:02:WIT0211', { label: 'เจ้าหน้าที่แนบหลักฐานประกอบ คบ.1 แล้ว ก่อนกด "เจ้าหน้าที่กรอก คบ.1"', role: 'officer' })
    await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()

    // WIT0218 ระบบเปิดแบบ คบ.1 ให้กรอกต่อทันที
    const caseNo = await newCaseNoAfterIntake(page, { expectForm: 1, backToDossier: false })
    await expect(page).toHaveURL(new RegExp(`/form/1\\?caseNo=${caseNo.replace('/', '(?:/|%2F)')}`))
    await snap(page, ['edge:02:E15', 'node:02:WIT0218'], { label: 'ระบบเปิดแบบ คบ.1 ของแฟ้มใหม่ให้เจ้าหน้าที่กรอกและบันทึก', role: 'officer' })
    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('kb1')
    expect(created?.intakeChannel).toBe('walkin')
    expect(created?.pendingIntakeForms).toEqual(['คบ.3'])
    expect(created?.kb1SignaturePending).toBeFalsy()

    await fillAndSaveKb1OnForm(page)
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(caseNo)}`))
    await expectStage(page, 'officer_intake', caseNo)
    // บันทึก คบ.1 แล้ว — เชื่อมโยงคดีหลักก่อนส่ง ผอ. แล้วเจ้าของสำนวนกลั่นกรองหลังมอบหมาย
    expect((await readCase(page, caseNo))?.kb1CompletedAt).toBeTruthy()

    await linkMainCase(page, caseNo)
    await forwardToDirector(page, caseNo)
  })

  test('02-D · เจ้าหน้าที่: พยานโทรศัพท์ → รับ คบ.2 → บันทึก คบ.2 → ระบุ "ไม่พบคดี" → ส่ง ผอ. [WIT0205 0209 0210 0218 0215 0216]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1', 'officer')
    await openIntakeFromRegistry(page)
    await snap(page, ['edge:02:E05', 'node:02:WIT0205', 'edge:02:E14', 'node:02:WIT0210'], { label: 'พยานโทรศัพท์แจ้ง — เจ้าหน้าที่เปิดหน้า /intake เพื่อรับเป็น คบ.2', role: 'officer' })
    await page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' }).click()

    // WIT0218 เปิดแบบ คบ.2 ให้กรอกต่อทันที (ปุ่มบันทึกปุ่มเดียว) แล้วกลับแฟ้ม
    const caseNo = await newCaseNoAfterIntake(page, { expectForm: 2, backToDossier: false })
    const created = await readCase(page, caseNo)
    expect(created?.form).toBe('คบ.2')
    expect(created?.intakeDocType).toBe('kb2')
    expect(created?.intakeChannel).toBe('phone')
    expect(created?.urgency).toBeFalsy()
    expect(created?.kb1SignaturePending).toBe(true)
    expect(created?.pendingIntakeForms).toEqual(expect.arrayContaining(['คบ.1', 'คบ.3']))
    await snap(page, 'edge:02:E16', { label: 'ระบบเปิดแบบ คบ.2 ของแฟ้มใหม่ให้เจ้าหน้าที่บันทึก', role: 'officer' })
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.2' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(caseNo)}`))
    await expectStage(page, 'officer_intake', caseNo)
    await expect(page.getByText('รับแจ้งทางโทรศัพท์ (คบ.2) — รอพยานเข้ามาลงนามยินยอมใน คบ.1')).toBeVisible()

    // WIT0215 — ค้นเลขสำนวนหลักไม่พบ บันทึกเหตุผลแล้วรับเรื่องต่อ (ห้ามปัดตก) จึงส่ง ผอ. ได้
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await page.getByTestId('main-case-not-found-reason-select').selectOption(NOT_FOUND_REASON)
    await page.getByTestId('main-case-not-found-button').click()
    await confirmDialog(page, 'ยืนยันไม่พบคดี')
    await expect.poll(async () => (await readCase(page, caseNo))?.mainCaseNotFound).toBe(true)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await forwardToDirector(page, caseNo)
  })

  test('02-E · กลั่นกรอง "กรณีจำเป็นเร่งด่วน" หลังจัดทำ คบ.1 และเชื่อมโยงคดี: เก็บผล ผู้ประเมิน เวลา เหตุผล และระดับความเสี่ยงวิกฤต [WIT0207 0208 0212 0214]', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1', 'officer')
    await openIntakeFromRegistry(page)
    await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
    const caseNo = await newCaseNoAfterIntake(page)
    expect((await readCase(page, caseNo))?.urgency).toBeFalsy()

    // เจ้าของสำนวน (บันทึก คบ.1 แล้ว) เชื่อมโยงคดีหลัก แล้วกลั่นกรองในการ์ดเดียวกัน
    await promoteToCaseOwner(page, caseNo)
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
    await snap(page, ['edge:02:E17', 'edge:02:E18', 'node:02:WIT0212', 'edge:02:E19', 'node:02:WIT0213', 'edge:02:E20', 'node:02:WIT0214'], { label: 'เจ้าของสำนวนบันทึก คบ.1 แล้ว เปิดการ์ด "คดีหลักและการประเมินภัย" รอเชื่อมโยงเลขสำนวนหลัก', role: 'officer' })
    await linkMainCase(page, caseNo)
    await expect(page.getByTestId('urgency-screening-panel')).toBeVisible()
    await snap(page, ['edge:02:E22', 'edge:02:E07', 'node:02:WIT0207', 'edge:02:E10', 'node:02:WIT0208'], { label: 'เชื่อมโยงคดีหลักแล้ว แผง "กลั่นกรองความเร่งด่วน" เปิดให้เจ้าของสำนวนบันทึกผล (ขั้นกลั่นกรองย้ายมาหลัง คบ.1 + เชื่อมโยงคดี)', role: 'officer' })
    await screenUrgency(page, 'urgent', 'ถูกข่มขู่คุกคามถึงชีวิต')
    const screened = await readCase(page, caseNo)
    expect(screened?.urgency).toBe('urgent')
    expect(screened?.urgent).toBe(true)
    expect(screened?.risk).toBe('วิกฤต')
    expect(screened?.urgencyAssessedAt).toBeTruthy()
    expect(screened?.urgencyAssessedBy).toBeTruthy()
    expect(screened?.urgencyAssessmentNote).toContain('ข่มขู่คุกคามถึงชีวิต')
    // "สรุปข้อมูลแฟ้ม > ความเร่งด่วน" แสดงผลที่กลั่นกรอง
    await expect(page.locator('span.text-slate-500', { hasText: 'ความเร่งด่วน:' }).locator('xpath=following-sibling::*[1]')).toContainText('เร่งด่วน')
  })

  test('02-F · validation หน้า /intake: ธุรการไม่ระบุผู้ส่ง ต้องถูกเตือนและยังอยู่หน้าเดิม [WIT0203]', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto('/intake')
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุชื่อผู้ส่ง/ผู้แจ้ง')
    await expect(page).toHaveURL(/\/intake$/)
  })
})

/* ------------------------------------------------------------------ */
/* แท็บ 03                                                             */
/* ------------------------------------------------------------------ */
test.describe('แท็บ 03 · มอบหมาย ประเมินความเร่งด่วน และกำหนดเอกสารตั้งต้น', () => {
  test('03-A · ผอ.: รับงานจากคิว ตรวจแฟ้ม → เลือกและมอบหมาย → ส่งต่อ → เจ้าของสำนวนได้รับแจ้งและเห็นในคิว [WIT0301-0306 0314 0307]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.2', 'director')

    // WIT0301 คิว ผอ.
    await page.goto('/queue/director')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await snap(page, 'node:03:WIT0301', { label: 'แฟ้มจากแท็บ 02 เข้าคิว ผอ.สำนัก/กอง รอมอบหมายเจ้าของสำนวน', role: 'director' })

    // WIT0302/0303 ผอ. ดูการ์ดคดีหลักแบบอ่านอย่างเดียว และตรวจแบบฟอร์ม คบ. ได้ก่อนมอบหมาย (ดูอย่างเดียว)
    await page.goto(DOSSIER_URL)
    await expect(page.getByText('รอมอบหมายเจ้าของสำนวน')).toBeVisible()
    await snap(page, ['edge:03:E0301', 'node:03:WIT0302'], { label: 'ผอ. เปิดแฟ้มที่รอมอบหมาย ดูเอกสารหลักฐานตั้งต้น (หนังสือต้นทาง/คบ.1/คบ.2)', role: 'director' })
    await snap(page, ['edge:03:E0302', 'node:03:WIT0303'], { label: 'ผอ. ตรวจคำขอ เอกสารตั้งต้น สถานะเลขสำนวน และสถานะความเร่งด่วน (ปุ่มส่งต่อยังล็อก)', role: 'director' })
    await expect(page.getByTestId('main-case-link-deferred')).toBeVisible()
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()
    await expect(page.getByTestId('dossier-forms')).toBeVisible()
    await expect(page.getByTestId('dossier-forms').getByRole('button', { name: 'ดูเอกสาร' }).first()).toBeVisible()
    await expect(page.getByTestId('dossier-forms').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)
    await expect(page.getByText('เอกสารหลักฐานและไฟล์แนบ')).toBeVisible()
    // ยังไม่มอบหมาย ปุ่มส่งต่อล็อก
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()

    // WIT0304/0305 เลือกผู้รับผิดชอบ + ระบบบันทึกผู้มอบหมาย/เวลา
    await expect(page.locator('#director-assign-officer')).toBeVisible()
    await snap(page, ['edge:03:E0303', 'node:03:WIT0304', 'node:03:WIT0305'], { label: 'ผอ. เลือกผู้รับผิดชอบจากรายการ ก่อนกด "มอบหมายเจ้าของสำนวน" (ระบบบันทึกผู้มอบหมาย/เวลาเมื่อกดปุ่ม)', role: 'director' })
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    await snap(page, ['edge:03:E0304', 'edge:03:E0306', 'node:03:WIT0314'], { label: 'ผอ. มอบหมายเจ้าของสำนวนแล้ว (ระบบบันทึกผู้มอบหมาย/วันเวลา) ปุ่มส่งต่อเปิดให้กด', role: 'director' })
    const assigned = await readCase(page, CASE_NO)
    expect(assigned?.assignedOfficerUserId).toBeTruthy()
    expect(assigned?.assignedAt).toBeTruthy()
    expect(assigned?.assignedBy).toBeTruthy()
    expect(assigned?.stage).toBe('director_assign')

    // WIT0314 ผอ. กดส่งต่อ → staff_review
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'เจ้าของสำนวนที่จะส่งต่อ')
    await expectStage(page, 'staff_review', CASE_NO)

    // WIT0306/0307 เจ้าของสำนวนเห็นการแจ้งเตือนและแฟ้มในคิว
    await switchRole(page, 'officer')
    await page.goto('/notifications')
    await snap(page, ['edge:03:E0305', 'node:03:WIT0306'], { label: 'ผอ. ส่งต่อแล้ว — เจ้าของสำนวนเปิดหน้าแจ้งเตือนเพื่อดูงานที่ได้รับมอบหมาย', role: 'officer' })
    await expect(page.getByText('ไม่มีรายการแจ้งเตือนในขณะนี้')).toHaveCount(0)
    await page.goto('/queue/officer')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
  })

  test('03-B · ผอ.: เปลี่ยนเจ้าของสำนวนก่อนยืนยันส่งต่อ (ระบบบันทึกประวัติ) [WIT0315]', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1.2', 'director')
    await page.goto(DOSSIER_URL)
    // รายชื่อเจ้าหน้าที่ขึ้นกับสังกัดของ ผอ. — เลือกจากตัวเลือกที่มีจริง (ไม่ผูก OFF-001/OFF-002)
    const optionValues = await page.locator('#director-assign-officer option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean))
    // ต้องมีเจ้าหน้าที่อย่างน้อย 2 คนให้เลือก จึงจะยืนยันการเปลี่ยนเจ้าของสำนวนได้จริง
    expect(optionValues.length, `ผอ.ที่ seed มีเจ้าหน้าที่ให้มอบหมาย ${optionValues.length} คน — ต้องมี >= 2 คนจึงตรวจการเปลี่ยนเจ้าของสำนวนได้`).toBeGreaterThan(1)
    const firstOfficer = optionValues[0]
    const secondOfficer = optionValues[1]
    await page.locator('#director-assign-officer').selectOption(firstOfficer)
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    expect((await readCase(page, CASE_NO))?.assignedOfficerUserId).toBe(firstOfficer)
    await snap(page, 'node:03:WIT0315', { label: 'ผอ. มอบหมายแล้วแต่ยังไม่ส่งต่อ — เห็นปุ่ม "เปลี่ยนเจ้าของสำนวน"', role: 'director' })

    await page.getByRole('button', { name: 'เปลี่ยนเจ้าของสำนวน' }).click()
    await snap(page, 'edge:03:E0315', { label: 'ผอ. กด "เปลี่ยนเจ้าของสำนวน" อยู่ในโหมดเลือกผู้รับผิดชอบใหม่ก่อนยืนยัน', role: 'director' })
    await page.locator('#director-assign-officer').selectOption(secondOfficer)
    await page.getByRole('button', { name: 'ยืนยันเปลี่ยนเจ้าของสำนวน' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.assignedOfficerUserId).toBe(secondOfficer)
    await snap(page, 'edge:03:E0316', { label: 'ผอ. กดยืนยันเปลี่ยนเจ้าของสำนวนแล้ว ยังอยู่ขั้นมอบหมาย พร้อมส่งต่อ (เขตของแฟ้มนี้มีเจ้าหน้าที่คนเดียวในรายการ จึงเลือกคนเดิม)', role: 'director' })
    const after = await readCase(page, CASE_NO)
    expect(JSON.stringify(after?.assignmentHistory)).toContain('เปลี่ยนเจ้าของสำนวน')
    expect(after?.stage).toBe('director_assign')
  })

  test('03-C · เจ้าของสำนวน: ยังไม่มีผลกลั่นกรอง (ธุรการรับเรื่อง) → จัดทำ คบ.1 → เชื่อมโยงคดี → กลั่นกรองเอง → ผลกำหนดเส้นทาง [WIT0307 0308 0309 0310 0311 0312]', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto('/queue/officer')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await snap(page, ['edge:03:E0314', 'node:03:WIT0307'], { label: 'ผอ. ส่งต่อแล้ว — แฟ้มเข้าคิวเจ้าของสำนวน (staff_review) รอรับงาน', role: 'officer' })
    await page.goto(DOSSIER_URL)
    await snap(page, ['edge:03:E0307', 'node:03:WIT0308', 'edge:03:E0308', 'node:03:WIT0309'], { label: 'เจ้าของสำนวนเปิดแฟ้มที่ได้รับมอบหมาย ตรวจเอกสารตั้งต้น — ยังไม่มีผลกลั่นกรองความเร่งด่วน', role: 'officer' })

    // WIT0308 เห็นรายการแบบฟอร์ม; WIT0311 ◇ เอกสารตั้งต้น = คำร้อง → ต้องจัดทำ คบ.1 + คบ.3 (WIT0312)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(page.getByText('ต้องจัดทำ: คบ.1 / คบ.3')).toBeVisible()
    // WIT0309 ◇ ยังไม่มีผล → ต้องจัดทำ คบ.1 ก่อน จึงจะเชื่อมโยงคดีและกลั่นกรองได้
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ยังไม่ได้จัดทำแบบ คบ.1').first()).toBeVisible()

    await fillKb1FromDossier(page, CASE_NO)
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
    await linkMainCase(page, CASE_NO)
    await snap(page, ['edge:03:E0309', 'node:03:WIT0310'], { label: 'บันทึก คบ.1 และเชื่อมโยงคดีหลักแล้ว แผงกลั่นกรองความเร่งด่วนเปิดให้เจ้าของสำนวนประเมินเอง', role: 'officer' })

    // WIT0310 กลั่นกรอง "กรณีปกติ" (ไม่สร้างเลขแบบ คบ.)
    const before = await readCase(page, CASE_NO)
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await screenUrgency(page, 'normal', 'ยังไม่พบภัยเฉพาะหน้าจากข้อมูลใน คบ.1')
    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessedBy).toBeTruthy()
    expect(after?.stage).toBe('staff_review')
    expect(after?.form).toBe(before?.form)
    await expect(page.getByRole('button', { name: 'แก้ไขผลการประเมิน' })).toBeVisible()
    await snap(page, ['edge:03:E0310', 'edge:03:E0311', 'node:03:WIT0311'], { label: 'เจ้าของสำนวนบันทึกผลกลั่นกรอง "กรณีปกติ" แล้ว ระบบกำหนดเอกสารที่ต้องจัดทำตามเอกสารตั้งต้น', role: 'officer' })
  })

  test('03-D · แฟ้มที่รับเป็น คบ.2: ขั้นรับเรื่องไม่กลั่นกรอง → เจ้าของสำนวนจัดทำ คบ.1 ก่อน [WIT0309 0311 0312]', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 6.2', 'officer')
    await page.goto(DOSSIER_URL)
    expect((await readCase(page, CASE_NO))?.urgency).toBeFalsy()
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    await expect(page.getByText('ต้องจัดทำ: คบ.1 / คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await snap(page, ['edge:03:E0312', 'node:03:WIT0312'], { label: 'แฟ้มที่รับเป็น คบ.2 (เอกสารตั้งต้นไม่ใช่ คบ.1) — ต้องไปแท็บ 04 จัดทำ คบ.1 / คบ.3', role: 'officer' })
  })

  test('03-E · เอกสารตั้งต้นเป็น คบ.1 → งานค้างเหลือ คบ.3 ไม่ต้องสร้าง คบ.1 ซ้ำ [WIT0311 0313]', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1.3', 'officer', { intakeDocType: 'kb1', form: 'คบ.1', pendingIntakeForms: ['คบ.3'] })
    await page.goto(DOSSIER_URL)
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
    await expect(page.getByTestId('dossier-forms').getByText('คบ.1', { exact: true })).toHaveCount(1)
    await snap(page, ['edge:03:E0313', 'node:03:WIT0313'], { label: 'แฟ้มที่รับเป็น คบ.1 อยู่แล้ว — งานค้างเหลือ คบ.3 ไปแท็บ 04 ตรวจ/บันทึก คบ.1', role: 'officer' })
  })
})

/* ------------------------------------------------------------------ */
/* แท็บ 04                                                             */
/* ------------------------------------------------------------------ */
test.describe('แท็บ 04 · จัดทำ คบ.1 / คบ.3 และแยกเอกสารกรณีปกติ-เร่งด่วน', () => {
  test('04-A · เส้นทางปกติ: คบ.1 → เชื่อมโยงคดี → กลั่นกรองปกติ → ไม่ข้าม คบ.3 → คบ.6 → ส่ง ผบช.ชั้นต้น [WIT0401 0402 0403 0404 0405 0413 0410 0407 0408 0411]', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto('/queue/officer')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await snap(page, ['overview:03>04', 'node:04:WIT0401'], { label: 'เจ้าของสำนวนรับงานจากแท็บ 03 — แฟ้มอยู่ในคิวเจ้าของสำนวน (staff_review) ยังไม่ได้จัดทำ คบ.1', role: 'officer' })
    await page.goto(DOSSIER_URL)
    await snap(page, ['edge:04:E0401', 'node:04:WIT0402', 'edge:04:E0402', 'node:04:WIT0403'], { label: 'เจ้าของสำนวนเปิดแฟ้ม ตรวจเอกสารตั้งต้น — ยังไม่มี คบ.1 ปุ่มส่งต่อล็อก', role: 'officer' })

    // WIT0403 ◇ ยังไม่มี คบ.1 → ปุ่มส่งต่อล็อก และการ์ดคดีหลักให้จัดทำ คบ.1 ก่อน
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ยังไม่ได้จัดทำแบบ คบ.1').first()).toBeVisible()
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()
    // แถว คบ.3 ยังเปิดไม่ได้จนกว่าจะกลั่นกรอง
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)

    // WIT0404/0405: ฟิลด์บังคับ (ชื่อ-นามสกุล) ว่างต้องบันทึกไม่ได้
    await expect(page.getByText(/ต้องจัดทำ.*คบ\.1/).first()).toBeVisible()
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    await snap(page, ['edge:04:E0403', 'node:04:WIT0404'], { label: 'เจ้าของสำนวนเปิดแบบ คบ.1 เปล่าเพื่อสัมภาษณ์และจัดทำ (ยังไม่มี คบ.1 ในแฟ้ม)', role: 'officer' })
    await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').first().fill('')
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณากรอกฟิลด์บังคับ')
    await fillAndSaveKb1OnForm(page)
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
    await snap(page, ['edge:04:E0405', 'edge:04:E0417', 'node:04:WIT0413'], { label: 'บันทึก คบ.1 แล้ว (ระบบต้องมี คบ.1 ก่อนจึงเชื่อมโยงได้) รอเจ้าของสำนวนเชื่อมโยงเลขสำนวนหลัก', role: 'officer' })

    // WIT0413 ยังไม่เชื่อมโยง → ปุ่มส่งต่อล็อก "ยังไม่ได้เชื่อมโยงคดีหลัก"
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ยังไม่ได้เชื่อมโยงคดีหลัก').first()).toBeVisible()
    await linkMainCaseAsOfficer(page)

    // WIT0310/0410 กลั่นกรองความเร่งด่วน (ต้องทำก่อนเปิด คบ.3 และ คบ.4/คบ.6)
    await screenUrgency(page, 'normal', 'ยังไม่พบภัยเฉพาะหน้า')

    // WIT0407 ◇ ไม่ข้าม → WIT0408 จัดทำ คบ.3
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toBeVisible()
    await snap(page, ['node:04:WIT0407', 'edge:04:E0408', 'node:04:WIT0408'], { label: 'เชื่อมโยงคดีและกลั่นกรอง "กรณีปกติ" แล้ว แถว คบ.3 เปิดให้เลือกจัดทำหรือกดข้าม', role: 'officer' })
    await fillKb3(page, CASE_NO, 'พฤติการณ์เพิ่มเติมจากการสัมภาษณ์พยาน')
    await snap(page, ['edge:04:E0410', 'node:04:WIT0410', 'edge:04:E0412', 'node:04:WIT0411'], { label: 'จัดทำ คบ.3 แล้ว ผลกลั่นกรอง "ไม่เร่งด่วน" — ต้องจัดทำ คบ.6 ก่อนส่ง ผบช.ชั้นต้น', role: 'officer' })
    expect((await readCase(page, CASE_NO))?.kb3Skipped).toBeFalsy()

    // WIT0410 ◇ ไม่เร่งด่วน → ไม่มี คบ.4 / Fast Track; WIT0411 ต้องมี คบ.6 ก่อนส่ง
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-card')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ชุดเสนอยังไม่ครบ — ยังไม่ได้จัดทำแบบ คบ.6')).toBeVisible()
    await fillKb6(page, CASE_NO)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', SUPERVISOR_LABEL)
    await expectStage(page, 'supervisor_review', CASE_NO)
    await snap(page, 'overview:04>05', { label: 'เจ้าของสำนวนส่งชุดเสนอ (กรณีไม่เร่งด่วน) ให้ ผบช.ชั้นต้นแล้ว — ต่อที่แท็บ 05', role: 'supervisor' })
  })

  test('04-B · ข้าม คบ.3 (ต้องมีเหตุผล) → Skip Record → คบ.6 → ส่ง ผบช.ชั้นต้น [WIT0407 0409 0410 0411]', async ({ page }) => {
    test.setTimeout(240_000)
    await openCase13Linked(page, 'normal')
    await fillKb1FromDossier(page, CASE_NO)

    // ไม่กรอกเหตุผล → ปฏิเสธ
    await page.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }).click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.getByRole('textbox').fill('')
    await dialog.getByRole('button', { name: 'ยืนยันข้าม คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ต้องระบุเหตุผลในการกดข้าม คบ.3')
    expect((await readCase(page, CASE_NO))?.kb3Skipped).toBeFalsy()

    await snap(page, ['edge:04:E0409', 'node:04:WIT0409'], { label: 'เจ้าของสำนวนบันทึก คบ.1 ครบถ้วน กลั่นกรองแล้ว พร้อมกด "กดข้าม คบ.3 (ระบุเหตุผล)"', role: 'officer' })
    await skipKb3(page, 'คบ.1 ระบุข้อเท็จจริงครบถ้วนแล้ว')
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล: คบ\.1 ระบุข้อเท็จจริงครบถ้วนแล้ว/)).toBeVisible()
    await snap(page, 'edge:04:E0411', { label: 'ข้าม คบ.3 พร้อมเหตุผลแล้ว (Skip Record) รอประเมินเส้นทางไม่เร่งด่วนและจัดทำ คบ.6', role: 'officer' })
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)
    const skipped = await readCase(page, CASE_NO)
    expect(skipped?.kb3Skipped).toBe(true)
    expect(skipped?.kb3SkipReason).toBe('คบ.1 ระบุข้อเท็จจริงครบถ้วนแล้ว')
    expect(skipped?.kb3SkippedAt).toBeTruthy()
    expect(skipped?.kb3SkippedBy).toBeTruthy()

    await fillKb6(page, CASE_NO)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', SUPERVISOR_LABEL)
    await expectStage(page, 'supervisor_review', CASE_NO)

    // ผบช.ชั้นต้นเห็น Skip Record
    await switchRole(page, 'supervisor')
    await page.goto(DOSSIER_URL)
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว/)).toBeVisible()
  })

  test('04-C · ข้าม คบ.3 แล้วเปลี่ยนใจ กด "กู้คืน คบ.3" → จัดทำ คบ.3 แทน [WIT0409 0414 0407 0408]', async ({ page }) => {
    test.setTimeout(180_000)
    await openCase13Linked(page, 'normal')
    await skipKb3(page, 'เห็นว่า คบ.1 ครบถ้วนแล้ว')
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล:/)).toBeVisible()
    expect((await readCase(page, CASE_NO))?.kb3Skipped).toBe(true)
    await snap(page, ['edge:04:E0415', 'node:04:WIT0414'], { label: 'ข้าม คบ.3 แล้ว แต่เจ้าของสำนวนเปลี่ยนใจ — เห็นปุ่ม "กู้คืน คบ.3"', role: 'officer' })

    // WIT0414 กู้คืน
    await page.getByRole('button', { name: 'กู้คืน คบ.3' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb3Skipped).toBeFalsy()
    await expect(formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toBeVisible()
    await snap(page, 'edge:04:E0416', { label: 'กู้คืน คบ.3 แล้ว แถว คบ.3 กลับมาเปิดแบบฟอร์มได้ (กลับไปเลือกจัดทำ/ข้ามอีกครั้ง)', role: 'officer' })

    // WIT0408 จัดทำ คบ.3
    await fillKb3(page, CASE_NO, 'ข้อเท็จจริงเพิ่มเติมหลังกู้คืน คบ.3')
    expect((await readCase(page, CASE_NO))?.kb3Skipped).toBeFalsy()
  })

  test('04-D · แฟ้มที่รับเป็น คบ.2: คบ.1 → ค้นไม่พบ ระบุเหตุผล → กลั่นกรอง → ส่งต่อถูกล็อกจนพยานลงนามยินยอมผ่านลิงก์ [WIT0404 0405 0213 0215 0406]', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 6.2', 'officer')
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    expect((await readCase(page, CASE_NO))?.kb1SignaturePending).toBe(true)

    // WIT0404/0405 จัดทำ/ตรวจ คบ.1 (เจ้าหน้าที่ลงชื่อแทนพยานไม่ได้)
    await fillKb1FromDossier(page, CASE_NO)
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)

    // WIT0213 เชื่อมโยงไม่ได้ — ต้องเลือกเหตุผลก่อน
    await page.getByTestId('main-case-not-found-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาเลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ก่อน')
    expect((await readCase(page, CASE_NO))?.mainCaseStatus).not.toBe('not_found')

    // WIT0215 บันทึกไม่พบคดี พร้อมเหตุผล ห้ามปัดตก
    await page.getByTestId('main-case-not-found-reason-select').selectOption(NOT_FOUND_REASON)
    await snap(page, ['edge:02:E21', 'node:02:WIT0215'], { label: 'เจ้าของสำนวนค้นไม่พบคดีหลัก เลือกเหตุผลแล้ว ก่อนกด "ยืนยันไม่พบคดี" (Case Link = not_found)', role: 'officer' })
    await page.getByTestId('main-case-not-found-button').click()
    await confirmDialog(page, 'ยืนยันไม่พบคดี', 'ห้ามปัดตก')
    const marked = await readCase(page, CASE_NO)
    expect(marked?.mainCaseStatus).toBe('not_found')
    expect(marked?.mainCaseNotFoundReason).toBe(NOT_FOUND_REASON)
    await expect(page.getByTestId('main-case-not-found-reason')).toContainText(NOT_FOUND_REASON)
    await snap(page, ['edge:02:E23', 'edge:02:E08'], { label: 'บันทึกไม่พบคดีหลักพร้อมเหตุผลแล้ว (not_found) แผงกลั่นกรองความเร่งด่วนเปิดต่อ รอส่งต่อ ผอ.', role: 'officer' })

    // กลั่นกรองต่อในการ์ดเดียวกัน แล้วส่งต่อถูกล็อกด้วยลายมือชื่อยินยอม
    await screenUrgency(page, 'normal', 'พยานแจ้งว่าถูกโทรศัพท์ข่มขู่ ยังไม่พบภัยเฉพาะหน้า')
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toBeVisible()
    await snap(page, ['edge:04:E0406', 'node:04:WIT0406'], { label: 'แฟ้ม คบ.2: บันทึก คบ.1 และกลั่นกรองแล้ว ปุ่มส่งต่อล็อกจนกว่าพยานลงนามยินยอม — กด "ส่งลิงก์ให้พยานลงนาม" ได้', role: 'officer' })

    // WIT0406 ส่งลิงก์ → พยานลงนาม → ปลดล็อก
    const url = await sendConsentLink(page)
    await witnessSigns(page, url)
    await page.goto(DOSSIER_URL)
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toHaveCount(0)
    const signed = await readCase(page, CASE_NO)
    expect(signed?.kb1SignaturePending).toBe(false)
    expect(signed?.kb1SignedAt).toBeTruthy()
    await snap(page, 'edge:04:E0407', { label: 'พยานลงนามยินยอมใน คบ.1 ผ่านลิงก์แล้ว ปุ่มส่งต่อปลดล็อก รอเลือกจัดทำหรือข้าม คบ.3', role: 'officer' })
  })

  test('04-E · เส้นทางเร่งด่วน: ประเมินเร่งด่วน → เห็น คบ.4 + Fast Track → ส่งตรง ผอ. (ข้าม ผบช.ชั้นต้น) ไปแท็บ 06 [WIT0410 0412]', async ({ page }) => {
    test.setTimeout(180_000)
    await openCase13Linked(page, 'urgent')
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()
    const assessed = await readCase(page, CASE_NO)
    expect(assessed?.urgency).toBe('urgent')
    expect(assessed?.urgent).toBe(true)
    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await expect(page.getByTestId('fast-track-submit-panel')).toBeVisible()

    await snap(page, ['edge:04:E0413', 'node:04:WIT0412'], { label: 'ประเมินเร่งด่วนแล้ว — เห็นแถว คบ.4 และส่วนส่งเส้นทางเร่งด่วน ส่งตรง ผอ.สำนัก/กอง (ข้าม ผบช.ชั้นต้น)', role: 'officer' })
    await submitFastTrackToDirector(page, CASE_NO)
    await expectStage(page, 'director_review', CASE_NO)
    const after = await readCase(page, CASE_NO)
    expect(after?.fastTracked).toBe(true)
    // ส่งแล้วแฟ้มอยู่กับ ผอ. — เจ้าหน้าที่ไม่มีส่วนส่งเส้นทางเร่งด่วนให้กดซ้ำ
    await expect(page.getByTestId('fast-track-submit-panel')).toHaveCount(0)
    await snap(page, 'overview:04>06', { label: 'ส่ง Fast Track ให้ ผอ.สำนัก/กอง แล้ว — ต่อที่แท็บ 06', role: 'director' })
  })

  test('04-F · แฟ้มที่รับเป็น คบ.1 (งานค้างเหลือ คบ.3): ตรวจ/บันทึก คบ.1 ได้ และไม่มีด่านลงนามยินยอมบังคับ [WIT0403 0405 0406]', async ({ page }) => {
    test.setTimeout(180_000)
    await openCase13Linked(page, 'normal', { intakeDocType: 'kb1', form: 'คบ.1', pendingIntakeForms: ['คบ.3'], kb1SignaturePending: false })
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
    await snap(page, 'edge:04:E0404', { label: 'แฟ้มที่รับเป็น คบ.1 มี คบ.1 อยู่แล้ว — เจ้าของสำนวนเชื่อมโยงและกลั่นกรองแล้ว ต้องตรวจ/ยืนยัน คบ.1', role: 'officer' })
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    await snap(page, 'node:04:WIT0405', { label: 'เปิดแบบ คบ.1 ของแฟ้มเพื่อตรวจและยืนยันข้อมูลพร้อมหลักฐานประกอบ', role: 'officer' })
    await page.goto(DOSSIER_URL)
    await fillKb1FromDossier(page, CASE_NO)
    // WIT0406 ไม่มีด่านลายมือชื่อยินยอมสำหรับแฟ้มที่รับเป็น คบ.1
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toHaveCount(0)
    expect((await readCase(page, CASE_NO))?.kb1SignaturePending).toBeFalsy()
  })
})
