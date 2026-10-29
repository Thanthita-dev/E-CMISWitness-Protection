import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, linkMainCaseAsOfficer, readCase, seedMockState } from '../helpers/seed'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import type { UserRole } from '../../src/types/user'
import { choosePreliminaryOutcome, confirmInlineDecision, decisionWorkspace, fillDecisionWorkspace, notificationCount } from '../helpers/noticeDecisionWorkspace'
import { handoffAction } from '../helpers/postApproval'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'
import { snap } from '../helpers/snapshot'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, expectStage, fillKb5Period, formRow, signInModal } from '../journeys/journey-helpers'

/**
 * Flow-path specs — แท็บ 05 · 06 · 07 · 07G (ผังฉบับตรวจกับโค้ดปัจจุบัน)
 *
 * หนึ่ง test = หนึ่งเส้นทาง/ทางแยกของผังที่แก้แล้ว เดินผ่าน UI จริง (seed mock state ครั้งเดียวต่อ test)
 * หมายเหตุ: ขั้นธุรการสารบรรณ (director_outgoing_registry → secretary_incoming_registry ก่อนรองเลขาธิการฯ
 * และชุดนำส่งขากลับหลังเลขาธิการฯ สั่งการ) บังคับอยู่ในโค้ดแล้ว ผังเดิมไม่มี จึงถูกเพิ่มเป็น WIT0515/0516/0520, WIT0714–0716, A6POST07
 *
 * แท็บ 05 (เส้นทางปกติ กลั่นกรอง คบ.6)
 *   T05-A  WIT0501 → 0502 → 0503                              เจ้าหน้าที่ส่งชุดเสนอ → ผบช.ชั้นต้นรับ
 *   T05-B  WIT0503 → 0504 ครบ → 0507 → 0508                   ผบช.ชั้นต้นลงนามข้อ 10 เสนอ ผอ.
 *   T05-C  WIT0504 ไม่ครบ → 0505 → 0506 → 0503                ผบช.ชั้นต้นตีกลับ เจ้าหน้าที่แก้ฉบับใหม่ ส่งตรวจใหม่
 *   T05-D  WIT0503 → 0522 → (แท็บ 06)                          ผบช.ชั้นต้นแก้ผลประเมินเป็นเร่งด่วน
 *   T05-E  WIT0508 → 0509 เห็นชอบ → 0512 → 0513 → 0515 → 0516  ผอ. ลงนามข้อ 11 → ธุรการสำนัก/กอง → ธุรการ สลธ. → รองเลขาธิการฯ
 *   T05-F  WIT0509 ไม่เห็นชอบ → 0510 → 0511 → 0508            ผอ. ส่งกลับตรงเจ้าหน้าที่ แก้แล้วส่งกลับ ผอ.
 *   T05-G  WIT0517 ครบ → 0518 → 0514                          รองเลขาธิการฯ ลงนามข้อ 12 เสนอเลขาธิการฯ
 *   T05-H  WIT0517 ไม่ครบ → 0519 → 0520 → 0521 → 0515         รองเลขาธิการฯ ส่งกลับ ผอ. ผ่านธุรการ ผอ. ลงนามใหม่ส่งธุรการอีกรอบ
 *   T05-I  WIT0517 ไม่ครบ → 0519 → 0520 → 0506 → 0503         รองเลขาธิการฯ ส่งกลับเจ้าหน้าที่ ผ่านธุรการ แก้ฉบับใหม่ ส่ง ผบช.ชั้นต้น
 *
 * แท็บ 06 (เส้นทางเร่งด่วน คบ.4/คบ.5)
 *   T06-A  WIT0601 → 0602 → 0603 → 0604 → 0605 → 0606 ครบ → 0609 อนุมัติ → 0611 → 0612 → 0613 → 0614
 *   T06-B  WIT0609 ไม่อนุมัติ → 0610 → 0614 (คำร้องหลักเข้าแท็บ 05 ผ่าน ผบช.ชั้นต้น)
 *   T06-C  WIT0606 ไม่ครบ → 0607 → 0608 → 0605 → 0606 → 0609 อนุมัติ
 *   T06-D  แท็บ 05 WIT0522 → WIT0615 ผอ. ส่งกลับตรง → 0603 → 0604
 *
 * แท็บ 07 (ผลพิจารณา)
 *   T07-A  WIT0701 → 0704: ปุ่มสั่งการถูกล็อกจนลงนามข้อ 13 (ส่งกลับกดได้เสมอ)
 *   T07-B  WIT0704 อนุมัติ → 0702 → 0703 → 0705 (เจ้าของสำนวนเดิม) → 0715 → 0710
 *   T07-C  WIT0704 อนุมัติ → 0702 → 0703 → 0705 (กอท.) → 0715 (ต่อที่แท็บ 07G)
 *   T07-D  WIT0704 ไม่อนุมัติ → 0702 → 0703 → 0706 → 0716 → 0711
 *   T07-E  WIT0704 ส่งกลับ → 0707 → 0714 → 0708 → 0709 → 0712 → วนกลับ 0704
 *   T07-F  WIT0704 เห็นควรตามข้อ 14 → 0713
 *
 * แท็บ 07G (ส่งงานหลังอนุมัติให้ กอท.)
 *   T07G-A A6POST01 → A6POST07                                เลขาธิการอนุมัติ/มอบหมาย กอท. → ธุรการ สลธ. ออกเลขส่ง
 *   T07G-B A6POST02 → A6POST03                                ธุรการ กอท. ลงเลขรับ (รับเรื่อง) → ส่งเสนอ ผอ. กอท.
 *   T07G-C A6POST04                                           ผอ. กอท. มอบหมายผู้รับผิดชอบ
 *   T07G-D A6POST05 → A6POST06                                ผู้รับผิดชอบรับงาน → เติม คบ.9 ตรวจพร้อมส่ง
 */

const OFFICER = 'นางสาวอรุณี ใจมั่น'
/** เจ้าหน้าที่เจ้าของเรื่อง — ตอนตีกลับระบบคืนให้ผู้รับผิดชอบตามข้อมูลในแฟ้ม seed (ชื่อต่างกันตาม mock state) */
const OFFICER_OWNERS = [OFFICER, 'พ.ต.ต. ณัฐวุฒิ สรรพกิจ']
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'
const WITNESS = 'สมชาย ใจดี'
/** ช่องความเห็นข้อ 9–13 ใน /form/6 — label ไม่ใช่ <label> ติด textarea แล้ว จึงหา textarea ที่อยู่หลังข้อความ label (helper กลางยังใช้ locator เดิม) */
const areaField = (page: Page, label: string) =>
  page.getByText(label, { exact: true }).first().locator('xpath=(following-sibling::textarea | following-sibling::*//textarea)[1]')
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`

/**
 * สลับเป็นบัญชีทดลองของบทบาทนั้น (ผู้ใช้ + หน่วยงานตรงตามบทบาท) แล้วโหลดหน้าใหม่
 * helper กลาง switchRole เปลี่ยนแค่ currentRole ทำให้ผู้ใช้/หน่วยงานค้างเป็นของบทบาทก่อนหน้า ซึ่งไม่ผ่านการตรวจสิทธิ์รายหน่วยงานของระบบปัจจุบัน
 */
async function switchRole(page: Page, role: string) {
  const prev = await page.evaluate(() => JSON.parse(localStorage.getItem('ecmis-auth-storage') || '{"state":{}}'))
  const account = mockStateAccountForRole(role as UserRole)
  const state = account ? authStateForAccount(account, prev.state) : { ...prev.state, currentRole: role }
  await page.addInitScript((auth: unknown) => {
    if (!localStorage.getItem('ecmis-auth-storage')) return
    localStorage.setItem('ecmis-auth-storage', JSON.stringify({ ...JSON.parse(localStorage.getItem('ecmis-auth-storage') as string), state: auth }))
  }, state)
  await page.reload()
}

/** ธุรการลงเลขทะเบียนทุกฉบับที่หน้า /saraban/<เลขคำร้อง> แล้วส่งต่อ (ตรรกะเดียวกับ helpers/saraban แต่ใช้ switchRole ด้านบน) */
async function passSarabanCheckpoint(page: Page, caseNo: string, clerkRole: 'receiver' | 'secretary_receiver' | 'got_receiver') {
  await switchRole(page, clerkRole)
  await page.goto(`/saraban/${encodeURIComponent(caseNo)}`)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toBeVisible()
  const saveButtons = card.getByRole('button', { name: 'บันทึกเลขทะเบียน' })
  while ((await saveButtons.count()) > 0) {
    const before = await saveButtons.count()
    await saveButtons.first().click()
    await expect(saveButtons).toHaveCount(before - 1)
  }
  await expect(card.getByTestId('saraban-blocker')).toHaveCount(0)
  await card.getByTestId('saraban-submit-button').click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await dialog.locator('.swal2-confirm').click()
  await dialog.waitFor({ state: 'detached' })
}

type Rec = Record<string, unknown>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null
const historyOf = async (page: Page) => (((await caseOf(page))?.assignmentHistory ?? []) as Array<Record<string, string>>)
const handoffOf = async (page: Page) => ((await caseOf(page))?.protectionHandoff ?? {}) as Rec
const fastTrackOf = async (page: Page) => ((await caseOf(page))?.fastTrack ?? {}) as Rec
const notificationsOf = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('ecmis-notifications-storage')
    return (raw ? JSON.parse(raw).state.notifications : []) as Array<Record<string, string>>
  })

/** ส่งต่อจากการ์ดส่งงาน แล้วรอให้แฟ้มถึงขั้นที่คาดไว้ */
async function forwardTo(page: Page, stage: string, expectedText?: string | RegExp) {
  const button = page.getByTestId('forward-case-button')
  await expect(button).toBeEnabled()
  await button.click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
  await expectStage(page, stage)
}

/** ตีกลับจากการ์ดส่งงานในแฟ้ม (ผบช.ชั้นต้น / ผอ. / รองเลขาธิการฯ) */
async function returnFromDossier(page: Page, issue: string, note: string) {
  await page.getByTestId('return-case-button').click()
  await page.getByTestId('return-issue-select').selectOption(issue)
  await page.getByTestId('return-note-input').fill(note)
  await page.getByTestId('return-confirm-button').click()
}

/** ลงนามความเห็นข้อ 10-13 ใน /form/6 (เติมความเห็นถ้าว่าง) แล้วกลับหน้าแฟ้ม */
async function signKb6(page: Page, no: string, label: string, beforeSign?: () => Promise<void>) {
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill('เห็นชอบตามที่เสนอ')
  await beforeSign?.()
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
  await page.goto(DOSSIER_URL)
}

/** เจ้าหน้าที่จัดทำและบันทึก คบ.6 ครั้งแรก (ช่องบังคับ 1.1 / 2.2) แล้วกลับหน้าแฟ้ม */
async function prepareKb6(page: Page) {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6/)
  await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill(OFFICER)
  await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill(WITNESS)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/** เจ้าหน้าที่เปิดแบบ คบ.X ที่ถูกตีกลับ — ระบบเปิดเป็นฉบับใหม่ แก้แล้วบันทึก */
async function reviseForm(page: Page, code: 'คบ.3' | 'คบ.6', version: number, appendText: string) {
  await page.goto(DOSSIER_URL)
  await formRow(page, code).getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page.getByText(`ฉบับที่ ${version}`)).toBeVisible()
  if (code === 'คบ.6') {
    const field = page.getByRole('textbox', { name: /2\.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย/ })
    await field.fill(`${await field.inputValue()} ${appendText}`.trim())
    for (const [label, value] of [['1.1 ได้รับคำร้อง', OFFICER], ['2.2 ชื่อ-สกุล พยาน', WITNESS]]) {
      const input = page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
      if (!(await input.inputValue())) await input.fill(value)
    }
  }
  await page.getByRole('button', { name: `บันทึกแบบ ${code}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/** ขาขึ้น: ธุรการสำนัก/กอง ออกเลขส่ง (WIT0515) → ธุรการ สลธ. ลงเลขรับ (WIT0516) */
