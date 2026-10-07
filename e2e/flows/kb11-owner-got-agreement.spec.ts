import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'
import { choosePreliminaryOutcome, confirmInlineDecision, fillDecisionWorkspace } from '../helpers/noticeDecisionWorkspace'
import { completeNoticeDetails, checkNoticeReady } from '../helpers/noticeDocuments'
import { handoffAction } from '../helpers/postApproval'
import { fieldAfterLabel, formRow, signInModal } from '../journeys/journey-helpers'

const NO = 'WP-2569-000501'
const DOSSIER = `/dossier/${NO}`
const role = (page: Page, value: string) => page.getByLabel('เลือกบทบาทผู้ใช้งาน').selectOption(value)
const assertSecretaryNoticeOnly = async (page: Page) => {
  const c = await readCase(page, NO)
  expect(c?.kb9Signed).toBe(true)
  expect(c?.kb11Approval).toBeUndefined()
  expect(c?.kb11Signed).not.toBe(true)
  return c!
}

for (const destination of ['original_owner', 'got'] as const) {
  test(`เลขาธิการลงนามเฉพาะ คบ.9 ส่ง ${destination} โดยไม่ข้ามข้อตกลงพยาน`, async ({ page }) => {
    await seedMockState(page, 'PostApproval 1')
    await page.goto(DOSSIER)
    await choosePreliminaryOutcome(page, 9)
    const first = await readCase(page, NO)
    expect(first?.kb9Signed).not.toBe(true)
    expect(first?.kb11Approval).toBeUndefined()
    expect(first?.kb11Signed).not.toBe(true)
    expect(first?.protectionHandoff).toBeUndefined()
    await fillDecisionWorkspace(page, destination)
    await expect(page.getByTestId('notice-decision-confirm')).not.toContainText('คบ.11')
    await confirmInlineDecision(page)
    const signed = await assertSecretaryNoticeOnly(page)
    const noticeOriginal = structuredClone((signed.resultNotices as any)[9].original)
    const duplicate = await page.evaluate(async () => {
      const path = '/scripts/post-approval-fixture.ts'
      const { useCaseStore } = await import(path)
      return useCaseStore.getState().confirmPreliminaryDecision('WP-2569-000501', 9)
    })
    expect(duplicate).toBe(false)
    expect((await readCase(page, NO))?.documents).toEqual(signed.documents)
    expect((await readCase(page, NO))?.kb11Approval).toEqual(signed.kb11Approval)
    await page.reload()
    await assertSecretaryNoticeOnly(page)
    await expect(formRow(page, 'คบ.11').getByRole('button', { name: /ลงนาม$/ })).toHaveCount(0)
    await page.goto(`/form/11?caseNo=${NO}`)
    await expect(page.getByText('เอกสารจากแฟ้มเดิม · ดูข้อมูลอ้างอิง')).toBeVisible()
    await expect(page.locator('fieldset[disabled] input').first()).toBeDisabled()
    await page.goto(DOSSIER)

    if (destination === 'got') {
      await role(page, 'got_receiver')
      await handoffAction(page, 'receive')
      await handoffAction(page, 'submit')
      await role(page, 'got_director')
      await page.getByTestId('got-assignee-select').selectOption('GOT-OFF-001')
      await handoffAction(page, 'assign', 'มอบหมายเจ้าหน้าที่ กอท. จัดทำข้อตกลงตามผลอนุมัติ')
      await role(page, 'got_officer')
      await handoffAction(page, 'accept')
    } else await role(page, 'officer')
    const proceed = page.getByRole('link', { name: 'ไปดำเนินการตามวิธีคุ้มครอง', exact: true })
    await expect(proceed).toHaveCount(0)
    const kb11 = formRow(page, 'คบ.11')
    await expect(kb11.getByRole('button', { name: /ลงนาม$/ })).toHaveCount(0)
    expect((await readCase(page, NO))?.kb11Signed).not.toBe(true)
    if (destination === 'got') {
      expect((await readCase(page, NO))?.stage).not.toBe('protection')
      expect((await readCase(page, NO))?.actualStartedAt).toBeUndefined()
    }

    await page.goto(`/form/11?caseNo=${NO}`)
    await expect(page.locator('fieldset input').first()).toBeEnabled()
    await expect(page.getByTestId('kb11-form-sign')).toBeDisabled()
    await fieldAfterLabel(page, 'นามสกุล').fill('บุญรักษา ทดสอบข้อตกลง')
    await page.goto(DOSSIER)

    await page.goto(`/form/9?caseNo=${NO}`)
    await completeNoticeDetails(page)
    await checkNoticeReady(page)
    await page.goto(DOSSIER)
    await expect(kb11.getByRole('button', { name: /ลงนาม$/ })).toHaveCount(0)
    const dispatch = page.getByText('การนำส่งหนังสือและวันที่พยานได้รับ').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
    await dispatch.getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
    await expect.poll(async () => ((await readCase(page, NO))?.resultNotices as any)?.[9]?.status).toBe('sent')
    await fieldAfterLabel(dispatch, 'ผู้รับหนังสือ').fill('นางสาวกมลชนก บุญรักษา')
    await dispatch.locator('input[type="file"]').setInputFiles({ name: 'ใบตอบรับทดสอบ.pdf', mimeType: 'application/pdf', buffer: Buffer.from('delivery receipt') })
    await dispatch.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
    await expect(proceed).toHaveCount(0)
    await expect(kb11.getByRole('button', { name: /ลงนาม$/ })).toHaveCount(0)
    await page.goto(`/form/11?caseNo=${NO}`)
    await page.getByTestId('kb11-form-sign').click()
    const save = page.getByRole('button', { name: /บันทึกข้อตกลง คบ\.11$/ })
    await expect(save).toBeDisabled()
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: /ลงลายมือชื่อ$/ }).first().click()
      await signInModal(page, 'ผู้ลงนามข้อตกลงทดสอบ')
      await expect(save).toBeDisabled()
      expect((await readCase(page, NO))?.kb11Signed).not.toBe(true)
    }
    await page.getByRole('button', { name: /ลงลายมือชื่อ$/ }).first().click()
    await signInModal(page, 'พยานในการทำข้อตกลงคนที่สอง')
    await expect(save).toBeEnabled()
    await save.click()
    await expect.poll(async () => (await readCase(page, NO))?.kb11Signed).toBe(true)
    const agreed = await readCase(page, NO)
    expect(agreed?.stage).toBe('method_operation')
    expect((agreed?.resultNotices as any)[9].original).toEqual(noticeOriginal)
    expect(agreed?.kb11Approval).toBeUndefined()
    expect((agreed?.consents as any[])?.some((c) => c.ref === 'kb11' && c.consented)).toBe(true)
    expect(agreed?.actualStartedAt).toBeUndefined()
    await page.goto(DOSSIER)
    await expect(proceed).toBeVisible()
    await page.reload()
    await expect(proceed).toBeVisible()
  })
}

