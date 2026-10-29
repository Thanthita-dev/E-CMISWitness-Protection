import { expect, test } from '@playwright/test'
import { seedMockState, switchRole } from '../helpers/seed'

test('clerk sends KB17 directly from the incoming register', async ({ page }) => {
  await seedMockState(page, 'Case 1.5', 'got_receiver', {
    stage: 'protection', closedAt: null, sarabanRound: 1, sarabanDispatch: { id: 'POST17', flow: 'termination', direction: 'down', checkpoint: 'destination_incoming', forms: [17], subject: 'KB17', unitClerkRole: 'got_receiver', unitId: 'central-gmc', round: 1, recipientName: 'Officer' }, sarabanRecords: [{ id: 'R17', checkpoint: 'destination_incoming', direction: 'incoming', formNo: 17, forms: [17], number: '17', date: '2026-10-29', time: '09:00', round: 1 }], kb17: { signedAt: '2026-10-12', documentName: 'KB17' },
    protectionHandoff: { destination: 'got', step: 'active', events: [] },
  })
  await page.goto(`/saraban/${encodeURIComponent('0501/2569')}`)
  await page.getByRole('button', { name: /ส่งไปรษณีย์ให้พยาน/ }).click()
  await page.getByLabel('เลขพัสดุ / ไปรษณีย์ลงทะเบียน').fill('EMS17')
  await page.getByLabel('วันที่ส่ง', { exact: true }).fill('2026-10-29')
  await page.getByLabel('ชื่อผู้รับ', { exact: true }).fill('Witness')
  await page.getByLabel('ที่อยู่จัดส่ง', { exact: true }).fill('Address')
  await page.getByRole('button', { name: 'ยืนยันส่งไปรษณีย์', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await expect(page.getByText('ส่งไปรษณีย์แล้ว · รอผลนำส่ง', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('ส่งไปรษณีย์แล้ว · รอผลนำส่ง', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'พยานได้รับหนังสือแล้ว', exact: true }).click()
  await page.locator('.swal2-confirm').click()
  await expect(page.getByRole('button', { name: 'พยานได้รับหนังสือแล้ว', exact: true })).toBeDisabled()
  await switchRole(page, 'secretary')
  await page.goto(`/dossier/${encodeURIComponent('0501/2569')}`)
  const tracker = page.getByTestId('dossier-stage-tracker')
  await expect(tracker.locator('.ws-step.done')).toHaveCount(14)
  await expect(tracker.locator('[aria-current="step"]')).toHaveCount(0)
  await expect(page.getByTestId('saraban-transit-card')).toHaveCount(0)
  await page.reload()
  await expect(tracker.locator('.ws-step.done')).toHaveCount(14)
})
