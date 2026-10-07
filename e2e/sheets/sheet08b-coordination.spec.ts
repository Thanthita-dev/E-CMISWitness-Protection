import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 08B · WIT0843 → WIT0851 — ประสานหน่วยงานอื่นตามข้อ 15(4)
 *
 * ผัง: WIT0843 หนังสือประสานขาออก → WIT0846 หนังสือตอบกลับขาเข้า → **WIT0844 ผลหนังสือตอบกลับ?**
 *      แขนง "ไม่รับ"  → **WIT0845** บันทึกหนังสือและเหตุผล
 *                        · เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่
 *      แขนง "ตอบรับ" → **WIT0847** เตรียมการส่งมอบ → **WIT0848** ส่งมอบจริงและลงนาม คบ.12
 *                        → WIT0849 หน่วยงานผู้รับดำเนินการคุ้มครอง
 *
 * สองจุดที่เทสต์นี้กัน:
 * 1. WIT0845 ครึ่งหลังต้องเป็นงานจริงในคิว ผบช.ชั้นต้น → ผอ.สำนัก/กอง ไม่ใช่ toast ที่เด้งแล้วหาย
 * 2. คบ.12 ของวิธีที่ 4 ต้องไม่พาแฟ้มเข้าเส้นทางส่งต่อเมื่อครบเพดาน 180 วัน (แท็บ 11C)
 *    — คำสั่งยังอยู่กับ ป.ป.ท.
 *
 * TC mapping (module 08B, TC-086..TC-093):
 *  - TC-087 ถูก map เข้ากับเทสต์ที่มีอยู่เดิม "บันทึกปฏิเสธแล้วการ์ด WIT0845 ต้องเปิดให้เสนอหน่วยงานใหม่" (เปลี่ยนชื่อ)
 *  - TC-086, TC-088..TC-093 เป็นเทสต์ใหม่ที่ต่อท้ายไฟล์นี้
 */

