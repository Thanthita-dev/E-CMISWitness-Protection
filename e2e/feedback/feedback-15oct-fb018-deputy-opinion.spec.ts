import { expect, test, type Page } from '@playwright/test'
import { KB1_DONE, readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { captureEvidence } from '../helpers/evidence'
import { CASE_NO, DOSSIER_URL, confirmDialog, formRow, signInModal } from '../journeys/journey-helpers'

/**
 * FB-018 — รองเลขาธิการฯ ให้ความเห็น "เห็นควร / ไม่เห็นควร" (คบ.6 ข้อ 12)
 *
 * - เห็นควร (ค่าตั้งต้น) → ลงนามแล้วส่งเลขาธิการฯ ต่อ และพิมพ์ "☑ เห็นควร" บนแบบ คบ.6 ข้อ 12
 * - ไม่เห็นควร → ส่งเลขาธิการฯ ไม่ได้ ต้องส่งกลับแก้ไข โดยเลือกปลายทางได้ 2 ทาง
 *     · เจ้าของเรื่อง → ธุรการ → เจ้าหน้าที่ผู้รับผิดชอบ
 *     · กอท. → ธุรการ กอท. → ผู้รับผิดชอบ กอท. แก้ → ผบช.ต้น กอท. → ผอ. กอท. → ธุรการ → รองเลขาธิการฯ
 *
 * ใช้ Case 1.6 (รองเลขาธิการฯ กลั่นกรอง · ผบช.ชั้นต้นและ ผอ. ลงนามข้อ 10–11 แล้ว) ซึ่งเป็นเคสเดียวกับ J06-A
 * ข้อมูลจำลองของ Case 1.6 ยังไม่มี kb1CompletedAt — เส้นทางส่งกลับจึงเติม KB1_DONE ไม่เช่นนั้นปุ่มส่งต่อที่ขั้นเจ้าหน้าที่จะล็อก
 */

type Rec = Record<string, unknown>

/** textarea ถัดจาก label — ช่องข้อความใช้ VoiceTextarea ที่หุ้มด้วย div จึงไม่ใช่ sibling ตรง ๆ */
const areaField = (page: Page, label: string) =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::*[1]/descendant-or-self::textarea')
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec | null

/** บัญชีของ กอท. ที่ปุ่มสลับบทบาทจะเลือกให้ (ตรงกับ setRole ของ useAuthStore) — switchRole ของ helper เปลี่ยนเฉพาะบทบาท */
const GOT_ACCOUNT: Record<string, string> = { got_officer: 'GOT-OFF-001', got_supervisor: 'GOT-SUP-001', got_director: 'GOT-DIR-001' }

async function switchRoleAs(page: Page, role: string, userId?: string) {
  const officerUserId = userId ?? GOT_ACCOUNT[role]
  if (officerUserId) {
    await page.addInitScript(({ id }: { id: string }) => {
      const raw = localStorage.getItem('ecmis-auth-storage')
      if (!raw) return
      const auth = JSON.parse(raw)
      auth.state.currentOfficerUserId = id
      localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
    }, { id: officerUserId })
  }
  await switchRole(page, role)
}

/** ขากลับจากสำนักงานเลขาธิการ: ธุรการ สลธ. ออกเลขส่ง → ธุรการปลายทาง (หน่วยเดิม/กอท.) ลงเลขรับ */
async function passDownLeg(page: Page, destinationClerk: 'receiver' | 'got_receiver') {
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await passSarabanCheckpoint(page, CASE_NO, destinationClerk)
  await page.goto(DOSSIER_URL)
}

/** ขากลับขึ้นสำนักงานเลขาธิการ: ธุรการหน่วยออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ */
async function passUpLeg(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
  await page.goto(DOSSIER_URL)
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

/** เปิดแบบ คบ.X ที่ถูกตีกลับ (ระบบเปิดเป็นฉบับใหม่) แก้ช่องข้อความแล้วบันทึก */
async function reviseForm(page: Page, code: 'คบ.3' | 'คบ.6', appendText: string) {
  await page.goto(DOSSIER_URL)
  await formRow(page, code).getByRole('link', { name: 'เปิดแบบฟอร์ม' }).click()
  await expect(page.getByText(/ฉบับที่ \d/).first()).toBeVisible()
  if (code === 'คบ.6') {
    const field = areaField(page, '2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย')
    await field.fill(`${await field.inputValue()} ${appendText}`.trim())
    for (const [label, value] of [['1.1 ได้รับคำร้อง', 'นางสาวอรุณี ใจมั่น'], ['2.2 ชื่อ-สกุล พยาน', 'สมชาย ใจดี']]) {
      const input = page.locator(`label:has-text("${label}")`).locator('xpath=following-sibling::input[1]')
      if (!(await input.inputValue())) await input.fill(value)
    }
  }
  await page.getByRole('button', { name: `บันทึกแบบ ${code}` }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

async function forwardTo(page: Page, stage: string, expectedText?: string | RegExp) {
  await page.getByTestId('forward-case-button').click()
  await confirmDialog(page, 'ยืนยันส่งต่อ', expectedText)
  await expect.poll(async () => (await caseOf(page))?.stage).toBe(stage)
}

async function deputyReturn(page: Page, destination: 'owner' | 'got', issue: string, note: string) {
  await page.getByTestId('return-case-button').click()
  await expect(page.getByTestId('return-destination-group')).toBeVisible()
  // ค่าตั้งต้น = เจ้าของเรื่อง
  await expect(page.getByTestId('return-destination-owner')).toBeChecked()
  if (destination === 'got') await captureEvidence(page, 'FB-018-c', page.getByTestId('return-destination-group'), 'ไม่เห็นควร ส่งกลับแก้ไข เลือกปลายทาง เจ้าของเรื่อง หรือ กอท.')
  await page.getByTestId(`return-destination-${destination}`).check()
  await page.getByTestId('return-issue-select').selectOption(issue)
  await page.getByTestId('return-note-input').fill(note)
  await page.getByTestId('return-confirm-button').click()
}

test.describe('FB-018 · รองเลขาธิการฯ เห็นควร / ไม่เห็นควร', () => {
  test('FB-018-A · เห็นควร (ค่าตั้งต้น) → ลงนามข้อ 12 พิมพ์ ☑ เห็นควร → ส่งเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary')
    await page.goto(DOSSIER_URL)

    const choice = page.getByTestId('deputy-opinion-choice')
    await expect(choice).toBeVisible()
    await expect(page.getByTestId('deputy-opinion-agree')).toBeChecked()
    await expect(page.getByTestId('deputy-opinion-disagree')).not.toBeChecked()
    await captureEvidence(page, 'FB-018-a', choice, 'รองเลขาธิการฯ เลือกเห็นควร / ไม่เห็นควร (ค่าตั้งต้น เห็นควร)')

    await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
    expect((await caseOf(page))?.kb6DeputyOpinionChoice).toBe('agree')

    // แบบพิมพ์ ข้อ 12 — ติ๊ก "เห็นควร" ก่อนความเห็นและลายมือชื่อ
    await page.goto(`/form/6?caseNo=${CASE_NO}`)
    const printed = page.getByTestId('kb6-deputy-opinion-choice').first()
    await expect(printed).toContainText('☑ เห็นควร')
    await expect(printed).toContainText('☐ ไม่เห็นควร')
    await captureEvidence(page, 'FB-018-b', printed, 'ผลความเห็นพิมพ์ลง คบ.6 ข้อ 12')

    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await forwardTo(page, 'external_pending', 'เลขาธิการ')
    const c = await caseOf(page)
    expect(c?.deputyReviewState).toBe('screened')
    expect(c?.kb6DeputyOpinionChoice).toBe('agree')
  })

  test('FB-018-B · ไม่เห็นควร → ส่งเลขาธิการฯ ไม่ได้ → ส่งกลับ "เจ้าของเรื่อง" ถึงเจ้าหน้าที่ผ่านธุรการ', async ({ page }) => {
    test.setTimeout(120_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    await page.getByTestId('deputy-opinion-disagree').check()
    await expect.poll(async () => (await caseOf(page))?.kb6DeputyOpinionChoice).toBe('disagree')
    await expect(page.getByTestId('deputy-opinion-disagree-hint')).toBeVisible()
    // ลงนามแล้วก็ยังส่งต่อไม่ได้
    await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
    await expect(page.getByTestId('forward-case-button')).toBeDisabled()
    await expect(page.getByText('รองเลขาธิการฯ ไม่เห็นควร — ส่งต่อเลขาธิการฯ ไม่ได้')).toBeVisible()
    expect((await caseOf(page))?.stage).toBe('deputy_review')

    await deputyReturn(page, 'owner', 'kb6_attachment_incomplete', 'ชุดเสนอยังไม่ครบ ให้เจ้าของเรื่องแก้และเสนอใหม่')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')
    let c = await caseOf(page)
    expect(c?.returnDestination).toBe('owner')
    expect(c?.gotRevision).toBeFalsy()
    expect(c?.kb6DeputyOpinionChoice).toBeFalsy()
    expect(c?.kb6DeputySignedAt).toBeFalsy()

    await passDownLeg(page, 'receiver')
    // เข้าเป็นเจ้าของสำนวนที่ได้รับมอบหมายของแฟ้มนี้ (Case 1.6 เป็นแฟ้มของเจ้าหน้าที่เขต ไม่ใช่บัญชี officer ตั้งต้น)
    await switchRoleAs(page, 'officer', c?.assignedOfficerUserId as string)
    await page.goto(DOSSIER_URL)
    c = await caseOf(page)
    // แฟ้มกลับถึงเจ้าของสำนวนที่ได้รับมอบหมาย
    expect(c?.owner).toBe(c?.assignedOfficer)
    expect(c?.returned).toBe(true)
    await expect(page.getByTestId('forward-case-button')).toBeVisible()
    await expect(page.getByTestId('got-revision-banner')).toHaveCount(0)
  })

  test('FB-018-C · ไม่เห็นควร → ส่งกลับ "กอท." → ผู้รับผิดชอบ กอท. แก้ → ผบช.ต้น → ผอ. กอท. → ธุรการ → กลับรองเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.6', 'deputy_secretary', KB1_DONE)
    await page.goto(DOSSIER_URL)

    const ownerBefore = (await caseOf(page))?.assignedOfficerUserId
    await page.getByTestId('deputy-opinion-disagree').check()
    await expect.poll(async () => (await caseOf(page))?.kb6DeputyOpinionChoice).toBe('disagree')
    await deputyReturn(page, 'got', 'kb6_attachment_incomplete', 'ให้ กอท. ปรับชุดเสนอและเสนอใหม่')
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('staff_review')

    let c = await caseOf(page)
    expect(c?.returnDestination).toBe('got')
    expect((c?.gotRevision as Rec | undefined)?.assigneeUserId).toBe('GOT-OFF-001')
    // เจ้าของสำนวนเดิมไม่เปลี่ยน (ใช้ต่อที่ขั้นอนุมัติ)
    expect(c?.assignedOfficerUserId).toBe(ownerBefore)

    // ธุรการ สลธ. → ธุรการ กอท.
    await passDownLeg(page, 'got_receiver')

    // ผู้รับผิดชอบ กอท. ได้รับงาน
    await switchRoleAs(page, 'got_officer')
    await page.goto('/queue/got_officer')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await page.goto(DOSSIER_URL)
    await expect(page.getByTestId('got-revision-banner')).toBeVisible()
    await reviseForm(page, 'คบ.6', 'ปรับชุดเสนอตามข้อสั่งการรองเลขาธิการฯ')
    await forwardTo(page, 'supervisor_review', 'ผู้บังคับบัญชาชั้นต้น')

    // ผบช.ต้น กอท.
    await switchRoleAs(page, 'got_supervisor')
    await page.goto('/queue/got_supervisor')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await signKb6(page, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น')
    expect((await caseOf(page))?.kb6SupervisorSignedAt).toBeTruthy()
    await forwardTo(page, 'director_review', 'ผอ.สำนัก/กอง')

    // ผอ. กอท.
    await switchRoleAs(page, 'got_director')
    await page.goto('/queue/got_director')
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await signKb6(page, '11', 'ความเห็นผู้อำนวยการสำนัก')
    expect((await caseOf(page))?.kb6DirectorSignedAt).toBeTruthy()
    await forwardTo(page, 'director_outgoing_registry')

    // ธุรการออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ → รองเลขาธิการฯ
    await passUpLeg(page)
    await switchRoleAs(page, 'deputy_secretary')
    await page.goto(DOSSIER_URL)
    await expect.poll(async () => (await caseOf(page))?.stage).toBe('deputy_review')
    c = await caseOf(page)
    expect(c?.gotRevision).toBeTruthy()
    // รอบใหม่ — ต้องให้ความเห็นใหม่ (ค่าตั้งต้นเห็นควร) เห็นควรแล้วส่งเลขาธิการฯ ได้
    await expect(page.getByTestId('deputy-opinion-agree')).toBeChecked()
    await signKb6(page, '12', 'ความเห็นรองเลขาธิการฯ')
    await forwardTo(page, 'external_pending', 'เลขาธิการ')
    c = await caseOf(page)
    expect(c?.gotRevision).toBeFalsy()
    expect(c?.kb6DeputyOpinionChoice).toBe('agree')
  })
})
