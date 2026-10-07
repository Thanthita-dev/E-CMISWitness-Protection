import type { Locator, Page } from '@playwright/test'
import type { GuideDirector } from '../guide-director'
import { GUIDE_CASE_NO, GUIDE_DOSSIER_URL } from '../types'
import type { GuideFlow } from '../types'

/**
 * ช่วงร่วม: ทะเบียน → ธุรการส่งต่อ → ผอ. มอบหมาย → เจ้าหน้าที่ทำ คบ.3/คบ.6 → ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ
 * → เปิดแฟ้มที่เลขาธิการฯ (หยุดก่อนลงนามข้อ 13)
 * ปรับจาก scenarios/normal-approve.part1.ts (Case 1.1 – 1.6)
 */

/** ปุ่ม "ส่งต่อ" ของการ์ดส่งงาน แล้วยืนยัน */
async function forwardCase(d: GuideDirector, note: string, confirmNote: string) {
  const btn = d.page.getByTestId('forward-case-button')
  await d.scrollTo(btn)
  await d.click(btn, { note, after: 500 })
  await d.confirm('ยืนยันส่งต่อ', confirmNote)
}

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** ลงนามความเห็น คบ.6 ข้อที่กำหนด แล้วลงลายมือชื่ออิเล็กทรอนิกส์ */
async function signKb6(d: GuideDirector, no: string, label: string, opinion: string, who: string) {
  const { page } = d
  const row = formRow(page, 'คบ.6')
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.6' })
  await page.waitForURL(/\/form\/6/)
  const area = areaField(page, `${no}. ${label}`)
  await area.waitFor()
  await d.scrollTo(area)
  if (!(await area.inputValue())) {
    await d.fill(area, opinion, { note: `บันทึกความเห็นข้อ ${no}` })
  } else {
    await d.highlight(area, `ความเห็นข้อ ${no}`)
  }
  await d.click(page.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม" เพื่อลงลายมือชื่ออิเล็กทรอนิกส์' })
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await d.pause()
  if (!(await nameInput.inputValue())) await d.fill(nameInput, who, { note: 'ชื่อผู้ลงนาม' })
  await d.check(page.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองว่าเป็นลายมือชื่อของตนเอง' })
  await d.click(page.getByTestId('signature-confirm-button'), { note: 'กด "ยืนยัน" เพื่อลงนาม', after: 1000 })
  await d.goto(GUIDE_DOSSIER_URL)
}

export default {
  id: 'common',
  title: 'ช่วงร่วม: รับเรื่องจนเสนอเลขาธิการฯ',
  summary: 'ธุรการเลือกเรื่องจากทะเบียน ส่งต่อ ผอ. มอบหมายเจ้าของสำนวน จัดทำ คบ.3/คบ.6 และลงนามตามลำดับชั้นจนถึงรองเลขาธิการฯ แล้วเสนอเลขาธิการ ป.ป.ท.',
  run: async (d) => {
    await commonToAssessment(d)
    await commonFromAssessment(d)
  },
} satisfies GuideFlow

/**
 * ช่วงร่วมท่อนแรก: ทะเบียน → ธุรการส่งต่อ → ผอ. มอบหมาย → เจ้าหน้าที่เปิดแฟ้ม
 * จบ: เจ้าหน้าที่ (officer) อยู่ที่แฟ้ม เห็นปุ่มประเมินความเร่งด่วน "กรณีปกติ" / "กรณีเร่งด่วน" ยังไม่ได้เลือก
 */
export async function commonToAssessment(d: GuideDirector) {
  const { page } = d

  // ── ธุรการ: เลือกเรื่องจากทะเบียน ──
  d.section('ธุรการ: เลือกเรื่องจากทะเบียน', 'ธุรการเปิดทะเบียนคำร้อง ค้นหาเรื่องของผู้ขอรับการคุ้มครอง "ตรีรุด หล่อจัง" เรื่อง "สูบบุหรี่ในที่ทำงาน"')
  const search = page.locator('#registry-search')
  await search.waitFor()
  await d.fill(search, GUIDE_CASE_NO, { note: `พิมพ์เลขคำร้อง ${GUIDE_CASE_NO} ในช่องค้นหา` })
  const row = page.locator('tbody tr', { hasText: GUIDE_CASE_NO })
  await row.waitFor()
  await d.highlight(row.locator('td').nth(2), 'ตรวจว่าเป็นผู้ขอรับการคุ้มครอง "ตรีรุด หล่อจัง"')
  await d.click(row.getByRole('link', { name: 'เปิดแฟ้ม' }), { note: 'กด "เปิดแฟ้ม" ของเรื่อง "สูบบุหรี่ในที่ทำงาน"' })
  await page.waitForURL(new RegExp(`/dossier/${GUIDE_CASE_NO}`))
  await page.getByTestId('forward-case-button').waitFor()

  // ── ธุรการ ส่งต่อ ผอ. ──
  await d.highlight(page.getByRole('heading', { name: new RegExp(GUIDE_CASE_NO) }).first(), 'หัวแฟ้ม: เลขคำร้อง และสถานะ "ธุรการรับเรื่องเข้าทะเบียน" — ธุรการไม่ต้องเชื่อมโยงคดีหลัก ส่งต่อ ผอ. ได้เลย')
  await forwardCase(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน', 'ยืนยันส่งต่อให้ ผอ.สำนัก/กอง')

  // ── ผอ. มอบหมายเจ้าของสำนวน ──
  await d.switchRole('director', 'ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน', 'ผู้อำนวยการสำนัก/กองรับแฟ้ม เลือกเจ้าของสำนวน แล้วส่งต่อให้เจ้าหน้าที่', GUIDE_DOSSIER_URL)
  const assign = page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' })
  await assign.waitFor()
  await d.scrollTo(assign)
  const select = page.locator('label:has-text("เลือกเจ้าหน้าที่ที่จะเป็นเจ้าของสำนวน") ~ select, main select').first()
  if (await select.count()) await d.highlight(select, 'เลือกเจ้าหน้าที่ที่จะเป็นเจ้าของสำนวน (ยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนจะเป็นผู้เชื่อมโยง)')
  await d.click(assign, { note: 'กด "มอบหมายเจ้าของสำนวน"', after: 800 })
  await page.getByText(/มอบหมายแล้ว:/).first().waitFor()
  await forwardCase(d, 'กด "ส่งต่อ" ให้เจ้าของสำนวน', 'ยืนยันส่งต่อให้เจ้าหน้าที่เจ้าของสำนวน')

  // ── เจ้าหน้าที่: ประเมิน + คบ.3 + คบ.6 ──
  await d.switchRole('officer', 'เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6', 'เจ้าของสำนวนประเมินความเร่งด่วน จัดทำ คบ.3 และ คบ.6 แล้วส่งต่อผู้บังคับบัญชาชั้นต้น', GUIDE_DOSSIER_URL)
  await page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }).waitFor()

  // ── เจ้าของสำนวนเชื่อมโยงคดีหลัก (ธุรการ/ผอ. ทำไม่ได้ — ต้องเชื่อมโยงก่อนส่งต่อ ผบช.) ──
  const linkBtn = page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })
  await linkBtn.waitFor()
  await d.scrollTo(linkBtn)
  await d.click(linkBtn, { note: 'เจ้าของสำนวนเชื่อมโยงคดีหลัก: กด "ยืนยันเชื่อมโยงคดี"', after: 800 })
  await d.result(page.getByText('เชื่อมโยงแล้ว', { exact: true }).first(), 'เชื่อมโยงคดีหลักแล้ว — ส่งต่อผู้บังคับบัญชาชั้นต้นได้')
}

