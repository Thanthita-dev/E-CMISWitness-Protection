import type { Director } from '../director'
import type { ScenarioScript } from '../types'

export default {
  id: 'methods-2-3-4',
  steps: {
    'Case 1.11': {
      detail:
        'พยานได้รับ คบ.9 แล้ว เจ้าหน้าที่ให้พยานและผู้เกี่ยวข้องลงนามข้อตกลง คบ.11 ครบทุกช่อง จากนั้นเลือกเปิดเส้นทางปฏิบัติวิธีที่ 2 และ 3 พร้อมกัน (วิธีที่ 1–3 เลือกร่วมกันได้ ส่วนวิธีที่ 4 ต้องเลือกเดี่ยว)',
      run: async (d) => {
        const p = d.page
        // WIT0807-0810 — ลงนาม คบ.11 ทีละช่อง
        await d.click(p.getByRole('button', { name: 'ลงนาม' }), { note: 'WIT0810 เปิดโมดัลลงนาม คบ.11' })
        const signers = ['พยาน/ผู้ได้รับการคุ้มครอง', 'ผู้ให้การคุ้มครอง', 'พยานรับรองคนที่ 1', 'พยานรับรองคนที่ 2']
        for (const who of signers) {
          await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: 'ลงลายมือชื่อช่องถัดไป' })
          await d.sign(who)
          await d.pause(400)
        }
        await d.click(p.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }), {
          note: 'WIT0811 บันทึก คบ.11 — ระบบล็อกฉบับลงนาม',
        })
        await d.pause(800)

        // WIT0813 — แยกเส้นทางตามวิธีที่อนุมัติ
        await d.goto('/protection-methods')
        await d.highlight(p.getByText('ความยินยอมตาม คบ.11 — ลงนามครบแล้ว'), 'WIT0809 พยานยินยอมตาม คบ.11 ครบแล้ว', 2200)
        await d.highlight(p.getByText('วิธีที่ได้รับอนุมัติตามข้อ 15 (วิธีที่ 1–3 เลือกร่วมกันได้ · วิธีที่ 4 เลือกเดี่ยว)'), 'WIT0813 วิธีที่ 1–3 เลือกร่วมกันได้ · วิธีที่ 4 เลือกเดี่ยว', 2000)
        await d.click(p.getByText('(2) จัดให้พยานอยู่ในสถานที่เหมาะสม'), { note: 'วิธีที่ 2 สถานที่ปลอดภัย' })
        await d.click(p.getByText('(3) ปกปิด และรักษาความลับ'), { note: 'วิธีที่ 3 ปกปิดข้อมูล' })
        await d.click(p.getByRole('button', { name: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' }), { note: 'เปิดเส้นทางปฏิบัติตามวิธีที่เลือก' })
        await d.confirm('ยืนยันเปิดเส้นทางปฏิบัติ', 'ยืนยันเปิดเส้นทางปฏิบัติ')
        await d.pause(800)
        await d.highlight(p.getByText('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), 'วิธีที่ 2 → แท็บ 08A-2', 1800)
        await d.highlight(p.getByText('วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ'), 'วิธีที่ 3 → แท็บ 08A-3', 1800)
      },
    },
    'Case 8': {
      detail:
        'เปิดวิธีที่ 2 และ 3 แล้ว แต่ละวิธีมีสถานะและขั้นตอนของตัวเอง เจ้าหน้าที่ทำทีละวิธี: จัดสถานที่ปลอดภัย และปกปิดข้อมูล',
      run: async (d) => {
        const p = d.page
        const card = (t: string) => p.getByText(t).first()

        // ---------- วิธีที่ 2 (08A-2) ----------
        await d.highlight(card('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), 'ทั้ง 2 วิธียังรอเริ่มดำเนินการ', 1800)
        await d.click(card('วิธีที่ 2 — จัดสถานที่ปลอดภัย'), { note: 'เข้าหน้าปฏิบัติวิธีที่ 2 (WIT0822)' })
        await d.fill(p.getByLabel('ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง'), 'ที่พักภายในเขตกรุงเทพฯ · บุคคลร่วมคุ้มครอง 2 คน', { note: 'WIT0823 ขอบเขตที่อนุมัติ' })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        await d.select(p.getByLabel('ประเภทสถานที่'), 'pacc_designated', { note: 'WIT0824 เลือกประเภทสถานที่' })
        await d.fill(p.getByLabel('สถานที่ที่เสนอ'), 'บ้านพักที่ ป.ป.ท. กำหนด', { note: 'สถานที่ที่เสนอ' })
        await d.fill(p.getByLabel('ผู้ดูแลสถานที่'), 'ร.ต.ท. สมชาย ดูแลดี', { note: 'ผู้ดูแลสถานที่' })
        await d.fill(p.getByLabel('ผู้ประเมิน'), 'นางสาวอรุณี ใจมั่น', { note: 'ผู้ประเมิน' })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        await d.fill(p.getByLabel('ผลประเมินความปลอดภัยและความลับ'), 'ปลอดภัยดี มีรั้วรอบและเจ้าหน้าที่รักษาความปลอดภัย', { note: 'WIT0825 ประเมินความปลอดภัย' })
        await d.click(p.getByRole('button', { name: 'สถานที่เหมาะสม' }), { note: 'WIT0826 สถานที่เหมาะสม' })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        await d.fill(p.getByLabel('แผนย้าย / รับ–ส่ง'), 'รับพยานจากที่อยู่เดิม นำส่งด้วยรถส่วนกลาง', { note: 'WIT0827 แผนย้าย/รับ–ส่ง' })
        await d.fill(p.getByLabel('ผู้ส่งมอบ'), 'นางสาวอรุณี ใจมั่น', { note: 'ผู้ส่งมอบ' })
        await d.fill(p.getByLabel('ผู้รับมอบ'), 'ร.ต.ท. สมชาย ดูแลดี', { note: 'ผู้รับมอบ' })
        await p.getByTestId('site-handover-evidence-input').setInputFiles({
          name: 'handover-evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('handover evidence'),
        }) // input ไฟล์ซ่อนอยู่ ใช้ setInputFiles ตรง ๆ ได้เท่านั้น
        await d.highlight(p.getByText('handover-evidence.pdf'), 'WIT0828 แนบหลักฐานส่งมอบ–รับมอบ', 1800)
        await d.click(p.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }), { note: 'WIT0829 เริ่มปฏิบัติจริง' })
        await d.confirm('ยืนยันเริ่มปฏิบัติจริง', 'ยืนยันเริ่มปฏิบัติจริง')
        await d.pause(900)

        // ---------- วิธีที่ 3 (08A-3) ----------
        await d.goto('/protection-methods')
        await d.click(card('วิธีที่ 3 — ปกปิดข้อมูลและจำกัดสิทธิ'), { note: 'เข้าหน้าปฏิบัติวิธีที่ 3 (WIT0830)' })
        await d.click(p.getByRole('button', { name: 'ชื่อตัว - ชื่อสกุล' }), { note: 'WIT0831 เลือกข้อมูลที่ต้องปกปิด' })
        await d.click(p.getByRole('button', { name: 'เลขประจำตัวประชาชน' }), { note: 'เลขประจำตัวประชาชน' })
        await d.click(p.getByRole('button', { name: 'ที่อยู่ / ที่พักปัจจุบัน' }), { note: 'ที่อยู่ปัจจุบัน' })
        await d.fill(p.getByLabel('ช่องทางที่ต้องปกปิด'), 'ระบบทะเบียนราษฎร์ และเอกสารราชการทุกฉบับที่เผยแพร่ภายนอก', { note: 'ช่องทางที่ต้องปกปิด' })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        await d.click(p.getByRole('button', { name: 'เจ้าหน้าที่ ป.ป.ท.' }), { note: 'WIT0832 เลือก Role ที่เข้าถึงได้' })
        await d.click(p.getByRole('button', { name: 'ผอ.สำนัก/กอง' }), { note: 'ผอ.สำนัก/กอง' })
        await d.fill(p.getByLabel('เหตุผลของการให้สิทธิ์'), 'จำกัดเฉพาะผู้ปฏิบัติและผู้บังคับบัญชาที่ต้องกำกับดูแล', { note: 'เหตุผล Need-to-Know' })
        await d.fill(p.getByLabel('ผู้อนุมัติสิทธิ์'), 'นายวีระยุทธ พิทักษ์ธรรม', { note: 'ผู้อนุมัติสิทธิ์' })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        for (const t of ['จำกัดการค้นหา', 'จำกัดการดาวน์โหลด', 'จำกัดการพิมพ์', 'จำกัดการส่งต่อ'])
          await d.click(p.getByText(t, { exact: true }), { note: `WIT0833 ${t}`, after: 400 })
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ถัดไป' })
        await d.fill(p.getByLabel('ผลการทดสอบ'), 'ทดสอบเข้าถึงด้วยบัญชีนอกขอบเขต — ไม่พบข้อมูลที่ปกปิดรั่วไหล', { note: 'WIT0834 ผลทดสอบสิทธิ์' })
        await d.click(p.getByRole('button', { name: 'บันทึกผล: ผ่าน' }), { note: 'บันทึกผล: ผ่าน' })
        await d.highlight(p.getByText(/Policy Version 1/).first(), 'WIT0836 ระบบบันทึก Policy Version และ Audit Baseline', 2200)
        await d.click(p.getByRole('button', { name: 'เปิดใช้มาตรการ · ACTIVE' }), { note: 'WIT0837 เปิดใช้มาตรการ' })
        await d.confirm('ยืนยันเริ่มปฏิบัติจริง', 'ยืนยันเริ่มปฏิบัติจริง')
        await d.pause(900)
      },
    },
    'Case 8.1': {
      detail:
        'อีกแฟ้มหนึ่งเปิดวิธีที่ 4 อย่างเดียว (วิธีที่ 4 เลือกร่วมกับวิธีที่ 1–3 ไม่ได้) เจ้าหน้าที่ประสานหน่วยงานอื่นให้คุ้มครองแทน',
      run: async (d) => {
        const p = d.page
        const card = (t: string) => p.getByText(t).first()

        // ---------- วิธีที่ 4 (08B) ----------
        await d.goto('/protection-methods')
        await d.click(card('วิธีที่ 4 — ประสานหน่วยงานอื่นตามข้อ 15(4)'), { note: 'เข้าหน้าปฏิบัติวิธีที่ 4 (WIT0841)' })
        await d.highlight(p.getByText(/ขั้นตอน \d+ จาก \d+/).first(), 'WIT0842 หน่วยงานที่จะประสาน: DSI', 2000)
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ไปขั้นหนังสือประสานขาออก' })
        await d.fill(p.getByRole('textbox', { name: 'เลขที่หนังสือ', exact: true }), 'ปปท 0004/1234', { note: 'WIT0843 เลขที่หนังสือประสาน' })
        await d.click(p.getByTestId('coordination-send-outgoing'), { note: 'บันทึกหนังสือขาออก' })
        await d.confirm('ยืนยันบันทึกหนังสือขาออก', 'ยืนยันบันทึกหนังสือขาออก')
        await d.pause(600)
        await d.highlight(p.getByText(/ขั้นตอน \d+ จาก \d+/).first(), 'วิธีที่ 4 เป็น "เตรียมการ" รอหนังสือตอบกลับ (WIT0844)', 2500)
      },
    },
  },
} satisfies ScenarioScript
