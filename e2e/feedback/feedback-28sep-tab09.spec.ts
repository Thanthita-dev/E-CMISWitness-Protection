import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Feedback 28 Sep · แท็บ 09A/09B (TC-034, TC-036, TC-037, TC-039)
 *
 * TC-034 Case 4.1 — พยานแจ้งไม่ประสงค์อุทธรณ์ก่อนครบ 30 วัน → สิ้นสุด (WIT0909) พร้อมหลักฐานคำแจ้ง
 * TC-036 Case 4.2 — ลำดับเสนอ ผบช.ชั้นต้น (WIT0915) → ผอ.สำนัก/กอง (WIT0916) → รองเลขาธิการฯ
 * TC-037 Case 4.3 — BUG-006 หลังคณะกรรมการมีมติแล้วเป็นที่สุด ไม่มีปุ่มส่งกลับเข้าสายพิจารณา
 * TC-039 Case 4.1 — ธุรการสำนัก/กองรับคำอุทธรณ์ (WIT0912) เข้าแฟ้มเดิม แล้วเรื่องเดินต่อที่เจ้าหน้าที่
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const APPEAL_URL = `/appeal-folder/${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

async function giveOpinion(page: Page, role: string, note: string, expectedText?: string | RegExp) {
  await switchRole(page, role)
  await page.getByTestId('appeal-opinion-note').fill(note)
  await page.getByTestId('appeal-opinion-submit').click()
  await confirmDialog(page, 'ยืนยัน', expectedText)
}

test.describe('Feedback 28 Sep · 09A/09B', () => {
  test('TC-034 · พยานไม่อุทธรณ์ → สิ้นสุด (WIT0909) บันทึกก่อนครบ 30 วันได้ ต้องมีหลักฐานคำแจ้ง', async ({ page }) => {
    await seedMockState(page, 'Case 4.1', 'officer')
    await page.goto(DOSSIER_URL)

    const waiver = page.getByTestId('kb10-waiver')
    await expect(waiver).toBeVisible()
    await expect(waiver).toContainText('พยานแจ้งไม่ประสงค์อุทธรณ์')
    await captureEvidence(page, 'TC-034-a', waiver, 'กล่องใหม่: บันทึกพยานแจ้งไม่ประสงค์อุทธรณ์ / ปิดเรื่อง')

    // ไม่แนบหลักฐาน — จอยืนยันต้องไม่ขึ้น
    await page.getByTestId('kb10-waiver-note').fill('พยานแจ้งทางโทรศัพท์ว่าไม่ประสงค์อุทธรณ์')
    await page.getByTestId('kb10-waiver-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    expect((await readCase(page, CASE_NO))?.nonApprovalClosedAt).toBeFalsy()

    await page.getByTestId('kb10-waiver-evidence').fill('บันทึกถ้อยคำพยานลงชื่อ 28-09-2569.pdf')
    await page.getByTestId('kb10-waiver-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง', 'ปิดอย่างเป็นทางการ')

    const after = await readCase(page, CASE_NO)
    expect(after?.nonApprovalClosedAt).toBeTruthy()
    expect(after?.closedAt).toBeTruthy()
    expect(String(after?.status)).toContain('ไม่ประสงค์อุทธรณ์')
    await expect(page.getByTestId('kb10-closed')).toBeVisible()
    await captureEvidence(page, 'TC-034-b', page.getByTestId('kb10-closed'), 'ปิดเรื่องแล้ว (ไม่ประสงค์อุทธรณ์)')
    await expect(page.getByTestId('kb10-waiver')).toHaveCount(0)
  })

  test('TC-036 · ลำดับเสนอแฟ้มอุทธรณ์ ผบช. → ผอ. (WIT0916) → รองเลขาธิการฯ ไม่ข้ามชั้น', async ({ page }) => {
    await seedMockState(page, 'Case 4.2', 'officer')
    await page.goto(APPEAL_URL)
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน')
    await page.getByTestId('appeal-opinion-note').fill('ตรวจข้อเท็จจริงแล้ว เห็นควรเสนอตามลำดับชั้น')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'ผบช.ชั้นต้น')

    // ผบช. — ปุ่มเสนอรองเลขาธิการฯ ต้องไม่มี มีเพียงเสนอ ผอ.
    await switchRole(page, 'supervisor')
    await expect(page.getByTestId('appeal-opinion-supervisor')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ลงนามเสนอรองเลขาธิการฯ' })).toHaveCount(0)
    await expect(page.getByTestId('appeal-opinion-submit')).toContainText('ผอ.สำนัก/กอง')
    await captureEvidence(page, 'TC-036-a', page.getByTestId('appeal-opinion-submit'), 'ผบช. เห็นปุ่ม "เสนอ ผอ." ไม่มีปุ่มเสนอรองเลขาฯ ข้ามขั้น')
    // ผอ. ยังไม่ถึงคิว
    await switchRole(page, 'director')
    await expect(page).toHaveURL(new RegExp('/appeal-folder/'))
    await expect(page.getByTestId('appeal-opinion-submit')).toHaveCount(0)

    await giveOpinion(page, 'supervisor', 'ให้ความเห็นแล้ว เสนอ ผอ.สำนัก/กอง', 'ผอ.สำนัก/กอง')
    expect(((await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>).stage).toBe('director')

    // รองเลขาฯ ข้ามคิว ผอ. ไม่ได้
    await switchRole(page, 'deputy_secretary')
    await expect(page.getByTestId('appeal-opinion-submit')).toHaveCount(0)

    // ผอ. เปิด /appeal ได้ และลงนามเสนอรองเลขาธิการฯ (WIT0916)
    await switchRole(page, 'director')
    await page.goto('/appeal')
    await expect(page).toHaveURL(/\/appeal$/)
    await expect(page.getByText('รายการคำอุทธรณ์')).toBeVisible()
    await page.goto(APPEAL_URL)
    await expect(page.getByTestId('appeal-opinion-director')).toBeVisible()
    await captureEvidence(page, 'TC-036-b', [page.getByTestId('appeal-opinion-director'), page.getByTestId('appeal-opinion-submit')], 'ผอ. ลงนามเสนอรองเลขาธิการฯ ได้')
    await page.getByTestId('appeal-opinion-note').fill('ตรวจแล้ว ลงนามเสนอรองเลขาธิการฯ')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'รองเลขาธิการฯ')

    const folder = (await readCase(page, CASE_NO))?.appealFolder as Record<string, any>
    expect(folder.stage).toBe('deputy')
    expect(folder.directorOpinion.note).toContain('ลงนามเสนอ')
  })

  test('TC-037 · [BUG-006] หลังมีมติยืนคำสั่งเดิมแล้วไม่มีทางส่งกลับเข้าสายพิจารณา (มติเป็นที่สุด)', async ({ page }) => {
    await seedMockState(page, 'Case 4.3', 'committee')
    await page.goto(APPEAL_URL)

    await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
    await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม')
    await page.getByTestId('appeal-resolution-uphold').click()
    await confirmDialog(page, 'ยืนยันมติยืนคำสั่งเดิม', 'เป็นที่สุด')

    expect((await readCase(page, CASE_NO))?.appealResolution).toBeTruthy()
    await captureEvidence(page, 'TC-037-a', page.getByTestId('appeal-folder-stage'), 'มติเป็นที่สุดแล้ว ไม่มีปุ่มส่งกลับเข้าสายพิจารณา')
    for (const role of ['committee', 'officer', 'supervisor', 'deputy_secretary', 'secretary']) {
      await switchRole(page, role)
      await page.goto(APPEAL_URL)
      await expect(page.getByTestId('appeal-return-submit')).toHaveCount(0)
      await expect(page.getByText('ส่งกลับเข้าสายพิจารณาปกติ')).toHaveCount(0)
    }
    const after = await readCase(page, CASE_NO)
    // ไม่ถูกดึงกลับไปขั้นทบทวนของเจ้าหน้าที่
    expect(after?.stage).not.toBe('staff_review')
    expect(after?.activity7State).not.toBe('pending')
    expect((after?.appealFolder as Record<string, unknown>).stage).toBe('resolved')
  })

  test('TC-039 · ธุรการสำนัก/กองรับคำอุทธรณ์ (WIT0912) เข้าแฟ้มเดิม แล้วเรื่องเดินต่อที่เจ้าหน้าที่', async ({ page }) => {
    await seedMockState(page, 'Case 4.1', 'receiver')

    // เปิด /appeal ได้
    await page.goto('/appeal')
    await expect(page).toHaveURL(/\/appeal$/)
    await expect(page.getByText('รายการคำอุทธรณ์')).toBeVisible()

    await page.goto(DOSSIER_URL)
    const before = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    const appealSection = page
      .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await expect(appealSection.getByTestId('appeal-intake-channel-letter')).toBeVisible()
    // ธุรการรับได้เฉพาะช่องทางหนังสือ — วาจาต้องให้เจ้าหน้าที่บันทึกถ้อยคำ
    await expect(appealSection.getByTestId('appeal-intake-channel-oral')).toHaveCount(0)
    await captureEvidence(page, 'TC-039-a', appealSection.getByTestId('appeal-intake-form'), 'ธุรการรับคำอุทธรณ์ (หนังสือ) เข้าระบบได้')

    await appealSection.locator('label', { hasText: 'เหตุผลในการอุทธรณ์' }).locator('xpath=following-sibling::*[1]').fill(
      'พยานยื่นหนังสืออุทธรณ์ผ่านสารบรรณกลาง'
    )
    await appealSection.getByTestId('appeal-intake-registry-no').fill('640/2569')
    await appealSection.getByTestId('appeal-intake-first-received').fill('2026-09-28')
    await appealSection.getByTestId('appeal-intake-evidence-file').setInputFiles({
      name: 'หนังสืออุทธรณ์_640-2569.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    })
    await appealSection.getByTestId('appeal-intake-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const filed = await readCase(page, CASE_NO)
    const folder = filed?.appealFolder as Record<string, any>
    expect(folder.stage).toBe('received')
    expect(folder.intake.channel).toBe('letter')
    expect(folder.intake.recordedBy).toContain('รับสารบรรณ')
    // เข้าแฟ้มเดิม ไม่สร้าง คบ.1 ใหม่
    expect(
      await page.evaluate(() => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length)
    ).toBe(before)

    // หลังรับ เรื่องเดินต่อที่เจ้าหน้าที่ตรวจแฟ้ม (WIT0914)
    await switchRole(page, 'officer')
    await page.goto(APPEAL_URL)
    await expect(page.getByTestId('appeal-check-submit')).toBeVisible()
    await captureEvidence(page, 'TC-039-b', page.getByTestId('appeal-check-submit'), 'รับแล้ว เรื่องเดินต่อที่เจ้าหน้าที่ตรวจแฟ้ม')
  })
})
