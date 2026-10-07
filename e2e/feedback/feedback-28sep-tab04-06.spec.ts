import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole, linkMainCaseAsOfficer } from '../helpers/seed'

/**
 * ผลทดสอบ 28 ก.ย. — แท็บ 04 (จัดทำเอกสาร) / 05 (ลำดับชั้น) / 06 (เร่งด่วน) / เมนูแบบฟอร์ม
 *
 *  BUG-001 · TC-010  คบ.6 บันทึกโดยเว้นช่องบังคับไม่ได้
 *  BUG-002 · TC-011  ชื่อผู้ลงนามข้อ 10 ต้องเป็น ผบช.ชั้นต้น ไม่ใช่เจ้าหน้าที่
 *  BUG-003 · TC-014  ส่งต่อขั้นถัดไปแล้วผู้ส่งดึงเรื่องกลับ (ส่งกลับ/ตีกลับ) ไม่ได้
 *  BUG-004 · TC-019  หลัง ผอ. ตัดสินคุ้มครองชั่วคราว คำร้องหลักต้องเดินแท็บ 05 (คบ.6 → ผบช.ชั้นต้น)
 *  GAP-010           ร่างแบบ/ลายมือชื่อ คบ.3/4/5/6 แยกตามแฟ้ม ไม่รั่วข้ามแฟ้ม
 *  TC-053            แบบฟอร์มที่เปิดจากเมนู แบบฟอร์ม คบ. ต้องกลับรายการแบบฟอร์ม
 *
 * ทุก mock state ใช้เลขคำร้องเดียวกันคือ WP-2569-000501
 */

const CASE_NO = 'WP-2569-000501'
const OTHER_CASE_NO = 'WP-2569-000999'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const FORM6_URL = `/form/6?caseNo=${CASE_NO}`
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

/** ช่องกรอกของแบบ คบ.6 อ้างจาก label ตรงตัว */
function fieldByLabel(page: Page, label: string) {
  return page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
}

