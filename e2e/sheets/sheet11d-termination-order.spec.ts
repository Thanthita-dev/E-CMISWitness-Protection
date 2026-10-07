import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 11D · WIT1135 → WIT1148 — คำสั่งยุติ (คบ.16) แจ้งผล (คบ.17) อุทธรณ์ และปิดงาน
 *
 * ผัง: รับ คบ.7/คบ.15 จาก 11C (WIT1135) → ผู้มีอำนาจอนุมัติ/ไม่อนุมัติให้ยุติ (WIT1136-1137)
 *      → ร่าง คบ.16 → ลงนาม (WIT1138-1140) → จัดทำ คบ.17 ออกเลขผ่านสารบรรณเดิม (WIT1141-1143)
 *      → พยานรับจริง เริ่มนับอุทธรณ์ 30 วัน (WIT1144-1145) → ไม่มี/มีอุทธรณ์ → ปิดงาน (WIT1146-1148)
 *
 * บันทึกไว้ล่วงหน้า: ขั้นตอน "เจ้าหน้าที่กรอกแบบ คบ.16/คบ.17 ในแฟ้ม แล้วกด ส่งให้อนุมัติ/ส่งให้ลงนาม"
 * เกิดที่หน้าแฟ้มคดี (/dossier/$caseNo) ซึ่งอยู่นอกขอบเขตคอมโพเนนต์ของแท็บ 11D ที่ได้รับมอบหมาย
 * (Kb16Section/Kb17Section ที่ /termination/$caseNo) — สเปกนี้จึงเดินหน้าจริงผ่าน UI ของ 11D
 * เท่าที่มีปุ่มอยู่บนหน้านี้ (ร่าง คบ.16/17, ลงนาม, ออกเลข, บันทึกวันที่รับ, ปิดงาน) และใช้ patchCase
 * (เขียน localStorage โดยตรงแล้ว reload) แทนขั้น "ส่งให้อนุมัติ/ส่งให้ลงนาม" ที่อยู่ในแฟ้มคดีเท่านั้น
 */

const CASE_NO = 'WP-2569-000501'
const TERM_URL = `/termination/${CASE_NO}`

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = () => isoDaysFromToday(0)

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/**
 * เขียนทับฟิลด์ของแฟ้มโดยตรงใน localStorage แล้ว reload — ใช้เฉพาะจำลองขั้น "ส่งให้อนุมัติ/ลงนาม"
 * ที่ปุ่มจริงอยู่ในหน้าแฟ้มคดี (/dossier/$caseNo) ซึ่งไม่ใช่คอมโพเนนต์ของแท็บ 11D ที่ได้รับมอบหมาย
 */
async function patchCase(page: Page, caseNo: string, patch: Record<string, unknown>) {
  await page.evaluate(
    ({ no, patch }) => {
      const raw = localStorage.getItem('ecmis-case-storage-v2')
      if (!raw) return
      const store = JSON.parse(raw)
      store.state.cases = store.state.cases.map((c: Record<string, unknown>) =>
        c.no === no ? { ...c, ...patch } : c
      )
      localStorage.setItem('ecmis-case-storage-v2', JSON.stringify(store))
    },
    { no: caseNo, patch }
  )
  await page.reload()
}

/** ตั้งต้นที่ WIT1135 — เห็นชอบ คบ.15 แล้ว เสนอผู้มีอำนาจพิจารณายุติ ยังไม่มีผลพิจารณา */
const AT_KB15_ENDORSED = {
  terminationTrigger: {
    source: 'due_or_officer' as const,
    ref: 'คำสั่งเดิมครบกำหนด',
    receivedAt: todayIso(),
    detail: 'ครบกำหนดและไม่มีเหตุภัย',
    recordedAt: '10/09/2569 10:00',
    recordedBy: 'นางสาวอรุณี ใจมั่น',
  },
  kb15: {
    version: 1,
    createdAt: '10/09/2569 10:05',
    createdBy: 'นางสาวอรุณี ใจมั่น',
    trigger: 'due_or_officer' as const,
    triggerRef: 'คำสั่งเดิมครบกำหนด',
    summary: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง',
    evidenceNote: 'ผลประเมินล่าสุดไม่พบเหตุภัย',
    status: 'endorsed' as const,
    reviewedAt: '10/09/2569 11:00',
    reviewedBy: 'นายกิตติศักดิ์ ธรรมรักษ์',
    reviewNote: 'เอกสารครบถ้วน',
  },
}