export interface CommonOptions {
  /** วิธีคุ้มครองที่ติ๊กในข้อ 8.2 ของ คบ.6 (ค่าเริ่มต้น [1]) — ระบบเปิดเส้นทางปฏิบัติตามนี้หลังลงนาม คบ.11 */
  methods?: number[]
  /** ถ่ายภาพขั้นเลือกวิธีในข้อ 8.2 แม้ช่วงร่วมจะไม่ได้ถ่าย (ใช้กับทางแยกที่ต่างกันตรงนี้) */
  recordMethodPick?: boolean
}

/**
 * ช่วงร่วมท่อนหลัง: เจ้าหน้าที่เลือก "กรณีปกติ" → คบ.3 → คบ.6 → ผบช. ข้อ 10 → ผอ. ข้อ 11 → รองเลขาธิการฯ ข้อ 12
 * จบ: เลขาธิการฯ อยู่ที่แฟ้ม เห็นการ์ดคำสั่งชี้ขาด ยังไม่ลงนามข้อ 13
 */
export async function commonFromAssessment(d: GuideDirector, opts: CommonOptions = {}) {
  const { page } = d
  const normal = page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' })
  await normal.waitFor()
  await d.scrollTo(normal)
  await d.click(normal, { note: 'เลือก "กรณีปกติ" — ต้องทำ คบ.3 แล้วจึงทำ คบ.6', after: 1000 })

  let r = formRow(page, 'คบ.3')
  await r.waitFor()
  await d.scrollTo(r)
  await d.click(r.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.3' })
  await page.waitForURL(/\/form\/3/)
  const facts = areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ')
  await facts.waitFor()
  await d.scrollTo(facts)
  await d.fill(facts, 'พยานถูกข่มขู่ทางโทรศัพท์และมีผู้ติดตามที่พักหลังให้ถ้อยคำ เกรงว่าจะเป็นอันตรายต่อตนเองและครอบครัว', {
    note: 'กรอกพฤติการณ์แห่งความไม่ปลอดภัย',
  })
  await d.click(page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }), { note: 'กด "บันทึกแบบ คบ.3"', after: 1200 })

  await d.goto(GUIDE_DOSSIER_URL)
  r = formRow(page, 'คบ.6')
  await r.waitFor()
  await d.scrollTo(r)
  await d.click(r.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.6' })
  await page.waitForURL(/\/form\/6/)
  const a11 = areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')
  await a11.waitFor()
  await d.scrollTo(a11)
  await d.highlight(a11, 'ข้อ 11-13 ถูกล็อก — เป็นความเห็นของ ผอ./รองเลขาธิการฯ/เลขาธิการฯ เจ้าหน้าที่กรอกไม่ได้')
  const f11 = page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]')
  if (await f11.count()) {
    await d.scrollTo(f11)
    if (!(await f11.inputValue())) await d.fill(f11, 'ตรีรุด หล่อจัง', { note: 'กรอกช่องบังคับ 1.1 ผู้ยื่นคำร้อง' })
  }
  const f22 = page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]')
  if (await f22.count() && !(await f22.inputValue())) await d.fill(f22, 'ตรีรุด หล่อจัง', { note: 'กรอกช่องบังคับ 2.2 ชื่อพยาน' })
  // ข้อ 8.2 วิธีคุ้มครองที่เสนอ — ระบบใช้วิธีที่ติ๊กนี้เปิดเส้นทางปฏิบัติ (และ คบ.8 ถ้ามีวิธีที่ 1) หลังพยานลงนาม คบ.11
  const methods = opts.methods ?? [1]
  const wasRecording = d.recording
  if (opts.recordMethodPick) {
    d.recording = true
    d.section('เจ้าหน้าที่เลือกวิธีคุ้มครองใน คบ.6 ข้อ 8.2', `เลือกวิธีที่ ${methods.join(' / ')} — ระบบเปิดเส้นทางปฏิบัติตามวิธีที่เลือกหลังพยานลงนาม คบ.11`)
  }
  for (const n of [1, 2, 3, 4]) {
    const opt = page.getByTestId(`method-option-${n}`)
    await opt.waitFor()
    const on = (await opt.getAttribute('aria-pressed')) === 'true'
    if (on !== methods.includes(n)) {
      await d.click(opt, { note: `ข้อ 8.2 ${on ? 'เอาออก' : 'เลือก'}วิธีที่ ${n}` })
    }
  }
  if (opts.recordMethodPick) {
    await d.result(page.getByTestId('method-option-1').locator('xpath=..'), `เลือกวิธีที่ ${methods.join(' / ')} แล้ว`)
    d.recording = wasRecording
  }
  await d.click(page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }), { note: 'กด "บันทึกแบบ คบ.6"', after: 1200 })

  await d.goto(GUIDE_DOSSIER_URL)
  await forwardCase(d, 'กด "ส่งต่อ" ให้ผู้บังคับบัญชาชั้นต้น', 'ยืนยันส่งต่อให้ผู้บังคับบัญชาชั้นต้น')

  // ── ผบช.ชั้นต้น ข้อ 10 ──
  await d.switchRole('supervisor', 'ผบช.ชั้นต้น ลงนามข้อ 10', 'ผู้บังคับบัญชาชั้นต้นตรวจ คบ.3/คบ.6 ลงนามความเห็นข้อ 10 แล้วส่งต่อ ผอ.สำนัก/กอง', GUIDE_DOSSIER_URL)
  await page.getByTestId('dossier-forms').waitFor()
  await signKb6(d, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'เห็นชอบตามที่เจ้าหน้าที่เสนอ เห็นควรเสนอ ผอ.สำนัก/กอง พิจารณาต่อ', 'นายกิตติศักดิ์ ธรรมรักษ์')
  await forwardCase(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง', 'ยืนยันส่งต่อให้ ผอ.สำนัก/กอง')

  // ── ผอ. ข้อ 11 ──
  await d.switchRole('director', 'ผอ.สำนัก/กอง ลงนามข้อ 11', 'ผู้อำนวยการสำนัก/กองลงนามความเห็นข้อ 11 แล้วส่งต่อรองเลขาธิการ ป.ป.ท.', GUIDE_DOSSIER_URL)
  await page.getByTestId('dossier-forms').waitFor()
  await signKb6(d, '11', 'ความเห็นผู้อำนวยการสำนัก', 'เห็นชอบตามความเห็นของผู้บังคับบัญชาชั้นต้น เห็นควรเสนอรองเลขาธิการ ป.ป.ท.', 'นายวีระยุทธ พิทักษ์ธรรม')
  await forwardCase(d, 'กด "ส่งต่อ" ให้รองเลขาธิการ ป.ป.ท.', 'ยืนยันส่งต่อให้รองเลขาธิการ ป.ป.ท.')

  // ── รองเลขาธิการฯ ข้อ 12 ──
  await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ ลงนามข้อ 12', 'รองเลขาธิการ ป.ป.ท. ลงนามความเห็นข้อ 12 แล้วเสนอเลขาธิการ ป.ป.ท.', GUIDE_DOSSIER_URL)
  await page.getByTestId('dossier-forms').waitFor()
  await signKb6(d, '12', 'ความเห็นรองเลขาธิการฯ', 'เห็นชอบตามที่ ผอ.สำนัก/กอง เสนอ เห็นควรเสนอเลขาธิการ ป.ป.ท. พิจารณาอนุมัติ', 'นายพิพัฒน์ ศรีสุวรรณ')
  await forwardCase(d, 'กด "ส่งต่อ" ให้เลขาธิการ ป.ป.ท.', 'ยืนยันส่งต่อให้เลขาธิการ ป.ป.ท.')

  // ── เลขาธิการฯ: เปิดการ์ดคำสั่งชี้ขาด (หยุดก่อนตัดสิน) ──
  await d.switchRole('secretary', 'เลขาธิการฯ พิจารณาชี้ขาด', 'เลขาธิการ ป.ป.ท. ตรวจแฟ้มทั้งชุด แล้วลงนามข้อ 13 และสั่งการชี้ขาด', GUIDE_DOSSIER_URL)
  const approve = page.getByTestId('approve-case-button')
  await approve.waitFor()
  await d.scrollTo(approve)
  await d.result(page.getByText('คำสั่งชี้ขาดของเลขาธิการ ป.ป.ท.').first(), 'การ์ดคำสั่งชี้ขาด: อนุมัติ / ไม่อนุมัติ / ส่งกลับ / ข้อ 14')
}
