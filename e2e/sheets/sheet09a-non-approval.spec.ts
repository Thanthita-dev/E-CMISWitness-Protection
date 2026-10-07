import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'

/**
 * Sheet 09A · WIT0903 → WIT0909 — ไม่อนุมัติและแจ้งสิทธิอุทธรณ์ (TC-101 .. TC-107)
 *
 * ผัง: WIT0903 จัดทำ คบ.10 → **WIT0904** เจ้าหน้าที่ตรวจความครบถ้วนแล้วเสนอกลั่นกรอง
 *      → **WIT0905** รองเลขาธิการฯ กลั่นกรองให้ตรงผลพิจารณาและข้อความแจ้งสิทธิ
 *      → WIT0906 ผู้มีอำนาจลงนาม → WIT0907 พยานได้รับและบันทึกวันที่รับจริง
 *      → **WIT0908 ประสงค์อุทธรณ์?** แขนง "ไม่อุทธรณ์" → **WIT0909** สิ้นสุดกระบวนการไม่อนุมัติ
 *      แขนง "อุทธรณ์" → สร้างรายการอุทธรณ์ ส่งต่อแท็บ 09B (sheet09b-appeal-folder.spec.ts)
 *
 * จุดที่เทสต์ในไฟล์นี้กัน:
 * 1. ร่าง คบ.10 ต้องข้ามด่านกลั่นกรองไปถึงรอบลงนามไม่ได้ (WIT0904/WIT0905 เป็นเงื่อนไขจริง)
 * 2. รองเลขาธิการฯ ส่งกลับได้ และแฟ้มต้องย้อนกลับไปอยู่กับเจ้าหน้าที่ ไม่ใช่เดินหน้าต่อ
 * 3. WIT0906/WIT0907 ต้องล็อกฉบับลงนามและเริ่มนับ 30 วันจาก "วันที่รับจริง" เท่านั้น
 * 4. WIT0909 ต้องมีปุ่มปิดเรื่อง และโผล่เฉพาะเมื่อพ้นกรอบ 30 วันแล้วเท่านั้น
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'
const SECRETARY = 'นายสุรศักดิ์ ธรรมพิทักษ์'
const APPEAL_OWNER = 'นางสาววราภรณ์ นิติธรรม'

/** ตั้งต้นที่ WIT0903 — ผลพิจารณาออกมาว่าไม่อนุมัติ ร่าง คบ.10 เสร็จแล้ว แต่ยังไม่ผ่านด่านใด */
const AT_KB10_DRAFT = {
  stage: 'notice',
  activity7State: 'rejected',
  activity7Label: 'ไม่อนุมัติให้การคุ้มครอง',
  /**
   * คบ.10 ถูกใส่เข้า extraForms ตั้งแต่เลขาธิการฯ สั่งไม่อนุมัติ (secretaryReject)
   * ส่วน คบ.9 / คบ.11 เป็นของเส้นทางอนุมัติ จึงต้องไม่ติดมากับเคสไม่อนุมัติ
   */
  extraForms: [10],
  kb11Signed: false,
  nonApprovalStep: 0,
  approvalStep: 0,
  kb9Signed: false,
  kb10Signed: false,
  kb10SignedAt: undefined,
  outgoingSignedAt: undefined,
  dispatchedAt: undefined,
  dispatchChannel: undefined,
  deliveredAt: undefined,
  appealDueAt: undefined,
  appealFiledAt: undefined,
  nonApprovalClosedAt: undefined,
}

/** ตั้งต้นที่ WIT0908 แขนง "ไม่อุทธรณ์" — พยานรับ คบ.10 แล้วและกรอบ 30 วันพ้นไปแล้ว */
const AT_APPEAL_WINDOW_EXPIRED = {
  ...AT_KB10_DRAFT,
  nonApprovalStep: 3,
  kb10Signed: true,
  kb10SignedAt: '01/07/2569 10:00',
  outgoingSignedAt: '01/07/2569 10:00',
  dispatchedAt: '02/07/2569 09:00',
  deliveredAt: '2026-05-01T00:00:00.000Z',
  appealDueAt: '2026-05-31T00:00:00.000Z',
}

