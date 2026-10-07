import { expect, test } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { confirmSecretaryApproval } from '../helpers/postApproval'

/**
 * Sheet 07 · รับและบันทึกผลการพิจารณา
 *
 * WIT0704 มี 4 แขนง — อนุมัติ · ไม่อนุมัติ · ส่งกลับ/ขอข้อมูลเพิ่ม · เห็นควรตามข้อ 14
 * เทสต์นี้ครอบคลุมสามจุดที่ยังขาดตามผัง:
 *   WIT0707 → WIT0708  ส่งกลับแล้ว ผอ. ต้องมอบหมายให้เจ้าหน้าที่แก้เป็น Revision ใหม่ (ไม่ค้างที่ ผอ.)
 *   WIT0709 → WIT0712  ฉบับแก้ต้องเดินตามลำดับเดิมทุกขั้น "ห้ามส่งข้ามลำดับชั้น"
 *   WIT0713            แขนงที่ 4 เป็นทางเข้าแท็บ 08C ตั้งแต่ชั้นรับผลพิจารณา
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

/** เลขาธิการฯ ลงนามความเห็นข้อ 13 ใน คบ.6 แล้ว จึงกดสั่งการอนุมัติ / ไม่อนุมัติ / ข้อ 14 ได้ */
const KB6_SECRETARY_SIGNED = {
  kb6SecretarySignedAt: '09/09/2569 16:10',
  kb6SecretarySignedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
}

/** WIT0707 — เลขาธิการฯ สั่งส่งกลับ / ขอข้อมูลเพิ่ม จากการ์ดคำสั่งชี้ขาดในแฟ้ม */
async function secretaryReturnsCase(page: import('@playwright/test').Page, note: string) {
  await page.getByTestId('secretary-return-button').click()
  await page.getByRole('textbox').last().fill(note)
  await page.getByTestId('decision-confirm-button').click()
  await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('returned')
}

test.describe('WIT0707 → WIT0708 — ส่งกลับแล้วงานต้องลงถึงเจ้าหน้าที่ผู้รับผิดชอบ', () => {
  test.beforeEach(async ({ page }) => {
    // Case 1.7 — แฟ้มรอเลขาธิการ ป.ป.ท. พิจารณา (external_pending)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)
  })

  test('TC-051 · [Happy] ผลส่งกลับ/ขอข้อมูลเพิ่ม จอดที่ ผอ. ก่อน แล้ว ผอ. มอบหมายแก้ไขจึงลงถึงเจ้าหน้าที่', async ({ page }) => {
    await secretaryReturnsCase(page, 'ข้อเท็จจริงใน คบ.3 ไม่ครบ ให้แนบผลตรวจสอบเพิ่มเติมและแก้ คบ.6 ให้สอดคล้อง')

    const returned = await readCase(page, CASE_NO)
    expect(returned?.stage).toBe('director_review')
    expect(returned?.owner).toBe(DIRECTOR)
    // ยังไม่มอบหมาย — งานยังไม่ลงถึงคนแก้
    expect(returned?.revisionAssignedAt).toBeFalsy()
    expect(returned?.secretaryReturnRework).toBe(false)

    // WIT0708 — ผอ. เปิดแฟ้มแล้วต้องเจอการ์ดมอบหมายแก้ไข
    await switchRole(page, 'director')
    const card = page.getByTestId('return-revision-assignment-card')
    await expect(card).toBeVisible()

    // ยังส่งแฟ้มเดิมขึ้นไปใหม่ไม่ได้ จนกว่าจะมอบหมายรอบแก้ไข
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()

    await page.getByTestId('assign-revision-button').click()
    await page.getByTestId('revision-instruction-input').fill('แก้ คบ.3 และ คบ.6 เป็นฉบับใหม่ แนบผลตรวจสอบเพิ่มเติม')
    await page.getByTestId('assign-revision-confirm-button').click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    const assigned = await readCase(page, CASE_NO)
    expect(assigned?.owner).toBe(OFFICER)
    expect(assigned?.secretaryReturnRework).toBe(true)
    expect(assigned?.revisionRound).toBe(1)
    expect(assigned?.revisionInstruction).toContain('ฉบับใหม่')
    // ห้ามใช้ทางลัดของ WIT0510/WIT0511 ในรอบนี้
    expect(assigned?.directorReturn).toBe(false)

    const history = (assigned?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action === 'ผอ.สำนัก/กอง มอบหมายแก้ไขตามข้อสั่งการเลขาธิการฯ')).toBe(true)
  })
})

