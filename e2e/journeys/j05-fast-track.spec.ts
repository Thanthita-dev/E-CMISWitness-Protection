import { expect, test } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, formRow, signInModal } from './journey-helpers'

/**
 * Journey J05 — เส้นทางเร่งด่วน: คบ.4 / ร่าง คบ.5 คุ้มครองชั่วคราว (แท็บ 06 → 08A → 08A-1)
 *
 * เดินต่อเนื่องในแฟ้มเดียว (Case 3 → 3.1 → 3.2 → 3.3) ผ่าน UI จริง:
 *   เจ้าหน้าที่ติ๊กวิธีใน คบ.4 + ส่งตรง ผอ. (WIT0603–0604) → ผอ. ตรวจ/ประตูข้อมูลครบ (WIT0605–0606)
 *   → ◇ อนุมัติ (WIT0609) → ลงนาม คบ.5 ล็อกฉบับ (WIT0611) → พยานยินยอม (WIT0612)
 *   → เปิดเส้นทางวิธีที่อนุมัติไปแท็บ 08 (WIT0613) → คำร้องหลักเดินต่อ (WIT0614)
 *
 * ทางแยก (◇ ในแท็บ 06):
 *   J05-A WIT0609 "ไม่อนุมัติ" → WIT0610 → WIT0614 เจ้าหน้าที่จัดทำ/เสนอ คบ.6 เข้าลำดับชั้นของแท็บ 05
 *   J05-B WIT0606 "ข้อมูลไม่ครบ" → WIT0607 ตีกลับตรงเจ้าหน้าที่ → WIT0608 แก้แล้วส่งใหม่ → ผ่านประตู → อนุมัติ
 */

