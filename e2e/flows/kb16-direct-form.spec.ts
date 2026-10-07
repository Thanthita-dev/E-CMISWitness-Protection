import { expect, test } from '@playwright/test'
import { seedMockState, readCase } from '../helpers/seed'
const NO = 'WP-2569-000501'
test('จัดทำ คบ.16 โดยตรง เสนอลงนาม และทำ คบ.17 ต่อได้เมื่อคำสั่งมีผล', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', 'case_owner', {
    stage: 'termination_order', closedAt: undefined, protectionHandoff: undefined,
    kb15: { version: 1, trigger: 'witness_kb7', summary: 'พยานประสงค์ขอยุติ', status: 'endorsed' },
    terminationApproval: { approved: true, decidedAt: '08/10/2569', decidedBy: 'เลขาธิการ', note: 'อนุมัติ' },
    kb16: undefined, kb17: undefined,
  })
  await page.goto(`/termination/${NO}`)
  await page.getByRole('button', { name: 'จัดทำ คบ.16', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/form/16\\?caseNo=${NO}&from=termination`))
  await expect(page.getByRole('textbox', { name: 'เหตุยุติ *', exact: true })).toHaveValue('พยานประสงค์ขอยุติ')
  await page.getByRole('button', { name: 'ส่งให้ผู้มีอำนาจลงนาม', exact: true }).click()
  expect((await readCase(page, NO)).kb16).toBeUndefined()
  await page.getByRole('textbox', { name: 'คำสั่งที่ *', exact: true }).fill('16/2569')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: 'ส่งให้ผู้มีอำนาจลงนาม', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/termination/${NO}$`))
  expect((await readCase(page, NO)).kb16.status).toBe('submitted')
  expect((await readCase(page, NO)).kb16.signedAt).toBeUndefined()
  await page.locator('#topbar-role-select').selectOption('secretary')
  await page.getByRole('button', { name: /ลงนามคำสั่ง คบ.16/ }).click()
  await expect.poll(async () => (await readCase(page, NO)).kb16.signedAt).toBeTruthy()
  expect((await readCase(page, NO)).stage).toBe('terminated')
  expect((await readCase(page, NO)).closedAt).toBeUndefined()
  await page.locator('#topbar-role-select').selectOption('case_owner')
  await page.reload()
  await expect(page.getByTestId('case-lock-scope')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /เปิดแฟ้มคดี/ })).toBeEnabled()
  await expect(page.getByRole('heading', { name: /คบ.17/ }).first()).toBeVisible()
  await page.screenshot({ path: '/private/tmp/a6-kb16-new.png', fullPage: true })
})