test.describe('WIT0709 → WIT0712 — Revision ต้องเดินตามลำดับเดิม ห้ามส่งข้ามลำดับชั้น', () => {
  test('TC-053 · [Negative] แม้เป็นเคสเร่งด่วน ฉบับแก้ก็ต้องผ่านผู้บังคับบัญชาชั้นต้นก่อนถึง ผอ. ห้ามส่งข้ามลำดับชั้น', async ({ page }) => {
    // เคสเร่งด่วน (ปกติจะข้าม ผบช.ชั้นต้น ได้ตามเส้นทาง Fast Track)
    // เรื่องคุ้มครองชั่วคราวของเคสเร่งด่วนได้ข้อยุติแล้ว คำร้องหลักจึงเดินถึงชั้นเลขาธิการฯ ได้ (WIT0614)
    await seedMockState(page, 'Case 1.7', 'secretary', {
      urgent: true,
      urgency: 'urgent',
      fastTracked: true,
      fastTrack: { step: 'approved', proposedMethods: [1], decidedAt: '09/09/2569 10:00' },
    })
    await page.goto(DOSSIER_URL)

    await secretaryReturnsCase(page, 'ผลประเมินภัยยังไม่ครบถ้วน ให้ทบทวนและเสนอใหม่')

    await switchRole(page, 'director')
    await page.getByTestId('assign-revision-button').click()
    await page.getByTestId('revision-instruction-input').fill('ทบทวนผลประเมินภัยและแก้ คบ.6 เป็นฉบับใหม่')
    await page.getByTestId('assign-revision-confirm-button').click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    // WIT0709 — เจ้าหน้าที่แก้ครบแล้วส่งต่อ ต้องชี้ไปผู้บังคับบัญชาชั้นต้น ไม่ใช่ ผอ.
    await switchRole(page, 'officer')

    const banner = page.getByTestId('secretary-revision-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('ห้ามส่งข้ามลำดับชั้น')

    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('ผู้บังคับบัญชาชั้นต้น')

    await forwardButton.click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('supervisor_review')

    const afterForward = await readCase(page, CASE_NO)
    expect(afterForward?.owner).toBe(SUPERVISOR)
    // ธงรอบ Revision ยังอยู่จนกว่าจะกลับถึงเลขาธิการฯ
    expect(afterForward?.secretaryReturnRework).toBe(true)

    const history = (afterForward?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history[history.length - 1].detail).toContain('ห้ามส่งข้ามลำดับชั้น')

    // WIT0712 — เดินต่อตามลำดับเดิมจนกลับถึงเลขาธิการฯ แล้วแฟ้มกลับเป็น "รอผลพิจารณา"
    for (const [role, expectedStage] of [
      ['supervisor', 'director_review'],
      ['director', 'deputy_review'],
      ['deputy_secretary', 'external_pending'],
    ] as const) {
      await switchRole(page, role)
      await page.getByTestId('forward-case-button').click()
      await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
      await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe(expectedStage)
    }

    const backAtSecretary = await readCase(page, CASE_NO)
    expect(backAtSecretary?.secretaryReturnRework).toBe(false)
    expect(backAtSecretary?.activity7State).toBe('pending')
    expect(backAtSecretary?.secretaryReviewState).toBe('pending')
  })
})

test.describe('WIT0713 — แขนง "เห็นควรตามข้อ 14" เป็นทางเข้าแท็บ 08C ตั้งแต่ชั้นรับผลพิจารณา', () => {
  test.beforeEach(async ({ page }) => {
    await seedMockState(page, 'Case 1.7', 'secretary', KB6_SECRETARY_SIGNED)
    await page.goto(DOSSIER_URL)
  })

  test('TC-052 · [Medium] เลขาธิการฯ เลือกข้อ 14 → แฟ้มเข้า 08C ขั้นจัดทำข้อเสนอ โดยไม่ต้องรอครบเพดาน', async ({ page }) => {
    const before = await readCase(page, CASE_NO)
    // เคสนี้ยังไม่เคยคุ้มครอง จึงไม่มีทางเข้า 08C ทางเพดาน 180 วัน
    expect(before?.article14).toBeFalsy()

    await page.getByTestId('refer-article14-button').click()
    await page
      .getByRole('textbox')
      .last()
      .fill('พฤติการณ์ภัยเกินขอบเขตมาตรการเบื้องต้นของ ป.ป.ท. เห็นควรส่งกรมคุ้มครองสิทธิและเสรีภาพ')
    await page.getByTestId('decision-confirm-button').click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('article14')

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('article14')
    expect(after?.owner).toBe(OFFICER)
    const referral = after?.article14Referral as Record<string, string> | undefined
    expect(referral?.reason).toContain('เกินขอบเขตมาตรการเบื้องต้น')
    expect(referral?.decisionNo).toBeTruthy()

    // เจ้าหน้าที่เปิดแท็บ 08C แล้วต้องเห็นเคสนี้ พร้อมป้ายบอกว่ามาจากผลพิจารณา
    await switchRole(page, 'officer')
    await page.goto('/article14')

    await expect(page.getByTestId('article14-referral-badge')).toContainText('มาจากผลพิจารณาและคำสั่ง')

    // ขั้นแรกของ 08C คือจัดทำข้อเสนอ — ยังต้องเดินตามลำดับชั้นและมติคณะกรรมการตามเดิม
    await page.getByRole('textbox').first().fill('ภัยคุกคามยังคงอยู่และเกินขีดความสามารถของมาตรการเบื้องต้น')
    await page.getByRole('textbox').nth(1).fill('ผลประเมินความเสี่ยงระดับสูง อ้างอิงรายงานของชุดปฏิบัติการ')
    await page.getByTestId('submit-article14-proposal').click()
    await page.getByRole('button', { name: 'ยืนยันเสนอ' }).click()

    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.article14 as Record<string, string>)?.step)
      .toBe('supervisor_review')
  })
})

