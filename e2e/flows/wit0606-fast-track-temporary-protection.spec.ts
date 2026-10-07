import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 06 · WIT0603 → WIT0614 — เส้นทางเร่งด่วน คบ.4 / คบ.5 และการคุ้มครองชั่วคราว
 *
 * ผัง: WIT0603 จัดทำ คบ.4 พร้อมร่าง คบ.5 เลือกวิธีตามข้อ 15 ได้มากกว่าหนึ่งวิธี → WIT0604 ส่งตรง ผอ.
 * → WIT0605 ผอ. ตรวจ → **WIT0606 ข้อมูลครบและพร้อมพิจารณา?**
 *      แขนง "ไม่ครบ" → WIT0607 ตีกลับตรงเจ้าหน้าที่ → WIT0608 แก้แล้วส่งตรวจใหม่ → วนกลับ WIT0605
 *      แขนง "ครบ"   → WIT0609 อนุมัติคุ้มครองชั่วคราว?
 *          "ไม่อนุมัติ" → WIT0610 ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 → WIT0614
 *          "อนุมัติ"   → WIT0611 ลงนาม คบ.5 และล็อกฉบับ → WIT0612 พยานยินยอม
 *                        → WIT0613 ส่งวิธีที่อนุมัติไปแท็บ 08 · และ WIT0614 คำร้องหลักเดินคู่ขนาน
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const WITNESS = 'สมชาย ใจดี'

/**
 * กดยืนยันในจอยืนยันของการ์ดเส้นทางเร่งด่วน — ทุกปุ่มที่เปลี่ยนสถานะแฟ้มต้องผ่านจอนี้ก่อน
 * ตรวจข้อความสรุปที่แสดงไว้ด้วย เพราะจอนี้มีหน้าที่บอก "สิ่งที่กำลังจะเกิดขึ้นจริง"
 */
