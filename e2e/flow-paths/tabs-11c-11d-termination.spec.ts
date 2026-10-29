import { expect, test, type Page } from '@playwright/test'
import { loadMockState, readCase, seedMockState, switchRole } from '../helpers/seed'
import { snap } from '../helpers/snapshot'
import { saveAndSubmitKb16, termDownLeg, termUpLeg } from '../helpers/termination'
import { CASE_NO, DOSSIER_URL, confirmDialog, expectStage, formRow } from '../journeys/journey-helpers'

/**
 * เดินทุกเส้นของผังแท็บ 11C และ 11D ผ่าน UI จริง (ผังที่ปรับให้ตรงโค้ดปัจจุบัน — fragments 11C.json / 11D.json)
 *
 * แท็บ 11C · จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15)
 *   11C-1  เส้นหลัก "ครบกำหนด/เจ้าหน้าที่เสนอ"   WIT1124 → 1125 → 1128 → 1129 → 1130 → 1131 → 1132 → 1134
 *   11C-2  แขนง "พยานขอยุติ" (คบ.7)             WIT1125 → 1126 → 1129
 *   11C-3  แขนง "หนังสือภายนอก"                  WIT1125 → 1127 → 1129
 *   11C-4  ผอ.ส่งคืน คบ.15 → เวอร์ชัน 2 → เห็นชอบ  WIT1131 → 1132 → 1133 → 1129 → 1134
 *   11C-5  ลงนามตามลำดับชั้น ผอ. → ธุรการ → รองเลขาธิการ → เลขาธิการ  WIT1134 → 1161 → 1163 → 1162
 *   11C-7  รองเลขาธิการส่งคืน → ธุรการขากลับ → จัดทำใหม่  WIT1163 → 1129
 *   11C-6  ตรวจ คบ.15 จากแถวแบบฟอร์มในหน้าแฟ้ม      WIT1131 → 1132 → 1134 (ทางโมดัล)
 *
 * แท็บ 11D · คำสั่งยุติ (คบ.16) แจ้งผล (คบ.17) อุทธรณ์ และปิดงาน
 *   11D-1  อนุมัติ → จัดทำ/ส่ง คบ.16 → ธุรการขาไป      WIT1135 → 1136 → 1171 → 1138 → 1172
 *   11D-2  ไม่อนุมัติ → คุ้มครองต่อ กลับแท็บ 10         WIT1136 → 1137 (→ 1171 ขากลับ)
 *   11D-3  ลงนาม คบ.16 → ธุรการขากลับ → วันหยุดปฏิบัติ  WIT1139 → 1173 → 1140
 *   11D-4  คบ.17: ร่าง → ลงนาม → ออกเลข → ฉบับส่ง → วันรับ  WIT1141 → 1174 → 1175 → 1176 → 1142 → 1143 → 1144 → 1145 → 1146
 *   11D-5  ส่งไม่ถึง → ถือว่าได้รับตามระเบียบ           WIT1144 → 1177 → 1178 → 1145 → 1146
 *   11D-6  มีอุทธรณ์ภายในกำหนด → ไปหน้าอุทธรณ์          WIT1146 → 1147
 *   11D-7  พ้นกำหนดไม่มีอุทธรณ์ → ปิดงาน               WIT1146 → 1148
 *   11D-8  มติอุทธรณ์กลับมา ยกคำร้อง → ปิดงาน           WIT1147 → 1179 → 1148
 *   11D-9  มติอุทธรณ์กลับมา เพิกถอน → ไม่ปิดงาน          WIT1147 → 1179 → 1180
 *
 * ข้อกำหนดสำคัญที่ผังนี้ยึดตามโค้ด: อำนาจอนุมัติ/ลงนาม (WIT1136, 1139, 1175) เป็นของเลขาธิการ (secretary) เท่านั้น
 * และเอกสารข้ามหน่วย↔สำนักงานเลขาธิการต้องผ่านธุรการสองจุด (termUpLeg / termDownLeg)
 */

const TERM_URL = `/termination/${encodeURIComponent(CASE_NO)}`
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const SELECT_REASON = 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง'
const CLOSE_BUTTON = 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน'

type Rec = Record<string, unknown>

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = () => isoDaysFromToday(0)

/** ฟอร์มเลือกที่มาของเรื่องยุติ (WIT1125) */
const triggerForm = (page: Page) => page.getByTestId('termination-trigger-form')

/** select "— เลือกเหตุยุติ —" ของส่วนจัดทำ คบ.15 (WIT1129) */
const reasonSelect = (page: Page) =>
  page.locator('main select').filter({ has: page.locator('option', { hasText: '— เลือกเหตุยุติ —' }) })

/** WIT1129 — เลือกเหตุแห่งการยุติ กรอกหลักฐาน บันทึกแบบ คบ.15 ที่หน้า /termination แล้ว "ส่งตรวจ" ที่แถว คบ.15 ในแฟ้ม */
async function draftKb15(page: Page, evidence: string) {
  await reasonSelect(page).selectOption({ label: SELECT_REASON })
  await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill(evidence)
  await page.getByRole('button', { name: /^บันทึกแบบ คบ\.15/ }).first().click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.15 แล้ว')
  await page.getByRole('button', { name: 'ไปส่งตรวจที่แฟ้มคำร้อง' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
  // เรื่องใหม่ยังไม่มีแถว คบ.15 ในแฟ้ม — แนบจากรายการ "แนบ คบ.15" ก่อน (ฉบับแก้ไขหลังส่งคืนมีแถวอยู่แล้ว)
  if ((await formRow(page, 'คบ.15').count()) === 0) {
    await page.getByTestId('dossier-forms').locator('select').selectOption({ label: 'แนบ คบ.15 - รายงานการให้ความคุ้มครองพยานสิ้นสุด' })
    await page.getByTestId('dossier-forms').getByRole('button', { name: 'แนบเข้าแฟ้ม' }).click()
  }
  await formRow(page, 'คบ.15').getByRole('button', { name: 'ส่งตรวจ' }).click()
  await confirmDialog(page, 'ส่งตรวจ')
  await expect(page.locator('.swal2-toast')).toContainText('คบ.15')
}

/** WIT1128/1125 — บันทึกเหตุเริ่มยุติแขนง "ครบกำหนด/เจ้าหน้าที่เสนอ" */
async function recordDueTrigger(page: Page) {
  const form = triggerForm(page)
  await form.getByRole('textbox', { name: 'คำสั่งที่ครบกำหนด *', exact: true }).fill('คำสั่งคุ้มครองครบกำหนด 6 เดือน')
  await detailBox(page, 'เหตุผลและข้อมูลประกอบ').fill('ผลประเมินล่าสุดไม่พบเหตุภัย')
  await form.getByRole('button', { name: 'บันทึกเรื่องยุติ', exact: true }).click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติเข้ากับแฟ้มเดิมแล้ว')
}

/** WIT1131/1132/1134 — ผอ.กอง/สำนัก (ชั้นแรกของลำดับลงนาม คบ.15) กด "เห็นชอบ · ส่งรองเลขาธิการ" แล้วชุดนำส่งขาไปเปิดที่ธุรการ */
async function directorEndorses(page: Page) {
  await switchRole(page, 'director')
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'เห็นชอบ · ส่งรองเลขาธิการ', exact: true }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน')
  await expect(page.locator('.swal2-toast')).toContainText('เห็นชอบ')
}

/** รองเลขาธิการ (หลังธุรการขาไป) กด "เห็นชอบ · ส่งเลขาธิการ" */
async function deputyEndorses(page: Page) {
  await switchRole(page, 'deputy_secretary')
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'เห็นชอบ · ส่งเลขาธิการ', exact: true }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน')
  await expect(page.locator('.swal2-toast')).toContainText('เห็นชอบ')
}

