import { test, expect } from '@playwright/test'

test('ยังไม่เข้าสู่ระบบ — เปิด /role ได้ เลือกบัญชีแล้วเข้าสู่ระบบทันที', async ({ page }) => {
  await page.goto('/role')
  await expect(page).toHaveURL(/\/role$/)
  await expect(page.getByTestId('topbar-current-user')).toHaveCount(0)
  await expect(page.getByTestId('role-switch-wp.secretary')).toHaveAttribute('aria-pressed', 'false')

  await page.getByTestId('role-switch-wp.secretary').click()
  await expect(page).toHaveURL(/\/role$/)
  await expect(page.getByTestId('role-switch-wp.secretary')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('topbar-current-user')).toBeVisible()
})

test('สลับบทบาทจากหน้า /role ได้ทันทีและอยู่หน้าเดิม', async ({ page }) => {
  await page.goto('/role')
  await page.getByTestId('role-switch-wp.secretary').click()
  await expect(page).toHaveURL(/\/role$/)
  await expect(page.getByTestId('role-switch-wp.secretary')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('role-switch-got.director').click()
  await expect(page).toHaveURL(/\/role$/)
  await expect(page.getByTestId('role-switch-got.director')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('role-switch-wp.secretary')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('topbar-current-user')).toContainText('นายวีระยุทธ')

  await page.reload()
  await expect(page.getByTestId('role-switch-got.director')).toHaveAttribute('aria-pressed', 'true')
})

test('สลับไปบัญชี ผอ. เขต 2 แล้วชื่อผู้ใช้และหน่วยงานบน topbar เปลี่ยนตาม', async ({ page }) => {
  await page.goto('/role')
  await page.getByTestId('role-switch-wp.secretary').click()
  await expect(page).toHaveURL(/\/role$/)

  await page.getByTestId('role-switch-reg2.director').click()
  await expect(page.getByTestId('role-switch-reg2.director')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('role-switch-reg1.director')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByTestId('topbar-current-user')).toContainText('อภิชาต')
  await expect(page.locator('#topbar-org-unit-select')).toHaveValue('pacc-reg-2')
})

test('/role แสดงหัวข้อกลุ่มตามหน่วยงาน', async ({ page }) => {
  await page.goto('/role')
  await page.getByTestId('role-switch-wp.secretary').click()
  for (const heading of [
    'สำนักงาน ป.ป.ท. เขต 1',
    'สำนักงาน ป.ป.ท. เขต 2',
    'ส่วนกลาง · สำนักงานเลขาธิการ',
    'ส่วนกลาง · กองคุ้มครองพยาน (กอท.)',
  ]) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
  }
})

test('ปุ่มสลับบทบาทบน topbar เปิดหน้าต่าง กรองได้ สลับแล้วปิดและไปงานของฉันของบทบาทใหม่', async ({ page }) => {
  await page.goto('/role')
  await page.getByTestId('role-switch-wp.secretary').click()
  await page.goto('/notifications')

  await page.getByTestId('topbar-switch-role').click()
  const modal = page.getByTestId('role-switch-modal')
  await expect(modal).toBeVisible()
  await expect(page.getByTestId('role-switch-modal-wp.secretary')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('role-switch-modal-filter-group').selectOption('สำนักงาน ป.ป.ท. เขต 2')
  await page.getByTestId('role-switch-modal-filter-role').selectOption('director')
  await expect(page.getByTestId('role-switch-modal-result-count')).toHaveText('พบ 1 บัญชี')
  await expect(page.getByTestId('role-switch-modal-reg1.director')).toHaveCount(0)

  await page.getByTestId('role-switch-modal-reg2.director').click()
  await expect(modal).toHaveCount(0)
  await expect(page).toHaveURL(/\/queue\/director$/)
  await expect(page.getByTestId('topbar-current-user')).toContainText('อภิชาต')

  // เปิดใหม่ — จำตัวกรองล่าสุดไว้
  await page.getByTestId('topbar-switch-role').click()
  await expect(page.getByTestId('role-switch-modal-filter-group')).toHaveValue('สำนักงาน ป.ป.ท. เขต 2')
  await page.getByTestId('role-switch-modal-filter-clear').click()
  await page.getByTestId('role-switch-modal-filter-query').fill('got.director')
  await expect(page.getByTestId('role-switch-modal-result-count')).toHaveText('พบ 1 บัญชี')
  await page.keyboard.press('Escape')
  await expect(modal).toHaveCount(0)
})
