import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

const NO = '0501/2569'
const READY = {
  kb11Signed: true, stage: 'method_operation', approvedMethods: [1], orderedMethods: [1],
  dispatchedAt: '08/10/2569 01:00', deliveredAt: '2026-10-08T00:00:00Z', deliveryRecipient: 'สมชาย ใจดี', deliveryAckType: 'ใบตอบรับไปรษณีย์ (EMS)',
  consents: [{ ref: 'kb11', consented: true, by: 'สมชาย ใจดี' }],
  methodTracks: [{ method: 1, status: 'pending' }], officialLetters: [], methodChoice: undefined,
}

test('เปิดงานแล้วเลือกดำเนินการตาม คบ.6 — เปิดวิธีตาม คบ.6 ทันที', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, READY)
  await page.goto('/protection-methods')
  await page.getByRole('link', { name: 'เปิดงาน', exact: true }).click()
  const panel = page.getByTestId('method-choice-panel')
  await expect(panel).toContainText('1. ดำเนินการตาม คบ.6')
  await expect(panel).toContainText('วิธีที่ 1 จัดเจ้าพนักงานเป็นชุดคุ้มครอง')
  await expect(page.getByRole('button', { name: /เปิดเส้นทางปฏิบัติตามวิธีที่เลือก/ })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/method-choice-initial.png', fullPage: true })
  await panel.getByTestId('method-choice-kb6').check()
  await panel.getByTestId('method-choice-confirm').click()
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  await expect(page.getByTestId('method-choice-panel')).toHaveCount(0)
  const c = await readCase(page, NO)
  expect(c?.methodChoice?.mode).toBe('kb6')
  expect(c?.approvedMethods).toEqual([1])
})

test('ดำเนินการตาม คบ.6 ที่ข้อ 4 เลือกส่งกรมคุ้มครองสิทธิฯ — วิธีที่ 4 ใช้หน่วยงานตาม คบ.6 ไม่ตกเป็นตำรวจ', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    ...READY, approvedMethods: [4], orderedMethods: [4], methodTracks: [{ method: 4, status: 'pending' }],
  })
  // ตัวเลือกย่อยข้อ 4 ในร่าง คบ.6 ของแฟ้มนี้ (ตั้งครั้งเดียวหลัง seed — reload กลางเทสต์ไม่ทับผล)
  await page.addInitScript((caseNo) => {
    if (localStorage.getItem('__e2e_kb6_subitem') === '1') return
    const raw = localStorage.getItem('ecmis-form-draft-storage-v2')
    const store = raw ? JSON.parse(raw) : { state: { drafts: {}, draftCaseNo: {}, caseDrafts: {} }, version: 0 }
    store.state.drafts = { ...store.state.drafts, 6: { ...(store.state.drafts?.[6] || {}), 'หน่วยงานรูปแบบข้อ4': 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ' } }
    store.state.draftCaseNo = { ...store.state.draftCaseNo, 6: caseNo }
    localStorage.setItem('ecmis-form-draft-storage-v2', JSON.stringify(store))
    localStorage.setItem('__e2e_kb6_subitem', '1')
  }, NO)
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const panel = page.getByTestId('method-choice-panel')
  await expect(panel.getByTestId('method-choice-base-agency')).toHaveText('หน่วยงานปลายทาง: ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
  await panel.getByTestId('method-choice-kb6').check()
  await panel.getByTestId('method-choice-confirm').click()
  await expect(page.locator('.swal2-popup')).toContainText('ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  const workspace = page.getByTestId('automatic-method4-workspace')
  await expect(workspace.getByRole('textbox', { name: 'หน่วยงานที่ประสาน *' })).toHaveValue('สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม')
  const c = await readCase(page, NO)
  expect(c?.methodChoice).toMatchObject({ mode: 'kb6', methods: [4], agencyType: 'rlpd' })
})

test('เลือกใหม่ ข้อ 2.4 ส่งให้ทหาร — เปิดหน้าประสานพร้อมชื่อหน่วยงาน', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, READY)
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const panel = page.getByTestId('method-choice-panel')
  await panel.getByTestId('method-choice-new').check()
  await panel.getByTestId('method-choice-option-1').check()
  await panel.getByTestId('method-choice-option-4').check()
  await expect(panel.getByTestId('method-choice-option-1')).not.toBeChecked()
  await panel.getByTestId('method-choice-confirm').click()
  await expect(panel.getByRole('alert')).toContainText('กรุณาเลือกหน่วยงาน')
  await expect(panel.getByTestId('method-choice-agencies')).toContainText('2.4.4 ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
  await panel.getByTestId('method-choice-agency-military').check()
  await page.screenshot({ path: 'test-results/method-choice-new.png', fullPage: true })
  await panel.getByTestId('method-choice-confirm').click()
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  const workspace = page.getByTestId('automatic-method4-workspace')
  await expect(workspace.getByRole('textbox', { name: 'หน่วยงานที่ประสาน *' })).toHaveValue('กองบัญชาการกองทัพไทย')
  await page.screenshot({ path: 'test-results/method-choice-method4.png', fullPage: true })
  const c = await readCase(page, NO)
  expect(c?.methodChoice).toMatchObject({ mode: 'new', methods: [4], agencyType: 'military' })
  expect((c?.methodTracks as any[]).map((t) => t.method)).toEqual([4])
})

test('เร่งด่วน ผอ. อนุมัติ คบ.5 แล้วแต่ยังไม่ลงนาม คบ.6 — เลือกดำเนินการตาม คบ.4', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    ...READY,
    urgent: true, kb5Approved: true, kb6Signed: false, kb11Signed: false, orderedMethods: [1],
    fastTrack: { step: 'approved', proposedMethods: [2, 3] },
    consents: [{ ref: 'kb5', consented: true, by: 'สมชาย ใจดี' }],
  })
  await page.goto('/protection-methods')
  await page.getByRole('link', { name: 'เปิดงาน', exact: true }).click()
  const panel = page.getByTestId('method-choice-panel')
  await expect(panel).toContainText('1. ดำเนินการตาม คบ.4')
  await expect(panel).toContainText('วิธีที่ 2')
  await expect(panel).toContainText('วิธีที่ 3')
  await expect(panel).not.toContainText('คบ.6')
  await page.screenshot({ path: 'test-results/method-choice-kb4.png', fullPage: true })
  await panel.getByTestId('method-choice-kb4').check()
  await panel.getByTestId('method-choice-confirm').click()
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  await expect(page.getByTestId('method-choice-panel')).toHaveCount(0)
  const c = await readCase(page, NO)
  expect(c?.methodChoice?.mode).toBe('kb4')
  expect(c?.approvedMethods).toEqual([2, 3])
})

