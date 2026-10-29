/** helper ร่วมของ e2e ชุดเอกสารขอขยายระยะเวลา (คบ.3/คบ.6 ฉบับใหม่ + คบ.14) */
import { expect, type Page } from '@playwright/test'
import { readCase, seedMockState } from './seed'
import { passSarabanCheckpoint } from './saraban'

export const NO = '9902/2569'
export const EVIDENCE = 'e2e-evidence/extension-docs'

/** เปิดเคสสาธิต 9902/2569 แล้วกด "ขอขยายเวลา" — คืนค่า ส่วนราชการ ของ คบ.6 ฉบับที่ 1 เมื่อ v1Marker */
export async function openDemoCase(page: Page, opts: { v1Marker?: boolean } = {}): Promise<string> {
  let v1Dept = ''
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, { stage: 'method_operation' })
  await page.goto('/protection')
  await page.getByRole('button', { name: 'เพิ่มเคสตัวอย่างทบทวน / ขยายเวลา / ส่งต่อ', exact: true }).click()
  if (opts.v1Marker) {
    // เติมค่าใน คบ.6 ฉบับที่ 1 ก่อน เพื่อตรวจว่าฉบับที่ 2 ดึงค่าตามมา
    await page.goto(`/form/6?caseNo=${NO}`)
    // ช่อง ส่วนราชการ ของ คบ.6 ฉบับที่ 1 ถูกเติม/ล็อกไว้แล้ว (disabled) จึงอ่านค่าไว้เทียบกับฉบับที่ 2
    v1Dept = await page.getByRole('textbox', { name: /ส่วนราชการ/ }).inputValue()
    expect(v1Dept.length).toBeGreaterThan(0)
  }
  await page.goto(`/protection-duration?caseNo=${NO}`)
  await page.reload()
  await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).or(page.getByRole('link', { name: 'ขอขยายเวลา', exact: true })).first().click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)
  return v1Dept
}

export async function noHorizontalOverflow(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(1)
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${EVIDENCE}/${name}.png`, fullPage: true })
}

export const card = (page: Page) => page.getByTestId('extension-docs-card')
export const tracker = (page: Page, label: string) => card(page).locator('li', { hasText: label })

export async function signKb6AsCurrentRole(page: Page) {
  await page.goto(`/form/6?caseNo=${NO}`)
  await page.getByTestId('kb6-sign-button').click()
  await page.locator('.swal2-popup:not(.swal2-toast)').getByRole('button', { name: 'ยืนยันลงนาม', exact: true }).click()
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

export async function submitKb14FromForm(page: Page, reason: string) {
  await page.goto(`/form/14?caseNo=${NO}`)
  const box = page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ })
  await box.fill(reason)
  await page.getByRole('button', { name: /ส่งให้ผู้บังคับบัญชาชั้นต้น/ }).click()
}

export const reqOf = async (page: Page) => ((await readCase(page, NO)) as any).extensionRequests.at(-1)

/** ขาขึ้น: ผอ.เห็นชอบแล้ว → ธุรการหน่วย (ขาออก) → ธุรการ สลธ. (ขาเข้า) ก่อนถึงรองเลขาธิการ */
export async function passKb14Up(page: Page, afterRole = 'deputy_secretary', unitClerk: 'receiver' | 'got_receiver' = 'receiver') {
  await passSarabanCheckpoint(page, NO, unitClerk)
  await passSarabanCheckpoint(page, NO, 'secretary_receiver', { afterRole })
}

/** ขาลง: เลขาธิการตัดสิน/ส่งคืน → ธุรการ สลธ. (ขาออก) → ธุรการหน่วย (ขาเข้า) ก่อนถึงเจ้าของสำนวน */
export async function passKb14Down(page: Page, afterRole = 'officer', unitClerk: 'receiver' | 'got_receiver' = 'receiver') {
  await passSarabanCheckpoint(page, NO, 'secretary_receiver')
  await passSarabanCheckpoint(page, NO, unitClerk, { afterRole })
}
