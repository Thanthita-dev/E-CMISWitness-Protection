import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 08A-3 · WIT0830 → WIT0837 — วิธีที่ 3 ปกปิดข้อมูล
 *
 * ผัง: รับงานวิธีที่ 3 (WIT0830) → ระบุข้อมูล/ช่องทางที่ต้องปกปิด (WIT0831)
 *      → กำหนด Role/Need-to-Know (WIT0832) → ตั้งมาตรการจำกัดการใช้ข้อมูล (WIT0833)
 *      → ทดสอบสิทธิ์/การรั่วไหล (WIT0834-0836) → เปิดใช้มาตรการ (WIT0837)
 */

const CASE_NO = 'WP-2569-000501'
const METHOD3_URL = `/protection-method/3?caseNo=${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName }).click()
  await dialog.waitFor({ state: 'detached' })
}


/** อ่าน Access Log (WIT0837) ที่ persist ไว้ — ใช้ยืนยันว่าทุกการเปิดดู/ส่งออกถูกบันทึกจริง */
async function readAccessLogs(page: Page, caseNo: string) {
  return page.evaluate((no: string) => {
    const raw = localStorage.getItem('ecmis-audit-storage')
    if (!raw) return [] as Array<Record<string, string>>
    const logs = JSON.parse(raw).state.logs as Array<Record<string, string>>
    return logs.filter((l) => l.caseNo === no)
  }, caseNo)
}

const BASE_PATCH = {
  approvedMethods: [3],
  methodTracks: [{ method: 3, status: 'pending' }],
}

test.describe('08A-3 · WIT0830-0837 — วิธีที่ 3 ปกปิดข้อมูล', () => {
  test('TC-080 · [Happy] ตั้งค่าปกปิดข้อมูลและทดสอบสิทธิ์ผ่าน แล้วเปิดใช้มาตรการ (ACTIVE)', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', BASE_PATCH)
    await page.goto(METHOD3_URL)

    // WIT0831 — ระบุข้อมูล/ตัวระบุที่ต้องปกปิด
    await page.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }).click()
    await page.getByRole('button', { name: 'เลขประจำตัวประชาชน' }).click()
    await page.getByRole('button', { name: 'ที่อยู่ / ที่พักปัจจุบัน' }).click()
    await page.getByLabel('ช่องทางที่ต้องปกปิด').fill('ระบบทะเบียนราษฎร์ และเอกสารราชการทุกฉบับที่เผยแพร่ภายนอก')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0832 — Role และ Need-to-Know
    await page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }).click()
    await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click()
    await page.getByLabel('เหตุผลของการให้สิทธิ์').fill('จำกัดเฉพาะผู้ปฏิบัติและผู้บังคับบัญชาที่ต้องกำกับดูแล')
    await page.getByLabel('ผู้อนุมัติสิทธิ์').fill('นายวีระยุทธ พิทักษ์ธรรม')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0833 — จำกัดการใช้ข้อมูล
    await page.getByText('จำกัดการค้นหา', { exact: true }).click()
    await page.getByText('จำกัดการดาวน์โหลด', { exact: true }).click()
    await page.getByText('จำกัดการพิมพ์', { exact: true }).click()
    await page.getByText('จำกัดการส่งต่อ', { exact: true }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // WIT0834-0836 — ทดสอบสิทธิ์: ผ่าน
    await page.getByLabel('ผลการทดสอบ').fill('ทดสอบเข้าถึงด้วยบัญชีนอกขอบเขต — ไม่พบข้อมูลที่ปกปิดรั่วไหล')
    await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()

    await expect(page.getByText(/Policy Version 1/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toBeVisible()
    await page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<{ method: number; status: string; privacy?: Record<string, unknown> }>).find(
      (t) => t.method === 3
    )
    expect(track?.status).toBe('active')
    expect(track?.privacy?.maskedIdentifiers).toEqual(
      expect.arrayContaining(['ชื่อตัว - ชื่อสกุล', 'เลขประจำตัวประชาชน', 'ที่อยู่ / ที่พักปัจจุบัน'])
    )
    expect(track?.privacy?.policyVersion).toBe(1)
    expect(track?.privacy?.auditBaseline).toBeTruthy()
    expect(track?.privacy?.effectiveAt).toBeTruthy()
  })

  test('TC-081 · [Happy] ทดสอบไม่ผ่าน แก้ Role/Policy/Masking แล้วทดสอบซ้ำจนผ่าน', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [3],
      methodTracks: [{ method: 3, status: 'pending', wizardStep: 3 }],
    })
    await page.goto(METHOD3_URL)

    // รอบที่ 1: ไม่ผ่าน
    await page.getByLabel('ผลการทดสอบ').fill('ผู้ใช้นอกขอบเขตยังเห็นข้อมูลที่ปกปิดไว้')
    await page.getByRole('button', { name: 'บันทึกผล: ไม่ผ่าน' }).click()
    await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toBeHidden()

    // แก้ Role/Masking แล้วทดสอบซ้ำ — ย้อนกลับสองขั้นจาก WIT0834 ไปแก้ Role ที่ WIT0832
    await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
    await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
    await page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    // รอบที่ 2: ผ่าน
    await page.getByLabel('ผลการทดสอบ').fill('แก้ไข Role แล้ว ทดสอบซ้ำผ่านทุกกรณี')
    await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()

    const after = await readCase(page, CASE_NO)
    const privacy = (after?.methodTracks as Array<{ method: number; privacy?: Record<string, unknown> }>).find(
      (t) => t.method === 3
    )?.privacy
    const tests = privacy?.tests as Array<{ passed: boolean; note: string }>
    // ต้องเก็บผลทดสอบทุกครั้งไว้ครบทั้งสองรอบ ไม่ใช่แค่รอบล่าสุด
    expect(tests).toHaveLength(2)
    expect(tests[0].passed).toBe(false)
    expect(tests[1].passed).toBe(true)
    expect(privacy?.policyVersion).toBe(1)
    await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toBeVisible()
  })

  test('TC-082 · [Negative] ปกปิดจนเจ้าหน้าที่ผู้รับผิดชอบเข้าถึงข้อมูลไม่ได้ — ต้องคงสิทธิ์ขั้นต่ำและเตือน', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [3],
      methodTracks: [{ method: 3, status: 'pending', wizardStep: 1 }],
    })
    await page.goto(METHOD3_URL)

    // พยายามตั้งค่า Role ที่เข้าถึงได้โดยไม่รวม "เจ้าหน้าที่ ป.ป.ท." (ผู้รับผิดชอบสำนวนเอง) เลยแม้แต่คนเดียว
    await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click()
    await page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }).click()
    // ระบบต้องคงสิทธิ์ขั้นต่ำของผู้รับผิดชอบสำนวนไว้เสมอ — ปลดออกไม่ได้ และต้องเตือนว่าปิดกั้นเกินความจำเป็น
    await expect(page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' })).toHaveClass(/border-emerald-400/)
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    await page.getByLabel('ผลการทดสอบ').fill('ทดสอบด้วยบัญชีเจ้าหน้าที่ผู้รับผิดชอบ')
    await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()

    const after = await readCase(page, CASE_NO)
    const privacy = (after?.methodTracks as Array<{ method: number; privacy?: Record<string, unknown> }>).find(
      (t) => t.method === 3
    )?.privacy
    // ระบบคงสิทธิ์ขั้นต่ำให้เจ้าหน้าที่ผู้รับผิดชอบเข้าถึงได้เสมอ ปลดสิทธิ์นี้ออกจากมาตรการไม่ได้
    expect((privacy?.allowedRoles as string[]) || []).toContain('officer')
  })

  test('TC-083 · [Negative] ผู้ใช้นอกขอบเขตค้นหาข้อมูลพยานได้ — ต้องถูกบล็อกตามมาตรการที่ตั้งไว้', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [3],
      methodTracks: [
        {
          method: 3,
          status: 'active',
          startedAt: new Date().toISOString(),
          privacy: {
            maskedIdentifiers: ['ชื่อตัว - ชื่อสกุล'],
            allowedRoles: ['officer', 'director'],
            restrictSearch: true,
            restrictDownload: true,
            restrictPrint: true,
            restrictForward: true,
            policyVersion: 1,
            effectiveAt: new Date().toISOString(),
            tests: [{ id: 'T-1', at: new Date().toISOString(), by: 'officer', passed: true, note: 'ผ่าน' }],
          },
        },
      ],
    })

    // บัญชีนอกขอบเขต (ไม่อยู่ใน allowedRoles) ลองค้นหาชื่อพยานจากทะเบียน
    await switchRole(page, 'appeal')
    await page.goto('/registry')
    await page.getByPlaceholder(/ค้นหาเลขคำร้อง/).fill('สมชาย ใจดี')

    // restrictSearch=true ต้องไม่แสดงผลการค้นหาแก่ผู้ใช้นอกขอบเขต และต้องแจ้งว่าถูกปิดกั้นตามมาตรการ
    await expect(page.getByText(CASE_NO)).toBeHidden()
    await expect(page.getByTestId('registry-search-blocked')).toBeVisible()

    // ความพยายามค้นหาต้องถูกบันทึกลง Access Log พร้อมผู้ใช้ บทบาท และเวลา
    const blockedLogs = await readAccessLogs(page, CASE_NO)
    expect(blockedLogs.some((l) => l.action.includes('ถูกบล็อกการค้นหา'))).toBe(true)
    expect(blockedLogs.every((l) => Boolean(l.timestamp && l.actorRole))).toBe(true)

    // การสั่งพิมพ์เอกสารของแฟ้มนี้ต้องถูกบล็อกและบันทึกความพยายามด้วยเช่นกัน
    await page.goto(`/form/11?caseNo=${CASE_NO}`)
    await page.getByTestId('form-print-button').click()
    const printLogs = await readAccessLogs(page, CASE_NO)
    expect(printLogs.some((l) => l.action.includes('ถูกบล็อกการสั่งพิมพ์'))).toBe(true)
  })

  test('TC-084 · [Audit] ทุกการเปิดดู/ส่งออกต้องมี Audit Log ครบทุกรายการ', async ({ page }) => {
    // window.print() ของเบราว์เซอร์จริงเปิดกล่องพิมพ์ของระบบปฏิบัติการซึ่งค้างการทดสอบ — แทนที่ด้วย no-op
    await page.addInitScript(() => {
      window.print = () => {}
    })
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [3],
      methodTracks: [
        {
          method: 3,
          status: 'active',
          startedAt: new Date().toISOString(),
          privacy: {
            maskedIdentifiers: ['ชื่อตัว - ชื่อสกุล'],
            allowedRoles: ['officer'],
            policyVersion: 1,
            effectiveAt: new Date().toISOString(),
            tests: [{ id: 'T-1', at: new Date().toISOString(), by: 'officer', passed: true, note: 'ผ่าน' }],
            auditBaseline: 1,
          },
        },
      ],
    })

    // เปิดดูข้อมูลพยาน 3 ครั้ง (คนละรายการเอกสาร) — แต่ละครั้งต้องเกิดรายการใน Access Log
    for (const formNo of [9, 11, 13]) {
      await page.goto(`/form/${formNo}?caseNo=${CASE_NO}`)
      await expect(page.getByTestId('form-print-button')).toBeVisible()
    }

    // ส่งออก/สั่งพิมพ์ 1 ครั้ง
    await page.getByTestId('form-print-button').click()

    const logs = await readAccessLogs(page, CASE_NO)
    const views = logs.filter((l) => l.action.startsWith('เปิดดูเอกสาร'))
    const exports = logs.filter((l) => l.action.startsWith('สั่งพิมพ์/ส่งออกเอกสาร'))
    expect(views).toHaveLength(3)
    expect(exports).toHaveLength(1)

    // ทุกรายการต้องครบ: ผู้ใช้ · บทบาท · เวลา · รายการข้อมูล · IP/อุปกรณ์
    for (const log of [...views, ...exports]) {
      expect(log.actorName).toBeTruthy()
      expect(log.actorRole).toBeTruthy()
      expect(log.timestamp).toBeTruthy()
      expect(log.docRef).toBeTruthy()
      expect(log.ipAddress).toBeTruthy()
      expect(log.device).toBeTruthy()
    }

    // WIT0837 — ต้องเปิดตรวจ Access Log ได้จากแท็บประวัติของแฟ้ม ไม่ใช่ต้องไปเปิดฐานข้อมูลเอง
    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByTestId('dossier-tab-audit').click()
    await expect(page.getByTestId('dossier-audit-log-list')).toBeVisible()
    await expect(page.getByTestId('dossier-audit-log-access-entry').first()).toBeVisible()
  })

  test('TC-085 · [Edge] สิทธิ์หมดอายุเมื่อพ้นช่วงเวลาที่อนุมัติ — ต้องสิ้นผลอัตโนมัติ', async ({ page }) => {
    // ช่วงอนุมัติ 1-30 ก.ย. 2569 — ตั้ง effectiveAt ให้พ้นวันสิ้นสุดไปแล้วมาก (40 วันก่อน)
    const longAgo = new Date(Date.now() - 40 * 86400000).toISOString()
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [3],
      methodTracks: [
        {
          method: 3,
          status: 'active',
          startedAt: longAgo,
          privacy: {
            maskedIdentifiers: ['ชื่อตัว - ชื่อสกุล'],
            allowedRoles: ['officer'],
            policyVersion: 1,
            effectiveAt: longAgo,
            tests: [{ id: 'T-1', at: longAgo, by: 'officer', passed: true, note: 'ผ่าน' }],
          },
        },
      ],
    })

    await page.goto(METHOD3_URL)
    // ธุรกิจที่ถูกต้อง: สิทธิ์ต้องสิ้นผลตามวันที่กำหนดและระบบต้องบันทึก/แสดงว่าสิ้นผลแล้ว (ไม่ใช่ ACTIVE ตลอดไป)
    // ของจริง: ไม่มีแนวคิดวันสิ้นสุดของมาตรการเลย (ไม่มีฟิลด์ช่วงอนุมัติ) — สถานะยังคง ACTIVE ตลอดไปไม่มีวันสิ้นผล
    await expect(page.getByText(/สิ้นผล|หมดอายุ|expired/i)).toBeVisible()
  })
})
