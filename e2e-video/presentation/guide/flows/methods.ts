import type { GuideFlow } from '../types'
import type { GuideDirector } from '../guide-director'
import { commonToAssessment, commonFromAssessment } from './common'
import { approveToAgreement } from './main-approve'

/**
 * ทางแยก: วิธีคุ้มครองที่ 2 / 3
 * ต่างจากเส้นหลักตรงที่ คบ.6 ข้อ 8.2 เลือกวิธีที่ 2 และ 3 (ไม่เลือกวิธีที่ 1) จึงไม่มี คบ.8 —
 * หลังพยานลงนาม คบ.11 ระบบเปิดเส้นทางปฏิบัติวิธีที่ 2 และ 3 ให้เจ้าหน้าที่เดินแยกกัน
 * (วิธีที่ 4 ต้องเลือกเดี่ยว ใช้ร่วมกับวิธีที่ 2/3 ในแฟ้มเดียวกันไม่ได้ จึงไม่รวมในทางแยกนี้)
 */
export default {
  id: 'methods',
  title: 'ทางแยก: วิธีคุ้มครองที่ 2 / 3',
  summary:
    'เมื่อ คบ.6 ข้อ 8.2 เลือกวิธีที่ 2 (จัดสถานที่ปลอดภัย) และวิธีที่ 3 (ปกปิดข้อมูลและจำกัดสิทธิ) ระบบจะเปิดเส้นทางปฏิบัติของแต่ละวิธีหลังพยานลงนาม คบ.11 เจ้าหน้าที่ดำเนินการทีละวิธีจนเริ่มปฏิบัติจริง',
  branchSection: 'เจ้าหน้าที่จัดทำ คบ.3 และ คบ.6',
  prefix: async (d) => {
    await commonToAssessment(d)
    await commonFromAssessment(d, { methods: [2, 3], recordMethodPick: true })
    await approveToAgreement(d)
  },
  run: async (d) => {
    await methodsSteps(d)
  },
} satisfies GuideFlow

