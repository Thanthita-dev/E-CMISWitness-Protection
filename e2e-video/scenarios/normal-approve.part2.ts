import type { Locator, Page } from '@playwright/test'
import { isoDaysFromToday, type Director } from '../director'
import type { CheckpointScript } from '../types'

/** เส้นทางปกติ ช่วงหลัง (Case 1.10 – 1.19) */

const CASE_NO = 'WP-2569-000501'
const DOSSIER = `/dossier/${CASE_NO}`
const TERM = `/termination/${CASE_NO}`

const dispatchCard = (p: Page) =>
  p.getByText('การนำส่งหนังสือและวันที่พยานได้รับ').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')

export const steps: Record<string, CheckpointScript> = {
  'Case 1.10': {
    detail:
      'เจ้าหน้าที่นำส่งหนังสือแจ้งผล คบ.9 ที่เลขาธิการฯ ลงนามแล้วให้พยาน แล้วบันทึกวันที่พยานได้รับจริง เพื่อใช้เป็นหลักฐานการแจ้งผล',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText('ลงนาม คบ.9 แล้ว · พร้อมนำส่ง').first(), 'สถานะแฟ้ม: คบ.9 ลงนามแล้ว พร้อมนำส่ง (WIT0801)')
      const card = dispatchCard(p)
      await d.scrollTo(card)
      await d.click(card.getByRole('button', { name: 'บันทึกการนำส่ง' }), { note: 'เลือกช่องทางแล้วกดบันทึกการนำส่ง (WIT0806)' })
      await d.fill(card.locator('input[type="date"]'), isoDaysFromToday(-1), { note: 'วันที่พยานได้รับหนังสือจริง' })
      await d.fill(card.locator('label', { hasText: 'ผู้รับหนังสือ' }).locator('xpath=following-sibling::*[1]'), 'นายสมชาย ใจดี (พยาน)', { note: 'ชื่อผู้รับหนังสือ' })
      await d.attach(card.locator('label', { hasText: 'เลือกไฟล์อัปโหลด' }).locator('input[type="file"]'), 'ใบตอบรับ-คบ9.pdf')
      await d.click(card.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }), { note: 'ยืนยันว่าพยานได้รับหนังสือแล้ว' })
      await d.highlight(p.getByTestId('dossier-forms'), 'คบ.9 ถึงมือพยานครบ — ต่อไปจัดทำ คบ.11 ข้อตกลงคุ้มครอง', 2200)
    },
  },
  'Case 1.11': {
    detail:
      'เจ้าหน้าที่ให้พยานและผู้เกี่ยวข้องลงลายมือชื่อในข้อตกลงคุ้มครอง (คบ.11) ให้ครบทุกช่อง ระบบจะบันทึกความยินยอมของพยานและเปิดเส้นทางปฏิบัติตามวิธีที่อนุมัติให้เอง',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByTestId('dossier-forms'), 'คบ.9 นำส่งและพยานรับแล้ว — เหลือลงนาม คบ.11 (WIT0807)', 2200)
      await d.click(p.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }), { note: 'เปิด คบ.11 เพื่อลงนาม (WIT0810)' })
      const names = ['นายสมชาย ใจดี', 'นางสาวอรุณี ใจมั่น', 'นายวิชัย รักษาธรรม', 'นางสุดา มั่นคง']
      const signBtns = p.getByRole('button', { name: 'ลงลายมือชื่อ' })
      const count = await signBtns.count()
      for (let i = 0; i < count; i++) {
        await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: `ลงลายมือชื่อ ช่องที่ ${i + 1} จาก ${count}` })
        await d.sign(names[i] ?? 'พยานในการทำข้อตกลง')
      }
      await d.click(p.getByRole('button', { name: 'บันทึกข้อตกลง คบ.11' }), { note: 'ลงนามครบทุกช่อง บันทึกข้อตกลง คบ.11 (WIT0811)' })
      await d.highlight(p.getByTestId('dossier-forms'), 'คบ.11 ลงนามครบและถูกล็อก เหลือแค่ "ดูเอกสาร"', 2200)
    },
  },
  'Case 1.12': {
    detail:
      'หลังพยานยินยอมแล้ว เจ้าหน้าที่ปฏิบัติตามวิธีที่อนุมัติ (วิธีที่ 1 จัดชุดคุ้มครอง): เสนอ คบ.8 ให้เลขาธิการฯ ลงนาม จัดแผนปฏิบัติ ชี้แจงชุดปฏิบัติ แล้วเริ่มคุ้มครองจริง',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText('เปิดเส้นทางปฏิบัติ 1 วิธีตามคำสั่ง').first(), 'ระบบเปิดเส้นทางปฏิบัติตามวิธีที่อนุมัติให้แล้ว (WIT0813)')
      await d.goto('/protection-methods')
      await d.highlight(p.getByText('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').first(), 'วิธีที่ 1 ถูกเปิดเส้นทางแล้ว — วิธีที่ 1-3 ไป 08A-1/2/3 วิธีที่ 4 ไป 08B', 2400)
      await d.goto(DOSSIER)
      await d.click(p.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }), { note: 'ส่งเสนอ คบ.8 คำสั่งมอบหมายเจ้าพนักงาน (WIT0817)' })

      await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.8', 'เลขาธิการ ป.ป.ท. ตรวจและลงนามคำสั่งมอบหมายเจ้าพนักงาน (คบ.8) ก่อนที่ชุดคุ้มครองจะเริ่มปฏิบัติได้', DOSSIER)
      await d.click(p.getByRole('button', { name: 'ลงนาม' }), { note: 'เปิดรายการ คบ.8 ที่รอลงนาม (WIT0818)' })
      await d.click(p.getByRole('button', { name: 'ลงนาม คบ.8' }), { note: 'กดลงนาม คบ.8' })
      await d.sign('นายสุรศักดิ์ ธรรมพิทักษ์')
      await d.highlight(p.getByTestId('dossier-forms').getByText('ลงนามแล้ว').first(), 'คบ.8 ลงนามแล้ว ฉบับถูกล็อก', 1800)

      await d.switchRole('officer', 'เจ้าหน้าที่เริ่มปฏิบัติจริง', 'เจ้าหน้าที่จัดแผนปฏิบัติ ชี้แจงภารกิจให้ชุดปฏิบัติ และกดเริ่มปฏิบัติจริงตามวิธีที่ 1', `/protection-method/1?caseNo=${CASE_NO}`)
      await d.fill(p.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร'), 'ร.ต.อ. อนุชา กล้าหาญ (หัวหน้าชุด), ส.ต.อ. ธนกฤต มั่นใจ และสมาชิก 3 นาย แบ่งเวร 3 ผลัด', { note: 'จัดแผน: สมาชิกชุดและเวร (WIT0819)' })
      await d.fill(p.getByLabel('ยานพาหนะ'), 'รถกระบะตู้ทึบ 1 คัน', { note: 'ยานพาหนะ' })
      await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ไปขั้นชี้แจงภารกิจ' })
      await d.fill(p.getByLabel('ผู้ชี้แจง'), 'ร.ต.อ. อนุชา กล้าหาญ', { note: 'ชี้แจงภารกิจแบบ Need-to-Know (WIT0820)' })
      await d.click(p.getByTestId('method-1-start'), { note: 'เริ่มปฏิบัติจริง (WIT0821)' })
      await d.confirm('ยืนยันเริ่มปฏิบัติจริง')
      await d.highlight(p.getByText(/สถานะปัจจุบัน: MAIN_ACTIVE/), 'สถานะเปลี่ยนเป็น MAIN_ACTIVE — เริ่มนับวันคุ้มครอง ต่อด้วยแท็บ 10 ติดตามผล', 2400)
    },
  },
  'Case 1.13': {
    detail:
      'ระหว่างคุ้มครอง เจ้าหน้าที่จัดทำรายงานผล คบ.13 ประจำงวด ให้เจ้าหน้าที่และพยานลงนามรับรอง ตรวจรับผล บันทึกความเสี่ยง แล้วล็อกเป็นรอบรายงาน และส่งเข้าทบทวนเมื่อใกล้ครบกำหนด',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText('กำลังคุ้มครอง').first(), 'แฟ้มอยู่ในสถานะ "กำลังคุ้มครอง" — ต้องรายงานผลเป็นรอบ (คบ.13)')
      await d.click(p.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }), { note: 'เปิด คบ.13 เพื่อลงนามรับรองรายงาน (WIT1006)' })
      await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: 'เจ้าหน้าที่ผู้ปฏิบัติลงลายมือชื่อ' })
      await d.sign('นางสาวอรุณี ใจมั่น')
      await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: 'พยานลงลายมือชื่อรับรอง (WIT1007)' })
      await d.sign('นายสมชาย ใจดี')
      await d.pause(800)

      await d.goto(`/protection-monitor?caseNo=${CASE_NO}`)
      await d.click(p.locator('[title="WIT1001"]'), { note: 'กดหมุด WIT1001 เพื่อดูการ์ด Episode' })
      await d.highlight(p.getByText('Phase ปัจจุบัน', { exact: true }), 'ดู Phase ปัจจุบัน วันเริ่มจริง และยอดวันสะสม ไม่เกิน 180 วัน (WIT1001-1003)', 2600)
      await d.click(p.getByRole('button', { name: 'ตรวจรับรายงาน' }), { note: 'ตรวจรับ คบ.13 ที่ลงนามครบแล้ว (WIT1008)' })
      await d.click(p.getByRole('button', { name: 'รับรายงานและตรวจผล' }), { note: 'รับรายงานและตรวจผลเทียบวิธีที่อนุมัติ' })
      await d.click(p.getByRole('button', { name: 'ต่ำ', exact: true }), { note: 'เลือกระดับความเสี่ยง (WIT1009)' })
      await d.fill(p.getByLabel('ปัญหา/อุปสรรคที่พบ'), 'พบบุคคลไม่ทราบชื่อเฝ้าสังเกตบริเวณที่พัก 1 ครั้ง ตรวจสอบแล้วไม่พบการกระทำต่อเนื่อง', { note: 'บันทึกปัญหาที่พบ' })
      await d.fill(p.getByLabel('ข้อเสนอสำหรับรอบถัดไป'), 'คงมาตรการเดิมและเพิ่มการตรวจตราตอนกลางคืน', { note: 'ข้อเสนอรอบถัดไป' })
      await d.click(p.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }), { note: 'บันทึกสถานะล่าสุด' })
      await d.click(p.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }), { note: 'ล็อกรอบรายงาน ห้ามแก้ทับ (WIT1010)' })
      await d.confirm('ยืนยัน')
      await d.click(p.getByRole('button', { name: 'ประเมิน' }), { note: 'ประเมินว่าคุ้มครองต่อหรือต้องทบทวน (WIT1011)' })
      await d.click(p.getByRole('button', { name: /เลือกแขนง WIT1013/ }), { note: 'เลือกแขนง "ต้องทบทวน"' })
      await d.click(p.getByRole('button', { name: 'ส่งทบทวนที่แท็บ 11A' }), { note: 'ส่งทบทวนผลการคุ้มครอง (WIT1013)' })
      await d.confirm('ยืนยัน')
      await d.highlight(p.getByText(/ส่งทบทวนแล้วเมื่อ/), 'ส่งเรื่องเข้าหน้าทบทวนแล้ว พร้อม คบ.13 ความเสี่ยง และยอดวันสะสม', 2200)
    },
  },
  'Case 1.14': {
    detail:
      'เจ้าหน้าที่ทบทวนผลการคุ้มครอง ประเมินความเสี่ยง และเสนอแนวทาง (ในตัวอย่างคือขอเข้าสู่กระบวนการยุติ เพราะพยานยื่น คบ.7) ให้ผู้บังคับบัญชาเห็นชอบ แล้วจัดทำ คบ.15 รายงานการสิ้นสุดการคุ้มครอง',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByTestId('review-outcome-terminate'), 'ระบบรวมข้อมูล คบ.13 ความเสี่ยง และวันคงเหลือให้ครบแล้ว (WIT1101-1103)', 2400)
      await d.click(p.getByTestId('review-outcome-terminate'), { note: 'เลือกแนวทาง "เข้าสู่กระบวนการยุติ" (WIT1111)' })
      await d.check(p.locator('input[name^="termination-trigger"]').first(), { note: 'เหตุเริ่มยุติ: พยานยื่น คบ.7 (WIT1125-1126)' })
      await d.attach(p.locator('label', { hasText: 'อัปโหลดไฟล์ คบ.7' }).locator('input[type="file"]'), 'คบ7_คำร้องขอยุติการคุ้มครองพยาน.pdf')
      await d.fill(p.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }), 'ความเสี่ยงต่ำ ไม่พบเหตุคุกคามต่อเนื่อง ไม่มีความจำเป็นต้องคุ้มครองต่อ', { note: 'ประเมินความเสี่ยงและความจำเป็น (WIT1104)' })
      await d.fill(p.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย'), 'อ้างอิง คบ.13 งวด 09/2569 และ คบ.7 ของพยาน', { note: 'เหตุผลและหลักฐานอ้างอิง' })
      await d.click(p.getByTestId('review-submit-proposal'), { note: 'เสนอผลทบทวน (WIT1105)' })
      await d.confirm('ยืนยันเสนอผลทบทวน')

      await d.switchRole('supervisor', 'ผบช.ชั้นต้นเห็นชอบข้อเสนอ', 'ผู้บังคับบัญชาชั้นต้นตรวจข้อเสนอผลทบทวน แล้วเห็นชอบหรือส่งคืนแก้ไข', `/protection-review/${CASE_NO}`)
      await d.click(p.getByTestId('review-endorse'), { note: 'เห็นชอบข้อเสนอ (WIT1106)' })
      await d.confirm('ยืนยันเห็นชอบ')

      await d.switchRole('officer', 'เจ้าหน้าที่จัดทำ คบ.15', 'เจ้าหน้าที่ดำเนินการตามแนวทางที่เห็นชอบ แล้วจัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด', `/protection-review/${CASE_NO}`)
      await d.click(p.getByTestId('review-apply-outcome'), { note: 'ดำเนินการตามแนวทางที่เห็นชอบ (WIT1107)' })
      await d.confirm('ยืนยันดำเนินการ')
      await d.click(p.getByTestId('review-goto-11c'), { note: 'ไปแท็บ 11C จัดทำ คบ.15' })
      await d.highlight(p.getByText(/สถานะ "ยุติ" จะเกิดขึ้นก็ต่อเมื่อมีคำสั่ง คบ\.16/), 'การรับ คบ.7 / จัดทำ คบ.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด (WIT1130)', 2400)
      await d.select(p.locator('main').locator('select').nth(1), { label: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป' }, { note: 'เลือกเหตุแห่งการยุติ' })
      await d.fill(p.getByPlaceholder('หลักฐานประกอบและสรุปผลการคุ้มครอง'), 'พยานยื่น คบ.7 ติดตามผลแล้วไม่พบภัยคุกคามเพิ่มเติม', { note: 'สรุปหลักฐาน' })
      await d.click(p.getByRole('button', { name: 'จัดทำ คบ.15 และเสนอ' }), { note: 'จัดทำ คบ.15 และเสนอผู้บังคับบัญชา (WIT1129)' })
    },
  },
  'Case 1.15': {
    detail:
      'ผู้บังคับบัญชาชั้นต้นตรวจ คบ.15 เหตุผลและเอกสารประกอบ ถ้าครบถ้วนก็เห็นชอบและเสนอผู้มีอำนาจพิจารณายุติ ถ้าไม่ครบก็ส่งกลับแก้',
    path: TERM,
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText(/สถานะ "ยุติ" จะเกิดขึ้นก็ต่อเมื่อมีคำสั่ง คบ\.16/), 'ระบบยังคงสถานะคุ้มครองไว้ จนกว่าจะมีคำสั่ง คบ.16 ที่ลงนาม (WIT1130)', 2400)
      await d.highlight(p.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน'), 'ถ้าไม่ครบถ้วน ใส่เหตุผลแล้วกดส่งคืนแก้ไข (WIT1133)', 2000)
      await d.click(p.getByRole('button', { name: 'ครบถ้วน · เสนอผู้มีอำนาจ (WIT1134)' }), { note: 'คบ.15 ครบถ้วน เสนอผู้มีอำนาจ (WIT1131-1134)' })
      await d.confirm('ยืนยันครบถ้วน')
      await d.highlight(p.getByText('ขั้น 11D · พิจารณาและออกคำสั่งยุติ (คบ.16)'), 'เรื่องไปอยู่ที่ผู้มีอำนาจ ในการ์ดขั้น 11D', 2400)
    },
  },
  'Case 1.16': {
    detail:
      'ผอ.สำนัก/กอง ผู้มีอำนาจ ตรวจ คบ.7 / คบ.15 และความเห็นจากผู้บังคับบัญชา แล้วอนุมัติให้ยุติการคุ้มครอง (หากไม่อนุมัติ แฟ้มจะกลับไปคุ้มครองต่อภายใต้คำสั่งเดิม)',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText('WIT1135 · เรื่องที่รับจากแท็บ 11C'), 'สรุป คบ.7 / คบ.15 และความเห็นจาก 11C (WIT1135)', 2600)
      await d.fill(p.getByPlaceholder('ความเห็นประกอบผลพิจารณา'), 'อนุมัติให้ยุติตามที่เสนอ', { note: 'ความเห็นของผู้มีอำนาจ' })
      await d.highlight(p.getByRole('button', { name: 'ไม่อนุมัติ' }), 'ถ้าไม่อนุมัติ ต้องใส่เหตุผล แฟ้มกลับไปคุ้มครองต่อ (WIT1137)', 1800)
      await d.click(p.getByRole('button', { name: 'อนุมัติให้ยุติ' }), { note: 'อนุมัติให้ยุติ (WIT1136)' })
    },
  },
  'Case 1.17': {
    detail:
      'เจ้าหน้าที่ร่างคำสั่งยุติ (คบ.16) เสนอเลขาธิการฯ ลงนาม แล้วจัดทำหนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ (คบ.17) ลงนาม ออกเลข นำส่ง และบันทึกวันที่พยานได้รับจริง',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText(/อนุมัติให้ยุติ/).first(), 'ผู้มีอำนาจอนุมัติให้ยุติแล้ว — เริ่มร่างคำสั่ง คบ.16 (WIT1138)', 2000)
      await d.fill(p.getByPlaceholder('คำสั่งที่'), '118/2569', { note: 'เลขที่คำสั่งยุติ' })
      await d.fill(p.getByLabel('วันที่ออกคำสั่ง'), isoDaysFromToday(0), { note: 'วันที่ออกคำสั่ง' })
      await d.fill(p.getByLabel('วันที่คำสั่งมีผล'), isoDaysFromToday(1), { note: 'วันที่คำสั่งมีผล' })
      await d.click(p.getByRole('button', { name: 'เปิดแฟ้มคดี' }), { note: 'เปิดแฟ้มเพื่อกรอกแบบ คบ.16' })
      await d.click(p.getByRole('button', { name: 'ส่งให้อนุมัติ' }), { note: 'ส่ง คบ.16 ให้ผู้มีอำนาจอนุมัติและลงนาม' })
      await d.confirm('ส่งให้อนุมัติ')

      await d.switchRole('secretary', 'เลขาธิการฯ ลงนามคำสั่ง คบ.16', 'ผู้มีอำนาจลงนามคำสั่งยุติ คบ.16 — สถานะ "ยุติ" เริ่มได้เมื่อมีคำสั่งที่ลงนามแล้วเท่านั้น', TERM)
      await d.click(p.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }), { note: 'ลงนามคำสั่ง คบ.16 (WIT1139) — ฉบับถูกล็อก (WIT1140)' })

      await d.switchRole('officer', 'เจ้าหน้าที่จัดทำ คบ.17', 'เจ้าหน้าที่จัดทำหนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ (คบ.17) เสนอลงนาม', TERM)
      await d.fill(p.getByPlaceholder('ชื่อไฟล์หนังสือ'), 'คบ17_แจ้งคำสั่งยุติ.pdf', { note: 'ชื่อไฟล์ คบ.17 (WIT1141)' })
      await d.click(p.getByRole('button', { name: 'เปิดแฟ้มคดี' }), { note: 'เปิดแฟ้มเพื่อกรอกแบบ คบ.17' })
      await d.click(p.getByRole('button', { name: 'ส่งให้ลงนาม' }), { note: 'ส่ง คบ.17 ให้เลขาธิการฯ ลงนาม' })
      await d.confirm('ส่งให้ลงนาม')

      await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.17 และออกเลข', 'เลขาธิการฯ ลงนาม คบ.17 แล้วออกเลขหนังสือจากระบบสารบรรณเดิมเพื่อนำส่ง', TERM)
      await d.click(p.getByRole('button', { name: 'ลงนาม คบ.17' }), { note: 'ลงนาม คบ.17' })
      await d.fill(p.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'), 'สลข.0017/2569', { note: 'เลขที่หนังสือจากสารบรรณเดิม (WIT1142)' })
      await d.click(p.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }), { note: 'ออกเลขและนำส่ง' })

      await d.switchRole('officer', 'เจ้าหน้าที่บันทึกวันที่พยานได้รับ', 'พยานรับ คบ.17 นอกระบบ เจ้าหน้าที่บันทึกวันที่พยานได้รับจริง ระบบจึงเริ่มนับกรอบอุทธรณ์ 30 วัน', TERM)
      await d.fill(p.getByLabel('วันที่พยานได้รับจริง'), isoDaysFromToday(0), { note: 'วันที่พยานได้รับ คบ.17 จริง (WIT1144-1145)' })
      await d.click(p.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }), { note: 'บันทึกวันที่ — เริ่มนับอุทธรณ์ 30 วัน' })
      await d.highlight(p.getByText(/เหลือ \d+ วัน/).first(), 'กรอบอุทธรณ์ 30 วันเริ่มนับแล้ว', 2200)
    },
  },
  'Case 1.18': {
    detail:
      'พยานได้รับ คบ.17 แล้ว แฟ้มอยู่ในกรอบอุทธรณ์ 30 วัน เจ้าหน้าที่เฝ้าดูจำนวนวันที่เหลือ หากมีอุทธรณ์ให้ส่งต่อแท็บ 09B หากไม่มีให้รอพ้นกำหนดก่อนปิดงาน',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText(/เหลือ \d+ วัน/).first(), 'อยู่ในกรอบอุทธรณ์ 30 วัน นับจากวันที่พยานได้รับจริง (WIT1145)', 2800)
      await d.highlight(p.getByRole('button', { name: /มีอุทธรณ์ภายในกำหนด/ }), 'ถ้ามีอุทธรณ์ภายในกำหนด กดที่นี่แล้วไปแท็บ 09B (WIT1147)', 2800)
      await d.highlight(p.getByRole('button', { name: /ไม่มีอุทธรณ์ \/ พ้นกำหนด/ }), 'ปุ่มปิดงานยังกดไม่ได้จนกว่าจะพ้นกำหนด 30 วัน (WIT1148)', 2800)
    },
  },
  'Case 1.19': {
    detail:
      'พ้นกรอบอุทธรณ์ 30 วันแล้วและไม่มีอุทธรณ์ เจ้าหน้าที่ปิดงานคุ้มครอง แฟ้มเปลี่ยนเป็นยุติและเอกสารถูกล็อก',
    run: async (d) => {
      const p = d.page
      await d.highlight(p.getByText(/พ้นกำหนดแล้ว/).first(), 'พ้นกรอบอุทธรณ์ 30 วันแล้ว ไม่มีอุทธรณ์ (WIT1146)', 2400)
      await d.click(p.getByRole('button', { name: /ไม่มีอุทธรณ์ \/ พ้นกำหนด/ }), { note: 'ปิดงานคุ้มครอง (WIT1148)' })
      await d.highlight(p.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/), 'แฟ้มเป็นสถานะ "ยุติ" เอกสารถูกล็อก — จบกระบวนการ', 3000)
    },
  },
}
void DOSSIER; void TERM
