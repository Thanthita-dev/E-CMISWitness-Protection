import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { choosePreliminaryOutcome, confirmInlineDecision, decisionWorkspace } from '../helpers/noticeDecisionWorkspace'
import { CASE_NO, DOSSIER_URL, confirmDialog, formRow, signInModal } from '../journeys/journey-helpers'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import { userNameById } from '../../src/lib/constants'
import type { UserRole } from '../../src/types/user'

/**
 * RRR-07 · แท็บ 07 รับและบันทึกผลการพิจารณา — เลขาธิการฯ ส่งกลับ (Revision) และไม่อนุมัติ
 *
 * ครอบคลุม (เดินวงเต็ม: ส่งกลับ/ไม่อนุมัติ → ใครถืองาน → เหตุผลถูกบันทึก → ฉบับที่ลงนามแล้วไม่ถูกแก้ทับ → แก้/ส่งใหม่ → กลับถึงเลขาธิการฯ):
 *   WIT0703  ไม่อนุมัติต้องลงนามความเห็นข้อ 13 ใน คบ.6 ก่อน (ปุ่มไม่อนุมัติถูกล็อก · ปุ่มส่งกลับกดได้เสมอ)
 *   WIT0704  ◇ ผลพิจารณา (ส่งกลับ / ไม่อนุมัติ)
 *   WIT0702 / WIT0706  ไม่อนุมัติ → เปิดหน้าแบบฟอร์ม คบ.10 (NoticeDecisionWorkspace) กรอกเลขอ้างอิง/เหตุผล แล้วยืนยันและลงนาม คบ.10
 *   WIT0707  เลขาธิการฯ ส่งกลับ/ขอข้อมูลเพิ่ม → จอดที่ ผอ.สำนัก/กอง หลังผ่านธุรการ สลธ. → ธุรการสำนัก/กอง (WIT0714)
 *   WIT0708  ผอ. มอบหมายเจ้าหน้าที่แก้ คบ.3 / คบ.6 เป็น Revision ใหม่ (เก็บฉบับเดิม kb3/kb6PreviousVersions)
 *   WIT0709  เจ้าหน้าที่ส่ง Revision ผ่าน ผบช.ชั้นต้น → ผอ. → ธุรการสำนัก/กอง → ธุรการ สลธ. → รองเลขาธิการฯ → เลขาธิการฯ
 *            ตามลำดับเดิม ห้ามข้ามลำดับชั้น (ขั้นธุรการ WIT0515 / WIT0516)
 *   WIT0711  ไม่อนุมัติ → ไปแท็บ 09A (เฉพาะจุดเข้า) หลังผ่านธุรการ สลธ. → ธุรการสำนัก/กอง (WIT0716)
 *   WIT0712  Revision เดินครบกลับถึงเลขาธิการฯ รอพิจารณาใหม่ (revisionRound ไม่ถูกรีเซ็ต)
 *
 * mock state: Case 1.7 (stage external_pending · ผบช. ผอ. รองเลขาธิการฯ ลงนาม คบ.6 ข้อ 10-12 แล้ว · เลขาธิการฯ ยังไม่ตัดสิน)
 * หมายเหตุ:
 *  - secretaryReject ในต้นแบบบันทึกเหตุผล/เวลาที่ resultReason / resultAt (ไม่ได้เขียน rejectedReason / rejectedAt)
 *  - ส่งกลับ/ไม่อนุมัติแล้วระบบเปิดชุดนำส่งผ่านธุรการต่อท้าย assignmentHistory จึงหารายการจาก action ไม่ใช่รายการสุดท้าย
 *  - ผอ. ต้องเป็นบัญชีเขต 1 (หน่วยของเจ้าของสำนวน) จึงส่งชุดเสนอต่อได้ — สลับทั้งบัญชีด้วย switchAccount ไม่ใช่แค่ role
 */

const SUPERVISOR = userNameById('SUP-001')
const DIRECTOR = userNameById('DIR-001')
const DEPUTY = userNameById('DSEC-001')
const SECRETARY = userNameById('SEC-001')
/** ลำดับ stage ที่ Revision ผ่านจริงจากเจ้าหน้าที่จนกลับถึงเลขาธิการฯ (มีขั้นธุรการสำนัก/กอง และ สลธ. คั่นก่อนรองเลขาธิการฯ) */
const CHAIN_STAGES = ['supervisor_review', 'director_review', 'director_outgoing_registry', 'secretary_incoming_registry', 'deputy_review', 'external_pending']
const RETURN_ACTION = 'เลขาธิการ ป.ป.ท. ส่งกลับแก้ไข'
const ASSIGN_ACTION = 'ผอ.สำนัก/กอง มอบหมายแก้ไขตามข้อสั่งการเลขาธิการฯ'
const REJECT_ACTION = 'เลขาธิการ ป.ป.ท. มีคำสั่งไม่อนุมัติ'

