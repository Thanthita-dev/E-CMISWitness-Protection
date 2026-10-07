import { expect, test } from '@playwright/test'
import { seedMockState } from '../helpers/seed'
import { drawSignature } from '../helpers/consent'

/**
 * ลิงก์เซ็นทางไกลของบุคคลที่เกี่ยวข้อง (คบ.1 ข้อ 6) เปิดในแท็บใหม่ — แท็บเจ้าหน้าที่ต้องเห็นผลทันที
 * และผลการเซ็นต้องไม่ถูกแท็บเจ้าหน้าที่เขียนทับ (ซิงก์ store ข้ามแท็บ)
 */
test('ลายมือชื่อยินยอมของบุคคลที่เกี่ยวข้องผ่านลิงก์ แสดงในแท็บเจ้าหน้าที่ทันที', async ({ page, context }) => {
  await seedMockState(page, 'Case 1.3', 'officer')
  await page.goto('/form/1?caseNo=WP-2569-000501')
  await page.getByRole('button', { name: '6. บุคคลที่เกี่ยวข้อง' }).click()
  const btn = page.getByRole('button', { name: 'ลงลายมือชื่อยินยอม' }).first()
  if (!(await btn.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'เพิ่มบุคคลที่เกี่ยวข้อง' }).click()
    await page.locator('label:text-is("ชื่อ")').last().locator('xpath=following-sibling::input[1]').fill('สมชาย')
    await page.locator('label:text-is("นามสกุล")').last().locator('xpath=following-sibling::input[1]').fill('ทดสอบ')
    await page.getByRole('button', { name: 'บันทึกรายการ' }).click()
  }
  const before = await page.getByText('ยังไม่ได้ลงลายมือชื่อยินยอม').count()
  await page.getByRole('button', { name: 'ลงลายมือชื่อยินยอม' }).first().click()
  await page.getByRole('button', { name: 'สร้างลิงก์ให้เซ็นทางไกล' }).click()
  const url = await page.locator('.swal2-popup input[readonly]').first().inputValue()
  await page.getByRole('button', { name: 'ปิด' }).click()
  const w = await context.newPage()
  await w.goto(url)
  await drawSignature(w)
  await w.getByRole('checkbox').check()
  await w.getByRole('button', { name: 'ยืนยันลงลายมือชื่อ' }).click()
  await expect(w.getByText('ลงลายมือชื่อเรียบร้อยแล้ว')).toBeVisible()
  await page.bringToFront()
  await expect(page.getByText('ยังไม่ได้ลงลายมือชื่อยินยอม')).toHaveCount(before - 1, { timeout: 5000 })
  // หลัง officer tab แก้ข้อมูลอื่น ผลการเซ็นต้องไม่หาย
  await page.reload()
  await page.getByRole('button', { name: '6. บุคคลที่เกี่ยวข้อง' }).click()
  await expect(page.getByText('ยังไม่ได้ลงลายมือชื่อยินยอม')).toHaveCount(before - 1)
})