/**
 * WIT0704 "อนุมัติ" / "ไม่อนุมัติ" / "ข้อ 14" — กรอกเลขที่คำสั่งและเหตุผลในโมดัลคำสั่งชี้ขาด แล้วยืนยัน
 * ช่อง "เลขแฟ้มของผลพิจารณาที่รับเข้ามา" (WIT0703) prefill เลขคำร้องของแฟ้มปัจจุบันไว้ให้แล้ว
 * ส่ง refCaseNo เข้ามาเมื่อต้องการจำลองผลพิจารณาที่อ้างอิงเลขแฟ้มอื่น
 */
async function secretaryDecides(
  page: import('@playwright/test').Page,
  buttonTestId: string,
  decisionNo: string,
  reason: string,
  refCaseNo?: string
) {
  await page.getByTestId(buttonTestId).click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (refCaseNo !== undefined) {
    await dialog.getByTestId('decision-ref-case-no-input').fill(refCaseNo)
  }
  // ช่องข้อความในโมดัล: [0] เลขแฟ้มของผลพิจารณา · [1] เลขที่คำสั่ง · [2] เหตุผล
  await dialog.getByRole('textbox').nth(1).fill(decisionNo)
  await dialog.getByTestId('decision-reason-input').fill(reason)
  if (buttonTestId === 'approve-case-button') await confirmSecretaryApproval(page)
  else {
    await page.getByTestId('decision-confirm-button').click()
    if (buttonTestId === 'reject-case-button') {
      await expect(page.getByTestId('decision-review-step')).toBeVisible()
      await page.getByTestId('decision-confirm-button').click()
    }
  }
  await dialog.waitFor({ state: 'detached' })
}

test.describe('TC-049 — รับผลอนุมัติและจำแนกวิธีคุ้มครองตามคำสั่ง', () => {
  test('TC-049 · [Happy] เลขาธิการฯ อนุมัติวิธี 15(1) → บันทึก Decision Record ครบ และเปิดทางเข้าแท็บ 08A', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.7', 'secretary', KB6_SECRETARY_SIGNED)
    await page.goto(DOSSIER_URL)

    await secretaryDecides(
      page,
      'approve-case-button',
      'ปปท. 88/2569',
      'ตรวจทานข้อเท็จจริง พฤติการณ์ภัยคุกคาม และความเห็นตามลำดับชั้นครบถ้วนแล้ว มีเหตุผลสมควรได้รับการคุ้มครองพยานด้วยวิธีที่ 1'
    )

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('approved')

    const after = await readCase(page, CASE_NO)
    // WIT0702/0703 — เก็บคำสั่งฉบับลงนามเป็นข้อมูลต้นทาง: เลขที่คำสั่ง ผู้ลงนาม วันที่
    expect(after?.decisionNumber).toBe('ปปท. 88/2569')
    expect(after?.secretarySignedAt).toBeTruthy()
    expect(after?.secretarySignedBy).toBeTruthy()
    expect(after?.resultReason).toContain('วิธีที่ 1')

    // Audit Log ของการตัดสิน
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => (h.action ?? '').includes('อนุมัติ'))).toBe(true)

    // WIT0710 — เปิดทางเข้าแท็บ 08A ทันทีที่อนุมัติ (ยังต้องมี คบ.9/คบ.11 ก่อนเริ่มคุ้มครองจริง)
    await switchRole(page, 'officer')
    await page.goto('/protection-methods')
    await expect(page.getByText(CASE_NO)).toBeVisible()
  })
})

