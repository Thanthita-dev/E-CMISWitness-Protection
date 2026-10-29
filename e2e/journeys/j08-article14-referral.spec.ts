import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'

/** ผ่านธุรการ: ขาไป ธุรการหน่วย → ธุรการสำนักงานเลขาธิการ · ขากลับ กลับกัน */
async function passArticle14Clerks(page: Page, caseNo: string, direction: 'up' | 'down') {
  const order = direction === 'up' ? (['receiver', 'secretary_receiver'] as const) : (['secretary_receiver', 'receiver'] as const)
  for (const clerk of order) await passSarabanCheckpoint(page, caseNo, clerk)
}
import { CASE_NO, confirmDialog, expectStage } from './journey-helpers'

/**
 * Journey J08 · ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14 (แท็บ 08C เส้นเดียว)
 *
 * ผัง: คุ้มครองสะสมใกล้ครบเพดาน 180 วันแต่ยังมีภัย (Case 5)
 *   WIT0852 รับกรณีข้อ 14 → WIT0854 เจ้าหน้าที่จัดทำข้อเสนอ
 *   → พิจารณาตามลำดับชั้น ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ
 *   → ส่งคืนเจ้าหน้าที่ → WIT0859 บันทึกการนำส่งหนังสือ → WIT0860 บันทึกการได้รับหนังสือตอบรับ → WIT0861 ส่งมอบ
 *   → WIT0862 เริ่มมาตรการภายใต้หน่วยงานใหม่ → WIT0863 ปิด Episode เดิม/เชื่อม Episode กรม
 *   ส่งคืนแก้ไขชั้นใดก็ได้ → เจ้าหน้าที่จัดทำ Revision (เพิ่มหนังสือแจ้งกรมฯ ฉบับใหม่) → แก้หนังสือในแฟ้ม → ส่งให้พิจารณาตามลำดับชั้นเอง
 *
 * ลำดับบทบาท: เจ้าหน้าที่ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ → เจ้าหน้าที่
 * ทุกเทสต์เริ่มจาก mock state "Case 5" เพียงครั้งเดียว แล้วเดินผ่าน UI ล้วน (ไม่ seed ซ้ำกลางทาง)
 */

const ARTICLE14_URL = '/article14'
const TARGET_AGENCY = 'สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
/** ลำดับชั้นพิจารณาเรื่องส่งต่อกรม — ทั้งเสนอครั้งแรกและ Revision */
const CHAIN = ['supervisor', 'director', 'deputy_secretary', 'secretary'] as const

type A14 = Record<string, any>
const a14Of = async (page: Page) => (await readCase(page, CASE_NO))?.article14 as A14

/**
 * WIT0852/WIT0854 — เจ้าหน้าที่เห็นแฟ้มที่ใกล้เพดานและจัดทำข้อเสนอ → ระบบสร้างหนังสือแจ้งกรมฯ ฉบับที่ 1 แล้วพาเข้าแฟ้ม
 * แล้วเจ้าหน้าที่กด "ส่งให้ผู้บังคับบัญชาชั้นต้น" ที่การ์ดท้ายแฟ้ม
 */
async function officerPreparesProposal(page: Page, threat: string, risk: string) {
  await page.goto(ARTICLE14_URL)
  await expect(page.getByText(CASE_NO).first()).toBeVisible()
  await expect(page.getByText(/คุ้มครองสะสม [\d.]+ เดือน/)).toBeVisible()
  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill(threat)
  await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill(risk)
  await page.getByTestId('submit-article14-proposal').click()
  await confirmDialog(page, 'ยืนยันจัดทำ', 'ส่งให้ผู้บังคับบัญชาชั้นต้น')
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
  // ยังไม่ส่ง — เรื่องอยู่กับเจ้าหน้าที่ให้จัดทำหนังสือก่อน
  expect((await a14Of(page)).step).toBe('proposal_draft')
  await expect(page.getByTestId('article14-letter-version')).toContainText('ฉบับที่ 1')
  await officerSubmitsRevisionFromDossier(page)
}

