import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * FB-022 — รายงานประจำเดือน: ถ้า ป.ป.ท. ไม่ได้คุ้มครองเอง ไม่ใช้ คบ.13 (ใช้เฉพาะกรณี ป.ป.ท. คุ้มครองเอง)
 * ให้ใช้หนังสือที่ได้รับจากหน่วยงานที่ให้ความคุ้มครองแทน (ประชุม 14 ต.ค. 2569 · confirmed)
 *
 * - เปิดรอบที่แท็บ 10 เลือกแบบรายงาน = "หนังสือรายงานจากหน่วยงานภายนอก"
 * - บันทึกรับหนังสือ (หน่วยงาน เลขที่/ลงวันที่ วันที่รับ/เลขรับ + ไฟล์) แทนการจัดทำ คบ.13 และไม่ต้องลงนาม WIT1006/1007
 * - ตรวจรับ → บันทึกสถานะ → ล็อก → ส่งทบทวน 11A เดินแบบเดิม
 * - รอบ คบ.13 (ป.ป.ท. คุ้มครองเอง) ยังต้องลงนามครบสองช่องก่อนตรวจรับเหมือนเดิม
 *
 * หมายเหตุ: sheet08b TC-088 (หน่วยงานผู้รับส่ง คบ.13 จากการ์ดในแฟ้ม) ยังคงไว้ตามเดิม
 * เพราะเจ้าหน้าที่เป็นผู้เลือกแบบรายงานของแต่ละรอบเอง กรณีตาม FB-022 ตรวจที่ไฟล์นี้
 */

const CASE_NO = '0501/2569'
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const AGENCY = 'สถานีตำรวจภูธรเมืองนนทบุรี'
const LETTER_NO = 'นบ 0019.1/1234'
const FILE_NAME = 'หนังสือรายงานผล-ตุลาคม.pdf'

const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const startedAt = daysAgoIso(40)

/** งวดเดือนปัจจุบันรูปแบบเดียวกับ currentReportPeriod() — 'MM/พ.ศ.' ตามเวลาไทย */
const currentPeriod = () => {
  const [y, m] = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).split('-').map(Number)
  return `${String(m).padStart(2, '0')}/${y + 543}`
}

/** วิธีที่ 1 เริ่มปฏิบัติจริงแล้ว 40 วัน ยังไม่มีรอบรายงาน */
const ACTIVE = {
  monthlyReports: [],
  reviewHandoff: undefined,
  episode: { id: 'EP-FB022', openedAt: startedAt, phases: [{ id: 'PH-FB022', kind: 'MAIN', startedAt, orderRef: 'คบ.8' }] },
  methodTracks: [{ method: 1, status: 'active', startedAt }],
  approvedMethods: [1],
}

const LETTER = {
  agency: AGENCY,
  letterNo: LETTER_NO,
  letterDate: '2026-10-05',
  receivedAt: '2026-10-08',
  receiveNo: 'รับ 5678/2569',
  documentName: FILE_NAME,
  documentUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
  recordedAt: '08/10/2569 10:00',
  recordedBy: 'นางสาวอรุณี ใจมั่น',
}

const baseRound = (overrides: Record<string, unknown> = {}) => ({
  id: 'RPT-FB022',
  period: currentPeriod(),
  periodFrom: '2026-09-10',
  periodTo: '2026-10-09',
  submittedAt: '08/10/2569 10:00',
  submittedBy: 'นางสาวอรุณี ใจมั่น',
  summary: '',
  incidentCount: 0,
  evidenceRefs: [],
  ...overrides,
})

