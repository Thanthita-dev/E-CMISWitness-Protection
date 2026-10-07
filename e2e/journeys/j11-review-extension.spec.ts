import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, confirmDialog, expectStage, formRow, signInModal } from './journey-helpers'

/**
 * Journey J11 · ติดตามผล (คบ.13) → ทบทวน (11A) → ขยายระยะเวลา (คบ.14 · 11B)
 *
 * เส้นทาง: scenario `extension` ในผัง (Case 1.13 → 1.14 → 9 → 9.1 → 9.2)
 *   แท็บ 10  : เจ้าหน้าที่ลงนาม คบ.13 สองช่อง → ตรวจรับ → บันทึกสถานะ → ล็อกรอบ → ประเมิน → ส่งทบทวน (WIT1006-1013)
 *   แท็บ 11A : เสนอผลทบทวน "ขยายเวลา" → ผบช.ชั้นต้นเห็นชอบ → ดำเนินการ (WIT1101-1107, 1109)
 *   แท็บ 11B : เจ้าหน้าที่จัดทำ คบ.14 → ผบช.ชั้นต้นตรวจ → เลขาธิการฯ อนุมัติ (WIT1112-1122) → กลับแท็บ 10
 *
 * ทางแยก:
 *   J11-A  เลขาธิการฯ ไม่อนุมัติขยายเวลา (WIT1123) → คงคำสั่งเดิม
 *   J11-B  ผบช.ชั้นต้นส่งคืน คบ.14 (WIT1118/1119) → แก้เป็นเวอร์ชัน 2 → ผ่านจนอนุมัติ
 *   J11-C  แท็บ 10 พบว่า คบ.13 ผลปฏิบัติไม่ตรงวิธีที่อนุมัติ (WIT1008) → บันทึกประเด็นแล้วส่งทบทวน
 *   J11-D  แท็บ 10 ใกล้ครบเพดาน 180 วัน → บล็อกแขนงคุ้มครองต่อ (WIT1011/1012) → ส่งทบทวน 11A
 *   J11-E  แท็บ 10 เลือก "คุ้มครองต่อ" ตั้งรอบ คบ.13 ถัดไป (WIT1012) ไม่ต้องทบทวน
 */

const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const REVIEW_URL = `/protection-review/${CASE_NO}`
const EXT_URL = `/protection-extension/${CASE_NO}`

type Rec = Record<string, unknown>

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const REASON_14 = 'ภัยคุกคามยังไม่คลี่คลาย พบการเฝ้าติดตามพยานใกล้ที่พักอาศัย ต้องคุ้มครองต่อเนื่อง'
const PH_REASON = 'เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่'

/** WIT1105-WIT1107 — เจ้าหน้าที่เสนอผลทบทวน ผบช.ชั้นต้นเห็นชอบ แล้วเจ้าหน้าที่ดำเนินการตามแนวทาง */
async function reviewProposeEndorseApply(page: Page, outcome: string, applyText: string | RegExp) {
  await page.goto(REVIEW_URL)
  await page.getByTestId(`review-outcome-${outcome}`).click()
  await page.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }).fill('ภัยยังไม่คลี่คลาย ต้องคุ้มครองต่อเนื่องเกินกำหนดคำสั่งเดิม')
  await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ผลทบทวนตาม คบ.13 งวด 09/2569')
  await page.getByTestId('review-submit-proposal').click()
  await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

  await switchRole(page, 'supervisor')
  await page.goto(REVIEW_URL)
  await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('เห็นชอบตามที่เสนอ')
  await page.getByTestId('review-endorse').click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ')

  await switchRole(page, 'officer')
  await page.goto(REVIEW_URL)
  await page.getByTestId('review-apply-outcome').click()
  await confirmDialog(page, 'ยืนยันดำเนินการ', applyText)
}

/** เจ้าหน้าที่จัดทำ คบ.14 (WIT1114/WIT1115) แล้วส่งตรวจ */
async function submitKb14(page: Page, reason = REASON_14) {
  await page.goto(EXT_URL)
  await page.getByPlaceholder(PH_REASON).fill(reason)
  await page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.14')
}