function opinionArea(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** เติมช่องบังคับ 1.1 / 2.2 ของ คบ.6 แล้วบันทึก (เจ้าหน้าที่จัดทำ คบ.6) */
async function fillRequiredAndSaveKb6(page: Page, caseNo = CASE_NO) {
  await page.goto(`/form/6?caseNo=${caseNo}`)
  await fieldByLabel(page, '1.1 ได้รับคำร้อง').fill('นางสาวกมลชนก บุญรักษา')
  await fieldByLabel(page, '2.2 ชื่อ-สกุล พยาน').fill('นางสาวกมลชนก บุญรักษา')
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
}

/** กรอกความเห็นข้อหนึ่งแล้วกด "ลงนาม" ในหน้า /form/6 — คืนชื่อที่เติมให้อัตโนมัติในกล่องลงนาม */
const workflowCard = (page: Page) =>
  page.locator('section', { has: page.getByRole('heading', { name: 'ส่งงานและดำเนินการในขั้นตอนนี้' }) })

async function signKb6(
  page: Page,
  caseNo: string,
  no: string,
  label: string,
  opinionText = 'เห็นชอบตามที่เสนอ',
  evidence?: { id: string; label: string }
) {
  await page.goto(`/form/6?caseNo=${caseNo}`)
  const area = opinionArea(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill(opinionText)
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  const prefilled = await nameInput.inputValue()
  if (evidence) await captureEvidence(page, evidence.id, nameInput, evidence.label)
  if (!prefilled) await nameInput.fill('ผู้ลงนามทดสอบ')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
  return prefilled
}

async function forwardFromDossier(page: Page, expectedText?: string | RegExp) {
  await page.goto(DOSSIER_URL)
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
}

/** ก๊อปแฟ้มแรกเป็นแฟ้มที่สอง (เลขคำร้องต่างกัน) ลง localStorage แล้วโหลดหน้าใหม่ — ใช้ทดสอบข้อมูลรั่วข้ามแฟ้ม */
async function cloneCase(page: Page, newNo: string) {
  await page.evaluate(
    ({ no, newNo: nn }) => {
      const raw = localStorage.getItem('ecmis-case-storage-v2')!
      const store = JSON.parse(raw)
      const src = store.state.cases.find((c: Record<string, unknown>) => c.no === no)
      store.state.cases.push({ ...src, no: nn, person: 'นายบี ทดสอบข้ามแฟ้ม', assignmentHistory: [] })
      localStorage.setItem('ecmis-case-storage-v2', JSON.stringify(store))
    },
    { no: CASE_NO, newNo }
  )
  await page.reload()
}

test.describe('BUG-001 · TC-010 — บันทึก คบ.6 โดยเว้นช่องบังคับ', () => {
  test('TC-010 · [Demo] เว้นช่อง 1.1 และ 2.2 แล้วกดบันทึก — บันทึกได้ ระบบเติมชื่อจากแฟ้มให้ และนับว่าจัดทำ คบ.6 แล้ว', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)
    const urgencyButton = page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' })
    if (await urgencyButton.isVisible().catch(() => false)) await urgencyButton.click()

    // เปิดแฟ้ม → ไปลงนามในแบบ คบ.6 (ปุ่มนี้โผล่เมื่อส่งต่อยังไม่ได้เพราะไม่มี คบ.6)
    await page.getByRole('link', { name: 'ไปลงนามในแบบ คบ.6' }).click()
    await expect(page).toHaveURL(/\/form\/6/)

    // เว้นช่อง 1.1 และ 2.2 — โหมดสาธิตไม่บล็อกการบันทึก
    await fieldByLabel(page, '1.1 ได้รับคำร้อง').fill('')
    await fieldByLabel(page, '2.2 ชื่อ-สกุล พยาน').fill('')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()

    // บันทึกได้และกลับแฟ้ม — ช่องชื่อที่ว่างถูกเติมจากแฟ้มให้ และปลดล็อกปุ่มส่ง
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
    expect((await readCase(page, CASE_NO))?.kb6PreparedAt).toBeTruthy()
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(fieldByLabel(page, '1.1 ได้รับคำร้อง')).not.toHaveValue('')
    await expect(fieldByLabel(page, '2.2 ชื่อ-สกุล พยาน')).not.toHaveValue('')
  })
})

test.describe('BUG-002 · TC-011 — ชื่อผู้ลงนามข้อ 10 ของ ผบช.ชั้นต้น', () => {
  test('TC-011 · [BUG-002] ผบช.ชั้นต้นลงนามข้อ 10 — ชื่อผู้ลงนามเป็นชื่อ ผบช. ไม่ใช่ชื่อเจ้าหน้าที่', async ({ page }) => {
    await seedMockState(page, 'Case 2', 'supervisor')
    const prefilled = await signKb6(page, CASE_NO, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'เห็นชอบตามที่เสนอ', {
      id: 'TC-011-a',
      label: 'ชื่อผู้ลงนามเป็น ผบช.ชั้นต้น (ไม่ใช่เจ้าหน้าที่)',
    })

    // ชื่อที่เติมให้ในกล่องลงนามต้องเป็น ผบช. ที่สวมบทบาทอยู่
    expect(prefilled).toBe(SUPERVISOR)

    const after = await readCase(page, CASE_NO)
    expect(after?.kb6SupervisorSignedBy).toBe(SUPERVISOR)
    expect(after?.kb6SupervisorSignedBy).not.toBe(OFFICER)

    // ประวัติแฟ้มบันทึกผู้ลงนามจริง
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(
      history.some((h) => h.action?.includes('ผู้บังคับบัญชาชั้นต้นลงนามความเห็นใน คบ.6') && h.actor === SUPERVISOR)
    ).toBeTruthy()

    // ช่องชื่อ ผบช. ในฉบับพิมพ์ของ คบ.6 ตรงกับผู้ลงนามจริง
    const nameField = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      return raw ? JSON.parse(raw).state.drafts['6']['ผู้บังคับบัญชา'] : ''
    })
    expect(nameField).toBe(SUPERVISOR)
    await page.goto(FORM6_URL)
    await captureEvidence(page, 'TC-011-b', page.getByText(SUPERVISOR).first(), 'ชื่อ ผบช. ปรากฏเป็นผู้ลงนามใน คบ.6')
  })
})

