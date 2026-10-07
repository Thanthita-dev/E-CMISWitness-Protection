import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 11A · WIT1105 → WIT1107 → **WIT1110** — เปลี่ยนวิธี/เงื่อนไข: เสนออนุมัติและปรับ คบ.11
 *
 * ผัง: WIT1105 จัดทำข้อเสนอผลทบทวน → WIT1106 ผู้บังคับบัญชาตรวจ → **WIT1107 แนวทางที่ต้องดำเนินการ?**
 *      แขนง "เปลี่ยนวิธี" → **WIT1110** เสนออนุมัติและปรับ คบ.11
 *                            · ถ้าเปลี่ยนเป็นวิธีที่ 1 จึงจัดทำ/แก้ คบ.8 แล้วไป 08A/08B
 *
 * สามจุดที่เทสต์นี้กัน:
 * 1. แขนง "เปลี่ยนวิธี" ต้องไม่จบที่ป้ายสถานะ — ต้องมีด่านอนุมัติจริง ผบช.ชั้นต้น → ผอ.สำนัก/กอง
 * 2. อนุมัติแล้วต้องเกิดผลจริงกับแฟ้ม — ชุดวิธีถูกแทนที่ และความยินยอมตาม คบ.11 เดิมถูกล้าง
 * 3. วิธีใหม่รวมวิธีที่ 1 ต้องบังคับจัดทำ/แก้ คบ.8 ให้ลงนามก่อน จึงเริ่มปฏิบัติได้ (คบ.5 เดิมข้ามไม่ได้)
 */

const CASE_NO = 'WP-2569-000501'
const REVIEW_URL = `/protection-review/${CASE_NO}`
const METHOD1_URL = `/protection-method/1?caseNo=${CASE_NO}`

/** ตั้งต้นที่ WIT1104 — แฟ้มถูกส่งเข้าทบทวนแล้ว ปัจจุบันคุ้มครองด้วยวิธีที่ 1 และลงนาม คบ.11 / คบ.8 แล้ว */
const AT_REVIEW_START = {
  approvedMethods: [1],
  methodTracks: [{ method: 1, status: 'active', startedAt: '2026-09-10T00:00:00.000Z' }],
  kb11Signed: true,
  consents: [{ ref: 'kb11', consented: true, at: '10/09/2569 12:00', by: 'สมชาย ใจดี' }],
  reviewProposals: [],
  methodChangeProposals: [],
}

