import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { snap } from '../helpers/snapshot'
import { remainingDays } from '../../src/lib/episode'
import { CASE_NO, DOSSIER_URL, confirmDialog, signInModal } from '../journeys/journey-helpers'

/**
 * จับ snapshot (FLOW_SNAPSHOTS=1) ของกล่อง/เส้นแท็บ 10 / 11A / 11B ที่เทสต์เส้นทางหลัก
 * (tabs-10-11b-monitor-review-extension.spec.ts) ยังไม่ได้เดิน — แต่ละ key จับครั้งเดียวทั้งชุดสเปก
 * รันปกติ (ไม่ตั้ง FLOW_SNAPSHOTS) จะเป็นเทสต์เส้นทางธรรมดา
 */
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const DURATION_URL = `/protection-duration?caseNo=${CASE_NO}`
const EXT_URL = `/protection-extension/${encodeURIComponent(CASE_NO)}`
type Rec = Record<string, any>

const S = (page: Page, keys: string | string[], label: string, opts: { route?: string; role?: string } = {}) => snap(page, keys, { label, ...opts })
const daysAgoIso = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}
const latestExt = async (page: Page) => (((await readCase(page, CASE_NO)) as Rec).extensionRequests as Rec[]).at(-1) as Rec

/** Episode ที่ครบเพดานรวม 6 เดือนปฏิทินแล้ว */
function episodeAtCap() {
  let startedAt = daysAgoIso(150)
  for (let c = 150; c <= 260; c++) {
    startedAt = daysAgoIso(c)
    const ep = { id: 'EP-S', openedAt: startedAt, phases: [{ id: 'PH-S', kind: 'MAIN' as const, startedAt }] }
    if (remainingDays(ep as never) === 0) break
  }
  return {
    episode: { id: 'EP-S', openedAt: startedAt, phases: [{ id: 'PH-S', kind: 'MAIN' as const, startedAt, orderRef: 'คบ.8' }] },
    methodTracks: [{ method: 1 as const, status: 'active' as const, startedAt }],
    approvedMethods: [1 as const],
  }
}

async function signKb6Here(page: Page) {
  await page.goto(`/form/6?caseNo=${CASE_NO}`)
  await page.getByTestId('kb6-sign-button').click()
  await confirmDialog(page, 'ยืนยันลงนาม')
  await signInModal(page)
}

async function openReviewList(page: Page) {
  await page.goto(MONITOR_URL)
  await page.getByRole('button', { name: 'ประเมิน' }).click()
  await page.getByRole('button', { name: 'เลือกแขนง ต้องทบทวน' }).click()
  await expect(page.getByText('แนวทางที่เลือกได้หลังผู้บังคับบัญชาเห็นชอบ')).toBeVisible()
}

test.describe('snapshot แท็บ 11A · แขนงที่ออกไปแท็บอื่น', () => {
  test('S11A-1 · เปลี่ยนวิธี (WIT1110) และยุติ (WIT1111) จากรายการแนวทาง', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await openReviewList(page)
    await page.getByRole('link', { name: /เสนออนุมัติและปรับ คบ\.11/ }).click()
    await expect(page).toHaveURL(/\/protection-methods/)
    await expect(page.locator('main, body').first()).toBeVisible()
    await S(page, ['edge:11A:E007', 'overview:11A>08A'], 'เลือกแนวทางเปลี่ยนวิธี/เงื่อนไข เข้าหน้าวิธีคุ้มครอง (แท็บ 08A) เพื่อเสนออนุมัติและปรับ คบ.11')

    await openReviewList(page)
    await page.getByRole('link', { name: /จัดทำเรื่องยุติ \(คบ\.15\)/ }).click()
    await expect(page).toHaveURL(new RegExp(`/termination/${encodeURIComponent(CASE_NO)}`))
    await S(page, ['edge:11A:E008', 'overview:11A>11C'], 'เลือกแนวทางยุติ เข้าหน้าจัดทำเรื่องยุติ คบ.15 (แท็บ 11C)')
  })

  test('S11A-2 · ครบเพดานแต่ยังมีภัย: ส่งต่อกรมคุ้มครองสิทธิฯ ข้อ 14 (WIT1149 -> 08C)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', episodeAtCap())
    await openReviewList(page)
    await page.getByRole('link', { name: /จัดทำเรื่องส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ/ }).click()
    await expect(page).toHaveURL(/\/article14/)
    await S(page, 'overview:11A>08C', 'ครบเพดาน 6 เดือนแต่ยังมีภัย เข้าหน้าส่งต่อกรมคุ้มครองสิทธิฯ ข้อ 14 (แท็บ 08C)')
  })
})