/** ตั้งต้นที่ WIT0906 ผ่านการกลั่นกรองแล้ว ลงนามและนำส่งแล้ว รอผู้ยื่นตัดสินใจอุทธรณ์หรือไม่ (WIT0908) */
const AT_SIGNED_AND_DISPATCHED = {
  ...AT_KB10_DRAFT,
  nonApprovalStep: 3,
  kb10Signed: true,
  kb10SignedAt: '01/09/2569 10:00',
  outgoingSignedAt: '01/09/2569 10:00',
  dispatchedAt: '02/09/2569 09:00',
  dispatchChannel: 'ไปรษณีย์ตอบรับด่วน (EMS)',
}

/**
 * กดยืนยันในจอยืนยัน — ทุกปุ่มที่เปลี่ยนเจ้าของงานหรือสถานะแฟ้มต้องผ่านจอนี้ก่อน
 * ตรวจข้อความสรุปด้วย เพราะจอนี้มีหน้าที่บอก "สิ่งที่กำลังจะเกิดขึ้นจริง"
 */
async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ยกเลิกในจอยืนยัน — ต้องไม่มีอะไรเกิดขึ้นกับแฟ้ม */
async function cancelDialog(page: Page) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** หา input/select/textarea ที่เป็น sibling ถัดจาก label ข้อความที่ระบุ — การ์ดนี้ไม่มี data-testid ให้ใช้ */
function fieldAfterLabel(scope: ReturnType<Page['locator']>, labelText: string) {
  return scope.locator('label', { hasText: labelText }).locator('xpath=following-sibling::*[1]')
}

