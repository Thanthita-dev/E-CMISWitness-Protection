import { expect, test, type Page } from '@playwright/test'
import { newCaseNoAfterIntake, readCase, seedMockState } from '../helpers/seed'
import { captureEvidence } from '../helpers/evidence'
import { CASE_NO, DOSSIER_URL, confirmDialog, signInModal } from '../journeys/journey-helpers'

/**
 * ประเด็นข้อเสนอแนะ 14 ต.ค. ที่ต้นแบบทำแล้วแต่ยังไม่มีเทสต์เฉพาะ (หรือมีเพียงในชุด flow-paths ที่ยาว)
 * FB-002 ธุรการรับคำร้องตามลำดับเดิม · FB-008 ผอ. ดูแบบ คบ. ก่อนมอบหมาย
 * FB-010 ช่องลงนาม คบ.3 · FB-023 ทุกรูปแบบการคุ้มครองขอขยายเวลา (คบ.14) ได้
 * ภาพหลักฐาน (EVIDENCE=1) ใช้ในรายงาน scripts/feedback-report
 */

/** กระดาษบนจอ — ไม่นับสำเนาสำหรับสั่งพิมพ์ใน .kb-print-root ที่ซ่อนไว้นอกจอ */
const screenPaper = (page: Page) => page.locator('#root .paper-a4')

test.describe('FB-002 — ธุรการรับคำร้องตามลำดับขั้นเดิม', () => {
  test('FB-002 · ธุรการรับคำร้อง แนบไฟล์ แล้วส่ง ผอ. ได้ทันที โดยไม่ต้องกลั่นกรองหรือเชื่อมโยงคดี', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto('/registry')
    await page.getByRole('link', { name: 'รับคำร้องใหม่' }).click()
    await expect(page).toHaveURL(/\/intake$/)

    await expect(page.getByTestId('intake-triage')).toHaveCount(0)
    await expect(page.getByTestId('intake-source-card')).toBeVisible()
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นางสาวกมลชนก บุญรักษา')
    await captureEvidence(page, 'FB-002-a', page.getByTestId('intake-source-card'), 'ธุรการรับคำร้องเข้าทะเบียนตามขั้นตอนเดิม ไม่มีขั้นกลั่นกรอง')
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()

    const caseNo = await newCaseNoAfterIntake(page)
    const created = await readCase(page, caseNo)
    expect(created?.intakeDocType).toBe('petition')
    expect(created?.urgency).toBeFalsy()
    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await captureEvidence(page, 'FB-002-b', page.getByTestId('forward-case-button'), 'รับเข้าทะเบียนแล้ว ส่ง ผอ.สำนัก/กอง มอบหมายได้ทันที')
  })
})

test.describe('FB-008 — ผอ. เปิดดูแบบ คบ. ก่อนมอบหมาย', () => {
  test('FB-008 · แฟ้มรอมอบหมาย: ผอ. กด "ดูเอกสาร" เปิดแบบ คบ. อ่านอย่างเดียวได้ก่อนเลือกเจ้าของสำนวน', async ({ page }) => {
    await seedMockState(page, 'Case 1.2', 'director')
    await page.goto(DOSSIER_URL)
    await expect(page.getByText('รอมอบหมายเจ้าของสำนวน')).toBeVisible()
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()

    const forms = page.getByTestId('dossier-forms')
    const view = forms.getByRole('button', { name: 'ดูเอกสาร' }).first()
    await expect(view).toBeVisible()
    await expect(forms.getByRole('link', { name: 'เปิดแบบฟอร์ม' })).toHaveCount(0)
    await captureEvidence(page, 'FB-008-a', view, 'ผอ. กด "ดูเอกสาร" ได้ ขณะยังไม่ได้มอบหมายเจ้าของสำนวน')

    await view.click()
    const dialog = page.getByRole('dialog', { name: /ดูเอกสาร/ })
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('.paper-a4').first()).toBeVisible()
    await captureEvidence(page, 'FB-008-b', dialog, 'แบบ คบ. แสดงเป็นกระดาษ อ่านอย่างเดียว')
  })
})

