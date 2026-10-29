import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, readCase, seedMockState } from '../helpers/seed'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import type { UserRole } from '../../src/types/user'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { CASE_NO, DOSSIER_URL, confirmDialog, formRow, signInModal } from '../journeys/journey-helpers'
import { RETURN_ISSUE_CATALOG, userNameById } from '../../src/lib/constants'

/**
 * RRR-05 · ส่งกลับ / แก้ไข (Return · Revision · Reject) ของแท็บ 05 "เส้นทางปกติ: กลั่นกรอง คบ.6"
 *
 * ห่วงโซ่: เจ้าหน้าที่ → ผบช.ชั้นต้น (ข้อ 10) → ผอ.สำนัก/กอง (ข้อ 11) → ธุรการสำนัก/กอง ออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ
 *         → รองเลขาธิการฯ (ข้อ 12) → เลขาธิการฯ · รองเลขาธิการฯ ส่งกลับลงหน่วยต้องผ่านธุรการ สลธ. → ธุรการหน่วย (ขากลับ)
 * ครอบคลุม WIT code:
 *   WIT0503 / WIT0504  ผบช.ชั้นต้นตรวจ ◇ เอกสารครบ? (ไม่ครบ → ส่งกลับ · ต้องระบุข้อสั่งการ)
 *   WIT0505 / WIT0506  ผบช.ชั้นต้นส่งกลับเจ้าหน้าที่ (ทุกประเด็นในเมนู) → เจ้าหน้าที่แก้ คบ.3/คบ.6 ฉบับใหม่ → ส่งกลับ ผบช.ชั้นต้น
 *   WIT0507            ผบช.ชั้นต้นผ่านรอบแก้ไข (ลงนามข้อ 10 ใหม่) → เสนอ ผอ.
 *   WIT0509 / WIT0510  ผอ. ไม่เห็นชอบ → ส่งกลับ "ตรง" เจ้าหน้าที่ (ทุกประเด็นในเมนู ไม่แวะ ผบช.ชั้นต้น แต่แจ้ง ผบช.ชั้นต้นทราบ)
 *   WIT0511 / WIT0512  เจ้าหน้าที่แก้ → ส่งกลับ ผอ. โดยตรง → ผอ. ลงนามข้อ 11 ใหม่ → ส่งธุรการ (WIT0515 / WIT0516) → รองเลขาธิการฯ
 *   WIT0517 / WIT0519  รองเลขาธิการฯ ส่งกลับ: ประเด็นความเห็น ผอ. → ผอ. · ประเด็นเอกสาร/ฐานอำนาจ/วิธีคุ้มครอง → เจ้าหน้าที่
 *                      (หรือเลือกปลายทาง กอท.) · WIT0520 ชุดนำส่งขากลับผ่านธุรการ · WIT0521 ผอ. ลงนามข้อ 11 ใหม่ · แล้วเดินครบทุกชั้นใหม่
 *   FB-018             ผลความเห็นข้อ 12 "ไม่เห็นควร" → ส่งต่อเลขาธิการฯ ไม่ได้ ต้องส่งกลับ (เจ้าของเรื่อง / กอท.)
 *
 * ทุกเทสต์ seed state ของตัวเอง (Case 1.4 / 1.5 / 1.6) และยืนยันผลจาก store ด้วย readCase:
 *   stage / owner / returned / returnedByRole / returnIssueLabel / returnNote / returnDestination / assignmentHistory /
 *   ลายมือชื่อ คบ.6 ถูกล้าง / kb3-kb6 Version + PreviousVersions (เก็บฉบับเดิม)
 * หมายเหตุ: หลังรองเลขาธิการฯ ส่งกลับ แฟ้มค้างที่ธุรการ (owner/status/next ยังเป็นของธุรการ) จนกว่าจะลงเลขครบทั้งสองจุด
 */

const OFFICER = userNameById('OFF-REG1')
const SUPERVISOR = userNameById('SUP-001')
const DIRECTOR = userNameById('DIR-001')
const DEPUTY = userNameById('DSEC-001')

type Rec = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
type Hist = Array<Record<string, string>>
type Version = { version: number; returnedAt?: string; returnedBy?: string; returnReason?: string; signedAt?: string }

/** สลับทั้งบัญชี (ผู้ใช้ + หน่วยงาน) ตามบทบาท — switchRole ของ helper เปลี่ยนแค่ role ผู้ใช้จึงยังเป็นคนเดิม เปิดแฟ้มไม่ได้ */
async function switchRole(page: Page, role: string) {
  const raw = await page.evaluate(() => localStorage.getItem('ecmis-auth-storage'))
  const auth = JSON.parse(raw as string)
  const account = mockStateAccountForRole(role as UserRole)
  auth.state = account ? authStateForAccount(account, auth.state) : { ...auth.state, currentRole: role }
  await page.addInitScript((v: string) => localStorage.setItem('ecmis-auth-storage', v), JSON.stringify(auth))
  await page.reload()
}