/** ส่งคืนแก้ไขแล้ว — เจ้าหน้าที่จัดทำ Revision ใหม่ ระบบเพิ่มหนังสือแจ้งกรมฯ (แบบ 18) ฉบับใหม่แล้วพาเข้าแฟ้ม (ยังไม่ส่งตามลำดับชั้น) */
async function officerPreparesRevision(page: Page, threat: string, risk: string) {
  await switchRole(page, 'officer')
  await page.goto(ARTICLE14_URL)
  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill(threat)
  await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill(risk)
  await page.getByTestId('submit-article14-proposal').click()
  await confirmDialog(page, 'ยืนยันจัดทำ', 'หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ฉบับใหม่')
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/** เจ้าหน้าที่กด "ส่งให้พิจารณาตามลำดับชั้น" ที่การ์ดท้ายแฟ้ม */
async function officerSubmitsRevisionFromDossier(page: Page) {
  const footer = page.getByTestId('article14-review-footer')
  await expect(footer).toBeVisible()
  // ยังไม่ได้เปิดและบันทึกหนังสือฉบับปัจจุบัน — ปุ่มส่งยังกดไม่ได้ และไม่มีปุ่มแก้ไขหนังสือในการ์ด
  await expect(footer.getByTestId('article14-submit-review')).toBeDisabled()
  await expect(footer.getByTestId('article14-letter-unsaved')).toBeVisible()
  await expect(footer.getByRole('link', { name: /แก้ไขหนังสือ/ })).toHaveCount(0)
  await officerSavesLetter(page)
  await footer.getByTestId('article14-submit-review').click()
  await confirmDialog(page, 'ยืนยันส่ง', 'ผู้บังคับบัญชาชั้นต้น')
}

/** เปิดแบบฟอร์มหนังสือจากแถวในแฟ้ม แล้วกด "บันทึกหนังสือ" — ปลดล็อกปุ่มส่งของฉบับนั้น */
async function officerSavesLetter(page: Page) {
  await page.locator('[data-testid="dossier-form-row"][data-form-number="18"]').getByText('เปิดแบบฟอร์ม').click()
  await expect(page).toHaveURL(/\/form\/18/)
  await page.getByRole('button', { name: /บันทึกหนังสือ$/ }).click()
  await page.goto(`/dossier/${encodeURIComponent(CASE_NO)}`)
  await expect(page.getByTestId('article14-review-footer').getByTestId('article14-submit-review')).toBeEnabled()
}

/** ทุกชั้นเห็นชอบตามลำดับ จนเลขาธิการเห็นชอบและส่งคืนเจ้าหน้าที่ */
async function chainEndorses(page: Page, note = 'เห็นชอบ') {
  for (const role of CHAIN) await reviewerEndorses(page, role, note)
}

/** WIT0855/WIT0856 — ผู้ตรวจแต่ละชั้นกดเห็นชอบ (หน้า /article14 ตามบทบาทที่สลับ) */
async function reviewerEndorses(page: Page, role: string, note: string) {
  await switchRole(page, role)
  await page.goto(ARTICLE14_URL)
  await page.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข').fill(note)
  await page.getByTestId('article14-endorse-button').click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ')
  // ผอ. เสนอขึ้นสำนักงานเลขาธิการ / เลขาธิการเห็นชอบส่งผลกลับหน่วย → ผ่านธุรการก่อนผู้รับดำเนินการต่อ
  if (role === 'director') await passArticle14Clerks(page, CASE_NO, 'up')
  if (role === 'secretary') await passArticle14Clerks(page, CASE_NO, 'down')
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
  if (role === 'deputy_secretary' || role === 'secretary') await passArticle14Clerks(page, CASE_NO, 'down')
}

/** WIT0859 — เจ้าหน้าที่บันทึกการนำส่งหนังสือถึงกรม ผ่านเลขสารบรรณเดิม */
async function officerSendsLetter(page: Page, registryNo: string) {
  await switchRole(page, 'officer')
  await page.goto(ARTICLE14_URL)
  await expect(page.getByTestId('article14-secretary-approved')).toBeVisible()
  await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill(registryNo)
  await page.getByPlaceholder('ชื่อผู้รับ / หน่วยรับหนังสือ (ถ้ามี)').fill('งานสารบรรณ กรมคุ้มครองสิทธิฯ')
  await page.getByTestId('article14-record-delivery').click()
  await confirmDialog(page, 'ยืนยันบันทึก', registryNo)
  await expect(page.getByTestId('article14-delivery-summary')).toContainText(registryNo)
  await expect(page.getByTestId('article14-delivery-form')).toHaveCount(0)
}

test.describe('J08 · ส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14 (08C)', () => {
  test('J08 · ข้อ 14 ครบเส้น: จัดทำข้อเสนอ → ผบช. → ผอ. → รองเลขาฯ → เลขาฯ → บันทึกนำส่ง/ได้รับ → ส่งมอบ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0852 · รับกรณีข้อ 14 (ใกล้ครบเพดาน 178/180 วัน)', async () => {
      await page.goto(ARTICLE14_URL)
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await expect(page.getByText(/คุ้มครองสะสม [\d.]+ เดือน/)).toBeVisible()
      await expect(page.getByTestId('article14-near-cap-hint')).toBeVisible()
      const c = await readCase(page, CASE_NO)
      expect(c?.article14).toBeFalsy()
      expect(c?.stage).toBe('protection')
    })

    // WIT0853 ◇ มีมติเห็นชอบแล้ว? — ยังไม่มี จึงแสดงฟอร์มจัดทำข้อเสนอ (ผังต่างเล็กน้อย: ไม่มีทางลัดข้ามไปออกหนังสือ)
    await test.step('WIT0854 · เจ้าหน้าที่จัดทำเรื่องเสนอข้อ 14 (เหตุภัย + ประเมินความเสี่ยง)', async () => {
      await officerPreparesProposal(
        page,
        'ยังมีกลุ่มผู้มีอิทธิพลติดตามคุกคามต่อเนื่องแม้คุ้มครองสะสมใกล้ครบ 180 วัน',
        'อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม ความเสี่ยงระดับสูง ยังไม่มีสัญญาณภัยลดลง'
      )
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('supervisor_review')
      expect(a14.threatSummary).toContain('ติดตามคุกคาม')
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0855 · ผบช.ชั้นต้นเห็นชอบ → เสนอ ผอ.สำนัก/กอง', async () => {
      await reviewerEndorses(page, 'supervisor', 'ตรวจเหตุภัย ระยะสะสม และข้อเสนอแล้ว เห็นชอบเสนอ ผอ.สำนัก/กอง')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('director_review')
      expect(a14.supervisorNote).toContain('เห็นชอบ')
      expect(a14.supervisorAt).toBeTruthy()
      expect(c?.owner).toBe(DIRECTOR)
    })

    await test.step('ผอ.สำนัก/กอง เห็นชอบ → เสนอรองเลขาธิการ (งานขึ้นในคิวของฉัน)', async () => {
      await switchRole(page, 'director')
      await page.goto('/queue/director')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await reviewerEndorses(page, 'director', 'เห็นชอบเสนอรองเลขาธิการ')
      expect((await a14Of(page)).step).toBe('deputy_review')
    })

    await test.step('รองเลขาธิการเห็นชอบ → เสนอเลขาธิการ', async () => {
      await reviewerEndorses(page, 'deputy_secretary', 'เห็นชอบเสนอเลขาธิการ')
      expect((await a14Of(page)).step).toBe('secretary_review')
    })

    await test.step('WIT0856 · เลขาธิการเห็นชอบ → ส่งคืนเจ้าหน้าที่ดำเนินการส่งกรม (ไม่ผ่านมติคณะกรรมการ)', async () => {
      await reviewerEndorses(page, 'secretary', 'เห็นชอบส่งต่อกรมคุ้มครองสิทธิฯ')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('letter_sent')
      expect(a14.secretaryNote).toContain('เห็นชอบ')
      expect(a14.approvals.map((a: A14) => a.level)).toEqual([...CHAIN])
      expect(a14.committeeResolutionNo).toBeFalsy()
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('WIT0859 · เจ้าหน้าที่บันทึกการนำส่งหนังสือถึงกรม (ผ่านสารบรรณเดิม)', async () => {
      await officerSendsLetter(page, 'ปปท 0001/3114')
      const c = await readCase(page, CASE_NO)
      const letters = c?.officialLetters as Array<Record<string, unknown>>
      expect(letters).toHaveLength(1)
      expect(letters[0]).toMatchObject({ direction: 'outgoing', context: 'article14', registryNo: 'ปปท 0001/3114', agency: TARGET_AGENCY })
      expect(letters[0].sentAt).toBeTruthy()
    })

    // WIT0860 🟡 ผังให้ "รับหนังสือตอบรับขาเข้า" — ต้นแบบมีฟอร์มบันทึกเลขหนังสือตอบรับ ผู้ประสาน วันนัด และไฟล์แล้ว
    await test.step('WIT0860 · บันทึกการได้รับหนังสือตอบรับจากกรม (เลขที่ ผู้ประสาน วันนัด ไฟล์แนบ)', async () => {
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

  test('J08-a · [ทางแยก] ส่งคืนแก้ไข → Revision เพิ่มหนังสือแจ้งกรมฯ ฉบับใหม่ → แก้ในแฟ้ม → ส่งตามลำดับชั้นเอง → เลขาฯ ส่งคืน → Revision อีกรอบจนเลขาฯ เห็นชอบ', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854 · เจ้าหน้าที่เสนอข้อ 14 รอบแรก', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูง')
      expect((await a14Of(page)).step).toBe('supervisor_review')
      // เสนอครั้งแรก — สร้างหนังสือแจ้งกรมฯ (แบบ 18) ฉบับที่ 1 เข้าแฟ้มพร้อมกัน
      expect((await a14Of(page)).letterVersion).toBe(1)
      expect((await readCase(page, CASE_NO))?.extraForms).toContain(18)
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

    await test.step('WIT0854 · จัดทำ Revision ใหม่ → เพิ่มหนังสือแจ้งกรมฯ ฉบับที่ 2 แล้วพาเข้าแฟ้ม เรื่องยังอยู่กับเจ้าหน้าที่', async () => {
      await switchRole(page, 'officer')
      await page.goto(ARTICLE14_URL)
      await expect(page.getByText(/ส่งคืนแก้ไขแล้ว 1 ครั้ง/)).toContainText('คบ.13')
      await officerPreparesRevision(page, 'ภัยยังคงอยู่', 'อ้างอิง คบ.13 รอบล่าสุด ความเสี่ยงสูงต่อเนื่อง')
      await expect(page.getByTestId('article14-letter-version')).toContainText('ฉบับที่ 2')
      // เส้นทางข้อ 14 — หมุด 13 เป็น "ส่งต่อกรมคุ้มครองสิทธิฯ" และไม่มีหมุดคำสั่งยุติ/ปิดงาน
      const tracker = page.getByTestId('dossier-stage-tracker')
      await expect(tracker.getByRole('listitem')).toHaveCount(13)
      await expect(tracker.getByRole('listitem').last()).toContainText('ส่งต่อกรมคุ้มครองสิทธิฯ')
      await expect(tracker).not.toContainText('คำสั่งยุติ/ปิดงาน')
      await expect(tracker).toContainText('ส่งมอบให้กรมคุ้มครองสิทธิฯ')
      await expect(page.getByTestId('article14-revision-prepared')).toContainText('ฉบับที่ 2')
      await page.screenshot({ path: test.info().outputPath('article14-revision-dossier.png'), fullPage: false })
      const c = await readCase(page, CASE_NO)
      expect((c?.article14 as A14).step).toBe('proposal_draft')
      expect((c?.article14 as A14).letterVersion).toBe(2)
      expect(c?.article14LetterPreviousVersions).toHaveLength(1)
      expect(c?.extraForms).toContain(18)
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('เปิดแบบฟอร์มหนังสือฉบับที่ 2 แล้วบันทึก → จึงกด "ส่งให้ผู้บังคับบัญชาชั้นต้น" ได้', async () => {
      await officerSubmitsRevisionFromDossier(page)
      const c = await readCase(page, CASE_NO)
      expect((c?.article14 as A14).step).toBe('supervisor_review')
      expect((c?.article14 as A14).revisionPreparedAt).toBeFalsy()
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('ผบช. → ผอ. → รองเลขาฯ เห็นชอบ Revision ใหม่ (ผบช.เห็นชอบได้จากการ์ดท้ายแฟ้ม)', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(`/dossier/${encodeURIComponent(CASE_NO)}`)
      const footer = page.getByTestId('article14-review-footer')
      await footer.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข').fill('แก้ไขครบแล้ว เห็นชอบ')
      await footer.getByTestId('article14-endorse-button').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')
      expect((await a14Of(page)).step).toBe('director_review')
      await reviewerEndorses(page, 'director', 'เห็นชอบ')
      await reviewerEndorses(page, 'deputy_secretary', 'เห็นชอบ')
      expect((await a14Of(page)).step).toBe('secretary_review')
    })

    await test.step('WIT0856 · ◇ เลขาธิการส่งคืนแก้ไข', async () => {
      await reviewerReturns(page, 'secretary', 'ขอให้ระบุมาตรการที่เสนอให้ชัดเจนขึ้น')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('proposal_draft')
      // เก็บทุก Revision ที่ถูกส่งคืนตามผัง
      expect(a14.revisions).toHaveLength(2)
      expect(a14.revisions[1].reason).toContain('ชัดเจน')
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('Revision รอบ 3 → หนังสือแจ้งกรมฯ ฉบับที่ 3 → ส่งจากหน้า 08C → เริ่มที่ ผบช.ชั้นต้นเสมอ จนเลขาฯ เห็นชอบ', async () => {
      await officerPreparesRevision(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูงต่อเนื่อง')
      await expect(page.getByTestId('article14-letter-version')).toContainText('ฉบับที่ 3')
      expect((await a14Of(page)).step).toBe('proposal_draft')
      // ส่งจากหน้า 08C ก็ได้ — ฟอร์มจัดทำข้อเสนอไม่แสดงซ้ำระหว่างรอส่ง
      // หนังสือฉบับที่ 3 ยังไม่ได้บันทึก — ต้องเปิดฉบับใหม่ก่อนทุกครั้ง แม้เคยบันทึกฉบับที่ 2 แล้ว
      await expect(page.getByTestId('article14-review-footer').getByTestId('article14-submit-review')).toBeDisabled()
      await officerSavesLetter(page)
      await page.goto(ARTICLE14_URL)
      await expect(page.getByTestId('submit-article14-proposal')).toHaveCount(0)
      await page.getByTestId('article14-submit-review').click()
      await confirmDialog(page, 'ยืนยันส่ง')
      expect((await a14Of(page)).step).toBe('supervisor_review')
      await chainEndorses(page)
      const a14 = await a14Of(page)
      expect(a14.step).toBe('letter_sent')
      expect(a14.approvals).toHaveLength(4)
    })
  })

  test('J08-b · [ทางแยก] ผอ.สำนัก/กอง ส่งคืนแก้ไข → กลับเจ้าหน้าที่ · เห็นงานในคิวตามชั้น', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854 · เจ้าหน้าที่เสนอข้อ 14', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูงต่อเนื่อง')
    })
    await test.step('ผบช.ชั้นต้นเห็นชอบ — แฟ้มขึ้นในคิวของ ผบช. ก่อนกด', async () => {
      await switchRole(page, 'supervisor')
      await page.goto('/queue/supervisor')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await reviewerEndorses(page, 'supervisor', 'เห็นชอบ')
    })
    await test.step('ผอ.สำนัก/กอง ◇ ส่งคืนแก้ไข → เรื่องกลับเจ้าหน้าที่ ความเห็น ผบช. ไม่ถือว่าผ่านรอบใหม่', async () => {
      await reviewerReturns(page, 'director', 'ขอเอกสารประกอบเหตุภัยเพิ่มเติม')
      const c = await readCase(page, CASE_NO)
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('proposal_draft')
      expect(a14.revisions.at(-1).by).toBe(DIRECTOR)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.stage).toBe('article14')
      expect((c?.officialLetters as unknown[]) || []).toHaveLength(0)
    })
  })

  test('J08-c · [ทางแยก] กรมแจ้งว่าดำเนินการไม่ได้ → เสนอผู้มีอำนาจทันที มาตรการเดิมไม่ขาดช่วง', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 5', 'officer')

    await test.step('WIT0854-WIT0856 · เสนอ → ผบช. → ผอ. → รองเลขาฯ → เลขาฯ เห็นชอบ', async () => {
      await officerPreparesProposal(page, 'ภัยยังคงอยู่', 'ความเสี่ยงสูงต่อเนื่อง')
      await chainEndorses(page)
      expect((await a14Of(page)).step).toBe('letter_sent')
    })

    await test.step('WIT0859 · บันทึกการนำส่งหนังสือถึงกรม', async () => {
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
