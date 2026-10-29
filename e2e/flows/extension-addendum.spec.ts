/** ขอขยายเวลา → คบ.3/คบ.6/คบ.14 แสดงเป็น "บันทึกเพิ่มเติม ครั้งที่ N" ใต้แถวเดิมในแฟ้ม (ไม่ใช่ "ฉบับที่ 2") */
import { test, expect, type Page } from '@playwright/test'
import { switchRole } from '../helpers/seed'
import { NO, noHorizontalOverflow, openDemoCase, passKb14Down, passKb14Up, reqOf, signKb6AsCurrentRole } from '../helpers/extensionDocs'

const confirm = (page: Page, name: string) =>
  page.locator('.swal2-popup:not(.swal2-toast)').getByRole('button', { name, exact: true }).click()

const footer = (page: Page) => page.getByTestId('kb14-forward-footer')

/** กรอก + บันทึก คบ.14 แล้วส่งที่ footer */
async function saveAndSendKb14(page: Page, reason: string) {
  await page.goto(`/form/14?caseNo=${NO}`)
  await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill(reason)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)
  await footer(page).getByRole('button', { name: 'ส่งให้ผู้บังคับบัญชาชั้นต้น' }).click()
  await confirm(page, 'ยืนยันส่ง')
  await expect.poll(async () => (await reqOf(page))?.approvalStage).toBe('supervisor')
}

test('ขอขยายเวลา: คบ.3/คบ.6 เป็นบันทึกเพิ่มเติมครั้งที่ 1 · ดูฉบับเดิมได้ · คบ.14 ส่งแล้วขึ้นครั้งที่ 1', async ({ page }) => {
  const v1Dept = await openDemoCase(page, { v1Marker: true })
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)

  for (const n of [3, 6]) {
    const list = page.getByTestId('addendum-list').nth(n === 3 ? 0 : 1)
    await expect(list).toBeVisible()
  }
  const lists = page.getByTestId('addendum-list')
  await expect(lists).toHaveCount(2)
  for (let i = 0; i < 2; i++) {
    const item = lists.nth(i).getByTestId('addendum-item')
    await expect(item).toHaveAttribute('data-round', '1')
    await expect(item).toContainText('บันทึกเพิ่มเติม ครั้งที่ 1')
    const container = lists.nth(i).locator('xpath=..')
    await expect(container).not.toContainText('ฉบับที่ 2')
    await expect(container.getByTestId('original-view-button')).toBeVisible()
    await expect(container.getByRole('link', { name: 'เปิดแบบฟอร์ม', exact: true })).toHaveCount(0)
  }

  // ดูฉบับเดิม (คบ.6)
  await lists.nth(1).locator('xpath=..').getByTestId('original-view-button').click()
  await expect(page.getByTestId('addendum-viewer-modal')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('addendum-viewer-modal')).toHaveCount(0)

  // เปิดบันทึกเพิ่มเติม คบ.6 → ดึงค่าจากฉบับเดิม
  await lists.nth(1).getByRole('link', { name: 'เปิดบันทึกเพิ่มเติม' }).click()
  await expect(page).toHaveURL(new RegExp(`/form/6`))
  await expect(page.getByTestId('ext-docs-banner')).toContainText('บันทึกเพิ่มเติม ครั้งที่ 1')
  await expect(page.getByRole('textbox', { name: /ส่วนราชการ/ })).toHaveValue(v1Dept)

  // ส่ง คบ.14 → แถว คบ.14 ขึ้นครั้งที่ 1
  await saveAndSendKb14(page, 'ยังมีภัยคุกคามต่อพยาน')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  const l14 = page.getByTestId('addendum-list')
  await expect(l14).toHaveCount(3)
  await expect(l14.nth(2).getByTestId('addendum-item')).toHaveAttribute('data-round', '1')
  await expect(l14.nth(2)).toContainText('บันทึกเพิ่มเติม ครั้งที่ 1')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(page.getByTestId('addendum-list').first()).toBeVisible()
  await noHorizontalOverflow(page)
})

test('ขอขยายเวลาครั้งที่ 2: ครั้งที่ 1 เปิดดูได้ใน viewer', async ({ page }) => {
  test.setTimeout(120_000)
  await openDemoCase(page)
  await saveAndSendKb14(page, 'รอบที่ 1')

  for (const role of ['supervisor', 'director', 'deputy_secretary'] as const) {
    await switchRole(page, role)
    await signKb6AsCurrentRole(page)
    await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
    const f = page.getByTestId('kb14-forward-footer').getByTestId('kb14-forward-button')
    await f.click()
    await page.locator('.swal2-popup:not(.swal2-toast)').getByRole('button', { name: /^ยืนยันส่ง/ }).click()
    if (role === 'director') await passKb14Up(page)
  }
  await switchRole(page, 'secretary')
  await signKb6AsCurrentRole(page)
  await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
  await page.getByTestId('kb14-approve-button').click()
  await confirm(page, 'ยืนยันอนุมัติ')
  await expect.poll(async () => (await reqOf(page)).status).toBe('approved')
  await passKb14Down(page)

  await switchRole(page, 'officer')
  await page.goto(`/protection-duration?caseNo=${NO}`)
  // ผลพิจารณาที่ยังไม่รับทราบจะเด้งป็อปอัป — รับทราบก่อนขอครั้งถัดไป
  await page.getByRole('dialog', { name: 'ผลพิจารณาขอขยายระยะเวลาคุ้มครอง' }).getByRole('button', { name: 'รับทราบ' }).click()
  await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)
  const items = page.getByTestId('addendum-list').nth(1).getByTestId('addendum-item')
  await expect(items).toHaveCount(2)
  await expect(page.getByTestId('addendum-list').nth(1).locator('[data-round="2"]')).toContainText('บันทึกเพิ่มเติม ครั้งที่ 2')
  await page.getByTestId('addendum-list').nth(1).locator('[data-round="1"]').getByTestId('addendum-view-button').click()
  await expect(page.getByTestId('addendum-viewer-modal')).toBeVisible()
})