type Rec = Record<string, any>
/** textarea ของ FormKit — VoiceTextarea ห่อ textarea ไว้ใน div ถัดจาก label จึงหาจาก sibling ตัวแรกแล้วลงไปหา textarea */
const areaField = (page: Page, label: string) =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::*[1]/descendant-or-self::textarea[1]')
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec
const historyOf = async (page: Page) => ((await caseOf(page))?.assignmentHistory ?? []) as Array<Record<string, string>>
/** รายการล่าสุดของ action ที่ระบุ — ไม่ใช้รายการสุดท้าย เพราะชุดนำส่งธุรการถูกต่อท้ายหลังการส่งกลับ/ไม่อนุมัติ */
const lastOf = async (page: Page, action: string) => (await historyOf(page)).filter((x) => x.action === action).at(-1)

/** เจ้าของสำนวนผู้ต้องแก้ Revision — ระบบเขียนลง owner จาก assignedOfficer ของแฟ้ม (ชื่อตามชุดบทบาทที่ remap แล้ว) */
const officerOf = async (page: Page) => (await caseOf(page)).assignedOfficer as string

/** สลับทั้งบัญชี (ผู้ใช้ + หน่วยงาน) ตามบทบาท — ผอ. ต้องอยู่หน่วยเดียวกับแฟ้มจึงส่งชุดเสนอต่อได้ */
async function switchAccount(page: Page, role: string) {
  const raw = await page.evaluate(() => localStorage.getItem('ecmis-auth-storage'))
  const auth = JSON.parse(raw as string)
  const account = mockStateAccountForRole(role as UserRole)
  auth.state = account ? authStateForAccount(account, auth.state) : { ...auth.state, currentRole: role }
  await page.addInitScript((v: string) => localStorage.setItem('ecmis-auth-storage', v), JSON.stringify(auth))
  await page.reload()
}

/** ขาลงจากสำนักงานเลขาธิการฯ ลงหน่วย (WIT0714 / WIT0716): ธุรการ สลธ. ออกเลขส่ง → ธุรการสำนัก/กองลงเลขรับ */
async function passDownLeg(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await page.goto(DOSSIER_URL)
}

/** WIT0707 — เลขาธิการฯ กด "ส่งกลับ/ขอข้อมูลเพิ่ม" ในแฟ้ม (ไม่ต้องลงนามข้อ 13 ก่อน) */
async function secretaryReturns(page: Page, reason: string, issue?: string) {
  await switchAccount(page, 'secretary')
  await page.goto(DOSSIER_URL)
  await page.getByTestId('secretary-return-button').click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (issue) await dialog.locator('select.ws-input').selectOption(issue)
  await dialog.getByTestId('decision-reason-input').fill(reason)
  await page.getByTestId('decision-confirm-button').click()
  await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('returned')
}

/** WIT0708 — ผอ. มอบหมาย Revision */
async function directorAssigns(page: Page, instruction: string) {
  await switchAccount(page, 'director')
  await page.goto(DOSSIER_URL)
  await page.getByTestId('assign-revision-button').click()
  await page.getByTestId('revision-instruction-input').fill(instruction)
  await page.getByTestId('assign-revision-confirm-button').click()
  await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
}

/** ส่งต่อจากการ์ดส่งงาน แล้วรอให้แฟ้มถึงขั้นที่คาดไว้ */
async function forwardTo(page: Page, stage: string) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ')
  await expect.poll(async () => (await caseOf(page))?.stage).toBe(stage)
}

