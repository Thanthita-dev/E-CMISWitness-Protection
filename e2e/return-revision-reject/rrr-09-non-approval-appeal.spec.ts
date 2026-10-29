import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { checkNoticeReady, completeNoticeDetails } from '../helpers/noticeDocuments'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, fieldAfterLabel } from '../journeys/journey-helpers'
import { authStateForAccount, mockStateAccountForRole } from '../../src/lib/mockStateAccounts'
import { userNameById } from '../../src/lib/constants'
import type { UserRole } from '../../src/types/user'

/**
 * Return / Revision / Reject · แท็บ 09A "ไม่อนุมัติและแจ้งสิทธิอุทธรณ์" และ 09B "อุทธรณ์ / แฟ้มเสนอคณะกรรมการ"
 *
 * จุดเริ่มต้น: แฟ้มที่เลขาธิการฯ ไม่อนุมัติแล้ว (activity7State = 'rejected')
 * ทดสอบลูปเต็ม — ตีกลับ/ปฏิเสธ → บันทึกเจ้าของ/ขั้น/เหตุผล และเก็บของเดิมไว้ → แก้แล้วเสนอใหม่ → ผู้ตรวจที่ถูกต้อง → ผ่าน
 *
 * 09A
 *   RRR-09A-1  WIT0903 → WIT0904 → WIT0905  ร่าง คบ.10: เจ้าหน้าที่เสนอ → รองเลขาธิการฯ ส่งกลับ → แก้แล้วเสนอใหม่ → กลั่นกรองผ่าน
 *   RRR-09A-2  WIT0904 / WIT0905           สิทธิของแต่ละบทบาทต่อด่านกลั่นกรอง (ไม่ใช่ผู้ตรวจ = ไม่มีปุ่ม) + เหตุผลส่งกลับบังคับ
 *   RRR-09A-3  WIT0906 → WIT0923 → WIT0907 นำส่ง คบ.10 ไม่สำเร็จ/ตีกลับ → ส่งใหม่ → พยานรับ (นับ 30 วันจากวันรับจริง)
 *   RRR-09A-4  WIT0908 / WIT0909           ในกรอบ 30 วันปิดเรื่องไม่ได้ · พ้นกรอบแล้วปิดเรื่องได้ และปิดแล้วรับอุทธรณ์ไม่ได้
 *
 * 09B
 *   RRR-09B-1  WIT0914 → WIT0931 → WIT0915-WIT0921  อุทธรณ์เกิน 30 วัน ไม่ปัดตก → ผบช.รับไว้ → ลำดับชั้น → คณะกรรมการยกคำร้อง → หนังสือแจ้งผล
 *   RRR-09B-2  WIT0920 → WIT0922 → WIT0935          คณะกรรมการเปลี่ยนคำสั่ง → เปิด คบ.6 รุ่นใหม่ ขณะที่ คบ.10 ฉบับเดิมแก้ไม่ได้
 *   RRR-09B-3  WIT0915-WIT0918                      ผู้ตรวจแต่ละชั้นส่งแฟ้มอุทธรณ์กลับ (test.fixme — ยังไม่มีทั้งปุ่มและ action)
 *
 * หมายเหตุสถานะโค้ด (ตรวจเทียบ HEAD):
 *  - WIT0904/0905/0909 และ WIT0914/0915-0918/0921 ที่ gap-analysis-reject-flow.md ระบุว่า "ขาด" ถูกเติมครบแล้ว
 *  - การรับอุทธรณ์ (fileAppeal) รวมขั้นตรวจกรอบ 30 วันเข้าไปแล้ว: แฟ้มเข้า officer_opinion ทันที (เกินกรอบ = late_pending)
 *    การ์ด "สิทธิยื่นอุทธรณ์ภายใน 30 วัน" ในหน้าแฟ้มเข้าไม่ถึงแล้ว — รับอุทธรณ์ผ่าน /appeal-folder/:caseNo
 *  - ขั้น received + ปุ่ม "ยืนยันแฟ้มครบถ้วน" (appeal-check) เหลือไว้รองรับแฟ้มเก่าเท่านั้น คำอุทธรณ์ใหม่ไม่ค้างที่ขั้นนี้
 *  - เมื่อรับอุทธรณ์ ระบบจัดทำ คบ.3/คบ.6 "บันทึกเพิ่มเติม (อุทธรณ์)" ให้ทันที (appealFolder.addendum) และล็อกเมื่อเจ้าหน้าที่เสนอ
 *  - ผอ.ลงนามเสนอ (director → deputy) และมติคณะกรรมการ (ลงหน่วย) ต้องผ่านธุรการ (saraban flow 'appeal') ก่อนผู้รับดำเนินการต่อ
 */

const FOLDER = `/appeal-folder/${encodeURIComponent(CASE_NO)}`
const F10 = `/form/10?caseNo=${CASE_NO}`

const isoDay = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString()
const popup = (page: Page) => page.locator('.swal2-popup:not(.swal2-toast)')
type Rec = Record<string, any>
const caseOf = async (page: Page) => (await readCase(page, CASE_NO)) as Rec
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mock') })
const history = (c: Rec): Rec[] => (c.assignmentHistory || []) as Rec[]

/** ชื่อผู้ถือบทบาทที่ระบบเขียนลง owner ตรง ๆ จากค่าคงที่ ACTOR (ไม่ขึ้นกับบัญชีที่ล็อกอิน) */
const DEPUTY = userNameById('DSEC-001')
const SECRETARY = userNameById('SEC-001')
const SUPERVISOR = userNameById('SUP-001')

/** สลับทั้งบัญชี (ผู้ใช้ + หน่วยงาน) ตามบทบาท — ธุรการต้องอยู่หน่วยเดียวกับผู้รับจึงลงทะเบียนได้ */
async function switchAccount(page: Page, role: string) {
  const raw = await page.evaluate(() => localStorage.getItem('ecmis-auth-storage'))
  const auth = JSON.parse(raw as string)
  const account = mockStateAccountForRole(role as UserRole)
  auth.state = account ? authStateForAccount(account, auth.state) : { ...auth.state, currentRole: role }
  await page.addInitScript((v: string) => localStorage.setItem('ecmis-auth-storage', v), JSON.stringify(auth))
  await page.reload()
}

