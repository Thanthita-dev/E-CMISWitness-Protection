import { expect, test } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, areaField, confirmDialog, expectStage, formRow, signInModal } from './journey-helpers'

/**
 * J04 · แฟ้มที่รับเรื่องด้วย คบ.1 — กลั่นกรองเส้นทางปกติต่อเนื่องจนส่งเลขาธิการฯ
 *
 * scenario `kb1-intake` (Case 2 → 2.1 → 2.2): แฟ้มที่รับเข้าเป็น คบ.1 (เข้าพบเจ้าหน้าที่) ตั้งแต่ต้น
 * ข้าม คบ.3 แล้ว ส่งถึงผู้บังคับบัญชาชั้นต้น
 *
 * ลำดับแท็บ: 05 (ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ) → ส่งต่อเข้าแท็บ 07 (เลขาธิการฯ รอเสนอพิจารณา)
 * seed ครั้งเดียวที่ Case 2 แล้วเดินผ่าน UI ล้วน (switchRole สลับตัวแสดง)
 */

/** กรอกความเห็นข้อ n ใน /form/6 (ถ้ายังว่าง — ร่างตั้งต้นมีความเห็นเติมให้บางข้อแล้ว) คืนข้อความที่ลงนาม แล้วลงนามด้วยปุ่ม "ลงนาม" — เข้าหน้าแบบฟอร์มจากแถว คบ.6 ในแฟ้ม */
async function signKb6FromDossier(page: import('@playwright/test').Page, no: string, label: string, opinion: string) {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6\?caseNo=/)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill(opinion)
  const written = await area.inputValue()
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
  return written
}

async function forward(page: import('@playwright/test').Page, expectedText: string | RegExp) {
  await page.goto(DOSSIER_URL)
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
}

