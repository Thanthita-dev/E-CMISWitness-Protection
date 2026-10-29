import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { passSarabanCheckpoint } from '../helpers/saraban'
import { CASE_NO, DOSSIER_URL, confirmDialog } from './journey-helpers'

/**
 * Journey J08B · เสนอส่งกรมคุ้มครองสิทธิฯ ก่อนครบ 6 เดือน (ต้องผ่านคณะกรรมการ) และแจ้งเตือนล่วงหน้า 1 เดือน
 *
 * ผัง: เคสที่เริ่มคุ้มครองแล้ว (Case 5 ปรับยอดสะสมเหลือ 60 วัน) — เจ้าหน้าที่เห็นควรเสนอจากหน้าภาพรวมการคุ้มครอง
 *   → จัดทำข้อเสนอ + หนังสือแจ้งกรมฯ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ
 *   → ส่งคืนเจ้าหน้าที่ → กด "ส่งให้คณะกรรมการ" (คณะกรรมการพิจารณาในอีกกิจกรรม — เส้นนี้จบที่รอผล)
 * กรณีเหลือไม่เกิน 30 วัน/ครบเพดาน ใช้สายเดิมไปส่งหนังสือถึงกรม (ดู J08)
 *
 * แจ้งเตือนล่วงหน้า 1 เดือนก่อนครบ 6 เดือน: กระดิ่ง · หน้าภาพรวมการคุ้มครอง · หน้าแฟ้มคำร้อง
 */

const ARTICLE14_URL = '/article14'
const CHAIN = ['supervisor', 'director', 'deputy_secretary', 'secretary'] as const