async function passUpLeg(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await expectStage(page, 'secretary_incoming_registry')
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await expectStage(page, 'deputy_review')
}

/** ขากลับ: ธุรการ สลธ. ออกเลขส่ง → ธุรการหน่วยลงเลขรับ แล้วกลับหน้าแฟ้ม (WIT0520 / WIT0714) */
async function passDownLeg(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await expect.poll(async () => (await caseOf(page))?.sarabanDispatch).toBeFalsy()
  await page.goto(DOSSIER_URL)
}

const SIGN = {
  supervisor: ['10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'kb6SupervisorSignedAt'],
  director: ['11', 'ความเห็นผู้อำนวยการสำนัก', 'kb6DirectorSignedAt'],
  deputy_secretary: ['12', 'ความเห็นรองเลขาธิการฯ', 'kb6DeputySignedAt'],
  secretary: ['13', 'ความเห็นเลขาธิการฯ', 'kb6SecretarySignedAt'],
} as const

/** ลงนามความเห็นของบทบาทนั้นถ้ายังไม่เคยลงนาม (รอบ Revision ลายมือชื่อบางข้อค้างอยู่) */
async function signIfNeeded(page: Page, role: keyof typeof SIGN) {
  const [no, label, field] = SIGN[role]
  await page.goto(DOSSIER_URL)
  if (!(await caseOf(page))?.[field]) await signKb6(page, no, label)
}

/* ====================================================================================
 * แท็บ 05
 * ==================================================================================== */
test.describe('แท็บ 05 · เส้นทางปกติ กลั่นกรอง คบ.6', () => {
  test('T05-A · WIT0501 → 0502 → 0503: เจ้าหน้าที่บันทึก คบ.6 แล้วส่งชุดเสนอให้ ผบช.ชั้นต้น (ไม่มีรายการแจ้งเตือน)', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.3', 'officer', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0501 · แฟ้มกรณีปกติยังส่งไม่ได้จนกว่าจะเชื่อมโยงคดี ประเมินความเร่งด่วน และบันทึก คบ.6', async () => {
      await linkMainCaseAsOfficer(page)
      await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()
      expect((await caseOf(page))?.urgency).toBe('normal')
      await expect(formRow(page, 'คบ.6')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
    })

    await snap(page, 'node:05:WIT0501', { label: 'เจ้าหน้าที่เลือกกรณีปกติแล้ว ยังไม่บันทึก คบ.6 (ปุ่มส่งผู้บังคับบัญชาถูกล็อก)' })

    await test.step('WIT0502 · บันทึก คบ.6 แล้วกด “ส่งผู้บังคับบัญชาชั้นต้น →” > ยืนยันส่งต่อ', async () => {
      await prepareKb6(page)
      const notificationsBefore = await notificationCount(page)
      await snap(page, ['node:05:WIT0502', 'edge:05:E0501'], { label: 'เจ้าหน้าที่บันทึก คบ.6 แล้ว พร้อมกดส่งผู้บังคับบัญชาชั้นต้น' })
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      const c = await caseOf(page)
      expect(c?.owner).toBe(SUPERVISOR)
      expect(c?.kb6SupervisorSignedAt).toBeFalsy()
      // ร่าง คบ.9 / คบ.10 อยู่ในแฟ้มเดียวกัน (prepareResultNotices) และ forwardCase ไม่สร้างรายการแจ้งเตือน
      expect(c?.resultNotices).toBeTruthy()
      expect(await notificationCount(page)).toBe(notificationsBefore)
    })

    await test.step('WIT0503 · ผบช.ชั้นต้นเห็นแฟ้มและ คบ.1 / คบ.3 / คบ.6 ในรายการ', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(DOSSIER_URL)
      for (const code of ['คบ.1', 'คบ.3', 'คบ.6']) await expect(formRow(page, code)).toBeVisible()
      await snap(page, ['node:05:WIT0503', 'edge:05:E0502', 'edge:05:E0503', 'node:05:WIT0504'], { label: 'ผบช.ชั้นต้นรับชุดเสนอ คบ.1/3/6 เข้าคิว รอตรวจความครบถ้วน' })
    })
  })

  test('T05-B · WIT0503 → 0504 ครบ → 0507 → 0508: ผบช.ชั้นต้นลงนามข้อ 10 แล้วเสนอ ผอ.', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0503 / WIT0504 · ตรวจเอกสารครบ — ยังส่งไม่ได้จนกว่าจะลงนามข้อ 10', async () => {
      for (const code of ['คบ.1', 'คบ.3', 'คบ.6']) await expect(formRow(page, code)).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await expect(page.getByTestId('return-case-button')).toBeVisible()
    })

    await test.step('WIT0507 · ลงนามข้อ 10 ใน /form/6 แล้วเสนอ ผอ.สำนัก/กอง', async () => {
      await signKb6(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', () =>
        snap(page, ['node:05:WIT0507', 'edge:05:E0507'], { label: 'ผบช.ชั้นต้นตรวจแล้วครบ เปิด คบ.6 ข้อ 10 เตรียมลงนาม' }))
      expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeTruthy()
      await forwardTo(page, 'director_review', 'ผอ.สำนัก/กอง')
      expect((await caseOf(page))?.owner).toBe(DIRECTOR)
    })

    await test.step('WIT0508 · ผอ. เห็นชุดเสนอและสถานะ “ผบช.ชั้นต้นลงนามแล้ว”', async () => {
      await switchRole(page, 'director')
      await page.goto(DOSSIER_URL)
      await expect(formRow(page, 'คบ.6')).toBeVisible()
      await expect(page.getByText(/ผบช.ชั้นต้นลงนามแล้ว/).first()).toBeVisible()
      await snap(page, ['node:05:WIT0508', 'edge:05:E0508', 'edge:05:E0509', 'node:05:WIT0509'], { label: 'ผอ.สำนัก/กอง รับชุดเสนอที่ ผบช.ชั้นต้นลงนามข้อ 10 แล้ว รอตรวจ/พิจารณา' })
    })
  })

  test('T05-C · WIT0504 ไม่ครบ → 0505 → 0506 → 0503: ผบช.ชั้นต้นตีกลับ เจ้าหน้าที่แก้ฉบับใหม่ ส่งตรวจใหม่', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.4', 'supervisor', { ...KB1_DONE, kb3Skipped: false })
    await page.goto(DOSSIER_URL)

    await test.step('WIT0505 · ต้องระบุรายละเอียดข้อสั่งการก่อนตีกลับ แล้วตีกลับเจ้าหน้าที่', async () => {
      await page.getByTestId('return-case-button').click()
      await page.getByTestId('return-issue-select').selectOption('evidence_missing')
      await page.getByTestId('return-confirm-button').click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
      expect((await caseOf(page))?.stage).toBe('supervisor_review')
      await snap(page, ['node:05:WIT0505', 'edge:05:E0504'], { label: 'ผบช.ชั้นต้นตรวจพบเอกสารไม่ครบ กำลังบันทึกเหตุผลเพื่อส่งกลับ' })
      await returnFromDossier(page, 'evidence_missing', 'ขาดหลักฐานการข่มขู่ ให้แนบและแก้ คบ.3 / คบ.6')
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(c?.returned).toBe(true)
      expect(c?.returnedByRole).toBe('supervisor')
      expect((await historyOf(page)).at(-1)?.detail).toContain('ขาดหลักฐานการข่มขู่')
    })

    await switchRole(page, 'officer')
    await snap(page, ['node:05:WIT0506', 'edge:05:E0505'], { label: 'เจ้าหน้าที่ได้รับแฟ้มที่ ผบช.ชั้นต้นส่งกลับแก้ไข' })

    await test.step('WIT0506 · แก้ คบ.3 / คบ.6 เป็นฉบับที่ 2 แล้วส่ง ผบช.ชั้นต้นอีกครั้ง (กลับ WIT0503)', async () => {
      await reviseForm(page, 'คบ.3', 2, '')
      await reviseForm(page, 'คบ.6', 2, 'แนบหลักฐานการข่มขู่เพิ่มเติมแล้ว')
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      const c = await caseOf(page)
      expect(c?.owner).toBe(SUPERVISOR)
      expect(c?.returned).toBe(false)
      await snap(page, 'edge:05:E0506', { label: 'เจ้าหน้าที่แก้เป็นฉบับใหม่แล้วส่งตรวจใหม่ ผบช.ชั้นต้นรับอีกครั้ง', role: 'supervisor', route: DOSSIER_URL })
    })
  })

  test('T05-D · WIT0503 → 0522: ผบช.ชั้นต้นแก้ผลประเมินเป็นเร่งด่วน ระบบตัดเข้า ผอ. (ไปแท็บ 06)', async ({ page }) => {
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    await expect(page.getByText('ทบทวนผลการประเมินความเร่งด่วน', { exact: false })).toBeVisible()
    await snap(page, 'node:05:WIT0522', { label: 'ผบช.ชั้นต้นเปิดแฟ้มกรณีปกติ ก่อนแก้ผลประเมินเป็นเร่งด่วน' })
    await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
    await page.getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...').fill('เกิดเหตุข่มขู่เพิ่มเติมหลังส่งเรื่องเข้าเส้นทางปกติ')
    await page.getByRole('button', { name: 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)' }).click()

    const c = await caseOf(page)
    expect(c?.urgency).toBe('urgent')
    expect(c?.stage).toBe('director_review')
    expect(c?.owner).toBe(DIRECTOR)
    expect(c?.fastTracked).toBe(true)
    expect((await historyOf(page)).some((h) => (h.detail || '').includes('เปลี่ยนเส้นทางจากปกติเป็นเร่งด่วน'))).toBe(true)

    await switchRole(page, 'director')
    await expect(page.getByTestId('fast-track-decision-required-banner')).toContainText('ยังไม่มี คบ.4 / ร่าง คบ.5')
    await snap(page, ['edge:05:E0525', 'overview:05>06'], { label: 'ระบบตัดเข้าเส้นทางเร่งด่วน ผอ.สำนัก/กอง เห็นว่ายังไม่มี คบ.4 ต้องส่งกลับให้จัดทำ' })
  })

  test('T05-E · WIT0508 → 0509 เห็นชอบ → 0512 → 0513 → 0515 → 0516: ผอ. ลงนามข้อ 11 ผ่านธุรการ ถึงรองเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0508 / WIT0509 · ผอ. ตรวจแล้วเห็นชอบ — ลงนามข้อ 11 (WIT0512)', async () => {
      await expect(formRow(page, 'คบ.6')).toBeVisible()
      await expect(page.getByTestId('return-case-button')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก', () =>
        snap(page, ['node:05:WIT0512', 'edge:05:E0513'], { label: 'ผอ. เห็นชอบ เปิด คบ.6 ข้อ 11 เตรียมลงนาม' }))
      expect((await caseOf(page))?.kb6DirectorSignedAt).toBeTruthy()
    })

    await test.step('WIT0513 · ความเห็นข้อ 10–11 ถูกล็อก และ Audit Log บันทึกการลงนาม', async () => {
      await page.goto(`/form/6?caseNo=${CASE_NO}`)
      await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toBeDisabled()
      await expect(areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')).toBeDisabled()
      await snap(page, ['node:05:WIT0513', 'edge:05:E0514'], { label: 'ผอ. ลงนามข้อ 11 แล้ว ระบบล็อกความเห็นข้อ 10–11 (หน้า คบ.6)' })
      await page.goto(DOSSIER_URL)
      expect((await historyOf(page)).some((h) => (h.action || '').includes('ผอ.สำนัก/กอง ลงนามความเห็นใน คบ.6'))).toBe(true)
    })

    await test.step('WIT0512 · ปุ่มส่งต่อของ ผอ. คือ “ส่งธุรการสำนัก/กอง ออกเลขทะเบียนส่ง →” (ไม่ใช่รองเลขาธิการฯ ตรง)', async () => {
      await expect(page.getByTestId('forward-case-button')).toContainText('ธุรการสำนัก/กอง')
      await forwardTo(page, 'director_outgoing_registry', 'ธุรการสำนัก/กอง')
      expect((await caseOf(page))?.sarabanRound).toBe(1)
    })

    await test.step('WIT0515 · ธุรการสำนัก/กอง ลงเลขส่ง คบ.1/3/6 ครบแล้วส่ง สลธ.', async () => {
      await snap(page, ['node:05:WIT0515', 'edge:05:E0515'], { label: 'แฟ้มเข้าคิวธุรการสำนัก/กอง รอลงเลขทะเบียนส่ง', role: 'receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await expectStage(page, 'secretary_incoming_registry')
      const records = ((await caseOf(page))?.sarabanRecords ?? []) as Array<{ checkpoint: string; formNo: number; forms?: number[] }>
      for (const n of [1, 3, 6]) expect(records.some((r) => r.checkpoint === 'director_outgoing' && (r.forms ?? [r.formNo]).includes(n))).toBe(true)
    })

    await test.step('WIT0516 · ธุรการ สลธ. ลงเลขรับครบ แฟ้มถึงรองเลขาธิการฯ พร้อมรายการแจ้งเตือน', async () => {
      await snap(page, ['node:05:WIT0516', 'edge:05:E0516'], { label: 'ธุรการสำนัก/กอง ส่งแล้ว แฟ้มเข้าคิวธุรการ สลธ. รอลงเลขทะเบียนรับ', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await expectStage(page, 'deputy_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DEPUTY)
      expect(c?.deputyReviewState).toBe('pending')
      await snap(page, 'edge:05:E0517', { label: 'ธุรการ สลธ. ลงเลขรับแล้ว แฟ้มถึงรองเลขาธิการฯ', role: 'deputy_secretary', route: DOSSIER_URL })
      expect((await notificationsOf(page)).some((n) => (n.message || '').includes('รอรองเลขาธิการ ป.ป.ท. กลั่นกรอง'))).toBe(true)
    })
  })

  test('T05-F · WIT0509 ไม่เห็นชอบ → 0510 → 0511 → 0508: ผอ. ส่งกลับตรงเจ้าหน้าที่ แก้แล้วส่งกลับ ผอ. โดยตรง', async ({ page }) => {
    await seedMockState(page, 'Case 1.5', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0510 · ตีกลับตรงเจ้าหน้าที่ ข้าม ผบช.ชั้นต้น และแจ้ง ผบช.ชั้นต้นให้ทราบในประวัติ', async () => {
      await snap(page, ['node:05:WIT0510', 'edge:05:E0510'], { label: 'ผอ. ไม่เห็นชอบ/เอกสารไม่ครบ กำลังบันทึกเหตุผลส่งกลับตรงเจ้าหน้าที่' })
      await returnFromDossier(page, 'fact_discrepancy', 'ข้อเท็จจริงใน คบ.3 และ คบ.6 ขัดแย้งกัน ให้ตรวจสอบและแก้เป็นฉบับใหม่')
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(c?.directorReturn).toBe(true)
      expect(c?.returnedByRole).toBe('director')
      expect((await historyOf(page)).some((h) => h.action === 'แจ้งผู้บังคับบัญชาชั้นต้นทราบ')).toBe(true)
    })

    await switchRole(page, 'officer')
    await snap(page, ['node:05:WIT0511', 'edge:05:E0511'], { label: 'เจ้าหน้าที่ได้รับแฟ้มที่ ผอ. ส่งกลับตรง (ข้าม ผบช.ชั้นต้น)' })

    await test.step('WIT0511 · เจ้าหน้าที่เห็นแบนเนอร์ แก้แล้วส่งกลับขึ้น ผอ. โดยตรง', async () => {
      await expect(page.getByTestId('director-rework-banner')).toContainText('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expect(page.getByTestId('forward-case-button')).toContainText('เสนอ ผอ.สำนัก/กอง')
      await forwardTo(page, 'director_review', 'เสนอ ผอ.สำนัก/กอง')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.directorReturn).toBe(false)
      expect((await historyOf(page)).at(-1)?.detail).toContain('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await snap(page, 'edge:05:E0512', { label: 'เจ้าหน้าที่แก้แล้วส่งกลับ ผอ. โดยตรง ผอ. ตรวจใหม่', role: 'director', route: DOSSIER_URL })
    })
  })

  test('T05-G · WIT0517 ครบ → 0518 → 0514: รองเลขาธิการฯ ลงนามข้อ 12 และเสนอเลขาธิการฯ (ส่งตรง ไม่ผ่านธุรการ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0517 · รองเลขาธิการฯ เห็นปุ่มตีกลับ และส่งต่อไม่ได้จนกว่าจะลงนามข้อ 12', async () => {
      await snap(page, 'node:05:WIT0517', { label: 'รองเลขาธิการฯ รับชุดเสนอ คบ.1/3/6 รอตรวจ (ยังไม่ลงนามข้อ 12)' })
      expect((await caseOf(page))?.stage).toBe('deputy_review')
      await expect(page.getByTestId('return-case-button')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    })

    await test.step('WIT0518 · ลงนามข้อ 12 แล้วเสนอเลขาธิการ ป.ป.ท.', async () => {
      await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ', () =>
        snap(page, ['node:05:WIT0518', 'edge:05:E0518'], { label: 'รองเลขาธิการฯ ตรวจครบ เปิด คบ.6 ข้อ 12 เตรียมลงนาม' }))
      expect((await caseOf(page))?.kb6DeputySignedAt).toBeTruthy()
      await expect(page.getByTestId('forward-case-button')).toContainText('เสนอเลขาธิการ')
      await forwardTo(page, 'external_pending', 'เลขาธิการ')
    })

    await test.step('WIT0514 · แฟ้มทั้งชุดไปที่เลขาธิการฯ (เริ่มแท็บ 07) โดยไม่มีชุดนำส่งธุรการค้าง', async () => {
      const c = await caseOf(page)
      expect(c?.sarabanDispatch).toBeFalsy()
      expect(c?.secretaryReviewState).toBe('pending')
      await switchRole(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('secretary-decision-card')).toBeVisible()
      await snap(page, ['node:05:WIT0514', 'edge:05:E0524', 'overview:05>07'], { label: 'รองเลขาธิการฯ เสนอเลขาธิการฯ แล้ว เลขาธิการฯ เห็นการ์ดสั่งการ (เริ่มแท็บ 07)' })
    })
  })

  test('T05-H · WIT0517 ไม่ครบ → 0519 → 0520 → 0521 → 0515: รองเลขาธิการฯ ส่งกลับ ผอ. ผ่านธุรการ ผอ. ลงนามใหม่ส่งธุรการอีกรอบ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0519 · ส่งกลับประเด็น “ความเห็น ผอ. ไม่ชัดเจน” — ปลายทาง ผอ. และเปิดชุดนำส่งขากลับ', async () => {
      await snap(page, ['node:05:WIT0519', 'edge:05:E0519'], { label: 'รองเลขาธิการฯ ตรวจพบความเห็นข้อ 11 ไม่ชัดเจน กำลังบันทึกเหตุผลส่งกลับ' })
      await returnFromDossier(page, 'director_opinion_unclear', 'ความเห็นข้อ 11 ของ ผอ. ยังไม่ระบุเหตุผลประกอบระดับภัย ให้ทบทวนและเสนอใหม่')
      await expectStage(page, 'director_review')
      const c = await caseOf(page)
      expect(c?.returnedByRole).toBe('deputy_secretary')
      expect(c?.directorReturn).not.toBe(true)
      expect((c?.sarabanDispatch as Rec | undefined)?.flow).toBe('decision')
      expect(c?.kb6DirectorSignedAt).toBeFalsy()
    })

    await test.step('WIT0520 · ธุรการ สลธ. → ธุรการสำนัก/กอง ลงทะเบียนครบ แฟ้มถึง ผอ.', async () => {
      await snap(page, ['node:05:WIT0520', 'edge:05:E0520'], { label: 'รองเลขาธิการฯ ส่งกลับ ชุดนำส่งขากลับรอธุรการ สลธ. ออกเลขส่ง', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passDownLeg(page)
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.returned).toBe(true)
    })

    await switchRole(page, 'director')
    await snap(page, ['node:05:WIT0521', 'edge:05:E0521'], { label: 'ธุรการขากลับลงทะเบียนครบ แฟ้มถึง ผอ. (ความเห็นข้อ 11 ไม่ชัดเจน)' })

    await test.step('WIT0521 · ผอ. ต้องลงนามข้อ 11 ใหม่จึงส่งต่อได้ แล้วส่งธุรการ (วนกลับ WIT0515)', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')
      expect((await caseOf(page))?.kb6DirectorSignedAt).toBeTruthy()
      await forwardTo(page, 'director_outgoing_registry', 'ธุรการสำนัก/กอง')
      expect((await caseOf(page))?.sarabanRound).toBeGreaterThan(1)
      await snap(page, 'edge:05:E0522', { label: 'ผอ. ลงนามข้อ 11 ใหม่แล้วส่งธุรการสำนัก/กอง รอบที่ 2', role: 'receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
    })
  })

  test('T05-I · WIT0517 ไม่ครบ → 0519 → 0520 → 0506 → 0503: รองเลขาธิการฯ ส่งกลับเจ้าหน้าที่ ผ่านธุรการ แก้ฉบับใหม่ ส่ง ผบช.ชั้นต้น', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0519 · ส่งกลับประเด็น “ชุดเสนอไม่ครบ” — ปลายทางเจ้าหน้าที่ ลายมือชื่อข้อ 10–12 ถูกล้าง', async () => {
      await returnFromDossier(page, 'kb6_attachment_incomplete', 'ชุดเสนอขาดเอกสารแนบ ให้เติมให้ครบและเสนอใหม่ตามลำดับชั้น')
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(c?.returnedByRole).toBe('deputy_secretary')
      expect([c?.kb6SupervisorSignedAt, c?.kb6DirectorSignedAt, c?.kb6DeputySignedAt].filter(Boolean)).toHaveLength(0)
    })

    await test.step('WIT0520 · ธุรการขากลับลงทะเบียนครบ แฟ้มถึงเจ้าหน้าที่', async () => {
      await passDownLeg(page)
      expect(OFFICER_OWNERS).toContain((await caseOf(page))?.owner)
    })

    await switchRole(page, 'officer')
    await snap(page, 'edge:05:E0523', { label: 'ธุรการขากลับลงทะเบียนครบ แฟ้มถึงเจ้าหน้าที่ (ประเด็นอื่นนอกจากความเห็น ผอ.)' })

    await test.step('WIT0506 → WIT0503 · เจ้าหน้าที่แก้ คบ.6 ฉบับที่ 2 แล้วส่ง ผบช.ชั้นต้น (ตามลำดับชั้น)', async () => {
      await reviseForm(page, 'คบ.6', 2, 'เติมเอกสารแนบครบแล้ว')
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      expect((await caseOf(page))?.owner).toBe(SUPERVISOR)
    })
  })
})

