import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, fillKb5Period, signInModal } from '../journeys/journey-helpers'

/**
 * RRR-06 · แท็บ 06 — เส้นทางเร่งด่วน คบ.4 / คบ.5: ตีกลับ / แก้ไข / ไม่อนุมัติ
 *
 * ผังที่ครอบคลุม (Sheet 06)
 *  WIT0605 ผอ. ตรวจ คบ.4 / ร่าง คบ.5 → WIT0606 ◇ ข้อมูลครบ?
 *    "ไม่ครบ" → WIT0607 ผอ. ตีกลับตรงเจ้าหน้าที่ (returnFastTrackForRework) ไม่ผ่าน ผบช.ชั้นต้น
 *             → WIT0608 เจ้าหน้าที่แก้ คบ.4 / ร่าง คบ.5 + ลงนามผู้เสนอใหม่ แล้วส่งตรวจใหม่ (submitFastTrackForDecision รอบแก้ไข)
 *             → วนกลับ WIT0605 → ผอ. ลงนาม คบ.4 (ข้อ 13) + คบ.5 → WIT0609 อนุมัติ
 *  WIT0609 ◇ อนุมัติคุ้มครองชั่วคราว?
 *    "อนุมัติ" → WIT0611 ล็อก คบ.4 / คบ.5 ที่ลงนาม แฟ้มกลับเจ้าหน้าที่แจ้งพยานรับทราบ (WIT0612)
 *    "ไม่อนุมัติ" → WIT0610 (denyTemporaryProtection) ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 → WIT0614 คำร้องหลักเดินต่อ
 *
 * หมายเหตุ UI ปัจจุบัน
 *  - ไม่มีปุ่ม "ครบ — พร้อมพิจารณา" (fast-track-ready-button) และปุ่ม fast-track-approve-button แล้ว
 *    ผอ. ลงนาม คบ.4 (ข้อ 13) → คบ.5 ที่หน้ากรอกแบบ แล้วกด fast-track-approve-confirm (readiness gate ถูกควบรวมกับการลงนาม)
 *  - ผู้เสนอต้องลงนามท้าย คบ.4 (kb4-sign-button) ก่อนส่ง ผอ. ทุกรอบ — การตีกลับล้างลายมือชื่อ kb4-officer / kb4-director / kb5-director
 *  - เส้นทางเร่งด่วนไม่ผ่าน ผบช.ชั้นต้น จึงไม่มีการตีกลับระดับ ผบช. (ดู test.fixme ท้ายไฟล์)
 *
 * ทุกเทสต์ seed state ของตัวเอง (Case 3 / Case 3.1) ไม่พึ่งเทสต์อื่น
 */

type Rec = Record<string, unknown>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null
const fastTrackOf = async (page: Page) => ((await caseOf(page))?.fastTrack ?? {}) as Rec
const historyOf = async (page: Page) => ((await caseOf(page))?.assignmentHistory ?? []) as Array<Record<string, string>>

/** สถานะร่างแบบ/ลายมือชื่อ/ล็อกของแฟ้มที่ active อยู่ จาก useFormDraftStore */
async function formStore(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
    const s = raw ? JSON.parse(raw).state : {}
    return {
      signatures: (s.signatures ?? {}) as Record<string, { signed?: boolean; signerName?: string }>,
      locks: (s.locks ?? {}) as Record<string, unknown>,
      drafts: (s.drafts ?? {}) as Record<string, Record<string, unknown>>,
    }
  })
}

const KB4_METHODS_FIELD = 'วิธีคุ้มครองที่เลือก'

/** เจ้าหน้าที่ลงนามท้ายแบบ คบ.4 (ผู้เสนอ) — เปิดหน้า คบ.4 แล้วกดปุ่มลงนามข้าง "บันทึกแบบ คบ.4" */
async function officerSignKb4(page: Page) {
  await page.goto(`/form/4?caseNo=${CASE_NO}`)
  await page.getByTestId('kb4-sign-button').click()
  await signInModal(page, 'เจ้าหน้าที่ผู้เสนอ')
  await expect.poll(async () => (await formStore(page)).signatures['kb4-officer']?.signed).toBe(true)
}