/** Episode เทียมที่มีวันสะสมตามที่ต้องการ นับจากวันเริ่มจริงย้อนหลัง */
function episodeWithCumulativeDays(days: number) {
  const startedAt = new Date(Date.now() - (days - 1) * 86400000).toISOString()
  return {
    id: `EP-TEST-${days}`,
    openedAt: startedAt,
    phases: [{ id: `PH-TEST-${days}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.11' }],
  }
}

const withCumulativeDays = (days: number) => ({
  kb11Signed: true,
  episode: episodeWithCumulativeDays(days),
  article14: undefined,
  article14Referral: undefined,
})

type A14 = Record<string, any>
const a14Of = async (page: Page) => (await readCase(page, CASE_NO))?.article14 as A14

/** ผอ. เสนอขึ้นสำนักงานเลขาธิการ / เลขาธิการส่งผลกลับหน่วย → ผ่านธุรการก่อนผู้รับดำเนินการต่อ */
async function passArticle14Clerks(page: Page, direction: 'up' | 'down') {
  const order = direction === 'up' ? (['receiver', 'secretary_receiver'] as const) : (['secretary_receiver', 'receiver'] as const)
  for (const clerk of order) await passSarabanCheckpoint(page, CASE_NO, clerk)
}

async function reviewerEndorses(page: Page, role: (typeof CHAIN)[number]) {
  await switchRole(page, role)
  await page.goto(ARTICLE14_URL)
  const endorse = page.getByTestId('article14-endorse-button')
  if (role === 'secretary') await expect(endorse).toHaveText(/ส่งคืนเจ้าหน้าที่ส่งคณะกรรมการ/)
  await page.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข').fill('เห็นชอบ')
  await endorse.click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ', role === 'secretary' ? 'ก่อนครบ 6 เดือน' : undefined)
  if (role === 'director') await passArticle14Clerks(page, 'up')
  if (role === 'secretary') await passArticle14Clerks(page, 'down')
}

test.describe('J08B · เสนอส่งกรมคุ้มครองสิทธิฯ ก่อนครบ 6 เดือน', () => {
  test('เสนอจากหน้าภาพรวม → ลำดับชั้นถึงเลขาธิการ → เจ้าหน้าที่ส่งให้คณะกรรมการ', async ({ page }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 5', 'officer', withCumulativeDays(60))

    await test.step('หน้าภาพรวม → ดูระยะเวลาคุ้มครอง: เคสที่เริ่มคุ้มครองแล้วมีปุ่มเสนอส่งกรมฯ และยังไม่มีแจ้งเตือนใกล้ครบ', async () => {
      await page.goto('/protection')
      const row = page.locator('tr', { hasText: CASE_NO })
      await expect(row).toBeVisible()
      await expect(row.getByTestId('protection-near-cap-badge')).toHaveCount(0)
      await expect(page.getByTestId('protection-near-cap-callout')).toHaveCount(0)
      // ปุ่มเสนอไม่อยู่ในแถวของหน้าภาพรวม — อยู่ในหน้าระยะเวลาคุ้มครอง
      await expect(row.getByRole('button', { name: 'เสนอส่งต่อหน่วยงานอื่น' })).toHaveCount(0)
      await row.getByRole('link', { name: 'ดูระยะเวลาคุ้มครอง' }).click()
      await expect(page).toHaveURL(new RegExp(`/protection-duration\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      await page.getByTestId('duration-propose-article14').click()
      // ป็อปอัปเลือกหน่วยงานปลายทาง — ค่าตั้งต้นกรมคุ้มครองสิทธิฯ
      await confirmDialog(page, 'ไปจัดทำข้อเสนอ', 'ส่งให้กรมคุ้มครองสิทธิและเสรีภาพ')
      await expect(page).toHaveURL(new RegExp(`/article14\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}&agency=rlpd`))
    })

    await test.step('หน้าส่งต่อ: แจ้งว่ายังไม่ครบ 6 เดือนและต้องผ่านคณะกรรมการ แล้วจัดทำข้อเสนอ', async () => {
      await expect(page.getByTestId('article14-early-hint')).toContainText('ส่งคณะกรรมการพิจารณา')
      await expect(page.getByTestId('article14-near-cap-hint')).toHaveCount(0)
      await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ผู้ต้องหามีอิทธิพลในพื้นที่ มาตรการเดิมไม่เพียงพอ')
      await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill('คบ.13 รอบล่าสุดพบการข่มขู่ซ้ำ ความเสี่ยงสูง')
      await page.getByTestId('submit-article14-proposal').click()
      await confirmDialog(page, 'ยืนยันจัดทำ')
      await expect(page).toHaveURL(new RegExp(DOSSIER_URL))
      const a14 = await a14Of(page)
      expect(a14.step).toBe('proposal_draft')
      expect(a14.earlyReferral).toBe(true)
    })

    await test.step('แฟ้ม: บันทึกหนังสือแจ้งกรมฯ แล้วส่งให้ผู้บังคับบัญชาชั้นต้น', async () => {
      const footer = page.getByTestId('article14-review-footer')
      await expect(footer).toContainText('ส่งคืนเจ้าหน้าที่ส่งคณะกรรมการ')
      await page.locator('[data-testid="dossier-form-row"][data-form-number="18"]').getByText('เปิดแบบฟอร์ม').click()
      await expect(page).toHaveURL(/\/form\/18/)
      await page.getByRole('button', { name: /บันทึกหนังสือ$/ }).click()
      await page.goto(DOSSIER_URL)
      await footer.getByTestId('article14-submit-review').click()
      await confirmDialog(page, 'ยืนยันส่ง', 'ผู้บังคับบัญชาชั้นต้น')
      expect((await a14Of(page)).step).toBe('supervisor_review')
    })

    await test.step('ผบช.ชั้นต้น → ผอ. → รองเลขาธิการ → เลขาธิการ เห็นชอบตามลำดับ', async () => {
      for (const role of CHAIN) await reviewerEndorses(page, role)
      const a14 = await a14Of(page)
      expect(a14.step).toBe('committee_pending')
      expect(a14.approvals.map((a: A14) => a.level)).toEqual([...CHAIN])
    })

    await test.step('เจ้าหน้าที่: ไม่มีฟอร์มนำส่งหนังสือถึงกรม มีแต่ปุ่มส่งให้คณะกรรมการ', async () => {
      await switchRole(page, 'officer')
      await page.goto(`${ARTICLE14_URL}?caseNo=${CASE_NO}`)
      await expect(page.getByTestId('article14-early-badge')).toBeVisible()
      await expect(page.getByTestId('article14-delivery-form')).toHaveCount(0)
      await expect(page.getByTestId('article14-committee-approve')).toHaveCount(0)
      const card = page.getByTestId('article14-committee-send')
      await expect(card).toContainText('เลขาธิการเห็นชอบเสนอส่งต่อกรมคุ้มครองสิทธิฯ ก่อนครบ 6 เดือนแล้ว')
      await card.getByTestId('article14-send-committee').click()
      await confirmDialog(page, 'ยืนยันส่ง', CASE_NO)
      await expect(page.getByTestId('article14-committee-sent')).toContainText('รอผลพิจารณาของคณะกรรมการ')
      await expect(page.getByTestId('article14-send-committee')).toHaveCount(0)
    })

    await test.step('สถานะแฟ้มจบที่รอผลคณะกรรมการ (พิจารณาในอีกกิจกรรม)', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.next).toBe('รอผลพิจารณาของคณะกรรมการ')
      const a14 = c?.article14 as A14
      expect(a14.step).toBe('committee_pending')
      expect(a14.committeeSentAt).toBeTruthy()
      // ยังไม่บันทึกการนำส่งถึงกรม
      expect((c?.officialLetters as A14[] | undefined)?.some((l) => l.context === 'article14') ?? false).toBe(false)
    })
  })

  test('บทบาทอื่นเห็นสถานะรอส่งคณะกรรมการ แต่ไม่มีปุ่มส่ง', async ({ page }) => {
    await seedMockState(page, 'Case 5', 'supervisor', {
      ...withCumulativeDays(60),
      stage: 'article14',
      article14: {
        step: 'committee_pending', earlyReferral: true, openedAt: '01/10/2569 09:00', openedBy: 'นางสาวอรุณี ใจมั่น',
        threatSummary: 'ภัยยังคงอยู่', riskAssessment: 'สูง', secretaryAt: '10/10/2569 11:00', secretaryNote: 'เห็นชอบ',
        letterVersion: 1, approvals: [], revisions: [],
      },
    })
    await page.goto(`${ARTICLE14_URL}?caseNo=${CASE_NO}`)
    await expect(page.getByTestId('article14-committee-send')).toContainText('รอเจ้าหน้าที่เจ้าของสำนวนส่งเรื่องให้คณะกรรมการ')
    await expect(page.getByTestId('article14-send-committee')).toHaveCount(0)
  })
})