/* ====================================================================================
 * แท็บ 06
 * ==================================================================================== */

/** WIT0606 ◇ ข้อมูลครบ → เปิดแผงตัดสิน WIT0609 */
async function passReadinessGate(page: Page) {
  await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)
  await page.getByTestId('fast-track-ready-button').click()
  await confirmDialog(page, 'ยืนยันข้อมูลครบ', 'อนุมัติ / ไม่อนุมัติการคุ้มครองชั่วคราว')
  await expect(page.getByTestId('fast-track-decision-panel')).toBeVisible()
}

/** WIT0609 อนุมัติ → WIT0611 เลขคำสั่ง + ความเห็นข้อ 13 + ลงนาม คบ.5 */
async function approveAndSignKb5(page: Page, orderNo: string, opinion: string, beforeSign?: () => Promise<void>) {
  await page.getByTestId('fast-track-approve-button').click()
  await page.getByTestId('kb5-order-no').fill(orderNo)
  await page.getByTestId('kb5-director-opinion').fill(opinion)
  await beforeSign?.()
  await page.getByTestId('kb5-sign-button').click()
  await signInModal(page, DIRECTOR)
  await page.getByTestId('fast-track-approve-confirm').click()
  await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง', 'แก้ไขทับไม่ได้อีก')
  await expect.poll(async () => (await fastTrackOf(page)).step).toBe('approved')
}

