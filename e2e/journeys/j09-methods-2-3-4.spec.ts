import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { CASE_NO, DOSSIER_URL, cancelDialog, confirmDialog, expectStage, signInModal } from './journey-helpers'

/**
 * Journey J09 — อนุมัติหลายวิธี: วิธีที่ 2 / 3 และวิธีที่ 4 เดี่ยว (scenario `methods-2-3-4`)
 *
 * กฎการเลือกวิธีตามข้อ 15: วิธีที่ 1–3 เลือกร่วมกันได้ ส่วนวิธีที่ 4 ต้องเลือกเดี่ยว
 * (เลือกวิธีที่ 4 ระบบนำวิธีที่ 1–3 ออกให้ และเลือกวิธีที่ 1–3 ระบบนำวิธีที่ 4 ออกให้)
 *
 * เส้นทางตามผัง: 08A (พยานลงนาม คบ.11 → แยกเส้นทางตามวิธี WIT0813)
 *   → 08A-2 (WIT0822-0829 สถานที่ปลอดภัย) → 08A-3 (WIT0830-0837 ปกปิดข้อมูล)
 *   และอีกแฟ้มหนึ่ง → 08B (WIT0841-0849 ประสานหน่วยงานอื่น ข้อ 15(4)) เป็นวิธีเดียวในแฟ้ม
 *
 * จุดตั้งต้น: Case 1.11 (คบ.9 ถึงมือพยานแล้ว เหลือลงนาม คบ.11) — ผ่านเฉพาะ UI ไปจนวิธีที่ 2, 3 เป็น ACTIVE (J09)
 * หรือวิธีที่ 4 เป็น ACTIVE (J09-e) แต่ละวิธีมี status / วันเริ่มจริงของตัวเอง ภายใต้ Episode/แฟ้มเดียวกัน
 *
 * ทางแยก (◇) ที่ครอบคลุม:
 *  - 08A-2 WIT0826  สถานที่ไม่เหมาะสม → วนกลับเสนอสถานที่ใหม่ (เก็บผลประเมินทุกรอบ)
 *  - 08A-2 WIT0826  สถานที่ไม่เหมาะสม → เปลี่ยนไปใช้วิธีที่ 4 แทน (ให้หน่วยงานอื่นทำแทน → 08B)
 *  - 08A-3 WIT0834  ทดสอบสิทธิ์ไม่ผ่าน → แก้ Role แล้วทดสอบซ้ำจนผ่าน (WIT0835)
 *  - 08B  WIT0844   หน่วยงานปฏิเสธ → เสนอหน่วยงานใหม่ผ่าน ผบช.ชั้นต้น → ผอ. (WIT0845) แล้วประสานต่อจนส่งมอบ
 */

const METHODS_URL = '/protection-methods'
const method2Url = `/protection-method/2?caseNo=${CASE_NO}`
const method3Url = `/protection-method/3?caseNo=${CASE_NO}`
const method4Url = `/protection-method/4?caseNo=${CASE_NO}`

const AGENCY_A = 'สำนักงานคุ้มครองพยาน กรมสอบสวนคดีพิเศษ (DSI)'
const AGENCY_B = 'กองบังคับการปราบปราม สำนักงานตำรวจแห่งชาติ'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

type Track = {
  method: number
  status: string
  startedAt?: string
  site?: Record<string, unknown>
  privacy?: Record<string, unknown>
  coordination?: Record<string, unknown>
}

async function getTrack(page: Page, method: number): Promise<Track | undefined> {
  const c = await readCase(page, CASE_NO)
  return (c?.methodTracks as Track[] | undefined)?.find((t) => t.method === method)
}

const isoDaysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** เซ็นทุกช่องของ คบ.11 ที่ยังไม่ได้เซ็น แล้วกด "บันทึกข้อตกลง คบ.11" (WIT0810-0811) */
async function signKb11All(page: Page) {
  const signButtons = page.getByRole('button', { name: 'ลงลายมือชื่อ' })
  const count = await signButtons.count()
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'ลงลายมือชื่อ' }).first().click()
    // ช่องพยานในการทำข้อตกลงไม่มีชื่อตั้งต้น — signInModal กรอกให้เมื่อว่าง
    await signInModal(page, 'พยานในการทำข้อตกลง')
  }
  await page.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }).click()
}

/** เดิน wizard ของแผงวิธีที่ 4 ไปยัง section ที่ต้องการ (0=หน่วยงาน 1=ขาออก 2=ขาเข้า 3=ส่งมอบ) */
async function gotoSection4(page: Page, index: number) {
  await page.goto(method4Url)
  const indicator = page.getByText(/ขั้นตอน \d+ จาก \d+/)
  for (let guard = 0; guard < 8; guard++) {
    const current = Number((await indicator.innerText()).match(/ขั้นตอน (\d+)/)![1]) - 1
    if (current === index) return
    await page.getByRole('button', { name: current < index ? 'ถัดไป' : 'ย้อนกลับ' }).click()
  }
  throw new Error(`ไปไม่ถึง section ${index}`)
}