/** ข้ามขั้น WIT1105-WIT1107 มาแล้ว — ข้อเสนอ "เปลี่ยนวิธี" ผ่านการเห็นชอบและถูกเลือกเป็นแนวทางแล้ว */
const AT_WIT1110 = {
  ...AT_REVIEW_START,
  reviewProposals: [
    {
      id: 'RV-SEED',
      createdAt: '10/09/2569 13:30',
      createdBy: 'นางสาวอรุณี ใจมั่น',
      cumulativeDays: 1,
      remainingDays: 179,
      riskSummary: 'ความเสี่ยงเปลี่ยนรูปแบบ ภัยมาจากการเปิดเผยข้อมูลมากกว่าการประทุษร้ายต่อร่างกาย',
      performanceSummary: 'ชุดคุ้มครองปฏิบัติได้ตามแผน แต่ไม่ตอบภัยที่เปลี่ยนไป',
      issues: 'วิธีที่ใช้อยู่ไม่เหมาะสมกับลักษณะภัยปัจจุบัน',
      proposedOutcome: 'change_method',
      reason: 'ผลทบทวนตาม คบ.13 งวด 09/2569',
      status: 'endorsed',
      reviewedAt: '10/09/2569 14:00',
      reviewedBy: 'นายกิตติศักดิ์ ธรรมรักษ์',
      appliedOutcome: 'change_method',
      appliedAt: '10/09/2569 14:10',
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

/** WIT1110 ชั้นเจ้าหน้าที่ — เลือกชุดวิธีใหม่ เงื่อนไขที่ขอปรับ และเหตุผล แล้วเสนอตามลำดับชั้น */
async function propose(page: Page, methods: number[], reason: string, conditions?: string) {
  await page.goto(REVIEW_URL)
  const card = page.getByTestId('wit1110-card')
  await expect(card).toBeVisible()
  for (const m of [1, 2, 3, 4]) {
    const box = page.getByTestId(`method-change-option-${m}`)
    if ((await box.isChecked()) !== methods.includes(m)) await box.click()
  }
  if (conditions) await page.getByTestId('method-change-conditions').fill(conditions)
  await page.getByTestId('method-change-reason').fill(reason)
  await page.getByTestId('method-change-submit').click()
}

/** ชั้นผู้บังคับบัญชา: เห็นชอบ/อนุมัติ หรือส่งคืนแก้ไขข้อเสนอเปลี่ยนวิธี */
async function decide(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await page.goto(REVIEW_URL)
  await page.getByTestId('method-change-decision-note').fill(note)
  await page.getByTestId(endorse ? 'method-change-endorse' : 'method-change-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('WIT1107 → WIT1110 — แขนง "เปลี่ยนวิธี" ต้องเปิดงานเสนออนุมัติจริง (TC-127)', () => {
  test('TC-127 · (1) [Happy] เดิน WIT1105-WIT1107 ผ่านจอยืนยันทุกขั้น แล้วแขนงเปลี่ยนวิธีเปิดการ์ด WIT1110', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', AT_REVIEW_START)
    await page.goto(REVIEW_URL)

    // WIT1105 — จัดทำข้อเสนอโดยเลือกแนวทาง "เปลี่ยนวิธี / เงื่อนไข"
    await page.getByTestId('review-outcome-change_method').click()
    await page
      .getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ })
      .fill('ภัยเปลี่ยนเป็นการไล่ล่าข้อมูลส่วนบุคคล ไม่ใช่การประทุษร้ายต่อร่างกาย')
    await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ผลทบทวนตาม คบ.13 งวด 09/2569')
    await page.getByTestId('review-submit-proposal').click()
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน', 'เปลี่ยนวิธี / เงื่อนไข')

    // WIT1106 — ผู้บังคับบัญชาตรวจและเห็นชอบ
    await switchRole(page, 'supervisor')
    await page.getByTestId('review-endorse').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ส่งงานไปยังปลายทางของแนวทางที่เห็นชอบ')

    // WIT1107 — เจ้าหน้าที่ส่งงานไปตามแนวทางที่เห็นชอบ
    await switchRole(page, 'officer')
    await page.getByTestId('review-apply-outcome').click()
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'เสนออนุมัติและปรับ คบ.11')

    // WIT1110 — แขนงนี้ต้องมีงานต่อจริง ไม่จบที่ป้ายสถานะ
    await expect(page.getByTestId('wit1110-card')).toBeVisible()
    await expect(page.getByTestId('wit1110-propose')).toBeVisible()

    const after = await readCase(page, CASE_NO)
    const proposal = (after?.reviewProposals as Array<Record<string, unknown>>)[0]
    expect(proposal.appliedOutcome).toBe('change_method')
    // ยังไม่อนุมัติ — ชุดวิธีเดิมต้องไม่ขยับ
    expect(after?.approvedMethods).toEqual([1])
  })

  test('TC-127 · (2) [Negative] ต้องเลือกวิธีและระบุเหตุผลก่อน จึงจะเสนอได้ และจอยืนยันต้องยกเลิกได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', AT_WIT1110)

    // ไม่เลือกวิธีเลย — จอยืนยันต้องไม่ขึ้น
    await propose(page, [], '')
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // เลือกวิธีแล้วแต่ไม่กรอกเหตุผล — จอยืนยันต้องไม่ขึ้น
    await propose(page, [3], '')
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // ชุดวิธีไม่ต่างจากเดิมและไม่ระบุเงื่อนไข — จอยืนยันต้องไม่ขึ้น
    await propose(page, [1], 'ขอคงวิธีเดิม')
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // ครบแล้วแต่ยกเลิกในจอยืนยัน — แฟ้มต้องไม่ขยับ
    await propose(page, [3], 'ภัยเปลี่ยนเป็นการเปิดเผยข้อมูล')
    await cancelDialog(page)

    const after = await readCase(page, CASE_NO)
    expect(after?.methodChangeProposals).toEqual([])
    expect(after?.approvedMethods).toEqual([1])
  })

  test('TC-127 · (3) [Negative] ส่งคืนแก้ไขที่ชั้น ผบช.ชั้นต้น — แฟ้มกลับหาเจ้าหน้าที่และเสนอใหม่ได้ ชุดวิธีเดิมไม่ขยับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', AT_WIT1110)

    await propose(page, [3], 'ภัยเปลี่ยนเป็นการเปิดเผยข้อมูล')
    await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี', 'ผบช.ชั้นต้น')

    await switchRole(page, 'supervisor')
    await decide(page, false, 'ยังไม่ครอบคลุมความเสี่ยงด้านการเดินทาง ให้ทบทวนใหม่', 'ยืนยันส่งคืนแก้ไข')

    const returned = await readCase(page, CASE_NO)
    const list = returned?.methodChangeProposals as Array<Record<string, unknown>>
    expect(list).toHaveLength(1)
    expect(list[0].stage).toBe('returned')
    expect(returned?.approvedMethods).toEqual([1])
    expect(returned?.kb11Signed).toBe(true)

    // เสนอใหม่ได้หลังถูกส่งคืน
    await switchRole(page, 'officer')
    await propose(page, [2, 3], 'เพิ่มสถานที่ปลอดภัยควบคู่กับการปกปิดข้อมูล')
    await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี')

    const resubmitted = await readCase(page, CASE_NO)
    const again = resubmitted?.methodChangeProposals as Array<Record<string, unknown>>
    expect(again).toHaveLength(2)
    expect(again[1].stage).toBe('supervisor')
    expect(again[1].proposedMethods).toEqual([2, 3])
  })

  test('TC-127 · (4) [Happy] อนุมัติครบลำดับชั้นแล้วต้องเปลี่ยนชุดวิธีจริง และล้างความยินยอมตาม คบ.11 เดิม', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', AT_WIT1110)

    await propose(page, [2, 3], 'ย้ายไปสถานที่ปลอดภัยและปกปิดข้อมูล', 'จำกัดการเข้าถึงข้อมูลเฉพาะชุดคุ้มครอง 3 นาย')
    await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี', 'ผบช.ชั้นต้น')

    // ผบช.ชั้นต้นเห็นชอบ — ยังไม่เปลี่ยนชุดวิธี
    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นชอบตามที่เสนอ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
    const midway = await readCase(page, CASE_NO)
    expect((midway?.methodChangeProposals as Array<Record<string, unknown>>)[0].stage).toBe('director')
    expect(midway?.approvedMethods).toEqual([1])
    expect(midway?.kb11Signed).toBe(true)

    // ผอ. อนุมัติ — ปรับ คบ.11 เป็นชุดวิธีใหม่จริง
    await switchRole(page, 'director')
    await decide(page, true, 'อนุมัติให้เปลี่ยนวิธี', 'ยืนยันอนุมัติเปลี่ยนวิธี', 'ล้างความยินยอมตาม คบ.11 เดิม')

    const after = await readCase(page, CASE_NO)
    const proposal = (after?.methodChangeProposals as Array<Record<string, unknown>>)[0]
    expect(proposal.stage).toBe('approved')
    expect(proposal.appliedAt).toBeTruthy()
    expect(after?.approvedMethods).toEqual([2, 3])
    expect((after?.methodTracks as Array<Record<string, unknown>>).map((t) => t.method)).toEqual([2, 3])
    // ความยินยอมตาม คบ.11 เดิมใช้ต่อไม่ได้ — ต้องขอใหม่ทุกวิธี
    expect(after?.kb11Signed).toBe(false)
    expect(after?.consents).toEqual([])
    expect(String(after?.next)).toContain('ความยินยอม')
  })

  test('TC-127 · (5) [Edge] เปลี่ยนเป็นวิธีที่ 1 — บังคับจัดทำ/แก้ คบ.8 ให้ลงนามก่อน จึงเริ่มปฏิบัติได้', async ({ page }) => {
    // ตั้งต้นด้วยวิธีที่ 3 และมีคำสั่งชั่วคราว คบ.5 อนุมัติอยู่ — ต้องข้ามขั้น คบ.8 ไม่ได้
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_WIT1110,
      approvedMethods: [3],
      methodTracks: [{ method: 3, status: 'active', startedAt: '2026-09-10T00:00:00.000Z' }],
      kb5Approved: true,
      kb8Signed: true,
      kb8SignedAt: '10/09/2569 12:23',
      kb8SignedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
    })

    await propose(page, [1], 'ภัยกลับมาเป็นการประทุษร้ายต่อร่างกาย ต้องใช้ชุดคุ้มครอง')
    await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี')

    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นชอบตามที่เสนอ', 'ยืนยันเห็นชอบ')

    await switchRole(page, 'director')
    await decide(page, true, 'อนุมัติให้เปลี่ยนเป็นวิธีที่ 1', 'ยืนยันอนุมัติเปลี่ยนวิธี', 'คบ.8')

    const after = await readCase(page, CASE_NO)
    expect(after?.approvedMethods).toEqual([1])
    // คบ.8 ฉบับเดิมผูกกับชุดวิธีเดิม — ลายมือชื่อถูกล้างให้จัดทำ/แก้เป็นฉบับใหม่
    expect(after?.kb8SignedAt).toBeFalsy()
    expect(String(after?.next)).toContain('คบ.8')

    // แผงวิธีที่ 1 ต้องยังเริ่มปฏิบัติไม่ได้ แม้มี คบ.5 อนุมัติอยู่
    await switchRole(page, 'officer')
    await page.goto(METHOD1_URL)
    await expect(page.getByText(/เปลี่ยนมาเป็นวิธีที่ 1 ตามข้อเสนอที่อนุมัติ/)).toBeVisible()
    await expect(page.getByText(/ต้องจัดทำ\/แก้ คบ\.8/)).toBeVisible()
  })
})