const CASE_NO = 'WP-2569-000501'
const METHOD4_URL = `/protection-method/4?caseNo=${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

const AGENCY_A = 'สำนักงานคุ้มครองพยาน กรมสอบสวนคดีพิเศษ (DSI)'
const AGENCY_B = 'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ'

/** ตั้งต้นที่ WIT0842 — คำสั่งอนุมัติวิธีที่ 4 พยานลงนาม คบ.11 แล้ว แต่ยังไม่ได้ส่งหนังสือประสาน */
const AT_COORDINATION_START = {
  kb11Signed: true,
  approvedMethods: [4],
  methodTracks: [{ method: 4, status: 'pending', coordination: { agency: AGENCY_A, responseStatus: 'awaiting' } }],
  officialLetters: [],
  coordinationProposals: [],
}

/** ตั้งต้นที่ WIT0844 แขนง "ตอบรับ" — หนังสือตอบรับเข้าแฟ้มแล้ว พร้อมนัดส่งมอบ */
const AT_ACCEPTED = {
  ...AT_COORDINATION_START,
  methodTracks: [
    {
      method: 4,
      status: 'preparing',
      wizardStep: 3,
      coordination: {
        agency: AGENCY_A,
        responseStatus: 'accepted',
        contactPerson: 'พ.ต.ท. ธนากร ศรีอุดม',
        acceptedAt: '2569-09-01T03:00:00.000Z',
        handoverAppointmentAt: '2026-09-20T09:00',
        handoverPlace: 'สำนักงาน ป.ป.ท. เขต 1',
        handoverBy: OFFICER,
        handoverTo: 'พ.ต.ท. ธนากร ศรีอุดม',
        disclosureScope: 'ชื่อ-สกุล ที่อยู่ปัจจุบัน และลักษณะภัยคุกคามเท่าที่จำเป็น',
      },
    },
  ],
}

/**
 * กดยืนยันในจอยืนยัน — ทุกปุ่มที่เปลี่ยนสถานะแฟ้มในเส้นทางนี้ต้องผ่านจอนี้ก่อน
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

/**
 * เดิน wizard ของแผงวิธีที่ 4 ไปยัง section ที่ต้องการ (0=หน่วยงาน 1=ขาออก 2=ขาเข้า 3=ส่งมอบ)
 * ขั้นปัจจุบันถูก persist ไว้ในแฟ้ม (track.wizardStep) จึงต้องอ่านจากแถบ "ขั้นตอน X จาก Y" ก่อน
 * แล้วเดินหน้า-ถอยหลังตามส่วนต่าง ไม่ใช่กด "ถัดไป" ตามจำนวน index เสมอ
 */
async function gotoSection(page: Page, index: number) {
  await page.goto(METHOD4_URL)
  const indicator = page.getByText(/ขั้นตอน \d+ จาก \d+/)
  for (let guard = 0; guard < 8; guard++) {
    const current = Number((await indicator.innerText()).match(/ขั้นตอน (\d+)/)![1]) - 1
    if (current === index) return
    await page.getByRole('button', { name: current < index ? 'ถัดไป' : 'ย้อนกลับ' }).click()
  }
  throw new Error(`ไปไม่ถึง section ${index}`)
}

/** WIT0846 แขนง "ไม่รับ" — บันทึกหนังสือปฏิเสธพร้อมเหตุผล */
async function recordDecline(page: Page, reason: string) {
  await gotoSection(page, 2)
  await page.getByTestId('coordination-decline').click()
  await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'เหตุผล (กรณีปฏิเสธ)' }).fill(reason)
  await page.getByTestId('coordination-decline').click()
  await confirmDialog(page, 'ยืนยันบันทึกการปฏิเสธ', 'เริ่มไม่ได้')
}

/** ชั้นผู้บังคับบัญชา: เห็นชอบ/อนุมัติ หรือส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่ */
async function decide(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await gotoSection(page, 2)
  await page.getByTestId('coordination-decision-note').fill(note)
  await page.getByTestId(endorse ? 'coordination-endorse' : 'coordination-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('WIT0845 — หน่วยงานปฏิเสธ: เสนอผู้มีอำนาจพิจารณาหน่วยงานใหม่', () => {
  test('ต้องระบุเหตุผลการปฏิเสธก่อน จึงจะบันทึกได้ และจอยืนยันต้องยกเลิกได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 2)

    // ไม่กรอกเหตุผล — จอยืนยันต้องไม่ขึ้น
    await page.getByTestId('coordination-decline').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // กรอกแล้วกด แต่ยกเลิกในจอยืนยัน — แฟ้มต้องไม่ขยับ
    await page.getByRole('textbox', { name: 'เหตุผล (กรณีปฏิเสธ)' }).fill('อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')
    await page.getByTestId('coordination-decline').click()
    await cancelDialog(page)

    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<Record<string, unknown>>)[0]
    expect((track.coordination as Record<string, unknown>).responseStatus).toBe('awaiting')
    expect(track.status).toBe('pending')
    expect(after?.officialLetters).toEqual([])
  })

  test('TC-087 · [Happy] หน่วยงานปฏิเสธ เสนอผู้มีอำนาจพิจารณาหน่วยงานใหม่ — บันทึกปฏิเสธแล้วการ์ด WIT0845 ต้องเปิดให้เสนอหน่วยงานใหม่ ไม่ใช่แค่ toast', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await recordDecline(page, 'อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')

    const c = await readCase(page, CASE_NO)
    const track = (c?.methodTracks as Array<Record<string, unknown>>)[0]
    expect((track.coordination as Record<string, unknown>).responseStatus).toBe('declined')
    expect(track.status).toBe('blocked')

    await expect(page.getByTestId('wit0845-card')).toBeVisible()
    await expect(page.getByTestId('wit0845-propose')).toBeVisible()
    /** หน่วยงานที่ปฏิเสธไปแล้วต้องไม่อยู่ในตัวเลือกที่เสนอใหม่ */
    await expect(page.getByTestId('coordination-new-agency').locator(`option[value="${AGENCY_A}"]`)).toHaveCount(0)
  })

  test('เสนอหน่วยงานใหม่ → ผบช.ชั้นต้น → ผอ. → วิธีที่ 4 กลับมาเดินต่อกับหน่วยงานใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await recordDecline(page, 'อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')

    // --- ชั้นเจ้าหน้าที่: ครึ่งหลังของ node ต้องเกิดงานจริงในคิวของ ผบช.ชั้นต้น
    await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
    await page.getByTestId('coordination-note').fill('มีชุดปฏิบัติการในพื้นที่และเคยรับดำเนินการคดีลักษณะเดียวกัน')
    await page.getByTestId('coordination-submit').click()
    await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่', 'ผบช.ชั้นต้น')

    let c = await readCase(page, CASE_NO)
    let proposals = c?.coordinationProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(1)
    expect(proposals[0].declinedAgency).toBe(AGENCY_A)
    expect(proposals[0].proposedAgency).toBe(AGENCY_B)
    expect(proposals[0].stage).toBe('supervisor')
    expect(c?.owner).toBe(SUPERVISOR)

    // --- ชั้น ผบช.ชั้นต้น: แฟ้มต้องโผล่ในคิวงานจริง แล้วเห็นชอบเสนอต่อ ผอ.
    await switchRole(page, 'supervisor')
    await page.goto('/queue/supervisor')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    await decide(page, true, 'เห็นควรประสานหน่วยงานที่เสนอ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')

    c = await readCase(page, CASE_NO)
    expect((c?.coordinationProposals as Array<Record<string, unknown>>)[0].stage).toBe('director')
    expect(c?.owner).toBe(DIRECTOR)

    // --- ชั้น ผอ.สำนัก/กอง: อนุมัติแล้ววิธีที่ 4 ต้องกลับมาเดินได้จริง ไม่ใช่ค้างที่ "เริ่มไม่ได้"
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    await decide(page, true, 'อนุมัติให้ประสานหน่วยงานใหม่', 'ยืนยันอนุมัติหน่วยงานใหม่', AGENCY_B)

    c = await readCase(page, CASE_NO)
    proposals = c?.coordinationProposals as Array<Record<string, unknown>>
    expect(proposals[0].stage).toBe('approved')
    expect(proposals[0].appliedAt).toBeTruthy()
    expect(c?.owner).toBe(OFFICER)

    const track = (c?.methodTracks as Array<Record<string, unknown>>)[0]
    const co = track.coordination as Record<string, unknown>
    expect(co.agency).toBe(AGENCY_B)
    expect(co.responseStatus).toBe('awaiting')
    expect(co.declinedReason).toBeFalsy()
    expect(track.status).toBe('preparing')
    /** คำสั่งเดิมยังอยู่ — ไม่ใช่การเปิดคำร้องใหม่หรือส่งเรื่องออกจาก ป.ป.ท. */
    expect(c?.approvedMethods).toEqual([4])
    expect(c?.transferRequest).toBeFalsy()
    expect(c?.next).toContain(AGENCY_B)
  })

  test('ส่งคืนแก้ไขได้ทั้งชั้น ผบช. และ ผอ. — แฟ้มกลับถึงเจ้าหน้าที่และเสนอใหม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await recordDecline(page, 'ไม่มีอำนาจรับดำเนินการในลักษณะที่ขอ')

    await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
    await page.getByTestId('coordination-submit').click()
    await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่')

    // ผบช.ชั้นต้นส่งคืน — ต้องระบุเหตุผลก่อน
    await switchRole(page, 'supervisor')
    await gotoSection(page, 2)
    await page.getByTestId('coordination-return').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await decide(page, false, 'ให้ตรวจเขตอำนาจของหน่วยงานที่เสนอก่อน', 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

    let c = await readCase(page, CASE_NO)
    expect((c?.coordinationProposals as Array<Record<string, unknown>>)[0].stage).toBe('returned')
    expect(c?.owner).toBe(OFFICER)
    /** ส่งคืนแล้ววิธีที่ 4 ต้องยังคง "เริ่มไม่ได้" — ยังไม่มีหน่วยงานที่อนุมัติ */
    expect((c?.methodTracks as Array<Record<string, unknown>>)[0].status).toBe('blocked')

    // เจ้าหน้าที่เสนอใหม่แล้วเดินลำดับชั้นได้อีกรอบ
    await switchRole(page, 'officer')
    await gotoSection(page, 2)
    await page.getByTestId('coordination-new-agency').selectOption('ตำรวจภูธรจังหวัดในพื้นที่')
    await page.getByTestId('coordination-submit').click()
    await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่')

    c = await readCase(page, CASE_NO)
    const proposals = c?.coordinationProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(2)
    expect(proposals[1].proposedAgency).toBe('ตำรวจภูธรจังหวัดในพื้นที่')
    expect(proposals[1].stage).toBe('supervisor')

    // ผอ. ส่งคืนได้เช่นกัน
    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ')
    await switchRole(page, 'director')
    await decide(page, false, 'ให้แนบผลหารือกับหน่วยงานก่อน', 'ยืนยันส่งคืนแก้ไข')

    c = await readCase(page, CASE_NO)
    expect((c?.coordinationProposals as Array<Record<string, unknown>>)[1].stage).toBe('returned')
    expect(c?.owner).toBe(OFFICER)
  })
})

test.describe('WIT0843 / WIT0846 — หนังสือประสานขาออก-ขาเข้า ต้องผ่านจอยืนยัน', () => {
  test('หนังสือขาออก: ต้องมีเลขที่หนังสือ และยืนยันแล้วจึงเข้าทะเบียน', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 1)

    await page.getByTestId('coordination-send-outgoing').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/1234')
    await page.getByTestId('coordination-send-outgoing').click()
    await cancelDialog(page)
    expect((await readCase(page, CASE_NO))?.officialLetters).toEqual([])

    await page.getByTestId('coordination-send-outgoing').click()
    await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', 'ไม่ใช่')

    const c = await readCase(page, CASE_NO)
    const letters = c?.officialLetters as Array<Record<string, unknown>>
    expect(letters).toHaveLength(1)
    expect(letters[0].direction).toBe('outgoing')
    expect(letters[0].context).toBe('method4')
    expect(letters[0].registryNo).toBe('ปปท 0004/1234')
    expect((c?.methodTracks as Array<Record<string, unknown>>)[0].status).toBe('preparing')
  })

  test('หนังสือตอบรับ: ยืนยันแล้วจึงเปิดขั้นเตรียมการส่งมอบ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 2)

    await page.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน' }).fill('พ.ต.ท. ธนากร ศรีอุดม')
    await page.getByTestId('coordination-accept').click()
    await confirmDialog(page, 'ยืนยันบันทึกตอบรับ', 'เตรียมการส่งมอบ')

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.responseStatus).toBe('accepted')
    expect(co.contactPerson).toBe('พ.ต.ท. ธนากร ศรีอุดม')
    /** ตอบรับแล้วการ์ด WIT0845 ต้องไม่อยู่ — ประตู WIT0844 ตัดสินไปอีกแขนงแล้ว */
    await expect(page.getByTestId('wit0845-card')).toBeHidden()
  })
})

test.describe('WIT0847 / WIT0848 — ส่งมอบตามวิธีที่ 4 ต้องไม่หลุดไปเส้นทางครบเพดาน 180 วัน', () => {
  test('ยังไม่มีหนังสือตอบรับ ห้ามบันทึกส่งมอบจริง', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 3)

    await expect(page.getByTestId('handover-blocked-note')).toBeVisible()
    await page.getByTestId('coordination-complete-handover').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeFalsy()
  })

  test('บันทึกส่งมอบจริงจากแผงวิธีที่ 4 — คำสั่งยังอยู่กับ ป.ป.ท. ไม่สร้างคำขอส่งมอบของ 11C', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACCEPTED)
    await page.goto(METHOD4_URL)

    await page.getByTestId('coordination-complete-handover').click()
    await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12', 'คำสั่งยังอยู่กับ ป.ป.ท.')

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeTruthy()
    expect(co.operationStartedAt).toBeTruthy()

    /** จุดที่ผังกันไว้: ต้องไม่เข้าเส้นทางส่งต่อเมื่อครบเพดาน (แท็บ 11C) */
    expect(c?.transferRequest).toBeFalsy()
    expect(c?.stage).not.toBe('transferred')
    expect(String(c?.status)).not.toContain('รอส่งมอบพยานให้')
    expect(String(c?.status)).toContain('วิธีที่ 4')
  })

  test('ปุ่ม "เปิดแบบ คบ.12" ของวิธีที่ 4 ต้องพาไปแบบในบริบทวิธีที่ 4 และบันทึกแล้วไม่พาแฟ้มออกนอกเส้นทาง', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACCEPTED)
    await page.goto(METHOD4_URL)

    await page.getByTestId('open-kb12-method4').click()
    await expect(page).toHaveURL(/context=method4/)

    /** แบบต้องบอกบริบทและล็อกหน่วยงานให้ตรงกับที่ประสานไว้ ไม่ให้เลือกใหม่จนคลาดกับหนังสือประสาน */
    await expect(page.getByTestId('kb12-context-banner')).toContainText('วิธีที่ 4')
    await expect(page.getByTestId('kb12-method4-agency')).toContainText(AGENCY_A)

    await page.getByTestId('kb12-save').click()
    await confirmDialog(page, 'ยืนยันส่งมอบตามวิธีที่ 4', 'คำสั่งยังอยู่กับ ป.ป.ท.')

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeTruthy()
    /** เดิมกดปุ่มนี้แล้วแฟ้มจะกลายเป็น "รอส่งมอบพยานให้ … (คบ.12)" ของเส้นทาง 11C */
    expect(c?.transferRequest).toBeFalsy()
    expect(String(c?.status)).not.toContain('รอส่งมอบพยานให้')
  })

  test('WIT0849 — ส่งมอบแล้วจึงเปิดปุ่มให้บันทึกวันเริ่มปฏิบัติจริงของหน่วยงานผู้รับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACCEPTED)
    await page.goto(METHOD4_URL)

    await expect(page.getByTestId('method-4-start')).toBeHidden()

    await page.getByTestId('coordination-complete-handover').click()
    await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12')

    await page.getByTestId('method-4-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'Episode')

    const c = await readCase(page, CASE_NO)
    expect((c?.methodTracks as Array<Record<string, unknown>>)[0].status).toBe('active')
  })
})

// ---------------------------------------------------------------------------
// TC-086 .. TC-093 — เพิ่มเติมตามใบทดสอบ module 08B
// ---------------------------------------------------------------------------

/** วิธีที่ 4 กำลังปฏิบัติแล้ว (หลังส่งมอบ+เริ่มจริง) พร้อม policeAckAt เพื่อให้แผงปฏิบัติการ (แท็บ 10) ในหน้าแฟ้มเปิดใช้งานได้ */
const AT_ACTIVE_METHOD4 = {
  ...AT_ACCEPTED,
  stage: 'protection',
  policeAckAt: '2026-09-01T00:00:00.000Z',
  methodTracks: [
    {
      method: 4,
      status: 'active',
      wizardStep: 3,
      startedAt: '2026-09-05T02:00:00.000Z',
      coordination: {
        ...AT_ACCEPTED.methodTracks[0].coordination,
        handoverCompletedAt: '2026-09-05T02:00:00.000Z',
        operationStartedAt: '2026-09-05T02:00:00.000Z',
      },
    },
  ],
}

test.describe('TC-086 — ประสานฯ ครบเส้นทาง: ส่งขาออก → ตอบรับ → ส่งมอบและลงนาม คบ.12', () => {
  test('TC-086 · [Happy] ส่งหนังสือประสาน ได้รับตอบรับ ส่งมอบพยานและลงนาม คบ.12', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)

    // WIT0843 — ส่งหนังสือประสานขาออก
    await gotoSection(page, 1)
    await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/9001')
    await page.getByTestId('coordination-send-outgoing').click()
    await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก')

    let c = await readCase(page, CASE_NO)
    let letters = c?.officialLetters as Array<Record<string, unknown>>
    expect(letters).toHaveLength(1)
    expect(letters[0].direction).toBe('outgoing')
    expect(letters[0].registryNo).toBe('ปปท 0004/9001')
    expect(letters[0].sentAt).toBeTruthy()
    expect((c?.methodTracks as Array<Record<string, unknown>>)[0].status).toBe('preparing')

    // WIT0846 — รับหนังสือตอบรับขาเข้าและอัปโหลด
    await gotoSection(page, 2)
    await page.getByRole('textbox', { name: 'เลขที่หนังสือรับ' }).fill('ตร. 0011/500')
    await page.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน' }).fill('พ.ต.ท. ธนากร ศรีอุดม')
    await page.getByTestId('coordination-accept').click()
    await confirmDialog(page, 'ยืนยันบันทึกตอบรับ', 'เตรียมการส่งมอบ')

    c = await readCase(page, CASE_NO)
    letters = c?.officialLetters as Array<Record<string, unknown>>
    expect(letters).toHaveLength(2)
    expect(letters[1].direction).toBe('incoming')
    expect(letters[1].registryNo).toBe('ตร. 0011/500')
    let co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.responseStatus).toBe('accepted')
    expect(co.contactPerson).toBe('พ.ต.ท. ธนากร ศรีอุดม')

    // WIT0847 — เตรียมร่าง คบ.12 และนัดวันส่งมอบ
    await gotoSection(page, 3)
    await page.getByLabel('วันเวลานัดส่งมอบ').fill('2026-09-20T09:00')
    await page.getByLabel('สถานที่ส่งมอบ').fill('สำนักงาน ป.ป.ท. เขต 1')
    await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
    await page.getByLabel('ผู้รับมอบ').fill('พ.ต.ท. ธนากร ศรีอุดม')
    await page.getByLabel('ขอบเขตข้อมูลที่เปิดเผยได้').fill('ชื่อ-สกุล ที่อยู่ปัจจุบัน และลักษณะภัยคุกคามเท่าที่จำเป็น')

    // WIT0848 — ส่งมอบจริงและลงนาม คบ.12
    await page.getByTestId('coordination-complete-handover').click()
    await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12')

    c = await readCase(page, CASE_NO)
    co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeTruthy()
    expect(co.operationStartedAt).toBeTruthy()
    expect(co.agency).toBe(AGENCY_A)
    expect(co.handoverAppointmentAt).toBe('2026-09-20T09:00')
    expect(String(c?.status)).toContain('(คบ.12)')

    await expect(page.getByTestId('method-4-start')).toBeVisible()
  })
})

test.describe('TC-088 — รับรายงาน คบ.13 ประจำเดือนจากหน่วยงานผู้รับ', () => {
  test('TC-088 · [Happy] หน่วยงานผู้รับดำเนินการคุ้มครอง ครบรอบเดือนแล้วบันทึกรายงาน คบ.13', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACTIVE_METHOD4)
    await page.goto(`/dossier/${CASE_NO}`)

    await page.getByRole('button', { name: 'ส่งรายงาน คบ.13' }).click()
    await page
      .getByPlaceholder('สรุปผลการปฏิบัติงานคุ้มครองในรอบเดือน...')
      .fill('หน่วยงานผู้รับดำเนินการคุ้มครองต่อเนื่อง ไม่มีเหตุผิดปกติในรอบ ก.ย. 2569')
    await page.getByRole('button', { name: 'ส่งรายงานงวดนี้' }).click()

    const c = await readCase(page, CASE_NO)
    const reports = c?.monthlyReports as Array<Record<string, unknown>>
    expect(reports).toHaveLength(1)
    expect(reports[0].summary).toContain('ก.ย. 2569')
    expect((c?.extraForms as number[]) || []).toContain(13)
    // สถานะวิธีที่ 4 ต้องยังเป็น active ต่อเนื่อง ไม่ถูกรายงานประจำเดือนทำให้หลุดสถานะ
    expect((c?.methodTracks as Array<Record<string, unknown>>)[0].status).toBe('active')
    await expect(page.getByTestId('dossier-forms')).toContainText('คบ.13')
  })
})

test.describe('TC-089 — ห้ามส่งมอบพยานผ่านช่องทางไปรษณีย์', () => {
  test('TC-089 · [Negative] ช่องทางไปรษณีย์ใช้ได้เฉพาะกับหนังสือ ไม่มีช่องทางส่งมอบพยานทางไปรษณีย์', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)

    // WIT0843 — ช่องทางนำส่ง "ไปรษณีย์" มีไว้สำหรับหนังสือเท่านั้น
    await gotoSection(page, 1)
    const channelSelect = page.getByLabel('ช่องทางนำส่ง')
    const channelOptions = await channelSelect.locator('option').allTextContents()
    expect(channelOptions.join(' ')).toContain('ไปรษณีย์')

    // WIT0847 — ขั้นเตรียมส่งมอบพยานจริง ต้องไม่มีตัวเลือกช่องทาง (ไม่ใช่ไปรษณีย์ได้เลย) มีแต่การนัดหมาย
    await gotoSection(page, 3)
    await expect(page.getByText('ช่องทางส่งหนังสือไม่ใช่การส่งมอบพยาน')).toBeVisible()
    await expect(page.getByText(/ไปรษณีย์ใช้ส่งเอกสารเท่านั้น/)).toBeVisible()
    await expect(page.getByLabel('ช่องทางนำส่ง')).toHaveCount(0)
    await expect(page.getByLabel('วันเวลานัดส่งมอบ')).toBeVisible()
  })
})

test.describe('TC-090 — ห้ามนัดส่งมอบก่อนได้รับหนังสือตอบรับ', () => {
  test('TC-090 · [Negative] ส่งหนังสือประสานแล้วแต่ยังไม่มีตอบกลับ ต้องบันทึกส่งมอบจริงไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 3)

    await expect(page.getByTestId('handover-blocked-note')).toBeVisible()
    await page.getByTestId('coordination-complete-handover').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeFalsy()
    expect(co.responseStatus).toBe('awaiting')
  })
})

test.describe('TC-091 — ส่งมอบโดยไม่มี คบ.11 ลงนาม / ไม่มีความยินยอมใน คบ.5', () => {
  test('TC-091 · [Negative] ไม่มี คบ.11 ลงนามและไม่มีความยินยอม — ระบบต้องบล็อกขั้นตอนส่งมอบและแจ้งเอกสารที่ขาด', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      ...AT_ACCEPTED,
      kb11Signed: false,
      consents: [],
    })
    await page.goto(METHOD4_URL)

    // ปัจจุบัน: แผงวิธีที่ 4 ตรวจเฉพาะ responseStatus==='accepted' เท่านั้น
    // ไม่เคยตรวจ kb11Signed หรือความยินยอม คบ.5 เลย — ปุ่มส่งมอบยังกดผ่านได้ทั้งที่เอกสารยังไม่ครบ
    await expect(page.getByTestId('coordination-complete-handover')).toBeDisabled()

    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.handoverCompletedAt).toBeFalsy()
  })
})

test.describe('TC-092 — วันส่งมอบจริงต้องแยกจากวันอัปโหลดเอกสาร', () => {
  test('TC-092 · [Edge] ระบบต้องเก็บวันส่งมอบจริงแยกจากวันบันทึก/อัปโหลด และใช้วันส่งมอบจริงนับระยะคุ้มครอง', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACCEPTED)
    await page.goto(METHOD4_URL)

    // ปัจจุบัน: ไม่มีช่องกรอกวันส่งมอบจริงแยกจากวันบันทึก — handoverCompletedAt และ operationStartedAt
    // ถูกตั้งค่าเป็นเวลาที่กดปุ่มเสมอทั้งคู่ (เช่น ส่งมอบจริง 5 ก.ย. แต่มาบันทึก/อัปโหลด 9 ก.ย. ก็ไม่มีทางแยกได้)
    await expect(page.getByLabel(/วันที่ส่งมอบจริง|วันส่งมอบจริง/)).toBeVisible()
  })
})

test.describe('TC-093 — เหตุสำคัญระหว่างรอบรายงาน ต้องแยกจากรอบรายงานประจำเดือน', () => {
  test('TC-093 · [Edge] บันทึกเหตุสำคัญกลางเดือนทันที แยกจากรอบ คบ.13 ประจำเดือน', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_ACTIVE_METHOD4)
    await page.goto(`/dossier/${CASE_NO}`)

    await page.getByRole('button', { name: 'รายงานเหตุสำคัญ' }).click()
    await page.getByPlaceholder('หัวข้อเหตุการณ์ เช่น พบบุคคลต้องสงสัยเฝ้าสังเกตการณ์').fill('พยานถูกคุกคามซ้ำ')
    await page
      .getByPlaceholder('รายละเอียดและการดำเนินการของชุดคุ้มครอง...')
      .fill('พบบุคคลต้องสงสัยติดตามที่พักพยาน แจ้งชุดคุ้มครองเพิ่มความถี่ตรวจตรา')
    await page.getByRole('button', { name: 'บันทึกเหตุการณ์' }).click()

    const c = await readCase(page, CASE_NO)
    const events = c?.importantEvents as Array<Record<string, unknown>>
    expect(events).toHaveLength(1)
    expect(events[0].title).toBe('พยานถูกคุกคามซ้ำ')
    // บันทึกทันทีแยกจาก monthlyReports ของรอบ คบ.13 — ยังไม่มีรายงานประจำเดือนใด ๆ ในแฟ้ม
    expect((c?.monthlyReports as unknown[]) || []).toHaveLength(0)

    // ปัจจุบัน: เหตุสำคัญถูกบันทึกไว้ในแฟ้มเท่านั้น (ผ่าน logHistory) ไม่มีการสร้างรายการใน
    // useNotificationStore เลย — หน้า /notifications จึงไม่มีรายการแจ้งเตือนนี้ให้ผู้รับผิดชอบเห็น
    // Expected: ระบบต้องแจ้งเตือนผู้รับผิดชอบทันทีเมื่อบันทึกเหตุสำคัญ
    await page.goto('/notifications')
    await expect(page.getByText('พยานถูกคุกคามซ้ำ')).toBeVisible()
  })
})

test.describe('WIT0842 / WIT0846 — เพิ่มหน่วยงานเอง และแนบไฟล์หนังสือตอบกลับขาเข้า', () => {
  const NEW_AGENCY = 'ศูนย์คุ้มครองพยาน ตำรวจภูธรภาค 5'

  test('เพิ่มหน่วยงานใหม่แล้วถูกเลือกในแฟ้มนี้ และอยู่ในรายการให้เลือกซ้ำได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 0)

    await page.getByTestId('coordination-agency').selectOption('__add__')
    await page.getByRole('textbox', { name: 'ชื่อหน่วยงานที่จะเพิ่ม' }).fill(NEW_AGENCY)
    await page.getByTestId('coordination-agency-add-confirm').click()

    await expect(page.getByTestId('coordination-agency')).toHaveValue(NEW_AGENCY)
    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.agency).toBe(NEW_AGENCY)

    /** เปลี่ยนกลับไปหน่วยงานเดิมแล้ว หน่วยงานที่เพิ่มต้องยังอยู่ในรายการ */
    await page.getByTestId('coordination-agency').selectOption(AGENCY_B)
    await page.reload()
    await expect(page.getByTestId('coordination-agency').locator('option', { hasText: NEW_AGENCY })).toHaveCount(1)
  })

  test('แนบ PDF หนังสือตอบกลับแล้วบันทึกตอบรับ — ชื่อไฟล์เข้าทะเบียนหนังสือ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 2)

    await page.getByTestId('coordination-incoming-file-input').setInputFiles({
      name: 'หนังสือตอบรับ-DSI.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n%%EOF'),
    })
    await expect(page.getByRole('link', { name: 'หนังสือตอบรับ-DSI.pdf' })).toBeVisible()

    await page.getByTestId('coordination-accept').click()
    await confirmDialog(page, 'ยืนยันบันทึกตอบรับ', 'หนังสือตอบรับ-DSI.pdf')

    const c = await readCase(page, CASE_NO)
    const letters = c?.officialLetters as Array<Record<string, unknown>>
    const incoming = letters.find((l) => l.direction === 'incoming')
    expect(incoming?.documentName).toBe('หนังสือตอบรับ-DSI.pdf')
  })

  test('ไม่แนบไฟล์ก็บันทึกตอบรับได้ (ไม่บังคับ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)
    await gotoSection(page, 2)
    await page.getByTestId('coordination-accept').click()
    await confirmDialog(page, 'ยืนยันบันทึกตอบรับ')
    const c = await readCase(page, CASE_NO)
    const co = (c?.methodTracks as Array<Record<string, unknown>>)[0].coordination as Record<string, unknown>
    expect(co.responseStatus).toBe('accepted')
  })
})
