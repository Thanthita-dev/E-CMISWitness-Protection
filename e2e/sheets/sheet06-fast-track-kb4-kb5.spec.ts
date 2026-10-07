import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 06 · เส้นทางเร่งด่วน: คบ.4 / คบ.5 (TC-040 .. TC-048)
 *
 * เคสหลัก (TC-040, TC-042, TC-043) ครอบคลุมแล้วใน `e2e/flows/wit0606-fast-track-temporary-protection.spec.ts`
 * — ไฟล์นี้เก็บส่วนที่เหลือ: เลือกหลายวิธีพร้อมกัน (TC-041) · ห้ามส่งผ่านผู้บังคับบัญชาชั้นต้น (TC-044) ·
 * ห้ามเริ่มปฏิบัติก่อนพยานยินยอม (TC-045) · ห้ามแก้ทับ คบ.5 ที่ลงนามแล้ว (TC-046) ·
 * คำร้องหลักเดินคู่ขนาน (TC-047) · เพดานรวม 180 วัน (TC-048)
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`
const KB5_FORM_URL = `/form/5?caseNo=${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const WITNESS = 'สมชาย ใจดี'

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

async function signInModal(page: Page, signerName: string) {
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await nameInput.fill(signerName)
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

/** ผ่าน WIT0605/0606/0609 จนอนุมัติ คบ.5 — ใช้เตรียมสถานะสำหรับหลาย TC ที่ต้องเริ่มจากขั้น "อนุมัติแล้ว" */
async function approveTemporaryProtection(page: Page, orderNo: string, opinion: string) {
  await page.getByTestId('fast-track-ready-button').click()
  await confirmDialog(page, 'ยืนยันข้อมูลครบ')
  await page.getByTestId('fast-track-approve-button').click()
  await page.getByTestId('kb5-order-no').fill(orderNo)
  await page.getByTestId('kb5-director-opinion').fill(opinion)
  await page.getByTestId('kb5-sign-button').click()
  await signInModal(page, DIRECTOR)
  await page.getByTestId('fast-track-approve-confirm').click()
  await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง')
}

test.describe('TC-041 — เลือกวิธีคุ้มครองมากกว่า 1 วิธีพร้อมกัน', () => {
  test('TC-041 · [Happy] อนุมัติวิธี 15(1),(2),(4) พร้อมกัน แล้วเปิดเส้นทางปฏิบัติแยกทุกวิธี', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'director', {
      fastTrack: {
        step: 'director_review',
        proposedMethods: [1, 2, 4],
        submittedAt: '10/09/2569 09:40',
        submittedBy: OFFICER,
        submitNote: 'จัดทำ คบ.4 และร่างคำสั่ง คบ.5 พร้อมหลักฐานภัยคุกคามครบถ้วนแล้ว',
        returnRound: 0,
      },
    })
    await page.goto(DOSSIER_URL)

    // WIT0605/0606 — รายการตรวจต้องแสดงครบทั้ง 3 วิธีที่เสนอ
    await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 1')
    await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 2')
    await expect(page.getByTestId('fast-track-methods')).toContainText('วิธีที่ 4')

    await approveTemporaryProtection(page, '046/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่ 1, 2 และ 4 พร้อมกัน')

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('approved')

    // WIT0612 — พยานยินยอม แล้วส่งวิธีที่อนุมัติทั้งหมดไปเปิดเส้นทางปฏิบัติพร้อมกัน (WIT0613)
    await switchRole(page, 'officer')
    await page.getByTestId('kb5-witness-ack-button').click()
    await signInModal(page, WITNESS)

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('active')

    const active = await readCase(page, CASE_NO)
    expect(active?.approvedMethods).toEqual([1, 2, 4])
    const tracks = (active?.methodTracks ?? []) as Array<Record<string, unknown>>
    expect(tracks.map((t) => t.method).sort()).toEqual([1, 2, 4])
    // แต่ละเส้นทางเปิดเป็นอิสระต่อกัน — สถานะเริ่มต้นแยกรายวิธี ไม่ผูกกัน
    expect(tracks.every((t) => t.status === 'pending')).toBe(true)

    // หน้าแยกวิธีปฏิบัติ (08A/08B) ต้องแสดงทั้ง 3 เส้นทางเป็นการ์ดแยกกัน แต่ละใบลิงก์ไปคนละ /protection-method/$method
    await page.goto('/protection-methods')
    for (const method of [1, 2, 4]) {
      await expect(page.locator(`a[href="/protection-method/${method}?caseNo=${CASE_NO}"]`)).toBeVisible()
    }
  })
})

