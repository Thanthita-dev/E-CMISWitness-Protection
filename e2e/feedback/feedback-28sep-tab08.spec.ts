import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Feedback 28 Sep · แท็บ 08 (ปฏิบัติตามวิธี / ข้อ 14)
 * - TC-028 (BUG-005) วิธีที่ 2 ผลประเมินไม่เหมาะสม ต้องกลับ WIT0824 และเริ่มปฏิบัติไม่ได้
 * - TC-033 (ติดขัด) ข้อ 14 ต้องบันทึกหนังสือตอบรับจากกรม (WIT0860) ก่อนส่งมอบ (WIT0861)
 */

const CASE_NO = 'WP-2569-000501'
const METHOD2_URL = `/protection-method/2?caseNo=${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName }).click()
  await dialog.waitFor({ state: 'detached' })
}

type Track = { method: number; status: string; wizardStep?: number; site?: Record<string, unknown> }
const method2 = async (page: Page) =>
  ((await readCase(page, CASE_NO))?.methodTracks as Track[]).find((t) => t.method === 2)

test.describe('Feedback 28 Sep · แท็บ 08', () => {
  test('TC-028 · [BUG-005] วิธีที่ 2 ผลประเมินไม่เหมาะสม ต้องกลับไปเลือกสถานที่ (WIT0824) และเริ่มปฏิบัติไม่ได้จนกว่าจะประเมินใหม่ผ่าน', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [2],
      methodTracks: [{ method: 2, status: 'pending' }],
    })
    await page.goto(METHOD2_URL)

    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านญาติที่ไม่ปลอดภัยพอ')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // 1) บันทึกผลประเมินรอบล่าสุด ไม่เหมาะสม → 2) กด ไม่เหมาะสม — เลือกใหม่
    await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ทางเข้า-ออกไม่ปลอดภัย')
    await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()

    // ผลที่ควรได้: กลับขั้นเสนอสถานที่ใหม่ (WIT0824)
    await expect(page.getByLabel('สถานที่ที่เสนอ')).toBeVisible()
    expect((await method2(page))?.wizardStep).toBe(1)
    await captureEvidence(page, 'TC-028-a', page.getByLabel('สถานที่ที่เสนอ'), 'กลับมาขั้นเลือกสถานที่ใหม่ (WIT0824)')

    // 3) พยายามไปให้ถึงขั้นเริ่มปฏิบัติ กรอกผู้ส่งมอบ/ผู้รับมอบ แนบหลักฐาน แล้วกดเริ่มปฏิบัติ — ต้องไม่ ACTIVE
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByLabel('ผู้ส่งมอบ').fill('นางสาวอรุณี ใจมั่น')
    await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
    await page
      .getByTestId('site-handover-evidence-input')
      .setInputFiles({ name: 'handover.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })
    await expect(page.getByText(/ผลประเมินรอบล่าสุดคือ "ไม่เหมาะสม"/)).toBeVisible()
    await captureEvidence(page, 'TC-028-b', [page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }), page.getByText(/ผลประเมินรอบล่าสุดคือ "ไม่เหมาะสม"/)], 'ระบบแจ้งว่าผลประเมินล่าสุดไม่เหมาะสม เริ่มปฏิบัติไม่ได้')
    await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
    expect((await method2(page))?.status).not.toBe('active')

    // เสนอสถานที่ใหม่และประเมิน "เหมาะสม" แล้วจึงเริ่มปฏิบัติได้
    await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
    await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ปลอดภัยดี')
    await page.getByRole('button', { name: 'สถานที่เหมาะสม' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await captureEvidence(page, 'TC-028-c', page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }), 'ประเมินใหม่ "เหมาะสม" แล้วจึงเริ่มปฏิบัติได้')
    await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
    expect((await method2(page))?.status).toBe('active')
  })

  test('TC-033 · [ข้อ 14] ต้องบันทึกหนังสือตอบรับจากกรม (WIT0860) ก่อนส่งมอบ (WIT0861) — ส่งมอบก่อนไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 5', 'officer')
    // เดินตามผัง: เจ้าหน้าที่เสนอ → ผบช. → เลขาธิการ → คณะกรรมการเห็นชอบส่งกรม
    await page.goto('/article14')
    await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ยังมีภัยต่อเนื่อง')
    await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill('อ้างอิง คบ.13')
    await page.getByTestId('submit-article14-proposal').click()
    await confirmDialog(page, 'ยืนยันเสนอ')
    for (const role of ['supervisor', 'secretary']) {
      await switchRole(page, role)
      await page.goto('/article14')
      await page.getByTestId('article14-endorse-button').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
    }
    await switchRole(page, 'committee')
    await page.goto('/article14')
    await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติที่ 33/2569')
    await page.getByPlaceholder('สาระสำคัญของมติ').fill('เห็นชอบส่งกรม')
    await page.getByTestId('article14-committee-approve').click()
    await confirmDialog(page, 'ยืนยันมติ')

    await switchRole(page, 'officer')
    await page.goto('/article14')

    // ยังไม่บันทึกหนังสือขาออก → ไม่มีปุ่มส่งมอบ และบันทึกตอบรับยังไม่ได้
    const handoverBtn = page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' })
    await expect(handoverBtn).toHaveCount(0)
    await expect(page.getByTestId('article14-reply-locked')).toBeVisible()
    await captureEvidence(page, 'TC-033-a', page.getByTestId('article14-reply-locked'), 'ยังบันทึกตอบรับไม่ได้ และยังไม่มีปุ่มส่งมอบ')

    // 1) บันทึกหนังสือขาออก → ยังส่งมอบไม่ได้ ต้องบันทึกหนังสือตอบรับก่อน (WIT0860)
    await page.locator('input[placeholder="เลขที่หนังสือ (สารบรรณเดิม)"]').fill('ปปท 0033/9001')
    await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
    await confirmDialog(page, 'ยืนยันบันทึก')
    await expect(handoverBtn).toHaveCount(0)
    await captureEvidence(page, 'TC-033-b', page.getByTestId('article14-record-reply'), 'ต้องบันทึกหนังสือตอบรับจากกรมก่อน (WIT0860)')

    // ขาดข้อมูลบางช่อง (ไม่แนบไฟล์) → บันทึกไม่ได้
    await page.getByPlaceholder('เลขที่หนังสือตอบรับของกรม').fill('ยธ 0033/2569')
    await page.getByTestId('article14-record-reply').click()
    expect(((await readCase(page, CASE_NO))?.article14 as Record<string, unknown>).step).toBe('letter_sent')

    await page.getByPlaceholder('ผู้ประสานของกรม').fill('นายประสาน ตอบรับ')
    await page.getByLabel('วันนัดส่งมอบ').fill('2026-10-01')
    await page.getByPlaceholder('เงื่อนไขของกรม (ถ้ามี)').fill('ต้องมีผู้ติดตามพยานไม่เกิน 2 คน')
    await page
      .getByTestId('article14-reply-file')
      .setInputFiles({ name: 'reply-letter.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock') })
    await page.getByTestId('article14-record-reply').click()
    await confirmDialog(page, 'ยืนยันบันทึก')

    // 2) หลังบันทึกตอบรับ จึงส่งมอบได้
    const c = await readCase(page, CASE_NO)
    const a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('response_received')
    expect(a14.replyRegistryNo).toBe('ยธ 0033/2569')
    expect(a14.replyAppointmentAt).toBe('2026-10-01')
    expect(a14.replyDocumentName).toBe('reply-letter.pdf')
    const letters = c?.officialLetters as Array<Record<string, unknown>>
    expect(letters.filter((l) => l.direction === 'incoming' && l.context === 'article14')).toHaveLength(1)

    await expect(handoverBtn).toBeVisible()
    await captureEvidence(page, 'TC-033-c', handoverBtn, 'บันทึกตอบรับแล้ว จึงส่งมอบได้ (WIT0861)')
    await handoverBtn.click()
    await confirmDialog(page, 'ยืนยันส่งมอบ')
    expect(((await readCase(page, CASE_NO))?.article14 as Record<string, unknown>).step).toBe('handover_done')
  })
})
