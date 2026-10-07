import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { noticeDetails } from '../helpers/noticeDocuments'
import { fieldAfterLabel, signInModal } from '../journeys/journey-helpers'

const NO = 'WP-2569-000501'
for (const channel of ['ไปรษณีย์ตอบรับด่วน (EMS)', 'ส่งมอบโดยตรงถึงตัวพยาน']) {
  test(`เติม คบ.9 แล้วนำส่ง ${channel} รับแจ้งและลงนาม คบ.11 แยกกัน`, async ({ page }) => {
    await seedMockState(page, 'Approved - วิธีที่ 4')
    await page.goto(`/form/9?caseNo=${NO}`)
    const original = (await readCase(page, NO) as any).resultNotices[9].original
    const card = page.getByTestId('notice-dispatch-card')
    await expect(card).toBeVisible()
    await expect(card.getByTestId('notice-delivery-channel')).toBeVisible()
    await expect(card.getByRole('button', { name: /บันทึกการนำส่ง$/ })).toBeEnabled()
    await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
    await expect(card.getByTestId('notice-dispatch-error')).toContainText('เลขที่หนังสือ')
    await expect(page.getByTestId('notice-detail-เลขที่หนังสือ')).toBeFocused()
    expect((await readCase(page, NO))?.dispatchedAt).toBeFalsy()
    for (const [key, value] of Object.entries(noticeDetails)) await page.getByTestId(`notice-detail-${key}`).fill(value)
    await card.getByTestId('notice-delivery-channel').selectOption(channel)
    await expect(card.getByTestId('notice-delivery-instruction')).toContainText(channel.startsWith('ไปรษณีย์') ? 'ใบตอบรับ' : 'ไปพร้อมกันได้')
    await expect(card.getByTestId('notice-open-kb11-sign')).toHaveCount(0)
    if (channel.startsWith('ไปรษณีย์')) await fieldAfterLabel(card, 'เลขติดตามพัสดุ').fill('TH104005698TH')
    else await expect(card.getByText('เลขติดตามพัสดุ')).toHaveCount(0)
    await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
    expect((await readCase(page, NO))?.dispatchChannel).toBe(channel)
    expect((await readCase(page, NO))?.kb11Signed).not.toBe(true)
    await expect(card.getByTestId('notice-open-kb11-sign')).toHaveCount(0)
    await fieldAfterLabel(card, 'ผู้รับหนังสือ').fill('สมชาย ใจดี')
    await card.locator('input[type="file"]').setInputFiles({ name: 'หลักฐานรับหนังสือ.pdf', mimeType: 'application/pdf', buffer: Buffer.from('receipt') })
    await card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
    await expect(card.getByText('คบ.9 ถึงมือพยานและบันทึกการรับครบแล้ว', { exact: true })).toHaveCount(0)
    await page.goto(`/form/11?caseNo=${NO}`)
    await page.getByTestId('kb11-form-sign').click()
    const save = page.getByRole('button', { name: /บันทึกข้อตกลง คบ\.11$/ })
    await expect(save).toBeDisabled()
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: /ลงลายมือชื่อ$/ }).first().click()
      await signInModal(page, i === 0 ? 'สมชาย ใจดี' : 'ผู้ลงนามข้อตกลง')
    }
    await save.click()
    await expect.poll(async () => (await readCase(page, NO))?.kb11Signed).toBe(true)
    const final = await readCase(page, NO) as any
    expect(final.resultNotices[9].original).toEqual(original)
    expect(final.resultNotices[9].dispatches).toHaveLength(1)
    expect(final.resultNotices[9].dispatches[0].receipt.recipient).toBe('สมชาย ใจดี')
    expect(final.kb11Approval).toBeUndefined()
    await page.reload()
    expect((await readCase(page, NO))?.kb11Signed).toBe(true)
  })
}