async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ยกเลิกในจอยืนยัน — ต้องไม่มีอะไรเกิดขึ้นกับแฟ้ม */
async function cancelDialog(page: Page) {
  const dialog = page.locator('.swal2-popup')
  await dialog.waitFor()
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ลงลายมือชื่อในโมดัลลายมือชื่ออิเล็กทรอนิกส์ที่เพิ่งเปิดขึ้น */
async function signInModal(page: Page, signerName: string) {
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await nameInput.fill(signerName)
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

test.describe('WIT0603–WIT0614 — เส้นทางเร่งด่วน: อนุมัติคุ้มครองชั่วคราว', () => {
  test('TC-040 · [Happy] เส้นอนุมัติ: เลือกวิธีข้อ 15 ใน คบ.4 → ส่งตรง ผอ. → ข้อมูลครบ → อนุมัติ → ลงนาม คบ.5 → พยานยินยอม → เปิดเส้นทางแท็บ 08', async ({
    page,
  }) => {
    // Case 3 — เคสเร่งด่วนอยู่ที่เจ้าหน้าที่ผู้รับผิดชอบ ยังไม่ได้เลือกวิธีตามข้อ 15
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)

    // WIT0603 — ยังเลือกวิธีไม่ครบ จึงยังส่งให้ ผอ. ไม่ได้
    await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'drafting')
    await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()

    // WIT0603 — ติ๊กวิธีตามข้อ 15 ในแบบ คบ.4 ได้มากกว่าหนึ่งวิธี
    await page.goto(KB4_FORM_URL)
    await page.getByTestId('kb4-method-option-1').click()
    await page.getByTestId('kb4-method-option-3').click()

    // ค่าที่ติ๊กผูกกับแฟ้มจริง ไม่ใช่แค่ตัวหนังสือบนเอกสาร — การ์ดในแฟ้มอ่านค่าได้ทันที
    await page.goto(DOSSIER_URL)
    const methods = page.getByTestId('fast-track-methods')
    await expect(methods).toContainText('วิธีที่ 1')
    await expect(methods).toContainText('วิธีที่ 3')

    // WIT0604 — ส่งตรงถึง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น (ผ่านจอยืนยันก่อน)
    await page.getByTestId('fast-track-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')

    const submitted = await readCase(page, CASE_NO)
    expect(submitted?.owner).toBe(DIRECTOR)
    expect(submitted?.owner).not.toBe(SUPERVISOR)
    expect((submitted?.fastTrack as Record<string, unknown>)?.step).toBe('director_review')
    expect((submitted?.fastTrack as Record<string, unknown>)?.proposedMethods).toEqual([1, 3])

    // WIT0605 / WIT0606 — ผอ. ตรวจแล้วตัดสินว่าข้อมูลครบและพร้อมพิจารณา
    await switchRole(page, 'director')
    await expect(page.getByTestId('fast-track-review-list')).toBeVisible()
    // ประตู WIT0606 ยังไม่ผ่าน จึงยังไม่มีปุ่มอนุมัติของ WIT0609
    await expect(page.getByTestId('fast-track-decision-panel')).toHaveCount(0)

    await page.getByTestId('fast-track-ready-button').click()
    await confirmDialog(page, 'ยืนยันข้อมูลครบ', 'อนุมัติ / ไม่อนุมัติการคุ้มครองชั่วคราว')
    await expect(page.getByTestId('fast-track-decision-panel')).toBeVisible()

    // WIT0609 "อนุมัติ" → WIT0611 บันทึกความเห็นใน คบ.4 และลงนาม คบ.5
    await page.getByTestId('fast-track-approve-button').click()
    await page.getByTestId('kb5-order-no').fill('045/2569')
    await page.getByTestId('kb5-director-opinion').fill('เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1 และ 3 ทันที')
    await page.getByTestId('kb5-sign-button').click()
    await signInModal(page, DIRECTOR)
    await page.getByTestId('fast-track-approve-confirm').click()
    await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง', 'แก้ไขทับไม่ได้อีก')

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('approved')

    const approved = await readCase(page, CASE_NO)
    // จุดเดียวในระบบที่เขียนค่า kb5Approved — หน้าอื่นทั้งหมดรออ่านค่านี้อยู่
    expect(approved?.kb5Approved).toBe(true)
    expect((approved?.fastTrack as Record<string, unknown>)?.kb5OrderNo).toBe('045/2569')
    expect((approved?.fastTrack as Record<string, unknown>)?.kb5SignedBy).toBe(DIRECTOR)
    // WIT0610 ไม่ได้เกิด — ไม่มีการบันทึกไม่อนุมัติชั่วคราว
    expect(approved?.temporaryDeniedAt).toBeFalsy()

    // WIT0611 — ระบบล็อกฉบับลงนาม ห้ามแก้ทับ
    const kb5Locked = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      return raw ? Boolean(JSON.parse(raw).state.locks['5']) : false
    })
    expect(kb5Locked).toBe(true)

    // WIT0612 — พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอม (ความยินยอมอ้างอิง คบ.5 แทน คบ.11)
    await switchRole(page, 'officer')
    await page.getByTestId('kb5-witness-ack-button').click()
    await signInModal(page, WITNESS)

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('active')

    const active = await readCase(page, CASE_NO)
    const consents = (active?.consents ?? []) as Array<Record<string, unknown>>
    expect(consents.some((c) => c.ref === 'kb5' && c.consented === true)).toBe(true)

    // WIT0613 — ส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติที่แท็บ 08
    expect(active?.approvedMethods).toEqual([1, 3])
    const tracks = (active?.methodTracks ?? []) as Array<Record<string, unknown>>
    expect(tracks.map((t) => t.method)).toEqual([1, 3])

    // WIT0614 — คำร้องหลักยังเดินต่อควบคู่กัน และยังไม่มีผลพิจารณาคำร้องหลักใด ๆ
    await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('คำร้องหลักยังเดินต่อ')
    expect(active?.activity7State).toBeFalsy()
  })
})

