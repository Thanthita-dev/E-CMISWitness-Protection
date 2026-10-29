import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { saveAndSubmitKb16, termDownLeg, termUpLeg } from '../helpers/termination'
import { confirmDialog, formRow } from '../journeys/journey-helpers'

/**
 * FB-029 — เหตุสิ้นสุดการคุ้มครองตามระเบียบข้อ 18
 *
 * - ข้อ 18 (1)–(3) ไม่มีสิทธิอุทธรณ์: ยังส่ง คบ.17 แจ้งผล แต่ไม่มีย่อหน้าสิทธิอุทธรณ์ทั้งใน คบ.16 และ คบ.17
 *   ไม่มีขั้นบันทึกวันรับ/ฟอร์มรับอุทธรณ์ และปิดงานได้ทันทีหลังนำส่ง คบ.17
 * - ข้อ 18 (4) เลขาธิการสั่งยุติตามข้อ 19 อุทธรณ์ได้: นับ 30 วันจากวันที่พยานได้รับ คบ.17 และรับอุทธรณ์ได้
 * - เจ้าหน้าที่เลือกข้อระเบียบตอนจัดทำ คบ.15 · ค่าตั้งต้น: พยานขอยุติ = ข้อ (1) · ที่มาอื่น = ข้อ (4)
 *
 * แต่ละกรณีเดินทั้งเส้น: บันทึกเหตุเริ่มยุติ → คบ.15 → ผบช.เห็นชอบ → เลขาธิการอนุมัติ → คบ.16 → ลงนาม
 * → คบ.17 → ลงนาม → ออกเลขนำส่ง → ปิดงาน (หรือรับอุทธรณ์สำหรับข้อ (4)) ผ่านธุรการทุกขาที่ข้ามหน่วย
 */

type Rec = Record<string, unknown>
type Source = 'witness_kb7' | 'external_letter' | 'due_or_officer'

const NO = '0501/2569'
const TERM_URL = `/termination/${encodeURIComponent(NO)}`
const OWNER = 'case_owner'

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ย่อหน้าสิทธิอุทธรณ์บนกระดาษ (formPages.tsx) */
const KB16_APPEAL_TEXT = 'มีสิทธิอุทธรณ์คำสั่งภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง'
const KB17_APPEAL_TEXT = 'ท่านมีสิทธิอุทธรณ์คำสั่งให้ความคุ้มครองพยานสิ้นสุด'

interface Fb029Case {
  clause: 1 | 2 | 3 | 4
  label: string
  source: Source
  /** ค่าตั้งต้นในช่องเหตุสิ้นสุดตามระเบียบ ก่อนเจ้าหน้าที่เปลี่ยน */
  defaultClause: 1 | 4
  reason: string
  appealable: boolean
}

const CASES: Fb029Case[] = [
  {
    clause: 1,
    label: 'ข้อ 18 (1)',
    source: 'witness_kb7',
    defaultClause: 1,
    reason: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป',
    appealable: false,
  },
  {
    clause: 2,
    label: 'ข้อ 18 (2)',
    source: 'due_or_officer',
    defaultClause: 4,
    reason: 'ครบกำหนดระยะเวลาคุ้มครองตามคำสั่ง และเหตุแห่งภัยดับลง',
    appealable: false,
  },
  {
    clause: 3,
    label: 'ข้อ 18 (3)',
    source: 'external_letter',
    defaultClause: 4,
    reason: 'พยานได้รับความคุ้มครองตามกฎหมายว่าด้วยการคุ้มครองพยานในคดีอาญา',
    appealable: false,
  },
  {
    clause: 4,
    label: 'ข้อ 18 (4)',
    source: 'due_or_officer',
    defaultClause: 4,
    reason: 'พยานไม่ปฏิบัติตามข้อตกลงและเงื่อนไขการคุ้มครอง (คบ.11)',
    appealable: true,
  },
]

