import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

export async function confirmSecretaryApproval(page: Page, destination: 'original_owner' | 'got' = 'original_owner', instruction?: string) {
  await page.getByTestId('decision-destination-select').selectOption(destination)
  if (instruction) await page.getByTestId('decision-instruction-input').fill(instruction)
  await page.getByTestId('decision-confirm-button').click()
  await expect(page.getByTestId('decision-review-step')).toBeVisible()
  await page.getByTestId('decision-confirm-button').click()
  await expect(page.getByTestId('decision-review-step')).toHaveCount(0)
}

export async function handoffAction(page: Page, action: 'receive' | 'submit' | 'assign' | 'accept', note = '') {
  if (note) await page.getByTestId('got-handoff-note').fill(note)
  await page.getByTestId(`got-${action}-button`).click()
  if (action === 'receive' || action === 'accept') {
    await expect(page.getByRole('dialog', { name: action === 'accept' ? 'รับงานคุ้มครอง กอท.' : 'รับเรื่องหลังอนุมัติ กอท.' })).toHaveCount(0)
    return
  }
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await expect(dialog).toBeVisible()
  await dialog.locator('.swal2-confirm').click()
  await expect(dialog).toHaveCount(0)
}
