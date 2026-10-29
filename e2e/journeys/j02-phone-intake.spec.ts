import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { newCaseNoAfterIntake } from '../helpers/seed'
import { areaField, confirmDialog, expectStage, fieldAfterLabel, formRow } from './journey-helpers'
import { sendConsentLink, witnessSigns } from '../helpers/consent'

/**
 * J02 · รับแจ้งทางโทรศัพท์ (คบ.2) เชื่อมโยงเลขสำนวนไม่ได้ แล้วจัดทำ คบ.1 จนส่งผู้บังคับบัญชาชั้นต้น
 *
 * scenario `phone-intake` (Case 6 → 6.1 → 6.2): เจ้าหน้าที่ ป.ป.ท. รับแจ้งทางโทรศัพท์ที่ /intake
 * → ค้นเลขสำนวนหลักไม่พบ บันทึกเหตุผล (ห้ามปัดตก) → ส่ง ผอ. มอบหมาย → เจ้าของสำนวนจัดทำ คบ.1 จากข้อมูล คบ.2
 * → กลั่นกรองความเร่งด่วน → พยานลงนามยินยอม คบ.1 → จัดทำ คบ.3 / คบ.6 → ส่งเข้าแท็บ 05
 *
 * ลำดับแท็บ: 02 → 03 → 04 → 05 (เข้า supervisor_review)
 * seed ครั้งเดียวที่ Case 1 (ตัวแทนฐานข้อมูลเริ่มต้น เจ้าหน้าที่ ป.ป.ท.) แล้วสร้างแฟ้มใหม่จาก /intake ผ่าน UI ล้วน
 */

const NOT_FOUND_REASON = 'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5'

async function newCaseNoFromUrl(page: Page): Promise<string> {
  return newCaseNoAfterIntake(page)
}

