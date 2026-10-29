import { expect, test, type Page } from '@playwright/test'
import { loadMockState, readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { CASE_NO, DOSSIER_URL, confirmDialog, formRow, signInModal } from '../journeys/journey-helpers'
import { snap } from '../helpers/snapshot'
import { deriveEpisode, remainingDays, summarizeEpisode } from '../../src/lib/episode'

/**
 * เส้นทางตามผังแท็บ 10 / 11A / 11B ที่ตรวจกับโค้ดปัจจุบัน (fragments: 10, 11A, 11B)
 *
 * แท็บ 10  (รายงานผลการคุ้มครอง คบ.13)
 *   T10-A  WIT1001-1003, 1006, 1007, 1008-1011, 1012  ลงนามสองช่อง -> ตรวจรับ -> สถานะ -> ล็อก -> ตั้งรอบถัดไป
 *   T10-B  WIT1004, 1005                               เปิดรอบและจัดทำ คบ.13
 *   T10-C  WIT1007, 1008                               พยานลงนามก่อนเจ้าหน้าที่ไม่ได้ / ตรวจรับไม่ได้จนลงนามครบ
 *   T10-D  WIT1014                                     ผลปฏิบัติไม่ตรงวิธีที่อนุมัติ ต้องบันทึกประเด็น
 *   T10-E  WIT1015, 1011, 1013                         เหลือ <= 7 วันก่อนเพดาน บล็อกแขนงคุ้มครองต่อ ต้องส่งทบทวน
 *   T10-F  WIT1011, 1013                               เลือก "ต้องทบทวน" ส่งทบทวน
 * แท็บ 11A (ปัจจุบันไม่มีหน้า /protection-review — ทำที่โมดัลประเมินและ /protection-duration)
 *   T11A-A WIT1101, 1102, 1103, 1107, 1109, 1110, 1111, 1149  สรุปข้อมูลและรายการแนวทางในโมดัล
 *   T11A-B WIT1190, 1109                               ป็อปอัปเตือนทบทวน -> ขอขยายเวลา
 *   T11A-C WIT1103, 1149                               ครบเพดาน: ปิดขยายเวลา เหลือส่งต่อข้อ 14
 *   T11A-D WIT1108, 1111                               คุ้มครองต่อ -> เปิดรอบใหม่ / ปุ่มยุติ
 * แท็บ 11B (ขยายเวลา คบ.14)
 *   T11B-A WIT1112-1116, 1192, 1117, 1118, 1120, 1195, 1197, 1121, 1122, 1196, 1198  อนุมัติครบลำดับชั้น
 *   T11B-B WIT1118 -> 1119                             ผบช.ชั้นต้นส่งคืน เจ้าหน้าที่แก้เป็นเวอร์ชัน 2
 *   T11B-C WIT1194, 1197, 1121, 1123, 1196, 1198       รอบที่มี คบ.6 แนบ: ลงนาม คบ.6 ก่อนส่ง แล้วไม่อนุมัติ
 *   T11B-D WIT1116, 1150                               ครบเพดาน / ส่งเกินเพดานไม่ได้
 *   T11B-E WIT1191, 1198, 1122                         รับทราบผลอนุมัติ แล้วเริ่มรอบถัดไป
 *   T11B-F WIT1193, 1192                               แฟ้มส่งต่อ กอท. เข้าคิว ผบช.ต้น กอท. -> ผอ. กอท.
 */

const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const DURATION_URL = `/protection-duration?caseNo=${CASE_NO}`
const EXT_URL = `/protection-extension/${encodeURIComponent(CASE_NO)}`
type Rec = Record<string, any>

const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const daysAheadIso = (n: number) => daysAgoIso(-n)

/**
 * Episode วิธีที่ 1 เดียว Phase MAIN เปิดต่อเนื่องมา ให้ "วันคงเหลือก่อนเพดานรวม 6 เดือนปฏิทิน" = remaining วันพอดี
 * (เพดานคำนวณจากวันเริ่มจริงตามปฏิทิน ไม่ใช่ 180 วันตายตัว จึงเลือกวันเริ่ม (startedAt) ที่ให้ remainingDays ของแอปเท่ากับค่าที่ต้องการแบบ exact
 * แล้ว seed เป็นวันที่ชัดเจน — ถ้าไม่มีวันเริ่มใดให้ค่านั้นพอดีให้ fail ทันที ไม่ปัดเป็นค่าใกล้เคียง)
 */
function episodeStartingAt(startedAt: string, idSuffix: string) {
  return { id: `EP-${idSuffix}`, openedAt: startedAt, phases: [{ id: `PH-${idSuffix}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.8' }] }
}
function activeEpisode(remaining: number, idSuffix: string) {
  for (let c = 0; c <= 260; c++) {
    const startedAt = daysAgoIso(c)
    if (remainingDays(episodeStartingAt(startedAt, idSuffix) as never) === remaining) {
      return {
        episode: episodeStartingAt(startedAt, idSuffix),
        methodTracks: [{ method: 1 as const, status: 'active' as const, startedAt }],
        approvedMethods: [1 as const],
      }
    }
  }
  throw new Error(`ไม่มีวันเริ่มที่ทำให้ remainingDays = ${remaining} ภายใน 260 วันย้อนหลัง`)
}
/** ตัวเลขที่หน้าจอควรแสดง คำนวณจาก helper ของแอป (episode.ts) ด้วย Episode เดียวกับที่ seed */
const figuresOf = (episode: unknown) => summarizeEpisode(episode as never)
const figuresOfCase = (c: Rec | undefined) => summarizeEpisode(deriveEpisode(c as never))

/** จับ snapshot สำหรับปุ่ม "เล่นจากจุดนี้" ในหน้า /flow-chart (no-op ถ้าไม่ได้รัน FLOW_SNAPSHOTS=1) */
const S = (page: Page, keys: string | string[], label: string, opts: { route?: string; role?: string } = {}) => snap(page, keys, { label, ...opts })

/** รอบรายงานลงนามครบสองช่อง จัดทำแล้ว — จุดตั้งต้นของ WIT1008 */
const fullySignedRound = (overrides: Rec = {}) => ({
  id: 'RPT-FP', period: '09/2569', periodFrom: '2026-08-11', periodTo: '2026-09-10',
  submittedAt: '10/09/2569 12:24', submittedBy: 'นางสาวอรุณี ใจมั่น',
  summary: 'ผลปฏิบัติงวด 09/2569 เป็นไปตามแผน ไม่มีเหตุการณ์ผิดปกติ', incidentCount: 0, evidenceRefs: [],
  orderRef: 'คบ.8', orderDays: 30, operators: 'นางสาวอรุณี ใจมั่น', methods: [1],
  officerSignedAt: '10/09/2569 12:32', officerSignedBy: 'นางสาวอรุณี ใจมั่น',
  witnessSignedAt: '10/09/2569 12:32', witnessSignedBy: 'สมชาย ใจดี',
  ...overrides,
})
const lockedRound = (overrides: Rec = {}) =>
  fullySignedRound({ reviewedAt: '10/09/2569 12:36', reviewedBy: 'นางสาวอรุณี ใจมั่น', riskLevel: 'ต่ำ', issues: 'ไม่พบปัญหา', nextProposal: 'คงมาตรการเดิม', lockedAt: '10/09/2569 12:46', ...overrides })

/** กดหมุดในแถบ "ความคืบหน้ารอบรายงานนี้" เพื่อกลับไปดูการ์ดของขั้นนั้น */
const stepperPin = (page: Page, label: string) => page.getByRole('listitem').filter({ hasText: label }).getByRole('button')

test.describe('แท็บ 10 · ติดตามและรายงานผล (คบ.13)', () => {
  test('T10-A · ลงนามสองช่อง -> ตรวจรับ -> บันทึกสถานะ -> ล็อกรอบ -> ตั้งรอบถัดไปและเปิดรอบใหม่ (WIT1001-1013 แขนง 1012)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.13', 'officer')

    await test.step('WIT1001-1003 · Episode, วันสะสม, รอบและเพดาน', async () => {
      await page.goto(MONITOR_URL)
      await S(page, 'node:10:WIT1001', 'เปิดหน้าติดตามผลการคุ้มครอง (Episode MAIN) ยังไม่ได้ดูรายละเอียด')
      await stepperPin(page, 'รับ Episode เดียว (TEMPORARY/MAIN)').click()
      await expect(page.getByText('Phase ปัจจุบัน', { exact: true })).toBeVisible()
      const fig = figuresOfCase(await readCase(page, CASE_NO))
      await expect(page.getByText(`${fig.remaining} จาก ${fig.cap} วัน`, { exact: true })).toBeVisible()
      await expect(page.getByText(`${fig.cumulative} วัน`, { exact: true })).toBeVisible()
      await S(page, ['node:10:WIT1002', 'edge:10:E001'], 'เห็น Phase ปัจจุบัน วันเริ่มจริง วันสะสม')
      await stepperPin(page, 'แจ้งรอบ คบ.13 และตรวจเพดานรวม').click()
      await expect(page.getByRole('button', { name: 'ตั้งรอบแจ้งเตือน' })).toBeVisible()
      await expect(page.getByText('รอบรายงานและเพดานระยะเวลา', { exact: true })).toBeVisible()
      await S(page, ['node:10:WIT1003', 'edge:10:E002'], 'เห็นการแจ้งรอบ คบ.13 และตรวจเพดานรวม')
    })

    await test.step('WIT1006 · เจ้าหน้าที่ลงนามช่องที่ 1 ที่แถว คบ.13 ในแฟ้ม', async () => {
      await page.goto(DOSSIER_URL)
      await formRow(page, 'คบ.13').getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
      await signInModal(page)
      await expect.poll(async () => ((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0].officerSignedAt).toBeTruthy()
      await S(page, ['node:10:WIT1007', 'edge:10:E006'], 'เจ้าหน้าที่ลงนามช่องที่ 1 แล้ว รอพยานลงนามช่องที่ 2', { route: DOSSIER_URL })
    })

    await test.step('WIT1007 · พยานลงนามช่องที่ 2 (ผ่านบัญชีเจ้าหน้าที่) โมดัลปิดเองเมื่อครบ', async () => {
      await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
      await signInModal(page, 'สมชาย ใจดี')
      await expect.poll(async () => ((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0].witnessSignedAt).toBeTruthy()
      await expect(page.getByTestId('signature-confirm-button')).toHaveCount(0)
    })

    await test.step('WIT1008 · ตรวจรับรายงานและตรวจผล', async () => {
      await page.goto(MONITOR_URL)
      await S(page, ['node:10:WIT1008', 'edge:10:E007'], 'คบ.13 ลงนามครบสองช่อง รอตรวจรับรายงาน')
      await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
      await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
      await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()
      await S(page, ['node:10:WIT1009', 'edge:10:E010'], 'ตรวจรับรายงานแล้ว (ผลตรงวิธีที่อนุมัติ) รอบันทึกสถานะล่าสุด')
    })

    await test.step('WIT1009 · บันทึกสถานะล่าสุด', async () => {
      await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
      await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ไม่พบปัญหา')
      await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('คงมาตรการเดิมต่อเนื่อง')
      await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
      await expect(page.getByText(/บันทึกสถานะล่าสุดแล้ว/)).toBeVisible()
      await S(page, ['node:10:WIT1010', 'edge:10:E011'], 'บันทึกสถานะล่าสุดแล้ว รอล็อกเป็นรอบรายงานใหม่')
    })

    await test.step('WIT1010 · ล็อกเป็นรอบรายงานใหม่', async () => {
      await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')
      await expect.poll(async () => ((await readCase(page, CASE_NO))?.monthlyReports as Rec[])[0].lockedAt).toBeTruthy()
    })

    await test.step('WIT1011 -> WIT1012 · ประเมิน เลือกยังคุ้มครองต่อ ตั้งรอบถัดไปและเปิดรอบใหม่', async () => {
      await page.getByRole('button', { name: 'ประเมิน' }).click()
      await S(page, ['node:10:WIT1011', 'edge:10:E012'], 'ล็อกรอบแล้ว เปิดโมดัลประเมินว่าใกล้ครบกำหนดหรือต้องทบทวน')
      await page.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' }).click()
      await S(page, ['node:10:WIT1012', 'edge:10:E014'], 'เลือกแขนง ยังคุ้มครองต่อ รอตั้งรอบถัดไป')
      await page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' }).click()
      await confirmDialog(page, 'ยืนยัน', 'เปิดรอบรายงานใหม่')
      const after = (await readCase(page, CASE_NO)) as Rec
      expect(after.monthlyReports).toHaveLength(2)
      expect(after.monthlyReports[1].lockedAt).toBeFalsy()
      expect(after.nextReportDueAt).toBeTruthy()
    })
  })

  test('T10-B · เปิดรอบรายงานพร้อมหลักฐาน แล้วจัดทำ คบ.13 (WIT1004, WIT1005)', async ({ page }) => {
    await seedMockState(page, 'Edge 10→11A', 'officer')
    await page.goto(MONITOR_URL)

    await page.getByRole('button', { name: /เปิดรอบรายงานงวด/ }).click()
    await expect(page.getByLabel(/หลักฐาน\/บันทึกที่รวบรวมได้/)).toBeVisible()
    await S(page, ['node:10:WIT1004', 'edge:10:E003'], 'ถึงรอบรายงาน เปิดฟอร์มเปิดรอบและแนบหลักฐาน (ยังไม่ได้กรอก)')
    await page.getByLabel(/หลักฐาน\/บันทึกที่รวบรวมได้/).fill('รายงานหน่วยงานภายนอก 12/10/2569')
    await page.locator('button.w-full').filter({ hasText: 'เปิดรอบรายงานงวด' }).click()
    await expect.poll(async () => (((await readCase(page, CASE_NO)) as Rec).monthlyReports as Rec[]).length).toBe(2)

    await expect(page.getByLabel('สรุปผลการดำเนินการ')).toBeVisible()
    await S(page, ['node:10:WIT1005', 'edge:10:E004'], 'เปิดรอบรายงานใหม่พร้อมหลักฐานแล้ว รอจัดทำ คบ.13')
    await page.getByLabel('สรุปผลการดำเนินการ').fill('ปฏิบัติตามแผนครบทุกเวร')
    await page.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' }).click()
    await expect.poll(async () => ((await readCase(page, CASE_NO)) as Rec).extraForms).toContain(13)
    await S(page, ['node:10:WIT1006', 'edge:10:E005'], 'จัดทำ คบ.13 แล้ว รอเจ้าหน้าที่ผู้ปฏิบัติลงนามที่แถว คบ.13 ในแฟ้ม', { route: DOSSIER_URL })
    const after = (await readCase(page, CASE_NO)) as Rec
    const round = after.monthlyReports[1]
    expect(round.summary).toContain('ปฏิบัติตามแผน')
    expect(round.evidenceRefs[0]).toContain('รายงานหน่วยงานภายนอก')
    expect(after.extraForms).toContain(13)
  })

  test('T10-C · พยานลงนามก่อนเจ้าหน้าที่ไม่ได้ และตรวจรับไม่ได้จนลงนามครบ (WIT1007, WIT1008)', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.13').getByRole('button', { name: 'ลงนาม' }).click()
    const signButtons = page.getByRole('button', { name: 'ลงลายมือชื่อ' })
    await expect(signButtons).toHaveCount(2)
    await expect(signButtons.nth(1)).toBeDisabled()

    await page.goto(MONITOR_URL)
    await expect(page.getByText('รอเจ้าหน้าที่ผู้ปฏิบัติลงนามก่อน')).toBeVisible()
    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByRole('button', { name: 'รอลงนามครบทั้งสองช่องก่อน' })).toBeDisabled()
    expect((((await readCase(page, CASE_NO)) as Rec).monthlyReports as Rec[])[0].reviewedAt).toBeFalsy()
  })

  test('T10-D · ผลปฏิบัติไม่ตรงวิธีที่อนุมัติ ต้องบันทึกประเด็นก่อนตรวจรับ (WIT1014)', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', { approvedMethods: [1], monthlyReports: [fullySignedRound({ methods: [1, 2] })] })
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByText(/ไม่สอดคล้องกับวิธีที่ได้รับอนุมัติ/)).toBeVisible()
    const accept = page.getByRole('button', { name: 'รับรายงานและตรวจผล' })
    await expect(accept).toBeDisabled()
    await S(page, ['node:10:WIT1014', 'edge:10:E008'], 'ตรวจรับแล้วพบผลปฏิบัติไม่ตรงวิธีที่อนุมัติ ต้องบันทึกประเด็นก่อน')
    await page.getByLabel(/บันทึกประเด็น\/เหตุสำคัญ/).fill('ปฏิบัติวิธีที่ 2 โดยไม่ได้รับอนุมัติ — เสนอทบทวน')
    await expect(accept).toBeEnabled()
    await accept.click()
    await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()
    await S(page, 'edge:10:E009', 'บันทึกประเด็นและตรวจรับแล้ว (ผลไม่ตรงวิธี) รอบันทึกสถานะล่าสุด')
    const round = (((await readCase(page, CASE_NO)) as Rec).monthlyReports as Rec[])[0]
    expect(round.reviewedAt).toBeTruthy()
    expect(round.issues).toContain('วิธีที่ 2')
  })

  test('T10-E · เหลือ ≤ 7 วันก่อนเพดาน 180 วัน: บล็อกเปิดรอบและแขนงคุ้มครองต่อ ต้องส่งทบทวน (WIT1015 -> WIT1013)', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', { ...activeEpisode(5, 'FP-E'), monthlyReports: [lockedRound()] })
    await page.goto(MONITOR_URL)

    const openRound = page.getByRole('button', { name: /เปิดรอบรายงานงวด/ })
    await expect(openRound).toBeDisabled()
    await expect(page.getByText(/เปิดรอบใหม่ตรงจากที่นี่ไม่ได้/)).toBeVisible()
    await S(page, 'node:10:WIT1015', 'เหลือ ≤ 7 วันก่อนเพดาน: ปุ่มเปิดรอบรายงานใหม่ถูกบล็อก')

    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await expect(page.getByText(/ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อนดำเนินการต่อ/)).toBeVisible()
    await S(page, 'edge:10:E013', 'เปิดโมดัลประเมิน เหลือ ≤ 7 วัน: แขนงคุ้มครองต่อถูกปิด ต้องส่งทบทวน')
    await expect(page.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' })).toHaveCount(0)

    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await S(page, 'edge:10:E016', 'เหลือ ≤ 7 วัน เลือกแขนง ต้องทบทวน (บังคับ) รอกดส่งเข้าทบทวน')
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmDialog(page, 'ยืนยัน')
    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
    expect(((await readCase(page, CASE_NO)) as Rec).reviewHandoff).toBeTruthy()
  })

  test('T10-F · ประเมินแล้วเลือก "ต้องทบทวน" ส่งทบทวน เห็นรายการแนวทางต่อ (WIT1011 -> WIT1013)', async ({ page }) => {
    await seedMockState(page, 'Edge 10→11A', 'officer')
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await S(page, ['node:10:WIT1013', 'edge:10:E015'], 'เลือกแขนง ต้องทบทวน รอกดส่งเข้าทบทวนผลการคุ้มครอง')
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmDialog(page, 'ยืนยัน')

    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
    await expect(page.getByText('แนวทางที่เลือกได้หลังผู้บังคับบัญชาเห็นชอบ')).toBeVisible()
    await S(page, 'overview:10>11A', 'ส่งทบทวนแล้ว เข้าแท็บ 11A เห็นรายการแนวทางหลังผู้บังคับบัญชาเห็นชอบ')
    const handoff = ((await readCase(page, CASE_NO)) as Rec).reviewHandoff
    expect(handoff.riskLevel).toBeTruthy()
    expect(handoff.orderRef).toBeTruthy()
    expect(handoff.cumulativeDays).toBeDefined()
    expect(handoff.remainingDays).toBeDefined()
  })
})

test.describe('แท็บ 11A · ทบทวนผลการคุ้มครองและจำแนกแนวทาง (โมดัลประเมิน + /protection-duration)', () => {
  test('T11A-A · สรุปข้อมูลและรายการแนวทางพร้อมปลายทางของแต่ละแขนง (WIT1101, 1102, 1103, 1107, 1109, 1110, 1111, 1149)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(MONITOR_URL)
    await S(page, 'node:11A:WIT1101', 'เปิดหน้าติดตามผล ได้รับงานส่งทบทวนมาจากแท็บ 10 รอเปิดโมดัลประเมิน')
    await page.getByRole('button', { name: 'ประเมิน' }).click()

    // WIT1102/1103 — สรุปคบ.13 ล่าสุด และยอดสะสมเทียบเพดาน
    await expect(page.getByText(/รอบล่าสุด งวด/)).toBeVisible()
    const fig = figuresOfCase(await readCase(page, CASE_NO))
    await expect(page.getByText(`สะสม ${fig.cumulative} วัน คงเหลือ ${fig.remaining} วัน จากเพดานรวม ${fig.cap} วัน`)).toBeVisible()
    await S(page, ['node:11A:WIT1102', 'edge:11A:E001'], 'เปิดโมดัลประเมิน เห็น คบ.13 ล่าสุด ผลประเมินความเสี่ยง คำสั่งปัจจุบัน')
    await S(page, ['node:11A:WIT1103', 'edge:11A:E003'], 'เห็นยอดสะสมและวันคงเหลือเทียบเพดานรวม 6 เดือน')
    // WIT1101 — งานที่ส่งทบทวนมาแล้ว
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()

    // WIT1107 — รายการแนวทาง และปลายทางที่แท้จริง
    await expect(page.getByText('แนวทางที่เลือกได้หลังผู้บังคับบัญชาเห็นชอบ')).toBeVisible()
    await S(page, ['node:11A:WIT1107', 'edge:11A:E004', 'node:11A:WIT1109', 'node:11A:WIT1110', 'node:11A:WIT1111'], 'ส่งทบทวนแล้ว เห็นรายการแนวทางที่ต้องดำเนินการ (ขยายเวลา/เปลี่ยนวิธี/ยุติ/ส่งต่อ)')
    await expect(page.getByRole('link', { name: /ขยายเวลา \(คบ\.14\)/ })).toHaveAttribute('href', EXT_URL)
    await expect(page.getByRole('link', { name: /เสนออนุมัติและปรับ คบ\.11/ })).toHaveAttribute('href', '/protection-methods')
    await expect(page.getByRole('link', { name: /จัดทำเรื่องยุติ \(คบ\.15\)/ })).toHaveAttribute('href', `/termination/${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByRole('link', { name: /จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/ })).toHaveAttribute('href', '/article14')

    // WIT1109 — ไปแท็บ 11B
    await page.getByRole('link', { name: /ขยายเวลา \(คบ\.14\)/ }).click()
    await expect(page).toHaveURL(new RegExp(`/protection-extension/${encodeURIComponent(CASE_NO)}`))
    await expect(page.getByText('ระยะเวลาและเหตุผลที่ขอ')).toBeVisible()
    await S(page, ['edge:11A:E006', 'overview:11A>11B'], 'เลือกแนวทางขยายเวลา เข้าหน้าขอขยายเวลา คบ.14 (แท็บ 11B)')
  })

  test('T11A-B · ป็อปอัปเตือนทบทวนเฉพาะผู้รับผิดชอบ -> ภายหลัง ไม่เปลี่ยนข้อมูล -> ขอขยายเวลา (WIT1190, WIT1109)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(MONITOR_URL)
    const original = await readCase(page, CASE_NO)
    await page.goto(DURATION_URL)
    const dialog = page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(CASE_NO)
    await S(page, ['node:11A:WIT1190', 'edge:11A:E002'], 'ผู้รับผิดชอบเปิดหน้าระยะเวลาคุ้มครอง เห็นป็อปอัปเตือนทบทวนการคุ้มครอง')
    await dialog.getByRole('button', { name: 'ภายหลัง', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(await readCase(page, CASE_NO)).toEqual(original)

    await expect(page.getByRole('link', { name: 'ส่งต่อกรมคุ้มครองสิทธิฯ' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'ยุติคุ้มครองพยาน' })).toHaveAttribute('href', `/termination/${encodeURIComponent(CASE_NO)}`)

    await S(page, 'node:11B:WIT1191', 'หน้าระยะเวลาคุ้มครอง ปิดป็อปอัปแล้ว มีปุ่มขอขยายเวลา (เริ่มชุด คบ.3/คบ.6 ใหม่)')
    await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).click()
    await expect(page).toHaveURL(DOSSIER_URL)
    await expect.poll(async () => ((await readCase(page, CASE_NO)) as Rec).extensionDocs?.round).toBe(1)
    await S(page, ['edge:11A:E010', 'edge:11B:E002'], 'กดขอขยายเวลา เปิดชุด คบ.3/คบ.6 ฉบับขยายเวลา (รอบที่ 1) ในแฟ้ม')
  })

  test('T11A-B2 · ผู้กลั่นกรอง/เลขาธิการไม่เห็นป็อปอัปเตือนแทนผู้รับผิดชอบ (WIT1190)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'secretary')
    await page.goto(DURATION_URL)
    await expect(page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true })).not.toBeVisible()
    await expect(page.getByRole('button', { name: 'ขอขยายเวลา', exact: true })).toHaveCount(0)
  })

  test('T11A-C · ครบเพดาน 180 วัน: ปิดขยายเวลา เหลือส่งต่อกรมคุ้มครองสิทธิฯ ข้อ 14 (WIT1103, WIT1149)', async ({ page }) => {
    const seeded = activeEpisode(0, 'FP-C')
    const { cap } = figuresOf(seeded.episode)
    await seedMockState(page, 'Case 1.14', 'officer', seeded)
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await expect(page.getByText(`ครบเพดาน ${cap} วันแล้ว ห้ามขยายด้วย คบ.14`)).toBeVisible()
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await expect(page.getByText(`ทำไม่ได้ — ครบเพดาน ${cap} วันแล้ว`)).toBeVisible()
    await S(page, ['node:11A:WIT1149', 'edge:11A:E009'], 'ครบเพดาน 6 เดือนแต่ยังมีภัย: ขยาย คบ.14 ไม่ได้ เหลือส่งต่อกรมคุ้มครองสิทธิฯ ข้อ 14')
    await expect(page.getByRole('link', { name: /จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/ })).toHaveAttribute('href', '/article14')

    await page.goto(DURATION_URL)
    await expect(page.getByRole('link', { name: 'ส่งต่อกรมคุ้มครองสิทธิฯ', exact: true })).toHaveAttribute('href', `/article14?caseNo=${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true })).not.toBeVisible()
  })

  test('T11A-D · คุ้มครองต่อภายใต้คำสั่งเดิม กลับไปเปิดรอบ คบ.13 ถัดไปที่แท็บ 10 (WIT1108)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await expect(page.getByText(/กลับไปรายงานผลการคุ้มครอง \(หน้านี้\)/)).toBeVisible()
    await S(page, ['node:11A:WIT1108', 'edge:11A:E005'], 'ผู้บังคับบัญชาเห็นชอบให้คุ้มครองต่อภายใต้คำสั่งเดิม รอกลับไปเปิดรอบ คบ.13 ถัดไป')
    await page.getByRole('button', { name: 'ปิด', exact: true }).click()

    await page.getByRole('button', { name: /เปิดรอบรายงานงวด/ }).click()
    await page.locator('button.w-full').filter({ hasText: 'เปิดรอบรายงานงวด' }).click()
    await expect.poll(async () => (((await readCase(page, CASE_NO)) as Rec).monthlyReports as Rec[]).length).toBe(2)
    await S(page, 'overview:11A>10', 'คุ้มครองต่อ กลับแท็บ 10 เปิดรอบ คบ.13 ถัดไปแล้ว')
  })
})

/** ส่ง คบ.14 รอบแรกจาก Case 9 (ไม่มีชุด คบ.3/คบ.6 แนบ) — Case 9 ไม่มี protectionEndAt จึง patch ให้ */
async function officerSubmitsKb14(page: Page, reason = 'ภัยคุกคามยังไม่หมดไป ขอขยายเวลาคุ้มครองต่อเนื่อง', snaps = false) {
  await page.goto(`/form/14?caseNo=${CASE_NO}`)
  const reasonBox = page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ })
  await expect(reasonBox).toBeVisible()
  if (snaps) await S(page, ['node:11B:WIT1114', 'edge:11B:E003'], 'เปิดแบบฟอร์ม คบ.14 จากหน้าขยายเวลา ยังไม่ได้กรอกเหตุผล')
  await reasonBox.fill(reason)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
  await expect(page).toHaveURL(new RegExp(`/protection-extension/${encodeURIComponent(CASE_NO)}`))
  const footer = page.getByTestId('kb14-forward-footer')
  await expect(footer).toBeVisible()
  if (snaps) await S(page, ['node:11B:WIT1115', 'edge:11B:E005'], 'บันทึก คบ.14 แล้ว รอแนบ คบ.13/ผลประเมิน/คำสั่งเดิมและกดส่ง')
  await footer.getByTestId('kb14-submit-button').click()
  if (snaps) {
    await page.locator('.swal2-popup:not(.swal2-toast)').waitFor()
    await S(page, ['node:11B:WIT1116', 'edge:11B:E006'], 'กดส่ง คบ.14 ระบบตรวจช่วงวันที่ที่ขอและยอดสะสมไม่เกินเพดาน (กล่องยืนยันส่ง)')
  }
  await confirmDialog(page, 'ยืนยันส่ง')
}
const latestExt = async (page: Page) => (((await readCase(page, CASE_NO)) as Rec).extensionRequests as Rec[]).at(-1) as Rec
const queueRow = (page: Page) => page.locator('table.ws-table tbody tr', { hasText: CASE_NO })

/** ลงนาม คบ.6 ฉบับขยายเวลาด้วยบทบาทปัจจุบัน (ฟอร์ม /form/6) */
async function signKb6Here(page: Page) {
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  await page.getByTestId('kb6-sign-button').click()
  await confirmDialog(page, 'ยืนยันลงนาม')
  await signInModal(page)
}

test.describe('แท็บ 11B · ขยายระยะเวลาการคุ้มครอง (คบ.14)', () => {
  test('T11B-A · เจ้าหน้าที่ส่ง -> ผบช.ชั้นต้น -> ผอ. -> ธุรการขาขึ้น -> รองเลขาธิการ -> เลขาธิการอนุมัติ -> ธุรการขาลง -> เจ้าของสำนวนรับทราบ', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 9', 'officer', { protectionEndAt: daysAheadIso(15) })

    await test.step('WIT1112/1113 · เข้าหน้าขยายเวลาจากรายการ เห็นคำสั่งปัจจุบันและยอดสะสม', async () => {
      await page.goto('/protection-extensions')
      await page.getByRole('link', { name: new RegExp(CASE_NO) }).click()
      await expect(page).toHaveURL(new RegExp(EXT_URL))
      await expect(page.getByText('ระยะเวลาและเหตุผลที่ขอ')).toBeVisible()
      await expect(page.getByText('คำสั่งปัจจุบัน', { exact: true })).toBeVisible()
      await S(page, ['node:11B:WIT1112', 'node:11B:WIT1113', 'edge:11B:E001'], 'เข้าหน้าขอขยายเวลา เห็นคำสั่งปัจจุบัน วันเริ่มจริง วันสิ้นสุด และยอดสะสม')
    })

    await test.step('WIT1114-1116 · บันทึกแบบ คบ.14 แล้วส่งที่ footer', async () => {
      await officerSubmitsKb14(page, undefined, true)
      await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('supervisor')
      expect((await latestExt(page)).status).toBe('submitted')
    })

    await test.step('WIT1192/1117/1118/1120 · ผบช.ชั้นต้นเห็นงานในคิวแล้วเห็นชอบส่ง ผอ.กอง', async () => {
      await switchRole(page, 'supervisor')
      await page.goto('/queue/supervisor')
      await expect(queueRow(page)).toHaveCount(1)
      await S(page, ['node:11B:WIT1192', 'edge:11B:E008'], 'ผบช.ชั้นต้นเห็นงาน คบ.14 ในคิวงานของฉัน', { role: 'supervisor' })
      await queueRow(page).getByRole('link', { name: /เปิดแฟ้ม/ }).click()
      await expect(page).toHaveURL(new RegExp(EXT_URL))
      await expect(page.getByTestId('kb14-forward-button').first()).toBeVisible()
      await S(page, ['node:11B:WIT1117', 'edge:11B:E009'], 'ผบช.ชั้นต้นเปิดแฟ้มตรวจ คบ.14 เหตุผล หลักฐาน ช่วงวันที่ และเพดานวัน', { role: 'supervisor' })
      await S(page, ['node:11B:WIT1118', 'edge:11B:E014', 'edge:11B:E017', 'node:11B:WIT1120'], 'ไม่มี คบ.6 แนบ เอกสารครบ ผบช.ชั้นต้นพร้อมบันทึกความเห็นและเสนอ ผอ.กอง', { role: 'supervisor' })
      await page.getByTestId('kb14-forward-button').first().click()
      await confirmDialog(page, 'ยืนยันส่งผอ.กอง')
      await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('director')
    })

    await test.step('WIT1120/1195 · ผอ.เห็นชอบส่งรองเลขาธิการ ต้องผ่านธุรการขาออก/ขาเข้า', async () => {
      await switchRole(page, 'director')
      await page.goto(EXT_URL)
      await page.getByTestId('kb14-forward-button').first().click()
      await confirmDialog(page, 'ยืนยันส่งรองเลขาธิการ')
      await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('deputy_secretary')
      await expect(page.getByTestId('kb14-in-transit-note')).toBeVisible()
      await S(page, ['node:11B:WIT1195', 'edge:11B:E018'], 'ผอ.เห็นชอบส่งรองเลขาธิการแล้ว แฟ้มอยู่ระหว่างธุรการขาออก/ขาเข้า', { role: 'director' })
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'up' })
      await passSarabanCheckpoint(page, CASE_NO, 'receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'deputy_secretary' })
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toBeUndefined()
    })

    await test.step('WIT1197 · รองเลขาธิการเห็นชอบส่งเลขาธิการ', async () => {
      await page.goto(EXT_URL)
      await expect(page.getByTestId('kb14-forward-button').first()).toBeVisible()
      await S(page, ['node:11B:WIT1197', 'edge:11B:E019'], 'แฟ้มถึงรองเลขาธิการ (ธุรการผ่านแล้ว) รอเห็นชอบส่งเลขาธิการ', { role: 'deputy_secretary' })
      await page.getByTestId('kb14-forward-button').first().click()
      await confirmDialog(page, 'ยืนยันส่งเลขาธิการ')
      await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('secretary')
    })

    const before = ((await readCase(page, CASE_NO)) as Rec).protectionEndAt
    await test.step('WIT1121/1122 · เลขาธิการอนุมัติ ระบบเพิ่มช่วงคุ้มครองใหม่', async () => {
      await switchRole(page, 'secretary')
      await page.goto(EXT_URL)
      await expect(page.getByTestId('kb14-approve-button')).toBeVisible()
      await S(page, ['node:11B:WIT1121', 'edge:11B:E020', 'node:11B:WIT1122'], 'เลขาธิการได้รับแฟ้ม คบ.14 รอพิจารณาอนุมัติขยายเวลา', { role: 'secretary' })
      await page.getByTestId('kb14-approve-button').click()
      await confirmDialog(page, 'ยืนยันอนุมัติ')
      await expect.poll(async () => (await latestExt(page)).status).toBe('approved')
      expect(((await readCase(page, CASE_NO)) as Rec).protectionEndAt).not.toBe(before)
      await expect(page.getByText('ขยายระยะเวลาคุ้มครองแล้ว', { exact: true }).first()).toBeVisible()
      await S(page, ['edge:11B:E021', 'edge:11B:E025', 'node:11B:WIT1196'], 'เลขาธิการอนุมัติแล้ว ล็อก คบ.14 เพิ่มช่วงคุ้มครองใหม่ ผลรอธุรการขาลงส่งหน่วย', { role: 'secretary' })
    })

    await test.step('WIT1196 · ผลลงหน่วยผ่านธุรการ สลธ. -> ธุรการหน่วย', async () => {
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'down' })
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toBeUndefined()
    })

    await test.step('WIT1198 · เจ้าของสำนวนเห็นป็อปอัปผลพิจารณาแล้วกดรับทราบ', async () => {
      await page.goto(DURATION_URL)
      const dialog = page.getByRole('dialog', { name: 'ผลพิจารณาขอขยายระยะเวลาคุ้มครอง', exact: true })
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('ขยายระยะเวลาคุ้มครองแล้ว')
      await S(page, ['node:11B:WIT1198', 'edge:11B:E027'], 'ผลลงถึงหน่วยแล้ว เจ้าของสำนวนเห็นป็อปอัปผลพิจารณา รอกดรับทราบ', { role: 'officer', route: DURATION_URL })
      await dialog.getByRole('button', { name: 'รับทราบ', exact: true }).click()
      await expect.poll(async () => (await latestExt(page)).ownerAcknowledgedAt).toBeTruthy()
      await S(page, 'overview:11B>10', 'เจ้าของสำนวนรับทราบผลอนุมัติขยายเวลาแล้ว กลับไปติดตามรอบ คบ.13 (แท็บ 10)', { role: 'officer', route: DURATION_URL })
    })
  })

  test('T11B-B · ผบช.ชั้นต้นส่งคืนแก้ไข -> เจ้าหน้าที่แก้และส่งใหม่เป็นเวอร์ชัน 2 เก็บฉบับเดิม (WIT1118 -> WIT1119)', async ({ page }) => {
    await seedMockState(page, 'Case 9', 'officer', { protectionEndAt: daysAheadIso(15) })
    await officerSubmitsKb14(page, 'ขอขยายเวลาเพราะภัยยังอยู่')
    await expect.poll(async () => (await latestExt(page)).status).toBe('submitted')

    await switchRole(page, 'supervisor')
    await page.goto(EXT_URL)
    await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('ระบุเหตุผลเพิ่มเติม')
    await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
    await confirmDialog(page, 'ยืนยันส่งคืน')
    await expect.poll(async () => (await latestExt(page)).status).toBe('returned')

    await switchRole(page, 'officer')
    await page.goto(EXT_URL)
    await expect(page.getByText(/เหตุผล: ขอขยายเวลาเพราะภัยยังอยู่/)).toBeVisible()
    await S(page, ['node:11B:WIT1119', 'edge:11B:E015'], 'ผบช.ชั้นต้นส่งคืนแก้ไข เจ้าหน้าที่เห็นเหตุผลที่ส่งคืน รอแก้ คบ.14', { role: 'officer', route: EXT_URL })
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await expect(page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ })).toBeVisible()
    await S(page, 'edge:11B:E016', 'เปิดแบบฟอร์ม คบ.14 เพื่อแก้ร่างตามที่ส่งคืน (เก็บฉบับเดิมไว้)', { role: 'officer' })
    await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ขอขยายเวลาเพราะภัยยังอยู่ (แก้ไขตามที่ส่งคืน)')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
    await page.getByTestId('kb14-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่ง')
    await expect.poll(async () => (await latestExt(page)).version).toBe(2)
    const again = await latestExt(page)
    expect(again.status).toBe('submitted')
    expect(again.previousVersions).toHaveLength(1)
  })

  test('T11B-C · รอบที่มี คบ.6 แนบ: รองเลขาธิการ/เลขาธิการต้องลงนาม คบ.6 ก่อน แล้วเลขาธิการไม่อนุมัติ -> ธุรการขาลง -> รับทราบ (WIT1192, 1194, 1197, 1121, 1123, 1196, 1198)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 9.6', 'deputy_secretary')

    await test.step('WIT1192 · รองเลขาธิการเห็นแฟ้มในคิว', async () => {
      await page.goto('/queue/deputy_secretary')
      await expect(queueRow(page)).toHaveCount(1)
    })

    await test.step('WIT1194/1197 · ส่งเลขาธิการไม่ได้จนกว่าจะลงนาม คบ.6 ข้อ 12', async () => {
      await page.goto(EXT_URL)
      await expect(page.getByTestId('kb14-forward-button').first()).toBeDisabled()
      await expect(page.getByTestId('kb14-kb6-sign-required').first()).toBeVisible()
      await S(page, ['node:11B:WIT1194', 'edge:11B:E012'], 'รองเลขาธิการเปิดแฟ้มที่มี คบ.6 แนบ ต้องลงนาม คบ.6 (ข้อ 12) ก่อนส่งต่อ', { role: 'deputy_secretary' })
      await signKb6Here(page)
      await expect.poll(async () => (await latestExt(page)).kb6Signatures?.deputy).toBeTruthy()
      await page.goto(EXT_URL)
      const forward = page.getByTestId('kb14-forward-button').first()
      await expect(forward).toBeEnabled()
      await S(page, 'edge:11B:E013', 'รองเลขาธิการลงนาม คบ.6 แล้ว ปุ่มเห็นชอบส่งเลขาธิการใช้งานได้', { role: 'deputy_secretary', route: EXT_URL })
      await forward.click()
      await confirmDialog(page, 'ยืนยันส่งเลขาธิการ')
      await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('secretary')
    })

    await test.step('WIT1121/1123 · เลขาธิการลงนาม คบ.6 แล้วไม่อนุมัติ (ต้องมีเหตุผล)', async () => {
      await switchRole(page, 'secretary')
      await page.goto(EXT_URL)
      await expect(page.getByTestId('kb14-approve-button')).toBeDisabled()
      await signKb6Here(page)
      await expect.poll(async () => (await latestExt(page)).kb6Signatures?.secretary).toBeTruthy()
      await page.goto(EXT_URL)
      await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('ไม่เห็นควรขยายเวลาในรอบนี้')
      await S(page, 'node:11B:WIT1123', 'เลขาธิการลงนาม คบ.6 แล้ว กรอกเหตุผล รอกดไม่อนุมัติ', { role: 'secretary', route: EXT_URL })
      await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติ')
      await expect.poll(async () => (await latestExt(page)).status).toBe('rejected')
      await expect(page.getByRole('link', { name: /หน้าจัดทำเรื่องยุติ \(คบ\.15\)/ })).toHaveAttribute('href', `/termination/${encodeURIComponent(CASE_NO)}`)
      await S(page, ['edge:11B:E022', 'edge:11B:E026', 'overview:11B>11C'], 'เลขาธิการไม่อนุมัติขยายเวลา คงคำสั่งเดิม เห็นลิงก์ไปหน้าจัดทำเรื่องยุติ (คบ.15)', { role: 'secretary', route: EXT_URL })
    })

    await test.step('WIT1196/1198 · ธุรการขาลงแล้วเจ้าของสำนวนกดรับทราบ', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
      await page.goto(DURATION_URL)
      const dialog = page.getByRole('dialog', { name: 'ผลพิจารณาขอขยายระยะเวลาคุ้มครอง', exact: true })
      await expect(dialog).toContainText('ไม่อนุมัติขยายระยะเวลาคุ้มครอง')
      await dialog.getByRole('button', { name: 'รับทราบ', exact: true }).click()
      await expect.poll(async () => (await latestExt(page)).ownerAcknowledgedAt).toBeTruthy()
    })
  })

  test('T11B-D · ครบเพดานห้ามจัดทำ คบ.14 เพิ่ม และส่งเกินเพดานไม่ได้ (WIT1150, WIT1116)', async ({ page }) => {
    // ครบเพดาน: แถบเตือน + ลิงก์ส่งต่อข้อ 14, ไม่มี footer ส่ง, ฟอร์มถูกปิด
    await seedMockState(page, 'Case 9', 'officer', { ...activeEpisode(0, 'FP-D1'), protectionEndAt: daysAheadIso(1) })
    await page.goto(EXT_URL)
    await expect(page.getByText(/ครบ 6 เดือนแล้ว/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'ส่งต่อกรมคุ้มครองสิทธิฯ', exact: true })).toHaveAttribute('href', `/article14?caseNo=${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByTestId('kb14-forward-footer')).toHaveCount(0)
    await S(page, ['node:11B:WIT1150', 'edge:11B:E007'], 'ถึง/เกินเพดานรวม 6 เดือน ห้ามจัดทำ คบ.14 เพิ่ม เหลือส่งต่อกรมคุ้มครองสิทธิฯ', { route: EXT_URL })
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await expect(page.getByText(/ถึงเพดานรวมแล้ว ห้ามจัดทำ คบ\.14 เพิ่ม/)).toBeVisible()
  })

  test('T11B-D2 · ช่วงที่ขอเกินเพดานรวม 6 เดือน ส่งไม่ได้และไม่สร้างคำขอ (WIT1116)', async ({ page }) => {
    // สะสม 165 วัน: ยังไม่ครบเพดาน 180 วัน แต่ปลายช่วง 1 เดือนข้ามวันครบ 6 เดือน
    await seedMockState(page, 'Case 9', 'officer', { ...activeEpisode(15, 'FP-D2'), protectionEndAt: daysAheadIso(15) })
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ขอขยายเวลาต่อเนื่อง')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
    await page.getByTestId('kb14-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่ง')
    await expect(page.locator('.swal2-toast')).toContainText('ขยายได้ครั้งละไม่เกิน 2 เดือน และรวมไม่เกิน 6 เดือน')
    expect(((await readCase(page, CASE_NO)) as Rec).extensionRequests ?? []).toHaveLength(0)
  })

  test('T11B-E · รับทราบผลอนุมัติแล้วเริ่มชุดเอกสาร คบ.3/คบ.6 ฉบับถัดไปของรอบที่ 2 (WIT1198, WIT1191)', async ({ page }) => {
    await seedMockState(page, 'Case 9.3', 'officer')
    await page.goto(DURATION_URL)
    const dialog = page.getByRole('dialog', { name: 'ผลพิจารณาขอขยายระยะเวลาคุ้มครอง', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('ขยายระยะเวลาคุ้มครองแล้ว')
    await dialog.getByRole('button', { name: 'รับทราบ', exact: true }).click()
    await expect.poll(async () => (await latestExt(page)).ownerAcknowledgedAt).toBeTruthy()

    await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).click()
    await expect(page).toHaveURL(DOSSIER_URL)
    await expect.poll(async () => ((await readCase(page, CASE_NO)) as Rec).extensionDocs?.round).toBe(2)
    await S(page, 'overview:11B>11B', 'รับทราบผลแล้วขอขยายเวลารอบถัดไป เปิดชุด คบ.3/คบ.6 ฉบับที่ 3 (รอบที่ 2)', { route: DOSSIER_URL })
    expect(((await readCase(page, CASE_NO)) as Rec).extensionDocs.kb6Version).toBe(3)
    await expect(page.locator('[data-testid="dossier-form-row"][data-form-number="6"]')).toContainText('ฉบับที่ 3 · ขยายเวลา')
    await page.locator('[data-testid="dossier-form-row"][data-form-number="6"]').getByTestId('form-versions-button').click()
    await expect(page.getByTestId('form-versions-modal')).toBeVisible()
  })

  test('T11B-F · แฟ้มส่งต่อ กอท.: คบ.14 เข้าคิว ผบช.ต้น กอท. -> ผอ. กอท. -> ธุรการ กอท. -> ธุรการ สลธ. -> รองเลขาธิการ (WIT1193, WIT1192, WIT1195)', async ({ page }) => {
    test.setTimeout(180_000)
    const store = JSON.parse(loadMockState('Case 9.1').localStorageData['ecmis-case-storage-v2'])
    const request = store.state.cases[0].extensionRequests.at(-1)
    await seedMockState(page, 'Case 9.1', 'got_supervisor', {
      protectionHandoff: { destination: 'got', step: 'active', assigneeUserId: 'GOT-OFF-001', assigneeName: 'นางสาวอรุณี ใจมั่น' },
      extensionRequests: [{ ...request, approvalStage: 'supervisor', formSnapshot: { reason: request.reason } }],
    })
    await page.goto('/queue/got_supervisor')
    await expect(queueRow(page)).toHaveCount(1)
    await S(page, ['node:11B:WIT1193', 'edge:11B:E010'], 'แฟ้มส่งต่อ กอท.: คบ.14 เข้าคิว ผบช.ต้น กอท.', { role: 'got_supervisor', route: '/queue/got_supervisor' })

    await switchRole(page, 'supervisor')
    await page.goto('/queue/supervisor')
    await expect(queueRow(page)).toHaveCount(0)

    await switchRole(page, 'got_supervisor')
    await page.goto(EXT_URL)
    await expect(page.getByTestId('kb14-forward-button').first()).toBeVisible()
    await S(page, 'edge:11B:E011', 'ผบช.ต้น กอท. เปิดแฟ้ม คบ.14 ตรวจและเสนอ ผอ. กอท.', { role: 'got_supervisor', route: EXT_URL })
    await page.getByTestId('kb14-forward-button').first().click()
    await confirmDialog(page, 'ยืนยันส่งผอ. กอท.')
    await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('director')

    await switchRole(page, 'got_director')
    await page.goto('/queue/got_director')
    await expect(queueRow(page)).toHaveCount(1)
    await queueRow(page).getByRole('link', { name: /เปิดแฟ้ม/ }).click()
    await page.getByTestId('kb14-forward-button').first().click()
    await confirmDialog(page, 'ยืนยันส่งรองเลขาธิการ')
    await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('deputy_secretary')

    await passSarabanCheckpoint(page, CASE_NO, 'got_receiver')
    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'deputy_secretary' })
    await page.goto('/queue/deputy_secretary')
    await expect(queueRow(page)).toHaveCount(1)
  })
})
