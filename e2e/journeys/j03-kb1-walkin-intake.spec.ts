import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { newCaseNoAfterIntake } from '../helpers/seed'
import { areaField, confirmDialog, expectStage, formRow, submitFastTrackToDirector } from './journey-helpers'

/**
 * J03 · รับเรื่องใหม่จากทะเบียน (เข้าพบ คบ.1 / ธุรการรับคำร้อง) → ผอ. มอบหมาย → จัดทำ คบ.1 / คบ.3 / คบ.6 → ผบช.ชั้นต้น
 *
 * เส้นทางหลัก: เจ้าหน้าที่ ป.ป.ท. กด "รับคำร้องใหม่" จาก /registry เลือก คบ.1 (เข้าพบ) บันทึก คบ.1 → เชื่อมโยงเลขสำนวน → ส่ง ผอ.
 * → ผอ. มอบหมาย (แท็บ 03) → เจ้าของสำนวนกลั่นกรองความเร่งด่วน → "ไม่ข้าม" คบ.3 (WIT0407 → WIT0408) / คบ.6 (แท็บ 04)
 * → ส่งผู้บังคับบัญชาชั้นต้นเห็นชุดเสนอที่มี คบ.3 (scenario `kb3-prepared`: Case 1.3 → 6.3)
 *
 * ทางแยก (◇) ในแท็บ 02 / 03 / 04:
 *   J03-a  ธุรการรับคำร้อง (WIT0203/0206 แนบไฟล์) → เจ้าของสำนวนจัดทำ คบ.1 → เชื่อมโยง → กลั่นกรองปกติ (WIT0310) → ข้าม คบ.3 (WIT0409)
 *   J03-b  รับ คบ.1 → เจ้าของสำนวนกลั่นกรองเป็นเร่งด่วน → เข้าเส้นทางเร่งด่วน (แท็บ 06)
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

/**
 * เจ้าของสำนวนกลั่นกรองความเร่งด่วน (WIT0207/0208/0310) — แผงอยู่ในการ์ดคดีหลัก
 * แสดงหลังบันทึก คบ.1 และเชื่อมโยงคดีหลักแล้ว
 */
async function screenUrgency(page: Page, kind: 'normal' | 'urgent', reason: string) {
  const panel = page.getByTestId('urgency-screening-panel')
  await expect(panel).toBeVisible()
  await panel.getByRole('textbox').fill(reason)
  await page.getByRole('button', { name: kind === 'normal' ? NORMAL_BTN : URGENT_BTN }).click()
  await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
}

/** เชื่อมโยงเลขสำนวนหลัก (WIT0212-0214) — เจ้าหน้าที่ผู้รับเรื่องก่อนส่ง ผอ. หรือเจ้าของสำนวนหลังบันทึก คบ.1 (เรื่องที่ธุรการรับ) */
async function linkMainCaseAsOwner(page: Page, caseNo: string) {
  await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
  await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
  await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
  expect((await readCase(page, caseNo))?.mainCaseStatus).toBe('linked')
}

/**
 * ส่ง ผอ. มอบหมาย (WIT0216) — เจ้าหน้าที่ผู้รับเรื่องเชื่อมโยงคดีหลักก่อน (ยังไม่เชื่อมโยงจะส่งไม่ได้)
 * ธุรการไม่เห็นการ์ดคดีหลักและส่งต่อได้เลย
 */
async function forwardToDirector(page: Page, caseNo: string) {
  if (await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).isVisible()) {
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await linkMainCaseAsOwner(page, caseNo)
  }
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expectStage(page, 'director_assign', caseNo)
}

/** ผอ. มอบหมายเจ้าของสำนวนแล้วส่งต่อให้เจ้าหน้าที่ (WIT0301-0306) */
async function directorAssigns(page: Page, caseNo: string) {
  await switchRole(page, 'director')
  await page.goto(`/queue/director`)
  await expect(page.getByText(caseNo)).toBeVisible()
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
  await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
  await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
  expect((await readCase(page, caseNo))?.assignedOfficerUserId).toBeTruthy()
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expectStage(page, 'staff_review', caseNo)
  await switchRole(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
}

/** จัดทำ คบ.1 (WIT0404/0405): กรอกชื่อ-นามสกุลที่ส่วนแรก เดินจนท้ายฟอร์มแล้วบันทึก */
async function fillKb1(page: Page, caseNo: string) {
  await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/1/)
  await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').fill('กมลชนก')
  await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').fill('บุญรักษา')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
  await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
}

/** จัดทำ คบ.3 (WIT0408) */
async function fillKb3(page: Page, caseNo: string, text: string) {
  await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/3\?caseNo=/)
  await areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(text)
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

