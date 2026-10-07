import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 09B · WIT0911 → WIT0922 — รับอุทธรณ์ กลั่นกรอง และเสนอคณะกรรมการ (TC-108 .. TC-116)
 *
 * ผัง: WIT0911/WIT0912 รับความประสงค์อุทธรณ์ (หนังสือ/วาจา) → WIT0913 ผูกคำอุทธรณ์กับแฟ้มเดิม
 *      → **WIT0914** ตรวจครบถ้วนและคำนวณกรอบ 30 วัน (ล่าช้าให้บันทึกเหตุผลและจัดทำแฟ้มเสนอ
 *      **ไม่ปัดตกอัตโนมัติ**) → **WIT0915** เจ้าหน้าที่บันทึกความเห็น → **WIT0916** ผบช.ชั้นต้นลงนามเสนอ
 *      → **WIT0917** รองเลขาธิการฯ กลั่นกรอง → **WIT0918** เลขาธิการฯ ส่งเสนอคณะกรรมการ
 *      → WIT0919 บรรจุวาระ → **WIT0920 คณะกรรมการวินิจฉัย**
 *          "ยืนคำสั่งเดิม" → **WIT0921** หนังสือแจ้งผล + เก็บหลักฐานรับ + ปิดขั้นอุทธรณ์
 *          "เปลี่ยนคำสั่ง" → **WIT0922** หนังสือแจ้งผล + กลับ 08A ไม่สร้าง คบ.1 ใหม่
 *
 * จุดที่เทสต์ในไฟล์นี้กัน:
 * 1. WIT0911/WIT0912 — ฟอร์มรับอุทธรณ์เดียวใช้ทุกช่องทาง (หนังสือ/วาจา) บันทึกเลขรับสารบรรณกลาง/วันที่รับครั้งแรก
 *    (หนังสือ) หรือถ้อยคำและลายมือชื่อผู้ยื่น (วาจา) ไว้ครบ — ไม่มีเลข คบ. ไม่ว่าช่องทางใด
 * 2. WIT0914 — เคสที่ยื่นเกิน 30 วันต้องไม่หายจากระบบ ต้องบันทึกเหตุผลและให้ ผบช.ชั้นต้นรับไว้
 * 3. WIT0915-WIT0918 — ทุกชั้นเขียนสถานะแฟ้มจริง และข้ามลำดับชั้นไม่ได้
 * 4. WIT0921/WIT0922 — บันทึกมติอย่างเดียวไม่พอ ต้องมีร่องรอยว่าแจ้งผลถึงพยานแล้ว
 * 5. WIT1147 — อุทธรณ์คำสั่งยุติ (คบ.17) เดินผ่านฟอร์มรับอุทธรณ์เดียวกับ 09B สร้างแฟ้มอุทธรณ์ (appealFolder)
 *    ให้ทันที ผูกกับแฟ้มเดิม และเดินลำดับชั้น WIT0915-919 ต่อได้จริง
 */

