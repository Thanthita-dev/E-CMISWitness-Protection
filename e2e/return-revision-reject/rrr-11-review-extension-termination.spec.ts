import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { NO, passKb14Down, passKb14Up, reqOf, openDemoCase, signKb6AsCurrentRole } from '../helpers/extensionDocs'
import { signKb15Chain, termDownLeg, termUpLeg } from '../helpers/termination'
import { CASE_NO, confirmDialog, formRow } from '../journeys/journey-helpers'

/**
 * RRR-11 · แท็บ 10/11 — ทบทวน · ขยายเวลา · เปลี่ยนวิธี · ยุติ: ทุกจุด Return / Revision / Reject (full loop)
 *
 * รูปแบบที่ตรวจทุกเส้น: ส่งคืน/ไม่อนุมัติ → บันทึกผู้ทำ/ชั้น/เหตุผล → ฉบับเดิมถูกเก็บ (ไม่แก้ทับ)
 *   → เจ้าหน้าที่แก้/เสนอใหม่ → กลับไปถึงผู้ตรวจชั้นที่ถูกต้อง → ผ่านจนจบ
 *
 * 11B · คบ.14 ขยายระยะเวลา (WIT1112-WIT1123, WIT1149/WIT1150)
 *   RRR-11B-1  ส่งคืน 2 รอบ (ผบช.ชั้นต้น แล้ว ผอ.กอง) → เวอร์ชัน 3 เก็บฉบับเดิม 2 ฉบับ + เหตุผล → ผ่านครบ 4 ชั้น → เลขาธิการอนุมัติ (WIT1118/1119/1120/1121/1122)
 *   RRR-11B-2  เลขาธิการส่งคืนแก้ไข (ธุรการขากลับ) → ส่งซ้ำไม่ได้ระหว่างนำส่ง → กลับเข้า ผบช.ชั้นต้น (WIT1119)
 *   RRR-11B-3  เลขาธิการไม่อนุมัติ (ต้องมีเหตุผล) → คงคำสั่งเดิม → ขอขยายครั้งใหม่ได้โดยฉบับที่ไม่อนุมัติยังอยู่ (WIT1123)
 *   RRR-11B-4  ครบเพดาน 6 เดือน → ปิดทางจัดทำ คบ.14 เพิ่ม ส่งไปแขนงข้อ 14 (WIT1149/WIT1150)
 *
 * 11C/11D · คบ.15 เรื่องยุติ (WIT1129-WIT1137, WIT1161-WIT1163)
 *   RRR-11C-1  ส่งคืน 3 ชั้น (ผอ. → รองเลขาธิการ → เลขาธิการ) ได้ฉบับที่ 4 เก็บฉบับเดิม 3 ฉบับ → ผ่านจนเลขาธิการลงนาม (WIT1133/1163/1162)
 *   RRR-11D-3  เลขาธิการลงนาม คบ.15 แล้วไม่อนุมัติให้ยุติ (ต้องมีเหตุผล) → ไม่มี คบ.16 คุ้มครองต่อภายใต้คำสั่งเดิม → ผลกลับหน่วยผ่านธุรการ (WIT1136/1137)
 *
 * หมายเหตุ flow ปัจจุบัน: คบ.14 ชั้น ผบช.ชั้นต้น/ผอ. อยู่ในหน่วยเดียวกันจึงส่งคืนโดยไม่ผ่านธุรการ ส่วนรองเลขาธิการ/เลขาธิการส่งคืน
 *   และผลพิจารณาของเลขาธิการ (อนุมัติ/ไม่อนุมัติ) ลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย · ทุกชั้นต้องลงนาม คบ.6 ฉบับขยายเวลาก่อนส่งต่อ
 *   (ส่งคืนไม่ต้องลงนาม ยกเว้นเลขาธิการที่ลงนามก่อนทุกการตัดสินใจ) · การส่ง คบ.14/คบ.15 ทำที่ footer/แถวในแฟ้ม ส่วนหน้าแบบฟอร์มมีแค่ "บันทึก"
 *
 * ช่องว่างของแอป (test.fixme): 11A ทบทวนผล/เปลี่ยนวิธี (WIT1104-1110) · คบ.16 · คบ.17 · รายงานแท็บ 10 ส่งคืน · เสนอยุติใหม่หลังไม่อนุมัติ
 */

// ============================================================================
// ตัวช่วยของ 11B (คบ.14)
// ============================================================================
type Rec = Record<string, unknown>

const EXT_URL = `/protection-extension/${encodeURIComponent(NO)}`
const footer = (page: Page) => page.getByTestId('kb14-forward-footer')

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** WIT1114/WIT1115 — บันทึกแบบ คบ.14 พร้อมเหตุผล แล้วส่งให้ผู้บังคับบัญชาชั้นต้นที่ footer (ใช้ได้ทั้งฉบับแรกและฉบับแก้ไขหลังส่งคืน) */
async function submitKb14(page: Page, reason: string) {
  await switchRole(page, 'officer')
  await page.goto(`/form/14?caseNo=${NO}`)
  await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill(reason)
  await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
  await expect(page).toHaveURL(`/dossier/${encodeURIComponent(NO)}`)
  await footer(page).getByRole('button', { name: 'ส่งให้ผู้บังคับบัญชาชั้นต้น' }).click()
  await confirmDialog(page, 'ยืนยันส่ง')
}

