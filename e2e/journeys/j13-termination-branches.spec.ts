import { expect, test, type Page } from '@playwright/test'
import { loadMockState, readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, confirmDialog, expectStage, formRow } from './journey-helpers'

/**
 * Journey J13 · ทางแยกของการยุติการคุ้มครอง (11A → 11C → 11D)
 *
 * (เส้นทางปกติ review → ยุติ → คบ.15 → คบ.16/17 → ปิดงาน อยู่ใน journey ของเส้นทางหลัก ไฟล์นี้เก็บเฉพาะทางแยก)
 *
 * ทางแยก:
 *   J13-A  ผบช.ชั้นต้นส่งคืน คบ.15 (WIT1133) → แก้เป็นเวอร์ชัน 2 → เห็นชอบ (WIT1134) → ผู้มีอำนาจ "ไม่อนุมัติ" ยุติ (WIT1136/1137) → คุ้มครองต่อ กลับแท็บ 10
 *   J13-B  พยานยื่น คบ.7 ขอยุติ (WIT1125/1126) → คบ.15 → เห็นชอบ → อนุมัติ → คบ.16 → คบ.17 → พยานรับ → ยื่นอุทธรณ์ภายใน 30 วัน (WIT1147) → แท็บ 09B ไม่ปิดงาน
 *   J13-C  ส่ง คบ.17 ไม่สำเร็จ 2 ครั้ง (WIT1144) → บันทึกวันที่ถือว่าได้รับ → เริ่มนับกรอบอุทธรณ์ → ยังปิดงานไม่ได้ (WIT1148)
 *   J13-D  ครบเพดานสะสม 180 วัน: ปิดแขนงขยายเวลา (WIT1150) → เลือก "ยุติ" (WIT1111) → 11C: บันทึกเหตุ ครบกำหนด → คบ.15 → เห็นชอบ
 *   J13-E  ปิดงาน (WIT1148) แล้วแฟ้มถูกล็อกทั้งแฟ้ม แก้ไขไม่ได้ (TC-065) หลังพ้นกำหนดอุทธรณ์
 */