/** ผอ. ตีกลับตรงเจ้าหน้าที่ (WIT0607) ผ่านโมดัลส่งกลับของการ์ดส่งงาน */
async function directorReturn(page: Page, issueValue: string, note: string) {
  await page.getByTestId('return-case-button').click()
  await page.getByTestId('return-issue-select').selectOption(issueValue)
  await page.getByTestId('return-note-input').fill(note)
  await page.getByTestId('return-confirm-button').click()
}

const RETURN_NOTE = 'ร่างคำสั่ง คบ.5 ยังไม่ระบุช่วงเวลาคุ้มครองที่เหมาะสมกับระดับภัย ให้ปรับช่วงเวลาและทบทวนวิธีที่เสนอ แล้วเสนอใหม่'
const RETURN_ISSUE_LABEL = 'ร่างคำสั่ง คบ.5 ยังไม่ครบ (ชุดเจ้าพนักงาน / ช่วงเวลา)'

test.describe('WIT0605–WIT0609 — ตีกลับตรงเจ้าหน้าที่ แก้ไข ส่งตรวจใหม่ และอนุมัติ (full loop)', () => {
  test('RRR-06-01 · [Full loop] ผอ. ตีกลับ (WIT0607) → บันทึกผู้ตีกลับ/ขั้น/เหตุผล ลายมือชื่อถูกล้าง ร่างเดิมยังอยู่ → เจ้าหน้าที่แก้และลงนามใหม่ส่งกลับ ผอ. (WIT0608) → ผอ. ลงนาม คบ.4 + คบ.5 อนุมัติผ่าน', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    // Case 3 — เคสเร่งด่วนอยู่ที่เจ้าหน้าที่ ยังไม่ได้เสนอ ผอ.
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)
    const officerName = String((await caseOf(page))?.assignedOfficer)
    expect(officerName).toBeTruthy()

    await test.step('WIT0603–0604 · เจ้าหน้าที่เลือกวิธี 1+3 กำหนดช่วงเวลา ลงนามผู้เสนอ แล้วส่งตรง ผอ.', async () => {
      await page.goto(`/form/4?caseNo=${CASE_NO}`)
      await page.getByTestId('kb4-method-option-1').click()
      await page.getByTestId('kb4-method-option-3').click()
      await fillKb5Period(page, CASE_NO, '2026-01-01', '2026-01-30')

      // ยังไม่ลงนาม คบ.4 → ส่งไม่ได้ (ด่านลายมือชื่อผู้เสนอ)
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await expect(page.getByTestId('fast-track-submit-panel')).toContainText('ผู้เสนอยังไม่ได้ลงนามในแบบ คบ.4')

      await officerSignKb4(page)
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('director_review')

      const c = await caseOf(page)
      const ft = c?.fastTrack as Rec
      expect(ft.step).toBe('director_review')
      expect(ft.proposedMethods).toEqual([1, 3])
      expect(ft.temporaryDurationDays).toBe(30)
      expect(ft.returnRound).toBe(0)
    })
    const directorName = String((await caseOf(page))?.owner)
    expect(directorName).not.toBe(officerName)

    await test.step('WIT0605–0607 · ผอ. ตีกลับตรงเจ้าหน้าที่ — บันทึกผู้ตีกลับ ขั้น เหตุผล', async () => {
      await switchRole(page, 'director')
      await expect(page.getByTestId('fast-track-decision-panel')).toBeVisible()
      await directorReturn(page, 'kb5_draft_incomplete', RETURN_NOTE)
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

      const c = await caseOf(page)
      const ft = c?.fastTrack as Rec
      // ผู้ถือแฟ้มใหม่ = เจ้าหน้าที่โดยตรง ไม่แวะ ผบช.ชั้นต้น
      expect(c?.owner).toBe(officerName)
      expect(c?.stage).not.toBe('supervisor_review')
      // ผู้ตีกลับ / ขั้นที่ตีกลับ / ประเด็น / เหตุผล ถูกบันทึกครบ
      expect(c?.returned).toBe(true)
      expect(c?.directorReturn).toBe(true)
      expect(c?.returnedBy).toBe('ผู้อำนวยการสำนัก/กอง')
      expect(c?.returnedByRole).toBe('director')
      expect(c?.returnIssueLabel).toBe(RETURN_ISSUE_LABEL)
      expect(c?.returnNote).toBe(RETURN_NOTE)
      expect(ft.step).toBe('returned')
      expect(ft.returnRound).toBe(1)
      expect(ft.returnIssueLabel).toBe(RETURN_ISSUE_LABEL)
      expect(ft.returnNote).toBe(RETURN_NOTE)
      expect(ft.returnedAt).toBeTruthy()
      expect(ft.readinessCheckedAt).toBeFalsy()
      expect(String(c?.next)).toContain(RETURN_ISSUE_LABEL)
      // ยังไม่ตัดสินเรื่องชั่วคราว — ไม่อนุมัติ/ไม่ปฏิเสธ
      expect(c?.kb5Approved).toBeFalsy()
      expect(c?.temporaryDeniedAt).toBeFalsy()

      const history = await historyOf(page)
      expect(history.some((h) => (h.action ?? '').includes('ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5') && (h.detail ?? '').includes(RETURN_NOTE))).toBe(true)
      expect(history.some((h) => (h.detail ?? '').includes('ไม่ผ่านผู้บังคับบัญชาชั้นต้น'))).toBe(true)
      expect(history.some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await test.step('ฉบับเดิมที่ตีกลับยังอยู่: ร่าง คบ.4/คบ.5 และชุดวิธีที่เสนอคงเดิม แต่ลายมือชื่อผู้เสนอถูกล้าง', async () => {
      const forms = await formStore(page)
      expect(forms.signatures['kb4-officer']?.signed).toBeFalsy()
      expect(forms.drafts['4']?.[KB4_METHODS_FIELD]).toEqual([1, 3])
      expect(forms.drafts['5']?.['เริ่มวันที่']).toBeTruthy()
      expect(((await caseOf(page))?.fastTrack as Rec).proposedMethods).toEqual([1, 3])
    })

    await test.step('WIT0608 · เจ้าหน้าที่เห็นแบนเนอร์ตีกลับ และส่งไม่ได้จนกว่าจะลงนามผู้เสนอใหม่', async () => {
      await switchRole(page, 'officer')
      await expect(page.getByTestId('fast-track-submit-panel')).toHaveAttribute('data-fast-track-step', 'returned')
      const banner = page.getByTestId('fast-track-return-banner')
      await expect(banner).toContainText(RETURN_ISSUE_LABEL)
      await expect(banner).toContainText(RETURN_NOTE)
      await expect(banner).toContainText('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()
      await expect(page.getByTestId('fast-track-submit-panel')).toContainText('ผู้เสนอยังไม่ได้ลงนามในแบบ คบ.4')
    })

    await test.step('WIT0608 · เจ้าหน้าที่แก้ชุดวิธี (1+3 → 1+2) และช่วงเวลา (30 → 20 วัน) ลงนามใหม่แล้วส่งตรวจใหม่', async () => {
      await page.goto(`/form/4?caseNo=${CASE_NO}`)
      await page.getByTestId('kb4-method-option-3').click()
      await page.getByTestId('kb4-method-option-2').click()
      await fillKb5Period(page, CASE_NO, '2026-01-01', '2026-01-20')
      await officerSignKb4(page)

      await page.goto(DOSSIER_URL)
      await page.getByTestId('fast-track-submit-note').fill('ปรับวิธีที่เสนอและช่วงเวลาคุ้มครองตามข้อสั่งการ ผอ. แล้ว')
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรวจใหม่', 'ส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('director_review')
    })

    await test.step('กลับถึง ผอ. คนเดิมโดยตรง — ธงตีกลับถูกเคลียร์ ประตู WIT0606 ถูกตัดสินใหม่ ประวัติทั้งสองรอบยังอยู่', async () => {
      const c = await caseOf(page)
      const ft = c?.fastTrack as Rec
      expect(c?.owner).toBe(directorName)
      expect(ft.step).toBe('director_review')
      expect(ft.proposedMethods).toEqual([1, 2])
      expect(ft.temporaryDurationDays).toBe(20)
      expect(ft.returnRound).toBe(1)
      expect(ft.readinessCheckedAt).toBeFalsy()
      expect(c?.returned).toBe(false)
      expect(c?.directorReturn).toBe(false)
      expect(c?.returnIssueLabel).toBeFalsy()
      expect(c?.returnNote).toBeFalsy()

      const history = await historyOf(page)
      // รอบตีกลับและรอบส่งฉบับแก้ไข อยู่ในประวัติทั้งคู่ ไม่ถูกเขียนทับ
      expect(history.some((h) => (h.action ?? '').includes('ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5'))).toBe(true)
      expect(
        history.some(
          (h) => (h.action ?? '').includes('ฉบับแก้ไขให้ ผอ. ตรวจใหม่') && (h.detail ?? '').includes('ส่งตรง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น')
        )
      ).toBe(true)
      expect(history.some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await test.step('WIT0605 รอบใหม่ · ผอ. ยังอนุมัติไม่ได้จนกว่าจะลงนาม คบ.4 (ข้อ 13) แล้ว คบ.5', async () => {
      await switchRole(page, 'director')
      await expect(page.getByTestId('fast-track-approve-confirm')).toBeDisabled()
      await expect(page.getByTestId('fast-track-decision-panel')).toContainText('ต้องลงความเห็นข้อ 13 และลงนามในแบบ คบ.4 ก่อน')

      await page.goto(`/form/4?caseNo=${CASE_NO}`)
      await page.getByTestId('kb4-director-opinion').fill('เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1 และ 2 ฉบับแก้ไข')
      await page.getByTestId('kb4-sign-button').click()
      await signInModal(page, 'ผอ.สำนัก/กอง ผู้ลงนาม')
      await expect.poll(async () => (await formStore(page)).signatures['kb4-director']?.signed).toBe(true)

      // ลงนาม คบ.4 แล้วยังอนุมัติไม่ได้ — ต้องลงนามคำสั่ง คบ.5 ต่อ
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-approve-confirm')).toBeDisabled()
      await expect(page.getByTestId('fast-track-decision-panel')).toContainText('ต้องลงนามคำสั่งในแบบ คบ.5 ก่อน')

      await page.goto(`/form/5?caseNo=${CASE_NO}`)
      await page.getByTestId('kb5-sign-button').click()
      await signInModal(page, 'ผอ.สำนัก/กอง ผู้ลงนาม')
      await expect.poll(async () => (await formStore(page)).signatures['kb5-director']?.signed).toBe(true)
    })

    await test.step('WIT0609/0611 · อนุมัติและออกคำสั่ง คบ.5 ผ่านหลังแก้ไข', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-approve-confirm')).toBeEnabled()
      await page.getByTestId('fast-track-approve-confirm').click()
      await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง', 'แก้ไขทับไม่ได้อีก')
      await expect.poll(async () => ((await fastTrackOf(page)).step as string) ?? '').toBe('approved')

      const c = await caseOf(page)
      const ft = c?.fastTrack as Rec
      expect(c?.kb5Approved).toBe(true)
      expect(c?.hasKb5).toBe(true)
      // อนุมัติแล้วแฟ้มกลับเจ้าหน้าที่เพื่อแจ้งพยานรับทราบ (WIT0612) ไม่ค้างที่ ผอ.
      expect(c?.stage).toBe('staff_review')
      expect(c?.owner).toBe(officerName)
      expect(ft.proposedMethods).toEqual([1, 2])
      expect(ft.kb5SignedBy).toBeTruthy()
      expect(ft.returnRound).toBe(1)
      expect(c?.temporaryDeniedAt).toBeFalsy()
      expect(c?.activity7State).toBeFalsy()
      // ลงนามแล้ว ฉบับ คบ.5 ถูกล็อก
      expect((await formStore(page)).locks['5']).toBeTruthy()
    })
  })

  test('RRR-06-02 · [Negative] ผอ. ตีกลับโดยไม่ระบุเหตุผล หรือกดยกเลิก → แฟ้มไม่ขยับ ยังอยู่ที่ ผอ.', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)
    const before = await caseOf(page)
    expect(before?.stage).toBe('director_review')

    // เหตุผลว่าง → ยืนยันแล้วไม่ผ่าน (โมดัลยังเปิดอยู่ ไม่มีการเปลี่ยนสถานะ)
    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('evidence_missing')
    await page.getByTestId('return-confirm-button').click()
    // แอปแจ้งเตือนด้วย toast (ซึ่งแทนที่โมดัลเดิม) แฟ้มไม่ขยับ
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุประเด็นและเหตุผลที่ต้องแก้ไข')
    expect((await caseOf(page))?.stage).toBe('director_review')
    expect(((await fastTrackOf(page)).step)).toBe('director_review')

    // เปิดโมดัลใหม่ กรอกเหตุผลแล้วกดยกเลิก → ไม่มีอะไรเกิดขึ้น
    await page.locator('.swal2-toast').waitFor({ state: 'detached' })
    await page.getByTestId('return-case-button').click()
    await page.getByTestId('return-issue-select').selectOption('evidence_missing')
    await page.getByTestId('return-note-input').fill('หลักฐานไม่เพียงพอ')
    await page.locator('.swal2-popup').getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    await page.locator('.swal2-popup:not(.swal2-toast)').waitFor({ state: 'detached' })

    const after = await caseOf(page)
    expect(after?.stage).toBe('director_review')
    expect(after?.owner).toBe(before?.owner)
    expect(after?.returned).toBeFalsy()
    expect(after?.directorReturn).toBeFalsy()
    expect((after?.fastTrack as Rec).returnRound).toBe(0)
  })

  test('RRR-06-03 · [Full loop] ผอ. ลงนาม คบ.4/คบ.5 แล้วเปลี่ยนใจตีกลับ → ลายมือชื่อ ผอ. ถูกล้างและปลดล็อก คบ.5 ให้แก้เป็นฉบับใหม่', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(`/form/4?caseNo=${CASE_NO}`)
    await page.getByTestId('kb4-director-opinion').fill('เห็นชอบตามที่เสนอ')
    await page.getByTestId('kb4-sign-button').click()
    await signInModal(page, 'ผอ.สำนัก/กอง ผู้ลงนาม')
    await expect.poll(async () => (await formStore(page)).signatures['kb4-director']?.signed).toBe(true)

    await page.goto(`/form/5?caseNo=${CASE_NO}`)
    await page.getByTestId('kb5-sign-button').click()
    await signInModal(page, 'ผอ.สำนัก/กอง ผู้ลงนาม')
    await expect.poll(async () => (await formStore(page)).signatures['kb5-director']?.signed).toBe(true)
    // ลงนาม คบ.5 แล้วระบบล็อกฉบับอัตโนมัติ
    expect((await formStore(page)).locks['5']).toBeTruthy()

    // ยังไม่กดอนุมัติ — ตีกลับแทน
    await page.goto(DOSSIER_URL)
    await directorReturn(page, 'kb4_methods_unclear', 'วิธีที่เลือกยังไม่สอดคล้องกับระดับภัย ให้ทบทวนก่อนเสนอใหม่')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    const forms = await formStore(page)
    expect(forms.signatures['kb4-director']?.signed).toBeFalsy()
    expect(forms.signatures['kb5-director']?.signed).toBeFalsy()
    expect(forms.signatures['kb4-officer']?.signed).toBeFalsy()
    expect(forms.locks['5']).toBeFalsy()
    // ร่างเดิมยังอยู่ให้แก้ต่อ (ไม่ถูกลบ)
    expect(forms.drafts['4']?.[KB4_METHODS_FIELD]).toEqual([1, 3])

    const c = await caseOf(page)
    expect(c?.kb5Approved).toBeFalsy()
    expect((c?.fastTrack as Rec).step).toBe('returned')
    expect((c?.fastTrack as Rec).returnIssueLabel).toBe('วิธีคุ้มครองที่เลือกยังไม่สอดคล้องกับระดับภัย')
  })
})

test.describe('WIT0610 / WIT0614 — ผอ. ไม่อนุมัติคุ้มครองชั่วคราว แต่คำร้องหลักเดินต่อ', () => {
  test('RRR-06-04 · [Negative] ไม่อนุมัติชั่วคราวต้องมีเหตุผล · ยกเลิกจอยืนยันไม่มีผล · ยืนยันแล้วบันทึก temporaryDenied* โดยไม่ปิดคำร้องหลัก ไม่ออก คบ.10 และ activity7State ไม่ถูกแตะ', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)
    const before = await caseOf(page)
    const officerName = String(before?.assignedOfficer)
    expect(before?.stage).toBe('director_review')

    await page.getByTestId('fast-track-deny-button').click()
    // ไม่ระบุเหตุผล → ไม่มีจอยืนยัน แฟ้มไม่ขยับ
    await page.getByTestId('fast-track-deny-confirm').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    expect((await caseOf(page))?.temporaryDeniedAt).toBeFalsy()

    const reason = 'ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์'
    await page.getByTestId('fast-track-deny-reason').fill(reason)

    // ยกเลิกในจอยืนยัน → ไม่มีอะไรเกิดขึ้น
    await page.getByTestId('fast-track-deny-confirm').click()
    await cancelDialog(page)
    expect((await caseOf(page))?.temporaryDeniedAt).toBeFalsy()
    expect((await caseOf(page))?.stage).toBe('director_review')
    expect((await fastTrackOf(page)).step).toBe('director_review')

    await page.getByTestId('fast-track-deny-confirm').click()
    await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว', 'ไม่ออก คบ.10')
    await expect.poll(async () => (await fastTrackOf(page)).step).toBe('denied')

    const denied = await caseOf(page)
    const ft = denied?.fastTrack as Rec
    // WIT0610 — บันทึกผลไม่อนุมัติเฉพาะการคุ้มครองชั่วคราว
    expect(denied?.temporaryDeniedAt).toBeTruthy()
    expect(denied?.temporaryDeniedReason).toBe(reason)
    expect(denied?.kb5Approved).toBe(false)
    expect(ft.decidedAt).toBeTruthy()
    expect(ft.decidedBy).toBeTruthy()
    expect(ft.kb5SignedAt).toBeFalsy()
    // ข้อห้ามสองข้อ — ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 และ activity7State ไม่ถูกแตะ
    expect(denied?.activity7State).toBeFalsy()
    expect(denied?.closedAt).toBeFalsy()
    expect(denied?.kb10Signed).toBeFalsy()
    expect(denied?.appealDueAt).toBeFalsy()
    expect((denied?.extraForms ?? []) as number[]).not.toContain(10)
    expect(denied?.approvedMethods ?? []).toEqual([])
    expect(denied?.methodTracks ?? []).toEqual([])
    // ไม่ใช่การตีกลับ — ไม่มีธงตีกลับ/รอบแก้ไข
    expect(denied?.returned).toBeFalsy()
    expect(ft.returnRound).toBe(0)

    // WIT0614 — คำร้องหลักเดินต่อ: แฟ้มกลับเจ้าหน้าที่เพื่อจัดทำ/เสนอ คบ.6
    expect(denied?.stage).toBe('staff_review')
    expect(denied?.owner).toBe(officerName)
    expect(String(denied?.next)).toContain('คบ.6')
    const history = await historyOf(page)
    expect(history.some((h) => (h.detail ?? '').includes('ไม่ปิดคำร้องหลัก') && (h.detail ?? '').includes(reason))).toBe(true)
    expect(history.some((h) => (h.action ?? '').includes('คำร้องหลักยังเดินต่อ'))).toBe(true)
    await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('ไม่ออก คบ.10')
  })

  test('RRR-06-05 · [Full loop] หลังไม่อนุมัติ เจ้าหน้าที่รับงานต่อ: ไม่มีแผงส่ง คบ.4/คบ.5 อีก ปุ่มส่งต่อเป็นเส้นปกติและติดด่าน คบ.6 · ผอ. ตีกลับเส้นเร่งด่วนซ้ำไม่ได้', async ({
    page,
  }) => {
    // seed ด้วยบัญชีเจ้าหน้าที่ผู้รับผิดชอบแฟ้ม (ไม่งั้นสลับกลับเป็น officer แล้วเปิดแฟ้มไม่ได้) แล้วสลับเป็น ผอ. ไปตัดสิน
    // KB1_DONE: ข้ามด่าน คบ.1 (ด่านแรกสุดของปุ่มส่งต่อ) เพื่อให้เห็นด่าน คบ.6 ที่เป็นประเด็นของเทสต์
    await seedMockState(page, 'Case 3.1', 'officer', KB1_DONE)
    await page.goto(DOSSIER_URL)
    await switchRole(page, 'director')
    await page.getByTestId('fast-track-deny-button').click()
    await page.getByTestId('fast-track-deny-reason').fill('ยังไม่เข้าเงื่อนไขคุ้มครองชั่วคราว')
    await page.getByTestId('fast-track-deny-confirm').click()
    await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    // ผอ. ไม่มีปุ่มตีกลับแล้ว (แฟ้มไม่ได้อยู่ในมือ ผอ.) และไม่ถูกบังคับให้ตัดสินซ้ำ
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-decision-required-banner')).toHaveCount(0)

    await switchRole(page, 'officer')
    // ขั้น "ไม่อนุมัติ" ไม่ใช่รอบแก้ไข คบ.4 — ไม่มีแผงส่งฉบับแก้ไขให้ ผอ.
    await expect(page.getByTestId('fast-track-submit-panel')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-return-banner')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'denied')
    const forward = page.getByTestId('forward-case-button')
    await expect(forward).toContainText('ส่งผู้บังคับบัญชาชั้นต้น')
    await expect(forward).toBeDisabled()
    await expect(forward).toHaveAttribute('title', /คบ\.6/)
    expect((await caseOf(page))?.stage).toBe('staff_review')
  })
})