test.describe('snapshot แท็บ 11B · เส้นที่ยังไม่ได้เดิน', () => {
  test('S11B-1 · เริ่มชุดเอกสารขอขยายแล้วเปิดแบบฟอร์ม คบ.14 (E004)', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto(DURATION_URL)
    const dialog = page.getByRole('dialog', { name: 'แจ้งเตือนทบทวนการคุ้มครอง', exact: true })
    await dialog.getByRole('button', { name: 'ภายหลัง', exact: true }).click()
    await page.getByRole('button', { name: 'ขอขยายเวลา', exact: true }).click()
    await expect(page).toHaveURL(DOSSIER_URL)
    await expect.poll(async () => ((await readCase(page, CASE_NO)) as Rec).extensionDocs?.round).toBe(1)
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await expect(page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ })).toBeVisible()
    await S(page, 'edge:11B:E004', 'เริ่มชุด คบ.3/คบ.6 ขอขยายแล้ว เปิดแบบฟอร์ม คบ.14 (ยังไม่กรอกเหตุผล)')
  })

  test('S11B-2 · รองเลขาธิการส่งคืนแก้ไข -> ผลลงหน่วยผ่านธุรการ -> เจ้าหน้าที่เห็นเหตุผล (E024, E028)', async ({ page }) => {
    test.setTimeout(300_000)
    const forward = async (confirmText: string) => {
      await page.goto(EXT_URL)
      await page.getByTestId('kb14-forward-button').first().click()
      await confirmDialog(page, confirmText)
    }
    await seedMockState(page, 'Case 9', 'officer', { protectionEndAt: daysAgoIso(-15) })
    await page.goto(`/form/14?caseNo=${CASE_NO}`)
    await page.getByRole('textbox', { name: /เหตุผลความจำเป็น/ }).fill('ภัยคุกคามยังไม่หมดไป ขอขยายเวลาคุ้มครองต่อเนื่อง')
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.14' }).click()
    await page.getByTestId('kb14-forward-footer').getByTestId('kb14-submit-button').click()
    await confirmDialog(page, 'ยืนยันส่ง')
    await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('supervisor')

    await switchRole(page, 'supervisor')
    await forward('ยืนยันส่งผอ.กอง')
    await switchRole(page, 'director')
    await forward('ยืนยันส่งรองเลขาธิการ')
    await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('deputy_secretary')
    await passSarabanCheckpoint(page, CASE_NO, 'receiver')
    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'deputy_secretary' })

    await page.goto(EXT_URL)
    await page.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืนแก้ไข').fill('ขอให้ระบุเหตุผลความจำเป็นเพิ่มเติม')
    await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
    await confirmDialog(page, 'ยืนยันส่งคืน')
    await expect.poll(async () => (await latestExt(page)).status).toBe('returned')
    await S(page, 'edge:11B:E024', 'รองเลขาธิการส่งคืนแก้ไข ผลรอธุรการขาลงส่งหน่วย', { role: 'deputy_secretary', route: EXT_URL })

    await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
    await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
    await page.goto(EXT_URL)
    await expect(page.getByText(/ส่งคืนแก้ไข · ขอให้ระบุเหตุผลความจำเป็นเพิ่มเติม/)).toBeVisible()
    await S(page, 'edge:11B:E028', 'ผลส่งคืนจากรองเลขาธิการลงถึงหน่วยแล้ว เจ้าหน้าที่เห็นเหตุผลที่ส่งคืน รอแก้ คบ.14', { role: 'officer', route: EXT_URL })
  })

  test('S11B-3 · เลขาธิการส่งคืนแก้ไข (E023)', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 9.6', 'deputy_secretary')
    await signKb6Here(page)
    await expect.poll(async () => (await latestExt(page)).kb6Signatures?.deputy).toBeTruthy()
    await page.goto(EXT_URL)
    await page.getByTestId('kb14-forward-button').first().click()
    await confirmDialog(page, 'ยืนยันส่งเลขาธิการ')
    await expect.poll(async () => (await latestExt(page)).approvalStage).toBe('secretary')

    await switchRole(page, 'secretary')
    await page.goto(EXT_URL)
    await signKb6Here(page)
    await expect.poll(async () => (await latestExt(page)).kb6Signatures?.secretary).toBeTruthy()
    await page.goto(EXT_URL)
    await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('ส่งคืนให้ทบทวนช่วงเวลาที่ขอ')
    await page.getByRole('button', { name: 'ส่งคืนแก้ไข', exact: true }).click()
    await confirmDialog(page, 'ยืนยันส่งคืน')
    await expect.poll(async () => (await latestExt(page)).status).toBe('returned')
    await S(page, 'edge:11B:E023', 'เลขาธิการส่งคืนแก้ไข ผลรอธุรการขาลงส่งหน่วย', { role: 'secretary', route: EXT_URL })
  })
})