test.describe('แท็บ 06 · เส้นทางเร่งด่วน คบ.4 / คบ.5', () => {
  test('T06-A · WIT0601 → 0602 → 0603 → 0604 → 0605 → 0606 ครบ → 0609 อนุมัติ → 0611 → 0612 → 0613 → 0614', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)
    await snap(page, ['node:06:WIT0601', 'edge:06:E0601', 'node:06:WIT0602'], { label: 'เจ้าหน้าที่เปิดแฟ้มเร่งด่วน การ์ด Fast Track ขั้นร่าง และรายการ คบ.4/คบ.5' })

    await test.step('WIT0601 / WIT0602 · การ์ด Fast Track ขั้นร่าง และรายการ คบ.4 / คบ.5 (ยังไม่มี คบ.6)', async () => {
      await expect(page.getByTestId('fast-track-submit-panel')).toHaveAttribute('data-fast-track-step', 'drafting')
      await expect(page.getByTestId('forward-case-button')).toHaveCount(0)
      expect((await caseOf(page))?.stage).toBe('staff_review')
      await expect(page.getByTestId('dossier-forms')).toContainText('คบ.4')
      await expect(page.getByTestId('dossier-forms')).toContainText('คบ.5')
      await expect(formRow(page, 'คบ.6')).toHaveCount(0)
    })

    await test.step('WIT0603 · ติ๊กวิธีข้อ 15 ใน คบ.4 ได้หลายวิธี — ก่อนติ๊กปุ่มส่ง ผอ. กดไม่ได้', async () => {
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await page.goto(KB4_FORM_URL)
      await snap(page, ['node:06:WIT0603', 'edge:06:E0602'], { label: 'เจ้าหน้าที่เปิดแบบ คบ.4 ก่อนเลือกวิธีคุ้มครองข้อ 15' })
      await page.getByTestId('kb4-method-option-1').click()
      await page.getByTestId('kb4-method-option-3').click()
      await fillKb5Period(page, CASE_NO)
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 1')
      await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 3')
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
      await snap(page, ['node:06:WIT0604', 'edge:06:E0603'], { label: 'เลือกวิธีใน คบ.4 แล้ว ปุ่มส่งตรง ผอ. กดได้' })
    })

    await test.step('WIT0604 · ส่งตรง ผอ. ไม่ผ่าน ผบช.ชั้นต้น (ไม่มีรายการแจ้งเตือน)', async () => {
      const notificationsBefore = await notificationCount(page)
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expectStage(page, 'director_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect((c?.fastTrack as Rec).proposedMethods).toEqual([1, 3])
      expect(await notificationCount(page)).toBe(notificationsBefore)
    })

    await switchRole(page, 'director')
    await snap(page, ['node:06:WIT0605', 'edge:06:E0604', 'edge:06:E0605', 'node:06:WIT0606'], { label: 'ผอ. รับ คบ.4 / ร่าง คบ.5 ที่ส่งตรง รอตรวจและยืนยันข้อมูลครบ' })

    await test.step('WIT0605 / WIT0606 · ผอ. ตรวจรายการ และผ่านประตู “ครบ — พร้อมพิจารณา”', async () => {
      await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
      await expect(page.getByTestId('fast-track-decision-required-banner')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await passReadinessGate(page)
      await snap(page, ['node:06:WIT0609', 'edge:06:E0609'], { label: 'ผอ. ยืนยันข้อมูลครบแล้ว แผงตัดสินอนุมัติ/ไม่อนุมัติเปิดอยู่' })
    })

    await test.step('WIT0609 / WIT0611 · อนุมัติ ลงนาม คบ.5 ฉบับลงนามถูกล็อก', async () => {
      await approveAndSignKb5(page, '045/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1 และ 3 ทันที', () =>
        snap(page, ['node:06:WIT0611', 'edge:06:E0611'], { label: 'ผอ. เลือกอนุมัติ กรอกเลขคำสั่งและความเห็นข้อ 13 เตรียมลงนาม คบ.5' }))
      const c = await caseOf(page)
      expect(c?.kb5Approved).toBe(true)
      expect(c?.temporaryDeniedAt).toBeFalsy()
      // หลังตัดสิน แฟ้มกลับเจ้าหน้าที่ทันที (staff_review)
      expect(c?.stage).toBe('staff_review')
      await page.goto(`/form/5?caseNo=${CASE_NO}`)
      await expect(page.getByText('ฉบับลงนามถูกล็อก — แก้ทับไม่ได้')).toBeVisible()
    })

    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)
    await snap(page, ['node:06:WIT0612', 'edge:06:E0612'], { label: 'ผอ. ลงนาม คบ.5 แล้ว พยานรอรับทราบและลงนามยินยอม' })

    await test.step('WIT0612 / WIT0613 · พยานลงนามยินยอม → เปิดเส้นทางวิธี 1 และ 3 ที่ /protection-methods', async () => {
      expect(((await caseOf(page))?.approvedMethods ?? []) as unknown[]).toEqual([])
      await page.getByTestId('kb5-witness-ack-button').click()
      await signInModal(page, WITNESS)
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('active')
      const c = await caseOf(page)
      expect(c?.approvedMethods).toEqual([1, 3])
      await page.goto('/protection-methods')
      // หน้า /protection-methods ปัจจุบันเป็นตารางงาน (ไม่มีลิงก์ /protection-method/<วิธี> ต่อเคสแล้ว) — แถวของเคสต้องแสดงวิธี 1 และ 3 และมีปุ่มเปิดงาน
      const methodRow = page.locator('tbody tr').filter({ hasText: CASE_NO })
      await expect(methodRow).toHaveCount(1)
      await expect(methodRow).toContainText('วิธีที่ 1, วิธีที่ 3')
      await expect(methodRow).not.toContainText('รอเปิดเส้นทาง')
      await expect(methodRow.getByRole('link', { name: 'เปิดงาน' })).toBeVisible()
      await snap(page, ['node:06:WIT0613', 'edge:06:E0613', 'overview:06>08A'], { label: 'พยานลงนามยินยอมแล้ว คบ.5 พร้อมดำเนินการ เปิดเส้นทางวิธีคุ้มครอง (ไปแท็บ 08A)' })
    })

    await test.step('WIT0614 · คำร้องหลักเดินต่อ: ต้องบันทึก คบ.6 ก่อน แล้วเข้า ผบช.ชั้นต้น (แท็บ 05)', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('คำร้องหลักยังเดินต่อ')
      await snap(page, ['node:06:WIT0614', 'edge:06:E0615'], { label: 'คบ.5 มีผลแล้ว คำร้องหลักยังเดินต่อ ต้องบันทึก คบ.6 ก่อนเสนอ ผบช.ชั้นต้น' })
      expect((await caseOf(page))?.stage).toBe('staff_review')
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await prepareKb6(page)
      await forwardTo(page, 'supervisor_review')
      expect((await caseOf(page))?.owner).toBe(SUPERVISOR)
      expect((await caseOf(page))?.kb10Signed).toBeFalsy()
      await snap(page, 'overview:06>05', { label: 'เสนอคำร้องหลักเข้า ผบช.ชั้นต้น (เริ่มเส้นทางปกติ แท็บ 05)', role: 'supervisor', route: DOSSIER_URL })
    })
  })

  test('T06-B · WIT0609 ไม่อนุมัติ → 0610 → 0614: คำร้องหลักไม่ปิด ไม่ออก คบ.10 ส่ง คบ.6 ผ่าน ผบช.ชั้นต้น', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 3.1', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0605 / WIT0606 · ผ่านประตูข้อมูลครบ', async () => {
      await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
      await passReadinessGate(page)
    })

    await test.step('WIT0609 → WIT0610 · ไม่อนุมัติ: ยกเลิกก่อน (ไม่มีผล) แล้วยืนยันสองชั้น', async () => {
      await page.getByTestId('fast-track-deny-button').click()
      await page.getByTestId('fast-track-deny-reason').fill('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์')
      await snap(page, ['node:06:WIT0610', 'edge:06:E0610'], { label: 'ผอ. เลือกไม่อนุมัติ กรอกเหตุผลแล้ว ก่อนกดยืนยัน' })
      await page.getByTestId('fast-track-deny-confirm').click()
      await cancelDialog(page)
      expect((await caseOf(page))?.temporaryDeniedAt).toBeFalsy()
      await page.getByTestId('fast-track-deny-confirm').click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว', 'ไม่ออก คบ.10')
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('denied')
      const c = await caseOf(page)
      expect(c?.kb5Approved).toBe(false)
      expect(c?.activity7State).toBeFalsy()
      expect(c?.kb10Signed).toBeFalsy()
      expect(c?.closedAt).toBeFalsy()
      expect((c?.extraForms ?? []) as number[]).not.toContain(10)
    })

    await test.step('WIT0614 · แฟ้มกลับเจ้าหน้าที่ staff_review', async () => {
      const c = await caseOf(page)
      expect(c?.stage).toBe('staff_review')
      expect(OFFICER_OWNERS).toContain(c?.owner)
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('ไม่ออก คบ.10')
      await snap(page, 'edge:06:E0614', { label: 'ไม่อนุมัติชั่วคราวแล้ว แฟ้มกลับเจ้าหน้าที่ เดินคำร้องหลักต่อ', role: 'officer', route: DOSSIER_URL })
    })

    await switchRole(page, 'officer')

    await test.step('WIT0614 (ต่อ) · เจ้าหน้าที่ทำ คบ.6 แล้วเสนอเข้า ผบช.ชั้นต้น (แท็บ 05 WIT0502)', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await prepareKb6(page)
      await forwardTo(page, 'supervisor_review')
      expect((await caseOf(page))?.owner).toBe(SUPERVISOR)
    })
  })

  test('T06-C · WIT0606 ไม่ครบ → 0607 → 0608 → 0605 → 0606 → 0609 อนุมัติ: ตีกลับตรงเจ้าหน้าที่ แก้แล้วส่งใหม่', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 3.1', 'director', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0606 → WIT0607 · ไม่ครบ — ส่งกลับตรงเจ้าหน้าที่ ไม่ผ่าน ผบช.ชั้นต้น', async () => {
      await page.getByTestId('return-case-button').click()
      await page.getByTestId('return-issue-select').selectOption('kb5_draft_incomplete')
      await page.getByTestId('return-note-input').fill('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงานและช่วงเวลาคุ้มครอง ให้เติมให้ครบแล้วเสนอใหม่')
      await snap(page, ['node:06:WIT0607', 'edge:06:E0606'], { label: 'ผอ. ตรวจพบข้อมูลไม่ครบ กรอกเหตุผลส่งกลับ ก่อนกดยืนยัน' })
      await page.getByTestId('return-confirm-button').click()
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(c?.directorReturn).toBe(true)
      expect((c?.fastTrack as Rec).step).toBe('returned')
      expect((c?.fastTrack as Rec).readinessCheckedAt).toBeFalsy()
    })

    await switchRole(page, 'officer')

    await test.step('WIT0608 · เจ้าหน้าที่แก้แล้วส่ง ผอ. ตรวจใหม่ (วนกลับ WIT0605)', async () => {
      await expect(page.getByTestId('fast-track-return-banner')).toContainText('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงาน')
      await snap(page, ['node:06:WIT0608', 'edge:06:E0607'], { label: 'เจ้าหน้าที่ได้รับแฟ้มที่ ผอ. ส่งกลับแก้ไข คบ.4/ร่าง คบ.5' })
      // ข้อมูลตั้งต้น Case 3.1 ยังไม่มีช่วงวันที่ในร่าง คบ.5 — เติมให้ครบก่อนส่งใหม่ (WIT0603)
      await fillKb5Period(page, CASE_NO)
      await page.goto(DOSSIER_URL)
      await page.getByTestId('fast-track-submit-note').fill('เติมชุดเจ้าพนักงานและช่วงเวลาคุ้มครองในร่าง คบ.5 ครบแล้ว')
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรวจใหม่', 'ส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง')
      await expectStage(page, 'director_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect((c?.fastTrack as Rec).step).toBe('director_review')
      expect((c?.fastTrack as Rec).returnRound).toBe(1)
      await snap(page, 'edge:06:E0608', { label: 'เจ้าหน้าที่แก้แล้วส่ง ผอ. ตรวจใหม่ (รอบที่ 2)', role: 'director', route: DOSSIER_URL })
    })

    await switchRole(page, 'director')

    await test.step('WIT0605 / WIT0606 / WIT0609 · ผ่านประตูอีกรอบแล้วอนุมัติ', async () => {
      await passReadinessGate(page)
      await approveAndSignKb5(page, '050/2569', 'เห็นชอบหลังแก้ไขร่าง คบ.5 ครบถ้วนแล้ว')
      expect((await caseOf(page))?.kb5Approved).toBe(true)
    })
  })

  test('T06-D · แท็บ 05 WIT0522 → WIT0615 → 0603 → 0604: ผอ. รับแฟ้มที่ถูกตัดเข้าเร่งด่วนกลางทาง ส่งกลับตรงให้เจ้าหน้าที่จัดทำ คบ.4', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.4', 'supervisor')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0522 · ผบช.ชั้นต้นแก้ผลประเมินเป็นเร่งด่วน', async () => {
      await page.getByRole('button', { name: 'แก้ไขผลการประเมิน' }).click()
      await page.getByRole('button', { name: 'กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)' }).click()
      await expectStage(page, 'director_review')
    })

    await switchRole(page, 'director')

    await test.step('WIT0615 · ผอ. ยังไม่มี คบ.4 ให้ตัดสิน และส่งต่อไม่ได้ → ส่งกลับตรงเจ้าหน้าที่', async () => {
      await expect(page.getByTestId('fast-track-card')).toHaveCount(0)
      await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)
      await expect(page.getByTestId('fast-track-decision-required-banner')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await snap(page, 'node:06:WIT0615', { label: 'ผอ. รับแฟ้มที่ถูกตัดเข้าเร่งด่วนกลางทาง ยังไม่มี คบ.4 (ส่งต่อไม่ได้)' })
      await returnFromDossier(page, 'urgent_condition_unmet', 'ให้จัดทำ คบ.4 และร่าง คบ.5 เสนอก่อน จึงจะพิจารณาคุ้มครองชั่วคราวได้')
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(c?.directorReturn).toBe(true)
    })

    await switchRole(page, 'officer')
    await snap(page, 'edge:06:E0616', { label: 'ผอ. ส่งกลับตรง เจ้าหน้าที่รับแฟ้มเพื่อจัดทำ คบ.4' })

    await test.step('WIT0603 → WIT0604 · เจ้าหน้าที่ติ๊กวิธีใน คบ.4 แล้วส่งตรง ผอ. (เข้าขั้น director_review ของแท็บ 06)', async () => {
      await page.goto(KB4_FORM_URL)
      await page.getByTestId('kb4-method-option-1').click()
      await fillKb5Period(page, CASE_NO)
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expectStage(page, 'director_review')
      expect((await fastTrackOf(page)).step).toBe('director_review')
      expect((await caseOf(page))?.directorReturn).toBe(false)
    })
  })
})

