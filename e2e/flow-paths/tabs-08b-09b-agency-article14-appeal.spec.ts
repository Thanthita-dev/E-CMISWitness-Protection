import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'
import { snap } from '../helpers/snapshot'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import type { UserRole } from '../../src/types/user'
import { CASE_NO, cancelDialog, confirmDialog, fieldAfterLabel } from '../journeys/journey-helpers'

/**
 * Flow paths · แท็บ 08B / 08C / 09A / 09B (ตรวจเทียบโค้ดปัจจุบัน — ผังใน src/flow-guide)
 *
 * 08B ประสานสถานีตำรวจตามข้อ 15(4) (/protection-method/4)
 *   test "08B ตอบรับ"   : WIT0841 → 0842 → 0843 → 0846 → 0844(ตอบรับ) → 0847 → 0848 → 0849 → 0851 → 0850
 *   test "08B ปฏิเสธ"   : WIT0844(ปฏิเสธ) → 0845 → 0864 (ส่งคืน/เห็นชอบ) → 0865
 *   test "08B ฐานยินยอม": WIT0847/0848 ถูกบล็อกเมื่อไม่มี คบ.11
 * 08C ส่งต่อกรมคุ้มครองสิทธิฯ ตามข้อ 14 (/article14)
 *   test "08C ครบเส้น"  : WIT0852 → 0854 → 0880 → 0881 → 0855 → 0882 → 0883 → 0884 → 0856 → 0885 → 0859 → 0860 → 0861 → 0862 → 0863
 *   test "08C ส่งคืน"   : WIT0886 (ผบช./ผอ. ส่งคืนแก้ไข → Revision)
 *   test "08C ไม่ได้"   : WIT0887 → 0888 → 0889 (กรมดำเนินการไม่ได้)
 *   test "08C มติ"      : WIT0857 / WIT0858 (ข้อมูลเก่า committee_pending)
 * 09A ไม่อนุมัติและแจ้งสิทธิอุทธรณ์ (/form/10, /appeal, /appeal-folder)
 *   test "09A ครบเส้น"  : WIT0901 → 0902 → 0903 → 0904 → 0905 → 0906 → 0907 → 0924 → 0908 → 0910
 *   test "09A ส่งไม่สำเร็จ": WIT0906 → 0923 → 0906
 *   test "09A สละสิทธิ์/ปิดเรื่อง": WIT0908 → 0909
 * 09B รับอุทธรณ์ กลั่นกรอง เสนอคณะกรรมการ (/appeal-folder)
 *   test "09B ครบเส้น (ยกคำร้อง)": WIT0911 → 0912 → 0913 → 0914 → 0930 → 0915 → 0916 → 0933 → 0917 → 0918 → 0919 → 0920 → 0934 → 0921
 *   test "09B ยื่นช้า"  : WIT0914 → 0931
 *   test "09B เปลี่ยนคำสั่ง": WIT0920 → 0934 → 0922 → 0935
 *   test "09B มอบหมาย"  : WIT0932
 */

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const popup = (page: Page) => page.locator('.swal2-popup:not(.swal2-toast)')
type Rec = Record<string, any>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') })

// ======================================================================
// 08B
// ======================================================================
const M4 = `/protection-method/4?caseNo=${CASE_NO}`
const track4 = async (page: Page) => ((await caseOf(page)).methodTracks as Rec[]).find((t) => t.method === 4) as Rec

/** WIT0842 · เลือกจังหวัด → สถานี → ผู้ประสานงาน */
async function chooseStation(page: Page) {
  await page.getByTestId('coordination-province').selectOption('นนทบุรี')
  await page.getByTestId('coordination-station-search').fill('สภ.ปากเกร็ด')
  const station = page.getByTestId('coordination-agency')
  const id = await station.locator('option', { hasText: 'สภ.ปากเกร็ด' }).getAttribute('value')
  await station.selectOption(id!)
  await page.getByRole('textbox', { name: 'ผู้ประสานงาน', exact: true }).fill('ร.ต.อ. ผู้ประสานงานทดสอบ')
  await page.getByRole('textbox', { name: 'ตำแหน่ง', exact: true }).fill('รองสารวัตร')
  await page.getByRole('textbox', { name: 'เบอร์โทร', exact: true }).fill('0812345678')
}

/** WIT0843 · ทำหนังสือประสาน (dialog) แล้วยืนยันนำส่ง */
async function sendOutgoing(page: Page, channel: 'direct' | 'post' = 'direct') {
  await page.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
  await page.getByTestId('coordination-letter-number').fill('ปปท 0004/1234')
  await page.getByLabel('ส่งหนังสือประสานโดย', { exact: true }).selectOption(channel)
  if (channel === 'post') await page.getByRole('textbox', { name: 'เลขติดตามไปรษณีย์', exact: true }).fill('EMS-001')
  await page.getByTestId('coordination-send-outgoing').click()
  await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', 'สถานีตำรวจภูธรปากเกร็ด')
  await expect(page.getByRole('heading', { name: 'หนังสือตอบกลับขาเข้า', exact: true })).toBeVisible()
}

