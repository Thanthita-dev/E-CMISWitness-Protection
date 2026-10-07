import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState } from '../helpers/seed'

/**
 * Sheet 10 · WIT1001 → WIT1013 — ติดตามและรายงานผลการคุ้มครอง (คบ.13)
 *
 * ผัง: WIT1001/1002 รับ Episode เดียว/แสดง Phase+วันสะสมต่อเนื่อง → WIT1003 แจ้งรอบ+ตรวจเพดานรวม
 *      → WIT1004 เปิดรอบ (รวบรวมผลทุกวิธี+หลักฐาน) → WIT1005 จัดทำ คบ.13
 *      → WIT1006/1007 ลงนาม (เจ้าหน้าที่/พยาน — ทำที่รายการแบบฟอร์มในแฟ้ม) → WIT1008 รับ+ตรวจผล
 *      → WIT1009 บันทึกสถานะล่าสุด → WIT1010 ล็อกรอบ → WIT1011 แยกแขนง WIT1012 (คุ้มครองต่อ) / WIT1013 (ทบทวนที่ 11A)
 *
 * หน้าเดียว (Kb13MonitorPanel) เป็น wizard ที่สลับการ์ดตามขั้นที่ยังไม่เสร็จ — ใช้ casePatch
 * ตั้งข้อมูลรอบรายงานให้ตรงกับสถานะที่แต่ละ TC ต้องการ แทนที่จะไล่คลิกทุกขั้นทุกครั้ง (การลงนามจริง
 * ทำที่รายการแบบฟอร์มในแฟ้ม ไม่ใช่ที่แผงนี้ ตามกติกาเดิมของระบบ)
 */

const CASE_NO = 'WP-2569-000501'
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** วันที่ N วันก่อนวันนี้ (ISO) — ใช้คำนวณ Episode ให้ได้ยอดวันสะสมตรงตามที่แต่ละ TC ต้องการ ไม่ผูกกับวันที่รันเทสต์ */
const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

