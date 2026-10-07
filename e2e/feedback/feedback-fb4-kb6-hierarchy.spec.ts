import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole, linkMainCaseAsOfficer } from '../helpers/seed'

/**
 * FB-4 · TC-009 ~ TC-012 — ความเห็นตามลำดับชั้นในแบบ คบ.6 (ข้อ 9–13)
 *
 * ช่องความเห็นแต่ละข้อ (10-13) จำกัดสิทธิ์แก้ไขตามลำดับชั้นที่แฟ้มเดินอยู่จริง (WIT0513) —
 * ผู้ใช้ระดับที่ยังไม่ถึงคิว (รวมถึงเจ้าพนักงาน ซึ่งไม่มีสิทธิ์แก้ไขข้อ 10-13 ข้อใดเลย) พิมพ์ทับความเห็น
 * ของระดับอื่นจากหน้ากรอกแบบฟอร์ม (/form/6) ไม่ได้ และมีปุ่ม "ลงนาม" อยู่ในแถบปุ่มท้ายหน้าฟอร์มเดียวกัน
 * ข้าง "บันทึกแบบ คบ.6" สำหรับผู้มีสิทธิ์ในขั้นตอนปัจจุบัน (ไม่ใช่ปุ่ม "ลงนาม" ข้างแถว คบ.6 ในหน้าแฟ้มอีกต่อไป)
 *
 * หมายเหตุการแมปเคส: ชีต test case อ้างเลขคำร้อง WP-2569-000503 ซึ่งไม่มีอยู่จริงใน mock data —
 * ทุก mock state ในระบบใช้เลขคำร้องเดียวกันคือ WP-2569-000501 จึงใช้เลขนี้แทนทุกเทสต์ในไฟล์นี้
 */

const CASE_NO = 'WP-2569-000501'
const FORM6_URL = `/form/6?caseNo=${CASE_NO}`
const DOSSIER_URL = `/dossier/${CASE_NO}`

/** ช่อง textarea ของข้อความเห็นแต่ละข้อ อ้างจาก label ตรงตัวในแบบ คบ.6 */
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

/**
 * ลงนามความเห็นข้อหนึ่งใน คบ.6 จากปุ่ม "ลงนาม" ท้ายหน้ากรอกแบบ /form/6 (ตำแหน่งจริงของปุ่ม "ลงนาม" — TC-011)
 * ความเห็นกรอกในแบบฟอร์มเอง ไม่มีช่องความเห็นซ้ำในโมดัลลงนามอีกต่อไป
 */
