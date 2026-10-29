import { test, expect, type Page } from '@playwright/test'

async function loginAs(page: Page, username: string) {
  await page.locator('#login-username').fill(username)
  await page.locator('#login-password').fill('1234')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
}

test('ยังไม่เข้าสู่ระบบ — เปิดหน้าใดก็ถูกส่งไป /login พร้อม redirect', async ({ page }) => {
  await page.goto('/registry')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  expect(decodeURIComponent(new URL(page.url()).searchParams.get('redirect') ?? '')).toContain('/registry')
})

test('รหัสผ่านผิดแสดงข้อผิดพลาดและไม่เข้าระบบ', async ({ page }) => {
  await page.goto('/login')
  await page.locator('#login-username').fill('wp.secretary')
  await page.locator('#login-password').fill('wrong-password')
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click()
  await expect(page.getByTestId('login-error')).toBeVisible()
  await expect(page).toHaveURL(/\/login/)
})

test('เข้าสู่ระบบด้วยบัญชีทดลอง จำสถานะหลังโหลดซ้ำ และออกจากระบบได้', async ({ page }) => {
  await page.goto('/registry')
  await expect(page).toHaveURL(/\/login/)
  await loginAs(page, 'wp.secretary')
  await expect(page).toHaveURL(/\/registry/)
  await expect(page.getByTestId('topbar-current-user')).toContainText('เลขาธิการ')
  await expect(page.locator('#topbar-role-select')).toHaveCount(0)

  await page.reload()
  await expect(page).toHaveURL(/\/registry/)
  await expect(page.getByTestId('topbar-current-user')).toContainText('เลขาธิการ')

  await page.getByTestId('topbar-logout').click()
  await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).last().click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/registry')
  await expect(page).toHaveURL(/\/login\?redirect=/)
})

test('กลับไปหน้าที่ขอไว้ตามพารามิเตอร์ redirect', async ({ page }) => {
  await page.goto('/notifications')
  await expect(page).toHaveURL(/\/login\?redirect=/)
  await loginAs(page, 'wp.secretary')
  await expect(page).toHaveURL(/\/notifications/)
})

test('ผู้ใช้ที่มีข้อมูลรุ่นเก่าใน localStorage ถูกบังคับออกจากระบบและล้างข้อมูล', async ({ page }) => {
  // จำลองเบราว์เซอร์ก่อนมีหน้าเข้าสู่ระบบ: มี state เดิม แต่ไม่มีเครื่องหมายรุ่นข้อมูล
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__legacy_seeded') === '1') return
    localStorage.setItem('ecmis-auth-storage', JSON.stringify({ state: { currentRole: 'secretary' }, version: 0 }))
    localStorage.setItem('ecmis-case-storage-v2', JSON.stringify({ state: { cases: [{ no: 'WP-LEGACY-0001' }] }, version: 0 }))
    localStorage.setItem('ecmis-font-size', 'large')
    sessionStorage.setItem('__legacy_seeded', '1')
  })
  await page.goto('/registry')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByTestId('login-data-reset-notice')).toBeVisible()
  const cases = await page.evaluate(() => localStorage.getItem('ecmis-case-storage-v2') ?? '')
  expect(cases).not.toContain('WP-LEGACY-0001')
  // ค่าที่ไม่ใช่ของ store ก6 ไม่ถูกแตะ
  expect(await page.evaluate(() => localStorage.getItem('ecmis-font-size'))).toBe('large')

  // เข้าสู่ระบบใหม่แล้ว โหลดซ้ำไม่ถูกล้างอีก
  await loginAs(page, 'reg1.officer')
  await expect(page).toHaveURL(/\/registry/)
  await page.reload()
  await expect(page.getByTestId('topbar-current-user')).toBeVisible()
})
