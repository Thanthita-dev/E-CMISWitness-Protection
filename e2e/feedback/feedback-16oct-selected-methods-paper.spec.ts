import { expect, test, type Locator, type Page } from '@playwright/test'
import { seedMockState } from '../helpers/seed'

/**
 * ข้อเสนอแนะ 16 ต.ค. — กระดาษพิมพ์เฉพาะรูปแบบการคุ้มครองที่เลือก
 * - คบ.6 ข้อ ๘.๒ และ คบ.4 ข้อ ๔.๒ ไม่พิมพ์ครบทุกข้ออีกต่อไป
 * - เรียงเลขข้อใหม่ตั้งแต่ ๑ ตามลำดับของข้อที่เลือก
 * - ยังไม่เลือกเลย = ไม่พิมพ์ข้อใด (เหลือเฉพาะบรรทัดหัวข้อ)
 */

const CASE_NO = '0501/2569'

const LABEL = {
  1: 'จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย (ชื่อ สกุล) ผู้รับการคุ้มครอง',
  2: 'จัดให้พยานอยู่ในสถานที่เหมาะสม',
  3: 'ปกปิด และรักษาความลับเกี่ยวกับชื่อตัว สกุล ที่อยู่ ภาพ หรือข้อมูลอย่างอื่นที่สามารถระบุตัวพยาน',
  4: 'ประสานงานหน่วยงานอื่น',
  sub4: 'ดำเนินการอื่นใด',
}

/** ข้อย่อยคงที่ใต้ข้อ 4 บนกระดาษ */
const printedSub = (page: Page): Locator => page.locator('.paper-a4').getByTestId('paper-protection-method-subitem')

/** รายการรูปแบบที่พิมพ์บนกระดาษ (กระดาษแสดงทีละหน้า จึงตรวจจาก DOM ไม่ใช่การมองเห็น) */
const printed = (page: Page): Locator => page.locator('.paper-a4').getByTestId('paper-protection-method')

/** ตั้งให้เลือกเฉพาะข้อที่ระบุ ข้ออื่นปิดหมด — ไม่พึ่งค่าเริ่มต้นของข้อมูลจำลอง */
async function selectOnly(page: Page, prefix: string, all: number[], wanted: number[]) {
  // ปิดก่อน แล้วค่อยเปิด เพราะข้อ 4 กับกลุ่ม 1–3 เลือกร่วมกันไม่ได้
  for (const n of all) {
    const btn = page.getByTestId(`${prefix}-${n}`)
    if ((await btn.getAttribute('aria-pressed')) === 'true') await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'false')
  }
  for (const n of wanted) {
    const btn = page.getByTestId(`${prefix}-${n}`)
    await btn.click()
    await expect(btn).toHaveAttribute('aria-pressed', 'true')
  }
}

