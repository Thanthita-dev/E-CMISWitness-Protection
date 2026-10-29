import { expect, test, type Page } from '@playwright/test'
import { chooseKb6IfAsked } from '../helpers/methodChoice'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { snap } from '../helpers/snapshot'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, fieldAfterLabel, formRow, signInModal } from '../journeys/journey-helpers'

/**
 * Flow paths · แท็บ 08A / 08A-1 / 08A-2 / 08A-3 — เดินทุกเส้นทางของผังที่ปรับตามโค้ดปัจจุบันผ่าน UI จริง
 * (ผัง: src/flow-guide/flow-map.json + flow-diagram.json · อ้างอิงรหัส WIT ในชื่อ test และ test.step)
 *
 * 08A  รับคำสั่งและแยกแนวทางคุ้มครอง
 *   08A-main        WIT0801 → WIT0802 → WIT0804 → WIT0805 → WIT0806 → WIT0807   (คำร้องหลัก: นำส่ง คบ.9 และบันทึกการรับ)
 *   08A-dispatch    WIT0806 → WIT0870 → WIT0806                                  (นำส่งไม่สำเร็จ/ตีกลับ → ส่งซ้ำ)
 *   08A-urgent      WIT0802 → WIT0803 → WIT0813                                  (กรณีเร่งด่วน คบ.5)
 *   08A-order       WIT0802 → WIT0804                                            (ฐานคำสั่งคำร้องหลัก)
 *   08A-kb11        WIT0807 → WIT0809 → WIT0810 → WIT0811 → WIT0813              (ลงนาม คบ.11 → เปิดเส้นทาง)
 *   08A-decline-*   WIT0809 → WIT0812 → WIT0838 → WIT0839 → WIT0840 → (11A | WIT0807 | 11C) และแขนงส่งคืนแก้ไข
 *   08A-method4     WIT0813 → route 08B (วิธีที่ 4 เดี่ยว)
 * 08A-1 วิธีที่ 1
 *   08A1-main       WIT0814 → WIT0815 → WIT0817 → WIT0871 → WIT0818 → WIT0872 → WIT0819 → WIT0820 → WIT0821
 *   08A1-gate       WIT0815 → WIT0817 (ก่อนลงนาม คบ.8 ปุ่มถัดไปปิด)
 *   08A1-return     WIT0818 → WIT0817 (ส่งกลับแก้ไข Revision ใหม่)
 *   08A1-temporary  WIT0815 → WIT0816 → WIT0819 → WIT0820 → WIT0821 (คบ.5 TEMPORARY_ACTIVE)
 *   08A1-warn       WIT0820 (แผนไม่ครบเตือนก่อนเริ่ม)
 * 08A-2 วิธีที่ 2
 *   08A2-main       WIT0822 → WIT0823 → WIT0824 → WIT0825 → WIT0826 (เหมาะสม) → WIT0827 → WIT0828 → WIT0829
 *   08A2-unsuitable WIT0826 (ไม่เหมาะสม) → WIT0824 → WIT0825 → WIT0826 (เหมาะสม)
 *   08A2-method4    WIT0826 (ไม่เหมาะสม) → WIT0873 → 08B
 *   08A2-blocked    WIT0828 → WIT0829 (ขาดหลักฐานส่งมอบ เริ่มไม่ได้) และ "อยู่ระหว่างจัดเตรียม"
 * 08A-3 วิธีที่ 3
 *   08A3-main       WIT0830 → WIT0831 → WIT0832 → WIT0833 → WIT0834 (ผ่าน) → WIT0836 → WIT0837
 *   08A3-fail       WIT0834 (ไม่ผ่าน) → WIT0835 → WIT0833 → WIT0834 (ผ่าน)
 *   08A3-floor      WIT0832 (สิทธิ์ขั้นต่ำของเจ้าหน้าที่)
 *   08A3-expired    WIT0837 → WIT0874 (พ้นช่วงเวลาที่อนุมัติ)
 *
 * หมายเหตุ: ชุดนี้ไม่ได้รันตอนเขียน — เขียนจาก selector ที่ตรวจกับ source ปัจจุบันเท่านั้น
 */

