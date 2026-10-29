import { expect, test } from '@playwright/test'
import { seedMockState } from '../helpers/seed'

test('signed KB17 stays green after reopening the dossier', async ({ page }) => {
  await seedMockState(page, 'Case 1.5', 'secretary', {
    extraForms: [16, 17],
    kb16: { status: 'signed', signedAt: '2026-10-29T09:00:00+07:00' },
    kb17: { status: 'signed', documentName: 'KB17', signedAt: '2026-10-29T09:05:00+07:00' },
  })
  await page.goto(`/dossier/${encodeURIComponent('0501/2569')}`)
  const status = page.locator('[data-testid="dossier-form-row"][data-form-number="17"]').getByTestId('form-sign-status')
  await expect(status).toHaveText('ลงนามแล้ว')
  await expect(status).toHaveClass(/success/)
  await page.reload()
  await expect(status).toHaveText('ลงนามแล้ว')
  await expect(status).toHaveClass(/success/)
})
