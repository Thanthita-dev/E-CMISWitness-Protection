import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { switchClerkRole } from '../helpers/saraban'
import { captureEvidence } from '../helpers/evidence'

/**
 * FB-017 (ข้อเสนอแนะ 15 ต.ค.) — เลขสารบรรณออกตามจำนวน "ผู้รับ" ไม่ใช่ตามจำนวนเอกสารแนบหรือ คบ.
 * ชุดนำส่งไปผู้รับรายเดียว = เลขเดียวครอบคลุมทุก คบ. ในชุด · เพิ่มผู้รับ = ต้องออกเลขเพิ่มให้ผู้รับรายนั้น
 */

const NO = '0501/2569'
const SARABAN = `/saraban/${encodeURIComponent(NO)}`
test.use({ actionTimeout: 10_000, viewport: { width: 1440, height: 1000 } })

const forms = (r: any): number[] => r.forms ?? [r.formNo]

async function openDirectorOutgoing(page: Page) {
  await seedMockState(page, 'Case 1.5', 'director', { kb6DirectorSignedAt: '2026-10-12 09:00', stage: 'director_outgoing_registry' })
  await switchClerkRole(page, 'receiver')
  await page.goto(SARABAN)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toBeVisible()
  return card
}

test.describe('FB-017 — เลขสารบรรณต่อผู้รับ', () => {
  test('FB-017 · ชุด คบ.1/3/6 ไปผู้รับรายเดียวใช้เลขเดียว และตราประทับขึ้นครบทั้ง 3 ฉบับ', async ({ page }) => {
    const card = await openDirectorOutgoing(page)

    // ชุดเอกสารแสดงเป็นข้อมูลอ่านอย่างเดียว มีช่องลงเลขช่องเดียวต่อผู้รับ
    for (const n of [1, 3, 6]) await expect(card.getByTestId(`saraban-bundle-form-${n}`)).toBeVisible()
    await expect(card.getByTestId('saraban-recipient-0')).toBeVisible()
    await expect(card.getByTestId('saraban-recipient-1')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'บันทึกเลขทะเบียน' })).toHaveCount(1)
    await expect(card.getByTestId('saraban-progress')).toContainText('0/1 ผู้รับ')
    await expect(card.getByTestId('saraban-submit-button')).toBeDisabled()
    await captureEvidence(page, 'FB-017-a', [card.getByTestId('saraban-bundle'), card.getByTestId('saraban-recipient-0')], 'ชุดเอกสาร 3 ฉบับ ส่งผู้รับ 1 ราย ลงเลขเพียงครั้งเดียว')

    await card.getByRole('button', { name: 'บันทึกเลขทะเบียน' }).click()
    await expect(card.getByTestId('saraban-progress')).toContainText('1/1 ผู้รับ')
    await expect(card.getByTestId('saraban-submit-button')).toBeEnabled()

    const c = await readCase(page, NO)
    const records = (c?.sarabanRecords ?? []) as any[]
    expect(records).toHaveLength(1)
    expect(forms(records[0])).toEqual([1, 3, 6])

    // ตราประทับเลขเดียวกันบนกระดาษของทุกฉบับในชุด
    for (const n of [1, 3, 6]) {
      await page.goto(`/form/${n}?caseNo=${NO}&tab=saraban`)
      const stamp = page.getByTestId(`saraban-stamp-director_outgoing-${n}`).first()
      await expect(stamp).toBeVisible()
      await expect(stamp).toContainText(String(records[0].number))
      if (n === 6) await captureEvidence(page, 'FB-017-c', stamp, 'เลขเดียวกันประทับบนทุกฉบับในชุด (ตัวอย่าง คบ.6)')
    }
  })

  test('FB-017 · เพิ่มผู้รับอีกราย ต้องได้เลขที่สองก่อนส่ง และประวัติแสดงทีละผู้รับพร้อมรายการ คบ.', async ({ page }) => {
    const card = await openDirectorOutgoing(page)

    await card.getByRole('button', { name: 'บันทึกเลขทะเบียน' }).click()
    await expect(card.getByTestId('saraban-submit-button')).toBeEnabled()

    await card.getByTestId('saraban-add-recipient').click()
    await card.getByTestId('saraban-add-recipient-confirm').click()
    await expect(card.getByRole('alert')).toContainText('กรุณาระบุชื่อผู้รับ')
    await card.getByTestId('saraban-new-recipient-input').fill('ผอ.กองบริหารคดี (สำเนา)')
    await card.getByTestId('saraban-add-recipient-confirm').click()

    await expect(card.getByTestId('saraban-recipient-1')).toContainText('ผอ.กองบริหารคดี (สำเนา)')
    await expect(card.getByTestId('saraban-progress')).toContainText('1/2 ผู้รับ')
    await expect(card.getByTestId('saraban-submit-button')).toBeDisabled()
    await expect(card.getByTestId('saraban-blocker')).toContainText('เหลืออีก 1 ผู้รับ')
    await captureEvidence(page, 'FB-017-b', [card.getByTestId('saraban-recipient-1'), card.getByTestId('saraban-blocker')], 'เพิ่มผู้รับรายที่ 2 แล้ว ต้องลงเลขให้ผู้รับนั้นก่อนส่งต่อ')

    // เลขของผู้รับรายที่สองต้องไม่ซ้ำเลขแรก
    await card.getByTestId('saraban-recipient-1').getByRole('button', { name: 'บันทึกเลขทะเบียน' }).click()
    await expect(card.getByTestId('saraban-progress')).toContainText('2/2 ผู้รับ')
    await expect(card.getByTestId('saraban-submit-button')).toBeEnabled()

    const records = ((await readCase(page, NO))?.sarabanRecords ?? []) as any[]
    expect(records).toHaveLength(2)
    expect(new Set(records.map((r) => r.number)).size).toBe(2)
    expect(records.map((r) => r.recipient)).toContain('ผอ.กองบริหารคดี (สำเนา)')
    for (const r of records) expect(forms(r)).toEqual([1, 3, 6])

    // ประวัติ: หนึ่งแถวต่อผู้รับ ระบุ คบ. ที่ครอบคลุม
    const history = card.getByTestId('saraban-history')
    await history.locator('summary').click()
    const rows = history.getByTestId('saraban-history-row-director_outgoing')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(1)).toContainText('ถึง ผอ.กองบริหารคดี (สำเนา)')
    await expect(rows.nth(1)).toContainText('คบ.1, คบ.3, คบ.6')

    // ส่งต่อได้เมื่อครบทุกผู้รับ
    await card.getByTestId('saraban-submit-button').click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.locator('.swal2-confirm').click()
    await dialog.waitFor({ state: 'detached' })
    await expect.poll(async () => (await readCase(page, NO))?.stage).toBe('secretary_incoming_registry')

    // ตราประทับของ คบ.6 แสดงเลขของทั้งสองผู้รับ
    await page.goto(`/form/6?caseNo=${NO}&tab=saraban`)
    await expect(page.getByTestId('saraban-stamp-director_outgoing-6')).toHaveCount(2)
  })

  test('FB-017 · ผู้รับที่เพิ่มเองลบได้ก่อนลงเลข แต่ผู้รับตั้งต้นลบไม่ได้', async ({ page }) => {
    const card = await openDirectorOutgoing(page)
    await expect(card.getByTestId('saraban-recipient-remove-0')).toHaveCount(0)
    await card.getByTestId('saraban-add-recipient').click()
    await card.getByTestId('saraban-new-recipient-input').fill('ผู้รับทดสอบ')
    await card.getByTestId('saraban-add-recipient-confirm').click()
    await expect(card.getByTestId('saraban-recipient-1')).toBeVisible()
    await card.getByTestId('saraban-recipient-remove-1').click()
    await expect(card.getByTestId('saraban-recipient-1')).toHaveCount(0)
    await expect(card.getByTestId('saraban-progress')).toContainText('0/1 ผู้รับ')
  })

  test('FB-017 · ขาเข้าไม่มีปุ่มเพิ่มผู้รับ (เพิ่มได้เฉพาะขาออก)', async ({ page }) => {
    const card = await openDirectorOutgoing(page)
    await expect(card.getByTestId('saraban-add-recipient')).toBeVisible()
    await card.getByRole('button', { name: 'บันทึกเลขทะเบียน' }).click()
    await card.getByTestId('saraban-submit-button').click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await dialog.locator('.swal2-confirm').click()
    await dialog.waitFor({ state: 'detached' })
    await expect.poll(async () => (await readCase(page, NO))?.stage).toBe('secretary_incoming_registry')

    await switchClerkRole(page, 'secretary_receiver')
    await page.goto(SARABAN)
    const incoming = page.getByTestId('saraban-workspace')
    await expect(incoming).toHaveAttribute('data-checkpoint', 'secretary_incoming')
    await expect(incoming.getByTestId('saraban-recipient-0')).toBeVisible()
    await expect(incoming.getByTestId('saraban-add-recipient')).toHaveCount(0)
  })
})
