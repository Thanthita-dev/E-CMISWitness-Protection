import { expect, test, type Page } from '@playwright/test'
import { newCaseNoAfterIntake, seedMockState } from '../helpers/seed'

/**
 * โหมดสาธิต — บันทึกแบบ คบ.6 ได้ทันทีโดยไม่บังคับช่อง และไม่มีคำเตือนช่องว่าง
 * แฟ้มที่รับเป็น คบ.1 ไม่มีชื่อในตัวแฟ้ม: ช่อง 1.1 / 2.2 ของ คบ.6 ต้องเติมจากแบบ คบ.1 ของแฟ้มนั้น
 */
const field = (page: Page, label: string) =>
  page.locator('label', { hasText: label }).first().locator('xpath=following-sibling::input[1]')

test('แฟ้มรับเป็น คบ.1 — บันทึก คบ.6 โดยเว้น 1.1/2.2 ได้ ไม่มีคำเตือน และเติมชื่อจาก คบ.1', async ({ page }) => {
  await seedMockState(page, 'Case 1', 'officer')
  await page.goto('/intake')
  await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
  await page.locator('#intakeScreeningNote').fill('ทดสอบ')
  await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
  const caseNo = await newCaseNoAfterIntake(page, { expectForm: 1, backToDossier: false })

  // กรอกชื่อผู้ยื่นใน คบ.1 แล้วบันทึก
  await page.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]').fill('ทดสอบ')
  await page.locator('label:text-is("นามสกุล")').locator('xpath=following-sibling::input[1]').fill('สาธิตระบบ')
  await page.getByRole('button', { name: '8. ลายมือชื่อ' }).click()
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()

  await page.goto(`/form/6?caseNo=${caseNo}`)
  await field(page, '1.1 ได้รับคำร้อง').fill('')
  await field(page, '2.2 ชื่อ-สกุล พยาน').fill('')
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()

  const toast = page.locator('.swal2-toast')
  await expect(toast).toContainText('บันทึกแบบ คบ.6 เรียบร้อยแล้ว')
  await expect(toast).not.toContainText('ยังเว้นว่าง')
  await expect(page).toHaveURL(new RegExp(`/dossier/${caseNo}`))

  await page.goto(`/form/6?caseNo=${caseNo}`)
  // 1.1 = ผู้ยื่นคำร้องตามข้อ 1 ของ คบ.1 · 2.2 = พยานตามข้อ 2 ของ คบ.1 (ว่างจึงใช้ชื่อผู้ยื่น)
  await expect(field(page, '1.1 ได้รับคำร้อง')).toHaveValue(/ทดสอบ สาธิตระบบ/)
  await expect(field(page, '2.2 ชื่อ-สกุล พยาน')).not.toHaveValue('')
})
