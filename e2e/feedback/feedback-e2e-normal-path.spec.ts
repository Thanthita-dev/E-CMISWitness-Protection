import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * TC-016 · E2E เส้นทางปกติแบบเต็ม (Regression ของ 5 ปัญหาจาก feedback)
 *
 * เดินคำร้องจากรับ คบ.1 (ธุรการ) → เชื่อมโยงเลขสำนวนหลัก → ผอ. มอบหมายเจ้าของสำนวน →
 * เจ้าหน้าที่ประเมินความเร่งด่วน "ไม่เร่งด่วน" → จัดทำ คบ.3 แล้ว คบ.6 → ส่งผู้บังคับบัญชาชั้นต้น
 * ลงนาม → ส่ง ผอ. บันทึกความเห็นและลงนาม คบ.6 โดยไม่ติดขัดที่ขั้นตอนใดเลย
 *
 * ระหว่างทางตรวจ 5 จุดที่เคยมีปัญหาจาก feedback ด้วย expect.soft (ให้เทสต์เดินต่อแม้จุดใดไม่ผ่าน
 * เพื่อรายงานทุกจุดที่เบี่ยงเบนในรอบเดียว) ส่วนความคืบหน้าของ flow เอง (ส่งต่อได้จริง/ไม่ค้าง) ใช้ hard
 * assertion ตามปกติ — ถ้า flow ติดขัดจริงถือเป็นความล้มเหลวจริงที่ต้องรู้ว่าติดขั้นไหน
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" — อิงจากรหัสแบบ เช่น "คบ.1" */
function formRow(page: Page, code: string) {
  return page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })
}

/** ช่องกรอกของ FormKit ไม่มี htmlFor/id เชื่อมกับ label — หาโดยอิงป้ายข้อความข้างช่อง */
function areaField(page: Page, label: string) {
  return page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')
}

/** การ์ด "ส่งงานและดำเนินการในขั้นตอนนี้" — ใช้ตรวจ checklist ที่ต้องตรงกับสถานะจริงตลอดเส้นทาง */
function checklistCard(page: Page) {
  return page.locator('section', { has: page.getByText('ส่งงานและดำเนินการในขั้นตอนนี้') })
}

/**
 * ลงนามความเห็นข้อ 10-13 ใน คบ.6 จากปุ่ม "ลงนาม" ท้ายหน้ากรอกแบบ /form/6 — ความเห็นกรอกในแบบฟอร์มเอง
 * เข้าหน้าแบบฟอร์มผ่านปุ่ม "เปิดแบบฟอร์ม" ของแถว คบ.6 ในหน้าแฟ้มจริง (ผู้บังคับบัญชาไม่ใช่เจ้าของสำนวน
 * จึงต้องยืนยันว่ามีทางเข้าหน้าลงนามจาก UI ได้ ไม่ใช่พิมพ์ URL เอง) และไม่มีปุ่ม "ลงนาม" ซ้ำในแถวนั้น
 */
