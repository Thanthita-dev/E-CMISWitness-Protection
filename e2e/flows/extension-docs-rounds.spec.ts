import { expect, test, type Page } from '@playwright/test'
import { readCase, switchRole } from '../helpers/seed'
import { NO, card, openDemoCase, passKb14Down, passKb14Up, reqOf, signKb6AsCurrentRole, submitKb14FromForm, tracker } from '../helpers/extensionDocs'

const ROLES_AFTER_OFFICER = ['supervisor', 'director', 'deputy_secretary', 'secretary']

async function approveRound(page: Page, reason: string) {
  await submitKb14FromForm(page, reason)
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
  for (const role of ROLES_AFTER_OFFICER) {
    await switchRole(page, role)
    await signKb6AsCurrentRole(page)
    if (role === 'director') await passKb14Up(page)
    if (role === 'secretary') {
      await expect.poll(async () => (await reqOf(page)).status).toBe('approved')
      await passKb14Down(page)
    }
  }
}

test('ขยายรอบที่ 2: เปิดชุดเอกสารใหม่เป็น คบ.3/คบ.6 ฉบับที่ 3 พร้อมประวัติฉบับก่อนและ tracker ว่าง', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openDemoCase(page)
  await approveRound(page, 'ภัยคุกคามยังไม่หมดไป ขอขยายรอบแรก')

  await switchRole(page, 'officer')
  await page.goto(`/protection-duration?caseNo=${NO}`)
  // ป็อปอัปผลพิจารณารอบก่อนต้องกดรับทราบก่อน
  await page.getByRole('button', { name: 'รับทราบ', exact: true }).click()
  const next = page.getByRole('button', { name: 'ขอขยายเวลา คบ.14', exact: true })
  await next.click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)

  await expect(card(page)).toContainText('ครั้งที่ 2')
  await expect(card(page)).toContainText('คบ.3 ฉบับที่ 3')
  await expect(card(page)).toContainText('คบ.6 ฉบับที่ 3')
  const ext: any = ((await readCase(page, NO)) as any).extensionDocs
  expect(ext.round).toBe(2)
  expect(ext.kb6Version).toBe(3)
  for (const l of ['ผู้บังคับบัญชา', 'ผู้อำนวยการ', 'รองเลขาธิการ', 'เลขาธิการ']) {
    await expect(tracker(page, l).first()).toHaveAttribute('data-state', 'pending')
  }

  await card(page).locator('a', { hasText: 'เปิดแบบฟอร์ม' }).nth(1).click()
  await expect(page).toHaveURL(new RegExp(`/form/6\\?caseNo=${NO.replace('/', '(?:/|%2F)')}`))
  await page.getByText('ดูประวัติเวอร์ชัน').first().click()
  await expect(page.getByText(/ฉบับที่ 1/).first()).toBeVisible()
  await expect(page.getByText(/ฉบับที่ 2/).first()).toBeVisible()
})

test('เลขาธิการไม่อนุมัติ: คำขอเป็น rejected วันสิ้นสุดไม่เปลี่ยน และการ์ดชุดเอกสารหายจากแฟ้ม', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openDemoCase(page)
  const original: any = await readCase(page, NO)
  await submitKb14FromForm(page, 'ขอขยายเวลาเพื่อทดสอบการไม่อนุมัติ')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
  for (const role of ['supervisor', 'director', 'deputy_secretary']) {
    await switchRole(page, role)
    await signKb6AsCurrentRole(page)
    if (role === 'director') await passKb14Up(page)
  }
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe('secretary')

  await switchRole(page, 'secretary')
  await page.goto(`/form/14?caseNo=${NO}`)
  await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('ไม่เห็นควรขยายเวลา')
  await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
  await page.getByRole('button', { name: 'ยืนยันไม่อนุมัติ', exact: true }).click()
  await expect.poll(async () => (await reqOf(page)).status).toBe('rejected')
  await passKb14Down(page)

  const after: any = await readCase(page, NO)
  expect(after.protectionEndAt).toBe(original.protectionEndAt)
  await switchRole(page, 'officer')
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(page.getByTestId('dossier-forms')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
})

test('ฉบับพิมพ์ คบ.6 ฉบับขยายเวลา: ข้อ 10 แสดงผู้ลงนามและวันที่ ข้อ 11-13 ยังไม่มี', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openDemoCase(page)
  await submitKb14FromForm(page, 'ขอขยายเวลาเพื่อตรวจฉบับพิมพ์')
  await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
  await switchRole(page, 'supervisor')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).kb6Signatures?.supervisor?.at).toBeTruthy()
  const by: string = (await reqOf(page)).kb6Signatures.supervisor.by
  expect(by).toBeTruthy()

  await page.goto(`/form/6?caseNo=${NO}`)
  const item = (n: string) => page.locator('div.mt-3', { has: page.locator('div.font-bold', { hasText: new RegExp(`^${n}\\.`) }) })
  const i10 = item('10')
  // ข้อ 10-13 อยู่คนละหน้ากระดาษกับหน้าแรก — เลื่อนไปหน้าที่มีข้อ 10
  for (const n of [1, 2, 3]) {
    if (await i10.count()) break
    await page.getByRole('button', { name: `หน้า ${n}`, exact: true }).click().catch(() => {})
  }
  await i10.scrollIntoViewIfNeeded()
  await expect(i10).toContainText(by)
  await expect(i10).toContainText('ลงนามเมื่อ')
  for (const n of ['11', '12', '13']) {
    await expect(item(n)).toBeVisible()
    await expect(item(n)).not.toContainText('ลงนามเมื่อ')
  }
})
