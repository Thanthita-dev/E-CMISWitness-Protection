import { expect, test, type Page } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { choosePreliminaryOutcome, confirmInlineDecision, fillDecisionWorkspace } from '../helpers/noticeDecisionWorkspace'
import { passSarabanCheckpoint } from '../helpers/saraban'

/**
 * ทะเบียนสารบรรณ: ผอ. → ธุรการสำนัก/กอง (ออกเลขส่ง) → ธุรการ สลธ. (ลงเลขรับ) → รองเลขาธิการ
 * และหลังเลขาธิการอนุมัติ: ธุรการ สลธ. (ออกเลขส่ง) → ธุรการปลายทาง (ลงเลขรับ)
 */
const NO = '0501/2569'
const DOSSIER = `/dossier/${encodeURIComponent(NO)}`
const SARABAN = `/saraban/${encodeURIComponent(NO)}`
const SHOTS = 'e2e-screenshots/saraban'
mkdirSync(SHOTS, { recursive: true })
test.use({ actionTimeout: 10_000, viewport: { width: 1440, height: 1000 } })

const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
/** เลขสารบรรณออกต่อผู้รับ — ทะเบียนหนึ่งรายการครอบคลุมทุก คบ. ในชุด */
const record = (c: any, cp: string, n: number) => (c?.sarabanRecords ?? []).find((r: any) => r.checkpoint === cp && (r.forms ?? [r.formNo]).includes(n))