async function signKb6(page: Page, no: string, label: string) {
  await page.goto(DOSSIER_URL)
  const kb6Row = formRow(page, 'คบ.6')
  await expect(kb6Row.getByRole('button', { name: 'ลงนาม' })).toHaveCount(0)
  await kb6Row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page).toHaveURL(/\/form\/6\?caseNo=/)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill('เห็นชอบตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  const nameInput = page.getByTestId('signature-name-input')
  if (!(await nameInput.inputValue())) await nameInput.fill('ผู้ลงนามทดสอบ')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

test('TC-016 · เส้นทางปกติแบบเต็ม รับ คบ.1 → คบ.3 → คบ.6 → ผอ. ลงนาม โดยไม่ติดขัดที่ขั้นตอนใด', async ({ page }) => {
  // ============================================================
  // ขั้นที่ 1 — ธุรการรับคำร้อง (คบ.1 ถูกบันทึกไว้แล้วในแฟ้มตั้งต้น) เชื่อมโยงเลขสำนวนหลัก แล้วส่ง ผอ. มอบหมาย
  // ============================================================
  await test.step('1) รับคำขอ เชื่อมโยงเลขสำนวนหลัก แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน', async () => {
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto(DOSSIER_URL)

    // ธุรการไม่เห็นการ์ดเชื่อมโยงคดีหลัก — ส่งต่อ ผอ. ได้เลย (เจ้าของสำนวนเชื่อมโยงภายหลัง)
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)

    // ส่งต่อให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_assign')

    // ผอ. มอบหมายเจ้าของสำนวนแล้วส่งต่อเข้าขั้นเจ้าของสำนวน (staff_review)
    await switchRole(page, 'director')
    await page.goto(DOSSIER_URL)
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('staff_review')

    // เจ้าของสำนวนที่ได้รับมอบหมายเปิดแฟ้ม — บันทึกแบบ คบ.1 ให้สมบูรณ์ (WIT0404)
    await switchRole(page, 'officer')
    await page.goto(DOSSIER_URL)
    // เจ้าของสำนวนเชื่อมโยงเลขสำนวนหลัก (WIT0212/0214)
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    expect((await readCase(page, CASE_NO))?.mainCaseStatus).toBe('linked')
    await formRow(page, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/1/)
    for (let i = 0; i < 6; i++) {
      await page.getByRole('button', { name: 'ส่วนถัดไป' }).click()
    }
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()
    await page.goto(DOSSIER_URL)
  })

  // ============================================================
  // จุดตรวจ Feedback #1 — checklist "ส่งงานและดำเนินการในขั้นตอนนี้" ต้องไม่มีบรรทัดของ คบ.6
  // ก่อนถึงขั้นที่เกี่ยวข้องกับ คบ.6 จริง (ตอนนี้ยังไม่ได้ประเมินความเร่งด่วนเลยด้วยซ้ำ)
  // ============================================================
  await test.step('จุดตรวจ Feedback #1 — checklist ต้องไม่โชว์บรรทัด คบ.6 ก่อนถึงขั้นที่เกี่ยวข้อง', async () => {
    await expect
      .soft(checklistCard(page).getByText(/บันทึกเสนอความเห็น\s*\(คบ\.6\)/))
      .toHaveCount(0)
  })

  // ============================================================
  // ขั้นที่ 2 — เจ้าของสำนวนประเมินความเร่งด่วน "ไม่เร่งด่วน" (กรณีปกติ)
  // ============================================================
  await test.step('2) ประเมินความเร่งด่วนเป็น "ไม่เร่งด่วน" (กรณีปกติ)', async () => {
    await expect(page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้')).toBeVisible()
    await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).click()

    const after = await readCase(page, CASE_NO)
    expect(after?.urgency).toBe('normal')
    expect(after?.urgent).toBeFalsy()
  })

  // ============================================================
  // จุดตรวจ Feedback #2/#3 — ไม่มี คบ.4 ในแฟ้ม และ "สรุปข้อมูลแฟ้ม" ต้องแสดงผลประเมินตรงกัน (ปกติ)
  // ============================================================
  await test.step('3) ตรวจว่าไม่มี คบ.4 ในแฟ้ม และ "สรุปข้อมูลแฟ้ม" แสดงผลประเมินตรงกัน (ปกติ)', async () => {
    await expect.soft(formRow(page, 'คบ.4')).toHaveCount(0)
    await expect.soft(page.getByText('ความเร่งด่วน:')).toBeVisible()
    // ผลประเมิน "ปกติ" ต้องปรากฏคู่กับป้าย "ความเร่งด่วน:" ใน "สรุปข้อมูลแฟ้ม" (label อาจเทียบเท่ากันได้ เช่น "ปกติ")
    const summarySection = page.locator('section', { has: page.getByText('สรุปข้อมูลแฟ้ม') })
    await expect.soft(summarySection.getByText(/^ปกติ$/)).toBeVisible()
  })

  // ============================================================
  // ขั้นที่ 4 — จัดทำ คบ.3 แล้ว คบ.6 ที่ระดับเจ้าหน้าที่ (ตรวจว่าข้อ 11-13 ถูกล็อกจากการกรอกข้ามระดับ)
  // ============================================================
  await test.step('4) จัดทำ คบ.3 แล้ว คบ.6 ที่ระดับเจ้าหน้าที่', async () => {
    // คบ.3 — บันทึกข้อเท็จจริงประกอบคำร้อง
    await formRow(page, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/3/)
    await areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ').fill(
      'พฤติการณ์เพิ่มเติมจากการสัมภาษณ์เส้นทางปกติ TC-016'
    )
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
    await page.goto(DOSSIER_URL)

    // คบ.6 — จัดทำที่ระดับเจ้าหน้าที่ (ยังไม่ใช่ระดับ ผอ./รองเลขาธิการ/เลขาธิการ)
    await formRow(page, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
    await expect(page).toHaveURL(/\/form\/6/)

    // จุดตรวจ Feedback #4 — ช่องความเห็นข้อ 11 (ผอ.), 12 (รองเลขาธิการฯ), 13 (เลขาธิการฯ) ต้องถูกล็อก
    // ไม่ให้เจ้าหน้าที่ (ระดับข้อ 10 เท่านั้น) กรอกข้ามระดับได้จากหน้าฟอร์มดิบนี้
    await expect.soft(areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')).toBeDisabled()
    await expect.soft(areaField(page, '12. ความเห็นรองเลขาธิการฯ')).toBeDisabled()
    await expect.soft(areaField(page, '13. ความเห็นเลขาธิการฯ')).toBeDisabled()

    // TC-010 (BUG-001) — ช่องบังคับ 1.1 / 2.2 ต้องกรอกก่อนจึงบันทึก คบ.6 ได้
    await page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]').fill('นางสาวกมลชนก บุญรักษา')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }).click()
    await page.goto(DOSSIER_URL)

    const afterKb6 = await readCase(page, CASE_NO)
    // ยังไม่มีลายมือชื่อใด ๆ ในขั้นนี้ — การจัดทำ คบ.6 ไม่ใช่การลงนาม
    expect(afterKb6?.kb6SupervisorSignedAt).toBeFalsy()
  })

  // ============================================================
  // ขั้นที่ 5 — ส่งผู้บังคับบัญชาชั้นต้น → ลงนาม → ส่งต่อ ผอ.สำนัก/กอง
  // ============================================================
  await test.step('5) ส่งผู้บังคับบัญชาชั้นต้น ลงนามความเห็นข้อ 10 แล้วส่งต่อ ผอ.สำนัก/กอง', async () => {
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผู้บังคับบัญชาชั้นต้น')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('supervisor_review')

    await switchRole(page, 'supervisor')
    await signKb6(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    const afterSupervisorSign = await readCase(page, CASE_NO)
    expect(afterSupervisorSign?.kb6SupervisorSignedAt).toBeTruthy()

    await page.goto(DOSSIER_URL)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผอ.สำนัก/กอง')
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_review')
  })

  // ============================================================
  // ขั้นที่ 6 — ผอ. บันทึกความเห็นข้อ 11 และลงนาม คบ.6
  // ============================================================
  await test.step('6) ผอ. บันทึกความเห็นและลงนามข้อ 11 ใน คบ.6', async () => {
    await switchRole(page, 'director')
    await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')

    const final = await readCase(page, CASE_NO)
    // ลงนามข้อ 11 ของ ผอ. สำเร็จจริง (flow ก้าวหน้าได้ ไม่ค้าง)
    expect(final?.kb6DirectorSignedAt).toBeTruthy()
    // ไม่มีการลงนามข้ามระดับ — ข้อ 12 (รองเลขาธิการฯ) และข้อ 13 (เลขาธิการฯ) ต้องยังไม่ถูกลงนามล่วงหน้า
    expect(final?.kb6DeputySignedAt).toBeFalsy()
    expect((final as unknown as Record<string, unknown>)?.kb6SecretarySignedAt).toBeFalsy()
    // ยังไม่มี คบ.4 เกิดขึ้นในแฟ้มตลอดเส้นทางนี้
    expect(final?.urgent).toBeFalsy()

    // จุดตรวจ Feedback #5 — ฉบับที่ลงนามความเห็นตามลำดับชั้นแล้วต้องถูกล็อก แก้ทับไม่ได้ (WIT0513)
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    await expect(areaField(page, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')).toBeDisabled()
    await expect(areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')).toBeDisabled()
    await page.goto(DOSSIER_URL)

    // พร้อมส่งต่อรองเลขาธิการ ป.ป.ท. ตามลำดับชั้นถัดไป (ข้อ 12) — flow ไม่ติดขัด
    const forwardButton = page.getByTestId('forward-case-button')
    await expect(forwardButton).toBeEnabled()
    await expect(forwardButton).toContainText('รองเลขาธิการ')
  })
})