test('J04 · แฟ้มรับด้วย คบ.1: ผบช.ชั้นต้น → ผอ. ลงนาม คบ.6 → รองเลขาธิการฯ กลั่นกรอง → ส่งเลขาธิการฯ', async ({ page }) => {
  test.setTimeout(180_000)

  // WIT0501/0502 — เจ้าหน้าที่ส่งชุดเสนอ คบ.1 + Skip Record คบ.3 + คบ.6 ถึงผู้บังคับบัญชาชั้นต้นแล้ว (mock state Case 2)
  let supervisorOpinion = ''
  await seedMockState(page, 'Case 2', 'supervisor')
  await page.goto(DOSSIER_URL)

  await test.step('WIT0503 · ผบช.ชั้นต้นตรวจ คบ.1 / คบ.3 / คบ.6 และหลักฐานประกอบ', async () => {
    await expectStage(page, 'supervisor_review')
    const before = await readCase(page, CASE_NO)
    expect(before?.intakeDocType).toBe('kb1')
    expect(before?.pendingIntakeForms).toEqual(['คบ.3'])
    expect(before?.kb3Skipped).toBe(true)

    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    // คบ.3 ถูกข้าม (Skip Record พร้อมเหตุผล) — แถวแสดงข้อความข้ามแล้ว
    await expect(page.getByText(/ข้าม คบ\.3 แล้ว — เหตุผล:/)).toBeVisible()
    await expect(page.getByText('หนังสือคำร้องขอคุ้มครองพยาน.pdf')).toBeVisible()
  })

  await test.step('WIT0504 · ผบช.ชั้นต้นตัดสินว่าเอกสารครบถ้วน (ไม่ตีกลับ) — ปุ่มตีกลับยังมีให้ใช้ แต่เลือกไปลงนาม', async () => {
    // ◇ ครบถ้วน → WIT0507 (ทางแยก "ไม่ครบ → WIT0505" อยู่นอกขอบเขตเทสต์นี้)
    await expect(page.getByTestId('return-case-button')).toBeVisible()
    await expect(page.getByTestId('forward-case-button')).toBeVisible()
  })

  await test.step('WIT0507 · ผบช.ชั้นต้นบันทึกความเห็นข้อ 10 ลงนาม แล้วเสนอ ผอ.', async () => {
    supervisorOpinion = await signKb6FromDossier(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'เห็นควรเสนอ ผอ. พิจารณา')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb6SupervisorSignedAt).toBeTruthy()
    const signed = await readCase(page, CASE_NO)
    expect(signed?.kb6Signed).toBe(true)

    await forward(page, 'ผอ.สำนัก/กอง')
    await expectStage(page, 'director_review')
    expect((await readCase(page, CASE_NO))?.owner).toBe('นายวีระยุทธ พิทักษ์ธรรม')
  })

  await test.step('WIT0508 · ผอ. ตรวจ คบ.1 / คบ.3 / คบ.6 และความเห็นของ ผบช.ชั้นต้น', async () => {
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    // ความเห็นข้อ 10 ที่ ผบช.ลงนามแล้วต้องมองเห็นและล็อกอยู่ในแบบ คบ.6
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toHaveValue(supervisorOpinion)
    await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toBeDisabled()
  })

  await test.step('WIT0509 · ผอ. เห็นชอบและเอกสารครบถ้วน (ไม่ตีกลับ WIT0510)', async () => {
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('return-case-button')).toBeVisible()
    expect((await readCase(page, CASE_NO))?.directorReturn).toBeFalsy()
  })

  await test.step('WIT0512 · ผอ. ลงนาม คบ.6 ข้อ 11 แล้วส่งรองเลขาธิการฯ', async () => {
    await signKb6FromDossier(page, '11', 'ความเห็นผู้อำนวยการสำนัก', 'เห็นชอบ เสนอรองเลขาธิการฯ กลั่นกรอง')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb6DirectorSignedAt).toBeTruthy()

    await forward(page, 'รองเลขาธิการ')
    await expectStage(page, 'deputy_review')
    const after = await readCase(page, CASE_NO)
    expect(after?.owner).toBe('นายพิพัฒน์ ศรีสุวรรณ')
    expect(after?.deputyReviewState).toBe('pending')
  })

  await test.step('WIT0513 · ระบบล็อกช่องที่ลงนามแล้ว ห้ามแก้ทับ และแฟ้มขึ้นคิวรองเลขาธิการฯ', async () => {
    // ผู้ส่งต่อแล้วไม่มีปุ่มตีกลับ และช่องข้อ 10-11 ถูกล็อก
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toBeDisabled()
    await expect(areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')).toBeDisabled()

    await switchRole(page, 'deputy_secretary')
    await page.goto('/queue/deputy_secretary')
    await expect(page.getByText(CASE_NO)).toBeVisible()
    // ไม่มีการแจ้งเตือนใน /notifications ถึงรองเลขาธิการฯ — มีเพียงงานในคิว (ผังต่าง: ผังให้ "แจ้งเตือน")
  })

  await test.step('WIT0514 · รองเลขาธิการฯ กลั่นกรองและลงนามข้อ 12 แล้วส่งต่อเลขาธิการฯ (ไม่ออกเลขสารบรรณ)', async () => {
    await signKb6FromDossier(page, '12', 'ความเห็นรองเลขาธิการฯ', 'ผ่านการกลั่นกรอง เห็นควรเสนอเลขาธิการฯ')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb6DeputySignedAt).toBeTruthy()

    await forward(page, 'เลขาธิการ')
    await expectStage(page, 'external_pending')
    const after = await readCase(page, CASE_NO)
    expect(after?.deputyScreenedBy).toBeTruthy()
    // Snapshot ส่งต่อทั้งแฟ้ม ไม่ผ่านสารบรรณอัตโนมัติ (ผังระบุ snapshot แยก แต่โปรโตไทป์ส่งแฟ้มเดิมทั้งแฟ้ม)
    expect((after as Record<string, unknown>)['documentNo']).toBeUndefined()
    expect((after as Record<string, unknown>)['registryNo']).toBeUndefined()
  })

  await test.step('ส่งมอบเข้าแท็บ 07 · เลขาธิการฯ เห็นแฟ้มรอเสนอพิจารณา', async () => {
    await switchRole(page, 'secretary')
    await page.goto(DOSSIER_URL)
    await expect(page.getByText('รอเสนอเลขาธิการ ป.ป.ท. พิจารณา')).toBeVisible()
    // ลายมือชื่อครบทั้งสามชั้น (10-12) และยังไม่มีข้อ 13 ของเลขาธิการฯ
    const final = await readCase(page, CASE_NO)
    expect(final?.kb6SupervisorSignedAt).toBeTruthy()
    expect(final?.kb6DirectorSignedAt).toBeTruthy()
    expect(final?.kb6DeputySignedAt).toBeTruthy()
    expect(final?.kb6SecretarySignedAt).toBeFalsy()
  })
})