test.describe('TC-050 — ไม่อนุมัติพร้อมลงนาม คบ.10 จากชุดเสนอ', () => {
  test('TC-050 · [Happy] เลขาธิการฯ ไม่อนุมัติ → ลงนาม คบ.10 แล้วรอเติมรายละเอียดที่แท็บ 09A', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.7', 'secretary', KB6_SECRETARY_SIGNED)
    await page.goto(DOSSIER_URL)

    await secretaryDecides(page, 'reject-case-button', 'ปปท. 89/2569', 'ข้อเท็จจริงไม่เข้าเกณฑ์ตามระเบียบว่าด้วยการคุ้มครองพยาน')

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('rejected')

    const after = await readCase(page, CASE_NO)
    expect(after?.resultReason).toContain('ข้อเท็จจริงไม่เข้าเกณฑ์')
    // ลงนามฉบับที่ตรงกับผลเพียงฉบับเดียว และยังไม่ถือว่าพร้อมส่งหรือส่งแล้ว
    expect((after?.extraForms ?? []) as number[]).toContain(10)
    expect(after?.kb10Signed).toBe(true)
    expect((after?.resultNotices as any)?.[10]?.original).toBeTruthy()
    expect((after?.resultNotices as any)?.[9]?.original).toBeUndefined()
    expect((after?.resultNotices as any)?.[10]?.status).toBe('signed_incomplete')
    expect(after?.dispatchedAt).toBeFalsy()
    expect(after?.next).toContain('คบ.10')

    const documents = (after?.documents ?? []) as Array<Record<string, unknown>>
    expect(documents.some((d) => String(d.name ?? '').includes('คบ.10'))).toBe(false)
  })
})

test.describe('TC-054 — ห้ามแก้ทับผลพิจารณา/คำสั่งที่ลงนามแล้ว', () => {
  test('TC-054 · [Negative] เปิดผลพิจารณาฉบับลงนามที่รับเข้ามาแล้ว ต้องไม่มีทางแก้วันที่/วิธี/ช่วงเวลาได้อีก', async ({
    page,
  }) => {
    // Case 1.8 — อนุมัติแล้ว (activity7State = approved, stage = notice) — ผลพิจารณาฉบับลงนามรับเข้าแฟ้มแล้ว
    await seedMockState(page, 'Case 1.8', 'officer')
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.activity7State).toBe('approved')

    // การ์ดคำสั่งชี้ขาดต้องหายไปทั้งหมด — ไม่มีปุ่มใดให้สั่งการซ้ำหรือแก้ผลเดิม
    await expect(page.getByTestId('approve-case-button')).toHaveCount(0)
    await expect(page.getByTestId('reject-case-button')).toHaveCount(0)
    await expect(page.getByTestId('secretary-return-button')).toHaveCount(0)
    await expect(page.getByTestId('refer-article14-button')).toHaveCount(0)

    // เลขที่คำสั่ง/ผลพิจารณาที่แสดงในแฟ้มต้องเป็นข้อความอ่านอย่างเดียว ไม่มีช่องกรอกให้แก้ค่านี้
    await expect(page.getByText(before?.decisionNumber as string)).toBeVisible()
    await expect(page.locator(`input[value="${before?.decisionNumber}"]`)).toHaveCount(0)

    // ค่าที่เก็บไว้ต้องไม่เปลี่ยนแปลงจากการเปิด/ปิดหน้าแฟ้มซ้ำ
    await page.reload()
    const after = await readCase(page, CASE_NO)
    expect(after?.decisionNumber).toBe(before?.decisionNumber)
    expect(after?.resultReason).toBe(before?.resultReason)
  })
})

