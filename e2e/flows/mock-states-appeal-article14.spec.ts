import { expect, test } from '@playwright/test'
import { loadMockState, seedMockState } from '../helpers/seed'

/**
 * Mock state จุดกระโดดของเส้นทางอุทธรณ์ (Case 4.x) และส่งกรมคุ้มครองสิทธิฯ ตามข้อ 14 (Case 5.x)
 * โหลดแล้วต้องลงหน้าที่ถูกต้อง ด้วยผู้ใช้ที่ถูกต้อง และเห็นปุ่ม/ฟอร์มของขั้นนั้นทันที
 * (ข้อมูลตั้งต้นชุดเดียวกับ e2e-screenshots/ A1–A5, B1–B2)
 */

const CASES: Array<{ name: string; group: string; see: (page: import('@playwright/test').Page) => Promise<void> }> = [
  {
    name: 'Case 4',
    group: 'อุทธรณ์',
    see: async (page) => {
      await expect(page.getByTestId('kb10-readiness-note')).toBeVisible()
      await expect(page.getByTestId('kb10-submit-screening')).toBeVisible()
    },
  },
  {
    name: 'Case 4.1',
    group: 'อุทธรณ์',
    see: async (page) => {
      await page.goto('/appeal')
      await page.getByRole('link', { name: 'รับคำอุทธรณ์', exact: true }).first().click()
      await expect(page.getByTestId('appeal-intake-submit')).toBeVisible()
    },
  },
  {
    name: 'Case 4.2',
    group: 'อุทธรณ์',
    see: async (page) => {
      await expect(page.getByTestId('appeal-check-submit')).toBeVisible()
    },
  },
  {
    name: 'Case 4.3',
    group: 'อุทธรณ์',
    see: async (page) => {
      await expect(page.getByTestId('appeal-resolution-uphold')).toBeVisible()
      await expect(page.getByTestId('appeal-resolution-overturn')).toBeVisible()
    },
  },
  {
    name: 'Case 5',
    group: 'ส่งกรมคุ้มครองสิทธิและเสรีภาพ',
    see: async (page) => {
      await expect(page.getByText(/คุ้มครองสะสม 178 วัน/)).toBeVisible()
      await expect(page.getByTestId('submit-article14-proposal')).toBeVisible()
    },
  },
  {
    name: 'Case 5.1',
    group: 'ส่งกรมคุ้มครองสิทธิและเสรีภาพ',
    see: async (page) => {
      // WIT0860 — ส่งมอบต้องบันทึกหนังสือตอบรับจากกรมก่อน จึงเห็นฟอร์มหนังสือตอบรับ (ยังไม่มีปุ่มส่งมอบ)
      await expect(page.getByTestId('article14-reply-form')).toBeVisible()
    },
  },
]

for (const { name, group, see } of CASES) {
  test(`${name} · กระโดดเข้าเส้นทาง${group} แล้วเห็นขั้นที่ต้องทำต่อทันที`, async ({ page }) => {
    const state = loadMockState(name)
    expect(state.to).toBeTruthy()
    await seedMockState(page, name)
    await page.goto(state.to as string)
    await see(page)
  })
}

test('หน้า Mock State แบ่งกลุ่ม อุทธรณ์ และ ส่งกรมคุ้มครองสิทธิฯ แยกจากชุดเดิม', async ({ page }) => {
  await page.goto('/mock-state')
  const appeal = page.locator('section', { has: page.getByRole('heading', { name: /อุทธรณ์ \(09A → 09B\)/ }) })
  await expect(appeal.getByRole('heading', { level: 3 })).toHaveText(['Case 4', 'Case 4.1', 'Case 4.2', 'Case 4.3'])
  const a14 = page.locator('section', { has: page.getByRole('heading', { name: /ส่งกรมคุ้มครองสิทธิและเสรีภาพ/ }) })
  await expect(a14.getByRole('heading', { level: 3 })).toHaveText(['Case 5', 'Case 5.1'])
})