test.describe('TC-044 — เส้นทางเร่งด่วนต้องส่งตรง ผอ. เท่านั้น', () => {
  test('TC-044 · [Negative] ไม่มีตัวเลือกส่งผ่านผู้บังคับบัญชาชั้นต้นในขั้นเสนอ', async ({ page }) => {
    await seedMockState(page, 'Case 3', 'officer')
    await page.goto(DOSSIER_URL)

    await page.goto(KB4_FORM_URL)
    await page.getByTestId('kb4-method-option-1').click()
    await page.goto(DOSSIER_URL)

    // ไม่มีตัวเลือกผู้รับเรื่องใด ๆ ในการ์ดเส้นทางเร่งด่วน — มีปุ่มเดียวคือส่งตรง ผอ. ไม่มีปุ่ม/select ให้เลือกส่งผ่านผู้บังคับบัญชาชั้นต้น
    const card = page.getByTestId('fast-track-card')
    await expect(card.getByRole('combobox')).toHaveCount(0)
    await expect(card.getByRole('button', { name: /ผู้บังคับบัญชาชั้นต้น/ })).toHaveCount(0)
    await expect(page.getByTestId('fast-track-submit-button')).toBeVisible()
    await expect(page.getByTestId('fast-track-submit-button')).toHaveText(/ส่งตรง ผอ\./)

    await page.getByTestId('fast-track-submit-button').click()
    // จอยืนยันต้องระบุชัดว่าไม่ผ่านผู้บังคับบัญชาชั้นต้น และไม่มีทางเลือกอื่นให้กด
    await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', 'ไม่ผ่านผู้บังคับบัญชาชั้นต้น')

    const after = await readCase(page, CASE_NO)
    expect(after?.owner).toBe(DIRECTOR)
    expect(after?.stage).toBe('director_review')
  })
})

test.describe('TC-045 — ห้ามเริ่มปฏิบัติก่อนพยานลงนามยินยอมใน คบ.5', () => {
  test('TC-045 · [Negative] คบ.5 ลงนามแล้วแต่พยานยังไม่ยินยอม ต้องยังเปิดเส้นทางปฏิบัติไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'officer', {
      kb5Approved: true,
      fastTrack: {
        step: 'approved',
        proposedMethods: [1],
        temporaryDurationDays: 30,
        submittedAt: '10/09/2569 09:40',
        submittedBy: OFFICER,
        decidedAt: '10/09/2569 10:15',
        decidedBy: DIRECTOR,
        directorOpinion: 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ',
        kb5OrderNo: '047/2569',
        kb5SignedAt: '10/09/2569 10:15',
        kb5SignedBy: DIRECTOR,
      },
    })
    await page.goto(DOSSIER_URL)

    // ยังไม่มีบันทึกความยินยอมของพยาน และยังไม่มีวิธีที่ถูกส่งไปแท็บ 08
    const before = await readCase(page, CASE_NO)
    expect((before?.consents ?? []) as unknown[]).toEqual([])
    expect((before?.approvedMethods ?? []) as unknown[]).toEqual([])
    expect((before?.methodTracks ?? []) as unknown[]).toEqual([])

    // การ์ดต้องรอเฉพาะการลงนามยินยอมของพยาน ไม่มีทางลัดข้ามไปเริ่มปฏิบัติได้จากแฟ้ม
    await expect(page.getByTestId('kb5-witness-ack-button')).toBeVisible()

    // WIT0612 — หน้าแยกวิธีปฏิบัติ (08A) ต้องไม่ยอมให้เปิดเส้นทางจนกว่าจะมีหลักฐานยินยอมของพยาน
    await page.goto('/protection-methods')
    await expect(page.getByText(CASE_NO)).toBeVisible()
    await expect(page.getByText('ความยินยอมตาม คบ.5 — ยังไม่บันทึก')).toBeVisible()

    await page.getByRole('button', { name: /^\(1\)/ }).click()
    await page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }).click()

    // ระบบต้องปฏิเสธพร้อมแจ้งเหตุผล ไม่เปิดจอยืนยัน และไม่เปิดเส้นทางใดเลย
    await expect(page.locator('.swal2-toast')).toContainText('ความยินยอมของพยานตาม คบ.5')
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    const after = await readCase(page, CASE_NO)
    expect((after?.approvedMethods ?? []) as unknown[]).toEqual([])
    expect((after?.methodTracks ?? []) as unknown[]).toEqual([])
  })
})

