import type { Locator, Page } from '@playwright/test'
import { GUIDE_DOSSIER_URL, type GuideFlow } from '../types'
import type { GuideDirector } from '../guide-director'
import { commonToAssessment } from './common'

const WITNESS = 'ตรีรุด หล่อจัง'
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/**
 * ขั้นต้นร่วมของทางแยกเร่งด่วนทั้งสองแท็บ: เจ้าหน้าที่เลือก "กรณีจำเป็นเร่งด่วน" → คบ.3 → คบ.4 → ส่งตรง ผอ.
 * → ผอ. ตรวจรายการและยืนยัน "ข้อมูลครบ" จนเห็นปุ่มอนุมัติ/ไม่อนุมัติ (ยังไม่ตัดสิน)
 */
export async function urgentToDecision(d: GuideDirector) {
  const { page } = d

  // ── เจ้าหน้าที่: เลือกกรณีเร่งด่วน ──
  d.section('เจ้าหน้าที่เลือกกรณีจำเป็นเร่งด่วน', 'แทนที่จะเลือก "กรณีปกติ" เจ้าหน้าที่ประเมินว่าพยานต้องได้รับการคุ้มครองทันที ระบบจึงเปิดเส้นทาง คบ.3 → คบ.4 → คบ.5 โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น')
  const urgent = page.getByRole('button', { name: /กรณีจำเป็นเร่งด่วน/ })
  await urgent.waitFor()
  await d.scrollTo(urgent)
  await d.fill(page.getByPlaceholder('เหตุผลประกอบการประเมิน (ไม่บังคับ)...'), 'พยานถูกข่มขู่และติดตามที่พัก เสี่ยงอันตรายเฉพาะหน้า ต้องคุ้มครองทันที', {
    note: 'บันทึกเหตุผลที่ประเมินว่าเร่งด่วน',
  })
  await d.click(urgent, { note: 'เลือก "กรณีจำเป็นเร่งด่วน"', after: 1000 })
  await d.result(page.getByTestId('fast-track-card'), 'ระบบแสดงการ์ด "เส้นทางเร่งด่วน — คบ.4 / คบ.5 และการคุ้มครองชั่วคราว"')

  // ── คบ.3 ──
  d.section('เจ้าหน้าที่จัดทำ คบ.3 และ คบ.4', 'บันทึกข้อเท็จจริงใน คบ.3 แล้วเลือกวิธีคุ้มครองตามข้อ 15 ใน คบ.4')
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

  // ── คบ.4: เลือกวิธีตามข้อ 15 ──
  await d.goto(GUIDE_DOSSIER_URL)
  r = formRow(page, 'คบ.4')
  await r.waitFor()
  await d.scrollTo(r)
  await d.click(r.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.4' })
  await page.waitForURL(/\/form\/4/)
  const opt1 = page.getByTestId('kb4-method-option-1')
  await opt1.waitFor()
  await d.scrollTo(opt1)
  await d.click(opt1, { note: 'ข้อ 4.2 ติ๊กวิธีที่ 1 จัดเจ้าพนักงานเป็นชุดคุ้มครอง' })
  await d.click(page.getByTestId('kb4-method-option-3'), { note: 'ติ๊กวิธีที่ 3 ปกปิดและรักษาความลับ (เลือกได้มากกว่า 1 วิธี)' })
  await d.click(page.getByRole('button', { name: 'บันทึกแบบ คบ.4' }), { note: 'กด "บันทึกแบบ คบ.4"', after: 1200 })

  // ── ส่งตรง ผอ. ──
  d.section('เจ้าหน้าที่ส่งตรง ผอ.', 'กลับมาที่การ์ดเส้นทางเร่งด่วน กำหนดระยะเวลาคุ้มครองชั่วคราวแล้วส่งตรงถึง ผอ.สำนัก/กอง โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น')
  await d.goto(GUIDE_DOSSIER_URL)
  await page.getByTestId('fast-track-card').waitFor()
  const days = page.getByTestId('fast-track-duration-days')
  await d.scrollTo(days)
  await d.fill(days, '30', { note: 'ระยะเวลาคุ้มครองชั่วคราวที่เสนอ (วัน)' })
  await d.fill(page.getByTestId('fast-track-submit-note'), 'จัดทำ คบ.4 และร่าง คบ.5 พร้อมหลักฐานภัยคุกคามครบถ้วนแล้ว ขอให้พิจารณาคุ้มครองชั่วคราวโดยด่วน', {
    note: 'ความเห็นประกอบการส่ง ผอ.',
  })
  await d.click(page.getByTestId('fast-track-submit-button'), { note: 'กด "ส่งตรง ผอ. พิจารณาคุ้มครองชั่วคราว"' })
  await d.confirm('ยืนยันส่งตรง ผอ.', 'ยืนยันส่งตรงถึง ผอ.สำนัก/กอง')
  await d.result(page.getByTestId('fast-track-card'), 'เสนอ ผอ. แล้ว — รอผลการพิจารณาคุ้มครองชั่วคราว')

  // ── ผอ.: ตรวจและยืนยันข้อมูลครบ ──
  await d.switchRole('director', 'ผอ.สำนัก/กอง ตรวจเรื่องเร่งด่วน', 'ผู้อำนวยการตรวจ คบ.4 ร่าง คบ.5 และหลักฐาน แล้วยืนยันว่าข้อมูลครบก่อนตัดสิน', GUIDE_DOSSIER_URL)
  const review = page.getByTestId('fast-track-review-list')
  await review.waitFor()
  await d.scrollTo(review)
  await d.highlight(review, 'รายการที่ ผอ. ต้องตรวจก่อนพิจารณา')
  await d.click(page.getByTestId('fast-track-ready-button'), { note: 'กด "ครบ — พร้อมพิจารณา"' })
  await d.confirm('ยืนยันข้อมูลครบ', 'ยืนยันว่าข้อมูลครบและพร้อมพิจารณา')
  await d.result(page.getByTestId('fast-track-decision-panel'), 'ผอ. เลือกได้: "อนุมัติและลงนาม คบ.5" หรือ "ไม่อนุมัติคุ้มครองชั่วคราว"')
}

export default {
  id: 'fast-track',
  title: 'ทางแยก: เส้นทางเร่งด่วน (คบ.4 / คบ.5 คุ้มครองชั่วคราว)',
  summary:
    'เจ้าหน้าที่ประเมินว่าเป็นกรณีจำเป็นเร่งด่วน จัดทำ คบ.3 และ คบ.4 แล้วส่งตรง ผอ. ผอ. อนุมัติและลงนามคำสั่ง คบ.5 พยานลงนามยินยอม ระบบจึงเปิดการคุ้มครองชั่วคราวทันที แล้วคำร้องหลักเดินต่อที่ คบ.6',
  branchSection: 'เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6',
  prefix: commonToAssessment,
  run: async (d) => {
    const { page } = d
    await urgentToDecision(d)

    // ── ผอ.: อนุมัติและลงนาม คบ.5 ──
    d.section('ผอ. อนุมัติและลงนาม คบ.5', 'ผู้อำนวยการอนุมัติคุ้มครองชั่วคราว ระบุเลขที่คำสั่ง ความเห็น และลงลายมือชื่อ ฉบับที่ลงนามจะถูกล็อก')
    await d.click(page.getByTestId('fast-track-approve-button'), { note: 'กด "อนุมัติและลงนาม คบ.5"' })
    await d.fill(page.getByTestId('kb5-order-no'), '047/2569', { note: 'กรอกเลขที่คำสั่ง คบ.5' })
    await d.fill(page.getByTestId('kb5-director-opinion'), 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ ภัยคุกคามเฉพาะหน้ามีน้ำหนัก', {
      note: 'บันทึกความเห็นข้อ 13 ของ คบ.4',
    })
    await d.click(page.getByTestId('kb5-sign-button'), { note: 'กด "ลงลายมือชื่อคำสั่ง คบ.5"' })
    await d.sign(DIRECTOR)
    await d.click(page.getByTestId('fast-track-approve-confirm'), { note: 'กด "ยืนยันอนุมัติและออกคำสั่ง คบ.5"' })
    await d.confirm('ยืนยันอนุมัติและออกคำสั่ง', 'ฉบับลงนามจะถูกล็อก แก้ทับไม่ได้')
    await d.result(page.getByTestId('fast-track-card'), 'อนุมัติแล้ว — แฟ้มกลับไปที่เจ้าหน้าที่เพื่อให้พยานลงนามยินยอม')

    // ── เจ้าหน้าที่: พยานลงนามยินยอม ──
    await d.switchRole('officer', 'เจ้าหน้าที่ให้พยานลงนามยินยอม', 'เจ้าหน้าที่แจ้งคำสั่ง คบ.5 ให้พยานทราบและให้พยานลงนามยินยอมรับการคุ้มครองชั่วคราว (ใช้แทน คบ.11 ของเส้นทางปกติ)', GUIDE_DOSSIER_URL)
    const ack = page.getByTestId('kb5-witness-ack-button')
    await ack.waitFor()
    await d.scrollTo(ack)
    await d.click(ack, { note: 'กด "พยานลงนามยินยอมรับการคุ้มครองชั่วคราว"' })
    await d.sign(WITNESS)
    await d.result(page.getByText('คำสั่ง คบ.5 พร้อมดำเนินการ'), 'คำสั่ง คบ.5 พร้อมดำเนินการ — ระบบส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติแล้ว')

    // ── กลับเข้าเส้นทางหลัก ──
    d.section('กลับเข้าเส้นทางหลัก', 'คุ้มครองชั่วคราวเริ่มแล้ว แต่คำร้องหลักยังเดินต่อ เจ้าหน้าที่จัดทำ คบ.6 แล้วเสนอผู้บังคับบัญชาชั้นต้น ต่อจากขั้น "เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6" ของเส้นทางหลัก')
    const notice = page.getByTestId('fast-track-main-petition-notice')
    await notice.waitFor()
    await d.scrollTo(notice)
    await d.result(notice, 'คำร้องหลักยังเดินต่อ — ให้จัดทำ/เสนอ คบ.6 ในขั้นกลั่นกรอง แล้วรอผลพิจารณาตามปกติ')
  },
} satisfies GuideFlow
