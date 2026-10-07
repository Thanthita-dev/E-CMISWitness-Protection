import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Feedback 2 Oct · แท็บ 09A/09B (TC-054, TC-055)
 *
 * TC-054 Case 4.1 — ปิดเรื่องไม่อนุมัติแล้ว (WIT0909) ต้องไม่รับคำร้องอุทธรณ์ได้อีก (ฟอร์ม/ปุ่มหาย + ข้อความแจ้ง)
 * TC-055 Case 4.2/4.3 — แฟ้มอุทธรณ์ไม่มีทาง "ส่งกลับเข้าสายพิจารณาปกติ" เดินตามลำดับชั้นถึงมติเท่านั้น
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

test.describe('Feedback 2 Oct · 09A/09B', () => {
  test('TC-054 · ปิดเรื่องไม่อนุมัติแล้ว (WIT0909) ไม่รับคำร้องอุทธรณ์ ทั้งหน้าแฟ้มและหน้า /appeal', async ({ page }) => {
    await seedMockState(page, 'Case 4.1', 'officer')
    await page.goto(DOSSIER_URL)

    // ก่อนปิดเรื่อง — รับคำร้องอุทธรณ์ได้
    await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
    await expect(page.getByTestId('appeal-intake-submit')).toBeEnabled()
    await expect(page.getByTestId('appeal-intake-closed-notice')).toHaveCount(0)

    await page.getByTestId('kb10-waiver-note').fill('พยานแจ้งทางโทรศัพท์ว่าไม่ประสงค์อุทธรณ์')
    await page.getByTestId('kb10-waiver-evidence').fill('บันทึกถ้อยคำพยานลงชื่อ 02-10-2569.pdf')
    await page.getByTestId('kb10-waiver-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง', 'ปิดอย่างเป็นทางการ')

    expect((await readCase(page, CASE_NO))?.nonApprovalClosedAt).toBeTruthy()
    await expect(page.getByTestId('kb10-closed')).toBeVisible()

    // หลังปิด — ฟอร์ม/ปุ่มหาย และมีข้อความแจ้ง
    await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'รับคำร้องอุทธรณ์เข้าระบบ' })).toHaveCount(0)
    const notice = page.getByTestId('appeal-intake-closed-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('ปิดเรื่องแล้ว — ไม่สามารถรับ')
    await expect(notice).toContainText('ไม่สามารถรับคำอุทธรณ์ได้')
    await captureEvidence(page, 'TC-054-a', notice, 'ปิดเรื่องแล้ว ไม่มีปุ่มรับคำร้องอุทธรณ์ พร้อมข้อความแจ้ง')

    // หน้า /appeal — ไม่เปิดรับ และแจ้งว่าปิดเรื่องแล้ว
    await page.goto('/appeal')
    await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'รับคำร้องอุทธรณ์เข้าระบบ' })).toHaveCount(0)
    const listNotice = page.getByTestId('appeal-closed-notice')
    await expect(listNotice).toContainText('ไม่สามารถรับคำร้องอุทธรณ์ได้')
    await expect(listNotice).toContainText(CASE_NO)
    await captureEvidence(page, 'TC-054-b', listNotice, 'หน้า /appeal แจ้งเรื่องที่ปิดแล้ว ไม่เปิดรับอุทธรณ์')

    // ไม่มีแฟ้มอุทธรณ์ถูกสร้างขึ้น
    expect((await readCase(page, CASE_NO))?.appealFolder).toBeFalsy()
  })

  for (const mock of ['Case 4.2', 'Case 4.3'] as const) {
    test(`TC-055 · ${mock} แฟ้มอุทธรณ์ไม่มีปุ่ม "ส่งกลับเข้าสายพิจารณาปกติ" ทุกบทบาท`, async ({ page }) => {
      await seedMockState(page, mock, mock === 'Case 4.2' ? 'officer' : 'committee')
      const roles = ['officer', 'supervisor', 'committee', 'director', 'deputy_secretary', 'secretary']
      for (const role of roles) {
        await switchRole(page, role)
        await page.goto(APPEAL_URL)
        await expect(page.getByTestId('appeal-folder-stage')).toBeVisible()
        await expect(page.getByTestId('appeal-return-submit')).toHaveCount(0)
        await expect(page.getByTestId('appeal-return-note')).toHaveCount(0)
        await expect(page.getByText('ส่งกลับเข้าสายพิจารณาปกติ')).toHaveCount(0)
        await expect(page.getByText('นำเรื่องกลับเข้าสู่วนโฟลว์พิจารณาตามปกติ')).toHaveCount(0)
        if (mock === 'Case 4.2' && role === 'officer') {
          await captureEvidence(page, 'TC-055-a', page.getByTestId('appeal-folder-stage'), 'แฟ้มอุทธรณ์ไม่มีบล็อกส่งกลับเข้าสายพิจารณาปกติ')
        }
      }
    })
  }

  test('TC-055 · ลำดับชั้นแฟ้มอุทธรณ์ยังทำงาน (ตรวจแฟ้ม → เจ้าหน้าที่เสนอ ผบช.)', async ({ page }) => {
    await seedMockState(page, 'Case 4.2', 'officer')
    await page.goto(APPEAL_URL)
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน')
    await page.getByTestId('appeal-opinion-note').fill('ตรวจข้อเท็จจริงแล้ว เห็นควรเสนอตามลำดับชั้น')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'ผบช.ชั้นต้น')
    expect(((await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>).stage).toBe('supervisor')
    await expect(page.getByTestId('appeal-return-submit')).toHaveCount(0)
  })
})