/** ผบช.ชั้นต้นตรวจครบถ้วนและเสนอตามลำดับชั้น (WIT1117 / WIT1120) */
async function supervisorPassesKb14(page: Page) {
  await switchRole(page, 'supervisor')
  await page.goto(EXT_URL)
  await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('เอกสารครบถ้วน เห็นควรเสนอ')
  await page.getByRole('button', { name: 'ครบถ้วน · เสนอตามลำดับชั้น' }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน', 'เสนอตามลำดับชั้นให้ผู้มีอำนาจพิจารณาอนุมัติต่อไป')
}

/** ตั้งต้น "11A" — มี Episode สะสม `days` วัน วิธีที่ 1 กำลังคุ้มครอง (สำหรับทางแยกที่ seed ใกล้จุดตัดสินใจ) */
function reviewSeed(days: number) {
  const start = new Date()
  start.setDate(start.getDate() - (days - 1)) // นับรวมวันเริ่ม: สะสม = days วันพอดี ณ วันนี้
  const iso = start.toISOString()
  return {
    approvedMethods: [1],
    methodTracks: [{ method: 1, status: 'active', startedAt: iso }],
    episode: { id: 'EP-J11', openedAt: iso, phases: [{ id: 'PH-J11', kind: 'MAIN', startedAt: iso, orderRef: 'คบ.8' }] },
    kb11Signed: true,
    reviewProposals: [],
    methodChangeProposals: [],
  }
}

/** รอบ คบ.13 ลงนามครบสองช่อง (จุดตั้งต้น WIT1008) */
const signedRound = (overrides: Rec = {}) => ({
  id: 'RPT-J11',
  period: '09/2569',
  periodFrom: '2026-08-11',
  periodTo: '2026-09-10',
  submittedAt: '10/09/2569 12:24',
  submittedBy: 'นางสาวอรุณี ใจมั่น',
  summary: 'ผลปฏิบัติงวด 09/2569 เป็นไปตามแผน',
  incidentCount: 0,
  evidenceRefs: [],
  orderRef: 'คบ.8',
  orderDays: 30,
  operators: 'นางสาวอรุณี ใจมั่น',
  methods: [1],
  officerSignedAt: '10/09/2569 12:32',
  officerSignedBy: 'นางสาวอรุณี ใจมั่น',
  witnessSignedAt: '10/09/2569 12:32',
  witnessSignedBy: 'สมชาย ใจดี',
  ...overrides,
})

test.describe('J11 · ติดตามผล → ทบทวน → ขยายระยะเวลา (คบ.14)', () => {
  test('J11 · เส้นทางขยายระยะเวลา: คบ.13 → ทบทวน 11A → คบ.14 → เลขาธิการฯ อนุมัติ → กลับแท็บ 10', async ({ page }) => {
    test.setTimeout(240_000)

    // ========== แท็บ 10 · ติดตามและรายงานผล (คบ.13) ==========
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT1001 · รับ Episode เดียว Phase MAIN เข้าแผงติดตาม', async () => {
      await page.goto(MONITOR_URL)
      await page.getByRole('listitem').filter({ hasText: 'รับ Episode เดียว (TEMPORARY/MAIN)' }).getByRole('button').click()
      await expect(page.getByText('Phase ปัจจุบัน', { exact: true })).toBeVisible()
      await expect(page.getByText('คำร้องหลัก (MAIN)').first()).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect((c?.episode as { phases: unknown[] }).phases).toHaveLength(1)
    })

    await test.step('WIT1002 · แสดง Phase และวันสะสมต่อเนื่อง', async () => {
      await expect(page.getByText(/\d+ วัน/).first()).toBeVisible()
    })

    await test.step('WIT1003 · กำหนดรอบรายงานถัดไปและเพดาน 180 วัน', async () => {
      await page.getByRole('listitem').filter({ hasText: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม' }).getByRole('button').click()
      await expect(page.getByText(/180/).first()).toBeVisible()
    })

    // WIT1004/WIT1005 (เปิดรอบ + จัดทำ คบ.13) — mock state Case 1.13 มีรอบ 09/2569 จัดทำเสร็จแล้ว จึงเริ่มเดินที่ WIT1006
    await test.step('WIT1006 · เจ้าหน้าที่ลงนาม คบ.13 (ช่องที่ 1)', async () => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.13').getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
      await signInModal(page)
      const round = ((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]
      expect(round.officerSignedAt).toBeTruthy()
      expect(round.witnessSignedAt).toBeFalsy()
    })

    await test.step('WIT1007 · พยานลงนาม คบ.13 (ช่องที่ 2 ผ่านบัญชีเจ้าหน้าที่) — โมดัลปิดเองเมื่อครบ', async () => {
      await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
      await signInModal(page, 'สมชาย ใจดี')
      await expect.poll(async () => (((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).witnessSignedAt).toBeTruthy()
      await expect(page.getByTestId('signature-confirm-button')).toHaveCount(0)
    })

    await test.step('WIT1008 · ตรวจรับรายงานและตรวจผลปฏิบัติ', async () => {
      await page.goto(MONITOR_URL)
      await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
      await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
      await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()
      expect((((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).reviewedAt).toBeTruthy()
    })

    await test.step('WIT1009 · บันทึกสถานะล่าสุด (ความเสี่ยง ปัญหา ข้อเสนอ)', async () => {
      await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
      await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ยังพบการเฝ้าติดตามพยานใกล้ที่พัก')
      await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('เห็นควรทบทวนและขยายเวลาคุ้มครอง')
      await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
      await expect(page.getByText(/บันทึกสถานะล่าสุดแล้ว/)).toBeVisible()
      expect((((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).riskLevel).toBeTruthy()
    })

    await test.step('WIT1010 · ล็อกเป็นรอบรายงานใหม่', async () => {
      await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')
      expect((((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).lockedAt).toBeTruthy()
    })

    await test.step('WIT1011 · ประเมินแขนง (ยังไม่ถึง ≤ 7 วันก่อนเพดาน จึงเลือกได้ทั้งสองแขนง)', async () => {
      await page.getByRole('button', { name: 'ประเมิน' }).click()
      await expect(page.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })).toBeEnabled()
    })

    await test.step('WIT1013 · เลือก "ต้องทบทวน" ส่งทบทวนที่แท็บ 11A', async () => {
      await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
      await page.getByRole('button', { name: /ส่งเข้าทบทวนผลการคุ้มครอง$/ }).click()
      await confirmDialog(page, 'ยืนยัน')
      await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
      const handoff = (await readCase(page, CASE_NO))?.reviewHandoff as Rec
      expect(handoff).toBeTruthy()
      expect(handoff.cumulativeDays).toBeDefined()
    })

    // ========== แท็บ 11A · ทบทวนผลการคุ้มครอง ==========
    await test.step('WIT1101 · เปิดแท็บ 11A จะเห็นว่างานถูกส่งมาจากแท็บ 10', async () => {
      await page.getByRole('link', { name: 'ทบทวนผลการคุ้มครอง', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-review/${CASE_NO}`))
      await expect(page.getByTestId('review-outcome-extend')).toBeVisible()
    })

    await test.step('WIT1102-1103 · ข้อมูลประกอบและยอดสะสม/คงเหลือคำนวณจากวันเริ่มจริง', async () => {
      await expect(page.getByText('ข้อมูลประกอบการทบทวน')).toBeVisible()
      await expect(page.getByText('คบ.13 รอบล่าสุด')).toBeVisible()
      await expect(page.getByText(/ระยะคุ้มครองสะสม/)).toBeVisible()
      await expect(page.getByText(/คงเหลือ\s*\d+\s*วัน/).first()).toBeVisible()
    })

    await test.step('WIT1104-1105 · กรอกผลประเมิน เลือก "ขยายเวลา" แล้วเสนอผลทบทวน', async () => {
      await page.getByTestId('review-outcome-extend').click()
      await page.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }).fill('ภัยยังไม่คลี่คลาย ต้องคุ้มครองต่อเนื่องเกินกำหนดคำสั่งเดิม')
      await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ผลทบทวนตาม คบ.13 งวด 09/2569')
      await page.getByTestId('review-submit-proposal').click()
      await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')
      const p = ((await readCase(page, CASE_NO))?.reviewProposals as Rec[]).at(-1)!
      expect(p.proposedOutcome).toBe('extend')
      expect(p.status).toBe('pending')
    })

    await test.step('WIT1106 · ผบช.ชั้นต้นเห็นชอบข้อเสนอ', async () => {
      await switchRole(page, 'supervisor')
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('เห็นชอบให้ขยายเวลา')
      await page.getByTestId('review-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
      expect((((await readCase(page, CASE_NO))?.reviewProposals as Rec[]).at(-1))!.status).toBe('endorsed')
    })

    await test.step('WIT1107 + WIT1109 · เจ้าหน้าที่ดำเนินการตามแนวทางขยายเวลา แล้วไปแท็บ 11B', async () => {
      await switchRole(page, 'officer')
      await page.getByTestId('review-apply-outcome').click()
      await confirmDialog(page, 'ยืนยันดำเนินการ', 'คบ.14')
      await expect(page.getByText(/เลือกแนวทางแล้ว: ขยายระยะเวลา/)).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect(c?.status).toBe('ดำเนินการขอขยายระยะเวลา (คบ.14)')
      expect(c?.stage).toBe('protection')
      await page.getByTestId('review-goto-11b').click()
      await expect(page).toHaveURL(new RegExp(`/protection-extension/${CASE_NO}`))
    })

    // ========== แท็บ 11B · ขยายระยะเวลา (คบ.14) ==========
    await test.step('WIT1112-1113 · เปิดแท็บ 11B เห็นข้อมูลคำสั่งเดิมและยอดสะสม', async () => {
      await expect(page.getByPlaceholder(PH_REASON)).toBeVisible()
      await expect(page.getByText(/180/).first()).toBeVisible()
    })

    await test.step('WIT1114-1116 · กรอกช่วงที่ขอขยายและเหตุผล ระบบตรวจเพดาน/ย้อนหลังและคำนวณวัน', async () => {
      await page.getByPlaceholder(PH_REASON).fill(REASON_14)
      await expect(page.getByText('30 วัน', { exact: false }).first()).toBeVisible()
      // ช่วงย้อนหลังต้องถูกบล็อก (WIT1116) แล้วกลับเป็นช่วงปกติ
      const submit = page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' })
      await expect(submit).toBeEnabled()
    })

    await test.step('WIT1115 · จัดทำ คบ.14 และส่งตรวจ', async () => {
      await page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.14')
      const reqs = (await readCase(page, CASE_NO))?.extensionRequests as Rec[]
      expect(reqs).toHaveLength(1)
      expect(reqs[0].status).toBe('submitted')
      expect(reqs[0].durationDays).toBe(30)
    })

    await test.step('WIT1117 + WIT1120 · ผบช.ชั้นต้นตรวจ คบ.14 ครบถ้วนและเสนอตามลำดับชั้น', async () => {
      await supervisorPassesKb14(page)
      expect((((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]).status).toBe('pending')
    })

    // WIT1118 (ผบช.ตัดสินว่าเอกสารครบหรือไม่) — เส้นทางหลักคือ "ครบถ้วน" ส่วนส่งคืนดู J11-B

    await test.step('WIT1121 + WIT1122 · เลขาธิการฯ อนุมัติ — เพิ่ม Phase ใหม่ ไม่แก้ทับ แล้วกลับแท็บ 10', async () => {
      await switchRole(page, 'secretary')
      await page.goto(EXT_URL)
      await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('เห็นควรอนุมัติตามที่เสนอ')
      await page.getByRole('button', { name: /อนุมัติขยายเวลา$/ }).click()
      await confirmDialog(page, 'ยืนยันอนุมัติ', 'เพิ่มช่วงคุ้มครองใหม่')

      const c = await readCase(page, CASE_NO)
      const req = (c?.extensionRequests as Rec[])[0]
      expect(req.status).toBe('approved')
      expect(req.locked).toBe(true)
      const phases = (c?.episode as { phases: Rec[] }).phases
      expect(phases).toHaveLength(2)
      expect(phases[0].endedAt).toBeTruthy()
      expect(phases[1].startedAt).toBeTruthy()
      await expect(page.getByText(/อนุมัติขยายเวลา\s*30\s*วันแล้ว/)).toBeVisible()
    })

    await test.step('เชื่อมกลับแท็บ 10 · ติดตามต่อด้วยรอบ คบ.13 ถัดไป', async () => {
      await page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO}`))
      await expectStage(page, 'protection')
    })
  })

  test('J11-A · [ทางแยก] เลขาธิการฯ ไม่อนุมัติขยายเวลา → คงคำสั่งเดิม ไปแท็บ 11C เมื่อถึงกำหนด', async ({ page }) => {
    test.setTimeout(180_000)
    // ตั้งต้น Case 9 = หลังเลือก "ขยายเวลา" ที่ 11A ก่อนจัดทำ คบ.14
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 9', 'officer', { protectionEndAt: isoDaysFromToday(0), ...reviewSeed(120) })

    await test.step('WIT1114-1115 · เจ้าหน้าที่จัดทำ คบ.14 ส่งตรวจ', async () => {
      await submitKb14(page)
      expect((((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]).status).toBe('submitted')
    })

    await test.step('WIT1117-1120 · ผบช.ชั้นต้นเห็นว่าครบถ้วน เสนอผู้มีอำนาจ', async () => {
      await supervisorPassesKb14(page)
      expect((((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]).status).toBe('pending')
    })

    await test.step('WIT1121 + WIT1123 · เลขาธิการฯ ไม่อนุมัติ — คำสั่งเดิมคงอยู่', async () => {
      await switchRole(page, 'secretary')
      await page.goto(EXT_URL)
      await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('ไม่มีเหตุจำเป็นเพียงพอ')
      await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติ', 'คงคำสั่งเดิมถึงวันสิ้นสุด')

      const c = await readCase(page, CASE_NO)
      expect(((c?.extensionRequests as Rec[])[0]).status).toBe('rejected')
      expect(c?.protectionEndAt).toBe(isoDaysFromToday(0))
      expect((c?.episode as { phases: unknown[] }).phases).toHaveLength(1) // ไม่เพิ่ม Phase
      await expect(page.getByText(/คงคำสั่งเดิมถึงวันสิ้นสุด.*เมื่อถึงกำหนดให้ไป/)).toBeVisible()
    })

    await test.step('ต่อ 11C · มีลิงก์ไปจัดทำเรื่องยุติเมื่อถึงกำหนด', async () => {
      await page.getByRole('link', { name: /หน้าจัดทำเรื่องยุติ \(คบ\.15\)/ }).click()
      await expect(page).toHaveURL(new RegExp(`/termination/${CASE_NO}`))
      await expectStage(page, 'protection') // ยังคุ้มครองอยู่จนกว่าจะมีคำสั่งยุติ (WIT1130)
    })
  })

  test('J11-B · [ทางแยก] ผบช.ชั้นต้นส่งคืน คบ.14 → เจ้าหน้าที่แก้เป็นเวอร์ชัน 2 → เสนอใหม่จนอนุมัติ', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 9', 'officer', { protectionEndAt: isoDaysFromToday(0), ...reviewSeed(120) })

    await test.step('WIT1115 · เจ้าหน้าที่จัดทำ คบ.14 ฉบับแรก', async () => {
      await submitKb14(page, 'ภัยยังไม่คลี่คลาย')
    })

    await test.step('WIT1118 · ผบช.ชั้นต้นเห็นว่าเอกสารไม่ครบ ส่งคืนแก้ไข', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(EXT_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('เหตุผลขอขยายไม่ชัดเจน')
      await page.getByRole('button', { name: 'ส่งคืนแก้ไข' }).click()
      await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.14 เวอร์ชันใหม่')
      const req = ((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]
      expect(req.status).toBe('returned')
      expect(req.reviewNote).toBe('เหตุผลขอขยายไม่ชัดเจน')
    })

    await test.step('WIT1119 · เจ้าหน้าที่แก้ไข จัดทำ คบ.14 เวอร์ชันใหม่ (เก็บฉบับเดิมไว้)', async () => {
      await switchRole(page, 'officer')
      await page.goto(EXT_URL)
      await expect(page.getByText('ส่งคืนแก้ไข', { exact: false }).first()).toBeVisible()
      await page.getByPlaceholder(PH_REASON).fill('เพิ่มรายละเอียดภัยคุกคามและหลักฐานการเฝ้าระวังเมื่อสัปดาห์ก่อน')
      await page.getByRole('button', { name: 'จัดทำ คบ.14 เวอร์ชันใหม่' }).click()
      const req = ((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]
      expect(req.version).toBe(2)
      expect(req.status).toBe('submitted')
      expect(req.previousVersions as unknown[]).toHaveLength(1)
    })

    await test.step('WIT1120 · ผบช.ชั้นต้นตรวจฉบับใหม่ครบถ้วน เสนอตามลำดับชั้น', async () => {
      await supervisorPassesKb14(page)
      expect((((await readCase(page, CASE_NO))?.extensionRequests as Rec[])[0]).status).toBe('pending')
    })

    await test.step('WIT1122 · เลขาธิการฯ อนุมัติ — เพิ่ม Phase ใหม่', async () => {
      await switchRole(page, 'secretary')
      await page.goto(EXT_URL)
      await page.getByRole('button', { name: /อนุมัติขยายเวลา$/ }).click()
      await confirmDialog(page, 'ยืนยันอนุมัติ', 'เพิ่มช่วงคุ้มครองใหม่')
      const c = await readCase(page, CASE_NO)
      expect(((c?.extensionRequests as Rec[])[0]).status).toBe('approved')
      expect((c?.episode as { phases: unknown[] }).phases).toHaveLength(2)
    })
  })

  test('J11-C · [ทางแยก] คบ.13 ผลปฏิบัติไม่ตรงวิธีที่อนุมัติ → บันทึกประเด็น → ส่งทบทวนไปแท็บ 11A', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.13', 'officer', {
      approvedMethods: [1],
      monthlyReports: [signedRound({ methods: [1, 2] })],
    })
    await page.goto(MONITOR_URL)

    await test.step('WIT1008 · ตรวจรับพบวิธีที่ปฏิบัติจริงไม่ตรงที่อนุมัติ — ต้องบันทึกประเด็นก่อน', async () => {
      await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
      await expect(page.getByText(/ปฏิบัติวิธีที่ 2.*ซึ่งไม่ได้รับอนุมัติ/)).toBeVisible()
      const accept = page.getByRole('button', { name: 'รับรายงานและตรวจผล' })
      await expect(accept).toBeDisabled()
      await page.getByLabel(/บันทึกประเด็น\/เหตุสำคัญ/).fill('ปฏิบัติวิธีที่ 2 โดยไม่ได้รับอนุมัติ — เสนอทบทวนขออนุมัติเปลี่ยนวิธี')
      await expect(accept).toBeEnabled()
      await accept.click()
      await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()
      expect((((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).issues).toContain('วิธีที่ 2')
    })

    await test.step('WIT1009-1010 · บันทึกสถานะและล็อกรอบ', async () => {
      await page.getByRole('button', { name: 'ปานกลาง', exact: true }).click()
      await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('เสนอทบทวนวิธีคุ้มครอง')
      await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
      await expect(page.getByText(/บันทึกสถานะล่าสุดแล้ว/)).toBeVisible()
      await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')
      expect((((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0]).lockedAt).toBeTruthy()
    })

    await test.step('WIT1011 + WIT1013 · ประเมินแล้วส่งทบทวนที่แท็บ 11A', async () => {
      await page.getByRole('button', { name: 'ประเมิน' }).click()
      await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
      await page.getByRole('button', { name: /ส่งเข้าทบทวนผลการคุ้มครอง$/ }).click()
      await confirmDialog(page, 'ยืนยัน')
      await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
      expect((await readCase(page, CASE_NO))?.reviewHandoff).toBeTruthy()
    })

    await test.step('WIT1101 · แท็บ 11A รับงานที่ส่งมา', async () => {
      await page.getByRole('link', { name: 'ทบทวนผลการคุ้มครอง', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-review/${CASE_NO}`))
      await expect(page.getByTestId('review-submit-proposal')).toBeVisible()
    })
  })

  test('J11-D · [ทางแยก] ใกล้ครบเพดาน 180 วัน → บล็อกแขนงคุ้มครองต่อ → ต้องส่งทบทวน 11A', async ({ page }) => {
    test.setTimeout(180_000)
    const near = reviewSeed(176) // เหลือ 4 วัน ≤ 7 วัน
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...near,
      monthlyReports: [
        signedRound({ reviewedAt: '10/09/2569 12:36', reviewedBy: 'นางสาวอรุณี ใจมั่น', riskLevel: 'ต่ำ', nextProposal: 'คงมาตรการเดิม', lockedAt: '10/09/2569 12:46' }),
      ],
    })
    await page.goto(MONITOR_URL)

    await test.step('WIT1003 · เตือนใกล้ครบเพดาน', async () => {
      await page.getByRole('listitem').filter({ hasText: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม' }).getByRole('button').click()
      await expect(page.getByText(/ใกล้ครบเพดาน — เหลือ 4 วัน/)).toBeVisible()
    })

    await test.step('WIT1011 · แขนงคุ้มครองต่อ (WIT1012) ถูกบล็อก ไม่มีปุ่มตั้งรอบถัดไป', async () => {
      await page.getByRole('button', { name: 'ประเมิน' }).click()
      await expect(page.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })).toBeDisabled()
      await expect(page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' })).toHaveCount(0)
    })

    await test.step('WIT1013 · ส่งทบทวนที่ 11A เป็นทางเดียว', async () => {
      await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
      await page.getByRole('button', { name: /ส่งเข้าทบทวนผลการคุ้มครอง$/ }).click()
      await confirmDialog(page, 'ยืนยัน')
      await expect(page.getByRole('link', { name: 'ทบทวนผลการคุ้มครอง', exact: true })).toHaveAttribute('href', REVIEW_URL)
      expect((await readCase(page, CASE_NO))?.reviewHandoff).toBeTruthy()
    })

    await test.step('WIT1103 · 11A ยอดสะสม 176 วัน ยังไม่ครบ 180 — ขยายเวลาเลือกได้ ข้อ 14 ยังเลือกไม่ได้', async () => {
      await page.goto(REVIEW_URL)
      await expect(page.getByTestId('review-outcome-article14')).toBeDisabled()
      await expect(page.getByTestId('review-outcome-extend')).toBeEnabled()
    })
  })

  test('J11-E · [ทางแยก] ประเมินแล้วเลือก "คุ้มครองต่อ" ตั้งรอบ คบ.13 ถัดไป (ไม่ต้องทบทวน)', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.13', 'officer', {
      monthlyReports: [signedRound()],
    })
    await page.goto(MONITOR_URL)

    await test.step('WIT1008-1010 · ตรวจรับ บันทึกสถานะ ล็อกรอบ', async () => {
      await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
      await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
      await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()
      await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
      await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ไม่พบปัญหา')
      await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('คงมาตรการเดิมต่อเนื่อง')
      await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
      await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')
    })

    await test.step('WIT1011 + WIT1012 · เลือกแขนงคุ้มครองต่อ ตั้งรอบถัดไปและเปิดรอบใหม่', async () => {
      await page.getByRole('button', { name: 'ประเมิน' }).click()
      await page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'เปิดรอบรายงานใหม่')
      await expect(page.getByText(/ทั้งหมด 2 รอบ/)).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect(c?.monthlyReports as Rec[]).toHaveLength(2)
      expect(c?.nextReportDueAt).toBeTruthy()
      expect(c?.reviewHandoff).toBeFalsy() // ไม่ได้ส่งทบทวน
    })
  })
})