/** เลขาธิการลงนาม คบ.15 — จบลำดับลงนาม พร้อมพิจารณาอนุมัติยุติในหน้าเดียวกัน */
async function secretarySignsKb15(page: Page) {
  await switchRole(page, 'secretary')
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: /^ลงนาม คบ\.15$/ }).click()
  await confirmDialog(page, 'ยืนยันลงนาม')
  await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.15')
}

/** textarea ในฟอร์มเหตุเริ่มยุติ (accessible name ของ VoiceTextarea ไม่ตรงกับ label) */
const detailBox = (page: Page, label: string) => triggerForm(page).locator('label', { hasText: label }).locator('textarea')

/** WIT1136 — เลขาธิการอนุมัติให้ยุติ แล้วผลกลับหน่วยผ่านธุรการ (WIT1171) */
async function secretaryApproves(page: Page, note = 'อนุมัติให้ยุติตามที่เสนอ') {
  await switchRole(page, 'secretary')
  await page.goto(TERM_URL)
  await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill(note)
  await page.getByRole('button', { name: 'อนุมัติให้ยุติ', exact: true }).click()
  await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')
  await snap(page, ['node:11D:WIT1171', 'edge:11D:E1138'], { label: 'เลขาธิการอนุมัติยุติแล้ว ผลรอธุรการขากลับ', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'secretary_receiver' })
  await termDownLeg(page, CASE_NO)
  await snap(page, ['node:11D:WIT1138', 'edge:11D:E1170'], { label: 'ผลอนุมัติถึงเจ้าของสำนวนแล้ว รอจัดทำร่าง คบ.16', route: TERM_URL, role: 'officer' })
}

/** ตั้งต้นแฟ้ม Case 1.18 โดยล้าง คบ.17 และกรอบอุทธรณ์ — กลับไปจุดหลัง คบ.16 ลงนาม ก่อนร่าง คบ.17 (WIT1141) */
const withoutKb17 = { kb17: undefined, appealDueAt: undefined, appealAgainst: undefined }

/** ตั้งต้น Case 1.18 ที่นำส่ง คบ.17 แล้วแต่ยังไม่มีวันที่พยานรับ (ก่อน WIT1145) */
function kb17AwaitingDelivery() {
  const base = loadMockState('Case 1.18')
  const baseCase = JSON.parse(base.localStorageData['ecmis-case-storage-v2']).state.cases[0] as Rec
  return {
    kb17: { ...(baseCase.kb17 as Rec), deliveredAt: undefined, appealDueAt: undefined, deliveryMethod: undefined, deliveryAttempts: [] },
    appealDueAt: undefined,
    appealAgainst: undefined,
  }
}

