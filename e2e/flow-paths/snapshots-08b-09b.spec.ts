import { test } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { snap } from '../helpers/snapshot'
import { CASE_NO, confirmDialog } from '../journeys/journey-helpers'

/**
 * Snapshot เสริมของแท็บ 08B / 09B — กิ่งที่ spec หลัก (tabs-08b-09b-agency-article14-appeal) ไม่ได้เดิน
 *   08B · E8B14  ผอ.สำนัก/กอง ส่งคืนแก้ไข (WIT0865 → WIT0845)
 *   09B · overview 09B>11D  อุทธรณ์คำสั่งยุติ (คบ.17) เปิดจากหน้า /termination
 * ทำงานจริงเฉพาะเมื่อรันด้วย FLOW_SNAPSHOTS=1; รันปกติเป็นเทสต์เดินทางสั้น ๆ ที่ผ่านได้เช่นกัน
 */

type Rec = Record<string, any>
const M4 = `/protection-method/4?caseNo=${CASE_NO}`
const AGENCY_B = 'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ'

test.describe('snapshots เสริม 08B / 09B', () => {
  test('08B E8B14 · ผอ.สำนัก/กอง ส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่ → เจ้าหน้าที่เสนอใหม่ (WIT0845)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 8.1', 'officer')
    await page.goto(M4)

    // WIT0842-0843 · เลือกสถานี + ส่งหนังสือประสานขาออก
    await page.getByTestId('coordination-province').selectOption('นนทบุรี')
    await page.getByTestId('coordination-station-search').fill('สภ.ปากเกร็ด')
    const station = page.getByTestId('coordination-agency')
    const id = await station.locator('option', { hasText: 'สภ.ปากเกร็ด' }).getAttribute('value')
    await station.selectOption(id!)
    await page.getByRole('textbox', { name: 'ผู้ประสานงาน', exact: true }).fill('ร.ต.อ. ผู้ประสานงานทดสอบ')
    await page.getByRole('textbox', { name: 'ตำแหน่ง', exact: true }).fill('รองสารวัตร')
    await page.getByRole('textbox', { name: 'เบอร์โทร', exact: true }).fill('0812345678')
    await page.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
    await page.getByTestId('coordination-letter-number').fill('ปปท 0004/1234')
    await page.getByLabel('ส่งหนังสือประสานโดย', { exact: true }).selectOption('direct')
    await page.getByTestId('coordination-send-outgoing').click()
    await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', 'สถานีตำรวจภูธรปากเกร็ด')

    // WIT0844 ปฏิเสธ → WIT0845 เสนอหน่วยงานใหม่
    await page.locator('label', { hasText: 'เหตุผล (กรณีปฏิเสธ)' }).locator('textarea').fill('อัตรากำลังไม่เพียงพอ')
    await page.getByTestId('coordination-decline').click()
    await confirmDialog(page, 'ยืนยันบันทึกการปฏิเสธ', 'เริ่มไม่ได้')
    await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
    await page.getByTestId('coordination-note').fill('มีชุดปฏิบัติการในพื้นที่')
    await page.getByTestId('coordination-submit').click()
    await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่', 'ผบช.ชั้นต้น')

    // WIT0864 ผบช.ชั้นต้น เห็นชอบ → ผอ.
    await switchRole(page, 'supervisor')
    await page.goto(M4)
    await page.getByTestId('coordination-decision-note').fill('เห็นควรประสานหน่วยงานที่เสนอ')
    await page.getByTestId('coordination-endorse').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')

    // WIT0865 ผอ. ส่งคืนแก้ไข (ต้องมีเหตุผล)
    await switchRole(page, 'director')
    await page.goto(M4)
    await page.getByTestId('coordination-return').click()
    await page.getByTestId('coordination-decision-note').fill('ขอเหตุผลประกอบการเลือกหน่วยงานเพิ่ม')
    await page.getByTestId('coordination-return').click()
    await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข')
    const proposals = ((await readCase(page, CASE_NO)) as Rec).coordinationProposals as Rec[]
    if (proposals[0].stage !== 'returned') throw new Error(`คาดว่า returned แต่ได้ ${proposals[0].stage}`)

    await switchRole(page, 'officer')
    await page.goto(M4)
    await snap(page, 'edge:08B:E8B14', { label: 'ผอ.สำนัก/กองส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่ กลับให้เจ้าหน้าที่เสนอใหม่', route: M4, role: 'officer' })
  })

  test('09B overview 09B>11D · อุทธรณ์คำสั่งยุติ (คบ.17) ใช้ฟอร์มรับอุทธรณ์เดียวกัน ที่หน้า /termination', async ({ page }) => {
    // Case 1.18 = คบ.17 ส่งถึงพยานแล้ว มีวันรับจริงและกรอบอุทธรณ์ (ตั้งต้นของ 11D ขั้นรอรับอุทธรณ์)
    await seedMockState(page, 'Case 1.18', 'officer')
    await page.goto(`/termination/${encodeURIComponent(CASE_NO)}`)
    await page.getByTestId('appeal-intake-form').waitFor()
    await snap(page, 'overview:09B>11D', {
      label: 'อุทธรณ์คำสั่งยุติ (คบ.17) เปิดฟอร์มรับอุทธรณ์ชุดเดียวกับ 09B ที่หน้ายุติ (แท็บ 11D)',
      route: `/termination/${encodeURIComponent(CASE_NO)}`,
      role: 'officer',
    })
  })
})
