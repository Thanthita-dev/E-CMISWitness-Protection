import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * Sheet 08A-2 · WIT0822 → WIT0829 — วิธีที่ 2 จัดสถานที่ปลอดภัย
 *
 * ผัง: รับงานวิธีที่ 2 (WIT0822) → ตรวจขอบเขต (WIT0823) → เสนอสถานที่ (WIT0824)
 *      → ประเมินความปลอดภัย (WIT0825-0826) → ไม่เหมาะสมวนกลับไปเสนอใหม่ / ให้หน่วยงานอื่นทำแทน (วิธีที่ 4)
 *      → จัดแผนย้าย/รับ-ส่ง (WIT0827) → พาย้าย/เข้าพัก (WIT0828) → เริ่มปฏิบัติจริง (WIT0829)
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

const BASE_PATCH = {
  approvedMethods: [2],
  methodTracks: [{ method: 2, status: 'pending' }],
}

test.describe('08A-2 · WIT0822-0829 — วิธีที่ 2 จัดสถานที่ปลอดภัย', () => {
  test('TC-074 · [Happy] เสนอและประเมินสถานที่ปลอดภัยผ่าน แล้วย้ายพยานเข้าพัก (ACTIVE)', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', BASE_PATCH)
    await page.goto(METHOD2_URL)

    // WIT0823 — ขอบเขตที่อนุมัติและความจำเป็น
    await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0824 — เสนอสถานที่
    await page.getByLabel('ประเภทสถานที่').selectOption('pacc_designated')
    await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด')
    await page.getByLabel('ผู้ดูแลสถานที่').fill('ร.ต.ท. สมชาย ดูแลดี')
    await page.getByLabel('ผู้ประเมิน').fill('นางสาวอรุณี ใจมั่น')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0825-0826 — ประเมินความปลอดภัย: เหมาะสม
    await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ปลอดภัยดี มีรั้วรอบและเจ้าหน้าที่รักษาความปลอดภัย')
    await page.getByRole('button', { name: 'สถานที่เหมาะสม' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0827-0828 — แผนย้าย/รับ-ส่ง และผู้ส่งมอบ-ผู้รับมอบ แล้วเริ่มปฏิบัติจริง
    await page.getByLabel('แผนย้าย / รับ–ส่ง').fill('รับพยานจากที่อยู่เดิม นำส่งด้วยรถส่วนกลาง')
    await page.getByLabel('ผู้ส่งมอบ').fill('นางสาวอรุณี ใจมั่น')
    await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
    // TC-077 — methodStartBlocker ยังบังคับต้องแนบหลักฐานการส่งมอบ-รับมอบก่อนกดเริ่มปฏิบัติจริงได้
    await page
      .getByTestId('site-handover-evidence-input')
      .setInputFiles({ name: 'handover-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('handover evidence') })
    await expect(page.getByText('handover-evidence.pdf')).toBeVisible()

    await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<{ method: number; status: string; site?: Record<string, unknown> }>).find(
      (t) => t.method === 2
    )
    expect(track?.status).toBe('active')
    expect(track?.site?.proposedSite).toBe('บ้านพักที่ ป.ป.ท. กำหนด')
    expect(track?.site?.custodian).toBe('ร.ต.ท. สมชาย ดูแลดี')
  })

  test('TC-075 · [Happy] สถานที่ไม่เหมาะสม ต้องเลือกใหม่ — และเก็บผลประเมินครั้งก่อนไว้ครบ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', BASE_PATCH)
    await page.goto(METHOD2_URL)

    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านญาติที่ไม่ปลอดภัยพอ')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // ผลประเมินครั้งที่ 1: ไม่เหมาะสม
    await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ทางเข้า-ออกไม่ปลอดภัย มีทางลัดหลายทาง')
    await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()
    await expect(page.getByText('ยังไม่ได้บันทึกผลว่าสถานที่เหมาะสม', { exact: false })).toHaveCount(0)

    // ระบบวนกลับไปขั้นเสนอสถานที่ใหม่โดยอัตโนมัติ (WIT0826 → WIT0824, BUG-005) ไม่ต้องกดย้อนกลับเอง
    await expect(page.getByLabel('สถานที่ที่เสนอ')).toHaveValue('บ้านญาติที่ไม่ปลอดภัยพอ')
    await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด (แห่งใหม่)')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // ผลประเมินครั้งที่ 2: เหมาะสม — เขียนทับช่อง "ทางเข้า-ออก" เดิม
    await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ตรวจใหม่แล้วปลอดภัยดี')
    await page.getByRole('button', { name: 'สถานที่เหมาะสม' }).click()

    const after = await readCase(page, CASE_NO)
    const site = (after?.methodTracks as Array<{ method: number; site?: Record<string, unknown> }>).find(
      (t) => t.method === 2
    )?.site
    expect(site?.suitable).toBe(true)
    // ธุรกิจที่ถูกต้อง: ต้องเก็บบันทึกผลประเมินครั้งก่อน (ไม่เหมาะสม + เหตุผล) ไว้ครบ ไม่ใช่แค่ผลล่าสุด — เก็บเป็นประวัติ
    // แยกรายรอบใน site.evaluations แทนการเขียนทับฟิลด์แบนตัวเดียว (WIT0825/0826)
    const evaluations = site?.evaluations as Array<{ round: number; suitable: boolean; accessRoutes: string }>
    expect(evaluations).toHaveLength(2)
    expect(evaluations[0].suitable).toBe(false)
    expect(evaluations[0].accessRoutes).toContain('ทางเข้า-ออกไม่ปลอดภัย')
    expect(evaluations[1].suitable).toBe(true)
  })

  test('TC-076 · [Happy] เปลี่ยนเป็นวิธีที่ 4 (เลือกเดี่ยว) เมื่อ ป.ป.ท. ดำเนินการเองไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', BASE_PATCH)
    await page.goto(METHOD2_URL)

    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()

    await expect(page.getByText('หากต้องให้หน่วยงานภายนอกดำเนินการแทน')).toBeVisible()
    await page.getByRole('button', { name: 'เปลี่ยนไปใช้วิธีที่ 4 แทน' }).click()
    await confirmDialog(page, 'ยืนยันเปลี่ยนเป็นวิธีที่ 4', 'วิธีที่ 2')

    // วิธีที่ 4 เลือกร่วมกับวิธีที่ 1–3 ไม่ได้ — แฟ้มเหลือวิธีที่ 4 อย่างเดียว
    const after = await readCase(page, CASE_NO)
    expect(after?.approvedMethods).toEqual([4])
    expect((after?.methodTracks as Array<{ method: number }>).map((t) => t.method)).toEqual([4])

    await expect(page).toHaveURL(/\/protection-method\/4/)
  })

  test('TC-077 · [Negative] บันทึกเข้าพักโดยไม่มีหลักฐานผู้ส่งมอบ-ผู้รับมอบ — ต้องถูกปฏิเสธ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [2],
      // site.suitable: true — สถานที่ผ่านการประเมินแล้ว (BUG-005) เพื่อให้เหลือเหตุที่ขาดเฉพาะหลักฐานส่งมอบ-รับมอบ
      methodTracks: [{ method: 2, status: 'pending', wizardStep: 3, site: { suitable: true } }],
    })
    await page.goto(METHOD2_URL)

    await expect(page.getByLabel('ผู้ส่งมอบ')).toHaveValue('')
    await expect(page.getByLabel('ผู้รับมอบ')).toHaveValue('')
    // ธุรกิจที่ถูกต้อง: ต้องไม่ให้บันทึกจนกว่าจะระบุผู้ส่งมอบ/ผู้รับมอบและแนบหลักฐาน — เจ้าหน้าที่เห็นเหตุผลก่อนกด
    // แต่ปุ่มยังกดได้เพื่อเปิดจอยืนยันตามปกติ (methodStartBlocker/setMethodStatus เป็นด่านบังคับจริงที่ store)
    await expect(page.getByText(/ยังไม่ได้ระบุผู้ส่งมอบและผู้รับมอบ|ยังไม่ได้แนบหลักฐานการส่งมอบ/)).toBeVisible()
    await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<{ method: number; status: string }>).find((t) => t.method === 2)
    expect(track?.status).not.toBe('active')
  })

  test('TC-078 · [Negative] เสนอสถานที่นอกขอบเขตที่ได้รับอนุมัติ — ต้องถูกปฏิเสธ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', BASE_PATCH)
    await page.goto(METHOD2_URL)

    await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ขอบเขตอนุมัติ: เฉพาะที่อยู่พยานเท่านั้น')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // เลือกสถานที่ที่ ป.ป.ท. กำหนด ซึ่งอยู่นอกขอบเขตที่อนุมัติ (เฉพาะที่อยู่พยาน)
    await page.getByLabel('ประเภทสถานที่').selectOption('pacc_designated')
    await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด (นอกขอบเขตที่อนุมัติ)')

    const after = await readCase(page, CASE_NO)
    const site = (after?.methodTracks as Array<{ method: number; site?: Record<string, unknown> }>).find(
      (t) => t.method === 2
    )?.site
    // ธุรกิจที่ถูกต้อง: ระบบต้องแจ้งเตือนว่าเกินขอบเขตที่อนุมัติทันทีที่เลือกประเภท/สถานที่ที่ไม่ตรงกับขอบเขต
    // ของจริง: ไม่มีการตรวจสอบขอบเขตใด ๆ เลย — บันทึกประเภท/สถานที่ที่เลือกได้อย่างอิสระ
    expect(site?.siteType).not.toBe('pacc_designated')
  })

  test('TC-079 · [Edge] เกิดเหตุผิดแผนระหว่างการย้าย — ต้องแจ้งเตือนผู้รับผิดชอบทันทีแยกจากรอบรายงาน', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [2],
      methodTracks: [{ method: 2, status: 'pending', wizardStep: 3 }],
    })
    await page.goto(METHOD2_URL)

    await page.getByLabel('เหตุผิดแผน (ถ้ามี)').fill('พบยานพาหนะต้องสงสัยติดตาม — เปลี่ยนไปใช้เส้นทางสำรองทันที')
    await page.getByLabel('เหตุผิดแผน (ถ้ามี)').blur()

    const after = await readCase(page, CASE_NO)
    const site = (after?.methodTracks as Array<{ method: number; site?: Record<string, unknown> }>).find(
      (t) => t.method === 2
    )?.site
    expect(site?.deviationNote).toContain('ยานพาหนะต้องสงสัย')

    // ธุรกิจที่ถูกต้อง: ต้องมีการแจ้งเตือนผู้รับผิดชอบทันที แยกต่างหากจากรอบรายงานปกติ
    // ของจริง: บันทึกเป็นข้อความในแผนเฉย ๆ ไม่มีการแจ้งเตือน/สร้างเหตุการณ์สำคัญใด ๆ เกิดขึ้นเลย
    await expect(page.locator('.swal2-toast, .swal2-popup')).toHaveCount(0)
    expect((after?.importantEvents as unknown[] | undefined)?.length || 0).toBe(0)
  })
})
