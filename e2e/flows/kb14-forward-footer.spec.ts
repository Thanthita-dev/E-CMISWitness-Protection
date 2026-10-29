/** 11B — ปุ่มส่ง คบ.14 อยู่ที่ footer นอกแบบฟอร์ม และแต่ละชั้นต้องลงนาม คบ.6 ก่อนส่งต่อ */
import { test, expect, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { NO, passKb14Down, passKb14Up, reqOf, signKb6AsCurrentRole } from '../helpers/extensionDocs'

const footer = (page: Page) => page.getByTestId('kb14-forward-footer')
const confirm = (page: Page, name: string) =>
  page.locator('.swal2-popup:not(.swal2-toast)').getByRole('button', { name, exact: true }).click()

async function openExtension(page: Page) {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, { stage: 'method_operation' })
  await page.goto('/protection')
  await page.getByRole('button', { name: 'เพิ่มเคสตัวอย่างทบทวน / ขยายเวลา / ส่งต่อ', exact: true }).click()
  await page.goto(`/protection-duration?caseNo=${NO}`)
  await page.reload()
  await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)
}

test('ฟอร์ม คบ.14 มีแค่บันทึก · ส่งที่ footer · ลงนาม คบ.6 ก่อนจึงส่งต่อ/อนุมัติได้', async ({ page }) => {
  await openExtension(page)

  await page.goto(`/form/14?caseNo=${NO}`)
  await expect(page.getByRole('button', { name: /ส่งให้ผู้บังคับบัญชาชั้นต้น/ })).toHaveCount(0)
  await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ยังมีภัยคุกคามต่อพยาน')
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)

  await footer(page).getByRole('button', { name: 'ส่งให้ผู้บังคับบัญชาชั้นต้น' }).click()
  await confirm(page, 'ยืนยันส่ง')
  await expect.poll(async () => (await reqOf(page))?.approvalStage).toBe('supervisor')
  expect((await reqOf(page)).status).toBe('submitted')

  for (const [role, next, nextStage] of [
    ['supervisor', 'ผอ.กอง', 'director'],
    ['director', 'รองเลขาธิการ', 'deputy_secretary'],
    ['deputy_secretary', 'เลขาธิการ', 'secretary'],
  ] as const) {
    await switchRole(page, role)
    await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
    const forward = footer(page).getByTestId('kb14-forward-button')
    await expect(forward).toBeDisabled()
    await expect(footer(page).getByTestId('kb14-kb6-sign-required')).toBeVisible()

    await signKb6AsCurrentRole(page)
    // ลงนามแล้วแฟ้มยังอยู่ชั้นเดิม จนกว่าจะกดส่งเอง
    await expect.poll(async () => (await reqOf(page)).approvalStage).toBe(role)

    await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
    await expect(forward).toBeEnabled()
    await expect(forward).toContainText(`ส่ง${next}`)
    await forward.click()
    await confirm(page, `ยืนยันส่ง${next}`)
    await expect.poll(async () => (await reqOf(page)).approvalStage).toBe(nextStage)
    // ผอ. → รองเลขาธิการ ข้ามจากหน่วยเข้าสำนักงานเลขาธิการ ต้องผ่านธุรการทั้งสองฝั่ง; รอง → เลขาธิการ อยู่สำนักงานเดียวกัน
    if (role === 'director') {
      await expect(footer(page).getByTestId('kb14-in-transit-note')).toBeVisible()
      await passKb14Up(page)
    }
  }

  // ชั้นเลขาธิการ — ลงนาม คบ.6 ก่อน จึงอนุมัติได้
  await switchRole(page, 'secretary')
  await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
  const approve = footer(page).getByTestId('kb14-approve-button')
  await expect(approve).toBeDisabled()
  await expect(footer(page).getByRole('button', { name: 'ไม่อนุมัติ', exact: true })).toBeDisabled()
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).status).toBe('pending')
  await page.goto(`/protection-extension/${encodeURIComponent(NO)}`)
  await expect(approve).toBeEnabled()
  await approve.click()
  await confirm(page, 'ยืนยันอนุมัติ')
  await expect.poll(async () => (await reqOf(page)).status).toBe('approved')
  // ผลอนุมัติลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย
  expect((await readCase(page, NO) as any).sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'down' })
  await passKb14Down(page)
  expect((await readCase(page, NO) as any).sarabanDispatch).toBeUndefined()
})