test.describe('TC-046 — ห้ามแก้ทับ คบ.5 ฉบับที่ลงนามแล้ว', () => {
  test('TC-046 · [Negative] เปิด คบ.5 ฉบับลงนามแล้วพยายามแก้ไข ต้องถูกล็อกและบันทึกลง Audit Log', async ({ page }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    await approveTemporaryProtection(page, '048/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ')
    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('approved')

    const historyBefore = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>

    // WIT0611 — เปิดฉบับ คบ.5 ที่ลงนามแล้วอีกครั้ง
    await page.goto(KB5_FORM_URL)
    await expect(page.getByText('ฉบับลงนามถูกล็อก — แก้ทับไม่ได้')).toBeVisible()

    // ทุกช่องกรอกของฉบับที่ลงนามแล้วต้องถูกปิดการแก้ไข ห้ามแก้ทับ
    const inputs = page.locator('input[type="text"]')
    const count = await inputs.count()
    expect(count).toBeGreaterThan(0)
    for (let i = 0; i < count; i++) {
      await expect(inputs.nth(i)).toBeDisabled()
    }

    // ที่ระดับ store ก็ปฏิเสธการแก้ไขเช่นกัน แม้จะพยายามยิง action ตรง ๆ ข้ามหน้า UI
    const stillBlocked = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      return raw ? Boolean(JSON.parse(raw).state.locks['5']) : false
    })
    expect(stillBlocked).toBe(true)

    // ผู้ใช้พยายามแก้สองช่อง — ทุกครั้งต้องถูกบันทึกลง Audit Log ของแฟ้ม
    const lockedFields = page.locator('[data-locked="true"]')
    expect(await lockedFields.count()).toBeGreaterThan(1)
    await lockedFields.nth(0).click()
    await lockedFields.nth(1).click()

    await expect
      .poll(async () => {
        const history = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>
        return history.filter((h) => (h.action ?? '').includes('พยายามแก้ไขเอกสารฉบับลงนาม')).length
      })
      .toBeGreaterThanOrEqual(2)

    const history = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.length).toBeGreaterThan(historyBefore.length)
    const attempts = history.filter((h) => (h.action ?? '').includes('พยายามแก้ไขเอกสารฉบับลงนาม'))
    expect(attempts[0].action).toContain('คบ.5')
    expect(attempts[0].detail).toContain('ระบบปฏิเสธการแก้ไข')
    expect(attempts[0].detail).toContain('คำสั่งสำนัก/กอง/ศูนย์')
    // แต่ละครั้งระบุช่องที่ถูกแตะไว้คนละช่อง — ไม่ใช่รายการรวมกอง
    expect(new Set(attempts.map((h) => h.detail)).size).toBeGreaterThan(1)
  })
})