/**
 * Sheet 11A · WIT1104 → WIT1107 — แขนงอื่นของจุดแยกทาง (คุ้มครองต่อ / ขยายเวลา / ยุติ / ข้อ 14)
 * และกฎการคำนวณระยะสะสม/เอกสารประกอบที่บังคับใช้ก่อนเข้าแขนงใดแขนงหนึ่ง
 */

/** วันที่ N วันก่อนวันนี้ (ISO) — คำนวณ Episode ให้ได้ยอดสะสมตรงตามที่แต่ละ TC ต้องการ ไม่ผูกกับวันที่รันเทสต์ */
const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/** Episode วิธีที่ 1 เดียว Phase MAIN เปิดต่อเนื่องมา ให้ยอดสะสม ณ วันนี้ = cumulativeDays วันพอดี */
function reviewEpisode(cumulativeDays: number, idSuffix: string) {
  const startedAt = daysAgoIso(cumulativeDays - 1)
  return {
    episode: {
      id: `EP-${idSuffix}`,
      openedAt: startedAt,
      phases: [{ id: `PH-${idSuffix}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.8' }],
    },
    methodTracks: [{ method: 1 as const, status: 'active' as const, startedAt }],
  }
}

/** WIT1105 ชั้นเจ้าหน้าที่ — เลือกแนวทางที่เสนอ กรอกผลประเมิน และเหตุผล แล้วเสนอผู้บังคับบัญชา */
async function submitProposal(
  page: Page,
  outcome: 'continue' | 'extend' | 'change_method' | 'terminate' | 'article14',
  fields: { riskSummary: string; reason: string }
) {
  await page.goto(REVIEW_URL)
  await page.getByTestId(`review-outcome-${outcome}`).click()
  await page
    .getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ })
    .fill(fields.riskSummary)
  await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill(fields.reason)
  await page.getByTestId('review-submit-proposal').click()
}

/** WIT1106 ชั้นผู้บังคับบัญชา — เห็นชอบหรือส่งคืนแก้ไขข้อเสนอผลทบทวน */
async function decideProposal(page: Page, endorse: boolean, note: string) {
  await page.goto(REVIEW_URL)
  if (note) await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill(note)
  await page.getByTestId(endorse ? 'review-endorse' : 'review-return').click()
}

/** WIT1107 ชั้นเจ้าหน้าที่ — ส่งงานไปตามแนวทางที่เห็นชอบแล้ว */
async function applyOutcome(page: Page) {
  await page.goto(REVIEW_URL)
  await page.getByTestId('review-apply-outcome').click()
}

test.describe('WIT1104 → WIT1107 — แขนงอื่นของจุดแยกทางหลังทบทวนผล', () => {
  test('TC-125 · [Happy] ทบทวนแล้วคุ้มครองต่อภายใต้คำสั่งเดิม (WIT1108) — คำสั่งเดิมยังมีผล', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      ...reviewEpisode(60, 'TC125'),
    })

    await submitProposal(page, 'continue', {
      riskSummary: 'ความเสี่ยงคงเดิม ภัยยังอยู่ในระดับที่ประเมินไว้ วิธีที่ใช้อยู่ยังเหมาะสม',
      reason: 'ผลทบทวนตาม คบ.13 งวดล่าสุด ยังไม่มีเหตุเปลี่ยนแปลง',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    await switchRole(page, 'supervisor')
    await decideProposal(page, true, 'เห็นชอบให้คุ้มครองต่อ')
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    await switchRole(page, 'officer')
    await applyOutcome(page)
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'กำหนดรอบ คบ.13 ถัดไป')

    await expect(page.getByText('เลือกแนวทางแล้ว: คุ้มครองต่อภายใต้คำสั่งเดิม')).toBeVisible()
    await expect(page.getByRole('link', { name: /ไปรายงานผลการคุ้มครอง · กำหนดรอบ คบ\.13 ถัดไป/ })).toBeVisible()

    const after = await readCase(page, CASE_NO)
    expect(after?.status).toBe('คุ้มครองต่อภายใต้คำสั่งเดิม')
    expect(after?.stage).toBe('protection')
    // คำสั่งเดิม (คบ.11/ชุดวิธี) ยังมีผล ไม่ถูกแตะต้อง
    expect(after?.kb11Signed).toBe(true)
    expect(after?.approvedMethods).toEqual([1])
  })

  test('TC-126 · [Happy] ยังไม่ครบเพดาน เลือกขยายเวลา ส่งไปแท็บ 11B (WIT1109)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      ...reviewEpisode(120, 'TC126'),
    })

    await submitProposal(page, 'extend', {
      riskSummary: 'ภัยยังไม่คลี่คลาย ต้องคุ้มครองต่อเนื่องเกินกำหนดคำสั่งเดิม',
      reason: 'ขอขยายเวลาอีก 30 วันตามผลประเมินความเสี่ยงล่าสุด',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    await switchRole(page, 'supervisor')
    await decideProposal(page, true, 'เห็นชอบให้ขยายเวลา')
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    await switchRole(page, 'officer')
    await applyOutcome(page)
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'คบ.14')

    await expect(page.getByText(/เลือกแนวทางแล้ว: ขยายระยะเวลา/)).toBeVisible()
    await expect(page.getByTestId('review-goto-11b')).toBeVisible()

    const after = await readCase(page, CASE_NO)
    expect(after?.status).toBe('ดำเนินการขอขยายระยะเวลา (คบ.14)')
    expect(String(after?.next)).toContain('คบ.14')
  })

  test('TC-128 · [Negative] ครบเพดาน 180 วันแต่ยังมีภัย — ห้ามขยายด้วย คบ.14 บังคับไปเส้นทางข้อ 14 (WIT1149)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      ...reviewEpisode(180, 'TC128'),
    })
    await page.goto(REVIEW_URL)

    // ตัวเลือก "ขยายระยะเวลา" ต้องถูกปิดไว้ตั้งแต่ต้นเมื่อครบเพดานแล้ว
    await expect(page.getByTestId('review-outcome-extend')).toBeDisabled()
    await expect(page.getByText(/ทำไม่ได้ — ครบเพดาน 180 วัน/)).toBeVisible()

    await submitProposal(page, 'article14', {
      riskSummary: 'ครบเพดานคุ้มครองรวม 180 วันแล้ว แต่ยังมีภัยคุกคามต่อเนื่อง',
      reason: 'ครบเพดาน 180 วันแต่ยังมีภัย — ขอทบทวนแนวทางตามข้อ 14',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน', 'ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ')

    await switchRole(page, 'supervisor')
    await decideProposal(page, true, 'เห็นชอบให้ดำเนินการตามข้อ 14')
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    await switchRole(page, 'officer')
    await page.goto(REVIEW_URL)
    await expect(page.getByText('ครบเพดานแต่ยังมีภัย — ส่งต่อกรมคุ้มครองสิทธิฯ').first()).toBeVisible()
    await page.getByTestId('review-apply-outcome').click()
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ')

    await expect(page.getByText(/ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/).first()).toBeVisible()

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('article14')
    expect(after?.status).toContain('ส่งต่อกรมคุ้มครองสิทธิฯ')
    expect(String(after?.next)).toContain('ห้ามขยาย คบ.14')
    expect(String(after?.next)).toContain('กรมคุ้มครองสิทธิและเสรีภาพ')
  })

  test('TC-129 · [Negative] คำนวณระยะสะสมจากวันเริ่มจริงเท่านั้น ไม่ใช้วันที่เอกสารรอบล่าสุดถูกอัปโหลด', async ({ page }) => {
    // วันเริ่มจริง 8 วันก่อนวันนี้ (สะสม 8 วัน) แต่รอบรายงานล่าสุด "ถูกอัปโหลด/ปิดรอบ" วันนี้เอง — ห่างกันมาก
    const { episode, methodTracks } = reviewEpisode(8, 'TC129')
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      episode,
      methodTracks,
      monthlyReports: [
        {
          id: 'RPT-TC129',
          period: '09/2569',
          periodFrom: daysAgoIso(8).slice(0, 10),
          periodTo: new Date().toISOString().slice(0, 10), // "วันอัปโหลด" ที่ต่างจากวันเริ่มจริงมาก
          submittedAt: '10/09/2569 12:24',
          submittedBy: 'นางสาวอรุณี ใจมั่น',
          summary: 'ผลปฏิบัติรอบล่าสุด',
          incidentCount: 0,
          orderRef: 'คบ.8',
          operators: 'นางสาวอรุณี ใจมั่น',
          methods: [1],
          officerSignedAt: '10/09/2569 12:32',
          officerSignedBy: 'นางสาวอรุณี ใจมั่น',
          witnessSignedAt: '10/09/2569 12:32',
          witnessSignedBy: 'สมชาย ใจดี',
          reviewedAt: '10/09/2569 12:36',
          reviewedBy: 'นางสาวอรุณี ใจมั่น',
          riskLevel: 'ต่ำ',
          nextProposal: 'ทบทวนแนวทาง',
          lockedAt: '10/09/2569 12:46',
        },
      ],
    })

    await submitProposal(page, 'continue', {
      riskSummary: 'ตรวจสอบยอดสะสมต้องอิงวันเริ่มจริง ไม่ใช่วันที่เอกสารถูกบันทึกเข้าระบบ',
      reason: 'ยืนยันฐานการคำนวณระยะสะสมของ WIT1103',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    // "ข้อเสนอล่าสุด" ต้องแสดงสะสม 8 วัน (จากวันเริ่มจริง) ไม่ใช่ค่าที่คำนวณจากวันที่ periodTo ของรอบล่าสุด
    await expect(page.getByText(/สะสม 8 วัน คงเหลือ 172 วัน/)).toBeVisible()

    const after = await readCase(page, CASE_NO)
    const proposals = after?.reviewProposals as Array<Record<string, unknown>>
    expect(proposals[proposals.length - 1].cumulativeDays).toBe(8)
    expect(proposals[proposals.length - 1].remainingDays).toBe(172)
  })

  test('TC-130 · [Negative] เสนอข้อทบทวนโดยไม่แนบ คบ.13 ล่าสุดและหลักฐาน — ผู้บังคับบัญชาส่งคืนแก้ไข', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      ...reviewEpisode(30, 'TC130'),
    })

    // เจ้าหน้าที่เสนอผลทบทวนโดยไม่มีกลไกแนบเอกสารประกอบใดๆ ในหน้านี้เลย (ไม่มีช่องแนบไฟล์ คบ.13/หลักฐาน)
    await page.goto(REVIEW_URL)
    await expect(page.getByText(/แนบ คบ\.13/)).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)

    await submitProposal(page, 'continue', {
      riskSummary: 'เสนอผลทบทวนโดยยังไม่ได้รวบรวม คบ.13 ฉบับล่าสุดและหลักฐานประกอบ',
      reason: 'ยื่นเสนอเร่งด่วนโดยยังไม่แนบเอกสาร',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    // ผู้บังคับบัญชาตรวจพบเอกสารไม่ครบ จึงส่งคืนแก้ไขพร้อมบันทึกเหตุผล
    await switchRole(page, 'supervisor')
    await decideProposal(page, false, 'ไม่ได้แนบ คบ.13 ฉบับล่าสุดและหลักฐานประกอบ ให้แนบมาใหม่')
    await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข')

    const after = await readCase(page, CASE_NO)
    const proposals = after?.reviewProposals as Array<Record<string, unknown>>
    expect(proposals[0].status).toBe('returned')
    expect(proposals[0].reviewNote).toContain('ไม่ได้แนบ คบ.13')

    // เจ้าหน้าที่แก้ไขและเสนอใหม่ได้
    await switchRole(page, 'officer')
    await expect(page.getByText(/ส่งคืนแก้ไขเมื่อ/)).toBeVisible()
    await expect(page.getByTestId('review-submit-proposal')).toBeVisible()
  })

  test('TC-131 · [Edge] เหตุภัยหมดไปแล้ว เลือกแนวทางยุติ ส่งไปแท็บ 11C (WIT1111)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...AT_REVIEW_START,
      ...reviewEpisode(45, 'TC131'),
    })

    await submitProposal(page, 'terminate', {
      riskSummary: 'ประเมินแล้วไม่พบเหตุภัยคุกคามต่อพยานอีกต่อไป',
      reason: 'เหตุภัยหมดไป — เห็นควรเข้าสู่กระบวนการยุติการคุ้มครอง',
    })
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    await switchRole(page, 'supervisor')
    await decideProposal(page, true, 'เห็นชอบให้เข้าสู่กระบวนการยุติ')
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    await switchRole(page, 'officer')
    await applyOutcome(page)
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'คบ.15')

    await expect(page.getByText(/เลือกแนวทางแล้ว: เข้าสู่กระบวนการยุติ/)).toBeVisible()
    await expect(page.getByText(/กรอกแบบ คบ\.15 ยุติการคุ้มครอง แล้วต่อคำสั่งยุติ/)).toBeVisible()

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('termination_review')
    expect(after?.status).toBe('เข้าสู่กระบวนการยุติการคุ้มครอง')
    expect(String(after?.next)).toContain('คบ.15')
  })
})