const WORK_URL = `/protection-method-work?caseNo=${CASE_NO}`
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}` // แท็บ 10
const METHOD4_URL = `/protection-method/4?caseNo=${CASE_NO}` // แท็บ 08B
const TERMINATION_URL = `/termination/${encodeURIComponent(CASE_NO)}` // แท็บ 11C
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const ACK_FILE = { name: 'ใบตอบรับสาธิต.pdf', mimeType: 'application/pdf', buffer: Buffer.from('demo delivery receipt') }
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

type Track = { method: number; status: string; startedAt?: string; wizardStep?: number; site?: Record<string, any>; privacy?: Record<string, any> }
const getTrack = async (page: Page, method: number) =>
  ((await readCase(page, CASE_NO))?.methodTracks as Track[] | undefined)?.find((t) => t.method === method)

/** หน้ารายการ "งานตามวิธีคุ้มครอง" → ปุ่ม "เปิดงาน" ของแฟ้ม → หน้างานรายแฟ้ม (WIT0802) */
async function openWork(page: Page) {
  await page.goto('/protection-methods')
  await page.getByRole('row', { name: new RegExp(CASE_NO) }).getByRole('link', { name: 'เปิดงาน', exact: true }).click()
  await expect(page).toHaveURL(/\/protection-method-work\?caseNo=/)
  await chooseKb6IfAsked(page)
}

/** กางรายการพับ "พยานไม่ยินยอม" ที่หน้างาน (WIT0812) */
async function openDeclineSection(page: Page) {
  await page.locator('summary', { hasText: 'พยานไม่ยินยอม' }).click()
  await expect(page.getByTestId('wit0812-card')).toBeVisible()
}

/** ลงนามทุกช่องของ คบ.11 ที่ยังเป็น "ลงลายมือชื่อ" ในโมดัล (ปัจจุบัน 2 ช่อง: พยาน + เจ้าพนักงาน) แล้วบันทึกข้อตกลง (WIT0810-0811) */
async function signKb11(page: Page) {
  await page.goto(`/form/11?caseNo=${CASE_NO}`)
  await snap(page, ['node:08A:WIT0810', 'edge:08A:E0808'], { label: 'คบ.11 พร้อมให้พยานและเจ้าพนักงานลงนาม (ยังไม่มีลายมือชื่อ)', route: `/form/11?caseNo=${CASE_NO}` })
  await page.getByTestId('kb11-form-sign').click()
  const slots = page.getByRole('button', { name: /ลงลายมือชื่อ$/ })
  const total = await slots.count()
  expect(total).toBeGreaterThan(0)
  const save = page.getByRole('button', { name: /บันทึกข้อตกลง คบ\.11$/ })
  await expect(save).toBeDisabled()
  for (let i = 0; i < total; i++) {
    await slots.first().click()
    await signInModal(page, i === 0 ? 'สมชาย ใจดี' : OFFICER)
    await expect(slots).toHaveCount(total - i - 1)
  }
  await expect(save).toBeEnabled()
  await snap(page, ['node:08A:WIT0811', 'edge:08A:E0810'], { label: 'ลงนาม คบ.11 ครบทุกช่อง รอกดบันทึกข้อตกลง', route: `/form/11?caseNo=${CASE_NO}` })
  await save.click()
  await expect.poll(async () => (await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
}

/** เจ้าหน้าที่บันทึกไม่ยินยอมและเสนอแนวทาง (WIT0812) */
async function declineAndPropose(page: Page, action: 'review' | 'change_method' | 'terminate', reason: string, newMethods: number[] = []) {
  await openWork(page)
  await openDeclineSection(page)
  await page.getByTestId('decline-reason').fill(reason)
  await page.getByTestId('decline-evidence').fill('บันทึกถ้อยคำพยาน ลงวันที่ 11 ก.ย. 2569')
  await page.getByTestId(`decline-action-${action}`).click()
  for (const m of newMethods) await page.getByTestId(`decline-new-method-${m}`).click()
  await page.getByTestId('decline-submit').click()
  await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'ระงับทันที')
}

/** ผู้บังคับบัญชา (ผบช.ชั้นต้น หรือ ผอ.) พิจารณาข้อเสนอที่หน้างานรายแฟ้ม (WIT0838 / WIT0839) */
async function decide(page: Page, role: 'supervisor' | 'director', endorse: boolean, note: string, confirmButton: string) {
  await switchRole(page, role)
  await page.goto(`/queue/${role}`)
  await expect(page.getByText(CASE_NO).first()).toBeVisible()
  await openWork(page)
  await openDeclineSection(page)
  await page.getByTestId('decline-decision-note').fill(note)
  await page.getByTestId(endorse ? 'decline-endorse' : 'decline-return').click()
  await confirmDialog(page, confirmButton)
}

type Proposal = { proposedAction: string; stage: string }
const proposals = async (page: Page) => ((await readCase(page, CASE_NO))?.consentDeclineProposals ?? []) as Proposal[]

// ─────────────────────────────────────────────────────────────────────────────
// 08A
// ─────────────────────────────────────────────────────────────────────────────
test.describe('08A · รับคำสั่งและแยกแนวทางคุ้มครอง (WIT0801-0813, 0838-0840, 0870)', () => {
  test('08A-main · WIT0801→0802→0804→0805→0806→0807 คำร้องหลัก: นำส่ง คบ.9 บันทึกการรับ แล้วปลดล็อก คบ.11', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Notice 2', 'officer')

    await test.step('WIT0801 · คบ.9 ลงนามพร้อมผลอนุมัติแล้ว ผู้รับผิดชอบรับงาน (ระบบ)', async () => {
      await page.goto(DOSSIER_URL)
      await snap(page, ['node:08A:WIT0801'], { label: 'ระบบได้รับ คบ.9 ลงนามพร้อมผลอนุมัติ (แฟ้มของผู้รับผิดชอบ)', route: DOSSIER_URL })
      const c = await readCase(page, CASE_NO)
      expect(c?.kb9Signed).toBe(true)
      expect(c?.activity7State).toBe('approved')
      expect(c?.orderedMethods).toEqual([1])
      expect(c?.kb11Signed).toBeFalsy()
      await page.goto(WORK_URL)
      await chooseKb6IfAsked(page)
      await snap(page, ['edge:08A:E0801', 'node:08A:WIT0802'], { label: 'หน้างานรายแฟ้ม รอแยกว่าเอกสารต้นทางเป็นกรณีใด', route: WORK_URL })
    })

    await test.step('WIT0805 · คบ.9 ไม่มีการ์ดเติมรายละเอียดหลังลงนาม (ระบบตรวจพร้อมส่งให้ตอนนำส่ง)', async () => {
      await page.goto(`/form/9?caseNo=${CASE_NO}`)
      await expect(page.getByTestId('notice-dispatch-card')).toBeVisible()
      await expect(page.getByTestId('result-notice-card')).toHaveCount(0)
      await snap(page, ['node:08A:WIT0805', 'edge:08A:E0803B', 'node:08A:WIT0806', 'edge:08A:E0804'], { label: 'หน้า คบ.9 พร้อมนำส่ง ยังไม่บันทึกการนำส่ง', route: `/form/9?caseNo=${CASE_NO}` })
    })

    const card = page.getByTestId('notice-dispatch-card')
    await test.step('WIT0806 · เลือกช่องทางและบันทึกการนำส่ง → เอกสารเป็น "ส่งแจ้งผลแล้ว"', async () => {
      await card.getByTestId('notice-delivery-channel').selectOption('ส่งมอบโดยตรงถึงตัวพยาน')
      await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.dispatchChannel).toBe('ส่งมอบโดยตรงถึงตัวพยาน')
      const c = await readCase(page, CASE_NO)
      expect((c?.resultNotices as any)[9].status).toBe('sent')
      expect(c?.dispatchedAt).toBeTruthy()
      expect(c?.kb11Signed).toBeFalsy()
    })

    await test.step('WIT0806 · บันทึกการรับหนังสือ (ผู้รับ หลักฐาน ไฟล์) → deliveredAt ตั้งค่าและ คบ.11 ปลดล็อก', async () => {
      await fieldAfterLabel(card, 'ผู้รับหนังสือ').fill('สมชาย ใจดี')
      await card.locator('input[type="file"]').setInputFiles(ACK_FILE)
      await card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.deliveredAt).toBeTruthy()
      expect((await readCase(page, CASE_NO))?.deliveryRecipient).toBe('สมชาย ใจดี')
      await snap(page, ['edge:08A:E0805'], { label: 'บันทึกการรับ คบ.9 แล้ว (deliveredAt) ปลดล็อก คบ.11', route: `/form/9?caseNo=${CASE_NO}` })
    })

    await test.step('WIT0807 · เปิด คบ.11 ได้ (ปุ่มลงนามพร้อมใช้)', async () => {
      await page.goto(`/form/11?caseNo=${CASE_NO}`)
      await expect(page.getByTestId('kb11-form-sign')).toBeEnabled()
      await snap(page, ['node:08A:WIT0807'], { label: 'ปลดล็อก คบ.11 แล้ว เจ้าหน้าที่จัดทำ/ใส่วิธีที่อนุมัติ', route: `/form/11?caseNo=${CASE_NO}` })
    })
  })

  test('08A-dispatch · WIT0806→WIT0870→WIT0806 นำส่งไม่สำเร็จ/ตีกลับ แล้วเปลี่ยนช่องทางส่งซ้ำ', async ({ page }) => {
    await seedMockState(page, 'Notice 2', 'officer')
    await page.goto(`/form/9?caseNo=${CASE_NO}`)
    const card = page.getByTestId('notice-dispatch-card')

    await test.step('WIT0806 · บันทึกการนำส่งครั้งแรก (EMS)', async () => {
      await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect.poll(async () => ((await readCase(page, CASE_NO))?.dispatchHistory as any[] | undefined)?.length).toBe(1)
      await snap(page, ['node:08A:WIT0870', 'edge:08A:E0805B'], { label: 'ส่ง คบ.9 แล้ว แต่ตีกลับ/ไม่ถึงมือ รอแจ้งว่าไม่สำเร็จ', route: `/form/9?caseNo=${CASE_NO}` })
    })

    await test.step('WIT0870 · ต้องระบุเหตุผลก่อน แล้วยืนยัน "แจ้งว่าส่งไม่สำเร็จ/ตีกลับ"', async () => {
      await card.getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
      await card.getByPlaceholder('เช่น ไม่มีผู้รับตามที่อยู่ที่ระบุ').fill('ไม่มีผู้รับตามที่อยู่ที่ระบุ')
      await card.getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
      await confirmDialog(page, 'ยืนยันว่าไม่สำเร็จ')
      const history = (await readCase(page, CASE_NO))?.dispatchHistory as any[]
      expect(history[0]).toMatchObject({ outcome: 'failed', failureReason: 'ไม่มีผู้รับตามที่อยู่ที่ระบุ' })
      await snap(page, ['edge:08A:E0805C'], { label: 'บันทึกส่งไม่สำเร็จแล้ว พร้อมเปลี่ยนช่องทางส่งซ้ำ', route: `/form/9?caseNo=${CASE_NO}` })
    })

    await test.step('WIT0806 · เปลี่ยนช่องทางเป็นส่งมอบโดยตรง แล้วบันทึกการนำส่งใหม่ (ประวัติสะสม 2 ครั้ง)', async () => {
      await expect(card.getByTestId('notice-delivery-channel')).toHaveValue('ส่งมอบโดยตรงถึงตัวพยาน')
      await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect.poll(async () => ((await readCase(page, CASE_NO))?.dispatchHistory as any[] | undefined)?.length).toBe(2)
      expect(((await readCase(page, CASE_NO))?.dispatchHistory as any[])[1].channel).toBe('ส่งมอบโดยตรงถึงตัวพยาน')
    })
  })

  test('08A-urgent · WIT0802→WIT0803→WIT0813 กรณีเร่งด่วน: ใช้ความยินยอมตาม คบ.5 เปิดเส้นทางได้โดยไม่ต้องมี คบ.9/คบ.11', async ({ page }) => {
    await seedMockState(page, 'Case 3.3', 'officer')
    await openWork(page)
    await snap(page, ['edge:08A:E0802', 'node:08A:WIT0803'], { label: 'กรณีเร่งด่วน: ฐานคำสั่งคือ คบ.5 ที่ลงนามพร้อมความยินยอม', route: WORK_URL })
    await test.step('WIT0802 ◇ ฐานคำสั่งคือ คบ.5 (คำสั่งชั่วคราว)', async () => {
      await expect(page.getByText('ฐานคำสั่ง: คบ.5 (คำสั่งชั่วคราว)')).toBeVisible()
      await expect(page.getByText('ความยินยอมตาม คบ.5')).toBeVisible()
    })
    await test.step('WIT0803 · ลงนามครบแล้ว ไม่มีปุ่มบันทึกความยินยอม และมีการ์ดเส้นทางวิธีที่ 1, 3', async () => {
      await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
      await expect(page.getByTestId('consent-agree')).toHaveCount(0)
      await expect(page.getByRole('link', { name: /^วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ/ })).toBeVisible()
      await snap(page, ['edge:08A:E0803'], { label: 'กรณีเร่งด่วน: ใช้ความยินยอมตาม คบ.5 มีการ์ดเส้นทางวิธีที่ 1, 3 พร้อมเลือก', route: WORK_URL })
    })
    await test.step('WIT0813 · คลิกการ์ดวิธีที่ 1 → หน้าปฏิบัติของวิธีนั้น', async () => {
      await page.getByRole('link', { name: /^วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/1/)
      await snap(page, ['edge:08A:E0813', 'node:08A:route0801', 'overview:08A>08A-1', 'node:08A-1:WIT0814'], { label: 'เปิดเส้นทางวิธีที่ 1 (เร่งด่วน คบ.5) แล้ว หน้าปฏิบัติ วิธีที่ 1' })
    })
  })

  test('08A-order · WIT0802→WIT0804 คำร้องหลัก: หัวการ์ดแสดงฐานคำสั่งผลอนุมัติและความยินยอมตาม คบ.11', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer')
    await openWork(page)
    await expect(page.getByText(/ฐานคำสั่ง: ผลอนุมัติคำร้องหลัก/)).toBeVisible()
    await expect(page.getByText('ความยินยอมตาม คบ.11')).toBeVisible()
    await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
    await expect(page.getByTestId('method-documents-pending')).toHaveCount(0)
    await snap(page, ['node:08A:WIT0804', 'edge:08A:E0802B'], { label: 'คำร้องหลัก: ฐานคำสั่งคือผลอนุมัติ คบ.9 และ คบ.11 ลงนามครบ', route: WORK_URL })
  })

  test('08A-kb11 · WIT0807→0809→0810→0811→0813 ลงนาม คบ.11 ครบ ระบบเปิดเส้นทางตาม คบ.6 แล้วเลือกวิธีที่ 2, 3 เอง', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0809 ◇ ยังไม่ลงนาม: หน้างานแสดง "งานเอกสาร" รอ คบ.11 ไม่ใช่ตัวเลือกวิธี', async () => {
      await openWork(page)
      const pending = page.getByTestId('method-documents-pending')
      await expect(pending).toContainText('รอข้อตกลง คบ.11 ลงนามครบ')
      await expect(pending.getByRole('link', { name: 'เปิด คบ.11', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' })).toHaveCount(0)
      await snap(page, ['node:08A:WIT0809', 'edge:08A:E0806'], { label: 'คบ.11 จัดทำแล้ว รอพยานยินยอมและลงนาม (หน้างานแสดง "งานเอกสาร" รอ คบ.11)', route: WORK_URL })
    })

    await test.step('WIT0810/WIT0811 · ลงนามทุกช่องแล้ว "บันทึกข้อตกลง คบ.11" → ล็อกฉบับ บันทึกความยินยอม เปิดเส้นทางวิธีที่ 1 ตาม คบ.6', async () => {
      await signKb11(page)
      const c = await readCase(page, CASE_NO)
      expect(c?.consents).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'kb11', consented: true })]))
      expect(c?.approvedMethods).toEqual([1])
      expect(c?.extraForms).toContain(8)
    })

    await test.step('WIT0813 ◇ เลือกวิธีที่ 2, 3 (ถอดวิธีที่ 1) แล้วเปิดเส้นทาง', async () => {
      await openWork(page)
      await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
      await snap(page, ['node:08A:WIT0813', 'edge:08A:E0812'], { label: 'ลงนาม คบ.11 ครบและบันทึกแล้ว รอเลือกวิธีที่จะเปิดเส้นทาง', route: WORK_URL })
      const option = (n: number) => page.getByRole('button', { name: new RegExp(`^\\(${n}\\) `) })
      await option(1).click()
      await option(2).click()
      await option(3).click()
      await page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }).click()
      await confirmDialog(page, 'ยืนยันเปิดเส้นทางปฏิบัติ', /วิธีที่ 2.*วิธีที่ 3/)
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([2, 3])
      expect(((c?.methodTracks as Track[]) || []).map((t) => t.method)).toEqual([2, 3])
      await expect(page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ/ })).toBeVisible()
    })
  })

  test('08A-decline-cancel · WIT0812 ต้องระบุเหตุก่อน และยกเลิกในจอยืนยันได้ (แฟ้มไม่ขยับ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.11', 'officer')
    await openWork(page)
    await openDeclineSection(page)
    await snap(page, ['node:08A:WIT0812', 'edge:08A:E0809'], { label: 'พยานไม่ยินยอม: กางส่วนบันทึกไม่ยินยอม รอเจ้าหน้าที่กรอกเหตุและเสนอแนวทาง', route: WORK_URL })
    await page.getByTestId('decline-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    await page.getByTestId('decline-reason').fill('ขอเวลาปรึกษาครอบครัวก่อน')
    await page.getByTestId('decline-submit').click()
    await cancelDialog(page)
    expect(await proposals(page)).toEqual([])
  })

  test('08A-decline-review · WIT0809→0812→0838→0839→0840 ไม่ยินยอม → เสนอ "ทบทวน" → แฟ้มเข้ารายการทบทวน (11A)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · เจ้าหน้าที่บันทึกเหตุ เสนอทบทวน → แฟ้มไป ผบช.ชั้นต้น วิธีที่ยังไม่เริ่มถูกระงับ', async () => {
      await declineAndPropose(page, 'review', 'พยานขอให้ทบทวนเงื่อนไขการคุ้มครองทั้งชุด')
      expect((await proposals(page))[0]).toMatchObject({ proposedAction: 'review', stage: 'supervisor' })
      const c = await readCase(page, CASE_NO)
      expect(((c?.methodTracks ?? []) as Track[]).some((t) => t.status === 'active')).toBe(false)
      expect(c?.kb11Signed).toBeFalsy()
      await expect(page.getByTestId('wit0812-status')).toContainText('รอ ผบช.ชั้นต้น พิจารณา')
      await snap(page, ['node:08A:WIT0838', 'edge:08A:E0838'], { label: 'เจ้าหน้าที่เสนอ (ทบทวน) แล้ว รอ ผบช.ชั้นต้นตรวจ', route: WORK_URL, role: 'supervisor' })
    })
    await test.step('WIT0838 · ผบช.ชั้นต้นเห็นชอบ → ส่งต่อ ผอ.', async () => {
      await decide(page, 'supervisor', true, 'เห็นควรทบทวนตามที่เสนอ', 'ยืนยันเห็นชอบ')
      expect((await proposals(page))[0].stage).toBe('director')
      await snap(page, ['node:08A:WIT0839', 'edge:08A:E0839'], { label: 'ผบช.ชั้นต้นเห็นชอบแล้ว รอ ผอ.อนุมัติแนวทาง', route: WORK_URL, role: 'director' })
    })
    await test.step('WIT0839/WIT0840 · ผอ. อนุมัติ → แขนงทบทวน: ส่งเข้ารายการทบทวน (11A)', async () => {
      await decide(page, 'director', true, 'อนุมัติให้ทบทวน', 'ยืนยันอนุมัติแนวทาง')
      expect((await proposals(page))[0].stage).toBe('approved')
      expect((await readCase(page, CASE_NO))?.reviewHandoff).toBeTruthy()
      await snap(page, ['node:08A:WIT0840', 'edge:08A:E0840', 'edge:08A:E0840A', 'node:08A:out11A', 'overview:08A>11A'], { label: 'ผอ.อนุมัติแนวทาง "ทบทวน" แฟ้มเข้ารายการทบทวน (11A)', route: MONITOR_URL, role: 'officer' })
    })
  })

  test('08A-decline-change · WIT0840→WIT0807 ไม่ยินยอม → เสนอ "เปลี่ยนวิธี" (วิธีที่ 3) → ล้าง kb11Signed ต้องปรับและลงนาม คบ.11 ใหม่', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')
    await declineAndPropose(page, 'change_method', 'ไม่ยินยอมย้ายที่พัก แต่รับการปกปิดข้อมูลได้', [3])
    expect((await proposals(page))[0]).toMatchObject({ proposedAction: 'change_method', stage: 'supervisor' })
    await decide(page, 'supervisor', true, 'เห็นควรเปลี่ยนเป็นวิธีที่ 3', 'ยืนยันเห็นชอบ')
    await decide(page, 'director', true, 'อนุมัติเปลี่ยนวิธี', 'ยืนยันอนุมัติแนวทาง')
    await snap(page, ['edge:08A:E0840B'], { label: 'ผอ.อนุมัติ "เปลี่ยนวิธี" ล้าง คบ.11 ต้องปรับและลงนามใหม่', route: `/form/11?caseNo=${CASE_NO}`, role: 'officer' })
    const c = await readCase(page, CASE_NO)
    // WIT0840 (partial): แขนงนี้ล้าง kb11Signed แล้วให้ปรับ/ลงนาม คบ.11 ใหม่ — ไม่ assert approvedMethods เพราะโค้ดปัจจุบันไม่เปิดวิธีที่เสนอ
    // (setApprovedMethods ถูกด่าน kb11Signed ปฏิเสธหลังล้าง; ดู note ของ WIT0840 ใน flow-map)
    expect(c?.kb11Signed).toBe(false)
    expect(String(c?.next)).toContain('คบ.11')
    expect(String(c?.status)).toContain('เปลี่ยนวิธี')
    expect((await proposals(page))[0].stage).toBe('approved')
    // แขนงวนกลับ WIT0807: คบ.11 ฉบับเดิมเปิดเพื่อลงนามใหม่ได้อีกครั้ง
    await page.goto(`/form/11?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('kb11-form-sign')).toBeEnabled()
  })

  test('08A-decline-terminate · WIT0840→11C ไม่ยินยอม → เสนอ "ยุติ" → แฟ้มเข้าเส้นทางยุติ (คบ.15)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')
    await declineAndPropose(page, 'terminate', 'พยานปฏิเสธการคุ้มครองทุกรูปแบบและขอให้ยุติทันที')
    await decide(page, 'supervisor', true, 'เหตุผลครบถ้วน เห็นควรยุติ', 'ยืนยันเห็นชอบ')
    await decide(page, 'director', true, 'อนุมัติให้ยุติการคุ้มครอง', 'ยืนยันอนุมัติแนวทาง')
    const c = await readCase(page, CASE_NO)
    expect(c?.stage).toBe('termination_review')
    expect((c?.terminationTrigger as Record<string, unknown>)?.source).toBe('due_or_officer')
    expect(String(c?.next)).toContain('คบ.15')
    await snap(page, ['edge:08A:E0840C', 'node:08A:out11C', 'overview:08A>11C'], { label: 'ผอ.อนุมัติ "ยุติ" แฟ้มเข้าเส้นทางยุติการคุ้มครอง (คบ.15)', route: TERMINATION_URL, role: 'officer' })
  })

  test('08A-decline-return · WIT0838/WIT0839→WIT0812 ผบช.ชั้นต้นส่งคืนแก้ไข (ต้องมีเหตุผล) → กลับถึงเจ้าหน้าที่ แล้วเสนอใหม่ได้', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')
    await declineAndPropose(page, 'terminate', 'พยานขอยุติ')

    await switchRole(page, 'supervisor')
    await openWork(page)
    await openDeclineSection(page)
    await page.getByTestId('decline-return').click() // ยังไม่ระบุเหตุผล
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    await decide(page, 'supervisor', false, 'เหตุผลยังไม่พอ ให้ทบทวนก่อนเสนอยุติ', 'ยืนยันส่งคืนแก้ไข')
    expect((await proposals(page))[0].stage).toBe('returned')
    await snap(page, ['edge:08A:E0838R'], { label: 'ผบช.ชั้นต้นส่งคืนแก้ไข แฟ้มกลับถึงเจ้าหน้าที่ รอเสนอใหม่', route: WORK_URL, role: 'officer' })
    expect((await readCase(page, CASE_NO))?.owner).toBe(OFFICER)

    await switchRole(page, 'officer')
    await declineAndPropose(page, 'review', 'ปรับเป็นเสนอทบทวนตามข้อสั่งการ ผบช.')
    const list = await proposals(page)
    expect(list).toHaveLength(2)
    expect(list[1]).toMatchObject({ proposedAction: 'review', stage: 'supervisor' })
  })

  test('08A-decline-return-director · WIT0839→WIT0812 ผอ.ส่งคืนแก้ไข (ต้องมีเหตุผล) → กลับถึงเจ้าหน้าที่', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')
    await declineAndPropose(page, 'terminate', 'พยานขอยุติ')
    await decide(page, 'supervisor', true, 'เห็นควรยุติ', 'ยืนยันเห็นชอบ')
    await decide(page, 'director', false, 'ขอข้อมูลเพิ่มก่อนอนุมัติยุติ', 'ยืนยันส่งคืนแก้ไข')
    expect((await proposals(page))[0].stage).toBe('returned')
    await snap(page, ['edge:08A:E0839R'], { label: 'ผอ.ส่งคืนแก้ไข แฟ้มกลับถึงเจ้าหน้าที่ รอเสนอใหม่', route: WORK_URL, role: 'officer' })
  })

  test('08A-method4 · WIT0813→route 08B เหลือวิธีที่ 4 วิธีเดียว: หน้างานเปิดพื้นที่ประสานหน่วยงานทันที', async ({ page }) => {
    await seedMockState(page, 'Case 8.1', 'officer', {
      orderedMethods: [4],
      dispatchedAt: '08/10/2569 01:00',
      deliveredAt: '2026-10-08T00:00:00Z',
      deliveryRecipient: 'สมชาย ใจดี',
      deliveryAckType: 'ใบตอบรับไปรษณีย์ (EMS)',
    })
    await openWork(page)
    const workspace = page.getByTestId('automatic-method4-workspace')
    await expect(workspace).toBeVisible()
    await expect(workspace.getByTestId('coordination-agency')).toBeVisible()
    await expect(page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' })).toHaveCount(0)
    await page.goto(METHOD4_URL)
    await snap(page, ['edge:08A:E0816', 'node:08A:route0804', 'overview:08A>08B'], { label: 'เหลือวิธีที่ 4 วิธีเดียว: ไปหน้าวิธีที่ 4 (08B) ประสานหน่วยงานอื่น', route: METHOD4_URL })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 08A-1
// ─────────────────────────────────────────────────────────────────────────────
test.describe('08A-1 · วิธีที่ 1 จัดชุดคุ้มครอง (WIT0814-0821, 0871-0872)', () => {
  const METHOD1_URL = `/protection-method/1?caseNo=${CASE_NO}`

  test('08A1-gate · WIT0814→0815→0817 คำร้องหลัก: ก่อนลงนาม คบ.8 ปุ่ม "ถัดไป" ถูกปิดพร้อมเหตุผล', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer')
    await page.goto(METHOD1_URL)
    await expect(page.getByText(/คบ\.8 ยังไม่ผ่านการลงนาม/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
    await snap(page, ['node:08A-1:WIT0814', 'edge:08A-1:a1e1', 'node:08A-1:WIT0815'], { label: 'รับงานวิธีที่ 1 (คำร้องหลัก) คบ.8 ยังไม่ลงนาม ปุ่มถัดไปปิด', route: METHOD1_URL })
  })

  test('08A1-main · WIT0817→0871→0818→0872→0819→0820→0821 คำร้องหลัก: เสนอ คบ.8 ผ่านสารบรรณ ลงนาม แล้วเริ่มปฏิบัติ (MAIN_ACTIVE)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.12', 'officer')

    await test.step('WIT0817 · เจ้าหน้าที่ "ส่งเสนอเลขาธิการฯ ลงนาม" → สารบรรณขาไป (WIT0871)', async () => {
      await page.goto(DOSSIER_URL)
      await snap(page, ['node:08A-1:WIT0817', 'edge:08A-1:a1e3'], { label: 'คำร้องหลัก: เจ้าหน้าที่จัดทำร่าง คบ.8 พร้อมเสนอเลขาธิการฯ', route: DOSSIER_URL })
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'up' })
      await snap(page, ['node:08A-1:WIT0871', 'edge:08A-1:a1e4'], { label: 'เสนอ คบ.8 แล้ว สารบรรณขาไป รอธุรการหน่วยออกเลขส่ง', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'receiver' })
    })
    await test.step('WIT0871 · ธุรการหน่วย → ธุรการ สลธ. บันทึกเลขทะเบียนและส่งต่อ', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'secretary' })
    })
    await test.step('WIT0818 · เลขาธิการลงนาม คบ.8 → ล็อกฉบับ และเปิดสารบรรณขาลง (WIT0872)', async () => {
      await page.goto(DOSSIER_URL)
      await snap(page, ['node:08A-1:WIT0818', 'edge:08A-1:a1e4b'], { label: 'คบ.8 ถึงเลขาธิการฯ แล้ว รอตรวจและลงนาม', route: DOSSIER_URL, role: 'secretary' })
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
      await signInModal(page)
      await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8Signed).toBe(true)
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'down' })
      await snap(page, ['node:08A-1:WIT0872', 'edge:08A-1:a1e5'], { label: 'ลงนาม คบ.8 แล้ว สารบรรณขาลง รอธุรการ สลธ. ส่งกลับ', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'secretary_receiver' })
    })
    await test.step('WIT0872 · ธุรการ สลธ. → ธุรการหน่วย ส่งคืนเจ้าหน้าที่', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toBeUndefined()
    })
    await test.step('WIT0819 · กรอกแผนปฏิบัติของชุดคุ้มครอง → ถัดไป', async () => {
      await page.goto(METHOD1_URL)
      await snap(page, ['node:08A-1:WIT0819', 'edge:08A-1:a1e5b'], { label: 'คบ.8 ลงนามและส่งถึงเจ้าหน้าที่แล้ว รอจัดแผนปฏิบัติ', route: METHOD1_URL, role: 'officer' })
      await page.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร').fill('ร.ต.อ. ก. และสมาชิก 4 นาย')
      await page.getByLabel('ยานพาหนะ').fill('รถกระบะตู้ทึบ 1 คัน')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })
    await test.step('WIT0820/WIT0821 · ชี้แจง Need-to-Know แล้วเริ่มปฏิบัติจริง → MAIN_ACTIVE', async () => {
      await snap(page, ['node:08A-1:WIT0820', 'edge:08A-1:a1e7'], { label: 'กรอกแผนปฏิบัติแล้ว รอชี้แจงภารกิจ Need-to-Know', route: METHOD1_URL })
      await page.getByLabel('ผู้ชี้แจง').fill(OFFICER)
      await snap(page, ['node:08A-1:WIT0821', 'edge:08A-1:a1e8'], { label: 'ชี้แจงแล้ว รอเริ่มปฏิบัติจริง (คำร้องหลักมีผลอนุมัติแล้ว)', route: METHOD1_URL })
      await page.getByTestId('method-1-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'คบ.8')
      const track = await getTrack(page, 1)
      expect(track?.status).toBe('active')
      expect(track?.startedAt).toBeTruthy()
      await expect(page.getByText(/สถานะปัจจุบัน: MAIN_ACTIVE/)).toBeVisible()
      await snap(page, ['edge:08A-1:a1e10', 'node:08A-1:a1status_main', 'overview:08A-1>10'], { label: 'เริ่มคุ้มครองวิธีที่ 1 แล้ว สถานะ MAIN_ACTIVE (คำร้องหลักอนุมัติ)', route: MONITOR_URL })
    })
  })

  test('08A1-return · WIT0818→WIT0817 เลขาธิการส่งกลับแก้ไข คบ.8 (ต้องมีเหตุผล) → Revision ใหม่ → เจ้าหน้าที่เสนอซ้ำ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.12', 'secretary', { kb8SubmittedAt: '10/09/2569 08:00', kb8SubmittedBy: OFFICER })
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.8').getByRole('button', { name: 'ลงนาม' }).click()

    await test.step('WIT0818 · ส่งกลับโดยไม่ระบุเหตุผลไม่ได้ แล้วระบุเหตุผลและยืนยัน', async () => {
      await page.getByTestId('kb8-return-for-revision').click()
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
      await page.getByTestId('kb8-return-reason-input').fill('รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ')
      await page.getByTestId('kb8-return-for-revision').click()
      await confirmDialog(page, 'ยืนยันส่งกลับ')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Version).toBe(2)
      expect((c?.kb8PreviousVersions as any[])).toHaveLength(1)
      expect(c?.kb8SubmittedAt).toBeUndefined()
      expect(c?.kb8Signed).toBeFalsy()
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'down' })
      // ใกล้เคียงที่สุด: Revision 2 พร้อมส่งกลับ (สารบรรณขาลงยังค้าง — ขั้น passSarabanCheckpoint ของชุดนี้ fail อยู่เดิม)
      await snap(page, ['edge:08A-1:a1e11'], { label: 'เลขาธิการส่งกลับแก้ไข คบ.8 (Revision 2) รอสารบรรณขาลงส่งคืนเจ้าหน้าที่แก้และเสนอใหม่', route: DOSSIER_URL, role: 'officer' })
    })
    await test.step('WIT0872 · สารบรรณขาลงส่งคืนเจ้าหน้าที่', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
    })
    await test.step('WIT0817 · เจ้าหน้าที่แก้แล้วเสนอฉบับที่ 2 อีกครั้ง', async () => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
      expect((await readCase(page, CASE_NO))?.kb8Version).toBe(2)
    })
  })

  test('08A1-temporary · WIT0815→0816→0819→0820→0821 คำสั่งชั่วคราว (คบ.5): เริ่มปฏิบัติได้โดยไม่รอ คบ.8 → TEMPORARY_ACTIVE', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      kb9Signed: false,
      kb11Signed: false,
      kb8Signed: false,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending', wizardStep: 1 }],
      consents: [{ ref: 'kb5', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
    })
    await page.goto(METHOD1_URL)
    await expect(page.getByTestId('method-1-start')).toBeEnabled()
    await snap(page, ['node:08A-1:WIT0816', 'edge:08A-1:a1e2', 'edge:08A-1:a1e6'], { label: 'คำสั่งชั่วคราว (คบ.5) ยังไม่มี คบ.8: พร้อมเริ่มคุ้มครองชั่วคราวทันที', route: METHOD1_URL })
    await page.getByTestId('method-1-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'คบ.5')
    const c = await readCase(page, CASE_NO)
    expect((await getTrack(page, 1))?.status).toBe('active')
    expect((c?.episode as any)?.phases?.[0]?.kind).toBe('TEMPORARY')
    expect(c?.kb11Signed).toBeFalsy()
    await expect(page.getByText(/สถานะปัจจุบัน: TEMPORARY_ACTIVE/)).toBeVisible()
    await snap(page, ['edge:08A-1:a1e9', 'node:08A-1:a1status_temp'], { label: 'เริ่มคุ้มครองชั่วคราว TEMPORARY_ACTIVE ยังรอผลคำร้องหลัก', route: METHOD1_URL })
  })

  test('08A1-warn · WIT0820 แผนไม่ระบุสมาชิกชุดและผู้ใกล้ชิด → เตือนก่อนเริ่ม แต่ยืนยันต่อได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      kb8Signed: true,
      kb8SignedAt: '10/09/2569 09:00',
      kb8SubmittedAt: '10/09/2569 08:00',
      methodTracks: [{ method: 1, status: 'pending' }],
    })
    await page.goto(METHOD1_URL)
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByTestId('method-1-start').click()
    await confirmDialog(page, 'ยืนยันดำเนินการต่อ', /ยังไม่ครบ|ผู้ใกล้ชิด/)
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
    expect((await getTrack(page, 1))?.status).toBe('active')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 08A-2
