import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, expectStage, signInModal } from './journey-helpers'

/**
 * Journey J10 — 08A ◇ พยานไม่ยินยอมตาม คบ.11 (WIT0809 → WIT0812) และทางแยกของวิธีที่ 1 (08A-1)
 *
 * ผัง: WIT0809 ◇ พยานยินยอมตาม คบ.11? → แขนง "ไม่ยินยอม" → WIT0812 บันทึกเหตุและหลักฐาน ห้ามเริ่มวิธีนั้น
 *      เสนอ "ทบทวน / เปลี่ยนวิธี / ยุติ" ผ่านลำดับผู้บังคับบัญชา (เจ้าหน้าที่ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง)
 *      แล้วแนวทางที่อนุมัติต้องพาแฟ้มไปปลายทางจริง: ทบทวน → 11A · เปลี่ยนวิธี → ขอ คบ.11 ใหม่ · ยุติ → 11C (คบ.15)
 *
 * จุดตั้งต้นทั้งหมดเป็น Case 1.11 (คบ.9 ถึงมือพยานแล้ว แต่พยานยังไม่ลงนาม คบ.11) — ประตูความยินยอมอยู่ที่หน้า "วิธีคุ้มครองตามข้อ 15"
 *
 * ส่วนที่ 2: วิธีที่ 1 (08A-1) ที่ไม่ใช่ทางหลักปกติ
 *  - WIT0815/WIT0816  คำสั่งชั่วคราว (คบ.5) เริ่มได้ทันที แล้วเปลี่ยน Phase เป็น MAIN เมื่อ คบ.8 ลงนาม (ไม่รีเซ็ตวันสะสม)
 *  - WIT0818          เลขาธิการฯ ส่งกลับแก้ไข คบ.8 → Revision ใหม่ → เสนอซ้ำ → ลงนาม (ก่อนลงนามเดินแผนปฏิบัติไม่ได้)
 */

