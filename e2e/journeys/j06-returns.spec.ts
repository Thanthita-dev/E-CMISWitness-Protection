import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, areaField, confirmDialog, formRow, signInModal } from './journey-helpers'

/**
 * Journey J06 — ส่งกลับแก้ไขตามลำดับชั้น (แท็บ 05 · 07)
 *
 * เดินต่อเนื่องในแฟ้มเดียว (Case 1.4 → ... สอดคล้อง Case 7 → 7.1 → 7.2 → 7.3) เป็นวง "ส่งกลับ → แก้ → ส่งใหม่ → ผ่านชั้นที่ตีกลับ":
 *   ผบช.ชั้นต้นตีกลับ (WIT0505) → เจ้าหน้าที่แก้ คบ.3/คบ.6 เป็นฉบับใหม่ (WIT0506) → ผบช.ชั้นต้นลงนามข้อ 10 (WIT0507)
 *   → ผอ. ตีกลับตรงเจ้าหน้าที่ (WIT0510) → เจ้าหน้าที่แก้แล้วส่งกลับ ผอ. โดยตรง (WIT0511) → ผอ. ลงนามข้อ 11 (WIT0512)
 *   → รองเลขาธิการฯ ลงนามข้อ 12 (WIT0513) → เลขาธิการฯ ส่งกลับ/ขอข้อมูลเพิ่ม (WIT0707)
 *   → ผอ. มอบหมาย Revision (WIT0708) → เจ้าหน้าที่แก้ส่งตามลำดับเดิม (WIT0709) → กลับถึงเลขาธิการฯ (WIT0712)
 *
 * ทางแยก:
 *   J06-A รองเลขาธิการฯ ตีกลับประเด็นความเห็น ผอ. → ผอ. ลงนามใหม่แล้วส่งกลับ → รองเลขาธิการฯ ผ่าน
 *   J06-B รองเลขาธิการฯ ตีกลับประเด็นเอกสารไม่ครบ → เจ้าหน้าที่ → วนผ่านทุกชั้น (ลายมือชื่อถูกล้างทั้งหมด)
 *   J06-C เลขาธิการฯ ขอข้อมูลเพิ่มซ้ำสองรอบ (Revision รอบที่ 2 เดินตามลำดับเดิมอีกครั้ง)
 */

const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'

type Rec = Record<string, unknown>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null
const historyOf = async (page: Page) => (((await caseOf(page))?.assignmentHistory ?? []) as Array<Record<string, string>>)

/** ตีกลับจากการ์ดส่งงานในแฟ้ม (ผบช.ชั้นต้น / ผอ. / รองเลขาธิการฯ) */
async function returnFromDossier(page: Page, issue: string, note: string) {
  await page.getByTestId('return-case-button').click()
  await page.getByTestId('return-issue-select').selectOption(issue)
  await page.getByTestId('return-note-input').fill(note)
  await page.getByTestId('return-confirm-button').click()
}

/** ส่งต่อจากการ์ดส่งงาน แล้วรอให้แฟ้มถึงขั้นที่คาดไว้ */
async function forwardTo(page: Page, stage: string, expectedText?: string | RegExp) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
  await expect.poll(async () => (await caseOf(page))?.stage).toBe(stage)
}

/** ลงนามความเห็นข้อ 10-13 ใน /form/6 (ความเห็นว่างให้เติมก่อนจึงลงนามได้) แล้วกลับหน้าแฟ้ม */
async function signKb6(page: Page, no: string, label: string) {
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  const area = areaField(page, `${no}. ${label}`)
  if (!(await area.inputValue())) await area.fill('เห็นชอบตามที่เสนอ')
  await page.getByRole('button', { name: /^ลงนาม$/ }).click()
  await signInModal(page)
  await page.goto(DOSSIER_URL)
}

/**
 * เจ้าหน้าที่เปิดแบบ คบ.X ที่ถูกตีกลับ — ระบบเปิดเป็นฉบับใหม่ (เก็บฉบับเดิมในประวัติเวอร์ชัน) แก้ช่องข้อความแล้วบันทึก
 * คืนเลขฉบับที่แสดงบนหน้าฟอร์ม
 */