test('ไม่อนุมัติลงนาม คบ.10 เท่านั้น ไม่ลงนาม คบ.11 หรือส่ง กอท.', async ({ page }) => {
  await seedMockState(page, 'PostApproval 1')
  await page.goto(DOSSIER)
  await choosePreliminaryOutcome(page, 10)
  await fillDecisionWorkspace(page)
  await confirmInlineDecision(page)
  const c = await readCase(page, NO)
  expect(c?.activity7State).toBe('rejected')
  expect(c?.kb10Signed).toBe(true)
  expect(c?.kb9Signed).not.toBe(true)
  expect(c?.kb11Approval).toBeUndefined()
  expect(c?.kb11Signed).not.toBe(true)
  expect(c?.protectionHandoff).toBeUndefined()
})

test('เปิดแฟ้มเก่าที่อนุมัติ คบ.9 แล้วไม่สร้างลายมือชื่อ คบ.11 ย้อนหลัง', async ({ page }) => {
  await seedMockState(page, 'PostApproval 1', 'officer', {
    stage: 'approved', activity7State: 'approved', kb9Signed: true, kb9SignedAt: '2026-09-01T08:00:00Z', kb9SignedBy: 'ผู้ลงนามเดิม',
    secretarySignedAt: '2026-09-01T08:00:00Z', outgoingSignedAt: '2026-09-01T08:00:00Z',
    kb11Approval: undefined, kb11Signed: false,
  })
  await page.goto(DOSSIER)
  await page.reload()
  const c = await readCase(page, NO)
  expect(c?.kb9SignedAt).toBe('2026-09-01T08:00:00Z')
  expect(c?.kb11Approval).toBeUndefined()
  expect(c?.kb11Signed).toBe(false)
  await expect(page.getByTestId('approve-case-button')).toHaveCount(0)
})