test.describe('คบ.6 ข้อ ๘.๒ — พิมพ์เฉพาะรูปแบบที่เลือก', () => {
  const KB6 = [1, 2, 3, 4]

  test.beforeEach(async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('method-option-1')).toBeVisible()
  })

  test('ยังไม่เลือกรูปแบบ → กระดาษไม่พิมพ์ข้อใดเลย แต่ยังมีหัวข้อ ๘.๒', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [])

    await expect(printed(page)).toHaveCount(0)
    await expect(page.locator('.paper-a4').filter({ hasText: '๘.๒ ดำเนินการคุ้มครองโดยการ' })).not.toHaveCount(0)
  })

  for (const n of [1, 2, 3]) {
    test(`เลือกข้อ ${n} ข้อเดียว → พิมพ์เฉพาะข้อนั้นเป็นข้อ ๑.`, async ({ page }) => {
      await selectOnly(page, 'method-option', KB6, [n])

      await expect(printed(page)).toHaveText([`๑. ${LABEL[n as 1 | 2 | 3]}`])
    })
  }

  test('เลือกข้อ 1 และ 3 → พิมพ์ ๑. และ ๒. ตามลำดับ ไม่มีข้อ 2', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [1, 3])

    await expect(printed(page)).toHaveText([`๑. ${LABEL[1]}`, `๒. ${LABEL[3]}`])
    await expect(page.locator('.paper-a4').filter({ hasText: LABEL[2] })).toHaveCount(0)
  })

  test('เลือกครบกลุ่ม 1–3 → พิมพ์ทั้งสามข้อ ไม่มี "ประสานงานหน่วยงานอื่น"', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [1, 2, 3])

    await expect(printed(page)).toHaveText([`๑. ${LABEL[1]}`, `๒. ${LABEL[2]}`, `๓. ${LABEL[3]}`])
    await expect(printed(page).filter({ hasText: LABEL[4] })).toHaveCount(0)
    await expect(printedSub(page)).toHaveCount(0)
  })

  test('เลือกข้อ 4 → พิมพ์ "๑. ประสานงานหน่วยงานอื่น" และ "๑.๑ ดำเนินการอื่นใด"', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [4])

    await expect(printed(page)).toHaveText([`๑. ${LABEL[4]}`])
    await expect(printedSub(page)).toHaveText([`๑.๑ ${LABEL.sub4}`])
  })

  test('รายละเอียดข้อ 3 พิมพ์ใต้ข้อที่เรียงเลขใหม่ และหายเมื่อเลิกเลือก', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [3])
    await page.getByTestId('kb6-method-detail-3').fill('ปกปิดชื่อและที่อยู่พยาน')

    await expect(printed(page)).toHaveText([`๑. ${LABEL[3]}`])
    await expect(page.locator('.paper-a4').getByTestId('kb6-paper-method-detail-3')).toContainText('ปกปิดชื่อและที่อยู่พยาน')

    await selectOnly(page, 'method-option', KB6, [])
    await expect(printed(page)).toHaveCount(0)
    await expect(page.locator('.paper-a4').getByTestId('kb6-paper-method-detail-3')).toHaveCount(0)
  })

  test('เปลี่ยนการเลือกแล้วกระดาษอัปเดตทันที', async ({ page }) => {
    await selectOnly(page, 'method-option', KB6, [2])
    await expect(printed(page)).toHaveText([`๑. ${LABEL[2]}`])

    await selectOnly(page, 'method-option', KB6, [4])
    await expect(printed(page)).toHaveText([`๑. ${LABEL[4]}`])
  })
})

test.describe('คบ.4 ข้อ ๔.๒ — พิมพ์เฉพาะรูปแบบที่เลือก', () => {
  const KB4 = [1, 2, 3, 4]

  test.beforeEach(async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/4?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('kb4-method-option-1')).toBeVisible()
  })

  test('ยังไม่เลือกรูปแบบ → กระดาษไม่พิมพ์ข้อใดเลย', async ({ page }) => {
    await selectOnly(page, 'kb4-method-option', KB4, [])

    await expect(printed(page)).toHaveCount(0)
  })

  test('เลือกข้อ 1 และ 3 → พิมพ์ ๑. และ ๒. โดยไม่มีเครื่องหมาย ☑/☐', async ({ page }) => {
    await selectOnly(page, 'kb4-method-option', KB4, [1, 3])

    await expect(printed(page)).toHaveText([`๑. ${LABEL[1]}`, `๒. ${LABEL[3]}`])
    const methods = page.locator('.paper-a4').getByTestId('paper-protection-methods')
    await expect(methods).not.toContainText('☑')
    await expect(methods).not.toContainText('☐')
  })

  test('เลือกข้อ 4 → พิมพ์ "๑. ประสานงานหน่วยงานอื่น" และ "๑.๑ ดำเนินการอื่นใด" เหมือน คบ.6', async ({ page }) => {
    await selectOnly(page, 'kb4-method-option', KB4, [4])

    await expect(printed(page)).toHaveText([`๑. ${LABEL[4]}`])
    await expect(printedSub(page)).toHaveText([`๑.๑ ${LABEL.sub4}`])
  })

  test('คบ.4 ไม่มีข้อ 5 แล้ว', async ({ page }) => {
    await expect(page.getByTestId('kb4-method-option-5')).toHaveCount(0)
  })
})