test.describe('WIT0606 แขนง "ไม่ครบ" — วงตีกลับของเส้นทางเร่งด่วน', () => {
  test('TC-042 · [Happy] เส้นตีกลับ: WIT0607 ลงตรงถึงเจ้าหน้าที่ ไม่ผ่าน ผบช.ชั้นต้น แล้ว WIT0608 ส่งกลับขึ้น ผอ. โดยตรง', async ({
    page,
  }) => {
    // Case 3.1 — เสนอ ผอ. แล้ว รอผ่านประตู WIT0606
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    // WIT0606 แขนง "ไม่ครบ" → WIT0607 บันทึกเหตุผลและประเด็นแก้ไข
    await page.getByTestId('fast-track-incomplete-button').click()
    await page.getByTestId('fast-track-return-issue').selectOption('kb5_draft_incomplete')
    await page
      .getByTestId('fast-track-return-note')
      .fill('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงานและช่วงเวลาคุ้มครอง ให้เติมให้ครบแล้วเสนอใหม่')
    await page.getByTestId('fast-track-return-confirm').click()
    await confirmDialog(page, 'ยืนยันส่งกลับแก้ไข', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    const returned = await readCase(page, CASE_NO)
    // งานลงถึงมือเจ้าหน้าที่ผู้รับผิดชอบโดยตรง ไม่แวะ ผบช.ชั้นต้น
    expect(returned?.owner).toBe(OFFICER)
    expect(returned?.owner).not.toBe(SUPERVISOR)
    expect(returned?.directorReturn).toBe(true)
    expect((returned?.fastTrack as Record<string, unknown>)?.step).toBe('returned')
    expect((returned?.fastTrack as Record<string, unknown>)?.returnRound).toBe(1)
    // ประตู WIT0606 ต้องถูกตัดสินใหม่ในรอบหน้า
    expect((returned?.fastTrack as Record<string, unknown>)?.readinessCheckedAt).toBeFalsy()

    const history = (returned?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => (h.detail ?? '').includes('ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ'))).toBe(true)

    // WIT0608 — เจ้าหน้าที่แก้แล้วส่ง ผอ. ตรวจใหม่ วนกลับเข้า WIT0605
    await switchRole(page, 'officer')
    await expect(page.getByTestId('fast-track-return-banner')).toContainText('ร่างคำสั่ง คบ.5 ยังไม่ระบุชุดเจ้าพนักงาน')
    await page.getByTestId('fast-track-submit-note').fill('เติมชุดเจ้าพนักงานและช่วงเวลาคุ้มครองในร่าง คบ.5 ครบแล้ว')
    await page.getByTestId('fast-track-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่งตรวจใหม่', 'ส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง')

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')

    const resubmitted = await readCase(page, CASE_NO)
    expect(resubmitted?.owner).toBe(DIRECTOR)
    expect((resubmitted?.fastTrack as Record<string, unknown>)?.step).toBe('director_review')
    expect(resubmitted?.directorReturn).toBe(false)
    expect(resubmitted?.returned).toBe(false)

    // ตลอดวง WIT0607 → WIT0608 ต้องไม่มีขั้นที่งานตกไปอยู่กับ ผบช.ชั้นต้น
    const fullHistory = (resubmitted?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(fullHistory.some((h) => (h.action ?? '').includes('ฉบับแก้ไขให้ ผอ. ตรวจใหม่') && (h.detail ?? '').includes('ส่งตรง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น'))).toBe(true)
    expect(fullHistory.some((h) => (h.action ?? '').includes('รอกลั่นกรอง'))).toBe(false)
  })
})

test.describe('WIT0610 — ไม่อนุมัติชั่วคราว แต่คำร้องหลักยังเดินต่อ', () => {
  test('TC-043 · [Negative] เส้นไม่อนุมัติ: ไม่ปิดคำร้องหลัก ไม่ออก คบ.10 และไม่เกิดสิทธิอุทธรณ์', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    // ต้องผ่านประตู WIT0606 ก่อน จึงจะตัดสิน WIT0609 ได้
    await page.getByTestId('fast-track-ready-button').click()
    await confirmDialog(page, 'ยืนยันข้อมูลครบ')
    await page.getByTestId('fast-track-deny-button').click()
    await page
      .getByTestId('fast-track-deny-reason')
      .fill('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที ให้เดินคำร้องหลักตามปกติและติดตามสถานการณ์')

    // กดยกเลิกในจอยืนยันก่อน — ต้องไม่มีอะไรเกิดขึ้นกับแฟ้ม
    await page.getByTestId('fast-track-deny-confirm').click()
    await cancelDialog(page)
    expect((await readCase(page, CASE_NO))?.temporaryDeniedAt).toBeFalsy()
    expect((await readCase(page, CASE_NO))?.stage).toBe('director_review')

    await page.getByTestId('fast-track-deny-confirm').click()
    // จอยืนยันต้องย้ำสองข้อห้ามที่ผังเน้นตัวหนา ก่อนผู้ใช้ตัดสินใจ
    await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว', 'ไม่ออก คบ.10')

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('denied')

    const denied = await readCase(page, CASE_NO)
    expect(denied?.temporaryDeniedAt).toBeTruthy()
    expect(denied?.temporaryDeniedReason).toContain('ระดับภัยยังไม่ถึงขั้นต้องคุ้มครองทันที')
    expect(denied?.kb5Approved).toBe(false)

    // ข้อห้ามสองข้อที่ผังเน้นตัวหนา — ไม่ปิดคำร้องหลัก และไม่ออก คบ.10
    expect(denied?.activity7State).toBeFalsy()
    expect(denied?.closedAt).toBeFalsy()
    expect(denied?.kb10Signed).toBeFalsy()
    expect(denied?.appealDueAt).toBeFalsy()
    expect((denied?.extraForms ?? []) as number[]).not.toContain(10)

    // WIT0614 — งานกลับไปที่เจ้าหน้าที่เพื่อเดินคำร้องหลักต่อที่ คบ.6
    expect(denied?.stage).toBe('staff_review')
    expect(denied?.owner).toBe(OFFICER)
    expect(denied?.next).toContain('คบ.6')

    const history = (denied?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => (h.detail ?? '').includes('ไม่ปิดคำร้องหลัก'))).toBe(true)
    expect(history.some((h) => (h.detail ?? '').includes('จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง'))).toBe(true)

    await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('ไม่ออก คบ.10')
  })
})