/** ผ่านธุรการตามลำดับ (ลงเลขส่ง/เลขรับ) แล้วกลับหน้าแฟ้ม — ด่านใดไม่มีงานให้เทสต์ล้มเหลว ไม่ข้าม */
async function clerks(page: Page, order: Array<'receiver' | 'secretary_receiver'>) {
  for (const clerk of order) {
    await switchAccount(page, clerk)
    await page.goto(`/saraban/${encodeURIComponent(CASE_NO)}`)
    const workspace = page.getByTestId('saraban-workspace')
    await workspace.waitFor()
    await expect(workspace.getByTestId('saraban-no-task'), `ธุรการ ${clerk} ไม่มีงานที่ด่านนี้`).toHaveCount(0)
    await passSarabanCheckpoint(page, CASE_NO, clerk)
  }
  await page.goto(FOLDER)
}

/** WIT0904 — เจ้าหน้าที่ตรวจร่าง คบ.10 แล้วเสนอรองเลขาธิการฯ */
async function officerSubmitsKb10(page: Page, note: string) {
  await page.getByTestId('kb10-readiness-note').fill(note)
  await page.getByTestId('kb10-submit-screening').click()
  await confirmDialog(page, 'ยืนยันเสนอกลั่นกรอง', 'รองเลขาธิการฯ')
}

/** ร่าง คบ.10 ขาขึ้นหน่วย → สำนักงานเลขาธิการ ผ่านธุรการสองฝั่ง แล้วสลับเป็นรองเลขาธิการฯ */
async function kb10UpToDeputy(page: Page) {
  await passSarabanCheckpoint(page, CASE_NO, 'receiver')
  await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver', { afterRole: 'deputy_secretary' })
  await page.goto(DOSSIER_URL)
}

/** WIT0912 — เจ้าหน้าที่รับคำอุทธรณ์เป็นหนังสือที่ /appeal-folder (ยื่นเกินกรอบต้องมีเหตุผลความล่าช้า) */
async function officerFilesAppeal(page: Page, reason: string, registryNo: string, lateReason?: string) {
  await page.goto(FOLDER)
  await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
  await page.getByTestId('appeal-intake-channel-letter').click()
  await page.getByTestId('appeal-intake-registry-no').fill(registryNo)
  await page.getByTestId('appeal-intake-evidence-file').setInputFiles(pdf(`หนังสืออุทธรณ์_${registryNo.replace('/', '-')}.pdf`))
  await page.getByTestId('appeal-intake-reason').fill(reason)
  if (lateReason) {
    // ยื่นเกินกรอบ — ขาดเหตุผลความล่าช้าแล้วจอยืนยันต้องไม่ขึ้น (ห้ามปัดตก แต่ต้องมีเหตุผล)
    await page.getByTestId('appeal-intake-submit').click()
    await expect(popup(page)).toHaveCount(0)
    await page.getByTestId('appeal-late-reason').fill(lateReason)
  }
  await page.getByTestId('appeal-intake-submit').click()
  await confirmDialog(page, 'ยืนยัน')
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
}

/** WIT0915-WIT0918 — บันทึกความเห็นหนึ่งชั้นแล้วส่งต่อ (สลับบทบาทก่อนถ้าระบุ) */
async function giveOpinion(page: Page, role: string | null, note: string, expectedText?: string | RegExp) {
  if (role) await switchRole(page, role)
  await page.getByTestId('appeal-opinion-note').fill(note)
  await page.getByTestId('appeal-opinion-submit').click()
  await confirmDialog(page, 'ยืนยัน', expectedText)
}

