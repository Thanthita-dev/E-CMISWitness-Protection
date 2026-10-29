import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Locator, type Page, type TestInfo } from '@playwright/test'
import { KB1_DONE, readCase, screenUrgencyAsOwner, seedMockState } from '../helpers/seed'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import type { UserRole } from '../../src/types/user'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, expectStage, fillKb5Period, formRow, signInModal } from './journey-helpers'

/**
 * Journey J05C — เส้นทางเร่งด่วน (Fast Track) ตั้งแต่ประเมินความเร่งด่วนจนได้ข้อยุติเรื่องคุ้มครองชั่วคราว
 *
 * ต่างจาก J05 ที่เริ่มจากแฟ้มที่ประเมินเป็นเร่งด่วนไว้แล้ว (Case 3) — ชุดนี้เริ่มจาก Case 1.3 ที่ยังไม่ประเมิน
 * แล้วให้เจ้าของสำนวนกด "กรณีจำเป็นเร่งด่วน" เอง (แท็บ 04) ระบบจึงพาเข้าแท็บ 06 ผ่าน UI ทั้งสาย
 *
 *   FT-A  ประเมินเร่งด่วน → คบ.4 เลือกวิธี → ส่งตรง ผอ. → ข้อมูลครบ → อนุมัติ ลงนาม คบ.5 → พยานยินยอม → เปิดแท็บ 08 / คำร้องหลักเดินต่อ
 *   FT-B  ประเมินเร่งด่วน → … → ผอ. ไม่อนุมัติชั่วคราว → คำร้องหลักไม่ปิด ไม่ออก คบ.10 กลับเจ้าหน้าที่ทำ คบ.6
 *   FT-C  ประเมินเร่งด่วน → … → ผอ. ตีกลับ (ข้อมูลไม่ครบ) ตรงเจ้าหน้าที่ → แก้แล้วส่งใหม่ → ผ่านประตู → อนุมัติ
 *   FT-D  กรณีห้าม/ขอบเขต: ก่อนประเมินไม่มี คบ.4 · ไม่เลือกวิธีส่งไม่ได้ · เกินเพดาน 180 วัน · ยกเลิกจอยืนยันไม่มีผล · ผอ. ลัดขั้นไม่ได้
 *
 * ภาพหน้าจอทุกขั้นเก็บที่ e2e-evidence/fast-track/<รหัสเทสต์>/ และแนบใน Playwright report
 */