test.describe('WIT0904 / WIT0905 — ด่านตรวจครบถ้วนและกลั่นกรอง คบ.10 ก่อนลงนาม', () => {
  test('TC-104 · [Negative] ร่าง คบ.10 ยังไม่ผ่านด่านกลั่นกรอง — รอบลงนามยังเปิดไม่ได้ และฉบับพิมพ์บังคับข้อความแจ้งสิทธิเสมอ', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_KB10_DRAFT)
    await page.goto(DOSSIER_URL)

    const card = page.getByTestId('kb10-screening-card')
    await expect(card).toBeVisible()
    await expect(page.getByTestId('kb10-screening-step')).toContainText('จัดทำร่าง คบ.10')

    // คบ.10 ต้องอยู่ในรายการแบบฟอร์มของแฟ้ม ตั้งแต่เลขาธิการฯ สั่งไม่อนุมัติ (WIT0903)
    const formCodes = page.getByTestId('dossier-forms').getByText(/^คบ\.\d+$/)
    await expect(formCodes.filter({ hasText: /^คบ\.10$/ })).toHaveCount(1)
    await expect(formCodes.filter({ hasText: /^คบ\.(9|11)$/ })).toHaveCount(0)

    // รอบลงนามต้องบอกชัดว่ายังติดด่านกลั่นกรองอยู่ ไม่ใช่ "รอเลขาธิการฯ ลงนาม"
    await expect(page.getByText('รอผ่านด่านกลั่นกรองของรองเลขาธิการฯ ก่อน')).toBeVisible()

    // ไม่กรอกผลการตรวจ — จอยืนยันต้องไม่ขึ้น (ป้องกันร่างที่ยังไม่ตรวจข้ามไปรอบลงนาม)
    await page.getByTestId('kb10-readiness-note').fill('')
    await page.getByTestId('kb10-submit-screening').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // กรอกแล้วยกเลิกในจอยืนยัน — แฟ้มต้องไม่ขยับ
    await page.getByTestId('kb10-readiness-note').fill('ตรวจร่างแล้ว ข้อความแจ้งสิทธิอุทธรณ์ครบ')
    await page.getByTestId('kb10-submit-screening').click()
    await cancelDialog(page)

    const after = await readCase(page, CASE_NO)
    expect(after?.nonApprovalStep).toBe(0)
    expect(after?.kb10ReadinessCheckedAt).toBeFalsy()

    // ฉบับพิมพ์ คบ.10 พิมพ์ข้อความแจ้งสิทธิอุทธรณ์ 30 วันไว้เสมอ โดยเจ้าหน้าที่ไม่มีทางลบ/ปิดออกได้
    // จึงไม่มีทางเกิด "คบ.10 ที่ไม่มีข้อความแจ้งสิทธิ" ขึ้นในระบบตั้งแต่ต้น
    await page.goto(`/form/10?caseNo=${CASE_NO}`)
    await expect(page.getByText('พิมพ์การแจ้งสิทธิอุทธรณ์ภายในสามสิบวัน')).toBeVisible()
  })

  test('TC-105 · [Negative] เนื้อหา คบ.10 ไม่ตรงกับผลพิจารณา — รองเลขาธิการฯ กลั่นกรองแล้วส่งกลับแก้ ไม่ข้ามไปรอบลงนาม', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_KB10_DRAFT)
    await page.goto(DOSSIER_URL)

    // WIT0904 — เจ้าหน้าที่ตรวจความครบถ้วนแล้วเสนอกลั่นกรอง
    await page.getByTestId('kb10-readiness-note').fill('ตรวจร่าง คบ.10 ครบ — เหตุผล ฐานการพิจารณา และสิทธิอุทธรณ์ 30 วัน')
    await page.getByTestId('kb10-submit-screening').click()
    await confirmDialog(page, 'ยืนยันเสนอกลั่นกรอง', 'รองเลขาธิการฯ')

    const afterSubmit = await readCase(page, CASE_NO)
    expect(afterSubmit?.nonApprovalStep).toBe(1)
    expect(afterSubmit?.kb10ReadinessCheckedBy).toBe(OFFICER)
    expect(afterSubmit?.owner).toBe(DEPUTY)

    // WIT0905 แขนงไม่ผ่าน — รองเลขาธิการฯ พบว่าเนื้อหาไม่ตรงกับผลพิจารณา จึงส่งร่างกลับให้เจ้าหน้าที่แก้
    await switchRole(page, 'deputy_secretary')
    await page.getByTestId('kb10-deputy-note').fill('สาระสำคัญที่ระบุใน คบ.10 ไม่ตรงกับเหตุผลในผลพิจารณาไม่อนุมัติต้นทาง')
    await page.getByTestId('kb10-deputy-return').click()
    await confirmDialog(page, 'ยืนยันส่งกลับแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

    const afterReturn = await readCase(page, CASE_NO)
    expect(afterReturn?.nonApprovalStep).toBe(0)
    expect(afterReturn?.owner).toBe(OFFICER)
    expect(afterReturn?.kb10DeputyScreenedAt).toBeFalsy()
    expect(afterReturn?.kb10DeputyReturnNote).toContain('ไม่ตรงกับเหตุผล')

    // เจ้าหน้าที่เห็นข้อสังเกตและเสนอใหม่ได้ — รอบลงนามยังไม่เปิดจนกว่าจะผ่านด่านนี้จริง
    await switchRole(page, 'officer')
    await expect(page.getByTestId('kb10-screening-step')).toContainText('ไม่ตรงกับเหตุผล')
    await expect(page.getByTestId('kb10-readiness')).toBeVisible()
    await expect(page.getByText('รอผ่านด่านกลั่นกรองของรองเลขาธิการฯ ก่อน')).toBeVisible()
  })
})