/** แฟ้มที่อยู่ระหว่างคุ้มครอง ยังไม่เริ่มเรื่องยุติ — ใช้ตั้งต้นเดียวกับ e2e/flows/kb16-direct-form.spec.ts */
async function seedActiveProtection(page: Page) {
  await seedMockState(page, 'Approved - วิธีที่ 4', OWNER, {
    stage: 'method_operation',
    closedAt: undefined,
    protectionHandoff: undefined,
    terminationTrigger: undefined,
    kb15: undefined,
    terminationApproval: undefined,
    kb16: undefined,
    kb17: undefined,
    appealAgainst: undefined,
    appealDueAt: undefined,
    appealFiledAt: undefined,
  })
}

/** WIT1125-WIT1128 — บันทึกเหตุเริ่มยุติตามที่มาของเรื่อง */
async function recordTrigger(page: Page, source: Source) {
  // พยานขอยุติ: เข้าหน้าด้วย ?source=witness_kb7 (เหมือนกลับมาจากแบบ คบ.7) เพื่อไม่ให้ radio พาไปแบบ คบ.7
  await page.goto(source === 'witness_kb7' ? `${TERM_URL}?source=witness_kb7` : TERM_URL)
  const form = page.getByTestId('termination-trigger-form')
  await expect(form).toBeVisible()
  if (source === 'external_letter') await form.getByText('หนังสือภายนอก', { exact: true }).click()

  if (source === 'witness_kb7') {
    await form.getByPlaceholder('เลขที่ คบ.7 / เลขรับคำขอในระบบ').fill('KB7-029/2569')
    await form.getByPlaceholder(/ไฟล์ คบ\.7 ที่พยานลงนาม/).fill('คบ7_พยานลงนาม.pdf')
  } else if (source === 'external_letter') {
    await form.getByPlaceholder('เลขที่หนังสือจากสารบรรณเดิม').fill('ศาล 0029/2569')
    await form.getByPlaceholder(/ไฟล์หนังสือขอยุติจากภายนอก/).fill('หนังสือแจ้งคุ้มครองตามกฎหมายคดีอาญา.pdf')
  } else {
    await form.getByPlaceholder('คำสั่งที่ครบกำหนด').fill('คำสั่งคุ้มครองเดิม')
  }

  await form.getByRole('button', { name: 'บันทึกเรื่องยุติ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('บันทึกเหตุเริ่มยุติ')
  expect(((await readCase(page, NO))?.terminationTrigger as Rec).source).toBe(source)
}

/** WIT1129 + FB-029 — จัดทำ คบ.15 พร้อมเลือกข้อระเบียบ */
async function draftKb15WithClause(page: Page, c: Fb029Case) {
  const clauseSelect = page.getByTestId('kb15-clause-select')
  await expect(clauseSelect).toHaveValue(String(c.defaultClause))
  await clauseSelect.selectOption(String(c.clause))

  await page
    .locator('select', { has: page.locator('option', { hasText: '— เลือกเหตุยุติ —' }) })
    .selectOption({ label: c.reason })
  await page.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง').fill('ผลประเมินและเอกสารประกอบครบถ้วน')
  await page.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('จัดทำ คบ.15')

  const kb15 = (await readCase(page, NO))?.kb15 as Rec
  expect(kb15.regulationClause).toBe(c.clause)
  const shown = page.getByTestId('kb15-regulation-clause')
  await expect(shown).toContainText(c.label)
  await expect(shown).toContainText(c.appealable ? 'มีสิทธิอุทธรณ์' : 'ไม่มีสิทธิอุทธรณ์')
}

/** WIT1131-WIT1137 — ผบช.ชั้นต้นเห็นชอบ → เลขาธิการอนุมัติ ผ่านธุรการทั้งขาไปและขากลับ */
async function endorseAndApprove(page: Page) {
  await switchRole(page, 'supervisor')
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'ครบถ้วน · เสนอผู้มีอำนาจ', exact: true }).click()
  await confirmDialog(page, 'ยืนยันครบถ้วน')
  await termUpLeg(page, NO)

  await page.goto(TERM_URL)
  await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ')
  await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')
  await termDownLeg(page, NO, OWNER)
}