test.describe('BUG-003 · TC-014 — ส่งต่อแล้วดึงเรื่องกลับไม่ได้', () => {
  test('TC-014 · [BUG-003] ผบช. เสนอ ผอ. แล้ว — ผบช. ไม่เห็นปุ่มส่งกลับแก้ไข/ตีกลับอีก', async ({ page }) => {
    await seedMockState(page, 'Case 2', 'supervisor')
    await page.goto(DOSSIER_URL)
    // ขั้นของตน (กลั่นกรอง) — ยังมีปุ่มส่งกลับ (TC-012 ยังใช้ได้)
    await expect(page.getByTestId('return-case-button')).toBeVisible()

    await signKb6(page, CASE_NO, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    await forwardFromDossier(page)
    expect((await readCase(page, CASE_NO))?.stage).toBe('director_review')

    // ผู้ส่งเปิดแฟ้มเดิม — ไม่มีปุ่มส่งกลับหลังส่งต่อแล้ว
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await captureEvidence(page, 'TC-014-a', workflowCard(page), 'ส่งต่อแล้ว ไม่มีปุ่มส่งกลับแก้ไข/ตีกลับ ให้ผู้ส่งอีก')
    expect((await readCase(page, CASE_NO))?.stage).toBe('director_review')
  })

  test('TC-014 · [BUG-003] ผอ. ลงนามแล้วส่งรองเลขาธิการฯ — ผอ. ไม่เห็นปุ่มส่งกลับ ส่วนรองเลขาฯ ยังส่งกลับได้', async ({
    page,
  }) => {
    // Case 2.1 — อยู่ที่ ผอ. ผบช.ลงนามข้อ 10 แล้ว
    await seedMockState(page, 'Case 2.1', 'director')
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('return-case-button')).toBeVisible()

    await signKb6(page, CASE_NO, '11', 'ความเห็นผู้อำนวยการสำนัก')
    await forwardFromDossier(page)
    expect((await readCase(page, CASE_NO))?.stage).toBe('deputy_review')

    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('return-case-button')).toHaveCount(0)
    await captureEvidence(page, 'TC-014-b', workflowCard(page), 'ผอ. ส่งต่อแล้ว ไม่มีปุ่มส่งกลับ')

    // ผู้ถือแฟ้มขั้นรองเลขาฯ ส่งกลับได้ตามปกติ (TC-015)
    await switchRole(page, 'deputy_secretary')
    await expect(page.getByTestId('return-case-button')).toBeVisible()
  })
})

