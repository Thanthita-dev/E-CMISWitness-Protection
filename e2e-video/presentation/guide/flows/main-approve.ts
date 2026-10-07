import type { Locator, Page } from '@playwright/test'
import { isoDaysFromToday } from '../../../director'
import type { GuideDirector } from '../guide-director'
import { GUIDE_CASE_NO } from '../types'

/**
 * คู่มือ ช่วงอนุมัติ → เริ่มคุ้มครองจริง (Case 1.7 – 1.12)
 * เริ่ม: เลขาธิการฯ อยู่ที่ /dossier/<caseNo> เห็นการ์ดคำสั่งชี้ขาด ยังไม่ลงนามข้อ 13 ใน คบ.6
 * จบ: เจ้าหน้าที่อยู่ที่ /protection-method/1 สถานะ MAIN_ACTIVE (กำลังคุ้มครอง)
 */

const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

const dispatchCard = (p: Page) =>
  p.getByText('การนำส่งหนังสือและวันที่พยานได้รับ').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

/** เส้นหลักช่วงอนุมัติ: ช่วงอนุมัติถึงลงนาม คบ.11 + เปิดวิธีที่ 1 จนเริ่มคุ้มครองจริง */
export async function approveToOperation(d: GuideDirector, caseNo = GUIDE_CASE_NO) {
  await approveToAgreement(d, caseNo)
  await method1ToOperation(d, caseNo)
}

/**
 * 1.7 – 1.11: เลขาธิการฯ ลงนามข้อ 13 และอนุมัติ → คบ.9 → นำส่ง → ลงนามข้อตกลง คบ.11
 * จบ: เจ้าหน้าที่อยู่ที่แฟ้ม — ระบบเปิดเส้นทางปฏิบัติตามวิธีที่ติ๊กไว้ในข้อ 8.2 ของ คบ.6 แล้ว
 */
