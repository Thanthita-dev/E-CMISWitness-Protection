import { expect, test, type Page } from '@playwright/test'
import { chooseKb6IfAsked } from '../helpers/methodChoice'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import type { UserRole } from '../../src/types/user'
import { passSarabanCheckpoint, switchClerkRole } from '../helpers/saraban'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, formRow, signInModal } from '../journeys/journey-helpers'

/**
 * RRR-08 · แท็บ 08A / 08B / 08C — ทุกจุด Return / Revision / Reject ของวิธีคุ้มครอง (วนครบรอบจนผ่าน)
 *
 * WIT0812  08A  พยานไม่ยินยอม → เสนอ ทบทวน/เปลี่ยนวิธี/ยุติ → ผบช.ชั้นต้น → ผอ. (ส่งคืนแก้ไขได้ทั้งสองชั้น)
 * WIT0818  08A-1 เลขาธิการฯ ส่งกลับแก้ไข คบ.8 → kb8Version+1 · kb8PreviousVersions (returnedAt/returnedBy/returnReason) เก็บฉบับเดิม → ธุรการขาลง WIT0872 → เสนอซ้ำ
 * WIT0843  08B  ธุรการส่งคืนหนังสือประสานให้แก้ไข (returnCoordinationLetter · commit c1da3d82) → เสนอขอเลขใหม่ → ออกเลข → นำส่ง
 * WIT0845  08B  หน่วยงานปฏิเสธ → เสนอหน่วยงานใหม่ → ผบช.ชั้นต้นส่งคืน → เสนอใหม่ → ผอ. อนุมัติ → วิธีที่ 4 เดินต่อ (ล้าง letterNumbering ให้ขอเลขหนังสือฉบับใหม่)
 * WIT0855  08C  ผบช.ชั้นต้นส่งคืนเรื่องข้อ 14 → article14.revisions + หนังสือ คบ.18 ฉบับใหม่ (เก็บฉบับเดิม) → เสนอใหม่ → ผ่าน
 * WIT0860  08C  แขนง WIT0887/0888 กรมแจ้งดำเนินการไม่ได้ (step delivery_failed) → เสนอแนวทาง → ผบช.ชั้นต้นส่งคืน → เสนอใหม่ → เห็นชอบ → ผอ. อนุมัติ
 *
 * ทุกเทสต์ seed state ของตัวเอง (ไม่แชร์ state) · ตรวจผ่าน readCase ตามเจ้าของ/ขั้น/เหตุผล และประวัติฉบับเดิมที่ต้องไม่หาย
 * ส่วน Reject ของคณะกรรมการข้อ 14 อยู่ที่ TC-096 (ชีต 08c) · ครอบคลุมเพิ่มเติมจากชุดเดิมที่ทดสอบ "ส่งคืนครั้งเดียว": ที่นี่ทดสอบ "ส่งคืน → แก้ → เสนอซ้ำ → ผ่าน" ให้ครบรอบ
 */