test.describe('TC-055 — ผลพิจารณาที่ขาดลายมือชื่อผู้มีอำนาจ ต้องบันทึกเป็นผลสมบูรณ์ไม่ได้', () => {
  test('TC-055 · [Negative] ยังไม่ได้ลงนามความเห็นข้อ 13 ใน คบ.6 — ปุ่มสั่งการต้องถูกปิดกั้นทั้งหมด', async ({ page }) => {
    // Case 1.7 ฐาน (ไม่ patch ลายมือชื่อเลขาธิการฯ) — ผลพิจารณายังไม่มีผู้ลงนาม
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)

    const before = await readCase(page, CASE_NO)
    expect(before?.kb6SecretarySignedAt).toBeFalsy()

    // WIT0703 — ระบบต้องตรวจพบความไม่ครบถ้วนและปิดปุ่มสั่งการทั้งหมดไว้ก่อน
    await expect(page.getByText('ต้องลงนามความเห็นเลขาธิการฯ (ข้อ 13) ใน คบ.6 ก่อนจึงจะสั่งการอนุมัติหรือไม่อนุมัติได้')).toBeVisible()
    await expect(page.getByTestId('approve-case-button')).toBeDisabled()
    await expect(page.getByTestId('reject-case-button')).toBeDisabled()
    await expect(page.getByTestId('refer-article14-button')).toBeDisabled()

    // ปุ่ม "ส่งกลับแก้ไข" เท่านั้นที่ยังกดได้ตลอด — ไม่ใช่การบันทึกผลพิจารณาสมบูรณ์
    await expect(page.getByTestId('secretary-return-button')).toBeEnabled()

    // ไม่มีทางบันทึกผลพิจารณาให้สมบูรณ์ได้จนกว่าจะมีลายมือชื่อ
    const after = await readCase(page, CASE_NO)
    expect(after?.activity7State).toBeFalsy()
    expect(after?.secretaryReviewState).not.toBe('signed')
  })
})

test.describe('TC-056 — ผลอนุมัติหลายวิธีพร้อมกัน รวมวิธีที่ 4', () => {
  test('TC-056 · [Edge] อนุมัติ 15(1) + 15(4) → เปิดทั้งแท็บ 08A (วิธีที่ 1) และ 08B (วิธีที่ 4) แยกสถานะกัน', async ({
    page,
  }) => {
    /**
     * Case 1.8 ฐาน (อนุมัติแล้ว) — patch ให้เดินมาถึงจุดที่แยกวิธีปฏิบัติได้จริง
     * เส้นทางคำร้องหลักต้องมี คบ.9 และ คบ.11 ลงนามครบก่อน (ดู TC-062) ตามลำดับของผังจริง
     * คบ.9 แจ้งผลถึงพยานก่อน แล้วจึงทำข้อตกลง คบ.11 — จึงต้องตั้งทั้งสองธงให้ครบ
     */
    await seedMockState(page, 'Case 1.8', 'officer', {
      consents: [{ ref: 'kb11', consented: true, by: 'สมชาย ใจดี', at: '10/09/2569 09:00' }],
      kb9Signed: true,
      kb11Signed: true,
    })
    await page.goto('/protection-methods')

    await expect(page.getByText('ความยินยอมตาม คบ.11 — ลงนามครบแล้ว')).toBeVisible()

    await page.getByRole('button', { name: /^\(1\)/ }).click()
    await page.getByRole('button', { name: /^\(4\)/ }).click()

    const confirmBtn = page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' })
    await confirmBtn.click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await expect(dialog).toContainText('วิธีที่ 1 ไป 08A-1')
    await expect(dialog).toContainText('วิธีที่ 4 ไป 08B')
    await page.getByRole('button', { name: 'ยืนยันเปิดเส้นทางปฏิบัติ' }).click()
    await dialog.waitFor({ state: 'detached' })

    const after = await readCase(page, CASE_NO)
    expect(after?.approvedMethods).toEqual([1, 4])
    const tracks = (after?.methodTracks ?? []) as Array<Record<string, unknown>>
    expect(tracks.map((t) => t.method).sort()).toEqual([1, 4])
    // แต่ละเส้นทางมีสถานะแยกกัน (ไม่ผูกกัน) — เปลี่ยนวิธีหนึ่งไม่กระทบอีกวิธี
    expect(tracks.every((t) => t.status === 'pending')).toBe(true)

    await expect(page.locator(`a[href="/protection-method/1?caseNo=${CASE_NO}"]`)).toBeVisible()
    await expect(page.locator(`a[href="/protection-method/4?caseNo=${CASE_NO}"]`)).toBeVisible()
  })
})

