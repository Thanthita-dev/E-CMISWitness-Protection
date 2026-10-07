import { expect, test } from '@playwright/test'
import { loadMockState, readCase, seedMockState } from '../helpers/seed'

/**
 * Mock state กลุ่ม Customer Demo ("Demo" — ชุดเดียวกับเรื่องตั้งต้นของระบบ) — ธุรการรับเรื่อง 3 เรื่องเข้าทะเบียนแล้ว
 * ยังไม่เชื่อมโยงคดีหลัก (เจ้าของสำนวนที่ ผอ. มอบหมายเป็นผู้เชื่อมโยงภายหลัง)
 * โหลดแล้วต้องเห็นครบในคิวธุรการ และส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนต่อได้ทันทีโดยไม่ต้องเชื่อมโยง
 */

const DEMO = 'Demo'

const CASES = [
  { caseNo: 'WP-2569-000611', witness: 'นายสมชาย รักความยุติธรรม' },
  { caseNo: 'WP-2569-000612', witness: 'ตรีรุด หล่อจัง' },
  { caseNo: 'WP-2569-000613', witness: 'ตรีรุด หล่อจัง' },
]

test('Demo · คิวธุรการเห็นครบ 3 เรื่อง โดยยังไม่เชื่อมโยงคดีหลัก', async ({ page }) => {
  const state = loadMockState(DEMO)
  expect(state.to).toBe('/queue/receiver')
  await seedMockState(page, DEMO)
  await page.goto(state.to as string)

  for (const c of CASES) {
    const row = page.locator('tr', { hasText: c.caseNo })
    await expect(row).toBeVisible()
    await expect(row).toContainText(c.witness)
    const stored = await readCase(page, c.caseNo)
    expect(stored?.mainCaseStatus).toBeUndefined()
    expect(stored?.mainCaseNotFound).toBeFalsy()
    expect((await readCase(page, c.caseNo))?.stage).toBe('receiver_intake')
  }
})

for (const c of CASES) {
  test(`Demo · ${c.caseNo} ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนได้`, async ({ page }) => {
    await seedMockState(page, DEMO)
    await page.goto(`/dossier/${c.caseNo}`)

    await expect(page.getByText(c.witness).first()).toBeVisible()
    // ธุรการไม่เห็นการ์ดเชื่อมโยงคดีหลัก และส่งต่อ ผอ. ได้โดยไม่ต้องเชื่อมโยง
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)

    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
    await expect.poll(async () => (await readCase(page, c.caseNo))?.stage).toBe('director_assign')
  })
}

test('หน้า Mock State มีกลุ่ม Customer Demo ที่มีเฉพาะ Demo', async ({ page }) => {
  await page.goto('/mock-state')
  const section = page.locator('section', { has: page.getByRole('heading', { name: /Customer Demo/ }) })
  await expect(section.getByRole('heading', { level: 3 })).toHaveText([DEMO])
})