/** WIT0915 → WIT0919 — เดินลำดับชั้นจากชั้นเจ้าหน้าที่จนฝ่ายเลขานุการบรรจุวาระ (หน้าแฟ้มต้องอยู่ที่ officer_opinion) */
async function walkHierarchyToAgenda(page: Page) {
  await giveOpinion(page, null, 'ตรวจข้อเท็จจริงและเอกสารแล้ว', 'ผบช.ชั้นต้น')
  await giveOpinion(page, 'supervisor', 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ', 'ผอ.สำนัก/กอง')
  await giveOpinion(page, 'director', 'ตรวจแล้ว ลงนามเสนอ', 'รองเลขาธิการฯ')
  // ผอ.ลงนามเสนอ = แฟ้มออกจากหน่วยไปสำนักงานเลขาธิการ ต้องผ่านธุรการหน่วย → ธุรการ สลธ.
  await clerks(page, ['receiver', 'secretary_receiver'])
  await giveOpinion(page, 'deputy_secretary', 'กลั่นกรองแฟ้มแล้ว', 'ผ่านการกลั่นกรองแล้ว')
  await switchRole(page, 'secretary')
  // เลขาธิการฯ เป็นผู้ส่งเสนอคณะกรรมการ ไม่ใช่ผู้วินิจฉัย — ปุ่มชั้นนี้คือ "ส่งเสนอคณะกรรมการ"
  await expect(page.getByTestId('appeal-opinion-secretary').getByTestId('appeal-opinion-submit')).toContainText('ส่งเสนอคณะกรรมการ')
  await giveOpinion(page, null, 'รับทราบ ส่งเสนอคณะกรรมการ', 'ฝ่ายเลขานุการคณะกรรมการ')
  await switchRole(page, 'committee')
  await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
  await page.getByTestId('appeal-agenda-submit').click()
  await confirmDialog(page, 'ยืนยันบรรจุวาระ', 'คณะกรรมการ ป.ป.ท. วินิจฉัย')
  await expect.poll(async () => (await caseOf(page)).appealFolder?.agendaAt).toBeTruthy()
}

/** WIT0920 — คณะกรรมการบันทึกมติ (เลขที่มติ/สาระต้องกรอกก่อน จอยืนยันจึงขึ้น) */
async function committeeResolves(page: Page, outcome: 'uphold' | 'overturn', resolutionNo: string) {
  await page.getByTestId('appeal-resolution-uphold').click()
  await expect(popup(page)).toHaveCount(0) // ยังไม่กรอกเลขที่มติ
  await page.getByTestId('appeal-resolution-no').fill(resolutionNo)
  await page.getByTestId('appeal-resolution-note').fill('พิจารณาพยานหลักฐานแล้ว')
  await page.getByTestId(`appeal-resolution-${outcome}`).click()
  await confirmDialog(page, outcome === 'uphold' ? 'ยืนยันมติยกคำร้อง' : 'ยืนยันมติเปลี่ยนแปลงคำสั่ง')
  // มติลงหน่วย: ธุรการ สลธ. ออกเลขส่ง → ธุรการหน่วยลงเลขรับ ก่อนเจ้าหน้าที่ดำเนินการต่อ
  await clerks(page, ['secretary_receiver', 'receiver'])
}

/** WIT0921 / WIT0922 — เจ้าหน้าที่บันทึกหนังสือแจ้งผลอุทธรณ์ + หลักฐานการรับ */
async function officerRecordsAppealNotice(page: Page, registryNo: string, expectedText: string | RegExp) {
  await switchAccount(page, 'officer')
  await expect(page.getByTestId('appeal-notice-form')).toBeVisible()
  await page.getByTestId('appeal-notice-document').fill(`หนังสือแจ้งผลอุทธรณ์_${registryNo.replace('/', '-')}.pdf`)
  await page.getByTestId('appeal-notice-registry').fill(registryNo)
  await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
  await page.getByTestId('appeal-notice-submit').click()
  await confirmDialog(page, 'ยืนยันบันทึกหนังสือแจ้งผล', expectedText)
  await expect(page.getByTestId('appeal-notice-done')).toBeVisible()
}

const dispatchCard = (page: Page) => page.getByTestId('notice-dispatch-card')

// ======================================================================
// 09A
// ======================================================================
test.describe('RRR 09A · ไม่อนุมัติและแจ้งสิทธิอุทธรณ์ — ตีกลับ/แก้ไข/ปิดเรื่อง', () => {
  test('RRR-09A-1 · WIT0904-0905 ร่าง คบ.10: รองเลขาธิการฯ ส่งกลับ → เจ้าหน้าที่แก้แล้วเสนอใหม่ → กลั่นกรองผ่าน → เข้ารอบลงนามเลขาธิการฯ', async ({ page }) => {
    test.setTimeout(300_000)
    // Case 4 = เลขาธิการฯ ไม่อนุมัติแล้ว ยังเป็นร่าง คบ.10 (nonApprovalStep 0, ไม่มีฉบับลงนาม)
    await seedMockState(page, 'Case 4', 'officer')
    await page.goto(DOSSIER_URL)
    const initial = await caseOf(page)
    expect(initial.activity7State).toBe('rejected')
    expect(initial.nonApprovalStep).toBe(0)
    const officerName = initial.assignedOfficer as string

    const note1 = 'ตรวจร่าง คบ.10 รอบแรก — เหตุผล ฐานการพิจารณา และสิทธิอุทธรณ์ 30 วัน ครบ'
    const returnNote = 'ข้อความเหตุผลไม่ตรงกับผลพิจารณาไม่อนุมัติต้นทาง และยังไม่ระบุสถานที่ยื่นอุทธรณ์'
    const note2 = 'แก้ข้อความเหตุผลให้ตรงผลพิจารณา และเพิ่มสถานที่ยื่นอุทธรณ์ตามข้อสังเกตแล้ว'

    await test.step('WIT0904 · เจ้าหน้าที่เสนอกลั่นกรองรอบแรก — ขึ้นสถานะรอรองเลขาธิการฯ และอยู่ระหว่างธุรการ', async () => {
      await expect(page.getByTestId('kb10-readiness')).toBeVisible()
      await officerSubmitsKb10(page, note1)
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(1)
      expect(c.kb10ReadinessNote).toBe(note1)
      expect(c.kb10SignedAt).toBeFalsy()
      // ร่างยังอยู่ระหว่างธุรการ — เจ้าหน้าที่ไม่เห็นปุ่มเสนอซ้ำ และรองเลขาธิการฯ ยังกลั่นกรองไม่ได้
      await expect(page.getByTestId('kb10-in-transit')).toBeVisible()
      await expect(page.getByTestId('kb10-readiness')).toHaveCount(0)
      await kb10UpToDeputy(page)
      expect((await caseOf(page)).owner).toBe(DEPUTY)
    })

    await test.step('WIT0905 · รองเลขาธิการฯ ไม่ระบุข้อสังเกต = ส่งกลับไม่ได้ · ยกเลิกในจอยืนยันแล้วแฟ้มไม่ขยับ', async () => {
      await expect(page.getByTestId('kb10-readiness')).toHaveCount(0)
      await page.getByTestId('kb10-deputy-return').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('kb10-deputy-note').fill(returnNote)
      await page.getByTestId('kb10-deputy-return').click()
      await cancelDialog(page)
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(1)
      expect(c.kb10DeputyReturnNote).toBeFalsy()
    })

    await test.step('WIT0905 · ส่งกลับแก้ไข — step กลับ 0, เก็บเหตุผล, ล้างผลตรวจเดิม แต่ประวัติยังมีรอบแรก', async () => {
      await page.getByTestId('kb10-deputy-return').click()
      await confirmDialog(page, 'ยืนยันส่งกลับแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(0)
      expect(c.kb10DeputyReturnNote).toBe(returnNote)
      expect(c.kb10ReadinessCheckedAt).toBeFalsy()
      expect(c.kb10DeputyScreenedAt).toBeFalsy()
      expect(c.status).toContain('ส่งคืนแก้ไข คบ.10') // status ถูก sarabanDispatch ทับต่อท้าย
      expect(c.kb10SignedAt).toBeFalsy()
      // ของเดิมไม่หาย: Audit มีทั้งการเสนอรอบแรก (พร้อมผลตรวจ) และการส่งกลับ (พร้อมเหตุผล + ผู้ส่งกลับ)
      const submitted = history(c).filter((h) => h.action === 'ตรวจความครบถ้วนของร่าง คบ.10 และเสนอรองเลขาธิการฯ กลั่นกรอง')
      expect(submitted).toHaveLength(1)
      expect(submitted[0].detail).toBe(note1)
      const returned = history(c).filter((h) => h.action === 'รองเลขาธิการฯ ส่งร่าง คบ.10 กลับแก้ไข')
      expect(returned).toHaveLength(1)
      expect(returned[0].actor).toBe(DEPUTY)
      expect(returned[0].detail).toBe(returnNote)
    })

    await test.step('ส่งคืนลงหน่วยผ่านธุรการ สลธ. → ธุรการหน่วย → ถึงเจ้าหน้าที่ผู้รับผิดชอบเดิม', async () => {
      await passSarabanCheckpoint(page, CASE_NO, 'secretary_receiver')
      await passSarabanCheckpoint(page, CASE_NO, 'receiver', { afterRole: 'officer' })
      await page.goto(DOSSIER_URL)
      const c = await caseOf(page)
      expect(c.owner).toBe(officerName)
      expect(c.nonApprovalStep).toBe(0)
      // เจ้าหน้าที่เห็นข้อสังเกต และเสนอใหม่ได้ ส่วนรอบลงนามยังปิดอยู่
      await expect(page.getByTestId('kb10-screening-step')).toContainText(returnNote)
      await expect(page.getByTestId('kb10-readiness')).toBeVisible()
      await expect(page.getByText('รอผ่านด่านกลั่นกรองของรองเลขาธิการฯ ก่อน')).toBeVisible()
    })

    await test.step('แก้ไขแล้วเสนอใหม่ → ล้างข้อสังเกตเดิม, ผลตรวจรอบใหม่แทนรอบเก่า, Audit มีสองรอบ', async () => {
      await officerSubmitsKb10(page, note2)
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(1)
      expect(c.kb10ReadinessNote).toBe(note2)
      expect(c.kb10DeputyReturnNote).toBeFalsy()
      expect(history(c).filter((h) => h.action === 'ตรวจความครบถ้วนของร่าง คบ.10 และเสนอรองเลขาธิการฯ กลั่นกรอง')).toHaveLength(2)
      await kb10UpToDeputy(page)
    })

    await test.step('WIT0905 · รองเลขาธิการฯ กลั่นกรองผ่าน → ถึงเลขาธิการฯ เปิดรอบลงนาม (ยังไม่ลงนามแทน)', async () => {
      await page.getByTestId('kb10-deputy-note').fill('ข้อความตรงผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบแล้ว')
      await page.getByTestId('kb10-deputy-pass').click()
      await confirmDialog(page, 'ยืนยันกลั่นกรองผ่าน', 'แจ้งสิทธิอุทธรณ์ครบถ้วน')
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(2)
      expect(c.kb10DeputyScreenedAt).toBeTruthy()
      expect(c.kb10DeputyReturnNote).toBeFalsy()
      expect(c.owner).toBe(SECRETARY)
      expect(c.kb10Signed).toBeFalsy()
      expect(history(c).filter((h) => h.action === 'รองเลขาธิการฯ ส่งร่าง คบ.10 กลับแก้ไข')).toHaveLength(1)
      expect(history(c).filter((h) => h.action === 'รองเลขาธิการฯ กลั่นกรอง คบ.10 ผ่าน')).toHaveLength(1)
      await expect(page.getByText('รอเลขาธิการฯ ลงนามในแบบฟอร์ม').first()).toBeVisible()
      await expect(page.getByTestId('kb10-deputy')).toHaveCount(0)
    })
  })

  test('RRR-09A-2 · [Negative] ด่านกลั่นกรอง คบ.10 — เฉพาะรองเลขาธิการฯ ส่งกลับ/ผ่านได้, เจ้าหน้าที่และผบช. ไม่มีปุ่ม, ผ่านโดยไม่มีความเห็นไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Case 4', 'officer', {
      nonApprovalStep: 1,
      kb10ReadinessCheckedAt: '24/09/2569 10:00',
      kb10ReadinessCheckedBy: 'เจ้าหน้าที่ผู้รับผิดชอบ',
      kb10ReadinessNote: 'ตรวจครบแล้ว',
      owner: DEPUTY,
    })
    await page.goto(DOSSIER_URL)

    await test.step('เจ้าหน้าที่ (ผู้เสนอ) ไม่เห็นทั้งฟอร์มเสนอซ้ำและปุ่มของรองเลขาธิการฯ ขณะรอกลั่นกรอง', async () => {
      await expect(page.getByTestId('kb10-screening-step')).toContainText('รอรองเลขาธิการฯ กลั่นกรอง')
      await expect(page.getByTestId('kb10-readiness')).toHaveCount(0)
      await expect(page.getByTestId('kb10-deputy')).toHaveCount(0)
    })
    await test.step('ผบช.ชั้นต้นไม่ใช่ผู้กลั่นกรอง คบ.10 — ไม่มีปุ่ม ข้ามชั้นไม่ได้', async () => {
      await switchRole(page, 'supervisor')
      await expect(page.getByTestId('kb10-deputy')).toHaveCount(0)
      await expect(page.getByTestId('kb10-deputy-pass')).toHaveCount(0)
    })
    await test.step('รองเลขาธิการฯ ผ่านโดยไม่มีความเห็นไม่ได้ (จอยืนยันไม่ขึ้น) และยังไม่มีผลใด ๆ ต่อแฟ้ม', async () => {
      await switchRole(page, 'deputy_secretary')
      await expect(page.getByTestId('kb10-deputy')).toBeVisible()
      await expect(page.getByTestId('kb10-readiness')).toHaveCount(0)
      await page.getByTestId('kb10-deputy-pass').click()
      await expect(popup(page)).toHaveCount(0)
      const c = await caseOf(page)
      expect(c.nonApprovalStep).toBe(1)
      expect(c.kb10DeputyScreenedAt).toBeFalsy()
      expect(c.owner).toBe(DEPUTY)
    })
  })

  test('RRR-09A-3 · WIT0906 → WIT0923 → WIT0907 นำส่ง คบ.10 ไม่สำเร็จ/ตีกลับ → เปลี่ยนช่องทางส่งใหม่ → พยานรับ นับ 30 วันจากวันรับจริงครั้งที่สำเร็จ', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Notice 3', 'officer')
    await page.goto(F10)
    const before = await caseOf(page)
    await completeNoticeDetails(page)
    await checkNoticeReady(page)

    await test.step('WIT0906 · บันทึกนำส่งรอบแรก', async () => {
      await dispatchCard(page).getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect.poll(async () => (await caseOf(page)).dispatchedAt).toBeTruthy()
    })
    await test.step('WIT0923 · แจ้งส่งไม่สำเร็จ — ต้องมีเหตุผล, ยังไม่มีวันรับจริง และ คบ.10 ฉบับลงนามเดิมไม่ถูกแตะ', async () => {
      await dispatchCard(page).getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
      await expect(popup(page)).toHaveCount(0) // ไม่กรอกเหตุผล
      await page.getByPlaceholder('เช่น ไม่มีผู้รับตามที่อยู่ที่ระบุ').fill('ไม่มีผู้รับตามที่อยู่')
      await dispatchCard(page).getByRole('button', { name: 'แจ้งว่าส่งไม่สำเร็จ/ตีกลับ' }).click()
      await confirmDialog(page, 'ยืนยันว่าไม่สำเร็จ')
      await expect(page.getByTestId('dispatch-history-item').first()).toContainText('ไม่สำเร็จ/ตีกลับ')
      const c = await caseOf(page)
      expect(c.deliveredAt).toBeFalsy()
      expect(c.appealDueAt).toBeFalsy()
      expect(c.resultNotices[10].original).toEqual(before.resultNotices[10].original)
      expect(c.kb10SignedAt).toBe(before.kb10SignedAt)
    })
    await test.step('ส่งใหม่ — ประวัติเก็บทุกครั้ง (append-only) ไม่ทับรอบที่ล้มเหลว', async () => {
      await dispatchCard(page).getByRole('button', { name: /บันทึกการนำส่ง$/ }).click()
      await expect(page.getByTestId('dispatch-history-item')).toHaveCount(2)
      expect(((await caseOf(page)).dispatchHistory as Rec[]).length).toBeGreaterThanOrEqual(2)
    })
    await test.step('WIT0907 · พยานรับจริง 3 วันก่อน → appealDueAt = วันรับ + 30 วัน (ไม่ใช่วันที่ส่งครั้งแรก)', async () => {
      const delivered = isoDay(-3).slice(0, 10)
      const card = dispatchCard(page)
      await card.locator('input[type="date"]').fill(delivered)
      await fieldAfterLabel(card, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
      await card.locator('label', { hasText: 'เลือกไฟล์อัปโหลด' }).locator('input[type="file"]').setInputFiles(pdf('ใบตอบรับ-EMS.pdf'))
      await card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
      await expect.poll(async () => (await caseOf(page)).deliveredAt).toBeTruthy()
      const c = await caseOf(page)
      expect(new Date(c.deliveredAt).toISOString().slice(0, 10)).toBe(delivered)
      expect(Math.round((new Date(c.appealDueAt).getTime() - new Date(c.deliveredAt).getTime()) / 86400000)).toBe(30)
      await page.goto('/appeal')
      await expect(page.getByRole('row').filter({ hasText: CASE_NO })).toContainText('รอรับคำอุทธรณ์')
    })
  })

  test('RRR-09A-4 · WIT0908-0909 ในกรอบ 30 วันปิดเรื่องไม่ได้ (สละสิทธิ์ต้องมีหลักฐาน) — ไม่ถูกปัดตกเอง และ คบ.10 ฉบับลงนามไม่ถูกแตะ', async ({ page }) => {
    // Notice 5 = คบ.10 ลงนามและนำส่งแล้ว พยานเพิ่งรับ อยู่ในกรอบ 30 วัน
    await seedMockState(page, 'Notice 5', 'officer')
    await page.goto(FOLDER)
    const before = await caseOf(page)
    expect(before.appealFiledAt).toBeFalsy()
    await expect(page.getByTestId('appeal-intake-form')).toBeVisible()
    await page.getByText('พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง').click()

    // ปุ่ม "พ้นกำหนด" ไม่มีในกรอบ เหลือเฉพาะทางสละสิทธิ์ที่ต้องมีหลักฐาน
    await expect(page.getByTestId('kb10-close')).toHaveCount(0)
    await expect(page.getByTestId('kb10-waiver')).toBeVisible()
    await page.getByTestId('kb10-waiver-note').fill('พยานแจ้งทางโทรศัพท์ว่าไม่ประสงค์อุทธรณ์')
    await page.getByTestId('kb10-waiver-submit').click() // ขาดหลักฐาน
    await expect(popup(page)).toHaveCount(0)
    await page.getByTestId('kb10-waiver-evidence').fill('บันทึกถ้อยคำที่พยานลงชื่อ')
    await page.getByTestId('kb10-waiver-submit').click()
    await cancelDialog(page)
    expect((await caseOf(page)).nonApprovalClosedAt).toBeFalsy()
    await page.getByTestId('kb10-waiver-submit').click()
    await confirmDialog(page, 'ยืนยันปิดเรื่อง')

    const c = await caseOf(page)
    expect(c.nonApprovalClosedAt).toBeTruthy()
    expect(c.closedAt).toBeTruthy()
    expect(String(c.status)).toContain('ไม่ประสงค์อุทธรณ์')
    expect(c.resultNotices[10].original).toEqual(before.resultNotices[10].original)
    expect(c.kb10SignedAt).toBe(before.kb10SignedAt)
    // ปิดแล้วรับอุทธรณ์ไม่ได้อีก
    await expect(page.getByText('ไม่เปิดรับคำอุทธรณ์สำหรับเคสนี้')).toBeVisible()
    await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
    await page.goto('/appeal')
    await expect(page.getByTestId('appeal-closed-notice')).toContainText(CASE_NO)
  })

  test('RRR-09A-5 · WIT0909 พ้นกรอบ 30 วันโดยไม่มีผู้ยื่น — เคสไม่หายเอง ต้องมีบันทึกเหตุผลปิดเรื่อง และปิดแล้วรับอุทธรณ์ไม่ได้', async ({ page }) => {
    await seedMockState(page, 'Notice 5', 'officer', { deliveredAt: isoDay(-40), appealDueAt: isoDay(-10) })

    await test.step('พ้นกรอบแล้วเคสยังอยู่ในรายการ /appeal (ไม่ถูกปัดตกอัตโนมัติ)', async () => {
      await page.goto('/appeal')
      await expect(page.getByRole('row').filter({ hasText: CASE_NO })).toBeVisible()
      await expect(page.getByTestId('appeal-closed-notice')).toHaveCount(0)
    })
    await test.step('ปิดเรื่อง — ขาดเหตุผลไม่ได้, ยกเลิกแล้วไม่ปิด, ยืนยันแล้วปิดพร้อมผู้ปิด/เวลา', async () => {
      await page.goto(FOLDER)
      const before = await caseOf(page)
      await page.getByText('พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง').click()
      await expect(page.getByTestId('kb10-waiver')).toHaveCount(0) // พ้นกรอบแล้ว ไม่ต้องสละสิทธิ์
      await page.getByTestId('kb10-close-submit').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('kb10-close-note').fill('ตรวจสอบแล้วไม่มีคำอุทธรณ์เข้าระบบภายในกำหนด')
      await page.getByTestId('kb10-close-submit').click()
      await cancelDialog(page)
      expect((await caseOf(page)).nonApprovalClosedAt).toBeFalsy()
      await page.getByTestId('kb10-close-submit').click()
      await confirmDialog(page, 'ยืนยันปิดเรื่อง', 'ปิดอย่างเป็นทางการ')
      const c = await caseOf(page)
      expect(c.nonApprovalClosedAt).toBeTruthy()
      expect(c.nonApprovalClosedBy).toBeTruthy()
      expect(c.nonApprovalCloseNote).toContain('ไม่มีคำอุทธรณ์')
      expect(c.nonApprovalStep).toBe(4)
      expect(c.resultNotices[10].original).toEqual(before.resultNotices[10].original)
    })
    await test.step('ปิดเรื่องแล้ว — หน้ารับอุทธรณ์ปิด และ /appeal แสดงเป็นเรื่องที่ปิดแล้ว', async () => {
      await expect(page.getByText('ไม่เปิดรับคำอุทธรณ์สำหรับเคสนี้')).toBeVisible()
      await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
      await page.goto('/appeal')
      await expect(page.getByTestId('appeal-closed-notice')).toContainText(CASE_NO)
    })
  })
})