test.describe('TC-057 — ผลพิจารณาผูกเลขแฟ้มผิด', () => {
  const WRONG_CASE_NO = 'WP-2569-999999'
  const REASON = 'ตรวจทานข้อเท็จจริงครบถ้วนแล้ว มีเหตุผลสมควรได้รับการคุ้มครองพยาน'

  test.beforeEach(async ({ page }) => {
    await seedMockState(page, 'Case 1.7', 'secretary', KB6_SECRETARY_SIGNED)
    await page.goto(DOSSIER_URL)
  })

  test('TC-057 · [Edge] เลขแฟ้มในผลพิจารณาไม่ตรงกับคำร้อง ต้องเตือนและไม่ผูกเข้าแฟ้มโดยอัตโนมัติ จนกว่าจะยืนยัน', async ({
    page,
  }) => {
    await page.getByTestId('approve-case-button').click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()

    // WIT0703 — ช่องเลขแฟ้มอ้างอิงต้องมีอยู่จริง และ prefill เลขคำร้องของแฟ้มที่เปิดอยู่
    const refInput = dialog.getByTestId('decision-ref-case-no-input')
    await expect(refInput).toHaveValue(CASE_NO)
    // ตรงกันอยู่ ยังไม่ต้องเตือน
    await expect(dialog.getByTestId('decision-case-no-mismatch-warning')).toHaveCount(0)

    // รับผลพิจารณาที่อ้างอิงเลขแฟ้มอื่น → ต้องเตือนความไม่สอดคล้องทันที
    await refInput.fill(WRONG_CASE_NO)
    const warning = dialog.getByTestId('decision-case-no-mismatch-warning')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('ไม่ตรงกับคำร้อง')
    await expect(warning).toContainText(CASE_NO)

    await dialog.getByRole('textbox').nth(1).fill('ปปท. 90/2569')
    await dialog.getByTestId('decision-reason-input').fill(REASON)

    // กดยืนยันทั้งที่ยังไม่ได้ตรวจสอบ → ต้องไม่ผูกผลพิจารณาเข้าแฟ้มให้โดยอัตโนมัติ
    await page.getByTestId('decision-confirm-button').click()
    await expect(dialog).toBeVisible()
    expect((await readCase(page, CASE_NO))?.activity7State).toBeFalsy()

    // ยืนยันทับ (soft warning) แล้วจึงบันทึกผลได้
    await dialog.getByTestId('decision-case-no-mismatch-ack').check()
    await confirmSecretaryApproval(page)
    await dialog.waitFor({ state: 'detached' })

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('approved')

    // ต้องมีร่องรอยการยืนยันทับใน Audit Log ของแฟ้ม
    const after = await readCase(page, CASE_NO)
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    const override = history.find((h) => h.action === 'ยืนยันผูกผลพิจารณาที่เลขแฟ้มไม่ตรงกับคำร้อง')
    expect(override).toBeTruthy()
    expect(override?.detail).toContain(WRONG_CASE_NO)
    expect(override?.detail).toContain(CASE_NO)
  })

  test('TC-057 · [Edge] เลขแฟ้มอ้างอิงเป็นช่องบังคับ และเมื่อตรงกับคำร้องต้องไม่มีคำเตือนหรือรายการยืนยันทับ', async ({
    page,
  }) => {
    await page.getByTestId('reject-case-button').click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()

    // ปล่อยว่าง → บันทึกไม่ได้
    await dialog.getByTestId('decision-ref-case-no-input').fill('')
    await page.getByTestId('decision-confirm-button').click()
    await expect(dialog).toBeVisible()
    expect((await readCase(page, CASE_NO))?.activity7State).toBeFalsy()

    // กรอกเลขเดิมของแฟ้ม (ต่างแค่ช่องว่าง/ตัวพิมพ์) → ถือว่าตรง ไม่มีคำเตือน
    await dialog.getByTestId('decision-ref-case-no-input').fill(` ${CASE_NO.toLowerCase()} `)
    await expect(dialog.getByTestId('decision-case-no-mismatch-warning')).toHaveCount(0)
    await dialog.getByRole('textbox').nth(1).fill('ปปท. 91/2569')
    await dialog.getByRole('textbox').last().fill('ข้อเท็จจริงไม่เข้าเกณฑ์ตามระเบียบว่าด้วยการคุ้มครองพยาน')
    await page.getByTestId('decision-confirm-button').click()
    await expect(page.getByTestId('decision-review-step')).toBeVisible()
    await page.getByTestId('decision-confirm-button').click()
    await dialog.waitFor({ state: 'detached' })

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('rejected')

    const history = ((await readCase(page, CASE_NO))?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action === 'ยืนยันผูกผลพิจารณาที่เลขแฟ้มไม่ตรงกับคำร้อง')).toBe(false)
  })
})