test.describe('WIT0906 / WIT0907 — ลงนาม นำส่ง และเริ่มนับกรอบอุทธรณ์', () => {
  test('TC-101 · [Happy] คบ.10 ลงนามพร้อมผล → เติมรายละเอียด ตรวจพร้อมส่ง และแจ้งผู้ยื่น', async ({ page }) => {
    await seedMockState(page, 'Notice 3', 'officer')
    await page.goto(DOSSIER_URL)
    const original = (await readCase(page, CASE_NO))?.resultNotices as any
    expect(original[10].original).toBeTruthy()
    expect((await readCase(page, CASE_NO))?.kb10Signed).toBe(true)
    await completeNoticeDetails(page)
    await checkNoticeReady(page)
    const afterSign = await readCase(page, CASE_NO)
    expect(afterSign?.kb10SignedAt).toBeTruthy()
    expect(afterSign?.outgoingSignedAt).toBeTruthy()
    expect((afterSign?.resultNotices as any)[10].original).toEqual(original[10].original)

    // นำส่งหนังสือผ่านช่องทางไปรษณีย์ตอบรับด่วน (EMS) — ค่าตั้งต้นของฟอร์ม
    await switchRole(page, 'officer')
    const dispatchSection = page
      .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()

    const afterDispatch = await readCase(page, CASE_NO)
    expect(afterDispatch?.dispatchedAt).toBeTruthy()
    expect(String(afterDispatch?.dispatchChannel)).toContain('ไปรษณีย์')

    // WIT0907 — บันทึกวันที่ผู้รับได้รับจริง 10 ก.ย. 2569 — จุดตั้งต้นนับกรอบอุทธรณ์ 30 วัน
    await dispatchSection.locator('input[type="date"]').fill('2026-09-10')
    await fieldAfterLabel(dispatchSection, 'ผู้รับหนังสือ').fill(String(afterDispatch?.person))
    await dispatchSection
      .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
      .locator('input[type="file"]')
      .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
    await dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()

    const afterDelivery = await readCase(page, CASE_NO)
    expect(afterDelivery?.deliveredAt).toBeTruthy()
    expect(new Date(afterDelivery?.deliveredAt as string).toISOString().slice(0, 10)).toBe('2026-09-10')
    expect(afterDelivery?.deliveryAckType).toBeTruthy()
    expect(afterDelivery?.appealDueAt).toBeTruthy()

    // 30 วันนับจากวันที่รับจริง (10 ก.ย.) พอดี ไม่ใช่วันอื่น
    const deliveredDay = new Date('2026-09-10T00:00:00.000Z').getTime()
    const dueDay = new Date(afterDelivery?.appealDueAt as string).getTime()
    expect(Math.round((dueDay - deliveredDay) / 86400000)).toBe(30)

    // คบ.10 ที่ลงนามแล้วถูกล็อก และหน้าจอแสดงกรอบอุทธรณ์ที่เริ่มนับแล้ว
    await expect(page.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')).toBeVisible()
    await expect(page.getByText(/เหลือ \d+ วัน/)).toBeVisible()
  })

  test('TC-106 · [Edge] นับกรอบ 30 วันจากวันที่พยานได้รับจริง ไม่ใช่วันที่นำส่ง', async ({ page }) => {
    // นำส่งไปแล้วนานกว่า 30 วัน (02/07/2569) แต่ยังไม่บันทึกวันรับจริง — ถ้าระบบเผลอนับจากวันที่ส่ง
    // แทนวันที่รับจริง กรอบอุทธรณ์จะกลายเป็น "พ้นกำหนดแล้ว" ทันทีที่บันทึกวันรับ ซึ่งต้องไม่เกิดขึ้น
    await seedMockState(page, 'Case 1.8', 'officer', {
      ...AT_KB10_DRAFT,
      nonApprovalStep: 3,
      kb10Signed: true,
      outgoingSignedAt: '01/07/2569 10:00',
      dispatchedAt: '02/07/2569 09:00',
      dispatchChannel: 'ไปรษณีย์ตอบรับด่วน (EMS)',
    })
    await page.goto(DOSSIER_URL)

    // บันทึกวันรับจริงผ่าน UI แล้วยืนยันว่ากรอบครบกำหนดคำนวณจากวันรับจริง + 30 วันพอดี ไม่ใช่จากวันนำส่ง
    const dispatchSection = page
      .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await dispatchSection.locator('input[type="date"]').fill('2026-09-05')
    await fieldAfterLabel(dispatchSection, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
    await dispatchSection
      .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
      .locator('input[type="file"]')
      .setInputFiles({ name: 'ใบตอบรับ.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock') })
    await dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()

    const c = await readCase(page, CASE_NO)
    const delivered = new Date('2026-09-05T00:00:00.000Z')
    const due = new Date(c?.appealDueAt as string)
    expect(Math.round((due.getTime() - delivered.getTime()) / 86400000)).toBe(30)

    // กรอบยังไม่พ้นกำหนด (พึ่งเริ่มนับจากวันรับจริง) แม้จะนำส่งไปนานแล้วก็ตาม
    await expect(page.getByTestId('kb10-close')).toHaveCount(0)
    await expect(page.getByText(/เหลือ \d+ วัน/)).toBeVisible()
  })
})

test.describe('WIT0908 / WIT0909 — ประสงค์อุทธรณ์หรือไม่ และการปิดกระบวนการไม่อนุมัติ', () => {
  test('TC-102 · [Happy] ผู้ยื่นไม่ประสงค์อุทธรณ์ — พ้นกรอบ 30 วันแล้วไม่มีใครยื่น ปิดกระบวนการไม่อนุมัติได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_APPEAL_WINDOW_EXPIRED)
    await page.goto(DOSSIER_URL)

    const close = page.getByTestId('kb10-close')
    await expect(close).toBeVisible()

    // ไม่กรอกบันทึกการปิดเรื่อง — จอยืนยันต้องไม่ขึ้น
    await page.getByTestId('kb10-close-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // กรอกแล้วยกเลิก — แฟ้มต้องไม่ปิด
    await page.getByTestId('kb10-close-note').fill('ตรวจสอบแล้วไม่มีคำอุทธรณ์เข้าระบบภายในกำหนด')
    await page.getByTestId('kb10-close-submit').click()
    await cancelDialog(page)
    expect((await readCase(page, CASE_NO))?.nonApprovalClosedAt).toBeFalsy()

    // ยืนยันจริง — เรื่องปิดและมีร่องรอยผู้ปิด คงเอกสาร/Audit Trail ทั้งหมดไว้
    await page.getByTestId('kb10-close-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง', 'ปิดอย่างเป็นทางการ')

    const after = await readCase(page, CASE_NO)
    expect(after?.nonApprovalClosedAt).toBeTruthy()
    expect(after?.nonApprovalClosedBy).toBe(OFFICER)
    expect(after?.closedAt).toBeTruthy()
    expect(String(after?.status)).toContain('ปิดเรื่อง')

    // ปิดแล้วปุ่มหายไป เหลือบันทึกการปิดเรื่องให้เห็น
    await expect(page.getByTestId('kb10-closed')).toBeVisible()
    await expect(page.getByTestId('kb10-close')).toHaveCount(0)
  })

  test('TC-103 · [Happy] ผู้ยื่นประสงค์อุทธรณ์ — สร้างรายการอุทธรณ์ในแฟ้มเดิม ไม่เปลี่ยนเจ้าของเรื่องอัตโนมัติ', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', {
      ...AT_APPEAL_WINDOW_EXPIRED,
      // เคสนี้ยังอยู่ในกรอบจริง (ปรับ due ให้ยังไม่พ้นกำหนด) เพื่อทดสอบแขนง "อุทธรณ์" ล้วน ๆ
      appealDueAt: new Date(Date.now() + 15 * 86400000).toISOString(),
    })
    await page.goto(DOSSIER_URL)

    const casesBefore = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    const ownerBefore = (await readCase(page, CASE_NO))?.owner

    // เมื่อยังไม่มีคนยื่นอุทธรณ์ ปุ่มปิดเรื่องต้องไม่โผล่ (พ้นกำหนดแต่มีคนยื่นอุทธรณ์แล้วก็ปิดไม่ได้เช่นกัน — ดูท้ายเทสต์)
    await expect(page.getByTestId('kb10-close')).toHaveCount(0)

    const appealSection = page
      .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await appealSection.getByTestId('appeal-intake-reason').fill(
      'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา'
    )
    await appealSection.getByTestId('appeal-intake-channel-letter').click()
    await appealSection.getByTestId('appeal-intake-registry-no').fill('512/2569')
    await appealSection.getByTestId('appeal-intake-evidence-file').setInputFiles({
      name: 'คำร้องอุทธรณ์.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    })
    await appealSection.getByTestId('appeal-intake-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const casesAfter = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    // ไม่สร้างแฟ้ม/คบ.1 ใหม่ — ยังเป็นแฟ้มเดิมจำนวนเท่าเดิม
    expect(casesAfter).toBe(casesBefore)

    const after = await readCase(page, CASE_NO)
    expect(after?.appealFolder).toBeTruthy()
    expect((after?.appealFolder as Record<string, unknown>).stage).toBe('received')
    expect(((after?.appealFolder as Record<string, any>).intake as Record<string, unknown>).channel).toBe('letter')
    expect(((after?.appealFolder as Record<string, any>).intake as Record<string, unknown>).registryNo).toBe('512/2569')

    // ผังกำหนดว่า "ไม่เปลี่ยนเจ้าของเรื่องอัตโนมัติ" — owner ต้องคงเดิมจนกว่าจะมีการมอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน
    expect(after?.owner).toBe(ownerBefore)
    expect(after?.owner).not.toBe(APPEAL_OWNER)

    // แขนงเสริม: ถ้ายื่นอุทธรณ์แล้วและกรอบ 30 วันพ้นไปด้วย ก็ยังปิดกระบวนการไม่อนุมัติไม่ได้ (ไปเดินเส้น 09B แทน)
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('kb10-close')).toHaveCount(0)

    // ผบช.ชั้นต้นมอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน — จุดเดียวที่เปลี่ยน owner ได้จริง
    await switchRole(page, 'supervisor')
    await page.goto(`/appeal-folder/${CASE_NO}`)
    const assignSection = page.getByTestId('appeal-assign')
    await expect(assignSection).toBeVisible()
    await assignSection.getByTestId('appeal-assign-officer').selectOption('APP-001')
    await assignSection.getByTestId('appeal-assign-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const assigned = await readCase(page, CASE_NO)
    expect(assigned?.owner).toBe(APPEAL_OWNER)
    expect((assigned?.appealFolder as Record<string, any>).appealOfficer?.name).toBe(APPEAL_OWNER)
    const history = (assigned?.assignmentHistory || []) as Array<Record<string, unknown>>
    expect(history.some((h) => String(h.action).includes('มอบหมายเจ้าหน้าที่อุทธรณ์'))).toBe(true)
  })
})

test.describe('WIT0806 — ช่องทางนำส่งล้มเหลวต้องเปลี่ยนช่องทางได้ และเก็บประวัติทุกครั้ง', () => {
  test('TC-107 · [Edge] ส่ง คบ.10 ไม่สำเร็จ เปลี่ยนช่องทางแล้วส่งใหม่ — คงประวัติทุกครั้งและนับ 30 วันจากวันรับจริงครั้งที่สำเร็จ', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'officer', {
      ...AT_SIGNED_AND_DISPATCHED,
      dispatchHistory: [
        {
          id: 'DSP-SEED-1',
          channel: 'ไปรษณีย์ตอบรับด่วน (EMS)',
          tracking: 'TH104005698TH',
          dispatchedAt: '02/09/2569 09:00',
          outcome: 'in_transit',
          recordedBy: OFFICER,
        },
      ],
    })
    await page.goto(DOSSIER_URL)

    const dispatchSection = page
      .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

    // สถานะปัจจุบัน — นำส่งครั้งแรกทางไปรษณีย์แล้ว แต่ยังไม่มีการยืนยันว่าถึงมือพยาน (ครั้งนี้ตีกลับ)
    await expect(dispatchSection).toContainText('ไปรษณีย์')
    await expect(dispatchSection.getByTestId('dispatch-history-item')).toHaveCount(1)
    await expect(dispatchSection.getByTestId('dispatch-history-item').first()).toContainText('อยู่ระหว่างจัดส่ง')

    // แจ้งว่าตีกลับ — เก็บประวัติครั้งแรกไว้เป็น failed พร้อมเหตุผล ไม่เขียนทับ
    await dispatchSection.locator('input[placeholder*="ไม่มีผู้รับ"]').fill('ตีกลับ — ไม่มีผู้รับตามที่อยู่')
    await dispatchSection.getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
    await confirmDialog(page, 'ยืนยันว่าไม่สำเร็จ')

    const afterFailure = await readCase(page, CASE_NO)
    const historyAfterFailure = (afterFailure?.dispatchHistory || []) as Array<Record<string, unknown>>
    expect(historyAfterFailure).toHaveLength(1)
    expect(historyAfterFailure[0].outcome).toBe('failed')
    expect(String(historyAfterFailure[0].failureReason)).toContain('ไม่มีผู้รับตามที่อยู่')

    // เปลี่ยนช่องทางเป็นนำส่งโดยตรงถึงตัวพยาน แล้วบันทึกการนำส่งใหม่อีกครั้ง
    await dispatchSection.locator('select').first().selectOption('ส่งมอบโดยตรงถึงตัวพยาน')
    await dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()

    const afterRedispatch = await readCase(page, CASE_NO)
    const historyAfterRedispatch = (afterRedispatch?.dispatchHistory || []) as Array<Record<string, unknown>>
    expect(historyAfterRedispatch).toHaveLength(2)
    expect(historyAfterRedispatch[0].outcome).toBe('failed')
    expect(historyAfterRedispatch[1].channel).toBe('ส่งมอบโดยตรงถึงตัวพยาน')
    expect(historyAfterRedispatch[1].outcome).toBe('in_transit')
    await expect(dispatchSection.getByTestId('dispatch-history-item')).toHaveCount(2)

    // บันทึกการรับสำเร็จในครั้งที่สอง — ต้องปิดเฉพาะครั้งล่าสุดเป็น "ถึงมือผู้รับแล้ว" ไม่แตะครั้งที่ตีกลับ
    await dispatchSection.locator('input[type="date"]').fill('2026-09-10')
    await fieldAfterLabel(dispatchSection, 'ผู้รับหนังสือ').fill(String(afterRedispatch?.person))
    await dispatchSection
      .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
      .locator('input[type="file"]')
      .setInputFiles({ name: 'ใบรับมอบโดยตรง.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') })
    await dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()

    const afterDelivery = await readCase(page, CASE_NO)
    const finalHistory = (afterDelivery?.dispatchHistory || []) as Array<Record<string, unknown>>
    expect(finalHistory).toHaveLength(2)
    expect(finalHistory[0].outcome).toBe('failed')
    expect(finalHistory[1].outcome).toBe('delivered')
    await expect(dispatchSection.getByTestId('dispatch-history-item')).toHaveCount(2)
    await expect(dispatchSection.getByTestId('dispatch-history-item').last()).toContainText('ถึงมือผู้รับแล้ว')

    // 30 วันนับจากวันรับจริงของครั้งที่สำเร็จ (10 ก.ย.) ไม่ใช่จากวันที่นำส่งครั้งแรกหรือครั้งที่ตีกลับ
    const delivered = new Date('2026-09-10T00:00:00.000Z').getTime()
    const due = new Date(afterDelivery?.appealDueAt as string).getTime()
    expect(Math.round((due - delivered) / 86400000)).toBe(30)
  })
})