test.describe('J08B · ผู้รับผิดชอบคุ้มครอง กอท. เสนอส่งกรมฯ ในเคสตัวอย่าง', () => {
  test('เคสตัวอย่างทบทวน/ขยายเวลา: เปิดจากหน้าระยะเวลาคุ้มครองแล้วกรอกข้อเสนอได้', async ({ page }) => {
    // แฟ้มส่งต่อ กอท. แล้ว — ผู้รับผิดชอบคือเจ้าหน้าที่ กอท. (got_officer)
    await seedMockState(page, 'PostApproval 5', 'got_officer', { stage: 'protection', ...withCumulativeDays(40) })
    await page.goto('/protection')
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('ecmis-case-storage-v2')!)
      raw.state.cases[0].protectionHandoff.step = 'active'
      localStorage.setItem('ecmis-case-storage-v2', JSON.stringify(raw))
    })
    await page.reload()
    await page.getByRole('button', { name: /เพิ่มเคสตัวอย่าง/ }).click()

    for (const suffix of ['-009902', '-009901']) {
      const no = await page.evaluate(
        (x) => JSON.parse(localStorage.getItem('ecmis-case-storage-v2')!).state.cases.find((c: { no: string }) => c.no.endsWith(x)).no,
        suffix
      )
      await page.goto(`/protection-duration?caseNo=${no}`)
      // เคสรอทบทวนมีป็อปอัปเตือนทบทวน — ปิดก่อน
      const later = page.getByRole('button', { name: 'ภายหลัง' })
      if (await later.isVisible().catch(() => false)) await later.click()
      await page.getByTestId('duration-propose-article14').click()
      await confirmDialog(page, 'ไปจัดทำข้อเสนอ')
      await expect(page.getByTestId('article14-early-hint')).toBeVisible()
      await expect(page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' })).toBeVisible()
      await expect(page.getByTestId('submit-article14-proposal')).toBeVisible()
    }

    await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ภัยยังคงอยู่')
    await page.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }).fill('ความเสี่ยงสูง')
    await page.getByTestId('submit-article14-proposal').click()
    await confirmDialog(page, 'ยืนยันจัดทำ')
    await expect(page).toHaveURL(/\/dossier\//)
    await expect(page.getByTestId('article14-review-footer').getByTestId('article14-submit-review')).toBeVisible()
  })
})

