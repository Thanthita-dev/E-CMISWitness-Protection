import type { Page } from '@playwright/test'
import type { Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'

const formRow = (page: Page, code: string) =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

const fieldInput = (page: Page, label: string) =>
  page.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::input[1]')
const areaInput = (page: Page, label: string) =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

export default {
  id: 'kb3-prepared',
  steps: {
    'Case 1.3': {
      detail:
        'เจ้าหน้าที่ผู้รับผิดชอบประเมินความเร่งด่วนเป็นกรณีปกติ แล้วเลือก "ไม่ข้าม" คบ.3 โดยจัดทำบันทึกข้อเท็จจริง คบ.3 และ คบ.6 ให้ครบชุดเสนอ',
      run: async (d) => {
        const p = d.page
        // เจ้าของสำนวนต้องเชื่อมโยงคดีหลักก่อนจึงส่งต่อได้ (ถ้ายังไม่เชื่อมโยง)
        const linkBtn = p.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })
        if (await linkBtn.count()) {
          await d.scrollTo(linkBtn)
          await d.click(linkBtn, { note: 'เจ้าของสำนวนกด "ยืนยันเชื่อมโยงคดี" (คดีหลักต้องเชื่อมโยงก่อนส่งต่อ)', after: 1200 })
        }
        await d.highlight(p.getByTestId('dossier-forms'), 'แบบ คบ.1 อยู่ในแฟ้ม และมีแถว คบ.3 ให้เลือกทำหรือข้าม (WIT0407)', 2600)
        await d.highlight(p.getByRole('button', { name: 'กดข้าม คบ.3 (ระบุเหตุผล)' }), 'ทางเลือก: ข้าม คบ.3 ได้ — แต่คลิปนี้เลือกจัดทำ', 2400)

        // WIT0310 ประเมินความเร่งด่วน → กรณีปกติ
        await d.click(p.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }), { note: 'ประเมินความเร่งด่วน: กรณีปกติ (WIT0310)', after: 1200 })

        // WIT0408 จัดทำ คบ.3
        await d.click(formRow(p, 'คบ.3').getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.3 (ไม่ข้าม)', after: 1500 })
        await d.highlight(p.getByText('ฉบับที่ 1').first(), 'คบ.3 ฉบับที่ 1', 1600)
        await d.fill(fieldInput(p, 'เขียนที่'), 'สำนักงาน ป.ป.ท. ส่วนกลาง', { note: 'กรอกสถานที่เขียน' })
        await d.fill(
          areaInput(p, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ'),
          'ถูกข่มขู่ทางโทรศัพท์และมีผู้ไม่ทราบชื่อมาติดตามที่พักหลังให้ถ้อยคำเป็นพยาน',
          { note: 'บันทึกข้อเท็จจริงและพฤติการณ์ไม่ปลอดภัย' }
        )
        const save3 = p.getByRole('button', { name: 'บันทึกแบบ คบ.3' })
        await d.scrollTo(save3)
        await d.click(save3, { note: 'กด "บันทึกแบบ คบ.3"', after: 1500 })
        if (!/\/dossier\//.test(p.url())) await d.goto(`/dossier/${CASE_NO}`)

        // WIT0411 จัดทำ คบ.6
        await d.click(formRow(p, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6 บันทึกเสนอความเห็น', after: 1500 })
        await d.fill(fieldInput(p, '1.1 ได้รับคำร้อง'), 'นางสาวกมลชนก บุญรักษา', { note: 'กรอกช่องบังคับ 1.1' })
        await d.fill(fieldInput(p, '2.2 ชื่อ-สกุล พยาน'), 'นางสาวกมลชนก บุญรักษา', { note: 'กรอกช่องบังคับ 2.2' })
        const save6 = p.getByRole('button', { name: 'บันทึกแบบ คบ.6' })
        await d.scrollTo(save6)
        await d.click(save6, { note: 'กด "บันทึกแบบ คบ.6" แล้วกลับแฟ้ม', after: 1800 })

        // ชุดเสนอครบ → ส่ง ผบช.ชั้นต้น
        await d.highlight(p.getByTestId('dossier-forms'), 'ชุดเสนอครบ: คบ.1 + คบ.3 + คบ.6', 2400)
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'ส่งผู้บังคับบัญชาชั้นต้น (WIT0502)', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },

    'Case 6.3': {
      detail:
        'ผู้บังคับบัญชาชั้นต้นตรวจชุดเสนอที่มี คบ.1 + คบ.3 + คบ.6 ครบ แล้วลงความเห็นข้อ 10 ใน คบ.6 และเสนอ ผอ.สำนัก/กอง ต่อ',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('dossier-forms'), 'ชุดเสนอมีทั้ง คบ.1, คบ.3 และ คบ.6', 2600)
        await d.click(formRow(p, 'คบ.3').getByText('ดูเอกสาร'), { note: 'เปิดดู คบ.3 ที่เจ้าหน้าที่จัดทำ', after: 2500 })
        await d.goto(`/dossier/${CASE_NO}`)

        await d.click(p.getByText('ไปลงนามในแบบ คบ.6'), { note: 'ไปลงนามความเห็นใน คบ.6', after: 1500 })
        const opinion = areaInput(p, '10. ความเห็นผู้บังคับบัญชาชั้นต้น')
        await d.fill(opinion, 'เห็นควรเสนอ ผอ.สำนัก/กอง พิจารณา เนื่องจากข้อเท็จจริงใน คบ.3 สอดคล้องกับ คบ.1', { note: 'บันทึกความเห็นข้อ 10' })
        await d.click(p.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม"', after: 1000 })
        const nameInput = p.getByTestId('signature-name-input')
        if (!(await nameInput.inputValue())) await d.fill(nameInput, 'นายกิตติศักดิ์ ธรรมรักษ์', { note: 'ชื่อผู้ลงนาม' })
        await d.click(p.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรอง', after: 500 })
        await d.click(p.getByTestId('signature-confirm-button'), { note: 'ยืนยันลายมือชื่อ', after: 1500 })

        await d.goto(`/dossier/${CASE_NO}`)
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'เสนอ ผอ.สำนัก/กอง', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },
  },
} satisfies ScenarioScript