test.describe('ส่วนที่ UI ยังไม่รองรับ (Missing-in-app)', () => {
  // ผังเส้นทางเร่งด่วนส่งตรง ผอ. ไม่ผ่าน ผบช.ชั้นต้น ทั้งขาไปและขากลับ (submitFastTrackForDecision / returnFastTrackForRework)
  // จึงไม่มีขั้นที่ ผบช. ตรวจ/ตีกลับ คบ.4 · คบ.5 และไม่มีปุ่มตีกลับสำหรับ ผบช. ในการ์ดเส้นทางเร่งด่วน — รอยืนยันกับผู้ใช้ว่าต้องมีหรือไม่
  test.fixme('RRR-06-F1 · ผบช.ชั้นต้นตีกลับ คบ.4/คบ.5 ในเส้นทางเร่งด่วน — ไม่มีขั้น ผบช. ในเส้นทางนี้', async () => {})

  // returnFastTrackForRework ไม่เก็บ snapshot คบ.4 / คบ.5 ฉบับก่อนตีกลับลง revisions (useFormDraftStore.revisions)
  // รอบแก้ไขจึงแก้ทับร่างเดิมในที่เดียว เก็บได้เพียง fastTrack.returnIssueLabel/returnNote/returnedAt ของรอบล่าสุดกับ assignmentHistory
  // ผังคาดว่า "ฉบับแก้ไขเป็นเอกสารใหม่ เก็บฉบับเดิมไว้" — เปิดเทสต์เมื่อมีการเก็บเวอร์ชันก่อนหน้า
  test.fixme('RRR-06-F2 · คบ.4/คบ.5 ฉบับก่อนตีกลับถูกเก็บเป็นเวอร์ชันก่อนหน้า (revisions) ให้เปิดดูย้อนหลังได้', async () => {})

  // เมื่อตีกลับหลายรอบ fastTrack.returnIssueLabel/returnNote/returnedAt เก็บเฉพาะรอบล่าสุด (returnRound นับเท่านั้น)
  // ไม่มีรายการเหตุผลต่อรอบแยกต่างหาก นอกจาก assignmentHistory
  test.fixme('RRR-06-F3 · ตีกลับสองรอบติด: ประวัติเหตุผลแต่ละรอบเข้าถึงได้จากการ์ด (ไม่ใช่เฉพาะรอบล่าสุด)', async () => {})
})
