import { expect, type Page } from '@playwright/test'

export const noticeDetails = {
  เลขที่หนังสือ: 'ปป 001', ปีหนังสือ: '501', วันที่: '7', เดือน: 'ตุลาคม', 'พ.ศ.': '2569', คำร้องลงวันที่: '1 ตุลาคม 2569',
}

export async function completeNoticeDetails(page: Page) {
  for (const [key, value] of Object.entries(noticeDetails)) await page.getByTestId(`notice-detail-${key}`).fill(value)
  await page.getByTestId('notice-save-details').click()
  await expect(page.getByTestId('result-notice-status')).toContainText('เติมรายละเอียดครบ')
  await expect(page.getByTestId('notice-post-sign-warning')).toContainText('ลายมือชื่อเดิมไม่รับรองเนื้อหาที่เติมใหม่')
}

export async function checkNoticeReady(page: Page) {
  await page.getByTestId('notice-check-ready').click()
  await expect(page.getByTestId('result-notice-status')).toHaveText('พร้อมส่งแจ้งผล')
}

export async function dispatchNotice(page: Page) {
  const card = page.getByText('การนำส่งหนังสือและวันที่พยานได้รับ').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await card.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
  await expect(page.getByTestId('result-notice-status')).toHaveText('ส่งแจ้งผลแล้ว')
}
