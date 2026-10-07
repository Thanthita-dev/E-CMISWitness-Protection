import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 11B · WIT1112 → WIT1123 — ขยายระยะเวลาการคุ้มครอง (คบ.14)
 *
 * ผัง: รับผล "ขยายเวลา" จากแท็บ 11A (WIT1109/WIT1112) → เจ้าหน้าที่จัดทำ คบ.14 (WIT1114/WIT1115)
 *      → ผู้ตรวจตรวจเอกสาร (WIT1117-1120) → ผู้มีอำนาจ (เลขาธิการ ป.ป.ท.) อนุมัติ/ไม่อนุมัติ (WIT1121-1123)
 *
 * เพดานรวมทั้งกระบวนการคือ 180 วัน (WIT1116) — ถึงเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม ต้องกลับไป
 * แท็บ 11A แขนงข้อ 14 แทน (WIT1149/WIT1150)
 */

const CASE_NO = 'WP-2569-000501'
const EXT_URL = `/protection-extension/${CASE_NO}`

// ใช้องค์ประกอบวันที่ตามเวลาท้องถิ่นเสมอ (ไม่ใช้ toISOString ซึ่งแปลงเป็น UTC แล้ววันจะเลื่อนในโซน +07)
const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const todayIso = () => isoDaysFromToday(0)

/** สร้าง Episode เปิดอยู่ (ยังไม่ปิด) ที่มียอดสะสมเท่ากับ `cumulative` วัน ณ วันนี้ */
function episodeWithCumulative(cumulative: number) {
  return {
    id: 'EP-11B-TEST',
    openedAt: isoDaysFromToday(-(cumulative - 1)),
    phases: [
      {
        id: 'PH-11B-TEST',
        kind: 'MAIN',
        startedAt: isoDaysFromToday(-(cumulative - 1)),
        orderRef: 'คบ.8/คบ.11',
      },
    ],
  }
}

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

