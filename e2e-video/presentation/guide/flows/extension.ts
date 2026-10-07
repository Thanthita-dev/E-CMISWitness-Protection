import type { UserRole } from '../../../../src/types/user'
import type { GuideDirector } from '../guide-director'
import type { GuideFlow } from '../types'
import { GUIDE_CASE_NO } from '../types'
import common from './common'
import { approveToOperation } from './main-approve'
import { reportRound } from './main-close'

/**
 * ทางแยก: ทบทวนผลคุ้มครองแล้วเห็นควร "ขยายระยะเวลา" (Case 1.14 → คบ.14)
 * prefix: ช่วงร่วม → อนุมัติ/เริ่มคุ้มครอง → รายงาน คบ.13 แล้วส่งเข้าทบทวน (ไม่ถ่ายภาพ)
 * ระบบไม่บังคับให้ใกล้ครบกำหนดก่อนขยาย (วันเริ่มขยายตั้งต้นต่อจากวันสิ้นสุดคำสั่งเดิม) จึงไม่ต้องข้ามเวลา
 */

/** สลับบทบาท และเปิดหัวข้อใหม่เสมอ (switchRole เปิดหัวข้อให้เฉพาะตอนบทบาทเปลี่ยน) */
async function asRole(d: GuideDirector, role: UserRole, label: string, detail: string, path: string) {
  const same = d.currentRole === role
  await d.switchRole(role, label, detail, path)
  if (same) d.section(label, detail)
}

