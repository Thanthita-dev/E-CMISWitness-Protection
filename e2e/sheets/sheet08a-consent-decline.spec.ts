import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 08A · WIT0809 → WIT0812 — พยานไม่ยินยอมตาม คบ.11
 *
 * ผัง: WIT0808 ชี้แจงข้อตกลง → **WIT0809 พยานยินยอมตาม คบ.11?**
 *      แขนง "ยินยอม"    → WIT0810 ลงนาม → WIT0811 เก็บฉบับลงนาม → WIT0813 แยกวิธี
 *      แขนง "ไม่ยินยอม" → **WIT0812** บันทึกเหตุและหลักฐาน · ห้ามเริ่มวิธีนั้น
 *                          · เสนอ "ทบทวน / เปลี่ยนวิธี / ยุติ" ผ่านลำดับผู้บังคับบัญชา
 *
 * ลำดับชั้นที่ผังกำกับไว้: เจ้าหน้าที่ผู้รับผิดชอบ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง
 * แล้วแนวทางที่อนุมัติต้องพาแฟ้มไปต่อจริง ไม่ใช่จบที่ป้ายสถานะ
 */

const CASE_NO = 'WP-2569-000501'
const METHODS_URL = '/protection-methods'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

/** ตั้งต้นที่ประตู WIT0809 — คำสั่งอนุมัติแล้ว เปิดวิธีที่ 1 และ 2 ไว้ แต่พยานยังไม่ลงนาม คบ.11 */
const AT_CONSENT_GATE = {
  kb11Signed: false,
  consents: [],
  approvedMethods: [1, 2],
  methodTracks: [
    { method: 1, status: 'pending' },
    { method: 2, status: 'pending' },
  ],
  consentDeclineProposals: [],
}

/**
 * กดยืนยันในจอยืนยัน — ทุกปุ่มที่เปลี่ยนสถานะแฟ้มในเส้นทางนี้ต้องผ่านจอนี้ก่อน
 * ตรวจข้อความสรุปด้วย เพราะจอนี้มีหน้าที่บอก "สิ่งที่กำลังจะเกิดขึ้นจริง"
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

/** ชั้นเจ้าหน้าที่: บันทึกไม่ยินยอมพร้อมเหตุ แล้วเสนอแนวทางที่เลือกขึ้นลำดับชั้น (WIT0812) */
async function declineAndPropose(
  page: Page,
  action: 'review' | 'change_method' | 'terminate',
  reason: string,
  newMethods: number[] = []
) {
  await page.goto(METHODS_URL)
  await page.getByTestId('decline-reason').fill(reason)
  await page.getByTestId('decline-evidence').fill('บันทึกถ้อยคำ ลงวันที่ 11 ก.ย. 2569')
  await page.getByTestId(`decline-action-${action}`).click()
  for (const m of newMethods) await page.getByTestId(`decline-new-method-${m}`).click()
  await page.getByTestId('decline-submit').click()
}