/** แต่ละชั้นลงนาม คบ.6 ก่อน แล้วกดส่งต่อชั้นถัดไป (ผอ. → รองเลขาธิการ ข้ามหน่วยจึงต้องผ่านธุรการ) */
async function forwardAs(page: Page, role: 'supervisor' | 'director' | 'deputy_secretary') {
  const [next, nextStage] = {
    supervisor: ['ผอ.กอง', 'director'],
    director: ['รองเลขาธิการ', 'deputy_secretary'],
    deputy_secretary: ['เลขาธิการ', 'secretary'],
  }[role]
  await switchRole(page, role)
  await page.goto(EXT_URL)
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe(role)
  await page.goto(EXT_URL)
  const forward = footer(page).getByTestId('kb14-forward-button')
  await expect(forward).toBeEnabled()
  await forward.click()
  await confirmDialog(page, `ยืนยันส่ง${next}`)
  await expect.poll(async () => (await reqOf(page)).approvalStage).toBe(nextStage)
  if (role === 'director') await passKb14Up(page)
}

/** ชั้นผู้ตรวจ (supervisor/director/deputy_secretary) กรอกเหตุผลแล้วส่งคืนแก้ไข — ส่งคืนไม่ต้องลงนาม คบ.6 */
async function returnKb14As(page: Page, role: 'supervisor' | 'director' | 'deputy_secretary', note: string) {
  await switchRole(page, role)
  await page.goto(EXT_URL)
  await footer(page).getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill(note)
  await footer(page).getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
  await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.14 เวอร์ชันใหม่')
  await expect.poll(async () => (await reqOf(page)).status).toBe('returned')
}

/** พาคำขอขึ้นถึงชั้นเลขาธิการ (ผบช.ชั้นต้น → ผอ. → รองเลขาธิการ) แล้วเลขาธิการลงนาม คบ.6 ของชั้นตน */
async function bringToSecretary(page: Page) {
  await forwardAs(page, 'supervisor')
  await forwardAs(page, 'director')
  await forwardAs(page, 'deputy_secretary')
  await switchRole(page, 'secretary')
  await signKb6AsCurrentRole(page)
  await expect.poll(async () => (await reqOf(page)).status).toBe('pending')
  await page.goto(EXT_URL)
}