test('ผอ. ส่ง → ธุรการสำนัก/กอง → ธุรการ สลธ. → รองเลขาธิการ พร้อมแท็บและตราประทับ', async ({ page }) => {
  test.setTimeout(180_000)
  // Case 1.5 อยู่ขั้น ผอ. พิจารณา — ตั้งว่า ผอ. ลงนาม คบ.6 แล้ว เพื่อข้ามการลงนามที่ไม่ใช่เป้าหมายของเทสต์นี้
  await seedMockState(page, 'Case 1.5', 'director', { kb6DirectorSignedAt: '2026-10-12 09:00' })
  await page.goto(DOSSIER)

  // ผอ. ส่งต่อ → เข้าขั้นธุรการสำนัก/กอง ไม่ใช่รองเลขาธิการ
  await page.getByTestId('forward-case-button').click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await page.getByRole('button', { name: 'ยืนยันส่งต่อ', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  await expect.poll(async () => (await readCase(page, NO))?.stage).toBe('director_outgoing_registry')

  // ธุรการสำนัก/กอง: ชุด คบ.1/3/6 ไปผู้รับรายเดียว = เลขเดียว ปุ่มส่งปิดอยู่จนกว่าจะบันทึกเลข
  await switchRole(page, 'receiver')
  await page.goto(SARABAN)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toBeVisible()
  await expect(card.getByTestId('saraban-progress')).toContainText('0/1')
  await expect(card.getByTestId('saraban-submit-button')).toBeDisabled()
  await expect(card.getByTestId('saraban-blocker')).toContainText('เหลืออีก 1 ผู้รับ')
  await expect(card.getByTestId('saraban-bundle')).toContainText('3 ฉบับ')
  await expect(card.getByRole('button', { name: 'บันทึกเลขทะเบียน' })).toHaveCount(1)
  await shot(page, '01-dossier-director-outgoing-empty')
  await card.getByRole('button', { name: 'บันทึกเลขทะเบียน' }).first().click()
  await expect(card.getByTestId('saraban-progress')).toContainText('1/1')
  await expect(card.getByTestId('saraban-submit-button')).toBeEnabled()

  // แท็บ "ทะเบียนสารบรรณ" อยู่ถัดจาก "รวมไฟล์ คบ." และตราประทับขึ้นที่ตัวอย่าง A4 หลังบันทึก
  await page.goto(`/form/6?caseNo=${NO}&tab=saraban`)
  const tabs = page.getByRole('button', { name: /กรอกข้อมูล$|รวมไฟล์ คบ\.$|ทะเบียนสารบรรณ$/ })
  await expect(tabs).toHaveText([/กรอกข้อมูล/, /รวมไฟล์ คบ\./, /ทะเบียนสารบรรณ/])
  await expect(page.getByTestId('form-saraban-panel')).toBeVisible()
  await shot(page, '02-form6-saraban-tab')
  // เลขเดียวของผู้รับครอบคลุมทั้งชุด — แท็บของ คบ.6 แสดงเลขที่ลงไว้แล้ว และตราประทับขึ้นบน คบ.6
  await expect(page.getByTestId('form-saraban-panel')).toContainText('ลงทะเบียนแล้ว')
  const stamp = page.getByTestId('saraban-stamp-director_outgoing-6').first()
  await expect(stamp).toBeVisible()
  await expect(stamp).toContainText('เลขทะเบียนส่ง')
  const stored = await readCase(page, NO)
  await expect(stamp).toContainText(String(record(stored, 'director_outgoing', 6).number))
  await expect(stamp).toContainText(String(record(stored, 'director_outgoing', 6).unitName))
  expect(record(stored, 'director_outgoing', 6).number).toBe(record(stored, 'director_outgoing', 1).number)
  expect(stored?.sarabanRecords).toHaveLength(1)
  await stamp.scrollIntoViewIfNeeded()
  await shot(page, '03-form6-a4-stamp')

  // ครบ 3 ฉบับ → ส่งธุรการ สลธ.
  await page.goto(SARABAN)
  await passSarabanCheckpoint(page, NO, 'receiver', { shot: (n) => shot(page, `04-director-outgoing-${n}`) })
  await expect.poll(async () => (await readCase(page, NO))?.stage).toBe('secretary_incoming_registry')

  // ธุรการ สลธ. ลงเลขรับ แล้วส่งรองเลขาธิการ
  await switchRole(page, 'secretary_receiver')
  await page.goto(SARABAN)
  await expect(page.getByTestId('saraban-workspace')).toHaveAttribute('data-checkpoint', 'secretary_incoming')
  await shot(page, '05-dossier-secretary-incoming-empty')
  await passSarabanCheckpoint(page, NO, 'secretary_receiver', { shot: (n) => shot(page, `06-secretary-incoming-${n}`) })
  await expect.poll(async () => (await readCase(page, NO))?.stage).toBe('deputy_review')
  const done = await readCase(page, NO)
  for (const n of [1, 3, 6]) {
    expect(record(done, 'director_outgoing', n)).toBeTruthy()
    expect(record(done, 'secretary_incoming', n)).toBeTruthy()
  }

  // รองเลขาธิการเห็นแฟ้มในคิว และการ์ดแสดงประวัติทะเบียน
  await switchRole(page, 'deputy_secretary')
  await page.goto('/queue/deputy_secretary')
  await expect(page.getByRole('row', { name: new RegExp(NO) })).toBeVisible()
  await page.goto(DOSSIER)
  await expect(page.getByTestId('saraban-history-card')).toBeVisible()
  await shot(page, '07-dossier-deputy-history')
})

test('เลขาธิการอนุมัติ → ธุรการ สลธ. ออกเลขส่ง → ธุรการ กอท. ลงเลขรับ → รับเรื่อง', async ({ page }) => {
  test.setTimeout(180_000)
  // PostApproval 1 — แฟ้มรอเลขาธิการ (ลงนาม คบ.6 ครบแล้ว) อนุมัติผ่าน UI จริง
  await seedMockState(page, 'PostApproval 1')
  await page.goto(SARABAN)
  await choosePreliminaryOutcome(page, 9)
  await fillDecisionWorkspace(page, 'got')
  await confirmInlineDecision(page)
  await expect.poll(async () => (await readCase(page, NO))?.protectionHandoff?.step).toBe('pending_outgoing')

  await passSarabanCheckpoint(page, NO, 'secretary_receiver', { shot: (n) => shot(page, `08-secretary-outgoing-${n}`) })
  await expect.poll(async () => (await readCase(page, NO))?.protectionHandoff?.step).toBe('pending_receipt')
  const mid = await readCase(page, NO)
  for (const n of [1, 3, 6, 9]) expect(record(mid, 'secretary_outgoing', n)).toBeTruthy()

  await switchRole(page, 'got_receiver')
  await page.goto(SARABAN)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toHaveAttribute('data-checkpoint', 'destination_incoming')
  await expect(card.getByTestId('saraban-progress')).toContainText('0/1')
  await expect(card.getByTestId('saraban-submit-button')).toBeDisabled()
  await shot(page, '09-dossier-destination-incoming-empty')
  await passSarabanCheckpoint(page, NO, 'got_receiver', { shot: (n) => shot(page, `10-destination-incoming-${n}`) })
  await expect.poll(async () => (await readCase(page, NO))?.protectionHandoff?.step).toBe('received')
  const end = await readCase(page, NO)
  for (const n of [1, 3, 6, 9]) expect(record(end, 'destination_incoming', n)).toBeTruthy()
})

test('การ์ดทะเบียนสารบรรณบนจอ 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await seedMockState(page, 'Case 1.5', 'director', { kb6DirectorSignedAt: '2026-10-12 09:00', stage: 'director_outgoing_registry' })
  await switchRole(page, 'receiver')
  await page.goto(SARABAN)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'บันทึกเลขทะเบียน' }).first().click()
  await expect(card.getByTestId('saraban-progress')).toContainText('1/1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await card.scrollIntoViewIfNeeded()
  await card.screenshot({ path: `${SHOTS}/11-dossier-card-390.png` })
})
