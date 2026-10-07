import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, expectStage, formRow, signInModal } from './journey-helpers'

/**
 * Journey J12 · 11A ทบทวนผล → "เปลี่ยนวิธี / เงื่อนไข" (WIT1110) → วนกลับ 08A
 *
 * เส้นทางหลัก (scenario `method-change` ของ 11A, Case 1.14):
 *   11A  : เสนอผลทบทวน "เปลี่ยนวิธี" → ผบช.ชั้นต้นเห็นชอบ → เจ้าหน้าที่ดำเนินการ (WIT1104-1107)
 *   WIT1110: เสนอเปลี่ยนวิธี (วิธีที่ 1 → วิธีที่ 2) → ผบช.ชั้นต้น → ผอ.สำนัก/กอง อนุมัติ → ชุดวิธีถูกเปลี่ยนจริง
 *   08A  : ความยินยอม คบ.11 เดิมใช้ไม่ได้ → ลงนาม คบ.11 ใหม่ (WIT0809-0811) → เปิดเส้นทางวิธีที่ 2 (WIT0813)
 *
 * ทางแยก:
 *   J12-A  ผู้บังคับบัญชาส่งคืนข้อเสนอเปลี่ยนวิธี → เจ้าหน้าที่เสนอใหม่
 *   J12-B  ผอ.สำนัก/กอง ส่งคืนข้อเสนอเปลี่ยนวิธี (ผบช.ชั้นต้นเห็นชอบแล้ว) → ชุดวิธีเดิมไม่ขยับ
 *   J12-C  เปลี่ยนเป็นวิธีที่ 1 → ต้องจัดทำ/แก้ คบ.8 ก่อนเริ่มปฏิบัติ
 *   J12-D  ผลทบทวน "คุ้มครองต่อภายใต้คำสั่งเดิม" (WIT1108) → ไม่เปลี่ยนวิธี กลับแท็บ 10
 *   J12-E  ผู้บังคับบัญชาส่งคืนข้อเสนอผลทบทวน 11A (WIT1106) → เจ้าหน้าที่เสนอใหม่เป็น "เปลี่ยนวิธี"
 */

