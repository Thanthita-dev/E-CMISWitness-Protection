import { expect, type Page } from '@playwright/test'

export const decisionWorkspace = (page: Page) => page.getByTestId('notice-decision-workspace')

export async function choosePreliminaryOutcome(page: Page, formNo: 9 | 10) {
  if (await decisionWorkspace(page).isVisible()) await page.getByTestId('notice-decision-back').click()
  await page.getByTestId(formNo === 9 ? 'approve-case-button' : 'reject-case-button').click()
  await expect(decisionWorkspace(page)).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/form/${formNo}\\?caseNo=`))
  await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
}

export async function fillDecisionWorkspace(page: Page, destination: 'original_owner' | 'got' = 'original_owner') {
  await page.getByTestId('notice-decision-number').fill('ลธ. 501/2569')
  await page.getByTestId('notice-decision-reason').fill('ผลพิจารณาจากข้อเท็จจริงสมมติ')
  const destinationField = page.getByTestId('notice-decision-destination')
  if (await destinationField.count()) await destinationField.selectOption(destination)
  const instruction = page.getByTestId('notice-decision-instruction')
  if (await instruction.count()) await instruction.fill('ให้ดำเนินการตามผลพิจารณา')
}

export async function saveDecisionWorkspace(page: Page) {
  await page.getByTestId('notice-decision-save').click()
  await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
}

export async function confirmInlineDecision(page: Page, succeeds = true) {
  const destinationField = page.getByTestId('notice-decision-destination')
  const destination = await destinationField.count() ? await destinationField.inputValue() : undefined
  await page.getByTestId('notice-decision-confirm').click()
  if (!succeeds) {
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
    return
  }
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await expect(dialog).toContainText('ส่งงานแล้ว')
  await expect(dialog).toContainText('ส่งงานให้')
  if (destination === 'got') await expect(dialog).toContainText('ส่งงานให้ธุรการคดี กอท.แล้ว')
  else await expect(dialog).not.toContainText('ส่งงานให้ธุรการคดี กอท.แล้ว')
  await expect(page).toHaveURL(/\/form\/(9|10)\?caseNo=/)
  await dialog.getByRole('button', { name: 'ตกลง', exact: true }).click()
  await expect(page).toHaveURL(/\/dossier\//)
}

export async function notificationCount(page: Page) {
  return page.evaluate(() => {
    const value = localStorage.getItem('ecmis-notifications-storage')
    return value ? JSON.parse(value).state.notifications.length : 0
  })
}
