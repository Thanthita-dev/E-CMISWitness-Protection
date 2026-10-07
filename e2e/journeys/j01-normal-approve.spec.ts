import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { confirmSecretaryApproval } from '../helpers/postApproval'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'
import { CASE_NO, DOSSIER_URL, areaField, confirmDialog, expectStage, fieldAfterLabel, formRow, signInModal } from './journey-helpers'

/**
 * J01 · เส้นทางปกติ (scenario `normal-approve`) — เดินต่อเนื่องแฟ้มเดียว WP-2569-000501
 *
 * แท็บที่ผ่าน: 02 → 03 → 04 → 05 → 07 → 08A → 08A-1 → 10 → 11A → 11C → 11D
 * (Case 1 … Case 1.19 ตามผัง) — seed mock state "Case 1" ครั้งเดียว แล้วขับผ่าน UI ล้วน ๆ
 * สลับบทบาทระหว่างผู้ปฏิบัติ: ธุรการ → ผอ. → เจ้าหน้าที่ → ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ → เลขาธิการฯ
 * → เจ้าหน้าที่ ... จนปิดงานยุติการคุ้มครอง (WIT1148)
 *
 * ขั้นที่เป็น ⚙️ ระบบ/นอกระบบ ในผัง (เช่น WIT0201, WIT0301, WIT0513-0514, WIT0808) ใส่เป็นคอมเมนต์ ไม่มี test.step
 */

const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const REVIEW_URL = `/protection-review/${CASE_NO}`
const TERM_URL = `/termination/${CASE_NO}`
const METHODS_URL = '/protection-methods'
const METHOD1_URL = `/protection-method/1?caseNo=${CASE_NO}`

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** กดปุ่มส่งต่อของการ์ด "ส่งงานและดำเนินการในขั้นตอนนี้" แล้วยืนยันในกล่อง SweetAlert */
async function forwardAndConfirm(page: Page, expectedText?: string | RegExp) {
  const button = page.getByTestId('forward-case-button')
  await expect(button).toBeEnabled()
  await button.click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
}

/**
 * ลงนามความเห็นข้อ 10-13 ใน คบ.6 จากปุ่ม "ลงนาม" ท้ายหน้ากรอกแบบ /form/6
 * เข้าหน้าแบบฟอร์มจากปุ่ม "เปิดแบบฟอร์ม" ของแถว คบ.6 ในแฟ้มจริง (ไม่พิมพ์ URL เอง)
 */
async function signKb6(page: Page, no: string, label: string, opinion = 'เห็นชอบตามที่เสนอ') {
  await page.goto(DOSSIER_URL)
  await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6\?caseNo=/)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill(opinion)
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
}

