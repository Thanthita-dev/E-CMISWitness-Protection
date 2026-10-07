import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { drawSignature, openKb1Signatures, sendConsentLink, witnessSigns } from '../helpers/consent'

/**
 * ลงลายมือชื่อยินยอมของผู้ขอคุ้มครอง (คบ.1) ผ่านลิงก์ — Prototype ตามข้อเสนอในที่ประชุม
 * เจ้าของสำนวนส่งลิงก์ → ผู้ขอคุ้มครองเปิดลิงก์ (หน้าลงลายมือชื่ออิเล็กทรอนิกส์ ไม่มีขั้นยืนยันตัวตน) → อ่านและลงชื่อ → ผลกลับเข้าระบบ
 * ใช้ Case 6.2 (รับแจ้งทางโทรศัพท์ คบ.2 · รอพยานลงนาม คบ.1 · ยังไม่ส่งลิงก์)
 */

const CASE_NO = 'WP-2569-000501'

test.describe('ลงชื่อยินยอม คบ.1 ผ่านลิงก์', () => {
  test('ส่งลิงก์ → พยานอ่านและลงชื่อ → สถานะและเอกสารฝั่งเจ้าหน้าที่อัปเดต', async ({ page }) => {
    await seedMockState(page, 'Case 6.2', 'officer')
    await openKb1Signatures(page, CASE_NO)
    const panel = page.getByTestId('applicant-consent-panel')

    // แยกลายมือชื่อผู้ขอคุ้มครองกับเจ้าหน้าที่ และเจ้าหน้าที่ไม่มีปุ่มลงชื่อแทน
    await expect(panel.getByTestId('consent-status-badge')).toHaveText('ยังไม่ส่ง')
    await expect(page.getByText('ลายมือชื่อเจ้าหน้าที่ (เจ้าพนักงานผู้รับคำร้อง)')).toBeVisible()
    await expect(page.getByRole('button', { name: /ลงลายมือชื่อผู้ยื่น/ })).toHaveCount(0)
    await expect(panel.getByText('ข้อมูลสำหรับสาธิต')).toBeVisible()

    // ช่องทางมีเฉพาะ คัดลอกลิงก์ส่งเอง / สแกน QR Code (ไม่มี SMS/อีเมล)
    await panel.getByTestId('consent-send-button').click()
    await expect(page.getByRole('radio', { name: 'คัดลอกลิงก์ส่งเอง' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'สแกน QR Code' })).toBeVisible()
    await expect(page.getByText('SMS (ข้อความสั้น)')).toHaveCount(0)
    await expect(page.getByText('อีเมล', { exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()

    const url = await sendConsentLink(page, { channel: 'qr' })
    expect(url).toContain('/sign/consent/')
    await expect(panel.getByTestId('consent-qr').getByRole('img', { name: 'QR Code ลิงก์ลงชื่อ คบ.1' })).toBeVisible()

    // หน้าพยาน: หน้าลงลายมือชื่ออิเล็กทรอนิกส์แบบเดียวกับลิงก์อื่น ไม่มีเมนูระบบเจ้าหน้าที่ ไม่เปิดเผยเลขแฟ้ม และไม่มีขั้นยืนยันตัวตน
    await page.goto(url)
    await expect(page.getByText('ลงลายมือชื่ออิเล็กทรอนิกส์', { exact: true })).toBeVisible()
    await expect(page.getByText(/ข้อมูลสำหรับสาธิต/)).toBeVisible()
    await expect(page.locator('aside')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText(CASE_NO)
    await expect(page.locator('#consent-otp')).toHaveCount(0)

    // ต้องเปิดอ่านครบทุกหน้าก่อนจึงติ๊กรับทราบได้
    const ack = page.getByTestId('consent-ack-checkbox')
    await expect(ack).toBeDisabled()
    for (let i = 0; i < 3; i++) await page.getByTestId('consent-next-page').click()
    await expect(page.getByTestId('consent-paper-page-4')).toContainText('ข้าพเจ้าได้ทราบสิทธิที่พยานพึงได้รับ')
    await expect(ack).toBeEnabled()
    await ack.check()

    // ยังไม่มีลายมือชื่อ = ยืนยันไม่ได้
    const signButton = page.getByTestId('consent-sign-button')
    await expect(signButton).toBeDisabled()
    await expect(page.getByTestId('consent-block-reason')).toContainText('วาดลายมือชื่อ')
    // ยกเลิกการรับทราบ = ยืนยันไม่ได้
    await drawSignature(page)
    await ack.uncheck()
    await expect(signButton).toBeDisabled()
    await ack.check()
    await expect(signButton).toBeEnabled()
    await signButton.click()

    await expect(page.getByTestId('consent-signed')).toContainText('เจ้าหน้าที่ได้รับข้อมูลลายมือชื่อของท่านแล้ว')
    await expect(page.getByTestId('consent-signed-at')).toHaveText(/\d{2}\/\d{2}\/25\d{2} \d{2}:\d{2} น\./)

    // ผลกลับเข้าระบบ
    const after = await readCase(page, CASE_NO)
    expect(after?.kb1SignaturePending).toBe(false)

    await openKb1Signatures(page, CASE_NO)
    await expect(panel.getByTestId('consent-status-badge')).toHaveText('ลงชื่อแล้ว')
    await expect(panel.getByAltText('ลายมือชื่อผู้ขอคุ้มครอง')).toBeVisible()
    await expect(panel).toContainText('ฉบับที่ 1')
    const history = panel.getByTestId('consent-history')
    await expect(history).toContainText('ส่งลิงก์ให้ลงชื่อ')
    await expect(history).toContainText('ผู้ขอคุ้มครองลงชื่อ')

    // ลายมือชื่ออยู่ในช่อง "ผู้ยื่นคำร้อง" ของกระดาษ พร้อมวันเวลาและรุ่นเอกสาร
    await page.getByRole('button', { name: 'หน้า 4', exact: true }).first().click()
    await expect(page.getByTestId('sign-slot-note').first()).toContainText('คบ.1 ฉบับที่ 1')
  })

  test('ยกเลิกลิงก์ / ออกลิงก์ใหม่ — ลิงก์เดิมใช้ต่อไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 6.2', 'officer')
    await openKb1Signatures(page, CASE_NO)
    const panel = page.getByTestId('applicant-consent-panel')

    const first = await sendConsentLink(page)
    const second = await sendConsentLink(page)
    expect(second).not.toBe(first)
    await expect(panel.getByTestId('consent-history')).toContainText('ออกลิงก์ใหม่')

    await page.goto(first)
    await expect(page.getByTestId('consent-cancelled')).toBeVisible()
    await page.goto(second)
    await expect(page.getByTestId('consent-sign-form')).toBeVisible()

    await openKb1Signatures(page, CASE_NO)
    await panel.getByTestId('consent-cancel-button').click()
    await page.getByRole('button', { name: 'ยืนยันยกเลิกลิงก์' }).click()
    await expect(panel.getByTestId('consent-status-badge')).toHaveText('ยกเลิก')
    await page.goto(second)
    await expect(page.getByTestId('consent-cancelled')).toBeVisible()
  })

  test('ลิงก์หมดอายุ — ฝั่งพยานลงชื่อไม่ได้ และบันทึกประวัติ', async ({ page }) => {
    await seedMockState(page, 'Case 6.2', 'officer')
    await openKb1Signatures(page, CASE_NO)
    const panel = page.getByTestId('applicant-consent-panel')
    const url = await sendConsentLink(page)
    await panel.getByTestId('consent-demo-expire').click()
    await expect(panel.getByTestId('consent-status-badge')).toHaveText('ลิงก์หมดอายุ')
    await expect(panel.getByTestId('consent-history')).toContainText('ลิงก์หมดอายุ')
    await page.goto(url)
    await expect(page.getByTestId('consent-expired')).toBeVisible()
  })

  test('แก้เอกสารหลังลงชื่อ — เก็บฉบับเดิม ไม่แปะลายมือชื่อเดิม และขอลงชื่อฉบับใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 6.2', 'officer')
    await openKb1Signatures(page, CASE_NO)
    const url = await sendConsentLink(page)
    await witnessSigns(page, url)

    // เจ้าหน้าที่แก้ข้อ 1 ของ คบ.1 หลังผู้ขอคุ้มครองลงชื่อแล้ว
    await page.goto(`/form/1?caseNo=${CASE_NO}`)
    await page.getByRole('button', { name: '1. ผู้ยื่นคำร้อง' }).click()
    const unitField = page.locator('label:text-is("สังกัด")').first().locator('xpath=following-sibling::input[1]')
    await unitField.fill('สำนักงานตัวอย่าง (สมมติ)')

    // ด่านส่งงานในแฟ้มกลับมาล็อกจนกว่าจะลงชื่อฉบับใหม่
    await page.goto(`/dossier/${CASE_NO}`)
    await expect(page.getByText('คบ.1 ถูกแก้ไขหลังผู้ขอคุ้มครองลงชื่อ — ต้องลงชื่อฉบับใหม่')).toBeVisible()

    await page.goto(`/form/1?caseNo=${CASE_NO}`)
    await page.getByRole('button', { name: '8. ลายมือชื่อ' }).click()
    const panel = page.getByTestId('applicant-consent-panel')
    await expect(panel.getByTestId('consent-resign-warning')).toContainText('ฉบับที่ 1')
    await expect(panel.getByAltText('ลายมือชื่อผู้ขอคุ้มครอง')).toHaveCount(0)
    await expect(page.getByTestId('paper-consent-note')).toContainText('ต้องให้ผู้ขอคุ้มครองลงชื่อฉบับใหม่')

    // ฉบับเดิมยังเปิดดูได้
    await panel.getByRole('button', { name: /ดูฉบับเดิมที่ลงชื่อ/ }).click()
    await expect(page.getByRole('dialog', { name: 'เอกสารฉบับที่ลงชื่อ' })).toBeVisible()
    await page.getByRole('dialog', { name: 'เอกสารฉบับที่ลงชื่อ' }).getByRole('button', { name: 'ปิด' }).click()

    const url2 = await sendConsentLink(page, { expectVersion: 2 })
    await witnessSigns(page, url2)
    await openKb1Signatures(page, CASE_NO)
    await expect(panel.getByTestId('consent-status-badge')).toHaveText('ลงชื่อแล้ว')
    await expect(panel).toContainText('ฉบับที่ 2')
    await expect(panel.getByTestId('consent-resign-warning')).toHaveCount(0)
  })

  test('ด่านส่งงานในแฟ้ม — ส่งลิงก์จากการ์ดส่งงาน และปลดล็อกหลังพยานลงชื่อ', async ({ page }) => {
    await seedMockState(page, 'Case 6.2', 'officer', {
      urgency: 'normal',
      urgent: false,
      urgencyAssessedAt: '10/09/2569 09:00',
      urgencyAssessedBy: 'นางสาวอรุณี ใจมั่น',
    })
    await page.goto(`/dossier/${CASE_NO}`)
    await expect(page.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'พยานลงนามตอนนี้' })).toHaveCount(0)
    const url = await sendConsentLink(page)
    await witnessSigns(page, url)
    await page.goto(`/dossier/${CASE_NO}`)
    await expect(page.getByText('ลายมือชื่อยินยอมในแบบ คบ.1 ครบถ้วน')).toBeVisible()
  })
})