const CASE_NO = 'WP-2569-000501'
const APPEAL_URL = `/appeal-folder/${CASE_NO}`
const DOSSIER_URL = `/dossier/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'
const SECRETARY = 'นายสุรศักดิ์ ธรรมพิทักษ์'
const COMMITTEE = 'นางสาวปิยะนุช เลขะกุล'

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString()

/** ตั้งต้นที่ WIT0908/WIT0911 — คบ.10 ลงนามและถึงมือพยานแล้ว อยู่ในกรอบ 30 วัน ยังไม่มีใครยื่นอุทธรณ์ */
const AT_PRE_APPEAL = {
  stage: 'notice',
  activity7State: 'rejected',
  activity7Label: 'ไม่อนุมัติให้การคุ้มครอง',
  extraForms: [10],
  nonApprovalStep: 3,
  kb10Signed: true,
  kb10SignedAt: '01/07/2569 10:00',
  outgoingSignedAt: '01/07/2569 10:00',
  dispatchedAt: '02/07/2569 09:00',
  dispatchChannel: 'ไปรษณีย์ตอบรับด่วน (EMS)',
  deliveredAt: iso(-5),
  appealDueAt: iso(25),
  appealFiledAt: undefined,
  appealFolder: undefined,
  decisionNumber: 'ลธ.ปปท./000501/2569',
}

/** ตั้งต้นที่ WIT0913 — คำอุทธรณ์เข้าแฟ้มแล้ว ยื่นภายในกรอบ 30 วัน รอตรวจที่ WIT0914 */
const AT_APPEAL_RECEIVED = {
  stage: 'appeal',
  activity7State: 'committee',
  appealAgainst: 'kb10',
  decisionNumber: 'ลธ.ปปท./000501/2569',
  deliveredAt: iso(-20),
  appealDueAt: iso(10),
  appealFiledAt: iso(-5),
  appealReason: 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา',
  appealFolder: { stage: 'received' },
  appealResolution: undefined,
}

/** ตั้งต้นเดียวกัน แต่ยื่นช้ากว่ากำหนด 12 วัน — ผังห้ามปัดตกอัตโนมัติ */
const AT_APPEAL_LATE = {
  ...AT_APPEAL_RECEIVED,
  deliveredAt: iso(-60),
  appealDueAt: iso(-30),
  appealFiledAt: iso(-18),
}

/** ตั้งต้นที่ WIT0920 — แฟ้มผ่านลำดับชั้นครบและบรรจุวาระแล้ว รอคณะกรรมการวินิจฉัย */
const AT_AGENDA = {
  ...AT_APPEAL_RECEIVED,
  appealFolder: {
    stage: 'agenda',
    checkedAt: '01/08/2569 09:00',
    checkedBy: OFFICER,
    lateDays: 0,
    officerOpinion: { at: '01/08/2569 09:10', by: OFFICER, note: 'เอกสารครบ' },
    supervisorOpinion: { at: '02/08/2569 09:00', by: SUPERVISOR, note: 'เห็นควรเสนอ' },
    directorOpinion: { at: '02/08/2569 15:00', by: 'นายวีระยุทธ พิทักษ์ธรรม', note: 'ลงนามเสนอ' },
    deputyOpinion: { at: '03/08/2569 09:00', by: DEPUTY, note: 'กลั่นกรองแล้ว' },
    secretaryOpinion: { at: '04/08/2569 09:00', by: SECRETARY, note: 'ส่งเสนอคณะกรรมการ' },
    agendaNo: 'วาระที่ 4.2 ครั้งที่ 9/2569',
    agendaAt: '05/08/2569 09:00',
    agendaBy: COMMITTEE,
  },
}

/** ตั้งต้นที่ WIT1145/WIT1146 — คบ.16/17 ลงนามและนำส่งแล้ว พยานรับ คบ.17 แล้ว อยู่ในกรอบอุทธรณ์ */
const KB17_APPEAL_READY = {
  stage: 'protection',
  activity7State: 'approved',
  closedAt: undefined,
  appealAgainst: undefined,
  appealFolder: undefined,
  kb16: { signedAt: '01/08/2569 09:00', effectiveAt: '05/08/2569', locked: false },
  kb17: {
    documentName: 'คบ17_แจ้งคำสั่งยุติ.pdf',
    status: 'submitted',
    signedAt: '02/08/2569 09:00',
    registryNo: 'ปปท 0007/9999',
    registryDate: '05/08/2569',
    dispatchedAt: '05/08/2569',
    deliveredAt: iso(-5),
    appealDueAt: iso(25),
  },
}

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

async function cancelDialog(page: Page) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** หา input/select/textarea ที่เป็น sibling ถัดจาก label ข้อความที่ระบุ — การ์ดนี้ไม่มี data-testid ให้ใช้ */
function fieldAfterLabel(scope: ReturnType<Page['locator']>, labelText: string) {
  return scope.locator('label', { hasText: labelText }).locator('xpath=following-sibling::*[1]')
}

/** บันทึกความเห็นหนึ่งชั้นแล้วส่งต่อ (WIT0915-WIT0918) */
async function giveOpinion(page: Page, role: string, note: string, expectedText?: string | RegExp) {
  await switchRole(page, role)
  await page.getByTestId('appeal-opinion-note').fill(note)
  await page.getByTestId('appeal-opinion-submit').click()
  await confirmDialog(page, 'ยืนยัน', expectedText)
}

test.describe('WIT0911 / WIT0912 / WIT0913 — รับความประสงค์อุทธรณ์และผูกกับแฟ้มเดิม', () => {
  test('TC-108 · [Happy] รับอุทธรณ์เป็นหนังสือ — บันทึกเลขรับสารบรรณกลางและวันที่รับ แล้วเสนอตามลำดับชั้นจนถึงคณะกรรมการ', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_PRE_APPEAL)
    await page.goto(DOSSIER_URL)

    const appealSection = page
      .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await expect(appealSection).toBeVisible()

    // WIT0911/WIT0912 — ช่องทางหนังสือต้องมีช่องบันทึกเลขรับสารบรรณกลางและวันที่รับครั้งแรก
    await expect(appealSection.getByText('ช่องทางการยื่นอุทธรณ์')).toBeVisible()
    await appealSection.getByTestId('appeal-intake-channel-letter').click()

    await fieldAfterLabel(appealSection, 'เหตุผลในการอุทธรณ์').fill(
      'มีหนังสือร้องเรียนจากภายนอกยืนยันข้อเท็จจริงใหม่ ยื่นผ่านสารบรรณกลาง เลขรับ 512/2569'
    )

    // ขาดเลขรับสารบรรณกลาง — ยังยื่นไม่ได้
    await appealSection.getByTestId('appeal-intake-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await appealSection.getByTestId('appeal-intake-registry-no').fill('512/2569')
    await appealSection.getByTestId('appeal-intake-first-received').fill('2026-08-01')
    await appealSection.getByTestId('appeal-intake-evidence-file').setInputFiles({
      name: 'หนังสืออุทธรณ์_512-2569.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    })
    await appealSection.getByTestId('appeal-intake-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const filed = await readCase(page, CASE_NO)
    expect((filed?.appealFolder as Record<string, unknown> | undefined)?.stage).toBe('received')

    // E-CMIS ต้องเก็บเลขรับสารบรรณกลางและวันที่รับครั้งแรกไว้ในระบบ
    const intake = (filed?.appealFolder as Record<string, any>).intake as Record<string, unknown>
    expect(intake.channel).toBe('letter')
    expect(intake.registryNo).toBe('512/2569')
    expect(intake.firstReceivedAt).toBe('2026-08-01')
    expect(intake.evidenceDocumentName).toContain('512-2569')

    // ---- ต่อจากนี้คือ WIT0914-WIT0919 เดินลำดับชั้นจนถึงคณะกรรมการ ----
    await page.goto(APPEAL_URL)
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน')

    await page.getByTestId('appeal-opinion-note').fill('ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'ผบช.ชั้นต้น')

    // ผัง 09B: ผบช.ชั้นต้น (WIT0915) → ผอ.สำนัก/กอง (WIT0916) → รองเลขาธิการฯ — ผบช.เสนอข้ามไป รองเลขาธิการฯ ไม่ได้
    await giveOpinion(page, 'supervisor', 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ ผอ.สำนัก/กอง', 'ผอ.สำนัก/กอง')
    await giveOpinion(page, 'director', 'ตรวจแล้ว ลงนามเสนอรองเลขาธิการฯ', 'รองเลขาธิการฯ')
    await giveOpinion(page, 'deputy_secretary', 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบ', 'ผ่านการกลั่นกรองแล้ว')

    await switchRole(page, 'secretary')
    await expect(page.getByTestId('appeal-opinion-secretary')).toContainText('ไม่ใช่ผู้วินิจฉัยอุทธรณ์')
    await page.getByTestId('appeal-opinion-note').fill('รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'ฝ่ายเลขานุการคณะกรรมการ')

    await switchRole(page, 'committee')
    await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
    await page.getByTestId('appeal-agenda-submit').click()
    await confirmDialog(page, 'ยืนยันบรรจุวาระ', 'คณะกรรมการ ป.ป.ท. วินิจฉัย')

    const folder = (await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>
    expect(folder.stage).toBe('agenda')
    expect(folder.agendaNo).toContain('9/2569')
  })

  test('TC-109 · [Happy] รับอุทธรณ์ด้วยวาจา — บันทึกถ้อยคำ ยืนยันลงลายมือชื่อ และแนบบันทึกที่ลงชื่อแล้ว ไม่มีเลข คบ.', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_PRE_APPEAL)
    await page.goto(DOSSIER_URL)

    const appealSection = page
      .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

    await fieldAfterLabel(appealSection, 'เหตุผลในการอุทธรณ์').fill(
      'พยานแจ้งด้วยวาจาต่อเจ้าหน้าที่ ขอโต้แย้งคำสั่งไม่อนุมัติ เจ้าหน้าที่บันทึกถ้อยคำและให้ลงชื่อรับรอง'
    )
    await appealSection.getByTestId('appeal-intake-channel-oral').click()

    // ยังไม่กรอกถ้อยคำ/ไม่ติ๊กยืนยันลายมือชื่อ/ไม่แนบไฟล์ — ยื่นไม่ได้
    await appealSection.getByTestId('appeal-intake-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await appealSection.getByTestId('appeal-intake-statement').fill(
      'พยานแจ้งด้วยวาจาว่าขอโต้แย้งคำสั่งไม่อนุมัติ เนื่องจากมีข้อเท็จจริงใหม่ที่ยังไม่เคยเสนอมาก่อน'
    )
    // ยังไม่ติ๊กยืนยันลายมือชื่อ — ยื่นไม่ได้
    await appealSection.getByTestId('appeal-intake-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await appealSection.getByTestId('appeal-intake-signed').check()
    await appealSection.getByTestId('appeal-intake-signed-file').setInputFiles({
      name: 'บันทึกถ้อยคำอุทธรณ์_ลงชื่อแล้ว.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    })
    await appealSection.getByTestId('appeal-intake-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const filed = await readCase(page, CASE_NO)
    expect(filed?.appealDocumentName).toBeTruthy()
    expect(filed?.appealFolder).toBeTruthy()

    const intake = (filed?.appealFolder as Record<string, any>).intake as Record<string, unknown>
    expect(intake.channel).toBe('oral')
    expect(intake.appellantSigned).toBe(true)
    expect(String(intake.statement)).toContain('ข้อเท็จจริงใหม่')
    expect(String(intake.signedRecordDocumentName)).toContain('ลงชื่อแล้ว')

    // ไม่มีเลข คบ. ไม่ว่าช่องทางใด (ฟิลด์เอกสารเก็บชื่อไฟล์ ไม่ใช่เลขแบบฟอร์ม คบ.)
    expect(filed?.appealDocumentName).not.toMatch(/^คบ\./)
  })
})

test.describe('WIT0914 — ยื่นเกิน 30 วัน: บันทึกเหตุผลและเสนอ ห้ามปัดตกอัตโนมัติ', () => {
  test('TC-112 · [Negative] อุทธรณ์เกินกรอบ 30 วัน — ไม่ปัดตกอัตโนมัติ ต้องบันทึกเหตุผลแล้วให้ ผบช.ชั้นต้นรับเรื่องไว้', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_APPEAL_LATE)

    // เคสที่ยื่นเกินกำหนดต้องยังอยู่ในรายการอุทธรณ์ ไม่หายไปจากหน้าจอ ตั้งแต่ก่อนบันทึกเหตุผลด้วยซ้ำ
    await page.goto('/appeal')
    await expect(page.getByRole('link', { name: new RegExp(CASE_NO) }).first()).toBeVisible()
    await expect(page.getByTestId('appeal-late-group')).toHaveCount(0)

    await page.goto(APPEAL_URL)
    await expect(page.getByTestId('appeal-folder-stage')).toContainText('รอตรวจความครบถ้วน')

    // ไม่กรอกเหตุผลความล่าช้า — จอยืนยันต้องไม่ขึ้น
    await page.getByTestId('appeal-check-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    // กรอกแล้วยกเลิก — แฟ้มต้องไม่ขยับ
    await page.getByTestId('appeal-late-reason').fill('พยานเข้ารักษาตัวในโรงพยาบาลตลอดช่วงกรอบเวลาอุทธรณ์')
    await page.getByTestId('appeal-check-submit').click()
    await cancelDialog(page)
    expect(((await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>).stage).toBe('received')

    // ยืนยันจริง — ผังห้ามปัดตก แฟ้มจึงต้องเดินต่อไปหา ผบช.ชั้นต้น ไม่ใช่ถูกปิด
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันบันทึกเหตุผลและเสนอ', 'ไม่ปัดตกอัตโนมัติ')

    const afterCheck = await readCase(page, CASE_NO)
    const folder = afterCheck?.appealFolder as Record<string, unknown>
    expect(folder.stage).toBe('late_pending')
    expect(folder.lateDays).toBeGreaterThan(0)
    expect(String(folder.lateReason)).toContain('โรงพยาบาล')
    expect(afterCheck?.owner).toBe(SUPERVISOR)

    // เคสโผล่ในกลุ่ม "เกินกรอบ 30 วัน" ของหน้ารายการแล้ว
    await page.goto('/appeal')
    await expect(page.getByTestId('appeal-late-group')).toContainText('เกินกรอบ 30 วัน')

    // ผบช.ชั้นต้นรับเรื่องไว้ — แฟ้มเดินต่อเข้าชั้นความเห็นเจ้าหน้าที่ (ไม่ตัดสิทธิ์แทนคณะกรรมการ)
    await page.goto(APPEAL_URL)
    await switchRole(page, 'supervisor')
    await page.getByTestId('appeal-late-accept-note').fill('เหตุสุดวิสัยมีเอกสารรับรอง เห็นควรรับเรื่องไว้เสนอคณะกรรมการ')
    await page.getByTestId('appeal-late-accept-submit').click()
    await confirmDialog(page, 'ยืนยันรับเรื่องไว้พิจารณา', 'ไม่ตัดสิทธิ์ผู้ยื่นแทนคณะกรรมการ')

    const afterAccept = await readCase(page, CASE_NO)
    const accepted = afterAccept?.appealFolder as Record<string, unknown>
    expect(accepted.stage).toBe('officer_opinion')
    expect(accepted.lateAcceptedBy).toBe(SUPERVISOR)
  })

  test('ยื่นภายในกำหนด: ไม่ต้องกรอกเหตุผล แฟ้มเข้าชั้นความเห็นเจ้าหน้าที่ทันที', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', AT_APPEAL_RECEIVED)
    await page.goto(APPEAL_URL)

    await expect(page.getByTestId('appeal-late-reason')).toHaveCount(0)
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน', 'ยื่นภายในกรอบกำหนด')

    const folder = (await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>
    expect(folder.stage).toBe('officer_opinion')
    expect(folder.lateDays).toBe(0)
  })
})

test.describe('WIT0915 → WIT0919 — ลำดับชั้นแฟ้มอุทธรณ์ ข้ามขั้นไม่ได้', () => {
  test('TC-113 · [Negative] เจ้าหน้าที่แก้ไขข้อความคำอุทธรณ์ของผู้ยื่นไม่ได้ — บันทึกความเห็นแยกต่างหาก', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', {
      ...AT_APPEAL_RECEIVED,
      appealFolder: { stage: 'officer_opinion', checkedAt: '01/08/2569 09:00', checkedBy: OFFICER, lateDays: 0 },
    })
    await page.goto(APPEAL_URL)

    // ข้อความคำอุทธรณ์ของผู้ยื่นแสดงเป็นข้อความอ่านอย่างเดียว ไม่มี textarea/input ให้พิมพ์ทับ
    const reasonBlock = page.getByText('เหตุผลที่ขออุทธรณ์:').locator('xpath=following-sibling::p[1]')
    await expect(reasonBlock).toContainText('พยานหลักฐานใหม่')
    await expect(reasonBlock.locator('textarea, input')).toHaveCount(0)

    // ความเห็นของเจ้าหน้าที่บันทึกแยกต่างหากใน appeal-opinion-note ไม่ปนกับข้อความคำอุทธรณ์
    await page.getByTestId('appeal-opinion-note').fill('เห็นควรเสนอ ผบช.ชั้นต้นพิจารณาต่อ')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    const after = await readCase(page, CASE_NO)
    expect(String(after?.appealReason)).toContain('พยานหลักฐานใหม่')
    expect(((after?.appealFolder as Record<string, any>).officerOpinion as Record<string, any>).note).toContain(
      'เสนอ ผบช.ชั้นต้น'
    )
  })

  test('TC-114 · [Negative] ข้ามลำดับชั้นไม่ได้ — เสนอคณะกรรมการโดยข้ามชั้นรองเลขาธิการฯ/เลขาธิการฯ ไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'officer', {
      ...AT_APPEAL_RECEIVED,
      appealFolder: { stage: 'officer_opinion', checkedAt: '01/08/2569 09:00', checkedBy: OFFICER, lateDays: 0 },
    })
    await page.goto(APPEAL_URL)

    // ยังอยู่ชั้นเจ้าหน้าที่ — รองเลขาฯ / เลขาฯ / คณะกรรมการ เข้ามาก็ยังไม่มีอะไรให้กด ต้องเดิน WIT0916→17→18 ตามลำดับ
    for (const role of ['deputy_secretary', 'secretary', 'committee']) {
      await switchRole(page, role)
      await expect(page.getByTestId('appeal-opinion-submit')).toHaveCount(0)
      await expect(page.getByTestId('appeal-resolution-uphold')).toHaveCount(0)
    }

    await switchRole(page, 'officer')
    await expect(page.getByTestId('appeal-opinion-officer')).toBeVisible()

    // แม้เจ้าหน้าที่เสนอผ่าน ผบช.ชั้นต้นไปแล้ว รองเลขาธิการฯ/เลขาฯ/คณะกรรมการก็ยังกดข้ามไม่ได้จนกว่าจะถึงคิว
    await page.getByTestId('appeal-opinion-note').fill('เห็นควรเสนอ ผบช.ชั้นต้นพิจารณาต่อ')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน')

    for (const role of ['deputy_secretary', 'secretary', 'committee']) {
      await switchRole(page, role)
      await expect(page.getByTestId('appeal-opinion-submit')).toHaveCount(0)
    }
    await switchRole(page, 'supervisor')
    await expect(page.getByTestId('appeal-opinion-submit')).toBeVisible()
  })

  test('TC-115 · [Edge] เลขาธิการฯ ไม่ใช่ผู้วินิจฉัยอุทธรณ์ — ได้เพียงรับทราบและส่งเสนอคณะกรรมการ', async ({ page }) => {
    await seedMockState(page, 'Case 1.8', 'secretary', {
      ...AT_APPEAL_RECEIVED,
      appealFolder: {
        stage: 'secretary',
        checkedAt: '01/08/2569 09:00',
        checkedBy: OFFICER,
        lateDays: 0,
        officerOpinion: { at: '01/08/2569 09:10', by: OFFICER, note: 'เอกสารครบ' },
        supervisorOpinion: { at: '02/08/2569 09:00', by: SUPERVISOR, note: 'เห็นควรเสนอ' },
        deputyOpinion: { at: '03/08/2569 09:00', by: DEPUTY, note: 'กลั่นกรองแล้ว' },
      },
    })
    await page.goto(APPEAL_URL)

    await expect(page.getByTestId('appeal-opinion-secretary')).toContainText('ไม่ใช่ผู้วินิจฉัยอุทธรณ์')
    await expect(page.getByTestId('appeal-resolution-uphold')).toHaveCount(0)
    await expect(page.getByTestId('appeal-resolution-overturn')).toHaveCount(0)

    await page.getByTestId('appeal-opinion-note').fill('รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย')
    await page.getByTestId('appeal-opinion-submit').click()
    await confirmDialog(page, 'ยืนยัน', 'ฝ่ายเลขานุการคณะกรรมการ')

    const folder = (await readCase(page, CASE_NO))?.appealFolder as Record<string, any>
    expect(folder.stage).toBe('agenda')
    expect(folder.secretaryOpinion.by).toBe(SECRETARY)
  })
})

test.describe('WIT0921 / WIT0922 — หนังสือแจ้งผลอุทธรณ์และหลักฐานการรับ', () => {
  test('TC-111 · [Happy] คณะกรรมการยืนคำสั่งเดิม — บันทึกมติแล้วยังต้องแจ้งผลอย่างเป็นทางการ จึงปิดขั้นอุทธรณ์สมบูรณ์', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'committee', AT_AGENDA)
    await page.goto(APPEAL_URL)

    // มติเป็นที่สุด — ต้องผ่านจอยืนยัน และยกเลิกได้
    await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
    await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม')
    await page.getByTestId('appeal-resolution-uphold').click()
    await cancelDialog(page)
    expect((await readCase(page, CASE_NO))?.appealResolution).toBeFalsy()

    await page.getByTestId('appeal-resolution-uphold').click()
    await confirmDialog(page, 'ยืนยันมติยืนคำสั่งเดิม', 'เป็นที่สุด')

    const resolved = await readCase(page, CASE_NO)
    expect((resolved?.appealResolution as Record<string, unknown>).outcome).toBe('uphold')
    expect((resolved?.appealFolder as Record<string, unknown>).stage).toBe('resolved')
    // แต่ยังไม่มีร่องรอยว่าแจ้งผลถึงพยาน — บันทึกมติอย่างเดียวไม่พอ ต้องมีหนังสือแจ้งผลด้วย
    expect((resolved?.appealResolution as Record<string, unknown>).noticeRecordedAt).toBeFalsy()

    // WIT0921 — จัดทำหนังสือ · ส่งผ่านสารบรรณ · เก็บหลักฐานการรับ
    await switchRole(page, 'officer')
    const form = page.getByTestId('appeal-notice-form')
    await expect(form).toBeVisible()

    // ขาดเลขทะเบียนส่ง — จอยืนยันต้องไม่ขึ้น
    await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_สมชาย.pdf')
    await page.getByTestId('appeal-notice-submit').click()
    await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

    await page.getByTestId('appeal-notice-registry').fill('ปปท 0007/4412')
    await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
    await page.getByTestId('appeal-notice-submit').click()
    await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', 'ปิดขั้นอุทธรณ์')

    const notice = (await readCase(page, CASE_NO))?.appealResolution as Record<string, unknown>
    expect(notice.noticeRegistryNo).toBe('ปปท 0007/4412')
    expect(notice.noticeRecipient).toBeTruthy()
    expect(notice.noticeAckDocument).toContain('EMS')
    expect(notice.noticeRecordedBy).toBe(OFFICER)

    await expect(page.getByTestId('appeal-notice-done')).toContainText('แจ้งผลอุทธรณ์ให้พยานแล้ว')
    await expect(page.getByTestId('appeal-notice-form')).toHaveCount(0)
  })

  test('TC-110 · [Happy] คณะกรรมการมีมติเปลี่ยนคำสั่งเป็นอนุมัติ — แจ้งผลแล้วกลับไปหน้า 08A โดยไม่สร้าง คบ.1 ใหม่', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.8', 'committee', AT_AGENDA)
    await page.goto(APPEAL_URL)

    const casesBefore = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )

    await page.getByTestId('appeal-resolution-no').fill('มติที่ 56/2569')
    await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่รับฟังได้ ให้เปลี่ยนแปลงคำสั่งเดิม')
    await page.getByTestId('appeal-resolution-overturn').click()
    await confirmDialog(page, 'ยืนยันมติเปลี่ยนแปลงคำสั่ง', 'ไม่สร้าง คบ.1 ใหม่')

    const resolved = await readCase(page, CASE_NO)
    expect((resolved?.appealResolution as Record<string, unknown>).outcome).toBe('overturn')
    // กลับไปแนวทาง 08A (เปิดเส้นทางปฏิบัติ) โดยไม่สร้างแฟ้ม/คบ.1 ใหม่
    expect(resolved?.stage).toBe('method_operation')
    const casesAfterResolve = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    expect(casesAfterResolve).toBe(casesBefore)

    // ต้องแจ้งผลอุทธรณ์ให้พยานเช่นกัน แม้ผลจะกลายเป็นอนุมัติแล้วก็ตาม
    await switchRole(page, 'officer')
    await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_เปลี่ยนคำสั่ง.pdf')
    await page.getByTestId('appeal-notice-registry').fill('ปปท 0007/4413')
    await page.getByTestId('appeal-notice-submit').click()
    await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', 'แยกแนวทางที่หน้าดำเนินการตามวิธีคุ้มครอง')

    const notice = (await readCase(page, CASE_NO))?.appealResolution as Record<string, unknown>
    expect(notice.noticeRegistryNo).toBe('ปปท 0007/4413')
    expect(notice.noticeRecordedAt).toBeTruthy()
  })
})

test.describe('WIT1145-WIT1147 — อุทธรณ์คำสั่งยุติ (คบ.17)', () => {
  test('TC-116 · [Edge] อุทธรณ์คำสั่งยุติ (คบ.17) ผ่านฟอร์มรับอุทธรณ์เดียวกับ 09B — สร้างแฟ้มอุทธรณ์ ผูกกับแฟ้มเดิม ไม่สร้าง คบ.1 ใหม่ และเดินลำดับชั้นต่อได้', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.13', 'officer', KB17_APPEAL_READY)
    await page.goto(`/termination/${CASE_NO}`)

    const casesBefore = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )

    const intake = page.getByTestId('appeal-intake-form')
    await intake.getByTestId('appeal-intake-reason').fill('ยังมีเหตุอันตรายต่อพยานอยู่ ขอให้ทบทวนคำสั่งยุติ')
    await intake.getByTestId('appeal-intake-channel-letter').click()
    await intake.getByTestId('appeal-intake-registry-no').fill('ปปท 0007/6001')
    await intake.getByTestId('appeal-intake-first-received').fill('2026-08-10')
    await intake.getByTestId('appeal-intake-evidence-file').setInputFiles({
      name: 'คำร้องอุทธรณ์คำสั่งยุติ_คบ17.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 mock'),
    })
    await intake.getByRole('button', { name: /มีอุทธรณ์ภายในกำหนด$/ }).click()
    await confirmDialog(page, 'ยืนยัน')

    const after = await readCase(page, CASE_NO)
    expect(after?.appealAgainst).toBe('kb17')
    expect(after?.stage).toBe('appeal')

    // แฟ้มอุทธรณ์ถูกสร้างให้ทันทีและผูกกับ คบ.17 เดิม — เดินลำดับชั้น WIT0915-919 ต่อได้จากหน้านี้จริง
    const folder = after?.appealFolder as Record<string, any>
    expect(folder.stage).toBe('received')
    expect(folder.intake.channel).toBe('letter')
    expect(folder.intake.registryNo).toBe('ปปท 0007/6001')
    expect(after?.appealFiledAt).toBeTruthy()
    expect(after?.appealReason).toContain('เหตุอันตราย')
    expect(after?.appealDocumentName).toContain('คบ17')
    expect(after?.appealDueAt).toBe((after as any)?.kb17?.appealDueAt)

    // ไม่สร้างแฟ้ม/คบ.1 ใหม่
    const casesAfter = await page.evaluate(
      () => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length
    )
    expect(casesAfter).toBe(casesBefore)

    await page.goto(APPEAL_URL)
    await expect(page.getByText('คบ.17 (คำสั่งยุติ)')).toBeVisible()
    await expect(page.getByTestId('appeal-folder-card')).toBeVisible()

    // เดินลำดับชั้นต่อได้จากหน้านี้จริง — WIT0914 ตรวจความครบถ้วนแล้วแฟ้มเข้าชั้นความเห็นเจ้าหน้าที่
    await page.getByTestId('appeal-check-submit').click()
    await confirmDialog(page, 'ยืนยันแฟ้มครบถ้วน')
    const checked = (await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>
    expect(checked.stage).toBe('officer_opinion')
  })
})