test.describe('BUG-004 · TC-019 — คำร้องหลักเดินต่อหลังตัดสินคำขอเร่งด่วน', () => {
  test('TC-019 · [BUG-004] ผอ. ไม่อนุมัติชั่วคราว — เจ้าหน้าที่ต้องทำ คบ.6 และส่ง ผบช.ชั้นต้นก่อน (ไม่ใช่เสนอ ผอ. ทันที)', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)
    await page.getByTestId('fast-track-ready-button').click()
    await confirmDialog(page, 'ยืนยันข้อมูลครบ')
    await page.getByTestId('fast-track-deny-button').click()
    await page.getByTestId('fast-track-deny-reason').fill('ยังไม่เข้าเงื่อนไขคุ้มครองชั่วคราว')
    await page.getByTestId('fast-track-deny-confirm').click()
    await confirmDialog(page, 'ยืนยันไม่อนุมัติชั่วคราว')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    // เจ้าหน้าที่: ปุ่มส่งต้องเป็นส่ง ผบช.ชั้นต้น (ไม่ใช่เสนอ ผอ.) และล็อกจนกว่าจะมี คบ.6
    await switchRole(page, 'officer')
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('ส่งผู้บังคับบัญชาชั้นต้น')
    await expect(forwardButton).not.toContainText('เสนอ ผอ.')
    await expect(forwardButton).toBeDisabled()
    await expect(forwardButton).toHaveAttribute('title', /ยังไม่ได้จัดทำแบบ คบ\.6/)
    await captureEvidence(page, 'TC-019-a', forwardButton, 'ต้องส่ง ผบช.ชั้นต้น และต้องมี คบ.6 ก่อน (ปุ่มล็อก)')

    // จัดทำ คบ.6 แล้วส่ง — ไป ผบช.ชั้นต้น ไม่ข้ามไป ผอ.
    await fillRequiredAndSaveKb6(page)
    await page.goto(DOSSIER_URL)
    await expect(forwardButton).toBeEnabled()
    await forwardButton.click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('supervisor_review')
  })

  test('TC-019 · [BUG-004] ผอ. อนุมัติ คบ.5 + พยานยินยอม — คำร้องหลักเดินแท็บ 05 ต้องมี คบ.6 และผ่าน ผบช.ชั้นต้นก่อน ผอ.', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 3.1', 'director')
    await page.goto(DOSSIER_URL)
    await page.getByTestId('fast-track-ready-button').click()
    await confirmDialog(page, 'ยืนยันข้อมูลครบ')
    await page.getByTestId('fast-track-approve-button').click()
    await page.getByTestId('kb5-order-no').fill('045/2569')
    await page.getByTestId('kb5-director-opinion').fill('เห็นชอบให้คุ้มครองชั่วคราวตามวิธีที่เสนอ')
    await page.getByTestId('kb5-sign-button').click()
    const nameInput = page.getByTestId('signature-name-input')
    await nameInput.waitFor()
    await nameInput.fill(DIRECTOR)
    await page.getByTestId('signature-certify-checkbox').check()
    await page.getByTestId('signature-confirm-button').click()
    await page.getByTestId('fast-track-approve-confirm').click()
    await confirmDialog(page, 'ยืนยันอนุมัติและออกคำสั่ง')

    // อนุมัติแล้วแฟ้มกลับเจ้าหน้าที่ทันที (ไม่ค้างที่ขั้น ผอ. ให้ลงนาม คบ.6 ข้าม ผบช.)
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')
    await switchRole(page, 'officer')
    await page.getByTestId('kb5-witness-ack-button').click()
    const witnessName = page.getByTestId('signature-name-input')
    await witnessName.waitFor()
    await witnessName.fill('สมชาย ใจดี')
    await page.getByTestId('signature-certify-checkbox').check()
    await page.getByTestId('signature-confirm-button').click()
    await expect
      .poll(async () => ((await readCase(page, CASE_NO))?.fastTrack as Record<string, unknown>)?.step)
      .toBe('active')

    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toContainText('ส่งผู้บังคับบัญชาชั้นต้น')
    await expect(forwardButton).toBeDisabled()
    await expect(forwardButton).toHaveAttribute('title', /ยังไม่ได้จัดทำแบบ คบ\.6/)
    await captureEvidence(page, 'TC-019-b', forwardButton, 'อนุมัติ คบ.5 แล้ว ยังส่งต่อไม่ได้จนกว่าจะมี คบ.6 และผ่าน ผบช.')
    expect((await readCase(page, CASE_NO))?.stage).toBe('staff_review')
  })
})