test.describe('ข้อมูลตัวอย่างสำหรับสาธิต (Case 6.4–6.7)', () => {
  const cases: Array<[string, string]> = [
    ['Case 6.4', 'รอลงชื่อ'],
    ['Case 6.5', 'ลงชื่อแล้ว'],
    ['Case 6.6', 'ลิงก์หมดอายุ'],
    ['Case 6.7', 'ลงชื่อแล้ว'],
  ]
  for (const [name, status] of cases) {
    test(`${name} โหลดแล้วแสดงสถานะ “${status}”`, async ({ page }) => {
      await seedMockState(page, name)
      await openKb1Signatures(page, CASE_NO)
      const panel = page.getByTestId('applicant-consent-panel')
      await expect(panel.getByTestId('consent-status-badge')).toHaveText(status)
      if (name === 'Case 6.7') await expect(panel.getByTestId('consent-resign-warning')).toBeVisible()
    })
  }

  test('Case 6.4 — ลิงก์ที่รอลงชื่อยังใช้ลงชื่อได้หลังโหลดตัวอย่าง', async ({ page }) => {
    await seedMockState(page, 'Case 6.4')
    await openKb1Signatures(page, CASE_NO)
    const url = await page.getByTestId('consent-link-input').inputValue()
    await witnessSigns(page, url)
  })
})
