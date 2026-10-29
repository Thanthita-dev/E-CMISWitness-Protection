import { expect, test, type Locator, type Page } from '@playwright/test'
import { seedMockState } from '../helpers/seed'
import { captureEvidence } from '../helpers/evidence'

/**
 * FB-013/014/015 (ข้อเสนอแนะ 15 ต.ค.) — แบบ คบ.6 ข้อ 8
 * FB-013 ข้อพิจารณาเป็นช่องข้อความอิสระ (เลิกปุ่มพิมพ์ข้อความมาตรฐาน)
 * FB-014 ข้อ 4 เป็น "ประสานงานหน่วยงานอื่น" มีตัวเลือกหน่วยงาน 4.1–4.4 เลือกได้หน่วยงานเดียว (ทั้ง คบ.4 และ คบ.6)
 * FB-015 ข้อ 2 และข้อ 3 มีช่องรายละเอียดเพิ่มเติมขึ้นกระดาษ
 */

const CASE_NO = '0501/2569'
const KB4_FORM_URL = `/form/4?caseNo=${CASE_NO}`
const STANDARD_RATIONALE = 'พิจารณาแล้วเห็นว่าการให้ข้อมูลและพยานหลักฐานของ'
const ROSTER_TEXT = '๘.๑ มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน' // ข้อ ๙.๑ ก็มีวลีนี้ จึงยึดเลขข้อ

async function openKb6(page: Page) {
  await seedMockState(page, 'Case 1.3', 'officer')
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  await expect(page.getByTestId('method-option-1')).toBeVisible()
}

/** กระดาษบนจอ — ไม่นับสำเนาสำหรับสั่งพิมพ์ใน .kb-print-root ที่ซ่อนไว้นอกจอ */
const paper = (page: Page) => page.locator('#root .paper-a4')

/** ตั้งสถานะปุ่มเลือกวิธีให้เป็นตามต้องการ (ไม่พึ่งค่าเริ่มต้นของข้อมูลจำลอง) */
async function setMethod(page: Page, n: number, on: boolean) {
  const btn = page.getByTestId(`method-option-${n}`)
  await expect(btn).toBeVisible()
  if ((await btn.getAttribute('aria-pressed')) !== String(on)) await btn.click()
  await expect(btn).toHaveAttribute('aria-pressed', String(on))
}

/** locator ที่ตรงกับ testid บนกระดาษ (กระดาษอาจมีหลายหน้า) */
const onPaper = (page: Page, testId: string): Locator => paper(page).getByTestId(testId)

test.describe('FB-013 — คบ.6 ข้อ 8 ข้อพิจารณาเป็นข้อความอิสระ', () => {
  test('FB-013 · ไม่มีปุ่มพิมพ์ข้อความมาตรฐาน ช่องข้อพิจารณาว่างตั้งต้น และกระดาษไม่มีข้อความมาตรฐาน', async ({ page }) => {
    await openKb6(page)

    await expect(page.getByRole('button', { name: 'พิมพ์ข้อความข้อพิจารณามาตรฐานลงในเอกสาร' })).toHaveCount(0)

    const area = page.getByTestId('kb6-rationale-input')
    await expect(area).toBeVisible()
    expect(await area.evaluate((el) => el.tagName)).toBe('TEXTAREA')
    await expect(area).toHaveValue('')

    await expect(paper(page).filter({ hasText: STANDARD_RATIONALE })).toHaveCount(0)
    await expect(onPaper(page, 'kb6-paper-rationale')).toHaveCount(0)
    await captureEvidence(page, 'FB-013-a', area, 'ข้อพิจารณาเป็นช่องว่างให้เจ้าหน้าที่พิมพ์เอง ไม่มีข้อความสำเร็จรูป')
  })

  test('FB-013 · พิมพ์ข้อพิจารณา 2 บรรทัด กระดาษแสดงครบทั้งสองบรรทัด', async ({ page }) => {
    await openKb6(page)

    await page.getByTestId('kb6-rationale-input').fill('เห็นควรคุ้มครอง\nเนื่องจากพยานถูกข่มขู่')

    const rationale = onPaper(page, 'kb6-paper-rationale')
    // กระดาษแสดงทีละหน้า ข้อ 8 อยู่หน้า 2 จึงตรวจว่ามีในเอกสาร ไม่ใช่ว่ามองเห็นบนจอ
    await expect(rationale).toHaveCount(1)
    await expect(rationale).toContainText('เห็นควรคุ้มครอง')
    await expect(rationale).toContainText('เนื่องจากพยานถูกข่มขู่')
    expect(((await rationale.textContent()) ?? '').replace(/ /g, ' ')).toContain('เห็นควรคุ้มครอง\nเนื่องจากพยานถูกข่มขู่')
    await expect(paper(page).filter({ hasText: STANDARD_RATIONALE })).toHaveCount(0)
    await captureEvidence(page, 'FB-013-b', rationale, 'ข้อพิจารณาที่พิมพ์ขึ้นบนแบบพิมพ์ คบ.6 ข้อ ๘')

    // ลบข้อความแล้วกลับเป็นเส้นประ
    await page.getByTestId('kb6-rationale-input').fill('')
    await expect(onPaper(page, 'kb6-paper-rationale')).toHaveCount(0)
  })
})

