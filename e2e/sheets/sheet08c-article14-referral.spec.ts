import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 08C · WIT0852 → WIT0863 — ดำเนินการตามข้อ 14 (ส่งกรมคุ้มครองสิทธิและเสรีภาพ)
 *
 * ผัง: รับกรณีข้อ 14 (จากแท็บ 07 หรือแท็บ 11A เมื่อครบเพดานแต่ยังมีภัย) → WIT0854 จัดทำข้อเสนอ
 *      → WIT0855 ผบช.ชั้นต้นตรวจ → WIT0856 เลขาธิการฯ เสนอคณะกรรมการ → WIT0857 **มติคณะกรรมการ?**
 *      แขนง "เห็นชอบ" → WIT0859 ออกหนังสือแจ้ง/ประสานกรม → WIT0861-0863 ส่งมอบและเริ่มมาตรการใหม่
 *      แขนง "ไม่เห็นชอบ" → WIT0858 บันทึกมติ ดำเนินการตามคำสั่งเดิม → เมื่อสิ้นสุดไปแท็บ 11C
 *
 * เส้นทางนี้คนละเส้นทางกับวิธีที่ 4 ตามข้อ 15(4) (แท็บ 08B) — ต้องผ่านมติคณะกรรมการ ป.ป.ท. ก่อนเสมอ
 *
 * สามจุดที่เทสต์ชุดนี้กัน (พบว่าเป็นช่องว่างจริงในโค้ด src/routes/article14.tsx):
 * 1. WIT0860 "รับหนังสือตอบรับขาเข้า" ไม่มี UI บันทึกหนังสือขาเข้าแยกต่างหาก — ไปต่อที่ฟอร์มส่งมอบได้ทันที
 * 2. ไม่มีแขนง "กรมแจ้งว่าดำเนินการไม่ได้" เลย — เมื่อเข้าขั้น letter_sent มีแต่เส้นทางส่งมอบสำเร็จ
 * 3. เกณฑ์ "ใกล้ครบเพดาน" (nearCap) ฝังไว้ที่ ≤15 วันคงเหลือ — เคสที่เหลือ 20 วันจะไม่ขึ้นเป็นตัวเลือกในหน้านี้เลย
 */

const CASE_NO = 'WP-2569-000501'
const ARTICLE14_URL = '/article14'
const TARGET_AGENCY = 'สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม'

