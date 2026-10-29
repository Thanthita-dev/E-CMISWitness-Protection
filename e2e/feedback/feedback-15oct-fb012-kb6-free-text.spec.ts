import { expect, test, type Page } from '@playwright/test'
import { seedMockState } from '../helpers/seed'
import { captureEvidence } from '../helpers/evidence'

/**
 * FB-012 (ข้อเสนอแนะ 14 ต.ค.) — แบบ คบ.6 ข้อ ๓ "รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง"
 * เป็นข้อความอิสระที่เจ้าพนักงานเขียนเอง: ช่องเดียวหลายบรรทัด พิมพ์ลงกระดาษตามที่กรอกทุกบรรทัด
 * ไม่บังคับรูปประโยค "ตามระเบียบฯ ข้อ ๑๕ ... ในระหว่างวันที่ ... (รวมเป็นเวลา ...)" อีกต่อไป
 * ส่วนช่องเลือกระยะเวลาที่เสนอขอยังอยู่ เพราะระบบใช้คำนวณกำหนดครบ
 */

const CASE_NO = '0501/2569'
const FREE_TEXT_LABEL = 'รายละเอียดรูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง'

async function openKb6(page: Page) {
  await seedMockState(page, 'Case 1.3', 'officer')
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
}

/** ข้อความของกระดาษระหว่างหัวข้อ ๓ ถึงหัวข้อ ๔ */
async function paperSection3(page: Page) {
  const text = (await page.locator('.paper-a4').first().innerText()).replace(/ /g, ' ')
  const start = text.indexOf('๓. รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง')
  const end = text.indexOf('๔. สถานภาพของพยาน')
  expect(start, 'ต้องมีหัวข้อ ๓ บนกระดาษ').toBeGreaterThanOrEqual(0)
  expect(end, 'ต้องมีหัวข้อ ๔ ต่อจากข้อ ๓').toBeGreaterThan(start)
  return text.slice(start, end)
}

test.describe('FB-012 — คบ.6 ข้อ ๓ เป็นข้อความอิสระ', () => {
  test('FB-012 · ข้อ 3 ในฟอร์มมีช่องข้อความอิสระ ไม่มีช่องรูปแบบการคุ้มครอง/วันที่เดิม แต่ยังมีช่องระยะเวลา', async ({ page }) => {
    await openKb6(page)

    const area = page.getByLabel(FREE_TEXT_LABEL)
    await expect(area).toBeVisible()
    expect(await area.evaluate((el) => el.tagName)).toBe('TEXTAREA')
    await expect(area).not.toHaveAttribute('required', '')

    await expect(page.getByLabel('รูปแบบการคุ้มครอง (ตามระเบียบฯ ข้อ 15)')).toHaveCount(0)
    await expect(page.getByLabel('ในระหว่างวันที่')).toHaveCount(0)
    await expect(page.getByLabel('รวมเป็นเวลา (เดือน)')).toHaveCount(0)
    await expect(page.getByLabel('และ (วัน)')).toHaveCount(0)

    const duration = page.getByLabel(/ระยะเวลาที่เสนอขอความคุ้มครอง/)
    await expect(duration).toBeVisible()
    await expect(duration.locator('option')).toHaveCount(4)
    await captureEvidence(page, 'FB-012-a', [area, duration], 'ข้อ 3 เป็นช่องข้อความอิสระ และยังมีตัวเลือกระยะเวลา')
  })

  test('FB-012 · ข้อความหลายบรรทัดที่พิมพ์ขึ้นกระดาษใต้หัวข้อ ๓ ครบทุกบรรทัด และไม่มีประโยคโครงเดิม', async ({ page }) => {
    await openKb6(page)

    await page.getByLabel(FREE_TEXT_LABEL).fill('จัดชุดคุ้มครองติดตามพยานระหว่างเดินทาง\nตรวจที่พักทุกวัน เป็นเวลา ๓๐ วัน')

    const sec = await paperSection3(page)
    expect(sec).toContain('จัดชุดคุ้มครองติดตามพยานระหว่างเดินทาง\nตรวจที่พักทุกวัน เป็นเวลา ๓๐ วัน')
    expect(sec).not.toContain('ตามระเบียบฯ ข้อ ๑๕')
    expect(sec).not.toContain('(รวมเป็นเวลา')
    expect(sec).not.toContain('(รูปแบบการคุ้มครอง)')
    expect(sec).not.toContain('ให้บันทึกรายละเอียด')

    await captureEvidence(page, 'FB-012-b', page.locator('#root .paper-a4').getByText('จัดชุดคุ้มครองติดตามพยานระหว่างเดินทาง'), 'ข้อความที่พิมพ์ขึ้นบนแบบพิมพ์ใต้ข้อ ๓ ครบทุกบรรทัด')
  })

  test('FB-012 · ข้อความว่างแสดงเส้นประเปล่าบนกระดาษ และเลือกระยะเวลาได้ต่อไป', async ({ page }) => {
    await openKb6(page)

    await page.getByLabel(FREE_TEXT_LABEL).fill('')
    const sec = await paperSection3(page)
    expect(sec.trim()).toBe('๓. รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง')
    await expect(page.locator('.paper-a4').first().locator('div.border-dotted').first()).toBeVisible()

    const duration = page.getByLabel(/ระยะเวลาที่เสนอขอความคุ้มครอง/)
    await duration.selectOption({ index: 1 })
    await expect(duration).toHaveValue('30')
  })
})