export async function methodsSteps(d: GuideDirector) {
  const p = d.page
  const card = (t: string) => p.getByText(t).first()
  const next = p.getByRole('button', { name: 'ถัดไป' })

  // ── เปิดเส้นทางปฏิบัติ ──
  await d.goto('/protection-methods')
  d.section('เจ้าหน้าที่ดูเส้นทางปฏิบัติที่ระบบเปิดให้', 'ระบบเปิดเฉพาะวิธีที่ติ๊กไว้ใน คบ.6 ข้อ 8.2 — ไม่มี คบ.8 เพราะไม่ได้เลือกวิธีที่ 1')
  await d.highlight(p.getByText('ความยินยอมตาม คบ.11 — ลงนามครบแล้ว').first(), 'พยานลงนาม คบ.11 ครบแล้ว จึงเริ่มวิธีคุ้มครองได้', 1500)
  await d.highlight(card('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), 'เปิดวิธีที่ 2 และ 3 แล้ว ทั้งคู่ยังรอเริ่มดำเนินการ')

  // ── วิธีที่ 2 ──
  d.section('วิธีที่ 2 จัดสถานที่ปลอดภัย', 'กำหนดขอบเขต เลือกและประเมินสถานที่ วางแผนย้าย แล้วบันทึกว่าเริ่มปฏิบัติจริง')
  await d.click(card('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), { note: 'กดเข้าหน้าปฏิบัติวิธีที่ 2' })
  await d.fill(p.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง'), 'ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน', { note: 'ระบุขอบเขตที่อนุมัติ' })
  await d.click(next, { note: 'กด "ถัดไป"' })
  await d.select(p.getByLabel('ประเภทสถานที่'), 'pacc_designated', { note: 'เลือกประเภทสถานที่' })
  await d.fill(p.getByLabel('สถานที่ที่เสนอ'), 'บ้านพักที่ ป.ป.ท. กำหนด', { note: 'ระบุสถานที่ที่เสนอ' })
  await d.fill(p.getByLabel('ผู้ดูแลสถานที่'), 'ร.ต.ท. สมชาย ดูแลดี', { note: 'ระบุผู้ดูแลสถานที่' })
  await d.fill(p.getByLabel('ผู้ประเมิน'), 'นางสาวอรุณี ใจมั่น', { note: 'ระบุผู้ประเมิน' })
  await d.click(next, { note: 'กด "ถัดไป"' })
  await d.fill(p.getByLabel('ผลประเมินความปลอดภัยและความลับ'), 'ปลอดภัยดี มีรั้วรอบและเจ้าหน้าที่รักษาความปลอดภัย', { note: 'บันทึกผลประเมินความปลอดภัย' })
  await d.click(p.getByRole('button', { name: 'สถานที่เหมาะสม' }), { note: 'กด "สถานที่เหมาะสม"' })
  await d.click(next, { note: 'กด "ถัดไป"' })
  await d.fill(p.getByLabel('แผนย้าย / รับ–ส่ง'), 'รับพยานจากที่อยู่เดิม นำส่งด้วยรถส่วนกลาง', { note: 'ระบุแผนย้ายและรับ–ส่ง' })
  await d.fill(p.getByLabel('ผู้ส่งมอบ'), 'นางสาวอรุณี ใจมั่น', { note: 'ระบุผู้ส่งมอบ' })
  await d.fill(p.getByLabel('ผู้รับมอบ'), 'ร.ต.ท. สมชาย ดูแลดี', { note: 'ระบุผู้รับมอบ' })
  // ช่องอัปโหลดซ่อนอยู่ จึงแนบไฟล์ด้วย setInputFiles
  await p.getByTestId('site-handover-evidence-input').setInputFiles({
    name: 'หลักฐานส่งมอบ-รับมอบ.pdf', mimeType: 'application/pdf', buffer: Buffer.from('handover evidence'),
  })
  await d.highlight(p.getByText('หลักฐานส่งมอบ-รับมอบ.pdf'), 'แนบหลักฐานส่งมอบ–รับมอบแล้ว')
  await d.click(p.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }), { note: 'กด "บันทึกเข้าพัก/ย้ายแล้ว"' })
  await d.confirm('ยืนยันเริ่มปฏิบัติจริง', 'ยืนยันเริ่มปฏิบัติจริง')
  await d.pause(900)
  await d.goto('/protection-methods')
  await d.result(card('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), 'วิธีที่ 2 เริ่มปฏิบัติจริงแล้ว (กำลังปฏิบัติ)')

  // ── วิธีที่ 3 ──
  d.section('วิธีที่ 3 ปกปิดข้อมูลและจำกัดสิทธิ', 'เลือกข้อมูลที่ปกปิด กำหนดผู้เข้าถึงและข้อจำกัด ทดสอบสิทธิ แล้วเปิดใช้มาตรการ')
  await d.goto('/protection-methods')
  await d.click(card('วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ'), { note: 'กดเข้าหน้าปฏิบัติวิธีที่ 3' })
  await d.click(p.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }), { note: 'เลือกข้อมูลที่ต้องปกปิด: ชื่อ-สกุล' })
  await d.click(p.getByRole('button', { name: 'เลขประจำตัวประชาชน' }), { note: 'เลือกเลขประจำตัวประชาชน' })
  await d.click(p.getByRole('button', { name: 'ที่อยู่ / ที่พักปัจจุบัน' }), { note: 'เลือกที่อยู่ปัจจุบัน' })
  await d.fill(p.getByLabel('ช่องทางที่ต้องปกปิด'), 'ระบบทะเบียนราษฎร์ และเอกสารราชการทุกฉบับที่เผยแพร่ภายนอก', { note: 'ระบุช่องทางที่ต้องปกปิด' })
  await d.click(next, { note: 'กด "ถัดไป"' })
  await d.click(p.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }), { note: 'เลือกบทบาทที่เข้าถึงได้: เจ้าหน้าที่ ป.ป.ท.' })
  await d.click(p.getByRole('button', { name: 'ผอ.สำนัก/กอง' }), { note: 'เลือก ผอ.สำนัก/กอง' })
  await d.fill(p.getByLabel('เหตุผลของการให้สิทธิ์'), 'จำกัดเฉพาะผู้ปฏิบัติและผู้บังคับบัญชาที่ต้องกำกับดูแล', { note: 'ระบุเหตุผลของการให้สิทธิ์' })
  await d.fill(p.getByLabel('ผู้อนุมัติสิทธิ์'), 'นายวีระยุทธ พิทักษ์ธรรม', { note: 'ระบุผู้อนุมัติสิทธิ์' })
  await d.click(next, { note: 'กด "ถัดไป"' })
  for (const t of ['จำกัดการค้นหา', 'จำกัดการดาวน์โหลด', 'จำกัดการพิมพ์', 'จำกัดการส่งต่อ'])
    await d.click(p.getByText(t, { exact: true }), { note: `เลือก "${t}"`, after: 400 })
  await d.click(next, { note: 'กด "ถัดไป"' })
  await d.fill(p.getByLabel('ผลการทดสอบ'), 'ทดสอบเข้าถึงด้วยบัญชีนอกขอบเขต — ไม่พบข้อมูลที่ปกปิดรั่วไหล', { note: 'บันทึกผลทดสอบสิทธิ' })
  await d.click(p.getByRole('button', { name: 'บันทึกผล: ผ่าน' }), { note: 'กด "บันทึกผล: ผ่าน"' })
  await d.highlight(p.getByText(/Policy Version 1/).first(), 'ระบบบันทึกเวอร์ชันนโยบายและค่าตั้งต้นการตรวจสอบ', 2000)
  await d.click(p.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' }), { note: 'กด "เปิดใช้มาตรการ"' })
  await d.confirm('ยืนยันเริ่มปฏิบัติจริง', 'ยืนยันเริ่มปฏิบัติจริง')
  await d.pause(900)
  await d.goto('/protection-methods')
  await d.result(card('วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ'), 'วิธีที่ 3 เปิดใช้มาตรการแล้ว (กำลังปฏิบัติ) — ทั้งสองวิธีเดินคู่ขนานกัน')
}
