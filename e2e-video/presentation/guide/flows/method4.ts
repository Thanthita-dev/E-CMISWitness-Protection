import type { GuideFlow } from '../types'
import { GUIDE_CASE_NO } from '../types'
import type { GuideDirector } from '../guide-director'
import { isoDaysFromToday } from '../../../director'
import { commonToAssessment, commonFromAssessment } from './common'
import { approveToAgreement } from './main-approve'

/**
 * ทางแยก: วิธีคุ้มครองที่ 4 ประสานหน่วยงานอื่นตามข้อ 15(4)
 * วิธีที่ 4 ต้องเลือกเดี่ยว (ใช้ร่วมกับวิธีที่ 1–3 ไม่ได้) จึงเป็นแฟ้มชุดแยกจากทางแยกวิธีที่ 2 / 3
 * คบ.6 ข้อ 8.2 เลือกเฉพาะวิธีที่ 4 — ไม่มี คบ.8 · หลังพยานลงนาม คบ.11 ระบบเปิดเส้นทางวิธีที่ 4 ให้เจ้าหน้าที่ประสานหน่วยงาน
 */
export default {
  id: 'method4',
  title: 'ทางแยก: วิธีคุ้มครองที่ 4 ประสานหน่วยงานอื่น',
  summary:
    'เมื่อ คบ.6 ข้อ 8.2 เลือกวิธีที่ 4 (เลือกเดี่ยว) เจ้าหน้าที่ส่งหนังสือประสานหน่วยงานอื่นให้ช่วยคุ้มครอง บันทึกหนังสือตอบรับ นัดส่งมอบและลงนาม คบ.12 จนหน่วยงานเริ่มปฏิบัติจริง โดยคำสั่งยังอยู่กับ ป.ป.ท.',
  branchSection: 'เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6',
  prefix: async (d) => {
    await commonToAssessment(d)
    await commonFromAssessment(d, { methods: [4], recordMethodPick: true })
    await approveToAgreement(d)
  },
  run: async (d) => {
    await method4Steps(d)
  },
} satisfies GuideFlow