/** กด "ยืนยัน" ในจอ SweetAlert2 — ทุกปุ่มที่เปลี่ยนสถานะแฟ้มในเส้นทางนี้ต้องผ่านจอนี้ก่อน */
async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** สร้าง Episode เทียมที่มีวันสะสมตามที่ต้องการ นับจาก "วันเริ่มจริง" ย้อนหลัง (ไม่ใช้วันอัปโหลด) */
function episodeWithCumulativeDays(days: number) {
  const startedAt = new Date(Date.now() - (days - 1) * 86400000).toISOString()
  return {
    id: `EP-TEST-${days}`,
    openedAt: startedAt,
    phases: [{ id: `PH-TEST-${days}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.11' }],
  }
}

/** ตั้งต้น: คุ้มครองสะสม 178 วัน (เหลือ 2 วัน — เข้าเงื่อนไข nearCap) ยังไม่เปิดเรื่องข้อ 14 */
const AT_NEAR_CAP = {
  approvedMethods: [1],
  methodTracks: [{ method: 1, status: 'active' }],
  kb11Signed: true,
  episode: episodeWithCumulativeDays(178),
  article14: undefined,
  article14Referral: undefined,
}

/** ตั้งต้นที่ WIT0857 ผ่านแล้ว — คณะกรรมการเห็นชอบ พร้อมออกหนังสือขาออก (step: letter_sent) */
const AT_LETTER_SENT = {
  ...AT_NEAR_CAP,
  article14: {
    step: 'letter_sent' as const,
    openedAt: '10/09/2569 09:00',
    openedBy: 'นางสาวอรุณี ใจมั่น',
    threatSummary: 'ยังมีกลุ่มผู้มีอิทธิพลเฝ้าติดตามที่พักพยาน',
    riskAssessment: 'ความเสี่ยงสูงต่อเนื่อง ยังไม่มีสัญญาณว่าภัยลดลง',
    recommendedMeasure: 'special' as const,
    supervisorNote: 'เห็นชอบ',
    supervisorAt: '10/09/2569 10:00',
    secretaryNote: 'เห็นชอบเสนอคณะกรรมการ',
    secretaryAt: '10/09/2569 11:00',
    committeeResolutionNo: 'มติที่ 25/2569',
    committeeResolvedAt: '10/09/2569 13:00',
    committeeApproved: true,
    committeeNote: 'เห็นชอบส่งกรมคุ้มครองสิทธิฯ',
    revisions: [],
  },
}

test.describe('TC-094 — จัดทำเรื่องเสนอข้อ 14 จนคณะกรรมการเห็นชอบและส่งกรม', () => {
  test('TC-094 · [Happy] เดินครบลำดับชั้น: เสนอ → ผบช. → เลขาธิการฯ → มติคณะกรรมการเห็นชอบ → ออกหนังสือขาออก', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_NEAR_CAP)
    await page.goto(ARTICLE14_URL)
    await expect(page.getByText(CASE_NO).first()).toBeVisible()

    // WIT0854 — จัดทำรายงานผล/ประเมินความเสี่ยงพร้อมความเห็น
    await page
      .getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' })
      .fill('ยังมีภัยต่อเนื่องแม้คุ้มครองสะสมใกล้ครบเพดาน 180 วัน')
    await page
      .getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ })
      .fill('อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม (คบ.11) — สะสม 178 วัน')
    await page.getByTestId('submit-article14-proposal').click()
    await confirmDialog(page, 'ยืนยันเสนอ')

    let c = await readCase(page, CASE_NO)
    let a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('supervisor_review')
    expect(c?.owner).toBe('นายกิตติศักดิ์ ธรรมรักษ์')

    // WIT0855 — ผบช.ชั้นต้นตรวจและเห็นชอบ
    await switchRole(page, 'supervisor')
    await page.goto(ARTICLE14_URL)
    await page.getByTestId('article14-endorse-button').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    c = await readCase(page, CASE_NO)
    a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('secretary_review')

    // WIT0856 — เลขาธิการฯ เสนอคณะกรรมการ
    await switchRole(page, 'secretary')
    await page.goto(ARTICLE14_URL)
    await page.getByTestId('article14-endorse-button').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    c = await readCase(page, CASE_NO)
    a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('committee_pending')

    // WIT0857 — คณะกรรมการเห็นชอบ
    await switchRole(page, 'committee')
    await page.goto(ARTICLE14_URL)
    await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติที่ 25/2569')
    await page.getByPlaceholder('สาระสำคัญของมติ').fill('เห็นชอบส่งกรมคุ้มครองสิทธิฯ')
    await page.getByTestId('article14-committee-approve').click()
    await confirmDialog(page, 'ยืนยันมติ', 'มติที่ 25/2569')

    c = await readCase(page, CASE_NO)
    a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('letter_sent')
    expect(a14.committeeApproved).toBe(true)
    expect(a14.committeeResolutionNo).toBe('มติที่ 25/2569')

    // WIT0859 — ออกหนังสือแจ้ง/ประสานกรม ผ่านสารบรรณเดิม
    await switchRole(page, 'officer')
    await page.goto(ARTICLE14_URL)
    await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('ปปท 0001/7788')
    await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
    await confirmDialog(page, 'ยืนยันบันทึก', 'ปปท 0001/7788')

    c = await readCase(page, CASE_NO)
    const letters = c?.officialLetters as Array<Record<string, unknown>>
    expect(letters).toHaveLength(1)
    expect(letters[0].direction).toBe('outgoing')
    expect(letters[0].context).toBe('article14')
    expect(letters[0].registryNo).toBe('ปปท 0001/7788')
    expect(letters[0].agency).toBe(TARGET_AGENCY)
    expect(letters[0].sentAt).toBeTruthy()
  })
})

test.describe('TC-095 — รับตอบรับจากกรม ส่งมอบ และเริ่มมาตรการภายใต้หน่วยงานใหม่', () => {
  test('TC-095 · [Happy] บันทึกวันเริ่มจริง หน่วยงานผู้รับ ฐานกฎหมายแยกจากมาตรการเดิม และปิด Episode เดิม', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_SENT)
    await page.goto(ARTICLE14_URL)

    // WIT0860 — ต้องบันทึกหนังสือขาออกและหนังสือตอบรับจากกรมก่อน จึงเปิดฟอร์มส่งมอบ (WIT0861)
    await page.locator('input[placeholder="เลขที่หนังสือ (สารบรรณเดิม)"]').fill('ปปท 0001/7788')
    await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
    await confirmDialog(page, 'ยืนยันบันทึก')
    await page.getByPlaceholder('เลขที่หนังสือตอบรับของกรม').fill('ยธ 0501/2569')
    await page.getByPlaceholder('ผู้ประสานของกรม').fill('นายประสาน ตอบรับ')
    await page.getByLabel('วันนัดส่งมอบ').fill('2026-10-01')
    await page.getByTestId('article14-reply-file').setInputFiles({ name: 'reply.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock') })
    await page.getByTestId('article14-record-reply').click()
    await confirmDialog(page, 'ยืนยันบันทึก')
    await page.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่').fill('2026-10-01')
    await page.getByLabel('ฐานกฎหมายของหน่วยงานใหม่').fill('มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ')
    await page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }).click()
    await confirmDialog(page, 'ยืนยันส่งมอบ', 'Episode')

    const c = await readCase(page, CASE_NO)
    const a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('handover_done')
    expect(a14.successorStartedAt).toContain('2026-10-01')
    expect(a14.successorLegalBasis).toBe('มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ')

    const episode = c?.episode as Record<string, unknown>
    expect(episode.closedAt).toBeTruthy()
    expect(episode.successorAgency).toBe(TARGET_AGENCY)
    expect(episode.successorStartedAt).toContain('2026-10-01')

    expect(c?.stage).toBe('transferred')
    await expect(page.getByText(TARGET_AGENCY).first()).toBeVisible()
    await expect(page.getByText(/เริ่มมาตรการตั้งแต่/)).toBeVisible()
  })
})

test.describe('TC-096 — คณะกรรมการไม่เห็นชอบส่งกรม', () => {
  test('TC-096 · [Negative] บันทึกมติไม่เห็นชอบ ดำเนินการตามคำสั่งเดิม และชี้ทางไปกระบวนการยุติเมื่อมาตรการสิ้นสุด', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'committee', {
      ...AT_NEAR_CAP,
      article14: {
        step: 'committee_pending',
        openedAt: '10/09/2569 09:00',
        openedBy: 'นางสาวอรุณี ใจมั่น',
        threatSummary: 'ยังมีภัยต่อเนื่อง',
        riskAssessment: 'ความเสี่ยงสูง',
        recommendedMeasure: 'general',
        revisions: [],
      },
    })
    await page.goto(ARTICLE14_URL)

    await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติที่ 26/2569')
    await page.getByPlaceholder('สาระสำคัญของมติ').fill('ยังไม่เห็นชอบให้ส่งกรม เห็นควรคุ้มครองต่อตามคำสั่งเดิม')
    await page.getByTestId('article14-committee-reject').click()
    await confirmDialog(page, 'ยืนยันมติ', 'มติที่ 26/2569')

    const c = await readCase(page, CASE_NO)
    const a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('committee_rejected')
    expect(a14.committeeApproved).toBe(false)
    expect(a14.committeeResolutionNo).toBe('มติที่ 26/2569')
    expect(String(c?.status)).toContain('ไม่เห็นชอบ')

    await expect(page.getByText(/คณะกรรมการไม่เห็นชอบ \(มติที่/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'กระบวนการยุติ' })).toBeVisible()
  })
})

test.describe('TC-097 — ห้ามจัดทำ คบ.14 ขยายเวลาเกินเพดาน ต้องไปเส้นทางข้อ 14 แทน', () => {
  test('TC-097 · [Negative] ครบเพดาน 180 วัน — แผง คบ.14 ต้องปิดฟอร์มและชี้ทางไปเส้นทางข้อ 14 แทนการขยายเวลา', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'active' }],
      kb11Signed: true,
      episode: episodeWithCumulativeDays(180),
      protectionEndAt: new Date().toISOString(),
    })
    await page.goto(`/protection-extension/${CASE_NO}`)

    // ถึงเพดานแล้ว — ต้องไม่มีฟอร์มจัดทำ คบ.14 ให้กรอกเลย (ห้ามจัดทำ คบ.14 เกินเพดาน / ห้ามย้อนหลังวัน)
    await expect(page.getByText(/ถึงเพดานรวม\s*180\s*วันแล้ว/)).toBeVisible()
    await expect(page.getByText(/ห้ามจัดทำ คบ\.14 เพิ่ม/)).toBeVisible()
    await expect(page.getByText(/ห้ามย้อนหลังวัน/)).toBeVisible()
    await expect(page.getByLabel('ขยายตั้งแต่วันที่')).toHaveCount(0)
    await expect(page.getByRole('button', { name: /จัดทำ คบ\.14/ })).toHaveCount(0)

    // ลิงก์ชี้ทางกลับไปเส้นทางข้อ 14 (ผ่านแท็บ 11A แขนง WIT1149 ซึ่งจะพาไปแท็บ 08C ต่อ)
    const link = page.getByRole('link', { name: /เส้นทางส่งต่อกรมคุ้มครองสิทธิฯ/ })
    await expect(link).toBeVisible()

    const c = await readCase(page, CASE_NO)
    expect((c?.extensionRequests as unknown[]) || []).toHaveLength(0)
  })
})

test.describe('TC-098 — ดำเนินการข้อ 14 โดยยังไม่มีมติเห็นชอบ', () => {
  test('TC-098 · [Negative] ยังไม่มีมติคณะกรรมการ — ไม่มีทางออกหนังสือประสานกรมได้เลย', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      ...AT_NEAR_CAP,
      article14: {
        step: 'committee_pending',
        openedAt: '10/09/2569 09:00',
        openedBy: 'นางสาวอรุณี ใจมั่น',
        threatSummary: 'ยังมีภัยต่อเนื่อง',
        riskAssessment: 'ความเสี่ยงสูง',
        recommendedMeasure: 'general',
        revisions: [],
      },
    })
    await page.goto(ARTICLE14_URL)

    // บทบาทเจ้าหน้าที่ที่นี่ไม่มีสิทธิ์ตัดสินมติ และไม่มีฟอร์มออกหนังสือขาออกให้เห็นเลย จนกว่าจะผ่านมติ
    await expect(page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'บันทึกหนังสือขาออก' })).toHaveCount(0)
    await expect(page.getByText('รอมติคณะกรรมการ ป.ป.ท.')).toBeVisible()

    const c = await readCase(page, CASE_NO)
    expect((c?.officialLetters as unknown[]) || []).toHaveLength(0)
  })
})

test.describe('TC-099 — กรมแจ้งว่าดำเนินการไม่ได้', () => {
  test('TC-099 · [Edge] ระบบต้องสร้างงานเสนอผู้มีอำนาจทันทีเมื่อกรมแจ้งว่าดำเนินการไม่ได้ ไม่ปล่อยให้คุ้มครองขาดช่วง', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_SENT)
    await page.goto(ARTICLE14_URL)

    // เมื่อเข้าขั้น letter_sent หน้านี้ต้องมีทั้งฟอร์ม "ส่งมอบสำเร็จ" และแขนง "ดำเนินการไม่ได้"
    // (WIT0860) ให้เลือกได้ — ไม่ใช่มีแต่เส้นทางส่งมอบสำเร็จเพียงทางเดียวเหมือนก่อนแก้ไข
    await expect(page.getByRole('button', { name: /ดำเนินการไม่ได้/ })).toBeVisible()

    await page.getByPlaceholder('ระบุเหตุผลตามหนังสือแจ้งของกรม').fill('กรมแจ้งว่าเกินอำนาจรับผู้ถูกคุกคามระดับสูง')
    await page.getByPlaceholder(/เช่น คงมาตรการเดิม/).fill('คงมาตรการเดิมของ ป.ป.ท. ไว้ก่อน ระหว่างเสนอหน่วยงานอื่น')
    await page.getByTestId('article14-delivery-failed').click()
    await confirmDialog(page, 'ยืนยันบันทึก', 'ผบช.ชั้นต้น')

    // ต้องเกิดเป็นงานจริงในคิว ผบช.ชั้นต้น ทันที (stage: 'supervisor') ไม่ใช่ toast ที่หายไปเฉยๆ
    const c = await readCase(page, CASE_NO)
    const a14 = c?.article14 as Record<string, unknown>
    expect(a14.step).toBe('delivery_failed')
    const proposals = c?.article14EscalationProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(1)
    expect(proposals[0].stage).toBe('supervisor')
    expect(proposals[0].failedReason).toContain('เกินอำนาจ')
    expect(proposals[0].proposedApproach).toContain('คงมาตรการเดิม')
    expect(c?.owner).toBe('นายกิตติศักดิ์ ธรรมรักษ์')

    // มาตรการคุ้มครองเดิม (episode/method tracks) ต้องไม่ถูกแตะต้องระหว่างรอพิจารณา — ไม่ปล่อยให้ขาดช่วง
    expect((c?.methodTracks as Array<Record<string, unknown>>)?.[0]?.status).toBe('active')
    expect(c?.episode).toBeTruthy()
    expect((c?.episode as Record<string, unknown>)?.closedAt).toBeFalsy()

    // การ์ดงานเสนอผู้มีอำนาจต้องแสดงอยู่จริงในหน้า ไม่ใช่แค่ toast ที่เด้งแล้วหาย
    await expect(page.getByTestId('article14-escalation-card')).toBeVisible()
    await expect(page.getByTestId('article14-escalation-status')).toContainText('รอ ผบช.ชั้นต้น พิจารณา')
  })
})

test.describe('TC-100 — เริ่มดำเนินการข้อ 14 ก่อนครบเพดานเพื่อไม่ให้ขาดช่วง', () => {
  test('TC-100 · [Edge] เหลือ 20 วันก่อนครบเพดาน — ระบบต้องอนุญาตและแนะนำให้เริ่มเรื่องข้อ 14 ได้ก่อนครบเพดาน', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'active' }],
      kb11Signed: true,
      episode: episodeWithCumulativeDays(160), // เหลือ 20 วันจากเพดาน 180 วัน
      article14: undefined,
      article14Referral: undefined,
    })
    await page.goto(ARTICLE14_URL)

    // ปัจจุบัน: เกณฑ์ nearCap (summarizeEpisode) กำหนดไว้ที่เหลือ ≤15 วันเท่านั้น
    // เคสที่เหลือ 20 วันจึงไม่ถูกจัดเป็นตัวเลือกในหน้านี้เลย — เจ้าหน้าที่กดเริ่มเรื่องข้อ 14 ก่อนครบเพดานไม่ได้
    await expect(page.getByText(CASE_NO)).toBeVisible()
  })
})