async function confirmSwal(page: Page, expectedText: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: 'ยืนยัน', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

test.describe('FB-022 — รายงานประจำเดือนด้วยหนังสือจากหน่วยงานภายนอกแทน คบ.13', () => {
  test('FB-022-A · [Happy] เปิดรอบแบบหนังสือภายนอก บันทึกรับ ตรวจรับ ล็อก และส่งทบทวนโดยไม่ต้องลงนาม', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', ACTIVE)
    await page.goto(MONITOR_URL)

    // WIT1004 — เลือกแบบรายงานตอนเปิดรอบ (ค่าเริ่มต้นยังเป็น คบ.13)
    await page.getByRole('button', { name: /^เปิดรอบรายงานงวด/ }).first().click()
    await expect(page.getByRole('radio', { name: /^คบ\.13/ })).toBeChecked()
    await page.getByRole('radio', { name: /หนังสือรายงานจากหน่วยงานภายนอก/ }).check()
    await page
      .locator('div.fixed.inset-0', { hasText: 'แบบรายงานของรอบนี้' })
      .getByRole('button', { name: /เปิดรอบรายงานงวด/ })
      .click()

    // WIT1005 — บันทึกรับหนังสือแทนการจัดทำ คบ.13
    await page.getByLabel('หน่วยงานผู้ส่ง').fill(AGENCY)
    await page.getByLabel('เลขที่หนังสือ').fill(LETTER_NO)
    await page.getByLabel('เลขรับ').fill('รับ 5678/2569')
    await page.getByLabel('ไฟล์หนังสือ').setInputFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
    await page.getByRole('button', { name: /บันทึกรับหนังสือ/ }).click()
    await expect(page.getByText(FILE_NAME).first()).toBeVisible()

    // ขั้นลงนามแสดงว่าไม่ต้องลงนาม
    await expect(page.getByText(/ไม่ต้องลงนาม · หนังสือภายนอก/).first()).toBeVisible()

    let saved = await readCase(page, CASE_NO)
    let round = saved.monthlyReports.at(-1)
    expect(round.source).toBe('external')
    expect(round.externalLetter).toMatchObject({ agency: AGENCY, letterNo: LETTER_NO, receiveNo: 'รับ 5678/2569', documentName: FILE_NAME })
    expect(round.officerSignedAt).toBeUndefined()
    expect(round.witnessSignedAt).toBeUndefined()

    // WIT1008 — ตรวจรับได้ทันทีโดยไม่ต้องลงนาม เห็นรายละเอียดหนังสือในโมดัล
    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByText(`หน่วยงาน: ${AGENCY}`)).toBeVisible()
    await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
    await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()

    // WIT1009 / WIT1010
    await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
    await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ไม่พบปัญหา')
    await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('คงมาตรการเดิม')
    await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
    await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
    await confirmSwal(page, 'ล็อกหนังสือที่รับไว้')
    await expect.poll(async () => (await readCase(page, CASE_NO)).monthlyReports.at(-1).lockedAt).toBeTruthy()
    await page.keyboard.press('Escape')

    // WIT1011 → WIT1013 — ส่งทบทวน 11A โดยอ้างหนังสือภายนอกเป็นรายงานของรอบ
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await expect(page.getByText(/ส่งหนังสือรายงานจากหน่วยงานภายนอกล่าสุด/)).toBeVisible()
    await page.getByLabel('เหตุผลที่ต้องทบทวน').fill('หน่วยงานรายงานภัยคุกคามเพิ่มขึ้น')
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmSwal(page, 'หนังสือรายงานจากหน่วยงานภายนอก')

    await expect.poll(async () => (await readCase(page, CASE_NO)).reviewHandoff?.reportSource).toBe('external')
    saved = await readCase(page, CASE_NO)
    round = saved.monthlyReports.at(-1)
    expect(saved.reviewHandoff.reportId).toBe(round.id)
  })

  test('FB-022-B · [Negative] รอบหนังสือภายนอกตรวจรับไม่ได้จนกว่าจะบันทึกรับหนังสือพร้อมไฟล์', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...ACTIVE,
      monthlyReports: [baseRound({ source: 'external' })],
    })
    await page.goto(MONITOR_URL)

    // ปุ่มตรวจรับในรายการรอบกดไม่ได้ก่อนบันทึกหนังสือ
    await expect(page.getByText('ยังไม่ได้บันทึกรับหนังสือ').first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'ตรวจรับรายงาน' })).toBeDisabled()

    // กดบันทึกโดยไม่กรอก ต้องเห็นข้อความเตือนติด field และไม่บันทึกลงแฟ้ม
    await page.getByRole('button', { name: /บันทึกรับหนังสือ/ }).click()
    await expect(page.getByText('กรุณาระบุหน่วยงานผู้ส่ง')).toBeVisible()
    await expect(page.getByText('กรุณาระบุเลขที่หนังสือ')).toBeVisible()
    await expect(page.getByText('กรุณาแนบไฟล์หนังสือ')).toBeVisible()
    expect((await readCase(page, CASE_NO)).monthlyReports[0].externalLetter).toBeUndefined()

    // กรอกครบแล้วจึงตรวจรับได้
    await page.getByLabel('หน่วยงานผู้ส่ง').fill(AGENCY)
    await page.getByLabel('เลขที่หนังสือ').fill(LETTER_NO)
    await page.getByLabel('ไฟล์หนังสือ').setInputFiles({ name: FILE_NAME, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 test') })
    await page.getByRole('button', { name: /บันทึกรับหนังสือ/ }).click()
    await expect(page.getByRole('button', { name: 'ตรวจรับรายงาน' })).toBeEnabled()
  })

  test('FB-022-C · [Regression] รอบ คบ.13 (ป.ป.ท. คุ้มครองเอง) ยังต้องลงนามครบสองช่องก่อนตรวจรับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...ACTIVE,
      monthlyReports: [
        baseRound({
          summary: 'ผลปฏิบัติเป็นไปตามแผน',
          orderRef: 'คบ.8',
          orderDays: 30,
          operators: 'นางสาวอรุณี ใจมั่น',
          methods: [1],
          officerSignedAt: '08/10/2569 10:30',
          officerSignedBy: 'นางสาวอรุณี ใจมั่น',
        }),
      ],
    })
    await page.goto(MONITOR_URL)

    // ไม่มีแบบฟอร์มบันทึกรับหนังสือในรอบ คบ.13
    await expect(page.getByLabel('หน่วยงานผู้ส่ง')).toHaveCount(0)

    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByRole('button', { name: /รอลงนามครบทั้งสองช่องก่อน/ })).toBeDisabled()

    const round = (await readCase(page, CASE_NO)).monthlyReports[0]
    expect(round.source ?? 'kb13').toBe('kb13')
    expect(round.reviewedAt).toBeUndefined()
  })

  test('FB-022-D · [Display] หน้าระยะเวลา แฟ้มคดี และสถิติแสดงว่ารอบเดือนนี้ใช้หนังสือภายนอก', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...ACTIVE,
      monthlyReports: [
        baseRound({
          source: 'external',
          externalLetter: LETTER,
          summary: `หนังสือ ${AGENCY} ที่ ${LETTER_NO}`,
          reviewedAt: '08/10/2569 11:00',
          reviewedBy: 'นางสาวอรุณี ใจมั่น',
          riskLevel: 'ต่ำ',
          lockedAt: '08/10/2569 11:05',
        }),
      ],
    })

    // หน้าระยะเวลาคุ้มครอง — คอลัมน์แบบรายงานและลิงก์ไฟล์หนังสือ
    await page.goto(`/protection-duration?caseNo=${CASE_NO}`)
    const monthly = page.getByRole('region', { name: 'รายงานการคุ้มครองพยานรายเดือน' })
    await expect(monthly.getByRole('columnheader', { name: 'แบบรายงาน' })).toBeVisible()
    await expect(monthly.getByText('หนังสือรายงานจากหน่วยงานภายนอก').first()).toBeVisible()
    await expect(monthly.getByRole('link', { name: FILE_NAME })).toBeVisible()

    // แฟ้มคดี — ประวัติรอบรายงานแสดงแบบรายงานและรายละเอียดหนังสือแทนสถานะลงนาม
    await page.goto(`/dossier/${encodeURIComponent(CASE_NO)}`)
    await page.getByRole('button', { name: /รอบรายงาน \(1\)/ }).click()
    await expect(page.getByText('หนังสือรายงานจากหน่วยงานภายนอก').first()).toBeVisible()
    await expect(page.getByText(AGENCY).first()).toBeVisible()
    await expect(page.getByRole('link', { name: new RegExp(FILE_NAME) }).first()).toBeVisible()

    // หน้ารายงานและสถิติ — นับเป็น "ได้รับหนังสือภายนอกแล้ว" ไม่ใช่ คบ.13 หรือค้างรายงาน
    await page.goto('/reports')
    const card = page.locator('.ws-card', { hasText: 'การรายงานผลประจำเดือน (เดือนนี้)' })
    await expect(card.locator('div', { hasText: /^ได้รับหนังสือภายนอกแล้ว/ }).filter({ hasText: /^ได้รับหนังสือภายนอกแล้ว\s*1/ }).first()).toBeVisible()
    await expect(card.locator('div', { hasText: /^ได้รับ คบ\.13 แล้ว\s*0/ }).first()).toBeVisible()
  })
})