export async function method4Steps(d: GuideDirector, caseNo: string = GUIDE_CASE_NO) {
  const p = d.page
  const next = p.getByRole('button', { name: 'ถัดไป' })
  const step = p.getByText(/ขั้นตอน \d+ จาก \d+/).first()

  // ── เปิดเส้นทางวิธีที่ 4 ──
  await d.goto('/protection-methods')
  d.section('เจ้าหน้าที่เข้าเส้นทางวิธีที่ 4', 'ระบบเปิดเฉพาะวิธีที่ 4 ตามที่ติ๊กไว้ใน คบ.6 ข้อ 8.2 — ไม่มี คบ.8')
  await d.highlight(p.getByText('ความยินยอมตาม คบ.11 — ลงนามครบแล้ว').first(), 'พยานลงนาม คบ.11 ครบแล้ว จึงเริ่มวิธีคุ้มครองได้', 1500)
  const card = p.getByText('วิธีที่ 4 — ประสานหน่วยงานอื่นให้คุ้มครอง').first()
  await d.click(card, { note: 'กดเข้าหน้าปฏิบัติวิธีที่ 4' })
  await d.highlight(step, 'หน่วยงานที่จะประสาน — ตรวจ คบ.11 ลงนามแล้ว', 1500)
  await d.click(next, { note: 'กด "ถัดไป"' })

  // ── หนังสือประสานขาออก ──
  d.section('ส่งหนังสือประสานหน่วยงานอื่น', 'บันทึกเลขหนังสือจากระบบสารบรรณเดิม — การส่งหนังสือยังไม่ใช่การส่งมอบพยาน')
  await d.fill(p.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }), 'ปปท 0004/1234', { note: 'กรอกเลขที่หนังสือประสาน' })
  await d.fill(p.getByRole('textbox', { name: 'เลขติดตาม' }), 'EM123456789TH', { note: 'กรอกเลขติดตามการนำส่ง' })
  await d.click(p.getByTestId('coordination-send-outgoing'), { note: 'กด "บันทึกหนังสือขาออก"' })
  await d.confirm('ยืนยันบันทึกหนังสือขาออก', 'ยืนยันบันทึกหนังสือขาออก')
  await d.pause(600)
  await d.result(p.getByText('ทะเบียนหนังสือของวิธีนี้').first(), 'บันทึกหนังสือขาออกแล้ว — วิธีที่ 4 เป็น "เตรียมการ" รอหนังสือตอบกลับ')
  await d.click(next, { note: 'กด "ถัดไป"' })

  // ── หนังสือตอบรับ ──
  d.section('บันทึกหนังสือตอบรับจากหน่วยงาน', 'เมื่อหน่วยงานตอบรับ ให้บันทึกหนังสือตอบกลับขาเข้า เพื่อเปิดขั้นเตรียมส่งมอบ')
  await d.fill(p.getByRole('textbox', { name: 'เลขที่หนังสือรับ' }), 'ตร. 0011/500', { note: 'กรอกเลขที่หนังสือรับ' })
  await d.fill(p.getByRole('textbox', { name: 'ผู้ติดต่อของหน่วยงาน' }), 'พ.ต.ท. ธนากร ศรีอุดม', { note: 'ระบุผู้ติดต่อของหน่วยงาน' })
  await d.highlight(p.getByTestId('coordination-decline'), 'ถ้าหน่วยงานปฏิเสธ กด "ปฏิเสธ" พร้อมเหตุผลแล้วเสนอหน่วยงานใหม่', 1500)
  await d.click(p.getByTestId('coordination-accept'), { note: 'กด "ตอบรับดำเนินการ"' })
  await d.confirm('ยืนยันบันทึกตอบรับ', 'ยืนยันบันทึกตอบรับ')
  await d.pause(600)
  await d.result(p.getByText('ทะเบียนหนังสือของวิธีนี้').first(), 'บันทึกหนังสือตอบรับแล้ว — เตรียมนัดส่งมอบได้')
  await d.click(next, { note: 'กด "ถัดไป"' })

  // ── เตรียมส่งมอบและ คบ.12 ──
  d.section('เตรียมส่งมอบและลงนาม คบ.12', 'นัดวัน สถานที่ ผู้ส่ง-ผู้รับ และขอบเขตข้อมูล แล้วบันทึกส่งมอบจริง — คำสั่งยังอยู่กับ ป.ป.ท.')
  await d.fill(p.getByLabel('วันเวลานัดส่งมอบ'), `${isoDaysFromToday(1)}T09:00`, { note: 'เลือกวันเวลานัดส่งมอบ' })
  await d.fill(p.getByLabel('สถานที่ส่งมอบ'), 'สำนักงาน ป.ป.ท. เขต 1', { note: 'ระบุสถานที่ส่งมอบ' })
  await d.fill(p.getByLabel('ผู้ส่งมอบ'), 'นางสาวอรุณี ใจมั่น', { note: 'ระบุผู้ส่งมอบ' })
  await d.fill(p.getByLabel('ผู้รับมอบ'), 'พ.ต.ท. ธนากร ศรีอุดม', { note: 'ระบุผู้รับมอบ' })
  await d.fill(p.getByLabel('ขอบเขตข้อมูลที่เปิดเผยได้'), 'ชื่อ-สกุล ที่อยู่ปัจจุบัน และลักษณะภัยคุกคามเท่าที่จำเป็น', { note: 'ระบุขอบเขตข้อมูลที่เปิดเผยได้' })
  await d.click(p.getByTestId('open-kb12-method4'), { note: 'กด "เปิดแบบ คบ.12 (วิธีที่ 4)" เพื่อตรวจแบบ' })
  await p.waitForURL(/\/form\/12/)
  await d.pause(800)
  await d.highlight(p.getByTestId('kb12-context-banner'), 'แบบ คบ.12 บริบทวิธีที่ 4 — คำสั่งยังอยู่กับ ป.ป.ท. ไม่เข้าเส้นทางส่งต่อเมื่อครบ 180 วัน', 2000)
  await d.goto(`/protection-method/4?caseNo=${caseNo}`)
  await next.click().catch(() => {})
  // wizard ย้อนกลับมาขั้นแรก — ไปขั้นเตรียมส่งมอบอีกครั้ง
  for (let i = 0; i < 3 && !(await p.getByTestId('coordination-complete-handover').count()); i++) await next.click()
  await d.fill(p.getByLabel('วันที่ส่งมอบจริง'), isoDaysFromToday(0), { note: 'ระบุวันที่ส่งมอบจริง' })
  await d.click(p.getByTestId('coordination-complete-handover'), { note: 'กด "บันทึกส่งมอบจริงและลงนาม คบ.12"' })
  await d.confirm('ยืนยันส่งมอบและลงนาม คบ.12', 'ยืนยันส่งมอบและลงนาม คบ.12')
  await d.pause(600)
  await d.result(p.getByTestId('method-4-start'), 'บันทึกส่งมอบจริงแล้ว — ปุ่มเริ่มปฏิบัติจริงเปิดให้กด')

  // ── เริ่มปฏิบัติจริง ──
  d.section('หน่วยงานเริ่มปฏิบัติจริง', 'บันทึกวันเริ่มปฏิบัติจริงของวิธีที่ 4 ตามวันส่งมอบจริง')
  await d.click(p.getByTestId('method-4-start'), { note: 'กด "หน่วยงานเริ่มปฏิบัติจริง · ACTIVE"' })
  await d.confirm('ยืนยันเริ่มปฏิบัติจริง', 'ยืนยันเริ่มปฏิบัติจริง')
  await d.pause(900)
  await d.goto('/protection-methods')
  await d.result(card, 'วิธีที่ 4 เริ่มปฏิบัติจริงแล้ว (กำลังปฏิบัติ)')
}