test.describe('GAP-010 — ร่างแบบและลายมือชื่อแยกตามแฟ้ม', () => {
  test('GAP-010 · ข้อมูล คบ.6 ของแฟ้ม A ไม่ปรากฏในแฟ้ม B และด่านตรวจของแฟ้ม B ไม่ถูกข้ามด้วยความเห็นของแฟ้ม A', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 2', 'supervisor')
    await page.goto(DOSSIER_URL)
    await cloneCase(page, OTHER_CASE_NO)

    // แฟ้ม A: ผบช. กรอกความเห็นข้อ 10 และช่อง 1.1 (ยังไม่ลงนาม)
    await page.goto(FORM6_URL)
    await opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น').fill('ความเห็นลับของแฟ้ม A')
    await fieldByLabel(page, '1.1 ได้รับคำร้อง').fill('ผู้ร้องแฟ้ม A')

    // แฟ้ม B: ต้องเริ่มจากข้อมูลของแฟ้มตัวเอง ไม่เห็นข้อมูลแฟ้ม A
    await page.goto(`/form/6?caseNo=${OTHER_CASE_NO}`)
    await expect(opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toHaveValue('')
    await expect(fieldByLabel(page, '1.1 ได้รับคำร้อง')).toHaveValue('')
    await captureEvidence(
      page,
      'GAP-010-a',
      [opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น'), fieldByLabel(page, '1.1 ได้รับคำร้อง')],
      'แฟ้ม B เริ่มว่าง ไม่มีข้อมูลของแฟ้ม A ปนมา'
    )

    // ด่านตรวจของแฟ้ม B อ่านสถานะของแฟ้ม B — ผบช.ชั้นต้นยังไม่ได้ลงนามข้อ 10 ของแฟ้มนี้ จึงส่งต่อไม่ได้
    // (โหมดสาธิตไม่บังคับกรอกความเห็นก่อนลงนามแล้ว แต่ต้องลงนามของแฟ้มตัวเอง ไม่ใช้ของแฟ้ม A)
    await page.goto(`/dossier/${OTHER_CASE_NO}`)
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeDisabled()
    await expect(forwardButton).toHaveAttribute('title', /ยังไม่ได้ลงนามความเห็นใน คบ\.6/)
    await captureEvidence(page, 'GAP-010-b', forwardButton, 'แฟ้ม B ยังส่งไม่ได้ ไม่ใช้ความเห็นของแฟ้ม A')

    // กลับแฟ้ม A — ข้อมูลของแฟ้ม A ยังอยู่ครบ (สลับกลับได้ ไม่หาย)
    await page.goto(FORM6_URL)
    await expect(opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toHaveValue('ความเห็นลับของแฟ้ม A')
    await expect(fieldByLabel(page, '1.1 ได้รับคำร้อง')).toHaveValue('ผู้ร้องแฟ้ม A')
  })
})

test.describe('TC-053 — ปุ่มกลับจากแบบฟอร์มที่เปิดจากเมนูแบบฟอร์ม', () => {
  test('TC-053 · แบบฟอร์มที่เปิดจากเมนู แบบฟอร์ม คบ. ต้องมีปุ่มกลับรายการแบบฟอร์ม (/forms)', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto('/forms')
    await page.getByRole('link', { name: 'เปิดแบบฟอร์ม' }).first().click()
    await expect(page).toHaveURL(/\/form\/\d+/)

    const back = page.getByRole('link', { name: 'กลับรายการแบบฟอร์ม' })
    await expect(back).toBeVisible()
    await expect(page.getByRole('link', { name: 'กลับทะเบียน' })).toHaveCount(0)
    await captureEvidence(page, 'TC-053-a', back, 'มีปุ่ม "กลับรายการแบบฟอร์ม" (แทนกลับทะเบียน)')
    await back.click()
    await expect(page).toHaveURL(/\/forms$/)
  })

  test('TC-053 · เปิดจากแฟ้มยังกลับแฟ้มคำร้องเหมือนเดิม', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    const back = page.getByRole('link', { name: 'กลับแฟ้มคำร้อง' })
    await expect(back).toBeVisible()
    await captureEvidence(page, 'TC-053-b', back, 'เปิดจากแฟ้ม ยังมีปุ่ม "กลับแฟ้มคำร้อง" ตามเดิม')
    await back.click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
  })
})
