import { expect, test, type Locator, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'
import {
  CASE_NO,
  DOSSIER_URL,
  areaField,
  cancelDialog,
  confirmDialog,
  expectStage,
  fieldAfterLabel,
  formRow,
  signInModal,
} from './journey-helpers'

/**
 * Journey J07 · ไม่อนุมัติและอุทธรณ์ (แท็บ 07 → 09A → 09B)
 *
 * ผัง (scenario `appeal`: Case 4 → 4.1 → 4.2 → 4.3):
 *   07  เลขาธิการฯ ลงนามข้อ 13 ใน คบ.6 → ◇ WIT0704 ผลพิจารณา "ไม่อนุมัติ" (WIT0706) → WIT0711 ไปแท็บ 09A
 *   09A รับ คบ.10 ที่ลงนามพร้อมผลแล้ว → เติมรายละเอียด → ตรวจพร้อมส่ง
 *       → WIT0906 นำส่ง → WIT0907 พยานรับ (เริ่มนับ 30 วัน)
 *       → ◇ WIT0908 ประสงค์อุทธรณ์? ใช่ → WIT0910 รับคำอุทธรณ์เข้าแฟ้มเดิม / ไม่ → WIT0909 ปิดเรื่อง
 *   09B WIT0911-0913 รับอุทธรณ์/ผูกกับแฟ้มเดิม → WIT0914 ตรวจครบถ้วน/คำนวณ 30 วัน → WIT0915 เจ้าหน้าที่
 *       → WIT0916 ผบช.ชั้นต้น/ผอ. → WIT0917 รองเลขาธิการฯ → WIT0918 เลขาธิการฯ → WIT0919 บรรจุวาระ
 *       → ◇ WIT0920 คณะกรรมการวินิจฉัย: ยืนคำสั่งเดิม → WIT0921 ปิดขั้นอุทธรณ์ / เปลี่ยนคำสั่ง → WIT0922 กลับ 08A
 *
 * ทางหลัก (J07) เริ่มที่ Case 1.7 (ก่อนเลขาธิการฯ ตัดสิน) แล้วเดินผ่าน UI ล้วนจนคณะกรรมการยืนคำสั่งเดิม
 * ทางแยกเริ่มที่ Case 4 (ร่าง คบ.10) แล้วเดินผ่าน UI ไปจนจบแขนงนั้น
 */

const APPEAL_URL = `/appeal-folder/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'
const SECRETARY = 'นายสุรศักดิ์ ธรรมพิทักษ์'

const isoDay = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10)

type AnyRec = Record<string, any>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as AnyRec

/** WIT0703 — เลขาธิการฯ ลงนามความเห็นข้อ 13 ที่ท้ายแบบ คบ.6 (ปุ่มสั่งการถูกล็อกจนกว่าจะลงนาม) */
async function signKb6Section13(page: Page) {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6\?caseNo=/)
  const area = areaField(page, '13. ความเห็นเลขาธิการฯ')
  if (!(await area.inputValue())) await area.fill('เห็นควรพิจารณาตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
}

/** WIT0904 — เจ้าหน้าที่ตรวจความครบถ้วนของร่าง คบ.10 แล้วเสนอรองเลขาธิการฯ กลั่นกรอง */
async function officerSubmitsScreening(page: Page, note: string) {
  await page.getByTestId('kb10-readiness-note').fill(note)
  await page.getByTestId('kb10-submit-screening').click()
  await confirmDialog(page, 'ยืนยันเสนอกลั่นกรอง', 'รองเลขาธิการฯ')
}

/** WIT0905 — รองเลขาธิการฯ กลั่นกรองผ่าน */
async function deputyPasses(page: Page, note: string) {
  await switchRole(page, 'deputy_secretary')
  await page.getByTestId('kb10-deputy-note').fill(note)
  await page.getByTestId('kb10-deputy-pass').click()
  await confirmDialog(page, 'ยืนยันกลั่นกรองผ่าน', 'แจ้งสิทธิอุทธรณ์ครบถ้วน')
}

/** WIT0906 — เลขาธิการฯ ลงนาม คบ.10 จากรายการแบบฟอร์มในแฟ้ม */
async function secretarySignsKb10(page: Page) {
  await switchRole(page, 'secretary')
  await expect(page.getByText('รอเลขาธิการฯ ลงนามในแบบฟอร์ม')).toBeVisible()
  await page.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }).click()
  await page.getByRole('button', { name: 'ลงนาม' }).last().click()
  await signInModal(page, SECRETARY)
  await expect.poll(async () => (await caseOf(page))?.kb10Signed).toBe(true)
}

function dispatchSectionOf(page: Page): Locator {
  return page
    .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
}

/** WIT0906 (นำส่ง) + WIT0907 (บันทึกวันที่พยานรับจริง) โดยเจ้าหน้าที่ */
async function officerDispatchesAndRecordsDelivery(page: Page, deliveredDate: string) {
  await switchRole(page, 'officer')
  const section = dispatchSectionOf(page)
  await section.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()
  await expect.poll(async () => (await caseOf(page))?.dispatchedAt).toBeTruthy()

  await section.locator('input[type="date"]').fill(deliveredDate)
  await fieldAfterLabel(section, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
  await section
    .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
    .locator('input[type="file"]')
    .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
  await section.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
  await expect.poll(async () => (await caseOf(page))?.deliveredAt).toBeTruthy()
}

/** ส่วน "สิทธิยื่นอุทธรณ์ภายใน 30 วัน" ของแฟ้ม (ฟอร์มรับอุทธรณ์ WIT0910/WIT0911) */
function appealIntakeSectionOf(page: Page): Locator {
  return page
    .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
}

/** WIT0911/WIT0912 — เจ้าหน้าที่รับอุทธรณ์เป็นหนังสือ (เลขรับสารบรรณกลาง + ไฟล์แนบ) เข้าแฟ้มเดิม */
async function officerFilesAppealByLetter(page: Page, reason: string, registryNo: string) {
  const section = appealIntakeSectionOf(page)
  await expect(section).toBeVisible()
  await fieldAfterLabel(section, 'เหตุผลในการอุทธรณ์').fill(reason)
  await section.getByTestId('appeal-intake-channel-letter').click()
  await section.getByTestId('appeal-intake-registry-no').fill(registryNo)
  await section.getByTestId('appeal-intake-first-received').fill(isoDay(0))
  await section.getByTestId('appeal-intake-evidence-file').setInputFiles({
    name: `หนังสืออุทธรณ์_${registryNo.replace('/', '-')}.pdf`,
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  })
  await section.getByTestId('appeal-intake-submit').click()
  await confirmDialog(page, 'ยืนยัน')
}

/** WIT0915-WIT0918 — บันทึกความเห็นหนึ่งชั้นแล้วส่งต่อ (สลับบทบาทก่อนถ้าระบุ) */
async function giveOpinion(page: Page, role: string | null, note: string, expectedText?: string | RegExp) {
  if (role) await switchRole(page, role)
  await page.getByTestId('appeal-opinion-note').fill(note)
  await page.getByTestId('appeal-opinion-submit').click()
  await confirmDialog(page, 'ยืนยัน', expectedText)
}

/** WIT0914 → WIT0919 — ตรวจครบถ้วนแล้วเดินลำดับชั้นจนฝ่ายเลขานุการบรรจุวาระ (เริ่มที่เจ้าหน้าที่) */
async function walkAppealHierarchyToAgenda(page: Page) {
  await page.getByTestId('appeal-check-submit').click()
  await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน', 'ยื่นภายในกรอบกำหนด')
  await giveOpinion(page, null, 'ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น', 'ผบช.ชั้นต้น')
  await giveOpinion(page, 'supervisor', 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ ผอ.สำนัก/กอง', 'ผอ.สำนัก/กอง')
  await giveOpinion(page, 'director', 'ตรวจแล้ว ลงนามเสนอรองเลขาธิการฯ', 'รองเลขาธิการฯ')
  await giveOpinion(page, 'deputy_secretary', 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบ', 'ผ่านการกลั่นกรองแล้ว')
  await switchRole(page, 'secretary')
  await expect(page.getByTestId('appeal-opinion-secretary')).toContainText('ไม่ใช่ผู้วินิจฉัยอุทธรณ์')
  await giveOpinion(page, null, 'รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย', 'ฝ่ายเลขานุการคณะกรรมการ')
  await switchRole(page, 'committee')
  await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
  await page.getByTestId('appeal-agenda-submit').click()
  await confirmDialog(page, 'ยืนยันบรรจุวาระ', 'คณะกรรมการ ป.ป.ท. วินิจฉัย')
}

/** WIT0921/WIT0922 — เจ้าหน้าที่บันทึกหนังสือแจ้งผลอุทธรณ์ + หลักฐานการรับ */
async function officerRecordsAppealNotice(page: Page, registryNo: string, expectedText: string) {
  await switchRole(page, 'officer')
  await expect(page.getByTestId('appeal-notice-form')).toBeVisible()
  await page.getByTestId('appeal-notice-document').fill(`หนังสือแจ้งผลอุทธรณ์_${registryNo.replace('/', '-')}.pdf`)
  await page.getByTestId('appeal-notice-registry').fill(registryNo)
  await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
  await page.getByTestId('appeal-notice-submit').click()
  await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', expectedText)
}

test.describe('J07 · ไม่อนุมัติและอุทธรณ์ (07 → 09A → 09B)', () => {
  test('J07 · ไม่อนุมัติ → คบ.10 แจ้งสิทธิอุทธรณ์ → พยานอุทธรณ์ในแฟ้มเดิม → ลำดับชั้น → คณะกรรมการยืนคำสั่งเดิม', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.7', 'secretary')

    // ============================================================
    // 07 รับและบันทึกผลการพิจารณา — เลขาธิการฯ
    // ============================================================
    // WIT0701 / WIT0702 🟡 ผังให้ "รับผลพิจารณาจากโมดูลอื่น" — ต้นแบบให้เลขาธิการฯ กดบันทึกผลในแฟ้มเอง (จำลองกิจกรรมที่ 7)
    await test.step('WIT0701 / WIT0702 · เลขาธิการฯ เปิดแฟ้มรอผลพิจารณา เห็นการ์ดคำสั่งชี้ขาด', async () => {
      await page.goto(DOSSIER_URL)
      const c = await caseOf(page)
      expect(c.activity7State).not.toBe('rejected')
      await expect(page.getByTestId('reject-case-button')).toBeVisible()
    })

    await test.step('WIT0703 · ลงนามความเห็นข้อ 13 ใน คบ.6 แล้วตรวจเลขแฟ้มในโมดัล', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('reject-case-button')).toBeDisabled()
      await signKb6Section13(page)
      expect((await caseOf(page)).kb6SecretarySignedAt).toBeTruthy()
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('reject-case-button')).toBeEnabled()
    })

    await test.step('WIT0704 / WIT0706 · ◇ ผลพิจารณา = "ไม่อนุมัติ" บันทึกเลขที่คำสั่งและเหตุผล', async () => {
      await page.getByTestId('reject-case-button').click()
      const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
      await dialog.waitFor()
      // WIT0703 ช่องเลขแฟ้มของผลพิจารณา prefill เลขคำร้องไว้แล้ว
      await expect(dialog.getByTestId('decision-ref-case-no-input')).toHaveValue(CASE_NO)
      // ช่องข้อความในโมดัล: [0] เลขแฟ้ม · [1] เลขที่คำสั่ง · [2] เหตุผล
      await dialog.getByRole('textbox').nth(1).fill('ปปท. 89/2569')
      await dialog.getByRole('textbox').last().fill('ข้อเท็จจริงไม่เข้าเกณฑ์ตามระเบียบว่าด้วยการคุ้มครองพยาน')
      await page.getByTestId('decision-confirm-button').click()
      await expect(page.getByTestId('decision-review-step')).toBeVisible()
      await page.getByTestId('decision-confirm-button').click()
      await dialog.waitFor({ state: 'detached' })

      await expect.poll(async () => (await caseOf(page)).activity7State).toBe('rejected')
      const c = await caseOf(page)
      expect(c.decisionNumber).toBe('ปปท. 89/2569')
      expect(c.resultReason).toContain('ไม่เข้าเกณฑ์')
      expect(c.extraForms).toContain(10)
      // คบ.10 ลงนามพร้อมผลไม่อนุมัติ มีต้นฉบับที่เก็บไว้และยังไม่พร้อมส่ง
      expect(c.kb10Signed).toBe(true)
      expect(c.resultNotices[10].original).toBeTruthy()
      expect(c.resultNotices[10].status).toBe('signed_incomplete')
      expect(c.next).toContain('คบ.10')
      await expect(page.getByTestId('reject-case-button')).toHaveCount(0)
    })

    await test.step('WIT0711 · ไม่อนุมัติ → แฟ้มไปแท็บ 09A ให้เจ้าหน้าที่เติม คบ.10', async () => {
      await switchRole(page, 'officer')
      await page.goto(DOSSIER_URL)
      // mock state ค้างข้อความสถานะจากเส้นทางอนุมัติได้ (ดู flow-guide 09A) จึงยึด activity7State/ปุ่มของ 09A เป็นหลัก
      expect((await caseOf(page)).activity7State).toBe('rejected')
      await expect(page.getByTestId('kb10-submit-screening')).toHaveCount(0)
      await expect(page.getByTestId('kb10-screening-step')).toContainText('รอเติมรายละเอียด')
      await expect(page.getByTestId('result-notice-status')).toContainText('รอเติมรายละเอียด')
    })

    // ============================================================
    // 09A ไม่อนุมัติและแจ้งสิทธิอุทธรณ์
    // ============================================================
    // WIT0901 ⚙️ ระบบรับผลไม่อนุมัติจากแท็บ 07 (activity7State = rejected, แนบ คบ.10 ให้เอง)
    await test.step('WIT0902 · แสดงผลพิจารณา เหตุผล และเอกสารที่เกี่ยวข้อง', async () => {
      // 🟡 ผังมีแผงสรุปผลพิจารณาแยก — ต้นแบบกระจายข้อมูลอยู่ในการ์ดขั้นตอน/รายการเอกสาร
      await expect(page.getByText('ปปท. 89/2569').first()).toBeVisible()
      const formCodes = page.getByTestId('dossier-forms').getByText(/^คบ\.\d+$/)
      await expect(formCodes.filter({ hasText: /^คบ\.10$/ })).toHaveCount(1)
      await expect(formCodes.filter({ hasText: /^คบ\.(9|11)$/ })).toHaveCount(0)
    })

    await test.step('WIT0903 · เปิดแบบ คบ.10 — ข้อความแจ้งสิทธิอุทธรณ์ 30 วันถูกพิมพ์ไว้เสมอ', async () => {
      await formRow(page, 'คบ.10').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
      await expect(page).toHaveURL(/\/form\/10\?caseNo=/)
      await expect(page.locator('.paper-a4')).toContainText('ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง')
      await page.goto(DOSSIER_URL)
    })

    await test.step('WIT0903 / WIT0904 · เติมรายละเอียดเป็นรุ่นใหม่ โดยรักษาต้นฉบับและผลพิจารณา', async () => {
      const before = await caseOf(page)
      await completeNoticeDetails(page)
      const after = await caseOf(page)
      expect(after.resultNotices[10].original).toEqual(before.resultNotices[10].original)
      expect(after.kb10SignedAt).toBe(before.kb10SignedAt)
      expect(after.resultReason).toBe(before.resultReason)
    })

    await test.step('WIT0905 · ผู้รับผิดชอบตรวจฉบับครบและยืนยันพร้อมส่ง ไม่มีรอบลงนามซ้ำ', async () => {
      await checkNoticeReady(page)
      expect((await caseOf(page)).resultNotices[10].status).toBe('ready')
    })

    await test.step('WIT0906 · เจ้าหน้าที่นำส่ง คบ.10 รุ่นที่ตรวจพร้อมส่งแล้ว', async () => {
      const signed = await caseOf(page)
      expect(signed.kb10SignedAt).toBeTruthy()
      expect(signed.outgoingSignedAt).toBeTruthy()
      await expect(page.getByTestId('dossier-forms').getByText('ลงนามแล้ว').first()).toBeVisible()

      await switchRole(page, 'officer')
      await dispatchSectionOf(page).getByRole('button', { name: 'บันทึกการนำส่ง' }).click()
      await expect.poll(async () => (await caseOf(page)).dispatchedAt).toBeTruthy()
      // 🟡 ผังเก็บเลขหนังสือส่งออกจากสารบรรณเดิม — ต้นแบบเก็บช่องทาง/เลขติดตามพัสดุ
      expect(String((await caseOf(page)).dispatchChannel)).toContain('ไปรษณีย์')
    })

    const deliveredDate = isoDay(-3)
    await test.step('WIT0907 · บันทึกวันที่พยานรับจริง → เริ่มนับสิทธิอุทธรณ์ 30 วัน', async () => {
      // ผู้ยื่น/พยานไม่มีบัญชีในระบบ เจ้าหน้าที่บันทึกแทน
      const section = dispatchSectionOf(page)
      await section.locator('input[type="date"]').fill(deliveredDate)
      await fieldAfterLabel(section, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
      await section
        .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
        .locator('input[type="file"]')
        .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
      await section.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
      await expect.poll(async () => (await caseOf(page)).deliveredAt).toBeTruthy()

      const c = await caseOf(page)
      expect(new Date(c.deliveredAt).toISOString().slice(0, 10)).toBe(deliveredDate)
      // 30 วันนับจากวันที่รับจริง ไม่ใช่วันที่นำส่ง
      const days = Math.round((new Date(c.appealDueAt).getTime() - new Date(c.deliveredAt).getTime()) / 86400000)
      expect(days).toBe(30)
      await expect(page.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')).toBeVisible()
      await expect(page.getByText(/เหลือ \d+ วัน/)).toBeVisible()
    })

    await test.step('WIT0908 · ◇ ประสงค์อุทธรณ์? — ต้นแบบตัดสินจากสถานะ: อยู่ในกรอบและยังไม่มีผู้ยื่น จึงเห็นฟอร์มรับอุทธรณ์ ไม่เห็นปุ่มปิดเรื่อง', async () => {
      // 🟡 ผังเป็นจุดตัดสินใจ — ต้นแบบไม่มีปุ่มถาม แขนงเกิดจากสถานะ (ยื่นแล้วหรือยัง/พ้นกำหนดหรือยัง)
      await expect(appealIntakeSectionOf(page).getByTestId('appeal-intake-submit')).toBeVisible()
      await expect(page.getByTestId('kb10-close')).toHaveCount(0)
    })

    // ============================================================
    // 09B รับอุทธรณ์ กลั่นกรอง และเสนอคณะกรรมการ (แขนง "อุทธรณ์")
    // ============================================================
    await test.step('WIT0910 / WIT0911 / WIT0912 · พยานประสงค์อุทธรณ์ภายในกรอบ — เจ้าหน้าที่รับอุทธรณ์ (หนังสือ) เข้าแฟ้มเดิม', async () => {
      const casesBefore = await page.evaluate(
        () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
      )
      // ขาดเลขรับสารบรรณกลาง — ยื่นไม่ได้ (จอยืนยันไม่ขึ้น)
      const section = appealIntakeSectionOf(page)
      await fieldAfterLabel(section, 'เหตุผลในการอุทธรณ์').fill('มีหนังสือร้องเรียนยืนยันข้อเท็จจริงใหม่ ยื่นผ่านสารบรรณกลาง')
      await section.getByTestId('appeal-intake-channel-letter').click()
      await section.getByTestId('appeal-intake-submit').click()
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

      await officerFilesAppealByLetter(page, 'มีหนังสือร้องเรียนยืนยันข้อเท็จจริงใหม่ ยื่นผ่านสารบรรณกลาง', '512/2569')

      const c = await caseOf(page)
      expect(c.appealFolder.stage).toBe('received')
      expect(c.appealFolder.intake.channel).toBe('letter')
      expect(c.appealFolder.intake.registryNo).toBe('512/2569')
      expect(c.appealFiledAt).toBeTruthy()
      // ไม่สร้างแฟ้ม/คบ.1 ใหม่ และไม่เปลี่ยนเจ้าของเรื่องอัตโนมัติ
      const casesAfter = await page.evaluate(
        () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
      )
      expect(casesAfter).toBe(casesBefore)
      expect(c.owner).toBe(OFFICER)
      // อยู่ในกรอบ 30 วัน จึงปิดกระบวนการไม่อนุมัติไม่ได้
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('kb10-close')).toHaveCount(0)
    })

    await test.step('WIT0913 · ระบบผูกคำอุทธรณ์กับแฟ้มเดิม (ดูที่แฟ้มอุทธรณ์)', async () => {
      await page.goto(APPEAL_URL)
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await expect(page.getByTestId('appeal-folder-stage')).toContainText('รอตรวจความครบถ้วน')
    })

    await test.step('WIT0914 · ตรวจครบถ้วนและคำนวณกรอบ 30 วัน (ยื่นภายในกำหนด ไม่ต้องบันทึกเหตุผลล่าช้า)', async () => {
      await expect(page.getByTestId('appeal-late-reason')).toHaveCount(0)
      await page.getByTestId('appeal-check-submit').click()
      await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน', 'ยื่นภายในกรอบกำหนด')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.stage).toBe('officer_opinion')
      expect(folder.lateDays).toBe(0)
    })

    // WIT0915 🟡 ผังให้ผู้บังคับบัญชาชั้นต้น — ต้นแบบให้เจ้าหน้าที่ผู้รับผิดชอบบันทึกความเห็น (แก้ข้อความคำอุทธรณ์ไม่ได้)
    await test.step('WIT0915 · เจ้าหน้าที่ตรวจข้อเท็จจริง/เอกสาร บันทึกความเห็น (ข้อความคำอุทธรณ์แก้ไม่ได้) เสนอ ผบช.ชั้นต้น', async () => {
      const reasonBlock = page.getByText('เหตุผลที่ขออุทธรณ์:').locator('xpath=following-sibling::p[1]')
      await expect(reasonBlock.locator('textarea, input')).toHaveCount(0)
      await giveOpinion(page, null, 'ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น', 'ผบช.ชั้นต้น')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.officerOpinion.note).toContain('เห็นควรเสนอ')
      expect(folder.stage).toBe('supervisor')
    })

    // WIT0916 🟡 ผังให้ ผอ.สำนัก/กอง ลงนามเสนอ — ต้นแบบมีทั้งชั้น ผบช.ชั้นต้นและชั้น ผอ.สำนัก/กอง ตามลำดับ
    await test.step('WIT0916 · ผบช.ชั้นต้นและ ผอ.สำนัก/กอง ตรวจความครบถ้วน ให้ความเห็น และลงนามเสนอตามลำดับ', async () => {
      await giveOpinion(page, 'supervisor', 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ ผอ.สำนัก/กอง', 'ผอ.สำนัก/กอง')
      await giveOpinion(page, 'director', 'ตรวจแล้ว ลงนามเสนอรองเลขาธิการฯ', 'รองเลขาธิการฯ')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.supervisorOpinion.note).toContain('ผอ.สำนัก/กอง')
      expect(folder.directorOpinion.note).toContain('รองเลขาธิการฯ')
    })

    await test.step('WIT0917 · รองเลขาธิการฯ กลั่นกรองแฟ้มอุทธรณ์และให้ความเห็นประกอบ', async () => {
      await giveOpinion(page, 'deputy_secretary', 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบ', 'ผ่านการกลั่นกรองแล้ว')
      expect((await caseOf(page)).appealFolder.deputyOpinion.by).toBe(DEPUTY)
    })

    await test.step('WIT0918 · เลขาธิการฯ รับทราบ ให้ความเห็นประกอบ และส่งเสนอคณะกรรมการ (ไม่ใช่ผู้วินิจฉัย)', async () => {
      await switchRole(page, 'secretary')
      await expect(page.getByTestId('appeal-opinion-secretary')).toContainText('ไม่ใช่ผู้วินิจฉัยอุทธรณ์')
      // เลขาธิการฯ ไม่มีปุ่มวินิจฉัยเลย
      await expect(page.getByTestId('appeal-resolution-uphold')).toHaveCount(0)
      await expect(page.getByTestId('appeal-resolution-overturn')).toHaveCount(0)
      await giveOpinion(page, null, 'รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย', 'ฝ่ายเลขานุการคณะกรรมการ')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.stage).toBe('agenda')
      expect(folder.secretaryOpinion.by).toBe(SECRETARY)
    })

    // WIT0919 🟡 ผังมีประธานเป็นผู้บรรจุวาระ — ต้นแบบให้ฝ่ายเลขานุการ (role committee) กดแทน
    await test.step('WIT0919 · ฝ่ายเลขานุการบรรจุระเบียบวาระเสนอคณะกรรมการ', async () => {
      await switchRole(page, 'committee')
      await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
      await page.getByTestId('appeal-agenda-submit').click()
      await confirmDialog(page, 'ยืนยันบรรจุวาระ', 'คณะกรรมการ ป.ป.ท. วินิจฉัย')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.stage).toBe('agenda')
      expect(folder.agendaNo).toContain('9/2569')
    })

    await test.step('WIT0920 · ◇ คณะกรรมการวินิจฉัย: ยืนคำสั่งเดิม (ยกเลิกในจอยืนยันก่อน แล้วยืนยันจริง)', async () => {
      await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
      await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม')
      await page.getByTestId('appeal-resolution-uphold').click()
      await cancelDialog(page)
      expect((await caseOf(page)).appealResolution).toBeFalsy()

      await page.getByTestId('appeal-resolution-uphold').click()
      await confirmDialog(page, 'ยืนยันมติยืนคำสั่งเดิม', 'เป็นที่สุด')
      const c = await caseOf(page)
      expect(c.appealResolution.outcome).toBe('uphold')
      expect(c.appealFolder.stage).toBe('resolved')
      // บันทึกมติอย่างเดียวไม่พอ ยังไม่มีร่องรอยว่าแจ้งผลถึงพยาน
      expect(c.appealResolution.noticeRecordedAt).toBeFalsy()
    })

    await test.step('WIT0921 · ยืนคำสั่งเดิม — เจ้าหน้าที่ทำหนังสือแจ้งผลอุทธรณ์ เก็บหลักฐานรับ และปิดขั้นอุทธรณ์', async () => {
      await switchRole(page, 'officer')
      await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_สมชาย.pdf')
      // ขาดเลขทะเบียนส่ง — จอยืนยันต้องไม่ขึ้น
      await page.getByTestId('appeal-notice-submit').click()
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
      await page.getByTestId('appeal-notice-registry').fill('ปปท 0007/4412')
      await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
      await page.getByTestId('appeal-notice-submit').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', 'ปิดขั้นอุทธรณ์')

      const notice = (await caseOf(page)).appealResolution
      expect(notice.noticeRegistryNo).toBe('ปปท 0007/4412')
      expect(notice.noticeRecordedBy).toBe(OFFICER)
      expect(notice.noticeAckDocument).toContain('EMS')
      await expect(page.getByTestId('appeal-notice-done')).toContainText('แจ้งผลอุทธรณ์ให้พยานแล้ว')
      await expect(page.getByTestId('appeal-notice-form')).toHaveCount(0)
      // ยืนคำสั่งเดิม = ไม่อนุมัติต่อไป ไม่กลับเข้า 08A
      expect((await caseOf(page)).activity7State).not.toBe('approved')
    })
  })

  test('J07-a · [ทางแยก] ผู้ยื่นอุทธรณ์ คณะกรรมการเปลี่ยนคำสั่ง → แจ้งผลแล้วกลับ 08A โดยไม่สร้าง คบ.1 ใหม่', async ({ page }) => {
    test.setTimeout(240_000)
    // เริ่มจาก คบ.10 ลงนามพร้อมผลแล้ว แต่ยังเติมรายละเอียดไม่ครบ
    await seedMockState(page, 'Notice 3', 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0903-WIT0907 · เติม คบ.10 ตรวจพร้อมส่ง นำส่ง และพยานรับ', async () => {
      await completeNoticeDetails(page)
      await checkNoticeReady(page)
      await officerDispatchesAndRecordsDelivery(page, isoDay(-3))
    })

    await test.step('WIT0910 / WIT0911 · พยานอุทธรณ์ภายในกรอบ — รับเข้าแฟ้มเดิม', async () => {
      await officerFilesAppealByLetter(page, 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา', '513/2569')
      expect((await caseOf(page)).appealFolder.stage).toBe('received')
      await page.goto(APPEAL_URL)
    })

    await test.step('WIT0914-WIT0919 · ตรวจครบถ้วน → ลำดับชั้น → บรรจุวาระ', async () => {
      await walkAppealHierarchyToAgenda(page)
      expect((await caseOf(page)).appealFolder.stage).toBe('agenda')
    })

    const casesBefore = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    await test.step('WIT0920 · ◇ คณะกรรมการมติ "เปลี่ยนแปลงคำสั่ง"', async () => {
      await page.getByTestId('appeal-resolution-no').fill('มติที่ 56/2569')
      await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่รับฟังได้ ให้เปลี่ยนแปลงคำสั่งเดิม')
      await page.getByTestId('appeal-resolution-overturn').click()
      await confirmDialog(page, 'ยืนยันมติเปลี่ยนแปลงคำสั่ง', 'ไม่สร้าง คบ.1 ใหม่')
      expect((await caseOf(page)).appealResolution.outcome).toBe('overturn')
    })

    await test.step('WIT0922 · เปลี่ยนคำสั่ง → กลับ 08A (ไม่สร้าง คบ.1 ใหม่) และแจ้งผลอุทธรณ์ให้พยาน', async () => {
      await expectStage(page, 'method_operation')
      const casesAfter = await page.evaluate(
        () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
      )
      expect(casesAfter).toBe(casesBefore)

      await officerRecordsAppealNotice(page, 'ปปท 0007/4413', 'แยกแนวทางที่หน้าดำเนินการตามวิธีคุ้มครอง')
      const notice = (await caseOf(page)).appealResolution
      expect(notice.noticeRegistryNo).toBe('ปปท 0007/4413')
      expect(notice.noticeRecordedAt).toBeTruthy()
    })
  })

  test('J07-b · [ทางแยก] พยานไม่อุทธรณ์ — พ้นกรอบ 30 วันแล้วเจ้าหน้าที่ปิดกระบวนการไม่อนุมัติ', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Notice 3', 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0903-WIT0906 · เติม คบ.10 และตรวจพร้อมส่ง ไม่มีรอบลงนามซ้ำ', async () => {
      await completeNoticeDetails(page)
      await checkNoticeReady(page)
    })

    await test.step('WIT0907 · พยานรับ คบ.10 เมื่อ 45 วันก่อน (นับ 30 วันจากวันรับจริง จึงพ้นกรอบแล้ว)', async () => {
      await officerDispatchesAndRecordsDelivery(page, isoDay(-45))
      const c = await caseOf(page)
      expect(new Date(c.appealDueAt).getTime()).toBeLessThan(Date.now())
    })

    await test.step('WIT0908 · ◇ ประสงค์อุทธรณ์? — ไม่มีผู้ยื่นและพ้นกำหนด จึงเห็นปุ่มปิดเรื่องแทนฟอร์มรับอุทธรณ์', async () => {
      await expect(page.getByTestId('kb10-close')).toBeVisible()
      expect((await caseOf(page)).appealFolder).toBeFalsy()
    })

    await test.step('WIT0909 · ไม่อุทธรณ์ — บันทึกการปิดเรื่องและสิ้นสุดกระบวนการไม่อนุมัติ', async () => {
      // ไม่กรอกบันทึกปิดเรื่อง — จอยืนยันไม่ขึ้น
      await page.getByTestId('kb10-close-submit').click()
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
      await page.getByTestId('kb10-close-note').fill('ตรวจสอบแล้วไม่มีคำอุทธรณ์เข้าระบบภายในกำหนด')
      await page.getByTestId('kb10-close-submit').click()
      await cancelDialog(page)
      expect((await caseOf(page)).nonApprovalClosedAt).toBeFalsy()
      await page.getByTestId('kb10-close-submit').click()
      await confirmDialog(page, 'ยืนยันปิดเรื่อง', 'ปิดอย่างเป็นทางการ')

      const c = await caseOf(page)
      expect(c.nonApprovalClosedAt).toBeTruthy()
      expect(c.nonApprovalClosedBy).toBe(OFFICER)
      expect(c.closedAt).toBeTruthy()
      expect(String(c.status)).toContain('ปิดเรื่อง')
      await expect(page.getByTestId('kb10-closed')).toBeVisible()
      await expect(page.getByTestId('kb10-close')).toHaveCount(0)
    })
  })

  test('J07-c · คบ.10 เติมสองรุ่น ตรวจประวัติและรีเฟรช โดยไม่มีรอบลงนามซ้ำ', async ({ page }) => {
    await seedMockState(page, 'Notice 3', 'officer')
    await page.goto(DOSSIER_URL)
    const before = await caseOf(page)
    await page.getByTestId('notice-detail-เลขที่หนังสือ').fill('05')
    await page.getByTestId('notice-save-details').click()
    await expect(page.getByTestId('result-notice-status')).toContainText('รอเติมรายละเอียด')
    await completeNoticeDetails(page)
    const completed = await caseOf(page)
    expect(completed.resultNotices[10].versions).toHaveLength(3)
    expect(completed.resultNotices[10].audit).toHaveLength(2)
    expect(completed.resultNotices[10].original).toEqual(before.resultNotices[10].original)
    expect(completed.resultReason).toBe(before.resultReason)
    expect(completed.kb10SignedAt).toBe(before.kb10SignedAt)
    await page.reload()
    expect((await caseOf(page)).resultNotices[10].versions).toHaveLength(3)
    await page.getByTestId('notice-audit-history').locator('summary').click()
    await expect(page.getByTestId('notice-audit-history')).toContainText('รุ่น 2')
    await expect(page.getByTestId('notice-audit-history')).toContainText('รุ่น 3')
    await switchRole(page, 'secretary')
    await expect(page.getByTestId('kb10-submit-screening')).toHaveCount(0)
    await expect(page.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' })).toHaveCount(0)
    await expect(page.getByTestId('notice-save-details')).toHaveCount(0)
    await switchRole(page, 'officer')
    await checkNoticeReady(page)
  })
})