test.describe('Sheet 11D · คำสั่งยุติ (คบ.16) แจ้งผล (คบ.17) และปิดงาน', () => {
  test('TC-145 · [Happy] อนุมัติยุติ ออก คบ.16 แจ้ง คบ.17 และปิดงานเมื่อไม่มีอุทธรณ์', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', AT_KB15_ENDORSED)
    await page.goto(TERM_URL)

    // WIT1135 — รับเรื่องจาก 11C
    await expect(page.getByText('เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)')).toBeVisible()

    // WIT1136 — ผู้มีอำนาจอนุมัติให้ยุติ
    await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ')
    await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')

    // WIT1138 — เจ้าหน้าที่ร่างคำสั่ง คบ.16 (วันที่มีผลเป็นอนาคต กันไม่ให้ปิดสถานะก่อนเวลา)
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('คำสั่งที่').fill('123/2569')
    await page.getByLabel('วันที่ออกคำสั่ง').fill(todayIso())
    await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(10))
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    let after = await readCase(page, CASE_NO)
    const kb16Draft = after?.kb16 as Record<string, unknown>
    expect(kb16Draft.orderNo).toBe('123/2569')
    expect(kb16Draft.status).toBe('draft')

    // จำลองขั้น "ส่งให้อนุมัติ" (ปุ่มจริงอยู่ที่หน้าแฟ้มคดี — นอกขอบเขตคอมโพเนนต์ 11D ที่ได้รับมอบหมาย)
    await patchCase(page, CASE_NO, {
      kb16: { ...kb16Draft, status: 'submitted', submittedAt: 'test', submittedBy: 'นางสาวอรุณี ใจมั่น' },
    })

    // WIT1139 — เลขาธิการ ป.ป.ท. ลงนามคำสั่ง คบ.16
    await switchRole(page, 'secretary')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')

    after = await readCase(page, CASE_NO)
    const kb16Signed = after?.kb16 as Record<string, unknown>
    expect(kb16Signed.signedAt).toBeTruthy()
    expect(kb16Signed.locked).toBe(true)
    // วันที่มีผลยังไม่ถึง — ยังไม่ยุติจริง (WIT1130/WIT1139)
    expect(after?.stage).not.toBe('terminated')

    // WIT1141 — จัดทำร่าง คบ.17
    await switchRole(page, 'officer')
    await page.goto(TERM_URL)
    await page.getByPlaceholder('ชื่อไฟล์หนังสือ').fill('คบ17_แจ้งคำสั่งยุติ.pdf')
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    after = await readCase(page, CASE_NO)
    const kb17Draft = after?.kb17 as Record<string, unknown>
    expect(kb17Draft.status).toBe('draft')

    // จำลอง "ส่งให้ลงนาม" (ปุ่มจริงอยู่ที่หน้าแฟ้มคดีเช่นกัน)
    await patchCase(page, CASE_NO, {
      kb17: { ...kb17Draft, status: 'submitted', submittedAt: 'test', submittedBy: 'นางสาวอรุณี ใจมั่น' },
    })

    // เลขาธิการ ป.ป.ท. ลงนาม คบ.17
    await switchRole(page, 'secretary')
    await page.goto(TERM_URL)
    await page.getByRole('button', { name: 'ลงนาม คบ.17' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.17')

    // WIT1142 — ออกเลขและนำส่งผ่านสารบรรณเดิม
    await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('สลข.999/2569')
    await page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ออกเลขและนำส่ง')

    after = await readCase(page, CASE_NO)
    expect((after?.kb17 as Record<string, unknown>).registryNo).toBe('สลข.999/2569')

    // WIT1144/1145 — บันทึกวันที่พยานได้รับจริง (ใช้วันย้อนหลังพอควรเพื่อให้กรอบอุทธรณ์ 30 วันพ้นกำหนดแล้วจริง)
    await page.getByLabel('วันที่พยานได้รับจริง').fill(isoDaysFromToday(-31))
    await page.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')

    after = await readCase(page, CASE_NO)
    expect((after?.kb17 as Record<string, unknown>).deliveredAt).toBeTruthy()

    // WIT1148 — พ้น 30 วันไม่มีอุทธรณ์ ปิดงาน
    await expect(page.getByText(/พ้นกำหนดแล้ว/)).toBeVisible()
    await page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')

    after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('terminated')
    expect(after?.closedAt).toBeTruthy()
    expect((after?.kb16 as Record<string, unknown>).locked).toBe(true)
    await expect(page.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/)).toBeVisible()
  })

  test('TC-146 · [Happy] ไม่อนุมัติให้ยุติ คุ้มครองต่อภายใต้คำสั่งเดิม', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', AT_KB15_ENDORSED)
    await page.goto(TERM_URL)

    await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('ยังมีเหตุภัยอยู่ ไม่ควรยุติในขณะนี้')
    await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('คุ้มครองต่อภายใต้คำสั่งเดิม')

    const after = await readCase(page, CASE_NO)
    expect((after?.terminationApproval as Record<string, unknown>).approved).toBe(false)
    expect(after?.stage).toBe('protection') // กลับแท็บ 10 เพื่อติดตามต่อ
    expect(after?.kb16).toBeFalsy()

    await expect(page.getByText(/ไม่อนุมัติให้ยุติเมื่อ/)).toBeVisible()
    await expect(page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ })).toBeVisible()
  })

  test('TC-147 · [Happy] พยานยื่นอุทธรณ์ภายใน 30 วัน ส่งไปแท็บ 09B', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: {
        orderNo: '123/2569',
        reason: 'ครบกำหนดและไม่มีเหตุภัย',
        status: 'submitted',
        issuedAt: todayIso(),
        effectiveAt: isoDaysFromToday(10),
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
      kb17: {
        documentName: 'คบ17.pdf',
        status: 'submitted',
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
        registryNo: 'สลข.100/2569',
        registryDate: todayIso(),
        dispatchedAt: 'test',
        deliveredAt: new Date(isoDaysFromToday(-5)).toISOString(),
        appealDueAt: new Date(isoDaysFromToday(25)).toISOString(),
      },
    })
    await page.goto(TERM_URL)

    await expect(page.getByText(/ครบกำหนดอุทธรณ์.*\(เหลือ \d+ วัน\)/)).toBeVisible()

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

    const after = await readCase(page, CASE_NO)
    expect(after?.appealAgainst).toBe('kb17')
    expect(after?.stage).toBe('appeal')
    // ไม่สร้าง คบ.1 ใหม่ — ยังเป็นแฟ้มเลขเดิม
    expect(after?.no).toBe(CASE_NO)

    await expect(page.getByRole('link', { name: 'ไปหน้าอุทธรณ์' })).toBeVisible()
  })

  test('TC-148 · [Negative] ตั้งสถานะยุติก่อน คบ.16 ลงนาม', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: {
        orderNo: '123/2569',
        reason: 'ครบกำหนดและไม่มีเหตุภัย',
        status: 'draft', // ร่างเท่านั้น ยังไม่ส่งให้อนุมัติ/ลงนาม
        issuedAt: todayIso(),
        effectiveAt: isoDaysFromToday(10),
      },
    })
    await page.goto(TERM_URL)

    // ยังไม่ลงนาม — ต้องไม่มีปุ่มลงนาม และห้ามเข้าสถานะยุติ
    await expect(page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' })).toHaveCount(0)
    await expect(page.getByText(/ยังไม่ลงนาม — การคุ้มครองยังไม่สิ้นสุด/)).toBeVisible()
    await expect(page.getByText(/รอเจ้าหน้าที่กรอกแบบ คบ\.16 ในแฟ้มแล้วกด/)).toBeVisible()

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).not.toBe('terminated')
    expect(after?.closedAt).toBeFalsy()
  })

  test('TC-149 · [Negative] วันที่มีผลของ คบ.16 ย้อนหลังก่อนวันออกคำสั่ง — อนุญาตได้แต่ต้องบังคับเหตุผล', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
    })
    await page.goto(TERM_URL)

    await page.getByPlaceholder('คำสั่งที่').fill('999/2569')
    await page.getByLabel('วันที่ออกคำสั่ง').fill(isoDaysFromToday(5))
    await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(1)) // ย้อนหลังก่อนวันออกคำสั่ง

    // ธุรกิจ: อนุญาตให้วันที่มีผลย้อนหลังได้ แต่ต้องขึ้นเตือนแดงและบังคับกรอกเหตุผลตามระเบียบ
    await expect(
      page.getByText('วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง — ต้องระบุเหตุผลตามระเบียบ')
    ).toBeVisible()

    // ปุ่ม "เปิดแฟ้มคดี" ต้องกดไม่ได้จนกว่าจะกรอกเหตุผล
    const submit = page.getByRole('button', { name: 'เปิดแฟ้มคดี' })
    await expect(submit).toBeDisabled()

    await page.getByPlaceholder('ระบุเหตุผลที่วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง').fill('เหตุฉุกเฉินเร่งด่วนตามคำสั่งผู้บังคับบัญชา')
    await expect(submit).toBeEnabled()

    await submit.click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    const after = await readCase(page, CASE_NO)
    const kb16 = after?.kb16 as Record<string, unknown>
    expect(kb16.backdatedReason).toBe('เหตุฉุกเฉินเร่งด่วนตามคำสั่งผู้บังคับบัญชา')
  })

  test('TC-150 · [Negative] ส่ง คบ.17 โดยไม่ผ่านระบบสารบรรณเดิม', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: {
        orderNo: '123/2569',
        reason: 'ครบกำหนดและไม่มีเหตุภัย',
        status: 'submitted',
        issuedAt: todayIso(),
        effectiveAt: isoDaysFromToday(10),
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
      kb17: {
        documentName: 'คบ17.pdf',
        status: 'submitted',
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
    })
    await page.goto(TERM_URL)

    // ยังไม่กรอกเลขที่/วันที่จากสารบรรณเดิม — ปุ่มออกเลขและนำส่งต้องกดไม่ได้
    await expect(page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' })).toBeDisabled()

    const before = await readCase(page, CASE_NO)
    expect((before?.kb17 as Record<string, unknown>).dispatchedAt).toBeFalsy()

    // กรอกครบแล้วจึงออกเลขได้ — ยืนยันว่าบังคับให้ผ่านสารบรรณเดิมจริง
    await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('สลข.500/2569')
    await expect(page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' })).toBeEnabled()
  })

  const KB16_SIGNED_BASE = {
    orderNo: '123/2569',
    reason: 'ครบกำหนดและไม่มีเหตุภัย',
    status: 'submitted' as const,
    issuedAt: todayIso(),
    effectiveAt: isoDaysFromToday(10),
    signedAt: 'test',
    signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
    locked: true,
  }

  test('TC-151 · [Negative] ปิดงานทั้งที่ยังไม่พ้นกำหนดอุทธรณ์ — ปุ่มต้องปิดงานไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: KB16_SIGNED_BASE,
      kb17: {
        documentName: 'คบ17.pdf',
        status: 'submitted',
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
        registryNo: 'สลข.100/2569',
        registryDate: todayIso(),
        dispatchedAt: 'test',
        // พยานเพิ่งได้รับ คบ.17 เมื่อ 5 วันก่อน — เหลืออีก 25 วันจึงจะครบกรอบอุทธรณ์
        deliveredAt: new Date(isoDaysFromToday(-5)).toISOString(),
        appealDueAt: new Date(isoDaysFromToday(25)).toISOString(),
      },
    })
    await page.goto(TERM_URL)

    await expect(page.getByText(/เหลือ 25 วัน/)).toBeVisible()
    await expect(page.getByText('เหลืออีก 25 วันจึงพ้นกำหนดอุทธรณ์')).toBeVisible()

    // คาดหวัง (Expected): ต้องกดปิดงานไม่ได้จนกว่าจะพ้นกำหนด 30 วันหรือมีผลอุทธรณ์
    // ปุ่มถูก disable ที่ UI ควบคู่กับ closeProtectionCase ในสโตร์ที่ปฏิเสธ (no-op) เมื่อเงื่อนไขไม่ครบเช่นกัน
    const closeBtn = page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })
    await expect(closeBtn).toBeDisabled()

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).not.toBe('terminated')
    expect(after?.closedAt).toBeFalsy()
  })

  test('TC-151b · [Happy] ปิดงานได้เมื่อพ้นกำหนดอุทธรณ์แล้วและไม่มีงานค้าง', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: KB16_SIGNED_BASE,
      kb17: {
        documentName: 'คบ17.pdf',
        status: 'submitted',
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
        registryNo: 'สลข.100/2569',
        registryDate: todayIso(),
        dispatchedAt: 'test',
        // รับจริงเมื่อ 31 วันก่อน — พ้นกรอบอุทธรณ์ 30 วันแล้ว
        deliveredAt: new Date(isoDaysFromToday(-31)).toISOString(),
        appealDueAt: new Date(isoDaysFromToday(-1)).toISOString(),
      },
    })
    await page.goto(TERM_URL)

    const closeBtn = page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })
    await expect(closeBtn).toBeEnabled()
    await closeBtn.click()
    await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')

    const after = await readCase(page, CASE_NO)
    expect(after?.stage).toBe('terminated')
    expect(after?.closedAt).toBeTruthy()
  })

  test('TC-152 · [Edge] วันที่หยุดปฏิบัติจริงต่างจากวันที่มีผลของคำสั่ง', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: {
        orderNo: '123/2569',
        reason: 'ครบกำหนดและไม่มีเหตุภัย',
        status: 'submitted',
        issuedAt: isoDaysFromToday(-10),
        effectiveAt: isoDaysFromToday(-5), // มีผลไปแล้ว 5 วันก่อน
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
    })
    await page.goto(TERM_URL)

    // WIT1140 — บันทึกวันหยุดปฏิบัติจริง ต่างจากวันที่มีผล 1 วัน
    const stoppedAt = isoDaysFromToday(-4)
    await page.getByLabel('วันหยุดปฏิบัติจริง').fill(stoppedAt)
    await page.getByRole('button', { name: 'บันทึกวันหยุดปฏิบัติจริง' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกวันหยุดปฏิบัติจริงแล้ว')

    const after = await readCase(page, CASE_NO)
    expect((after?.kb16 as Record<string, unknown>).operationStoppedAt).toBe(stoppedAt)

    // สามวันที่ต้องแยกกันและแสดงครบในหน้าเดียว: วันออกคำสั่ง / วันที่มีผล / วันหยุดปฏิบัติจริง
    const dl = page.locator('dl', { hasText: 'วันหยุดปฏิบัติจริง' })
    await expect(dl.getByText('วันที่ออกคำสั่ง')).toBeVisible()
    await expect(dl.getByText('วันที่มีผล')).toBeVisible()
    await expect(dl.getByText('วันหยุดปฏิบัติจริง')).toBeVisible()
  })

  test('TC-153 · [Edge] พยานไม่รับ คบ.17 / ไม่สามารถส่งถึงได้ — ส่งไม่สำเร็จ 2 ครั้งแล้วแจ้งตามระเบียบ', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'secretary', {
      ...AT_KB15_ENDORSED,
      terminationApproval: { decidedAt: '10/09/2569', decidedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์', approved: true, note: 'อนุมัติ' },
      kb16: {
        orderNo: '123/2569',
        reason: 'ครบกำหนดและไม่มีเหตุภัย',
        status: 'submitted',
        issuedAt: todayIso(),
        effectiveAt: isoDaysFromToday(10),
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
      kb17: {
        documentName: 'คบ17.pdf',
        status: 'submitted',
        signedAt: 'test',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
        registryNo: 'สลข.100/2569',
        registryDate: todayIso(),
        dispatchedAt: 'test',
      },
    })
    await page.goto(TERM_URL)

    // ระบบต้องมีช่องบันทึกผลการนำส่งแต่ละครั้ง แยกจากวันที่รับจริง — ยังไม่มีความพยายามใดเลย
    const failBtn = page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ' })
    await expect(failBtn).toBeVisible()
    await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์')).toBeVisible()
    await expect(page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })).toBeDisabled()

    // ส่งครั้งที่ 1 — ไม่สำเร็จ
    await page.getByPlaceholder('หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)').fill('ไปรษณีย์ตีกลับ ไม่มีผู้รับ')
    await failBtn.click()
    await expect(page.locator('.swal2-toast')).toContainText('บันทึกผลการส่งไม่สำเร็จ')

    let after = await readCase(page, CASE_NO)
    let attempts = (after?.kb17 as Record<string, unknown>).deliveryAttempts as Array<Record<string, unknown>>
    expect(attempts).toHaveLength(1)
    expect(attempts[0].result).toBe('failed')

    // ส่งครั้งที่ 2 — ไม่สำเร็จอีกครั้ง
    await page.getByPlaceholder('หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)').fill('ไปพบตัวไม่ได้ ปิดบ้าน')
    await page.getByRole('button', { name: 'บันทึกผลการส่งไม่สำเร็จ' }).click()

    after = await readCase(page, CASE_NO)
    attempts = (after?.kb17 as Record<string, unknown>).deliveryAttempts as Array<Record<string, unknown>>
    expect(attempts).toHaveLength(2)
    // ยังไม่เริ่มนับกรอบอุทธรณ์จนกว่าจะมีวันรับจริงหรือวันที่ถือว่าได้รับตามระเบียบ
    expect((after?.kb17 as Record<string, unknown>).deliveredAt).toBeFalsy()
    await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })).toBeDisabled()

    // หลังส่งไม่สำเร็จอย่างน้อย 1 ครั้ง เจ้าหน้าที่บันทึกว่าถือว่าได้รับตามระเบียบ — จึงเริ่มนับกรอบอุทธรณ์
    const deemedBtn = page.getByRole('button', { name: 'บันทึกวันที่ถือว่าได้รับตามระเบียบ' })
    await expect(deemedBtn).toBeVisible()
    await deemedBtn.click()
    await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')

    after = await readCase(page, CASE_NO)
    const kb17After = after?.kb17 as Record<string, unknown>
    expect(kb17After.deliveredAt).toBeTruthy()
    expect(kb17After.deliveryMethod).toBe('deemed')
    expect(kb17After.deliveryAttempts).toHaveLength(2)
    await expect(page.getByText(/ครบกำหนดอุทธรณ์/)).toBeVisible()
  })
})
