import type { Page } from '@playwright/test'
import type { Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'

const areaInput = (page: Page, label: string) =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** เปิด คบ.6 → กรอกความเห็นตามข้อ → ลงนาม (WIT0507) แล้วกลับหน้าแฟ้ม */
async function signKb6(d: Director, label: string, opinion: string, signer: string) {
  const p = d.page
  await d.click(p.getByText('ไปลงนามในแบบ คบ.6'), { note: 'กด "ไปลงนามในแบบ คบ.6"', after: 1500 })
  const area = areaInput(p, label)
  await d.scrollTo(area)
  // ถ้ามีความเห็นตั้งต้นในร่างอยู่แล้วช่องจะแก้ไม่ได้/ไม่ต้องกรอก — ชี้ให้ดูแทน
  if (await area.isEditable() && !(await area.inputValue())) await d.fill(area, opinion, { note: `บันทึกความเห็น ${label.split('.')[0]}` })
  else await d.highlight(area, `ความเห็นข้อ ${label.split('.')[0]} ในร่าง คบ.6`, 2200)
  await d.click(p.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม"', after: 1000 })
  const nameInput = p.getByTestId('signature-name-input')
  if (!(await nameInput.inputValue())) await d.fill(nameInput, signer, { note: 'ชื่อผู้ลงนาม' })
  await d.click(p.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองความเห็น', after: 500 })
  await d.click(p.getByTestId('signature-confirm-button'), { note: 'ยืนยันลายมือชื่อ', after: 1500 })
  await d.goto(`/dossier/${CASE_NO}`)
}

export default {
  id: 'kb1-intake',
  steps: {
    'Case 2': {
      detail:
        'แฟ้มนี้รับเข้ามาเป็น คบ.1 ตั้งแต่ต้น งานที่เหลือคือ คบ.3/คบ.6 ผู้บังคับบัญชาชั้นต้นตรวจชุดเสนอ ลงความเห็นข้อ 10 แล้วเสนอ ผอ.',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ประเภทแบบ:').first(), 'รับเรื่องด้วย คบ.1 ตั้งแต่ต้น (WIT0313)', 2200)
        await d.highlight(p.getByTestId('dossier-forms'), 'ชุดเสนอ: คบ.1 + คบ.3/ข้าม คบ.3 + คบ.6', 2600)
        await d.highlight(p.getByText('ผลการประเมิน:').first(), 'ผลประเมินความเร่งด่วนจากเจ้าหน้าที่: กรณีปกติ', 2200)
        await signKb6(d, '10. ความเห็นผู้บังคับบัญชาชั้นต้น', 'เห็นควรเสนอ ผอ.สำนัก/กอง พิจารณา ข้อเท็จจริงครบถ้วนตาม คบ.1', 'นายกิตติศักดิ์ ธรรมรักษ์')
        await d.highlight(p.getByTestId('dossier-forms'), 'ลงนามความเห็นชั้นต้นเรียบร้อย', 1800)
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'เสนอ ผอ.สำนัก/กอง', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },

    'Case 2.1': {
      detail: 'ผอ.สำนัก/กอง ตรวจชุดเสนอ ลงความเห็นและลงนามข้อ 11 ใน คบ.6 แล้วส่งรองเลขาธิการฯ กลั่นกรองก่อนเสนอเลขาธิการฯ',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'แฟ้มอยู่ที่ ผอ.สำนัก/กอง รอพิจารณา', 2200)
        await d.highlight(p.getByTestId('dossier-forms'), 'ตรวจชุดเสนอ คบ.1 / คบ.3 / คบ.6', 2200)
        await signKb6(d, '11. ความเห็นผู้อำนวยการสำนัก', 'เห็นชอบตามที่ผู้บังคับบัญชาชั้นต้นเสนอ สมควรเสนอรองเลขาธิการฯ', 'นายวีระยุทธ พิทักษ์ธรรม')
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'ส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },

    'Case 2.2': {
      detail: 'รองเลขาธิการฯ กลั่นกรองความเห็น คบ.6 ข้อ 12 แล้วเสนอเลขาธิการ ป.ป.ท. เพื่อพิจารณา (แท็บ 07)',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'รอรองเลขาธิการฯ กลั่นกรอง', 2200)
        await signKb6(d, '12. ความเห็นรองเลขาธิการฯ', 'กลั่นกรองแล้ว เห็นควรเสนอเลขาธิการ ป.ป.ท. พิจารณาอนุมัติ', 'นายพิพัฒน์ ศรีสุวรรณ')
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'เสนอเลขาธิการ ป.ป.ท.', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
        await d.switchRole('secretary', 'เลขาธิการ ป.ป.ท. รับเรื่องเพื่อพิจารณา', 'แฟ้มเดินถึงเลขาธิการฯ แล้ว — ขั้นต่อไปคือการพิจารณาในแท็บ 07', `/dossier/${CASE_NO}`)
        await d.highlight(p.getByText('รอเสนอเลขาธิการ ป.ป.ท. พิจารณา').first(), 'แฟ้มรอเลขาธิการฯ พิจารณา', 2600)
      },
    },
  },
} satisfies ScenarioScript