test('J01 · เส้นทางปกติ: รับเรื่อง → อนุมัติ → คุ้มครอง → ติดตาม → ยุติและปิดงาน', async ({ page }) => {
  // 10 นาที — ชุดวิดีโอ (playwright.journey-video.config.ts) ค้างทุกการกดให้เห็นเคอร์เซอร์ จึงยาวเกิน 5 นาที
  test.setTimeout(600_000)

  // ============================================================
  // 02 รับคำขอและเชื่อมโยงเลขสำนวน — ธุรการ (Case 1)
  // ============================================================
  await test.step('WIT0201 / WIT0202 / WIT0203 · ธุรการบันทึกรับคำร้องเข้า E-CMIS (เริ่มจาก Case 1)', async () => {
    // WIT0201 ต้องการขอรับการคุ้มครอง / WIT0202 ช่องทาง / WIT0204-0206 — ⚙️ นอกระบบหรือผูกกับประเภทเอกสารตอน /intake
    // seed Case 1 = แฟ้มที่ธุรการรับเข้าทะเบียนแล้ว (WIT0203) อยู่ขั้น receiver_intake
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto(DOSSIER_URL)

    const c = await readCase(page, CASE_NO)
    expect(c?.stage).toBe('receiver_intake')
    expect(c?.mainCaseStatus).not.toBe('linked')
  })

  await test.step('WIT0212 · ธุรการไม่เห็นการ์ดเชื่อมโยงคดีหลัก — ส่ง ผอ. ได้โดยยังไม่เชื่อมโยง', async () => {
    // ธุรการไม่ทำขั้นเชื่อมโยง — เจ้าของสำนวนที่ ผอ. มอบหมายเป็นผู้เชื่อมโยงภายหลัง (ดูขั้น WIT0307)
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
  })

  await test.step('WIT0216 · ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน', async () => {
    await forwardAndConfirm(page)
    await expectStage(page, 'director_assign')
  })

  // ============================================================
  // 03 มอบหมาย — ผอ. (Case 1.2) → เจ้าหน้าที่ประเมินความเร่งด่วน (Case 1.3)
  // ============================================================
  await test.step('WIT0304 / WIT0305 / WIT0306 · ผอ. เลือกและมอบหมายเจ้าของสำนวน แล้วส่งต่อเข้าคิวเจ้าหน้าที่', async () => {
    // WIT0301 รับคำขอจากแท็บ 02 / WIT0302-0303 ตรวจคำขอ — ⚙️/🟡 ผอ. ก่อนมอบหมายมองไม่เห็นแบบ คบ. (ต่างจากผัง)
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.1')).toHaveCount(0) // 🟡 ผังให้ ผอ. ตรวจเอกสารตั้งต้นได้ แต่ prototype ซ่อนจนกว่าจะมอบหมาย

    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    // WIT0305 ระบบบันทึกผู้รับผิดชอบ/ผู้มอบหมาย/เวลาอัตโนมัติ
    const assigned = await readCase(page, CASE_NO)
    expect(assigned?.owner).toBeTruthy()
    expect(JSON.stringify(assigned?.assignmentHistory ?? [])).toContain('มอบหมาย')

    // 🟡 ผังไม่มีขั้นส่งต่อซ้ำ แต่ prototype ต้องกดส่งต่ออีกครั้งจึงเข้า staff_review (WIT0306 แจ้งงานเจ้าหน้าที่)
    await forwardAndConfirm(page)
    await expectStage(page, 'staff_review')
  })

  await test.step('WIT0307 / WIT0308 · เจ้าหน้าที่ผู้รับผิดชอบรับงาน เปิดคำขอ ตรวจเอกสารตั้งต้นและสถานะกลั่นกรอง', async () => {
    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('dossier-forms')).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    // WIT0212 / WIT0213 / WIT0214 — เจ้าของสำนวนเชื่อมโยงเลขสำนวนหลักได้ → ยืนยันเชื่อมโยงคดี
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    expect((await readCase(page, CASE_NO))?.mainCaseStatus).toBe('linked')
    // WIT0309 ◇ มีผลประเมินความเร่งด่วนแล้ว? — ⚙️ ระบบตัดสิน: ธุรการรับเรื่อง จึงยังไม่มีผล ต้องประเมินที่ WIT0310
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
  })

  await test.step('WIT0310 / WIT0311 / WIT0410 · เจ้าหน้าที่ประเมินความเร่งด่วน "กรณีปกติ" (แขนงปกติ → คบ.3 → คบ.6)', async () => {
    // WIT0311 ◇ เอกสารตั้งต้นเป็นแบบใด / WIT0312-0313 — ⚙️ ระบบจำแนกจากประเภทที่รับเรื่อง (คำร้อง → ต้องทำ คบ.1 + คบ.3)
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()
    const c = await readCase(page, CASE_NO)
    expect(c?.urgency).toBe('normal')
    expect(c?.urgent).toBeFalsy()
    // ผลประเมินไม่สร้างเลขแบบ คบ. และไม่มี คบ.4 ในเส้นทางปกติ
    await expect(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect(formRow(page, 'คบ.6')).toBeVisible()
  })

  // ============================================================
  // 04 จัดทำ คบ.1 / คบ.3 / คบ.6
  // ============================================================
  await test.step('WIT0401 / WIT0402 / WIT0403 · รับงานเข้าแฟ้ม ตรวจ Case Link + ผลประเมิน และพบว่ายังต้องจัดทำ คบ.1', async () => {
    // WIT0401 รับงานจากแท็บ 03 — ⚙️ ระบบพาเข้าแฟ้ม / WIT0403 ◇ มี คบ.1 แล้ว? — ⚙️ ดูป้าย "ต้องจัดทำ"
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()
    await expect(formRow(page, 'คบ.1')).toBeVisible()
  })

  await test.step('WIT0404 / WIT0405 · จัดทำและยืนยัน คบ.1 (บันทึกแบบ คบ.1)', async () => {
    // WIT0406 พยานลงนามยินยอมใน คบ.1 — 🟡 ด่านลงนามมีเฉพาะแฟ้มที่รับเรื่องด้วย คบ.2 แฟ้มคำร้องส่งต่อได้โดยไม่ต้องมีลายมือชื่อยินยอม
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    }
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
  })

  await test.step('WIT0407 / WIT0408 · จัดทำ คบ.3 บันทึกข้อเท็จจริงประกอบคำร้อง (ไม่ข้าม คบ.3)', async () => {
    // WIT0407 ◇ เข้าเงื่อนไขข้าม คบ.3? — เส้นทางปกติเลือก "ไม่ข้าม" (แขนงข้าม WIT0409 เป็นของเส้นทางอื่น)
    await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/3/)
    await areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(
      'พฤติการณ์เพิ่มเติมจากการสัมภาษณ์เส้นทางปกติ J01'
    )
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
    await page.goto(DOSSIER_URL)
  })

  await test.step('WIT0411 · กรณีไม่เร่งด่วน: จัดทำ คบ.6 บันทึกเสนอความเห็น แล้วส่งผู้บังคับบัญชาชั้นต้น (WIT0501/WIT0502)', async () => {
    // WIT0412 กรณีเร่งด่วน → แท็บ 06 — ไม่อยู่ในเส้นทางนี้ / WIT0501 รับเส้นทางปกติจากแท็บ 04 — ⚙️
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)
    // ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนบันทึก คบ.6
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    // ข้อ 8 เสนอรูปแบบการคุ้มครอง: เลือกวิธีที่ 1 (ระบบสืบทอดวิธีนี้ไปเปิดเส้นทางปฏิบัติที่ 08A หลังลงนาม คบ.11)
    const method1 = page.getByTestId('method-option-1')
    if ((await method1.getAttribute('aria-pressed')) !== 'true') await method1.click()
    await expect(method1).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await page.goto(DOSSIER_URL)

    // WIT0502 ชุดเสนอ → ผู้บังคับบัญชาชั้นต้น (🟡 ไม่มีรายการแจ้งเตือนใน /notifications มีเพียงคิวงาน)
    await forwardAndConfirm(page, 'ผู้บังคับบัญชาชั้นต้น')
    await expectStage(page, 'supervisor_review')
    const c = await readCase(page, CASE_NO)
    expect(c?.kb6SupervisorSignedAt).toBeFalsy()
  })

  // ============================================================
  // 05 กลั่นกรอง คบ.6 ตามลำดับชั้น
  // ============================================================
  await test.step('WIT0503 / WIT0504 / WIT0507 · ผบช.ชั้นต้นตรวจเอกสารครบ ลงนามความเห็นข้อ 10 แล้วเสนอ ผอ.', async () => {
    // WIT0504 ◇ เอกสารครบถ้วน? — เลือก "ครบ" (แขนงตีกลับ WIT0505/WIT0506 เป็นของเส้นทางส่งกลับ)
    await switchRole(page, 'supervisor')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.1')).toBeVisible()
    await expect(formRow(page, 'คบ.3')).toBeVisible()
    await expect(formRow(page, 'คบ.6')).toBeVisible()

    await signKb6(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    const signed = await readCase(page, CASE_NO)
    expect(signed?.kb6SupervisorSignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'ผอ.สำนัก/กอง')
    await expectStage(page, 'director_review')
  })

  await test.step('WIT0508 / WIT0509 / WIT0512 · ผอ. ตรวจ เห็นชอบ ลงนามข้อ 11 แล้วส่งรองเลขาธิการฯ', async () => {
    // WIT0509 ◇ เห็นชอบและเอกสารครบถ้วน? — เลือก "เห็นชอบ" (แขนงตีกลับ WIT0510/WIT0511 เป็นของเส้นทางส่งกลับ)
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.6')).toBeVisible()
    await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')
    const c = await readCase(page, CASE_NO)
    expect(c?.kb6DirectorSignedAt).toBeTruthy()
    expect(c?.kb6DeputySignedAt).toBeFalsy()

    // WIT0513 ล็อกช่องที่ลงนามแล้ว ห้ามแก้ทับ — ⚙️ ตรวจว่าข้อ 10/11 ถูกล็อก
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toBeDisabled()
    await expect(areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')).toBeDisabled()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'รองเลขาธิการ')
    await expectStage(page, 'deputy_review')
    // WIT0514 ส่ง Snapshot ไปแท็บ 07 — ⚙️ ไม่ออกเลขสารบรรณอัตโนมัติ
    const after = await readCase(page, CASE_NO)
    expect((after as Record<string, unknown> | null)?.['documentNo']).toBeUndefined()
  })

  // ============================================================
  // 07 รับและบันทึกผลการพิจารณา
  // ============================================================
  await test.step('WIT0701 / WIT0702 · รองเลขาธิการฯ ลงนามข้อ 12 แล้วส่งเลขาธิการฯ (รอผลพิจารณา)', async () => {
    // ช่วงรองเลขาธิการฯ (deputy_review) เป็นส่วนเพิ่มของ prototype ก่อนถึงแท็บ 07 (ผังไม่แยกขั้นนี้)
    await switchRole(page, 'deputy_secretary')
    await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
    const signed = await readCase(page, CASE_NO)
    expect(signed?.kb6DeputySignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await forwardAndConfirm(page, 'เลขาธิการ')
    await expectStage(page, 'external_pending')
  })

  await test.step('WIT0703 / WIT0704 / WIT0705 · เลขาธิการฯ ลงนามข้อ 13 ตรวจเลขแฟ้ม แล้วอนุมัติ (แขนงอนุมัติ)', async () => {
    await switchRole(page, 'secretary')
    await page.goto(DOSSIER_URL)
    // ปุ่มสั่งการถูกล็อกจนกว่าจะลงนามความเห็นข้อ 13 ใน คบ.6 (WIT0703)
    await expect(page.getByTestId('approve-case-button')).toBeDisabled()
    await signKb6(page, '13', 'ความเห็นเลขาธิการฯ')
    expect((await readCase(page, CASE_NO))?.kb6SecretarySignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('approve-case-button')).toBeEnabled()
    await page.getByTestId('approve-case-button').click()
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    // WIT0703 ช่องเลขแฟ้มของผลพิจารณา prefill เลขคำร้องไว้แล้ว
    await expect(dialog.getByTestId('decision-ref-case-no-input')).toHaveValue(CASE_NO)
    // ช่องข้อความในโมดัล: [0] เลขแฟ้ม · [1] เลขที่คำสั่ง · [2] เหตุผล
    await dialog.getByRole('textbox').nth(1).fill('ปปท. 501/2569')
    await dialog.getByTestId('decision-reason-input').fill('ตรวจทานข้อเท็จจริงและความเห็นตามลำดับชั้นครบถ้วนแล้ว สมควรได้รับการคุ้มครองพยานด้วยวิธีที่ 1')
    await confirmSecretaryApproval(page)
    await dialog.waitFor({ state: 'detached' })

    await expect.poll(async () => (await readCase(page, CASE_NO))?.activity7State).toBe('approved')
    const c = await readCase(page, CASE_NO)
    // WIT0702 คำสั่งฉบับลงนามผูกแฟ้มเดิม / WIT0705 วิธีสืบทอดจาก คบ.6 อัตโนมัติ (ไม่มีหน้าจอตรวจวิธีตอนอนุมัติ — 🟡)
    expect(c?.decisionNumber).toBe('ปปท. 501/2569')
    expect(c?.secretarySignedAt).toBeTruthy()
    expect(c?.secretarySignedBy).toBeTruthy()
    await expectStage(page, 'notice')
    // WIT0706/0707/0713 แขนงไม่อนุมัติ/ส่งกลับ/ข้อ 14 — เป็นของเส้นทางอื่น
    // WIT0710 ผลอนุมัติส่งต่อแท็บ 08A — ⚙️ ระบบ
  })

  // ============================================================
  // 08A รับคำสั่งและแยกแนวทางคุ้มครอง (Case 1.8 → 1.12)
  // ============================================================
  await test.step('WIT0801 / WIT0804 · เจ้าหน้าที่รับผลอนุมัติ (แบบ คบ.9/คบ.11 ถูกเพิ่มในแฟ้ม) ตรวจเลขที่คำสั่ง ผู้ลงนาม วันที่', async () => {
    // WIT0802 ◇ เอกสารต้นทางเป็นกรณีใด / WIT0803 กรณีเร่งด่วน (คบ.5) — ⚙️/ไม่อยู่ในเส้นทางนี้ (คำร้องหลักอ้าง คบ.11)
    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.9')).toBeVisible()
    await expect(formRow(page, 'คบ.11')).toBeVisible()
    // WIT0804 🟡 เจ้าหน้าที่ดูผลอนุมัติได้แต่ไม่มีปุ่มยืนยันว่าตรวจแล้ว — ระบบแสดงข้อมูลและล็อกไม่ให้แก้
    await expect(page.getByText('ปปท. 501/2569').first()).toBeVisible()
    await expect(page.getByTestId('approve-case-button')).toHaveCount(0)
  })

  await test.step('WIT0805 · เติมรายละเอียด คบ.9 ที่ลงนามพร้อมผลอนุมัติ แล้วตรวจพร้อมส่ง', async () => {
    const before = await readCase(page, CASE_NO)
    expect(before?.kb9Signed).toBe(true)
    await completeNoticeDetails(page)
    await checkNoticeReady(page)
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb9Signed).toBe(true)
    const c = await readCase(page, CASE_NO)
    expect(c?.outgoingSignedAt).toBeTruthy()
    expect(c?.approvalStep).toBe(3)
    expect(c?.kb9SignedAt).toBe(before?.kb9SignedAt)
    expect((c?.resultNotices as any)?.[9]?.versions).toHaveLength(2)
  })

  await test.step('WIT0806 · เจ้าหน้าที่นำส่ง คบ.9 ถึงพยาน บันทึกวันที่รับ ผู้รับ และหลักฐานการรับทราบ', async () => {
    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)
    const dispatchSection = page
      .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
      .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.dispatchedAt).toBeTruthy()

    await fieldAfterLabel(dispatchSection, 'ผู้รับหนังสือ').fill('นางสาวกมลชนก บุญรักษา')
    await dispatchSection
      .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
      .locator('input[type="file"]')
      .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
    await dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.deliveredAt).toBeTruthy()
    const c = await readCase(page, CASE_NO)
    expect(c?.deliveryAckType).toBeTruthy()
    expect(c?.kb11Signed).toBeFalsy()
  })

  await test.step('WIT0807 / WIT0808 · จัดทำ คบ.11 (วิธี ระยะเวลา เงื่อนไข) — การชี้แจงข้อตกลงเป็นขั้นนอกระบบ', async () => {
    // WIT0808 ชี้แจงข้อตกลงและเปิดโอกาสให้พยานซักถาม — ⚙️ นอกระบบ ไม่มีช่องบันทึก
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.11').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/11/)
    await areaField(page, 'ระบุรายละเอียดวิธีการ และเงื่อนไขการคุ้มครองพยานเพิ่มเติม').fill(
      'วิธีที่ 1 จัดเจ้าพนักงานเป็นชุดคุ้มครอง ระยะเวลา 30 วัน ตามที่ได้รับอนุมัติ ไม่เพิ่มวิธีใหม่'
    )
    // แบบ คบ.11 ไม่มีปุ่มบันทึกแยก — ฟอร์มเก็บร่างอัตโนมัติ และลงนาม/บันทึกข้อตกลงจากปุ่ม "ลงนาม" ในแฟ้มแทน
    await page.goto(DOSSIER_URL)
  })

  await test.step('WIT0809 / WIT0810 / WIT0811 · พยานและผู้ให้การคุ้มครองลงนาม คบ.11 ครบ 4 ช่อง แล้วบันทึกข้อตกลง (ล็อกฉบับ)', async () => {
    // WIT0809 ◇ พยานยินยอมตาม คบ.11? — เลือก "ยินยอม" (แขนงไม่ยินยอม WIT0812 เป็นของเส้นทางปฏิเสธ)
    await formRow(page, 'คบ.11').getByRole('button', { name: 'ลงนาม' }).click()
    const signButtons = page.getByRole('button', { name: 'ลงลายมือชื่อ' })
    await expect(signButtons).toHaveCount(4)
    for (let i = 0; i < 4; i++) {
      await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
      await signInModal(page, 'ผู้ลงนามทดสอบ')
    }
    await page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }).click()

    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
    const c = await readCase(page, CASE_NO)
    // WIT0809 ระบบบันทึกความยินยอมให้เองเมื่อลงนามครบ
    expect(JSON.stringify(c?.consents ?? [])).toContain('kb11')
    // WIT0813 ระบบเปิดเส้นทางตามวิธีที่เสนอใน คบ.6 (วิธีที่ 1) ให้อัตโนมัติ
    expect(c?.approvedMethods).toEqual([1])
    expect((c?.methodTracks as Array<{ method: number }>).map((t) => t.method)).toContain(1)
    // WIT0811 🟡 ล็อกฉบับ แต่ไม่มี Version/Hash ของไฟล์ฉบับลงนาม — แถวคบ.11 เหลือแค่ "ดูเอกสาร"
    await page.goto(DOSSIER_URL)
    await expect(formRow(page, 'คบ.11').getByRole('button', { name: 'ลงนาม' })).toHaveCount(0)
  })

  await test.step('WIT0813 · วิธีที่ได้รับอนุมัติ (วิธีที่ 1) เปิดเป็นเส้นทางปฏิบัติที่หน้า "วิธีคุ้มครองตามข้อ 15"', async () => {
    await page.goto(METHODS_URL)
    await expect(page.getByText('ความยินยอมตาม คบ.11 — ลงนามครบแล้ว')).toBeVisible()
    await expect(page.getByText('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').first()).toBeVisible()
    await expect(page.locator(`a[href="${METHOD1_URL}"]`)).toBeVisible()
  })

  // ============================================================
  // 08A-1 วิธีที่ 1 จัดชุดคุ้มครองและเริ่มปฏิบัติ (Case 1.12 → 1.13)
  // ============================================================
  await test.step('WIT0814 / WIT0815 · รับงานวิธีที่ 1 จากหน้า 08A (ระบบจำแนกเป็นคำร้องหลัก ไม่ใช่คำสั่งชั่วคราว)', async () => {
    // WIT0815 ◇ คำสั่งชั่วคราว หรือคำร้องหลัก? — ⚙️ ระบบแยกเอง: ไม่มี คบ.5 จึงเป็นคำร้องหลัก (แขนง WIT0816 ใช้เฉพาะเส้นทางเร่งด่วน)
    await page.goto(METHODS_URL)
    await page.locator(`a[href="${METHOD1_URL}"]`).click()
    await expect(page).toHaveURL(new RegExp(`/protection-method/1\\?caseNo=${CASE_NO}`))
    // คำร้องหลักต้องลงนาม คบ.8 ก่อน — ปุ่ม "ถัดไป" ของ wizard ยังถูกปิด
    await expect(page.getByText(/คบ\.8 ยังไม่ผ่านการลงนาม/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
    const c = await readCase(page, CASE_NO)
    expect(c?.kb5Approved).toBeFalsy()
  })

  await test.step('WIT0817 · เจ้าหน้าที่จัดทำ คบ.8 (คำสั่งมอบหมายเจ้าพนักงาน) แล้วส่งเสนอเลขาธิการฯ ลงนาม', async () => {
    // 🟡 ผังให้ผู้มีอำนาจจัดทำร่าง คบ.8 แต่ prototype ให้เจ้าหน้าที่ ป.ป.ท. จัดทำและเสนอ
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.8').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/8/)
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.8' }).click()
    await page.goto(DOSSIER_URL)

    await page.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
  })

  await test.step('WIT0818 · เลขาธิการฯ ตรวจและลงนาม คบ.8 (ฉบับถูกล็อก)', async () => {
    await switchRole(page, 'secretary')
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.8').getByRole('button', { name: 'ลงนาม' }).click()
    await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
    await signInModal(page)

    await expect.poll(async () => (await readCase(page, CASE_NO))?.kb8Signed).toBe(true)
    const c = await readCase(page, CASE_NO)
    expect(c?.kb8SignedAt).toBeTruthy()
    expect(c?.kb8SignedBy).toBeTruthy()
  })

  await test.step('WIT0819 / WIT0820 · จัดแผนปฏิบัติ (สมาชิก/เวร/รถ) แล้วชี้แจงภารกิจแบบ Need-to-Know', async () => {
    await switchRole(page, 'officer')
    await page.goto(METHOD1_URL)
    await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeEnabled()
    await page.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร').fill('ร.ต.อ. ก. และสมาชิก 4 นาย แบ่งเวร 3 ผลัด')
    await page.getByLabel('ยานพาหนะ').fill('รถกระบะตู้ทึบ 1 คัน')
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    // WIT0820 ชี้แจงภารกิจ Need-to-Know ให้ชุดปฏิบัติ
    await page.getByLabel('ผู้ชี้แจง').fill('นางสาวอรุณี ใจมั่น')
  })

  await test.step('WIT0821 · เริ่มปฏิบัติจริง (คำร้องหลัก → MAIN_ACTIVE)', async () => {
    // WIT0821 ◇ คำร้องหลักพร้อม มีผลอนุมัติแล้วหรือยัง? — มีผลอนุมัติ (คบ.8 ลงนามแล้ว) → MAIN_ACTIVE
    await expect(page.getByTestId('method-1-start')).toBeEnabled()
    await page.getByTestId('method-1-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    await expect(page.getByText('สถานะปัจจุบัน: MAIN_ACTIVE')).toBeVisible()
    const c = await readCase(page, CASE_NO)
    const track = (c?.methodTracks as Array<{ method: number; status: string; startedAt?: string; plan?: Record<string, unknown> }>).find(
      (t) => t.method === 1
    )
    expect(track?.status).toBe('active')
    expect(track?.startedAt).toBeTruthy()
    expect(String(track?.plan?.teamMembers)).toContain('ร.ต.อ. ก.')
    expect((c?.episode as { phases?: Array<{ kind: string }> } | undefined)?.phases?.[0]?.kind).toBe('MAIN')
  })

  // ============================================================
  // 10 ติดตามและรายงานผลการคุ้มครอง (คบ.13) (Case 1.13 → 1.14)
  // ============================================================
  await test.step('WIT1001 / WIT1002 / WIT1003 · รับ Episode เดียว แสดง Phase ปัจจุบัน วันสะสม และเพดาน 180 วัน', async () => {
    // WIT1003 🟡 เป็นป้ายเตือนบนหน้าจอ ไม่ใช่การแจ้งเตือนเชิงรุก
    await page.goto(MONITOR_URL)
    await page.getByRole('listitem').filter({ hasText: 'รับ Episode เดียว (TEMPORARY/MAIN)' }).getByRole('button').click()
    await expect(page.getByText('Phase ปัจจุบัน', { exact: true })).toBeVisible()
    await expect(page.getByText('คำร้องหลัก (MAIN)').first()).toBeVisible()
    await page.getByRole('listitem').filter({ hasText: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม' }).getByRole('button').click()
    await expect(page.getByText('ยังไม่ได้กำหนดรอบรายงาน')).toBeVisible()
    // ตั้งรอบแจ้งเตือน คบ.13 (ใช้วันที่ตั้งต้นของระบบ) — เปิดทางไปการ์ดเปิดรอบรายงาน WIT1004
    await page.getByRole('button', { name: 'ตั้งรอบแจ้งเตือน' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.nextReportDueAt).toBeTruthy()
  })

  await test.step('WIT1004 / WIT1005 · เปิดรอบรายงาน รวบรวมผลทุกวิธี แล้วจัดทำ คบ.13 และส่งลงนาม', async () => {
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: /เปิดรอบรายงานงวด/ }).click()
    await page.getByLabel(/หลักฐาน\/บันทึกที่รวบรวมได้/).fill('บันทึกปฏิบัติงานชุดคุ้มครองวิธีที่ 1 ประจำงวด ไม่พบเหตุการณ์ผิดปกติ')
    await page.locator('button.w-full').filter({ hasText: 'เปิดรอบรายงานงวด' }).click()

    // วิธีที่ใช้อยู่ (วิธีที่ 1) ถูกติ๊กเป็นค่าตั้งต้น
    await expect(page.getByRole('button', { name: 'วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ' })).toHaveClass(/border-blue/)
    await page.getByLabel('สรุปผลการดำเนินการ').fill('ชุดคุ้มครองปฏิบัติตามแผน พยานปลอดภัย ไม่พบเหตุคุกคามในงวดนี้')
    await page.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' }).click()

    await expect.poll(async () => ((await readCase(page, CASE_NO))?.monthlyReports as unknown[] | undefined)?.length).toBe(1)
    const c = await readCase(page, CASE_NO)
    const round = (c?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.methods).toEqual([1])
    expect(round.summary).toContain('ชุดคุ้มครอง')
    expect(round.officerSignedAt).toBeFalsy()
    expect(round.lockedAt).toBeFalsy()
  })

  await test.step('WIT1006 / WIT1007 · เจ้าหน้าที่ลงนามช่องผู้ปฏิบัติ แล้วพยานลงนามรับรอง คบ.13 (ที่แถว คบ.13 ในแฟ้ม)', async () => {
    // WIT1007 🟡 พยานไม่มีบัญชีในระบบ — เจ้าหน้าที่กดลงนามแทนพยานบนอุปกรณ์เดียวกัน
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.13').getByRole('button', { name: 'ลงนาม' }).click()
    const signButtons = page.getByRole('button', { name: 'ลงลายมือชื่อ' })
    await expect(signButtons).toHaveCount(2)
    await signButtons.first().click()
    await signInModal(page, 'นางสาวอรุณี ใจมั่น')
    await expect.poll(async () => {
      const r = ((await readCase(page, CASE_NO))?.monthlyReports as Array<Record<string, unknown>>)[0]
      return Boolean(r.officerSignedAt)
    }).toBe(true)

    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    await signInModal(page, 'สมชาย ใจดี')
    await expect.poll(async () => {
      const r = ((await readCase(page, CASE_NO))?.monthlyReports as Array<Record<string, unknown>>)[0]
      return Boolean(r.witnessSignedAt)
    }).toBe(true)
  })

  await test.step('WIT1008 / WIT1009 · ตรวจรับ คบ.13 เทียบวิธีที่อนุมัติ แล้วบันทึกสถานะล่าสุด/ความเสี่ยง', async () => {
    await page.goto(MONITOR_URL)
    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByRole('button', { name: 'รับรายงานและตรวจผล' })).toBeEnabled()
    await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
    await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()

    await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
    await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ไม่พบปัญหา')
    await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('คงมาตรการเดิมต่อเนื่อง')
    await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
    await expect(page.getByText(/บันทึกสถานะล่าสุดแล้ว/)).toBeVisible()
  })

  await test.step('WIT1010 · ล็อก คบ.13 เป็นรอบรายงานใหม่ (แก้ทับไม่ได้)', async () => {
    await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
    await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')
    await expect(page.getByText('ปิดรอบแล้ว')).toBeVisible()
    const c = await readCase(page, CASE_NO)
    const round = (c?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.lockedAt).toBeTruthy()
    expect(round.reviewedAt).toBeTruthy()
    expect(round.riskLevel).toBe('ต่ำ')
  })

  await test.step('WIT1011 / WIT1013 · ประเมินแขนง "ต้องทบทวน" แล้วส่ง คบ.13 ล่าสุดไปทบทวนที่แท็บ 11A', async () => {
    // WIT1011 ◇ ใกล้ครบกำหนดหรือจำเป็นต้องทบทวน? — 🟡 ผู้ใช้เลือกแขนงเอง เลือก "ต้องทบทวน" (แขนง "คุ้มครองต่อ" WIT1012 เป็นของเส้นทางอื่น)
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmDialog(page, 'ยืนยัน')

    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
    const c = await readCase(page, CASE_NO)
    const handoff = c?.reviewHandoff as Record<string, unknown>
    expect(handoff).toBeTruthy()
    expect(handoff.riskLevel).toBeTruthy()
    expect(handoff.orderRef).toBeTruthy()
    expect(handoff.cumulativeDays).toBeDefined()
    expect(handoff.remainingDays).toBeDefined()
  })

  // ============================================================
  // 11A ทบทวนผลการคุ้มครองและจำแนกแนวทาง (Case 1.14)
  // ============================================================
  await test.step('WIT1101 / WIT1102 / WIT1103 · รับงานจากแท็บ 10 อ่าน คบ.13 ล่าสุด ความเสี่ยง คำสั่ง และยอดวันสะสม', async () => {
    // ทั้งสามขั้นเป็น ⚙️ ระบบแสดง/คำนวณให้เอง (ไม่นับวันอัปโหลด)
    await page.goto(REVIEW_URL)
    await expect(page.getByTestId('review-submit-proposal')).toBeVisible()
    await expect(page.getByText(/สะสม/).first()).toBeVisible()
  })

  await test.step('WIT1104 / WIT1105 · เจ้าหน้าที่ประเมินผลและเสนอผลทบทวนแนวทาง "เข้าสู่กระบวนการยุติ"', async () => {
    // WIT1107 ◇ แนวทางที่ต้องดำเนินการ? — เส้นทางนี้เลือกแนวทางยุติ (คุ้มครองต่อ WIT1108 / ขยาย WIT1109 / เปลี่ยนวิธี WIT1110 / ข้อ 14 WIT1149 เป็นของเส้นทางอื่น)
    await page.getByTestId('review-outcome-terminate').click()
    // WIT1125 ◇ เหตุเริ่มยุติมาจากทางใด? — prototype ให้เลือกล่วงหน้าตอนเสนอผลทบทวนที่ 11A (ผังให้เลือกที่ 11C)
    // เส้นทางนี้เลือกแขนง "ครบกำหนด/เจ้าหน้าที่เห็นควร" (WIT1128) — แขนง คบ.7 (WIT1126) / หนังสือภายนอก (WIT1127) เป็นของเส้นทางอื่น
    await page.getByRole('radio', { name: /ครบกำหนด หรือเจ้าหน้าที่เห็นควรยุติ/ }).check()
    await page
      .getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ })
      .fill('ประเมินแล้วไม่พบเหตุภัยคุกคามต่อพยานอีกต่อไป ชุดคุ้มครองปฏิบัติตามแผนครบถ้วน')
    await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ผลทบทวนตาม คบ.13 ล่าสุด — เหตุภัยหมดไป เห็นควรเข้าสู่กระบวนการยุติ')
    await page.getByTestId('review-submit-proposal').click()
    await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')

    const c = await readCase(page, CASE_NO)
    const proposals = c?.reviewProposals as Array<Record<string, unknown>>
    expect(proposals).toHaveLength(1)
    expect(proposals[0].proposedOutcome).toBe('terminate')
    expect(proposals[0].status).toBe('pending')
  })

  await test.step('WIT1106 · ผบช.ชั้นต้นตรวจข้อเสนอและเห็นชอบ', async () => {
    // แขนง "ส่งคืนแก้ไข" เป็นของเส้นทางส่งกลับ
    await switchRole(page, 'supervisor')
    await page.goto(REVIEW_URL)
    await page.getByTestId('review-endorse').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ')
    const c = await readCase(page, CASE_NO)
    const p = (c?.reviewProposals as Array<Record<string, unknown>>)[0]
    expect(p.status).toBe('endorsed')
    expect(p.reviewedBy).toBeTruthy()
  })

  await test.step('WIT1111 · เจ้าหน้าที่ดำเนินการตามแนวทางที่เห็นชอบ → เข้าสู่กระบวนการยุติ (ไปแท็บ 11C)', async () => {
    // 🟡 ผังให้ผู้บังคับบัญชาตัดสินแนวทาง แต่ prototype ให้เจ้าหน้าที่เลือกแล้วผู้บังคับบัญชาเห็นชอบ
    await switchRole(page, 'officer')
    await page.goto(REVIEW_URL)
    await page.getByTestId('review-apply-outcome').click()
    await confirmDialog(page, 'ยืนยันดำเนินการ', 'คบ.15')
    await expect(page.getByText(/เลือกแนวทางแล้ว: เข้าสู่กระบวนการยุติ/)).toBeVisible()
    await expectStage(page, 'termination_review')
    const c = await readCase(page, CASE_NO)
    expect(c?.status).toBe('เข้าสู่กระบวนการยุติการคุ้มครอง')
    expect(String(c?.next)).toContain('คบ.15')
  })

  // ============================================================
  // 11C จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15) (Case 1.14 → 1.16)
  // ============================================================
  await test.step('WIT1124 / WIT1125 / WIT1128 · รับงานยุติจาก 11A เห็นเหตุเริ่มยุติแขนง "ครบกำหนด/เจ้าหน้าที่เห็นควร" ที่บันทึกไว้แล้ว', async () => {
    // 🟡 ผังให้บันทึกเหตุเริ่มยุติ (WIT1125-1128) ที่แท็บ 11C แต่ prototype บันทึกพร้อมการเสนอผลทบทวนที่ 11A แล้ว
    // จึงไม่ต้องกด "บันทึกเหตุเริ่มยุติ" ซ้ำ (ปุ่มนั้นใช้เมื่อเข้า 11C โดยไม่ผ่าน 11A)
    await page.goto(TERM_URL)
    // WIT1130 ⚙️ กฎ: การรับ คบ.7/จัดทำ คบ.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด — ต้องรอคำสั่ง คบ.16
    await expect(page.getByText(/สถานะ "ยุติ" จะเกิดขึ้นก็ต่อเมื่อมีคำสั่ง คบ\.16 ที่ลงนามแล้ว/)).toBeVisible()
    await expect(page.getByText('ครบกำหนด หรือเจ้าหน้าที่เห็นควรยุติตามผลประเมินล่าสุด').first()).toBeVisible()

    const c = await readCase(page, CASE_NO)
    expect((c?.terminationTrigger as Record<string, unknown>).source).toBe('due_or_officer')
    expect(c?.stage).toBe('termination_review')
  })

  await test.step('WIT1129 · จัดทำ คบ.15 อ้างอิงเหตุยุติ พร้อมหลักฐาน แล้วเสนอ', async () => {
    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ครบกำหนดคุ้มครองและไม่มีเหตุภัย ตามผลประเมินล่าสุด')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')

    const c = await readCase(page, CASE_NO)
    const kb15 = c?.kb15 as Record<string, unknown>
    expect(kb15.status).toBe('submitted')
    expect(kb15.trigger).toBe('due_or_officer')
    // WIT1130 สถานะคุ้มครองยังไม่เปลี่ยนเป็นยุติ
    expect(c?.stage).not.toBe('terminated')
    expect(c?.closedAt).toBeFalsy()
  })

  await test.step('WIT1131 / WIT1132 / WIT1134 · ผบช.ชั้นต้นตรวจ คบ.15 ครบถ้วน แล้วเสนอผู้มีอำนาจ (ไปแท็บ 11D)', async () => {
    // WIT1132 ◇ ครบถ้วน? — เลือก "ครบถ้วน" (แขนงส่งคืนแก้ไข WIT1133 เป็นของเส้นทางอื่น)
    await switchRole(page, 'supervisor')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ครบถ้วน · เสนอผู้มีอำนาจ' }).click()
    await confirmDialog(page, 'ยืนยันครบถ้วน', 'เสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ')

    const c = await readCase(page, CASE_NO)
    expect((c?.kb15 as Record<string, unknown>).status).toBe('endorsed')
    expect(c?.stage).not.toBe('terminated')
    // การ์ด 11D ปรากฏบนหน้าเดียวกัน
    await expect(page.getByText('พิจารณาและออกคำสั่งยุติ (คบ.16)', { exact: true })).toBeVisible()
  })

  // ============================================================
  // 11D คำสั่งยุติ แจ้งผล อุทธรณ์ และปิดงาน (Case 1.16 → 1.19)
  // ============================================================
  await test.step('WIT1135 / WIT1136 · ผอ. รับ คบ.15 พร้อมความเห็นจาก 11C แล้วอนุมัติให้ยุติ', async () => {
    // WIT1136 ◇ อนุมัติให้ยุติ? — เลือก "อนุมัติ" (แขนงไม่อนุมัติ WIT1137 คุ้มครองต่อ เป็นของเส้นทางอื่น)
    // ผู้มีอำนาจจะเป็น ผอ.สำนัก/กอง หรือเลขาธิการฯ ก็ได้ — ตาม mock state Case 1.16 ใช้ ผอ.
    await switchRole(page, 'director')
    await page.goto(TERM_URL)
    await expect(page.getByText('เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)')).toBeVisible()
    await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ เหตุภัยหมดไปแล้ว')
    await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')

    const c = await readCase(page, CASE_NO)
    const approval = c?.terminationApproval as Record<string, unknown>
    expect(approval.approved).toBe(true)
    expect(c?.stage).not.toBe('terminated')
    expect(c?.kb16).toBeFalsy()
  })

  await test.step('WIT1138 · เจ้าหน้าที่ร่างคำสั่ง คบ.16 (คำสั่งที่ วันที่ออก วันที่มีผล) แล้วส่งให้อนุมัติที่แถว คบ.16 ในแฟ้ม', async () => {
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('คำสั่งที่').fill('501/2569')
    await page.getByLabel('วันที่ออกคำสั่ง').fill(isoDaysFromToday(0))
    // วันที่มีผลเป็นอนาคต (+10 วัน) — คำสั่งที่ลงนามแล้วจึงยังไม่ทำให้สถานะเป็น "ยุติ" ก่อนถึงวันที่มีผล (WIT1130/WIT1139)
    await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(10))
    await page.getByPlaceholder('เหตุยุติตามคำสั่ง').fill('ครบกำหนดคุ้มครองและเหตุภัยดับลง')
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    let c = await readCase(page, CASE_NO)
    const draft = c?.kb16 as Record<string, unknown>
    expect(draft.orderNo).toBe('501/2569')
    expect(draft.status).toBe('draft')

    // 🟡 ขั้น "ส่งให้อนุมัติ" อยู่ที่แถวแบบฟอร์มในหน้าแฟ้ม (/dossier) ไม่ใช่หน้า /termination — ต้องสลับหน้า
    await expect(formRow(page, 'คบ.16')).toBeVisible()
    await formRow(page, 'คบ.16').getByRole('link', { name: 'เปิดแฟ้มคดี' }).or(formRow(page, 'คบ.16').getByRole('link', { name: 'เปิดแบบฟอร์ม' })).first().click()
    await expect(page).toHaveURL(/\/form\/16/)
    await page.goto(DOSSIER_URL)
    await formRow(page, 'คบ.16').getByRole('button', { name: 'ส่งให้อนุมัติ' }).click()
    await confirmDialog(page, 'ส่งให้อนุมัติ')

    c = await readCase(page, CASE_NO)
    expect((c?.kb16 as Record<string, unknown>).status).toBe('submitted')
  })

  await test.step('WIT1139 · เลขาธิการฯ ลงนามคำสั่ง คบ.16 (ล็อกฉบับ)', async () => {
    await switchRole(page, 'secretary')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')

    const c = await readCase(page, CASE_NO)
    const kb16 = c?.kb16 as Record<string, unknown>
    expect(kb16.signedAt).toBeTruthy()
    expect(kb16.locked).toBe(true)
    // ลงนามแล้วแต่ยังไม่ถึงวันที่มีผล — ยังไม่ยุติ
    expect(c?.stage).not.toBe('terminated')
  })

  await test.step('WIT1140 · บันทึกวันหยุดปฏิบัติจริงแยกจากวันออกคำสั่ง/วันที่มีผล', async () => {
    // 🟡 ปุ่มบันทึกวันหยุดปฏิบัติไม่จำกัดบทบาท — ใช้เจ้าหน้าที่ผู้รับผิดชอบตามผัง
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByLabel('วันหยุดปฏิบัติจริง').fill(isoDaysFromToday(10))
    await page.getByRole('button', { name: 'บันทึกวันหยุดปฏิบัติจริง' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกวันหยุดปฏิบัติจริงแล้ว')
    const c = await readCase(page, CASE_NO)
    expect((c?.kb16 as Record<string, unknown>).operationStoppedAt).toBeTruthy()
  })

  await test.step('WIT1141 · เจ้าหน้าที่จัดทำ คบ.17 แจ้งคำสั่งยุติและสิทธิอุทธรณ์ แล้วส่งให้ลงนาม → เลขาธิการฯ ลงนาม', async () => {
    await page.goto(TERM_URL)
    await page.getByPlaceholder('ชื่อไฟล์หนังสือ').fill('คบ17_แจ้งคำสั่งยุติ.pdf')
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
    let c = await readCase(page, CASE_NO)
    expect((c?.kb17 as Record<string, unknown>).status).toBe('draft')

    await formRow(page, 'คบ.17').getByRole('button', { name: 'ส่งให้ลงนาม' }).click()
    await confirmDialog(page, 'ส่งให้ลงนาม')
    c = await readCase(page, CASE_NO)
    expect((c?.kb17 as Record<string, unknown>).status).toBe('submitted')

    await switchRole(page, 'secretary')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ลงนาม คบ.17' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.17')
    c = await readCase(page, CASE_NO)
    expect((c?.kb17 as Record<string, unknown>).signedAt).toBeTruthy()
  })

  await test.step('WIT1142 / WIT1143 · ออกเลขและนำส่ง คบ.17 ผ่านสารบรรณเดิม แล้วอัปโหลดฉบับส่งเข้าแฟ้ม', async () => {
    // 🟡 กรอกเลขที่/วันที่หนังสือเอง ไม่มีการเชื่อมระบบสารบรรณเดิมจริง (ผังแยกเลน "ระบบสารบรรณเดิมภายนอก E-CMIS")
    await expect(page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' })).toBeDisabled()
    await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('สลข.501/2569')
    await page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ออกเลขและนำส่ง')
    let c = await readCase(page, CASE_NO)
    expect((c?.kb17 as Record<string, unknown>).registryNo).toBe('สลข.501/2569')
    expect((c?.kb17 as Record<string, unknown>).dispatchedAt).toBeTruthy()

    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('ชื่อไฟล์ คบ.17 ฉบับที่ส่งจริง').fill('คบ17_ฉบับส่ง_สลข501.pdf')
    await page.getByRole('button', { name: 'อัปโหลดฉบับส่งเข้าแฟ้ม' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('อัปโหลด คบ.17 ฉบับส่งเข้ากับแฟ้มแล้ว')
    c = await readCase(page, CASE_NO)
    expect(JSON.stringify(c?.kb17)).toContain('คบ17_ฉบับส่ง_สลข501.pdf')
  })

  await test.step('WIT1144 / WIT1145 · พยานรับ คบ.17 (นอกระบบ) แล้วบันทึกวันที่รับจริง เริ่มนับกรอบอุทธรณ์ 30 วัน', async () => {
    // WIT1144 พยานรับ คบ.17 — ⚙️ เกิดนอกระบบ ไม่มีบัญชีพยาน
    // ไม่ต้องข้ามด้วย mock state: วันรับจริงเป็นช่องวันที่ที่ผู้ใช้กรอกเองได้ จึงกรอกย้อนหลัง 31 วัน
    // เพื่อให้กรอบอุทธรณ์ 30 วันพ้นกำหนดภายในรอบเทสต์เดียว (ขับผ่าน UI ล้วน ไม่ re-seed)
    await page.getByLabel('วันที่พยานได้รับจริง').fill(isoDaysFromToday(-31))
    await page.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')

    const c = await readCase(page, CASE_NO)
    const kb17 = c?.kb17 as Record<string, unknown>
    expect(kb17.deliveredAt).toBeTruthy()
    expect(kb17.appealDueAt).toBeTruthy()
  })

  await test.step('WIT1146 / WIT1148 · ไม่มีอุทธรณ์ภายในกำหนด (พ้น 30 วัน) → ปิดงานคุ้มครอง ล็อกเอกสารลงนาม', async () => {
    // WIT1146 ◇ มีอุทธรณ์ภายในกำหนด? — 🟡 ระบบตัดสินจากสถานะ (ไม่มีปุ่มเลือก) เส้นทางนี้ = ไม่มีอุทธรณ์ ส่วน WIT1147 มีอุทธรณ์ → 09B เป็นของเส้นทางอื่น
    await expect(page.getByText(/พ้นกำหนดแล้ว/)).toBeVisible()
    const close = page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })
    await expect(close).toBeEnabled()
    await close.click()
    await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')

    await expectStage(page, 'terminated')
    const c = await readCase(page, CASE_NO)
    expect(c?.closedAt).toBeTruthy()
    expect((c?.kb16 as Record<string, unknown>).locked).toBe(true)
    await expect(page.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/)).toBeVisible()

    // เอกสารที่ลงนามถูกล็อก — เปิด คบ.11 ฉบับที่ลงนามแล้วต้องแก้ไม่ได้
    await page.goto(`/form/11?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('case-closed-fieldset')).toBeVisible()
  })
})