test.describe('J08B · แจ้งเตือนล่วงหน้า 1 เดือนก่อนครบ 6 เดือน', () => {
  test('เหลือไม่เกิน 30 วัน: แจ้งที่กระดิ่ง หน้าภาพรวม และหน้าแฟ้ม', async ({ page }) => {
    await seedMockState(page, 'Case 5', 'officer', withCumulativeDays(170))

    await test.step('หน้าภาพรวมการคุ้มครอง: แถบสรุปและป้ายในแถวของเคส', async () => {
      await page.goto('/protection')
      await expect(page.getByTestId('protection-near-cap-callout')).toContainText('ภายใน 1 เดือน')
      await expect(page.locator('tr', { hasText: CASE_NO }).getByTestId('protection-near-cap-badge')).toContainText(/ใกล้ครบ 6 เดือน · อีก \d+ วัน/)
    })

    await test.step('หน้าแฟ้มคำร้อง: แบนเนอร์เตือนพร้อมปุ่มเสนอส่งต่อหน่วยงานอื่น', async () => {
      await page.goto(DOSSIER_URL)
      const banner = page.getByTestId('dossier-near-cap-warning')
      await expect(banner).toContainText(/ใกล้ครบระยะเวลาคุ้มครอง 6 เดือน — อีก \d+ วัน/)
      await banner.getByRole('button', { name: 'เสนอส่งต่อหน่วยงานอื่น' }).click()
      await confirmDialog(page, 'ไปจัดทำข้อเสนอ')
      await expect(page).toHaveURL(new RegExp(`/article14\\?caseNo=${CASE_NO.replace('/', '(?:/|%2F)')}`))
      // ช่วงใกล้ครบใช้สายเดิม ไม่ใช่เส้นเสนอก่อนครบที่ต้องผ่านคณะกรรมการ
      await expect(page.getByTestId('article14-near-cap-hint')).toBeVisible()
      await expect(page.getByTestId('article14-early-hint')).toHaveCount(0)
    })

    await test.step('กระดิ่ง: แจ้งเตือนถึงเจ้าของเรื่องครั้งเดียว แม้โหลดหน้าซ้ำ', async () => {
      await page.reload()
      await page.goto('/notifications')
      await expect(page.getByText(`แฟ้ม ${CASE_NO}`, { exact: false }).filter({ hasText: 'จะครบ 6 เดือน' })).toHaveCount(1)
      const sent = await page.evaluate(() =>
        (JSON.parse(localStorage.getItem('ecmis-notifications-storage') || '{}').state?.notifications || []).filter(
          (n: { type: string }) => n.type === 'ใกล้ครบระยะเวลาคุ้มครอง 6 เดือน'
        )
      )
      expect(sent).toHaveLength(1)
      expect(sent[0].caseNo).toBe(CASE_NO)
    })
  })
})