test('เร่งด่วน คบ.5 — ต้องเปิดงานตามวิธีคุ้มครองก่อน จึงส่งคำร้องหลักให้ ผบช.ชั้นต้น ได้', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    kb11Signed: false, stage: 'staff_review', approvedMethods: [4], orderedMethods: undefined, methodChoice: undefined,
    methodTracks: [{ method: 4, status: 'pending' }],
    urgent: true, kb5Approved: true, kb6Signed: false, activity7State: undefined, kb9Signed: false, kb6PreparedAt: '20/10/2569 10:00', kb1CompletedAt: '19/10/2569 10:00',
    fastTrack: { step: 'approved', proposedMethods: [4] },
    consents: [{ ref: 'kb5', consented: true, by: 'สมชาย ใจดี' }],
  })
  const methodLock = 'ยังไม่ได้ดำเนินการตามวิธีคุ้มครองตามคำสั่ง คบ.5'
  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(page.getByText(methodLock)).toBeVisible()
  await expect(page.getByRole('button', { name: /ส่งผู้บังคับบัญชาชั้นต้น/ })).toBeDisabled()

  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const panel = page.getByTestId('method-choice-panel')
  await panel.getByTestId('method-choice-kb4').check()
  await panel.getByTestId('method-choice-confirm').click()
  await page.getByRole('button', { name: 'ยืนยันและเปิดงาน', exact: true }).last().click()
  await expect(panel).toHaveCount(0)
  expect((await readCase(page, NO))?.stage).toBe('staff_review')

  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await expect(page.getByText('ส่งงานและดำเนินการในขั้นตอนนี้')).toBeVisible()
  await expect(page.getByText(methodLock)).toHaveCount(0)
  await expect(page.getByRole('button', { name: /ส่งผู้บังคับบัญชาชั้นต้น/ })).toBeEnabled()
  await page.screenshot({ path: 'test-results/method-choice-forward-after.png', fullPage: true })
})

test('คำร้องหลักอนุมัติหลังคุ้มครองชั่วคราว — หน้างานแยกงานชั่วคราวกับคำร้องหลักเป็นสองส่วน', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    ...READY,
    urgent: true, kb5Approved: true, kb6Signed: true,
    fastTrack: { step: 'approved', proposedMethods: [4], kb5OrderNo: 'คบ.5 ที่ 1/2569' },
    approvedMethods: [1], methodTracks: [{ method: 1, status: 'pending' }], methodChoice: undefined,
    temporaryProtection: {
      approvedMethods: [4], methodChoice: { mode: 'kb4', methods: [4], at: '2026-10-01T00:00:00Z', by: 'x' },
      methodTracks: [{ method: 4, status: 'active', startedAt: '2026-10-02T00:00:00Z', coordination: { agencyType: 'police', agency: 'สภ.ทดสอบ', responseStatus: 'accepted' } }],
      letterIds: [], separatedAt: '2026-10-10T00:00:00Z',
    },
  })
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const temporary = page.getByTestId('temporary-protection-section')
  await expect(temporary).toContainText('คุ้มครองชั่วคราวตาม คบ.5')
  await expect(temporary).toContainText('ยังมีผล')
  await expect(temporary).toContainText('สภ.ทดสอบ')
  await expect(page.getByTestId('main-protection-heading')).toBeVisible()
  const panel = page.getByTestId('method-choice-panel')
  await expect(panel).toContainText('1. ดำเนินการตาม คบ.6')
  await expect(panel).toContainText('วิธีที่ 1')
  await page.screenshot({ path: 'test-results/method-choice-temporary-main.png', fullPage: true })
})