const TERM_URL = `/termination/${CASE_NO}`
const REVIEW_URL = `/protection-review/${CASE_NO}`
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`

type Rec = Record<string, unknown>

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = () => isoDaysFromToday(0)

const CLOSE_BUTTON = 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน'
const SELECT_REASON = 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง'

/** WIT1128/WIT1129 — เจ้าหน้าที่บันทึกเหตุ "ครบกำหนด/เห็นควรยุติ" แล้วจัดทำ คบ.15 เสนอ */
async function prepareKb15DueOrOfficer(page: Page, evidence = 'ผลประเมินล่าสุดไม่พบเหตุภัย') {
  await page.goto(TERM_URL)
  await page.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('คำสั่งคุ้มครองครบกำหนด 6 เดือน')
  await page.getByPlaceholder('ข้อเท็จจริงและผลประเมินล่าสุดที่ใช้อ้าง').fill('ผลประเมินล่าสุดไม่พบเหตุภัย')
  await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติ')
  await page.locator('main').locator('select').nth(1).selectOption({ label: SELECT_REASON })
  await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill(evidence)
  await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')
}

/** ผบช.ชั้นต้นตรวจ คบ.15 ครบถ้วน เสนอผู้มีอำนาจ (WIT1131/1132/1134) */
async function supervisorEndorsesKb15(page: Page) {
  await switchRole(page, 'supervisor')
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'ครบถ้วน · เสนอผู้มีอำนาจ', exact: true }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน', 'เสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ')
}

/** ผู้มีอำนาจอนุมัติให้ยุติ (WIT1136) */
async function directorApproves(page: Page, role = 'secretary') {
  await switchRole(page, role)
  await page.goto(TERM_URL)
  await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ')
  await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')
}

/** ตั้งต้น 11A — Episode สะสม `days` วัน วิธีที่ 1 */
function reviewSeed(days: number) {
  const startedAt = new Date()
  startedAt.setDate(startedAt.getDate() - (days - 1))
  const iso = startedAt.toISOString()
  return {
    approvedMethods: [1],
    methodTracks: [{ method: 1, status: 'active', startedAt: iso }],
    episode: { id: 'EP-J13', openedAt: iso, phases: [{ id: 'PH-J13', kind: 'MAIN', startedAt: iso, orderRef: 'คบ.8' }] },
    kb11Signed: true,
    reviewProposals: [],
    methodChangeProposals: [],
  }
}

test.describe('J13 · ทางแยกการยุติการคุ้มครอง (11C / 11D)', () => {
  test('J13-A · [ทางแยก] ส่งคืน คบ.15 → แก้เวอร์ชัน 2 → เห็นชอบ → ผู้มีอำนาจไม่อนุมัติยุติ → คุ้มครองต่อ กลับแท็บ 10', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.13', 'officer')

    await test.step('WIT1124 + WIT1128 · เปิด 11C บันทึกเหตุเริ่มยุติ (ครบกำหนด/เจ้าหน้าที่เห็นควร)', async () => {
      await page.goto(TERM_URL)
      await expect(page.getByText(/สถานะ "ยุติ" จะเกิดขึ้นก็ต่อเมื่อมีคำสั่ง คบ\.16 ที่ลงนามแล้ว/)).toBeVisible()
      await page.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('คำสั่งคุ้มครองครบกำหนด 6 เดือน')
      await page.getByPlaceholder('ข้อเท็จจริงและผลประเมินล่าสุดที่ใช้อ้าง').fill('ผลประเมินล่าสุดไม่พบเหตุภัย')
      await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติ')
      expect(((await readCase(page, CASE_NO))?.terminationTrigger as Rec).source).toBe('due_or_officer')
    })

    await test.step('WIT1129 · จัดทำ คบ.15 และเสนอ', async () => {
      await page.locator('main').locator('select').nth(1).selectOption({ label: SELECT_REASON })
      await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('สรุปผลรอบแรก')
      await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('submitted')
    })

    await test.step('WIT1130 · สถานะคุ้มครองยังคงอยู่ (ยังไม่ยุติเพียงเพราะจัดทำ คบ.15)', async () => {
      await expect(page.getByText(/การรับ คบ\.7 หรือจัดทำ คบ\.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด/)).toBeVisible()
      // ผังบอกว่ายังคุ้มครอง (ACTIVE) — prototype เปลี่ยน stage เป็น termination_review แต่ยังไม่ยุติ/ไม่ปิดงาน
      await expectStage(page, 'termination_review')
      const c = await readCase(page, CASE_NO)
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb16).toBeFalsy()
    })

    await test.step('WIT1131-1133 · ผบช.ชั้นต้นตรวจพบเอกสารไม่ครบ ส่งคืนแก้ไข', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(TERM_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('ยังไม่แนบผลประเมินล่าสุด')
      await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.15 เวอร์ชันใหม่')
      const kb15 = (await readCase(page, CASE_NO))?.kb15 as Rec
      expect(kb15.status).toBe('returned')
      expect(kb15.reviewNote).toBe('ยังไม่แนบผลประเมินล่าสุด')
    })

    await test.step('WIT1133 · เจ้าหน้าที่แก้ไข จัดทำ คบ.15 เวอร์ชันใหม่ (เก็บฉบับเดิม)', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await expect(page.getByText('ส่งคืนแก้ไข', { exact: false }).first()).toBeVisible()
      await page.locator('main').locator('select').nth(1).selectOption({ label: SELECT_REASON })
      await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('สรุปผลรอบสอง แนบผลประเมินล่าสุดแล้ว')
      await page.getByRole('button', { name: 'จัดทำ คบ.15 เวอร์ชันใหม่' }).click()
      const kb15 = (await readCase(page, CASE_NO))?.kb15 as Rec
      expect(kb15.version).toBe(2)
      expect(kb15.status).toBe('submitted')
      expect(kb15.previousVersions as unknown[]).toHaveLength(1)
    })

    await test.step('WIT1134 · ผบช.ชั้นต้นเห็นชอบ เสนอผู้มีอำนาจที่การ์ด 11D', async () => {
      await supervisorEndorsesKb15(page)
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('endorsed')
      await expect(page.getByText('พิจารณาและออกคำสั่งยุติ (คบ.16)', { exact: true })).toBeVisible()
    })

    await test.step('WIT1135 · ผู้มีอำนาจเห็นสรุป คบ.15 ที่ส่งมาจาก 11C', async () => {
      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await expect(page.getByText('เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)')).toBeVisible()
    })

    await test.step('WIT1136 + WIT1137 · ผู้มีอำนาจ "ไม่อนุมัติ" ให้ยุติ → กลับสถานะคุ้มครองภายใต้คำสั่งเดิม', async () => {
      await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('ยังมีเหตุภัยอยู่ ไม่ควรยุติในขณะนี้')
      await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('คุ้มครองต่อภายใต้คำสั่งเดิม')
      const c = await readCase(page, CASE_NO)
      expect((c?.terminationApproval as Rec).approved).toBe(false)
      expect(c?.stage).toBe('protection')
      expect(c?.kb16).toBeFalsy() // ไม่มีคำสั่งยุติ
      expect(c?.closedAt).toBeFalsy()
      await expect(page.getByText(/ไม่อนุมัติให้ยุติเมื่อ/)).toBeVisible()
    })

    await test.step('เชื่อมกลับแท็บ 10 · ติดตามต่อ', async () => {
      await page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO}`))
      await expectStage(page, 'protection')
    })
  })

  test('J13-B · [ทางแยก] พยานขอยุติ (คบ.7) → คบ.15 → อนุมัติ → คบ.16 → คบ.17 → พยานยื่นอุทธรณ์ภายใน 30 วัน → แท็บ 09B', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.13', 'officer')

    await test.step('WIT1124 + WIT1125 + WIT1126 · พยานยื่น คบ.7 ขอยุติ เจ้าหน้าที่บันทึกเหตุเริ่มยุติ', async () => {
      await page.goto(TERM_URL)
      await page.locator('main').getByRole('radio').nth(0).check() // witness_kb7
      await page.getByPlaceholder('เลขที่ คบ.7 / เลขรับคำขอในระบบ').fill('KB7-001/2569')
      await page.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/).fill('kb7_เซ็นแล้ว.pdf')
      await page.getByPlaceholder('เหตุผลที่พยานขอยุติ').fill('พยานขอยุติเอง เนื่องจากย้ายภูมิลำเนา')
      await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติ')
      expect(((await readCase(page, CASE_NO))?.terminationTrigger as Rec).source).toBe('witness_kb7')
    })

    await test.step('WIT1129 · จัดทำ คบ.15 อ้างอิง คบ.7 (การคุ้มครองยังไม่สิ้นสุด — WIT1130)', async () => {
      await page.locator('main').locator('select').first().selectOption('witness_kb7')
      await page.locator('main').locator('select').nth(1).selectOption({ label: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป' })
      await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ติดตามผลแล้วไม่พบภัยคุกคามเพิ่มเติม')
      await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')
      const c = await readCase(page, CASE_NO)
      expect((c?.kb15 as Rec).trigger).toBe('witness_kb7')
      // ผังบอกว่ายังคุ้มครองอยู่ — prototype ย้าย stage เป็น termination_review แต่ยังไม่ยุติ (closedAt/kb16 ว่าง)
      expect(c?.stage).toBe('termination_review')
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb16).toBeFalsy()
    })

    await test.step('WIT1131 + WIT1132 + WIT1134 · ผบช.ชั้นต้นตรวจครบถ้วน เสนอผู้มีอำนาจ', async () => {
      await supervisorEndorsesKb15(page)
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('endorsed')
    })

    await test.step('WIT1135 + WIT1136 · ผู้มีอำนาจอนุมัติให้ยุติ', async () => {
      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await expect(page.getByText('เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)')).toBeVisible()
      await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่พยานขอ')
      await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')
      expect(((await readCase(page, CASE_NO))?.terminationApproval as Rec).approved).toBe(true)
    })

    await test.step('WIT1138 · เจ้าหน้าที่ร่างคำสั่ง คบ.16 แล้วกรอกในแฟ้มและกด "ส่งให้อนุมัติ"', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await page.getByPlaceholder('คำสั่งที่').fill('001/2569')
      await page.getByLabel('วันที่ออกคำสั่ง').fill(todayIso())
      await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(10)) // วันที่มีผลเป็นอนาคต — ถ้ามีผลวันนี้ระบบจะปิดแฟ้มทันทีหลังลงนามและล็อกทุกปุ่ม
      await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
      await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
      expect(((await readCase(page, CASE_NO))?.kb16 as Rec).status).toBe('draft')

      await page.goto(`/form/16?caseNo=${CASE_NO}`)
      await page.getByPlaceholder('088').fill('คส.J13-001')
      await page.getByPlaceholder('2569').fill('2569')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: /ส่งให้ผู้มีอำนาจอนุมัติ|ส่งให้อนุมัติ|ส่งคำสั่ง/ }).first().click()
      await confirmDialog(page, 'ส่งให้อนุมัติ')
      expect(((await readCase(page, CASE_NO))?.kb16 as Rec).status).toBe('submitted')
    })

    await test.step('WIT1139 · เลขาธิการฯ ลงนามคำสั่ง คบ.16 (มีผลอีก 10 วัน — ยังคุ้มครองอยู่)', async () => {
      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')
      const kb16 = (await readCase(page, CASE_NO))?.kb16 as Rec
      expect(kb16.signedAt).toBeTruthy()
      expect(kb16.locked).toBe(true)
      expect((await readCase(page, CASE_NO))?.stage).not.toBe('terminated') // ยังไม่ถึงวันที่มีผล (WIT1130)
    })

    await test.step('WIT1140 · เจ้าหน้าที่บันทึกวันหยุดปฏิบัติจริง', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await page.locator('label:has(span:text-is("วันหยุดปฏิบัติจริง")) input').fill(isoDaysFromToday(10))
      await page.getByRole('button', { name: 'บันทึกวันหยุดปฏิบัติจริง' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกวันหยุดปฏิบัติจริงแล้ว')
      expect(((await readCase(page, CASE_NO))?.kb16 as Rec).operationStoppedAt).toBe(isoDaysFromToday(10))
    })

    await test.step('WIT1141 · เจ้าหน้าที่ร่าง คบ.17 ในแฟ้มและกด "ส่งให้ลงนาม"; เลขาธิการฯ ลงนาม', async () => {
      await page.getByPlaceholder('ชื่อไฟล์หนังสือ').fill('คบ17_แจ้งคำสั่งยุติ.pdf')
      await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
      await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).status).toBe('draft')

      await formRow(page, 'คบ.17').getByRole('button', { name: /ส่งให้ลงนาม|ส่งให้ผู้มีอำนาจ|ส่งให้อนุมัติ/ }).click()
      await confirmDialog(page, 'ส่งให้ลงนาม')
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).status).toBe('submitted')

      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await page.getByRole('button', { name: 'ลงนาม คบ.17' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.17')
    })

    await test.step('WIT1142 · ออกเลขและนำส่ง คบ.17 ผ่านสารบรรณเดิม', async () => {
      await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('สลข.999/2569')
      await page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ออกเลขและนำส่ง')
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).registryNo).toBe('สลข.999/2569')
    })

    // WIT1143 (อัปโหลดฉบับที่ส่งจริง) / WIT1144 (พยานรับหนังสือนอกระบบ) — ไม่บังคับในเส้นทางนี้ ต่อที่การบันทึกวันที่รับ

    await test.step('WIT1145 · บันทึกวันที่พยานได้รับ เริ่มนับกรอบอุทธรณ์ 30 วัน', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await page.getByLabel('วันที่พยานได้รับจริง').fill(isoDaysFromToday(-5))
      await page.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')
      await expect(page.getByText(/ครบกำหนดอุทธรณ์.*\(เหลือ \d+ วัน\)/)).toBeVisible()
    })

    await test.step('WIT1146 · ยังอยู่ในกรอบ 30 วัน — ปิดงานไม่ได้ ต้องเลือกทางอุทธรณ์', async () => {
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      expect((await readCase(page, CASE_NO))?.stage).not.toBe('terminated')
    })

    await test.step('WIT1147 · พยานยื่นอุทธรณ์ภายใน 30 วัน → รับคำอุทธรณ์ ส่งไปแท็บ 09B', async () => {
      const intake = page.getByTestId('appeal-intake-form')
      await intake.getByTestId('appeal-intake-reason').fill('ยังมีเหตุอันตรายอยู่ ขอให้ทบทวนคำสั่งยุติ')
      await intake.getByTestId('appeal-intake-channel-letter').click()
      await intake.getByTestId('appeal-intake-registry-no').fill('ปปท 0007/5501')
      await intake.getByTestId('appeal-intake-evidence-file').setInputFiles({
        name: 'คำร้องอุทธรณ์คำสั่งยุติ.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock'),
      })
      await intake.getByRole('button', { name: /มีอุทธรณ์ภายในกำหนด$/ }).click()
      await confirmDialog(page, 'ยืนยัน')
      await expect(page.locator('.swal2-toast')).toContainText('รับคำอุทธรณ์คำสั่งยุติ')
      const c = await readCase(page, CASE_NO)
      expect(c?.appealAgainst).toBe('kb17')
      expect(c?.stage).toBe('appeal')
      expect(c?.no).toBe(CASE_NO) // ไม่สร้าง คบ.1 ใหม่
      expect(c?.closedAt).toBeFalsy()
      await expect(page.getByRole('link', { name: 'ไปหน้าอุทธรณ์' })).toBeVisible()
    })
  })

  test('J13-C · [ทางแยก] ส่ง คบ.17 ไม่สำเร็จ 2 ครั้ง → บันทึกวันที่ถือว่าได้รับ → เริ่มนับอุทธรณ์ ยังปิดงานไม่ได้', async ({ page }) => {
    test.setTimeout(180_000)
    // ตั้งต้น Case 1.18 = ลงนาม คบ.16 / ออกเลขนำส่ง คบ.17 แล้ว รอพยานรับ (ผ่านขั้น WIT1138-1143 มาแล้ว)
    // (Case 1.18 มีวันที่พยานรับแล้ว จึงล้างวันรับ/กรอบอุทธรณ์ออกเพื่อกลับไปจุดก่อน WIT1144)
    const base = loadMockState('Case 1.18')
    const baseCase = JSON.parse(base.localStorageData['ecmis-case-storage-v2']).state.cases[0] as Rec
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.18', 'officer', {
      kb17: { ...(baseCase.kb17 as Rec), deliveredAt: undefined, appealDueAt: undefined, deliveryMethod: undefined, deliveryAttempts: [] },
    })
    await page.goto(TERM_URL)

    await test.step('WIT1143 · ฉบับส่งจริงอยู่ในแฟ้ม / WIT1144 · ยังไม่มีวันรับจริง ยังไม่เริ่มนับกรอบอุทธรณ์', async () => {
      const kb17 = (await readCase(page, CASE_NO))?.kb17 as Rec
      expect(kb17.dispatchedAt).toBeTruthy()
      expect(kb17.deliveredAt).toBeFalsy()
      await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์')).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
    })

    await test.step('WIT1144 · บันทึกผลการส่งไม่สำเร็จ ครั้งที่ 1 และ 2', async () => {
      await page.getByPlaceholder('หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)').fill('ไปรษณีย์ตีกลับ ไม่มีผู้รับ')
      await page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกผลการส่งไม่สำเร็จ')
      await page.getByPlaceholder('หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)').fill('ไปพบตัวไม่ได้ ปิดบ้าน')
      await page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ' }).click()
      await expect.poll(async () => (((await readCase(page, CASE_NO))?.kb17 as Rec).deliveryAttempts as unknown[]).length).toBe(2)
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).deliveredAt).toBeFalsy()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
    })

    await test.step('WIT1145 · บันทึกวันที่ถือว่าได้รับตามระเบียบ → เริ่มนับกรอบอุทธรณ์', async () => {
      await page.getByRole('button', { name: 'บันทึกวันที่ถือว่าได้รับตามระเบียบ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')
      const kb17 = (await readCase(page, CASE_NO))?.kb17 as Rec
      expect(kb17.deliveredAt).toBeTruthy()
      expect(kb17.deliveryMethod).toBe('deemed')
      await expect(page.getByText(/ครบกำหนดอุทธรณ์/)).toBeVisible()
    })

    await test.step('WIT1146 + WIT1148 · เพิ่งเริ่มนับ 30 วัน จึงยังปิดงานไม่ได้ แฟ้มยังไม่ยุติ', async () => {
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      const c = await readCase(page, CASE_NO)
      expect(c?.stage).not.toBe('terminated')
      expect(c?.closedAt).toBeFalsy()
    })
  })

  test('J13-D · [ทางแยก] ครบเพดาน 180 วัน → ปิดแขนงขยายเวลา → เลือก "ยุติ" → 11C คบ.15 → เห็นชอบ', async ({ page }) => {
    test.setTimeout(240_000)
    // ข้ามด้วย mock state: ปรับแฟ้มตั้งต้นให้อยู่ก่อนจุดตัดสินใจของทางแยกนี้ (ไม่มี mock state ตรงจุดนี้)
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(180))

    await test.step('WIT1103 + WIT1150 · ครบเพดานรวม ห้ามขยายด้วย คบ.14', async () => {
      await page.goto(REVIEW_URL)
      await expect(page.getByTestId('review-outcome-extend')).toBeDisabled()
      await expect(page.getByText(/ทำไม่ได้ — ครบเพดาน 180 วัน/)).toBeVisible()
    })

    await test.step('WIT1104-1105 · เสนอผลทบทวน "ยุติ" (ภัยหมด)', async () => {
      await page.getByTestId('review-outcome-terminate').click()
      await page.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }).fill('ครบ 180 วันแล้ว ประเมินแล้วไม่พบภัยคุกคามต่อพยาน')
      await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ครบเพดานและภัยหมดไป เห็นควรยุติ')
      await page.getByTestId('review-submit-proposal').click()
      await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')
    })

    await test.step('WIT1106 · ผบช.ชั้นต้นเห็นชอบ', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(REVIEW_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('เห็นชอบให้เข้าสู่กระบวนการยุติ')
      await page.getByTestId('review-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ')
    })

    await test.step('WIT1107 + WIT1111 · เจ้าหน้าที่ดำเนินการ → เข้าสู่กระบวนการยุติ ไปแท็บ 11C', async () => {
      await switchRole(page, 'officer')
      await page.goto(REVIEW_URL)
      await page.getByTestId('review-apply-outcome').click()
      await confirmDialog(page, 'ยืนยันดำเนินการ', 'คบ.15')
      const c = await readCase(page, CASE_NO)
      expect(c?.stage).toBe('termination_review')
      expect(c?.status).toBe('เข้าสู่กระบวนการยุติการคุ้มครอง')
      await page.getByTestId('review-goto-11c').click()
      await expect(page).toHaveURL(new RegExp(`/termination/${CASE_NO}`))
    })

    await test.step('WIT1124 + WIT1128 + WIT1129 · 11C บันทึกเหตุ "ครบกำหนด" และจัดทำ คบ.15', async () => {
      // การดำเนินการ WIT1111 ที่ 11A บันทึกที่มาของเหตุยุติให้แล้ว (ขั้น WIT1125 เสร็จ) — ไปต่อที่ WIT1129 ได้เลย
      // (prototype ตั้งต้นที่มาเป็น witness_kb7 ref ว่าง ทั้งที่เหตุจริงคือครบเพดาน/ภัยหมด — ผังให้ผู้ใช้เลือกแขนงเอง)
      const trig = (await readCase(page, CASE_NO))?.terminationTrigger as Rec
      expect(trig).toBeTruthy()
      expect(trig.recordedAt).toBeTruthy()
      await page.locator('main').locator('select').nth(1).selectOption({ label: SELECT_REASON })
      await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ครบเพดาน 180 วัน และประเมินแล้วไม่มีเหตุภัย')
      await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('submitted')
    })

    await test.step('WIT1130 · เรื่องยุติยังไม่ทำให้การคุ้มครองสิ้นสุดจนกว่าจะมี คบ.16', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb16).toBeFalsy()
      await expect(page.getByText(/การรับ คบ\.7 หรือจัดทำ คบ\.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด/)).toBeVisible()
    })

    await test.step('WIT1134 · ผบช.ชั้นต้นเห็นชอบ เสนอผู้มีอำนาจที่ 11D', async () => {
      await supervisorEndorsesKb15(page)
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('endorsed')
    })
  })

  test('J13-E · [ทางแยก] พ้นกำหนดอุทธรณ์ไม่มีอุทธรณ์ → ปิดงาน (WIT1148) → ล็อกทั้งแฟ้ม (TC-065)', async ({ page }) => {
    test.setTimeout(180_000)
    // Case 1.19 = พยานรับ คบ.17 เกิน 30 วันแล้ว (WIT1145-1146 เสร็จ) รอปิดงาน
    await seedMockState(page, 'Case 1.19', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1146 · พ้นกรอบ 30 วันและไม่มีงานค้าง — ปุ่มปิดงานเปิดใช้', async () => {
      await expect(page.getByText(/พ้นกำหนดแล้ว/)).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeEnabled()
    })

    await test.step('WIT1148 · ปิดงาน → แฟ้มเป็น "ยุติ" และ คบ.16 ถูกล็อก', async () => {
      await page.getByRole('button', { name: CLOSE_BUTTON }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')
      const c = await readCase(page, CASE_NO)
      expect(c?.stage).toBe('terminated')
      expect(c?.closedAt).toBeTruthy()
      expect((c?.kb16 as Rec).locked).toBe(true)
      await expect(page.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/)).toBeVisible()
    })

    await test.step('TC-065 · แฟ้มที่ปิดแล้วถูกล็อก: มีป้ายล็อกและปุ่มปิดงานซ้ำใช้ไม่ได้', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByText(/ล็อก/).first()).toBeVisible()
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toHaveCount(0)
      await expectStage(page, 'terminated')
    })
  })
})