/** เจ้าหน้าที่รับเข้าพบ: เลือก คบ.1 + แนบไฟล์ แล้วกรอกและบันทึก คบ.1 ที่ระบบเปิดให้ต่อทันที (WIT0211/0218) — ไม่กลั่นกรองที่ขั้นรับเรื่อง */
async function officerIntakesKb1(page: Page): Promise<string> {
  await seedMockState(page, 'Case 1', 'officer')
  await openIntakeFromRegistry(page)
  await expect(page.getByTestId('intake-triage')).toHaveCount(0)
  await page.getByLabel('อัปโหลดไฟล์ คบ.1').setInputFiles(pdfFile('kb1-evidence.pdf'))
  await expect(page.getByText('kb1-evidence.pdf')).toBeVisible()
  await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
  const caseNo = await newCaseNoAfterIntake(page, { expectForm: 1, backToDossier: false })
  await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').fill('กมลชนก')
  await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').fill('บุญรักษา')
  for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(caseNo)}`))
  const created = await readCase(page, caseNo)
  expect(created?.intakeDocType).toBe('kb1')
  expect(created?.intakeChannel).toBe('walkin')
  expect(created?.pendingIntakeForms).toEqual(['คบ.3'])
  expect(created?.urgency).toBeFalsy()
  expect(created?.kb1CompletedAt).toBeTruthy()
  return caseNo
}

test('J03 · เจ้าหน้าที่รับเข้าพบ คบ.1 จากทะเบียน → ผอ. มอบหมาย → จัดทำ คบ.1 + คบ.3 (ไม่ข้าม) + คบ.6 → ผบช.ชั้นต้นตรวจชุดเสนอ', async ({ page }) => {
  test.setTimeout(240_000)
  let caseNo = ''

  await test.step('WIT0204/0211/0218 · พยานเข้าพบ (นอกระบบ) เจ้าหน้าที่กด "รับคำร้องใหม่" จากทะเบียน เลือก คบ.1 แนบหลักฐาน แล้วบันทึก คบ.1', async () => {
    // WIT0201/0202/0204 ⚙️ นอกระบบ — ช่องทางเข้าพบ = ประเภทเอกสาร คบ.1 (ผังให้พยานเลือกช่องทางเอง)
    caseNo = await officerIntakesKb1(page)
    // WIT0209 ◇ คบ.1 → งานค้างเหลือเพียง คบ.3 ไม่ต้องทำ คบ.1 ซ้ำ
    expect((await readCase(page, caseNo))?.kb1SignaturePending).toBeFalsy()
  })

  await test.step('WIT0212/0213/0214/0216 · เจ้าหน้าที่ผู้รับเรื่องค้นและยืนยันเชื่อมโยงเลขสำนวนหลัก แล้วส่ง ผอ. มอบหมาย', async () => {
    await expect(page.getByTestId('main-case-link-deferred')).toHaveCount(0)
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    await forwardToDirector(page, caseNo)
    expect((await readCase(page, caseNo))?.linkedMainCaseId).toBeTruthy()
  })

  await test.step('WIT0301/0302/0303 · ผอ. รับงานจากคิว ตรวจ Case Link และความเร่งด่วน (ยังไม่ประเมิน)', async () => {
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(caseNo)).toBeVisible()
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await expect(page.getByText('รอมอบหมายเจ้าของสำนวน')).toBeVisible()
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()
    // ผอ. ตรวจแบบฟอร์มและไฟล์แนบได้ก่อนมอบหมาย (ดูอย่างเดียว)
    await expect(page.getByTestId('dossier-forms')).toBeVisible()
    await expect(page.getByText('เอกสารหลักฐานและไฟล์แนบ')).toBeVisible()
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
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(page.getByText('kb1-evidence.pdf')).toBeVisible()
  })

  await test.step('WIT0311/0313 · เอกสารตั้งต้นเป็น คบ.1 (บันทึกแล้ว) → ต้องจัดทำเพียง คบ.3 และเชื่อมโยงคดีได้ทันที', async () => {
    await expect(page.getByText('ต้องจัดทำ: คบ.3', { exact: true })).toBeVisible()
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toHaveCount(0)
  })

  await test.step('WIT0212 · คดีหลักเชื่อมโยงไว้แล้วตั้งแต่ขั้นรับเรื่อง — เจ้าของสำนวนไม่ต้องเชื่อมโยงซ้ำ', async () => {
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
  })

  await test.step('WIT0207/0208/0309/0310 · ยังไม่มีผลกลั่นกรอง → เจ้าของสำนวนกลั่นกรองเป็นกรณีปกติพร้อมเหตุผล', async () => {
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await screenUrgency(page, 'normal', 'พยานเข้าพบเอง ไม่พบภัยคุกคามเฉพาะหน้า')
    const screened = await readCase(page, caseNo)
    expect(screened?.urgencyAssessedAt).toBeTruthy()
    expect(screened?.urgencyAssessedBy).toBeTruthy()
    expect(screened?.urgencyAssessmentNote).toContain('ไม่พบภัยคุกคามเฉพาะหน้า')
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
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
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

test('J03-a · [ทางแยก] ธุรการรับคำร้อง (แนบไฟล์สแกน) → เจ้าของสำนวนจัดทำ คบ.1 เชื่อมโยง กลั่นกรองปกติ → ข้าม คบ.3 พร้อมเหตุผล → ผบช.ชั้นต้น', async ({ page }) => {
  test.setTimeout(240_000)

  let caseNo = ''
  await test.step('WIT0203/0206 · ธุรการรับคำร้องใหม่จากทะเบียน แนบไฟล์สแกน (ไม่ต้องกลั่นกรองความเร่งด่วน)', async () => {
    caseNo = await receiverIntakesPetition(page)
  })

  await test.step('WIT0216 · ธุรการส่ง ผอ. โดยไม่เชื่อมโยง (ธุรการไม่เห็นการ์ดคดีหลัก)', async () => {
    await forwardToDirector(page, caseNo)
  })

  await test.step('WIT0301-0306 · ผอ. มอบหมายและส่งต่อเจ้าของสำนวน', async () => {
    await directorAssigns(page, caseNo)
  })

  await test.step('WIT0309/0311/0312 ◇ · ยังไม่มีผลกลั่นกรองและเอกสารตั้งต้นเป็นคำร้อง → ต้องจัดทำ คบ.1 ก่อน', async () => {
    await expect(page.getByText(/ต้องจัดทำ.*คบ\.1.*คบ\.3/)).toBeVisible()
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
  })

  await test.step('WIT0404/0405 · จัดทำ คบ.1', async () => {
    await fillKb1(page, caseNo)
    expect((await readCase(page, caseNo))?.kb1CompletedAt).toBeTruthy()
  })

  await test.step('WIT0413 · เจ้าของสำนวนเชื่อมโยงคดีหลักหลังจัดทำ คบ.1', async () => {
    await linkMainCaseAsOwner(page, caseNo)
  })

  await test.step('WIT0310 · เจ้าของสำนวนกลั่นกรองเป็น "กรณีปกติ" (ไม่สร้างเลขแบบ คบ. ใด ๆ)', async () => {
    const before = await readCase(page, caseNo)
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await screenUrgency(page, 'normal', 'ยังไม่พบภัยเฉพาะหน้าจากข้อมูลใน คบ.1')
    const after = await readCase(page, caseNo)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgencyAssessedAt).toBeTruthy()
    expect(after?.urgencyAssessedBy).toBeTruthy()
    expect(after?.stage).toBe('staff_review')
    expect(after?.form).toBe(before?.form)
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
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว/)).toBeVisible()
    expect((await readCase(page, caseNo))?.owner).toBe(SUPERVISOR)
  })
})

test('J03-b · [ทางแยก] รับ คบ.1 → ผอ. มอบหมาย → เจ้าของสำนวนกลั่นกรองเป็นเร่งด่วน → เข้าเส้นทางเร่งด่วน (แท็บ 06) ผ่าน ผอ.', async ({ page }) => {
  test.setTimeout(240_000)
  let caseNo = ''

  await test.step('WIT0211 · รับ คบ.1 แล้วบันทึก (ไม่กลั่นกรองที่ขั้นรับเรื่อง) และส่ง ผอ.', async () => {
    caseNo = await officerIntakesKb1(page)
    await forwardToDirector(page, caseNo)
  })

  await test.step('WIT0301-0306 · ผอ. มอบหมาย (ยังไม่มีผลกลั่นกรอง)', async () => {
    await directorAssigns(page, caseNo)
  })

  await test.step('WIT0207/0208/0310 · คดีหลักเชื่อมโยงไว้ตั้งแต่ขั้นรับเรื่อง เจ้าของสำนวนกลั่นกรอง "กรณีจำเป็นเร่งด่วน" พร้อมเหตุผล', async () => {
    await screenUrgency(page, 'urgent', 'ถูกข่มขู่คุกคามถึงชีวิต')
    const screened = await readCase(page, caseNo)
    expect(screened?.risk).toBe('วิกฤต')
    expect(screened?.urgent).toBe(true)
    expect(screened?.urgencyAssessmentNote).toContain('ข่มขู่คุกคามถึงชีวิต')
  })

  await test.step('WIT0410 ◇ → WIT0412 เส้นทางเร่งด่วน', async () => {
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()
    // เส้นทางเร่งด่วนไม่บังคับ คบ.6 ก่อนส่ง — ส่งผ่านส่วนส่งเส้นทางเร่งด่วนแทนปุ่มส่งต่อทั่วไป
    await expect(page.getByTestId('fast-track-submit-panel')).toBeVisible()
  })

  await test.step('WIT0412 · ส่งตรงถึง ผอ.สำนัก/กอง ข้าม ผบช.ชั้นต้น → การ์ด Fast Track (แท็บ 06)', async () => {
    await submitFastTrackToDirector(page, caseNo)
    await expectStage(page, 'director_review', caseNo)
    const after = await readCase(page, caseNo)
    expect(after?.owner).toBe(DIRECTOR)
    expect(after?.fastTracked).toBe(true)
    // ส่งแล้วแฟ้มอยู่กับ ผอ. — เจ้าหน้าที่ไม่มีส่วนส่งเส้นทางเร่งด่วนให้กดซ้ำ
    await expect(page.getByTestId('fast-track-submit-panel')).toHaveCount(0)

    await switchRole(page, 'director')
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await expect(page.getByTestId('fast-track-card')).toBeVisible()
  })
})

test('J03-c · [ทางแยก] ธุรการรับคำร้อง → เจ้าของสำนวนประเมินเป็นเร่งด่วน (WIT0310) → เข้าเส้นทางเร่งด่วน (แท็บ 06)', async ({ page }) => {
  test.setTimeout(240_000)

  const caseNo = await receiverIntakesPetition(page)
  await test.step('WIT0216 · ธุรการส่ง ผอ. โดยไม่เชื่อมโยง (ธุรการไม่เห็นการ์ดคดีหลัก)', async () => {
    await forwardToDirector(page, caseNo)
  })
  await test.step('WIT0301-0306 · ผอ. มอบหมายและส่งต่อเจ้าของสำนวน แล้วเจ้าของสำนวนจัดทำ คบ.1 และเชื่อมโยงคดีหลัก', async () => {
    await directorAssigns(page, caseNo)
    await fillKb1(page, caseNo)
    await linkMainCaseAsOwner(page, caseNo)
  })

  await test.step('WIT0309 ◇ ไม่มีผลประเมิน → WIT0310 เจ้าของสำนวนเลือก "กรณีจำเป็นเร่งด่วน"', async () => {
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await screenUrgency(page, 'urgent', 'พบภัยคุกคามเฉพาะหน้าจากข้อมูลใน คบ.1')
    await expect(page.getByText(/กรณีจำเป็นเร่งด่วน — คบ\.3 → คบ\.4 → คบ\.5/)).toBeVisible()
    const after = await readCase(page, caseNo)
    expect(after?.urgency).toBe('urgent')
    expect(after?.urgent).toBe(true)
    expect(after?.urgencyAssessedBy).toBeTruthy()
    expect(after?.stage).toBe('staff_review')
  })

  await test.step('WIT0410 ◇ → WIT0412 · ส่งตรง ผอ. (Fast Track) ไปแท็บ 06', async () => {
    await expect(formRow(page, 'คบ.4')).toBeVisible()
    await submitFastTrackToDirector(page, caseNo)
    await expectStage(page, 'director_review', caseNo)
    const after = await readCase(page, caseNo)
    expect(after?.fastTracked).toBe(true)
    expect(after?.owner).toBe(DIRECTOR)
    // ส่งแล้วแฟ้มอยู่กับ ผอ. — เจ้าหน้าที่ไม่มีส่วนส่งเส้นทางเร่งด่วนให้กดซ้ำ
    await expect(page.getByTestId('fast-track-submit-panel')).toHaveCount(0)
  })
})

test('J03-d · [ทางแยก] ข้าม คบ.3 แล้วกู้คืน จัดทำ คบ.3 แทน (WIT0409 → WIT0407 → WIT0408)', async ({ page }) => {
  test.setTimeout(240_000)

  const caseNo = await officerIntakesKb1(page)
  await forwardToDirector(page, caseNo)
  await directorAssigns(page, caseNo)
  // คบ.3 เปิด/กดข้ามได้หลังกลั่นกรองแล้ว (คดีหลักเชื่อมโยงไว้ตั้งแต่ขั้นรับเรื่อง)
  await screenUrgency(page, 'normal', 'พยานเข้าพบเอง กรณีปกติ')

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