const REVIEW_URL = `/protection-review/${CASE_NO}`
const METHODS_URL = '/protection-methods'
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`

type Rec = Record<string, unknown>

const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/** ตั้งต้น WIT1104 — ปัจจุบันคุ้มครองวิธีที่ 1 สะสม `days` วัน ลงนาม คบ.11 แล้ว */
function reviewSeed(days: number) {
  const startedAt = daysAgoIso(days - 1)
  return {
    approvedMethods: [1],
    methodTracks: [{ method: 1, status: 'active', startedAt }],
    episode: { id: 'EP-J12', openedAt: startedAt, phases: [{ id: 'PH-J12', kind: 'MAIN', startedAt, orderRef: 'คบ.8' }] },
    kb11Signed: true,
    consents: [{ ref: 'kb11', consented: true, at: '10/09/2569 12:00', by: 'สมชาย ใจดี' }],
    reviewProposals: [],
    methodChangeProposals: [],
  }
}

/** เจ้าหน้าที่เสนอผลทบทวน 11A (WIT1104/WIT1105) */
async function submitReview(page: Page, outcome: 'continue' | 'change_method', risk: string, reason: string) {
  await page.goto(REVIEW_URL)
  await page.getByTestId(`review-outcome-${outcome}`).click()
  await page.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }).fill(risk)
  await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill(reason)
  await page.getByTestId('review-submit-proposal').click()
  await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')
}

/** ผบช.ชั้นต้นเห็นชอบผลทบทวน (WIT1106) แล้วเจ้าหน้าที่ดำเนินการ (WIT1107) */
async function endorseAndApply(page: Page, applyText: string | RegExp) {
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

/** WIT1110 ชั้นเจ้าหน้าที่ — เลือกชุดวิธีใหม่ เหตุผล แล้วเสนอตามลำดับชั้น */
async function proposeChange(page: Page, methods: number[], reason: string, conditions?: string) {
  await page.goto(REVIEW_URL)
  await expect(page.getByTestId('wit1110-card')).toBeVisible()
  for (const m of [1, 2, 3, 4]) {
    const box = page.getByTestId(`method-change-option-${m}`)
    if ((await box.isChecked()) !== methods.includes(m)) await box.click()
  }
  if (conditions) await page.getByTestId('method-change-conditions').fill(conditions)
  await page.getByTestId('method-change-reason').fill(reason)
  await page.getByTestId('method-change-submit').click()
}

/** ชั้นผู้บังคับบัญชา/ผอ.: เห็นชอบ-อนุมัติ หรือส่งคืนข้อเสนอเปลี่ยนวิธี */
async function decideChange(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await page.goto(REVIEW_URL)
  await page.getByTestId('method-change-decision-note').fill(note)
  await page.getByTestId(endorse ? 'method-change-endorse' : 'method-change-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('J12 · ทบทวนผล → เปลี่ยนวิธี → วนกลับ 08A', () => {
  test('J12 · เส้นทางเปลี่ยนวิธีคุ้มครอง: 11A → เสนอ/อนุมัติเปลี่ยนวิธี (WIT1110) → ลงนาม คบ.11 ใหม่ → เปิดวิธีที่ 2 (08A)', async ({ page }) => {
    test.setTimeout(240_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(45))

    await test.step('WIT1101 · เปิดแท็บ 11A เห็นงานที่ส่งมาจากแท็บ 10', async () => {
      await page.goto(REVIEW_URL)
      await expect(page.getByText('ข้อมูลประกอบการทบทวน')).toBeVisible()
      await expect(page.getByTestId('review-outcome-change_method')).toBeVisible()
    })

    await test.step('WIT1102-1103 · ข้อมูลประกอบและยอดสะสมจากวันเริ่มจริง', async () => {
      await expect(page.getByText('คบ.13 รอบล่าสุด')).toBeVisible()
      await expect(page.getByText(/ระยะคุ้มครองสะสม/)).toBeVisible()
      await expect(page.getByText(/คงเหลือ\s*\d+\s*วัน/).first()).toBeVisible()
    })

    await test.step('WIT1104-1105 · กรอกผลประเมิน เลือก "เปลี่ยนวิธี / เงื่อนไข" แล้วเสนอผลทบทวน', async () => {
      await submitReview(page, 'change_method', 'ภัยเปลี่ยนเป็นการไล่ล่าข้อมูลส่วนบุคคล วิธีที่ใช้อยู่ไม่เหมาะสมกับภัยปัจจุบัน', 'ผลทบทวนตาม คบ.13 งวด 09/2569')
      const p = ((await readCase(page, CASE_NO))?.reviewProposals as Rec[]).at(-1)!
      expect(p.proposedOutcome).toBe('change_method')
      expect(p.status).toBe('pending')
    })

    await test.step('WIT1106 · ผบช.ชั้นต้นเห็นชอบ', async () => {
      await switchRole(page, 'supervisor')
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('เห็นชอบให้เปลี่ยนวิธี')
      await page.getByTestId('review-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ส่งงานไปยังปลายทางของแนวทางที่เห็นชอบ')
      expect((((await readCase(page, CASE_NO))?.reviewProposals as Rec[]).at(-1))!.status).toBe('endorsed')
    })

    await test.step('WIT1107 · เจ้าหน้าที่ดำเนินการตามแนวทาง — เปิดการ์ด WIT1110', async () => {
      await switchRole(page, 'officer')
      await page.getByTestId('review-apply-outcome').click()
      await confirmDialog(page, 'ยืนยันดำเนินการ', 'เสนออนุมัติและปรับ คบ.11')
      await expect(page.getByTestId('wit1110-card')).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect(((c?.reviewProposals as Rec[]).at(-1))!.appliedOutcome).toBe('change_method')
      expect(c?.approvedMethods).toEqual([1]) // ยังไม่อนุมัติ ชุดวิธีเดิมไม่ขยับ
    })

    await test.step('WIT1110 · เจ้าหน้าที่เสนอเปลี่ยนวิธี (วิธีที่ 1 → วิธีที่ 2) ตามลำดับชั้น', async () => {
      await proposeChange(page, [2], 'ภัยเปลี่ยนเป็นการไล่ล่าข้อมูล ต้องย้ายพยานไปสถานที่ปลอดภัยแทนชุดคุ้มครอง', 'ที่พักภายในเขตกรุงเทพฯ')
      await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี', 'ผบช.ชั้นต้น')
      const list = (await readCase(page, CASE_NO))?.methodChangeProposals as Rec[]
      expect(list).toHaveLength(1)
      expect(list[0].stage).toBe('supervisor')
      expect(list[0].proposedMethods).toEqual([2])
    })

    await test.step('WIT1110 · ผบช.ชั้นต้นเห็นชอบ → ส่งต่อ ผอ.สำนัก/กอง (ยังไม่เปลี่ยนวิธี)', async () => {
      await switchRole(page, 'supervisor')
      await decideChange(page, true, 'เห็นชอบตามที่เสนอ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
      const c = await readCase(page, CASE_NO)
      expect(((c?.methodChangeProposals as Rec[])[0]).stage).toBe('director')
      expect(c?.approvedMethods).toEqual([1])
    })

    await test.step('WIT1110 · ผอ.สำนัก/กอง อนุมัติ → ชุดวิธีเปลี่ยนจริง ล้างความยินยอม คบ.11 เดิม', async () => {
      await switchRole(page, 'director')
      await decideChange(page, true, 'อนุมัติให้เปลี่ยนวิธี', 'ยืนยันอนุมัติเปลี่ยนวิธี', 'ล้างความยินยอมตาม คบ.11 เดิม')
      const c = await readCase(page, CASE_NO)
      expect(((c?.methodChangeProposals as Rec[])[0]).stage).toBe('approved')
      expect(c?.approvedMethods).toEqual([2])
      expect((c?.methodTracks as Rec[]).map((t) => t.method)).toEqual([2])
      expect(c?.kb11Signed).toBe(false)
      expect(c?.consents).toEqual([])
      expect(String(c?.next)).toContain('ความยินยอม')
    })

    await test.step('ต่อ 08A · การ์ด WIT1110 ชี้ไปเส้นทางปฏิบัติ 08A/08B', async () => {
      await switchRole(page, 'officer')
      await page.goto(REVIEW_URL)
      await page.getByTestId('wit1110-goto-methods').click()
      await expect(page).toHaveURL(new RegExp(METHODS_URL))
      await expect(page.getByText('จัดให้พยานอยู่ในสถานที่เหมาะสม').first()).toBeVisible()
    })

    await test.step('WIT0809-0811 · ลงนาม คบ.11 ใหม่ให้ครบทุกช่อง แล้วบันทึกข้อตกลง', async () => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.11').getByRole('button', { name: 'ลงนาม' }).click()
      // ความยินยอมเดิมถูกล้างใน store แล้ว แต่แบบ คบ.11 ยังแสดงลายมือชื่อชุดเดิมไว้ — ต้องกด "ลงนามใหม่" ทีละช่อง
      // (ผังระบุให้ลงนามใหม่ทั้งชุดอยู่แล้ว; ช่องที่ยังว่างจะเป็นปุ่ม "ลงลายมือชื่อ")
      const slotBtn = page.getByRole('button', { name: /ลงนามใหม่|ลงลายมือชื่อ/ })
      await expect(slotBtn.first()).toBeVisible()
      const count = await slotBtn.count()
      expect(count).toBe(4)
      for (let i = 0; i < count; i++) {
        await slotBtn.nth(i).click()
        await signInModal(page, 'พยานในการทำข้อตกลง')
      }
      await page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
    })

    await test.step('WIT0813 · เส้นทางวิธีที่ 2 (สถานที่ปลอดภัย) เปิดได้ตามชุดวิธีใหม่', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([2])
      expect((c?.methodTracks as Rec[]).map((t) => t.method)).toEqual([2])
      await page.goto(`/protection-method/2?caseNo=${CASE_NO}`)
      await expect(page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง')).toBeVisible()
      await expectStage(page, /protection|method_operation/)
    })
  })

  test('J12-A · [ทางแยก] ผู้บังคับบัญชาส่งคืนข้อเสนอเปลี่ยนวิธี → เจ้าหน้าที่เสนอใหม่', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(45))
    await submitReview(page, 'change_method', 'ภัยเปลี่ยนรูปแบบ', 'ผลทบทวนตาม คบ.13')
    await endorseAndApply(page, 'เสนออนุมัติและปรับ คบ.11')

    await test.step('WIT1110 · เสนอเปลี่ยนเป็นวิธีที่ 3', async () => {
      await proposeChange(page, [3], 'ภัยเปลี่ยนเป็นการเปิดเผยข้อมูล')
      await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี', 'ผบช.ชั้นต้น')
    })

    await test.step('WIT1110 · ผบช.ชั้นต้นส่งคืนแก้ไข — ชุดวิธีเดิมไม่ขยับ', async () => {
      await switchRole(page, 'supervisor')
      await decideChange(page, false, 'ยังไม่ครอบคลุมความเสี่ยงด้านการเดินทาง ให้ทบทวนใหม่', 'ยืนยันส่งคืนแก้ไข')
      const c = await readCase(page, CASE_NO)
      expect(((c?.methodChangeProposals as Rec[])[0]).stage).toBe('returned')
      expect(c?.approvedMethods).toEqual([1])
      expect(c?.kb11Signed).toBe(true)
    })

    await test.step('WIT1110 · เจ้าหน้าที่เสนอใหม่ (วิธีที่ 2 + 3) กลับเข้าคิว ผบช.ชั้นต้น', async () => {
      await switchRole(page, 'officer')
      await proposeChange(page, [2, 3], 'เพิ่มสถานที่ปลอดภัยควบคู่กับการปกปิดข้อมูล')
      await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี')
      const list = (await readCase(page, CASE_NO))?.methodChangeProposals as Rec[]
      expect(list).toHaveLength(2)
      expect(list[1].stage).toBe('supervisor')
      expect(list[1].proposedMethods).toEqual([2, 3])
    })

    await test.step('WIT1110 · ผบช.ชั้นต้นเห็นชอบ ผอ.อนุมัติ → ชุดวิธีเป็น 2+3', async () => {
      await switchRole(page, 'supervisor')
      await decideChange(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ')
      await switchRole(page, 'director')
      await decideChange(page, true, 'อนุมัติ', 'ยืนยันอนุมัติเปลี่ยนวิธี')
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([2, 3])
      expect(c?.kb11Signed).toBe(false)
    })
  })

  test('J12-B · [ทางแยก] ผอ.สำนัก/กอง ส่งคืนข้อเสนอเปลี่ยนวิธี → ชุดวิธีเดิมยังมีผล', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(45))
    await submitReview(page, 'change_method', 'ภัยเปลี่ยนรูปแบบ', 'ผลทบทวนตาม คบ.13')
    await endorseAndApply(page, 'เสนออนุมัติและปรับ คบ.11')

    await test.step('WIT1110 · เจ้าหน้าที่เสนอ → ผบช.ชั้นต้นเห็นชอบ', async () => {
      await proposeChange(page, [2], 'ย้ายพยานไปสถานที่ปลอดภัย')
      await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี')
      await switchRole(page, 'supervisor')
      await decideChange(page, true, 'เห็นชอบตามที่เสนอ', 'ยืนยันเห็นชอบ')
      expect((((await readCase(page, CASE_NO))?.methodChangeProposals as Rec[])[0]).stage).toBe('director')
    })

    await test.step('WIT1110 · ผอ.สำนัก/กอง ส่งคืนแก้ไข — ไม่เปลี่ยนวิธี ไม่ล้างความยินยอม', async () => {
      await switchRole(page, 'director')
      await decideChange(page, false, 'งบสถานที่ปลอดภัยยังไม่พร้อม ให้ทบทวนใหม่', 'ยืนยันส่งคืนแก้ไข')
      const c = await readCase(page, CASE_NO)
      expect(((c?.methodChangeProposals as Rec[])[0]).stage).toBe('returned')
      expect(c?.approvedMethods).toEqual([1])
      expect(c?.kb11Signed).toBe(true)
      expect((c?.methodTracks as Rec[]).map((t) => t.method)).toEqual([1])
    })

    await test.step('เจ้าหน้าที่เห็นว่าถูกส่งคืนและเสนอใหม่ได้', async () => {
      await switchRole(page, 'officer')
      await page.goto(REVIEW_URL)
      await expect(page.getByTestId('wit1110-propose')).toBeVisible()
    })
  })

  test('J12-C · [ทางแยก] เปลี่ยนเป็นวิธีที่ 1 → ต้องจัดทำ/แก้ คบ.8 ก่อนเริ่มปฏิบัติ', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', {
      ...reviewSeed(45),
      approvedMethods: [3],
      methodTracks: [{ method: 3, status: 'active', startedAt: daysAgoIso(44) }],
      kb5Approved: true,
      kb8Signed: true,
      kb8SignedAt: '10/09/2569 12:23',
      kb8SignedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
    })
    await submitReview(page, 'change_method', 'ภัยกลับมาเป็นการประทุษร้ายต่อร่างกาย', 'ผลทบทวนตาม คบ.13')
    await endorseAndApply(page, 'เสนออนุมัติและปรับ คบ.11')

    await test.step('WIT1110 · เสนอ → ผบช.ชั้นต้น → ผอ. อนุมัติเปลี่ยนเป็นวิธีที่ 1', async () => {
      await proposeChange(page, [1], 'ภัยกลับมาเป็นการประทุษร้ายต่อร่างกาย ต้องใช้ชุดคุ้มครอง')
      await confirmDialog(page, 'ยืนยันเสนอเปลี่ยนวิธี')
      await switchRole(page, 'supervisor')
      await decideChange(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ')
      await switchRole(page, 'director')
      await decideChange(page, true, 'อนุมัติให้เปลี่ยนเป็นวิธีที่ 1', 'ยืนยันอนุมัติเปลี่ยนวิธี', 'คบ.8')
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([1])
      expect(c?.kb8SignedAt).toBeFalsy() // คบ.8 ฉบับเดิมผูกกับชุดวิธีเดิม ลายมือชื่อถูกล้าง
      expect(String(c?.next)).toContain('คบ.8')
    })

    await test.step('ต่อ 08A-1 · แผงวิธีที่ 1 เริ่มปฏิบัติไม่ได้จนกว่าจะแก้ คบ.8 (WIT1110)', async () => {
      await switchRole(page, 'officer')
      await page.goto(`/protection-method/1?caseNo=${CASE_NO}`)
      await expect(page.getByText(/เปลี่ยนมาเป็นวิธีที่ 1 ตามข้อเสนอที่อนุมัติ/)).toBeVisible()
      await expect(page.getByText(/ต้องจัดทำ\/แก้ คบ\.8/)).toBeVisible()
    })
  })

  test('J12-D · [ทางแยก] ผลทบทวน "คุ้มครองต่อภายใต้คำสั่งเดิม" → ไม่เปลี่ยนวิธี กลับแท็บ 10', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(60))

    await test.step('WIT1104-1105 · เสนอผลทบทวน "คุ้มครองต่อ"', async () => {
      await submitReview(page, 'continue', 'ความเสี่ยงคงเดิม วิธีที่ใช้อยู่ยังเหมาะสม', 'ผลทบทวนตาม คบ.13 งวดล่าสุด ยังไม่มีเหตุเปลี่ยนแปลง')
      expect((((await readCase(page, CASE_NO))?.reviewProposals as Rec[]).at(-1))!.proposedOutcome).toBe('continue')
    })

    await test.step('WIT1106-1107 · ผบช.ชั้นต้นเห็นชอบ เจ้าหน้าที่ดำเนินการ (WIT1108)', async () => {
      await endorseAndApply(page, 'กำหนดรอบ คบ.13 ถัดไป')
      await expect(page.getByText('เลือกแนวทางแล้ว: คุ้มครองต่อภายใต้คำสั่งเดิม')).toBeVisible()
      // ไม่มีการ์ด WIT1110 เพราะไม่ได้เลือกเปลี่ยนวิธี
      await expect(page.getByTestId('wit1110-card')).toHaveCount(0)
    })

    await test.step('WIT1108 · คำสั่งเดิม/ชุดวิธี/คบ.11 ยังมีผล แล้วคลิกกลับแท็บ 10', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.status).toBe('คุ้มครองต่อภายใต้คำสั่งเดิม')
      expect(c?.stage).toBe('protection')
      expect(c?.approvedMethods).toEqual([1])
      expect(c?.kb11Signed).toBe(true)
      await page.getByRole('link', { name: /ไปรายงานผลการคุ้มครอง · กำหนดรอบ คบ\.13 ถัดไป/ }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO}`))
      await expect(page).toHaveURL(MONITOR_URL)
    })
  })

  test('J12-E · [ทางแยก] ผบช.ชั้นต้นส่งคืนผลทบทวน 11A → เจ้าหน้าที่เสนอใหม่เป็น "เปลี่ยนวิธี"', async ({ page }) => {
    test.setTimeout(180_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(45))

    await test.step('WIT1105 · เสนอผลทบทวน "คุ้มครองต่อ"', async () => {
      await submitReview(page, 'continue', 'ความเสี่ยงคงเดิม', 'ผลทบทวนตาม คบ.13')
    })

    await test.step('WIT1106 · ผบช.ชั้นต้นเห็นว่าข้อมูลภัยเปลี่ยน ส่งคืนแก้ไข', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(REVIEW_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('ภัยเปลี่ยนรูปแบบ ควรเสนอเปลี่ยนวิธี')
      await page.getByTestId('review-return').click()
      await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข')
      const p = ((await readCase(page, CASE_NO))?.reviewProposals as Rec[])[0]
      expect(p.status).toBe('returned')
      expect(p.reviewNote).toContain('ภัยเปลี่ยนรูปแบบ')
    })

    await test.step('WIT1105 · เจ้าหน้าที่เห็นเหตุผลที่ส่งคืนและเสนอใหม่เป็น "เปลี่ยนวิธี"', async () => {
      await switchRole(page, 'officer')
      await page.goto(REVIEW_URL)
      await expect(page.getByText(/ส่งคืนแก้ไขเมื่อ/)).toBeVisible()
      await submitReview(page, 'change_method', 'ภัยเปลี่ยนรูปแบบ วิธีเดิมไม่เหมาะสม', 'แก้ตามความเห็นผู้บังคับบัญชา')
      const list = (await readCase(page, CASE_NO))?.reviewProposals as Rec[]
      expect(list).toHaveLength(2)
      expect(list[1].proposedOutcome).toBe('change_method')
      expect(list[1].status).toBe('pending')
    })

    await test.step('WIT1106 · ผบช.ชั้นต้นเห็นชอบ → ปุ่ม "ยกเลิก" ในจอยืนยันไม่ทำอะไร', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(REVIEW_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('เห็นชอบ')
      await page.getByTestId('review-endorse').click()
      await cancelDialog(page)
      expect((((await readCase(page, CASE_NO))?.reviewProposals as Rec[])[1]).status).toBe('pending')
      await page.getByTestId('review-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
      expect((((await readCase(page, CASE_NO))?.reviewProposals as Rec[])[1]).status).toBe('endorsed')
    })
  })
})
