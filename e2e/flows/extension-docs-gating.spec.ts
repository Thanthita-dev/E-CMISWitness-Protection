import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { NO, card, noHorizontalOverflow, openDemoCase, reqOf, submitKb14FromForm } from '../helpers/extensionDocs'

const REVIEW_NO = '9901/2569'
const signButton = (page: Page) => page.getByTestId('kb6-sign-button')

/** ไปที่ /form/6 ด้วยบทบาทปัจจุบัน แล้วรอให้ฟอร์มโหลดก่อนนับปุ่มลงนาม */
async function openKb6(page: Page) {
  await page.goto(`/form/6?caseNo=${NO}`)
  await expect(page.getByRole('textbox', { name: /ส่วนราชการ/ })).toBeVisible()
}

test('ปุ่มทางเข้าอื่นพาไปหน้าแฟ้ม และกดขอขยายซ้ำไม่สร้างฉบับซ้ำ', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, { stage: 'method_operation' })
  await page.goto('/protection')
  await page.getByRole('button', { name: 'เพิ่มเคสตัวอย่างทบทวน / ขยายเวลา / ส่งต่อ', exact: true }).click()

  // dialog แจ้งเตือนทบทวน -> จัดทำ คบ.14
  await page.goto(`/protection-duration?caseNo=${REVIEW_NO}`)
  const dialog = page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'จัดทำ คบ.14', exact: true }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(REVIEW_NO)}`)
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 2')

  // กดปุ่มขอขยายเวลาซ้ำ: ยังเป็นฉบับที่ 2 และประวัติมีเฉพาะฉบับที่ 1
  await page.goto(`/protection-duration?caseNo=${REVIEW_NO}`)
  await page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true }).getByRole('button', { name: 'ภายหลัง', exact: true }).click()
  await page.getByRole('button', { name: 'ขอขยายเวลา คบ.14', exact: true }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(REVIEW_NO)}`)
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 2')
  await expect(card(page)).not.toContainText('ฉบับที่ 3')
  const c: any = await readCase(page, REVIEW_NO)
  expect(c.extensionDocs.kb6Version).toBe(2)
  expect(c.extensionDocs.kb3Version).toBe(2)

  await page.goto(`/form/6?caseNo=${REVIEW_NO}`)
  await page.getByText('ดูประวัติเวอร์ชัน').first().click()
  await expect(page.getByText(/ฉบับที่ 1/).first()).toBeVisible()
  await expect(page.getByText(/ฉบับที่ 3/)).toHaveCount(0)
})

test('ยังไม่ส่ง คบ.14 ยังลงนาม คบ.6 ไม่ได้', async ({ page }) => {
  await openDemoCase(page)
  await openKb6(page)
  await expect(page.getByTestId('kb6-ext-not-submitted')).toBeVisible()
  await expect(signButton(page)).toHaveCount(0)

  await switchRole(page, 'supervisor')
  await openKb6(page)
  await expect(signButton(page)).toHaveCount(0)
})

test('ลงนาม คบ.6 ข้ามลำดับชั้นไม่ได้', async ({ page }) => {
  await openDemoCase(page)
  await submitKb14FromForm(page, 'ขอขยายเวลาเพราะภัยยังอยู่')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')

  for (const role of ['director', 'deputy_secretary', 'secretary']) {
    await switchRole(page, role)
    await openKb6(page)
    await expect(signButton(page)).toHaveCount(0)
  }
  await switchRole(page, 'supervisor')
  await openKb6(page)
  await expect(signButton(page)).toBeVisible()

  await signButton(page).click()
  await page.locator('.swal2-popup:not(.swal2-toast)').getByRole('button', { name: 'ยืนยันลงนาม', exact: true }).click()
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('director')

  await openKb6(page)
  await expect(signButton(page)).toHaveCount(0)
  await switchRole(page, 'director')
  await openKb6(page)
  await expect(signButton(page)).toBeVisible()
})

test('แบบฟอร์มล็อกหลังส่ง คบ.14', async ({ page }) => {
  await openDemoCase(page)
  await submitKb14FromForm(page, 'ขอขยายเวลาเพราะภัยยังอยู่')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')

  await page.goto(`/form/6?caseNo=${NO}`)
  await expect(page.getByRole('textbox', { name: /ส่วนราชการ/ })).not.toBeEditable()

  await page.goto(`/form/3?caseNo=${NO}`)
  await expect(page.getByTestId('ext-docs-banner')).toBeVisible()
  const inputs = page.locator('input[type="text"]:visible, textarea:visible')
  const n = await inputs.count()
  expect(n).toBeGreaterThan(0)
  for (let i = 0; i < n; i++) await expect(inputs.nth(i)).not.toBeEditable()
})

test('แฟ้ม: แถว คบ.3/คบ.6 เป็นฉบับที่ 2 มี คบ.14 และไม่ล้นจอ', async ({ page }) => {
  await openDemoCase(page)
  for (const n of [3, 6]) {
    await expect(page.locator(`[data-testid="dossier-form-row"][data-form-number="${n}"]`)).toContainText('ฉบับที่ 2 · ขยายเวลา')
  }
  await expect(page.locator('[data-testid="dossier-form-row"][data-form-number="14"]')).toHaveCount(1)
  for (const width of [1024, 768]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/dossier/${encodeURIComponent(NO)}`)
    await expect(card(page)).toBeVisible()
    await noHorizontalOverflow(page)
  }
})