export default {
  id: 'extension',
  title: 'ทางแยก: ทบทวนแล้วขยายระยะเวลาคุ้มครอง (คบ.14)',
  summary:
    'เมื่อทบทวนผลคุ้มครองแล้วพบว่าภัยยังไม่คลี่คลาย เจ้าหน้าที่เสนอขยายระยะเวลา จัดทำ คบ.14 ผ่านผู้บังคับบัญชา แล้วเลขาธิการฯ อนุมัติ ระบบเพิ่มช่วงคุ้มครองใหม่ต่อจากเดิม โดยยอดสะสมต้องไม่เกินเพดาน 180 วัน',
  branchSection: 'ทบทวนผลคุ้มครองและเสนอยุติ',
  prefix: async (d) => {
    await common.run(d)
    await approveToOperation(d)
    await reportRound(d, GUIDE_CASE_NO, 'ใกล้ครบกำหนดคุ้มครองแต่ยังมีภัยคุกคามต่อเนื่อง')
  },
  run: async (d) => {
    const p = d.page
    const REVIEW = `/protection-review/${GUIDE_CASE_NO}`
    const EXT = `/protection-extension/${GUIDE_CASE_NO}`

    // ───────── ทบทวน → เสนอขยายเวลา ─────────
    await asRole(d, 'officer', 'ทบทวนผลคุ้มครองและเสนอขยายเวลา', 'เจ้าหน้าที่ทบทวนผลการคุ้มครอง ดูยอดวันสะสมเทียบเพดาน 180 วัน แล้วเสนอแนวทาง "ขยายระยะเวลา"', REVIEW)
    await d.highlight(p.getByTestId('review-outcome-extend'), 'ขยายเวลาทำได้เมื่อยังไม่ถึงเพดานรวม 180 วัน')
    await d.click(p.getByTestId('review-outcome-extend'), { note: 'เลือกแนวทาง "ขยายระยะเวลา"' })
    await d.fill(p.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }), 'ภัยคุกคามยังไม่คลี่คลาย ต้องคุ้มครองต่อเนื่องเกินกำหนดคำสั่งเดิม', { note: 'ประเมินความเสี่ยงและความจำเป็น' })
    await d.fill(p.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย'), 'อ้างอิง คบ.13 งวดล่าสุด และคำสั่งคุ้มครองเดิม ขอขยายเวลาอีก 30 วัน', { note: 'เหตุผลและหลักฐานอ้างอิง' })
    await d.click(p.getByTestId('review-submit-proposal'), { note: 'เสนอผลทบทวน' })
    await d.confirm('ยืนยันเสนอผลทบทวน')

    await d.switchRole('supervisor', 'ผู้บังคับบัญชาเห็นชอบข้อเสนอ', 'ผู้บังคับบัญชาชั้นต้นตรวจข้อเสนอผลทบทวน แล้วเห็นชอบหรือส่งคืนแก้ไข', REVIEW)
    await d.fill(p.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน'), 'เห็นชอบให้ขยายเวลา', { note: 'ความเห็นผู้บังคับบัญชา' })
    await d.click(p.getByTestId('review-endorse'), { note: 'เห็นชอบข้อเสนอ' })
    await d.confirm('ยืนยันเห็นชอบ')

    await d.switchRole('officer', 'เจ้าหน้าที่ส่งงานไปจัดทำ คบ.14', 'เมื่อได้รับความเห็นชอบ เจ้าหน้าที่ดำเนินการตามแนวทางที่เลือก แล้วไปหน้าขยายเวลา', REVIEW)
    await d.click(p.getByTestId('review-apply-outcome'), { note: 'ดำเนินการตามแนวทางที่เห็นชอบ' })
    await d.confirm('ยืนยันดำเนินการ')
    await d.click(p.getByTestId('review-goto-11b'), { note: 'ไปหน้าขยายเวลา (คบ.14)' })

    // ───────── จัดทำ คบ.14 ─────────
    d.section('จัดทำ คบ.14 ขอขยายเวลา', 'เจ้าหน้าที่ระบุเหตุผลและช่วงที่ขอขยาย ระบบเริ่มนับต่อจากวันสิ้นสุดคำสั่งเดิม และตรวจยอดสะสมไม่ให้เกินเพดาน 180 วัน')
    await d.highlight(p.getByText('สะสม / คงเหลือ', { exact: true }), 'ดูคำสั่งปัจจุบัน และยอดวันสะสม/คงเหลือเทียบเพดาน 180 วัน')
    await d.fill(p.getByPlaceholder('เหตุผลความจำเป็นในการขยายระยะเวลา และภัยที่ยังคงอยู่'), 'ยังพบการเฝ้าติดตามพยานใกล้ที่พักอาศัย ความเสี่ยงยังไม่ลดลง และคดีหลักยังอยู่ระหว่างไต่สวน', { note: 'เหตุผลความจำเป็นในการขยาย' })
    await d.highlight(p.getByText('ระยะเวลาที่ขอ', { exact: true }), 'ช่วงที่ขอ 30 วัน รวมสะสมต้องไม่เกินเพดาน')
    await d.click(p.getByRole('button', { name: 'จัดทำ คบ.14 และส่งตรวจ' }), { note: 'จัดทำ คบ.14 และส่งตรวจ' })
    await d.result(p.locator('strong', { hasText: 'คบ.14 ฉบับที่ 1' }), 'ส่ง คบ.14 ให้ผู้ตรวจแล้ว')

    // ───────── ผู้บังคับบัญชาตรวจ ─────────
    await asRole(d, 'supervisor', 'ผู้บังคับบัญชาตรวจ คบ.14', 'ตรวจเหตุผล หลักฐาน ช่วงวันที่ และเพดานวันสะสม ถ้าครบถ้วนเสนอผู้มีอำนาจ ถ้าไม่ครบส่งคืนแก้ไข', EXT)
    await d.highlight(p.getByRole('button', { name: 'ส่งคืนแก้ไข' }), 'ถ้าเอกสารไม่ครบ ใส่เหตุผลแล้วส่งคืนแก้ไข')
    await d.click(p.getByRole('button', { name: 'ครบถ้วน · เสนอตามลำดับชั้น' }), { note: 'คบ.14 ครบถ้วน เสนอตามลำดับชั้น' })
    await d.confirm('ยืนยันครบถ้วน')
    await d.result(p.getByText(/รอผู้มีอำนาจอนุมัติ/).first(), 'เรื่องรอผู้มีอำนาจอนุมัติ')

    // ───────── เลขาธิการฯ อนุมัติ ─────────
    await asRole(d, 'secretary', 'เลขาธิการฯ อนุมัติขยายเวลา', 'ผู้มีอำนาจพิจารณา คบ.14 ถ้าอนุมัติ ระบบเพิ่มช่วงคุ้มครองใหม่ต่อจากเดิมโดยไม่แก้ทับช่วงเดิม ถ้าไม่อนุมัติ คงคำสั่งเดิมถึงวันสิ้นสุด', EXT)
    await d.fill(p.getByPlaceholder('ความเห็นประกอบคำสั่ง'), 'อนุมัติให้ขยายเวลาตามที่เสนอ', { note: 'ความเห็นของผู้มีอำนาจ' })
    await d.highlight(p.getByRole('button', { name: 'ไม่อนุมัติ' }), 'ถ้าไม่อนุมัติ คงคำสั่งเดิมถึงวันสิ้นสุด')
    await d.click(p.getByRole('button', { name: 'อนุมัติขยายเวลา' }), { note: 'อนุมัติขยายเวลา' })
    await d.confirm('ยืนยันอนุมัติ')

    // ───────── ผลลัพธ์ ─────────
    d.section('ผลการอนุมัติ: ช่วงคุ้มครองใหม่', 'คบ.14 ถูกล็อกเป็นฉบับลงนาม ระบบเพิ่มช่วงคุ้มครองใหม่และคำนวณยอดสะสมเทียบเพดาน 180 วัน')
    await d.highlight(p.getByText('สะสม / คงเหลือ', { exact: true }), 'วันสิ้นสุดตามคำสั่งเลื่อนเป็นวันใหม่ ยอดสะสมนับตามวันที่คุ้มครองจริง เทียบเพดาน 180 วัน')
    await d.result(p.getByText(/อนุมัติขยายเวลา 30 วันแล้ว/).first(), 'อนุมัติแล้ว — เพิ่มช่วงคุ้มครองใหม่ 30 วัน')

    d.section('กลับเข้าเส้นทางหลัก', 'คุ้มครองต่อในช่วงใหม่ แล้วรายงานผลและทบทวนตามรอบเดิม')
    await d.click(p.getByRole('link', { name: /กลับไปรายงานผลการคุ้มครอง/ }), { note: 'กลับไปรายงานผลการคุ้มครอง กำหนดรอบ คบ.13 ถัดไป' })
    await d.result(p.getByRole('heading').first(), 'กลับสู่หน้าติดตามผล คุ้มครองต่อในช่วงใหม่')
  },
} satisfies GuideFlow