const AGENCIES = ['ส่งให้กรมการปกครอง', 'ส่งให้ตำรวจ', 'ส่งให้ทหาร', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ']

test.describe('FB-014 — ข้อ 4 "ประสานงานหน่วยงานอื่น" พร้อมตัวเลือกหน่วยงาน 4.1–4.4', () => {
  test('FB-014 · ปุ่มข้อ 4 ของ คบ.6 แสดง "4. ประสานงานหน่วยงานอื่น" และเลือกข้อ 4 แล้วมีตัวเลือกหน่วยงาน 4.1–4.4 ไม่มีปุ่มเพิ่มข้อย่อย', async ({ page }) => {
    await openKb6(page)
    const btn = page.getByTestId('method-option-4')
    await expect(btn).toContainText('4. ประสานงานหน่วยงานอื่น')
    await expect(btn).not.toContainText('ประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน')

    await setMethod(page, 4, true)
    const group = page.getByRole('radiogroup', { name: 'ตัวเลือกย่อยข้อ 4' })
    await expect(group.locator('label')).toHaveText(AGENCIES.map((a, i) => `4.${i + 1} ${a}`))
    await expect(page.getByRole('button', { name: /เพิ่มข้อย่อย/ })).toHaveCount(0)
    await captureEvidence(page, 'FB-014-a', [btn, group], 'ข้อ 4 ประสานงานหน่วยงานอื่น พร้อมตัวเลือกหน่วยงาน 4.1–4.4')
  })

  test('FB-014 · เลือกข้อ 4 ล้างข้อ 1–3 ซ่อนข้อ ๘.๑ และกระดาษพิมพ์ ๑. / ๑.๑ เฉพาะหน่วยงานที่เลือก ส่วนเลิกเลือกแล้วหายจากกระดาษ', async ({ page }) => {
    await openKb6(page)

    await setMethod(page, 1, true)
    await expect(paper(page).filter({ hasText: ROSTER_TEXT })).not.toHaveCount(0)

    await setMethod(page, 4, true)
    for (const n of [1, 2, 3]) {
      await expect(page.getByTestId(`method-option-${n}`)).toHaveAttribute('aria-pressed', 'false')
    }
    await expect(paper(page).filter({ hasText: ROSTER_TEXT })).toHaveCount(0)
    await expect(onPaper(page, 'paper-protection-method')).toHaveText(['๑. ประสานงานหน่วยงานอื่น'])

    await page.getByTestId('method-option-4-sub-2').check()
    await expect(onPaper(page, 'paper-protection-method-subitem')).toHaveText(['๑.๑ ส่งให้ตำรวจ'])
    await page.getByTestId('method-option-4-sub-4').check()
    await expect(page.getByTestId('method-option-4-sub-2')).not.toBeChecked()
    await expect(onPaper(page, 'paper-protection-method-subitem')).toHaveText(['๑.๑ ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ'])
    await captureEvidence(page, 'FB-014-b', [onPaper(page, 'paper-protection-method'), onPaper(page, 'paper-protection-method-subitem')], 'แบบพิมพ์แสดงข้อประสานงานหน่วยงานอื่นพร้อมหน่วยงานที่เลือก')

    await setMethod(page, 4, false)
    await expect(onPaper(page, 'paper-protection-method-subitem')).toHaveCount(0)
  })

  test('FB-014 · คบ.4 ใช้ชื่อและตัวเลือกหน่วยงานเดียวกับ คบ.6 และไม่มีข้อ 5', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(KB4_FORM_URL)
    const btn = page.getByTestId('kb4-method-option-4')
    await expect(btn).toBeVisible()
    await expect(btn).toContainText('4. ประสานงานหน่วยงานอื่น')
    await expect(page.getByTestId('kb4-method-option-5')).toHaveCount(0)
    if ((await btn.getAttribute('aria-pressed')) !== 'true') await btn.click()
    await expect(page.getByRole('radiogroup', { name: 'ตัวเลือกย่อยข้อ 4' }).locator('label')).toHaveText(
      AGENCIES.map((a, i) => `4.${i + 1} ${a}`)
    )
  })
})

