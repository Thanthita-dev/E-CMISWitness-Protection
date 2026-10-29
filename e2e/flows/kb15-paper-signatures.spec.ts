import { expect, test } from '@playwright/test'
import { seedMockState } from '../helpers/seed'

for (const role of ['director', 'deputy_secretary', 'secretary']) {
  test(`KB15 ${role} signs only their own pending slot on paper`, async ({ page }) => {
    await seedMockState(page, 'Case 1.13', role, {
      stage: 'termination_review', protectionHandoff: undefined, sarabanDispatch: undefined,
      kb15: { version: 1, trigger: 'due_or_officer', status: 'submitted', approvalStage: role, summary: 'เหตุทดสอบ', createdAt: '2026-10-28', createdBy: 'เจ้าหน้าที่', approvalHistory: [] },
    })
    await page.goto('/form/15?caseNo=0501%2F2569')
    await page.getByRole('button', { name: 'ดูครบทุกหน้า', exact: true }).click()
    await page.getByTestId(`paper-sign-kb15-${role}`).click()
    await page.getByRole('button', { name: /ยืนยันลงนาม/ }).click()
    const sign = await page.evaluate(key => JSON.parse(localStorage.getItem('ecmis-form-draft-storage-v2')!).state.signatures[key], `kb15-${role}`)
    expect(sign.signed).toBe(true)
    expect(sign.signatureImage).toBeTruthy()
    for (const other of ['director', 'deputy_secretary', 'secretary'].filter(r => r !== role)) {
      await expect(page.getByTestId(`paper-sign-kb15-${other}`)).toHaveCount(0)
    }
  })
}

test('responsible officer can sign the KB15 preparer slot', async ({ page }) => {
  await seedMockState(page, 'Case 1.13', 'officer', { kb15: undefined, sarabanDispatch: undefined, protectionHandoff: undefined })
  await page.goto('/form/15?caseNo=0501%2F2569')
  await page.getByTestId('paper-sign-kb15-officer').click()
  await page.getByRole('button', { name: /ยืนยันลงนาม/ }).click()
  const sign = await page.evaluate(() => JSON.parse(localStorage.getItem('ecmis-form-draft-storage-v2')!).state.signatures['kb15-officer'])
  expect(sign.signed).toBe(true)
  expect(sign.signatureImage).toBeTruthy()
})
