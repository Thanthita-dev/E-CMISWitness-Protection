import { expect, type Page } from '@playwright/test'

/** เปิดข้อ 8 (ลายมือชื่อ) ของ คบ.1 ในแฟ้ม */
export async function openKb1Signatures(page: Page, caseNo: string) {
  await page.goto(`/form/1?caseNo=${caseNo}`)
  await page.getByRole('button', { name: '8. ลายมือชื่อ' }).click()
  await expect(page.getByTestId('applicant-consent-panel')).toBeVisible()
}

/** เจ้าของสำนวนส่งลิงก์ (คัดลอกลิงก์ส่งเอง หรือสแกน QR Code) แล้วคืน URL ของลิงก์ */
export async function sendConsentLink(page: Page, opts: { channel?: 'manual' | 'qr'; expectVersion?: number } = {}) {
  const panel = page.getByTestId('applicant-consent-panel').first()
  await panel.getByTestId('consent-send-button').click()
  if (opts.channel === 'qr') await page.getByRole('radio', { name: 'สแกน QR Code' }).check()
  await page.getByTestId('consent-send-next').click()
  const review = page.getByTestId('consent-send-review')
  await expect(review).toContainText('ผู้รับ')
  await expect(review).toContainText('ช่องทางส่ง')
  await expect(review).toContainText('ลิงก์หมดอายุ')
  if (opts.expectVersion) await expect(review).toContainText(`ฉบับที่ ${opts.expectVersion}`)
  await page.getByTestId('consent-send-confirm').click()
  await expect(panel.getByTestId('consent-status-badge')).toHaveText('รอลงชื่อ')
  return panel.getByTestId('consent-link-input').inputValue()
}

/** วาดลายมือชื่อบน canvas ด้วยเมาส์ */
export async function drawSignature(page: Page) {
  const canvas = page.locator('canvas').first()
  await canvas.scrollIntoViewIfNeeded()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('signature canvas not visible')
  await page.mouse.move(box.x + 30, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + 30 + i * 25, box.y + box.height / 2 + (i % 2 ? -20 : 20))
  }
  await page.mouse.up()
}

/** ผู้ขอคุ้มครองเปิดลิงก์ → อ่านครบทุกหน้า → วาดลายมือชื่อ → รับรอง → ยืนยัน (ไม่มีขั้นยืนยันตัวตน) */
export async function witnessSigns(page: Page, url: string) {
  await page.goto(url)
  for (let i = 0; i < 3; i++) await page.getByTestId('consent-next-page').click()
  await drawSignature(page)
  await page.getByTestId('consent-ack-checkbox').check()
  await page.getByTestId('consent-sign-button').click()
  await expect(page.getByTestId('consent-signed')).toBeVisible()
}