test.describe('08B · ประสานสถานีตำรวจตามข้อ 15(4)', () => {
  test('08B ตอบรับ: เลือกสถานี → หนังสือขาออก → ตอบรับ → ส่งมอบ คบ.12 → ACTIVE → คบ.13', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 8.1', 'officer')

    await test.step('WIT0841 · เปิดงานวิธีที่ 4 จาก /protection-methods', async () => {
      await page.goto('/protection-methods')
      await snap(page, ['node:08B:WIT0841'], { label: 'แฟ้มวิธีที่ 4 อยู่ในรายการวิธีคุ้มครอง รอเปิดงานประสานสถานีตำรวจ' })
      await page.getByRole('link', { name: 'เปิดงาน', exact: true }).click()
      // แฟ้มที่เหลือวิธีเดียว (วิธีที่ 4): เปิดงานแล้วลงที่ /protection-method-work ซึ่งแสดงพื้นที่ทำงานวิธีที่ 4 อัตโนมัติ (ไม่ผ่านหน้าเลือกวิธี)
      await expect(page).toHaveURL(new RegExp(`/protection-method-work\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      await expect(page.getByTestId('automatic-method4-workspace')).toBeVisible()
      await expect(page.getByRole('link', { name: /^วิธีที่ 4 — ประสานหน่วยงานอื่น/ })).toHaveCount(0)
      // ขั้นถัดไปทำงานที่หน้าวิธีที่ 4 โดยตรง
      await page.goto(M4)
      await expect(page).toHaveURL(/\/protection-method\/4/)
      await snap(page, ['node:08B:WIT0842', 'edge:08B:E8B01'], { label: 'เปิดหน้าวิธีที่ 4 แล้ว รอเลือกสถานีตำรวจและผู้ประสานงาน' })
    })

    await test.step('WIT0842 · เลือกสถานีตำรวจ + ผู้ประสานงาน (บันทึกลงแฟ้ม)', async () => {
      await chooseStation(page)
      const co = (await track4(page)).coordination
      expect(co.agency).toBe('สถานีตำรวจภูธรปากเกร็ด')
      expect(co.province).toBe('นนทบุรี')
      expect(co.contactPhone).toBe('0812345678')
      await snap(page, ['node:08B:WIT0843', 'edge:08B:E8B02'], { label: 'เลือกสถานีและผู้ประสานงานแล้ว รอจัดทำหนังสือประสานขาออก' })
    })

    await test.step('WIT0843 · ส่งหนังสือประสานขาออก (ยกเลิกในจอยืนยันก่อน) → วิธีที่ 4 = เตรียมการ', async () => {
      await page.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
      // ไม่มีเลขหนังสือ — จอยืนยันต้องไม่ขึ้น
      await page.getByTestId('coordination-send-outgoing').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('coordination-letter-number').fill('ปปท 0004/1234')
      await page.getByTestId('coordination-send-outgoing').click()
      await cancelDialog(page)
      expect(((await caseOf(page)).officialLetters as unknown[]) || []).toHaveLength(0)
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก')
      const c = await caseOf(page)
      const letters = c.officialLetters as Rec[]
      expect(letters[0]).toMatchObject({ direction: 'outgoing', context: 'method4', registryNo: 'ปปท 0004/1234' })
      expect((await track4(page)).status).toBe('preparing')

      await snap(page, ['node:08B:WIT0846', 'edge:08B:E8B03'], { label: 'ส่งหนังสือประสานขาออกแล้ว รอบันทึกหนังสือตอบกลับขาเข้า' })
    })

    await test.step('WIT0846 + WIT0844 ◇ ตอบรับ: แนบไฟล์หนังสือตอบกลับ → "เตรียมดำเนินการคุ้มครอง"', async () => {
      await expect(page.getByRole('heading', { name: 'หนังสือตอบกลับขาเข้า', exact: true })).toBeVisible()
      await page.getByRole('textbox', { name: 'เลขที่หนังสือรับ', exact: true }).fill('ตร. 0011/500')
      await page.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน', exact: true }).fill('พ.ต.ท. ธนากร ศรีอุดม')
      // ยังไม่แนบไฟล์ — ตอบรับไม่ได้
      await page.getByTestId('coordination-accept').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('coordination-incoming-file-input').setInputFiles(pdf('หนังสือตอบรับ.pdf'))
      await expect(page.getByRole('link', { name: 'หนังสือตอบรับ.pdf', exact: true })).toBeVisible()
      await snap(page, ['node:08B:WIT0844', 'edge:08B:E8B04'], { label: 'กรอกและแนบหนังสือตอบกลับแล้ว รอเลือกผล ตอบรับ/ปฏิเสธ' })
      await page.getByTestId('coordination-accept').click()
      await confirmDialog(page, 'ยืนยันเตรียมดำเนินการคุ้มครอง')
      await expect(page).toHaveURL(new RegExp(`/protection-duration\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      const co = (await track4(page)).coordination
      expect(co.responseStatus).toBe('accepted')
      const incoming = ((await caseOf(page)).officialLetters as Rec[]).find((l) => l.direction === 'incoming')
      expect(incoming?.documentName).toBe('หนังสือตอบรับ.pdf')
    })

    await test.step('WIT0847 · เตรียมการส่งมอบ + ลิงก์ คบ.12 (บริบทวิธีที่ 4)', async () => {
      await page.goto(M4)
      await expect(page.getByRole('heading', { name: 'เตรียมการและส่งมอบจริง (คบ.12)' })).toBeVisible()
      await snap(page, ['node:08B:WIT0847', 'edge:08B:E8B06'], { label: 'หน่วยงานตอบรับแล้ว รอกรอกนัดส่งมอบ' })
      await page.getByLabel('วันเวลานัดส่งมอบ').fill('2026-10-20T09:00')
      await page.getByLabel('สถานที่ส่งมอบ').fill('สำนักงาน ป.ป.ท.')
      await page.getByLabel('ผู้ส่งมอบ', { exact: true }).fill('นางสาวอรุณี ใจมั่น')
      await page.getByLabel('ผู้รับมอบ', { exact: true }).fill('พ.ต.ท. ธนากร ศรีอุดม')
      await page.locator('label', { hasText: 'ขอบเขตข้อมูลที่เปิดเผยได้' }).locator('textarea').fill('ชื่อ-สกุลและลักษณะภัยเท่าที่จำเป็น')
      const link = page.getByTestId('open-kb12-method4')
      await expect(link).toHaveAttribute('href', /\/form\/12\?.*context=method4/)
      expect((await track4(page)).coordination.handoverPlace).toBe('สำนักงาน ป.ป.ท.')
      await snap(page, ['node:08B:WIT0848', 'edge:08B:E8B07'], { label: 'บันทึกนัดส่งมอบแล้ว ถึงวันส่งมอบจริง รอลงนาม คบ.12' })
    })

    await test.step('WIT0848 · ส่งมอบจริงและลงนาม คบ.12 (คำสั่งยังอยู่กับ ป.ป.ท.)', async () => {
      await page.getByTestId('coordination-complete-handover').click()
      await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12', 'คำสั่งยังอยู่กับ ป.ป.ท.')
      const co = (await track4(page)).coordination
      expect(co.handoverCompletedAt).toBeTruthy()
      expect(co.handoverRecordedAt).toBeTruthy()
      expect((await caseOf(page)).transferRequest).toBeFalsy()
      await snap(page, ['node:08B:WIT0849', 'edge:08B:E8B08'], { label: 'ส่งมอบจริงและลงนาม คบ.12 แล้ว รอสถานีตำรวจเริ่มคุ้มครอง' })
    })

    await test.step('WIT0849 · หน่วยงานเริ่มปฏิบัติจริง → ACTIVE', async () => {
      await page.getByTestId('method-4-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
      const t = await track4(page)
      expect(t.status).toBe('active')
      expect(t.startedAt).toBeTruthy()
    })

    await test.step('WIT0851 · ระบบเก็บสถานะ และมีทางไปแท็บ 10', async () => {
      const exit = page.getByRole('link', { name: 'ไปรายงานผลการคุ้มครอง (คบ.13)' })
      await expect(exit).toHaveAttribute('href', /\/protection-monitor/)
      await expect(page.getByText('ทะเบียนหนังสือของวิธีนี้')).toBeVisible()
    })

    await test.step('WIT0850 · เพิ่มหนังสือรายงาน คบ.13 รายเดือน', async () => {
      await page.goto(`/protection-duration?caseNo=${CASE_NO}`)
      await snap(page, ['node:08B:WIT0850', 'edge:08B:E8B09'], { label: 'วิธีที่ 4 ACTIVE แล้ว ถึงรอบรายงานประจำเดือน รอเพิ่มหนังสือ คบ.13' })
      await page.getByRole('button', { name: 'เพิ่มหนังสือ คบ.13', exact: true }).click()
      await page.getByLabel('รอบเดือนรายงาน').fill('2026-11')
      await page.getByLabel('อัปโหลดหนังสือ คบ.13').setInputFiles(pdf('คบ13-พฤศจิกายน.pdf'))
      await expect.poll(async () => ((await caseOf(page)).protectionReportUploads as unknown[] | undefined)?.length).toBe(1)
      await snap(page, ['node:08B:WIT0851', 'edge:08B:E8B10'], { label: 'บันทึกหนังสือรายงาน คบ.13 แล้ว ระบบอัปเดตสถานะวิธีที่ 4 และหลักฐานตอบรับ-ส่งมอบ' })
    })

    await test.step('08B > 10 · ไปหน้ารายงานผลการคุ้มครอง (คบ.13)', async () => {
      await page.goto(M4)
      await page.getByRole('link', { name: 'ไปรายงานผลการคุ้มครอง (คบ.13)' }).click()
      await expect(page).toHaveURL(/\/protection-monitor/)
      await snap(page, ['overview:08B>10'], { label: 'วิธีที่ 4 ACTIVE เปิดหน้ารายงานผลการคุ้มครอง (แท็บ 10)' })
    })
  })

  test('08B ปฏิเสธ: WIT0844 → 0845 เสนอหน่วยงานใหม่ → 0864 ผบช. (ส่งคืน/เห็นชอบ) → 0865 ผอ. อนุมัติ', async ({ page }) => {
    test.setTimeout(240_000)
    const AGENCY_B = 'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ'
    await seedMockState(page, 'Case 8.1', 'officer')
    await page.goto(M4)
    await chooseStation(page)
    await sendOutgoing(page)

    await test.step('WIT0844 ◇ ปฏิเสธ — ต้องมีเหตุผล', async () => {
      await page.getByTestId('coordination-decline').click()
      await expect(popup(page)).toHaveCount(0)
      await page.locator('label', { hasText: 'เหตุผล (กรณีปฏิเสธ)' }).locator('textarea').fill('อัตรากำลังไม่เพียงพอ')
      await page.getByTestId('coordination-decline').click()
      await confirmDialog(page, 'ยืนยันบันทึกการปฏิเสธ', 'เริ่มไม่ได้')
      const t = await track4(page)
      expect(t.status).toBe('blocked')
      expect(t.coordination.responseStatus).toBe('declined')
      await snap(page, ['node:08B:WIT0845', 'edge:08B:E8B05'], { label: 'หน่วยงานปฏิเสธ วิธีที่ 4 ติดขัด รอเจ้าหน้าที่เสนอหน่วยงานใหม่' })
    })

    const propose = async () => {
      await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
      await page.getByTestId('coordination-note').fill('มีชุดปฏิบัติการในพื้นที่')
      await page.getByTestId('coordination-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่', 'ผบช.ชั้นต้น')
    }
    await test.step('WIT0845 · เสนอหน่วยงานใหม่ตามลำดับชั้น', async () => {
      await expect(page.getByTestId('wit0845-card')).toBeVisible()
      await propose()
      const proposals = (await caseOf(page)).coordinationProposals as Rec[]
      expect(proposals).toHaveLength(1)
      expect(proposals[0]).toMatchObject({ proposedAgency: AGENCY_B, stage: 'supervisor' })
    })

    await test.step('WIT0864 · ผบช.ชั้นต้น ◇ ส่งคืนแก้ไข (ต้องมีเหตุผล) → เจ้าหน้าที่เสนอใหม่', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(M4)
      await snap(page, ['node:08B:WIT0864', 'edge:08B:E8B11'], { label: 'เจ้าหน้าที่เสนอหน่วยงานใหม่แล้ว รอ ผบช.ชั้นต้นเห็นชอบหรือส่งคืน' })
      await page.getByTestId('coordination-return').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('coordination-decision-note').fill('ขอเหตุผลประกอบเพิ่ม')
      await page.getByTestId('coordination-return').click()
      await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข')
      expect(((await caseOf(page)).coordinationProposals as Rec[])[0].stage).toBe('returned')
      await switchRole(page, 'officer')
      await page.goto(M4)
      await snap(page, ['edge:08B:E8B13'], { label: 'ผบช.ชั้นต้นส่งคืนแก้ไข กลับให้เจ้าหน้าที่เสนอหน่วยงานใหม่' })
      await propose()
      expect(((await caseOf(page)).coordinationProposals as Rec[])).toHaveLength(2)
    })

    await test.step('WIT0864 · ผบช.ชั้นต้นเห็นชอบ → ผอ.', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(M4)
      await page.getByTestId('coordination-decision-note').fill('เห็นควรประสานหน่วยงานที่เสนอ')
      await page.getByTestId('coordination-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
      expect(((await caseOf(page)).coordinationProposals as Rec[])[1].stage).toBe('director')
    })

    await test.step('WIT0865 · ผอ.สำนัก/กอง อนุมัติ → วิธีที่ 4 กลับเป็นเตรียมการ/รอหนังสือตอบกลับ', async () => {
      await switchRole(page, 'director')
      await page.goto(M4)
      await snap(page, ['node:08B:WIT0865', 'edge:08B:E8B12'], { label: 'ผบช.ชั้นต้นเห็นชอบแล้ว รอ ผอ.สำนัก/กองอนุมัติหน่วยงานใหม่' })
      await page.getByTestId('coordination-decision-note').fill('อนุมัติ')
      await page.getByTestId('coordination-endorse').click()
      await confirmDialog(page, 'ยืนยันอนุมัติหน่วยงานใหม่', AGENCY_B)
      const c = await caseOf(page)
      expect((c.coordinationProposals as Rec[])[1].stage).toBe('approved')
      const t = await track4(page)
      expect(t.coordination.agency).toBe(AGENCY_B)
      expect(t.coordination.responseStatus).toBe('awaiting')
      expect(t.status).toBe('preparing')
      expect(c.approvedMethods).toEqual([4])
      await snap(page, ['edge:08B:E8B15'], { label: 'ผอ.อนุมัติหน่วยงานใหม่แล้ว วิธีที่ 4 กลับเป็นเตรียมการ รอจัดทำหนังสือประสานฉบับใหม่', route: M4, role: 'officer' })
    })
  })

  test('08B ฐานยินยอม: ไม่มี คบ.11/ความยินยอม คบ.5 → ส่งมอบจริงไม่ได้ (WIT0847/0848)', async ({ page }) => {
    await seedMockState(page, 'Case 8.1', 'officer', {
      kb11Signed: false,
      consents: [],
      methodTracks: [{
        method: 4, status: 'preparing', wizardStep: 3,
        coordination: { stationId: 'nonthaburi-7cfd2094d6cf', province: 'นนทบุรี', agency: 'สถานีตำรวจภูธรปากเกร็ด', responseStatus: 'accepted' },
      }],
    })
    await page.goto(M4)
    await expect(page.getByTestId('handover-missing-consent')).toContainText('คบ.11 ยังไม่ลงนาม')
    await expect(page.getByTestId('coordination-complete-handover')).toBeDisabled()
  })
})

// ======================================================================
// 08C
// ======================================================================
const A14 = '/article14'
const CHAIN = ['supervisor', 'director', 'deputy_secretary', 'secretary'] as const
const a14Of = async (page: Page) => (await caseOf(page)).article14 as Rec
const NOTE_PH = 'ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข'

async function passClerks(page: Page, direction: 'up' | 'down') {
  const order = direction === 'up' ? (['receiver', 'secretary_receiver'] as const) : (['secretary_receiver', 'receiver'] as const)
  for (const clerk of order) await passSarabanCheckpoint(page, CASE_NO, clerk)
}

/** WIT0854 → WIT0880 → WIT0881 · จัดทำเรื่อง บันทึกหนังสือแบบ 18 แล้วส่งให้ ผบช.ชั้นต้น */
async function officerOpens(page: Page, threat: string, risk: string, revision = false) {
  await page.goto(A14)
  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill(threat)
  await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill(risk)
  await page.getByTestId('submit-article14-proposal').click()
  await confirmDialog(page, 'ยืนยันจัดทำ', revision ? 'หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ฉบับใหม่' : 'ส่งให้ผู้บังคับบัญชาชั้นต้น')
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
  expect((await a14Of(page)).step).toBe('proposal_draft')
}
async function officerSavesAndSubmits(page: Page, capture = false) {
  const footer = page.getByTestId('article14-review-footer')
  await expect(footer.getByTestId('article14-submit-review')).toBeDisabled()
  await expect(footer.getByTestId('article14-letter-unsaved')).toBeVisible()
  await page.locator('[data-testid="dossier-form-row"][data-form-number="18"]').getByText('เปิดแบบฟอร์ม').click()
  await expect(page).toHaveURL(/\/form\/18/)
  await page.getByRole('button', { name: /บันทึกหนังสือ$/ }).click()
  await page.goto(`/dossier/${encodeURIComponent(CASE_NO)}`)
  await expect(footer.getByTestId('article14-submit-review')).toBeEnabled()
  if (capture) await snap(page, ['node:08C:WIT0881', 'edge:08C:E8C03'], { label: 'บันทึกหนังสือแบบ 18 แล้ว ปุ่มส่งให้ผู้บังคับบัญชาชั้นต้นเปิดใช้งาน' })
  await footer.getByTestId('article14-submit-review').click()
  await confirmDialog(page, 'ยืนยันส่ง', 'ผู้บังคับบัญชาชั้นต้น')
}
async function endorse(page: Page, role: string, note: string, hooks: { pre?: () => Promise<void>; mid?: () => Promise<void> } = {}) {
  await switchRole(page, role)
  await page.goto(A14)
  await hooks.pre?.()
  await page.getByPlaceholder(NOTE_PH).fill(note)
  await page.getByTestId('article14-endorse-button').click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ')
  await hooks.mid?.()
  if (role === 'director') await passClerks(page, 'up')
  if (role === 'secretary') await passClerks(page, 'down')
}
async function returnBack(page: Page, role: string, reason: string, pre?: () => Promise<void>) {
  await switchRole(page, role)
  await page.goto(A14)
  await pre?.()
  await page.getByTestId('article14-return-button').click()
  await expect(popup(page)).toHaveCount(0)
  await page.getByPlaceholder(NOTE_PH).fill(reason)
  await page.getByTestId('article14-return-button').click()
  await confirmDialog(page, 'ยืนยันส่งคืน', reason)
  if (role === 'deputy_secretary' || role === 'secretary') await passClerks(page, 'down')
}

test.describe('08C · ส่งต่อกรมคุ้มครองสิทธิฯ ตามข้อ 14', () => {
  test('08C ครบเส้น: เสนอ → 4 ชั้น (ผ่านธุรการ) → นำส่ง → หนังสือตอบรับ → ส่งมอบ → ปิด Episode', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0852 · รับกรณีข้อ 14 (ใกล้เพดาน ยังไม่มีเรื่อง)', async () => {
      await page.goto(A14)
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await expect(page.getByTestId('article14-near-cap-hint')).toBeVisible()
      expect((await caseOf(page)).article14).toBeFalsy()
      await snap(page, ['node:08C:WIT0852', 'node:08C:WIT0854', 'edge:08C:E8C01'], { label: 'แฟ้มใกล้เพดาน 180 วัน เปิดหน้าข้อ 14 ยังไม่มีเรื่องเสนอ', role: 'officer' })
    })
    await test.step('WIT0854 · ต้องกรอกเหตุภัย/ผลประเมินก่อน แล้วจัดทำเรื่อง (สร้างหนังสือแบบ 18 ฉบับที่ 1)', async () => {
      await page.getByTestId('submit-article14-proposal').click()
      await expect(popup(page)).toHaveCount(0)
      await officerOpens(page, 'ยังมีกลุ่มผู้มีอิทธิพลติดตามคุกคามต่อเนื่อง', 'อ้างอิง คบ.13 รอบล่าสุด ความเสี่ยงสูง')
      await expect(page.getByTestId('article14-letter-version')).toContainText('ฉบับที่ 1')
      await snap(page, ['node:08C:WIT0880', 'edge:08C:E8C02'], { label: 'จัดทำเรื่องข้อ 14 แล้ว หนังสือแบบ 18 ฉบับที่ 1 ยังไม่บันทึก' })
    })
    await test.step('WIT0880 + WIT0881 · บันทึกหนังสือแบบ 18 แล้วส่งให้ ผบช.ชั้นต้น', async () => {
      await officerSavesAndSubmits(page, true)
      expect((await a14Of(page)).step).toBe('supervisor_review')
    })
    await test.step('WIT0855 · ผบช.ชั้นต้นเห็นชอบ', async () => {
      await endorse(page, 'supervisor', 'เห็นชอบเสนอ ผอ.', {
        pre: () => snap(page, ['node:08C:WIT0855', 'edge:08C:E8C04'], { label: 'เจ้าหน้าที่ส่งเรื่องข้อ 14 แล้ว รอ ผบช.ชั้นต้นตรวจและเห็นชอบ' }),
      })
      expect((await a14Of(page)).step).toBe('director_review')
    })
    await test.step('WIT0882 + WIT0883 · ผอ.เห็นชอบ → ธุรการขาขึ้นลงทะเบียน', async () => {
      await endorse(page, 'director', 'เห็นชอบเสนอรองเลขาธิการ', {
        pre: () => snap(page, ['node:08C:WIT0882', 'edge:08C:E8C05'], { label: 'ผบช.ชั้นต้นเห็นชอบแล้ว รอ ผอ.สำนัก/กองเห็นชอบเสนอรองเลขาธิการ' }),
        mid: () => snap(page, ['node:08C:WIT0883', 'edge:08C:E8C08'], { label: 'ผอ.เห็นชอบแล้ว ชุดเอกสารออกจากหน่วย รอธุรการออกเลขส่ง-ลงเลขรับ (สลธ.)', role: 'receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` }),
      })
      expect((await a14Of(page)).step).toBe('deputy_review')
    })
    await test.step('WIT0884 · รองเลขาธิการเห็นชอบ', async () => {
      await endorse(page, 'deputy_secretary', 'เห็นชอบเสนอเลขาธิการ', {
        pre: () => snap(page, ['node:08C:WIT0884', 'edge:08C:E8C09'], { label: 'ธุรการ สลธ. รับเข้าแล้ว รอรองเลขาธิการเห็นชอบเสนอเลขาธิการ' }),
      })
      expect((await a14Of(page)).step).toBe('secretary_review')
    })
    await test.step('WIT0856 + WIT0885 · เลขาธิการเห็นชอบ → ธุรการขาลง → ส่งคืนเจ้าหน้าที่ (ไม่ผ่านมติ)', async () => {
      await endorse(page, 'secretary', 'เห็นชอบส่งต่อกรม', {
        pre: () => snap(page, ['node:08C:WIT0856', 'edge:08C:E8C10'], { label: 'รองเลขาธิการเห็นชอบแล้ว รอเลขาธิการเห็นชอบส่งกรม' }),
        mid: () => snap(page, ['node:08C:WIT0885', 'edge:08C:E8C11'], { label: 'เลขาธิการเห็นชอบแล้ว ผลกลับหน่วย รอธุรการออกเลขส่ง (สลธ.) ลงเลขรับ (หน่วย)', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` }),
      })
      const a14 = await a14Of(page)
      expect(a14.step).toBe('letter_sent')
      expect(a14.approvals.map((a: Rec) => a.level)).toEqual([...CHAIN])
      expect(a14.committeeResolutionNo).toBeFalsy()
    })
    await test.step('WIT0859 · บันทึกการนำส่งหนังสือถึงกรม', async () => {
      await switchRole(page, 'officer')
      await page.goto(A14)
      await expect(page.getByTestId('article14-secretary-approved')).toBeVisible()
      await expect(page.getByTestId('article14-reply-locked')).toBeVisible()
      await snap(page, ['node:08C:WIT0859', 'edge:08C:E8C12'], { label: 'ผลเห็นชอบกลับถึงเจ้าหน้าที่แล้ว รอบันทึกการนำส่งหนังสือถึงกรม', role: 'officer' })
      await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('ปปท 0001/3114')
      await page.getByTestId('article14-record-delivery').click()
      await confirmDialog(page, 'ยืนยันบันทึก', 'ปปท 0001/3114')
      await expect(page.getByTestId('article14-delivery-summary')).toContainText('ปปท 0001/3114')
      expect(((await caseOf(page)).officialLetters as Rec[])[0]).toMatchObject({ direction: 'outgoing', context: 'article14' })
      await snap(page, ['node:08C:WIT0860', 'edge:08C:E8C13'], { label: 'บันทึกนำส่งหนังสือถึงกรมแล้ว รอบันทึกหนังสือตอบรับของกรม' })
    })
    await test.step('WIT0860 · บันทึกการได้รับหนังสือตอบรับ (ต้องครบ 4 อย่าง)', async () => {
      await page.getByTestId('article14-record-reply').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByPlaceholder('เลขที่หนังสือตอบรับของกรม').fill('ยธ 0501/2569')
      await page.getByPlaceholder('ผู้ประสานของกรม').fill('นายประสาน ตอบรับ')
      await page.getByLabel('วันนัดส่งมอบ').fill('2026-10-20')
      await page.getByTestId('article14-reply-file').setInputFiles(pdf('หนังสือตอบรับกรม.pdf'))
      await expect(page.getByText('หนังสือตอบรับกรม.pdf')).toBeVisible()
      await page.getByTestId('article14-record-reply').click()
      await confirmDialog(page, 'ยืนยันบันทึก')
      await expect(page.getByTestId('article14-reply-summary')).toBeVisible()
      expect((await a14Of(page)).step).toBe('response_received')
      await snap(page, ['node:08C:WIT0861', 'edge:08C:E8C17'], { label: 'กรมตอบรับแล้ว รอกรอกวันส่งมอบจริง' })
    })
    await test.step('WIT0861 + WIT0862 · กรอกวันส่งมอบ/เริ่มมาตรการ/ฐานกฎหมาย แล้วยืนยันส่งมอบ', async () => {
      await page.getByLabel('วันส่งมอบจริง').fill('2026-10-20')
      await page.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่').fill('2026-10-20')
      await page.getByLabel('ฐานกฎหมายของหน่วยงานใหม่').fill('มาตรการพิเศษตามระเบียบกรม')
      await snap(page, ['node:08C:WIT0862', 'edge:08C:E8C18'], { label: 'ถึงวันนัด กรอกวันส่งมอบ วันเริ่มมาตรการ และฐานกฎหมายแล้ว รอยืนยันส่งมอบ' })
      await page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยันส่งมอบ', 'Episode')
      expect((await a14Of(page)).step).toBe('handover_done')
      await snap(page, ['node:08C:WIT0863', 'edge:08C:E8C19'], { label: 'ยืนยันส่งมอบแล้ว ปิด Episode ป.ป.ท. เชื่อม Episode กรม' })
    })
    await test.step('WIT0863 · ปิด Episode ป.ป.ท. เชื่อม Episode กรม', async () => {
      const c = await caseOf(page)
      expect((c.episode as Rec).closedAt).toBeTruthy()
      expect((c.episode as Rec).successorAgency).toContain('กรมคุ้มครองสิทธิและเสรีภาพ')
      expect(c.stage).toBe('transferred')
    })
  })

  test('08C ส่งคืน: WIT0886 ผบช. ส่งคืนแก้ไข → Revision (หนังสือฉบับ 2) → ส่งใหม่ → ผอ. ส่งคืนอีกชั้น', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 5', 'officer')
    await officerOpens(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูง')
    await officerSavesAndSubmits(page)
    await returnBack(page, 'supervisor', 'ผลประเมินยังไม่อ้างอิง คบ.13 ล่าสุด', () =>
      snap(page, ['node:08C:WIT0886'], { label: 'เจ้าหน้าที่ส่งเรื่องข้อ 14 แล้ว ผบช.ชั้นต้นเปิดพิจารณา พร้อมกดส่งคืนแก้ไข' }))
    let a14 = await a14Of(page)
    expect(a14.step).toBe('proposal_draft')
    expect(a14.revisions).toHaveLength(1)

    await switchRole(page, 'officer')
    await page.goto(A14)
    await expect(page.getByText(/ส่งคืนแก้ไขแล้ว 1 ครั้ง/)).toContainText('คบ.13')
    await snap(page, ['edge:08C:E8C06', 'edge:08C:E8C07'], { label: 'ผบช.ชั้นต้นส่งคืนแก้ไข เจ้าหน้าที่ต้องจัดทำ Revision (หนังสือแบบ 18 ฉบับใหม่)', role: 'officer' })
    await officerOpens(page, 'ภัยยังคงอยู่', 'อ้างอิง คบ.13 รอบล่าสุดแล้ว', true)
    await expect(page.getByTestId('article14-letter-version')).toContainText('ฉบับที่ 2')
    await officerSavesAndSubmits(page)
    await endorse(page, 'supervisor', 'แก้ไขครบแล้ว')
    await returnBack(page, 'director', 'ขอเอกสารประกอบเหตุภัยเพิ่ม')
    a14 = await a14Of(page)
    expect(a14.step).toBe('proposal_draft')
    expect(a14.revisions).toHaveLength(2)
  })

  test('08C ไม่ได้: WIT0887 กรมแจ้งดำเนินการไม่ได้ → 0888 ผบช. ส่งคืน/เห็นชอบ → 0889 ผอ. อนุมัติแนวทางใหม่', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 5.1', 'officer')
    await page.goto(A14)
    await snap(page, ['node:08C:WIT0887', 'edge:08C:E8C14'], { label: 'กรมตอบรับแล้วแต่ภายหลังแจ้งดำเนินการไม่ได้ รอบันทึกเหตุและแนวทางที่เสนอ' })
    await test.step('WIT0887 · ต้องมีเหตุและแนวทาง', async () => {
      await page.getByTestId('article14-delivery-failed').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByPlaceholder('ระบุเหตุผลตามหนังสือแจ้งของกรม').fill('กรมแจ้งว่าเกินอำนาจ')
      await page.getByPlaceholder(/เช่น คงมาตรการเดิม/).fill('คงมาตรการเดิมของ ป.ป.ท. ไว้ก่อน')
      await page.getByTestId('article14-delivery-failed').click()
      await confirmDialog(page, 'ยืนยันบันทึก', 'ผบช.ชั้นต้น')
      const c = await caseOf(page)
      expect((c.article14 as Rec).step).toBe('delivery_failed')
      expect((c.article14EscalationProposals as Rec[])[0].stage).toBe('supervisor')
      expect((c.episode as Rec)?.closedAt).toBeFalsy()
      await expect(page.getByTestId('article14-escalation-card')).toBeVisible()
    })
    await test.step('WIT0888 · ผบช. ส่งคืน (ต้องมีเหตุผล) → เจ้าหน้าที่เสนอใหม่', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(A14)
      await snap(page, ['node:08C:WIT0888', 'edge:08C:E8C15'], { label: 'เจ้าหน้าที่เสนอแนวทางใหม่หลังกรมดำเนินการไม่ได้ รอ ผบช.ชั้นต้นเห็นชอบหรือส่งคืน' })
      await page.getByTestId('article14-escalation-return').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('article14-escalation-decision-note').fill('ขอแนวทางที่ชัดเจนกว่านี้')
      await page.getByTestId('article14-escalation-return').click()
      await confirmDialog(page, 'ยืนยันส่งคืนแก้ไข')
      expect(((await caseOf(page)).article14EscalationProposals as Rec[])[0].stage).toBe('returned')
      await switchRole(page, 'officer')
      await page.goto(A14)
      await page.getByTestId('article14-escalation-reason').fill('กรมแจ้งว่าเกินอำนาจ')
      await page.getByTestId('article14-escalation-approach').fill('ประสานสถานีตำรวจในพื้นที่')
      await page.getByTestId('article14-escalation-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอแนวทางใหม่')
      expect(((await caseOf(page)).article14EscalationProposals as Rec[])).toHaveLength(2)
    })
    await test.step('WIT0888 → WIT0889 · ผบช. เห็นชอบ → ผอ. อนุมัติ (มาตรการเดิมยังมีผล)', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(A14)
      await page.getByTestId('article14-escalation-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
      await switchRole(page, 'director')
      await page.goto(A14)
      await snap(page, ['node:08C:WIT0889', 'edge:08C:E8C16'], { label: 'ผบช.ชั้นต้นเห็นชอบแนวทางใหม่แล้ว รอ ผอ.สำนัก/กองอนุมัติ (มาตรการเดิมยังมีผล)' })
      await page.getByTestId('article14-escalation-endorse').click()
      await confirmDialog(page, 'ยืนยันอนุมัติแนวทางใหม่')
      const c = await caseOf(page)
      expect((c.article14EscalationProposals as Rec[])[1].stage).toBe('approved')
      expect((c.episode as Rec)?.closedAt).toBeFalsy()
      expect(c.stage).not.toBe('transferred')
    })
  })

  test('08C มติ: WIT0857 ข้อมูลเก่า (committee_pending) เห็นชอบ → ไปบันทึกนำส่ง', async ({ page }) => {
    await seedMockState(page, 'Edge 08C→11C', 'committee')
    await page.goto(A14)
    await snap(page, ['node:08C:WIT0857'], { label: 'ข้อมูลเก่า เรื่องข้อ 14 รอมติเห็นชอบส่งกรมหรือไม่', role: 'committee' })
    await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติ 5/2569')
    await page.getByPlaceholder('สาระสำคัญของมติ').fill('เห็นชอบส่งกรม')
    await page.getByTestId('article14-committee-approve').click()
    await confirmDialog(page, 'ยืนยันมติ', 'มติที่ มติ 5/2569')
    const a14 = await a14Of(page)
    expect(a14.step).toBe('letter_sent')
    expect(a14.committeeResolutionNo).toBe('มติ 5/2569')
    await snap(page, ['edge:08C:E8C21'], { label: 'มติเห็นชอบส่งกรม (ข้อมูลเก่า) ไปบันทึกการนำส่งหนังสือถึงกรม', role: 'officer', route: A14 })
  })

  test('08C มติ: WIT0858 ข้อมูลเก่า ไม่เห็นชอบ → ใช้คำสั่งเดิม + ลิงก์กระบวนการยุติ', async ({ page }) => {
    await seedMockState(page, 'Edge 08C→11C', 'committee')
    await page.goto(A14)
    await page.getByTestId('article14-committee-reject').click()
    await expect(popup(page)).toHaveCount(0)
    await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติ 6/2569')
    await page.getByTestId('article14-committee-reject').click()
    await confirmDialog(page, 'ยืนยันมติ', 'ดำเนินการตามคำสั่งเดิม')
    expect((await a14Of(page)).step).toBe('committee_rejected')
    await expect(page.getByRole('link', { name: 'กระบวนการยุติ' })).toHaveAttribute('href', '/termination')
    await snap(page, ['node:08C:WIT0858', 'edge:08C:E8C20'], { label: 'คณะกรรมการไม่เห็นชอบส่งกรม ใช้คำสั่งเดิม มีลิงก์ไปกระบวนการยุติ', route: A14, role: 'committee' })
    await page.getByRole('link', { name: 'กระบวนการยุติ' }).click()
    await expect(page).toHaveURL(/\/termination/)
    await snap(page, ['overview:08C>11C'], { label: 'ไม่เห็นชอบส่งกรม เปิดหน้ากระบวนการยุติการคุ้มครอง (แท็บ 11C)', role: 'committee' })
  })
})

// ======================================================================
// 09A
// ======================================================================
const F10 = `/form/10?caseNo=${CASE_NO}`
const dispatchCard = (page: Page) => page.getByTestId('notice-dispatch-card')

/** WIT0903-WIT0906 · เติมรายละเอียด ตรวจพร้อมส่ง และบันทึกการนำส่ง */
async function prepareAndDispatch(page: Page) {
  await page.goto(F10)
  await completeNoticeDetails(page)
  await checkNoticeReady(page)
  await dispatchCard(page).getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
  await expect.poll(async () => (await caseOf(page)).dispatchedAt).toBeTruthy()
}

test.describe('09A · ไม่อนุมัติและแจ้งสิทธิอุทธรณ์', () => {
  test('09A ครบเส้น: คบ.10 → เติม/ตรวจ/ส่ง → พยานรับ → /appeal → รับคำอุทธรณ์', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Notice 3', 'officer')

    await test.step('WIT0901 · รับผลไม่อนุมัติ + คบ.10 ฉบับลงนาม', async () => {
      await page.goto(F10) // seed ไม่เปิดหน้าให้ — ต้องมีหน้าก่อนอ่าน localStorage
      const c = await caseOf(page)
      expect(c.activity7State).toBe('rejected')
      expect(c.kb10Signed).toBe(true)
      expect(c.resultNotices[10].status).toBe('signed_incomplete')
      await snap(page, ['node:09A:WIT0901'], { label: 'ผลไม่อนุมัติและ คบ.10 ฉบับลงนาม (ยังเติมรายละเอียดไม่ครบ) ส่งมาจากแท็บ 07', route: F10, role: 'officer' })
    })
    await test.step('WIT0902 · หน้า คบ.10 แสดงสถานะ/ฉบับลงนาม', async () => {
      await page.goto(F10)
      await expect(page.getByTestId('result-notice-status')).toContainText('ลงนามแล้ว')
      await snap(page, ['node:09A:WIT0902', 'edge:09A:E9A01', 'node:09A:WIT0903', 'edge:09A:E9A02'], { label: 'หน้า คบ.10 แสดงสถานะลงนามแล้ว รอเติมรายละเอียดเฉพาะช่องที่อนุญาต' })
    })
    await test.step('WIT0903 · เติมรายละเอียดเฉพาะช่องที่อนุญาต (ฉบับลงนามเดิมไม่เปลี่ยน)', async () => {
      const before = await caseOf(page)
      await completeNoticeDetails(page)
      const after = await caseOf(page)
      expect(after.resultNotices[10].original).toEqual(before.resultNotices[10].original)
      expect(after.kb10SignedAt).toBe(before.kb10SignedAt)
      await snap(page, ['node:09A:WIT0904', 'edge:09A:E9A03'], { label: 'เติมรายละเอียด คบ.10 แล้ว บันทึกเป็นรุ่นใหม่ รอตรวจฉบับลงนามเดิมและประวัติ' })
    })
    await test.step('WIT0904 · ตรวจประวัติรุ่น', async () => {
      await page.getByTestId('notice-audit-history').locator('summary').click()
      await expect(page.getByTestId('notice-audit-history')).toContainText('รุ่น')
      await snap(page, ['node:09A:WIT0905', 'edge:09A:E9A04'], { label: 'ตรวจประวัติรุ่นแล้ว รอตรวจและยืนยันพร้อมส่ง' })
    })
    await test.step('WIT0905 · ตรวจพร้อมส่ง (ไม่ลงนามซ้ำ)', async () => {
      await checkNoticeReady(page)
      expect((await caseOf(page)).resultNotices[10].status).toBe('ready')
      await snap(page, ['node:09A:WIT0906', 'edge:09A:E9A05'], { label: 'ยืนยัน คบ.10 พร้อมส่งแล้ว รอบันทึกการนำส่ง' })
    })
    await test.step('WIT0906 · บันทึกการนำส่ง (EMS)', async () => {
      await dispatchCard(page).getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect(page.getByTestId('result-notice-status')).toHaveText('ส่งแจ้งผลแล้ว')
      expect(String((await caseOf(page)).dispatchChannel)).toContain('ไปรษณีย์')
      await page.goto('/appeal')
      await expect(page.getByRole('row').filter({ hasText: CASE_NO })).toContainText('รอพยานได้รับหนังสือ')
    })
    const delivered = isoDay(-3)
    await test.step('WIT0907 · บันทึกวันที่พยานรับจริง → appealDueAt = +30 วัน', async () => {
      await page.goto(F10)
      const card = dispatchCard(page)
      await snap(page, ['node:09A:WIT0907', 'edge:09A:E9A08'], { label: 'บันทึกการนำส่ง คบ.10 แล้ว รอบันทึกวันที่พยานรับจริง' })
      await card.locator('input[type="date"]').fill(delivered)
      await fieldAfterLabel(card, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
      await card.locator('label', { hasText: 'เลือกไฟล์อัปโหลด' }).locator('input[type="file"]').setInputFiles(pdf('ใบตอบรับ-EMS.pdf'))
      await card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
      await expect.poll(async () => (await caseOf(page)).deliveredAt).toBeTruthy()
      const c = await caseOf(page)
      expect(Math.round((new Date(c.appealDueAt).getTime() - new Date(c.deliveredAt).getTime()) / 86400000)).toBe(30)
      await expect(dispatchCard(page)).toHaveCount(0)
    })
    await test.step('WIT0924 · รายการงานอุทธรณ์: รอรับคำอุทธรณ์ เหลือ N วัน', async () => {
      await page.goto('/appeal')
      const row = page.getByRole('row').filter({ hasText: CASE_NO })
      await expect(row).toContainText('รอรับคำอุทธรณ์')
      await expect(row).toContainText(/เหลือ \d+ วัน/)
      await snap(page, ['node:09A:WIT0924', 'edge:09A:E9A09', 'node:09A:WIT0908', 'edge:09A:E9A10', 'node:09A:WIT0910'], { label: 'พยานรับ คบ.10 แล้ว เริ่มนับ 30 วัน รายการอุทธรณ์แสดงรอรับคำอุทธรณ์' })
    })
    await test.step('WIT0908 ◇ + WIT0910 · ประสงค์อุทธรณ์ → กด "รับคำอุทธรณ์" ไปแฟ้มรับอุทธรณ์', async () => {
      await page.getByRole('row').filter({ hasText: CASE_NO }).getByRole('link', { name: 'รับคำอุทธรณ์', exact: true }).click()
      await expect(page).toHaveURL(`/appeal-folder/${encodeURIComponent(CASE_NO)}`)
      await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
      await expect(page.getByText('พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง')).toBeVisible()
      expect((await caseOf(page)).appealFiledAt).toBeFalsy()
      await snap(page, ['edge:09A:E9A12', 'overview:09A>09B'], { label: 'พยานประสงค์อุทธรณ์ กด รับคำอุทธรณ์ เปิดแฟ้มรับอุทธรณ์ (แท็บ 09B)' })
    })
  })

  test('09A ส่งไม่สำเร็จ: WIT0906 → WIT0923 แจ้งตีกลับ → เปลี่ยนช่องทางส่งใหม่', async ({ page }) => {
    await seedMockState(page, 'Notice 3', 'officer')
    await prepareAndDispatch(page)

    await snap(page, ['node:09A:WIT0923', 'edge:09A:E9A06'], { label: 'บันทึกนำส่ง คบ.10 แล้ว แต่ส่งไม่สำเร็จ/ถูกตีกลับ รอบันทึกเหตุผล' })
    await page.getByPlaceholder('เช่น ไม่มีผู้รับตามที่อยู่ที่ระบุ').fill('ไม่มีผู้รับตามที่อยู่')
    await page.getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
    await confirmDialog(page, 'ยืนยันว่าไม่สำเร็จ')
    await expect(page.getByTestId('dispatch-history-item').first()).toContainText('ไม่สำเร็จ/ตีกลับ')
    await snap(page, ['edge:09A:E9A07'], { label: 'บันทึกส่งไม่สำเร็จแล้ว รอเปลี่ยนช่องทางและบันทึกนำส่งใหม่' })
    await dispatchCard(page).getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
    await expect(page.getByTestId('dispatch-history-item')).toHaveCount(2)
    expect((await caseOf(page)).deliveredAt).toBeFalsy()
  })

  test('09A สละสิทธิ์: WIT0908 ไม่อุทธรณ์ในกรอบ → WIT0909 ปิดเรื่อง (ต้องมีหลักฐาน)', async ({ page }) => {
    await seedMockState(page, 'Notice 5', 'officer')
    await page.goto(`/appeal-folder/${encodeURIComponent(CASE_NO)}`)
    await page.getByText('พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง').click()
    await snap(page, ['node:09A:WIT0909', 'edge:09A:E9A11'], { label: 'พยานไม่ประสงค์อุทธรณ์ในกรอบ เปิดส่วนสละสิทธิ์/ปิดเรื่อง รอกรอกหลักฐาน' })
    await page.getByTestId('kb10-waiver-submit').click()
    await expect(popup(page)).toHaveCount(0)
    await page.getByTestId('kb10-waiver-note').fill('พยานแจ้งทางโทรศัพท์ว่าไม่ประสงค์อุทธรณ์')
    await page.getByTestId('kb10-waiver-evidence').fill('บันทึกถ้อยคำที่พยานลงชื่อ')
    await page.getByTestId('kb10-waiver-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง')
    expect((await caseOf(page)).nonApprovalClosedAt).toBeTruthy()
    await expect(page.getByText('ไม่เปิดรับคำอุทธรณ์สำหรับเคสนี้')).toBeVisible()
    await page.goto('/appeal')
    await expect(page.getByTestId('appeal-closed-notice')).toContainText(CASE_NO)
  })

  test('09A พ้นกำหนด: WIT0909 ปิดเรื่อง — ไม่อุทธรณ์ภายในกำหนด (seed ย้อนหลัง 40 วัน)', async ({ page }) => {
    await seedMockState(page, 'Notice 5', 'officer', {
      deliveredAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      appealDueAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    })
    await page.goto(`/appeal-folder/${encodeURIComponent(CASE_NO)}`)
    await page.getByText('พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง').click()
    await expect(page.getByTestId('kb10-waiver')).toHaveCount(0)
    await page.getByTestId('kb10-close-note').fill('ตรวจสอบแล้วไม่มีคำอุทธรณ์เข้าระบบ')
    await page.getByTestId('kb10-close-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง')
    expect((await caseOf(page)).nonApprovalClosedAt).toBeTruthy()
  })
})

// ======================================================================
// 09B
// ======================================================================
const FOLDER = `/appeal-folder/${encodeURIComponent(CASE_NO)}`

async function giveOpinion(page: Page, role: string | null, note: string, expected?: string, pre?: () => Promise<void>) {
  if (role) await switchRole(page, role)
  await pre?.()
  await page.getByTestId('appeal-opinion-note').fill(note)
  await page.getByTestId('appeal-opinion-submit').click()
  await confirmDialog(page, 'ยืนยัน', expected)
}
/** สลับทั้งบัญชี (ผู้ใช้ + หน่วยงาน) ตามบทบาท — switchRole เปลี่ยนแค่บทบาท ธุรการต้องอยู่หน่วยเดียวกับผู้รับจึงจะลงทะเบียนได้ */
async function switchAccount(page: Page, role: string) {
  const raw = await page.evaluate(() => localStorage.getItem('ecmis-auth-storage'))
  const auth = JSON.parse(raw as string)
  const account = mockStateAccountForRole(role as UserRole)
  auth.state = account ? authStateForAccount(account, auth.state) : { ...auth.state, currentRole: role }
  await page.addInitScript((v: string) => localStorage.setItem('ecmis-auth-storage', v), JSON.stringify(auth))
  await page.reload()
}
async function clerks(page: Page, order: Array<'receiver' | 'secretary_receiver'>) {
  for (const clerk of order) {
    // ทุกขั้นที่เรียกใช้ฟังก์ชันนี้ผ่านธุรการครบทุกด่านที่ระบุ — ถ้าด่านใดไม่มีงาน (ไม่มีปุ่มส่งต่อ) ให้เทสต์ fail ไม่ข้าม
    await switchAccount(page, clerk)
    await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
    const workspace = page.getByTestId('saraban-workspace')
    await workspace.waitFor()
    await expect(workspace.getByTestId('saraban-no-task'), `ธุรการ ${clerk} ไม่มีงานที่ด่านนี้`).toHaveCount(0)
    await expect(workspace.getByTestId('saraban-submit-button'), `ไม่พบปุ่มส่งต่อของธุรการ ${clerk}`).toBeVisible()
    await passSarabanCheckpoint(page, CASE_NO, clerk)
  }
  await page.goto(FOLDER)
}
/** WIT0914 → WIT0919 */
async function walkToAgenda(page: Page, capture = false) {
  const at = async (keys: string[], label: string, extra: { role?: string; route?: string } = {}) => {
    if (capture) await snap(page, keys, { label, ...extra })
  }
  await at(['node:09B:WIT0914', 'edge:09B:E9B03'], 'ผูกคำอุทธรณ์กับแฟ้มเดิมแล้ว รอตรวจความครบถ้วนและกรอบ 30 วัน')
  await page.getByTestId('appeal-check-submit').click()
  await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน', 'ยื่นภายในกรอบกำหนด')
  await at(['node:09B:WIT0930', 'edge:09B:E9B05'], 'ตรวจแล้วยื่นภายในกรอบ รอเจ้าหน้าที่บันทึกความเห็น')
  await giveOpinion(page, null, 'ตรวจข้อเท็จจริงแล้ว', 'ผบช.ชั้นต้น')
  await giveOpinion(page, 'supervisor', 'ตรวจความครบถ้วนแล้ว', 'ผอ.สำนัก/กอง', () =>
    at(['node:09B:WIT0915', 'edge:09B:E9B08'], 'เจ้าหน้าที่เสนอความเห็นแล้ว รอ ผบช.ชั้นต้นให้ความเห็นเสนอ ผอ.'))
  await giveOpinion(page, 'director', 'ลงนามเสนอ', 'รองเลขาธิการฯ', () =>
    at(['node:09B:WIT0916', 'edge:09B:E9B09'], 'ผบช.ชั้นต้นให้ความเห็นแล้ว รอ ผอ.สำนัก/กองลงนามเสนอรองเลขาธิการ'))
  await at(['node:09B:WIT0933', 'edge:09B:E9B10'], 'ผอ.ลงนามเสนอแล้ว ชุดเอกสารออกจากหน่วย รอธุรการออกเลขส่ง-ลงเลขรับ (สลธ.)', { role: 'receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
  await clerks(page, ['receiver', 'secretary_receiver'])
  await giveOpinion(page, 'deputy_secretary', 'กลั่นกรองแล้ว', 'ผ่านการกลั่นกรองแล้ว', () =>
    at(['node:09B:WIT0917', 'edge:09B:E9B11'], 'ธุรการ สลธ. รับเข้าแล้ว รอรองเลขาธิการกลั่นกรองและให้ความเห็น'))
  await switchRole(page, 'secretary')
  await expect(page.getByTestId('appeal-opinion-secretary')).toContainText('ความเห็นประกอบการพิจารณาส่งเสนอคณะกรรมการ')
  await at(['node:09B:WIT0918', 'edge:09B:E9B12'], 'รองเลขาธิการกลั่นกรองแล้ว รอเลขาธิการให้ความเห็นส่งเสนอคณะกรรมการ')
  await giveOpinion(page, null, 'รับทราบ ส่งเสนอคณะกรรมการ', 'ฝ่ายเลขานุการคณะกรรมการ')
  await switchRole(page, 'committee')
  await at(['node:09B:WIT0919', 'edge:09B:E9B13'], 'เลขาธิการส่งเสนอคณะกรรมการแล้ว รอฝ่ายเลขานุการบรรจุระเบียบวาระ')
  await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
  await page.getByTestId('appeal-agenda-submit').click()
  await confirmDialog(page, 'ยืนยันบรรจุวาระ', 'คณะกรรมการ ป.ป.ท. วินิจฉัย')
  await at(['node:09B:WIT0920', 'edge:09B:E9B14'], 'บรรจุวาระแล้ว รอคณะกรรมการวินิจฉัยบันทึกมติ')
}
async function resolve(page: Page, outcome: 'uphold' | 'overturn') {
  await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
  await page.getByTestId('appeal-resolution-note').fill('พิจารณาแล้ว')
  await page.getByTestId(`appeal-resolution-${outcome}`).click()
  await confirmDialog(page, outcome === 'uphold' ? 'ยืนยันมติยกคำร้อง' : 'ยืนยันมติเปลี่ยนแปลงคำสั่ง')
}
async function recordNotice(page: Page, registry: string, expected: string, cap?: { keys: string[]; label: string }) {
  await switchAccount(page, 'officer')
  await expect(page.getByTestId('appeal-notice-form')).toBeVisible()
  await page.getByTestId('appeal-notice-document').fill(`หนังสือแจ้งผลอุทธรณ์_${registry.replace('/', '-')}.pdf`)
  await page.getByTestId('appeal-notice-registry').fill(registry)
  await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
  if (cap) await snap(page, cap.keys, { label: cap.label })
  await page.getByTestId('appeal-notice-submit').click()
  await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', expected)
  await expect(page.getByTestId('appeal-notice-done')).toBeVisible()
}

test.describe('09B · รับอุทธรณ์ กลั่นกรอง เสนอคณะกรรมการ', () => {
  test('09B ครบเส้น (ยกคำร้อง): รับอุทธรณ์ → 6 ชั้น (ผ่านธุรการ) → มติ → หนังสือแจ้งผล', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 4.1', 'officer')

    await test.step('WIT0911 · เปิดหน้ารับคำอุทธรณ์จาก /appeal', async () => {
      await page.goto('/appeal')
      await snap(page, ['node:09B:WIT0911'], { label: 'รายการงานอุทธรณ์ มีแฟ้มพยานแจ้งความประสงค์อุทธรณ์ รอกด รับคำอุทธรณ์' })
      await page.getByRole('row').filter({ hasText: CASE_NO }).getByRole('link', { name: 'รับคำอุทธรณ์', exact: true }).click()
      await expect(page).toHaveURL(FOLDER)
      await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
      await snap(page, ['node:09B:WIT0912', 'edge:09B:E9B01'], { label: 'เปิดแฟ้มรับอุทธรณ์ ฟอร์มรับเอกสารคำอุทธรณ์ยังว่าง' })
    })
    await test.step('WIT0912 · รับเอกสาร (ต้องมีเลขรับ/ไฟล์/เหตุผล) → ยืนยัน', async () => {
      await page.getByTestId('appeal-intake-submit').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('appeal-intake-channel-letter').click()
      await page.getByTestId('appeal-intake-document-source').selectOption('agency_form')
      await page.getByTestId('appeal-intake-registry-no').fill('512/2569')
      await page.getByTestId('appeal-intake-evidence-file').setInputFiles(pdf('คำอุทธรณ์.pdf'))
      await page.getByTestId('appeal-intake-reason').fill('มีหลักฐานเพิ่มเติมประกอบการขอคุ้มครอง')
      await snap(page, ['node:09B:WIT0913'], { label: 'กรอกเลขรับ แนบเอกสาร และเหตุผลคำอุทธรณ์แล้ว รอยืนยันรับ (ระบบจะผูกกับแฟ้มเดิม)' })
      await page.getByTestId('appeal-intake-submit').click()
      await confirmDialog(page, 'ยืนยัน')
      await expect.poll(async () => (await caseOf(page)).appealFolder?.stage).toBe('received')
      await snap(page, ['edge:09B:E9B02'], { label: 'รับคำอุทธรณ์แล้ว ระบบผูกคำอุทธรณ์กับ คบ.10 และคำสั่งเดิมในแฟ้มเดิม' })
    })
    await test.step('WIT0913 · ผูกกับแฟ้มเดิม (ไม่สร้างแฟ้มใหม่ ไม่เปลี่ยนเจ้าของ)', async () => {
      const c = await caseOf(page)
      expect(c.appealFolder.intake.registryNo).toBe('512/2569')
      expect(c.appealAgainst).toBe('kb10')
      await expect(page.getByTestId('appeal-intake-summary')).toContainText('512/2569')
    })
    await test.step('WIT0914 → WIT0919 · ตรวจครบถ้วน → เจ้าหน้าที่ → ผบช. → ผอ. (ธุรการ) → รองเลขาธิการ → เลขาธิการ → บรรจุวาระ', async () => {
      await walkToAgenda(page, true)
      const f = (await caseOf(page)).appealFolder
      expect(f.officerOpinion.note).toBeTruthy()
      expect(f.supervisorOpinion.note).toBeTruthy()
      expect(f.directorOpinion.note).toBeTruthy()
      expect(f.deputyOpinion.note).toBeTruthy()
      expect(f.secretaryOpinion.note).toBeTruthy()
      expect(f.stage).toBe('agenda')
      expect(f.agendaAt).toBeTruthy()
    })
    await test.step('WIT0920 ◇ ยกคำร้อง (ยกเลิกในจอยืนยันก่อน) → WIT0934 ธุรการขาลง', async () => {
      await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
      await page.getByTestId('appeal-resolution-note').fill('ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม')
      await page.getByTestId('appeal-resolution-uphold').click()
      await cancelDialog(page)
      expect((await caseOf(page)).appealResolution).toBeFalsy()
      await page.getByTestId('appeal-resolution-uphold').click()
      await confirmDialog(page, 'ยืนยันมติยกคำร้อง', 'เป็นที่สุด')
      await snap(page, ['node:09B:WIT0934', 'edge:09B:E9B15'], { label: 'คณะกรรมการมีมติยกคำร้องแล้ว ผลกลับหน่วย รอธุรการ สลธ.ออกเลขส่ง ลงเลขรับ (หน่วย)', role: 'secretary_receiver', route: `/saraban/${encodeURIComponent(CASE_NO)}` })
      await clerks(page, ['secretary_receiver', 'receiver'])
      await snap(page, ['edge:09B:E9B16'], { label: 'ธุรการรับผลมติกลับหน่วยแล้ว รอเจ้าหน้าที่บันทึกหนังสือแจ้งผลยกคำร้อง', route: FOLDER, role: 'officer' })
      const c = await caseOf(page)
      expect(c.appealResolution.outcome).toBe('uphold')
      expect(c.appealFolder.stage).toBe('resolved')
      expect(c.appealResolution.noticeRecordedAt).toBeFalsy()
    })
    await test.step('WIT0921 · หนังสือแจ้งผลอุทธรณ์ + หลักฐานรับ ปิดขั้นอุทธรณ์', async () => {
      await recordNotice(page, 'ปปท 0007/1234', 'ปิดขั้นอุทธรณ์', { keys: ['node:09B:WIT0921'], label: 'กรอกหนังสือแจ้งผลยกคำร้องและหลักฐานรับแล้ว รอยืนยันปิดขั้นอุทธรณ์' })
      expect((await caseOf(page)).appealResolution.noticeRecordedAt).toBeTruthy()
    })
  })

  test('09B ยื่นช้า: WIT0914 บันทึกเหตุผลความล่าช้า → WIT0931 ผบช. รับไว้พิจารณา (ไม่ปัดตก)', async ({ page }) => {
    await seedMockState(page, 'Case 4.2', 'officer', {
      deliveredAt: new Date(Date.now() - 40 * 86400000).toISOString(),
      appealDueAt: new Date(Date.now() - 10 * 86400000).toISOString(),
      appealFiledAt: new Date().toISOString(),
    })
    await page.goto(FOLDER)
    await expect(page.getByTestId('appeal-late-reason')).toBeVisible()
    await page.getByTestId('appeal-check-submit').click()
    await expect(popup(page)).toHaveCount(0)
    await page.getByTestId('appeal-late-reason').fill('พยานเจ็บป่วยเข้ารักษาตัวในโรงพยาบาล')
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันบันทึกเหตุผลและเสนอ', 'ไม่ปัดตกอัตโนมัติ')
    const f = (await caseOf(page)).appealFolder
    expect(f.stage).toBe('late_pending')
    expect(f.lateDays).toBeGreaterThan(0)
    await page.goto('/appeal')
    await expect(page.getByTestId('appeal-late-group')).toContainText(CASE_NO)

    await switchRole(page, 'supervisor')
    await page.goto(FOLDER)
    await snap(page, ['node:09B:WIT0931', 'edge:09B:E9B06'], { label: 'ยื่นเกินกำหนด เจ้าหน้าที่บันทึกเหตุผลแล้ว รอ ผบช.ชั้นต้นรับไว้พิจารณา' })
    await page.getByTestId('appeal-late-accept-submit').click()
    await expect(popup(page)).toHaveCount(0)
    await page.getByTestId('appeal-late-accept-note').fill('รับไว้พิจารณา ให้คณะกรรมการตัดสิน')
    await page.getByTestId('appeal-late-accept-submit').click()
    await confirmDialog(page, 'ยืนยันรับเรื่องไว้พิจารณา')
    expect((await caseOf(page)).appealFolder.stage).toBe('officer_opinion')
    await snap(page, ['edge:09B:E9B07'], { label: 'ผบช.ชั้นต้นรับเรื่องที่ยื่นเกินกำหนดไว้พิจารณา กลับให้เจ้าหน้าที่บันทึกความเห็น', role: 'officer', route: FOLDER })
  })

  test('09B เปลี่ยนคำสั่ง: WIT0920 เปลี่ยนแปลงคำสั่ง → 0934 ธุรการขาลง → 0922 หนังสือแจ้งผล → 0935 คบ.6 v2', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 4.3', 'committee')
    await page.goto(FOLDER)
    await resolve(page, 'overturn')
    await clerks(page, ['secretary_receiver', 'receiver'])
    const c = await caseOf(page)
    expect(c.appealResolution.outcome).toBe('overturn')
    expect(c.appealKb6Version).toBeTruthy()
    expect(c.stage).toBe('staff_review')
    await recordNotice(page, 'ปปท 0008/2222', 'คบ.6', { keys: ['node:09B:WIT0922', 'edge:09B:E9B17'], label: 'ธุรการรับมติเปลี่ยนคำสั่งกลับหน่วยแล้ว กรอกหนังสือแจ้งผลอุทธรณ์ รอยืนยัน' })
    const link = page.getByRole('link', { name: /เปิด คบ\.6 v\d/ })
    await expect(link).toBeVisible()
    await snap(page, ['node:09B:WIT0935', 'edge:09B:E9B18'], { label: 'แจ้งผลเปลี่ยนคำสั่งแล้ว รอจัดทำ คบ.6 v2 ตามมติ (ไม่สร้าง คบ.1 ใหม่)' })
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/form/6\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
    await snap(page, ['overview:09B>05'], { label: 'เปิด คบ.6 v2 ตามมติอุทธรณ์ เข้าขั้นพิจารณาใหม่ (แท็บ 05)' })
  })
})