const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null
const historyOf = async (page: Page) => (((await caseOf(page))?.assignmentHistory ?? []) as Hist)

/** textarea ถัดจาก label — ช่องข้อความใช้ VoiceTextarea ที่หุ้มด้วย div จึงใช้ descendant-or-self */
const areaField = (page: Page, label: string) =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::*[1]/descendant-or-self::textarea')

/** ตีกลับจากการ์ดส่งงานในแฟ้ม (ผบช.ชั้นต้น / ผอ. / รองเลขาธิการฯ) */
async function returnFromDossier(page: Page, issue: string, note: string) {
  await page.getByTestId('return-case-button').click()
  await page.getByTestId('return-issue-select').selectOption(issue)
  await page.getByTestId('return-note-input').fill(note)
  await page.getByTestId('return-confirm-button').click()
}

/** ส่งต่อจากการ์ดส่งงาน แล้วรอให้แฟ้มถึงขั้นที่คาดไว้ */
async function forwardTo(page: Page, stage: string, expectedText?: string | RegExp) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
  await expect.poll(async () => (await caseOf(page))?.stage).toBe(stage)
}

/** ลงนามความเห็นข้อ 10-12 ใน /form/6 (ความเห็นว่างให้เติมก่อนจึงลงนามได้) แล้วกลับหน้าแฟ้ม */
async function signKb6(page: Page, no: '10' | '11' | '12', label: string) {
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill('เห็นชอบตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
  await page.goto(DOSSIER_URL)
}

const SIGN_STEP = {
  supervisor: { no: '10', label: 'ความเห็นผู้บังคับบัญชาชั้นต้น', signedAt: 'kb6SupervisorSignedAt' },
  director: { no: '11', label: 'ความเห็นผู้อำนวยการสำนัก', signedAt: 'kb6DirectorSignedAt' },
  deputy_secretary: { no: '12', label: 'ความเห็นรองเลขาธิการฯ', signedAt: 'kb6DeputySignedAt' },
} as const

/** เจ้าหน้าที่เปิดแบบ คบ.X ที่ถูกตีกลับ (ระบบเปิดเป็นฉบับใหม่) แก้ช่องข้อความแล้วบันทึก */
async function reviseForm(page: Page, code: 'คบ.3' | 'คบ.6', appendText: string) {
  await page.goto(DOSSIER_URL)
  await formRow(page, code).getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page.getByText(/ฉบับที่ \d/).first()).toBeVisible()
  if (code === 'คบ.6') {
    const field = areaField(page, '2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย')
    await field.fill(`${await field.inputValue()} ${appendText}`.trim())
    for (const [label, value] of [['1.1 ได้รับคำร้อง', OFFICER], ['2.2 ชื่อ-สกุล พยาน', 'สมชาย ใจดี']]) {
      const input = page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
      if (!(await input.inputValue())) await input.fill(value)
    }
  }
  await page.getByRole('button', { name: `บันทึกแบบ ${code}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/** ขากลับจากสำนักงานเลขาธิการลงหน่วย (WIT0520): ธุรการ สลธ. ออกเลขส่ง → ธุรการหน่วยลงเลขรับ (รองเลขาธิการฯ ตีกลับ) */
async function passDownLeg(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await page.goto(DOSSIER_URL)
}

/** ขาไปสำนักงานเลขาธิการ: ผอ. ส่งธุรการสำนัก/กอง ออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ → ถึงรองเลขาธิการฯ (WIT0515 / WIT0516) */
async function forwardDirectorToDeputy(page: Page) {
  await forwardTo(page, 'director_outgoing_registry', 'ธุรการสำนัก/กอง')
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await expect.poll(async () => (await caseOf(page))?.stage).toBe('deputy_review')
  await page.goto(DOSSIER_URL)
}

/** ยืนยันผลการตีกลับที่ต้องตรงกันทุกระดับ: เหตุผล ประเด็น ผู้สั่ง และประวัติ */
async function expectReturnRecorded(page: Page, o: { label: string; note: string; byRole: string; by: string }) {
  const c = (await caseOf(page))!
  expect(c.status).toBe('ส่งกลับแก้ไข')
  expect(c.returned).toBe(true)
  expect(c.returnedBy).toBe(o.by)
  expect(c.returnedByRole).toBe(o.byRole)
  expect(c.returnIssueLabel).toBe(o.label)
  expect(c.returnNote).toBe(o.note)
  expect(c.next).toContain(o.label)
  const h = await historyOf(page)
  const entry = h.find((x) => x.action === `ส่งกลับแก้ไขโดย ${o.by}`)
  expect(entry, 'ต้องมีรายการ "ส่งกลับแก้ไขโดย ..." ใน assignmentHistory').toBeTruthy()
  expect(entry!.detail).toContain(o.label)
  expect(entry!.detail).toContain(o.note)
}

/** ฉบับ คบ.3 / คบ.6 เดิมต้องถูกเก็บไว้ในประวัติเวอร์ชันพร้อมเหตุผลการส่งกลับ และขึ้นฉบับใหม่ */
async function expectVersionsPreserved(page: Page, o: { round: number; by: string; label: string; note: string }) {
  const c = (await caseOf(page))!
  expect(c.kb6Version).toBe(o.round + 1)
  expect(c.kb3Version).toBe(o.round + 1)
  const kb6Prev = (c.kb6PreviousVersions ?? []) as Version[]
  const kb3Prev = (c.kb3PreviousVersions ?? []) as Version[]
  expect(kb6Prev).toHaveLength(o.round)
  expect(kb3Prev).toHaveLength(o.round)
  const last = kb6Prev[kb6Prev.length - 1]
  expect(last.version).toBe(o.round)
  expect(last.returnedBy).toBe(o.by)
  expect(last.returnReason).toBe(`${o.label}: ${o.note}`)
  expect(kb3Prev[kb3Prev.length - 1].returnReason).toBe(`${o.label}: ${o.note}`)
}

async function expectAllKb6SignaturesCleared(page: Page) {
  const c = (await caseOf(page))!
  expect(c.kb6Signed).toBe(false)
  for (const k of ['kb6SupervisorSignedAt', 'kb6SupervisorSignedBy', 'kb6DirectorSignedAt', 'kb6DirectorSignedBy', 'kb6DeputySignedAt', 'kb6DeputySignedBy']) {
    expect(c[k], `${k} ต้องถูกล้างหลังส่งกลับ`).toBeFalsy()
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// A · ผบช.ชั้นต้น (WIT0503–WIT0507)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('RRR-05-A · ผบช.ชั้นต้นส่งกลับเจ้าหน้าที่ (WIT0505 / WIT0506 / WIT0507)', () => {
  for (const issue of RETURN_ISSUE_CATALOG.supervisor) {
    test(`WIT0505 · ผบช.ชั้นต้นส่งกลับประเด็น "${issue.label}" → เจ้าหน้าที่ + เก็บ คบ.3/คบ.6 ฉบับเดิม`, async ({ page }) => {
      // Case 1.4 — ผบช.ชั้นต้นรับชุดเสนอ (supervisor_review)
      await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false, ...KB1_DONE })
      await page.goto(DOSSIER_URL)
      expect((await caseOf(page))?.stage).toBe('supervisor_review')

      const note = `ข้อสั่งการ ผบช.ชั้นต้น: ${issue.label} ให้แก้ไขและเสนอใหม่`
      await returnFromDossier(page, issue.value, note)
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

      const c = (await caseOf(page))!
      expect(c.owner).toBe(OFFICER)
      expect(c.directorReturn).toBe(false) // ไม่ใช่วงลัดของ ผอ. (WIT0510)
      await expectReturnRecorded(page, { label: issue.label, note, byRole: 'supervisor', by: 'ผู้บังคับบัญชาชั้นต้น' })
      await expectVersionsPreserved(page, { round: 1, by: 'ผู้บังคับบัญชาชั้นต้น', label: issue.label, note })
      await expectAllKb6SignaturesCleared(page)
    })
  }

  test('WIT0504 · ผบช.ชั้นต้นตีกลับโดยไม่ระบุข้อสั่งการไม่ได้ (แฟ้มยังอยู่ขั้นเดิม ไม่เก็บฉบับ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false, ...KB1_DONE })
    await page.goto(DOSSIER_URL)

    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('risk_incomplete')
    await page.getByTestId('return-confirm-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
    const c = (await caseOf(page))!
    expect(c.stage).toBe('supervisor_review')
    expect(c.returned).toBeFalsy()
    expect(c.kb6PreviousVersions ?? []).toHaveLength(0)
  })

  test('WIT0505 · แฟ้มอยู่ที่ ผอ. แล้ว ผบช.ชั้นต้นดึงกลับจากมือ ผอ. ไม่ได้ (ไม่มีปุ่มส่งกลับ/ส่งต่อ · TC-014)', async ({ page }) => {
    // Case 1.5 — แฟ้มอยู่ที่ ผอ. แล้ว
    await seedMockState(page, 'Case 1.5', 'supervisor')
    await page.goto(DOSSIER_URL)
    expect((await caseOf(page))?.stage).toBe('director_review')
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toHaveCount(0)
  })

  test('WIT0505 → WIT0506 → WIT0507 · วนเต็ม: ส่งกลับ → เจ้าหน้าที่แก้ฉบับที่ 2 → กลับ ผบช.ชั้นต้น (ไม่ข้ามชั้น) → ลงนามข้อ 10 ใหม่ → ผอ.', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false, ...KB1_DONE })
    await page.goto(DOSSIER_URL)

    const note = 'ลายมือชื่อผู้ให้ถ้อยคำไม่ครบ ให้ตรวจ คบ.3 และ คบ.6 แล้วเสนอใหม่'
    await returnFromDossier(page, 'signature_missing', note)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    await switchRole(page, 'officer')
    // เจ้าหน้าที่เห็นเหตุผลที่ถูกส่งกลับ ไม่ใช่ banner ลัดของ ผอ.
    await expect(page.getByTestId('director-rework-banner')).toHaveCount(0)
    await reviseForm(page, 'คบ.3', '')
    await reviseForm(page, 'คบ.6', 'ตรวจลายมือชื่อครบถ้วนแล้ว')

    // ส่งขึ้นต้องเป็น ผบช.ชั้นต้น ไม่ใช่ ผอ.
    const forward = page.getByTestId('forward-case-button')
    await expect(forward).toContainText('ผู้บังคับบัญชาชั้นต้น')
    await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
    let c = (await caseOf(page))!
    expect(c.owner).toBe(SUPERVISOR)
    expect(c.returned).toBe(false)
    expect(c.directorReturn).toBe(false)
    // ฉบับเดิมยังอยู่ครบหลังเจ้าหน้าที่แก้
    expect((c.kb6PreviousVersions as Version[])).toHaveLength(1)

    // ลายมือชื่อรอบก่อนใช้ไม่ได้ — ผบช.ชั้นต้นต้องลงนามใหม่จึงจะเสนอ ผอ. ได้
    await switchRole(page, 'supervisor')
    expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeFalsy()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await signKb6(page, SIGN_STEP.supervisor.no, SIGN_STEP.supervisor.label)
    expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeTruthy()
    await forwardTo(page, 'director_review', 'ผอ.สำนัก/กอง')

    c = (await caseOf(page))!
    expect(c.owner).toBe(DIRECTOR)
    // ข้อมูลการส่งกลับรอบก่อนยังคงอยู่เป็นประวัติ ไม่ถูกลบเมื่อผ่านรอบแก้ไข
    const h = await historyOf(page)
    expect(h.some((x) => x.action === 'ส่งกลับแก้ไขโดย ผู้บังคับบัญชาชั้นต้น')).toBe(true)
  })

  test('WIT0505 · ส่งกลับซ้ำสองรอบ → ฉบับ คบ.3/คบ.6 ขึ้นเป็นฉบับที่ 3 และเก็บฉบับเดิมครบทั้งสองฉบับ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false, ...KB1_DONE })
    await page.goto(DOSSIER_URL)

    const note1 = 'รอบที่ 1: หลักฐานภัยคุกคามไม่สมบูรณ์'
    await returnFromDossier(page, 'evidence_missing', note1)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    await switchRole(page, 'officer')
    await reviseForm(page, 'คบ.3', '')
    await reviseForm(page, 'คบ.6', 'เพิ่มหลักฐานรอบที่ 1')
    await forwardTo(page, 'supervisor_review')

    await switchRole(page, 'supervisor')
    const note2 = 'รอบที่ 2: ข้อมูลคดีหลักยังไม่ตรงกับสำนวน'
    await returnFromDossier(page, 'main_case_mismatch', note2)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    const c = (await caseOf(page))!
    expect(c.owner).toBe(OFFICER)
    expect(c.kb6Version).toBe(3)
    expect(c.kb3Version).toBe(3)
    const prev = c.kb6PreviousVersions as Version[]
    expect(prev.map((p) => p.version)).toEqual([1, 2])
    expect(prev[0].returnReason).toContain(note1)
    expect(prev[1].returnReason).toContain(note2)
    // ข้อมูลล่าสุดคือรอบที่ 2
    expect(c.returnNote).toBe(note2)
    expect(c.returnIssueLabel).toBe('ข้อมูลเชื่อมโยงคดีหลักไม่ตรงกับสำนวน')
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// B · ผอ.สำนัก/กอง (WIT0508–WIT0512)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('RRR-05-B · ผอ. ส่งกลับตรงเจ้าหน้าที่ (WIT0510 / WIT0511 / WIT0512)', () => {
  for (const issue of RETURN_ISSUE_CATALOG.director) {
    test(`WIT0510 · ผอ. ส่งกลับประเด็น "${issue.label}" → เจ้าหน้าที่โดยตรง ล้างลายมือชื่อข้อ 10 และเก็บฉบับเดิม`, async ({ page }) => {
      // Case 1.5 — ผอ. พิจารณา (ผบช.ชั้นต้นลงนามข้อ 10 แล้ว)
      await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
      await page.goto(DOSSIER_URL)
      const before = (await caseOf(page))!
      expect(before.stage).toBe('director_review')
      const supervisorSignedAt = before.kb6SupervisorSignedAt
      expect(supervisorSignedAt).toBeTruthy()

      const note = `ข้อสั่งการ ผอ.: ${issue.label} ให้ตรวจสอบและแก้เป็นฉบับใหม่`
      await returnFromDossier(page, issue.value, note)
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

      const c = (await caseOf(page))!
      expect(c.owner).toBe(OFFICER)
      expect(c.owner).not.toBe(SUPERVISOR)
      expect(c.directorReturn).toBe(true)
      await expectReturnRecorded(page, { label: issue.label, note, byRole: 'director', by: 'ผู้อำนวยการสำนัก/กอง' })
      await expectVersionsPreserved(page, { round: 1, by: 'ผู้อำนวยการสำนัก/กอง', label: issue.label, note })
      await expectAllKb6SignaturesCleared(page)

      // ฉบับเดิมเก็บลายมือชื่อ ผบช.ชั้นต้นที่ลงนามไว้ก่อนถูกล้าง
      const prev = c.kb6PreviousVersions as Version[]
      expect(prev[0].signedAt).toBe(supervisorSignedAt)

      // ผบช.ชั้นต้นได้รับแจ้งให้ทราบ แต่ไม่ได้รับงานเข้าคิว
      const h = await historyOf(page)
      const notice = h.find((x) => x.action === 'แจ้งผู้บังคับบัญชาชั้นต้นทราบ')
      expect(notice).toBeTruthy()
      expect(notice!.detail).toContain('ไม่ต้องกลั่นกรองซ้ำ')
      expect(h.some((x) => (x.detail ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })
  }

  test('WIT0510 → WIT0511 → WIT0512 · วนเต็ม: ผอ. ส่งกลับ → เจ้าหน้าที่แก้ฉบับใหม่ → ส่งกลับ ผอ. ตรง (ไม่ผ่าน ผบช.) → ผอ. ลงนามข้อ 11 → ธุรการ → รองเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    const note = 'งบประมาณและกำลังพลชุดคุ้มครองไม่สมเหตุสมผล ให้ปรับ คบ.6 ใหม่'
    await returnFromDossier(page, 'protection_budget_unclear', note)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    await switchRole(page, 'officer')
    const banner = page.getByTestId('director-rework-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    await expect(banner).toContainText('งบประมาณหรือกำลังพลชุดคุ้มครองไม่สมเหตุสมผล')

    await reviseForm(page, 'คบ.6', 'ปรับงบประมาณและกำลังพลแล้ว')
    const forward = page.getByTestId('forward-case-button')
    await expect(forward).toContainText('เสนอ ผอ.สำนัก/กอง')
    await expect(forward).not.toContainText('ผู้บังคับบัญชาชั้นต้น')
    await forwardTo(page, 'director_review', 'เสนอ ผอ.สำนัก/กอง')

    let c = (await caseOf(page))!
    expect(c.owner).toBe(DIRECTOR)
    expect(c.directorReturn).toBe(false)
    expect(c.returned).toBe(false)
    expect(c.fastTracked).toBe(false)
    // ผบช.ชั้นต้นไม่ถูกเรียกกลับมาลงนามใหม่ในวงสั้น
    expect(c.kb6SupervisorSignedAt).toBeFalsy()
    const h = await historyOf(page)
    expect(h[h.length - 1].detail).toContain('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')

    // ลายมือชื่อข้อ 11 ต้องลงนามใหม่ก่อนจึงเสนอรองเลขาธิการฯ ได้
    await switchRole(page, 'director')
    expect((await caseOf(page))?.kb6DirectorSignedAt).toBeFalsy()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await signKb6(page, SIGN_STEP.director.no, SIGN_STEP.director.label)
    await forwardDirectorToDeputy(page)

    c = (await caseOf(page))!
    expect(c.owner).toBe(DEPUTY)
    expect(c.kb6DirectorSignedAt).toBeTruthy()
    expect(c.kb6Version).toBe(2)
  })

  test('WIT0510 · ผอ. ตีกลับโดยไม่ระบุข้อสั่งการไม่ได้ · ผอ. ส่งกลับซ้ำสองรอบ ฉบับขึ้นเป็นฉบับที่ 3', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-confirm-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
    expect((await caseOf(page))?.stage).toBe('director_review')
    expect((await caseOf(page))?.returned).toBeFalsy()
    // toast ตรวจสอบข้อมูลปิด dialog ส่งกลับเดิมไปแล้ว ไม่ต้องกดยกเลิก — returnFromDossier เปิด dialog ใหม่

    const note1 = 'รอบที่ 1: ความเห็น ผบช.ชั้นต้นไม่ชัดเจน'
    await returnFromDossier(page, 'supervisor_opinion_unclear', note1)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    await switchRole(page, 'officer')
    await reviseForm(page, 'คบ.6', 'แก้รอบที่ 1')
    await forwardTo(page, 'director_review')

    await switchRole(page, 'director')
    const note2 = 'รอบที่ 2: ข้อเท็จจริงใน คบ.3 และ คบ.6 ขัดแย้งกัน'
    await returnFromDossier(page, 'fact_discrepancy', note2)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    const c = (await caseOf(page))!
    expect(c.directorReturn).toBe(true)
    expect(c.kb6Version).toBe(3)
    const prev = c.kb6PreviousVersions as Version[]
    expect(prev.map((p) => p.version)).toEqual([1, 2])
    expect(prev[0].returnReason).toContain(note1)
    expect(prev[1].returnReason).toContain(note2)
    expect(c.returnNote).toBe(note2)
  })

  test('WIT0510 · ผบช.ชั้นต้นเข้าแฟ้มที่ ผอ. สั่งแก้แล้ว ไม่มีงานให้กลั่นกรอง (ไม่มีปุ่มส่งกลับ/ส่งต่อ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)
    await returnFromDossier(page, 'urgent_condition_unmet', 'ไม่เข้าข่ายกรณีจำเป็นเร่งด่วนตามระเบียบ ให้ทบทวนการกลั่นกรอง')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    await switchRole(page, 'supervisor')
    expect((await caseOf(page))?.stage).toBe('staff_review')
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// C · รองเลขาธิการฯ (WIT0517–WIT0521 · FB-018)
// ---------------------------------------------------------------------------------------------------------------------
test.describe('RRR-05-C · รองเลขาธิการฯ ส่งกลับ (WIT0517 / WIT0519 / WIT0520 / WIT0521)', () => {
  const deputyIssues = RETURN_ISSUE_CATALOG.deputy_secretary
  const DEPUTY_BY = 'รองเลขาธิการ ป.ป.ท.'

  test('WIT0519 · ประเด็นความเห็น ผอ. ไม่ชัดเจน → ส่งกลับ ผอ. (ไม่ใช่เจ้าหน้าที่) ล้างลายมือชื่อและเก็บฉบับเดิม', async ({ page }) => {
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)
    const before = (await caseOf(page))!
    expect(before.stage).toBe('deputy_review')
    expect(before.kb6DirectorSignedAt).toBeTruthy()

    const issue = deputyIssues.find((i) => i.value === 'director_opinion_unclear')!
    expect(issue.target).toBe('director')
    const note = 'ความเห็นข้อ 11 ของ ผอ. ยังไม่ระบุเหตุผลประกอบระดับภัย ให้ทบทวน'
    await returnFromDossier(page, issue.value, note)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('director_review')
    // ระหว่างชุดนำส่งขากลับ แฟ้มค้างที่ธุรการ — ผอ. เป็นเจ้าของเมื่อธุรการลงเลขครบ
    expect((await caseOf(page))?.sarabanDispatch).toBeTruthy()
    await passDownLeg(page)

    const c = (await caseOf(page))!
    expect(c.sarabanDispatch).toBeUndefined()
    expect(c.owner).toBe(DIRECTOR)
    // ส่งกลับ ผอ. ไม่ใช่วงลัด WIT0510 (ซึ่งส่งกลับเจ้าหน้าที่)
    expect(c.directorReturn).toBe(false)
    expect(c.returnDestination).toBe('owner')
    expect(c.gotRevision).toBeFalsy()
    await expectReturnRecorded(page, { label: issue.label, note, byRole: 'deputy_secretary', by: DEPUTY_BY })
    await expectVersionsPreserved(page, { round: 1, by: DEPUTY_BY, label: issue.label, note })
    await expectAllKb6SignaturesCleared(page)
    // ฉบับเดิมเก็บลายมือชื่อ ผบช.ชั้นต้นที่เคยลงนามไว้
    expect(((c.kb6PreviousVersions as Version[])[0]).signedAt).toBe(before.kb6SupervisorSignedAt)
  })

  test('WIT0519 → WIT0521 · วนเต็ม: รองเลขาธิการฯ ส่งกลับ ผอ. → ผอ. ลงนามข้อ 11 ใหม่ → รองเลขาธิการฯ ลงนามข้อ 12 ใหม่ → เลขาธิการฯ', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await returnFromDossier(page, 'director_opinion_unclear', 'ให้ ผอ. ทบทวนความเห็นข้อ 11 และลงนามใหม่')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('director_review')
    await passDownLeg(page)

    await switchRole(page, 'director')
    let c = (await caseOf(page))!
    expect(c.owner).toBe(DIRECTOR)
    expect(c.returned).toBe(true)
    // ไม่ใช่รอบ "ผอ. แก้เอง" — ไม่มี banner ของ WIT0511 และต้องลงนามใหม่ก่อนส่งต่อ
    await expect(page.getByTestId('director-rework-banner')).toHaveCount(0)
    expect(c.kb6DirectorSignedAt).toBeFalsy()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await signKb6(page, SIGN_STEP.director.no, SIGN_STEP.director.label)
    await forwardDirectorToDeputy(page)

    c = (await caseOf(page))!
    expect(c.owner).toBe(DEPUTY)
    expect(c.returned).toBe(false)
    // ผลความเห็นข้อ 12 ผูกกับรอบเสนอ — ถูกล้างเมื่อส่งกลับ และลายมือชื่อข้อ 12 ต้องลงนามใหม่
    expect(c.kb6DeputyOpinionChoice).toBeFalsy()
    expect(c.kb6DeputySignedAt).toBeFalsy()

    await switchRole(page, 'deputy_secretary')
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await signKb6(page, SIGN_STEP.deputy_secretary.no, SIGN_STEP.deputy_secretary.label)
    await forwardTo(page, 'external_pending', 'เลขาธิการ')
    c = (await caseOf(page))!
    expect(c.kb6DeputySignedAt).toBeTruthy()
    expect(c.kb6DirectorSignedAt).toBeTruthy()
  })

  for (const issue of deputyIssues.filter((i) => i.target === 'officer')) {
    test(`WIT0519 · รองเลขาธิการฯ ส่งกลับประเด็น "${issue.label}" → เจ้าหน้าที่ผู้รับผิดชอบ ล้างลายมือชื่อข้อ 10–12`, async ({ page }) => {
      await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
      await page.goto(DOSSIER_URL)
      expect((await caseOf(page))?.stage).toBe('deputy_review')

      const note = `ข้อสั่งการรองเลขาธิการฯ: ${issue.label}`
      await returnFromDossier(page, issue.value, note)
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
      await passDownLeg(page)

      const c = (await caseOf(page))!
      expect(c.owner).toBe(OFFICER)
      expect(c.directorReturn).toBe(false)
      expect(c.returnDestination).toBe('owner')
      await expectReturnRecorded(page, { label: issue.label, note, byRole: 'deputy_secretary', by: DEPUTY_BY })
      await expectVersionsPreserved(page, { round: 1, by: DEPUTY_BY, label: issue.label, note })
      await expectAllKb6SignaturesCleared(page)
    })
  }

  test('WIT0519 · เอกสารไม่ครบ → เจ้าหน้าที่แก้ → ต้องเดินครบทุกชั้นใหม่ (ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ) ไม่ข้าม ไม่ย้อนทาง', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await returnFromDossier(page, 'kb6_attachment_incomplete', 'ชุดเสนอขาดเอกสารแนบ ให้เติมให้ครบและเสนอใหม่ตามลำดับชั้น')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
    await passDownLeg(page)

    await switchRole(page, 'officer')
    expect((await caseOf(page))?.owner).toBe(OFFICER)
    await reviseForm(page, 'คบ.6', 'เติมเอกสารแนบครบแล้ว')
    await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
    await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
    expect((await caseOf(page))?.owner).toBe(SUPERVISOR)

    const chain = [
      ['supervisor', 'director_review', DIRECTOR],
      ['director', 'deputy_review', DEPUTY], // ผอ. ส่งผ่านธุรการ (ขาไป) ก่อนถึงรองเลขาธิการฯ
      ['deputy_secretary', 'external_pending', undefined],
    ] as const
    const signedBefore: string[] = []
    for (const [role, nextStage, nextOwner] of chain) {
      await switchRole(page, role)
      const step = SIGN_STEP[role]
      // ชั้นนี้ต้องลงนามใหม่ — ไม่มีลายมือชื่อตกค้างจากรอบก่อน และปุ่มส่งต่อล็อกจนกว่าจะลงนาม
      expect((await caseOf(page))?.[step.signedAt], `${step.signedAt} ต้องว่างก่อนลงนามรอบแก้ไข`).toBeFalsy()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await signKb6(page, step.no, step.label)
      expect((await caseOf(page))?.[step.signedAt]).toBeTruthy()
      // ชั้นที่ยังไม่ถึงต้องยังไม่มีลายมือชื่อ (ไม่ถูกข้ามไปล่วงหน้า)
      for (const later of chain.slice(chain.findIndex((x) => x[0] === role) + 1)) {
        expect((await caseOf(page))?.[SIGN_STEP[later[0]].signedAt]).toBeFalsy()
      }
      if (role === 'director') await forwardDirectorToDeputy(page)
      else await forwardTo(page, nextStage)
      if (nextOwner) expect((await caseOf(page))?.owner).toBe(nextOwner)
      signedBefore.push(role)
    }

    const c = (await caseOf(page))!
    expect(signedBefore).toEqual(['supervisor', 'director', 'deputy_secretary'])
    expect(c.returned).toBe(false)
    expect(c.directorReturn).toBe(false)
    expect(c.kb6Version).toBe(2)
    expect((c.kb6PreviousVersions as Version[])).toHaveLength(1)
  })

  test('WIT0519 / FB-018 · รองเลขาธิการฯ เลือก "ไม่เห็นควร" → ส่งเลขาธิการฯ ไม่ได้ → ส่งกลับเจ้าของเรื่อง ล้างผลความเห็น', async ({ page }) => {
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await page.getByTestId('deputy-opinion-disagree').check()
    await expect.poll(async () => (await caseOf(page))?.kb6DeputyOpinionChoice).toBe('disagree')
    await expect(page.getByTestId('deputy-opinion-disagree-hint')).toBeVisible()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()

    // ปลายทางตั้งต้น = เจ้าของเรื่อง
    await page.getByTestId('return-case-button').click()
    await expect(page.getByTestId('return-destination-owner')).toBeChecked()
    await page.getByTestId('return-destination-owner').check()
    await page.getByTestId('return-issue-select').selectOption('protection_method_unclear')
    await page.getByTestId('return-note-input').fill('ไม่เห็นควร: วิธีคุ้มครองที่เสนอยังไม่สอดคล้องกับระดับภัย')
    await page.getByTestId('return-confirm-button').click()
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
    await passDownLeg(page)

    const c = (await caseOf(page))!
    expect(c.owner).toBe(OFFICER)
    expect(c.returnDestination).toBe('owner')
    expect(c.kb6DeputyOpinionChoice).toBeFalsy()
    expect(c.returnedByRole).toBe('deputy_secretary')
    const entry = (await historyOf(page)).find((x) => x.action === `ส่งกลับแก้ไขโดย ${DEPUTY_BY}`)
    expect(entry?.detail).toContain('รองเลขาธิการฯ ไม่เห็นควร · ส่งกลับเจ้าของเรื่อง')
  })

  test('WIT0519 / FB-018 · รองเลขาธิการฯ เลือกปลายทาง กอท. → ผู้รับผิดชอบ กอท. รับแก้ผ่านธุรการ สลธ. → ธุรการ กอท. ล้างลายมือชื่อและเก็บฉบับเดิม', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    const issue = deputyIssues.find((i) => i.value === 'legal_basis_unclear')!
    const note = 'ฐานอำนาจและเหตุแห่งภัยยังไม่ครบ ให้ กอท. ตรวจและเสนอใหม่'
    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-destination-got').check()
    await page.getByTestId('return-issue-select').selectOption(issue.value)
    await page.getByTestId('return-note-input').fill(note)
    await page.getByTestId('return-confirm-button').click()
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    let c = (await caseOf(page))!
    expect(c.returnDestination).toBe('got')
    expect(c.gotRevision?.assigneeName).toBeTruthy()
    expect(c.sarabanDispatch?.unitClerkRole).toBe('got_receiver')

    // ธุรการ สลธ. ออกเลขส่ง → ธุรการ กอท. ลงเลขรับ แล้วผู้รับผิดชอบ กอท. จึงเป็นเจ้าของ
    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
    await passSarabanCheckpoint(page, CASE_NO, 'got_receiver')
    c = (await caseOf(page))!
    expect(c.sarabanDispatch).toBeUndefined()
    expect(c.owner).toBe(c.gotRevision?.assigneeName)
    await expectReturnRecorded(page, { label: issue.label, note, byRole: 'deputy_secretary', by: DEPUTY_BY })
    await expectVersionsPreserved(page, { round: 1, by: DEPUTY_BY, label: issue.label, note })
    await expectAllKb6SignaturesCleared(page)
    const entry = (await historyOf(page)).find((x) => x.action === `ส่งกลับแก้ไขโดย ${DEPUTY_BY}`)
    expect(entry?.detail).toContain('กองอำนวยการต่อต้านทุจริต')
  })

  test('WIT0519 · รองเลขาธิการฯ ตีกลับโดยไม่ระบุข้อสั่งการไม่ได้ · ผอ. (ขั้นก่อนหน้า) ไม่มีปุ่มส่งกลับเมื่อแฟ้มอยู่ที่รองเลขาธิการฯ', async ({ page }) => {
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)
    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-confirm-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
    const c = (await caseOf(page))!
    expect(c.stage).toBe('deputy_review')
    expect(c.returned).toBeFalsy()
    expect(c.kb6PreviousVersions ?? []).toHaveLength(0)

    // ผอ. ส่งต่อแล้วดึงกลับไม่ได้ (TC-014)
    await switchRole(page, 'director')
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await switchRole(page, 'supervisor')
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// D · ทางเลือก "ปฏิเสธ / ไม่อนุมัติ" ในแท็บ 05
// ---------------------------------------------------------------------------------------------------------------------
test.describe('RRR-05-D · ปฏิเสธ/ไม่อนุมัติในชั้นกลั่นกรอง', () => {
  // ผังแท็บ 05: ◇ ของ ผบช.ชั้นต้น / ผอ. / รองเลขาธิการฯ มีเพียงทาง "เห็นชอบ → ส่งต่อ" หรือ "ไม่เห็นชอบ/ไม่ครบ → ส่งกลับแก้ไข"
  // การ์ดส่งงาน (ForwardWorkflowCard) จึงมีแค่ปุ่ม return-case-button และ forward-case-button — ไม่มีปุ่มปฏิเสธ/ปิดเรื่องในชั้นนี้
  // การไม่อนุมัติจริง (คบ.10 · แจ้งสิทธิอุทธรณ์) เกิดหลังเลขาธิการฯ ตัดสินในแท็บ 07/09A ซึ่งอยู่นอกขอบเขตไฟล์นี้
  test.fixme('RRR-05-D · ผบช.ชั้นต้น/ผอ./รองเลขาธิการฯ ปฏิเสธคำร้องขาดคุณสมบัติและปิดเรื่องได้โดยไม่ต้องส่งกลับ', async () => {
    // ช่องว่าง: ไม่มี UI/action "ปฏิเสธ" ที่ชั้นกลั่นกรอง คบ.6 — เปิดเทสต์นี้เมื่อมีปุ่มปฏิเสธและ store action รองรับ
  })
})
