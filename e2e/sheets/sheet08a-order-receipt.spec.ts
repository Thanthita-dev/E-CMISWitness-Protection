import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * Sheet 08A · WIT0801 → WIT0813 — รับคำสั่ง / แยกแนวทางคุ้มครอง
 *
 * ผัง: รับผลอนุมัติ (WIT0801/0804) → จัดทำ/ส่ง คบ.9 (WIT0805-0806) → จัดทำ/ลงนาม คบ.11 (WIT0807-0811)
 *      → **WIT0813** แยกเส้นทางปฏิบัติตามวิธีที่อนุมัติ (08A-1/08A-2/08A-3/08B)
 *      กรณีเร่งด่วนใช้ความยินยอมใน คบ.5 (WIT0803) แทน คบ.11 ได้ ไม่ต้องรอ คบ.9/คบ.11
 *
 * TC-061 (พยานไม่ยินยอมตาม คบ.11 / WIT0809 แขนงไม่ยินยอม → WIT0812) ถูกครอบคลุมแล้วทั้งชุดใน
 * `e2e/sheets/sheet08a-consent-decline.spec.ts` (`describe('WIT0812 ...')`) — ไม่ทำซ้ำที่นี่ ดู notes ใน 08A.json
 */

const CASE_NO = 'WP-2569-000501'
const METHODS_URL = '/protection-methods'

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/**
 * เปิดโมดัลลงนามของแบบ คบ.11 จากรายการแบบฟอร์มในแฟ้ม
 * ในสถานะที่ใช้ทดสอบ (Case 1.11) มีเฉพาะ คบ.11 เท่านั้นที่ถึงคิวลงนาม จึงระบุปุ่ม "ลงนาม" เดี่ยวได้ตรง ๆ
 */
async function openKb11SignModal(page: Page) {
  await page.goto(`/dossier/${CASE_NO}`)
  await page.getByRole('button', { name: 'ลงนาม' }).click()
}

async function signInPlace(page: Page, signerName?: string) {
  const nameInput = page.getByTestId('signature-name-input')
  await expect(nameInput).toBeVisible()
  // ช่องพยานในการทำข้อตกลง (attest1/attest2) ไม่มีชื่อตั้งต้น ต้องกรอกเองก่อนปุ่มยืนยันจะเปิดใช้งาน
  if ((await nameInput.inputValue()).trim() === '') await nameInput.fill(signerName || 'พยานในการทำข้อตกลง')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

/** เซ็นทุกช่องของ คบ.11 ที่ยังไม่ได้เซ็น แล้วกด "บันทึกข้อตกลง คบ.11" */
async function signKb11All(page: Page) {
  const signButtons = page.getByRole('button', { name: 'ลงลายมือชื่อ' })
  const count = await signButtons.count()
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    await signInPlace(page)
  }
  await page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }).click()
}

