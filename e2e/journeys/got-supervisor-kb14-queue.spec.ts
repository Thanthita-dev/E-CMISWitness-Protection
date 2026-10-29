import { expect, test, type Page } from '@playwright/test'
import { loadMockState, readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, confirmDialog } from './journey-helpers'
import { passSarabanCheckpoint } from '../helpers/saraban'

/**
 * แฟ้มที่ส่งต่อ กอท. — ผู้รับผิดชอบ กอท. ส่ง คบ.14 แล้ว งานต้องเข้าคิว ผบช.ต้น กอท.
 * (ไม่ใช่ ผบช.ชั้นต้นของสำนัก/กองเดิม) และเมื่อเห็นชอบแล้วเข้าคิว ผอ. กอท. ต่อ
 */
function gotKb14Patch() {
  const store = JSON.parse(loadMockState('Case 9.1').localStorageData['ecmis-case-storage-v2'])
  const request = store.state.cases[0].extensionRequests.at(-1)
  return {
    protectionHandoff: { destination: 'got', step: 'active', assigneeUserId: 'GOT-OFF-001', assigneeName: 'นางสาวอรุณี ใจมั่น' },
    extensionRequests: [{ ...request, approvalStage: 'supervisor', formSnapshot: { reason: request.reason } }],
  }
}

const queueRow = (page: Page) => page.locator('table.ws-table tbody tr', { hasText: CASE_NO })

test('คบ.14 ของแฟ้ม กอท. เข้าคิว ผบช.ต้น กอท. แล้วเห็นชอบส่ง ผอ. กอท. ต่อรองเลขาธิการ', async ({ page }) => {
  await seedMockState(page, 'Case 9.1', 'got_supervisor', gotKb14Patch())
  await page.goto('/queue/got_supervisor')
  await expect(queueRow(page)).toHaveCount(1)

  await switchRole(page, 'supervisor')
  await page.goto('/queue/supervisor')
  await expect(queueRow(page)).toHaveCount(0)

  await switchRole(page, 'got_supervisor')
  await page.goto(`/protection-extension/${encodeURIComponent(CASE_NO)}`)
  await expect(page.getByTestId('handoff-readonly')).toHaveCount(0)
  await page.getByTestId('kb14-forward-button').first().click()
  await confirmDialog(page, 'ยืนยันส่งผอ. กอท.')
  const after = await readCase(page, CASE_NO) as { extensionRequests: Array<{ approvalStage: string; status: string }> }
  expect(after.extensionRequests.at(-1)).toMatchObject({ approvalStage: 'director', status: 'pending' })

  await switchRole(page, 'director')
  await page.goto('/queue/director')
  await expect(queueRow(page)).toHaveCount(0)

  /** ผอ. กอท. เปิดหน้าขยายเวลาได้ (ไม่ติดหน้าไม่มีสิทธิ์) และเห็นชอบส่งรองเลขาธิการ */
  await switchRole(page, 'got_director')
  await page.goto('/queue/got_director')
  await expect(queueRow(page)).toHaveCount(1)
  await queueRow(page).getByRole('link', { name: /เปิดแฟ้ม/ }).click()
  await expect(page).toHaveURL(new RegExp(`/protection-extension/${encodeURIComponent(CASE_NO)}`))
  await expect(page.getByTestId('handoff-readonly')).toHaveCount(0)
  await page.getByTestId('kb14-forward-button').first().click()
  await confirmDialog(page, 'ยืนยันส่งรองเลขาธิการ')
  const forwarded = await readCase(page, CASE_NO) as { extensionRequests: Array<{ approvalStage: string }> }
  expect(forwarded.extensionRequests.at(-1)).toMatchObject({ approvalStage: 'deputy_secretary' })

  /** ผอ. กอท. ลงนามแล้ว → ธุรการ กอท. ขาออก → ธุรการเลขา ขาเข้า → รองเลขาธิการ */
  await switchRole(page, 'deputy_secretary')
  await page.goto('/queue/deputy_secretary')
  await expect(queueRow(page)).toHaveCount(0)
  await switchRole(page, 'got_receiver')
  await page.goto('/queue/got_receiver')
  await expect(queueRow(page)).toHaveCount(1)
  await passSarabanCheckpoint(page, CASE_NO, 'got_receiver')
  await switchRole(page, 'secretary_receiver')
  await page.goto('/queue/secretary_receiver')
  await expect(queueRow(page)).toHaveCount(1)
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'deputy_secretary' })
  await page.goto('/queue/deputy_secretary')
  await expect(queueRow(page)).toHaveCount(1)
})

test('คบ.6 ฉบับขยายเวลาของแฟ้ม กอท. — ผอ. กอท. ลงนามข้อ 11 ได้', async ({ page }) => {
  const patch = gotKb14Patch()
  await seedMockState(page, 'Case 9.1', 'got_director', {
    ...patch,
    extensionDocs: { round: 1, kb3Version: 2, kb6Version: 2, preparedAt: '2026-10-10', preparedBy: 'นางสาวอรุณี ใจมั่น' },
    extensionRequests: [{ ...patch.extensionRequests[0], approvalStage: 'director', status: 'pending', docVersion: 2, kb6Snapshot: {},
      kb6Signatures: { supervisor: { at: '10/10/2569 10:00', by: 'นายกิตติศักดิ์ ธรรมรักษ์', opinion: 'เห็นควร' } } }],
  })
  await page.goto(`/protection-extension/${encodeURIComponent(CASE_NO)}`)
  await expect(page.getByTestId('kb14-kb6-sign-required').first()).toBeVisible()
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  await expect(page.getByRole('button', { name: /^ลงนาม/ }).first()).toBeVisible()
})
