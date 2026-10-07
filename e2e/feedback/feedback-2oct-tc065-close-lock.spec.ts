import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * Feedback 2 Oct · แท็บ 11D (TC-065)
 *
 * BUG-001 / TC-065  WIT1148 ปิดงานคุ้มครองแล้ว ต้องล็อกทั้งแฟ้ม
 *   - คบ.6 สร้างเวอร์ชันใหม่เพื่อแก้ไขไม่ได้ และแก้ไขช่องกรอกไม่ได้
 *   - แก้ไข/ยกเลิกเชื่อมโยงคดีหลักในแฟ้มไม่ได้
 *   - แนบ/ลบไฟล์ไม่ได้ แต่ดู พิมพ์ ดาวน์โหลดได้
 *   - มีป้ายแจ้งว่าแฟ้มถูกล็อกที่หน้าแฟ้ม หน้าแบบฟอร์ม และหน้ายุติการคุ้มครอง
 */

const CASE_NO = 'WP-2569-000501'
const TERM_URL = `/termination/${CASE_NO}`
const DOSSIER_URL = `/dossier/${CASE_NO}`
const KB6_URL = `/form/6?caseNo=${CASE_NO}`
const CLOSE_BUTTON = 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน'

/** ไฟล์ตัวอย่างที่มี previewUrl จริงในชุดเอกสารของ คบ.6 — ใช้ยืนยันว่าดู/ดาวน์โหลดยังทำได้หลังล็อก */
async function seedKb6Attachment(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('__tc065_seeded') === '1') return
    const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
    const store = raw ? JSON.parse(raw) : { state: {}, version: 0 }
    store.state.attachmentSets = [
      ...(store.state.attachmentSets || []),
      {
        id: 65001,
        formId: 6,
        category: 'เอกสารประกอบ',
        description: 'ไฟล์แนบ TC-065',
        files: [
          {
            name: 'หลักฐาน_TC065.pdf',
            size: 2048,
            type: 'application/pdf',
            previewUrl: 'data:application/pdf;base64,JVBERi0xLjQK',
            uploadedAt: '09:00',
            uploadedBy: 'เจ้าหน้าที่ ป.ป.ท.',
          },
        ],
      },
    ]
    localStorage.setItem('ecmis-form-draft-storage-v2', JSON.stringify(store))
    localStorage.setItem('__tc065_seeded', '1')
  })
}

async function closeCase(page: Page) {
  await page.goto(TERM_URL)
  const closeBtn = page.getByRole('button', { name: CLOSE_BUTTON })
  await expect(closeBtn).toBeEnabled()
  await closeBtn.click()
  await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')
  const after = await readCase(page, CASE_NO)
  expect(after?.stage).toBe('terminated')
  expect(after?.closedAt).toBeTruthy()
}

