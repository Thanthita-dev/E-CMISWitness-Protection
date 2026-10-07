import type { Page } from '@playwright/test'
import type { Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string) =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** กด "ส่วนถัดไป" ของแบบฟอร์มหลายส่วนจนถึงส่วนท้ายที่มีปุ่มบันทึก */
async function goToLastSection(d: Director, save: ReturnType<Page['locator']>) {
  const next = d.page.getByRole('button', { name: 'ส่วนถัดไป' })
  for (let i = 0; i < 10 && !(await save.isVisible()); i++) {
    await d.click(next, { note: i === 0 ? 'กด "ส่วนถัดไป" ตรวจทีละส่วน' : undefined, after: 350 })
  }
}

export default {
  id: 'phone-intake',
  steps: {
    'Case 6': {
      detail:
        'ผู้แจ้งโทรศัพท์เข้ามา เจ้าหน้าที่รับเรื่องด้วยแบบ คบ.2 กลั่นกรองความเร่งด่วนไว้แล้ว แต่ค้นเลขสำนวนหลักไม่พบ จึงบันทึกเหตุผลและส่งให้ ผอ. มอบหมายต่อ — ห้ามปัดตกคำร้อง',
      run: async (d) => {
        const p = d.page
        // WIT0205/0210: แฟ้มเกิดจากการรับแจ้งทางโทรศัพท์ (คบ.2) — ขั้นตอนนอกระบบ/ระบบสร้างให้อัตโนมัติ
        await d.highlight(p.getByText('ประเภทแบบ:').first(), 'รับเรื่องด้วย คบ.2 (แจ้งทางโทรศัพท์)', 2200)
        await d.highlight(p.getByText('ความเร่งด่วน:').first(), 'กลั่นกรองแล้ว: กรณีปกติ (WIT0207-0208)', 2200)
        await d.highlight(formRow(p, 'คบ.2'), 'แบบ คบ.2 บันทึกการรับแจ้งทางโทรศัพท์', 2200)
        await d.highlight(p.getByText('บันทึกรับแจ้งทางโทรศัพท์').first(), 'ไฟล์บันทึกสายโทรศัพท์แนบในแฟ้ม', 2000)
        await d.highlight(
          p.getByText('รับแจ้งทางโทรศัพท์ (คบ.2) — รอพยานเข้ามาลงนามยินยอมใน คบ.1'),
          'งานค้าง: ต้องให้พยานลงนามยินยอมใน คบ.1',
          2400
        )

        // ค้นเลขสำนวนหลักไม่พบ → ไม่ปัดตก ต้องบันทึกเหตุผล (WIT0212–0215)
        await d.scrollTo(p.getByText('คดีหลักและการประเมินภัย (Main Case Linkage)'))
        await d.highlight(p.getByPlaceholder(/เช่น กบค\. 001\/2569/), 'ค้นเลขสำนวน กบค. แล้วแต่ไม่พบคดีที่เกี่ยวข้อง', 2200)
        await d.select(p.getByTestId('main-case-not-found-reason-select'), 'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5', {
          note: 'เลือกเหตุผลที่เชื่อมโยงไม่ได้ (บังคับ)',
        })
        await d.click(p.getByTestId('main-case-not-found-button'), { note: 'กด "ค้นไม่พบ" ระบุสถานะ ไม่พบคดี', after: 600 })
        await d.confirm('ยืนยันไม่พบคดี', 'ยืนยัน — ระบบบอกชัดว่า "ห้ามปัดตก" ให้รับเรื่องต่อ')
        await d.highlight(p.getByTestId('main-case-not-found-reason'), 'บันทึกเหตุผลลงแฟ้มแล้ว ติดตามเชื่อมโยงภายหลังได้', 2600)

        // ส่งต่อ ผอ.
        await d.scrollTo(p.getByTestId('forward-case-button'))
        await d.click(p.getByTestId('forward-case-button'), { note: 'ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },

    'Case 6.1': {
      detail:
        'ผอ.สำนัก/กอง เห็นแฟ้มที่ยังไม่มีเลขสำนวนหลัก ระเบียบให้มอบหมายเจ้าของสำนวนต่อได้ตามปกติ แล้วติดตามเชื่อมโยงคดีหลักภายหลัง',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ยังไม่ได้เชื่อมโยงเลขสำนวนหลัก — คำร้องยังเดินต่อตามปกติ'), 'ไม่มีเลขสำนวนหลัก แต่คำร้องยังเดินต่อ', 2600)
        await d.highlight(p.getByTestId('main-case-not-found-reason'), 'เหตุผลที่เจ้าหน้าที่บันทึกไว้', 2600)
        const assignCard = p.locator('section', { hasText: 'มอบหมายและจัดสรรผู้รับผิดชอบ' })
        await d.scrollTo(assignCard.getByRole('combobox'))
        await d.select(assignCard.getByRole('combobox'), 'OFF-001', { note: 'เลือกเจ้าหน้าที่เจ้าของสำนวน' })
        await d.click(p.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }), { note: 'กด "มอบหมายเจ้าของสำนวน" (WIT0304-0305)', after: 1200 })
        await d.highlight(p.getByText(/มอบหมายแล้ว:/).first(), 'ระบบบันทึกผู้รับผิดชอบ ผู้มอบหมาย วันเวลาอัตโนมัติ', 2600)
        await d.click(p.getByTestId('forward-case-button'), { note: 'ส่งเจ้าของสำนวนที่ได้รับมอบหมาย (WIT0306 แจ้งเตือน)', after: 600 })
        await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
      },
    },

    'Case 6.2': {
      detail:
        'เจ้าหน้าที่รับงาน เปิดแบบ คบ.1 ซึ่งดึงข้อมูลจาก คบ.2 มาให้แล้ว ตรวจและบันทึก จากนั้นให้พยานลงนามยินยอมก่อนจึงส่งต่อได้',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('ผู้รับผิดชอบงานคุ้มครองพยาน:').first(), 'เจ้าหน้าที่ผู้ได้รับมอบหมายเปิดแฟ้ม (WIT0307)', 2200)
        await d.highlight(p.getByTestId('dossier-forms'), 'ระบบแจ้งว่าต้องจัดทำ คบ.1 ต่อจาก คบ.2 (WIT0311-0312)', 2600)
        await d.click(formRow(p, 'คบ.1').getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.1', after: 1500 })

        // ข้อมูลจาก คบ.2 ถูกยกมาเป็นค่าตั้งต้น
        const name = p.locator('label:text-is("ชื่อ")').locator('xpath=following-sibling::input[1]')
        await d.highlight(name, 'ข้อมูลจาก คบ.2 ถูกยกมาให้อัตโนมัติ (WIT0404)', 2400)
        const save = p.getByRole('button', { name: 'บันทึกแบบ คบ.1' })
        await goToLastSection(d, save)
        await d.click(save, { note: 'ตรวจข้อมูลแล้วกด "บันทึกแบบ คบ.1"', after: 1500 })
        if (!/\/dossier\//.test(p.url())) await d.goto(`/dossier/${CASE_NO}`)

        // WIT0406: ปุ่มส่งต่อล็อกจนกว่าพยานจะลงนามยินยอม
        const forward = p.getByTestId('forward-case-button')
        await d.scrollTo(forward)
        await d.highlight(p.getByText('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1').first(), 'ส่งต่อไม่ได้ — พยานยังไม่ลงนามยินยอม', 2600)
        // เจ้าหน้าที่ส่งลิงก์ — ผู้ขอคุ้มครองลงชื่อเองในหน้าลิงก์ (Prototype: ไม่ส่งข้อความจริง)
        const panel = p.getByTestId('applicant-consent-panel').first()
        await d.click(panel.getByTestId('consent-send-button'), { note: 'กด "ส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อ" (WIT0406)', after: 900 })
        await d.click(p.getByRole('radio', { name: 'สแกน QR Code' }), { note: 'เลือกช่องทาง "สแกน QR Code"', after: 500 })
        await d.click(p.getByTestId('consent-send-next'), { note: 'ตรวจทานผู้รับ ช่องทาง และวันหมดอายุ', after: 1500 })
        await d.click(p.getByTestId('consent-send-confirm'), { note: 'ยืนยันส่งลิงก์', after: 1200 })
        await d.highlight(panel.getByTestId('consent-qr'), 'ผู้ขอคุ้มครองสแกน QR Code เพื่อเปิดหน้าลงชื่อ', 2200)
        const link = await panel.getByTestId('consent-link-input').inputValue()
        await d.goto(link.replace(/^https?:\/\/[^/]+/, ''))
        for (let i = 0; i < 3; i++) await d.click(p.getByTestId('consent-next-page'), { note: i === 0 ? 'อ่านเอกสาร คบ.1 ให้ครบทุกหน้า' : undefined, after: 500 })
        const canvas = p.locator('canvas').first()
        await canvas.scrollIntoViewIfNeeded()
        const box = await canvas.boundingBox()
        if (box) {
          await p.mouse.move(box.x + 30, box.y + box.height / 2)
          await p.mouse.down()
          for (let i = 1; i <= 8; i++) await p.mouse.move(box.x + 30 + i * 25, box.y + box.height / 2 + (i % 2 ? -20 : 20))
          await p.mouse.up()
        }
        await d.click(p.getByTestId('consent-ack-checkbox'), { note: 'รับรองว่าอ่านเอกสารครบและข้อมูลถูกต้อง', after: 600 })
        await d.click(p.getByTestId('consent-sign-button'), { note: 'วาดลายมือชื่อแล้วกดยืนยัน', after: 1500 })
        await d.highlight(p.getByTestId('consent-signed'), 'ลงชื่อสำเร็จ — เจ้าหน้าที่ได้รับข้อมูลแล้ว', 2200)
        await d.goto(`/dossier/${CASE_NO}`)
        await d.highlight(p.getByText('ลายมือชื่อยินยอมในแบบ คบ.1 ครบถ้วน').first(), 'ลงนามยินยอมครบถ้วน — ปลดล็อกการส่งต่อ', 2600)
      },
    },
  },
} satisfies ScenarioScript
