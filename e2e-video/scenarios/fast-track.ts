import type { Page } from '@playwright/test'
import type { Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'
const DOSSIER = `/dossier/${CASE_NO}`
const DIRECTOR = 'นายวีระยุทธ พิทักษ์ธรรม'
const WITNESS = 'สมชาย ใจดี'

export default {
  id: 'fast-track',
  steps: {
    'Case 3': {
      detail:
        'แฟ้มเร่งด่วนเข้ามาที่เจ้าหน้าที่ผู้รับผิดชอบ ให้จัดทำ คบ.4 พร้อมร่าง คบ.5 เลือกวิธีคุ้มครองตามข้อ 15 แล้วส่งตรงให้ ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น',
      run: async (d) => {
        const p = d.page
        // WIT0601/0602 — การ์ด Fast Track สีแดง และข้อมูลจากแท็บ 04
        await d.highlight(p.getByTestId('fast-track-card'), 'การ์ดเส้นทางเร่งด่วน (Fast Track) — WIT0601', 2500)
        await d.highlight(p.getByTestId('fast-track-methods'), 'ยังไม่ได้เลือกวิธีตามข้อ 15 จึงยังส่ง ผอ. ไม่ได้', 2200)
        await d.highlight(p.getByTestId('fast-track-submit-button'), 'ปุ่มส่งถูกล็อกไว้จนกว่าจะเลือกวิธี', 1800)

        // WIT0603 — เปิดแบบ คบ.4 ติ๊กวิธีตามข้อ 15 (เลือกได้หลายวิธี)
        await d.goto(`/form/4?caseNo=${CASE_NO}`)
        const opt1 = p.getByTestId('kb4-method-option-1')
        await d.highlight(opt1, 'แบบ คบ.4 ข้อ 4.2 — เลือกวิธีคุ้มครองตามข้อ 15 ได้มากกว่า 1 วิธี', 2000)
        await d.click(opt1, { note: 'วิธีที่ 1 จัดเจ้าพนักงานเป็นชุดคุ้มครอง' })
        await d.click(p.getByTestId('kb4-method-option-3'), { note: 'วิธีที่ 3 ปกปิดและรักษาความลับ' })
        await d.pause(800)

        // กลับแฟ้ม — วิธีที่ติ๊กผูกกับแฟ้มจริง
        await d.goto(DOSSIER)
        await d.highlight(p.getByTestId('fast-track-methods'), 'วิธีที่เลือกใน คบ.4 มาแสดงในการ์ดแล้ว', 2200)
        await d.fill(p.getByTestId('fast-track-duration-days'), '30', {
          note: 'ระยะเวลาคุ้มครองชั่วคราวในร่าง คบ.5 (ไม่เกิน 180 วัน)',
        })
        await d.fill(p.getByTestId('fast-track-submit-note'), 'จัดทำ คบ.4 และร่างคำสั่ง คบ.5 พร้อมหลักฐานภัยคุกคามครบถ้วนแล้ว ขอให้พิจารณาคุ้มครองชั่วคราวโดยด่วน', {
          note: 'ความเห็นประกอบการส่ง ผอ.',
        })

        // WIT0604 — ส่งตรง ผอ.
        await d.click(p.getByTestId('fast-track-submit-button'), { note: 'ส่งตรง ผอ. (ไม่ผ่าน ผบช.ชั้นต้น)' })
        await d.confirm('ยืนยันส่งตรง ผอ.', 'ยืนยันส่งตรงถึง ผอ.')
        await d.highlight(p.getByTestId('fast-track-card'), 'เสนอ ผอ. พิจารณาแล้ว (WIT0604 → WIT0605)', 2500)
      },
    },
    'Case 3.1': {
      detail:
        'ผอ.สำนัก/กอง ได้รับเรื่องเร่งด่วนโดยตรง ตรวจ คบ.4 ร่าง คบ.5 และหลักฐาน ยืนยันว่าข้อมูลครบ แล้วอนุมัติ บันทึกความเห็น และลงนาม คบ.5',
      run: async (d) => {
        const p = d.page
        // WIT0605 — รายการตรวจ
        await d.highlight(p.getByTestId('fast-track-methods'), 'วิธีที่เสนอ: วิธีที่ 1 และ 3', 1800)
        await d.highlight(p.getByTestId('fast-track-review-list'), 'WIT0605 — รายการที่ ผอ. ต้องตรวจก่อนพิจารณา', 3000)

        // WIT0606 — ประตูข้อมูลครบ
        await d.click(p.getByTestId('fast-track-ready-button'), { note: 'WIT0606 ข้อมูลครบ — พร้อมพิจารณา' })
        await d.confirm('ยืนยันข้อมูลครบ', 'ยืนยันว่าข้อมูลครบ')

        // WIT0609 — อนุมัติ
        await d.highlight(p.getByTestId('fast-track-decision-panel'), 'WIT0609 แผงตัดสิน: อนุมัติ หรือไม่อนุมัติ', 2000)
        await d.click(p.getByTestId('fast-track-approve-button'), { note: 'อนุมัติและลงนาม คบ.5' })

        // WIT0611 — เลขคำสั่ง ความเห็น ลงนาม
        await d.fill(p.getByTestId('kb5-order-no'), '047/2569', { note: 'เลขที่คำสั่ง คบ.5' })
        await d.fill(p.getByTestId('kb5-director-opinion'), 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ ภัยคุกคามเฉพาะหน้ามีน้ำหนัก', {
          note: 'ความเห็นของ ผอ. (ข้อ 13 ใน คบ.4)',
        })
        await d.click(p.getByTestId('kb5-sign-button'), { note: 'ลงลายมือชื่อ คบ.5' })
        await d.sign(DIRECTOR)
        await d.click(p.getByTestId('fast-track-approve-confirm'), { note: 'ยืนยันอนุมัติและออกคำสั่ง' })
        await d.confirm('ยืนยันอนุมัติและออกคำสั่ง', 'ฉบับลงนามจะถูกล็อก แก้ทับไม่ได้')
        await d.highlight(p.getByTestId('fast-track-ack-panel'), 'อนุมัติแล้ว — คบ.5 ถูกล็อก รอพยานลงนามยินยอม', 3000)
      },
    },
    'Case 3.2': {
      detail:
        'ผอ. ลงนาม คบ.5 แล้ว เจ้าหน้าที่นำคำสั่งให้พยานรับทราบ และให้พยานลงนามยินยอมรับการคุ้มครองชั่วคราว (ใช้แทน คบ.11 ของเส้นทางปกติ)',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('fast-track-ack-panel'), 'คำสั่ง คบ.5 เลขที่ 047/2569 ลงนามโดย ผอ. และถูกล็อกแล้ว', 3000)
        await d.click(p.getByTestId('kb5-witness-ack-button'), { note: 'WIT0612 พยานลงนามยินยอม' })
        await d.sign(WITNESS)
        await d.highlight(
          p.getByText('คำสั่ง คบ.5 พร้อมดำเนินการ (WIT0613)'),
          'WIT0613 ระบบส่งวิธีที่อนุมัติไปเปิดเส้นทางที่แท็บ 08',
          3000
        )
        const notice = p.getByTestId('fast-track-main-petition-notice')
        if (await notice.count()) await d.highlight(notice, 'WIT0614 คำร้องหลักยังเดินต่อควบคู่กัน', 2500)
      },
    },
    'Case 3.3': {
      detail:
        'คุ้มครองชั่วคราวมีผลแล้ว เจ้าหน้าที่เปิดหน้าวิธีคุ้มครองตามข้อ 15 เพื่อเริ่มปฏิบัติตามวิธีที่ ผอ. อนุมัติใน คบ.5 โดยไม่ต้องรอ คบ.9 / คบ.11',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('คำสั่ง คบ.5 พร้อมดำเนินการ (WIT0613)'), 'ความยินยอมอ้างอิง คบ.5 — ไม่ต้องรอ คบ.9/คบ.11', 2500)
        await d.goto('/protection-methods')
        await d.pause(800)
        await d.highlight(p.getByText('ความยินยอมตาม คบ.5').first(), 'WIT0802/0803 กรณีเร่งด่วน ใช้ความยินยอมใน คบ.5', 2500)
        await d.highlight(p.getByText('จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย').first(), 'วิธีที่ 1 เปิดเส้นทางปฏิบัติให้แล้ว (WIT0813)', 2500)
        await d.click(p.getByText('วิธีที่ 1 — จัดชุดคุ้มครองและเริ่มปฏิบัติ').first(), { note: 'เข้าหน้าปฏิบัติวิธีที่ 1 (WIT0814)' })
        await d.pause(1200)
        await d.highlight(p.locator('main').first(), 'WIT0815 ระบบแยกเอง: มี คบ.5 อนุมัติ = คำสั่งชั่วคราว', 2500)
        await d.click(p.getByRole('button', { name: 'ถัดไป' }), { note: 'ไปขั้นชี้แจงภารกิจ (WIT0819 → WIT0820)' })
        const start = p.getByTestId('method-1-start')
        await start.waitFor()
        await d.highlight(start, 'WIT0816 เริ่มคุ้มครองชั่วคราวตาม คบ.5 ได้ทันที ไม่ต้องรอ คบ.8', 3000)
        await d.highlight(p.locator('main').first(), 'ต่อที่แท็บ 08A-1 และติดตามที่แท็บ 10', 2000)
      },
    },
  },
} satisfies ScenarioScript