const METHODS_URL = '/protection-methods'
const method1Url = `/protection-method/1?caseNo=${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

type Proposal = { proposedAction: string; stage: string }

/** ชั้นเจ้าหน้าที่: บันทึกไม่ยินยอมพร้อมเหตุและหลักฐาน แล้วเสนอแนวทางขึ้นลำดับชั้น (WIT0812) */
async function declineAndPropose(
  page: Page,
  action: 'review' | 'change_method' | 'terminate',
  reason: string,
  newMethods: number[] = []
) {
  await page.goto(METHODS_URL)
  await expect(page.getByTestId('wit0812-card')).toBeVisible()
  await page.getByTestId('decline-reason').fill(reason)
  await page.getByTestId('decline-evidence').fill('บันทึกถ้อยคำพยาน ลงวันที่ 11 ก.ย. 2569')
  await page.getByTestId(`decline-action-${action}`).click()
  for (const m of newMethods) await page.getByTestId(`decline-new-method-${m}`).click()
  await page.getByTestId('decline-submit').click()
}

/** ชั้นผู้บังคับบัญชา: เห็นชอบ/อนุมัติ หรือส่งคืนแก้ไข จากหน้าวิธีคุ้มครองตามข้อ 15 */
async function decide(page: Page, endorse: boolean, note: string, confirmButton: string, expectedText?: string | RegExp) {
  await page.goto(METHODS_URL)
  await page.getByTestId('decline-decision-note').fill(note)
  await page.getByTestId(endorse ? 'decline-endorse' : 'decline-return').click()
  await confirmDialog(page, confirmButton, expectedText)
}

/** เปิดแฟ้มของผู้บังคับบัญชาผ่านคิวงานก่อนตัดสินใจ — ต้องเห็นเลขคำร้องในคิวจริง */
async function seeInQueue(page: Page, queue: 'supervisor' | 'director') {
  await page.goto(`/queue/${queue}`)
  await expect(page.getByText(CASE_NO).first()).toBeVisible()
}

/** เซ็นทุกช่องของ คบ.11 ที่ยังไม่ได้เซ็น แล้วกด "บันทึกข้อตกลง คบ.11" */
async function signKb11All(page: Page) {
  const count = await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).count()
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    await signInModal(page, 'พยานในการทำข้อตกลง')
  }
  await page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }).click()
}

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

test.describe('J10 · พยานไม่ยินยอมตาม คบ.11 (08A ◇ WIT0809 → WIT0812)', () => {
  test('J10 · พยานไม่ยินยอม → เสนอ "ยุติ" ผ่าน ผบช.ชั้นต้น → ผอ. → เข้าเส้นทาง คบ.15 (11C)', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0808 · ชี้แจงข้อตกลงและให้พยานซักถาม — ⚙️ นอกระบบ (ไม่มีช่องบันทึก)', async () => {
      await page.goto(DOSSIER_URL)
      const c = await readCase(page, CASE_NO)
      expect(c?.kb9Signed).toBe(true)
      expect(c?.kb11Signed).toBeFalsy()
    })

    await test.step('WIT0809 ◇ ประตูความยินยอม — ยังไม่มีความยินยอม ตัวเลือก "ไม่ยินยอม" ต้องเห็นครบสามแนวทาง', async () => {
      await page.goto(METHODS_URL)
      await expect(page.getByText('ความยินยอมตาม คบ.11')).toBeVisible()
      await expect(page.getByText('— ยังไม่บันทึก')).toBeVisible()
      await expect(page.getByTestId('consent-agree')).toBeVisible()
      await expect(page.getByTestId('wit0812-card')).toBeVisible()
      for (const a of ['review', 'change_method', 'terminate']) {
        await expect(page.getByTestId(`decline-action-${a}`)).toBeVisible()
      }
    })

    await test.step('WIT0812 · ต้องระบุเหตุก่อน และยกเลิกในจอยืนยันได้ (แฟ้มไม่ขยับ)', async () => {
      await page.getByTestId('decline-submit').click() // ยังไม่กรอกเหตุ
      await expect(page.locator('.swal2-popup')).toHaveCount(0)

      await page.getByTestId('decline-reason').fill('ขอเวลาปรึกษาครอบครัวก่อน')
      await page.getByTestId('decline-submit').click()
      await cancelDialog(page)
      expect((await readCase(page, CASE_NO))?.consentDeclineProposals ?? []).toEqual([])
    })

    await test.step('WIT0812 · เจ้าหน้าที่บันทึกเหตุ + เสนอ "ยุติ" (ห้ามเริ่มวิธีใด)', async () => {
      await declineAndPropose(page, 'terminate', 'พยานปฏิเสธการคุ้มครองทุกรูปแบบและขอให้ยุติทันที')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'ระงับทันที')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.consentDeclineProposals as Proposal[]
      expect(proposals).toHaveLength(1)
      expect(proposals[0]).toMatchObject({ proposedAction: 'terminate', stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
      // ห้ามเริ่มวิธีใดระหว่างรอผู้มีอำนาจ — ไม่มีวิธีใด active
      const tracks = (c?.methodTracks ?? []) as Array<{ status: string }>
      expect(tracks.some((t) => t.status === 'active')).toBe(false)
      expect(c?.kb11Signed).toBeFalsy()
    })

    await test.step('WIT0812 · ผบช.ชั้นต้น เห็นชอบ (แฟ้มโผล่ในคิวงาน) → ผอ.สำนัก/กอง', async () => {
      await switchRole(page, 'supervisor')
      await seeInQueue(page, 'supervisor')
      await decide(page, true, 'เหตุผลครบถ้วน เห็นควรยุติตามที่เสนอ', 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')

      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('director')
      expect(c?.owner).toBe(DIRECTOR)
    })

    await test.step('WIT0812 · ผอ.สำนัก/กอง อนุมัติ → แฟ้มเข้าเส้นทางยุติ (11C · คบ.15)', async () => {
      await switchRole(page, 'director')
      await seeInQueue(page, 'director')
      await decide(page, true, 'อนุมัติให้ยุติการคุ้มครอง', 'ยืนยันอนุมัติแนวทาง', 'คบ.15')

      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('approved')
      await expectStage(page, 'termination_review')
      expect(c?.owner).toBe(OFFICER)
      expect((c?.terminationTrigger as Record<string, unknown>)?.source).toBe('due_or_officer')
      expect(c?.next).toContain('คบ.15')

      await switchRole(page, 'officer')
      await page.goto('/termination')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
    })
  })

  test('J10-a · [ทางแยก] พยานไม่ยินยอม → เสนอ "เปลี่ยนวิธี" (เป็นวิธีที่ 3) → อนุมัติแล้วเปิดชุดวิธีใหม่และขอลงนาม คบ.11 ใหม่', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · เจ้าหน้าที่เสนอเปลี่ยนวิธี (ต้องมีช่องเลือกวิธีใหม่ตามข้อ 15)', async () => {
      await page.goto(METHODS_URL)
      await expect(page.getByTestId('decline-new-method-3')).toBeHidden()
      await declineAndPropose(page, 'change_method', 'ไม่ยินยอมย้ายที่พัก แต่รับการปกปิดข้อมูลได้', [3])
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม', 'วิธีที่ 3')

      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0]).toMatchObject({ proposedAction: 'change_method', stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0812 · ผบช.ชั้นต้น → ผอ. เห็นชอบและอนุมัติเปลี่ยนวิธี', async () => {
      await switchRole(page, 'supervisor')
      await seeInQueue(page, 'supervisor')
      await decide(page, true, 'เห็นควรเปลี่ยนเป็นวิธีที่ 3', 'ยืนยันเห็นชอบ')

      await switchRole(page, 'director')
      await seeInQueue(page, 'director')
      await decide(page, true, 'อนุมัติเปลี่ยนวิธี', 'ยืนยันอนุมัติแนวทาง', 'คบ.11')
    })

    await test.step('ผลลัพธ์ · เปิดชุดวิธีใหม่ [3] และล้างความยินยอมเดิม ต้องลงนาม คบ.11 ฉบับใหม่', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([3])
      expect((c?.methodTracks as Array<{ method: number }>).map((t) => t.method)).toEqual([3])
      expect(c?.kb11Signed).toBe(false)
      expect(c?.next).toContain('คบ.11')
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('approved')
    })
  })

  test('J10-b · [ทางแยก] พยานไม่ยินยอม → เสนอ "ทบทวน" → อนุมัติแล้วเรื่องเข้ารายการทบทวน 11A', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · เจ้าหน้าที่เสนอทบทวน', async () => {
      await declineAndPropose(page, 'review', 'พยานขอให้ทบทวนเงื่อนไขการคุ้มครองทั้งชุด')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')
      expect(((await readCase(page, CASE_NO))?.consentDeclineProposals as Proposal[])[0]).toMatchObject({
        proposedAction: 'review',
        stage: 'supervisor',
      })
    })

    await test.step('WIT0812 · ผบช.ชั้นต้น → ผอ. อนุมัติให้ทบทวน', async () => {
      await switchRole(page, 'supervisor')
      await seeInQueue(page, 'supervisor')
      await decide(page, true, 'เห็นควรทบทวน', 'ยืนยันเห็นชอบ')

      await switchRole(page, 'director')
      await seeInQueue(page, 'director')
      await decide(page, true, 'อนุมัติให้ทบทวน', 'ยืนยันอนุมัติแนวทาง', 'ทบทวนผลการคุ้มครอง')
    })

    await test.step('ผลลัพธ์ · แฟ้มปรากฏในรายการทบทวน 11A', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.reviewHandoff).toBeTruthy()
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('approved')

      await switchRole(page, 'officer')
      await page.goto('/protection-reviews')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
    })
  })

  test('J10-c · [ทางแยก] พยานไม่ยินยอม → ผบช.ชั้นต้น/ผอ. ส่งคืนแก้ไข → เจ้าหน้าที่เสนอใหม่เป็น "ทบทวน"', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · เจ้าหน้าที่เสนอ "ยุติ"', async () => {
      await declineAndPropose(page, 'terminate', 'พยานขอยุติ')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')
    })

    await test.step('WIT0812 · ผบช.ชั้นต้นส่งคืน (ต้องระบุเหตุผลก่อน) → กลับถึงเจ้าหน้าที่', async () => {
      await switchRole(page, 'supervisor')
      await page.goto(METHODS_URL)
      await page.getByTestId('decline-return').click() // ยังไม่ระบุเหตุผล
      await expect(page.locator('.swal2-popup')).toHaveCount(0)

      await decide(page, false, 'เหตุผลยังไม่พอ ให้ทบทวนก่อนเสนอยุติ', 'ยืนยันส่งคืนแก้ไข', 'เจ้าหน้าที่ผู้รับผิดชอบ')
      const c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[0].stage).toBe('returned')
      expect(c?.owner).toBe(OFFICER)
    })

    await test.step('WIT0812 · เจ้าหน้าที่เสนอใหม่เป็น "ทบทวน" → ผบช. เห็นชอบ → ผอ. ส่งคืนอีกชั้น', async () => {
      await switchRole(page, 'officer')
      await declineAndPropose(page, 'review', 'ปรับเป็นเสนอทบทวนตามข้อสั่งการ ผบช.')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')

      let c = await readCase(page, CASE_NO)
      const proposals = c?.consentDeclineProposals as Proposal[]
      expect(proposals).toHaveLength(2)
      expect(proposals[1]).toMatchObject({ proposedAction: 'review', stage: 'supervisor' })

      await switchRole(page, 'supervisor')
      await decide(page, true, 'เห็นชอบ', 'ยืนยันเห็นชอบ')
      await switchRole(page, 'director')
      await decide(page, false, 'ให้แนบหลักฐานเพิ่มก่อน', 'ยืนยันส่งคืนแก้ไข')

      c = await readCase(page, CASE_NO)
      expect((c?.consentDeclineProposals as Proposal[])[1].stage).toBe('returned')
      expect(c?.owner).toBe(OFFICER)
    })
  })

  test('J10-d · [ทางแยก] พยานเปลี่ยนใจ — หลังบันทึกไม่ยินยอมแล้วส่งคืน ยังกลับมาลงนาม คบ.11 (แขนง "ยินยอม") ได้', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0812 · บันทึกไม่ยินยอมแล้วถูกส่งคืนจากผบช.ชั้นต้น', async () => {
      await declineAndPropose(page, 'review', 'พยานขอทบทวน')
      await confirmDialog(page, 'ยืนยันบันทึกไม่ยินยอม')
      await switchRole(page, 'supervisor')
      await decide(page, false, 'ให้เจ้าหน้าที่ชี้แจงข้อตกลงพยานซ้ำก่อน', 'ยืนยันส่งคืนแก้ไข')
      expect(((await readCase(page, CASE_NO))?.consentDeclineProposals as Proposal[])[0].stage).toBe('returned')
    })

    await test.step('WIT0808/WIT0809 · ชี้แจงซ้ำ (นอกระบบ) พยานยินยอม → ลงนาม คบ.11 ครบ', async () => {
      await switchRole(page, 'officer')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await signKb11All(page)

      const c = await readCase(page, CASE_NO)
      expect(c?.kb11Signed).toBe(true)
      expect(c?.consents).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'kb11', consented: true })]))
    })

    await test.step('WIT0813 · ประตูเปิด — ช่องทาง WIT0812 หายไปและเปิดเส้นทางวิธีที่ 1 ตาม คบ.6', async () => {
      await page.goto(METHODS_URL)
      await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
      await expect(page.getByTestId('wit0812-card')).toBeHidden()
      expect((await readCase(page, CASE_NO))?.approvedMethods).toEqual([1])
    })
  })
})

test.describe('J10 · วิธีที่ 1 (08A-1) ทางแยกที่ไม่ใช่ทางหลักปกติ', () => {
  test('J10-e · [ทางแยก] WIT0815 คำสั่งชั่วคราว (คบ.5) เริ่มทันที TEMPORARY_ACTIVE แล้วคำร้องหลักลง คบ.8 → เปลี่ยน Phase เป็น MAIN โดยไม่รีเซ็ตวันสะสม', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    // เส้นทางเร่งด่วน: มี คบ.5 อนุมัติ + พยานยินยอมใน คบ.5 (แท็บ 06) — ไม่มี mock state ที่ค้างตรงนี้ จึงตั้งต้นด้วย casePatch
    // ข้ามด้วย mock state: urgent/kb5Approved/consents คบ.5 และรายการวิธีที่ 1 — ต้นทางอยู่ที่แท็บ 06 (นอกขอบเขตไฟล์นี้)
    // kb11 ยังไม่ลงนามเพื่อให้ฐานคำสั่งเป็น คบ.5 ก่อน แล้วค่อยลงนาม คบ.11 ผ่าน UI ภายหลัง
    await seedMockState(page, 'Case 1.11', 'officer', {
      urgent: true,
      kb5Approved: true,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending', wizardStep: 1 }],
      consents: [{ ref: 'kb5', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
      consentDeclineProposals: [],
    })

    await test.step('WIT0802/WIT0803 ◇ กรณีเร่งด่วน — ประตูอ้างความยินยอมใน คบ.5 ไม่ต้องรอ คบ.11', async () => {
      await page.goto(METHODS_URL)
      await expect(page.getByText('ความยินยอมตาม คบ.5')).toBeVisible()
      await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()
      await expect(page.getByTestId('consent-agree')).toBeHidden()
    })

    await test.step('WIT0814/WIT0815 ◇ รับงานวิธีที่ 1 — มี คบ.5 แต่ยังไม่มี คบ.8 = คำสั่งชั่วคราว', async () => {
      await page.getByRole('link', { name: /^วิธีที่ 1 — จัดชุดคุ้มครอง/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/1/)
      await expect(page.getByTestId('method-1-start')).toBeEnabled()
    })

    await test.step('WIT0816 · เริ่มคุ้มครองชั่วคราวตาม คบ.5 → TEMPORARY_ACTIVE', async () => {
      await page.getByLabel('วันเริ่มจริง').fill(daysAgoIso(5).slice(0, 10))
      await page.getByTestId('method-1-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'ACTIVE')

      const c = await readCase(page, CASE_NO)
      const t1 = (c?.methodTracks as Array<{ method: number; status: string; startedAt?: string }>).find((t) => t.method === 1)
      expect(t1?.status).toBe('active')
      expect(t1?.startedAt).toBeTruthy()
      expect((c?.episode as { phases?: Array<{ kind: string }> } | undefined)?.phases?.[0]?.kind).toBe('TEMPORARY')
      expect(c?.kb11Signed).toBeFalsy()
      await expect(page.getByText(/สถานะปัจจุบัน: TEMPORARY_ACTIVE/)).toBeVisible()
    })

    await test.step('WIT0809-0811 · คำร้องหลักเดินคู่ขนาน: พยานลงนาม คบ.11', async () => {
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await signKb11All(page)
      expect((await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
    })

    await test.step('WIT0817 · เจ้าหน้าที่ส่งเสนอ คบ.8 ให้เลขาธิการฯ ลงนาม', async () => {
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      expect((await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
    })

    await test.step('WIT0818 · เลขาธิการฯ ลงนาม คบ.8 → WIT0821 ◇ เปลี่ยน Phase TEMPORARY → MAIN (Episode เดิม ไม่รีเซ็ตวันสะสม)', async () => {
      await switchRole(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
      await signInModal(page)

      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Signed).toBe(true)
      const phases = (c?.episode as { phases: unknown } | undefined)?.phases as Array<{ kind: string; endedAt?: string }>
      expect(phases).toHaveLength(2)
      expect(phases[0].kind).toBe('TEMPORARY')
      expect(phases[0].endedAt).toBeTruthy()
      expect(phases[1].kind).toBe('MAIN')

      await switchRole(page, 'officer')
      await page.goto(method1Url)
      await expect(page.getByText('สถานะปัจจุบัน: MAIN_ACTIVE')).toBeVisible()
    })
  })

  test('J10-f · [ทางแยก] WIT0818 เลขาธิการฯ ส่งกลับแก้ไข คบ.8 → Revision ใหม่ → เสนอซ้ำ → ลงนาม แล้วจึงเดินแผนปฏิบัติได้ (WIT0819)', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0809-0813 · พยานลงนาม คบ.11 → ระบบเปิดวิธีที่ 1 ตามที่ คบ.6 เสนอ', async () => {
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await signKb11All(page)
      const c = await readCase(page, CASE_NO)
      expect(c?.kb11Signed).toBe(true)
      expect(c?.approvedMethods).toEqual([1])
    })

    await test.step('WIT0817 · เจ้าหน้าที่ส่งเสนอ คบ.8 (ฉบับที่ 1)', async () => {
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      const c = await readCase(page, CASE_NO)
      expect(c?.kb8SubmittedAt).toBeTruthy()
      expect(c?.kb8Signed).toBeFalsy()
    })

    await test.step('WIT0819 · ก่อน คบ.8 ลงนาม — ห้ามเดินแผนปฏิบัติ (ปุ่มถัดไปถูกปิด)', async () => {
      await page.goto(method1Url)
      await expect(page.getByText(/คบ\.8 ยังไม่ผ่านการลงนาม/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
    })

    await test.step('WIT0818 · เลขาธิการฯ ส่งกลับแก้ไข (ต้องระบุเหตุผล) → เปิด Revision ใหม่', async () => {
      await switchRole(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByTestId('kb8-return-for-revision').click() // ไม่กรอกเหตุผล → ไม่ขึ้นจอยืนยัน
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

      await page.getByTestId('kb8-return-reason-input').fill('รายชื่อชุดคุ้มครองไม่ครบตามที่อนุมัติ')
      await page.getByTestId('kb8-return-for-revision').click()
      await confirmDialog(page, 'ยืนยันส่งกลับ', 'ฉบับที่ 1')

      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Signed).toBeFalsy()
      expect(c?.kb8Version).toBe(2)
      expect((c?.kb8PreviousVersions as unknown[]).length).toBe(1) // เก็บฉบับเดิมไว้
    })

    await test.step('WIT0817 (Revision 2) · เจ้าหน้าที่แก้ไขและเสนอใหม่', async () => {
      await switchRole(page, 'officer')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()
      expect((await readCase(page, CASE_NO))?.kb8SubmittedAt).toBeTruthy()
    })

    await test.step('WIT0818 · เลขาธิการฯ ลงนาม คบ.8 ฉบับที่ 2 (ล็อกเอกสาร)', async () => {
      await switchRole(page, 'secretary')
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
      await signInModal(page)

      const c = await readCase(page, CASE_NO)
      expect(c?.kb8Signed).toBe(true)
      expect(c?.kb8SignedAt).toBeTruthy()
    })

    await test.step('WIT0819 · หลัง คบ.8 ลงนาม ปุ่มถัดไปของแผนปฏิบัติเปิดใช้ได้', async () => {
      await switchRole(page, 'officer')
      await page.goto(method1Url)
      await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeEnabled()
      // WIT0820-0821 เริ่มปฏิบัติจริงทางหลักเป็นของเส้นทางหลัก (method-1 happy path) — ไม่ทำซ้ำที่นี่
    })
  })
})