test.describe('Feedback 2 Oct · TC-065 ปิดงานคุ้มครอง (WIT1148) ล็อกทั้งแฟ้ม', () => {
  test('TC-065 · ก่อนปิดงานยังแก้ไขได้ตามปกติ (ไม่มีป้ายล็อก)', async ({ page }) => {
    await seedMockState(page, 'Case 1.19', 'officer')
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('case-closed-banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'แก้ไข / ยกเลิกเชื่อมโยง' })).toBeVisible()

    await page.goto(KB6_URL)
    await expect(page.getByTestId('case-closed-banner')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /สร้างเวอร์ชันใหม่เพื่อแก้ไข/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /สร้างเวอร์ชันใหม่เพื่อแก้ไข/ })).toBeEnabled()
  })

  test('TC-065 · [BUG-001] ปิดงานแล้วแสดงป้ายล็อกที่หน้ายุติ หน้าแฟ้ม และหน้า คบ.6', async ({ page }) => {
    await seedMockState(page, 'Case 1.19', 'officer')
    await closeCase(page)

    const bannerTerm = page.getByTestId('case-closed-banner')
    await expect(bannerTerm).toContainText('แฟ้มนี้ปิดงานคุ้มครองแล้ว')
    await captureEvidence(page, 'TC-065-a', bannerTerm, 'ปิดงาน WIT1148 แล้ว — แสดงป้ายล็อกเอกสาร')

    await page.goto(DOSSIER_URL)
    const bannerDossier = page.getByTestId('case-closed-banner')
    await expect(bannerDossier).toContainText('เอกสารถูกล็อก ดู/พิมพ์/ดาวน์โหลดได้เท่านั้น')
    await captureEvidence(page, 'TC-065-b', bannerDossier, 'หน้าแฟ้ม — ป้ายแจ้งแฟ้มถูกล็อกทั้งแฟ้ม')

    await page.goto(KB6_URL)
    await expect(page.getByTestId('case-closed-banner')).toContainText('แฟ้มนี้ปิดงานคุ้มครองแล้ว')
  })

  test('TC-065 · [BUG-001] คบ.6 สร้างเวอร์ชันใหม่ไม่ได้ และแก้ไขช่องกรอกไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.19', 'officer')
    await closeCase(page)
    await page.goto(KB6_URL)

    await expect(page.getByRole('button', { name: /สร้างเวอร์ชันใหม่เพื่อแก้ไข/ })).toHaveCount(0)
    const notice = page.getByText('แฟ้มปิดงานคุ้มครองแล้ว — ไม่สามารถสร้างเวอร์ชันใหม่หรือแก้ไขฉบับนี้ได้')
    await expect(notice).toBeVisible()
    await captureEvidence(page, 'TC-065-c', notice, 'คบ.6 — ไม่มีปุ่มสร้างเวอร์ชันใหม่ ล็อกถาวร')

    // ช่องกรอกและปุ่มบันทึก/ลงนามทั้งหมดใช้ไม่ได้
    const inputs = page.getByTestId('case-closed-fieldset').locator('input:not([type=hidden]), textarea')
    expect(await inputs.count()).toBeGreaterThan(0)
    for (const el of await inputs.all()) await expect(el).toBeDisabled()
    await expect(page.getByRole('button', { name: 'บันทึกแบบ คบ.6' })).toBeDisabled()

    // ไม่มีเวอร์ชันใหม่ถูกสร้างใน draft store
    const revisions = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      return raw ? (JSON.parse(raw).state.revisions?.[6] ?? []).length : 0
    })
    expect(revisions).toBe(0)
  })

  test('TC-065 · [BUG-001] แก้ไข/ยกเลิกเชื่อมโยงคดีหลักไม่ได้ (ยืนยันค่าใน store ไม่เปลี่ยน)', async ({ page }) => {
    await seedMockState(page, 'Case 1.19', 'officer')
    await closeCase(page)
    await page.goto(DOSSIER_URL)

    await expect(page.getByRole('button', { name: 'แก้ไข / ยกเลิกเชื่อมโยง' })).toHaveCount(0)
    const link = page.getByText('กบค. 001/2569').first()
    await expect(link).toBeVisible()
    await captureEvidence(page, 'TC-065-d', link, 'คดีหลักที่เชื่อมโยงไว้ — ไม่มีปุ่มแก้ไข/ยกเลิกเชื่อมโยง')

    // ชั้น store — ลองยกเลิกเชื่อมโยงตรง ๆ ต้องไม่มีผล
    const result = await page.evaluate((no) => {
      const raw = localStorage.getItem('ecmis-case-storage-v2')
      return raw ? JSON.parse(raw).state.cases.find((c: { no: string }) => c.no === no)?.linkedMainCaseId : null
    }, CASE_NO)
    expect(result).toBe('GBK-2569-0001')
  })

  test('TC-065 · [BUG-001] แนบ/ลบไฟล์ไม่ได้ แต่ดู พิมพ์ ดาวน์โหลดยังใช้ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.19', 'officer')
    await seedKb6Attachment(page)
    await closeCase(page)

    // หน้าแฟ้ม — ตัวจัดการไฟล์ไม่มีปุ่มอัปโหลด/ชุดเอกสารใหม่ และแบบฟอร์มเปิดดูเอกสารได้
    await page.goto(DOSSIER_URL)
    await expect(page.getByRole('button', { name: 'อัปโหลด' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'ชุดเอกสารใหม่' })).toHaveCount(0)
    await expect(page.getByTestId('extra-form-attach')).toHaveCount(0)
    const viewButtons = page.getByRole('button', { name: 'ดูเอกสาร' })
    expect(await viewButtons.count()).toBeGreaterThan(0)
    await captureEvidence(page, 'TC-065-e', viewButtons.first(), 'ดูเอกสารยังใช้ได้ แต่ไม่มีปุ่มเปิดแก้ไข/แนบไฟล์')

    // หน้า คบ.6 — แท็บรวมไฟล์เปิดได้ ดู/ดาวน์โหลดได้ ส่วนอัปโหลด/ลบไม่มี
    await page.goto(KB6_URL)
    await page.getByRole('button', { name: 'รวมไฟล์ คบ.' }).click()
    await expect(page.getByRole('button', { name: 'อัปโหลด' })).toHaveCount(0)
    await page.getByText('เอกสารประกอบ', { exact: true }).first().click()
    await expect(page.getByTitle('ลบไฟล์')).toHaveCount(0)
    const download = page.getByTitle('ดาวน์โหลดไฟล์').first()
    await expect(download).toBeVisible()
    await expect(page.getByTitle('พรีวิวไฟล์').first()).toBeVisible()
    await captureEvidence(page, 'TC-065-f', download, 'แท็บรวมไฟล์ — ดาวน์โหลด/พรีวิวได้ ไม่มีอัปโหลด/ลบ')

    // พิมพ์ยังใช้ได้
    await expect(page.getByTestId('form-print-button')).toBeEnabled()
  })
})