test.describe('08A · WIT0801-0813 — รับคำสั่งและแยกแนวทางคุ้มครอง', () => {
  test('TC-058 · [Happy] กรณีคำร้องหลัก: คบ.9 ถึงมือพยานครบ ลงนาม คบ.11 ครบ แล้วเปิดเส้นทางปฏิบัติ (WIT0813)', async ({
    page,
  }) => {
    // Case 1.11 ตั้งต้นที่ คบ.9 ลงนามแล้ว/นำส่งแล้ว/พยานรับแล้วครบ (deliveryRecipient/ackType ครบ)
    // และ คบ.6 เสนอวิธีที่ 1 ไว้ (รูปแบบคุ้มครองที่เลือก=[1]) — เหลือแค่ลงนาม คบ.11
    await seedMockState(page, 'Case 1.11', 'officer')

    await page.goto(`/dossier/${CASE_NO}`)
    const before = await readCase(page, CASE_NO)
    expect(before?.kb9Signed).toBe(true)
    expect(before?.deliveredAt).toBeTruthy()
    expect(before?.kb11Signed).toBeFalsy()

    await page.getByRole('button', { name: 'ลงนาม' }).click()
    await signKb11All(page)

    const after = await readCase(page, CASE_NO)
    expect(after?.kb11Signed).toBe(true)
    // WIT0813 — พยานยินยอมแล้ว ระบบต้องเปิดเส้นทางปฏิบัติของวิธีที่เสนอไว้ใน คบ.6 (วิธีที่ 1) ให้อัตโนมัติ
    expect(after?.approvedMethods).toEqual([1])
    expect((after?.methodTracks as Array<{ method: number; status: string }>).map((t) => t.method)).toContain(1)

    await page.goto(METHODS_URL)
    await expect(page.getByText('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').first()).toBeVisible()
  })

  test('TC-059 · [Happy] กรณีเร่งด่วน: ใช้ความยินยอมใน คบ.5 แทน คบ.11 — ไม่บังคับ คบ.9/คบ.11 ก่อนเริ่มคุ้มครอง', async ({
    page,
  }) => {
    // ไม่มี mock state ใดที่ urgent+kb5Approved ค้างอยู่ที่ขั้นแยกวิธี — ตั้งต้นด้วย casePatch ตามหมายเหตุ 08A
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      kb9Signed: false,
      kb10Signed: false,
      kb11Signed: false,
      dispatchedAt: undefined,
      deliveredAt: undefined,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending', wizardStep: 1 }],
      consents: [{ ref: 'kb5', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
      consentDeclineProposals: [],
    })

    await page.goto(METHODS_URL)

    // ประตูความยินยอมต้องอ้างอิง คบ.5 ไม่ใช่ คบ.11 และต้องแสดงว่าลงนามครบแล้วโดยไม่ง้อ คบ.9/คบ.11
    await expect(page.getByText('ความยินยอมตาม คบ.5')).toBeVisible()
    await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
    await expect(page.getByTestId('consent-agree')).toBeHidden()

    // เริ่มปฏิบัติจริงของวิธีที่ 1 ต้องไม่ถูกกันด้วยเหตุ คบ.9/คบ.11 — มี คบ.5 อนุมัติก็พอ (method1Gate)
    // wizardStep=1 = อยู่ที่หน้าสุดท้าย (ชี้แจงภารกิจ) ที่มีปุ่มเริ่มปฏิบัติจริงอยู่แล้ว
    await page.goto(`/protection-method/1?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('method-1-start')).toBeEnabled()
  })

  test('TC-060 · [Happy] อนุมัติหลายวิธี (15(1)/(2)/(3)) เปิดหลายเส้นทางปฏิบัติพร้อมกัน (WIT0813)', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      kb9Signed: false,
      kb11Signed: false,
      approvedMethods: [],
      methodTracks: [],
      consents: [{ ref: 'kb5', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
      consentDeclineProposals: [],
    })

    await page.goto(METHODS_URL)
    await page.getByText('(1) จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').click()
    await page.getByText('(2) จัดให้พยานอยู่ในสถานที่เหมาะสม').click()
    await page.getByText('(3) ปกปิด และรักษาความลับ').click()
    await page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }).click()
    await confirmDialog(page, 'ยืนยันเปิดเส้นทางปฏิบัติ', 'วิธีที่เลือก')

    const after = await readCase(page, CASE_NO)
    const tracks = after?.methodTracks as Array<{ method: number; status: string }>
    expect(tracks.map((t) => t.method).sort()).toEqual([1, 2, 3])
    // แต่ละวิธีมีสถานะของตัวเอง เริ่มที่ pending อิสระจากกัน ภายใต้ Episode/แฟ้มเดียวกัน
    expect(tracks.every((t) => t.status === 'pending')).toBe(true)

    await page.reload()
    await expect(page.getByText('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย')).toBeVisible()
    await expect(page.getByText('จัดให้พยานอยู่ในสถานที่เหมาะสม')).toBeVisible()
    await expect(page.getByText('ปกปิด และรักษาความลับ')).toBeVisible()
  })

  test('TC-062 · [Negative] เริ่มคุ้มครองกรณีคำร้องหลักทั้งที่ คบ.9/คบ.11 ยังไม่ลงนามครบ — ต้องถูกปฏิเสธ', async ({
    page,
  }) => {
    // Case 1.8: activity7State=approved แต่ยังไม่ได้เริ่มทำ คบ.9/คบ.11 เลย
    // เติมความยินยอมตาม คบ.11 เข้าไปตรง ๆ เพื่อจำลองช่องว่างจริง: "มีความยินยอมแล้วแต่ คบ.9/คบ.11 ยังไม่ลงนามครบ"
    await seedMockState(page, 'Case 1.8', 'officer', {
      consents: [{ ref: 'kb11', consented: true, by: 'สมชาย ใจดี', at: '10/09/2569 09:00' }],
    })
    await page.goto(METHODS_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.kb9Signed).toBeFalsy()
    expect(before?.kb11Signed).toBeFalsy()

    // ธุรกิจที่ถูกต้อง: มีความยินยอมแล้วก็จริง แต่ต้องมี คบ.9/คบ.11 ลงนามครบก่อนจึงเปิดเส้นทางปฏิบัติได้
    // ของจริง: ปุ่มเปิดเส้นทางถูกปิด พร้อมข้อความเตือนบอกเอกสารที่ยังขาด
    await page.getByText('(2) จัดให้พยานอยู่ในสถานที่เหมาะสม').click()
    const openButton = page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' })
    await expect(openButton).toBeDisabled()
    await expect(page.getByText('คำร้องหลักต้องมี คบ.9 และ คบ.11 ลงนามครบก่อนจึงจะเปิดเส้นทางปฏิบัติได้')).toBeVisible()

    const after = await readCase(page, CASE_NO)
    // ธุรกิจที่ถูกต้อง: approvedMethods ต้องยังว่างอยู่จนกว่าจะมี คบ.9/คบ.11 ลงนามครบ
    expect(after?.approvedMethods || []).toEqual([])
  })

  test('TC-063 · [Negative] เพิ่มวิธีที่ 15(4) ทั้งที่ผลอนุมัติมีเฉพาะ 15(1) — ต้องจำกัดตัวเลือกให้ตรงคำสั่ง', async ({
    page,
  }) => {
    // ผลอนุมัติเดิมมีเฉพาะวิธีที่ 1 — orderedMethods อ้างอิงคำสั่งเดิม จำกัดตัวเลือกที่เปิดให้เลือกได้
    await seedMockState(page, 'Case 1.12', 'officer', {
      orderedMethods: [1],
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    await page.goto(METHODS_URL)
    // ธุรกิจที่ถูกต้อง: ตัวเลือกต้องจำกัดเฉพาะวิธีที่ได้รับอนุมัติตามคำสั่งจริง (วิธีที่ 1) เท่านั้น
    // ของจริง: หน้านี้ซ่อนตัวเลือกวิธีที่ 4 ไป เพราะไม่อยู่ใน orderedMethods
    await expect(page.getByText('(4) ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน')).toBeHidden()

    const after = await readCase(page, CASE_NO)
    const tracks = after?.methodTracks as Array<{ method: number }>
    // ธุรกิจที่ถูกต้อง: วิธีที่ 4 ไม่เคยถูกเปิดเป็นเส้นทางปฏิบัติได้เลย เพราะไม่มีตัวเลือกให้กด
    expect(tracks.map((t) => t.method)).not.toContain(4)
  })

  test('TC-064 · [Edge] คบ.9 ส่งทางไปรษณีย์ตีกลับ ต้องเปลี่ยนช่องทางเป็นนำส่งโดยตรงและบันทึกวันรับจริง', async ({
    page,
  }) => {
    // Case 1.10: คบ.9 ลงนามแล้ว ยังไม่ได้นำส่ง — บันทึกช่องทางที่ 1 (ไปรษณีย์) ก่อน แล้วสมมติว่าตีกลับ
    await seedMockState(page, 'Case 1.10', 'officer')

    await page.goto(`/dossier/${CASE_NO}`)
    const dispatchSection = page.locator('div.rounded-xl.border.border-slate-200.bg-white.p-4', {
      hasText: 'การนำส่งหนังสือและวันที่พยานได้รับ',
    })
    // ค่าตั้งต้นของช่องทางคือไปรษณีย์ตอบรับด่วน (EMS) อยู่แล้ว — บันทึกการนำส่งครั้งแรก
    await dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()

    const c = await readCase(page, CASE_NO)
    expect(c?.dispatchChannel).toBe('ไปรษณีย์ตอบรับด่วน (EMS)')

    // ปัจจุบัน: ฟอร์มบันทึกการนำส่งหายไปทันทีที่ dispatchedAt ถูกตั้งค่าแล้ว ไม่มีทางเปลี่ยนช่องทาง/บันทึกว่าตีกลับอีก
    // Expected: ระบบต้องเปิดให้เปลี่ยนช่องทางเป็น "นำส่งโดยตรง" ได้ และเก็บประวัติการส่งทุกครั้งพร้อมผลลัพธ์
    await expect(dispatchSection.getByText('ช่องทางนำส่ง *')).toBeVisible()
    await expect(dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' })).toBeVisible()
  })

  test('TC-065 · [Edge] คบ.11 ลงนามเฉพาะพยาน+เจ้าพนักงาน (ขาดพยานรับรอง) — ต้องไม่ให้ล็อกเป็นฉบับสมบูรณ์', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.11', 'officer')
    await openKb11SignModal(page)

    // เซ็นเฉพาะช่องแรกสองช่อง (พยาน + เจ้าพนักงาน) เว้นพยานในการทำข้อตกลงทั้งสองคน
    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    await signInPlace(page)
    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    await signInPlace(page)

    const saveButton = page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' })
    // ปัจจุบัน: ปุ่มเปิดใช้งานทันทีที่พยาน+เจ้าพนักงานเซ็นครบ โดยไม่ตรวจพยานรับรองอีก 2 ช่องเลย
    // Expected: ระบบต้องแจ้งว่าลายมือชื่อไม่ครบตามแบบ และไม่ให้กดบันทึก/ล็อกฉบับจนกว่าจะครบทุกช่อง
    await expect(saveButton).toBeDisabled()

    const after = await readCase(page, CASE_NO)
    expect(after?.kb11Signed).toBeFalsy()
  })
})