/* ====================================================================================
 * แท็บ 07
 * ==================================================================================== */
test.describe('แท็บ 07 · รับและบันทึกผลการพิจารณา', () => {
  test('T07-A · WIT0701 → 0704: ปุ่มอนุมัติ/ไม่อนุมัติถูกล็อกจนเลขาธิการฯ ลงนามข้อ 13 (ส่งกลับกดได้เสมอ)', async ({ page }) => {
    await seedMockState(page, 'Case 1.7', 'secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await expect(page.getByTestId('secretary-decision-card')).toBeVisible()
    await snap(page, 'node:07:WIT0701', { label: 'แฟ้มถึงเลขาธิการฯ รอสั่งการ (ปุ่มอนุมัติ/ไม่อนุมัติถูกล็อก ยังไม่ลงนามข้อ 13)' })
    await expect(page.getByTestId('approve-case-button')).toBeDisabled()
    await expect(page.getByTestId('reject-case-button')).toBeDisabled()
    await expect(page.getByTestId('refer-article14-button')).toHaveCount(0)
    await expect(page.getByTestId('secretary-return-button')).toBeEnabled()

    await signKb6(page, '13', 'ความเห็นเลขาธิการฯ')
    expect((await caseOf(page))?.kb6SecretarySignedAt).toBeTruthy()
    await snap(page, ['node:07:WIT0704', 'edge:07:E0701'], { label: 'เลขาธิการฯ ลงนามความเห็นข้อ 13 แล้ว เลือกสั่งการได้', route: DOSSIER_URL })
    for (const id of ['approve-case-button', 'reject-case-button']) {
      await expect(page.getByTestId(id)).toBeEnabled()
    }
  })

  test('T07-B · WIT0704 อนุมัติ → 0702 → 0703 → 0705 (เจ้าของสำนวนเดิม) → 0715 → 0710', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Notice 1', 'secretary')
    await page.goto(DOSSIER_URL)

    await snap(page, ['node:07:WIT0702', 'edge:07:E0702'], { label: 'เลขาธิการฯ เลือกอนุมัติ — เปิดการ์ดสั่งการ ก่อนเลือกผลเบื้องต้น' })

    await test.step('WIT0704 / WIT0702 · กด “อนุมัติคุ้มครอง” เปิดหน้า /form/9 เป็นร่าง ยังไม่ลงนามหรือส่งงาน', async () => {
      const notificationsBefore = await notificationCount(page)
      await choosePreliminaryOutcome(page, 9)
      const c = await caseOf(page)
      expect(c?.activity7State).not.toBe('approved')
      expect(c?.kb9Signed).toBeFalsy()
      expect(await notificationCount(page)).toBe(notificationsBefore)
      await expect(page.getByTestId('notice-decision-status')).toContainText('ร่าง')
      await snap(page, ['node:07:WIT0703', 'edge:07:E0703'], { label: 'เปิดหน้า คบ.9 เป็นร่าง รอตรวจหนังสือ A4 และยืนยันผลจริง' })
    })

    await test.step('WIT0703 / WIT0705 · เลือกเจ้าของสำนวนเดิม ยืนยันอนุมัติและลงนาม คบ.9', async () => {
      await fillDecisionWorkspace(page, 'original_owner')
      await snap(page, ['node:07:WIT0705', 'edge:07:E0704'], { label: 'เลือกเจ้าของสำนวนเดิมแล้ว รอยืนยันอนุมัติและลงนาม คบ.9' })
      await confirmInlineDecision(page)
      await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('approved')
      const c = await caseOf(page)
      expect(c?.kb9Signed).toBe(true)
      expect(c?.kb10Signed).toBeFalsy()
      expect(c?.stage).toBe('notice')
      expect((await handoffOf(page)).destination).toBe('original_owner')
      expect((await handoffOf(page)).step).toBe('pending_outgoing')
      await snap(page, ['node:07:WIT0715', 'edge:07:E0711'], { label: 'เลขาธิการฯ อนุมัติ/ลงนาม คบ.9 แล้ว ชุดนำส่งรอธุรการ สลธ. ออกเลขส่ง', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
    })

    await test.step('WIT0715 · ธุรการ สลธ. ออกเลขส่ง → ธุรการหน่วยปลายทางลงเลขรับ', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_receipt')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await expect.poll(async () => (await handoffOf(page)).step).toBe('accepted')
      const records = ((await caseOf(page))?.sarabanRecords ?? []) as Array<{ checkpoint: string; formNo: number; forms?: number[] }>
      for (const n of [1, 3, 6, 9]) {
        expect(records.some((r) => r.checkpoint === 'secretary_outgoing' && (r.forms ?? [r.formNo]).includes(n))).toBe(true)
        expect(records.some((r) => r.checkpoint === 'destination_incoming' && (r.forms ?? [r.formNo]).includes(n))).toBe(true)
      }
    })

    await test.step('WIT0710 · เจ้าของสำนวนเดิมรับงานแล้ว เห็นการ์ดผู้รับผิดชอบหลังอนุมัติ (ไปต่อแท็บ 08A)', async () => {
      expect(OFFICER_OWNERS).toContain((await caseOf(page))?.owner)
      await switchRole(page, 'officer')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('protection-handoff-card')).toContainText('ดำเนินงานโดยเจ้าของสำนวนเดิม')
      await expect(page.getByTestId('handoff-status')).toContainText('ส่งงานให้เจ้าของสำนวนเดิม')
      await snap(page, ['node:07:WIT0710', 'edge:07:E0712', 'overview:07>08A'], { label: 'ธุรการลงทะเบียนครบ เจ้าของสำนวนเดิมรับงาน เห็นการ์ดผู้รับผิดชอบหลังอนุมัติ' })
    })
  })

  test('T07-C · WIT0704 อนุมัติ → 0702 → 0703 → 0705 (กอท.) → 0715: ธุรการ สลธ. ส่งต่อธุรการคดี กอท. (ต่อที่แท็บ 07G)', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Notice 1', 'secretary')
    await page.goto(DOSSIER_URL)

    await choosePreliminaryOutcome(page, 9)
    await fillDecisionWorkspace(page, 'got')
    await confirmInlineDecision(page)
    await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_outgoing')
    expect((await handoffOf(page)).destination).toBe('got')

    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
    await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_receipt')
    // ยังไม่ถึงเจ้าของสำนวนเดิม — คิวเจ้าหน้าที่ไม่มีแฟ้มนี้
    await switchRole(page, 'officer')
    await page.goto('/queue/officer')
    await expect(page.getByRole('row', { name: new RegExp(CASE_NO) })).toHaveCount(0)
  })

  test('T07-D · WIT0704 ไม่อนุมัติ → 0702 → 0703 → 0706 → 0716 → 0711: ลงนาม คบ.10 ผ่านธุรการ ถึงเจ้าหน้าที่ (แท็บ 09A)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Notice 1', 'secretary')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0702 · กด “ไม่อนุมัติคุ้มครอง” เปิดหน้า /form/10 เป็นร่าง', async () => {
      await choosePreliminaryOutcome(page, 10)
      await expect(decisionWorkspace(page)).toContainText('คบ.10')
      expect((await caseOf(page))?.activity7State).not.toBe('rejected')
    })

    await test.step('WIT0703 / WIT0706 · ยืนยันไม่อนุมัติและลงนาม คบ.10 (ไม่ลงนาม คบ.9)', async () => {
      await fillDecisionWorkspace(page)
      await snap(page, ['node:07:WIT0706', 'edge:07:E0705'], { label: 'หน้า คบ.10 กรอกครบแล้ว รอยืนยันไม่อนุมัติและลงนาม' })
      await confirmInlineDecision(page)
      await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('rejected')
      const c = await caseOf(page)
      expect(c?.kb10Signed).toBe(true)
      expect(c?.kb9Signed).toBeFalsy()
      expect((c?.resultNotices as Rec | undefined)?.[10]).toBeTruthy()
      expect((c?.sarabanDispatch as Rec | undefined)?.flow).toBe('decision')
    })

    await test.step('WIT0716 · ธุรการ สลธ. → ธุรการสำนัก/กอง ลงทะเบียน คบ.1/3/6/10', async () => {
      await snap(page, ['node:07:WIT0716', 'edge:07:E0713'], { label: 'เลขาธิการฯ ลงนาม คบ.10 แล้ว ชุดนำส่งรอธุรการ สลธ. ออกเลขส่ง', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await expect.poll(async () => (await caseOf(page))?.sarabanDispatch).toBeFalsy()
    })

    await test.step('WIT0711 · เจ้าหน้าที่เห็น คบ.10 รอเติมรายละเอียด (แท็บ 09A)', async () => {
      await switchRole(page, 'officer')
      await page.goto(DOSSIER_URL)
      await snap(page, ['node:07:WIT0711', 'edge:07:E0714', 'overview:07>09A'], { label: 'ธุรการลงทะเบียนครบ เจ้าหน้าที่เห็น คบ.10 รอเติมรายละเอียด (ไปแท็บ 09A)' })
      await expect(page.getByTestId('result-notice-status')).toContainText('รอเติมรายละเอียด')
      await expect(formRow(page, 'คบ.10')).toBeVisible()
    })
  })

  test('T07-E · WIT0704 ส่งกลับ → 0707 → 0714 → 0708 → 0709 → 0712 → วนกลับ 0704: Revision เดินตามลำดับเดิมจนกลับถึงเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(360_000)
    await seedMockState(page, 'Case 1.7', 'secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await test.step('WIT0707 · เลขาธิการฯ ส่งกลับ/ขอข้อมูลเพิ่ม (ไม่ต้องลงนามข้อ 13) — เปิดชุดนำส่งขากลับ', async () => {
      await page.getByTestId('secretary-return-button').click()
      await page.getByTestId('decision-reason-input').fill('ข้อเท็จจริงใน คบ.3 ไม่ครบ ให้แนบผลตรวจสอบเพิ่มเติมและแก้ คบ.6 ให้สอดคล้อง')
      await snap(page, ['node:07:WIT0707', 'edge:07:E0706'], { label: 'เลขาธิการฯ เลือกส่งกลับ/ขอข้อมูลเพิ่ม กรอกเหตุผลแล้ว ก่อนกดยืนยัน' })
      await page.getByTestId('decision-confirm-button').click()
      await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('returned')
      const c = await caseOf(page)
      expect(c?.stage).toBe('director_review')
      expect((c?.sarabanDispatch as Rec | undefined)?.flow).toBe('decision')
    })

    await test.step('WIT0714 · ธุรการ สลธ. → ธุรการสำนัก/กอง ลงทะเบียนครบ แฟ้มถึง ผอ.', async () => {
      await snap(page, ['node:07:WIT0714', 'edge:07:E0707'], { label: 'เลขาธิการฯ ส่งกลับแล้ว ชุดนำส่งขากลับรอธุรการ สลธ. ออกเลขส่ง', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passDownLeg(page)
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.revisionAssignedAt).toBeFalsy()
    })

    await switchRole(page, 'director')
    await snap(page, 'overview:07>05', { label: 'ธุรการลงทะเบียนครบ แฟ้มที่เลขาธิการฯ ส่งกลับถึง ผอ. รอมอบหมายแก้ไข (กลับแท็บ 05)' })

    await test.step('WIT0708 · ผอ. มอบหมายเจ้าหน้าที่แก้เป็น Revision ใหม่ (ส่งแฟ้มเดิมขึ้นไม่ได้จนกว่าจะมอบหมาย)', async () => {
      await expect(page.getByTestId('return-revision-assignment-card')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await page.getByTestId('assign-revision-button').click()
      await page.getByTestId('revision-instruction-input').fill('แก้ คบ.3 และ คบ.6 เป็นฉบับใหม่ แนบผลตรวจสอบเพิ่มเติม')
      await page.getByTestId('assign-revision-confirm-button').click()
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(OFFICER_OWNERS).toContain(c?.owner)
      expect(c?.secretaryReturnRework).toBe(true)
      expect(c?.revisionRound).toBe(1)
      expect(c?.directorReturn).toBe(false)
      await snap(page, ['node:07:WIT0708', 'edge:07:E0708'], { label: 'ผอ. มอบหมายแก้ไขแล้ว เจ้าหน้าที่รับแฟ้มเพื่อแก้ คบ.3/คบ.6 เป็น Revision', role: 'officer', route: DOSSIER_URL })
    })

    await switchRole(page, 'officer')

    await test.step('WIT0709 · เจ้าหน้าที่แก้แล้วส่ง — ต้องไป ผบช.ชั้นต้นก่อน (ห้ามข้ามลำดับชั้น)', async () => {
      await expect(page.getByTestId('secretary-revision-banner')).toContainText('ห้ามส่งข้ามลำดับชั้น')
      await snap(page, ['node:07:WIT0709', 'edge:07:E0709'], { label: 'เจ้าหน้าที่แก้ Revision ครบ พร้อมส่งผ่าน ผบช.ชั้นต้น (จับก่อนส่ง — ไม่ได้แก้ฟอร์มจริงในเทสต์)' })
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      await page.goto(DOSSIER_URL)
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      expect((await caseOf(page))?.secretaryReturnRework).toBe(true)
    })

    await test.step('WIT0709 (ต่อ) · ผบช.ชั้นต้น → ผอ. → ธุรการสารบรรณ → รองเลขาธิการฯ ตามลำดับเดิม', async () => {
      await switchRole(page, 'supervisor')
      await signIfNeeded(page, 'supervisor')
      await forwardTo(page, 'director_review', 'ผอ.สำนัก/กอง')
      await switchRole(page, 'director')
      await signIfNeeded(page, 'director')
      await forwardTo(page, 'director_outgoing_registry', 'ธุรการสำนัก/กอง')
      await passUpLeg(page)
      await switchRole(page, 'deputy_secretary')
      await signIfNeeded(page, 'deputy_secretary')
      await forwardTo(page, 'external_pending', 'เลขาธิการ')
    })

    await test.step('WIT0712 · Revision กลับถึงเลขาธิการฯ — รอผลพิจารณา (Revision) แล้ววนกลับ WIT0704', async () => {
      const c = await caseOf(page)
      expect(c?.secretaryReturnRework).toBe(false)
      expect(c?.activity7State).toBe('pending')
      expect(c?.secretaryReviewState).toBe('pending')
      expect(c?.revisionRound).toBe(1)
      await switchRole(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('secretary-return-button')).toBeEnabled()
      await snap(page, ['node:07:WIT0712', 'edge:07:E0710', 'edge:07:E0716'], { label: 'Revision เดินครบทุกชั้นกลับถึงเลขาธิการฯ รอพิจารณาใหม่' })
    })
  })

  test('T07-F · ไม่มีแขนง "เห็นควรตามข้อ 14" ในคำสั่งชี้ขาด — ส่งต่อกรมคุ้มครองสิทธิฯ เลือกที่ คบ.6 ข้อ 4', async ({ page }) => {
    await seedMockState(page, 'Notice 1', 'secretary')
    await page.goto(DOSSIER_URL)

    await expect(page.getByTestId('secretary-decision-card')).toBeVisible()
    await expect(page.getByTestId('refer-article14-button')).toHaveCount(0)
  })
})