const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const WITNESS = 'สมชาย ใจดี'
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`
const KB5_FORM_URL = `/form/5?caseNo=${CASE_NO}`

type Rec = Record<string, unknown>
const fastTrackOf = async (page: import('@playwright/test').Page) =>
  ((await readCase(page, CASE_NO))?.fastTrack ?? {}) as Rec
const historyOf = async (page: import('@playwright/test').Page) =>
  (((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>)

/** เจ้าหน้าที่จัดทำและบันทึก คบ.6 จากแถว คบ.6 ในแฟ้ม (ช่องบังคับ 1.1 / 2.2) แล้วกลับหน้าแฟ้ม */
async function prepareKb6(page: import('@playwright/test').Page) {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6/)
  await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill(OFFICER)
  await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill(WITNESS)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
}

/** WIT0606 ◇ ข้อมูลครบ → แผงตัดสิน WIT0609 */
async function passReadinessGate(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)
  await page.getByTestId('fast-track-ready-button').click()
  await confirmDialog(page, 'ยืนยันข้อมูลครบ', 'อนุมัติ / ไม่อนุมัติการคุ้มครองชั่วคราว')
  await expect(page.getByTestId('fast-track-decision-panel')).toBeVisible()
}

/** WIT0609 "อนุมัติ" → WIT0611 กรอกเลขคำสั่ง/ความเห็น ลงนาม คบ.5 แล้วยืนยัน */
async function approveAndSignKb5(page: import('@playwright/test').Page, orderNo: string, opinion: string) {
  await page.getByTestId('fast-track-approve-button').click()
  await page.getByTestId('kb5-order-no').fill(orderNo)
  await page.getByTestId('kb5-director-opinion').fill(opinion)
  await page.getByTestId('kb5-sign-button').click()
  await signInModal(page, DIRECTOR)
  await page.getByTestId('fast-track-approve-confirm').click()
  await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง', 'แก้ไขทับไม่ได้อีก')
  await expect.poll(async () => (await fastTrackOf(page)).step).toBe('approved')
}

test.describe('J05 · เส้นทางเร่งด่วน คบ.4/คบ.5', () => {
  test('J05 · เส้นทางเร่งด่วน: คบ.4/คบ.5 → ผอ. อนุมัติ → พยานยินยอม → เริ่มวิธีที่ 1 และคำร้องหลักเดินต่อ', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    // Case 3 — แฟ้มเร่งด่วนอยู่ที่เจ้าหน้าที่ผู้รับผิดชอบ ยังไม่เลือกวิธีตามข้อ 15 (seed ครั้งเดียว จากนั้นเดินผ่าน UI ล้วน)
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0601 · รับเส้นทางเร่งด่วนจากแท็บ 04', async () => {
      // ⚙️ ระบบ: การ์ด Fast Track รออยู่ ผลประเมินเป็นเร่งด่วน
      await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'drafting')
      const c = await readCase(page, CASE_NO)
      expect(c?.urgency).toBe('urgent')
      expect(c?.stage).toBe('staff_review')
    })

    await test.step('WIT0602 · แสดงคำร้อง ผลประเมินความเร่งด่วน และแบบ คบ.4/คบ.5', async () => {
      await expect(page.getByTestId('dossier-forms')).toContainText('คบ.4')
      await expect(page.getByTestId('dossier-forms')).toContainText('คบ.5')
      // คบ.6 ยังไม่แสดงจนกว่าจะตัดสินเรื่องชั่วคราว (ตามผัง)
      await expect(formRow(page, 'คบ.6')).toHaveCount(0)
    })

    await test.step('WIT0603 · จัดทำ คบ.4 ติ๊กวิธีข้อ 15 ได้หลายวิธี', async () => {
      // ยังไม่เลือกวิธี → ส่ง ผอ. ไม่ได้
      await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()

      await page.goto(KB4_FORM_URL)
      await page.getByTestId('kb4-method-option-1').click()
      await page.getByTestId('kb4-method-option-3').click()

      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 1')
      await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 3')
      await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()
    })

    await test.step('WIT0604 · ส่งตรง ผอ. ไม่ผ่านผู้บังคับบัญชาชั้นต้น', async () => {
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')

      const c = await readCase(page, CASE_NO)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.owner).not.toBe(SUPERVISOR)
      const ft = c?.fastTrack as Rec
      expect(ft.step).toBe('director_review')
      expect(ft.proposedMethods).toEqual([1, 3])
      // ไม่เคยแวะ ผบช.ชั้นต้น
      expect((await historyOf(page)).some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await switchRole(page, 'director')

    await test.step('WIT0605 · ผอ. ตรวจ คบ.4 ร่าง คบ.5 หลักฐาน ระดับภัย', async () => {
      await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
      // ยังไม่พิจารณาชั่วคราว → ห้ามส่งต่อรองเลขาธิการฯ
      await expect(page.getByTestId('fast-track-decision-required-banner')).toBeVisible()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    })

    await test.step('WIT0606 · ◇ ข้อมูลครบและพร้อมพิจารณา → ครบ', async () => {
      await passReadinessGate(page)
      expect((await fastTrackOf(page)).readinessCheckedAt).toBeTruthy()
    })

    await test.step('WIT0609 · ◇ อนุมัติคุ้มครองชั่วคราว → อนุมัติ', async () => {
      await expect(page.getByTestId('fast-track-approve-button')).toBeVisible()
      await expect(page.getByTestId('fast-track-deny-button')).toBeVisible()
    })

    await test.step('WIT0611 · ผอ. ลงนาม คบ.5 ระบบล็อกฉบับลงนาม', async () => {
      await approveAndSignKb5(page, '045/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1 และ 3 ทันที')

      const c = await readCase(page, CASE_NO)
      expect(c?.kb5Approved).toBe(true)
      expect((c?.fastTrack as Rec).kb5OrderNo).toBe('045/2569')
      expect((c?.fastTrack as Rec).kb5SignedBy).toBe(DIRECTOR)
      expect(c?.temporaryDeniedAt).toBeFalsy()

      const locked = await page.evaluate(() => {
        const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
        return raw ? Boolean(JSON.parse(raw).state.locks['5']) : false
      })
      expect(locked).toBe(true)

      await page.goto(KB5_FORM_URL)
      await expect(page.getByText('ฉบับลงนามถูกล็อก — แก้ทับไม่ได้')).toBeVisible()
    })

    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0612 · พยานรับทราบ คบ.5 และลงนามยินยอม', async () => {
      // ยังไม่ยินยอม → ยังไม่มีวิธีส่งไปแท็บ 08
      expect(((await readCase(page, CASE_NO))?.approvedMethods ?? []) as unknown[]).toEqual([])

      await page.getByTestId('kb5-witness-ack-button').click()
      await signInModal(page, WITNESS)
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('active')

      const consents = ((await readCase(page, CASE_NO))?.consents ?? []) as Rec[]
      expect(consents.some((c) => c.ref === 'kb5' && c.consented === true)).toBe(true)
    })

    await test.step('WIT0613 · ส่งวิธีที่อนุมัติไปเปิดเส้นทางที่แท็บ 08A', async () => {
      // ⚙️ ระบบเปิดเส้นทางรายวิธีให้อัตโนมัติเมื่อพยานยินยอม
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([1, 3])
      expect(((c?.methodTracks ?? []) as Rec[]).map((t) => t.method)).toEqual([1, 3])

      await page.goto('/protection-methods')
      await expect(page.getByText(CASE_NO)).toBeVisible()
      for (const m of [1, 3]) {
        await expect(page.locator(`a[href="/protection-method/${m}?caseNo=${CASE_NO}"]`)).toBeVisible()
      }
    })

    await test.step('WIT0614 · คำร้องหลักยังเดินต่อ (ควบคู่การคุ้มครองชั่วคราว)', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'active')
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('คำร้องหลักยังเดินต่อ')

      const c = await readCase(page, CASE_NO)
      // งานกลับมาอยู่ในมือเจ้าหน้าที่ staff_review เพื่อจัดทำ/เสนอ คบ.6 ต่อ; ยังไม่มีผลพิจารณาคำร้องหลัก
      expect(c?.stage).toBe('staff_review')
      expect(c?.owner).toBe(OFFICER)
      expect(c?.activity7State).toBeFalsy()
      expect(c?.closedAt).toBeFalsy()
      await expect(page.getByTestId('forward-case-button')).toBeVisible()
      // ปุ่มส่งต่อมีอยู่ แต่ยังกดไม่ได้จนกว่าจะจัดทำ คบ.6 (ทำในขั้นท้ายของเส้นทางนี้)
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    })

    await test.step('WIT0614 (ต่อ) · เจ้าหน้าที่จัดทำ คบ.6 แล้วเสนอคำร้องหลัก (แท็บ 05)', async () => {
      await page.goto(DOSSIER_URL)
      // ตัดสินเรื่องชั่วคราวแล้ว → ต้องมี คบ.6 ก่อนจึงส่งต่อคำร้องหลักได้
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await prepareKb6(page)
      await page.getByTestId('forward-case-button').click()
      await confirmDialog(page, 'ยืนยันส่งต่อ')
      await expectMainPetitionInTab05(page)
    })

    await test.step('08A / 08A-1 · เริ่มวิธีที่ 1 ตาม คบ.5 (คุ้มครองชั่วคราว)', async () => {
      await page.goto(`/protection-method/1?caseNo=${CASE_NO}`)
      // WIT0819 จัดแผนปฏิบัติ → WIT0820 ชี้แจง Need-to-Know
      await page.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร').fill('ร.ต.อ. ก. และสมาชิก 4 นาย')
      await page.getByLabel('ยานพาหนะ').fill('รถกระบะตู้ทึบ 1 คัน')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByLabel('ผู้ชี้แจง').fill(OFFICER)
      // WIT0821 กรณีเร่งด่วนใช้ คบ.5 แทน คบ.8/คบ.11 ได้ → เริ่มปฏิบัติจริงได้โดยไม่ต้องรอผลคำร้องหลัก
      await expect(page.getByTestId('method-1-start')).toBeEnabled()
      await page.getByTestId('method-1-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'ACTIVE')

      const c = await readCase(page, CASE_NO)
      const track = ((c?.methodTracks ?? []) as Rec[]).find((t) => t.method === 1)
      expect(track?.status).toBe('active')
      expect(track?.startedAt).toBeTruthy()
      await expect(page.getByText(/สถานะปัจจุบัน: TEMPORARY_ACTIVE/)).toBeVisible()
      // ยังเป็นคำสั่งชั่วคราว คบ.5 — ยังไม่มี คบ.9/คบ.11/คบ.8 ของคำร้องหลัก
      expect(c?.kb9Signed).toBeFalsy()
      expect(c?.kb11Signed).toBeFalsy()
      expect(c?.kb8Signed).toBeFalsy()
      // ต่างจากผัง (WIT0614 คำร้องหลักเดินคู่ขนาน): ตอนนี้การเริ่มปฏิบัติวิธีที่ 1 ทำให้ stage ของแฟ้มเปลี่ยนจาก
      // supervisor_review เป็น protection ทับขั้นของคำร้องหลักที่กำลังรอ ผบช.ชั้นต้นอยู่ (ผังให้สองเส้นเดินแยกกัน)
      expect(c?.stage).toBe('protection')
    })
  })

  test('J05-A · [ทางแยก] WIT0609 ไม่อนุมัติ → WIT0610 → WIT0614 คำร้องหลักไม่ปิด ไม่ออก คบ.10 เจ้าหน้าที่เสนอ คบ.6 เข้าแท็บ 05', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    // Case 3.1 — เสนอ ผอ. แล้ว รอผ่านประตู WIT0606
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0605/WIT0606 · ผอ. ตรวจและผ่านประตูข้อมูลครบ', async () => {
      await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
      await passReadinessGate(page)
    })

    await test.step('WIT0609 · ◇ ไม่อนุมัติคุ้มครองชั่วคราว (ยกเลิกก่อน แล้วยืนยันสองชั้น)', async () => {
      await page.getByTestId('fast-track-deny-button').click()
      await page
        .getByTestId('fast-track-deny-reason')
        .fill('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์')
      await page.getByTestId('fast-track-deny-confirm').click()
      await cancelDialog(page)
      expect((await readCase(page, CASE_NO))?.temporaryDeniedAt).toBeFalsy()
      expect((await readCase(page, CASE_NO))?.stage).toBe('director_review')
    })

    await test.step('WIT0610 · บันทึกไม่อนุมัติ ไม่ปิดคำร้องหลัก ไม่ออก คบ.10', async () => {
      await page.getByTestId('fast-track-deny-confirm').click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว', 'ไม่ออก คบ.10')
      await expect.poll(async () => (await fastTrackOf(page)).step).toBe('denied')

      const c = await readCase(page, CASE_NO)
      expect(c?.temporaryDeniedAt).toBeTruthy()
      expect(c?.temporaryDeniedReason).toContain('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที')
      expect(c?.kb5Approved).toBe(false)
      expect(c?.activity7State).toBeFalsy()
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb10Signed).toBeFalsy()
      expect(c?.appealDueAt).toBeFalsy()
      expect((c?.extraForms ?? []) as number[]).not.toContain(10)
      expect((await historyOf(page)).some((h) => (h.detail ?? '').includes('ไม่ปิดคำร้องหลัก'))).toBe(true)
      await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('ไม่ออก คบ.10')
    })

    await test.step('WIT0614 · งานกลับเจ้าหน้าที่ คำร้องหลักเดินต่อที่ คบ.6', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.stage).toBe('staff_review')
      expect(c?.owner).toBe(OFFICER)
      expect(c?.next).toContain('คบ.6')
      expect((await historyOf(page)).some((h) => (h.detail ?? '').includes('จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง'))).toBe(true)
      // ผอ. ผ่านเรื่องชั่วคราวแล้ว แบนเนอร์ห้ามส่งต่อหายไป
      await expect(page.getByTestId('fast-track-decision-required-banner')).toHaveCount(0)
    })

    await switchRole(page, 'officer')

    await test.step('WIT0614 (ต่อ) · เจ้าหน้าที่จัดทำ/บันทึก คบ.6 แล้วเสนอเข้าลำดับชั้น (แท็บ 05)', async () => {
      await expect(formRow(page, 'คบ.6')).toHaveCount(1)
      // ยังไม่มี คบ.6 → ส่งต่อไม่ได้ (เส้นทางคำร้องหลักต้องมี คบ.6 ในชุดเสนอ)
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await prepareKb6(page)
      expect((await readCase(page, CASE_NO))?.kb6SupervisorSignedAt).toBeFalsy()

      const forward = page.getByTestId('forward-case-button')
      await expect(forward).toBeEnabled()
      await forward.click()
      await confirmDialog(page, 'ยืนยันส่งต่อ')
      await expectMainPetitionInTab05(page)
      // ยังไม่ปิดคำร้องหลัก ไม่มี คบ.10
      expect((await readCase(page, CASE_NO))?.kb10Signed).toBeFalsy()
    })
  })

  test('J05-B · [ทางแยก] WIT0606 ข้อมูลไม่ครบ → WIT0607 ตีกลับตรงเจ้าหน้าที่ → WIT0608 แก้แล้วส่งใหม่ → ผ่านประตู → อนุมัติ', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0606 · ◇ ข้อมูลไม่ครบ → WIT0607 ส่งกลับตรงเจ้าหน้าที่', async () => {
      await page.getByTestId('fast-track-incomplete-button').click()
      await page.getByTestId('fast-track-return-issue').selectOption('kb5_draft_incomplete')
      await page
        .getByTestId('fast-track-return-note')
        .fill('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงานและช่วงเวลาคุ้มครอง ให้เติมให้ครบแล้วเสนอใหม่')
      await page.getByTestId('fast-track-return-confirm').click()
      await confirmDialog(page, 'ยืนยันส่งกลับแก้ไข', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

      const c = await readCase(page, CASE_NO)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.owner).not.toBe(SUPERVISOR)
      expect(c?.directorReturn).toBe(true)
      const ft = c?.fastTrack as Rec
      expect(ft.step).toBe('returned')
      expect(ft.returnRound).toBe(1)
      expect(ft.readinessCheckedAt).toBeFalsy()
      expect((await historyOf(page)).some((h) => (h.detail ?? '').includes('ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ'))).toBe(true)
    })

    await switchRole(page, 'officer')

    await test.step('WIT0608 · เจ้าหน้าที่แก้แล้วส่ง ผอ. ตรวจใหม่ (วนกลับ WIT0605)', async () => {
      await expect(page.getByTestId('fast-track-return-banner')).toContainText('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงาน')
      await page.getByTestId('fast-track-submit-note').fill('เติมชุดเจ้าพนักงานและช่วงเวลาคุ้มครองในร่าง คบ.5 ครบแล้ว')
      await page.getByTestId('fast-track-submit-button').click()
      await confirmDialog(page, 'ยืนยันส่งตรวจใหม่', 'ส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง')
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')

      const c = await readCase(page, CASE_NO)
      expect(c?.owner).toBe(DIRECTOR)
      expect((c?.fastTrack as Rec).step).toBe('director_review')
      expect(c?.directorReturn).toBe(false)
      expect(c?.returned).toBe(false)
      const h = await historyOf(page)
      expect(h.some((x) => (x.action ?? '').includes('ฉบับแก้ไขให้ ผอ. ตรวจใหม่') && (x.detail ?? '').includes('ส่งตรง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น'))).toBe(true)
      expect(h.some((x) => (x.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
    })

    await switchRole(page, 'director')

    await test.step('WIT0605/WIT0606 · ผอ. ตรวจใหม่ ต้องผ่านประตูอีกรอบ แล้ว WIT0609 อนุมัติ', async () => {
      // ผลตรวจรอบก่อนถูกล้างแล้ว — แผงตัดสินต้องยังไม่โผล่จนกว่าจะกดครบอีกครั้ง
      await passReadinessGate(page)
      await approveAndSignKb5(page, '050/2569', 'เห็นชอบหลังแก้ไขร่าง คบ.5 ครบถ้วนแล้ว')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb5Approved).toBe(true)
      expect((c?.fastTrack as Rec).returnRound).toBe(1)
    })
  })
})

/** หลังเสนอคำร้องหลัก — แฟ้มเร่งด่วนที่ตัดสินเรื่องชั่วคราวแล้วเข้าแท็บ 05 ผ่านผู้บังคับบัญชาชั้นต้นตามผัง (WIT0614) */
async function expectMainPetitionInTab05(page: import('@playwright/test').Page) {
  await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('supervisor_review')
  expect((await readCase(page, CASE_NO))?.owner).toBe(SUPERVISOR)
  // คำร้องหลักยังไม่ปิด ไม่มี คบ.10
  expect((await readCase(page, CASE_NO))?.kb10Signed).toBeFalsy()
}
