import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, confirmDialog, expectStage } from './journey-helpers'

/**
 * Journey J08 · ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14 (แท็บ 08C เส้นเดียว)
 *
 * ผัง: คุ้มครองสะสมใกล้ครบเพดาน 180 วันแต่ยังมีภัย (Case 5)
 *   WIT0852 รับกรณีข้อ 14 → WIT0854 เจ้าหน้าที่จัดทำข้อเสนอ → WIT0855 ผบช.ชั้นต้นตรวจ
 *   → WIT0856 เลขาธิการฯ เสนอคณะกรรมการ → ◇ WIT0857 มติ "เห็นชอบส่งกรม?"
 *     เห็นชอบ → WIT0859 หนังสือขาออก → WIT0860 หนังสือตอบรับจากกรม → WIT0861 ส่งมอบ
 *             → WIT0862 เริ่มมาตรการภายใต้หน่วยงานใหม่ → WIT0863 ปิด Episode เดิม/เชื่อม Episode กรม
 *     ไม่เห็นชอบ → WIT0858 บันทึกมติ คุ้มครองตามคำสั่งเดิมต่อ (→ แท็บ 11C เมื่อสิ้นสุด)
 *
 * ลำดับบทบาท: เจ้าหน้าที่ → ผบช.ชั้นต้น → เลขาธิการฯ → ฝ่ายเลขานุการคณะกรรมการ → เจ้าหน้าที่
 * ทุกเทสต์เริ่มจาก mock state "Case 5" เพียงครั้งเดียว แล้วเดินผ่าน UI ล้วน (ไม่ seed ซ้ำกลางทาง)
 */

const ARTICLE14_URL = '/article14'
const TARGET_AGENCY = 'สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const OFFICER = 'นางสาวอรุณี ใจมั่น'

type A14 = Record<string, any>
const a14Of = async (page: Page) => (await readCase(page, CASE_NO))?.article14 as A14

/** WIT0852/WIT0854 — เจ้าหน้าที่เห็นแฟ้มที่ใกล้เพดานและจัดทำข้อเสนอ แล้วเสนอเข้าคิว ผบช.ชั้นต้น */
async function officerPreparesProposal(page: Page, threat: string, risk: string, measure?: 'special' | 'general') {
  await page.goto(ARTICLE14_URL)
  await expect(page.getByText(CASE_NO).first()).toBeVisible()
  await expect(page.getByText(/คุ้มครองสะสม 178 วัน/)).toBeVisible()
  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill(threat)
  await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill(risk)
  if (measure) await page.getByLabel('ความเห็นว่าควรใช้มาตรการใด').selectOption(measure)
  await page.getByTestId('submit-article14-proposal').click()
  await confirmDialog(page, 'ยืนยันเสนอ', 'เข้าคิวผู้บังคับบัญชาตรวจ')
}

/** WIT0855/WIT0856 — ผู้ตรวจแต่ละชั้นกดเห็นชอบ (หน้า /article14 ตามบทบาทที่สลับ) */
async function reviewerEndorses(page: Page, role: string, note: string) {
  await switchRole(page, role)
  await page.goto(ARTICLE14_URL)
  await page.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข').fill(note)
  await page.getByTestId('article14-endorse-button').click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ')
}

/** WIT0855/WIT0856 แขนงส่งคืนแก้ไข — ต้องบันทึกเหตุผล */
async function reviewerReturns(page: Page, role: string, reason: string) {
  await switchRole(page, role)
  await page.goto(ARTICLE14_URL)
  // ไม่กรอกเหตุผล — จอยืนยันต้องไม่ขึ้น
  await page.getByTestId('article14-return-button').click()
  await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)
  await page.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข').fill(reason)
  await page.getByTestId('article14-return-button').click()
  await confirmDialog(page, 'ยืนยันส่งคืน', reason)
}

/** WIT0857 — ฝ่ายเลขานุการคณะกรรมการบันทึกมติ */
async function committeeResolves(page: Page, approve: boolean, resolutionNo: string, note: string) {
  await switchRole(page, 'committee')
  await page.goto(ARTICLE14_URL)
  await expect(page.getByText('รอมติคณะกรรมการ ป.ป.ท.').first()).toBeVisible()
  await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill(resolutionNo)
  await page.getByPlaceholder('สาระสำคัญของมติ').fill(note)
  await page.getByTestId(approve ? 'article14-committee-approve' : 'article14-committee-reject').click()
  await confirmDialog(page, 'ยืนยันมติ', resolutionNo)
}