/* ====================================================================================
 * แท็บ 07G
 * ==================================================================================== */
test.describe('แท็บ 07G · ส่งงานหลังอนุมัติให้ กอท.', () => {
  test('T07G-A · A6POST01 → A6POST07: เลขาธิการอนุมัติและมอบหมาย กอท. → ธุรการ สลธ. ออกเลขทะเบียนส่ง', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'PostApproval 1')
    await page.goto(DOSSIER_URL)

    await choosePreliminaryOutcome(page, 9)
    await fillDecisionWorkspace(page, 'got')
    await snap(page, 'node:07G:A6POST01', { label: 'เลขาธิการฯ เลือกส่งงานให้ กอท. กรอกครบ รอยืนยันอนุมัติและมอบหมาย' })
    await confirmInlineDecision(page)
    await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_outgoing')
    expect((await handoffOf(page)).destination).toBe('got')
    await snap(page, ['node:07G:A6POST07', 'edge:07G:GOT-EDGE-0'], { label: 'เลขาธิการฯ อนุมัติและมอบหมาย กอท. แล้ว รอธุรการ สลธ. ออกเลขทะเบียนส่ง', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })

    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
    await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_receipt')
    await snap(page, ['edge:07G:GOT-EDGE-1', 'overview:07>07G'], { label: 'ธุรการ สลธ. ออกเลขส่งแล้ว ชุดนำส่งรอธุรการคดี กอท. ลงเลขรับ', role: 'got_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
    const records = ((await caseOf(page))?.sarabanRecords ?? []) as Array<{ checkpoint: string; formNo: number; forms?: number[] }>
    for (const n of [1, 3, 6, 9]) expect(records.some((r) => r.checkpoint === 'secretary_outgoing' && (r.forms ?? [r.formNo]).includes(n))).toBe(true)
  })

  test('T07G-B · A6POST02 → A6POST03: ธุรการคดี กอท. ลงเลขรับ (รับเรื่อง) แล้วส่งเสนอ ผอ. กอท.', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'PostApproval 3')
    await page.goto(DOSSIER_URL)

    await test.step('A6POST02 · ไม่มีปุ่ม “รับเรื่อง” — ต้องลงเลขรับครบ 4 ฉบับที่หน้าทะเบียนแล้วส่งต่อ', async () => {
      await expect(page.getByTestId('got-receive-button')).toHaveCount(0)
      await snap(page, 'node:07G:A6POST02', { label: 'ชุดนำส่งถึง กอท. ธุรการคดีรอลงเลขทะเบียนรับ คบ.1/3/6/9', role: 'got_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await passSarabanCheckpoint(page, CASE_NO, 'got_receiver')
      await expect.poll(async () => (await handoffOf(page)).step).toBe('received')
    })

    await test.step('A6POST03 · ส่งเสนอ ผอ. กอท.', async () => {
      await page.goto(DOSSIER_URL)
      await snap(page, ['node:07G:A6POST03', 'edge:07G:GOT-EDGE-2'], { label: 'ธุรการคดี กอท. ลงเลขรับครบแล้ว (รับเรื่อง) รอส่งเสนอ ผอ. กอท.', role: 'got_receiver' })
      await handoffAction(page, 'submit', 'เสนอ ผอ. กอท. มอบหมายผู้รับผิดชอบ')
      await expect.poll(async () => (await handoffOf(page)).step).toBe('pending_assignment')
      await snap(page, ['node:07G:A6POST04', 'edge:07G:GOT-EDGE-3'], { label: 'ธุรการคดีส่งเสนอแล้ว ผอ. กอท. รอมอบหมายผู้รับผิดชอบ', role: 'got_director', route: DOSSIER_URL })
    })
  })

  test('T07G-C · A6POST04: ผอ. กอท. เลือกผู้รับผิดชอบและมอบหมาย (ต้องมีผู้รับผิดชอบและคำสั่ง)', async ({ page }) => {
    await seedMockState(page, 'PostApproval 4')
    await page.goto(DOSSIER_URL)

    await page.getByTestId('got-assign-button').click()
    await expect(page.getByRole('alert')).toContainText('เลือกผู้รับผิดชอบ')
    await page.getByTestId('got-assignee-select').selectOption('GOT-OFF-001')
    await handoffAction(page, 'assign', 'มอบหมาย นางสาวอรุณี ใจมั่น รับผิดชอบตามคำสั่งเดิม')
    await expect.poll(async () => (await handoffOf(page)).step).toBe('assigned')
    expect((await handoffOf(page)).assigneeUserId).toBe('GOT-OFF-001')
    await snap(page, 'edge:07G:GOT-EDGE-4', { label: 'ผอ. กอท. มอบหมายผู้รับผิดชอบแล้ว ผู้ได้รับมอบหมายรอรับงาน', role: 'got_officer', route: DOSSIER_URL })
  })

  test('T07G-D · A6POST05 → A6POST06: ผู้รับผิดชอบ กอท. รับงาน แล้วเติม คบ.9 ที่ลงนามแล้วและตรวจพร้อมส่ง', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'PostApproval 5')
    await page.goto(DOSSIER_URL)
    await snap(page, 'node:07G:A6POST05', { label: 'ผู้ได้รับมอบหมาย กอท. เห็นงานที่ ผอ. กอท. มอบหมาย รอรับงานและตรวจเอกสาร' })

    await test.step('A6POST05 · รับงานและดำเนินการต่อ', async () => {
      await handoffAction(page, 'accept', 'รับงานพร้อมเอกสารประกอบในแฟ้มเดิม')
      await expect.poll(async () => (await handoffOf(page)).step).toBe('accepted')
      expect((await caseOf(page))?.activity7State).toBe('approved')
    })

    await test.step('A6POST06 · เติมรายละเอียด คบ.9 รุ่นใหม่ (ไม่ลงนามซ้ำ) ตรวจพร้อมส่ง', async () => {
      await page.reload()
      await snap(page, ['node:07G:A6POST06', 'edge:07G:GOT-EDGE-5', 'overview:07G>08A'], { label: 'ผู้รับผิดชอบ กอท. รับงานแล้ว รอเติมรายละเอียด คบ.9 รุ่นใหม่และตรวจพร้อมส่ง (ไปแท็บ 08A)' })
      const before = await caseOf(page)
      await completeNoticeDetails(page)
      await checkNoticeReady(page)
      const c = await caseOf(page)
      expect(c?.kb9SignedAt).toBe(before?.kb9SignedAt)
      expect((c?.resultNotices as any)?.[9]?.versions).toHaveLength(2)
    })
  })
})
