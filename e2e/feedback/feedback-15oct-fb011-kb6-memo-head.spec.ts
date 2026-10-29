import { expect, test, type Locator, type Page } from '@playwright/test'
import { seedMockState } from '../helpers/seed'
import { captureEvidence } from '../helpers/evidence'

/**
 * FB-011 — หัว "บันทึกข้อความ" ของแบบ คบ.6 (และ คบ.4): ค่า "ส่วนราชการ" ต้องอยู่บรรทัดเดียว
 *
 * ค่าตั้งต้น "กลุ่มงานคุ้มครองพยาน กองบริหารคดี สำนักงาน ป.ป.ท." เคยตัดบรรทัดจน "ป.ป.ท." ตกลงบรรทัดใหม่
 * เพราะช่อง "โทร." กินพื้นที่ 38% ของแถว — แก้โดยลดช่อง "โทร." ให้แคบลง (ขนาดตัวอักษรคงเดิม)
 * และช่องโทร.ต้องยังแสดงเบอร์ภายในได้
 */

const CASE_NO = '0501/2569'
const AGENCY = 'กลุ่มงานคุ้มครองพยาน กองบริหารคดี สำนักงาน ป.ป.ท.'

/** ความสูงจริงของ element (ไม่รวม transform scale ของ preview) หารด้วย line-height = จำนวนบรรทัด */
async function lineCount(el: Locator) {
  return el.evaluate((node) => {
    const e = node as HTMLElement
    const lh = parseFloat(getComputedStyle(e).lineHeight)
    return Math.round(e.offsetHeight / lh)
  })
}

async function expectMemoHeadOneLine(page: Page) {
  const agency = page.getByTestId('memo-head-agency').first()
  const phone = page.getByTestId('memo-head-phone').first()
  await agency.scrollIntoViewIfNeeded()
  await expect(agency).toContainText(AGENCY)
  expect(await lineCount(agency), 'ส่วนราชการต้องอยู่บรรทัดเดียว').toBe(1)

  // ช่องโทร. ยังเห็นอยู่ในแถวเดียวกับส่วนราชการ และไม่ล้นกรอบกระดาษ
  await expect(phone).toBeVisible()
  const [a, p] = await Promise.all([agency.boundingBox(), phone.boundingBox()])
  expect(a && p).toBeTruthy()
  expect(Math.abs(a!.y - p!.y), 'โทร. ต้องอยู่แถวเดียวกับส่วนราชการ').toBeLessThan(a!.height)
  expect(p!.x).toBeGreaterThan(a!.x + a!.width - 1)

  const rowOverflow = await phone.evaluate((node) => {
    const row = node.parentElement as HTMLElement
    return row.scrollWidth - row.clientWidth
  })
  expect(rowOverflow, 'แถวส่วนราชการต้องไม่ล้นกระดาษ').toBeLessThanOrEqual(0)
}

test.describe('FB-011 — ส่วนราชการในหัวบันทึกข้อความ คบ.6 / คบ.4 อยู่บรรทัดเดียว', () => {
  test('FB-011 · คบ.6 พรีวิวกระดาษ: ส่วนราชการค่าตั้งต้นอยู่บรรทัดเดียว และ โทร. ยังแสดงอยู่', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('memo-head-agency').first()).toBeAttached()

    await expectMemoHeadOneLine(page)
    await expect(page.getByTestId('memo-head-phone').first()).toContainText('0 2502 6670')

    await captureEvidence(page, 'FB-011-a', page.getByTestId('memo-head-agency').first().locator('xpath=..'), 'ส่วนราชการอยู่บรรทัดเดียว และช่องโทร. ยังแสดงครบ')
  })

  test('FB-011 · ช่อง โทร. ยังรับเบอร์ภายในยาวได้โดยไม่ดันส่วนราชการลงบรรทัดใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    const phone = page.getByTestId('memo-head-phone').first()
    await expect(phone).toBeAttached()
    // ใส่เบอร์ภายในตัวอย่างลงใน draft store ผ่านการแก้ DOM ของพรีวิวโดยตรง (ตรวจเฉพาะ layout)
    await phone.evaluate((n) => { n.textContent = '๐ ๒๕๐๒ ๖๖๗๐ ต่อ ๑๒๓' })
    await expectMemoHeadOneLine(page)
    expect(await lineCount(phone), 'เบอร์ภายในต้องไม่ตัดบรรทัด').toBe(1)
  })

  test('FB-011 · คบ.4 พรีวิวกระดาษใช้หัวเดียวกัน: ถ้ามีค่า ส่วนราชการ ต้องอยู่บรรทัดเดียว', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/4?caseNo=${CASE_NO}`)
    const agency = page.getByTestId('memo-head-agency').first()
    await expect(agency).toBeAttached()
    // คบ.4 ไม่มีค่าตั้งต้นของส่วนราชการ/โทร. — ใส่ค่าเดียวกับ คบ.6 ลงใน DOM เพื่อตรวจเฉพาะ layout ของหัวเดียวกัน
    await agency.evaluate((n, v) => { n.textContent = v }, AGENCY)
    await page.getByTestId('memo-head-phone').first().evaluate((n) => { n.textContent = '0 2502 6670 ต่อ 123' })
    await expectMemoHeadOneLine(page)
  })
})
