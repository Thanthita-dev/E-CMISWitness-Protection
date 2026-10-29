import { expect, test } from '@playwright/test'
import { seedMockState } from '../helpers/seed'

/**
 * FB-025 (สรุปประชุม 14 ต.ค.) — แบบ คบ.6 ข้อ 7 กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง
 * ข้อ ๗.๑ ยาวเกินหนึ่งบรรทัด บรรทัดที่ตัดคำต้องเริ่มตรงกับข้อความ ไม่ย้อนไปชิดขอบซ้าย
 * ใช้กับทุกข้อในหัวข้อ 7 รวมข้อที่ผู้ใช้เพิ่มเอง
 */

const CASE_NO = '0501/2569'

test('FB-025 · ข้อ ๗.x กั้นหน้าแบบแขวน บรรทัดที่ตัดคำเริ่มตรงกับข้อความ', async ({ page }) => {
  await seedMockState(page, 'Case 1.3', 'officer')
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  await expect(page.getByTestId('method-option-1')).toBeVisible()

  // กระดาษมีสำเนาซ่อนอยู่ด้วย จึงวัดเฉพาะชุดที่แสดงบนจอ
  const rows = page.locator('.paper-a4').getByTestId('kb6-paper-legal-ref').filter({ visible: true })
  await expect(rows).toHaveCount(3)
  await rows.first().scrollIntoViewIfNeeded()

  const metrics = await rows.evaluateAll((els) =>
    els.map((row) => {
      const [marker, body] = Array.from(row.children) as HTMLElement[]
      const range = document.createRange()
      range.selectNodeContents(body)
      const lineLefts = Array.from(range.getClientRects()).map((r) => Math.round(r.left))
      return {
        markerRight: Math.round(marker.getBoundingClientRect().right),
        bodyLeft: Math.round(body.getBoundingClientRect().left),
        lineLefts: Array.from(new Set(lineLefts)),
        lines: new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top))).size,
      }
    })
  )

  // ๗.๑ ยาวพอจะตัดคำ จึงพิสูจน์บรรทัดที่สองได้จริง
  expect(metrics[0].lines).toBeGreaterThan(1)
  for (const m of metrics) {
    expect(m.bodyLeft).toBe(m.markerRight)
    expect(m.lineLefts).toEqual([m.bodyLeft])
  }
  // ทุกข้อเริ่มข้อความที่ระยะเดียวกัน
  expect(new Set(metrics.map((m) => m.bodyLeft)).size).toBe(1)

  const top = (await rows.first().boundingBox())!
  const bottom = (await rows.last().boundingBox())!
  await page.screenshot({
    path: 'test-results/fb025-kb6-legal-indent.png',
    clip: { x: top.x - 80, y: top.y - 30, width: top.width + 120, height: bottom.y + bottom.height - top.y + 40 },
  })
})
