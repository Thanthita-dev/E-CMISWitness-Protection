import type { Page } from '@playwright/test'
import type { Director } from '../director'
import type { ScenarioScript } from '../types'

const CASE_NO = 'WP-2569-000501'
const DOSSIER = `/dossier/${CASE_NO}`

const formRow = (page: Page, code: string) =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** ส่งต่อจากการ์ดส่งงาน */
async function forward(d: Director, note: string) {
  const btn = d.page.getByTestId('forward-case-button')
  await d.scrollTo(btn)
  await d.click(btn, { note, after: 600 })
  await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อ')
}

/** เปิด คบ.6 → ระบบเปิดเป็นฉบับใหม่ → ดูประวัติเวอร์ชัน → แก้ไขแล้วบันทึก → กลับแฟ้ม (WIT0506/0511) */
async function reviseKb6(d: Director, showHistory: boolean) {
  const p = d.page
  await d.click(formRow(p, 'คบ.6').getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6 ที่ถูกส่งกลับ', after: 1500 })
  await d.highlight(p.getByText(/ฉบับที่ \d+/).first(), 'ระบบเปิดเป็นฉบับใหม่ — ฉบับเดิมเก็บไว้ในประวัติ', 2400)
  if (showHistory) {
    const toggle = p.getByTestId('form-revision-history-toggle')
    await d.click(toggle, { note: 'ดูประวัติเวอร์ชันพร้อมเหตุผลที่ถูกตีกลับ', after: 800 })
    await d.highlight(p.getByTestId('form-revision-item-1'), 'ฉบับเดิมพร้อมเหตุผลตีกลับ', 2600)
  }
  const f = (label: string) =>
    p.locator(`label:has-text("${label}")`).first().locator('xpath=following-sibling::input[1]')
  await d.fill(f('1.1 ได้รับคำร้อง'), 'นางสาวกมลชนก บุญรักษา', { note: 'แก้ไขข้อมูลตามข้อสั่งการ' })
  const save = p.getByRole('button', { name: 'บันทึกแบบ คบ.6' })
  await d.scrollTo(save)
  await d.click(save, { note: 'กด "บันทึกแบบ คบ.6"', after: 1800 })
  if (!/\/dossier\//.test(p.url())) await d.goto(DOSSIER)
}

/** ตีกลับแฟ้มจากปุ่ม "ส่งกลับแก้ไข / ตีกลับ" (WIT0505 / WIT0510) */
async function returnCase(d: Director, issue: string, text: string) {
  const p = d.page
  await d.click(p.getByTestId('return-case-button'), { note: 'กด "ส่งกลับแก้ไข / ตีกลับ"', after: 800 })
  await d.select(p.getByTestId('return-issue-select'), issue, { note: 'เลือกประเด็นที่ต้องแก้ไข' })
  await d.fill(p.getByTestId('return-note-input'), text, { note: 'พิมพ์รายละเอียดข้อสั่งการ' })
  await d.click(p.getByTestId('return-confirm-button'), { note: 'กด "ยืนยันส่งกลับแก้ไข"', after: 1800 })
}

export default {
  id: 'returns',
  steps: {
    'Case 7': {
      detail:
        'ผู้บังคับบัญชาชั้นต้นตีกลับให้แก้ไข เจ้าหน้าที่แก้ คบ.6 เป็นฉบับที่ใหม่โดยเก็บฉบับเดิมไว้ แล้วส่งกลับเข้าเส้นทางเดิม',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'แฟ้มถูกส่งกลับแก้ไข', 2200)
        await d.highlight(p.getByTestId('dossier-forms'), 'แบบ คบ.6 ที่ต้องแก้ไข', 2000)
        await reviseKb6(d, false)
        await forward(d, 'ส่งผู้บังคับบัญชาชั้นต้นอีกครั้ง (WIT0506)')

        // WIT0505: ผู้บังคับบัญชาชั้นต้นตรวจแล้วตีกลับได้อีก พร้อมเหตุผล
        await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจ และตีกลับพร้อมเหตุผล', 'ผู้บังคับบัญชาชั้นต้นเลือกประเด็นและพิมพ์ข้อสั่งการ แฟ้มจะกลับไปที่เจ้าหน้าที่ผู้รับผิดชอบ', DOSSIER)
        await returnCase(d, 'evidence_missing', 'หลักฐานการข่มขู่ยังไม่ครบ ให้แนบบันทึกข้อความโทรศัพท์เพิ่มเติม')
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'แฟ้มกลับไปขั้นเจ้าหน้าที่ แก้ไข', 2400)
      },
    },

    'Case 7.1': {
      detail:
        'ผอ.สำนัก/กอง ส่งกลับตรงถึงเจ้าหน้าที่ ไม่ผ่านผู้บังคับบัญชาชั้นต้น เจ้าหน้าที่แก้แล้วเสนอกลับ ผอ. โดยตรง',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('director-rework-banner'), 'แก้ไขตามข้อสั่งการ ผอ. — ไม่ผ่านผู้บังคับบัญชาชั้นต้น', 3000)
        await reviseKb6(d, true)
        await d.highlight(p.getByTestId('forward-case-button'), 'ปุ่มส่งต่อชี้ไปที่ ผอ.สำนัก/กอง โดยตรง', 2200)
        await forward(d, 'เสนอ ผอ.สำนัก/กอง (WIT0511)')

        // WIT0510: ผอ. ส่งกลับตรงเจ้าหน้าที่
        await d.switchRole('director', 'ผอ. ตรวจและส่งกลับตรงเจ้าหน้าที่', 'ผอ. เลือกประเด็นและบันทึกข้อสั่งการ แฟ้มลงถึงเจ้าหน้าที่โดยตรง ไม่แวะผู้บังคับบัญชาชั้นต้น', DOSSIER)
        await returnCase(d, 'fact_discrepancy', 'ความเห็นใน คบ.6 ไม่สอดคล้องข้อเท็จจริง ให้ทบทวนใหม่')
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'แฟ้มลงถึงเจ้าหน้าที่ผู้รับผิดชอบโดยตรง', 2400)
      },
    },

    'Case 7.2': {
      detail:
        'เลขาธิการ ป.ป.ท. ส่งกลับ/ขอข้อมูลเพิ่ม งานจอดที่ ผอ.สำนัก/กอง ก่อน ผอ. ต้องมอบหมายให้เจ้าหน้าที่แก้เป็น Revision ใหม่',
      run: async (d) => {
        const p = d.page
        const card = p.getByTestId('return-revision-assignment-card')
        await d.highlight(card, 'เลขาธิการฯ ส่งกลับ — ระบุประเด็นและข้อสั่งการ (WIT0707)', 3500)
        await d.highlight(p.getByTestId('forward-case-button'), 'ส่งขึ้นไปใหม่ไม่ได้จนกว่าจะมอบหมายรอบแก้ไข', 2400)
        await d.click(p.getByTestId('assign-revision-button'), { note: 'กด "มอบหมายแก้ไขเป็น Revision ใหม่" (WIT0708)', after: 1000 })
        await d.fill(p.getByTestId('revision-instruction-input'), 'ให้ระบุฐานอำนาจตามระเบียบข้อ 15 ใน คบ.6 และแนบเอกสารประกอบเพิ่มเติม เป็นฉบับใหม่', { note: 'พิมพ์ข้อสั่งการให้เจ้าหน้าที่แก้ไข' })
        await d.click(p.getByTestId('assign-revision-confirm-button'), { note: 'ยืนยันมอบหมายแก้ไข', after: 1800 })
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'งานลงถึงเจ้าหน้าที่แล้ว (Revision ครั้งที่ 1)', 2600)
      },
    },

    'Case 7.3': {
      detail:
        'เจ้าหน้าที่แก้ คบ.6 เป็น Revision ใหม่โดยไม่แก้ทับฉบับลงนาม แล้วส่งตามลำดับเดิมทีละชั้น ห้ามข้ามลำดับชั้นแม้เป็นเคสเร่งด่วน',
      run: async (d) => {
        const p = d.page
        await d.highlight(p.getByTestId('secretary-revision-banner'), 'Revision ตามข้อสั่งการเลขาธิการฯ — ห้ามส่งข้ามลำดับชั้น', 3200)
        await reviseKb6(d, true)
        await d.highlight(p.getByTestId('forward-case-button'), 'ปุ่มส่งต่อชี้ที่ผู้บังคับบัญชาชั้นต้นก่อน (WIT0709)', 2400)
        await forward(d, 'ส่งผู้บังคับบัญชาชั้นต้นก่อน')

        await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจ Revision', 'ส่งต่อตามลำดับเดิมทีละชั้น', DOSSIER)
        await forward(d, 'ผบช.ชั้นต้นส่ง ผอ.')
        await d.switchRole('director', 'ผอ.สำนัก/กอง ตรวจ Revision', 'ผอ. ส่งต่อรองเลขาธิการฯ', DOSSIER)
        await forward(d, 'ผอ. ส่งรองเลขาธิการฯ')
        await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ ตรวจ Revision', 'รองเลขาธิการฯ ส่งกลับถึงเลขาธิการฯ ตามลำดับเดิม', DOSSIER)
        await forward(d, 'ส่งเลขาธิการ ป.ป.ท.')
        await d.switchRole('secretary', 'เลขาธิการฯ รับ Revision เพื่อพิจารณา', 'ฉบับแก้กลับถึงเลขาธิการฯ แล้ว รอผลพิจารณา', DOSSIER)
        await d.highlight(p.getByText('สถานะปัจจุบัน:').first(), 'แฟ้มกลับเป็น "รอผลพิจารณา" ที่เลขาธิการฯ', 2600)
      },
    },
  },
} satisfies ScenarioScript