/** WIT1138-WIT1139 — จัดทำ คบ.16 (ตรวจย่อหน้าสิทธิอุทธรณ์บนกระดาษ) → เลขาธิการลงนาม */
async function issueAndSignKb16(page: Page, c: Fb029Case) {
  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'จัดทำ คบ.16', exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/form/16\\?caseNo=${NO.replace('/', '(?:/|%2F)')}`))
  await page.getByRole('textbox', { name: 'คำสั่งที่ *', exact: true }).fill(`29${c.clause}/2569`)

  // FB-029 — คบ.16 แจ้งสิทธิอุทธรณ์เฉพาะเหตุข้อ 18 (4)
  // รอกระดาษเรนเดอร์ก่อน ไม่ให้การตรวจว่า "ไม่มีย่อหน้า" ผ่านเพราะหน้ายังว่าง
  await expect(page.getByTestId('paper-page-1')).toContainText('ข้อ ๑๘')
  if (c.appealable) await expect(page.getByTestId('paper-page-1').getByText(KB16_APPEAL_TEXT)).toBeVisible()
  else await expect(page.getByText(KB16_APPEAL_TEXT)).toHaveCount(0)

  await saveAndSubmitKb16(page, NO)
  await expect.poll(async () => ((await readCase(page, NO))?.kb16 as Rec | undefined)?.status).toBe('submitted')
  await termUpLeg(page, NO)

  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
  await expect.poll(async () => ((await readCase(page, NO))?.kb16 as Rec).signedAt).toBeTruthy()
  await termDownLeg(page, NO, OWNER)
}

/** WIT1141-WIT1142 — จัดทำ คบ.17 (ตรวจย่อหน้าสิทธิอุทธรณ์บนกระดาษ) → ลงนาม → ออกเลขและนำส่ง */
async function signAndDispatchKb17(page: Page, c: Fb029Case) {
  await page.goto(TERM_URL)
  await page.getByPlaceholder('ชื่อไฟล์หนังสือ').fill('คบ17_แจ้งคำสั่งยุติ.pdf')
  await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
  await expect(page).toHaveURL(new RegExp(`/dossier/${encodeURIComponent(NO)}`))

  // FB-029 — คบ.17 พิมพ์ย่อหน้าสิทธิอุทธรณ์เฉพาะเหตุข้อ 18 (4) และไม่พิมพ์คำกำกับของแบบ
  await page.goto(`/form/17?caseNo=${NO}`)
  // รอกระดาษเรนเดอร์ก่อน ไม่ให้การตรวจว่า "ไม่มีย่อหน้า" ผ่านเพราะหน้ายังว่าง
  await expect(page.getByTestId('paper-page-1')).toContainText('ข้อ ๑๘')
  if (c.appealable) await expect(page.getByTestId('paper-page-1').getByText(KB17_APPEAL_TEXT)).toBeVisible()
  else await expect(page.getByText(KB17_APPEAL_TEXT)).toHaveCount(0)
  await expect(page.getByText(/ใส่เรื่องการแจ้งสิทธิอุทธรณ์เฉพาะกรณี/)).toHaveCount(0)

  await page.goto(`/dossier/${encodeURIComponent(NO)}`)
  await formRow(page, 'คบ.17').getByRole('button', { name: /ส่งให้ลงนาม|ส่งให้ผู้มีอำนาจ|ส่งให้อนุมัติ/ }).click()
  await confirmDialog(page, 'ส่งให้ลงนาม')
  await termUpLeg(page, NO)

  await page.goto(TERM_URL)
  await page.getByRole('button', { name: 'ลงนาม คบ.17' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('ลงนาม คบ.17')
  await termDownLeg(page, NO, OWNER)

  await page.goto(TERM_URL)
  await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill(`สลข.029${c.clause}/2569`)
  await page.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }).click()
  await expect(page.locator('.swal2-toast')).toContainText('ออกเลขและนำส่ง')
  expect(((await readCase(page, NO))?.kb17 as Rec).dispatchedAt).toBeTruthy()
}

async function runToKb17Dispatched(page: Page, c: Fb029Case) {
  await test.step('บันทึกเหตุเริ่มยุติ', () => recordTrigger(page, c.source))
  await test.step(`จัดทำ คบ.15 เลือก ${c.label}`, () => draftKb15WithClause(page, c))
  await test.step('ผบช.เห็นชอบ · เลขาธิการอนุมัติ', () => endorseAndApprove(page))
  await test.step('คบ.16 ตรวจย่อหน้าอุทธรณ์ · ลงนาม', () => issueAndSignKb16(page, c))
  await test.step('คบ.17 ตรวจย่อหน้าอุทธรณ์ · ลงนาม · นำส่ง', () => signAndDispatchKb17(page, c))
}

test.describe('FB-029 · สิทธิอุทธรณ์คำสั่งยุติตามระเบียบข้อ 18', () => {
  for (const c of CASES.filter((x) => !x.appealable)) {
    test(`${c.label} ไม่มีสิทธิอุทธรณ์ — นำส่ง คบ.17 แล้วปิดงานได้ทันที`, async ({ page }) => {
      test.setTimeout(300_000)
      await seedActiveProtection(page)
      await runToKb17Dispatched(page, c)

      await test.step('ไม่มีขั้นนับกรอบอุทธรณ์ · ปิดงานทันที', async () => {
        const noAppeal = page.getByTestId('kb17-no-appeal')
        await expect(noAppeal).toContainText(c.label)
        await expect(noAppeal).toContainText('ไม่มีสิทธิอุทธรณ์')
        await expect(page.getByLabel('วันที่พยานได้รับจริง')).toHaveCount(0)
        await expect(page.getByTestId('appeal-intake-form')).toHaveCount(0)

        await noAppeal.getByRole('button', { name: 'ปิดงาน (ไม่มีสิทธิอุทธรณ์)' }).click()
        await expect(page.locator('.swal2-toast')).toContainText('ปิดงานคุ้มครอง')
        const after = await readCase(page, NO)
        expect(after?.stage).toBe('terminated')
        expect(after?.closedAt).toBeTruthy()
        expect(after?.appealAgainst).toBeFalsy()
        await expect(page.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/)).toBeVisible()
      })
    })
  }

  const c4 = CASES.find((x) => x.appealable)!
  test(`${c4.label} อุทธรณ์ได้ — นับกรอบ 30 วันจากวันรับ ปิดงานก่อนครบไม่ได้ และรับอุทธรณ์ได้`, async ({ page }) => {
    test.setTimeout(300_000)
    await seedActiveProtection(page)
    await runToKb17Dispatched(page, c4)

    await test.step('ยังไม่มีวันรับ — ยังปิดงานไม่ได้', async () => {
      await expect(page.getByTestId('kb17-no-appeal')).toHaveCount(0)
      await expect(page.getByText('ยังไม่เริ่มนับกรอบอุทธรณ์')).toBeVisible()
      await expect(page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })).toBeDisabled()
    })

    await test.step('บันทึกวันที่พยานได้รับ — เริ่มนับ 30 วัน ยังอยู่ในกรอบจึงปิดงานไม่ได้', async () => {
      await page.getByLabel('วันที่พยานได้รับจริง').fill(isoDaysFromToday(-5))
      await page.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }).click()
      await expect(page.locator('.swal2-toast')).toContainText('เริ่มนับอุทธรณ์')
      await expect(page.getByText(/ครบกำหนดอุทธรณ์.*\(เหลือ \d+ วัน\)/)).toBeVisible()
      await expect(page.getByRole('button', { name: 'ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน' })).toBeDisabled()
    })

    await test.step('รับอุทธรณ์คำสั่งยุติภายในกำหนด — ผูกกับ คบ.17 เดิม', async () => {
      const intake = page.getByTestId('appeal-intake-form')
      await intake.getByTestId('appeal-intake-reason').fill('ยังมีเหตุอันตรายอยู่ ขอให้ทบทวนคำสั่งยุติ')
      await intake.getByTestId('appeal-intake-channel-letter').click()
      await intake.getByTestId('appeal-intake-registry-no').fill('ปปท 0029/5501')
      await intake.getByTestId('appeal-intake-evidence-file').setInputFiles({
        name: 'คำร้องอุทธรณ์คำสั่งยุติ.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 mock'),
      })
      await intake.getByRole('button', { name: /มีอุทธรณ์ภายในกำหนด$/ }).click()
      await confirmDialog(page, 'ยืนยัน')
      await expect(page.locator('.swal2-toast')).toContainText('รับคำอุทธรณ์คำสั่งยุติ')
      const after = await readCase(page, NO)
      expect(after?.appealAgainst).toBe('kb17')
      expect(after?.stage).toBe('appeal')
      expect(after?.no).toBe(NO)
    })
  })
})