test.describe('TC-047 — คำร้องหลักต้องเดินคู่ขนานกับการคุ้มครองชั่วคราว', () => {
  test('TC-047 · [Edge] หลังอนุมัติคุ้มครองชั่วคราวแล้ว คำร้องหลักต้องเดินต่อได้ ไม่ค้างที่ขั้นของเรื่องชั่วคราว', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)

    await approveTemporaryProtection(page, '049/2569', 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ')

    await switchRole(page, 'officer')
    await page.getByTestId('kb5-witness-ack-button').click()
    await signInModal(page, WITNESS)
    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('active')

    // WIT0614 — คำร้องหลักยังเดินต่อ: แฟ้มต้องแสดงทั้งสถานะชั่วคราว (active) และให้เจ้าหน้าที่ไปต่อที่ คบ.6 ได้จริง
    await page.reload()
    await expect(page.getByTestId('fast-track-card')).toHaveAttribute('data-fast-track-step', 'active')
    await expect(page.getByTestId('fast-track-main-petition-notice')).toContainText('คำร้องหลักยังเดินต่อ')

    // เส้นทางชั่วคราวเดินไปแท็บ 08 แล้ว — วิธีที่อนุมัติถูกเปิดเป็น track แยก
    const afterActive = await readCase(page, CASE_NO)
    expect((afterActive?.approvedMethods ?? []) as unknown[]).toEqual([1, 3])
    expect(((afterActive?.methodTracks ?? []) as unknown[]).length).toBe(2)

    // คำร้องหลักต้องกลับมาอยู่ในมือเจ้าหน้าที่เพื่อจัดทำ/เสนอ คบ.6 ต่อ ไม่ถูกข้ามไปขั้นปฏิบัติการ
    expect(afterActive?.owner).toBe(OFFICER)
    expect(afterActive?.stage).toBe('staff_review')

    // และต้องมีปุ่มส่งต่อคำร้องหลักให้เจ้าหน้าที่กดเดินเรื่อง คบ.6 ต่อได้จริง
    await expect(page.getByTestId('forward-case-button')).toBeVisible()
  })
})

test.describe('TC-048 — เพดานรวม 180 วัน ต้องผูกกับระยะเวลาใน คบ.5', () => {
  test('TC-048 · [Edge] ระบุระยะเวลาคุ้มครองชั่วคราว 200 วัน ต้องถูกเตือนและส่งเสนอไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 3', 'officer')

    // WIT0603 — ติ๊กวิธีตามข้อ 15 ในแบบ คบ.4 ก่อน เพื่อให้เหลือเงื่อนไขเดียวคือระยะเวลา
    await page.goto(KB4_FORM_URL)
    await page.getByTestId('kb4-method-option-1').click()

    await page.goto(DOSSIER_URL)
    const durationInput = page.getByTestId('fast-track-duration-days')
    await expect(durationInput).toBeVisible()

    // ค่าตั้งต้นอยู่ในเพดาน — ส่งเสนอได้ตามปกติ
    await expect(page.getByTestId('fast-track-duration-warning')).toHaveCount(0)
    await expect(page.getByTestId('fast-track-submit-button')).toBeEnabled()

    // ระบุ 200 วัน ทำให้ยอดสะสมเกินเพดานรวม 180 วัน ต้องเตือนทันทีและกดส่งไม่ได้
    await durationInput.fill('200')
    await expect(page.getByTestId('fast-track-duration-warning')).toContainText('ไม่เกิน 180 วัน')
    await expect(page.getByTestId('fast-track-submit-button')).toBeDisabled()

    // สถานะแฟ้มต้องไม่เปลี่ยน — ไม่มีการเสนอขึ้น ผอ. ด้วยระยะเวลาที่เกินเพดาน
    const stuck = await readCase(page, CASE_NO)
    expect(stuck?.stage).toBe('staff_review')
    expect((stuck?.fastTrack as Record<string, unknown>)?.submittedAt).toBeUndefined()

    // ลดเหลือ 180 วันพอดี — ผ่านเพดานพอดีจึงส่งเสนอได้ และระยะเวลาถูกเก็บไว้ในแฟ้ม
    await durationInput.fill('180')
    await expect(page.getByTestId('fast-track-duration-warning')).toHaveCount(0)
    await page.getByTestId('fast-track-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่งตรง ผอ.', '180 วัน')

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.temporaryDurationDays)
      .toBe(180)
  })
})