export async function approveToAgreement(d: GuideDirector, caseNo = GUIDE_CASE_NO) {
  const p = d.page
  const DOSSIER = `/dossier/${caseNo}`

  // ───────── 1.7 เลขาธิการฯ ลงนามข้อ 13 และอนุมัติ ─────────
  d.section('เลขาธิการฯ ลงนามข้อ 13 และอนุมัติ', 'เลขาธิการ ป.ป.ท. ลงนามความเห็นข้อ 13 ใน คบ.6 แล้วสั่งชี้ขาด "อนุมัติ"')
  const approve = p.getByTestId('approve-case-button')
  await d.scrollTo(approve)
  await d.highlight(approve, 'ปุ่มอนุมัติยังกดไม่ได้ — ต้องลงนามข้อ 13 ใน คบ.6 ก่อน', 1500)
  await d.goto(DOSSIER)
  let row = formRow(p, 'คบ.6')
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.6' })
  await p.waitForURL(/\/form\/6/)
  await d.pause(800)
  const a13 = areaField(p, '13. ความเห็นเลขาธิการ')
  const a13b = (await a13.count()) ? a13 : p.locator('label:has-text("13.")').locator('xpath=following-sibling::textarea[1]')
  await d.scrollTo(a13b)
  if (!(await a13b.inputValue())) await d.fill(a13b, 'อนุมัติให้ความคุ้มครองพยานตามที่เสนอ', { note: 'บันทึกความเห็นข้อ 13' })
  else await d.highlight(a13b, 'ความเห็นข้อ 13 ของเลขาธิการฯ')
  await d.click(p.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม" เพื่อลงลายมือชื่ออิเล็กทรอนิกส์' })
  await d.sign('เลขาธิการ ป.ป.ท.')
  await d.goto(DOSSIER)
  await d.scrollTo(formRow(p, 'คบ.6'))
  await d.result(p.getByText(/ลงนามแล้ว/).first(), 'ข้อ 13 ลงนามแล้ว — ปุ่มอนุมัติพร้อมใช้งาน')
  await d.scrollTo(approve)
  await d.click(approve, { note: 'กด "อนุมัติและลงนามคำสั่ง"', after: 1000 })
  const dialog = p.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await d.highlight(dialog.getByTestId('decision-ref-case-no-input'), 'ระบบใส่เลขแฟ้มให้ — ต้องตรงกับคำร้อง', 1200)
  await d.fill(dialog.getByRole('textbox').nth(1), 'ปปท. 88/2569', { note: 'กรอกเลขที่คำสั่ง' })
  await d.fill(
    dialog.getByTestId('decision-reason-input'),
    'ตรวจทานข้อเท็จจริง พฤติการณ์ภัยคุกคาม และความเห็นตามลำดับชั้นครบถ้วนแล้ว มีเหตุผลสมควรได้รับการคุ้มครองพยาน',
    { note: 'กรอกเหตุผลประกอบคำสั่ง' }
  )
  await dialog.getByTestId('decision-destination-select').selectOption('original_owner')
  await d.highlight(dialog.getByTestId('decision-recipient'), 'เลือกเจ้าของสำนวนเดิมและตรวจชื่อผู้รับ')
  await d.click(p.getByTestId('decision-confirm-button'), { note: 'ตรวจสอบก่อนส่งงาน', after: 800 })
  await d.click(p.getByTestId('decision-confirm-button'), { note: 'ยืนยันอนุมัติและส่งงานให้เจ้าของสำนวนเดิม', after: 1500 })
  await dialog.waitFor({ state: 'detached' })
  await d.result(p.getByText(/อนุมัติแล้ว/).first(), 'สถานะ: อนุมัติแล้ว · รอจัดทำ คบ.9 / คบ.11')

  // ───────── 1.8 เจ้าหน้าที่จัดทำ คบ.9 แล้วเสนอ ─────────
  await d.switchRole('officer', 'เจ้าหน้าที่จัดทำ คบ.9 และเสนอลงนาม', 'เจ้าของสำนวนตรวจผลอนุมัติ จัดทำหนังสือแจ้งตอบรับ คบ.9 แล้วเสนอเลขาธิการฯ ลงนาม', DOSSIER)
  const notice = p.getByText('ขั้นที่ 5 · จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล').first()
  await d.scrollTo(notice)
  await d.highlight(notice, 'ขั้นที่ 5: จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล', 1200)
  await d.click(p.getByRole('link', { name: /คบ\.9/ }).first(), { note: 'กดเปิดแบบ คบ.9 หนังสือแจ้งตอบรับ' })
  await p.waitForURL(/\/form\/9/)
  await d.pause(1000)
  const save9 = p.getByRole('button', { name: /บันทึกแบบ คบ\.9/ })
  if (await save9.count()) await d.click(save9, { note: 'ตรวจข้อมูลแล้วกด "บันทึกแบบ คบ.9"', after: 1500 })
  await d.goto(DOSSIER)
  const submit9 = p.getByRole('button', { name: 'เสนอเลขาธิการฯ ลงนาม คบ.9' })
  await d.scrollTo(submit9)
  await d.click(submit9, { note: 'กด "เสนอเลขาธิการฯ ลงนาม คบ.9"', after: 1500 })
  await d.result(p.getByText('รอเลขาธิการฯ ลงนามในแบบฟอร์ม').first(), 'สถานะ: คบ.9 รอเลขาธิการฯ ลงนาม')

  // ───────── 1.9 เลขาธิการฯ ลงนาม คบ.9 ─────────
  await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.9', 'เลขาธิการ ป.ป.ท. ตรวจหนังสือแจ้งตอบรับ คบ.9 แล้วลงนาม', DOSSIER)
  row = formRow(p, 'คบ.9')
  await d.scrollTo(row)
  await d.click(row.getByRole('button', { name: 'ลงนาม' }), { note: 'กด "ลงนาม" ที่แถว คบ.9' })
  await d.click(p.getByRole('button', { name: 'ลงนาม คบ.9' }), { note: 'กด "ลงนาม คบ.9"' })
  await d.sign('เลขาธิการ ป.ป.ท.')
  await d.goto(DOSSIER)
  await d.result(p.getByText('ลงนาม คบ.9 แล้ว · พร้อมนำส่ง').first(), 'สถานะ: คบ.9 ลงนามแล้ว พร้อมนำส่งพยาน')

  // ───────── 1.10 เจ้าหน้าที่บันทึกการนำส่ง คบ.9 ─────────
  await d.switchRole('officer', 'เจ้าหน้าที่บันทึกการนำส่ง คบ.9', 'นำส่งหนังสือให้พยานแล้วบันทึกวันที่พยานได้รับจริง', DOSSIER)
  const card = dispatchCard(p)
  await d.scrollTo(card)
  await d.click(card.getByRole('button', { name: 'บันทึกการนำส่ง' }), { note: 'กด "บันทึกการนำส่ง"' })
  await d.fill(card.locator('input[type="date"]'), isoDaysFromToday(-1), { note: 'วันที่พยานได้รับหนังสือจริง' })
  await d.fill(card.locator('label', { hasText: 'ผู้รับหนังสือ' }).locator('xpath=following-sibling::*[1]'), 'พยาน (ผู้รับหนังสือด้วยตนเอง)', { note: 'ชื่อผู้รับหนังสือ' })
  await d.attach(card.locator('label', { hasText: 'เลือกไฟล์อัปโหลด' }).locator('input[type="file"]'), 'ใบตอบรับ-คบ9.pdf', 'แนบใบตอบรับ')
  await d.click(card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }), { note: 'กด "ยืนยันการรับหนังสือ"' })
  await d.result(p.getByTestId('dossier-forms'), 'คบ.9 ถึงมือพยานครบ — ต่อไปลงนาม คบ.11')

  // ───────── 1.11 คบ.11 ข้อตกลงคุ้มครอง ─────────
  d.section('ลงนามข้อตกลงคุ้มครอง (คบ.11)', 'พยานและผู้เกี่ยวข้องลงลายมือชื่อในข้อตกลงให้ครบทุกช่อง')
  await d.click(p.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }), { note: 'กด "ลงนาม" ที่แถว คบ.11' })
  const names = ['พยาน', 'เจ้าหน้าที่ผู้ปฏิบัติ', 'พยานผู้รับรอง', 'ผู้แทนสำนักงาน']
  const count = await p.getByRole('button', { name: 'ลงลายมือชื่อ' }).count()
  for (let i = 0; i < count; i++) {
    await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: `กด "ลงลายมือชื่อ" ช่องที่ ${i + 1} จาก ${count}` })
    await d.sign(names[i] ?? 'ผู้ลงนามข้อตกลง')
  }
  await d.click(p.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }), { note: 'กด "บันทึกข้อตกลง คบ.11"' })
  await d.result(p.getByTestId('dossier-forms'), 'คบ.11 ลงนามครบและถูกล็อก เหลือ "ดูเอกสาร"')

}