// ======================================================================
// 09B
// ======================================================================
test.describe('RRR 09B · อุทธรณ์ / แฟ้มเสนอคณะกรรมการ — เกินกรอบ ยกคำร้อง เปลี่ยนคำสั่ง และการตีกลับ', () => {
  test('RRR-09B-1 · WIT0914 อุทธรณ์เกิน 30 วัน ไม่ปัดตก → ผบช.ชั้นต้นรับไว้ → ลำดับชั้น → คณะกรรมการยกคำร้อง (คบ.10 เดิมยังอยู่) → หนังสือแจ้งผลปิดขั้นอุทธรณ์', async ({ page }) => {
    test.setTimeout(420_000)
    // พยานรับ คบ.10 เมื่อ 45 วันก่อน → ครบกรอบเมื่อ 15 วันก่อน
    await seedMockState(page, 'Notice 5', 'officer', { deliveredAt: isoDay(-45), appealDueAt: isoDay(-15) })
    const lateReason = 'พยานเข้ารักษาตัวในโรงพยาบาลตลอดช่วงกรอบเวลาอุทธรณ์ มีใบรับรองแพทย์'

    await test.step('WIT0914 · เคสเกินกรอบยังอยู่ในรายการ /appeal ไม่ถูกปัดตก และไม่ถูกนับเป็น "ปิดเรื่อง"', async () => {
      await page.goto('/appeal')
      await expect(page.getByRole('row').filter({ hasText: CASE_NO }).getByRole('link', { name: 'รับคำอุทธรณ์', exact: true })).toBeVisible()
      await expect(page.getByTestId('appeal-closed-notice')).toHaveCount(0)
    })

    const kb10Before = (await (async () => { await page.goto(DOSSIER_URL); return caseOf(page) })()).resultNotices[10]
    expect(kb10Before.original).toBeTruthy()

    await test.step('WIT0912 / WIT0914 · รับคำอุทธรณ์ที่เกินกรอบ — บังคับเหตุผลความล่าช้า แฟ้มไป late_pending อยู่กับ ผบช.ชั้นต้น', async () => {
      await officerFilesAppeal(page, 'มีพยานหลักฐานใหม่ที่ยังไม่เคยเสนอพิจารณา', '531/2569', lateReason)
      const c = await caseOf(page)
      expect(c.appealFolder.stage).toBe('late_pending')
      expect(c.appealFolder.lateDays).toBeGreaterThanOrEqual(14)
      expect(c.appealFolder.lateReason).toBe(lateReason)
      expect(c.owner).toBe(SUPERVISOR)
      expect(c.stage).toBe('appeal')
      // ยังเป็นแฟ้มเดิม ไม่ใช่ปิดเรื่อง
      expect(c.nonApprovalClosedAt).toBeFalsy()
      await page.goto('/appeal')
      await expect(page.getByTestId('appeal-late-group')).toContainText(CASE_NO)
      await expect(page.getByTestId('appeal-late-group')).toContainText(lateReason)
    })

    await test.step('WIT0931 · เจ้าหน้าที่ผู้รับเรื่องรับแทน ผบช. ไม่ได้ — มีเฉพาะ ผบช.ชั้นต้น ที่รับเรื่องไว้ได้ (ต้องมีความเห็น)', async () => {
      await page.goto(DOSSIER_URL)
      await expect(page.getByTestId('appeal-late-accept')).toHaveCount(0)
      await expect(page.getByTestId('appeal-opinion-note')).toHaveCount(0)
      await switchRole(page, 'supervisor')
      await page.getByTestId('appeal-late-accept-submit').click()
      await expect(popup(page)).toHaveCount(0)
      await page.getByTestId('appeal-late-accept-note').fill('เหตุสุดวิสัยมีเอกสารรับรอง เห็นควรรับไว้เสนอคณะกรรมการ')
      await page.getByTestId('appeal-late-accept-submit').click()
      await confirmDialog(page, 'ยืนยันรับเรื่องไว้พิจารณา', 'ไม่ตัดสิทธิ์ผู้ยื่นแทนคณะกรรมการ')
      const folder = (await caseOf(page)).appealFolder
      expect(folder.stage).toBe('officer_opinion')
      expect(folder.lateAcceptedBy).toBeTruthy()
      expect(folder.lateAcceptNote).toContain('เหตุสุดวิสัย')
      // ร่องรอยความล่าช้ายังอยู่ครบ ไม่ถูกลบเมื่อแฟ้มเดินต่อ
      expect(folder.lateReason).toBe(lateReason)
    })

    await test.step('WIT0915-WIT0919 · เดินลำดับชั้นจนบรรจุวาระ — ข้ามชั้นไม่ได้', async () => {
      await switchAccount(page, 'officer')
      await expect(page.getByTestId('appeal-opinion-officer')).toBeVisible()
      await walkHierarchyToAgenda(page)
      const f = (await caseOf(page)).appealFolder
      expect(f.stage).toBe('agenda')
      // คบ.3/คบ.6 บันทึกเพิ่มเติม (อุทธรณ์) เป็นรุ่นใหม่ ฉบับเดิมถูกเก็บไว้
      expect(f.addendum.kb3Version, 'addendum.kb3Version').toBeGreaterThanOrEqual(2)
      expect(f.addendum.kb6Version, 'addendum.kb6Version').toBeGreaterThanOrEqual(2)
      for (const key of ['officerOpinion', 'supervisorOpinion', 'directorOpinion', 'deputyOpinion', 'secretaryOpinion']) {
        expect(f[key].note, key).toBeTruthy()
        expect(f[key].by, key).toBeTruthy()
      }
      // ฝ่ายเลขานุการ (committee) เห็นช่องบันทึกมติหลังบรรจุวาระ
      await expect(page.getByTestId('appeal-resolution-uphold')).toBeVisible() // committee เห็น
    })

    await test.step('WIT0920 · คณะกรรมการยกคำร้อง → คำสั่งเดิม (คบ.10) ยังมีผลและไม่ถูกแก้ · ไม่เปิด คบ.6 รุ่นใหม่', async () => {
      await committeeResolves(page, 'uphold', 'มติที่ 61/2569')
      const c = await caseOf(page)
      expect(c.appealResolution.outcome).toBe('uphold')
      expect(c.appealFolder.stage).toBe('resolved')
      expect(c.appealFolder.lateReason).toBe(lateReason)
      expect(c.activity7State).toBe('rejected')
      expect(c.appealKb6Version).toBeFalsy()
      expect(c.resultNotices[10].original).toEqual(kb10Before.original)
      expect(c.kb10SignedAt).toBeTruthy()
      expect(c.appealResolution.noticeRecordedAt).toBeFalsy() // มติอย่างเดียวยังไม่ถือว่าแจ้งผลแล้ว
    })

    await test.step('WIT0921 · หนังสือแจ้งผลอุทธรณ์ — ขาดเลขทะเบียนส่งไม่ได้ · บันทึกแล้วปิดขั้นอุทธรณ์', async () => {
      await switchAccount(page, 'officer')
      await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_ยกคำร้อง.pdf')
      await page.getByTestId('appeal-notice-submit').click()
      await expect(popup(page)).toHaveCount(0)
      await officerRecordsAppealNotice(page, 'ปปท 0007/6101', 'ปิดขั้นอุทธรณ์')
      const n = (await caseOf(page)).appealResolution
      expect(n.noticeRegistryNo).toBe('ปปท 0007/6101')
      expect(n.noticeRecordedAt).toBeTruthy()
      await expect(page.getByTestId('appeal-notice-form')).toHaveCount(0)
      // แฟ้มที่อุทธรณ์ไปแล้วยื่นซ้ำไม่ได้ — หน้ารับอุทธรณ์พาไปแฟ้มคดีเสมอ ไม่มีฟอร์มรับใหม่
      await page.goto(FOLDER)
      await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(CASE_NO)}`))
      await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)
    })
  })

  test('RRR-09B-2 · WIT0920 → WIT0922 → WIT0935 คณะกรรมการเปลี่ยนคำสั่ง → เปิด คบ.6 รุ่นใหม่ในแฟ้มเดิม (ไม่สร้าง คบ.1) โดยหนังสือ คบ.10 ฉบับเดิมไม่ถูกแก้', async ({ page }) => {
    test.setTimeout(420_000)
    await seedMockState(page, 'Notice 5', 'officer')
    await page.goto(DOSSIER_URL)
    const initial = await caseOf(page)
    const kb10 = initial.resultNotices[10]
    expect(kb10.original).toBeTruthy()
    const casesBefore = await page.evaluate(() => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length)

    await test.step('WIT0912 → WIT0919 · รับอุทธรณ์ในกรอบ → เดินลำดับชั้น → บรรจุวาระ', async () => {
      await officerFilesAppeal(page, 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา', '532/2569')
      expect((await caseOf(page)).appealFolder.stage).toBe('officer_opinion')
      expect((await caseOf(page)).appealFolder.lateDays).toBe(0)
      await walkHierarchyToAgenda(page)
    })

    await test.step('WIT0920 · มติเปลี่ยนแปลงคำสั่ง → ธุรการขาลง → แฟ้มกลับไปจัดทำ คบ.6 v2 ที่ขั้นเจ้าหน้าที่ (ไม่สร้างแฟ้ม/คบ.1 ใหม่)', async () => {
      await committeeResolves(page, 'overturn', 'มติที่ 62/2569')
      const c = await caseOf(page)
      expect(c.appealResolution.outcome).toBe('overturn')
      expect(c.appealResolution.resolutionNo).toBe('มติที่ 62/2569')
      expect(c.appealKb6Version).toBeGreaterThanOrEqual(2)
      expect(c.kb6Version).toBe(c.appealKb6Version)
      expect(c.stage).toBe('staff_review')
      expect(c.activity7State).toBe('pending')
      expect(c.nonApprovalClosedAt).toBeFalsy()
      const casesAfter = await page.evaluate(() => (JSON.parse(localStorage.getItem('ecmis-case-storage-v2') || '{}').state?.cases || []).length)
      expect(casesAfter).toBe(casesBefore)
    })

    await test.step('คบ.6 รุ่นเดิมถูกเก็บ · ผลเดิมของ คบ.10 ถูกสำเนาไว้อ้างอิง · ฉบับลงนาม คบ.10 ไม่เปลี่ยน (immutable)', async () => {
      const c = await caseOf(page)
      expect((c.kb6PreviousVersions as Rec[]).length).toBeGreaterThanOrEqual(1)
      expect(c.appealKb6PreviousResult.decisionNumber).toBe(initial.decisionNumber)
      expect(c.appealKb6PreviousResult.resultReason).toBe(initial.resultReason)
      expect(c.appealKb6PreviousResult.deliveredAt).toBe(initial.deliveredAt)
      // ผลพิจารณารอบใหม่ว่าง — รอบใหม่ต้องผ่านลำดับชั้นเดิมของ คบ.6 อีกครั้ง
      expect(c.decisionNumber).toBeFalsy()
      expect(c.secretarySignedAt).toBeFalsy()
      expect(c.kb6SecretarySignedAt).toBeFalsy()
      // ของเดิมไม่ถูกแก้
      expect(c.resultNotices[10].original).toEqual(kb10.original)
      expect(c.resultNotices[10].versions).toEqual(kb10.versions)
      expect(c.kb10SignedAt).toBe(initial.kb10SignedAt)
      expect(history(c).some((h) => String(h.detail).includes('ไม่สร้าง คบ.1 ใหม่'))).toBe(true)
    })

    await test.step('WIT0922 · เจ้าหน้าที่แจ้งผลอุทธรณ์ให้พยาน (ต้องแจ้งแม้ผลเป็นเปลี่ยนคำสั่ง) แล้วเปิด คบ.6 รุ่นใหม่ (WIT0935)', async () => {
      await officerRecordsAppealNotice(page, 'ปปท 0008/6202', 'คบ.6 รุ่นใหม่')
      expect((await caseOf(page)).appealResolution.noticeRegistryNo).toBe('ปปท 0008/6202')
      const link = page.getByRole('link', { name: /เปิด คบ\.6 v\d/ })
      await expect(link).toBeVisible()
      await link.click()
      await expect(page).toHaveURL(new RegExp(`/form/6\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      // เปิดดูรุ่นใหม่แล้ว ต้องไม่ย้อนไปแก้ผลเดิม
      expect((await caseOf(page)).resultNotices[10].original).toEqual(kb10.original)
    })
  })

  // ----------------------------------------------------------------
  // ผังไม่มีตัวเลือกส่งกลับในแฟ้มอุทธรณ์: AppealFolderWorkflowCard มีแต่ "เสนอต่อ" (recordAppealOpinion)
  // และ useCaseStore ไม่มี action ส่งกลับ/ปฏิเสธรับแฟ้มอุทธรณ์ (grep: returnAppeal / appealReturn ไม่พบ)
  // → ผู้ตรวจที่พบว่าแฟ้มไม่ครบถ้วนทำได้เพียงเขียนความเห็นแล้วส่งเสนอต่อ ไม่สามารถตีกลับชั้นก่อนหน้าได้
  // ผังที่ควรมี: ผบช.ชั้นต้น → เจ้าหน้าที่ · ผอ. → ผบช. · รองเลขาธิการฯ → ผอ. · เลขาธิการฯ → รองเลขาธิการฯ
  // โดยเก็บเหตุผล/ผู้ส่งกลับ/ขั้นที่ส่งกลับไว้ และความเห็นรอบก่อนต้องไม่หาย
  // ----------------------------------------------------------------
  const RETURN_LEVELS = [
    { code: 'WIT0915', from: 'supervisor', fromLabel: 'ผบช.ชั้นต้น', to: 'officer_opinion', toLabel: 'เจ้าหน้าที่ผู้รับผิดชอบ' },
    { code: 'WIT0916', from: 'director', fromLabel: 'ผอ.สำนัก/กอง', to: 'supervisor', toLabel: 'ผบช.ชั้นต้น' },
    { code: 'WIT0917', from: 'deputy_secretary', fromLabel: 'รองเลขาธิการฯ', to: 'director', toLabel: 'ผอ.สำนัก/กอง' },
    { code: 'WIT0918', from: 'secretary', fromLabel: 'เลขาธิการฯ', to: 'deputy', toLabel: 'รองเลขาธิการฯ' },
  ] as const
  for (const lv of RETURN_LEVELS) {
    test.fixme(`RRR-09B-3 · ${lv.code} ${lv.fromLabel} ส่งแฟ้มอุทธรณ์กลับ${lv.toLabel} → แก้/เสนอใหม่ → ผ่าน (ยังไม่มีปุ่มและ action ส่งกลับในแฟ้มอุทธรณ์)`, async ({ page }) => {
      // ตั้งต้นให้แฟ้มอยู่ที่ชั้นของผู้ตรวจ (walk ผ่าน UI ด้วย helper ด้านบนจนถึงชั้น lv.from) แล้วคาดหวังว่า:
      //  - ผู้ตรวจเห็นปุ่มส่งกลับ (data-testid ยังไม่มี) ต้องกรอกเหตุผลก่อน จอยืนยันจึงขึ้น
      //  - appealFolder.stage = lv.to · owner = ผู้ถือชั้นก่อนหน้า · เก็บเหตุผล/ผู้ส่งกลับในแฟ้ม
      //  - ความเห็นรอบก่อนของทุกชั้นยังอยู่ (ไม่ถูกล้างเมื่อกลับ) และ Audit บันทึกการส่งกลับ
      //  - ชั้นที่ถูกส่งกลับแก้แล้วเสนอใหม่ → ผู้ตรวจเดิมเห็นแฟ้มอีกครั้งและผ่านต่อได้
      await seedMockState(page, 'Notice 5', 'officer')
      expect(lv.from).toBeTruthy()
    })
  }
})
