import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

const NO = 'WP-2569-000501'
test('เลือกที่มาของเรื่องยุติได้ชัดเจน บันทึกแล้วจัดทำ คบ.15 โดยยังไม่ยุติการคุ้มครอง', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, { stage: 'protection', terminationTrigger: undefined, kb15: undefined, kb16: undefined, kb17: undefined })
  await page.goto(`/termination/${NO}`)
  const form = page.getByTestId('termination-trigger-form')
  await expect(form.getByRole('radio')).toHaveCount(3)
  await form.getByRole('radio', { name: /พยานขอยุติ/ }).check()
  await expect(form.getByRole('textbox', { name: 'ไฟล์ คบ.7 ที่พยานลงนาม *', exact: true })).toBeVisible()
  await form.getByRole('radio', { name: /หนังสือภายนอก/ }).check()
  await expect(form.getByRole('textbox', { name: 'หน่วยงานผู้ส่งหนังสือ', exact: true })).toBeVisible()
  await form.getByRole('radio', { name: /เจ้าหน้าที่เสนอ/ }).check()
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await form.screenshot({ path: '/private/tmp/a6-termination-intake.png' })
  await form.getByRole('textbox', { name: 'คำสั่งที่ครบกำหนด *', exact: true }).fill('ลธ. 501/2569')
  await form.getByRole('textbox', { name: 'เหตุผลและข้อมูลประกอบ', exact: true }).fill('ผลประเมินล่าสุดไม่พบภัย ขอเสนอให้พิจารณายุติ')
  await form.getByRole('button', { name: 'บันทึกเรื่องยุติ', exact: true }).click()
  await expect.poll(async () => (await readCase(page, NO)).terminationTrigger?.ref).toBe('ลธ. 501/2569')
  expect((await readCase(page, NO)).stage).toBe('termination_review')
  expect((await readCase(page, NO)).kb15).toBeUndefined()
  await page.reload()
  await expect(page.getByText('ผลประเมินล่าสุดไม่พบภัย ขอเสนอให้พิจารณายุติ', { exact: true })).toBeVisible()
})