const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const WITNESS = 'สมชาย ใจดี'
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`
const KB5_FORM_URL = `/form/5?caseNo=${CASE_NO}`

const here = dirname(fileURLToPath(import.meta.url))
const SHOT_DIR = resolve(here, '../../e2e-evidence/fast-track')

type Rec = Record<string, unknown>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null
const fastTrackOf = async (page: Page) => ((await caseOf(page))?.fastTrack ?? {}) as Rec
const historyOf = async (page: Page) => (((await caseOf(page))?.assignmentHistory ?? []) as Array<Record<string, string>>)

/**
 * ภาพหน้าจอประจำขั้น — เลื่อนให้ส่วนที่เกี่ยวข้องอยู่ในจอแล้วถ่ายเฉพาะ viewport
 * (ภาพเต็มหน้าถูก topbar แบบ sticky ทับกลางภาพ) ไฟล์เรียงตามลำดับขั้น `01-<ชื่อขั้น>.png`
 */
function stepShots(page: Page, testInfo: TestInfo, testId: string) {
  let n = 0
  const dir = resolve(SHOT_DIR, testId)
  mkdirSync(dir, { recursive: true })
  return async (label: string, focus?: Locator) => {
    n += 1
    if (focus) await focus.first().scrollIntoViewIfNeeded({ timeout: 5_000 })
    // รอ toast แจ้งผลหายก่อน ไม่ให้บังจุดที่ถ่าย
    await page.locator('.swal2-toast').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {})
    const path = resolve(dir, `${String(n).padStart(2, '0')}-${label.replace(/[^\wก-๙.-]+/g, '_')}.png`)
    await page.screenshot({ path })
    await testInfo.attach(`${String(n).padStart(2, '0')} ${label}`, { path, contentType: 'image/png' })
  }
}

/**
 * สลับเป็นบัญชีทดลองของบทบาทนั้น (ผู้ใช้ + หน่วยงานตรงตามบทบาท) แล้วโหลดหน้าใหม่
 * ใช้แทน switchRole กลางเพราะแฟ้ม Case 1.3 ตรวจสิทธิ์รายหน่วยงาน (เหมือน flow-paths แท็บ 05–07)
 */
async function switchRole(page: Page, role: UserRole) {
  const prev = await page.evaluate(() => JSON.parse(localStorage.getItem('ecmis-auth-storage') || '{"state":{}}'))
  const account = mockStateAccountForRole(role)
  const state = account ? authStateForAccount(account, prev.state) : { ...prev.state, currentRole: role }
  await page.addInitScript((auth: unknown) => {
    if (!localStorage.getItem('ecmis-auth-storage')) return
    localStorage.setItem('ecmis-auth-storage', JSON.stringify({ ...JSON.parse(localStorage.getItem('ecmis-auth-storage') as string), state: auth }))
  }, state)
  await page.reload()
}

/** แท็บ 04 — เจ้าของสำนวนประเมินเป็นกรณีจำเป็นเร่งด่วน ระบบเปิดการ์ด Fast Track ขั้นจัดทำ คบ.4 */
async function screenAsUrgent(page: Page) {
  await screenUrgencyAsOwner(page, 'urgent')
  await expect(page.getByTestId('fast-track-submit-panel')).toHaveAttribute('data-fast-track-step', 'drafting')
  const c = await caseOf(page)
  expect(c?.urgency).toBe('urgent')
  expect(c?.urgent).toBe(true)
  expect(c?.stage).toBe('staff_review')
}

/** WIT0603 — ติ๊กวิธีตามข้อ 15 ในแบบ คบ.4 และระบุช่วงวันที่ในร่าง คบ.5 (30 วัน) แล้วกลับหน้าแฟ้ม */
async function pickKb4Methods(page: Page, methods: number[]) {
  await page.goto(KB4_FORM_URL)
  for (const m of methods) await page.getByTestId(`kb4-method-option-${m}`).click()
  await fillKb5Period(page, CASE_NO)
  await page.goto(DOSSIER_URL)
  for (const m of methods) await expect(page.getByTestId('fast-track-methods')).toContainText(`วิธีที่ ${m}`)
}

/** WIT0604 — ส่งตรง ผอ. ไม่ผ่าน ผบช.ชั้นต้น */
async function submitToDirector(page: Page) {
  await page.getByTestId('fast-track-submit-button').click()
  await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
  await expectStage(page, 'director_review')
  const c = await caseOf(page)
  expect(c?.owner).toBe(DIRECTOR)
  expect(c?.owner).not.toBe(SUPERVISOR)
  expect((c?.fastTrack as Rec).step).toBe('director_review')
}

/** WIT0606 — ผอ. ยืนยันข้อมูลครบ แผงอนุมัติ/ไม่อนุมัติจึงเปิด */
async function passReadinessGate(page: Page) {
  await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)
  await page.getByTestId('fast-track-ready-button').click()
  await confirmDialog(page, 'ยืนยันข้อมูลครบ', 'อนุมัติ / ไม่อนุมัติการคุ้มครองชั่วคราว')
  await expect(page.getByTestId('fast-track-decision-panel')).toBeVisible()
}

/** WIT0609 อนุมัติ → WIT0611 เลขคำสั่ง + ความเห็น + ลงนาม คบ.5 */
async function approveAndSignKb5(page: Page, orderNo: string, opinion: string, beforeConfirm?: () => Promise<void>) {
  await page.getByTestId('fast-track-approve-button').click()
  await page.getByTestId('kb5-order-no').fill(orderNo)
  await page.getByTestId('kb5-director-opinion').fill(opinion)
  await page.getByTestId('kb5-sign-button').click()
  await signInModal(page, DIRECTOR)
  await beforeConfirm?.()
  await page.getByTestId('fast-track-approve-confirm').click()
  await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง', 'แก้ไขทับไม่ได้อีก')
  await expect.poll(async () => (await fastTrackOf(page)).step).toBe('approved')
}

/** จุดเริ่มร่วมของทุกเส้น: Case 1.3 (บันทึก คบ.1 แล้ว ยังไม่ประเมินความเร่งด่วน) เปิดในฐานะเจ้าของสำนวน */
async function openUnscreenedCase(page: Page) {
  await seedMockState(page, 'Case 1.3', 'officer', KB1_DONE)
  await page.goto(DOSSIER_URL)
  expect((await caseOf(page))?.urgent).toBeFalsy()
}

test.describe('J05C · เส้นทางเร่งด่วน ตั้งแต่ประเมินความเร่งด่วน', () => {
  test('FT-A · [Happy] ประเมินเร่งด่วน → คบ.4 → ผอ. อนุมัติ ลงนาม คบ.5 → พยานยินยอม → เปิดวิธีคุ้มครอง และคำร้องหลักเดินต่อ', async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000)
    const shot = stepShots(page, testInfo, 'FT-A')
    await openUnscreenedCase(page)

    await test.step('แท็บ 04 · ประเมินเป็นกรณีจำเป็นเร่งด่วน → เข้าเส้นทาง Fast Track', async () => {
      // ปุ่มประเมินอยู่ในการ์ดคดีหลัก และแสดงหลังเชื่อมโยงคดีหลักแล้ว (screenUrgencyAsOwner เชื่อมโยงให้)
      await shot('ก่อนประเมินความเร่งด่วน', page.getByText('คดีหลักและการประเมินภัย'))
      await screenAsUrgent(page)
      await shot('ประเมินเร่งด่วนแล้ว ส่วนส่งเส้นทางเร่งด่วนขั้นจัดทำ', page.getByTestId('fast-track-submit-panel'))
    })

    await test.step('WIT0602 · แฟ้มแสดง คบ.4 / คบ.5 และยังไม่มี คบ.6', async () => {
      await expect(formRow(page, 'คบ.4')).toHaveCount(1)
      await expect(formRow(page, 'คบ.5')).toHaveCount(1)
      await expect(formRow(page, 'คบ.6')).toHaveCount(0)
      await shot('รายการแบบ คบ.4 และ คบ.5 ในแฟ้ม', page.getByTestId('dossier-forms'))
    })

    await test.step('WIT0603 · เลือกวิธีคุ้มครองข้อ 15 ใน คบ.4 (วิธีที่ 1 และ 3)', async () => {
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await pickKb4Methods(page, [1, 3])
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
      await shot('เลือกวิธีใน คบ.4 แล้ว ปุ่มส่งตรง ผอ. กดได้', page.getByTestId('fast-track-submit-button'))
    })

    await test.step('WIT0604 · ส่งตรง ผอ. ไม่ผ่าน ผบช.ชั้นต้น', async () => {
      await submitToDirector(page)
      expect((await fastTrackOf(page)).proposedMethods).toEqual([1, 3])
      expect((await historyOf(page)).some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await switchRole(page, 'director')

    await test.step('WIT0605 / WIT0606 · ผอ. ตรวจรายการ แล้วยืนยันข้อมูลครบ', async () => {
      await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
      await shot('ผอ. ตรวจรายการ คบ.4 ร่าง คบ.5', page.getByTestId('fast-track-review-list'))
      await passReadinessGate(page)
      expect((await fastTrackOf(page)).readinessCheckedAt).toBeTruthy()
      await shot('ยืนยันข้อมูลครบ แผงอนุมัติเปิด', page.getByTestId('fast-track-decision-panel'))
    })

    await test.step('WIT0609 / WIT0611 · อนุมัติ ลงนาม คบ.5 และล็อกฉบับลงนาม', async () => {
      await approveAndSignKb5(page, '045/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1 และ 3 ทันที', () =>
        shot('ผอ. กรอกเลขคำสั่งและลงนาม คบ.5', page.getByTestId('fast-track-approve-confirm')))
      const c = await caseOf(page)
      expect(c?.kb5Approved).toBe(true)
      expect((c?.fastTrack as Rec).kb5OrderNo).toBe('045/2569')
      expect(c?.temporaryDeniedAt).toBeFalsy()
      expect(c?.stage).toBe('staff_review')
      await page.goto(KB5_FORM_URL)
      await expect(page.getByText('ฉบับลงนามถูกล็อก — แก้ทับไม่ได้')).toBeVisible()
      await shot('คบ.5 ฉบับลงนามถูกล็อก', page.getByText('ฉบับลงนามถูกล็อก — แก้ทับไม่ได้'))
    })

    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0612 / WIT0613 · พยานลงนามยินยอม → เปิดเส้นทางวิธีที่ 1 และ 3', async () => {
      await shot('รอพยานรับทราบและลงนามยินยอม', page.getByTestId('kb5-witness-ack-button'))
      await page.getByTestId('kb5-witness-ack-button').click()
      await signInModal(page, WITNESS)
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('active')
      const c = await caseOf(page)
      expect(c?.approvedMethods).toEqual([1, 3])
      expect(((c?.consents ?? []) as Rec[]).some((x) => x.ref === 'kb5' && x.consented === true)).toBe(true)

      await page.goto('/protection-methods')
      const row = page.locator('tbody tr').filter({ hasText: CASE_NO })
      await expect(row).toContainText('วิธีที่ 1, วิธีที่ 3')
      await expect(row).not.toContainText('รอเปิดเส้นทาง')
      await shot('เปิดเส้นทางวิธีคุ้มครองที่อนุมัติ', row)
    })

    await test.step('WIT0614 · คำร้องหลักยังเดินต่อคู่ขนาน', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('คำร้องหลักยังเดินต่อ')
      expect((await caseOf(page))?.activity7State).toBeFalsy()
      await shot('คำร้องหลักเดินต่อ ต้องจัดทำ คบ.6', page.getByTestId('fast-track-main-petition-notice'))
    })
  })

  test('FT-B · [Branch] ประเมินเร่งด่วน → ผอ. ไม่อนุมัติชั่วคราว → คำร้องหลักไม่ปิด ไม่ออก คบ.10', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const shot = stepShots(page, testInfo, 'FT-B')
    await openUnscreenedCase(page)

    await test.step('แท็บ 04 → WIT0604 · ประเมินเร่งด่วน เลือกวิธีที่ 2 แล้วส่งตรง ผอ.', async () => {
      await screenAsUrgent(page)
      await pickKb4Methods(page, [2])
      await submitToDirector(page)
    })

    await switchRole(page, 'director')

    await test.step('WIT0606 → WIT0609 · ข้อมูลครบ แล้วเลือกไม่อนุมัติ (ยกเลิกครั้งแรกไม่มีผล)', async () => {
      await passReadinessGate(page)
      await page.getByTestId('fast-track-deny-button').click()
      await page.getByTestId('fast-track-deny-reason').fill('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์')
      await shot('ผอ. กรอกเหตุผลไม่อนุมัติ', page.getByTestId('fast-track-deny-confirm'))
      await page.getByTestId('fast-track-deny-confirm').click()
      await cancelDialog(page)
      expect((await caseOf(page))?.temporaryDeniedAt).toBeFalsy()
      expect((await caseOf(page))?.stage).toBe('director_review')
      await page.getByTestId('fast-track-deny-confirm').click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว', 'ไม่ออก คบ.10')
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('denied')
    })

    await test.step('WIT0610 / WIT0614 · ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 งานกลับเจ้าหน้าที่ทำ คบ.6', async () => {
      const c = await caseOf(page)
      expect(c?.temporaryDeniedAt).toBeTruthy()
      expect(c?.kb5Approved).toBe(false)
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb10Signed).toBeFalsy()
      expect(c?.appealDueAt).toBeFalsy()
      expect((c?.extraForms ?? []) as number[]).not.toContain(10)
      expect(c?.stage).toBe('staff_review')
      expect(c?.next).toContain('คบ.6')
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('ไม่ออก คบ.10')
      await shot('ไม่อนุมัติชั่วคราว คำร้องหลักเดินต่อ', page.getByTestId('fast-track-main-petition-notice'))
    })
  })

  test('FT-C · [Branch] ประเมินเร่งด่วน → ผอ. ตีกลับตรงเจ้าหน้าที่ → แก้แล้วส่งใหม่ → อนุมัติ', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    const shot = stepShots(page, testInfo, 'FT-C')
    await openUnscreenedCase(page)

    await test.step('แท็บ 04 → WIT0604 · ประเมินเร่งด่วน เลือกวิธีที่ 1 แล้วส่งตรง ผอ.', async () => {
      await screenAsUrgent(page)
      await pickKb4Methods(page, [1])
      await submitToDirector(page)
    })

    await switchRole(page, 'director')

    await test.step('WIT0606 ไม่ครบ → WIT0607 · ส่งกลับตรงเจ้าหน้าที่ ไม่ผ่าน ผบช.ชั้นต้น', async () => {
      await page.getByTestId('return-case-button').click()
      await page.getByTestId('return-issue-select').selectOption('kb5_draft_incomplete')
      await page.getByTestId('return-note-input').fill('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงานและช่วงเวลาคุ้มครอง ให้เติมให้ครบแล้วเสนอใหม่')
      await shot('ผอ. ระบุประเด็นที่ต้องแก้', page.getByTestId('return-confirm-button'))
      await page.getByTestId('return-confirm-button').click()
      await expectStage(page, 'staff_review')
      const c = await caseOf(page)
      expect(c?.owner).not.toBe(SUPERVISOR)
      expect(c?.directorReturn).toBe(true)
      expect((c?.fastTrack as Rec).step).toBe('returned')
      expect((c?.fastTrack as Rec).readinessCheckedAt).toBeFalsy()
    })

    await switchRole(page, 'officer')

    await test.step('WIT0608 · เจ้าหน้าที่เห็นประเด็นที่ถูกตีกลับ แก้แล้วส่ง ผอ. ตรวจใหม่', async () => {
      await expect(page.getByTestId('fast-track-return-banner')).toContainText('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงาน')
      await shot('เจ้าหน้าที่ได้รับแฟ้มที่ถูกตีกลับ', page.getByTestId('fast-track-return-banner'))
      await page.getByTestId('fast-track-submit-note').fill('เติมชุดเจ้าพนักงานและช่วงเวลาคุ้มครองในร่าง คบ.5 ครบแล้ว')
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรวจใหม่', 'ส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง')
      await expectStage(page, 'director_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect((c?.fastTrack as Rec).returnRound).toBe(1)
      expect(c?.directorReturn).toBe(false)
      expect((await historyOf(page)).some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await switchRole(page, 'director')

    await test.step('WIT0605 → WIT0609 · ผอ. ผ่านประตูอีกรอบแล้วอนุมัติ', async () => {
      await passReadinessGate(page)
      await approveAndSignKb5(page, '050/2569', 'เห็นชอบหลังแก้ไขร่าง คบ.5 ครบถ้วนแล้ว')
      expect((await caseOf(page))?.kb5Approved).toBe(true)
      await shot('อนุมัติหลังแก้ไขรอบที่ 2', page.getByTestId('fast-track-card'))
    })
  })

  test('FT-D · [Guard] กรณีห้าม/ขอบเขตของเส้นทางเร่งด่วน', async ({ page }, testInfo) => {
    test.setTimeout(180_000)
    const shot = stepShots(page, testInfo, 'FT-D')
    await openUnscreenedCase(page)

    await test.step('ยังไม่ประเมินความเร่งด่วน → ไม่มีการ์ด Fast Track และไม่มี คบ.4', async () => {
      await expect(page.getByTestId('fast-track-card')).toHaveCount(0)
      await expect(formRow(page, 'คบ.4')).toHaveCount(0)
      await shot('ยังไม่ประเมิน ไม่มี คบ.4', page.getByTestId('dossier-forms'))
    })

    await screenAsUrgent(page)

    await test.step('ยังไม่เลือกวิธีใน คบ.4 → ส่งตรง ผอ. ไม่ได้', async () => {
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await expect(page.getByTestId('fast-track-submit-panel')).toContainText('ยังไม่ได้เลือกวิธีคุ้มครอง')
      await shot('ยังไม่เลือกวิธี ปุ่มส่งถูกล็อก', page.getByTestId('fast-track-submit-button'))
    })

    await pickKb4Methods(page, [1])

    await test.step('ระยะเวลาเกินเพดานรวม 180 วัน → เตือนและส่งไม่ได้ · 180 วันพอดีส่งได้', async () => {
      await fillKb5Period(page, CASE_NO, '2026-01-01', '2026-07-19')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-duration-warning')).toContainText('ไม่เกิน 180 วัน')
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await shot('ระบุ 200 วัน ระบบเตือนเกินเพดาน', page.getByTestId('fast-track-duration-warning'))
      expect((await fastTrackOf(page)).submittedAt).toBeUndefined()
      await fillKb5Period(page, CASE_NO, '2026-01-01', '2026-06-29')
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-duration-warning')).toHaveCount(0)
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
    })

    await test.step('กดยกเลิกในจอยืนยันส่ง → แฟ้มไม่เปลี่ยน', async () => {
      await page.getByTestId('fast-track-submit-button').click()
      await cancelDialog(page)
      expect((await caseOf(page))?.stage).toBe('staff_review')
      expect((await fastTrackOf(page)).submittedAt).toBeFalsy()
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', '180 วัน')
      await expectStage(page, 'director_review')
      expect((await fastTrackOf(page)).temporaryDurationDays).toBe(180)
    })

    await switchRole(page, 'director')

    await test.step('ผอ. ส่งต่อคำร้องหลักไม่ได้ และยังไม่มีปุ่มอนุมัติจนกว่าจะยืนยันข้อมูลครบ', async () => {
      await expect(page.getByTestId('fast-track-decision-required-banner')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await expect(page.getByTestId('forward-case-button')).toHaveAttribute('title', /ยังไม่ได้พิจารณาคุ้มครองชั่วคราว/)
      await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)
      await shot('ผอ. ลัดขั้นไม่ได้ ต้องพิจารณาชั่วคราวก่อน', page.getByTestId('fast-track-decision-required-banner'))
      expect((await caseOf(page))?.stage).toBe('director_review')
    })
  })
})