/** 1.12 วิธีที่ 1: เสนอ/ลงนาม คบ.8 → จัดแผน ชี้แจง → เริ่มปฏิบัติจริง (MAIN_ACTIVE) */
export async function method1ToOperation(d: GuideDirector, caseNo = GUIDE_CASE_NO) {
  const p = d.page
  const DOSSIER = `/dossier/${caseNo}`

  // ───────── 1.12 คบ.8 + แผน + ชี้แจง + เริ่มคุ้มครองจริง ─────────
  d.section('เสนอ คบ.8 คำสั่งมอบหมายเจ้าพนักงาน', 'ระบบเปิดเส้นทางปฏิบัติตามวิธีที่อนุมัติ เจ้าหน้าที่เสนอ คบ.8 ให้เลขาธิการฯ ลงนาม')
  await d.result(p.getByText(/เปิดเส้นทางปฏิบัติ \d+ วิธีตามคำสั่ง/).first(), 'ระบบเปิดเส้นทางปฏิบัติตามวิธีที่อนุมัติให้แล้ว')
  await d.click(p.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }), { note: 'กด "ส่งเสนอเลขาธิการฯ ลงนาม" คบ.8' })

  await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.8', 'ลงนามคำสั่งมอบหมายเจ้าพนักงานก่อนชุดคุ้มครองเริ่มปฏิบัติ', DOSSIER)
  await d.click(p.getByRole('button', { name: 'ลงนาม' }), { note: 'กด "ลงนาม" ที่แถว คบ.8' })
  await d.click(p.getByRole('button', { name: 'ลงนาม คบ.8' }), { note: 'กด "ลงนาม คบ.8"' })
  await d.sign('เลขาธิการ ป.ป.ท.')
  await d.result(p.getByTestId('dossier-forms').getByText('ลงนามแล้ว').first(), 'คบ.8 ลงนามแล้ว ฉบับถูกล็อก')

  await d.switchRole('officer', 'เจ้าหน้าที่จัดแผนและเริ่มคุ้มครองจริง', 'จัดแผนปฏิบัติ ชี้แจงภารกิจ แล้วกดเริ่มปฏิบัติจริงตามวิธีที่ 1', `/protection-method/1?caseNo=${caseNo}`)
  await d.fill(p.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร'), 'หัวหน้าชุด 1 นาย และสมาชิก 4 นาย แบ่งเวร 3 ผลัด', { note: 'กรอกสมาชิกชุดและการจัดเวร' })
  await d.fill(p.getByLabel('ยานพาหนะ'), 'รถกระบะตู้ทึบ 1 คัน', { note: 'กรอกยานพาหนะ' })
  await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'กด "ถัดไป" ไปขั้นชี้แจงภารกิจ' })
  await d.fill(p.getByLabel('ผู้ชี้แจง'), 'หัวหน้าชุดปฏิบัติ', { note: 'กรอกชื่อผู้ชี้แจงภารกิจ' })
  await d.click(p.getByTestId('method-1-start'), { note: 'กด "เริ่มปฏิบัติจริง"' })
  await d.confirm('ยืนยันเริ่มปฏิบัติจริง')
  await d.result(p.getByText(/สถานะปัจจุบัน: MAIN_ACTIVE/), 'สถานะเปลี่ยนเป็น MAIN_ACTIVE — เริ่มนับวันคุ้มครอง')
}