test.describe('Sheet 11B · ขยายระยะเวลาการคุ้มครอง (คบ.14)', () => {
  test('TC-132 · [Happy] จัดทำ คบ.14 เสนอและได้รับอนุมัติขยายเวลา', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(120),
    })
    await page.goto(EXT_URL)

    // WIT1114/WIT1115 — จัดทำ คบ.14 ระยะเวลาที่ขอ (ค่า default periodFrom=วันนี้ periodTo=+30 วัน = 30 วัน)
    await expect(page.getByText('30 วัน', { exact: false }).first()).toBeVisible()
    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ยังพบการเฝ้าติดตามพยานใกล้ที่พักอาศัย ความเสี่ยงยังไม่ลดลง')
    await page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.14')

    let after = await readCase(page, CASE_NO)
    expect((after?.extensionRequests as Array<Record<string, unknown>>)).toHaveLength(1)
    expect((after?.extensionRequests as Array<Record<string, unknown>>)[0].status).toBe('submitted')

    // WIT1117-1120 — ผู้ตรวจ (ผบช.ชั้นต้น) ตรวจครบถ้วน เสนอตามลำดับชั้น
    await switchRole(page, 'supervisor')
    await page.goto(EXT_URL)
    await page.getByRole('button', { name: 'ครบถ้วน · เสนอตามลำดับชั้น' }).click()
    await confirmDialog(page, 'ยืนยันครบถ้วน', 'เสนอตามลำดับชั้นให้ผู้มีอำนาจพิจารณาอนุมัติต่อไป')

    after = await readCase(page, CASE_NO)
    expect((after?.extensionRequests as Array<Record<string, unknown>>)[0].status).toBe('pending')

    // WIT1121-1122 — ผู้มีอำนาจ (เลขาธิการ ป.ป.ท.) อนุมัติ
    await switchRole(page, 'secretary')
    await page.goto(EXT_URL)
    await page.getByRole('button', { name: /อนุมัติขยายเวลา$/ }).click()
    await confirmDialog(page, 'ยืนยันอนุมัติ', 'เพิ่มช่วงคุ้มครองใหม่')

    // ---- ผลลัพธ์ที่ต้องเกิดจริง ----
    after = await readCase(page, CASE_NO)
    const req = (after?.extensionRequests as Array<Record<string, unknown>>)[0]
    expect(req.status).toBe('approved')
    expect(req.locked).toBe(true) // คบ.14 ฉบับลงนามถูกล็อก
    const episode = after?.episode as { phases: Array<Record<string, unknown>> }
    expect(episode.phases).toHaveLength(2) // เพิ่มช่วงคุ้มครองใหม่ ไม่แก้ทับช่วงเดิม
    expect(episode.phases[0].endedAt).toBeTruthy() // ช่วงเดิมถูกปิด ไม่ถูกลบ/แก้ทับ

    // กลับไปแท็บ 10 (protection-monitor)
    await expect(page.getByText(/อนุมัติขยายเวลา 30 วันแล้ว/)).toBeVisible()
    await expect(page.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ })).toBeVisible()
  })

  test('TC-133 · [Happy] ตีกลับแก้ไข คบ.14 แล้วเสนอใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(120),
    })
    await page.goto(EXT_URL)

    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ภัยยังไม่คลี่คลาย')
    await page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }).click()

    // WIT1118 — ผู้ตรวจพบเอกสารไม่ครบ ส่งกลับแก้ไข
    await switchRole(page, 'supervisor')
    await page.goto(EXT_URL)
    await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('เหตุผลขอขยายไม่ชัดเจน')
    await page.getByRole('button', { name: 'ส่งคืนแก้ไข' }).click()
    await confirmDialog(page, 'ยืนยันส่งคืน', 'จัดทำ คบ.14 เวอร์ชันใหม่')

    let after = await readCase(page, CASE_NO)
    let req = (after?.extensionRequests as Array<Record<string, unknown>>)[0]
    expect(req.status).toBe('returned')
    expect(req.reviewNote).toBe('เหตุผลขอขยายไม่ชัดเจน')

    // WIT1119 — เจ้าหน้าที่แก้ไข คบ.14 เป็นเวอร์ชันใหม่ แล้วเสนอใหม่
    await switchRole(page, 'officer')
    await page.goto(EXT_URL)
    await expect(page.getByText('ส่งคืนแก้ไข', { exact: false }).first()).toBeVisible()
    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('เพิ่มรายละเอียดภัยคุกคามและหลักฐานการเฝ้าระวังเมื่อสัปดาห์ก่อน')
    await page.getByRole('button', { name: 'จัดทำ คบ.14 เวอร์ชันใหม่' }).click()

    after = await readCase(page, CASE_NO)
    req = (after?.extensionRequests as Array<Record<string, unknown>>)[0]
    expect(req.version).toBe(2)
    expect(req.status).toBe('submitted')
    expect((req.previousVersions as unknown[]).length).toBe(1) // เก็บฉบับเดิมไว้ ไม่แก้ทับ
  })

  test('TC-134 · [Negative] ช่วงวันที่ขอขยายทำให้ยอดรวมเกิน 180 วัน', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(170),
    })
    await page.goto(EXT_URL)

    // ค่า default: periodFrom=วันนี้ periodTo=+30 วัน => ขอ 30 วัน แต่เหลือได้แค่ 10 วัน (180-170)
    await expect(page.getByText(/เกินเพดานรวม ขยายได้อีกไม่เกิน/)).toBeVisible()
    await expect(page.getByText(/ขยายได้อีกไม่เกิน 10 วัน/)).toBeVisible()
    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ขอขยายเกินเพดานที่เหลือ')
    await expect(page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' })).toBeDisabled()

    const after = await readCase(page, CASE_NO)
    expect(after?.extensionRequests || []).toEqual([])
  })

  test('TC-135 · [Negative] ถึง/เกินเพดานแล้วยังพยายามจัดทำ คบ.14', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(180),
    })
    await page.goto(EXT_URL)

    await expect(page.getByText(/ห้ามจัดทำ คบ\.14 เพิ่ม/)).toBeVisible()
    await expect(page.getByRole('link', { name: /กลับไปทบทวนผลการคุ้มครอง · เส้นทางส่งต่อกรมคุ้มครองสิทธิฯ/ })).toBeVisible()
    // แบบฟอร์มจัดทำ คบ.14 ต้องไม่แสดงให้กรอกเลย
    await expect(
      page.getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
    ).toHaveCount(0)
  })

  test('TC-136 · [Negative] ระบุช่วงวันขยายย้อนหลัง — ต้องบล็อกและแจ้งเตือน', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(120),
    })
    await page.goto(EXT_URL)

    // ค่า default ของวันเริ่มขยาย = วันถัดจากวันสิ้นสุดคำสั่งเดิม (ต่อเนื่อง ไม่มีคำเตือน)
    await expect(page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' })).toBeEnabled()

    // ระบุวันเริ่มขยายย้อนหลัง 10 วันก่อนวันปัจจุบัน
    await page.getByLabel('ขยายตั้งแต่วันที่').fill(isoDaysFromToday(-10))
    await page.getByLabel('ถึงวันที่').fill(isoDaysFromToday(20))
    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ขอขยายย้อนหลัง')

    // Expected: ระบบต้องไม่อนุญาตให้ย้อนหลังวัน แจ้งเตือนสีแดง และปิดการใช้งานปุ่มส่ง
    await expect(
      page.getByText('ห้ามระบุวันเริ่มขยายย้อนหลังก่อนวันปัจจุบัน — ต้องเริ่มต่อเนื่องจากวันสิ้นสุดคำสั่งเดิม')
    ).toBeVisible()
    await expect(page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' })).toBeDisabled()

    const after = await readCase(page, CASE_NO)
    expect(after?.extensionRequests || []).toEqual([])
  })

  test('TC-137 · [Negative] ไม่อนุมัติขยายเวลา', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: todayIso(),
      episode: episodeWithCumulative(120),
    })
    await page.goto(EXT_URL)

    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ขอขยายเวลาต่ออีก 30 วัน')
    await page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }).click()

    await switchRole(page, 'supervisor')
    await page.goto(EXT_URL)
    await page.getByRole('button', { name: 'ครบถ้วน · เสนอตามลำดับชั้น' }).click()
    await confirmDialog(page, 'ยืนยันครบถ้วน')

    await switchRole(page, 'secretary')
    await page.goto(EXT_URL)
    await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('ไม่มีเหตุจำเป็นเพียงพอ')
    await page.getByRole('button', { name: 'ไม่อนุมัติ' }).click()
    await confirmDialog(page, 'ยืนยันไม่อนุมัติ', 'คงคำสั่งเดิมถึงวันสิ้นสุด')

    const before = await readCase(page, CASE_NO)
    const req = (before?.extensionRequests as Array<Record<string, unknown>>)[0]
    expect(req.status).toBe('rejected')
    // คงคำสั่งเดิม — protectionEndAt/episode ต้องไม่ขยับ
    expect(before?.protectionEndAt).toBe(todayIso())
    expect((before?.episode as { phases: unknown[] }).phases).toHaveLength(1)

    await expect(page.getByText(/คงคำสั่งเดิมถึงวันสิ้นสุด.*เมื่อถึงกำหนดให้ไป/)).toBeVisible()
    await expect(page.getByRole('link', { name: /หน้าจัดทำเรื่องยุติ \(คบ\.15\)/ })).toBeVisible()
  })

  test('TC-138 · [Edge] ช่วงขยายไม่ต่อเนื่องกับคำสั่งเดิม (มีช่องว่างวัน)', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      protectionEndAt: isoDaysFromToday(-5),
      episode: episodeWithCumulative(120),
    })
    await page.goto(EXT_URL)

    // คำสั่งเดิมสิ้นสุดไปแล้ว 5 วันก่อน แต่ระบุเริ่มขยายอีก 4 วันถัดจากนี้ — เกิดช่องว่าง
    await page.getByLabel('ขยายตั้งแต่วันที่').fill(isoDaysFromToday(4))
    await page.getByLabel('ถึงวันที่').fill(isoDaysFromToday(34))
    await page
      .getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่')
      .fill('ขอขยายแบบมีช่องว่าง')

    // Expected: ระบบต้องแจ้งเตือนว่าการคุ้มครองจะขาดช่วง (จำนวนวัน) และปิดปุ่มส่งจนกว่าจะยืนยัน+ระบุเหตุผล
    await expect(page.getByText(/การคุ้มครองจะขาดช่วง\s*8\s*วัน/)).toBeVisible()
    const submitBtn = page.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' })
    await expect(submitBtn).toBeDisabled()

    // ติ๊กยืนยันรับทราบอย่างเดียวยังไม่พอ — ต้องระบุเหตุผลด้วย
    await page.getByText('รับทราบว่าการคุ้มครองจะขาดช่วงและยืนยันดำเนินการต่อ').click()
    await expect(submitBtn).toBeDisabled()

    await page.getByPlaceholder('เหตุผลที่ปล่อยให้การคุ้มครองขาดช่วง (จำเป็นต้องระบุ)').fill('ผู้เชี่ยวชาญประเมินความเสี่ยงล่าช้าจากภารกิจเร่งด่วนอื่น')
    await expect(submitBtn).toBeEnabled()

    await submitBtn.click()
    const after = await readCase(page, CASE_NO)
    const req = (after?.extensionRequests as Array<Record<string, unknown>>)[0]
    expect(req.gapDays).toBe(8)
    expect(req.gapReason).toBe('ผู้เชี่ยวชาญประเมินความเสี่ยงล่าช้าจากภารกิจเร่งด่วนอื่น')
  })
})
