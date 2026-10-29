import { expect, Page } from '@playwright/test'

/** หน้าเปิดงานถามแนวทางก่อน (ตาม คบ.6 หรือ คบ.4 / เลือกใหม่) — เลือกตามเอกสารฐานเมื่อหน้าเลือกแนวทางปรากฏ */
export async function chooseKb6IfAsked(page: Page) {
  const panel = page.getByTestId('method-choice-panel')
  if (!(await panel.isVisible({ timeout: 3000 }).catch(() => false))) return
  await panel.getByTestId(/^method-choice-kb[46]$/).check()
  await panel.getByTestId('method-choice-confirm').click()
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  await expect(panel).toHaveCount(0)
}