/** WIT0859 — เจ้าหน้าที่บันทึกหนังสือขาออกถึงกรม ผ่านเลขสารบรรณเดิม */
async function officerSendsLetter(page: Page, registryNo: string) {
  await switchRole(page, 'officer')
  await page.goto(ARTICLE14_URL)
  await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill(registryNo)
  await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
  await confirmDialog(page, 'ยืนยันบันทึก', registryNo)
}

test.describe('J08 · ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14 (08C)', () => {
  test('J08 · ข้อ 14 ครบเส้น: จัดทำข้อเสนอ → ผบช. → เลขาธิการฯ → มติเห็นชอบ → หนังสือถึงกรม → ส่งมอบ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0852 · รับกรณีข้อ 14 (ใกล้ครบเพดาน 178/180 วัน)', async () => {
      await page.goto(ARTICLE14_URL)
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await expect(page.getByText(/คุ้มครองสะสม 178 วัน/)).toBeVisible()
      await expect(page.getByTestId('article14-near-cap-hint')).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect(c?.article14).toBeFalsy()
      expect(c?.stage).toBe('protection')
    })

    // WIT0853 ◇ มีมติเห็นชอบแล้ว? — ยังไม่มี จึงแสดงฟอร์มจัดทำข้อเสนอ (ผังต่างเล็กน้อย: ไม่มีทางลัดข้ามไปออกหนังสือ)
    await test.step('WIT0854 · เจ้าหน้าที่จัดทำเรื่องเสนอข้อ 14 (เหตุภัย + ประเมินความเสี่ยง + มาตรการที่เสนอ)', async () => {
      await officerPreparesProposal(
        page,
        'ยังมีกลุ่มผู้มีอิทธิพลติดตามคุกคามต่อเนื่องแม้คุ้มครองสะสมใกล้ครบ 180 วัน',
        'อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม ความเสี่ยงระดับสูง ยังไม่มีสัญญาณภัยลดลง',
        'special'
      )
      await expect(page.getByText('มาตรการพิเศษ').first()).toBeVisible()
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('supervisor_review')
      expect(a14.recommendedMeasure).toBe('special')
      expect(a14.threatSummary).toContain('ติดตามคุกคาม')
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0855 · ผบช.ชั้นต้นตรวจและเห็นชอบ', async () => {
      await reviewerEndorses(page, 'supervisor', 'ตรวจเหตุภัย ระยะสะสม และข้อเสนอแล้ว เห็นชอบเสนอเลขาธิการฯ')
      const a14 = await a14Of(page)
      expect(a14.step).toBe('secretary_review')
      expect(a14.supervisorNote).toContain('เห็นชอบเสนอเลขาธิการฯ')
      expect(a14.supervisorAt).toBeTruthy()
    })

    await test.step('WIT0856 · เลขาธิการฯ เสนอเรื่องพร้อมความเห็นต่อคณะกรรมการ ป.ป.ท.', async () => {
      await reviewerEndorses(page, 'secretary', 'เห็นควรเสนอคณะกรรมการ ป.ป.ท. พิจารณาตามข้อ 14')
      const a14 = await a14Of(page)
      expect(a14.step).toBe('committee_pending')
      expect(a14.secretaryNote).toContain('คณะกรรมการ')
    })

    await test.step('WIT0857 · ◇ คณะกรรมการมีมติเห็นชอบส่งกรม', async () => {
      await committeeResolves(page, true, 'มติที่ 31/2569', 'เห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ')
      const a14 = await a14Of(page)
      expect(a14.step).toBe('letter_sent')
      expect(a14.committeeApproved).toBe(true)
      expect(a14.committeeResolutionNo).toBe('มติที่ 31/2569')
    })

    await test.step('WIT0859 · เจ้าหน้าที่ออกหนังสือขาออกถึงกรม (ผ่านสารบรรณเดิม)', async () => {
      await officerSendsLetter(page, 'ปปท 0001/3114')
      const c = await readCase(page, CASE_NO)
      const letters = c?.officialLetters as Array<Record<string, unknown>>
      expect(letters).toHaveLength(1)
      expect(letters[0]).toMatchObject({ direction: 'outgoing', context: 'article14', registryNo: 'ปปท 0001/3114', agency: TARGET_AGENCY })
      expect(letters[0].sentAt).toBeTruthy()
    })

    // WIT0860 🟡 ผังให้ "รับหนังสือตอบรับขาเข้า" — ต้นแบบมีฟอร์มบันทึกเลขหนังสือตอบรับ ผู้ประสาน วันนัด และไฟล์แล้ว
    await test.step('WIT0860 · บันทึกหนังสือตอบรับจากกรม (เลขที่ ผู้ประสาน วันนัด ไฟล์แนบ)', async () => {
      await expect(page.getByTestId('article14-reply-form')).toBeVisible()
      await page.getByPlaceholder('เลขที่หนังสือตอบรับของกรม').fill('ยธ 0501/2569')
      await page.getByPlaceholder('ผู้ประสานของกรม').fill('นายประสาน ตอบรับ')
      await page.getByLabel('วันนัดส่งมอบ').fill('2026-10-10')
      await page.getByTestId('article14-reply-file').setInputFiles({
        name: 'หนังสือตอบรับกรม.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock'),
      })
      await page.getByTestId('article14-record-reply').click()
      await confirmDialog(page, 'ยืนยันบันทึก')
      await expect(page.getByTestId('article14-reply-summary')).toBeVisible()
      const a14 = await a14Of(page)
      expect(JSON.stringify(a14)).toContain('ยธ 0501/2569')
    })

    // WIT0861 🟡 ผังมีนัดวัน-เวลา-สถานที่ ผู้ส่ง/ผู้รับ ชี้แจงพยาน แนบหลักฐาน — ต้นแบบมีแค่วันส่งมอบจริง วันเริ่ม และฐานกฎหมาย
    await test.step('WIT0861 · กรอกวันส่งมอบจริงและฐานกฎหมายของหน่วยงานใหม่', async () => {
      await page.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่').fill('2026-10-10')
      await page.getByLabel('ฐานกฎหมายของหน่วยงานใหม่').fill('มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ')
    })

    await test.step('WIT0862 · เริ่มมาตรการภายใต้หน่วยงานใหม่ (ยืนยันส่งมอบ)', async () => {
      await page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }).click()
      await confirmDialog(page, 'ยืนยันส่งมอบ', 'Episode')
      const a14 = await a14Of(page)
      expect(a14.step).toBe('handover_done')
      expect(a14.successorStartedAt).toContain('2026-10-10')
      expect(a14.successorLegalBasis).toBe('มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ')
      await expect(page.getByText(/ส่งมอบให้กรมคุ้มครองสิทธิฯ เรียบร้อยแล้ว/)).toBeVisible()
    })

    await test.step('WIT0863 · ปิด Episode ป.ป.ท. และเชื่อม Episode ของกรม (ระบบทำเอง)', async () => {
      const c = await readCase(page, CASE_NO)
      const episode = c?.episode as Record<string, unknown>
      expect(episode.closedAt).toBeTruthy()
      expect(episode.successorAgency).toBe(TARGET_AGENCY)
      expect(String(episode.successorStartedAt)).toContain('2026-10-10')
      expect(c?.stage).toBe('transferred')
    })
  })

  test('J08-a · [ทางแยก] ผบช./เลขาธิการฯ ส่งคืนแก้ไข → เจ้าหน้าที่เสนอ Revision ใหม่ → เดินต่อจนถึงคิวคณะกรรมการ', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854 · เจ้าหน้าที่เสนอข้อ 14 รอบแรก', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูง', 'general')
      expect((await a14Of(page)).step).toBe('supervisor_review')
    })

    await test.step('WIT0855 · ◇ ผบช.ชั้นต้นส่งคืนแก้ไข (บันทึก Revision)', async () => {
      await reviewerReturns(page, 'supervisor', 'ข้อมูลประเมินความเสี่ยงยังไม่อ้างอิง คบ.13 ล่าสุด')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('proposal_draft')
      expect(a14.revisions).toHaveLength(1)
      expect(a14.revisions[0].reason).toContain('คบ.13')
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('WIT0854 · เจ้าหน้าที่เห็นเหตุผลที่ส่งคืนและเสนอ Revision ใหม่', async () => {
      await switchRole(page, 'officer')
      await page.goto(ARTICLE14_URL)
      await expect(page.getByText(/ส่งคืนแก้ไขแล้ว 1 ครั้ง/)).toContainText('คบ.13')
      // ฟอร์ม Revision ว่างเมื่อโหลดหน้าใหม่ — ต้องกรอกทั้งเหตุภัยและผลประเมินอีกครั้ง
      await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ภัยยังคงอยู่')
      await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill('อ้างอิง คบ.13 รอบล่าสุด ความเสี่ยงสูงต่อเนื่อง')
      await page.getByTestId('submit-article14-proposal').click()
      await confirmDialog(page, 'ยืนยันเสนอ', 'Revision ใหม่')
      expect((await a14Of(page)).step).toBe('supervisor_review')
    })

    await test.step('WIT0855 · ผบช.ชั้นต้นเห็นชอบ Revision ใหม่', async () => {
      await reviewerEndorses(page, 'supervisor', 'แก้ไขครบแล้ว เห็นชอบ')
      expect((await a14Of(page)).step).toBe('secretary_review')
    })

    await test.step('WIT0856 · ◇ เลขาธิการฯ ส่งคืนแก้ไข', async () => {
      await reviewerReturns(page, 'secretary', 'ขอให้ระบุมาตรการที่เสนอให้ชัดเจนขึ้น')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('proposal_draft')
      // ต้นแบบเก็บเฉพาะ Revision รอบล่าสุดที่ถูกส่งคืน (การเสนอ Revision ใหม่ล้างรายการเดิม) — ผังให้เก็บทุก Revision
      expect(a14.revisions).toHaveLength(1)
      expect(a14.revisions[0].reason).toContain('ชัดเจน')
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('WIT0854/0855/0856 · เสนอ Revision ใหม่ ผ่านทั้งสองชั้นตามลำดับเดิม ไม่ข้ามชั้น', async () => {
      await switchRole(page, 'officer')
      await page.goto(ARTICLE14_URL)
      await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ภัยยังคงอยู่')
      await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill('ความเสี่ยงสูงต่อเนื่อง')
      await page.getByLabel('ความเห็นว่าควรใช้มาตรการใด').selectOption('special')
      await page.getByTestId('submit-article14-proposal').click()
      await confirmDialog(page, 'ยืนยันเสนอ', 'Revision ใหม่')
      // กลับเริ่มที่ ผบช.ชั้นต้นก่อนเสมอ
      expect((await a14Of(page)).step).toBe('supervisor_review')
      await reviewerEndorses(page, 'supervisor', 'เห็นชอบ')
      await reviewerEndorses(page, 'secretary', 'เห็นชอบเสนอคณะกรรมการ')
      const a14 = await a14Of(page)
      expect(a14.step).toBe('committee_pending')
      expect(a14.recommendedMeasure).toBe('special')
    })
  })

  test('J08-b · [ทางแยก] คณะกรรมการไม่เห็นชอบส่งกรม → บันทึกมติ คุ้มครองตามคำสั่งเดิมต่อ (ชี้ไปแท็บ 11C)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854 · เจ้าหน้าที่เสนอข้อ 14', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูงต่อเนื่อง', 'general')
    })
    await test.step('WIT0855 · ผบช.ชั้นต้นเห็นชอบ', async () => {
      await reviewerEndorses(page, 'supervisor', 'เห็นชอบ')
    })
    await test.step('WIT0856 · เลขาธิการฯ เสนอคณะกรรมการ', async () => {
      await reviewerEndorses(page, 'secretary', 'เห็นควรเสนอคณะกรรมการ')
      expect((await a14Of(page)).step).toBe('committee_pending')
    })

    await test.step('WIT0857 · ◇ คณะกรรมการมติ "ไม่เห็นชอบ"', async () => {
      await committeeResolves(page, false, 'มติที่ 32/2569', 'ยังไม่เห็นชอบส่งกรม เห็นควรคุ้มครองต่อตามคำสั่งเดิม')
    })

    await test.step('WIT0858 · บันทึกมติและเหตุผล คุ้มครองตามคำสั่งเดิมต่อ', async () => {
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('committee_rejected')
      expect(a14.committeeApproved).toBe(false)
      expect(a14.committeeResolutionNo).toBe('มติที่ 32/2569')
      expect(String(c?.status)).toContain('ไม่เห็นชอบ')
      // ไม่ส่งมอบ/ไม่ปิด Episode — มาตรการเดิมยังมีผล
      expect(c?.stage).toBe('article14') // เปิดเรื่องข้อ 14 แล้ว ยังไม่ส่งมอบ (ไม่ใช่ transferred)
      expect((c?.episode as Record<string, unknown>)?.closedAt).toBeFalsy()
      await expect(page.getByText(/คณะกรรมการไม่เห็นชอบ \(มติที่/)).toBeVisible()
      // ไม่มีทางออกหนังสือถึงกรมได้อีก — ลิงก์ไปกระบวนการยุติ (แท็บ 11C) เมื่อมาตรการเดิมสิ้นสุด
      await expect(page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)')).toHaveCount(0)
      await expect(page.getByRole('link', { name: 'กระบวนการยุติ' })).toBeVisible()
      expect((c?.officialLetters as unknown[]) || []).toHaveLength(0)
    })
  })

  test('J08-c · [ทางแยก] กรมแจ้งว่าดำเนินการไม่ได้ → เสนอผู้มีอำนาจทันที มาตรการเดิมไม่ขาดช่วง', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854-WIT0857 · เสนอ → ผบช. → เลขาธิการฯ → คณะกรรมการเห็นชอบ', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูงต่อเนื่อง', 'special')
      await reviewerEndorses(page, 'supervisor', 'เห็นชอบ')
      await reviewerEndorses(page, 'secretary', 'เห็นควรเสนอคณะกรรมการ')
      await committeeResolves(page, true, 'มติที่ 33/2569', 'เห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ')
      expect((await a14Of(page)).step).toBe('letter_sent')
    })

    await test.step('WIT0859 · ออกหนังสือขาออกถึงกรม', async () => {
      await officerSendsLetter(page, 'ปปท 0001/3200')
    })

    // WIT0860 🟡 ผังให้เสนอผู้มีอำนาจทันทีเมื่อกรมดำเนินการไม่ได้ — ต้นแบบเปิดงานเสนอ ผบช.ชั้นต้น → ผอ. ในการ์ดเดียวกัน
    await test.step('WIT0860 · ◇ กรมแจ้งว่าดำเนินการไม่ได้ → เปิดงานเสนอ ผบช.ชั้นต้น', async () => {
      await page.getByPlaceholder('ระบุเหตุผลตามหนังสือแจ้งของกรม').fill('กรมแจ้งว่าเกินอำนาจรับผู้ถูกคุกคามระดับสูง')
      await page.getByPlaceholder(/เช่น คงมาตรการเดิม/).fill('คงมาตรการเดิมของ ป.ป.ท. ไว้ก่อน ระหว่างเสนอหน่วยงานอื่น')
      await page.getByTestId('article14-delivery-failed').click()
      await confirmDialog(page, 'ยืนยันบันทึก', 'ผบช.ชั้นต้น')

      const c = await readCase(page, CASE_NO)
      expect((c?.article14 as A14).step).toBe('delivery_failed')
      const proposals = c?.article14EscalationProposals as Array<Record<string, unknown>>
      expect(proposals).toHaveLength(1)
      expect(proposals[0].stage).toBe('supervisor')
      expect(c?.owner).toBe(SUPERVISOR)
      // มาตรการเดิมยังมีผล ไม่ขาดช่วง และไม่ปิด Episode
      expect((c?.episode as Record<string, unknown>)?.closedAt).toBeFalsy()
      expect(c?.stage).not.toBe('transferred')
      await expect(page.getByTestId('article14-escalation-card')).toBeVisible()
      await expect(page.getByTestId('article14-escalation-status')).toContainText('รอ ผบช.ชั้นต้น พิจารณา')
    })
  })
})
