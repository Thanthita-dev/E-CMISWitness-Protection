import { expect, test } from '@playwright/test'
import { seedMockState, readCase } from '../helpers/seed'
import { fieldAfterLabel } from '../journeys/journey-helpers'
const NO = 'WP-2569-000501'

test('received KB10 appears in appeal queue and opens intake without creating an appeal automatically', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', 'officer', {
    stage: 'notice', activity7State: 'rejected', kb10Signed: true,
    deliveredAt: new Date().toISOString(), appealDueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
    appealFiledAt: undefined, appealFolder: undefined, nonApprovalClosedAt: undefined,
  })
  await page.goto(`/form/10?caseNo=${NO}`)
  await expect(page.getByTestId('notice-dispatch-card')).toHaveCount(0)
  await page.goto('/appeal')
  const row = page.getByRole('row').filter({ hasText: NO })
  await expect(row).toContainText('รอรับคำอุทธรณ์')
  expect((await readCase(page, NO)).appealFiledAt).toBeFalsy()
  await row.getByRole('link', { name: 'รับคำอุทธรณ์', exact: true }).click()
  await expect(page).toHaveURL(`/appeal-folder/${NO}`)
  const otherTab = await page.context().newPage()
  await otherTab.goto(`/appeal-folder/${NO}`)
  await expect(otherTab.getByTestId('appeal-intake-form')).toBeVisible()
  await expect(page.getByTestId('appeal-intake-document-source')).toHaveValue('appellant_document')
  await page.getByTestId('appeal-intake-document-source').selectOption('agency_form')
  for (const width of [1440, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.screenshot({ path: '/private/tmp/a6-appeal-document-intake.png', fullPage: true })
  await fieldAfterLabel(page, 'เหตุผลในการอุทธรณ์').fill('มีหลักฐานเพิ่มเติมประกอบการขอคุ้มครอง')
  await fieldAfterLabel(page, 'เลขรับสารบรรณกลาง').fill('รับ-512/2569')
  await page.locator('input[type="file"]').first().setInputFiles({ name: 'คำอุทธรณ์.pdf', mimeType: 'application/pdf', buffer: Buffer.from('appeal evidence') })
  await page.getByRole('button', { name: /รับคำร้องอุทธรณ์เข้าระบบ$/ }).click()
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
  await expect.poll(async () => (await readCase(page, NO)).appealFolder?.stage).toBe('received')
  await expect(otherTab.getByTestId('appeal-intake-form')).toHaveCount(0)
  await expect(otherTab.getByTestId('appeal-intake-summary')).toContainText('รับ-512/2569')
  await page.goto('/appeal')
  await expect(page.getByRole('row').filter({ hasText: NO })).toHaveCount(1)
  await expect(page.getByRole('row').filter({ hasText: NO })).toContainText('เปิดแฟ้มอุทธรณ์')
  await page.reload()
  expect((await readCase(page, NO)).appealFolder.intake.registryNo).toBe('รับ-512/2569')
  const intake = (await readCase(page, NO)).appealFolder.intake
  expect(intake.documentSource).toBe('agency_form')
  expect(intake.evidenceDataUrl).toMatch(/^data:application\/pdf;base64,/)
  await page.goto(`/appeal-folder/${NO}`)
  await expect(page.locator('a[download="คำอุทธรณ์.pdf"]')).toHaveAttribute('href', intake.evidenceDataUrl)
  await expect(page.getByTestId('appeal-intake-summary')).toContainText('รับ-512/2569')
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.locator('section[aria-labelledby="appeal-details-title"]').screenshot({ path: '/private/tmp/a6-appeal-details.png' })
  await expect(page.getByTestId('appeal-folder-stage')).toHaveCount(0)
  await page.getByTestId('appeal-check-submit').click()
  await page.getByRole('button', { name: 'ยืนยันแฟ้มครบถ้วน', exact: true }).click()
  await expect(page.getByTestId('appeal-opinion-submit')).toBeVisible()
  await page.getByTestId('appeal-opinion-note').fill('เห็นควรเสนอพิจารณาคำอุทธรณ์พร้อมเอกสารประกอบ')
  await page.getByTestId('appeal-opinion-submit').click()
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
  await expect.poll(async () => (await readCase(page, NO)).appealFolder?.stage).toBe('supervisor')
  await expect(page.getByTestId('appeal-folder-stage')).toHaveCount(0)
  for (const [role, next] of [['supervisor', 'director'], ['director', 'deputy'], ['deputy_secretary', 'secretary']] as const) {
    await page.locator('#topbar-role-select').selectOption(role)
    await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
    await page.getByTestId('appeal-opinion-note').fill(`เห็นควรเสนอพิจารณา (${role})`)
    await page.getByTestId('appeal-opinion-submit').click()
    await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
    await expect.poll(async () => (await readCase(page, NO)).appealFolder?.stage).toBe(next)
  }
  await page.locator('#topbar-role-select').selectOption('secretary')
  await page.reload()
  await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
  await expect(page.getByTestId('appeal-opinion-secretary')).toBeVisible()
  await expect(page.getByTestId('appeal-intake-summary')).toContainText('รับ-512/2569')
  await expect(page.locator('a[download="คำอุทธรณ์.pdf"]')).toHaveAttribute('href', intake.evidenceDataUrl)
  await otherTab.reload()
  await expect(otherTab.getByTestId('appeal-intake-form')).toHaveCount(0)
  await expect(otherTab.getByTestId('appeal-opinion-secretary')).toBeVisible()
  await otherTab.close()
})

test('signed KB10 awaiting receipt is visible but cannot accept an appeal yet', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', 'officer', {
    stage: 'notice', activity7State: 'rejected', kb10Signed: true,
    deliveredAt: undefined, appealDueAt: undefined, appealFiledAt: undefined, appealFolder: undefined,
  })
  await page.goto('/appeal')
  const row = page.getByRole('row').filter({ hasText: NO })
  await expect(row).toContainText('รอพยานได้รับหนังสือ')
  await row.getByRole('link', { name: 'รับคำอุทธรณ์', exact: true }).click()
  await expect(page.getByRole('button', { name: /รับคำร้องอุทธรณ์เข้าระบบ$/ })).toHaveCount(0)
  await expect(page.getByText('บันทึกวันที่พยานได้รับหนังสือก่อนรับคำอุทธรณ์')).toBeVisible()
})