// ============================================================================
// 11C · จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15)
// ============================================================================
test.describe('11C · จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15) · WIT1124-WIT1134, WIT1161-WIT1162', () => {
  test('11C-1 · เส้นหลักแขนง "ครบกำหนด/เจ้าหน้าที่เสนอ" → จัดทำ คบ.15 → ผอ.เห็นชอบ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.14', 'officer')

    await test.step('WIT1124 · เปิดรายการ /termination แล้วเข้าแฟ้ม เห็นหัวเรื่องและตัวนับขั้น', async () => {
      await page.goto('/termination')
      await snap(page, ['node:11C:WIT1124'], { label: 'หน้ารายการงานยุติการคุ้มครอง (รับงานยุติเข้าแท็บ 11C)', route: '/termination', role: 'officer' })
      await page.getByRole('link', { name: new RegExp(CASE_NO) }).first().click()
      await expect(page).toHaveURL(new RegExp(`/termination/${encodeURIComponent(CASE_NO)}`))
      await expect(page.getByText(/ยุติการคุ้มครองและปิดงาน — /).first()).toBeVisible()
      await expect(page.getByText(/ขั้นตอน \d+ \/ \d+/).first()).toBeVisible()
      await snap(page, ['node:11C:WIT1125', 'node:11C:WIT1128', 'edge:11C:E1123', 'edge:11C:E1126'], { label: 'เข้าแฟ้มยุติแล้ว รอเลือกเหตุเริ่มยุติและบันทึกเหตุ', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1125 · มี radio 3 แขนง และข้อความ WIT1130 "มีผลยุติเมื่อ คบ.16 ลงนามและถึงวันที่กำหนด"', async () => {
      await expect(triggerForm(page).getByRole('radio')).toHaveCount(3)
      await expect(page.getByText('มีผลยุติเมื่อ คบ.16 ลงนามและถึงวันที่กำหนด')).toBeVisible()
    })

    await test.step('WIT1125 · ไม่กรอกเลขอ้างอิงแล้วกดบันทึก ระบบเตือนและไม่บันทึก', async () => {
      await triggerForm(page).getByRole('button', { name: 'บันทึกเรื่องยุติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุคำสั่งที่ครบกำหนด')
      expect((await readCase(page, CASE_NO))?.terminationTrigger).toBeFalsy()
    })

    await test.step('WIT1128 · บันทึกเหตุเริ่มยุติแขนง ครบกำหนด/เจ้าหน้าที่เสนอ', async () => {
      await expect(triggerForm(page).getByRole('radio', { name: /เจ้าหน้าที่เสนอ/ })).toBeChecked()
      await recordDueTrigger(page)
      const c = await readCase(page, CASE_NO)
      expect((c?.terminationTrigger as Rec).source).toBe('due_or_officer')
      expect(c?.stage).toBe('termination_review')
      await expect(page.getByTestId('termination-trigger-form')).toHaveCount(0)
      await snap(page, ['node:11C:WIT1129', 'edge:11C:E1129'], { label: 'บันทึกเหตุเริ่มยุติแล้ว รอจัดทำ คบ.15', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1129 + WIT1130 · จัดทำ คบ.15 — การคุ้มครองยังไม่สิ้นสุด (ไม่มี closedAt / คบ.16)', async () => {
      await draftKb15(page, 'ครบกำหนดและไม่มีเหตุภัย ตามผลประเมินล่าสุด')
      const c = await readCase(page, CASE_NO)
      const kb15 = c?.kb15 as Rec
      expect(kb15.status).toBe('submitted')
      expect(kb15.trigger).toBe('due_or_officer')
      expect(c?.stage).toBe('termination_review')
      expect(c?.closedAt).toBeFalsy()
      expect(c?.kb16).toBeFalsy()
      await page.goto(TERM_URL)
      await expect(page.getByText(/สถานะ: รอ.+ตรวจ/).first()).toBeVisible()
      await snap(page, ['node:11C:WIT1130', 'node:11C:WIT1131', 'node:11C:WIT1132', 'node:11C:WIT1134', 'edge:11C:E1130', 'edge:11C:E1131', 'edge:11C:E1132', 'edge:11C:E1135'], { label: 'จัดทำ คบ.15 แล้ว รอ ผอ.กอง/สำนักตรวจ (ลำดับลงนามชั้นแรก; การคุ้มครองยังไม่สิ้นสุด)', route: TERM_URL, role: 'director' })
    })

    await test.step('WIT1131 + WIT1132 + WIT1134 · ผอ.กอง/สำนักตรวจแล้วกด "เห็นชอบ · ส่งรองเลขาธิการ"', async () => {
      await directorEndorses(page)
      const c = await readCase(page, CASE_NO)
      expect(c?.kb15).toMatchObject({ status: 'submitted', approvalStage: 'deputy_secretary' })
      expect(c?.stage).not.toBe('terminated')
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'up', forms: [15] })
    })
  })

  test('11C-2 · แขนง "พยานขอยุติ" (คบ.7): เลือก radio พาไปแบบ คบ.7 → กลับมากรอกเลขและชื่อไฟล์ → คบ.15 อ้างอิง คบ.7', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1126 · คลิก radio "พยานขอยุติ" ระบบเปิด /form/7?from=termination ทันที', async () => {
      await triggerForm(page).getByRole('radio', { name: /พยานขอยุติ/ }).click()
      await expect(page).toHaveURL(new RegExp(`/form/7\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}&from=termination`))
      await snap(page, ['node:11C:WIT1126', 'edge:11C:E1124'], { label: 'เลือกแขนงพยานขอยุติ เปิดแบบ คบ.7 รอกรอกเหตุผล', role: 'officer' })
    })

    await test.step('WIT1126 · กรอกเหตุผลในแบบ คบ.7 แล้ว "บันทึก คบ.7 และกลับเรื่องยุติ" (เก็บเป็นร่าง ยังไม่ส่งคำขอ)', async () => {
      await page.locator('textarea[placeholder="ระบุเหตุผลและผลการประเมินความปลอดภัยล่าสุด..."]').fill('พยานขอยุติเอง เนื่องจากย้ายภูมิลำเนา')
      await page.getByRole('button', { name: /บันทึก คบ.7 และกลับเรื่องยุติ/ }).click()
      await expect(page).toHaveURL(new RegExp(`/termination/${encodeURIComponent(CASE_NO)}`))
      const c = await readCase(page, CASE_NO)
      expect(c?.terminationRequest).toBeFalsy() // ไม่ได้เรียก requestTermination
      expect(c?.terminationTrigger).toBeFalsy()
      await expect(triggerForm(page).getByRole('radio', { name: /พยานขอยุติ/ })).toBeChecked()
      await expect(detailBox(page, 'เหตุผลและข้อมูลประกอบ')).toHaveValue('พยานขอยุติเอง เนื่องจากย้ายภูมิลำเนา')
      await expect(triggerForm(page).getByRole('button', { name: 'เปิดแบบ คบ.7', exact: true })).toBeVisible()
    })

    await test.step('WIT1125 · กรอกเลข คบ.7 และชื่อไฟล์เอง แล้ว "บันทึกเรื่องยุติ"', async () => {
      const form = triggerForm(page)
      await form.getByRole('textbox', { name: 'เลขที่ คบ.7 / เลขรับคำขอในระบบ *', exact: true }).fill('KB7-001/2569')
      await form.getByRole('textbox', { name: 'ไฟล์ คบ.7 ที่พยานลงนาม *', exact: true }).fill('kb7_เซ็นแล้ว.pdf')
      await form.getByRole('button', { name: 'บันทึกเรื่องยุติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติเข้ากับแฟ้มเดิมแล้ว')
      const c = await readCase(page, CASE_NO)
      expect(c?.terminationTrigger).toMatchObject({ source: 'witness_kb7', ref: 'KB7-001/2569', documentName: 'kb7_เซ็นแล้ว.pdf' })
      expect((c?.extraForms as number[]) || []).toContain(7)
      expect(c?.stage).toBe('termination_review')
      await snap(page, ['edge:11C:E1127'], { label: 'บันทึกเหตุเริ่มยุติจากพยานขอยุติ (คบ.7) แล้ว รอจัดทำ คบ.15', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1129 · จัดทำ คบ.15 อ้างอิง คบ.7', async () => {
      await draftKb15(page, 'ติดตามผลแล้วไม่พบภัยคุกคามเพิ่มเติม')
      const c = await readCase(page, CASE_NO)
      expect((c?.kb15 as Rec).trigger).toBe('witness_kb7')
      expect((c?.kb15 as Rec).triggerRef).toBe('KB7-001/2569')
      expect(c?.closedAt).toBeFalsy()
    })
  })

  test('11C-3 · แขนง "หนังสือภายนอก": บันทึกเลขหนังสือ+ไฟล์+หน่วยงาน → เข้าแฟ้มเดิม → คบ.15 อ้างอิงหนังสือ', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1127 · เลือก "หนังสือภายนอก" กรอกช่องแล้วบันทึกเรื่องยุติ', async () => {
      const form = triggerForm(page)
      await form.getByRole('radio', { name: /หนังสือภายนอก/ }).check()
      await expect(detailBox(page, 'หน่วยงานผู้ส่งหนังสือ')).toBeVisible()
      await snap(page, ['node:11C:WIT1127', 'edge:11C:E1125'], { label: 'เลือกแขนงหนังสือภายนอก รอกรอกเลขหนังสือและไฟล์', route: TERM_URL, role: 'officer' })
      await form.getByRole('textbox', { name: 'เลขที่หนังสือจากสารบรรณเดิม *', exact: true }).fill('ศธ.0001/2569')
      await form.getByRole('textbox', { name: 'ไฟล์หนังสือขอยุติจากภายนอก *', exact: true }).fill('หนังสือขอยุติ.pdf')
      await detailBox(page, 'หน่วยงานผู้ส่งหนังสือ').fill('สำนักงานอัยการจังหวัด')
      await form.getByRole('button', { name: 'บันทึกเรื่องยุติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติเข้ากับแฟ้มเดิมแล้ว')
    })

    await test.step('WIT1127 · เอกสารเข้าแฟ้มเดิมและมีหนังสือรับเข้า (officialLetters)', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.terminationTrigger).toMatchObject({ source: 'external_letter', ref: 'ศธ.0001/2569' })
      expect(((c?.officialLetters as Rec[]) || []).some((l) => l.registryNo === 'ศธ.0001/2569' && l.direction === 'incoming')).toBe(true)
      expect(((c?.documents as Rec[]) || []).some((d) => d.name === 'หนังสือขอยุติ.pdf')).toBe(true)
      await snap(page, ['edge:11C:E1128'], { label: 'หนังสือขอยุติจากภายนอกเข้าแฟ้มเดิมแล้ว รอจัดทำ คบ.15', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1129 · จัดทำ คบ.15 อ้างอิงหนังสือภายนอก', async () => {
      await draftKb15(page, 'อ้างอิงหนังสือจากภายนอก')
      const kb15 = (await readCase(page, CASE_NO))?.kb15 as Rec
      expect(kb15.trigger).toBe('external_letter')
      expect(kb15.triggerRef).toBe('ศธ.0001/2569')
    })
  })

  test('11C-4 · ผอ.กอง/สำนัก "ส่งคืนแก้ไข" → เจ้าหน้าที่จัดทำเวอร์ชัน 2 (เก็บฉบับเดิม) → เห็นชอบ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.15', 'officer')
    await page.goto(TERM_URL)
    await switchRole(page, 'director')
    await snap(page, ['node:11C:WIT1133', 'edge:11C:E1133'], { label: 'ผอ.กอง/สำนักเปิด คบ.15 ที่ไม่ครบถ้วน รอส่งคืนแก้ไข', route: TERM_URL, role: 'director' })

    await test.step('WIT1133 · ส่งคืนต้องกรอกเหตุผลก่อน', async () => {
      await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุเหตุผลที่ส่งคืน')
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('submitted')
    })

    await test.step('WIT1131-1133 · กรอกเหตุผล ส่งคืนแก้ไข และยืนยัน (ไม่ผ่านธุรการ)', async () => {
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('ยังไม่แนบผลประเมินล่าสุด')
      await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.15 เวอร์ชันใหม่')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb15).toMatchObject({ status: 'returned', reviewNote: 'ยังไม่แนบผลประเมินล่าสุด' })
      expect(c?.sarabanDispatch).toBeFalsy()
    })

    await test.step('WIT1133 → WIT1129 · เจ้าหน้าที่จัดทำ คบ.15 เวอร์ชันใหม่ (เก็บฉบับเดิม)', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await expect(page.getByText(/ส่งคืนแก้ไข/).first()).toBeVisible()
      await snap(page, ['edge:11C:E1134'], { label: 'ผอ.ส่งคืน คบ.15 แล้ว เจ้าหน้าที่ต้องจัดทำฉบับใหม่', route: TERM_URL, role: 'officer' })
      await draftKb15(page, 'สรุปผลรอบสอง แนบผลประเมินล่าสุดแล้ว')
      const kb15 = (await readCase(page, CASE_NO))?.kb15 as Rec
      expect(kb15.version).toBe(2)
      expect(kb15.status).toBe('submitted')
      expect(kb15.previousVersions as unknown[]).toHaveLength(1)
    })

    await test.step('WIT1134 · ผอ.กอง/สำนักเห็นชอบฉบับที่ 2', async () => {
      await directorEndorses(page)
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).approvalStage).toBe('deputy_secretary')
    })
  })

  test('11C-5 · ลงนาม คบ.15 ตามลำดับชั้น: ผอ. → ธุรการขาไป → รองเลขาธิการ → เลขาธิการลงนาม (WIT1134 → 1161 → 1163 → 1162)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.15', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1134 · ผอ.เห็นชอบ → เปิดชุดนำส่งขาไป flow=termination forms=[15]', async () => {
      await directorEndorses(page)
      const c = await readCase(page, CASE_NO)
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'up', forms: [15] })
      await expect(page.getByText(/รอรองเลขาธิการตรวจ/).first()).toBeVisible()
      await snap(page, ['node:11C:WIT1161', 'edge:11C:E1160'], { label: 'ผอ.เห็นชอบ คบ.15 แล้ว ชุดนำส่งรอธุรการสำนัก/กองลงเลขส่ง', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'receiver' })
    })

    await test.step('WIT1161 · ระหว่างชุดนำส่งขาไปค้างที่ธุรการ รองเลขาธิการยังตรวจ/เห็นชอบแทนไม่ได้ (reviewKb15 ถูกบล็อกด้วย sarabanInTransit)', async () => {
      const before = await readCase(page, CASE_NO)
      const historyLen = ((before?.kb15 as Rec).approvalHistory as unknown[]).length
      await switchRole(page, 'deputy_secretary')
      await page.goto(TERM_URL)
      await page.getByRole('button', { name: 'เห็นชอบ · ส่งเลขาธิการ', exact: true }).click()
      await confirmDialog(page, 'ยืนยันครบถ้วน')
      const after = await readCase(page, CASE_NO)
      expect(after?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'up', forms: [15] })
      expect((after?.kb15 as Rec).approvalStage).toBe('deputy_secretary')
      expect((after?.kb15 as Rec).status).toBe('submitted')
      expect(((after?.kb15 as Rec).approvalHistory as unknown[]).length).toBe(historyLen)
    })

    await test.step('WIT1161 · ธุรการสำนัก/กอง ออกเลขส่ง → ธุรการสำนักงานเลขาธิการ ลงเลขรับ', async () => {
      await termUpLeg(page, CASE_NO, 'deputy_secretary')
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: 'เห็นชอบ · ส่งเลขาธิการ', exact: true })).toBeVisible()
      await snap(page, ['node:11C:WIT1163', 'edge:11C:E1161'], { label: 'ธุรการนำส่งขาไปเสร็จ คบ.15 ถึงรองเลขาธิการ รอตรวจ', route: TERM_URL, role: 'deputy_secretary' })
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toBeFalsy()
      const records = ((await readCase(page, CASE_NO))?.sarabanRecords as Rec[]) || []
      expect(records.filter((r) => ((r.forms as number[] | undefined) ?? [r.formNo as number]).includes(15)).map((r) => r.checkpoint)).toEqual(expect.arrayContaining(['director_outgoing', 'secretary_incoming']))
    })

    await test.step('WIT1163 + WIT1162 · รองเลขาธิการเห็นชอบ → เอกสารถึงเลขาธิการ เห็นปุ่มลงนาม คบ.15', async () => {
      await deputyEndorses(page)
      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: /^ลงนาม คบ\.15$/ })).toBeVisible()
      await snap(page, ['node:11C:WIT1162', 'edge:11C:E1162'], { label: 'รองเลขาธิการเห็นชอบแล้ว คบ.15 ถึงเลขาธิการ รอลงนาม คบ.15', route: TERM_URL, role: 'secretary' })
    })

    await test.step('WIT1162 → 11D · เลขาธิการลงนาม คบ.15 แล้วเห็นช่องพิจารณาอนุมัติยุติ', async () => {
      await secretarySignsKb15(page)
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).status).toBe('endorsed')
      await expect(page.getByPlaceholder('ความเห็นประกอบผลพิจารณา')).toBeVisible()
      await expect(page.getByRole('button', { name: 'อนุมัติให้ยุติ', exact: true })).toBeVisible()
      await snap(page, ['overview:11C>11D'], { label: 'เลขาธิการลงนาม คบ.15 แล้ว เห็นช่องพิจารณาอนุมัติยุติ (ต่อแท็บ 11D)', route: TERM_URL, role: 'secretary' })
    })
  })

  test('11C-7 · รองเลขาธิการ "ส่งคืนแก้ไข" → ธุรการขากลับ → เจ้าหน้าที่ต้องจัดทำ คบ.15 เวอร์ชันใหม่ (WIT1163 → 1129)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.15', 'officer')
    await page.goto(TERM_URL)
    await directorEndorses(page)
    await termUpLeg(page, CASE_NO, 'deputy_secretary')

    await test.step('WIT1163 · รองเลขาธิการกรอกเหตุผลและส่งคืนแก้ไข → เปิดชุดนำส่งขากลับ', async () => {
      await page.goto(TERM_URL)
      await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('ขอผลประเมินความปลอดภัยฉบับล่าสุดเพิ่ม')
      await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await confirmDialog(page, 'ยืนยันส่งคืน')
      const c = await readCase(page, CASE_NO)
      expect(c?.kb15).toMatchObject({ status: 'returned', reviewNote: 'ขอผลประเมินความปลอดภัยฉบับล่าสุดเพิ่ม' })
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [15] })
    })

    await test.step('WIT1163 → WIT1129 · ธุรการขากลับส่งถึงเจ้าหน้าที่ รอจัดทำ คบ.15 เวอร์ชันใหม่', async () => {
      await termDownLeg(page, CASE_NO, 'officer')
      await page.goto(TERM_URL)
      await expect(page.getByText(/ส่งคืนแก้ไข/).first()).toBeVisible()
      await snap(page, ['edge:11C:E1163'], { label: 'รองเลขาธิการส่งคืน คบ.15 ผ่านธุรการขากลับแล้ว เจ้าหน้าที่ต้องจัดทำฉบับใหม่', route: TERM_URL, role: 'officer' })
    })
  })

  test('11C-6 · ผอ.กอง/สำนักตรวจ คบ.15 จากแถวแบบฟอร์มในหน้าแฟ้ม (โมดัล) → เห็นชอบ → ไปหน้า /termination', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.15', 'officer')
    await page.goto(DOSSIER_URL)
    await switchRole(page, 'director')

    await test.step('WIT1131 · กดปุ่ม "ตรวจ คบ.15" ที่แถว คบ.15 เปิดโมดัลตรวจ', async () => {
      await formRow(page, 'คบ.15').getByRole('button', { name: 'ตรวจ คบ.15' }).click()
      await expect(page.getByText('ตรวจ คบ.15 · รายงานการให้ความคุ้มครองสิ้นสุด')).toBeVisible()
    })

    await test.step('WIT1132 + WIT1134 · ครบถ้วน → ยืนยัน → ระบบพาไป /termination', async () => {
      await page.getByRole('button', { name: 'เห็นชอบ · ส่งรองเลขาธิการ', exact: true }).click()
      await confirmDialog(page, 'ยืนยันครบถ้วน')
      await expect(page).toHaveURL(new RegExp(`/termination/${encodeURIComponent(CASE_NO)}`))
      expect(((await readCase(page, CASE_NO))?.kb15 as Rec).approvalStage).toBe('deputy_secretary')
    })
  })
})