test('J02 · รับแจ้งโทรศัพท์ คบ.2 → ไม่พบเลขสำนวนหลักแต่รับเรื่องต่อ → ผอ. มอบหมาย → จัดทำ คบ.1/คบ.3/คบ.6 → ส่ง ผบช.ชั้นต้น', async ({ page }) => {
  test.setTimeout(240_000)
  let caseNo = ''
  const dossier = () => `/dossier/${encodeURIComponent(caseNo)}`

  // WIT0201/0202/0205 ⚙️ พยานโทรศัพท์แจ้งนอกระบบ — ช่องทางผูกกับประเภทเอกสาร (คบ.2 = โทรศัพท์) ผังให้พยานเลือกช่องทางเอง
  await seedMockState(page, 'Case 1', 'officer')

  await test.step('WIT0207 · ขั้นรับเรื่องไม่กลั่นกรองความเร่งด่วน — ย้ายไปทำหลังจัดทำ คบ.1', async () => {
    await page.goto('/intake')
    await expect(page.getByTestId('intake-triage')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' })).toBeEnabled()
  })

  await test.step('WIT0209/0210 · เลือกแบบตามช่องทาง = โทรศัพท์ → บันทึก คบ.2 ระบบเปิดงานค้างจัดทำ คบ.1 พร้อมธงรอพยานลงนาม', async () => {
    await page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' }).click()
    caseNo = await newCaseNoFromUrl(page)

    const created = await readCase(page, caseNo)
    expect(created?.form).toBe('คบ.2')
    expect(created?.intakeDocType).toBe('kb2')
    expect(created?.intakeChannel).toBe('phone')
    expect(created?.urgency).toBeFalsy()
    expect(created?.kb1SignaturePending).toBe(true)
    expect(created?.pendingIntakeForms).toEqual(expect.arrayContaining(['คบ.1', 'คบ.3']))
    // ผังให้เปิดฟอร์ม คบ.1 ต่อทันที แต่โปรโตไทป์ตั้งเป็นงานค้างให้เจ้าของสำนวนทำหลังมอบหมาย (แท็บ 04)
    await expectStage(page, 'officer_intake', caseNo)
  })

  await test.step('WIT0212/0216 · ขั้นรับเรื่องต้องเชื่อมโยงคดีหลัก (หรือไม่พบคดี) ก่อนส่ง ผอ. — ยังไม่ทำจึงส่งไม่ได้', async () => {
    await expect(page.getByTestId('main-case-link-deferred')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
  })

  await test.step('WIT0213 · เชื่อมโยงเลขสำนวนหลักได้หรือไม่ — ไม่ได้ (ต้องเลือกเหตุผลก่อน)', async () => {
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
    await page.getByTestId('main-case-not-found-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาเลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ก่อน')
    expect((await readCase(page, caseNo))?.mainCaseStatus).not.toBe('not_found')
  })

  await test.step('WIT0215 · บันทึกสถานะไม่พบคดี พร้อมเหตุผล ห้ามปัดตก', async () => {
    await page.getByTestId('main-case-not-found-reason-select').selectOption(NOT_FOUND_REASON)
    await page.getByTestId('main-case-not-found-button').click()
    await confirmDialog(page, 'ยืนยันไม่พบคดี', 'ห้ามปัดตก')

    const marked = await readCase(page, caseNo)
    expect(marked?.mainCaseStatus).toBe('not_found')
    expect(marked?.mainCaseNotFoundReason).toBe(NOT_FOUND_REASON)
    await expect(page.getByTestId('main-case-not-found-reason')).toContainText(NOT_FOUND_REASON)
    await expect(page.getByRole('button', { name: /ปัดตก|ปฏิเสธคำร้อง/ })).toHaveCount(0)
  })

  await test.step('WIT0216 · บันทึกไม่พบคดีแล้ว ส่ง ผอ. มอบหมายได้', async () => {
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expectStage(page, 'director_assign', caseNo)
  })

  await test.step('WIT0301 · ผอ. รับคำขอเข้าคิวงาน', async () => {
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(caseNo)).toBeVisible()
  })

  await test.step('WIT0302/0303 · ผอ. ตรวจสถานะเลขสำนวน (ไม่พบคดี) และความเร่งด่วน (ยังไม่ประเมิน) ก่อนมอบหมาย', async () => {
    await page.goto(dossier())
    await expect(page.getByTestId('main-case-not-found-reason')).toContainText(NOT_FOUND_REASON)
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()
    // ผอ. ตรวจเอกสารตั้งต้นได้ก่อนมอบหมาย (ดูอย่างเดียว) — มีเพียง คบ.2 · คบ.1 / คบ.3 เป็นงานของเจ้าของสำนวน
    await expect(page.getByTestId('dossier-forms')).toBeVisible()
    await expect(formRow(page, 'คบ.2')).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toHaveCount(0)
    await expect(formRow(page, 'คบ.3')).toHaveCount(0)
  })

  await test.step('WIT0304/0305 · ผอ. เลือกผู้รับผิดชอบและมอบหมายเจ้าของสำนวน (ระบบบันทึกผู้มอบหมาย/เวลา)', async () => {
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    const assigned = await readCase(page, caseNo)
    expect(assigned?.assignedOfficerUserId).toBeTruthy()
    expect(assigned?.assignedAt).toBeTruthy()
    expect(assigned?.assignedBy).toBeTruthy()
  })

  await test.step('WIT0306 · ส่งงานให้เจ้าของสำนวน (ผังคือแจ้งเตือน — โปรโตไทป์แจ้งตอนกดมอบหมาย แต่เข้าคิวเมื่อกดส่งต่อ)', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expectStage(page, 'staff_review', caseNo)
  })

  await test.step('WIT0307 · เจ้าหน้าที่ผู้รับผิดชอบเห็นการแจ้งเตือนและรับงานจากคิว', async () => {
    await switchRole(page, 'officer')
    await page.goto('/notifications')
    await expect(page.getByText('ไม่มีรายการแจ้งเตือนในขณะนี้')).toHaveCount(0)
    await page.goto('/queue/officer')
    await expect(page.getByText(caseNo)).toBeVisible()
    await page.goto(dossier())
    await expect(formRow(page, 'คบ.1')).toBeVisible()
  })

  await test.step('WIT0308/0309/0311/0312 · ยังไม่มีผลกลั่นกรอง และเอกสารตั้งต้นเป็น คบ.2 → ต้องจัดทำ คบ.1 ก่อน', async () => {
    await expect(page.getByText(/ต้องจัดทำ.*คบ\.1/)).toBeVisible()
    await expect(page.getByTestId('main-case-link-waiting-kb1')).toBeVisible()
    await expect(page.getByTestId('urgency-screening-panel')).toHaveCount(0)
    expect((await readCase(page, caseNo))?.urgency).toBeFalsy()
  })

  await test.step('WIT0404/0405 · จัดทำและตรวจ คบ.1 จากข้อมูล คบ.2 (ชื่อ-นามสกุลบังคับ)', async () => {
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    // ฟิลด์บังคับว่าง → บันทึกไม่ได้
    await fieldAfterLabel(page, 'ชื่อ').first().fill('')
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณากรอกฟิลด์บังคับ')

    // ระบบพากลับไปส่วนที่มีฟิลด์บังคับ — กรอกชื่อ-นามสกุลที่ได้จากการสัมภาษณ์
    await expect(page.getByRole('button', { name: 'ส่วนก่อนหน้า' })).toBeDisabled()
    await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').fill('กมลชนก')
    await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').fill('บุญรักษา')
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await page.goto(dossier())
    expect((await readCase(page, caseNo))?.kb1CompletedAt).toBeTruthy()
  })

  await test.step('WIT0207/0208/0310 · กลั่นกรองความเร่งด่วนหลัง คบ.1 — บันทึกผล "ไม่เร่งด่วน" พร้อมเหตุผล', async () => {
    const panel = page.getByTestId('urgency-screening-panel')
    await expect(panel).toBeVisible()
    await panel.getByRole('textbox').fill('พยานแจ้งว่าถูกโทรศัพท์ข่มขู่ แต่ยังไม่พบภัยเฉพาะหน้า จัดเป็นกรณีปกติ')
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()
    await expect(page.getByText(/ผลการประเมิน:/)).toBeVisible()
    const screened = await readCase(page, caseNo)
    expect(screened?.urgency).toBe('normal')
    expect(screened?.urgencyAssessedAt).toBeTruthy()
  })

  await test.step('WIT0402/0403 · แฟ้มแสดง Case Link (ไม่พบคดี) + ผลกลั่นกรอง + รายการแบบฟอร์ม', async () => {
    await expect(page.getByTestId('main-case-not-found-reason')).toContainText(NOT_FOUND_REASON)
    await expect(formRow(page, 'คบ.3')).toBeVisible()
  })

  await test.step('WIT0406 · ส่งต่อถูกล็อกจนกว่าพยานลงนามยินยอมใน คบ.1', async () => {
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toBeVisible()
  })

  await test.step('WIT0406 · ผู้ขอคุ้มครองลงนามยินยอมใน คบ.1 ผ่านลิงก์ ปลดล็อกการส่งต่อ', async () => {
    // แผงส่งลิงก์แสดงหลังกลั่นกรองแล้ว · เจ้าหน้าที่ลงชื่อแทนพยานไม่ได้
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)
    const url = await sendConsentLink(page)
    await witnessSigns(page, url)
    await page.goto(dossier())
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')).toHaveCount(0)
    const signed = await readCase(page, caseNo)
    expect(signed?.kb1SignaturePending).toBe(false)
    expect(signed?.kb1SignedAt).toBeTruthy()
  })

  await test.step('WIT0407/0408 · ไม่ข้าม คบ.3 — จัดทำ คบ.3 บันทึกข้อเท็จจริงประกอบคำร้อง', async () => {
    await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/3/)
    await areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(
      'พยานถูกโทรศัพท์ข่มขู่หลายครั้งหลังให้ถ้อยคำ'
    )
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
    await page.goto(dossier())
    expect((await readCase(page, caseNo))?.kb3Skipped).toBeFalsy()
  })

  await test.step('WIT0410 · ผลประเมิน = ไม่เร่งด่วน → เส้นทางปกติ (ไม่มี คบ.4 / Fast Track)', async () => {
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-card')).toHaveCount(0)
  })

  await test.step('WIT0411 · จัดทำ คบ.6 บันทึกเสนอความเห็น (ชุดเสนอยังไม่ครบถ้าไม่มี คบ.6)', async () => {
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('ชุดเสนอยังไม่ครบ — ยังไม่ได้จัดทำแบบ คบ.6')).toBeVisible()
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(caseNo)}`))
  })

  await test.step('WIT0501/0502 · ส่งชุดเสนอ คบ.1 + คบ.3 + คบ.6 ไปแท็บ 05 ถึงผู้บังคับบัญชาชั้นต้น', async () => {
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expectStage(page, 'supervisor_review', caseNo)
    const after = await readCase(page, caseNo)
    expect(after?.owner).toBe('นายกิตติศักดิ์ ธรรมรักษ์')

    // งานขึ้นคิว "งานของฉัน" ของผู้บังคับบัญชาชั้นต้น (ไม่มีแจ้งเตือนใน /notifications — ผังต่าง)
    await switchRole(page, 'supervisor')
    await page.goto('/queue/supervisor')
    await expect(page.getByText(caseNo)).toBeVisible()
  })
})