const METHODS_URL = '/protection-methods'
const METHOD4_URL = `/protection-method/4?caseNo=${CASE_NO}`
const ARTICLE14_URL = '/article14'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
// owner ของเจ้าหน้าที่ขึ้นกับบัญชีที่ mock state จับคู่ให้บทบาท officer (ส่วนกลาง หรือ เขต 1)
const OFFICER_OWNERS = [OFFICER, 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ']
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const NO_POPUP = '.swal2-popup:not(.swal2-toast)'

/**
 * สลับเป็นบัญชีทดลองของบทบาทนั้นเต็มรูปแบบ (ผู้ใช้ + หน่วยงาน) เหมือนตอน seed — switchRole สลับแค่ role
 * ทำให้หลังธุรการนำส่งแล้วเจ้าหน้าที่ยังเป็นผู้ใช้/หน่วยของ secretary จึงเปิดแฟ้มไม่ได้ ("ไม่มีสิทธิ์เปิดแฟ้มนี้")
 */
async function actAs(page: Page, role: UserRole) {
  const raw = await page.evaluate(() => localStorage.getItem('ecmis-auth-storage'))
  const auth = JSON.parse(raw!)
  const account = mockStateAccountForRole(role)!
  auth.state = authStateForAccount(account, auth.state)
  await page.addInitScript((value: string) => localStorage.setItem('ecmis-auth-storage', value), JSON.stringify(auth))
  await page.reload()
}

type Proposal = Record<string, unknown> & { proposedAction?: string; stage: string }
type Dict = Record<string, unknown>

// ---------------------------------------------------------------------------
// 08A · WIT0812 พยานไม่ยินยอม — ส่งคืน → เสนอใหม่เป็นแนวทางอื่น → อนุมัติ
// ---------------------------------------------------------------------------

/** หน้ารายการ "งานตามวิธีคุ้มครอง" → "เปิดงาน" ของแฟ้ม → หน้างานรายแฟ้ม → กางรายการพับ "พยานไม่ยินยอม" (WIT0812) */
async function openDeclineCard(page: Page) {
  await page.goto(METHODS_URL)
  await page.getByRole('row', { name: new RegExp(CASE_NO) }).getByRole('link', { name: 'เปิดงาน', exact: true }).click()
  await expect(page).toHaveURL(/\/protection-method-work\?caseNo=/)
  await chooseKb6IfAsked(page)
  const card = page.getByTestId('wit0812-card')
  if (!(await card.isVisible())) await page.locator('summary', { hasText: 'พยานไม่ยินยอม' }).click()
  await expect(card).toBeVisible()
}

async function declineAndPropose(page: Page, action: 'review' | 'change_method' | 'terminate', reason: string, newMethods: number[] = []) {
  await openDeclineCard(page)
  await page.getByTestId('decline-reason').fill(reason)
  await page.getByTestId('decline-evidence').fill('บันทึกถ้อยคำพยาน ลงวันที่ 11 ก.ย. 2569')
  await page.getByTestId(`decline-action-${action}`).click()
  for (const m of newMethods) await page.getByTestId(`decline-new-method-${m}`).click()
  await page.getByTestId('decline-submit').click()
}

async function decideDecline(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await openDeclineCard(page)
  await page.getByTestId('decline-decision-note').fill(note)
  await page.getByTestId(endorse ? 'decline-endorse' : 'decline-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('RRR-08A · WIT0812 พยานไม่ยินยอม — ส่งคืนแก้ไขแล้วเสนอใหม่จนผ่าน', () => {
  test('RRR-08A-1 · เสนอ "ยุติ" → ผบช.เห็นชอบ → ผอ. ส่งคืน (ต้องมีเหตุผล) → เจ้าหน้าที่เสนอ "เปลี่ยนวิธี" ใหม่ → ผบช. → ผอ. อนุมัติ → เปิดวิธีที่ 3', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · เจ้าหน้าที่เสนอ "ยุติ" (รอบที่ 1) → ผบช.ชั้นต้น', async () => {
      await declineAndPropose(page, 'terminate', 'พยานปฏิเสธการคุ้มครองทุกรูปแบบ')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')
      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0]).toMatchObject({ proposedAction: 'terminate', stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0812 · ผบช.ชั้นต้นเห็นชอบ → ผอ.สำนัก/กอง', async () => {
      await switchRole(page, 'supervisor')
      await decideDecline(page, true, 'เห็นควรยุติตามที่เสนอ', 'ยืนยันเห็นชอบ')
      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('director')
      expect(c?.owner).toBe(DIRECTOR)
    })

    await test.step('WIT0812 · ผอ. ส่งคืนโดยไม่ระบุเหตุผลไม่ได้ แล้วระบุเหตุผลและยืนยัน → กลับถึงเจ้าหน้าที่ พร้อมเก็บความเห็นชั้น ผบช.ไว้', async () => {
      await switchRole(page, 'director')
      await openDeclineCard(page)
      await page.getByTestId('decline-return').click() // ยังไม่ระบุเหตุผล
      await expect(page.locator(NO_POPUP)).toHaveCount(0)
      expect((await readCase(page, CASE_NO) as Dict | null)?.owner).toBe(DIRECTOR)

      await decideDecline(page, false, 'ยังไม่ควรยุติ ให้เสนอเปลี่ยนวิธีก่อน', 'ยืนยันส่งคืนแก้ไข')
      const c = await readCase(page, CASE_NO)
      const p0 = (c?.consentDeclineProposals as Proposal[])[0]
      expect(p0.stage).toBe('returned')
      expect(p0.returnNote).toBe('ยังไม่ควรยุติ ให้เสนอเปลี่ยนวิธีก่อน')
      expect(p0.returnedBy).toBeTruthy()
      expect(p0.returnedAt).toBeTruthy()
      expect(p0.supervisorNote).toBe('เห็นควรยุติตามที่เสนอ') // ความเห็นชั้นก่อนไม่หาย
      expect(OFFICER_OWNERS).toContain(c?.owner)
      // ส่งคืนแล้วห้ามเริ่มวิธีใดและไม่ใช่การเปิดเส้นทางยุติ
      expect(((c?.methodTracks ?? []) as Array<{ status: string }>).some((t) => t.status === 'active')).toBe(false)
      expect(c?.stage).not.toBe('termination_review')
    })

    await test.step('WIT0812 · เจ้าหน้าที่เสนอใหม่เป็น "เปลี่ยนวิธี" (วิธีที่ 3) — ข้อเสนอเดิมยังเก็บไว้เป็นประวัติ', async () => {
      await switchRole(page, 'officer')
      await declineAndPropose(page, 'change_method', 'พยานไม่ยินยอมย้ายที่พัก แต่รับการปกปิดข้อมูลได้', [3])
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'วิธีที่ 3')
      const c = await readCase(page, CASE_NO)
      const proposals = c?.consentDeclineProposals as Proposal[]
      expect(proposals).toHaveLength(2)
      expect(proposals[0].stage).toBe('returned')
      expect(proposals[1]).toMatchObject({ proposedAction: 'change_method', proposedMethods: [3], stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0812 · กลับเข้าผู้ตรวจที่ถูกต้อง: ผบช.ชั้นต้น → ผอ. อนุมัติ → เปิดชุดวิธีใหม่ [3] ต้องลงนาม คบ.11 ใหม่', async () => {
      await switchRole(page, 'supervisor')
      await decideDecline(page, true, 'เห็นควรเปลี่ยนเป็นวิธีที่ 3', 'ยืนยันเห็นชอบ')
      expect(((await readCase(page, CASE_NO))?.consentDeclineProposals as Proposal[])[1].stage).toBe('director')

      await switchRole(page, 'director')
      await decideDecline(page, true, 'อนุมัติเปลี่ยนวิธี', 'ยืนยันอนุมัติแนวทาง', 'คบ.11')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.consentDeclineProposals as Proposal[]
      expect(proposals[0].stage).toBe('returned') // ฉบับที่ถูกส่งคืนไม่ถูกเขียนทับ
      expect(proposals[1].stage).toBe('approved')
      expect(proposals[1].appliedAt).toBeTruthy()
      // โค้ดปัจจุบัน: store ล้าง kb11Signed ก่อนเรียก setApprovedMethods ซึ่งถูกประตู kb11 ปิดไว้ จึงยังไม่เปิดวิธีใหม่ (ดู test.fixme RRR-08A-4 ท้ายชุดนี้)
      expect(proposals[1].proposedMethods).toEqual([3])
      expect(c?.kb11Signed).toBe(false)
      expect(c?.next).toContain('คบ.11')
    })
  })

  test('RRR-08A-2 · ผบช.ชั้นต้นส่งคืน (ต้องมีเหตุผล) → ข้อเสนอเดิมเก็บไว้ → เจ้าหน้าที่เสนอ "ทบทวน" ใหม่ → ผบช. → ผอ. อนุมัติ → เข้ารายการทบทวน 11A', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await declineAndPropose(page, 'terminate', 'พยานขอยุติ')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

    await switchRole(page, 'supervisor')
    await openDeclineCard(page)
    await page.getByTestId('decline-return').click() // ไม่มีเหตุผล → ไม่ขึ้นจอยืนยัน
    await expect(page.locator(NO_POPUP)).toHaveCount(0)
    await decideDecline(page, false, 'เหตุผลยังไม่พอให้ยุติ ให้เสนอทบทวนก่อน', 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

    let c = await readCase(page, CASE_NO)
    let proposals = c?.consentDeclineProposals as Proposal[]
    expect(proposals[0]).toMatchObject({ stage: 'returned', returnNote: 'เหตุผลยังไม่พอให้ยุติ ให้เสนอทบทวนก่อน' })
    expect(proposals[0].returnedBy).toBeTruthy()
    expect(OFFICER_OWNERS).toContain(c?.owner)

    await switchRole(page, 'officer')
    await declineAndPropose(page, 'review', 'ปรับเป็นเสนอทบทวนตามข้อสั่งการ ผบช.')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')
    c = await readCase(page, CASE_NO)
    proposals = c?.consentDeclineProposals as Proposal[]
    expect(proposals).toHaveLength(2)
    expect(proposals[1]).toMatchObject({ proposedAction: 'review', stage: 'supervisor' })
    expect(c?.owner).toBe(SUPERVISOR)

    await switchRole(page, 'supervisor')
    await decideDecline(page, true, 'เห็นชอบให้ทบทวน', 'ยืนยันเห็นชอบ')
    await switchRole(page, 'director')
    await decideDecline(page, true, 'อนุมัติให้ทบทวน', 'ยืนยันอนุมัติแนวทาง', 'ทบทวนผลการคุ้มครอง')

    c = await readCase(page, CASE_NO)
    proposals = c?.consentDeclineProposals as Proposal[]
    expect(proposals.map((p) => p.stage)).toEqual(['returned', 'approved'])
    expect(c?.reviewHandoff).toBeTruthy()

    await switchRole(page, 'officer')
    // หน้า /protection-reviews ถูกถอดแล้ว (แท็บ 11A ปัจจุบันเดินต่อที่ /protection-duration)
    await page.goto(`/protection-duration?caseNo=${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByRole('heading', { name: 'ระยะเวลาคุ้มครอง' })).toBeVisible()
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
  })

  // App bug: อนุมัติ "เปลี่ยนวิธี" แล้ว approveConsentDecline ตั้ง approvedMethods:[] / kb11Signed:false ก่อนเรียก setApprovedMethods
  // แต่ setApprovedMethods return ทันทีเพราะ kb11 ยังไม่ลงนาม → approvedMethods เป็น [] ไม่ใช่วิธีที่อนุมัติ ([3]) ตามที่คอมเมนต์ใน store ระบุ
  test.fixme('RRR-08A-4 · เปลี่ยนวิธีที่ผอ.อนุมัติแล้วต้องเปิดชุดวิธีใหม่ approvedMethods = [3] (โค้ดปัจจุบันได้ [])', async () => {
    // เมื่อแก้ที่ useCaseStore: หลังอนุมัติ expect(c.approvedMethods).toEqual([3]) และ kb11Signed=false
  })

  test('RRR-08A-3 · ยกเลิกในจอยืนยันส่งคืน/บันทึกไม่ยินยอม — แฟ้มไม่ขยับ ข้อเสนอไม่ถูกบันทึก', async ({ page }) => {
    await seedMockState(page, 'Case 1.11', 'officer')

    await declineAndPropose(page, 'review', 'ขอเวลาปรึกษาครอบครัว')
    await cancelDialog(page)
    expect((await readCase(page, CASE_NO))?.consentDeclineProposals ?? []).toEqual([])

    await page.getByTestId('decline-submit').click()
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

    await switchRole(page, 'supervisor')
    await openDeclineCard(page)
    await page.getByTestId('decline-decision-note').fill('ให้ชี้แจงข้อตกลงซ้ำ')
    await page.getByTestId('decline-return').click()
    await cancelDialog(page)
    const c = await readCase(page, CASE_NO)
    expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('supervisor') // ยังรอ ผบช.
    expect(c?.owner).toBe(SUPERVISOR)
  })
})

// ---------------------------------------------------------------------------
// 08A-1 · WIT0818 คบ.8 ถูกส่งกลับแก้ไข 2 รอบ แล้วลงนามผ่าน
// ---------------------------------------------------------------------------

test.describe('RRR-08A-1 · WIT0817/WIT0818 คบ.8 ส่งกลับแก้ไข — FormRevisionEntry ครบ ฉบับเดิมไม่หาย', () => {
  test('RRR-08A1-1 · เลขาธิการฯ ส่งกลับ 2 รอบ (v1→v2→v3) → ธุรการส่งคืนถึงเจ้าหน้าที่ → เสนอซ้ำ → ลงนาม คบ.8 ฉบับที่ 3', async ({ page }) => {
    test.setTimeout(420_000)
    // Case 1.12: kb11Signed + approvedMethods [1] — จำลองว่าเจ้าหน้าที่เสนอ คบ.8 ฉบับที่ 1 เรียบร้อยและถึงเลขาธิการฯ แล้ว
    await seedMockState(page, 'Case 1.12', 'secretary', {
      kb8Signed: false,
      kb8SubmittedAt: '10/09/2569 08:00',
      kb8SubmittedBy: OFFICER,
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    const returnKb8 = async (reason: string) => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByTestId('kb8-return-for-revision').click() // ไม่ระบุเหตุผล → ไม่ขึ้นจอยืนยัน
      await expect(page.locator(NO_POPUP)).toHaveCount(0)
      await page.getByTestId('kb8-return-reason-input').fill(reason)
      await page.getByTestId('kb8-return-for-revision').click()
      await confirmDialog(page, 'ยืนยันส่งกลับ')
    }
    /** ส่งคืนลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย แล้วสลับเป็นเจ้าหน้าที่ */
    const clerksDown = async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await actAs(page, 'officer')
    }
    /** เสนอ คบ.8 ขึ้นเลขาธิการฯ ผ่านธุรการหน่วย → ธุรการ สลธ. */
    const officerResubmit = async () => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      expect((await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await actAs(page, 'secretary')
    }

    await test.step('WIT0818 · รอบที่ 1 ส่งกลับ → Revision v2 · เก็บ v1 พร้อม returnedAt/By/Reason · เจ้าของกลับเป็นเจ้าหน้าที่', async () => {
      await returnKb8('รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Version).toBe(2)
      const prev = c?.kb8PreviousVersions as Dict[]
      expect(prev).toHaveLength(1)
      expect(prev[0]).toMatchObject({ version: 1, submittedBy: OFFICER, returnReason: 'รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ' })
      expect(prev[0].returnedAt).toBeTruthy()
      expect(prev[0].returnedBy).toBeTruthy()
      expect(c?.kb8Signed).toBeFalsy()
      expect(c?.kb8SubmittedAt).toBeUndefined()
      // ระหว่างขาลงผ่านธุรการ (WIT0872) owner คือธุรการที่ถือเรื่อง — ผู้รับปลายทางคือเจ้าหน้าที่ผู้จัดทำ
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'down' })
      expect(OFFICER_OWNERS).toContain((c?.sarabanDispatch as Dict).recipientName)
    })

    await test.step('WIT0872 · ธุรการส่งคืนลงหน่วย → เจ้าหน้าที่แก้และเสนอ v2 ซ้ำ (กลับถึงเลขาธิการฯ)', async () => {
      await clerksDown()
      const delivered = await readCase(page, CASE_NO)
      expect(delivered?.sarabanDispatch).toBeFalsy()
      expect(OFFICER_OWNERS).toContain(delivered?.owner) // ธุรการนำส่งถึงเจ้าหน้าที่แล้ว
      await officerResubmit()
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Version).toBe(2)
      expect(c?.kb8Signed).toBeFalsy()
      expect(OFFICER_OWNERS).not.toContain(c?.owner)
    })

    await test.step('WIT0818 · รอบที่ 2 ส่งกลับอีกครั้ง → Revision v3 · ประวัติ v1 และ v2 ครบ ไม่ถูกเขียนทับ', async () => {
      await returnKb8('ระบุผู้ใกล้ชิดที่ได้รับอนุมัติไม่ครบ')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Version).toBe(3)
      const prev = c?.kb8PreviousVersions as Dict[]
      expect(prev.map((p) => p.version)).toEqual([1, 2])
      expect(prev[0].returnReason).toBe('รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ')
      expect(prev[1]).toMatchObject({ version: 2, returnReason: 'ระบุผู้ใกล้ชิดที่ได้รับอนุมัติไม่ครบ' })
      expect(prev[1].submittedAt).toBeTruthy() // v2 เคยเสนอจริงก่อนถูกส่งกลับ
      expect(OFFICER_OWNERS).toContain((c?.sarabanDispatch as Dict).recipientName)
    })

    await test.step('WIT0817-0818 · เสนอ v3 ผ่านธุรการ → เลขาธิการฯ ลงนามผ่าน (ล็อกเอกสาร) · ประวัติ 2 ฉบับยังอยู่', async () => {
      await clerksDown()
      await officerResubmit()
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.8').getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
      await signInModal(page)

      await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8Signed).toBe(true)
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8SignedAt).toBeTruthy()
      expect(c?.kb8Version).toBe(3)
      expect((c?.kb8PreviousVersions as Dict[]).map((p) => p.version)).toEqual([1, 2])
    })
  })

  // ผู้ตรวจ Return แผนปฏิบัติรายวิธี (วิธีที่ 1 ชุดคุ้มครอง / วิธีที่ 2 สถานที่ปลอดภัย / วิธีที่ 3 ปกปิดข้อมูล) ไม่มีใน UI:
  // แผนปฏิบัติของ 08A-1/2/3 เป็นงานเจ้าหน้าที่ล้วน ๆ (ไม่มีขั้นผู้บังคับบัญชาตรวจ/ส่งคืนแก้ไข) — มีแค่ คบ.8 ที่เลขาธิการฯ ส่งกลับได้
  // สถานที่ไม่เหมาะสมของวิธีที่ 2 (TC-075) เป็นการประเมินของเจ้าหน้าที่เอง ไม่ใช่ Return และมีเทสต์ในชีต 08a2 แล้ว
  test.fixme('RRR-08A1-2 · ผู้บังคับบัญชาส่งคืนแก้ไขแผนปฏิบัติวิธีที่ 1/2/3 — ยังไม่มี UI (ไม่มี FormRevisionEntry ของแผนรายวิธี)', async () => {
    // เมื่อมี UI: return → track.planPreviousVersions เก็บฉบับเดิม + เหตุผล → เจ้าหน้าที่แก้/เสนอซ้ำ → ผู้ตรวจเดิมอนุมัติ
  })
})

// ---------------------------------------------------------------------------
// 08B · WIT0843 ธุรการส่งคืนหนังสือประสาน (วิธีที่ 4) — แก้ → ขอเลขใหม่ → ออกเลข → นำส่ง
// ---------------------------------------------------------------------------

const AGENCY_A = 'สำนักงานคุ้มครองพยาน กรมสอบสวนคดีพิเศษ (DSI)'
const AGENCY_B = 'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ'

/** WIT0842 — หน่วยงานที่ประสานไม่ใช่สถานีตำรวจ (กรอกชื่อได้โดยตรง) อยู่ขั้นหน่วยงาน/หนังสือ (wizardStep 1) ยังไม่ส่งหนังสือ */
const AT_LETTER_DRAFT = {
  kb11Signed: true,
  approvedMethods: [4],
  methodTracks: [{ method: 4, status: 'pending', wizardStep: 1, coordination: { agency: AGENCY_A, agencyType: 'dopa', responseStatus: 'awaiting' } }],
  officialLetters: [],
  coordinationProposals: [],
}

/** ตั้งต้นของเส้นทางปฏิเสธ WIT0845 — เหมือนชีต 08b (วิธีที่ 4 รอหนังสือตอบกลับ) */
const AT_COORDINATION_START = {
  kb11Signed: true,
  approvedMethods: [4],
  methodTracks: [{ method: 4, status: 'pending', wizardStep: 2, coordination: { agency: AGENCY_A, agencyType: 'dopa', responseStatus: 'awaiting' } }],
  officialLetters: [],
  coordinationProposals: [],
}

const letterNumbering = async (page: Page) =>
  ((await readCase(page, CASE_NO))?.methodTracks as Array<{ method: number; wizardStep?: number; status: string; coordination?: Dict }>).find((t) => t.method === 4)!

test.describe('RRR-08B · WIT0843 หนังสือประสานถูกธุรการส่งคืน — แก้ไขแล้วขอเลขใหม่จนนำส่งได้', () => {
  test('RRR-08B-1 · เจ้าหน้าที่ขอเลข → ธุรการส่งคืน (ต้องมีเหตุผล) → เจ้าหน้าที่เห็นเหตุผลและแก้ → ขอเลขใหม่ → ธุรการออกเลข → นำส่ง', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_DRAFT)
    await page.goto(METHOD4_URL)
    const officerUnit = await page.evaluate(() => JSON.parse(localStorage.getItem('ecmis-auth-storage') || '{}').state?.currentOrgUnitId as string | undefined)
    const openLetter = async () => {
      await page.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
      await expect(page.getByTestId('coordination-letter-composer')).toBeVisible()
    }

    await test.step('WIT0843 · เจ้าหน้าที่ส่งธุรการขอเลข (ยืนยันที่จอ) → สถานะ pending · หนังสือถูกล็อกไม่ให้แก้', async () => {
      await openLetter()
      await expect(page.getByTestId('coordination-letter-numbering')).toHaveAttribute('data-status', 'draft')
      await page.getByTestId('coordination-request-number').click()
      await confirmDialog(page, 'ยืนยันส่งธุรการออกเลข', AGENCY_A)

      const t = await letterNumbering(page)
      const n = t.coordination!.letterNumbering as Dict
      expect(n).toMatchObject({ status: 'pending', clerkRole: 'receiver' })
      expect(n.unitId).toBeTruthy()
      expect(n.requestedBy).toBeTruthy()
      expect((t.coordination!.letterDraft as Dict).registryNo).toBe('') // เลขออกโดยธุรการเท่านั้น

      await openLetter()
      await expect(page.getByTestId('coordination-letter-pending')).toBeVisible()
      await expect(page.getByTestId('coordination-request-number')).toHaveCount(0)
      await expect(page.getByLabel('เรื่อง', { exact: true })).toBeDisabled()
    })

    const unitId = (((await letterNumbering(page)).coordination!.letterNumbering) as Dict).unitId as string

    await test.step('WIT0843 · ธุรการหน่วยเจ้าของเรื่อง: ส่งคืนโดยไม่ระบุเหตุผลไม่ได้ และยกเลิกในจอยืนยันแล้วสถานะยัง pending', async () => {
      await switchClerkRole(page, 'receiver', unitId)
      await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
      await expect(page.getByTestId('letter-numbering-workspace')).toHaveAttribute('data-status', 'pending')

      await page.getByTestId('letter-numbering-return').click()
      await page.getByTestId('letter-numbering-return-confirm').click() // ยังไม่ระบุสิ่งที่ต้องแก้ไข
      await expect(page.getByRole('alert').filter({ hasText: 'กรุณาระบุสิ่งที่ต้องแก้ไข' })).toBeVisible()
      await expect(page.locator(NO_POPUP)).toHaveCount(0)

      await page.getByTestId('letter-numbering-return-note').fill('ชื่อผู้ลงนามในหนังสือไม่ถูกต้อง')
      await page.getByTestId('letter-numbering-return-confirm').click()
      await cancelDialog(page)
      const n = (await letterNumbering(page)).coordination!.letterNumbering as Dict
      expect(n.status).toBe('pending')
      expect(n.returnNote).toBeUndefined()
    })

    await test.step('WIT0843 · ธุรการยืนยันส่งคืน → status returned บันทึกผู้ส่งคืน/เวลา/เหตุผล · ออกจากคิวธุรการ · ลง Audit Log', async () => {
      await page.getByTestId('letter-numbering-return-confirm').click()
      await confirmDialog(page, 'ยืนยันส่งคืน', 'ชื่อผู้ลงนามในหนังสือไม่ถูกต้อง')

      const c = await readCase(page, CASE_NO)
      const n = (await letterNumbering(page)).coordination!.letterNumbering as Dict
      expect(n).toMatchObject({ status: 'returned', returnNote: 'ชื่อผู้ลงนามในหนังสือไม่ถูกต้อง' })
      expect(n.returnedBy).toBeTruthy()
      expect(n.returnedAt).toBeTruthy()
      expect(n.numberedAt).toBeUndefined()
      expect(((c?.assignmentHistory ?? []) as Array<{ action: string; detail: string }>).some(
        (h) => h.action === 'ธุรการส่งคืนหนังสือประสานให้แก้ไข' && h.detail === 'ชื่อผู้ลงนามในหนังสือไม่ถูกต้อง',
      )).toBe(true)
      // ไม่มีหนังสือถูกนำส่งไปโดยที่ยังไม่ผ่านธุรการ
      expect(c?.officialLetters).toEqual([])
      // ส่งคืนแล้ว ธุรการไม่ควรมีงานค้างของแฟ้มนี้
      await page.goto('/saraban')
      await expect(page.getByText(CASE_NO)).toHaveCount(0)
    })

    await test.step('WIT0843 · เจ้าหน้าที่เห็นเหตุผลที่ถูกส่งคืน หนังสือกลับมาแก้ไขได้ → แก้เนื้อหาแล้วขอเลขใหม่', async () => {
      await switchClerkRole(page, 'officer', officerUnit)
      await page.goto(METHOD4_URL)
      await openLetter()
      const returned = page.getByTestId('coordination-letter-returned')
      await expect(returned).toContainText('ชื่อผู้ลงนามในหนังสือไม่ถูกต้อง')
      await expect(page.getByLabel('เรื่อง', { exact: true })).toBeEnabled()

      await page.getByLabel('ชื่อผู้ลงชื่อในหนังสือ', { exact: true }).fill('พ.ต.อ. ผู้ลงนามที่ถูกต้อง')
      await page.getByRole('textbox', { name: 'เนื้อหาหนังสือประสาน' }).fill('ขอความร่วมมือคุ้มครองพยาน (แก้ไขตามที่ธุรการส่งคืน)')
      await page.getByTestId('coordination-request-number').click()
      await confirmDialog(page, 'ยืนยันส่งธุรการออกเลข')

      const draft = (await letterNumbering(page)).coordination!.letterDraft as Dict
      const n = (await letterNumbering(page)).coordination!.letterNumbering as Dict
      expect(draft.signerName).toBe('พ.ต.อ. ผู้ลงนามที่ถูกต้อง')
      expect(draft.body).toContain('แก้ไขตามที่ธุรการส่งคืน')
      expect(n.status).toBe('pending') // กลับเข้าคิวธุรการเดิมอีกครั้ง
      expect(n.unitId).toBe(unitId)
    })

    await test.step('WIT0843 · ธุรการออกเลขใหม่ → numbered · เลข/วันที่เข้าหนังสือ', async () => {
      await switchClerkRole(page, 'receiver', unitId)
      await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
      await expect(page.getByTestId('letter-numbering-workspace')).toHaveAttribute('data-status', 'pending')
      await page.getByTestId('letter-numbering-number').fill('ปท 901/2569')
      await page.getByTestId('letter-numbering-issue').click()
      await confirmDialog(page, 'ยืนยันออกเลข', 'ปท 901/2569')

      const co = (await letterNumbering(page)).coordination!
      expect((co.letterNumbering as Dict).status).toBe('numbered')
      expect((co.letterDraft as Dict).registryNo).toBe('ปท 901/2569')
    })

    await test.step('WIT0843→WIT0844 · นำส่งหนังสือ → sent · วิธีที่ 4 เปิดขั้นรอหนังสือตอบกลับ · หนังสือขาออกเข้าทะเบียน', async () => {
      await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', 'ปท 901/2569')

      const c = await readCase(page, CASE_NO)
      const t = await letterNumbering(page)
      expect((t.coordination!.letterNumbering as Dict).status).toBe('sent')
      expect(t.status).toBe('preparing')
      expect(t.wizardStep).toBe(2)
      const letters = c?.officialLetters as Dict[]
      expect(letters).toHaveLength(1)
      expect(letters[0]).toMatchObject({ direction: 'outgoing', context: 'method4', registryNo: 'ปท 901/2569' })
      expect((letters[0].draftSnapshot as Dict).body).toContain('แก้ไขตามที่ธุรการส่งคืน') // ส่งฉบับที่แก้แล้ว ไม่ใช่ฉบับก่อนถูกส่งคืน
    })
  })

  test('RRR-08B-2 · ธุรการคนละหน่วย/เจ้าหน้าที่ ส่งคืนหนังสือเองไม่ได้ (สิทธิ์) — สถานะยัง pending', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_DRAFT)
    await page.goto(METHOD4_URL)
    await page.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
    await page.getByTestId('coordination-request-number').click()
    await confirmDialog(page, 'ยืนยันส่งธุรการออกเลข')
    const unitId = (((await letterNumbering(page)).coordination!.letterNumbering) as Dict).unitId as string

    // เจ้าหน้าที่ไปหน้าทะเบียนสารบรรณ — หน้านี้ไม่ใช่หน้าที่ของบทบาทเจ้าหน้าที่ (route guard) จึงไม่มีปุ่มส่งคืน/ออกเลขให้กดเลย
    await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByRole('heading', { name: 'ไม่มีสิทธิ์เข้าถึงหน้านี้' })).toBeVisible()
    await expect(page.getByTestId('letter-numbering-return')).toHaveCount(0)
    await expect(page.getByTestId('letter-numbering-issue')).toHaveCount(0)

    // ธุรการหน่วยอื่นก็ทำไม่ได้
    const otherUnit = unitId === 'pacc-reg-2' ? 'pacc-reg-3' : 'pacc-reg-2'
    await switchClerkRole(page, 'receiver', otherUnit)
    await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByTestId('letter-numbering-readonly')).toBeVisible()
    await expect(page.getByTestId('letter-numbering-return')).toHaveCount(0)
    expect(((await letterNumbering(page)).coordination!.letterNumbering as Dict).status).toBe('pending')
  })

  // ธุรการส่งคืนแล้ว ข้อความหนังสือฉบับก่อนส่งคืน (letterDraft เดิม) ถูกเขียนทับเมื่อแก้ไข และ letterNumbering รอบใหม่แทนที่ returnNote เดิม
  // เหลือร่องรอยเพียง assignmentHistory — ต่างจาก คบ.3/คบ.6/คบ.8/คบ.18 ที่มี *PreviousVersions (FormRevisionEntry) เก็บฉบับเดิม
  test.fixme('RRR-08B-3 · หนังสือประสานที่ถูกส่งคืนต้องเก็บฉบับเดิมเป็นประวัติ (เหมือน FormRevisionEntry) — ยังไม่มีใน CaseItem/UI', async () => {
    // เมื่อมี: coordination.letterPreviousVersions[] = { version, returnedAt, returnedBy, returnReason, draft } แสดงใน VersionHistory ของหนังสือ
  })
})

// ---------------------------------------------------------------------------
// 08B · WIT0845 หน่วยงานปฏิเสธ — ผบช.ส่งคืน → เสนอใหม่ → ผอ. อนุมัติ → วิธีที่ 4 เดินต่อ
// ---------------------------------------------------------------------------

/**
 * เปิดแผงวิธีที่ 4 ที่ section ขาเข้า (WIT0844/0845) — แผงวิธีที่ 4 ไม่มีปุ่มถัดไป/ย้อนกลับแล้ว
 * ขั้นปัจจุบันเป็นค่า track.wizardStep ที่ persist ไว้ (seed เป็น 2 = ขาเข้า) แสดง section ตามค่านั้นโดยตรง
 */
async function gotoSection(page: Page, index: number) {
  expect(index).toBe(2)
  await page.goto(METHOD4_URL)
  await expect(page.getByTestId('coordination-decline')).toBeVisible()
}

async function recordDecline(page: Page, reason: string) {
  await gotoSection(page, 2)
  await page.getByRole('textbox', { name: 'เหตุผล (กรณีปฏิเสธ)' }).fill(reason)
  await page.getByTestId('coordination-decline').click()
  await confirmDialog(page, 'ยืนยันบันทึกการปฏิเสธ', 'เริ่มไม่ได้')
}

async function decideCoordination(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await gotoSection(page, 2)
  await page.getByTestId('coordination-decision-note').fill(note)
  await page.getByTestId(endorse ? 'coordination-endorse' : 'coordination-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('RRR-08B · WIT0845 หน่วยงานปฏิเสธ — ส่งคืนแล้วเสนอใหม่จนอนุมัติ', () => {
  test('RRR-08B-4 · หน่วยงานปฏิเสธ (blocked) → เสนอหน่วยงาน B → ผบช. ส่งคืน → เสนอหน่วยงาน C → ผบช. → ผอ. อนุมัติ → วิธีที่ 4 กลับมาประสานหน่วยงาน C', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.12', 'officer', AT_COORDINATION_START)

    await test.step('WIT0845 · บันทึกปฏิเสธ → วิธีที่ 4 เริ่มไม่ได้ (blocked) พร้อมเหตุผล · เสนอ B ขึ้น ผบช.ชั้นต้น', async () => {
      await recordDecline(page, 'อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')
      let c = await readCase(page, CASE_NO)
      let track = (c?.methodTracks as Dict[])[0]
      expect(track.status).toBe('blocked')
      expect((track.coordination as Dict).responseStatus).toBe('declined')
      expect((track.coordination as Dict).declinedReason).toBe('อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')

      await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
      await page.getByTestId('coordination-note').fill('มีชุดปฏิบัติการในพื้นที่')
      await page.getByTestId('coordination-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่', 'ผบช.ชั้นต้น')
      c = await readCase(page, CASE_NO)
      expect((c?.coordinationProposals as Proposal[])[0]).toMatchObject({ declinedAgency: AGENCY_A, proposedAgency: AGENCY_B, stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0845 · ผบช.ชั้นต้นส่งคืน (ต้องมีเหตุผล) → ถึงเจ้าหน้าที่ · วิธีที่ 4 ยัง blocked · บันทึกผู้ส่งคืน/เหตุผล', async () => {
      await switchRole(page, 'supervisor')
      await gotoSection(page, 2)
      await page.getByTestId('coordination-return').click()
      await expect(page.locator(NO_POPUP)).toHaveCount(0)
      await decideCoordination(page, false, 'ให้ตรวจเขตอำนาจของหน่วยงานที่เสนอก่อน', 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

      const c = await readCase(page, CASE_NO)
      const p0 = (c?.coordinationProposals as Proposal[])[0]
      expect(p0).toMatchObject({ stage: 'returned', returnNote: 'ให้ตรวจเขตอำนาจของหน่วยงานที่เสนอก่อน' })
      expect(p0.returnedBy).toBeTruthy()
      expect(p0.returnedAt).toBeTruthy()
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect((c?.methodTracks as Dict[])[0].status).toBe('blocked')
    })

    await test.step('WIT0845 · เจ้าหน้าที่เสนอหน่วยงานใหม่ → ข้อเสนอแรกยังเก็บไว้ · กลับเข้า ผบช.ชั้นต้นเดิม', async () => {
      await switchRole(page, 'officer')
      await gotoSection(page, 2)
      await page.getByTestId('coordination-new-agency').selectOption('ตำรวจภูธรจังหวัดในพื้นที่')
      await page.getByTestId('coordination-note').fill('ตรวจเขตอำนาจแล้ว อยู่ในพื้นที่รับผิดชอบ')
      await page.getByTestId('coordination-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่')
      const c = await readCase(page, CASE_NO)
      const proposals = c?.coordinationProposals as Proposal[]
      expect(proposals).toHaveLength(2)
      expect(proposals[0].stage).toBe('returned')
      expect(proposals[1]).toMatchObject({ proposedAgency: 'ตำรวจภูธรจังหวัดในพื้นที่', stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0845 · ผบช.เห็นชอบ → ผอ. อนุมัติ → วิธีที่ 4 กลับมาเดินกับหน่วยงานใหม่ (preparing/awaiting) ภายใต้คำสั่งเดิม', async () => {
      await switchRole(page, 'supervisor')
      await decideCoordination(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
      expect(((await readCase(page, CASE_NO))?.coordinationProposals as Proposal[])[1].stage).toBe('director')

      await switchRole(page, 'director')
      await decideCoordination(page, true, 'อนุมัติให้ประสานหน่วยงานใหม่', 'ยืนยันอนุมัติหน่วยงานใหม่', 'ตำรวจภูธรจังหวัดในพื้นที่')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.coordinationProposals as Proposal[]
      expect(proposals.map((p) => p.stage)).toEqual(['returned', 'approved'])
      expect(proposals[1].appliedAt).toBeTruthy()
      const track = (c?.methodTracks as Dict[])[0]
      const co = track.coordination as Dict
      expect(co.agency).toBe('ตำรวจภูธรจังหวัดในพื้นที่')
      expect(co.responseStatus).toBe('awaiting')
      expect(co.declinedReason).toBeFalsy()
      expect(track.status).toBe('preparing')
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(co.letterNumbering).toBeUndefined() // ล้างผลออกเลขเดิม ต้องขอเลขหนังสือประสานฉบับใหม่ (กลับ WIT0843)
      expect(c?.approvedMethods).toEqual([4]) // คำสั่งเดิมยังอยู่ ไม่ใช่เปิดคำร้องใหม่
    })
  })
})

// ---------------------------------------------------------------------------
// 08C · ข้อ 14 — ผบช.ส่งคืน → Revision (หนังสือ คบ.18 ฉบับใหม่) → เสนอซ้ำ → ผ่าน
// ---------------------------------------------------------------------------

/** สร้าง Episode เทียมที่คุ้มครองสะสมตามจำนวนวัน (นับจากวันเริ่มจริงย้อนหลัง) */
function episodeWithCumulativeDays(days: number) {
  const startedAt = new Date(Date.now() - (days - 1) * 86400000).toISOString()
  return { id: `EP-RRR-${days}`, openedAt: startedAt, phases: [{ id: `PH-RRR-${days}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.11' }] }
}

/** คุ้มครองสะสม 178 วัน (ใกล้ครบเพดาน) ยังไม่เปิดเรื่องข้อ 14 */
const AT_NEAR_CAP = {
  approvedMethods: [1],
  methodTracks: [{ method: 1, status: 'active' }],
  kb11Signed: true,
  episode: episodeWithCumulativeDays(178),
  article14: undefined,
  article14Referral: undefined,
}

/** คณะกรรมการ/เลขาธิการเห็นชอบแล้ว ออกหนังสือถึงกรมแล้ว (step: letter_sent) */
const AT_LETTER_SENT = {
  ...AT_NEAR_CAP,
  article14: {
    step: 'letter_sent' as const,
    openedAt: '10/09/2569 09:00',
    openedBy: OFFICER,
    threatSummary: 'ยังมีกลุ่มผู้มีอิทธิพลเฝ้าติดตามที่พักพยาน',
    riskAssessment: 'ความเสี่ยงสูงต่อเนื่อง',
    recommendedMeasure: 'special' as const,
    supervisorNote: 'เห็นชอบ',
    supervisorAt: '10/09/2569 10:00',
    secretaryNote: 'เห็นชอบ',
    secretaryAt: '10/09/2569 11:00',
    committeeApproved: true,
    revisions: [],
  },
}

async function fillArticle14Proposal(page: Page, threat: string, risk: string) {
  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill(threat)
  await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill(risk)
  await page.getByTestId('submit-article14-proposal').click()
  await confirmDialog(page, 'ยืนยันจัดทำ')
}

/** เปิดหนังสือ คบ.18 ของฉบับปัจจุบัน กด "บันทึกหนังสือ" แล้วกลับแฟ้มเพื่อส่งให้ ผบช.ชั้นต้น */
async function saveLetterAndSubmitToSupervisor(page: Page) {
  await page.goto(`/form/18?caseNo=${CASE_NO}`)
  await page.getByRole('button', { name: /บันทึกหนังสือ$/ }).click()
  await page.goto(DOSSIER_URL)
  await page.getByTestId('article14-review-footer').getByTestId('article14-submit-review').click()
  await page.getByRole('button', { name: 'ยืนยันส่ง', exact: true }).click()
  await page.locator(NO_POPUP).waitFor({ state: 'detached' })
}

test.describe('RRR-08C · ข้อ 14 — ส่งคืนแก้ไข (Revision) แล้วเสนอซ้ำจนผ่าน', () => {
  test('RRR-08C-1 · ผบช.ชั้นต้นส่งคืน (ต้องมีเหตุผล) → article14.revisions + กลับถึงเจ้าหน้าที่ → Revision คบ.18 ฉบับใหม่ (เก็บฉบับเดิม) → เสนอซ้ำ → ผบช. เห็นชอบ → ผอ.', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.12', 'officer', AT_NEAR_CAP)
    await page.goto(ARTICLE14_URL)
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    await test.step('WIT0854 · เจ้าหน้าที่จัดทำเรื่อง + บันทึก คบ.18 ฉบับที่ 1 + ส่ง ผบช.ชั้นต้น', async () => {
      await fillArticle14Proposal(page, 'ยังมีภัยต่อเนื่องแม้คุ้มครองสะสมใกล้ครบเพดาน', 'อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม — สะสม 178 วัน')
      await saveLetterAndSubmitToSupervisor(page)
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as Dict
      expect(a14.step).toBe('supervisor_review')
      expect(a14.letterVersion).toBe(1)
      expect(a14.revisions).toEqual([])
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0855 · ผบช.ชั้นต้นส่งคืนโดยไม่ระบุเหตุผลไม่ได้ · ยกเลิกในจอยืนยันแล้วเรื่องยังอยู่กับ ผบช. · ยืนยันแล้วกลับถึงเจ้าหน้าที่', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(ARTICLE14_URL)
      await page.getByTestId('article14-return-button').click() // ไม่มีเหตุผล → ไม่ขึ้นจอยืนยัน
      await expect(page.locator(NO_POPUP)).toHaveCount(0)

      const note = page.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข')
      await note.fill('ผลประเมินความเสี่ยงยังไม่อ้างอิงเหตุการณ์ล่าสุด')
      await page.getByTestId('article14-return-button').click()
      await cancelDialog(page)
      expect(((await readCase(page, CASE_NO))?.article14 as Dict).step).toBe('supervisor_review')

      await page.getByTestId('article14-return-button').click()
      await confirmDialog(page, 'ยืนยันส่งคืน', 'ผลประเมินความเสี่ยงยังไม่อ้างอิงเหตุการณ์ล่าสุด')

      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as Dict
      expect(a14.step).toBe('proposal_draft')
      const revs = a14.revisions as Dict[]
      expect(revs).toHaveLength(1)
      expect(revs[0]).toMatchObject({ reason: 'ผลประเมินความเสี่ยงยังไม่อ้างอิงเหตุการณ์ล่าสุด' })
      expect(revs[0].by).toBeTruthy()
      expect(revs[0].at).toBeTruthy()
      expect(a14.revisionPreparedAt).toBeUndefined() // ยังไม่ได้เตรียมฉบับใหม่
      expect(OFFICER_OWNERS).toContain(c?.owner)
    })

    await test.step('WIT0854 (Revision) · เจ้าหน้าที่จัดทำ Revision → คบ.18 ฉบับที่ 2 · ฉบับที่ 1 เก็บเป็นประวัติพร้อมเหตุผลที่ถูกส่งคืน', async () => {
      await switchRole(page, 'officer')
      await page.goto(ARTICLE14_URL)
      await expect(page.getByText(/ส่งคืนแก้ไขแล้ว 1 ครั้ง/)).toBeVisible()
      await fillArticle14Proposal(page, 'ภัยต่อเนื่อง พบการติดตามพยานเพิ่มเมื่อสัปดาห์ที่ผ่านมา', 'ปรับปรุงตามข้อสั่งการ ผบช. อ้างเหตุการณ์ล่าสุด')

      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as Dict
      expect(a14.step).toBe('proposal_draft')
      expect(a14.letterVersion).toBeGreaterThan(1)
      expect(a14.revisionPreparedAt).toBeTruthy()
      expect(a14.threatSummary).toContain('พบการติดตามพยานเพิ่ม')
      const prev = c?.article14LetterPreviousVersions as Dict[]
      expect(prev).toHaveLength(1)
      expect(prev[0]).toMatchObject({ version: (a14.letterVersion as number) - 1, returnReason: 'ผลประเมินความเสี่ยงยังไม่อ้างอิงเหตุการณ์ล่าสุด' })
      expect(prev[0].returnedBy).toBeTruthy()
      expect(prev[0].returnedAt).toBeTruthy()
      // ส่งซ้ำไม่ได้จนกว่าจะบันทึกหนังสือฉบับใหม่
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('article14-letter-unsaved')).toBeVisible()
      await expect(page.getByTestId('article14-submit-review')).toBeDisabled()
    })

    await test.step('WIT0855 · บันทึกหนังสือฉบับใหม่ → เสนอซ้ำ → กลับถึง ผบช.ชั้นต้นเดิม (approvals ล้างใหม่ revisions ยังอยู่) → เห็นชอบ → ผอ.', async () => {
      await saveLetterAndSubmitToSupervisor(page)
      let c = await readCase(page, CASE_NO)
      let a14 = c?.article14 as Dict
      expect(a14.step).toBe('supervisor_review')
      expect(a14.approvals).toEqual([])
      expect(a14.revisions).toHaveLength(1)
      expect(a14.revisionPreparedAt).toBeUndefined()
      expect(c?.owner).toBe(SUPERVISOR)

      await switchRole(page, 'supervisor')
      await page.goto(ARTICLE14_URL)
      await page.getByTestId('article14-endorse-button').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
      c = await readCase(page, CASE_NO)
      a14 = c?.article14 as Dict
      expect(a14.step).toBe('director_review')
      expect(c?.owner).toBe(DIRECTOR)
      expect(a14.approvals).toEqual([expect.objectContaining({ level: 'supervisor' })])
      expect(a14.revisions).toHaveLength(1)
    })
  })

  test('RRR-08C-2 · WIT0860 (แขนง WIT0887/0888) กรมแจ้งดำเนินการไม่ได้ → ผบช. ส่งคืน (ต้องมีเหตุผล) → เจ้าหน้าที่เสนอแนวทางใหม่ → ผบช. เห็นชอบ → ผอ. อนุมัติ (มาตรการเดิมไม่ขาดช่วง)', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_SENT)
    await page.goto(ARTICLE14_URL)

    await test.step('WIT0860 · เจ้าหน้าที่บันทึก "ดำเนินการไม่ได้" + เสนอแนวทาง → ผบช.ชั้นต้น', async () => {
      await page.getByPlaceholder('ระบุเหตุผลตามหนังสือแจ้งของกรม').fill('กรมแจ้งว่าเกินอำนาจรับผู้ถูกคุกคามระดับสูง')
      await page.getByPlaceholder(/เช่น คงมาตรการเดิม/).fill('คงมาตรการเดิมของ ป.ป.ท. ไว้ก่อน')
      await page.getByTestId('article14-delivery-failed').click()
      await confirmDialog(page, 'ยืนยันบันทึก', 'ผบช.ชั้นต้น')
      const c = await readCase(page, CASE_NO)
      expect((c?.article14EscalationProposals as Proposal[])[0].stage).toBe('supervisor')
      expect((c?.article14 as Dict).step).toBe('delivery_failed')
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0860 · ผบช.ส่งคืนโดยไม่ระบุเหตุผลไม่ได้ → ระบุแล้วยืนยัน → กลับถึงเจ้าหน้าที่ · มาตรการเดิมยัง active', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(ARTICLE14_URL)
      await page.getByTestId('article14-escalation-return').click() // ไม่มีเหตุผล
      await expect(page.locator(NO_POPUP)).toHaveCount(0)
      await page.getByTestId('article14-escalation-decision-note').fill('ให้ประสานหน่วยงานอื่นคู่ขนานด้วย')
      await page.getByTestId('article14-escalation-return').click()
      await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

      const c = await readCase(page, CASE_NO)
      const p0 = (c?.article14EscalationProposals as Proposal[])[0]
      expect(p0).toMatchObject({ stage: 'returned', returnNote: 'ให้ประสานหน่วยงานอื่นคู่ขนานด้วย' })
      expect(p0.returnedBy).toBeTruthy()
      expect(p0.returnedAt).toBeTruthy()
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect((c?.methodTracks as Dict[])[0].status).toBe('active')
      expect(((c?.episode as Dict).closedAt)).toBeFalsy()
    })

    await test.step('WIT0860 · เจ้าหน้าที่เสนอแนวทางใหม่ (ช่องเสนอใหม่เปิดเฉพาะเมื่อถูกส่งคืน) → ข้อเสนอเดิมเก็บไว้ · กลับเข้า ผบช.', async () => {
      await switchRole(page, 'officer')
      await page.goto(ARTICLE14_URL)
      await expect(page.getByTestId('article14-escalation-status')).toContainText('ข้อสั่งการให้แก้ไข: ให้ประสานหน่วยงานอื่นคู่ขนานด้วย')
      await page.getByTestId('article14-escalation-reason').fill('กรมแจ้งว่าเกินอำนาจรับผู้ถูกคุกคามระดับสูง (ปรับตามข้อสั่งการ)')
      await page.getByTestId('article14-escalation-approach').fill('คงมาตรการเดิม และประสานหน่วยงานตามข้อ 15(4) คู่ขนาน')
      await page.getByTestId('article14-escalation-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอแนวทางใหม่')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.article14EscalationProposals as Proposal[]
      expect(proposals).toHaveLength(2)
      expect(proposals[0].stage).toBe('returned')
      expect(proposals[1]).toMatchObject({ stage: 'supervisor', proposedApproach: 'คงมาตรการเดิม และประสานหน่วยงานตามข้อ 15(4) คู่ขนาน' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0860 · ผบช.เห็นชอบ → ผอ. อนุมัติ → approved · appliedAt · เจ้าหน้าที่ดำเนินการตามแนวทาง · มาตรการเดิมไม่ขาดช่วง', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(ARTICLE14_URL)
      await page.getByTestId('article14-escalation-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
      expect(((await readCase(page, CASE_NO))?.article14EscalationProposals as Proposal[])[1].stage).toBe('director')

      await switchRole(page, 'director')
      await page.goto(ARTICLE14_URL)
      await page.getByTestId('article14-escalation-endorse').click()
      await confirmDialog(page, 'ยืนยันอนุมัติแนวทางใหม่')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.article14EscalationProposals as Proposal[]
      expect(proposals.map((p) => p.stage)).toEqual(['returned', 'approved'])
      expect(proposals[1].appliedAt).toBeTruthy()
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect((c?.methodTracks as Dict[])[0].status).toBe('active')
      expect(((c?.episode as Dict).closedAt)).toBeFalsy()
    })
  })

  // การพิจารณา Reject ของคณะกรรมการ (article14.step 'committee_rejected') มีเทสต์ TC-096 ในชีต 08c แล้ว — ไม่ทำซ้ำที่นี่
  // ส่วนรองเลขาธิการ/เลขาธิการส่งคืนข้อ 14 ต้องผ่านธุรการ 2 ชั้นทั้งขาไปและขากลับ จึงอยู่นอกขอบเขตเทสต์ชุดนี้
  test.fixme('RRR-08C-3 · เรื่องข้อ 14 ถูกส่งคืนจากรองเลขาธิการฯ/เลขาธิการฯ (ลง สลธ.) → ธุรการส่งคืนลงหน่วย → Revision → เสนอซ้ำ', async () => {
    // ต้องเดินขั้น passSarabanCheckpoint ขาขึ้น/ขาลงของ flow 'article14' ก่อน แล้วจึงมีเทสต์ที่เสถียร — ยังไม่ได้เขียน
  })
})