/** ตั้งต้นสำหรับทางแยก: ผ่าน คบ.11 แล้ว เปิดเฉพาะวิธีที่ต้องการ (state เดียวกับที่ UI สร้างหลังประตู WIT0813) */
function atRoutesOpened(methods: number[]) {
  return {
    kb9Signed: true,
    kb11Signed: true,
    consents: [{ ref: 'kb11', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
    approvedMethods: methods,
    methodTracks: methods.map((m) => ({ method: m, status: 'pending' })),
    consentDeclineProposals: [],
    coordinationProposals: [],
    officialLetters: [],
  }
}

test.describe('J09 · อนุมัติหลายวิธี 2 / 3 และวิธีที่ 4 เดี่ยว', () => {
  test('J09 · เปิดวิธีที่ 2, 3 พร้อมกันหลังพยานลงนาม คบ.11 แล้วเดินแต่ละวิธีจนปฏิบัติจริง (08A → 08A-2 → 08A-3)', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    // ── 08A ──────────────────────────────────────────────────────────────
    await test.step('WIT0809/WIT0810/WIT0811 · พยานยินยอมและลงนาม คบ.11 ครบทุกช่อง แล้วเก็บฉบับลงนาม', async () => {
      // WIT0801-0808 ⚙️ รับผลอนุมัติ / จัดทำและนำส่ง คบ.9 / ชี้แจงข้อตกลง — เกิดแล้วใน Case 1.11 หรือนอกระบบ
      await page.goto(DOSSIER_URL)
      const before = await readCase(page, CASE_NO)
      expect(before?.kb9Signed).toBe(true)
      expect(before?.deliveredAt).toBeTruthy()
      expect(before?.kb11Signed).toBeFalsy()

      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await signKb11All(page)

      const after = await readCase(page, CASE_NO)
      expect(after?.kb11Signed).toBe(true)
      expect(after?.consents).toEqual(expect.arrayContaining([expect.objectContaining({ ref: 'kb11', consented: true })]))
    })

    await test.step('WIT0813 · เลือกวิธีที่ 2, 3 พร้อมกัน (เปลี่ยนจากวิธีที่ 1 ที่ คบ.6 เสนอไว้) แล้วเปิดเส้นทางปฏิบัติ', async () => {
      // หลังลงนาม คบ.11 ระบบเปิดวิธีที่ 1 ตามที่เสนอใน คบ.6 ให้อัตโนมัติ — คำร้องนี้อนุมัติวิธี 2/3/4 จึงปรับชุดวิธีที่หน้า "วิธีคุ้มครองตามข้อ 15"
      // (ผัง: ◇ อนุมัติวิธีใด → ทำได้หลายวิธีพร้อมกัน)
      expect((await readCase(page, CASE_NO))?.approvedMethods).toEqual([1])
      await page.goto(METHODS_URL)
      await expect(page.getByText('ความยินยอมตาม คบ.11')).toBeVisible()
      await expect(page.getByText('— ลงนามครบแล้ว')).toBeVisible()

      await page.getByText('(1) จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').click() // ถอดวิธีที่ 1
      await page.getByText('(2) จัดให้พยานอยู่ในสถานที่เหมาะสม').click()
      await page.getByText('(3) ปกปิด และรักษาความลับ').click()
      await page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }).click()
      await confirmDialog(page, 'ยืนยันเปิดเส้นทางปฏิบัติ', /วิธีที่ 2.*วิธีที่ 3/)

      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([2, 3])
      const tracks = c?.methodTracks as Track[]
      expect(tracks.map((t) => t.method)).toEqual([2, 3])
      // แต่ละวิธีเริ่มที่ pending อิสระจากกัน
      expect(tracks.every((t) => t.status === 'pending')).toBe(true)
      await expectStage(page, 'method_operation')

      // การ์ดเส้นทางทั้งสองขึ้นในหน้าเดียวกัน — ไม่มีวิธีที่ 4
      await expect(page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูล/ })).toBeVisible()
      await expect(page.getByRole('link', { name: /^วิธีที่ 4 — ประสานหน่วยงานอื่น/ })).toHaveCount(0)
    })

    // ── 08A-2 วิธีที่ 2 ──────────────────────────────────────────────────
    await test.step('WIT0822 · รับงานวิธีที่ 2 จากหน้า 08A (คลิกการ์ดเข้าหน้าปฏิบัติ)', async () => {
      await page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/2/)
      await expect(page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง')).toBeVisible()
    })

    await test.step('WIT0823 · ตรวจขอบเขตที่อนุมัติและความจำเป็นของพยาน', async () => {
      await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0824 · เสนอสถานที่ปลอดภัย (ประเภท/สถานที่/ผู้ดูแล/ผู้ประเมิน)', async () => {
      await page.getByLabel('ประเภทสถานที่').selectOption('pacc_designated')
      await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด')
      await page.getByLabel('ผู้ดูแลสถานที่').fill('ร.ต.ท. สมชาย ดูแลดี')
      await page.getByLabel('ผู้ประเมิน').fill('นางสาวอรุณี ใจมั่น')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0825/WIT0826 · ประเมินความปลอดภัย → สถานที่เหมาะสม', async () => {
      await page.getByLabel('ผลประเมินความปลอดภัยและความลับ').fill('ปลอดภัยดี มีรั้วรอบและเจ้าหน้าที่รักษาความปลอดภัย')
      await page.getByRole('button', { name: 'สถานที่เหมาะสม' }).click()
      expect((await getTrack(page, 2))?.site?.suitable).toBe(true)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0827/WIT0828 · จัดแผนย้าย/รับ–ส่ง บันทึกผู้ส่งมอบ–ผู้รับมอบ และแนบหลักฐาน', async () => {
      await page.getByLabel('แผนย้าย / รับ–ส่ง').fill('รับพยานจากที่อยู่เดิม นำส่งด้วยรถส่วนกลาง')
      await page.getByLabel('ผู้ส่งมอบ').fill('นางสาวอรุณี ใจมั่น')
      await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
      await page
        .getByTestId('site-handover-evidence-input')
        .setInputFiles({ name: 'handover-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('handover evidence') })
      await expect(page.getByText('handover-evidence.pdf')).toBeVisible()
    })

    await test.step('WIT0829 · บันทึกเข้าพัก/ย้ายแล้ว → วิธีที่ 2 เป็น ACTIVE (วันเริ่มจริงของตนเอง)', async () => {
      await page.getByLabel('วันเริ่มจริง').fill(isoDaysAgo(3))
      await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

      const t2 = await getTrack(page, 2)
      expect(t2?.status).toBe('active')
      expect(t2?.startedAt?.slice(0, 10)).toBe(isoDaysAgo(3))
      expect(t2?.site?.proposedSite).toBe('บ้านพักที่ ป.ป.ท. กำหนด')
      // วิธีอื่นยังไม่ขยับ — แต่ละวิธีมีสถานะของตัวเอง
      expect((await getTrack(page, 3))?.status).toBe('pending')
    })

    // ── 08A-3 วิธีที่ 3 ──────────────────────────────────────────────────
    await test.step('WIT0830 · รับงานวิธีที่ 3 จากหน้า 08A', async () => {
      await page.goto(METHODS_URL)
      await page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูล/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/3/)
    })

    await test.step('WIT0831 · ระบุข้อมูล/ตัวระบุและช่องทางที่ต้องปกปิด', async () => {
      await page.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }).click()
      await page.getByRole('button', { name: 'เลขประจำตัวประชาชน' }).click()
      await page.getByRole('button', { name: 'ที่อยู่ / ที่พักปัจจุบัน' }).click()
      await page.getByLabel('ช่องทางที่ต้องปกปิด').fill('ระบบทะเบียนราษฎร์ และเอกสารราชการทุกฉบับที่เผยแพร่ภายนอก')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0832 · กำหนด Role / Need-to-Know / ผู้อนุมัติสิทธิ์', async () => {
      await page.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }).click()
      await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click()
      await page.getByLabel('เหตุผลของการให้สิทธิ์').fill('จำกัดเฉพาะผู้ปฏิบัติและผู้บังคับบัญชาที่ต้องกำกับดูแล')
      await page.getByLabel('ผู้อนุมัติสิทธิ์').fill(DIRECTOR)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0833 · ตั้งมาตรการจำกัดการค้นหา/ดาวน์โหลด/พิมพ์/ส่งต่อ', async () => {
      await page.getByText('จำกัดการค้นหา', { exact: true }).click()
      await page.getByText('จำกัดการดาวน์โหลด', { exact: true }).click()
      await page.getByText('จำกัดการพิมพ์', { exact: true }).click()
      await page.getByText('จำกัดการส่งต่อ', { exact: true }).click()
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0834/WIT0836 · ทดสอบสิทธิ์ผ่าน → ระบบบันทึก Policy Version / Audit Baseline / วันเวลามีผล', async () => {
      await page.getByLabel('ผลการทดสอบ').fill('ทดสอบเข้าถึงด้วยบัญชีนอกขอบเขต — ไม่พบข้อมูลที่ปกปิดรั่วไหล')
      await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()
      await expect(page.getByText(/Policy Version 1/)).toBeVisible()

      const privacy = (await getTrack(page, 3))?.privacy
      expect(privacy?.policyVersion).toBe(1)
      expect(privacy?.auditBaseline).toBeTruthy()
      expect(privacy?.effectiveAt).toBeTruthy()
    })

    await test.step('WIT0837 · เปิดใช้มาตรการ → วิธีที่ 3 เป็น ACTIVE (วันเริ่มจริงของตนเอง)', async () => {
      await page.getByLabel('วันเริ่มจริง').fill(isoDaysAgo(2))
      await page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' }).click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

      const t3 = await getTrack(page, 3)
      expect(t3?.status).toBe('active')
      expect(t3?.startedAt?.slice(0, 10)).toBe(isoDaysAgo(2))
      expect(t3?.privacy?.maskedIdentifiers).toEqual(
        expect.arrayContaining(['ชื่อตัว - ชื่อสกุล', 'เลขประจำตัวประชาชน', 'ที่อยู่ / ที่พักปัจจุบัน'])
      )
    })

    await test.step('ตรวจรวม · ทั้งสองวิธี ACTIVE แต่ละวิธีมีวันเริ่มจริงของตนเอง ภายใต้แฟ้ม/Episode เดียว', async () => {
      const c = await readCase(page, CASE_NO)
      const tracks = c?.methodTracks as Track[]
      expect(tracks.map((t) => [t.method, t.status])).toEqual([
        [2, 'active'],
        [3, 'active'],
      ])
      const starts = tracks.map((t) => t.startedAt?.slice(0, 10))
      expect(new Set(starts).size).toBe(2)
      expect(c?.approvedMethods).toEqual([2, 3])
      // ข้อสังเกต: stage ของแฟ้มยังเป็น method_operation/protection ตามที่ระบบกำหนด — assert เพียงว่ายังไม่ถูกส่งต่อหรือยุติ
      expect(['method_operation', 'protection']).toContain(c?.stage)

      await page.goto(METHODS_URL)
      for (const label of [/^วิธีที่ 2 — จัดสถานที่ปลอดภัย/, /^วิธีที่ 3 — ปกปิดข้อมูล/]) {
        await expect(page.getByRole('link', { name: label }).getByText(/ปฏิบัติ|ACTIVE|ดำเนิน/i).first()).toBeVisible()
      }
    })
  })

  test('J09-e · เปิดวิธีที่ 4 เดี่ยว (เลือกร่วมกับวิธีที่ 1–3 ไม่ได้) แล้วประสานหน่วยงานอื่นจนปฏิบัติจริง (08A → 08B)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer')

    await test.step('WIT0809/WIT0810/WIT0811 · พยานยินยอมและลงนาม คบ.11 ครบทุกช่อง', async () => {
      await page.goto(DOSSIER_URL)
      await page.getByRole('button', { name: 'ลงนาม' }).click()
      await signKb11All(page)
      expect((await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
    })

    const option = (n: number) => page.getByRole('button', { name: new RegExp(`^\\(${n}\\) `) })
    const isOn = (n: number) => expect(option(n)).toHaveClass(/border-blue/)
    const isOff = (n: number) => expect(option(n)).not.toHaveClass(/border-blue/)

    await test.step('WIT0813 ◇ วิธีที่ 1–3 เลือกร่วมกันได้ แต่เลือกวิธีที่ 4 → ระบบนำวิธีที่ 1–3 ออกให้', async () => {
      await page.goto(METHODS_URL)
      await expect(page.getByText('วิธีที่ 1–3 เลือกร่วมกันได้ · วิธีที่ 4 เลือกเดี่ยว')).toBeVisible()
      // วิธีที่ 1 ถูกเลือกไว้ตาม คบ.6 — เพิ่มวิธีที่ 2, 3 ได้ร่วมกัน
      await option(2).click()
      await option(3).click()
      for (const n of [1, 2, 3]) await isOn(n)

      await option(4).click()
      await expect(page.getByText('วิธีที่ 4 ต้องเลือกเดี่ยว — นำวิธีที่ 1–3 ออกให้แล้ว')).toBeVisible()
      await isOn(4)
      for (const n of [1, 2, 3]) await isOff(n)
    })

    await test.step('WIT0813 ◇ เลือกวิธีที่ 1–3 ขณะเลือกวิธีที่ 4 อยู่ → ระบบนำวิธีที่ 4 ออกให้ แล้วกลับมาเลือกวิธีที่ 4 เดี่ยว', async () => {
      await option(2).click()
      await expect(page.getByText('วิธีที่ 1–3 เลือกร่วมกับวิธีที่ 4 ไม่ได้ — นำวิธีที่ 4 ออกให้แล้ว')).toBeVisible()
      await isOn(2)
      await isOff(4)

      await option(4).click()
      await isOn(4)
      await isOff(2)
      await page.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }).click()
      await confirmDialog(page, 'ยืนยันเปิดเส้นทางปฏิบัติ', 'วิธีที่ 4')

      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([4])
      expect((c?.methodTracks as Track[]).map((t) => [t.method, t.status])).toEqual([[4, 'pending']])
      await expect(page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ })).toHaveCount(0)
    })

    // ── 08B วิธีที่ 4 ────────────────────────────────────────────────────
    await test.step('WIT0841 · รับงานวิธีที่ 4 จากหน้า 08A', async () => {
      await page.goto(METHODS_URL)
      await page.getByRole('link', { name: /^วิธีที่ 4 — ประสานหน่วยงานอื่น/ }).click()
      await expect(page).toHaveURL(/\/protection-method\/4/)
    })

    await test.step('WIT0842 · เลือกหน่วยงานที่จะประสาน (ตรวจ คบ.11 ลงนามแล้ว)', async () => {
      await expect(page.getByText(/ขั้นตอน 1 จาก/)).toBeVisible()
      await page.getByTestId('coordination-agency').selectOption(AGENCY_A)
      expect(((await getTrack(page, 4))?.coordination as Record<string, unknown>)?.agency).toBe(AGENCY_A)
      expect((await readCase(page, CASE_NO))?.kb11Signed).toBe(true)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0843 · ส่งหนังสือประสานขาออก → วิธีที่ 4 เป็น "เตรียมการ"', async () => {
      await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/9001')
      await page.getByRole('textbox', { name: 'เลขติดตาม' }).fill('EM123456789TH')
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', AGENCY_A)

      const c = await readCase(page, CASE_NO)
      const letters = c?.officialLetters as Array<Record<string, unknown>>
      expect(letters).toHaveLength(1)
      expect(letters[0]).toMatchObject({ direction: 'outgoing', context: 'method4', registryNo: 'ปปท 0004/9001' })
      expect((await getTrack(page, 4))?.status).toBe('preparing')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0844/WIT0846 · หน่วยงานตอบรับ → บันทึกหนังสือตอบกลับขาเข้า', async () => {
      // WIT0844 ◇ แขนง "ตอบรับ" (แขนง "ปฏิเสธ → WIT0845" อยู่ในทางแยก J09-d)
      await page.getByRole('textbox', { name: 'เลขที่หนังสือรับ' }).fill('ตร. 0011/500')
      await page.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน' }).fill('พ.ต.ท. ธนากร ศรีอุดม')
      await page.getByTestId('coordination-accept').click()
      await confirmDialog(page, 'ยืนยันบันทึกตอบรับ', 'เตรียมการส่งมอบ')

      const c = await readCase(page, CASE_NO)
      const letters = c?.officialLetters as Array<Record<string, unknown>>
      expect(letters).toHaveLength(2)
      expect(letters[1]).toMatchObject({ direction: 'incoming', registryNo: 'ตร. 0011/500' })
      const co = (await getTrack(page, 4))?.coordination as Record<string, unknown>
      expect(co.responseStatus).toBe('accepted')
      expect(co.contactPerson).toBe('พ.ต.ท. ธนากร ศรีอุดม')
      await expect(page.getByTestId('wit0845-card')).toBeHidden()
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0847 · เตรียมการส่งมอบ: นัดวัน-สถานที่ ผู้ส่ง–ผู้รับ ขอบเขตข้อมูล และเปิดร่าง คบ.12', async () => {
      await page.getByLabel('วันเวลานัดส่งมอบ').fill('2026-09-20T09:00')
      await page.getByLabel('สถานที่ส่งมอบ').fill('สำนักงาน ป.ป.ท. เขต 1')
      await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
      await page.getByLabel('ผู้รับมอบ').fill('พ.ต.ท. ธนากร ศรีอุดม')
      await page.getByLabel('ขอบเขตข้อมูลที่เปิดเผยได้').fill('ชื่อ-สกุล ที่อยู่ปัจจุบัน และลักษณะภัยคุกคามเท่าที่จำเป็น')
      await expect(page.getByTestId('open-kb12-method4')).toBeVisible()
      const co = (await getTrack(page, 4))?.coordination as Record<string, unknown>
      expect(co.handoverAppointmentAt).toBe('2026-09-20T09:00')
    })

    await test.step('WIT0848 · ส่งมอบจริงและลงนาม คบ.12 (คำสั่งยังอยู่กับ ป.ป.ท.)', async () => {
      await page.getByLabel('วันที่ส่งมอบจริง').fill(isoDaysAgo(1))
      await page.getByTestId('coordination-complete-handover').click()
      await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12', 'คำสั่งยังอยู่กับ ป.ป.ท.')

      const c = await readCase(page, CASE_NO)
      const co = (await getTrack(page, 4))?.coordination as Record<string, unknown>
      expect(co.handoverCompletedAt).toBeTruthy()
      expect(co.operationStartedAt).toBeTruthy()
      expect(c?.transferRequest).toBeFalsy()
      expect(c?.stage).not.toBe('transferred')
    })

    await test.step('WIT0849 · หน่วยงานผู้รับเริ่มปฏิบัติจริง → วิธีที่ 4 เป็น ACTIVE (วันเริ่มจริงของตนเอง)', async () => {
      await page.getByTestId('method-4-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'Episode')
      const t4 = await getTrack(page, 4)
      expect(t4?.status).toBe('active')
      expect(t4?.startedAt).toBeTruthy()
      // WIT0850 🟡 รายงาน คบ.13 ประจำเดือน/WIT0851 ⚙️ อัปเดตสถานะ — ไปต่อที่แท็บ 10 (นอกขอบเขตเส้นทางนี้)
    })

    await test.step('ตรวจรวม · แฟ้มนี้มีวิธีที่ 4 เพียงวิธีเดียว และ ACTIVE แล้ว', async () => {
      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([4])
      expect((c?.methodTracks as Track[]).map((t) => [t.method, t.status])).toEqual([[4, 'active']])
    })
  })

  // ────────────────────────────────────────────────────────────────────────
  // ทางแยก
  // ────────────────────────────────────────────────────────────────────────

  test('J09-a · [ทางแยก] 08A-2 สถานที่ไม่เหมาะสม → วนกลับเสนอสถานที่ใหม่ (WIT0826 → WIT0824) แล้วย้ายเข้าพัก', async ({ page }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer', atRoutesOpened([2]))

    await test.step('WIT0822/WIT0823 · รับงานวิธีที่ 2 จากหน้า 08A และตรวจขอบเขต', async () => {
      await page.goto(METHODS_URL)
      await page.getByRole('link', { name: /^วิธีที่ 2 — จัดสถานที่ปลอดภัย/ }).click()
      await page.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง').fill('ที่พักภายในเขตกรุงเทพฯ')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0824/WIT0825 · เสนอสถานที่แรกและประเมิน', async () => {
      await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านญาติที่ไม่ปลอดภัยพอ')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ทางเข้า-ออกไม่ปลอดภัย มีทางลัดหลายทาง')
    })

    await test.step('WIT0826 ◇ ไม่เหมาะสม → ระบบวนกลับขั้นเสนอสถานที่ (เก็บผลประเมินรอบแรก)', async () => {
      await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()
      await expect(page.getByLabel('สถานที่ที่เสนอ')).toHaveValue('บ้านญาติที่ไม่ปลอดภัยพอ')
      const site = (await getTrack(page, 2))?.site
      expect(site?.suitable).toBe(false)
      expect((await getTrack(page, 2))?.status).toBe('pending')
    })

    await test.step('WIT0824/WIT0825/WIT0826 · เสนอสถานที่ใหม่ ประเมินใหม่ → เหมาะสม', async () => {
      await page.getByLabel('สถานที่ที่เสนอ').fill('บ้านพักที่ ป.ป.ท. กำหนด (แห่งใหม่)')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByLabel('ทางเข้า–ออกและจุดเสี่ยง').fill('ตรวจใหม่แล้วปลอดภัยดี')
      await page.getByRole('button', { name: 'สถานที่เหมาะสม' }).click()

      const site = (await getTrack(page, 2))?.site
      expect(site?.suitable).toBe(true)
      const evaluations = site?.evaluations as Array<{ round: number; suitable: boolean; accessRoutes: string }>
      expect(evaluations).toHaveLength(2)
      expect(evaluations[0].suitable).toBe(false)
      expect(evaluations[0].accessRoutes).toContain('ไม่ปลอดภัย')
      expect(evaluations[1].suitable).toBe(true)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0827-0829 · แผนย้าย ส่งมอบ-รับมอบ พร้อมหลักฐาน แล้ว ACTIVE', async () => {
      await page.getByLabel('แผนย้าย / รับ–ส่ง').fill('นำส่งด้วยรถส่วนกลาง')
      await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
      await page.getByLabel('ผู้รับมอบ').fill('ร.ต.ท. สมชาย ดูแลดี')
      await page
        .getByTestId('site-handover-evidence-input')
        .setInputFiles({ name: 'handover.pdf', mimeType: 'application/pdf', buffer: Buffer.from('x') })
      await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

      const t2 = await getTrack(page, 2)
      expect(t2?.status).toBe('active')
      expect(t2?.site?.proposedSite).toBe('บ้านพักที่ ป.ป.ท. กำหนด (แห่งใหม่)')
    })
  })

  test('J09-b · [ทางแยก] 08A-2 สถานที่ไม่เหมาะสมและ ป.ป.ท. ทำเองไม่ได้ → เปลี่ยนไปใช้วิธีที่ 4 ให้หน่วยงานอื่นทำแทน (WIT0826 → 08B)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer', atRoutesOpened([2]))

    await test.step('WIT0822-0825 · เดินวิธีที่ 2 จนถึงขั้นประเมินสถานที่', async () => {
      await page.goto(method2Url)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByLabel('สถานที่ที่เสนอ').fill('สถานที่ที่ ป.ป.ท. จัดเองไม่ได้')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0826 ◇ ไม่เหมาะสม แล้วกด "เปลี่ยนไปใช้วิธีที่ 4 แทน" → ยกเลิกได้ในจอยืนยัน', async () => {
      await page.getByRole('button', { name: 'ไม่เหมาะสม — เลือกใหม่' }).click()
      await expect(page.getByText('หากต้องให้หน่วยงานภายนอกดำเนินการแทน')).toBeVisible()
      await page.getByRole('button', { name: 'เปลี่ยนไปใช้วิธีที่ 4 แทน' }).click()
      await cancelDialog(page)
      expect((await readCase(page, CASE_NO))?.approvedMethods).toEqual([2])
    })

    await test.step('WIT0826 · ยืนยันเปลี่ยน → แฟ้มเหลือวิธีที่ 4 อย่างเดียว (วิธีที่ 4 เลือกร่วมกับวิธีที่ 1–3 ไม่ได้) และพาไปหน้า 08B', async () => {
      await page.getByRole('button', { name: 'เปลี่ยนไปใช้วิธีที่ 4 แทน' }).click()
      await confirmDialog(page, 'ยืนยันเปลี่ยนเป็นวิธีที่ 4', 'วิธีที่ 2')

      const c = await readCase(page, CASE_NO)
      expect(c?.approvedMethods).toEqual([4])
      expect((c?.methodTracks as Track[]).map((t) => [t.method, t.status])).toEqual([[4, 'pending']])
      await expect(page).toHaveURL(/\/protection-method\/4/)
    })

    await test.step('WIT0841 · หน้า 08B — วิธีที่ 4 รับงานต่อและส่งหนังสือประสานขาออกได้', async () => {
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/7777')
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก')
      expect((await getTrack(page, 4))?.status).toBe('preparing')
      expect(await getTrack(page, 2)).toBeUndefined()
    })
  })

  test('J09-c · [ทางแยก] 08A-3 ทดสอบสิทธิ์ไม่ผ่าน → แก้ Role แล้วทดสอบซ้ำจนผ่าน แล้วเปิดใช้มาตรการ (WIT0834 → WIT0835 → WIT0836/0837)', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await seedMockState(page, 'Case 1.11', 'officer', atRoutesOpened([3]))

    await test.step('WIT0830-0833 · รับงานและตั้งค่าปกปิด/Role/การจำกัด', async () => {
      await page.goto(METHODS_URL)
      await page.getByRole('link', { name: /^วิธีที่ 3 — ปกปิดข้อมูล/ }).click()
      await page.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }).click()
      await page.getByLabel('ช่องทางที่ต้องปกปิด').fill('ทะเบียนราษฎร์')
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click()
      await page.getByLabel('เหตุผลของการให้สิทธิ์').fill('เฉพาะผู้กำกับดูแล')
      await page.getByLabel('ผู้อนุมัติสิทธิ์').fill(DIRECTOR)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByText('จำกัดการค้นหา', { exact: true }).click()
      await page.getByRole('button', { name: 'ถัดไป' }).click()
    })

    await test.step('WIT0834 ◇ ทดสอบสิทธิ์ไม่ผ่าน → ไม่มีปุ่มเปิดใช้มาตรการ', async () => {
      await page.getByLabel('ผลการทดสอบ').fill('ผู้ใช้นอกขอบเขตยังเห็นข้อมูลที่ปกปิดไว้')
      await page.getByRole('button', { name: 'บันทึกผล: ไม่ผ่าน' }).click()
      await expect(page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' })).toBeHidden()
      const tests = (await getTrack(page, 3))?.privacy?.tests as Array<{ passed: boolean }>
      expect(tests).toHaveLength(1)
      expect(tests[0].passed).toBe(false)
      expect((await getTrack(page, 3))?.status).toBe('pending')
    })

    await test.step('WIT0835 · ย้อนกลับไปแก้ Role (เพิ่มสิทธิ์/ปรับ Policy) แล้วทดสอบซ้ำ → ผ่าน', async () => {
      await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
      await page.getByRole('button', { name: 'ย้อนกลับ' }).click()
      await page.getByRole('button', { name: 'ผอ.สำนัก/กอง' }).click() // ถอด ผอ. ออกให้เหลือเฉพาะผู้รับผิดชอบ
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByLabel('ผลการทดสอบ').fill('แก้ไข Role แล้ว ทดสอบซ้ำผ่านทุกกรณี')
      await page.getByRole('button', { name: 'บันทึกผล: ผ่าน' }).click()

      const privacy = (await getTrack(page, 3))?.privacy
      const tests = privacy?.tests as Array<{ passed: boolean }>
      expect(tests.map((t) => t.passed)).toEqual([false, true]) // เก็บผลทดสอบทุกรอบ
      expect(privacy?.policyVersion).toBe(1)
    })

    await test.step('WIT0836/WIT0837 · เปิดใช้มาตรการ → ACTIVE', async () => {
      await page.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' }).click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')
      expect((await getTrack(page, 3))?.status).toBe('active')
    })
  })

  test('J09-d · [ทางแยก] 08B หน่วยงานปฏิเสธ → เสนอหน่วยงานใหม่ผ่าน ผบช.ชั้นต้น → ผอ. → ประสานต่อจนส่งมอบและเริ่มปฏิบัติ (WIT0844 → WIT0845)', async ({
    page,
  }) => {
    test.setTimeout(240_000)
    await seedMockState(page, 'Case 1.11', 'officer', atRoutesOpened([4]))

    await test.step('WIT0841-0843 · รับงานวิธีที่ 4 เลือกหน่วยงาน A และส่งหนังสือประสานขาออก', async () => {
      await page.goto(METHODS_URL)
      await page.getByRole('link', { name: /^วิธีที่ 4 — ประสานหน่วยงานอื่น/ }).click()
      await page.getByTestId('coordination-agency').selectOption(AGENCY_A)
      await page.getByRole('button', { name: 'ถัดไป' }).click()
      await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/1234')
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก')
      expect((await getTrack(page, 4))?.status).toBe('preparing')
    })

    await test.step('WIT0844 ◇ หน่วยงานปฏิเสธ — ต้องระบุเหตุผลและยกเลิกในจอยืนยันได้', async () => {
      await gotoSection4(page, 2)
      await page.getByTestId('coordination-decline').click() // ไม่กรอกเหตุผล → ไม่ขึ้นจอยืนยัน
      await expect(page.locator('.swal2-popup:not(.swal2-toast)')).toHaveCount(0)

      await page.getByRole('textbox', { name: 'เหตุผล (กรณีปฏิเสธ)' }).fill('อัตรากำลังไม่เพียงพอในช่วงเวลาที่ขอ')
      await page.getByTestId('coordination-decline').click()
      await cancelDialog(page)
      expect(((await getTrack(page, 4))?.coordination as Record<string, unknown>).responseStatus).toBe('awaiting')
    })

    await test.step('WIT0846/WIT0845 · บันทึกหนังสือปฏิเสธขาเข้า → วิธีที่ 4 เริ่มไม่ได้ (blocked) และเปิดการ์ด WIT0845', async () => {
      await page.getByRole('textbox', { name: 'เลขที่หนังสือรับ' }).fill('ดศ. 0099/12')
      await page.getByTestId('coordination-decline').click()
      await confirmDialog(page, 'ยืนยันบันทึกการปฏิเสธ', 'เริ่มไม่ได้')

      const t4 = await getTrack(page, 4)
      expect((t4?.coordination as Record<string, unknown>).responseStatus).toBe('declined')
      expect(t4?.status).toBe('blocked')
      await expect(page.getByTestId('wit0845-card')).toBeVisible()
      // หน่วยงานที่ปฏิเสธต้องไม่อยู่ในตัวเลือกเสนอใหม่
      await expect(page.getByTestId('coordination-new-agency').locator(`option[value="${AGENCY_A}"]`)).toHaveCount(0)
    })

    await test.step('WIT0845 · เจ้าหน้าที่เสนอหน่วยงานใหม่ → ผบช.ชั้นต้น', async () => {
      // 🟡 ผังเขียน "หน่วยงานหรือแนวทางใหม่" — ต้นแบบมีเฉพาะแขนง "หน่วยงานใหม่"
      await page.getByTestId('coordination-new-agency').selectOption(AGENCY_B)
      await page.getByTestId('coordination-note').fill('มีชุดปฏิบัติการในพื้นที่และเคยรับดำเนินการคดีลักษณะเดียวกัน')
      await page.getByTestId('coordination-submit').click()
      await confirmDialog(page, 'ยืนยันเสนอหน่วยงานใหม่', 'ผบช.ชั้นต้น')

      const c = await readCase(page, CASE_NO)
      const proposals = c?.coordinationProposals as Array<Record<string, unknown>>
      expect(proposals).toHaveLength(1)
      expect(proposals[0]).toMatchObject({ declinedAgency: AGENCY_A, proposedAgency: AGENCY_B, stage: 'supervisor' })
      expect(c?.owner).toBe(SUPERVISOR)
    })

    await test.step('WIT0845 · ผบช.ชั้นต้นเห็นชอบในคิวงาน → ผอ.สำนัก/กอง', async () => {
      await switchRole(page, 'supervisor')
      await page.goto('/queue/supervisor')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await gotoSection4(page, 2)
      await page.getByTestId('coordination-decision-note').fill('เห็นควรประสานหน่วยงานที่เสนอ')
      await page.getByTestId('coordination-endorse').click()
      await confirmDialog(page, 'ยืนยันเห็นชอบ', 'ผอ.สำนัก/กอง')

      const c = await readCase(page, CASE_NO)
      expect((c?.coordinationProposals as Array<Record<string, unknown>>)[0].stage).toBe('director')
      expect(c?.owner).toBe(DIRECTOR)
    })

    await test.step('WIT0845 · ผอ.สำนัก/กอง อนุมัติ → วิธีที่ 4 กลับมาทำหนังสือขาออกฉบับใหม่', async () => {
      await switchRole(page, 'director')
      await page.goto('/queue/director')
      await expect(page.getByText(CASE_NO).first()).toBeVisible()
      await gotoSection4(page, 2)
      await page.getByTestId('coordination-decision-note').fill('อนุมัติให้ประสานหน่วยงานใหม่')
      await page.getByTestId('coordination-endorse').click()
      await confirmDialog(page, 'ยืนยันอนุมัติหน่วยงานใหม่', AGENCY_B)

      const c = await readCase(page, CASE_NO)
      expect((c?.coordinationProposals as Array<Record<string, unknown>>)[0]).toMatchObject({ stage: 'approved' })
      expect(c?.owner).toBe(OFFICER)
      const t4 = await getTrack(page, 4)
      expect((t4?.coordination as Record<string, unknown>).agency).toBe(AGENCY_B)
      expect((t4?.coordination as Record<string, unknown>).responseStatus).toBe('awaiting')
      expect(t4?.status).toBe('preparing')
      expect(c?.approvedMethods).toEqual([4]) // คำสั่งเดิมยังอยู่ ไม่ได้เปิดคำร้องใหม่
      expect(c?.transferRequest).toBeFalsy()
    })

    await test.step('WIT0843 (ฉบับใหม่) · เจ้าหน้าที่ส่งหนังสือประสานถึงหน่วยงานใหม่', async () => {
      await switchRole(page, 'officer')
      await gotoSection4(page, 1)
      await page.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }).fill('ปปท 0004/1300')
      await page.getByTestId('coordination-send-outgoing').click()
      await confirmDialog(page, 'ยืนยันบันทึกหนังสือขาออก', AGENCY_B)
      const letters = (await readCase(page, CASE_NO))?.officialLetters as Array<Record<string, unknown>>
      expect(letters.filter((l) => l.direction === 'outgoing')).toHaveLength(2)
    })

    await test.step('WIT0844/WIT0846 ◇ หน่วยงานใหม่ตอบรับ → WIT0847 → WIT0848 → WIT0849', async () => {
      await gotoSection4(page, 2)
      await page.getByRole('textbox', { name: 'เลขที่หนังสือรับ' }).fill('บก.ป. 0021/88')
      await page.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน' }).fill('พ.ต.อ. วิชัย รักษ์ธรรม')
      await page.getByTestId('coordination-accept').click()
      await confirmDialog(page, 'ยืนยันบันทึกตอบรับ', 'เตรียมการส่งมอบ')
      await expect(page.getByTestId('wit0845-card')).toBeHidden()

      await gotoSection4(page, 3)
      await page.getByLabel('วันเวลานัดส่งมอบ').fill('2026-09-25T10:00')
      await page.getByLabel('สถานที่ส่งมอบ').fill('กองบังคับการปราบปราม')
      await page.getByLabel('ผู้ส่งมอบ').fill(OFFICER)
      await page.getByLabel('ผู้รับมอบ').fill('พ.ต.อ. วิชัย รักษ์ธรรม')
      await page.getByLabel('ขอบเขตข้อมูลที่เปิดเผยได้').fill('ชื่อ-สกุลและที่พักเท่าที่จำเป็น')
      await page.getByTestId('coordination-complete-handover').click()
      await confirmDialog(page, 'ยืนยันส่งมอบและลงนาม คบ.12', AGENCY_B)

      await page.getByTestId('method-4-start').click()
      await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'Episode')

      const t4 = await getTrack(page, 4)
      expect(t4?.status).toBe('active')
      expect((t4?.coordination as Record<string, unknown>).agency).toBe(AGENCY_B)
      expect((await readCase(page, CASE_NO))?.transferRequest).toBeFalsy()
    })
  })
})