/** เจ้าหน้าที่เปิดแบบ คบ.X (ระบบเปิดเป็นฉบับใหม่แล้ว) เติมข้อความแล้วบันทึก — ตรวจเลขฉบับที่ป้ายบนหน้าฟอร์มตรงกับ store */
async function reviseForm(page: Page, code: 'คบ.3' | 'คบ.6', appendText: string) {
  const versionKey = code === 'คบ.3' ? 'kb3Version' : 'kb6Version'
  const current = await caseOf(page)
  // เคสที่กดข้าม คบ.3 ไว้ (kb3Skipped) เปิดแบบ คบ.3 ไม่ได้จนกว่าจะกู้คืน — ไม่มีฉบับใหม่ให้แก้
  if (code === 'คบ.3' && current.kb3Skipped) return
  const version = current[versionKey]
  await page.goto(DOSSIER_URL)
  await formRow(page, code).getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page.getByText(`ฉบับที่ ${version}`).first()).toBeVisible()
  if (code === 'คบ.6') {
    const field = areaField(page, '2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย')
    await field.fill(`${await field.inputValue()} ${appendText}`.trim())
    for (const [label, value] of [['1.1 ได้รับคำร้อง', await officerOf(page)], ['2.2 ชื่อ-สกุล พยาน', 'สมชาย ใจดี']]) {
      const input = page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
      if (!(await input.inputValue())) await input.fill(value)
    }
  }
  await page.getByRole('button', { name: `บันทึกแบบ ${code}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/**
 * Revision ทำให้แฟ้มกลับมาที่ staff_review ซึ่งการ์ดส่งงานยังเช็ก คบ.1 — mock Case 1.7 ไม่มี kb1CompletedAt
 * จึงต้องให้เจ้าหน้าที่บันทึก คบ.1 ก่อนจึงส่งต่อได้ (ทำเฉพาะเมื่อปุ่มถูกล็อกด้วยเหตุนี้)
 */
async function ensureKb1Done(page: Page) {
  const btn = page.getByTestId('forward-case-button')
  if (await btn.isEnabled()) return
  if (!((await btn.getAttribute('title')) ?? '').includes('คบ.1')) return
  await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  // คบ.1 เป็นฟอร์มหลายส่วน — ปุ่มบันทึกโผล่ที่ 3 ส่วนท้าย
  await page.getByRole('button', { name: /8\. ลายมือชื่อ/ }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
  await expect(btn).toBeEnabled()
}

/**
 * WIT0709 → WIT0712 — ส่ง Revision ขึ้นทีละชั้นตามลำดับเดิม คืนลำดับ stage ที่แฟ้มผ่านจริง
 * ผอ. ส่งต่อแล้วแฟ้มเข้าขั้นธุรการสำนัก/กอง → ธุรการ สลธ. ก่อนถึงรองเลขาธิการฯ (WIT0515 / WIT0516)
 * ลายมือชื่อข้อ 10-12 ของรอบก่อนยังอยู่ในแฟ้ม (ระบบเก็บฉบับเดิมไว้ใน kb6PreviousVersions) จึงส่งต่อได้โดยไม่ต้องลงนามซ้ำ
 */
async function walkChainBackToSecretary(page: Page): Promise<string[]> {
  const seen: string[] = []
  await switchAccount(page, 'officer')
  await page.goto(DOSSIER_URL)
  await ensureKb1Done(page)
  await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
  await forwardTo(page, 'supervisor_review')
  seen.push((await caseOf(page)).stage)
  expect((await caseOf(page)).owner).toBe(SUPERVISOR)
  for (const [role, nextStage, nextOwner] of [
    ['supervisor', 'director_review', DIRECTOR],
    ['director', 'director_outgoing_registry', undefined],
  ] as const) {
    await switchAccount(page, role)
    await page.goto(DOSSIER_URL)
    await forwardTo(page, nextStage)
    seen.push((await caseOf(page)).stage)
    if (nextOwner) expect((await caseOf(page)).owner).toBe(nextOwner)
  }
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await expect.poll(async () => (await caseOf(page))?.stage).toBe('secretary_incoming_registry')
  seen.push((await caseOf(page)).stage)
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await expect.poll(async () => (await caseOf(page))?.stage).toBe('deputy_review')
  seen.push((await caseOf(page)).stage)
  expect((await caseOf(page)).owner).toBe(DEPUTY)
  await switchAccount(page, 'deputy_secretary')
  await page.goto(DOSSIER_URL)
  await forwardTo(page, 'external_pending')
  seen.push((await caseOf(page)).stage)
  return seen
}

/** WIT0703 — เลขาธิการฯ ลงนามความเห็นข้อ 13 ที่ท้ายแบบ คบ.6 (ปุ่มไม่อนุมัติถูกล็อกจนกว่าจะลงนาม) */
async function signKb6Section13(page: Page) {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6\?caseNo=/)
  const area = areaField(page, '13. ความเห็นเลขาธิการฯ')
  if (!(await area.inputValue())) await area.fill('เห็นควรพิจารณาตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
  await page.goto(DOSSIER_URL)
}

/** WIT0702 / WIT0706 — เลขาธิการฯ เลือกไม่อนุมัติ → หน้าแบบฟอร์ม คบ.10 กรอกเลขอ้างอิง/เหตุผล แล้วยืนยันและลงนาม (ส่งงานแล้วกลับแฟ้ม) */
async function secretaryRejects(page: Page, decisionNo: string, reason: string) {
  await choosePreliminaryOutcome(page, 10)
  await page.getByTestId('notice-decision-number').fill(decisionNo)
  await page.getByTestId('notice-decision-reason').fill(reason)
  await confirmInlineDecision(page)
}

test.describe('RRR-07 · เลขาธิการฯ ส่งกลับ / Revision / ไม่อนุมัติ (แท็บ 07)', () => {
  test('RRR-07-A · WIT0707 / WIT0714: เลขาธิการฯ ส่งกลับ → จอดที่ธุรการ สลธ. → ผอ. ถืองาน บันทึกเหตุผล ลายมือชื่อเดิมไม่ถูกล้าง และ ผอ. มอบหมายไม่ได้ระหว่างเอกสารอยู่กับธุรการ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)

    const before = await caseOf(page)
    expect(before.stage).toBe('external_pending')
    expect(before.kb6SupervisorSignedAt).toBeTruthy()
    expect(before.kb6DirectorSignedAt).toBeTruthy()
    expect(before.kb6DeputySignedAt).toBeTruthy()

    await test.step('WIT0707 · ไม่ระบุเหตุผล → ระบบไม่ยอมส่งกลับ แฟ้มยังอยู่ที่เลขาธิการฯ', async () => {
      // ส่งกลับกดได้โดยไม่ต้องลงนามข้อ 13 ก่อน (ต่างจากอนุมัติ/ไม่อนุมัติ)
      await expect(page.getByTestId('secretary-return-button')).toBeEnabled()
      await page.getByTestId('secretary-return-button').click()
      const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
      await dialog.waitFor()
      await dialog.getByTestId('decision-reason-input').fill('')
      await page.getByTestId('decision-confirm-button').click()
      await expect(page.getByTestId('decision-validation-error')).toContainText('กรุณาระบุเหตุผลและข้อสั่งการ')
      const c = await caseOf(page)
      expect(c.stage).toBe('external_pending')
      expect(c.activity7State).not.toBe('returned')
    })

    await test.step('WIT0707 · ระบุประเด็น+เหตุผล → จอดที่ ผอ.สำนัก/กอง ยังไม่ลงถึงเจ้าหน้าที่', async () => {
      const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
      await dialog.locator('select.ws-input').selectOption('ลายมือชื่อหรือฉบับเอกสารไม่ครบ')
      await dialog.getByTestId('decision-reason-input').fill('ลายมือชื่อใน คบ.6 ไม่ครบถ้วน ให้ตรวจและแนบฉบับที่ถูกต้อง')
      await page.getByTestId('decision-confirm-button').click()
      await expect.poll(async () => (await caseOf(page)).activity7State).toBe('returned')

      const c = await caseOf(page)
      expect(c.secretaryReviewState).toBe('returned')
      expect(c.returned).toBe(true)
      expect(c.returnIssueLabel).toBe('ลายมือชื่อหรือฉบับเอกสารไม่ครบ')
      expect(c.returnNote).toBe('ลายมือชื่อใน คบ.6 ไม่ครบถ้วน ให้ตรวจและแนบฉบับที่ถูกต้อง')
      expect(c.stage).toBe('director_review')
      // ชุดส่งกลับค้างที่ธุรการ สลธ. (WIT0714) — ผู้รับปลายทางคือ ผอ. แต่ผู้ถือแฟ้มตอนนี้คือธุรการ
      expect(c.sarabanDispatch?.recipientName).toBe(DIRECTOR)
      expect(c.owner).not.toBe(DIRECTOR)
      expect(c.secretaryReturnRework).toBe(false)
      expect(c.revisionAssignedAt).toBeFalsy()
      expect(c.revisionRound ?? 0).toBe(0)
      // ลายมือชื่อและเวอร์ชันของฉบับที่ลงนามแล้วยังไม่ถูกแตะ จนกว่า ผอ. จะมอบหมาย Revision
      expect(c.kb6SupervisorSignedAt).toBe(before.kb6SupervisorSignedAt)
      expect(c.kb6DirectorSignedAt).toBe(before.kb6DirectorSignedAt)
      expect(c.kb6DeputySignedAt).toBe(before.kb6DeputySignedAt)
      expect(c.kb3PreviousVersions ?? []).toHaveLength(0)
      expect(c.kb6PreviousVersions ?? []).toHaveLength(0)
      const returned = await lastOf(page, RETURN_ACTION)
      expect(returned?.detail).toContain('ลายมือชื่อหรือฉบับเอกสารไม่ครบ')
      // ผู้ส่งกลับ ไม่ใช่เจ้าของงานต่อ — ปุ่มตัดสินหายไปจากเลขาธิการฯ
      await expect(page.getByTestId('secretary-return-button')).toHaveCount(0)
    })

    await test.step('WIT0707 · ระหว่างเอกสารอยู่กับธุรการ ผอ. กดมอบหมาย Revision ไม่ได้ผล (รอผ่านทะเบียนสารบรรณก่อน)', async () => {
      await switchAccount(page, 'director')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('return-revision-assignment-card')).toBeVisible()
      await page.getByTestId('assign-revision-button').click()
      await page.getByTestId('revision-instruction-input').fill('ลองมอบหมายก่อนผ่านธุรการ')
      await page.getByTestId('assign-revision-confirm-button').click()
      // ต้นแบบดักที่ store: ไม่เปลี่ยนสถานะ
      await expect.poll(async () => (await caseOf(page)).revisionAssignedAt, { timeout: 3000 }).toBeFalsy().catch(() => undefined)
      const c = await caseOf(page)
      expect(c.stage).toBe('director_review')
      expect(c.sarabanDispatch).toBeTruthy()
      expect(c.revisionRound ?? 0).toBe(0)
      expect(c.secretaryReturnRework).toBe(false)
    })

    await test.step('WIT0714 · ผ่านธุรการ สลธ. → ธุรการสำนัก/กอง แล้ว ผอ. เห็นการ์ดมอบหมายและยังส่งแฟ้มเดิมขึ้นไม่ได้', async () => {
      await passDownLeg(page)
      await switchAccount(page, 'director')
      await expect(page.getByTestId('return-revision-assignment-card')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      const c = await caseOf(page)
      expect(c.owner).toBe(DIRECTOR)
      expect(c.sarabanDispatch).toBeFalsy()
    })
  })

  test('RRR-07-B · WIT0707 → WIT0712: ส่งกลับ → ผอ. มอบหมาย Revision → เจ้าหน้าที่แก้ คบ.3/คบ.6 ฉบับใหม่ → ผ่านทุกชั้น (รวมธุรการสำนัก/กอง และ สลธ.) ตามลำดับเดิม → กลับถึงเลขาธิการฯ (ฉบับเดิมไม่ถูกทับ)', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)
    const original = await caseOf(page)
    const originalSupervisorSignedAt = original.kb6SupervisorSignedAt as string
    const officer = original.assignedOfficer as string
    expect(originalSupervisorSignedAt).toBeTruthy()

    await secretaryReturns(page, 'ข้อเท็จจริงใน คบ.3 ไม่ครบ ให้แนบผลตรวจสอบเพิ่มเติมและแก้ คบ.6 ให้สอดคล้อง')
    await passDownLeg(page)

    await test.step('WIT0708 · ผอ. มอบหมายเจ้าหน้าที่ → เจ้าหน้าที่ถือแฟ้ม เก็บฉบับเดิมเป็นประวัติ ไม่แก้ทับ', async () => {
      await directorAssigns(page, 'แก้ คบ.3 และ คบ.6 เป็นฉบับใหม่ แนบผลตรวจสอบเพิ่มเติม')
      const c = await caseOf(page)
      expect(c.owner).toBe(officer)
      expect(c.secretaryReturnRework).toBe(true)
      expect(c.revisionRound).toBe(1)
      expect(c.revisionAssignedAt).toBeTruthy()
      expect(c.revisionInstruction).toContain('ฉบับใหม่')
      expect(c.directorReturn).toBe(false)
      // เหตุผลที่เลขาธิการฯ สั่งยังอยู่กับแฟ้ม
      expect(c.returnNote).toContain('ข้อเท็จจริงใน คบ.3 ไม่ครบ')
      // ฉบับเดิมถูกเก็บ: คบ.3 / คบ.6 ขึ้นเป็นฉบับที่ 2 และฉบับที่ 1 อยู่ในประวัติพร้อมเหตุผล
      expect(c.kb3Version).toBe(2)
      expect(c.kb6Version).toBe(2)
      expect(c.kb3PreviousVersions).toHaveLength(1)
      expect(c.kb3PreviousVersions[0].version).toBe(1)
      expect(c.kb3PreviousVersions[0].returnReason).toContain('แก้ คบ.3 และ คบ.6 เป็นฉบับใหม่')
      expect(c.kb6PreviousVersions).toHaveLength(1)
      expect(c.kb6PreviousVersions[0].version).toBe(1)
      expect(c.kb6PreviousVersions[0].signedAt).toBe(originalSupervisorSignedAt)
      expect((await lastOf(page, ASSIGN_ACTION))?.detail).toContain('ไม่แก้ทับฉบับที่ลงนามแล้ว')
    })

    await test.step('WIT0709 · เจ้าหน้าที่เห็นแบนเนอร์ห้ามข้ามลำดับชั้น แก้ คบ.3 / คบ.6 เป็นฉบับใหม่', async () => {
      await switchAccount(page, 'officer')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('secretary-revision-banner')).toContainText('Revision ครั้งที่ 1')
      await expect(page.getByTestId('secretary-revision-banner')).toContainText('ห้ามส่งข้ามลำดับชั้น')
      await reviseForm(page, 'คบ.3', '')
      await reviseForm(page, 'คบ.6', 'แนบผลตรวจสอบเพิ่มเติมตามข้อสั่งการเลขาธิการฯ')
      // การแก้ไขฉบับใหม่ไม่ทำให้ประวัติฉบับเดิมหาย
      const c = await caseOf(page)
      expect(c.kb3PreviousVersions).toHaveLength(1)
      expect(c.kb6PreviousVersions).toHaveLength(1)
      expect(c.kb6PreviousVersions[0].signedAt).toBe(originalSupervisorSignedAt)
    })

    await test.step('WIT0709 / WIT0712 · ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ → เลขาธิการฯ ตามลำดับเดิม ไม่ข้ามชั้น', async () => {
      const seen = await walkChainBackToSecretary(page)
      expect(seen).toEqual(CHAIN_STAGES)
      const h = await historyOf(page)
      expect(h.some((x) => String(x.detail).includes('ห้ามส่งข้ามลำดับชั้น'))).toBe(true)
    })

    await test.step('WIT0712 · กลับถึงเลขาธิการฯ รอพิจารณาใหม่ ธงรอบ Revision ถูกเคลียร์ แต่รอบและประวัติฉบับเดิมคงอยู่', async () => {
      const c = await caseOf(page)
      expect(c.secretaryReturnRework).toBe(false)
      expect(c.activity7State).toBe('pending')
      expect(c.secretaryReviewState).toBe('pending')
      expect(c.returned).toBe(false)
      expect(c.revisionRound).toBe(1)
      expect(c.kb3Version).toBe(2)
      expect(c.kb6Version).toBe(2)
      expect(c.kb6PreviousVersions).toHaveLength(1)
      await switchAccount(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('secretary-return-button')).toBeEnabled()
      await expect(page.getByTestId('reject-case-button')).toBeVisible()
    })
  })

  test('RRR-07-C · Revision รอบที่ 2: เลขาธิการฯ ส่งกลับซ้ำ → ผอ. มอบหมายอีกครั้ง → เก็บประวัติครบทั้งสองฉบับเดิม → เดินตามลำดับเดิมอีกครั้ง', async ({ page }) => {
    test.setTimeout(420_000)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)
    const originalSupervisorSignedAt = (await caseOf(page)).kb6SupervisorSignedAt as string
    const officer = await officerOf(page)

    for (const round of [1, 2]) {
      await test.step(`WIT0707 · รอบ ${round}: เลขาธิการฯ ขอข้อมูลเพิ่ม`, async () => {
        await secretaryReturns(page, `รอบที่ ${round}: ขอข้อมูลเพิ่มเติมประกอบการพิจารณา`)
        await passDownLeg(page)
        const c = await caseOf(page)
        expect(c.stage).toBe('director_review')
        expect(c.owner).toBe(DIRECTOR)
        expect(c.revisionRound ?? 0).toBe(round - 1)
        expect(c.returnNote).toBe(`รอบที่ ${round}: ขอข้อมูลเพิ่มเติมประกอบการพิจารณา`)
        // ข้อสั่งการ Revision เก่าถูกล้างเมื่อเลขาธิการฯ ส่งกลับรอบใหม่
        expect(c.revisionAssignedAt).toBeFalsy()
        expect(c.revisionInstruction).toBeFalsy()
      })

      await test.step(`WIT0708 · รอบ ${round}: ผอ. มอบหมาย Revision ครั้งที่ ${round}`, async () => {
        await directorAssigns(page, `Revision รอบ ${round}: แนบข้อมูลเพิ่มเติมตามที่เลขาธิการฯ ขอ`)
        const c = await caseOf(page)
        expect(c.revisionRound).toBe(round)
        expect(c.owner).toBe(officer)
        expect(c.kb3Version).toBe(round + 1)
        expect(c.kb6Version).toBe(round + 1)
        expect(c.kb3PreviousVersions.map((v: Rec) => v.version)).toEqual(Array.from({ length: round }, (_, i) => i + 1))
        expect(c.kb6PreviousVersions.map((v: Rec) => v.version)).toEqual(Array.from({ length: round }, (_, i) => i + 1))
        // ฉบับที่ 1 (ลงนามจริงของรอบแรก) ไม่ถูกเขียนทับในรอบถัดไป
        expect(c.kb6PreviousVersions[0].signedAt).toBe(originalSupervisorSignedAt)
        expect(c.kb6PreviousVersions[0].returnReason).toContain('Revision รอบ 1')
      })

      await test.step(`WIT0709 / WIT0712 · รอบ ${round}: เจ้าหน้าที่แก้ฉบับใหม่ แล้วส่งตามลำดับเดิมกลับถึงเลขาธิการฯ`, async () => {
        await switchAccount(page, 'officer')
        await page.goto(DOSSIER_URL)
        await expect(page.getByTestId('secretary-revision-banner')).toContainText(`Revision ครั้งที่ ${round}`)
        await reviseForm(page, 'คบ.6', `แก้ไขรอบ ${round}`)
        const seen = await walkChainBackToSecretary(page)
        expect(seen).toEqual(CHAIN_STAGES)
        const c = await caseOf(page)
        expect(c.secretaryReturnRework).toBe(false)
        expect(c.activity7State).toBe('pending')
        expect(c.revisionRound).toBe(round)
      })
    }

    await test.step('สรุป · Audit Log มีการส่งกลับของเลขาธิการฯ 2 ครั้ง และการมอบหมายของ ผอ. 2 ครั้ง', async () => {
      const h = await historyOf(page)
      expect(h.filter((x) => x.action === RETURN_ACTION)).toHaveLength(2)
      expect(h.filter((x) => x.action === ASSIGN_ACTION)).toHaveLength(2)
    })
  })

  test('RRR-07-D · WIT0702 / WIT0704 / WIT0706 / WIT0711: เลขาธิการฯ ไม่อนุมัติ → ร่าง คบ.10 → rejected บันทึกเหตุผล/เวลา ลงนาม คบ.10 ผ่านธุรการลงหน่วย และแฟ้มไปแท็บ 09A (ไม่วนกลับ Revision)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0703 · ยังไม่ลงนามข้อ 13 → ปุ่มไม่อนุมัติถูกล็อก', async () => {
      await expect(page.getByTestId('reject-case-button')).toBeDisabled()
      await signKb6Section13(page)
      expect((await caseOf(page)).kb6SecretarySignedAt).toBeTruthy()
      await expect(page.getByTestId('reject-case-button')).toBeEnabled()
    })

    await test.step('WIT0702 · เลือกไม่อนุมัติ → เปิดร่าง คบ.10 ยังไม่ลงนามหรือส่งงาน · ไม่ระบุเหตุผล → ระบบไม่ยอมยืนยัน', async () => {
      await choosePreliminaryOutcome(page, 10)
      await expect(decisionWorkspace(page)).toContainText('คบ.10')
      const c = await caseOf(page)
      expect(c.preliminaryDecision.formNo).toBe(10)
      expect(c.activity7State).not.toBe('rejected')
      expect(c.kb10Signed).toBeFalsy()
      await page.getByTestId('notice-decision-reason').fill('')
      await page.getByTestId('notice-decision-confirm').click()
      await expect(page.getByTestId('notice-decision-error')).toContainText('กรุณาระบุเหตุผลประกอบผลพิจารณา')
      expect((await caseOf(page)).activity7State).not.toBe('rejected')
      await page.getByTestId('notice-decision-back').click()
      await expect(decisionWorkspace(page)).toHaveCount(0)
    })

    await test.step('WIT0706 · ไม่อนุมัติ → activity7State = rejected บันทึกเลขที่คำสั่ง เหตุผล เวลา ผู้ลงนาม', async () => {
      await secretaryRejects(page, 'ปปท. 91/2569', 'ข้อเท็จจริงไม่เข้าเกณฑ์ตามระเบียบว่าด้วยการคุ้มครองพยาน')
      await expect.poll(async () => (await caseOf(page)).activity7State).toBe('rejected')
      const c = await caseOf(page)
      expect(c.activity7Label).toBe('ไม่อนุมัติให้ความคุ้มครอง')
      expect(c.decisionNumber).toBe('ปปท. 91/2569')
      expect(c.resultReason).toContain('ไม่เข้าเกณฑ์')
      expect(c.resultAt).toBeTruthy()
      expect(c.resultSigner).toContain(SECRETARY)
      expect(c.secretaryReviewState).toBe('signed')
      expect(c.secretarySignedAt).toBeTruthy()
      expect(c.returned).toBeFalsy()
      expect(c.secretaryReturnRework).toBeFalsy()
      expect((await lastOf(page, REJECT_ACTION))?.detail).toContain('ปปท. 91/2569')
      // ไม่มีทางกลับไปส่งกลับ/ไม่อนุมัติซ้ำ
      await expect(page.getByTestId('reject-case-button')).toHaveCount(0)
      await expect(page.getByTestId('secretary-return-button')).toHaveCount(0)
    })

    await test.step('WIT0716 · ผลไม่อนุมัติลงหน่วยผ่านธุรการ สลธ. → ธุรการสำนัก/กอง ก่อนถึงเจ้าหน้าที่', async () => {
      const c = await caseOf(page)
      expect(c.sarabanDispatch?.forms).toEqual([1, 3, 6, 10])
      expect(c.owner).not.toBe(c.assignedOfficer)
      await passDownLeg(page)
      expect((await caseOf(page)).sarabanDispatch).toBeFalsy()
    })

    await test.step('WIT0711 · แฟ้มเข้าเส้นทางไม่อนุมัติ: คบ.10 ลงนามพร้อมผลแล้ว อยู่ขั้น notice ให้เจ้าหน้าที่เติมรายละเอียดต่อ (แท็บ 09A)', async () => {
      const c = await caseOf(page)
      expect(c.stage).toBe('notice')
      expect(c.kb10Signed).toBe(true)
      expect(c.extraForms).toContain(10)
      expect(c.nonApprovalStep).toBe(3)
      expect(c.resultNotices[10].original).toBeTruthy()
      expect(c.next).toContain('คบ.10')
      expect(c.owner).toBe(c.assignedOfficer)
      // ไม่มีการเปิดวง Revision
      expect(c.revisionRound ?? 0).toBe(0)
      expect(c.revisionAssignedAt).toBeFalsy()

      await switchAccount(page, 'officer')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('assign-revision-button')).toHaveCount(0)
      // หนังสือแจ้งผล คบ.10 ลงนามแล้ว สถานะแสดงที่แถบขั้นตอนของแฟ้ม (ResultNoticeCard ไม่อยู่ในหน้าแฟ้มของเจ้าหน้าที่)
      await expect(page.getByRole('region', { name: 'ขั้นตอนของเรื่อง' })).toContainText('ลงนามแล้ว — รอเติมรายละเอียด')
    })
  })

  test('RRR-07-E · Revision แล้วจึงไม่อนุมัติ: ส่งกลับ 1 รอบ → กลับถึงเลขาธิการฯ → ไม่อนุมัติ — ประวัติฉบับเดิมและรอบ Revision คงอยู่ใน rejected', async ({ page }) => {
    test.setTimeout(420_000)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)
    const originalSupervisorSignedAt = (await caseOf(page)).kb6SupervisorSignedAt as string

    await secretaryReturns(page, 'ขอข้อมูลเพิ่มก่อนตัดสิน')
    await passDownLeg(page)
    await directorAssigns(page, 'แนบข้อมูลเพิ่มเติมตามที่เลขาธิการฯ ขอ')
    await walkChainBackToSecretary(page)
    expect((await caseOf(page)).activity7State).toBe('pending')

    await switchAccount(page, 'secretary')
    await signKb6Section13(page)
    await expect(page.getByTestId('reject-case-button')).toBeEnabled()
    await page.goto(DOSSIER_URL)
    await secretaryRejects(page, 'ปปท. 92/2569', 'ข้อมูลที่แก้ไขเพิ่มเติมแล้วยังไม่เข้าเกณฑ์คุ้มครอง')
    await expect.poll(async () => (await caseOf(page)).activity7State).toBe('rejected')

    const c = await caseOf(page)
    expect(c.stage).toBe('notice')
    expect(c.kb10Signed).toBe(true)
    expect(c.resultReason).toContain('ยังไม่เข้าเกณฑ์')
    expect(c.revisionRound).toBe(1)
    expect(c.kb6Version).toBe(2)
    expect(c.kb6PreviousVersions).toHaveLength(1)
    expect(c.kb6PreviousVersions[0].signedAt).toBe(originalSupervisorSignedAt)
    const h = await historyOf(page)
    const actions = h.map((x) => x.action)
    expect(actions.indexOf(RETURN_ACTION)).toBeGreaterThanOrEqual(0)
    expect(actions.indexOf(ASSIGN_ACTION)).toBeGreaterThan(actions.indexOf(RETURN_ACTION))
    expect(actions.indexOf(REJECT_ACTION)).toBeGreaterThan(actions.indexOf(ASSIGN_ACTION))
  })
})