test.describe('FB-010 — ช่องลงนามผู้ให้ถ้อยคำและเจ้าพนักงานใน คบ.3', () => {
  test('FB-010 · คบ.3 มีช่องลงนาม 2 ช่อง ลงนามผู้ให้ถ้อยคำแล้วแสดงสถานะและชื่อบนแบบพิมพ์', async ({ page }) => {
    // Case 1.3 ลงนามครบทั้งสองช่องไว้แล้ว — ลงนามใหม่ช่องผู้ให้ถ้อยคำเพื่อตรวจว่ากดลงนามได้จริง
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/3?caseNo=${CASE_NO}`)

    const slots = page.getByTestId('kb3-signatures')
    await slots.scrollIntoViewIfNeeded()
    await expect(slots).toContainText('ผู้ให้ถ้อยคำ')
    await expect(slots).toContainText('เจ้าพนักงาน ป.ป.ท.')
    const signButtons = slots.getByRole('button', { name: /ลงลายมือชื่อ|ลงนามใหม่/ })
    await expect(signButtons).toHaveCount(2)

    await signButtons.first().click()
    await signInModal(page, 'นางสาวกมลชนก บุญรักษา')
    await expect(slots).toContainText('นางสาวกมลชนก บุญรักษา')
    await expect(slots).toContainText('✓ ลงนามแล้ว')
    await captureEvidence(page, 'FB-010-a', slots, 'ช่องลงนามผู้ให้ถ้อยคำ และเจ้าพนักงาน ป.ป.ท. ใน คบ.3')

    const signed = screenPaper(page).getByText('นางสาวกมลชนก บุญรักษา').last()
    await expect(signed).toBeAttached()
    await captureEvidence(page, 'FB-010-b', signed, 'ลายมือชื่อผู้ให้ถ้อยคำปรากฏบนแบบพิมพ์ คบ.3')
  })
})

// ใช้องค์ประกอบวันที่ตามเวลาท้องถิ่น (ไม่ใช้ toISOString ซึ่งเป็น UTC)
const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

test.describe('FB-023 — ทุกรูปแบบการคุ้มครองขอขยายระยะเวลาได้ (คบ.14)', () => {
  for (const method of [1, 2, 3, 4]) {
    test(`FB-023 · แฟ้มที่ใช้รูปแบบข้อ ${method} จัดทำ คบ.14 และส่งตรวจได้`, async ({ page }) => {
      await seedMockState(page, 'Case 1.13', 'officer', {
        protectionEndAt: isoDaysFromToday(0),
        episode: { id: 'EP-FB023', openedAt: isoDaysFromToday(-119), phases: [{ id: 'PH-FB023', kind: 'MAIN', startedAt: isoDaysFromToday(-119), orderRef: 'คบ.8/คบ.11' }] },
        methods: [method],
        approvedMethods: [method],
        methodTracks: [{ method, status: 'active', startedAt: `${isoDaysFromToday(-119)}T00:00:00.000Z` }],
      })
      // จัดทำ คบ.14 ที่หน้าแบบฟอร์ม แล้วกลับหน้าขยายเวลาเพื่อส่งให้ผู้บังคับบัญชาชั้นต้น
      await page.goto(`/form/14?caseNo=${CASE_NO}`)
      await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ยังพบการเฝ้าติดตามพยาน ความเสี่ยงยังไม่ลดลง')
      await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-extension/${encodeURIComponent(CASE_NO)}`))

      const footer = page.getByTestId('kb14-forward-footer')
      const submit = footer.getByTestId('kb14-submit-button')
      await expect(submit).toBeEnabled()
      if (method === 4) await captureEvidence(page, 'FB-023-a', footer, 'แฟ้มรูปแบบข้อ 4 (ประสานงานหน่วยงานอื่น) ส่งคำขอขยายระยะเวลาได้เหมือนรูปแบบอื่น')
      await submit.click()
      await confirmDialog(page, 'ยืนยันส่ง')

      await expect.poll(async () => ((await readCase(page, CASE_NO))?.extensionRequests as Array<Record<string, unknown>> | undefined)?.at(-1)?.status).toBe('submitted')
    })
  }
})