test.describe('FB-015 — คบ.6 ข้อ 2 / ข้อ 3 มีช่องรายละเอียด', () => {
  test('FB-015 · เลือกข้อ 2 และ 3 แล้วช่องรายละเอียดปรากฏและกรอกขึ้นกระดาษ เลิกเลือกข้อ 3 รายละเอียดข้อ 3 หายจากกระดาษ', async ({ page }) => {
    await openKb6(page)
    await setMethod(page, 4, false)
    await setMethod(page, 2, false)
    await setMethod(page, 3, false)
    await expect(page.getByTestId('kb6-method-detail-2')).toHaveCount(0)
    await expect(page.getByTestId('kb6-method-detail-3')).toHaveCount(0)

    await setMethod(page, 2, true)
    await setMethod(page, 3, true)
    const d2 = page.getByTestId('kb6-method-detail-2')
    const d3 = page.getByTestId('kb6-method-detail-3')
    await expect(d2).toBeVisible()
    await expect(d3).toBeVisible()
    await expect(d2).toHaveValue('')

    // ว่างต้องไม่ขึ้นกระดาษ และไม่บล็อกการทำงาน
    await expect(onPaper(page, 'kb6-paper-method-detail-2')).toHaveCount(0)
    await expect(onPaper(page, 'kb6-paper-method-detail-3')).toHaveCount(0)

    await d2.fill('จัดที่พักปลอดภัยให้พยาน')
    await d3.fill('ติดตั้งกล้องวงจรปิดหน้าบ้านพยาน')
    await expect(onPaper(page, 'kb6-paper-method-detail-2')).toContainText('จัดที่พักปลอดภัยให้พยาน')
    await expect(onPaper(page, 'kb6-paper-method-detail-3')).toContainText('ติดตั้งกล้องวงจรปิดหน้าบ้านพยาน')
    await captureEvidence(page, 'FB-015-a', [d2, d3], 'เลือกข้อ 2 และข้อ 3 แล้วมีช่องรายละเอียดให้กรอก')
    await captureEvidence(page, 'FB-015-b', [onPaper(page, 'kb6-paper-method-detail-2'), onPaper(page, 'kb6-paper-method-detail-3')], 'รายละเอียดขึ้นบนแบบพิมพ์ใต้ข้อนั้น')

    await setMethod(page, 3, false)
    await expect(d3).toHaveCount(0)
    await expect(onPaper(page, 'kb6-paper-method-detail-3')).toHaveCount(0)
    await expect(d2).toBeVisible()
    await expect(onPaper(page, 'kb6-paper-method-detail-2')).toContainText('จัดที่พักปลอดภัยให้พยาน')
  })
})