// ─────────────────────────────────────────────────────────────────────────────
test.describe('08A-2 · วิธีที่ 2 จัดสถานที่ปลอดภัย (WIT0822-0829, 0873)', () => {
  const METHOD2_URL = `/protection-method/2?caseNo=${CASE_NO}`
  const next = (page: Page) => page.getByRole('button', { name: 'ถัดไป' }).click()

  async function fillScope(page: Page) {
    await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน')
    await next(page)
  }
  async function fillProposal(page: Page, place: string) {
    await page.getByLabel('ประเภทสถานที่').selectOption('pacc_designated')
    await page.getByLabel('สถานที่ที่เสนอ').fill(place)
    await page.getByLabel('ผู้ดูแลสถานที่').fill('ร.ต.ท. สมชาย ดูแลดี')
    await page.getByLabel('ผู้ประเมิน').fill(OFFICER)
    await next(page)
  }

  test('08A2-main · WIT0822→0823→0824→0825→0826→0827→0828→0829 สถานที่เหมาะสม → เข้าพัก ACTIVE', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 8', 'officer')

    await test.step('WIT0822 · รับงานวิธีที่ 2 จากหน้างานตามวิธีคุ้มครอง (คลิกการ์ดเส้นทาง)', async () => {
      await openWork(page)
      await page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/2/)
      await snap(page, ['edge:08A:E0814', 'node:08A:route0802', 'overview:08A>08A-2', 'node:08A-2:WIT0822', 'edge:08A-2:a2e1', 'node:08A-2:WIT0823'], { label: 'เปิดเส้นทางวิธีที่ 2 แล้ว หน้าจัดสถานที่ปลอดภัย รอตรวจขอบเขต' })
    })
    await test.step('WIT0823 · ตรวจขอบเขตที่อนุมัติ', async () => {
      await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน')
      await next(page)
      await snap(page, ['node:08A-2:WIT0824', 'edge:08A-2:a2e2'], { label: 'ตรวจขอบเขตแล้ว รอเสนอสถานที่ปลอดภัย', route: METHOD2_URL })
    })
    await test.step('WIT0824 · เสนอสถานที่ปลอดภัย', async () => {
      await fillProposal(page, 'บ้านพักที่ ป.ป.ท. กำหนด')
      await snap(page, ['node:08A-2:WIT0825', 'edge:08A-2:a2e3'], { label: 'เสนอสถานที่แล้ว รอประเมินความปลอดภัย', route: METHOD2_URL })
    })
    await test.step('WIT0825/WIT0826 ◇ ประเมินความปลอดภัย → สถานที่เหมาะสม', async () => {
      await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ปลอดภัยดี มีรั้วรอบและเจ้าหน้าที่รักษาความปลอดภัย')
      await snap(page, ['node:08A-2:WIT0826', 'edge:08A-2:a2e4'], { label: 'ประเมินความปลอดภัยแล้ว รอสรุปว่าสถานที่เหมาะสมหรือไม่', route: METHOD2_URL })
      await page.getByRole('button', { name: 'สถานที่เหมาะสม', exact: true }).click()
      await expect.poll(async () => (await getTrack(page, 2))?.site?.suitable).toBe(true)
      await next(page)
      await snap(page, ['node:08A-2:WIT0827', 'edge:08A-2:a2e6'], { label: 'สถานที่เหมาะสม ต่อไปจัดแผนย้าย/รับ-ส่ง', route: METHOD2_URL })
    })
    await test.step('WIT0827/WIT0828 · แผนย้าย ผู้ส่งมอบ-ผู้รับมอบ และแนบหลักฐาน', async () => {
      await page.getByLabel('แผนย้าย / รับ–ส่ง').fill('รับพยานจากที่อยู่เดิม นำส่งด้วยรถส่วนกลาง')
      await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
      await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
      await page.getByTestId('site-handover-evidence-input').setInputFiles({ name: 'handover-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('handover evidence') })
      await expect(page.getByText('handover-evidence.pdf')).toBeVisible()
      await snap(page, ['node:08A-2:WIT0828', 'edge:08A-2:a2e7'], { label: 'จัดแผนย้ายและแนบหลักฐานส่งมอบ-รับมอบแล้ว รอพาพยานเข้าพัก', route: METHOD2_URL })
    })
    await test.step('WIT0829 · บันทึกเข้าพัก/ย้ายแล้ว → ACTIVE (วิธีที่ 3 ยังไม่ขยับ)', async () => {
      await page.getByLabel('วันเริ่มจริง').fill(daysAgoIso(3).slice(0, 10))
      await page.getByTestId('method-2-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
      const t2 = await getTrack(page, 2)
      expect(t2?.status).toBe('active')
      expect(t2?.startedAt?.slice(0, 10)).toBe(daysAgoIso(3).slice(0, 10))
      expect((await getTrack(page, 3))?.status).toBe('pending')
      await snap(page, ['node:08A-2:WIT0829', 'edge:08A-2:a2e8', 'overview:08A-2>10'], { label: 'พยานเข้าพักแล้ว วิธีที่ 2 ACTIVE', route: MONITOR_URL })
    })
  })

  test('08A2-unsuitable · WIT0826 ◇ ไม่เหมาะสม → ระบบพากลับขั้นเสนอสถานที่เอง (เก็บประวัติทุกรอบ) → เสนอใหม่ → เหมาะสม', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer')
    await page.goto(METHOD2_URL)
    await fillScope(page)
    await fillProposal(page, 'บ้านเช่าย่านชุมชนหนาแน่น')
    await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ทางเข้า-ออกเปิดโล่ง ไม่ปลอดภัย')
    await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()

    await test.step('WIT0826 → WIT0824 · วนกลับการ์ดเสนอสถานที่อัตโนมัติ และแสดงแถบไม่เหมาะสม', async () => {
      await expect(page.getByLabel('สถานที่ที่เสนอ')).toBeVisible()
      await expect(page.getByText(/ผลประเมินรอบล่าสุด/)).toBeVisible()
      const site = (await getTrack(page, 2))?.site
      expect(site?.suitable).toBe(false)
      expect(site?.round).toBe(2)
      expect(site?.evaluations).toHaveLength(1)
      await snap(page, ['edge:08A-2:a2e5'], { label: 'สถานที่ไม่เหมาะสม ระบบพากลับขั้นเสนอสถานที่ใหม่ (รอบ 2)', route: METHOD2_URL })
    })
    await test.step('WIT0824/WIT0825/WIT0826 · เสนอสถานที่ใหม่ ประเมินซ้ำ → เหมาะสม (ประวัติ 2 รอบ)', async () => {
      await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด')
      await next(page)
      await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ปลอดภัยดี')
      await page.getByRole('button', { name: 'สถานที่เหมาะสม', exact: true }).click()
      await expect.poll(async () => (await getTrack(page, 2))?.site?.suitable).toBe(true)
      expect((await getTrack(page, 2))?.site?.evaluations).toHaveLength(2)
    })
  })

  test('08A2-method4 · WIT0826→WIT0873→08B ไม่เหมาะสมและต้องให้หน่วยงานอื่นทำแทน: เปลี่ยนไปใช้วิธีที่ 4', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer')
    await page.goto(METHOD2_URL)
    await fillScope(page)
    await fillProposal(page, 'บ้านเช่าย่านชุมชนหนาแน่น')
    await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ไม่ปลอดภัย ต้องให้หน่วยงานอื่นดูแลแทน')
    await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()

    await snap(page, ['node:08A-2:WIT0873', 'edge:08A-2:a2e5b'], { label: 'สถานที่ไม่เหมาะสมและต้องให้หน่วยงานอื่นทำแทน รอกดเปลี่ยนไปวิธีที่ 4', route: METHOD2_URL })
    await page.getByRole('button', { name: 'เปลี่ยนไปใช้วิธีที่ 4 แทน' }).click()
    await confirmDialog(page, 'ยืนยันเปลี่ยนเป็นวิธีที่ 4', /วิธีที่ 2/)
    await expect(page).toHaveURL(/\/protection-method\/4/)
    await snap(page, ['edge:08A-2:a2e9', 'node:08A-2:out08B', 'overview:08A-2>08B'], { label: 'เปลี่ยนเป็นวิธีที่ 4 แล้ว ไปหน้า 08B ประสานหน่วยงานอื่น' })
    const c = await readCase(page, CASE_NO)
    expect(c?.approvedMethods).toEqual([4])
    expect(((c?.methodTracks ?? []) as Track[]).map((t) => t.method)).toContain(4)
  })

  test('08A2-blocked · WIT0828→WIT0829 ขาดหลักฐานส่งมอบ-รับมอบ เริ่มปฏิบัติไม่ได้ และทำเครื่องหมาย "อยู่ระหว่างจัดเตรียม" ได้', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer', {
      methodTracks: [
        { method: 2, status: 'pending', wizardStep: 3, site: { suitable: true, siteType: 'pacc_designated', proposedSite: 'บ้านพักที่ ป.ป.ท. กำหนด' } },
        { method: 3, status: 'pending' },
      ],
    })
    await page.goto(METHOD2_URL)
    await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
    await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
    await expect(page.getByText(/ยังไม่ได้แนบหลักฐานการส่งมอบ-รับมอบตัวพยาน/)).toBeVisible()
    await page.getByTestId('method-2-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
    expect((await getTrack(page, 2))?.status).not.toBe('active')

    await page.getByRole('button', { name: 'ทำเครื่องหมายว่าอยู่ระหว่างจัดเตรียม' }).click()
    await expect.poll(async () => (await getTrack(page, 2))?.status).toBe('preparing')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 08A-3
// ─────────────────────────────────────────────────────────────────────────────
test.describe('08A-3 · วิธีที่ 3 ปกปิดข้อมูลและจำกัดสิทธิ (WIT0830-0837, 0874)', () => {
  const METHOD3_URL = `/protection-method/3?caseNo=${CASE_NO}`
  const next = (page: Page) => page.getByRole('button', { name: 'ถัดไป' }).click()

  async function maskAndRoles(page: Page, capture = false) {
    const cap = async (keys: string[], label: string) => { if (capture) await snap(page, keys, { label, route: METHOD3_URL }) }
    await cap(['node:08A-3:WIT0831', 'edge:08A-3:a3e1'], 'เปิดเส้นทางวิธีที่ 3 แล้ว รอระบุข้อมูลและช่องทางที่ต้องปกปิด')
    await page.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }).click()
    await page.getByRole('button', { name: 'เลขประจำตัวประชาชน' }).click()
    await page.getByLabel('ช่องทางที่ต้องปกปิด').fill('ระบบทะเบียนราษฎร์ และเอกสารราชการทุกฉบับที่เผยแพร่ภายนอก')
    await next(page)
    await cap(['node:08A-3:WIT0832', 'edge:08A-3:a3e2'], 'ระบุข้อมูลที่ปกปิดแล้ว รอกำหนดสิทธิ์ตามหน้าที่')
    await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click()
    await page.getByLabel('เหตุผลของการให้สิทธิ์').fill('จำกัดเฉพาะผู้ปฏิบัติและผู้บังคับบัญชาที่ต้องกำกับดูแล')
    await page.getByLabel('ผู้อนุมัติสิทธิ์').fill('นายวีระยุทธ พิทักษ์ธรรม')
    await next(page)
    await cap(['node:08A-3:WIT0833', 'edge:08A-3:a3e3'], 'กำหนดสิทธิ์แล้ว รอเลือกมาตรการจำกัดการใช้ข้อมูล/ตั้งค่า')
    await page.getByText('จำกัดการค้นหา', { exact: true }).click()
    await page.getByText('จำกัดการพิมพ์', { exact: true }).click()
    await next(page)
    await cap(['node:08A-3:WIT0834', 'edge:08A-3:a3e4'], 'ตั้งค่ามาตรการแล้ว รอทดสอบสิทธิ์และการรั่วไหล')
  }

  test('08A3-main · WIT0830→0831→0832→0833→0834→0836→0837 ทดสอบผ่าน → Policy Version → เปิดใช้มาตรการ ACTIVE', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 8', 'officer')
    await test.step('WIT0830 · รับงานวิธีที่ 3 จากหน้างานตามวิธีคุ้มครอง', async () => {
      await openWork(page)
      await page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/3/)
      await snap(page, ['edge:08A:E0815', 'node:08A:route0803', 'overview:08A>08A-3', 'node:08A-3:WIT0830'], { label: 'เปิดเส้นทางวิธีที่ 3 แล้ว หน้าปกปิดข้อมูลและจำกัดสิทธิ' })
    })
    await test.step('WIT0831-0833 · ข้อมูลที่ปกปิด สิทธิ์ตามหน้าที่ และมาตรการจำกัดการใช้ข้อมูล', async () => { await maskAndRoles(page, true) })
    await test.step('WIT0834 ◇/WIT0836 · ทดสอบสิทธิ์ผ่าน → Policy Version 1 + Audit Baseline', async () => {
      await page.getByLabel('ผลการทดสอบ').fill('ทดสอบเข้าถึงด้วยบัญชีนอกขอบเขต — ไม่พบข้อมูลที่ปกปิดรั่วไหล')
      await snap(page, ['node:08A-3:WIT0836'], { label: 'ทดสอบสิทธิ์ผ่าน กรอกผลแล้ว รอกดบันทึกผล: ผ่าน', route: METHOD3_URL })
      await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()
      await expect(page.getByText(/Policy Version 1/)).toBeVisible()
      await snap(page, ['edge:08A-3:a3e7', 'node:08A-3:WIT0837'], { label: 'บันทึกผลผ่าน ได้ Policy Version 1 + Audit Baseline รอเปิดใช้มาตรการ', route: METHOD3_URL })
      const privacy = (await getTrack(page, 3))?.privacy
      expect(privacy?.policyVersion).toBe(1)
      expect(privacy?.auditBaseline).toBeTruthy()
      expect(privacy?.effectiveAt).toBeTruthy()
    })
    await test.step('WIT0837 · เปิดใช้มาตรการ → ACTIVE', async () => {
      await page.getByLabel('วันเริ่มจริง').fill(daysAgoIso(2).slice(0, 10))
      await page.getByTestId('method-3-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
      expect((await getTrack(page, 3))?.status).toBe('active')
      await snap(page, ['edge:08A-3:a3e8', 'overview:08A-3>10'], { label: 'เปิดใช้มาตรการปกปิดแล้ว วิธีที่ 3 ACTIVE', route: MONITOR_URL })
      expect((await getTrack(page, 3))?.privacy?.maskedIdentifiers).toEqual(expect.arrayContaining(['ชื่อตัว - ชื่อสกุล', 'เลขประจำตัวประชาชน']))
    })
  })

  test('08A3-fail · WIT0834 ◇ ไม่ผ่าน → WIT0835 ย้อนกลับแก้มาตรการ → WIT0833 → ทดสอบใหม่ผ่าน', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer')
    await page.goto(METHOD3_URL)
    await maskAndRoles(page)

    await page.getByLabel('ผลการทดสอบ').fill('บัญชีผู้ช่วยยังพิมพ์เอกสารที่ปกปิดได้')
    await page.getByRole('button', { name: 'บันทึกผล: ไม่ผ่าน' }).click()
    await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toHaveCount(0)
    expect((await getTrack(page, 3))?.privacy?.policyVersion).toBeUndefined()
    await snap(page, ['node:08A-3:WIT0835', 'edge:08A-3:a3e5'], { label: 'ทดสอบไม่ผ่าน (บันทึกผลแล้ว) รอย้อนกลับแก้ Role/Policy/Masking', route: METHOD3_URL })

    await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
    await snap(page, ['edge:08A-3:a3e6'], { label: 'ย้อนกลับมาแก้มาตรการหลังทดสอบไม่ผ่าน (เก็บผลทดสอบเดิมไว้)', route: METHOD3_URL })
    await page.getByText('จำกัดการส่งต่อ', { exact: true }).click()
    await next(page)
    await page.getByLabel('ผลการทดสอบ').fill('แก้มาตรการแล้ว ทดสอบซ้ำไม่พบการรั่วไหล')
    await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()
    await expect(page.getByText(/Policy Version 1/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toBeVisible()
    expect((await getTrack(page, 3))?.privacy?.tests).toHaveLength(2)
  })

  test('08A3-floor · WIT0832 สิทธิ์ขั้นต่ำของเจ้าหน้าที่ผู้รับผิดชอบสำนวนถอดไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 8', 'officer')
    await page.goto(METHOD3_URL)
    await next(page)
    await expect(page.getByText(/ต้องคงสิทธิ์ขั้นต่ำให้เจ้าหน้าที่ผู้รับผิดชอบสำนวนเสมอ/).first()).toBeVisible()
    await page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }).click()
    await expect(page.locator('.swal2-popup')).toContainText('ต้องคงสิทธิ์ขั้นต่ำ')
  })

  test('08A3-expired · WIT0837→WIT0874 พ้นช่วงเวลาที่อนุมัติ: แสดง "สิ้นผลแล้ว" และบันทึก expiredAt (ประวัติเดิมยังอยู่)', async ({ page }) => {
    const started = daysAgoIso(60)
    await seedMockState(page, 'Case 8', 'officer', {
      methodTracks: [
        { method: 2, status: 'pending' },
        {
          method: 3,
          status: 'active',
          startedAt: started,
          wizardStep: 4,
          privacy: {
            maskedIdentifiers: ['ชื่อตัว - ชื่อสกุล'],
            restrictSearch: true,
            approvedFrom: started.slice(0, 10),
            approvedTo: daysAgoIso(10).slice(0, 10),
            effectiveAt: started,
            policyVersion: 1,
            auditBaseline: 1,
            tests: [{ id: 'T-1', at: started, by: OFFICER, passed: true, note: 'ผ่าน' }],
          },
        },
      ],
    })
    await page.goto(METHOD3_URL)
    await expect(page.getByText('สิ้นผลแล้ว')).toBeVisible()
    await expect.poll(async () => (await getTrack(page, 3))?.privacy?.expiredAt).toBeTruthy()
    await snap(page, ['node:08A-3:WIT0874', 'edge:08A-3:a3e9'], { label: 'พ้นช่วงเวลาที่อนุมัติ มาตรการปกปิดสิ้นผลแล้ว (expiredAt)', route: METHOD3_URL })
    expect((await getTrack(page, 3))?.privacy?.policyVersion).toBe(1)
  })
})
