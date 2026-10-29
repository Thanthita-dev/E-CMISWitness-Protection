import { expect, test } from '@playwright/test'
import { seedMockState, readCase, switchRole } from '../helpers/seed'
import { saveAndSubmitKb16, termDownLeg, termUpLeg } from '../helpers/termination'
const NO = '0501/2569'
test('จัดทำ คบ.16 โดยตรง เสนอลงนาม และทำ คบ.17 ต่อได้เมื่อคำสั่งมีผล', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', 'case_owner', {
    stage: 'termination_order', closedAt: undefined, protectionHandoff: undefined,
    kb15: { version: 1, trigger: 'witness_kb7', summary: 'พยานประสงค์ขอยุติ', status: 'endorsed' },
    terminationApproval: { approved: true, decidedAt: '08/10/2569', decidedBy: 'เลขาธิการ', note: 'อนุมัติ' },
    kb16: undefined, kb17: undefined,
  })
  await page.goto(`/termination/${encodeURIComponent(NO)}`)
  await page.getByRole('button', { name: 'จัดทำ คบ.16', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/form/16\\?caseNo=${NO.replace('/', '(?:/|%2F)')}&from=termination`))
  await expect(page.getByRole('textbox', { name: 'เหตุยุติ *', exact: true })).toHaveValue('พยานประสงค์ขอยุติ')
  await expect(page.getByRole('button', { name: 'บันทึกร่าง', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'ส่งให้ผู้มีอำนาจลงนาม', exact: true })).toHaveCount(0)
  // ยังไม่กรอกคำสั่งที่ — ส่งจากแถวในแฟ้มไม่ได้ ต้องเตือนให้กรอกให้ครบ
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await page.locator('[data-testid="dossier-form-row"][data-form-number="16"]').getByRole('button', { name: 'ส่งให้อนุมัติ', exact: true }).click()
  await expect(page.locator('.swal2-toast')).toContainText('คำสั่งที่')
  expect((await readCase(page, NO)).kb16).toBeUndefined()
  await page.goto(`/form/16?caseNo=${NO}&from=termination`)
  await page.getByRole('textbox', { name: 'คำสั่งที่ *', exact: true }).fill('16/2569')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await saveAndSubmitKb16(page, NO)
  expect((await readCase(page, NO)).kb16.status).toBe('submitted')
  expect((await readCase(page, NO)).kb16.signedAt).toBeUndefined()
  await termUpLeg(page, NO) // ขาไป: ธุรการหน่วย → ธุรการสำนักงานเลขาธิการ → เลขาธิการ
  await page.goto(`/termination/${encodeURIComponent(NO)}`)
  await page.getByRole('button', { name: /ลงนามคำสั่ง คบ.16/ }).click()
  await expect.poll(async () => (await readCase(page, NO)).kb16.signedAt).toBeTruthy()
  expect((await readCase(page, NO)).stage).toBe('terminated')
  await termDownLeg(page, NO, 'case_owner') // ขากลับ: ธุรการสำนักงานเลขาธิการ → ธุรการหน่วย → เจ้าของสำนวน
  await page.goto(`/termination/${encodeURIComponent(NO)}`)
  expect((await readCase(page, NO)).closedAt).toBeUndefined()
  await switchRole(page, 'case_owner')
  await expect(page.getByTestId('case-lock-scope')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /เปิดแฟ้มคดี/ })).toBeEnabled()
  await expect(page.getByRole('heading', { name: /คบ.17/ }).first()).toBeVisible()
  await page.screenshot({ path: '/private/tmp/a6-kb16-new.png', fullPage: true })
})