/** Episode วิธีที่ 1 เดียว Phase MAIN เปิดต่อเนื่องมา ให้ยอดสะสม ณ วันนี้ = cumulativeDays วันพอดี */
function activeEpisode(cumulativeDays: number, idSuffix: string) {
  const startedAt = daysAgoIso(cumulativeDays - 1)
  return {
    episode: {
      id: `EP-${idSuffix}`,
      openedAt: startedAt,
      phases: [{ id: `PH-${idSuffix}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.8' }],
    },
    methodTracks: [{ method: 1 as const, status: 'active' as const, startedAt }],
    approvedMethods: [1 as const],
  }
}

/** รอบรายงานลงนามครบสองช่อง พร้อมเนื้อหาจัดทำแล้ว — จุดตั้งต้นของ WIT1008 เป็นต้นไป */
const fullySignedRound = (overrides: Record<string, unknown> = {}) => ({
  id: 'RPT-TEST',
  period: '09/2569',
  periodFrom: '2026-08-11',
  periodTo: '2026-09-10',
  submittedAt: '10/09/2569 12:24',
  submittedBy: 'นางสาวอรุณี ใจมั่น',
  summary: 'ผลปฏิบัติงวด 09/2569 เป็นไปตามแผน ไม่มีเหตุการณ์ผิดปกติ',
  incidentCount: 0,
  evidenceRefs: [],
  orderRef: 'คบ.8',
  orderDays: 30,
  operators: 'นางสาวอรุณี ใจมั่น',
  methods: [1],
  officerSignedAt: '10/09/2569 12:32',
  officerSignedBy: 'นางสาวอรุณี ใจมั่น',
  witnessSignedAt: '10/09/2569 12:32',
  witnessSignedBy: 'สมชาย ใจดี',
  ...overrides,
})

test.describe('Sheet 10 · WIT1001-1013 — ติดตามและรายงานผล คบ.13', () => {
  test('TC-117 · [Happy] จัดทำ คบ.13 ตามรอบ ลงนามครบ ล็อกรอบ และกำหนดรอบถัดไป', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      monthlyReports: [fullySignedRound()],
    })
    await page.goto(MONITOR_URL)

    // WIT1008 — รับรายงานและตรวจผลปฏิบัติ (ลงนามครบสองช่องแล้ว)
    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByRole('button', { name: 'รับรายงานและตรวจผล' })).toBeEnabled()
    await page.getByRole('button', { name: 'รับรายงานและตรวจผล' }).click()
    await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()

    // WIT1009 — บันทึกสถานะล่าสุด
    await page.getByRole('button', { name: 'ต่ำ', exact: true }).click()
    await page.getByLabel('ปัญหา/อุปสรรคที่พบ').fill('ไม่พบปัญหา')
    await page.getByLabel('ข้อเสนอสำหรับรอบถัดไป').fill('คงมาตรการเดิมต่อเนื่อง')
    await page.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }).click()
    await expect(page.getByText(/บันทึกสถานะล่าสุดแล้ว/)).toBeVisible()

    // WIT1010 — ล็อกเป็นรอบรายงานใหม่ (ปุ่มในโมดัล ต่างจากปุ่มเปิดโมดัลในประวัติรอบที่ข้อความซ้ำกัน)
    await page.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }).click()
    await confirmDialog(page, 'ยืนยัน', 'ล็อกฉบับลงนาม')

    // WIT1011/1012 — ประเมินแล้วเลือก "ยังคุ้มครองต่อ" กำหนดรอบถัดไปและเปิดรอบใหม่
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' }).click()
    await confirmDialog(page, 'ยืนยัน', 'เปิดรอบรายงานใหม่')

    await expect(page.getByText(/ทั้งหมด 2 รอบ/)).toBeVisible()

    const after = await readCase(page, CASE_NO)
    const rounds = after?.monthlyReports as Array<Record<string, unknown>>
    expect(rounds).toHaveLength(2)
    expect(rounds[0].lockedAt).toBeTruthy()
    expect(rounds[1].lockedAt).toBeFalsy()
    expect(after?.nextReportDueAt).toBeTruthy()
  })

  test('TC-118 · [Happy] แสดง Phase ปัจจุบันและวันสะสมต่อเนื่องข้าม Phase โดยไม่รีเซ็ต', async ({ page }) => {
    const mainStart = new Date()
    mainStart.setDate(mainStart.getDate() - 44) // Phase เปิดอยู่ นับ diff+1 = 45 วัน
    const tempStart = new Date(mainStart)
    tempStart.setDate(tempStart.getDate() - 20) // Phase ปิดแล้ว นับ diff = 20 วันพอดี

    await seedMockState(page, 'Case 1.13', 'officer', {
      episode: {
        id: 'EP-TC118',
        openedAt: tempStart.toISOString(),
        phases: [
          { id: 'PH-TC118-1', kind: 'TEMPORARY', startedAt: tempStart.toISOString(), endedAt: mainStart.toISOString(), orderRef: 'คบ.5' },
          { id: 'PH-TC118-2', kind: 'MAIN', startedAt: mainStart.toISOString(), orderRef: 'คบ.8' },
        ],
      },
      methodTracks: [{ method: 1, status: 'active', startedAt: mainStart.toISOString() }],
      approvedMethods: [1],
    })
    await page.goto(MONITOR_URL)

    // WIT1001/1002 อยู่ในการ์ดแรกของ wizard — คลิกหมุด WIT1001 เพื่อกลับมาดูการ์ดนี้ถ้า wizard เดินไปการ์ดอื่นแล้ว
    await page.getByRole('listitem').filter({ hasText: 'รับ Episode เดียว (TEMPORARY/MAIN)' }).getByRole('button').click()

    await expect(page.getByText('Phase ปัจจุบัน', { exact: true })).toBeVisible()
    await expect(page.getByText('คำร้องหลัก (MAIN)').first()).toBeVisible()
    await expect(page.getByText('65 วัน', { exact: true })).toBeVisible()
    await expect(page.getByText(/ชั่วคราว \(TEMPORARY\)/)).toBeVisible()
  })

  test('TC-119 · [Happy] ใกล้ครบกำหนดรอบ ระบบแจ้งเตือนและส่งเรื่องไปทบทวนที่แท็บ 11A พร้อมข้อมูลครบ', async ({ page }) => {
    const dueAt = new Date()
    dueAt.setDate(dueAt.getDate() + 7)

    await seedMockState(page, 'Case 1.13', 'officer', {
      nextReportDueAt: dueAt.toISOString(),
      monthlyReports: [
        fullySignedRound({
          reviewedAt: '10/09/2569 12:36',
          reviewedBy: 'นางสาวอรุณี ใจมั่น',
          riskLevel: 'ต่ำ',
          issues: 'ไม่พบปัญหา',
          nextProposal: 'คงมาตรการเดิม',
          lockedAt: '10/09/2569 12:46',
        }),
      ],
    })
    await page.goto(MONITOR_URL)

    // WIT1003 — แจ้งเตือนก่อนครบกำหนด
    await page.getByRole('listitem').filter({ hasText: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม' }).getByRole('button').click()
    await expect(page.getByText(/อีก 7 วัน/)).toBeVisible()

    // WIT1011/1013 — เลือกแขนง "ต้องทบทวน" ส่งไปแท็บ 11A พร้อมข้อมูลครบ
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmDialog(page, 'ยืนยัน')

    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
    await expect(page.getByText(/ความเสี่ยง.*คำสั่ง/).first()).toBeVisible()

    const after = await readCase(page, CASE_NO)
    const handoff = after?.reviewHandoff as Record<string, unknown>
    expect(handoff).toBeTruthy()
    expect(handoff.riskLevel).toBeTruthy()
    expect(handoff.orderRef).toBeTruthy()
    expect(handoff.cumulativeDays).toBeDefined()
    expect(handoff.remainingDays).toBeDefined()
  })

  test('TC-120 · [Negative] จัดทำ คบ.13 โดยพยานยังไม่ลงนามรับรอง — ปิดรอบไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      monthlyReports: [
        fullySignedRound({ witnessSignedAt: undefined, witnessSignedBy: undefined }),
      ],
    })
    await page.goto(MONITOR_URL)

    // wizard ค้างที่การ์ดลายมือชื่อ เพราะ WIT1007 ยังไม่เสร็จ — แจ้งชัดว่ารอพยานลงนาม
    await expect(page.getByText('รอพยานลงนามรับรอง')).toBeVisible()

    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    const receiveButton = page.getByRole('button', { name: 'รอลงนามครบทั้งสองช่องก่อน' })
    await expect(receiveButton).toBeVisible()
    await expect(receiveButton).toBeDisabled()

    const after = await readCase(page, CASE_NO)
    const round = (after?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.reviewedAt).toBeFalsy()
    expect(round.lockedAt).toBeFalsy()
  })

  test('TC-121 · [Negative] ผลปฏิบัติไม่ตรงกับวิธีที่ได้รับอนุมัติ — ระบบต้องแจ้งความไม่สอดคล้องและบันทึกเป็นประเด็น', async ({ page }) => {
    await seedMockState(page, 'Case 1.13', 'officer', {
      approvedMethods: [1],
      monthlyReports: [fullySignedRound({ methods: [1, 2] })],
    })
    await page.goto(MONITOR_URL)

    await page.getByRole('button', { name: 'ตรวจรับรายงาน' }).click()
    await expect(page.getByText(/วิธีที่ได้รับอนุมัติ:.*วิธีที่ 1 —/)).toBeVisible()
    await expect(page.getByText(/วิธีที่รายงานว่าปฏิบัติจริง:.*วิธีที่ 2 —/)).toBeVisible()

    // Expected: ระบบแจ้งความไม่สอดคล้องให้เห็นชัดเจน พร้อมชี้วิธีที่ปฏิบัติจริงเกินขอบเขตที่อนุมัติ
    await expect(page.getByText(/ไม่สอดคล้อง|ไม่ตรงตามที่อนุมัติ/)).toBeVisible()
    await expect(page.getByText(/ปฏิบัติวิธีที่ 2.*ซึ่งไม่ได้รับอนุมัติ/)).toBeVisible()

    // Expected: ต้องบันทึกเป็นประเด็น/เหตุสำคัญก่อนจึงดำเนินต่อได้ — ปุ่มตรวจรับต้องถูกล็อกไว้จนกว่าจะกรอก
    const acceptButton = page.getByRole('button', { name: 'รับรายงานและตรวจผล' })
    await expect(acceptButton).toBeDisabled()

    const issueField = page.getByLabel(/บันทึกประเด็น\/เหตุสำคัญ/)
    await issueField.fill('ปฏิบัติวิธีที่ 2 (จัดสถานที่ปลอดภัย) โดยไม่ได้รับอนุมัติ — เสนอทบทวนขออนุมัติเปลี่ยนวิธี')
    await expect(acceptButton).toBeEnabled()

    await acceptButton.click()
    await expect(page.getByText(/ตรวจรับแล้วโดย/)).toBeVisible()

    // Expected: ประเด็นความไม่สอดคล้องต้องถูกบันทึกลงในรอบ คบ.13 เพื่อให้ไหลต่อไปที่การทบทวน (แท็บ 11A)
    const after = await readCase(page, CASE_NO)
    const round = (after?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.reviewedAt).toBeTruthy()
    expect(round.issues).toContain('วิธีที่ 2')
  })

  test('TC-122 · [Negative] ใกล้ครบเพดาน 180 วัน — ระบบต้องบังคับให้เข้าทบทวนที่ 11A ก่อนดำเนินการต่อ', async ({ page }) => {
    // สะสม 176 วันจากเพดาน 180 วัน = เหลือ 4 วัน ≤ 7 วัน (PROTECTION_REVIEW_BLOCK_DAYS) ต้องบล็อกแขนง WIT1012
    const near = activeEpisode(176, 'TC122')
    await seedMockState(page, 'Case 1.13', 'officer', {
      ...near,
      monthlyReports: [
        fullySignedRound({
          reviewedAt: '10/09/2569 12:36',
          reviewedBy: 'นางสาวอรุณี ใจมั่น',
          riskLevel: 'ต่ำ',
          nextProposal: 'คงมาตรการเดิม',
          lockedAt: '10/09/2569 12:46',
        }),
      ],
    })
    await page.goto(MONITOR_URL)

    // เส้นทางลัดที่เคยข้ามการทบทวนได้ — ปุ่ม "เปิดรอบรายงานงวด..." ในประวัติรอบต้องถูกบล็อกไว้เช่นกัน (การ์ด WIT1004 คือหน้าเริ่มต้นเพราะรอบก่อนหน้าปิดแล้ว)
    const openRoundShortcut = page.getByRole('button', { name: /เปิดรอบรายงานงวด/ })
    await expect(openRoundShortcut).toBeDisabled()
    await expect(page.getByText(/เปิดรอบใหม่ตรงจากที่นี่ไม่ได้/)).toBeVisible()

    // WIT1003 — แจ้งเตือนใกล้ครบเพดาน (คงพฤติกรรมเดิมของป้ายเตือนนี้ไว้)
    await page.getByRole('listitem').filter({ hasText: 'แจ้งรอบ คบ.13 และตรวจเพดานรวม' }).getByRole('button').click()
    await expect(page.getByText(/ใกล้ครบเพดาน — เหลือ 4 วัน/)).toBeVisible()

    // WIT1011 — เปิดโมดัลประเมิน
    await page.getByRole('button', { name: 'ประเมิน' }).click()
    // ระบบแนะนำแขนงทบทวนเป็นค่าเริ่มต้น (— แนะนำ) และแสดงคำเตือนบังคับทบทวน
    await expect(page.getByText(/ต้องทบทวน[\s\S]*แนะนำ/)).toBeVisible()
    await expect(page.getByText(/ต้องเข้าสู่การทบทวนผลการคุ้มครองก่อนดำเนินการต่อ/)).toBeVisible()

    // Expected: แขนง "ยังคุ้มครองต่อ" (WIT1012) ต้องถูกบล็อก เลือกไม่ได้ และไม่มีปุ่มตั้งรอบถัดไปให้กดผ่าน
    const continueTab = page.getByRole('button', { name: 'เลือกแขนง ยังคุ้มครองต่อ' })
    await expect(continueTab).toBeDisabled()
    await expect(page.getByRole('button', { name: 'ตั้งรอบถัดไปและเปิดรอบใหม่' })).toHaveCount(0)

    // ทางเดียวที่เหลือคือแขนง WIT1013 — ส่งทบทวนเข้าแท็บ 11A
    await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
    await page.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }).click()
    await confirmDialog(page, 'ยืนยัน')

    await expect(page.getByText(/ส่งทบทวนแล้วเมื่อ/)).toBeVisible()
    await expect(page.getByRole('link', { name: 'ทบทวนผลการคุ้มครอง', exact: true }).first()).toHaveAttribute(
      'href',
      `/protection-review/${CASE_NO}`
    )

    const after = await readCase(page, CASE_NO)
    expect(after?.reviewHandoff).toBeTruthy()
  })

  test('TC-123 · [Edge] หลายวิธีคุ้มครองพร้อมกัน (1, 2, 4) — คบ.13 รวมผลทุกวิธีในรอบเดียว', async ({ page }) => {
    const nextDue = new Date()
    nextDue.setDate(nextDue.getDate() + 30)
    await seedMockState(page, 'Case 1.13', 'officer', {
      methodTracks: [
        { method: 1, status: 'active', startedAt: '2026-09-10T00:00:00.000Z' },
        { method: 2, status: 'active', startedAt: '2026-09-10T00:00:00.000Z' },
        { method: 4, status: 'active', startedAt: '2026-09-10T00:00:00.000Z' },
      ],
      approvedMethods: [1, 2, 4],
      monthlyReports: [],
      nextReportDueAt: nextDue.toISOString(),
    })
    await page.goto(MONITOR_URL)

    // WIT1004 — เปิดรอบรายงาน พร้อมหลักฐาน/รายงานภายนอกของวิธีที่ 4
    await page.getByRole('button', { name: /เปิดรอบรายงานงวด/ }).click()
    await page
      .getByLabel(/หลักฐาน\/บันทึกที่รวบรวมได้/)
      .fill('รายงานหน่วยงานภายนอกตามข้อ 15(4) ของวิธีที่ 4 — สน.ประสานงานพื้นที่ 12/09/2569')
    await page.locator('button.w-full').filter({ hasText: 'เปิดรอบรายงานงวด' }).click()

    // WIT1005 — จัดทำ คบ.13 รวมทุกวิธี (ค่าตั้งต้นติ๊กครบตามวิธีที่ ACTIVE อยู่แล้ว)
    await expect(page.getByRole('button', { name: 'วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ' })).toHaveClass(/border-blue/)
    await expect(page.getByRole('button', { name: 'วิธีที่ 2 — จัดสถานที่ปลอดภัย' })).toHaveClass(/border-blue/)
    await expect(page.getByRole('button', { name: 'วิธีที่ 4 — ประสานหน่วยงานอื่นให้คุ้มครอง' })).toHaveClass(/border-blue/)
    await page.getByLabel('สรุปผลการดำเนินการ').fill('รวมผลปฏิบัติทั้ง 3 วิธีในรอบเดียวกัน')
    await page.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' }).click()

    const after = await readCase(page, CASE_NO)
    const round = (after?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.methods).toEqual([1, 2, 4])
    expect((round.evidenceRefs as string[])[0]).toContain('วิธีที่ 4')
  })

  test('TC-124 · [Edge] แก้ไข คบ.13 ที่ลงนามและปิดรอบแล้ว — ระบบล็อกไม่ให้แก้ทับ', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(MONITOR_URL)

    // รอบที่ปิดแล้วแสดงเป็นข้อความอย่างเดียว ไม่มีแบบฟอร์มแก้ไขให้กดเลย
    await expect(page.getByText('ปิดรอบแล้ว')).toBeVisible()
    await expect(page.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' })).toHaveCount(0)
    await expect(page.locator('textarea')).toHaveCount(0)
    // ทางเดียวที่ไปต่อได้คือรอบ/เวอร์ชันใหม่ผ่าน WIT1011 (ประเมิน)
    await expect(page.getByRole('button', { name: 'ประเมิน' })).toBeVisible()

    const before = await readCase(page, CASE_NO)
    const round = (before?.monthlyReports as Array<Record<string, unknown>>)[0]
    expect(round.lockedAt).toBeTruthy()
    const originalSummary = round.summary
    await page.waitForTimeout(50)
    const after = await readCase(page, CASE_NO)
    expect((after?.monthlyReports as Array<Record<string, unknown>>)[0].summary).toBe(originalSummary)
  })
})
