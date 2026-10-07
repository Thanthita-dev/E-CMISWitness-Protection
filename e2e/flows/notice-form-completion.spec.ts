import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'

const NO = 'WP-2569-000501'
test('เติมหนังสือในหน้า คบ.9 แยก แล้วกลับแฟ้มเพื่อนำส่ง โดยเก็บฉบับลงนามเดิม', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4')
  await page.goto(`/dossier/${NO}`)
  await expect(page.getByTestId('notice-dispatch-card')).toHaveCount(0)
  await expect(page.getByTestId('result-notice-card')).toHaveCount(0)
  const original = (await readCase(page, NO) as any).resultNotices[9].original
  await page.locator('[data-testid="dossier-form-row"][data-form-number="9"]').getByRole('link', { name: /เปิดแบบฟอร์ม/ }).click()
  await expect(page).toHaveURL(/\/form\/9\?caseNo=/)
  await completeNoticeDetails(page)
  await checkNoticeReady(page)
  await page.goto(`/dossier/${NO}`)
  await expect(page.getByTestId('notice-dispatch-card')).toBeVisible()
  await expect(page.getByTestId('result-notice-card')).toHaveCount(0)
  await page.getByTestId('notice-dispatch-card').getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
  const notice = (await readCase(page, NO) as any).resultNotices[9]
  expect(notice.status).toBe('sent')
  expect(notice.original).toEqual(original)
  expect(notice.versions).toHaveLength(2)
  expect(notice.dispatches).toHaveLength(1)
})