/** ชั้นผู้บังคับบัญชา: เห็นชอบ/อนุมัติ หรือส่งคืนแก้ไข */
async function decide(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await page.goto(METHODS_URL)
  await page.getByTestId('decline-decision-note').fill(note)
  await page.getByTestId(endorse ? 'decline-endorse' : 'decline-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

test.describe('WIT0812 — พยานไม่ยินยอม: เสนอทบทวน เปลี่ยนวิธี หรือยุติ ผ่านลำดับผู้บังคับบัญชา', () => {
  test('TC-061 · (1) ผังให้เลือกได้สามแนวทาง — ไม่ใช่ "ทบทวน" ตายตัว', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)
    await page.goto(METHODS_URL)

    await expect(page.getByTestId('wit0812-card')).toBeVisible()
    await expect(page.getByTestId('decline-action-review')).toBeVisible()
    await expect(page.getByTestId('decline-action-change_method')).toBeVisible()
    await expect(page.getByTestId('decline-action-terminate')).toBeVisible()

    /** เลือก "เปลี่ยนวิธี" แล้วต้องมีช่องระบุวิธีตามข้อ 15 ชุดใหม่ให้เลือก */
    await expect(page.getByTestId('decline-new-method-3')).toBeHidden()
    await page.getByTestId('decline-action-change_method').click()
    await expect(page.getByTestId('decline-new-method-3')).toBeVisible()
  })

  test('TC-061 · (2) กดบันทึกไม่ยินยอมแล้วยกเลิกในจอยืนยัน — แฟ้มต้องไม่ขยับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)
    await page.goto(METHODS_URL)

    await page.getByTestId('decline-reason').fill('ขอเวลาปรึกษาครอบครัวก่อน')
    await page.getByTestId('decline-submit').click()
    await cancelDialog(page)

    const after = await readCase(page, CASE_NO)
    expect(after?.consentDeclineProposals).toEqual([])
    expect((after?.methodTracks as Array<{ status: string }>).every((t) => t.status === 'pending')).toBe(true)
  })

  test('TC-061 · (3) ต้องระบุเหตุที่ไม่ยินยอมก่อน จึงจะเสนอแนวทางได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)
    await page.goto(METHODS_URL)

    await page.getByTestId('decline-submit').click()
    await expect(page.locator('.swal2-popup')).toHaveCount(0)

    const after = await readCase(page, CASE_NO)
    expect(after?.consentDeclineProposals).toEqual([])
  })

  test('TC-061 · (4) แนวทาง "ยุติ": บันทึกเหตุ → ระงับวิธีที่ยังไม่เริ่ม → ผบช.ชั้นต้น → ผอ. → เข้าเส้นทาง คบ.15 (11C)', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)

    // --- ชั้นเจ้าหน้าที่: WIT0812 ครึ่งแรก บันทึกเหตุ + ห้ามเริ่มวิธีนั้น
    await declineAndPropose(page, 'terminate', 'พยานปฏิเสธการคุ้มครองทุกรูปแบบและขอให้ยุติทันที')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'ระงับทันที')

    let c = await readCase(page, CASE_NO)
    const tracks = c?.methodTracks as Array<{ status: string }>
    expect(tracks.every((t) => t.status === 'blocked')).toBe(true)

    // ครึ่งหลัง: ต้องเกิดงานจริงในคิวของ ผบช.ชั้นต้น ไม่ใช่แค่บันทึกในแฟ้ม
    const proposals = c?.consentDeclineProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(1)
    expect(proposals[0].proposedAction).toBe('terminate')
    expect(proposals[0].stage).toBe('supervisor')
    expect(c?.owner).toBe(SUPERVISOR)

    // --- ชั้น ผบช.ชั้นต้น: แฟ้มต้องโผล่ในคิวงานจริง แล้วเห็นชอบเสนอต่อ ผอ.
    await switchRole(page, 'supervisor')
    await page.goto('/queue/supervisor')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    await decide(page, true, 'เหตุผลครบถ้วน เห็นควรยุติตามที่เสนอ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')

    c = await readCase(page, CASE_NO)
    expect((c?.consentDeclineProposals as Array<Record<string, unknown>>)[0].stage).toBe('director')
    expect(c?.owner).toBe(DIRECTOR)

    // --- ชั้น ผอ.สำนัก/กอง: อนุมัติแล้วแฟ้มต้องเดินเข้าเส้นทางยุติจริง
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    await decide(page, true, 'อนุมัติให้ยุติการคุ้มครอง', 'ยืนยันอนุมัติแนวทาง', 'คบ.15')

    c = await readCase(page, CASE_NO)
    expect((c?.consentDeclineProposals as Array<Record<string, unknown>>)[0].stage).toBe('approved')
    expect(c?.stage).toBe('termination_review')
    expect(c?.owner).toBe(OFFICER)
    expect((c?.terminationTrigger as Record<string, unknown>)?.source).toBe('due_or_officer')
    expect(c?.next).toContain('คบ.15')

    // แฟ้มต้องปรากฏในแท็บ 11C ที่เป็นปลายทางจริงของแนวทางนี้
    await switchRole(page, 'officer')
    await page.goto('/termination')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
  })

  test('TC-061 · (5) แนวทาง "เปลี่ยนวิธี": อนุมัติแล้วเปิดชุดวิธีใหม่ และล้างความยินยอมเพื่อขอลงนาม คบ.11 ใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)

    await declineAndPropose(page, 'change_method', 'ไม่ยินยอมย้ายที่พัก แต่รับการปกปิดข้อมูลได้', [3])
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'วิธีที่ 3')

    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นควรเปลี่ยนเป็นวิธีที่ 3', 'ยืนยันเห็นชอบ')

    await switchRole(page, 'director')
    await decide(page, true, 'อนุมัติเปลี่ยนวิธี', 'ยืนยันอนุมัติแนวทาง', 'คบ.11')

    const c = await readCase(page, CASE_NO)
    expect(c?.approvedMethods).toEqual([3])
    expect((c?.methodTracks as Array<{ method: number }>).map((t) => t.method)).toEqual([3])
    /** คบ.11 เปลี่ยนวิธีไปจากฉบับที่พยานปฏิเสธ ความยินยอมเดิมจึงใช้ต่อไม่ได้ */
    expect(c?.kb11Signed).toBe(false)
    expect(c?.next).toContain('คบ.11')
  })

  test('TC-061 · (6) แนวทาง "ทบทวน": อนุมัติแล้วเรื่องต้องไปโผล่ในรายการทบทวน 11A จริง', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)

    await declineAndPropose(page, 'review', 'พยานขอให้ทบทวนเงื่อนไขการคุ้มครองทั้งชุด')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นควรทบทวน', 'ยืนยันเห็นชอบ')

    await switchRole(page, 'director')
    await decide(page, true, 'อนุมัติให้ทบทวน', 'ยืนยันอนุมัติแนวทาง', 'ทบทวนผลการคุ้มครอง')

    const c = await readCase(page, CASE_NO)
    expect(c?.reviewHandoff).toBeTruthy()

    await switchRole(page, 'officer')
    await page.goto('/protection-reviews')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
  })

  test('TC-061 · (7) ส่งคืนแก้ไขได้ทั้งชั้น ผบช. และ ผอ. — แฟ้มกลับถึงเจ้าหน้าที่ผู้รับผิดชอบและเสนอใหม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)

    await declineAndPropose(page, 'terminate', 'พยานขอยุติ')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

    // ผบช.ชั้นต้นส่งคืน — ต้องระบุเหตุผลก่อน
    await switchRole(page, 'supervisor')
    await page.goto(METHODS_URL)
    await page.getByTestId('decline-return').click()
    await expect(page.locator('.swal2-popup')).toHaveCount(0)

    await decide(page, false, 'เหตุผลยังไม่พอ ให้ทบทวนก่อนเสนอยุติ', 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')

    let c = await readCase(page, CASE_NO)
    expect((c?.consentDeclineProposals as Array<Record<string, unknown>>)[0].stage).toBe('returned')
    expect(c?.owner).toBe(OFFICER)

    // เจ้าหน้าที่เสนอใหม่เป็นแนวทาง "ทบทวน" แล้วเดินลำดับชั้นได้อีกรอบ
    await switchRole(page, 'officer')
    await declineAndPropose(page, 'review', 'ปรับเป็นเสนอทบทวนตามข้อสั่งการ ผบช.')
    await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

    c = await readCase(page, CASE_NO)
    const proposals = c?.consentDeclineProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(2)
    expect(proposals[1].proposedAction).toBe('review')
    expect(proposals[1].stage).toBe('supervisor')

    // ผอ. ส่งคืนได้เช่นกัน
    await switchRole(page, 'supervisor')
    await decide(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ')
    await switchRole(page, 'director')
    await decide(page, false, 'ให้แนบหลักฐานเพิ่มก่อน', 'ยืนยันส่งคืนแก้ไข')

    c = await readCase(page, CASE_NO)
    expect((c?.consentDeclineProposals as Array<Record<string, unknown>>)[1].stage).toBe('returned')
    expect(c?.owner).toBe(OFFICER)
  })

  test('TC-061 · (8) WIT0809 แขนง "ยินยอม" ยังเดินได้ตามเดิม และต้องผ่านจอยืนยัน', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_CONSENT_GATE)
    await page.goto(METHODS_URL)

    await page.getByTestId('consent-agree').click()
    await confirmDialog(page, 'ยืนยันว่าพยานยินยอม', 'คบ.11')

    const c = await readCase(page, CASE_NO)
    expect(c?.kb11Signed).toBe(true)
    expect((c?.consents as Array<Record<string, unknown>>)[0].consented).toBe(true)
    /** ยินยอมแล้วช่องทาง WIT0812 ต้องหายไป — ประตู WIT0809 ตัดสินไปแล้ว */
    await expect(page.getByTestId('wit0812-card')).toBeHidden()
  })
})