// ============================================================================
// 11D · คำสั่งยุติ (คบ.16) แจ้งผล (คบ.17) อุทธรณ์ และปิดงาน
// ============================================================================
test.describe('11D · คำสั่งยุติ แจ้งผล อุทธรณ์ และปิดงาน · WIT1135-WIT1148, WIT1171-WIT1180', () => {
  test('11D-1 · เลขาธิการอนุมัติ → ธุรการขากลับ → เจ้าหน้าที่จัดทำและส่ง คบ.16 → ธุรการขาไป → เลขาธิการเห็นปุ่มลงนาม', async ({ page }) => {
    test.setTimeout(240_000)
    // seed ด้วยบัญชีเจ้าของสำนวน (หน่วย เขต 1) แล้วสลับบทบาทเป็นเลขาธิการ — ถ้า seed เป็น secretary ธุรการจะอยู่คนละหน่วยกับแฟ้ม
    await seedMockState(page, 'Case 1.16', 'officer')

    await test.step('WIT1135 · การ์ด คบ.16 ปรากฏเมื่อ คบ.15 เห็นชอบ ผอ.สำนัก/กอง ไม่เห็นปุ่มพิจารณา', async () => {
      await page.goto(TERM_URL)
      await switchRole(page, 'secretary')
      await expect(page.getByText('คำสั่งยุติการคุ้มครอง · คบ.16', { exact: true })).toBeVisible()
      await snap(page, ['node:11D:WIT1135', 'node:11D:WIT1136', 'edge:11D:E1136'], { label: 'เลขาธิการลงนาม คบ.15 แล้ว รอพิจารณาอนุมัติยุติ', route: TERM_URL, role: 'secretary' })
      await switchRole(page, 'director')
      await page.goto(TERM_URL)
      await expect(page.getByPlaceholder('ความเห็นประกอบผลพิจารณา')).toHaveCount(0)
    })

    await test.step('WIT1136 + WIT1171 · เลขาธิการอนุมัติให้ยุติ แล้วผลกลับหน่วยผ่านธุรการ', async () => {
      await secretaryApproves(page)
      const c = await readCase(page, CASE_NO)
      expect(c?.terminationApproval).toMatchObject({ approved: true })
      expect(c?.stage).toBe('termination_order')
      expect(c?.kb16).toBeFalsy()
      expect(c?.sarabanDispatch).toBeFalsy()
    })

    await test.step('WIT1138 · เจ้าหน้าที่กด "จัดทำ คบ.16" กรอกแบบ (วันที่มีผลในอนาคต) บันทึก แล้วกด "ส่งให้อนุมัติ" ที่แถวในแฟ้ม', async () => {
      await switchRole(page, 'officer')
      await page.goto(TERM_URL)
      await expect(page.getByText('อนุมัติให้จัดทำคำสั่งแล้ว')).toBeVisible()
      await page.getByRole('button', { name: 'จัดทำ คบ.16', exact: true }).click()
      await expect(page).toHaveURL(new RegExp(`/form/16\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}&from=termination`))
      await expect(page.getByRole('textbox', { name: 'เหตุยุติ *', exact: true })).not.toHaveValue('') // ดึงจาก คบ.15
      await page.getByRole('textbox', { name: 'คำสั่งที่ *', exact: true }).fill('501/2569')
      await page.getByLabel('วันที่ออกคำสั่ง').fill(todayIso())
      await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(10))
      await saveAndSubmitKb16(page, CASE_NO)
      const kb16 = (await readCase(page, CASE_NO))?.kb16 as Rec
      expect(kb16.status).toBe('submitted')
      expect(kb16.signedAt).toBeFalsy()
      expect(((await readCase(page, CASE_NO))?.sarabanDispatch as Rec).forms).toEqual([16])
      await snap(page, ['node:11D:WIT1172', 'edge:11D:E1171'], { label: 'ส่ง คบ.16 ให้ลงนามแล้ว ชุดนำส่งรอธุรการสำนัก/กองลงเลขส่ง', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'receiver' })
    })

    await test.step('WIT1172 · ธุรการสองจุด แล้วเลขาธิการเห็นปุ่ม "ลงนามคำสั่ง คบ.16"', async () => {
      await termUpLeg(page, CASE_NO)
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' })).toBeVisible()
      await snap(page, ['node:11D:WIT1139', 'edge:11D:E1172'], { label: 'คบ.16 ถึงเลขาธิการแล้ว รอลงนาม', route: TERM_URL, role: 'secretary' })
    })
  })

  test('11D-2 · เลขาธิการ "ไม่อนุมัติ" (ต้องมีเหตุผล) → คุ้มครองต่อ → ผลกลับหน่วย → ลิงก์กลับแท็บ 10', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.16', 'officer')
    await page.goto(TERM_URL)
    await switchRole(page, 'secretary')
    await snap(page, ['node:11D:WIT1137'], { label: 'เลขาธิการเปิดพิจารณา คบ.15 พร้อมจะบันทึกผลไม่อนุมัติ', route: TERM_URL, role: 'secretary' })

    await test.step('WIT1136 · ไม่อนุมัติโดยไม่กรอกเหตุผล ระบบเตือนและไม่บันทึก', async () => {
      await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
      expect((await readCase(page, CASE_NO))?.terminationApproval).toBeFalsy()
    })

    await test.step('WIT1137 · กรอกเหตุผลแล้วไม่อนุมัติ → stage กลับเป็น protection ไม่มี คบ.16', async () => {
      await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('ยังมีเหตุภัยอยู่ ไม่ควรยุติในขณะนี้')
      await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('คุ้มครองต่อภายใต้คำสั่งเดิม')
      const c = await readCase(page, CASE_NO)
      expect((c?.terminationApproval as Rec).approved).toBe(false)
      expect(c?.stage).toBe('protection')
      expect(c?.kb16).toBeFalsy()
      expect(c?.closedAt).toBeFalsy()
      await expect(page.getByText(/ไม่อนุมัติให้ยุติเมื่อ/)).toBeVisible()
      await snap(page, ['edge:11D:E1137'], { label: 'เลขาธิการไม่อนุมัติยุติแล้ว คุ้มครองต่อภายใต้คำสั่งเดิม', route: TERM_URL, role: 'secretary' })
    })

    await test.step('WIT1171 · ผลไม่อนุมัติกลับหน่วยผ่านธุรการ แล้วเจ้าของสำนวนกดลิงก์กลับแท็บ 10', async () => {
      await termDownLeg(page, CASE_NO)
      await page.goto(TERM_URL)
      await page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      await expectStage(page, 'protection')
      await snap(page, ['overview:11D>10'], { label: 'ผลไม่อนุมัติยุติกลับถึงเจ้าของสำนวน เปิดหน้ารายงานผลคุ้มครอง (แท็บ 10)', role: 'officer' })
      await page.goto(MONITOR_URL)
    })
  })

  test('11D-3 · เลขาธิการลงนาม คบ.16 (ล็อกฉบับ) → ธุรการขากลับ → เจ้าหน้าที่บันทึกวันหยุดปฏิบัติจริง', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.20', 'officer') // ส่ง คบ.16 ถึงเลขาธิการแล้ว (สลับเป็นเลขาธิการหลังเปิดหน้า เพื่อให้ธุรการอยู่หน่วยเดียวกับแฟ้ม)

    await test.step('WIT1139 · กด "ลงนามคำสั่ง คบ.16" → ล็อกฉบับลงนาม', async () => {
      await page.goto(TERM_URL)
      await switchRole(page, 'secretary')
      await expect(page.getByText(/รอเลขาธิการ ป\.ป\.ท\.\s*ลงนาม/).first()).toBeVisible()
      await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')
      const c = await readCase(page, CASE_NO)
      const kb16 = c?.kb16 as Rec
      expect(kb16.signedAt).toBeTruthy()
      expect(kb16.locked).toBe(true)
      expect(c?.closedAt).toBeFalsy() // แฟ้มยังไม่ปิด ต้องทำ คบ.17 และรอพ้นกรอบอุทธรณ์
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [16] })
      await snap(page, ['node:11D:WIT1173', 'edge:11D:E1139'], { label: 'เลขาธิการลงนาม คบ.16 แล้ว ชุดนำส่งรอธุรการสำนักงานเลขาธิการ', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'secretary_receiver' })
    })

    await test.step('WIT1173 · ธุรการสำนักงานเลขาธิการ → ธุรการสำนัก/กอง → เจ้าของสำนวน', async () => {
      await termDownLeg(page, CASE_NO)
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toBeFalsy()
      await snap(page, ['node:11D:WIT1140', 'edge:11D:E1173'], { label: 'คบ.16 ลงนามแล้วถึงเจ้าของสำนวน รอบันทึกวันหยุดปฏิบัติจริง', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1140 · บันทึกวันหยุดปฏิบัติจริง (แยกจากวันที่ออกคำสั่ง/วันที่มีผล)', async () => {
      await page.goto(TERM_URL)
      await expect(page.getByText(/ลงนามแล้วเมื่อ .*ล็อกฉบับลงนาม/)).toBeVisible()
      await page.locator('label:has(span:text-is("วันหยุดปฏิบัติจริง")) input').fill(todayIso())
      await page.getByRole('button', { name: 'บันทึกวันหยุดปฏิบัติจริง', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกวันหยุดปฏิบัติจริงแล้ว')
      expect(((await readCase(page, CASE_NO))?.kb16 as Rec).operationStoppedAt).toBe(todayIso())
      await snap(page, ['node:11D:WIT1141', 'edge:11D:E1140'], { label: 'บันทึกวันหยุดปฏิบัติจริงแล้ว รอจัดทำ คบ.17', route: TERM_URL, role: 'officer' })
    })
  })

  test('11D-4 · คบ.17: เจ้าหน้าที่ร่าง+ส่งลงนาม → ธุรการ → เลขาธิการลงนาม → ธุรการ → ออกเลข → ฉบับส่ง → บันทึกวันรับ → นับ 30 วัน', async ({ page }) => {
    test.setTimeout(300_000)
    await seedMockState(page, 'Case 1.18', 'officer', withoutKb17)

    await test.step('WIT1141 · ใส่ชื่อไฟล์ กด "เปิดแฟ้มคดี" → ร่าง คบ.17 เข้าแฟ้ม', async () => {
      await page.goto(TERM_URL)
      await page.getByPlaceholder('ชื่อไฟล์หนังสือ').fill('คบ17_แจ้งคำสั่งยุติ.pdf')
      await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
      await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).status).toBe('draft')
      await snap(page, ['node:11D:WIT1174', 'edge:11D:E1141'], { label: 'ร่าง คบ.17 เข้าแฟ้มแล้ว รอส่งให้ลงนาม', role: 'officer' })
    })

    await test.step('WIT1141 + WIT1174 · ที่แถว คบ.17 กด "ส่งให้ลงนาม" → ธุรการสองจุดขาไป', async () => {
      await formRow(page, 'คบ.17').getByRole('button', { name: 'ส่งให้ลงนาม' }).click()
      await confirmDialog(page, 'ส่งให้ลงนาม')
      const c = await readCase(page, CASE_NO)
      expect((c?.kb17 as Rec).status).toBe('submitted')
      expect(c?.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'up', forms: [17] })
      await termUpLeg(page, CASE_NO)
      await snap(page, ['node:11D:WIT1175', 'edge:11D:E1174'], { label: 'คบ.17 ถึงเลขาธิการแล้ว รอลงนาม', route: TERM_URL, role: 'secretary' })
    })

    await test.step('WIT1175 · เลขาธิการกด "ลงนาม คบ.17" (ล็อกฉบับลงนาม)', async () => {
      await page.goto(TERM_URL)
      await page.getByRole('button', { name: 'ลงนาม คบ.17' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.17')
      const kb17 = (await readCase(page, CASE_NO))?.kb17 as Rec
      expect(kb17.signedAt).toBeTruthy()
      expect(kb17.locked).toBe(true)
      await snap(page, ['node:11D:WIT1176', 'edge:11D:E1175'], { label: 'เลขาธิการลงนาม คบ.17 แล้ว ชุดนำส่งรอธุรการขากลับ', route: `/saraban/${encodeURIComponent(CASE_NO)}`, role: 'secretary_receiver' })
    })

    await test.step('WIT1176 · ธุรการขากลับ ถึงเจ้าของสำนวน', async () => {
      await termDownLeg(page, CASE_NO)
      expect((await readCase(page, CASE_NO))?.sarabanDispatch).toBeFalsy()
      await snap(page, ['node:11D:WIT1142', 'edge:11D:E1176'], { label: 'คบ.17 ลงนามแล้วถึงเจ้าของสำนวน รอออกเลขและนำส่ง', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1142 · กรอกเลขที่หนังสือสารบรรณเดิม แล้ว "ออกเลขและนำส่ง คบ.17" (ปุ่มปิดจนกว่าจะกรอกเลข)', async () => {
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' })).toBeDisabled()
      await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('สลข.999/2569')
      await page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ออกเลขและนำส่ง คบ.17')
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).registryNo).toBe('สลข.999/2569')
      await snap(page, ['node:11D:WIT1143', 'edge:11D:E1142'], { label: 'ออกเลขและนำส่ง คบ.17 แล้ว รออัปโหลดฉบับส่งเข้าแฟ้ม', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1143 · อัปโหลดฉบับส่งเข้าแฟ้ม', async () => {
      await page.getByRole('button', { name: 'อัปโหลดฉบับส่งเข้าแฟ้ม' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('อัปโหลด คบ.17 ฉบับส่งเข้ากับแฟ้มแล้ว')
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).sentDocumentName).toBeTruthy()
      await snap(page, ['node:11D:WIT1144', 'edge:11D:E1143'], { label: 'อัปโหลดฉบับส่งแล้ว รอพยานรับ คบ.17 (ยังไม่มีวันรับจริง)', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1144 · ยังไม่มีวันรับจริง — ยังไม่นับกรอบอุทธรณ์ ปิดงานไม่ได้', async () => {
      await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์')).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      await snap(page, ['node:11D:WIT1145', 'edge:11D:E1144'], { label: 'พยานรับ คบ.17 แล้ว รอบันทึกวันที่รับจริง (ยังไม่เริ่มนับอุทธรณ์)', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1145 + WIT1146 · บันทึกวันที่พยานได้รับ เริ่มนับ 30 วัน — ยังปิดงานไม่ได้', async () => {
      await page.getByLabel('วันที่พยานได้รับจริง').fill(isoDaysFromToday(-5))
      await page.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')
      await expect(page.getByText(/ครบกำหนดอุทธรณ์.*\(เหลือ \d+ วัน\)/)).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      const c = await readCase(page, CASE_NO)
      expect((c?.kb17 as Rec).deliveredAt).toBeTruthy()
      expect(c?.stage).not.toBe('terminated')
      await snap(page, ['node:11D:WIT1146', 'edge:11D:E1145'], { label: 'บันทึกวันที่พยานรับแล้ว เริ่มนับ 30 วัน รอดูว่ามีอุทธรณ์หรือไม่', route: TERM_URL, role: 'officer' })
    })
  })

  test('11D-5 · ส่ง คบ.17 ไม่ถึง 2 ครั้ง → บันทึกวันที่ถือว่าได้รับตามระเบียบ → เริ่มนับอุทธรณ์ (ยังปิดงานไม่ได้)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.18', 'officer', kb17AwaitingDelivery())
    await page.goto(TERM_URL)
    await snap(page, ['node:11D:WIT1177', 'edge:11D:E1177'], { label: 'นำส่ง คบ.17 แล้วแต่ส่งไม่ถึง รอบันทึกผลการส่งไม่สำเร็จ (ใช้ state Case 1.18 ตัด deliveredAt)', route: TERM_URL, role: 'officer' })
    await test.step('WIT1144 · นำส่งแล้วแต่ยังไม่มีวันรับจริง และยังไม่มีปุ่ม "ถือว่าได้รับตามระเบียบ"', async () => {
      await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์')).toBeVisible()
      await expect(page.getByRole('button', { name: 'บันทึกวันที่ถือว่าได้รับตามระเบียบ' })).toHaveCount(0)
    })

    await test.step('WIT1177 · บันทึกผลการส่งไม่สำเร็จ ครั้งที่ 1 และ 2 (เก็บหลักฐานทุกครั้ง)', async () => {
      const note = page.getByPlaceholder('หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)')
      await note.fill('ไปรษณีย์ตีกลับ ไม่มีผู้รับ')
      await page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('บันทึกผลการส่งไม่สำเร็จแล้ว')
      await note.fill('ไปพบตัวไม่ได้ ปิดบ้าน')
      await page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ', exact: true }).click()
      await expect.poll(async () => (((await readCase(page, CASE_NO))?.kb17 as Rec).deliveryAttempts as unknown[]).length).toBe(2)
      expect(((await readCase(page, CASE_NO))?.kb17 as Rec).deliveredAt).toBeFalsy()
      await snap(page, ['node:11D:WIT1178', 'edge:11D:E1178'], { label: 'บันทึกผลส่งไม่สำเร็จครบ 2 ครั้งแล้ว รอบันทึกวันที่ถือว่าได้รับตามระเบียบ', route: TERM_URL, role: 'officer' })
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
    })

    await test.step('WIT1178 · บันทึกวันที่ถือว่าได้รับตามระเบียบ → เริ่มนับกรอบอุทธรณ์', async () => {
      await page.getByRole('button', { name: 'บันทึกวันที่ถือว่าได้รับตามระเบียบ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')
      const kb17 = (await readCase(page, CASE_NO))?.kb17 as Rec
      expect(kb17.deliveryMethod).toBe('deemed')
      expect(kb17.deliveredAt).toBeTruthy()
      await expect(page.getByText(/\(ถือว่าได้รับตามระเบียบ\)/)).toBeVisible()
      await snap(page, ['edge:11D:E1179'], { label: 'บันทึกวันที่ถือว่าได้รับตามระเบียบแล้ว เริ่มนับกรอบอุทธรณ์', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1145 → WIT1146 · เพิ่งเริ่มนับ 30 วัน ปิดงานไม่ได้ แฟ้มยังไม่ยุติ', async () => {
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      const c = await readCase(page, CASE_NO)
      expect(c?.closedAt).toBeFalsy()
      expect(c?.stage).not.toBe('terminated')
    })
  })

  test('11D-6 · มีอุทธรณ์ภายใน 30 วัน → รับคำอุทธรณ์ผูกกับ คบ.17 เดิม (ไม่สร้าง คบ.1 ใหม่) → ลิงก์ไปหน้าอุทธรณ์', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.18', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1146 · ยังอยู่ในกรอบ — เห็นฟอร์มรับอุทธรณ์และปุ่มปิดงานปิดอยู่', async () => {
      await expect(page.getByText(/ครบกำหนดอุทธรณ์.*\(เหลือ \d+ วัน\)/)).toBeVisible()
      await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeDisabled()
      await snap(page, ['node:11D:WIT1147', 'edge:11D:E1146'], { label: 'อยู่ในกรอบ 30 วัน เห็นฟอร์มรับคำอุทธรณ์ รอพยานยื่นอุทธรณ์', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1147 · กรอกฟอร์มรับอุทธรณ์ กด "มีอุทธรณ์ภายในกำหนด" และ "ยืนยัน"', async () => {
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
      expect(c?.no).toBe(CASE_NO)
      expect(c?.closedAt).toBeFalsy()
    })

    await test.step('WIT1147 · ข้อความรับคำอุทธรณ์และลิงก์ "ไปหน้าอุทธรณ์"', async () => {
      await expect(page.getByText(/รับคำอุทธรณ์แล้ว ผูกกับ คบ\.17 เลขที่/)).toBeVisible()
      await page.getByRole('link', { name: 'ไปหน้าอุทธรณ์' }).click()
      await expect(page).toHaveURL(/\/appeal/)
      await snap(page, ['node:11D:WIT1179', 'edge:11D:E1148', 'overview:11D>09B'], { label: 'รับคำอุทธรณ์ คบ.17 แล้ว เปิดหน้าอุทธรณ์ (แท็บ 09B) รอมติ', role: 'officer' })
    })
  })

  test('11D-7 · พยานรับ คบ.17 เกิน 30 วันและไม่มีอุทธรณ์ → ปิดงาน → แฟ้มล็อก', async ({ page }) => {
    test.setTimeout(150_000)
    await seedMockState(page, 'Case 1.19', 'officer')
    await page.goto(TERM_URL)

    await test.step('WIT1146 · พ้นกรอบ 30 วัน ปุ่มปิดงานเปิดใช้', async () => {
      await expect(page.getByText(/พ้นกำหนดแล้ว/)).toBeVisible()
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeEnabled()
      await snap(page, ['node:11D:WIT1148', 'edge:11D:E1147'], { label: 'พ้นกรอบอุทธรณ์ 30 วันไม่มีอุทธรณ์ ปุ่มปิดงานเปิดใช้', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1148 · ปิดงาน → stage terminated มี closedAt และ คบ.16 ถูกล็อก', async () => {
      await page.getByRole('button', { name: CLOSE_BUTTON }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครองและล็อกเอกสารลงนามแล้ว')
      const c = await readCase(page, CASE_NO)
      expect(c?.stage).toBe('terminated')
      expect(c?.closedAt).toBeTruthy()
      expect((c?.kb16 as Rec).locked).toBe(true)
      await expect(page.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/)).toBeVisible()
    })

    await test.step('หลังปิดงาน · ไม่มีปุ่มปิดงานซ้ำ', async () => {
      await page.goto(TERM_URL)
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toHaveCount(0)
      await expectStage(page, 'terminated')
    })
  })

  test('11D-8 · มติอุทธรณ์กลับมา "ยกคำร้อง" → กลับมาปิดงานที่ /termination ได้ (WIT1179 → WIT1148)', async ({ page }) => {
    test.setTimeout(150_000)
    // จำลองผลจากแท็บ 09B: อุทธรณ์ คบ.17 ถูกยกคำร้อง (recordAppealResolution ตั้ง stage = terminated)
    await seedMockState(page, 'Case 1.18', 'officer', {
      stage: 'terminated',
      appealAgainst: 'kb17',
      appealFiledAt: '01/10/2569 09:00',
      appealResolution: { resolutionNo: 'อ.1/2569', outcome: 'uphold', note: 'ยกคำร้อง', resolvedAt: '10/10/2569 10:00', against: 'kb17' },
    })
    await page.goto(TERM_URL)

    await test.step('WIT1179 · มีมติแล้ว ปุ่มปิดงานเปิดใช้ (ไม่ค้าง "รอผลวินิจฉัย")', async () => {
      await expect(page.getByRole('button', { name: CLOSE_BUTTON })).toBeEnabled()
      await snap(page, ['edge:11D:E1149'], { label: 'มติ 09B ยกคำร้อง (state จำลองด้วย seed override ไม่ได้เดินแท็บ 09B) กลับมารอปิดงาน', route: TERM_URL, role: 'officer' })
    })

    await test.step('WIT1148 · ปิดงาน', async () => {

      await page.getByRole('button', { name: CLOSE_BUTTON }).click()
      await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครองและล็อกเอกสารลงนามแล้ว')
      expect((await readCase(page, CASE_NO))?.closedAt).toBeTruthy()
    })
  })

  test('11D-9 · มติอุทธรณ์กลับมา "เพิกถอน" → แฟ้มกลับสู่การดำเนินงานคุ้มครอง ไม่ถูกปิดงานอัตโนมัติ (WIT1179 → WIT1180)', async ({ page }) => {
    test.setTimeout(120_000)
    // จำลองผลจากแท็บ 09B: เพิกถอนคำสั่งยุติ (recordAppealResolution ตั้ง stage = method_operation)
    await seedMockState(page, 'Case 1.18', 'officer', {
      stage: 'method_operation',
      appealAgainst: 'kb17',
      appealFiledAt: '01/10/2569 09:00',
      appealResolution: { resolutionNo: 'อ.2/2569', outcome: 'overturn', note: 'เพิกถอนคำสั่งยุติ', resolvedAt: '10/10/2569 10:00', against: 'kb17' },
    })
    await page.goto(TERM_URL)

    await test.step('WIT1180 · stage = method_operation ไม่มี closedAt และหน้า /termination ยังเปิดได้ (partial: ไม่มีข้อความเฉพาะกรณีเพิกถอน)', async () => {
      await expectStage(page, 'method_operation')
      expect((await readCase(page, CASE_NO))?.closedAt).toBeFalsy()
      await expect(page.getByText(/ยุติการคุ้มครองและปิดงาน — /).first()).toBeVisible()
      await snap(page, ['node:11D:WIT1180', 'edge:11D:E1180'], { label: 'มติ 09B เพิกถอนคำสั่งยุติ (state จำลองด้วย seed override) แฟ้มกลับสู่การคุ้มครอง ไม่ปิดงาน', route: TERM_URL, role: 'officer' })
    })
  })
})