test.describe('RRR-11B · คบ.14 ขยายระยะเวลา — ส่งคืน / แก้ไข / ไม่อนุมัติ', () => {
  test('RRR-11B-1 · WIT1118→1119→1120→1122: ส่งคืน 2 รอบ (ผบช.ชั้นต้น, ผอ.กอง) → เวอร์ชัน 3 เก็บฉบับเดิม → ผ่านครบ 4 ชั้น → เลขาธิการอนุมัติ', async ({ page }) => {
    test.setTimeout(420_000)
    const R1 = 'ภัยคุกคามยังไม่หมดไป ขอขยายเวลาคุ้มครอง (ฉบับที่ 1)'
    const R2 = 'เพิ่มรายละเอียดการเฝ้าติดตามพยานใกล้ที่พัก (ฉบับที่ 2)'
    const R3 = 'แนบผลประเมินความเสี่ยงล่าสุดและหลักฐานการเฝ้าระวัง (ฉบับที่ 3)'
    const N1 = 'เหตุผลขอขยายยังไม่ชัดเจน'
    const N2 = 'ยังไม่ระบุผลประเมินความเสี่ยงล่าสุด'

    await openDemoCase(page)
    const original = (await readCase(page, NO)) as Rec

    await test.step('WIT1115 · เจ้าหน้าที่ส่ง คบ.14 ฉบับที่ 1 ถึงผู้บังคับบัญชาชั้นต้น', async () => {
      await submitKb14(page, R1)
      await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
      const req = await reqOf(page)
      expect(req.version).toBe(1)
      expect(req.approvalStage).toBe('supervisor')
      expect(req.previousVersions).toHaveLength(0)
    })

    await test.step('WIT1118 · ผบช.ชั้นต้นส่งคืนแก้ไข (รอบ 1) — บันทึกผู้ส่งคืน เหตุผล และลำดับ ไม่ผ่านธุรการ (อยู่ในหน่วยเดียวกัน)', async () => {
      await returnKb14As(page, 'supervisor', N1)
      const c = (await readCase(page, NO)) as Rec
      const req = await reqOf(page)
      expect(req.approvalStage).toBe('supervisor') // ส่งคืนแล้วเริ่มลำดับชั้นใหม่จากผู้ตรวจชั้นต้น
      expect(req.reviewNote).toBe(N1)
      expect(req.reviewedBy).toBeTruthy()
      expect(req.reviewedAt).toBeTruthy()
      expect(req.approvalHistory).toEqual([expect.objectContaining({ role: 'supervisor', endorsed: false, note: N1 })])
      expect(c.sarabanDispatch).toBeFalsy()
      expect(c.status).toBe('ส่งคืนแก้ไข คบ.14')
      expect(String(c.protectionEndAt)).toBe(String(original.protectionEndAt)) // คำสั่งเดิมไม่ขยับ
    })

    await test.step('WIT1119 · เจ้าหน้าที่เห็นเหตุผลที่ส่งคืน แล้วจัดทำเวอร์ชัน 2 — ฉบับเดิมถูกเก็บพร้อมเหตุผลส่งคืน', async () => {
      await switchRole(page, 'officer')
      await page.goto(EXT_URL)
      await expect(page.getByText(`สถานะ: ส่งคืนแก้ไข · ${N1}`)).toBeVisible()
      await submitKb14(page, R2)
      await expect.poll(async () => (await reqOf(page)).version).toBe(2)
      const req = await reqOf(page)
      expect(req.status).toBe('submitted')
      expect(req.approvalStage).toBe('supervisor')
      expect(req.reviewNote).toBeFalsy() // เหตุผลเดิมย้ายไปอยู่ในฉบับที่เก็บไว้
      expect(req.approvalHistory).toEqual([])
      expect(req.previousVersions).toEqual([expect.objectContaining({ version: 1, reason: R1, returnNote: N1 })])
      await page.goto(EXT_URL)
      await expect(page.getByText('เก็บฉบับเดิมไว้ 1 ฉบับ')).toBeVisible()
    })

    await test.step('WIT1120 + WIT1118 · ผบช.ชั้นต้นเห็นชอบ ส่ง ผอ.กอง → ผอ.กองส่งคืนแก้ไข (รอบ 2) ล้างลายมือชื่อ คบ.6', async () => {
      await forwardAs(page, 'supervisor')
      await returnKb14As(page, 'director', N2)
      const req = await reqOf(page)
      expect(req.approvalStage).toBe('supervisor') // กลับไปเริ่มที่ผู้ตรวจชั้นต้นใหม่ ไม่ข้ามชั้น
      expect(req.reviewNote).toBe(N2)
      expect(req.approvalHistory).toEqual([
        expect.objectContaining({ role: 'supervisor', endorsed: true }),
        expect.objectContaining({ role: 'director', endorsed: false, note: N2 }),
      ])
      expect(Object.keys(req.kb6Signatures || {})).toHaveLength(0)
    })

    await test.step('WIT1119 · เวอร์ชัน 3 — เก็บฉบับเดิมครบ 2 ฉบับ พร้อมเหตุผลและประวัติชั้นของแต่ละฉบับ', async () => {
      await submitKb14(page, R3)
      await expect.poll(async () => (await reqOf(page)).version).toBe(3)
      const req = await reqOf(page)
      expect(req.status).toBe('submitted')
      expect(req.reason).toBe(R3)
      expect(req.previousVersions).toHaveLength(2)
      expect(req.previousVersions[0]).toMatchObject({ version: 1, reason: R1, returnNote: N1 })
      expect(req.previousVersions[1]).toMatchObject({ version: 2, reason: R2, returnNote: N2 })
      expect(req.previousVersions[1].approvalHistory).toHaveLength(2)
      // ยังเป็นคำขอเดียวกัน (id เดิม) ไม่สร้างคำขอใหม่
      expect(((await readCase(page, NO)) as Rec).extensionRequests).toHaveLength(1)
    })

    await test.step('WIT1120 → WIT1121 · ผ่านผู้บังคับบัญชาชั้นต้น → ผอ.(ธุรการขาไป) → รองเลขาธิการ → เลขาธิการอนุมัติ', async () => {
      await forwardAs(page, 'supervisor')
      await forwardAs(page, 'director')
      await forwardAs(page, 'deputy_secretary')
      await switchRole(page, 'secretary')
      await signKb6AsCurrentRole(page)
      await expect.poll(async () => (await reqOf(page)).status).toBe('pending')
      await page.goto(EXT_URL)
      await footer(page).getByTestId('kb14-approve-button').click()
      await confirmDialog(page, 'ยืนยันอนุมัติ')
      await expect.poll(async () => (await reqOf(page)).status).toBe('approved')
      await passKb14Down(page)
    })

    await test.step('WIT1122 · ล็อกฉบับลงนาม · ประวัติ 4 ชั้นครบ · ฉบับเก่า 2 ฉบับยังอยู่ · เพิ่ม Phase ใหม่ ไม่แก้ทับ', async () => {
      const c = (await readCase(page, NO)) as Rec
      const req = await reqOf(page)
      expect(req.locked).toBe(true)
      expect(req.decidedBy).toBeTruthy()
      expect(req.approvalHistory.map((h: Rec) => [h.role, h.endorsed])).toEqual([
        ['supervisor', true],
        ['director', true],
        ['deputy_secretary', true],
        ['secretary', true],
      ])
      expect(req.previousVersions).toHaveLength(2)
      expect(new Date(String(c.protectionEndAt)).getTime()).toBeGreaterThan(new Date(String(original.protectionEndAt)).getTime())
      expect((c.episode as { phases: unknown[] }).phases.length).toBeGreaterThanOrEqual(2)
    })
  })

  test('RRR-11B-2 · WIT1119: เลขาธิการส่งคืนแก้ไข → ธุรการขากลับ → ส่งซ้ำไม่ได้ระหว่างนำส่ง → เวอร์ชัน 2 กลับเข้า ผบช.ชั้นต้น', async ({ page }) => {
    test.setTimeout(360_000)
    const N = 'ช่วงวันที่ขอขยายไม่สอดคล้องกับผลประเมินล่าสุด'
    await openDemoCase(page)
    await submitKb14(page, 'ขอขยายเวลาเพราะภัยยังอยู่')
    await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
    await bringToSecretary(page)

    await test.step('เลขาธิการ (ลงนาม คบ.6 แล้ว) ส่งคืนแก้ไข — ต้องใส่เหตุผล', async () => {
      await footer(page).getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุเหตุผลที่ส่งคืน')
      expect((await reqOf(page)).status).toBe('pending')

      await footer(page).getByPlaceholder('ความเห็นประกอบคำสั่ง').fill(N)
      await footer(page).getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
      await confirmDialog(page, 'ยืนยันส่งคืน')
      await expect.poll(async () => (await reqOf(page)).status).toBe('returned')
    })

    await test.step('บันทึกชั้น/เหตุผล · เริ่มลำดับใหม่ที่ผบช.ชั้นต้น · ลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย', async () => {
      const c = (await readCase(page, NO)) as Rec
      const req = await reqOf(page)
      expect(req.reviewNote).toBe(N)
      expect(req.approvalStage).toBe('supervisor')
      expect(req.approvalHistory.at(-1)).toMatchObject({ role: 'secretary', endorsed: false, note: N })
      expect(req.decidedAt).toBeFalsy() // ส่งคืนไม่ใช่การตัดสิน
      expect(req.locked).toBeFalsy()
      expect(Object.keys(req.kb6Signatures || {})).toHaveLength(0)
      expect(c.sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'down' })
    })

    await test.step('ระหว่างชุดนำส่งขากลับค้าง — เจ้าหน้าที่ยังส่งเวอร์ชันใหม่ไม่ได้', async () => {
      await switchRole(page, 'officer')
      await page.goto(`/dossier/${encodeURIComponent(NO)}`)
      await expect(footer(page).getByTestId('kb14-in-transit-note')).toBeVisible()
      await expect(footer(page).getByTestId('kb14-submit-button')).toHaveCount(0)
    })

    await test.step('ธุรการนำส่งครบ → เจ้าหน้าที่จัดทำเวอร์ชัน 2 (เก็บฉบับเดิม) → กลับถึงผบช.ชั้นต้นเท่านั้น', async () => {
      await passKb14Down(page)
      expect(((await readCase(page, NO)) as Rec).sarabanDispatch).toBeFalsy()
      await submitKb14(page, 'ปรับช่วงวันที่ให้สอดคล้องกับผลประเมินล่าสุด')
      await expect.poll(async () => (await reqOf(page)).version).toBe(2)
      const req = await reqOf(page)
      expect(req.status).toBe('submitted')
      expect(req.approvalStage).toBe('supervisor')
      expect(req.previousVersions).toEqual([expect.objectContaining({ version: 1, returnNote: N })])

      // ผอ.กองยังกดส่งต่อแทนไม่ได้ — ต้องรอผบช.ชั้นต้นก่อน
      await switchRole(page, 'director')
      await page.goto(EXT_URL)
      await expect(footer(page).getByTestId('kb14-forward-button')).toHaveCount(0)
      await expect(footer(page).getByRole('button', { name: 'ส่งคืนแก้ไข' })).toHaveCount(0)
    })
  })

  test('RRR-11B-3 · WIT1121→1123: เลขาธิการไม่อนุมัติ (ต้องมีเหตุผล) → คงคำสั่งเดิม → ขอขยายครั้งใหม่ได้ ฉบับที่ไม่อนุมัติยังอยู่', async ({ page }) => {
    test.setTimeout(420_000)
    const REJECT = 'ไม่มีเหตุจำเป็นเพียงพอที่จะขยายเวลา'
    await openDemoCase(page)
    const original = (await readCase(page, NO)) as Rec
    await submitKb14(page, 'ขอขยายเวลาต่ออีก 1 เดือน')
    await expect.poll(async () => (await reqOf(page)).status).toBe('submitted')
    await bringToSecretary(page)

    await test.step('WIT1123 · กด "ไม่อนุมัติ" โดยไม่ใส่เหตุผล — ระบบเตือนและสถานะไม่เปลี่ยน', async () => {
      await footer(page).getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
      expect((await reqOf(page)).status).toBe('pending')
    })

    await test.step('WIT1123 · ใส่เหตุผลแล้วไม่อนุมัติ — บันทึกผู้ตัดสิน/เหตุผล คงคำสั่งเดิม ไม่เพิ่ม Phase ไม่ล็อกเป็นอนุมัติ', async () => {
      await footer(page).getByPlaceholder('ความเห็นประกอบคำสั่ง').fill(REJECT)
      await footer(page).getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await confirmDialog(page, 'ยืนยันไม่อนุมัติ', 'คงคำสั่งเดิมถึงวันสิ้นสุด')
      await expect.poll(async () => (await reqOf(page)).status).toBe('rejected')
      const c = (await readCase(page, NO)) as Rec
      const req = await reqOf(page)
      expect(req.decisionNote).toBe(REJECT)
      expect(req.decidedBy).toBeTruthy()
      expect(req.decidedAt).toBeTruthy()
      expect(req.locked).toBeFalsy()
      expect(req.approvalHistory.at(-1)).toMatchObject({ role: 'secretary', endorsed: false, note: REJECT })
      expect(req.kb6Signatures.secretary).toBeTruthy() // ลายมือชื่อเลขาธิการคงไว้แม้ไม่อนุมัติ
      expect(String(c.protectionEndAt)).toBe(String(original.protectionEndAt))
      expect((c.episode as { phases: unknown[] }).phases).toHaveLength((original.episode as { phases: unknown[] }).phases.length)
      expect(c.status).toContain('ไม่อนุมัติ') // มี sarabanDispatch ต่อท้าย status
      expect(c.sarabanDispatch).toMatchObject({ flow: 'kb14', direction: 'down' })
      await passKb14Down(page)
    })

    await test.step('เจ้าของสำนวนเห็นผลไม่อนุมัติพร้อมเหตุผล และมีทางไปจัดทำเรื่องยุติ (11C)', async () => {
      await switchRole(page, 'officer')
      await page.goto(EXT_URL)
      await expect(page.getByRole('status', { name: 'ไม่อนุมัติขยายระยะเวลาคุ้มครอง' })).toContainText(REJECT)
      await expect(page.getByRole('link', { name: /หน้าจัดทำเรื่องยุติ \(คบ\.15\)/ })).toBeVisible()
    })

    await test.step('ขอขยายครั้งใหม่หลังไม่อนุมัติ — บันทึกที่ฟอร์ม แล้วส่งตรวจที่แถว คบ.14 ในแฟ้ม เป็นคำขอใหม่ ฉบับที่ไม่อนุมัติไม่ถูกแก้ทับ', async () => {
      // หลังไม่อนุมัติไม่มีชุด คบ.3/คบ.6 ที่ใช้งานอยู่ footer จึงไม่ขึ้น — ใช้ปุ่ม "ส่งตรวจ" ที่แถว คบ.14 (canSubmitKb14 รองรับสถานะ rejected)
      await page.goto(`/form/14?caseNo=${NO}`)
      await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ยื่นขอขยายใหม่พร้อมหลักฐานภัยคุกคามล่าสุด')
      await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
      await expect(page).toHaveURL(`/protection-extension/${encodeURIComponent(NO)}`) // บันทึกแล้วกลับหน้าขยายเวลา
      await page.goto(`/dossier/${encodeURIComponent(NO)}`)
      await formRow(page, 'คบ.14').getByRole('button', { name: 'ส่งตรวจ' }).click()
      await confirmDialog(page, 'ส่งตรวจ')
      await expect.poll(async () => (((await readCase(page, NO)) as Rec).extensionRequests as Rec[]).length).toBe(2)
      const reqs = ((await readCase(page, NO)) as Rec).extensionRequests as Rec[]
      expect(reqs[0]).toMatchObject({ status: 'rejected', decisionNote: REJECT })
      expect(reqs[1]).toMatchObject({ status: 'submitted', version: 1, approvalStage: 'supervisor' })
      expect(reqs[1].id).not.toBe(reqs[0].id)
    })
  })

  test('RRR-11B-4 · WIT1149/WIT1150: ครบเพดาน 6 เดือน → ห้ามจัดทำ คบ.14 เพิ่ม → ต้องไปแขนงข้อ 14 (ส่งต่อกรมคุ้มครองสิทธิฯ)', async ({ page }) => {
    const start = isoDaysFromToday(-200) // เพดานคือ 6 เดือนปฏิทิน (≈181-184 วัน) ย้อนหลัง 200 วันจึงครบเพดานแน่นอน
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: isoDaysFromToday(0),
      extensionRequests: [],
      episode: { id: 'EP-RRR11', openedAt: start, phases: [{ id: 'PH-RRR11', kind: 'MAIN', startedAt: start, orderRef: 'คบ.8/คบ.11' }] },
    })

    await page.goto(`/protection-extension/${encodeURIComponent(CASE_NO)}`)
    await expect(page.getByText(/ห้ามจัดทำ คบ\.14 เพิ่ม/)).toBeVisible()
    await expect(footer(page)).toHaveCount(0) // ไม่มีปุ่มส่ง คบ.14 ให้เจ้าหน้าที่
    await expect(page.getByRole('link', { name: 'ส่งต่อกรมคุ้มครองสิทธิฯ' })).toBeVisible()

    // หน้าแบบฟอร์ม คบ.14 ก็บันทึกไม่ได้เช่นกัน (canDraft = false)
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await expect(page.getByRole('button', { name: 'บันทึกแบบ คบ.14' })).toHaveCount(0)
    expect((((await readCase(page, CASE_NO)) as Rec).extensionRequests as unknown[]) || []).toHaveLength(0)

    await page.goto(`/protection-extension/${encodeURIComponent(CASE_NO)}`)
    await page.getByRole('link', { name: 'ส่งต่อกรมคุ้มครองสิทธิฯ' }).click()
    await expect(page).toHaveURL(new RegExp(`/article14\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
  })
})

// ============================================================================
// ตัวช่วยของ 11C (คบ.15)
// ============================================================================
const TERM_URL = `/termination/${encodeURIComponent(CASE_NO)}`
const SELECT_REASON = 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง'

/** WIT1129 — เจ้าหน้าที่แก้ คบ.15 หลังถูกส่งคืน: เลือกเหตุ กรอกหลักฐาน บันทึกแบบ แล้ว "ส่งตรวจ" ที่แถว คบ.15 ในแฟ้ม (เวอร์ชันใหม่) */
async function redraftKb15(page: Page, evidence: string) {
  await switchRole(page, 'officer')
  await page.goto(TERM_URL)
  await page.locator('main select').filter({ has: page.locator('option', { hasText: '— เลือกเหตุยุติ —' }) }).selectOption({ label: SELECT_REASON })
  await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill(evidence)
  await page.getByRole('button', { name: /^บันทึกแบบ คบ\.15/ }).first().click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกแบบ คบ.15 แล้ว')
  await page.getByRole('button', { name: 'ไปส่งตรวจที่แฟ้มคำร้อง' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
  await formRow(page, 'คบ.15').getByRole('button', { name: 'ส่งตรวจ' }).click()
  await confirmDialog(page, 'ส่งตรวจ')
  await expect(page.locator('.swal2-toast')).toContainText('คบ.15')
}

/** ผู้ตรวจชั้นปัจจุบันของ คบ.15 กรอกเหตุผลแล้วส่งคืนแก้ไข */
async function returnKb15As(page: Page, role: 'director' | 'deputy_secretary' | 'secretary', note: string) {
  await switchRole(page, role)
  await page.goto(TERM_URL)
  await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill(note)
  await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
  await confirmDialog(page, 'ยืนยันส่งคืน', 'เริ่มเสนอตามลำดับชั้นใหม่')
  await expect.poll(async () => (((await readCase(page, CASE_NO)) as Rec).kb15 as Rec).status).toBe('returned')
}

async function endorseKb15As(page: Page, role: 'director' | 'deputy_secretary', button: string) {
  await switchRole(page, role)
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: button, exact: true }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน')
  await expect(page.locator('.swal2-toast')).toContainText('เห็นชอบ')
}

const kb15Of = async (page: Page) => ((await readCase(page, CASE_NO)) as Rec).kb15 as Rec
const historyOf = async (page: Page) => (((await readCase(page, CASE_NO)) as Rec).assignmentHistory as Rec[]) || []

test.describe('RRR-11C · คบ.15 เรื่องยุติ — ส่งคืนทุกชั้น / เวอร์ชันใหม่', () => {
  test('RRR-11C-1 · WIT1133/1163/1162: ส่งคืน 3 ชั้น (ผอ. → รองเลขาธิการ → เลขาธิการ) → ฉบับที่ 4 เก็บฉบับเดิม 3 ฉบับ → เลขาธิการลงนาม', async ({ page }) => {
    test.setTimeout(540_000)
    const N1 = 'ยังไม่แนบผลประเมินล่าสุด'
    const N2 = 'ขอรายงานผลการติดตามเพิ่มเติม'
    const N3 = 'เหตุแห่งการยุติยังไม่สอดคล้องกับข้อระเบียบ'
    await seedMockState(page, 'Case 1.15', 'officer')
    await page.goto(TERM_URL)
    expect(await kb15Of(page)).toMatchObject({ version: 1, status: 'submitted', approvalStage: 'director' })

    await test.step('ชั้น ผอ.กอง/สำนัก ส่งคืน (ไม่ผ่านธุรการ) — บันทึกเหตุผลและประวัติชั้น', async () => {
      await returnKb15As(page, 'director', N1)
      const kb15 = await kb15Of(page)
      expect(kb15).toMatchObject({ status: 'returned', reviewNote: N1 })
      expect(kb15.approvalHistory).toEqual([expect.objectContaining({ role: 'director', endorsed: false, note: N1 })])
      expect(kb15.reviewedBy).toBeTruthy()
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toBeFalsy()
    })

    await test.step('เจ้าหน้าที่ส่งตรวจฉบับที่ 2 — เริ่มลำดับใหม่ที่ ผอ. · ฉบับที่ 1 ถูกเก็บ', async () => {
      await redraftKb15(page, 'สรุปผลรอบสอง แนบผลประเมินล่าสุดแล้ว')
      const kb15 = await kb15Of(page)
      expect(kb15).toMatchObject({ version: 2, status: 'submitted', approvalStage: 'director' })
      expect(kb15.approvalHistory).toEqual([])
      expect(kb15.previousVersions).toEqual([expect.objectContaining({ version: 1 })])
      expect(await historyOf(page)).toEqual(expect.arrayContaining([expect.objectContaining({ detail: N1 })]))
    })

    await test.step('ผอ.เห็นชอบ → ธุรการขาไป → รองเลขาธิการส่งคืน → ชุดนำส่งขากลับถึงเจ้าหน้าที่', async () => {
      await endorseKb15As(page, 'director', 'เห็นชอบ · ส่งรองเลขาธิการ')
      await termUpLeg(page, CASE_NO, 'deputy_secretary')
      await returnKb15As(page, 'deputy_secretary', N2)
      const c = (await readCase(page, CASE_NO)) as Rec
      expect(c.kb15).toMatchObject({ status: 'returned', reviewNote: N2 })
      expect((c.kb15 as Rec).approvalHistory).toEqual([
        expect.objectContaining({ role: 'director', endorsed: true }),
        expect.objectContaining({ role: 'deputy_secretary', endorsed: false, note: N2 }),
      ])
      expect(c.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [15] })
      await termDownLeg(page, CASE_NO, 'officer')
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toBeFalsy()
    })

    await test.step('ฉบับที่ 3 — เก็บฉบับเดิม 2 ฉบับ แล้วผ่าน ผอ. → รองเลขาธิการ → เลขาธิการส่งคืน', async () => {
      await redraftKb15(page, 'สรุปผลรอบสาม แนบรายงานติดตามผลเพิ่มเติม')
      expect(await kb15Of(page)).toMatchObject({ version: 3, status: 'submitted', approvalStage: 'director' })
      expect((await kb15Of(page)).previousVersions).toHaveLength(2)

      await endorseKb15As(page, 'director', 'เห็นชอบ · ส่งรองเลขาธิการ')
      await termUpLeg(page, CASE_NO, 'deputy_secretary')
      await endorseKb15As(page, 'deputy_secretary', 'เห็นชอบ · ส่งเลขาธิการ')
      expect(await kb15Of(page)).toMatchObject({ status: 'submitted', approvalStage: 'secretary' })

      await returnKb15As(page, 'secretary', N3)
      const c = (await readCase(page, CASE_NO)) as Rec
      expect((c.kb15 as Rec).approvalHistory).toHaveLength(3)
      expect(((c.kb15 as Rec).approvalHistory as Rec[]).at(-1)).toMatchObject({ role: 'secretary', endorsed: false, note: N3 })
      expect(c.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [15] })
      expect(c.stage).toBe('termination_review') // ยังไม่ยุติ ไม่มีคำสั่ง คบ.16
      expect(c.kb16).toBeFalsy()
      await termDownLeg(page, CASE_NO, 'officer')
    })

    await test.step('ฉบับที่ 4 — เก็บฉบับเดิม 3 ฉบับ แล้วผ่านครบทุกชั้นจนเลขาธิการลงนาม คบ.15', async () => {
      await redraftKb15(page, 'สรุปผลรอบสี่ ปรับเหตุแห่งการยุติให้สอดคล้องกับข้อระเบียบ')
      const v4 = await kb15Of(page)
      expect(v4).toMatchObject({ version: 4, status: 'submitted', approvalStage: 'director' })
      expect((v4.previousVersions as Rec[]).map((p) => p.version)).toEqual([1, 2, 3])

      await endorseKb15As(page, 'director', 'เห็นชอบ · ส่งรองเลขาธิการ')
      await termUpLeg(page, CASE_NO, 'deputy_secretary')
      await endorseKb15As(page, 'deputy_secretary', 'เห็นชอบ · ส่งเลขาธิการ')
      await switchRole(page, 'secretary')
      await page.goto(TERM_URL)
      await page.getByRole('button', { name: /^ลงนาม คบ\.15$/ }).click()
      await confirmDialog(page, 'ยืนยันลงนาม')
      await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.15')

      const c = (await readCase(page, CASE_NO)) as Rec
      const kb15 = c.kb15 as Rec
      expect(kb15.status).toBe('endorsed')
      expect((kb15.approvalHistory as Rec[]).map((h) => [h.role, h.endorsed])).toEqual([
        ['director', true],
        ['deputy_secretary', true],
        ['secretary', true],
      ])
      expect(kb15.previousVersions).toHaveLength(3)
      expect(c.stage).not.toBe('terminated')
      expect(c.closedAt).toBeFalsy()
      expect(c.kb16).toBeFalsy()
    })

    await test.step('Audit: เหตุผลส่งคืนทั้ง 3 ชั้นถูกบันทึกในประวัติแฟ้ม (คบ.15 ฉบับเก่าเก็บเฉพาะเลขที่/สรุป)', async () => {
      const details = (await historyOf(page)).map((h) => String(h.detail))
      for (const note of [N1, N2, N3]) expect(details).toContain(note)
    })
  })
})

// ============================================================================
// 11D — ผู้มีอำนาจไม่อนุมัติให้ยุติ (หลังลงนาม คบ.15)
// ============================================================================
test.describe('RRR-11D · ไม่อนุมัติให้ยุติ (ก่อนออก คบ.16)', () => {
  test('RRR-11D-3 · WIT1136/1137: เลขาธิการลงนาม คบ.15 แล้วไม่อนุมัติให้ยุติ (ต้องมีเหตุผล) → ไม่มี คบ.16 · คุ้มครองต่อ · ผลกลับหน่วยผ่านธุรการ', async ({ page }) => {
    test.setTimeout(420_000)
    const REJECT = 'ยังมีเหตุภัยคุกคามอยู่ ไม่ควรยุติในขณะนี้'
    await seedMockState(page, 'Case 1.15', 'officer')
    await signKb15Chain(page, CASE_NO) // ผอ. → ธุรการขาไป → รองเลขาธิการ → เลขาธิการลงนาม
    expect((await kb15Of(page)).status).toBe('endorsed')

    await test.step('WIT1136 · กด "ไม่อนุมัติ" โดยไม่ใส่เหตุผล — ระบบเตือนและยังไม่มีผลพิจารณา', async () => {
      await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('กรุณาระบุเหตุผลที่ไม่อนุมัติ')
      expect(((await readCase(page, CASE_NO)) as Rec).terminationApproval).toBeFalsy()
    })

    await test.step('WIT1137 · ใส่เหตุผลแล้วไม่อนุมัติ — บันทึกผู้ตัดสิน/เหตุผล กลับขั้นคุ้มครอง ไม่มีคำสั่ง คบ.16 ไม่ปิดแฟ้ม', async () => {
      await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill(REJECT)
      await page.getByRole('button', { name: 'ไม่อนุมัติ', exact: true }).click()
      await expect(page.locator('.swal2-toast')).toContainText('คุ้มครองต่อภายใต้คำสั่งเดิม')
      const c = (await readCase(page, CASE_NO)) as Rec
      expect(c.terminationApproval).toMatchObject({ approved: false, note: REJECT })
      expect((c.terminationApproval as Rec).decidedBy).toBeTruthy()
      expect(c.stage).toBe('protection')
      expect(c.kb16).toBeFalsy()
      expect(c.closedAt).toBeFalsy()
      expect(c.sarabanDispatch).toMatchObject({ flow: 'termination', direction: 'down', forms: [15] })
      await expect(page.getByText(/ไม่อนุมัติให้ยุติเมื่อ/)).toBeVisible()
      expect(await historyOf(page)).toEqual(expect.arrayContaining([expect.objectContaining({ detail: REJECT })]))
    })

    await test.step('ผลพิจารณากลับหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย แล้วมีทางกลับแท็บ 10 (รายงานผลการคุ้มครอง)', async () => {
      await termDownLeg(page, CASE_NO)
      expect(((await readCase(page, CASE_NO)) as Rec).sarabanDispatch).toBeFalsy()
      await page.goto(TERM_URL)
      await page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
    })
  })
})

// ============================================================================
// ช่องว่างของแอป — ไม่มี UI ให้ทดสอบ
// ============================================================================
test.describe('RRR-11 · ช่องว่างที่ยังไม่มี UI (fixme)', () => {
  test.fixme('RRR-11A-1 · WIT1105/1106: ผบช.ชั้นต้นส่งคืนข้อเสนอผลทบทวน 11A → เสนอใหม่ → เห็นชอบ → ดำเนินการ', async () => {
    // หน้า /protection-review/$caseNo (ReviewSection) ถูกถอดออกจากแอปแล้ว (commit 5afe7aab) — เหลือเพียง store
    // (submitReviewProposal / decideReviewProposal / applyReviewOutcome) จึงไม่มีทางกดผ่าน UI
    // j11-review-extension.spec.ts / j12-review-method-change.spec.ts ยังอ้างหน้านี้อยู่ (spec เก่า ต้องปรับเมื่อมี UI ใหม่)
  })

  test.fixme('RRR-11A-2 · WIT1110: ข้อเสนอเปลี่ยนวิธีถูกส่งคืนโดย ผบช.ชั้นต้น/ผอ. (returnedAt/returnedBy/returnNote) → เสนอใหม่ → อนุมัติ', async () => {
    // MethodChangeCard ถูกถอดออกพร้อมหน้า 11A — methodChangeProposals (stage supervisor|director|approved|returned) ยังอยู่ใน store/types แต่ไม่มี UI
  })

  test.fixme('RRR-11A-3 · WIT1149: ครบเพดาน 180 วันที่ 11A เลือกแนวทาง "ข้อ 14" และถูกส่งคืน/ไม่อนุมัติ', async () => {
    // ทางเข้า 11A → ข้อ 14 (applyReviewOutcome → article14) ไม่มี UI แล้ว; ทางเข้าที่เหลือคือลิงก์จากหน้า 11B (ดู RRR-11B-4)
    // การส่งคืนเรื่องข้อ 14 (reviewArticle14) เป็นขอบเขตของ 08C
  })

  test.fixme('RRR-11D-1 · WIT1138/1139: เลขาธิการส่งคืน/ไม่ลงนาม คบ.16 → เจ้าหน้าที่แก้ร่างเป็นเวอร์ชันใหม่', async () => {
    // Kb16Order มีเพียง draft → submitted → signed (submitKb16ForSignature / signKb16) ไม่มี returned/version/previousVersions และไม่มีปุ่มส่งคืนใน Kb16Section
  })

  test.fixme('RRR-11D-2 · WIT1141-1143: คบ.17 ถูกส่งคืนแก้ไขก่อน/หลังลงนาม (revision ของหนังสือแจ้งคำสั่งยุติ)', async () => {
    // Kb17 มีเพียง draft → submitted → signed(locked) → dispatched ไม่มี returned/version ใน Kb17Section / store
    // ลงนามแล้วล็อกฉบับ แก้ไม่ได้ — ถ้าจะแก้ต้องออกฉบับใหม่ ซึ่งยังไม่มีเส้นทางนี้
  })

  test.fixme('RRR-10-1 · แท็บ 10: คบ.13 รายงานผลถูกส่งคืนแก้ไขโดยผู้ตรวจรับ (WIT1008) แล้วเจ้าหน้าที่ส่งรอบใหม่', async () => {
    // Kb13 มีเพียงสถานะ รอบที่จัดทำ → ลงนาม → ตรวจรับ (receiveKb13Round) → บันทึกสถานะ → ล็อกรอบ ไม่มีสถานะ returned และไม่มีปุ่มส่งคืน
    // กรณีผลปฏิบัติไม่ตรงวิธีที่อนุมัติ ระบบบังคับบันทึกประเด็นแล้วรับรายงาน (ไม่ส่งคืน)
  })

  test.fixme('RRR-11C-2 · WIT1136/1137: เลขาธิการไม่อนุมัติให้ยุติแล้ว เจ้าหน้าที่เสนอยุติใหม่ด้วย คบ.15 ฉบับถัดไป', async () => {
    // หลังเลขาธิการไม่อนุมัติ (decideTerminationApproval → ดู RRR-11D-3) stage กลับเป็น protection แต่ kb15 ยังเป็น endorsed ค้างอยู่
    // Kb15Section และปุ่ม "ส่งตรวจ" ที่แถว คบ.15 ในแฟ้ม (canSubmitKb15) เปิดเฉพาะเมื่อ !kb15 || kb15.status === 'returned'
    // จึงไม่มีทางจัดทำ คบ.15 ฉบับใหม่เพื่อเสนอยุติรอบถัดไป (แม้ draftKb15 ใน store จะรองรับ version+1) — ต้องยืนยันกติกากับทีมก่อนเขียนเทสต์
  })
})
