import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 11C · WIT1124 → WIT1134 — จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15)
 *
 * ผัง: บันทึกเหตุเริ่มยุติ (WIT1125-1128 แขนง คบ.7 / หนังสือภายนอก / ครบกำหนด)
 *      → จัดทำ คบ.15 อ้างอิงเหตุยุติ (WIT1129) → ผู้บังคับบัญชาตรวจ (WIT1131-1133)
 *      → เห็นชอบเสนอผู้มีอำนาจที่แท็บ 11D (WIT1134)
 *
 * กฎสำคัญ (WIT1130) ที่ต้องกันไว้ตลอดแท็บนี้: การรับ คบ.7 หรือจัดทำ คบ.15 "ยังไม่ทำให้การคุ้มครองสิ้นสุด"
 * สถานะ "ยุติ" เกิดที่ 11D เมื่อมีคำสั่ง คบ.16 ที่ลงนามและถึงวันที่มีผลเท่านั้น
 */

const CASE_NO = 'WP-2569-000501'
const TERM_URL = `/termination/${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

test.describe('Sheet 11C · จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15)', () => {
  test('TC-139 · [Happy] พยานยื่น คบ.7 ขอยุติ แล้วจัดทำ คบ.15 เสนอผู้มีอำนาจ', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    // WIT1130 — กฎที่ต้องเห็นตลอดเวลา
    await expect(page.getByText(/สถานะ "ยุติ" จะเกิดขึ้นก็ต่อเมื่อมีคำสั่ง คบ\.16 ที่ลงนามแล้ว/)).toBeVisible()

    // WIT1125-1126 — พยานยื่น คบ.7 ขอยุติเอง
    await page.locator('main').getByRole('radio').nth(0).check() // witness_kb7 เป็นตัวเลือกแรก
    await page.getByPlaceholder('เลขที่ คบ.7 / เลขรับคำขอในระบบ').fill('KB7-001/2569')
    await page.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/).fill('kb7_เซ็นแล้ว.pdf')
    await page.getByPlaceholder('เหตุผลที่พยานขอยุติ').fill('พยานขอยุติเอง เนื่องจากย้ายภูมิลำเนา')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติ')

    // WIT1129 — จัดทำ คบ.15 อ้างอิง คบ.7
    await page.locator('main').locator('select').first().selectOption('witness_kb7')
    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ติดตามผลแล้วไม่พบภัยคุกคามเพิ่มเติม')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')

    let after = await readCase(page, CASE_NO)
    expect(after?.kb15).toBeTruthy()
    expect((after?.kb15 as Record<string, unknown>).status).toBe('submitted')
    // WIT1130 — สถานะคุ้มครองต้องยังไม่เปลี่ยนเป็นยุติ
    expect(after?.stage).not.toBe('terminated')
    expect(after?.closedAt).toBeFalsy()

    // WIT1131-1132 — ผู้บังคับบัญชาตรวจและเห็นชอบ
    await switchRole(page, 'supervisor')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ครบถ้วน · เสนอผู้มีอำนาจ', exact: true }).click()
    await confirmDialog(page, 'ยืนยันครบถ้วน', 'เสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ')

    after = await readCase(page, CASE_NO)
    expect((after?.kb15 as Record<string, unknown>).status).toBe('endorsed')
    expect(after?.stage).not.toBe('terminated') // ยังไม่ยุติในขั้นนี้

    // เสนอไปแท็บ 11D แล้ว — การ์ด 11D ต้องปรากฏบนหน้าเดียวกัน
    await expect(page.getByText('พิจารณาและออกคำสั่งยุติ (คบ.16)', { exact: true })).toBeVisible()
  })

  test('TC-140 · [Happy] เหตุยุติจากหนังสือภายนอก', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    // WIT1127 — เลือกแขนงหนังสือภายนอก
    await page.locator('main').getByRole('radio').nth(1).check()
    await page.getByPlaceholder('เลขที่หนังสือจากสารบรรณเดิม').fill('ศธ.0001/2569')
    await page.getByPlaceholder(/ไฟล์หนังสือขอยุติจากภายนอก/).fill('หนังสือขอยุติ.pdf')
    await page.getByPlaceholder('หน่วยงานผู้มีหนังสือ').fill('สำนักงานอัยการจังหวัด')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()

    const after = await readCase(page, CASE_NO)
    expect(after?.terminationTrigger).toMatchObject({ source: 'external_letter', ref: 'ศธ.0001/2569' })
    const letters = (after?.officialLetters as Array<Record<string, unknown>>) || []
    expect(letters.some((l) => l.registryNo === 'ศธ.0001/2569')).toBe(true)
    await expect(page.getByText('อัปโหลดเข้ากับแฟ้มเดิมแล้ว', { exact: false })).toBeVisible()

    // ใช้เป็นเหตุอ้างอิงใน คบ.15 ได้
    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('อ้างอิงหนังสือจากภายนอก')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()

    const withKb15 = await readCase(page, CASE_NO)
    expect((withKb15?.kb15 as Record<string, unknown>).trigger).toBe('external_letter')
    expect((withKb15?.kb15 as Record<string, unknown>).triggerRef).toBe('ศธ.0001/2569')
  })

  test('TC-141 · [Happy] เหตุยุติจากการครบกำหนด/เจ้าหน้าที่เห็นควรยุติ', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    // due_or_officer เป็นค่าเริ่มต้นอยู่แล้ว — ต้องไม่มีช่องแนบเอกสาร (ไม่ต้องมี คบ.7)
    await expect(page.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/)).toHaveCount(0)
    await page.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('คำสั่งคุ้มครองครบกำหนด 6 เดือน')
    await page.getByPlaceholder('ข้อเท็จจริงและผลประเมินล่าสุดที่ใช้อ้าง').fill('ผลประเมินล่าสุดไม่พบเหตุภัย')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()

    const trig = await readCase(page, CASE_NO)
    expect((trig?.terminationTrigger as Record<string, unknown>).source).toBe('due_or_officer')

    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ครบกำหนดและไม่มีเหตุภัย')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()

    const after = await readCase(page, CASE_NO)
    expect((after?.kb15 as Record<string, unknown>).trigger).toBe('due_or_officer')
  })

  test('TC-142 · [Negative] ตั้งสถานะยุติทันทีเมื่อรับ คบ.7 / จัดทำ คบ.15 — ต้อง ACTIVE จนกว่าจะมี คบ.16', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    await page.locator('main').getByRole('radio').nth(0).check()
    await page.getByPlaceholder('เลขที่ คบ.7 / เลขรับคำขอในระบบ').fill('KB7-002/2569')
    await page.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/).fill('kb7.pdf')
    await page.getByPlaceholder('เหตุผลที่พยานขอยุติ').fill('พยานขอยุติ')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()

    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ปลอดภัยแล้ว')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()

    // ---- ตรวจสถานะการคุ้มครอง (WIT1130) — ต้องยัง ACTIVE ----
    const after = await readCase(page, CASE_NO)
    expect(after?.stage).not.toBe('terminated')
    expect(after?.closedAt).toBeFalsy()
    expect(after?.kb16).toBeFalsy()
    await expect(page.getByText(/การรับ คบ\.7 หรือจัดทำ คบ\.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด/)).toBeVisible()
  })

  test('TC-143 · [Negative] ส่งกลับแก้ คบ.15 ต้องสร้างเวอร์ชันใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    await page.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('ครบกำหนด')
    await page.getByPlaceholder('ข้อเท็จจริงและผลประเมินล่าสุดที่ใช้อ้าง').fill('ไม่มีเหตุภัย')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()

    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('สรุปผลรอบแรก')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()

    // WIT1132/1133 — ผู้บังคับบัญชาตรวจพบไม่ครบ ส่งกลับ
    await switchRole(page, 'supervisor')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน').fill('ยังไม่แนบผลประเมินล่าสุด')
    await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
    await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.15 เวอร์ชันใหม่')

    let after = await readCase(page, CASE_NO)
    let kb15 = after?.kb15 as Record<string, unknown>
    expect(kb15.status).toBe('returned')
    expect(kb15.reviewNote).toBe('ยังไม่แนบผลประเมินล่าสุด')

    // เจ้าหน้าที่แก้ไขและเสนอใหม่ — ต้องได้เวอร์ชันใหม่ ไม่แก้ทับฉบับเดิม
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await expect(page.getByText('ส่งคืนแก้ไข', { exact: false }).first()).toBeVisible()
    await page
      .locator('main')
      .locator('select')
      .nth(1)
      .selectOption({ label: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง' })
    await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('สรุปผลรอบสอง แนบผลประเมินล่าสุดแล้ว')
    await page.getByRole('button', { name: 'จัดทำ คบ.15 เวอร์ชันใหม่' }).click()

    after = await readCase(page, CASE_NO)
    kb15 = after?.kb15 as Record<string, unknown>
    expect(kb15.version).toBe(2)
    expect(kb15.status).toBe('submitted')
    expect((kb15.previousVersions as unknown[]).length).toBe(1)
  })

  test('TC-144 · [Edge] มีเหตุยุติหลายทางพร้อมกัน — ระบุได้ครบถ้วนโดยไม่สร้างเรื่องยุติซ้ำซ้อน', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer')
    await page.goto(TERM_URL)

    // เหตุหลัก — พยานยื่น คบ.7 (กำหนดแนวทางของเรื่องยุตินี้)
    await page.locator('main').getByRole('radio').nth(0).check()
    await page.getByPlaceholder('เลขที่ คบ.7 / เลขรับคำขอในระบบ').fill('KB7-003/2569')
    await page.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/).fill('kb7.pdf')
    await page.getByPlaceholder('เหตุผลที่พยานขอยุติ').fill('พยานขอยุติเอง')
    await page.getByRole('button', { name: 'บันทึกเหตุเริ่มยุติ' }).click()

    const afterFirst = await readCase(page, CASE_NO)
    // ระบบต้องมีระเบียนเหตุยุติเพียงชุดเดียวในแฟ้ม (ไม่ใช่ลิสต์ที่พอกพูนได้) — ไม่ซ้ำซ้อนแน่นอน
    expect(afterFirst?.terminationTrigger).toBeTruthy()
    expect(Array.isArray(afterFirst?.terminationTrigger)).toBe(false)

    // เหตุหลักถูกล็อกแล้ว — ไม่มีตัวเลือกแขนงหลักซ้ำอีก แต่ต้องยังเหลือ 2 ตัวเลือกให้ระบุเหตุที่เกิดพร้อมกันเพิ่มได้
    // (แขนง "พยานยื่น คบ.7" ที่ใช้เป็นเหตุหลักไปแล้วต้องหายไปจากตัวเลือกเสริม)
    await page.getByText('เพิ่มเหตุยุติที่เกิดพร้อมกัน').waitFor()
    await expect(page.locator('main').getByRole('radio')).toHaveCount(2)

    // เหตุที่สอง — วันเดียวกันคำสั่งครบกำหนดพอดี ("ครบกำหนด") เพิ่มเป็นเหตุยุติเสริมได้โดยไม่เปลี่ยนแนวทางเดิม
    // เหลือ 2 แขนงให้เลือก (หนังสือภายนอก, ครบกำหนด) ตามลำดับที่ประกาศใน TERMINATION_TRIGGERS — เลือกตัวที่สอง
    await page.locator('main').getByRole('radio').nth(1).check()
    await page.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('คำสั่งคุ้มครองครบกำหนดวันเดียวกับที่ยื่น คบ.7')
    await page.getByRole('button', { name: 'เพิ่มเหตุยุติเสริม' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('เพิ่มเหตุยุติเสริมแล้ว')

    const afterSecond = await readCase(page, CASE_NO)
    const trigger = afterSecond?.terminationTrigger as Record<string, unknown>
    // ยังคงเป็นเรื่องยุติเดียว (object เดียว ไม่ใช่ array ของ matter) — ไม่มี matter ที่สองถูกสร้างขึ้น
    expect(Array.isArray(afterSecond?.terminationTrigger)).toBe(false)
    expect(trigger.source).toBe('witness_kb7') // แนวทางเดิมยังคงอยู่ตามเหตุหลัก
    const additional = trigger.additionalReasons as Array<Record<string, unknown>>
    expect(additional).toHaveLength(1)
    expect(additional[0].source).toBe('due_or_officer')
    expect(additional[0].ref).toBe('คำสั่งคุ้มครองครบกำหนดวันเดียวกับที่ยื่น คบ.7')

    // ทั้งสองเหตุต้องแสดงครบถ้วนใน UI (คบ.15)
    await expect(page.getByText('เหตุยุติเสริม (เกิดพร้อมกัน)')).toBeVisible()
    await expect(page.getByTestId('termination-additional-reason')).toContainText(
      'ครบกำหนด หรือเจ้าหน้าที่เห็นควรยุติตามผลประเมินล่าสุด'
    )

    // แขนงที่ถูกใช้ไปแล้วทั้งคู่ (หลัก + เสริม) เหลือให้เลือกได้อีกแค่ 1 ทาง (หนังสือภายนอก) — ไม่มีทางเลือกซ้ำผ่าน UI
    // (การกันซ้ำที่ระดับ store เมื่อยิง action ตรง ๆ มีหน่วยทดสอบแยกใน useCaseStore.test.ts — TC-144)
    await expect(page.locator('main').getByRole('radio')).toHaveCount(1)
    await expect(page.locator('main').getByRole('radio', { name: /หนังสือขอยุติจากภายนอก/ })).toBeVisible()
  })
})