test.describe('ห้ามลัดขั้นตอน — เคสเร่งด่วนต้องตัดสินเรื่องชั่วคราวก่อน', () => {
  test('ผอ. ส่งต่อขึ้นรองเลขาธิการฯ ไม่ได้ ตราบใดที่ยังไม่พิจารณา คบ.4 / คบ.5', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    await expect(page.getByTestId('fast-track-decision-required-banner')).toBeVisible()
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()
    await expect(forwardButton).toHaveAttribute('title', /ยังไม่ได้พิจารณาคุ้มครองชั่วคราว/)

    // แฟ้มยังอยู่ที่ ผอ. ไม่ขยับไป deputy_review
    expect((await readCase(page, CASE_NO))?.stage).toBe('director_review')

    // ตัดสินเรื่องชั่วคราวแล้ว (ไม่อนุมัติ) — คำร้องหลักจึงเดินต่อได้ตามลำดับชั้นปกติ
    await page.getByTestId('fast-track-ready-button').click()
    await confirmDialog(page, 'ยืนยันข้อมูลครบ')
    await page.getByTestId('fast-track-deny-button').click()
    await page.getByTestId('fast-track-deny-reason').fill('ยังไม่เข้าเงื่อนไขคุ้มครองชั่วคราว')
    await page.getByTestId('fast-track-deny-confirm').click()
    await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว')

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')
    await expect(page.getByTestId('fast-track-decision-required-banner')).toHaveCount(0)
  })
})