async function signKb6(page: Page, caseNo: string, no: string, label: string, opinionText = 'เห็นชอบตามที่เสนอ') {
  await page.goto(`/form/6?caseNo=${caseNo}`)
  const area = opinionArea(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill(opinionText)
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  const nameInput = page.getByTestId('signature-name-input')
  if (!(await nameInput.inputValue())) await nameInput.fill('ผู้ลงนามทดสอบ')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

test.describe('TC-009 — เจ้าพนักงานเปิด คบ.6 ไม่มีสิทธิ์แก้ไขข้อ 10-13 ข้อใดเลย', () => {
  test('TC-009 · [FB-4] ข้อ 10-13 ควรถูกปิดใช้งาน (เทา) พร้อม tooltip อธิบายว่ายังไม่ถึงลำดับชั้นนี้', async ({
    page,
  }) => {
    // ใช้ Case 1.3 — เจ้าหน้าที่ระดับ officer, แฟ้มอยู่ที่ staff_review (ขั้นเตรียม คบ.6 ระดับเจ้าหน้าที่)
    // เจ้าพนักงานจัดทำ คบ.6 ได้ในหมวด 1-9 แต่ไม่มีสิทธิ์แก้ไขความเห็นตามลำดับชั้นข้อ 10-13 ข้อใดเลย
    // (ข้อ 10 เป็นของผู้บังคับบัญชาชั้นต้น และแฟ้มยังไม่ถึงขั้น supervisor_review ด้วย)
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(FORM6_URL)

    await expect(page.getByText('9.–13.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: /ความเห็นตามลำดับชั้น/ })).toBeVisible()

    const items = [
      ['10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'ผู้บังคับบัญชาชั้นต้น'],
      ['11', 'ความเห็นผู้อำนวยการสำนัก', 'ผู้อำนวยการสำนัก/กอง'],
      ['12', 'ความเห็นรองเลขาธิการฯ', 'รองเลขาธิการ ป.ป.ท.'],
      ['13', 'ความเห็นเลขาธิการฯ', 'เลขาธิการ ป.ป.ท.'],
    ] as const

    for (const [no, label, signerRole] of items) {
      const area = opinionArea(page, `${no}. ${label}`)
      await expect(area, `ข้อ ${no} ควรถูกปิดใช้งาน`).toBeDisabled({ timeout: 2000 })
      await expect(area, `ข้อ ${no} ควรมี tooltip อธิบายเหตุผล`).toHaveAttribute(
        'title',
        `ยังไม่ถึงลำดับชั้นนี้ — ช่องนี้สำหรับ${signerRole}เท่านั้น`
      )
    }

    // เจ้าพนักงานยังไม่ถึงคิวลงนามข้อใด — ไม่ควรเห็นปุ่ม "ลงนาม" ท้ายหน้า
    await expect(page.getByRole('button', { name: /^ลงนาม$/ })).toHaveCount(0)
  })
})

test.describe('TC-010 — หลังส่งต่อขึ้นชั้น ผอ. ควรเห็นข้อ 10 อ่านอย่างเดียว และข้อ 11 แก้ไขได้', () => {
  test('TC-010 · [FB-4] ผอ. เปิด คบ.6 เดียวกัน — ข้อ 10 read-only, ข้อ 11 editable, ข้อ 12-13 ยังล็อก', async ({
    page,
  }) => {
    // เริ่มที่ officer/staff_review (Case 1.3) → ส่งต่อ → ผบช.ชั้นต้นกรอกและลงนามข้อ 10 → ส่งต่อ ผอ.
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(DOSSIER_URL)
    // Case 1.3 ตั้งต้นยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงก่อนจึงจะผ่านด่านส่งต่อ
    await linkMainCaseAsOfficer(page)
    // Case 1.3 ยังไม่ได้ประเมินความเร่งด่วน — ต้องเลือกเส้นทางก่อนปุ่มส่งต่อจะกดได้ (ตามแบบแผนใน sheet05)
    const urgencyButton = page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' })
    if (await urgencyButton.isVisible().catch(() => false)) await urgencyButton.click()

    // เจ้าพนักงานจัดทำ คบ.6 (หมวด 1-9) ก่อน — ไม่แตะข้อ 10 (เป็นของผู้บังคับบัญชาชั้นต้นเท่านั้น)
    // WIT0501 — ต้องจัดทำ คบ.6 จริงก่อนจึงจะส่งต่อได้
    await page.goto(FORM6_URL)
    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await page.goto(DOSSIER_URL)

    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')

    let after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('supervisor_review')

    await switchRole(page, 'supervisor')
    await signKb6(page, CASE_NO, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    after = await readCase(page, CASE_NO)
    expect(after?.kb6SupervisorSignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('director_review')

    // สลับไปเป็น ผอ. แล้วเปิดแบบ คบ.6 ของแฟ้มเดียวกัน
    await switchRole(page, 'director')
    await page.goto(FORM6_URL)

    const item10 = opinionArea(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')
    const item11 = opinionArea(page, '11. ความเห็นผู้อำนวยการสำนัก')
    const item12 = opinionArea(page, '12. ความเห็นรองเลขาธิการฯ')
    const item13 = opinionArea(page, '13. ความเห็นเลขาธิการฯ')

    // ข้อ 10 ลงนามแล้ว — อ่านอย่างเดียว
    await expect(item10).toBeDisabled({ timeout: 2000 })
    await expect(item10).toHaveAttribute('title', 'ลงนามแล้ว — แก้ไขไม่ได้')

    // ข้อ 11 (ระดับของ ผอ. ที่ถึงคิวแล้ว) ควรแก้ไขได้ — per-item lock ไม่ใช่ล็อกทั้งฉบับ (WIT0513)
    await expect(item11, 'ข้อ 11 ควรแก้ไขได้เมื่อถึงคิว ผอ.').toBeEnabled({ timeout: 2000 })

    // ข้อ 12-13 ยังไม่ถึงคิว ควรยังคงล็อกอยู่
    await expect(item12).toBeDisabled({ timeout: 2000 })
    await expect(item13).toBeDisabled({ timeout: 2000 })
  })
})

test.describe('TC-011 — ปุ่ม "ลงนาม" ในหน้าแบบ คบ.6 ข้าง "บันทึกแบบ คบ.6"', () => {
  test('TC-011 · [FB-4] ผอ. กรอกข้อ 11 แล้วลงนามจากหน้าฟอร์ม — บันทึกชื่อ/เวลา ล็อกฉบับ และเข้า Audit Log', async ({
    page,
  }) => {
    // Case 1.5 — director_review, ผบช.ชั้นต้นลงนามข้อ 10 แล้ว (kb6SupervisorSignedAt มีค่า) ถึงคิว ผอ.
    await seedMockState(page, 'Case 1.5', 'director')
    await page.goto(FORM6_URL)

    const item11 = opinionArea(page, '11. ความเห็นผู้อำนวยการสำนัก')
    // ผอ. กรอกข้อ 11 ได้จากหน้านี้แม้ฉบับจะถูกล็อกทั้งฉบับตั้งแต่ผบช.ชั้นต้นลงนามข้อ 10 แล้ว (per-item lock)
    await expect(item11).toBeEnabled()
    await item11.fill('เห็นชอบ เสนอรองเลขาธิการ ป.ป.ท. กลั่นกรองต่อไป')

    const saveButton = page.getByRole('button', { name: 'บันทึกแบบ คบ.6' })
    await expect(saveButton).toBeVisible()
    const signButton = page.getByRole('button', { name: /^ลงนาม$/ })
    await expect(signButton, 'ควรมีปุ่ม "ลงนาม" อยู่ในแถบปุ่มท้ายหน้าฟอร์ม (/form/6) เช่นเดียวกับ "บันทึกแบบ คบ.6"').toBeVisible()
    await expect(signButton).toBeEnabled()

    await signButton.click()
    const nameInput = page.getByTestId('signature-name-input')
    if (!(await nameInput.inputValue())) await nameInput.fill('นายวีระยุทธ พิทักษ์ธรรม')
    await page.getByTestId('signature-certify-checkbox').check()
    await page.getByTestId('signature-confirm-button').click()

    const after = await readCase(page, CASE_NO)
    expect(after?.kb6DirectorSignedAt).toBeTruthy()

    // ข้อ 11 ถูกล็อกเป็นรายข้อทันทีหลังลงนาม
    await expect(item11).toBeDisabled()
    await expect(item11).toHaveAttribute('title', 'ลงนามแล้ว — แก้ไขไม่ได้')

    // เข้า Audit Log ของแฟ้ม
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action?.includes('ผอ.สำนัก/กอง ลงนามความเห็นใน คบ.6'))).toBeTruthy()
  })
})

test.describe('TC-012 — เจ้าพนักงานพยายามแก้ไขข้อ 11-13 ผ่านการงัด DOM', () => {
  test('TC-012 · [FB-4] ค่าข้อ 11-13 ที่แก้โดยไม่มีสิทธิ์ต้องไม่ถูกบันทึก พร้อมคำเตือนว่าไม่มีสิทธิ์', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(FORM6_URL)

    const item11 = opinionArea(page, '11. ความเห็นผู้อำนวยการสำนัก')
    const item12 = opinionArea(page, '12. ความเห็นรองเลขาธิการฯ')
    const item13 = opinionArea(page, '13. ความเห็นเลขาธิการฯ')

    // ช่องเหล่านี้ถูก disabled ไว้ตั้งแต่ต้น (เจ้าพนักงานไม่มีสิทธิ์แก้ไขข้อ 10-13 ข้อใดเลย) — งัด DOM ออกก่อน
    await expect(item11).toBeDisabled()
    await expect(item12).toBeDisabled()
    await expect(item13).toBeDisabled()
    await page.evaluate(() => {
      document.querySelectorAll('textarea[disabled]').forEach((el) => el.removeAttribute('disabled'))
    })

    const tamperedText11 = 'DOM-TAMPER: ความเห็น ผอ. ที่เจ้าพนักงานไม่มีสิทธิ์กรอก'
    const tamperedText12 = 'DOM-TAMPER: ความเห็นรองเลขาธิการที่เจ้าพนักงานไม่มีสิทธิ์กรอก'
    const tamperedText13 = 'DOM-TAMPER: ความเห็นเลขาธิการที่เจ้าพนักงานไม่มีสิทธิ์กรอก'
    await item11.fill(tamperedText11)
    await item12.fill(tamperedText12)
    await item13.fill(tamperedText13)

    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()

    // ระบบตรวจสิทธิ์ผ่าน mock API (TC-012) แล้วเตือนว่าไม่มีสิทธิ์แก้ไขระดับเหล่านี้
    const warningToast = page.locator('.swal2-popup', {
      hasText: /ไม่มีสิทธิ์|ไม่มีสิทธิ|ไม่สามารถแก้ไข|เกินสิทธิ์|ไม่ได้รับอนุญาต/,
    })
    await expect(warningToast, 'ควรมีคำเตือนว่าไม่มีสิทธิ์แก้ไขข้อ 11-13').toBeVisible({ timeout: 3000 })

    // ตรวจสอบการคงอยู่จริงของค่าที่พิมพ์ผ่าน localStorage (ecmis-form-draft-storage-v2) แล้วโหลดหน้าใหม่
    await page.reload()

    const draftAfterReload = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
      if (!raw) return null
      const drafts = JSON.parse(raw).state?.drafts?.['6'] ?? {}
      return {
        item11: drafts['ความเห็นผู้อำนวยการ'] ?? '',
        item12: drafts['ความเห็นรองเลขาธิการ'] ?? '',
        item13: drafts['ความเห็นเลขาธิการ'] ?? '',
      }
    })

    // ค่าข้อ 11-13 ต้อง "ไม่ถูกบันทึก" ข้ามระดับ
    expect(draftAfterReload?.item11, 'ข้อ 11 ไม่ควรถูกบันทึกค่าที่เจ้าพนักงานกรอกข้ามระดับ').not.toContain('DOM-TAMPER')
    expect(draftAfterReload?.item12, 'ข้อ 12 ไม่ควรถูกบันทึกค่าที่เจ้าพนักงานกรอกข้ามระดับ').not.toContain('DOM-TAMPER')
    expect(draftAfterReload?.item13, 'ข้อ 13 ไม่ควรถูกบันทึกค่าที่เจ้าพนักงานกรอกข้ามระดับ').not.toContain('DOM-TAMPER')

    // ยืนยันซ้ำผ่านหน้า UI หลังโหลดใหม่ ว่าค่าที่พิมพ์ไม่ปรากฏอยู่ในช่องอีก
    await expect(
      opinionArea(page, '11. ความเห็นผู้อำนวยการสำนัก'),
      'ข้อ 11 ในหน้า UI หลัง reload ไม่ควรมีค่าที่งัดกรอก'
    ).not.toHaveValue(tamperedText11)
  })
})