async function reviseForm(page: Page, code: 'คบ.3' | 'คบ.6', version: number, appendText: string) {
  await page.goto(DOSSIER_URL)
  await formRow(page, code).getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page.getByText(`ฉบับที่ ${version}`)).toBeVisible()
  if (code === 'คบ.6') {
    const field = areaField(page, '2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย')
    await field.fill(`${await field.inputValue()} ${appendText}`.trim())
    // ช่องบังคับ 1.1 / 2.2 — เติมเฉพาะเมื่อว่าง
    for (const [label, value] of [['1.1 ได้รับคำร้อง', OFFICER], ['2.2 ชื่อ-สกุล พยาน', 'สมชาย ใจดี']]) {
      const input = page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
      if (!(await input.inputValue())) await input.fill(value)
    }
  }
  await page.getByRole('button', { name: `บันทึกแบบ ${code}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
}

test.describe('J06 · ส่งกลับแก้ไขตามลำดับชั้น (05 · 07)', () => {
  test('J06 · ส่งกลับแก้ไขตามลำดับชั้น: ผบช.ชั้นต้น → ผอ. (ตรง) → เลขาธิการฯ แล้ว ผอ. มอบหมาย Revision เดินกลับตามลำดับเดิม', async ({
    page,
  }) => {
    test.setTimeout(300_000)

    // Case 1.4 — ผบช.ชั้นต้นรับชุดเสนอ คบ.1/คบ.3/คบ.6 (ไม่ข้าม คบ.3) · seed ครั้งเดียว จากนั้นเดินผ่าน UI ล้วน
    await seedMockState(page, 'Case 1.4', 'supervisor', { kb3Skipped: false })
    await page.goto(DOSSIER_URL)

    await test.step('WIT0503 · ผบช.ชั้นต้นตรวจ คบ.1 / คบ.3 / คบ.6 และหลักฐาน', async () => {
      const c = await caseOf(page)
      expect(c?.stage).toBe('supervisor_review')
      for (const code of ['คบ.1', 'คบ.3', 'คบ.6']) await expect(formRow(page, code)).toBeVisible()
    })

    await test.step('WIT0504 · ◇ เอกสารครบถ้วน? → ไม่ครบ (หลักฐานไม่สมบูรณ์)', async () => {
      // ไม่มีรายละเอียดข้อสั่งการ → ระบบไม่ยอมให้ส่งกลับ
      await page.getByTestId('return-case-button').click()
      await page.getByTestId('return-issue-select').selectOption('evidence_missing')
      await page.getByTestId('return-confirm-button').click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
      expect((await caseOf(page))?.stage).toBe('supervisor_review')
    })

    await test.step('WIT0505 · ผบช.ชั้นต้นบันทึกเหตุผลและส่งกลับเจ้าหน้าที่', async () => {
      // toast เตือนเข้ามาแทนที่กล่องส่งกลับ ต้องเปิดกล่องใหม่อีกครั้ง
      await expect(page.getByTestId('return-note-input')).toHaveCount(0)
      await returnFromDossier(page, 'evidence_missing', 'ขาดหลักฐานการข่มขู่ ให้แนบและแก้ คบ.3 / คบ.6')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

      const c = await caseOf(page)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.returned).toBe(true)
      expect(c?.returnedByRole).toBe('supervisor')
      expect(c?.returnNote).toBe('ขาดหลักฐานการข่มขู่ ให้แนบและแก้ คบ.3 / คบ.6')
      const h = await historyOf(page)
      expect(h[h.length - 1].detail).toContain('ขาดหลักฐานการข่มขู่')
    })

    await switchRole(page, 'officer')

    await test.step('WIT0506 · เจ้าหน้าที่แก้ คบ.3 / คบ.6 เป็นฉบับที่ 2 (เก็บฉบับเดิมไว้) แล้วส่งผู้บังคับบัญชาอีกครั้ง', async () => {
      await reviseForm(page, 'คบ.3', 2, '')
      await reviseForm(page, 'คบ.6', 2, 'แนบหลักฐานการข่มขู่เพิ่มเติมแล้ว')
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      const c = await caseOf(page)
      expect(c?.owner).toBe(SUPERVISOR)
      expect(c?.returned).toBe(false)
    })

    await switchRole(page, 'supervisor')

    await test.step('WIT0507 · ผบช.ชั้นต้นผ่านรอบแก้ไข: ลงนามความเห็นข้อ 10 และเสนอ ผอ.', async () => {
      await signKb6(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
      expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeTruthy()
      await forwardTo(page, 'director_review', 'ผอ.สำนัก/กอง')
      expect((await caseOf(page))?.owner).toBe(DIRECTOR)
    })

    await switchRole(page, 'director')

    await test.step('WIT0508 / WIT0509 · ผอ. ตรวจ ◇ ไม่เห็นชอบ/ไม่ครบ', async () => {
      expect((await caseOf(page))?.stage).toBe('director_review')
      await expect(page.getByTestId('return-case-button')).toBeVisible()
    })

    await test.step('WIT0510 · ผอ. ส่งกลับตรงเจ้าหน้าที่ ไม่แวะ ผบช.ชั้นต้น', async () => {
      await returnFromDossier(page, 'fact_discrepancy', 'ข้อเท็จจริงใน คบ.3 และ คบ.6 ขัดแย้งกัน ให้ตรวจสอบและแก้เป็นฉบับใหม่')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.owner).not.toBe(SUPERVISOR)
      expect(c?.returnedByRole).toBe('director')
      expect(c?.directorReturn).toBe(true)
      // ผบช.ชั้นต้นได้รับแจ้งให้ทราบ แต่ไม่มีงานเข้าคิว
      expect((await historyOf(page)).some((h) => h.action === 'แจ้งผู้บังคับบัญชาชั้นต้นทราบ')).toBe(true)
    })

    await switchRole(page, 'officer')

    await test.step('WIT0511 · เจ้าหน้าที่แก้ตามคำสั่ง ผอ. (ฉบับใหม่) แล้วส่งกลับ ผอ. โดยตรง', async () => {
      const banner = page.getByTestId('director-rework-banner')
      await expect(banner).toContainText('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      await reviseForm(page, 'คบ.6', 3, 'ปรับข้อเท็จจริงให้สอดคล้องกับ คบ.3 แล้ว')

      const forward = page.getByTestId('forward-case-button')
      await expect(forward).toContainText('เสนอ ผอ.สำนัก/กอง')
      await expect(forward).not.toContainText('ผู้บังคับบัญชาชั้นต้น')
      await forwardTo(page, 'director_review', 'เสนอ ผอ.สำนัก/กอง')

      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.directorReturn).toBe(false)
      expect(c?.returned).toBe(false)
      // วงสั้น: ตลอด WIT0510 → WIT0511 ไม่มีขั้นที่งานตกไปที่ ผบช.ชั้นต้น (นับเฉพาะหลังการตีกลับของ ผอ.)
      const h = await historyOf(page)
      expect(h[h.length - 1].detail).toContain('ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    })

    await switchRole(page, 'director')

    await test.step('WIT0512 · ผอ. ผ่านรอบแก้ไข: ลงนามข้อ 11 และส่งรองเลขาธิการฯ', async () => {
      await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')
      expect((await caseOf(page))?.kb6DirectorSignedAt).toBeTruthy()
      await forwardTo(page, 'deputy_review', 'รองเลขาธิการ')
      expect((await caseOf(page))?.owner).toBe(DEPUTY)
    })

    await switchRole(page, 'deputy_secretary')

    await test.step('WIT0513 · รองเลขาธิการฯ ลงนามข้อ 12 และส่งเลขาธิการฯ (ทางแยกส่งกลับดู J06-A)', async () => {
      await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
      expect((await caseOf(page))?.kb6DeputySignedAt).toBeTruthy()
      await forwardTo(page, 'external_pending', 'เลขาธิการ')
    })

    await switchRole(page, 'secretary')

    await test.step('WIT0701 / WIT0703 · เลขาธิการฯ รับผลและตรวจความครบถ้วน', async () => {
      await expect(page.getByTestId('secretary-return-button')).toBeEnabled()
      expect((await caseOf(page))?.activity7State).toBeFalsy()
    })

    await test.step('WIT0704 / WIT0707 · ◇ ส่งกลับ/ขอข้อมูลเพิ่ม → จอดที่ ผอ. ก่อน', async () => {
      await page.getByTestId('secretary-return-button').click()
      await page.getByRole('textbox').last().fill('ข้อเท็จจริงใน คบ.3 ไม่ครบ ให้แนบผลตรวจสอบเพิ่มเติมและแก้ คบ.6 ให้สอดคล้อง')
      await page.getByTestId('decision-confirm-button').click()
      await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('returned')

      const c = await caseOf(page)
      expect(c?.stage).toBe('director_review')
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.revisionAssignedAt).toBeFalsy()
      expect(c?.secretaryReturnRework).toBe(false)
    })

    await switchRole(page, 'director')

    await test.step('WIT0708 · ผอ. มอบหมายเจ้าหน้าที่แก้เป็น Revision ใหม่', async () => {
      await expect(page.getByTestId('return-revision-assignment-card')).toBeVisible()
      // ยังส่งแฟ้มเดิมขึ้นไปไม่ได้จนกว่าจะมอบหมายรอบแก้ไข
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()

      await page.getByTestId('assign-revision-button').click()
      await page.getByTestId('revision-instruction-input').fill('แก้ คบ.3 และ คบ.6 เป็นฉบับใหม่ แนบผลตรวจสอบเพิ่มเติม')
      await page.getByTestId('assign-revision-confirm-button').click()
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

      const c = await caseOf(page)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.secretaryReturnRework).toBe(true)
      expect(c?.revisionRound).toBe(1)
      expect(c?.revisionInstruction).toContain('ฉบับใหม่')
      // ห้ามใช้ทางลัดของ WIT0510/WIT0511 ในรอบนี้
      expect(c?.directorReturn).toBe(false)
      expect((await historyOf(page)).some((h) => h.action === 'ผอ.สำนัก/กอง มอบหมายแก้ไขตามข้อสั่งการเลขาธิการฯ')).toBe(true)
    })

    await switchRole(page, 'officer')

    await test.step('WIT0709 · เจ้าหน้าที่แก้ Revision ใหม่ ส่งผ่าน ผบช.ชั้นต้น ห้ามข้ามลำดับชั้น', async () => {
      await expect(page.getByTestId('secretary-revision-banner')).toContainText('ห้ามส่งข้ามลำดับชั้น')
      await reviseForm(page, 'คบ.3', 4, '')
      await reviseForm(page, 'คบ.6', 4, 'แนบผลตรวจสอบเพิ่มเติมตามข้อสั่งการเลขาธิการฯ')
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')
      expect((await caseOf(page))?.owner).toBe(SUPERVISOR)
      const h = await historyOf(page)
      expect(h[h.length - 1].detail).toContain('ห้ามส่งข้ามลำดับชั้น')
      // ธงรอบ Revision ยังอยู่จนกว่าจะกลับถึงเลขาธิการฯ
      expect((await caseOf(page))?.secretaryReturnRework).toBe(true)
    })

    await test.step('WIT0709 (ต่อ) / WIT0712 · เดินต่อทีละชั้นตามลำดับเดิมจนกลับถึงเลขาธิการฯ', async () => {
      // prototype: เมื่อส่งกลับ ระบบล้างเฉพาะลายมือชื่อข้อ 10 ของ ผบช.ชั้นต้น — ข้อ 11 (ผอ.) และข้อ 12 (รองเลขาธิการฯ)
      // ของรอบก่อนยังค้างอยู่และถูกล็อก จึงไม่ต้อง/ลงนามซ้ำไม่ได้ (ผังให้ Revision เดินผ่านทุกชั้นใหม่ — ต่างจากผัง)
      for (const [role, no, label, expectedStage] of [
        ['supervisor', '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'director_review'],
        ['director', '11', 'ความเห็นผู้อำนวยการสำนัก', 'deputy_review'],
        ['deputy_secretary', '12', 'ความเห็นรองเลขาธิการฯ', 'external_pending'],
      ] as const) {
        await switchRole(page, role)
        if (role === 'supervisor') {
          expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeFalsy()
          await signKb6(page, no, label)
          expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeTruthy()
        } else {
          await page.goto(`/form/6?caseNo=${CASE_NO}`)
          await expect(areaField(page, `${no}. ${label}`)).toBeDisabled()
          await expect(page.getByRole('button', { name: /^ลงนาม$/ })).toHaveCount(0)
          await page.goto(DOSSIER_URL)
        }
        await forwardTo(page, expectedStage)
      }
      const c = await caseOf(page)
      expect(c?.secretaryReturnRework).toBe(false)
      expect(c?.activity7State).toBe('pending')
      expect(c?.secretaryReviewState).toBe('pending')

      await switchRole(page, 'secretary')
      await expect(page.getByTestId('secretary-return-button')).toBeEnabled()
    })
  })

  test('J06-A · [ทางแยก] รองเลขาธิการฯ ตีกลับประเด็นความเห็น ผอ. → ผอ. แก้แล้วส่งกลับ → รองเลขาธิการฯ ผ่านและส่งเลขาธิการฯ', async ({
    page,
  }) => {
    test.setTimeout(180_000)

    // Case 1.6 — รองเลขาธิการฯ กลั่นกรอง (WIT0513) ผบช.ชั้นต้นและ ผอ. ลงนามข้อ 10–11 แล้ว
    await seedMockState(page, 'Case 1.6', 'deputy_secretary')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0513 · ◇ รองเลขาธิการฯ ตรวจแล้วเห็นว่าความเห็น ผอ. ไม่ชัดเจน → ส่งกลับ ผอ.', async () => {
      expect((await caseOf(page))?.stage).toBe('deputy_review')
      await returnFromDossier(page, 'director_opinion_unclear', 'ความเห็นข้อ 11 ของ ผอ. ยังไม่ระบุเหตุผลประกอบระดับภัย ให้ทบทวนและเสนอใหม่')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('director_review')

      const c = await caseOf(page)
      expect(c?.owner).toBe(DIRECTOR)
      expect(c?.returned).toBe(true)
      expect(c?.returnedByRole).toBe('deputy_secretary')
      // ส่งกลับ ผอ. ไม่ใช่เจ้าหน้าที่ — ไม่ใช่วง WIT0510 ของ ผอ.
      expect(c?.directorReturn).not.toBe(true)
      const h = await historyOf(page)
      expect(h[h.length - 1].detail).toContain('ความเห็นข้อ 11')
    })

    await switchRole(page, 'director')

    await test.step('ผอ. รับงานที่รองเลขาธิการฯ ส่งกลับ แล้วเสนอรองเลขาธิการฯ ใหม่', async () => {
      expect((await caseOf(page))?.owner).toBe(DIRECTOR)
      // ลายมือชื่อข้อ 11 ถูกล้างเมื่อถูกส่งกลับ — ผอ. ต้องลงนามความเห็นข้อ 11 ใหม่ก่อนจึงส่งต่อได้
      expect((await caseOf(page))?.kb6DirectorSignedAt).toBeFalsy()
      await expect(page.getByTestId('forward-case-button')).toBeDisabled()
      await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')
      expect((await caseOf(page))?.kb6DirectorSignedAt).toBeTruthy()
      await forwardTo(page, 'deputy_review', 'รองเลขาธิการ')
      const c = await caseOf(page)
      expect(c?.owner).toBe(DEPUTY)
      expect(c?.returned).toBe(false)
    })

    await switchRole(page, 'deputy_secretary')

    await test.step('WIT0513 (ต่อ) · รองเลขาธิการฯ ผ่านรอบแก้ไข ลงนามข้อ 12 และส่งเลขาธิการฯ', async () => {
      await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
      await forwardTo(page, 'external_pending', 'เลขาธิการ')
      expect((await caseOf(page))?.kb6DeputySignedAt).toBeTruthy()
    })
  })

  test('J06-B · [ทางแยก] รองเลขาธิการฯ ตีกลับประเด็นเอกสารไม่ครบ → เจ้าหน้าที่ → ส่งตามลำดับ ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ', async ({
    page,
  }) => {
    test.setTimeout(240_000)

    await seedMockState(page, 'Case 1.6', 'deputy_secretary')
    await page.goto(DOSSIER_URL)

    await test.step('WIT0513 · ◇ ชุดเสนอไม่ครบ → ส่งกลับเจ้าหน้าที่ผู้รับผิดชอบ', async () => {
      await returnFromDossier(page, 'kb6_attachment_incomplete', 'ชุดเสนอขาดเอกสารแนบ ให้เติมให้ครบและเสนอใหม่ตามลำดับชั้น')
      await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
      const c = await caseOf(page)
      expect(c?.owner).toBe(OFFICER)
      expect(c?.returnedByRole).toBe('deputy_secretary')
    })

    await switchRole(page, 'officer')

    await test.step('เจ้าหน้าที่แก้ คบ.6 ฉบับใหม่ แล้วส่ง (ตามลำดับชั้น)', async () => {
      await reviseForm(page, 'คบ.6', 2, 'เติมเอกสารแนบครบแล้ว')
      await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
      // ส่งกลับถึงเจ้าหน้าที่ → ล้างลายมือชื่อข้อ 10–12 ทั้งหมด ต้องลงนามใหม่ทุกชั้น
      const before = await caseOf(page)
      expect([before?.kb6SupervisorSignedAt, before?.kb6DirectorSignedAt, before?.kb6DeputySignedAt].filter(Boolean)).toHaveLength(0)
      await forwardTo(page, 'supervisor_review')
      expect((await caseOf(page))?.owner).toBe(SUPERVISOR)
    })

    await test.step('วนผ่านทุกชั้นที่ถูกข้ามกลับขึ้นมา: ผบช.ชั้นต้น (ข้อ 10) → ผอ. (ข้อ 11) → รองเลขาธิการฯ (ข้อ 12)', async () => {
      for (const [role, no, label, expectedStage] of [
        ['supervisor', '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'director_review'],
        ['director', '11', 'ความเห็นผู้อำนวยการสำนัก', 'deputy_review'],
        ['deputy_secretary', '12', 'ความเห็นรองเลขาธิการฯ', 'external_pending'],
      ] as const) {
        await switchRole(page, role)
        await signKb6(page, no, label)
        await forwardTo(page, expectedStage)
      }
      const c = await caseOf(page)
      expect(c?.returned).toBe(false)
      expect(c?.kb6DeputySignedAt).toBeTruthy()
    })
  })

  test('J06-C · [ทางแยก] เลขาธิการฯ ขอข้อมูลเพิ่มซ้ำสองรอบ → Revision รอบที่ 2 เดินตามลำดับเดิมอีกครั้ง', async ({ page }) => {
    test.setTimeout(300_000)

    // Case 1.7 — แฟ้มรอเลขาธิการฯ พิจารณา (ผบช. ผอ. รองเลขาธิการฯ ลงนามแล้ว)
    await seedMockState(page, 'Case 1.7', 'secretary')
    await page.goto(DOSSIER_URL)

    for (const round of [1, 2]) {
      await test.step(`WIT0707 · รอบ ${round}: เลขาธิการฯ ขอข้อมูลเพิ่ม → จอดที่ ผอ.`, async () => {
        await switchRole(page, 'secretary')
        await page.getByTestId('secretary-return-button').click()
        await page.getByRole('textbox').last().fill(`รอบที่ ${round}: ขอข้อมูลเพิ่มเติมประกอบการพิจารณา`)
        await page.getByTestId('decision-confirm-button').click()
        await expect.poll(async () => (await caseOf(page))?.activity7State).toBe('returned')
        const c = await caseOf(page)
        expect(c?.stage).toBe('director_review')
        expect(c?.owner).toBe(DIRECTOR)
        expect(c?.revisionRound ?? 0).toBe(round - 1)
      })

      await test.step(`WIT0708 · รอบ ${round}: ผอ. มอบหมาย Revision`, async () => {
        await switchRole(page, 'director')
        await page.getByTestId('assign-revision-button').click()
        await page.getByTestId('revision-instruction-input').fill(`Revision รอบ ${round}: แนบข้อมูลเพิ่มเติมตามที่เลขาธิการฯ ขอ`)
        await page.getByTestId('assign-revision-confirm-button').click()
        await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
        const c = await caseOf(page)
        expect(c?.revisionRound).toBe(round)
        expect(c?.secretaryReturnRework).toBe(true)
      })

      await test.step(`WIT0709 / WIT0712 · รอบ ${round}: เจ้าหน้าที่แก้ แล้วส่งตามลำดับเดิมกลับถึงเลขาธิการฯ`, async () => {
        await switchRole(page, 'officer')
        await expect(page.getByTestId('secretary-revision-banner')).toContainText('ห้ามส่งข้ามลำดับชั้น')
        await expect(page.getByTestId('forward-case-button')).toContainText('ผู้บังคับบัญชาชั้นต้น')
        await forwardTo(page, 'supervisor_review')
        for (const [role, expectedStage] of [
          ['supervisor', 'director_review'],
          ['director', 'deputy_review'],
          ['deputy_secretary', 'external_pending'],
        ] as const) {
          await switchRole(page, role)
          await page.goto(DOSSIER_URL)
          await forwardTo(page, expectedStage)
        }
        const c = await caseOf(page)
        expect(c?.secretaryReturnRework).toBe(false)
        expect(c?.activity7State).toBe('pending')
        // รอบแก้ไขที่นับแล้วไม่ถูกรีเซ็ตเมื่อกลับถึงเลขาธิการฯ
        expect(c?.revisionRound).toBe(round)
      })
    }
  })
})
