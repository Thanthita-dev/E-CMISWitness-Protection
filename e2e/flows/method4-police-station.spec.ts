import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

const NO = 'WP-2569-000501'
test('ค้นหาทะเบียนสถานีตำรวจจริง ไม่มี DSI หรือสถานีเริ่มต้น และบันทึกผู้ประสานงานแยกตามแฟ้ม', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    kb11Signed: true, stage: 'method_operation', approvedMethods: [4], orderedMethods: [4],
    dispatchedAt: '08/10/2569 01:00', deliveredAt: '2026-10-08T00:00:00Z', deliveryRecipient: 'สมชาย ใจดี', deliveryAckType: 'ใบตอบรับไปรษณีย์ (EMS)',
    consents: [{ ref: 'kb11', consented: true, by: 'สมชาย ใจดี' }],
    methodTracks: [{ method: 4, status: 'pending', coordination: { agency: 'สำนักงานคุ้มครองพยาน กรมสอบสวนคดีพิเศษ (DSI)' } }], officialLetters: [],
  })
  await page.goto('/protection-methods')
    await page.getByRole('link', { name: 'เปิดงาน', exact: true }).click()
  const workspace = page.getByTestId('automatic-method4-workspace')
  const station = workspace.getByTestId('coordination-agency')
  await expect(station).toHaveValue('')
  await expect(station.locator('option', { hasText: 'DSI' })).toHaveCount(0)
  await expect(workspace.getByTestId('police-registry-coverage')).toContainText('ยังไม่ครบทั่วประเทศ')
  await workspace.getByTestId('coordination-province').selectOption('เชียงใหม่')
  await expect(workspace.getByRole('status')).toContainText('ยังไม่ได้นำเข้าทะเบียน')
  await workspace.getByTestId('coordination-province').selectOption('นนทบุรี')
  await workspace.getByTestId('coordination-station-search').fill('สภ.ปากเกร็ด')
  await expect(station.locator('option')).toHaveCount(2)
  const id = await station.locator('option', { hasText: 'สภ.ปากเกร็ด' }).getAttribute('value')
  await station.selectOption(id!)
  await workspace.getByRole('textbox', { name: 'ผู้ประสานงาน', exact: true }).fill('ร.ต.อ. ผู้ประสานงานทดสอบ')
  await workspace.getByRole('textbox', { name: 'ตำแหน่ง', exact: true }).fill('รองสารวัตร')
  await workspace.getByRole('textbox', { name: 'เบอร์โทร', exact: true }).fill('0812345678')
  await page.reload()
  await expect(station).toHaveValue(id!)
  await expect(workspace.getByRole('textbox', { name: 'ผู้ประสานงาน', exact: true })).toHaveValue('ร.ต.อ. ผู้ประสานงานทดสอบ')
  const coordination = ((await readCase(page, NO))?.methodTracks as any[])[0].coordination
  expect(coordination.agency).toBe('สถานีตำรวจภูธรปากเกร็ด')
  expect(coordination.province).toBe('นนทบุรี')
  expect(coordination.contactPosition).toBe('รองสารวัตร')
  expect(coordination.contactPhone).toBe('0812345678')
  await workspace.getByTestId('coordination-province').selectOption('กรุงเทพมหานคร')
  await expect(station).toHaveValue('')
  await workspace.getByTestId('coordination-station-search').fill('สน.ประชาชื่น')
  await expect(station.locator('option')).toHaveCount(2)
  await workspace.getByRole('button', { name: 'ทำหนังสือประสาน', exact: true }).click()
  await page.getByRole('button', { name: 'ยืนยันนำส่งหนังสือประสาน', exact: true }).click()
  expect((await readCase(page, NO))?.officialLetters).toEqual([])
})

test('งานที่รอ คบ.9 แสดงงานเอกสาร ไม่แสดงฟอร์มเลือกวิธีหรือสรุปว่าพยานไม่ยินยอม', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    stage: 'method_operation', kb9Signed: false, kb11Signed: false, consents: [],
    dispatchedAt: undefined, deliveredAt: undefined, orderedMethods: [4],
  })
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const pending = page.getByTestId('method-documents-pending')
  await expect(pending).toContainText('รอแจ้งผล คบ.9 และบันทึกการรับ')
  await expect(page.getByRole('button', { name: /เปิดเส้นทางปฏิบัติตามวิธีที่เลือก/ })).toHaveCount(0)
  await expect(page.getByPlaceholder('เหตุที่พยานไม่ยินยอม')).not.toBeVisible()
  await pending.getByRole('link', { name: 'เปิด คบ.9', exact: true }).click()
  await expect(page).toHaveURL(`/form/9?caseNo=${NO}`)
})

test('เมื่อรับ คบ.9 แล้ว แสดงทางเข้าลงนามในแบบ คบ.11', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    stage: 'method_operation', kb9Signed: true, kb11Signed: false, consents: [], orderedMethods: [4],
    dispatchedAt: '08/10/2569 01:00', deliveredAt: '2026-10-08T00:00:00Z', deliveryRecipient: 'สมชาย ใจดี', deliveryAckType: 'ใบตอบรับไปรษณีย์ (EMS)',
  })
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  const pending = page.getByTestId('method-documents-pending')
  await expect(pending).toContainText('รอข้อตกลง คบ.11 ลงนามครบ')
  await expect(page.getByTestId('consent-agree')).toHaveCount(0)
  await pending.getByRole('link', { name: 'เปิด คบ.11', exact: true }).click()
  await expect(page).toHaveURL(`/form/11?caseNo=${NO}`)
})

test('เคสอุทธรณ์เดิมกลับไปจัดทำ คบ.6 v2 โดยไม่สร้างเวอร์ชันซ้ำเมื่อโหลดใหม่', async ({ page }) => {
  await seedMockState(page, 'Approved - วิธีที่ 4', undefined, {
    stage: 'method_operation', activity7State: 'approved', kb6Version: 1,
    appealAgainst: 'kb10', appealKb6Version: undefined,
    appealResolution: { outcome: 'overturn', resolutionNo: 'มติ-506/2569', note: 'อนุมัติตามข้อเท็จจริงใหม่', resolvedAt: '08/10/2569 04:40', against: 'kb10' },
    kb6PreparedAt: '08/10/2569 04:00', kb6SupervisorSignedAt: '08/10/2569 04:01',
  })
  await page.goto(`/protection-method-work?caseNo=${NO}`)
  await expect(page.getByTestId('appeal-kb6-revision-task')).toBeVisible()
  await page.getByRole('link', { name: 'จัดทำ คบ.6 v2', exact: true }).click()
  await expect(page).toHaveURL(`/form/6?caseNo=${NO}`)
  await expect.poll(async () => (await readCase(page, NO)).kb6Version).toBe(2)
  const c = await readCase(page, NO)
  expect(c.stage).toBe('staff_review')
  expect(c.kb6PreparedAt).toBeUndefined()
  expect(c.kb6SupervisorSignedAt).toBeUndefined()
  expect(c.kb6PreviousVersions[0].signedAt).toBe('08/10/2569 04:01')
  await page.reload()
  expect((await readCase(page, NO)).kb6Version).toBe(2)
})
