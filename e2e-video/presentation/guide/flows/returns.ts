import type { Locator, Page } from '@playwright/test'
import type { GuideDirector } from '../guide-director'
import { GUIDE_DOSSIER_URL, type GuideFlow } from '../types'

/**
 * ทางแยก — เลขาธิการฯ ส่งกลับแก้ไข → งานจอดที่ ผอ. มอบหมายรอบแก้ไข → เจ้าหน้าที่แก้ คบ.6 เป็นฉบับใหม่
 * → เสนอตามลำดับชั้นเดิมทีละชั้นจนกลับถึงเลขาธิการฯ
 * ปรับจาก scenarios/returns.ts (Case 7.2 – 7.3)
 */

const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

async function forward(d: GuideDirector, note: string, confirmNote: string) {
  const btn = d.page.getByTestId('forward-case-button')
  await d.scrollTo(btn)
  await d.click(btn, { note, after: 600 })
  await d.confirm('ยืนยันส่งต่อ', confirmNote)
}

/** แสดงว่าชั้นล่างก็มีปุ่มส่งกลับ (ถ้าปุ่มปรากฏอยู่) */
async function showReturnButton(d: GuideDirector, note: string) {
  const btn = d.page.getByTestId('return-case-button')
  if (await btn.count()) {
    await d.scrollTo(btn)
    await d.highlight(btn, note)
  }
}

export default {
  id: 'returns',
  title: 'ทางแยก: ส่งกลับแก้ไขตามลำดับชั้น',
  summary:
    'เลขาธิการฯ ส่งกลับแฟ้มพร้อมประเด็นและข้อสั่งการ งานจอดที่ ผอ.สำนัก/กอง เพื่อมอบหมายรอบแก้ไข เจ้าหน้าที่แก้ คบ.6 เป็นฉบับใหม่โดยเก็บฉบับเดิมไว้ แล้วเสนอตามลำดับชั้นเดิมทีละชั้นจนกลับถึงเลขาธิการฯ',
  branchSection: 'เลขาธิการฯ พิจารณาชี้ขาด',
  run: async (d) => {
    const p = d.page
    const status = p.getByText(/ขั้นตอนปัจจุบัน:/).first()

    // ── 1. เลขาธิการฯ ส่งกลับ ──
    d.section('เลขาธิการฯ ส่งกลับแก้ไข', 'ส่งกลับได้โดยไม่ต้องลงนามข้อ 13 — ระบุประเด็นที่ต้องแก้และข้อสั่งการ')
    const ret = p.getByTestId('secretary-return-button')
    await d.scrollTo(ret)
    await d.click(ret, { note: 'กด "ส่งกลับแก้ไข"', after: 800 })
    const dialog = p.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await d.select(dialog.locator('select.ws-input'), 'ผลประเมินภัยหรือวิธีคุ้มครองไม่ครบ', { note: 'เลือกประเด็นที่ต้องแก้ไข' })
    await d.fill(dialog.locator('textarea.ws-input'), 'ให้ทบทวนผลประเมินภัยและวิธีคุ้มครองใน คบ.6 ข้อ 8 ให้ครบถ้วน แล้วเสนอใหม่ตามลำดับชั้น', {
      note: 'พิมพ์เหตุผลและข้อสั่งการ',
    })
    await d.click(p.getByTestId('decision-confirm-button'), { note: 'กด "ยืนยันและส่งผล"', after: 1500 })
    await dialog.waitFor({ state: 'detached' })
    await d.result(status, 'งานลงไปจอดที่ ผอ.สำนัก/กอง เพื่อมอบหมายรอบแก้ไข')

    // ── 2. ผอ. มอบหมายรอบแก้ไข ──
    await d.switchRole('director', 'ผอ.สำนัก/กอง มอบหมายรอบแก้ไข', 'งานที่เลขาธิการฯ ส่งกลับจอดที่ ผอ. ก่อน ต้องมอบหมายให้เจ้าหน้าที่แก้เป็น Revision ใหม่', GUIDE_DOSSIER_URL)
    const card = p.getByTestId('return-revision-assignment-card')
    await card.waitFor()
    await d.highlight(card, 'ประเด็นและข้อสั่งการจากเลขาธิการฯ')
    await d.highlight(p.getByTestId('forward-case-button'), 'ส่งขึ้นไม่ได้จนกว่าจะมอบหมายรอบแก้ไข')
    await d.click(p.getByTestId('assign-revision-button'), { note: 'กด "มอบหมายแก้ไขเป็น Revision ใหม่"', after: 1000 })
    await d.fill(p.getByTestId('revision-instruction-input'), 'ให้ทบทวนผลประเมินภัยและวิธีคุ้มครองใน คบ.6 ข้อ 8 เป็นฉบับใหม่', { note: 'พิมพ์ข้อสั่งการถึงเจ้าหน้าที่' })
    await d.click(p.getByTestId('assign-revision-confirm-button'), { note: 'กด "ยืนยัน" มอบหมายแก้ไข', after: 1800 })
    await d.result(status, 'งานลงถึงเจ้าหน้าที่แล้ว (Revision ครั้งที่ 1)')

    // ── 3. เจ้าหน้าที่แก้ คบ.6 ──
    await d.switchRole('officer', 'เจ้าหน้าที่แก้ คบ.6 ตามข้อสั่งการ', 'ระบบเปิด คบ.6 เป็นฉบับใหม่ ฉบับเดิมที่ลงนามแล้วเก็บไว้ในประวัติ ไม่ถูกแก้ทับ', GUIDE_DOSSIER_URL)
    await d.highlight(p.getByTestId('secretary-revision-banner'), 'แบนเนอร์ข้อสั่งการของเลขาธิการฯ')
    const row = formRow(p, 'คบ.6')
    await d.scrollTo(row)
    await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6 เพื่อแก้ไข', after: 1500 })
    await p.waitForURL(/\/form\/6/)
    await d.highlight(p.getByText(/ฉบับที่ \d+/).first(), 'ระบบเปิดเป็นฉบับใหม่')
    const toggle = p.getByTestId('form-revision-history-toggle')
    if (await toggle.count()) {
      await d.click(toggle, { note: 'ดูประวัติเวอร์ชัน', after: 800 })
      await d.highlight(p.getByTestId('form-revision-item-1'), 'ฉบับเดิมเก็บไว้พร้อมเหตุผล')
    }
    const save = p.getByRole('button', { name: 'บันทึกแบบ คบ.6' })
    await d.scrollTo(save)
    await d.click(save, { note: 'แก้ไขแล้วกด "บันทึกแบบ คบ.6"', after: 1800 })
    if (!/\/dossier\//.test(p.url())) await d.goto(GUIDE_DOSSIER_URL)
    await showReturnButton(d, 'เจ้าหน้าที่ยังไม่มีปุ่มส่งกลับถ้าไม่มีผู้ส่งมา')
    await forward(d, 'กด "ส่งต่อ" ให้ผู้บังคับบัญชาชั้นต้น', 'ยืนยันส่งต่อผู้บังคับบัญชาชั้นต้น')

    // ── 4. เสนอตามลำดับชั้นเดิม ──
    await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจฉบับแก้', 'ส่งต่อตามลำดับเดิมทีละชั้น ห้ามข้ามชั้น', GUIDE_DOSSIER_URL)
    await showReturnButton(d, 'ผบช.ชั้นต้นก็ส่งกลับได้ถ้าฉบับแก้ยังไม่ครบ')
    await forward(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง', 'ยืนยันส่งต่อ ผอ.สำนัก/กอง')
    await d.switchRole('director', 'ผอ.สำนัก/กอง ตรวจฉบับแก้', 'ผอ. ส่งต่อรองเลขาธิการฯ', GUIDE_DOSSIER_URL)
    await showReturnButton(d, 'ผอ. ส่งกลับตรงถึงเจ้าหน้าที่ได้')
    await forward(d, 'กด "ส่งต่อ" ให้รองเลขาธิการฯ', 'ยืนยันส่งต่อรองเลขาธิการฯ')
    await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ ตรวจฉบับแก้', 'รองเลขาธิการฯ ส่งต่อถึงเลขาธิการฯ', GUIDE_DOSSIER_URL)
    await showReturnButton(d, 'รองเลขาธิการฯ ก็ส่งกลับได้')
    await forward(d, 'กด "ส่งต่อ" ให้เลขาธิการฯ', 'ยืนยันส่งต่อเลขาธิการฯ')

    // ── 5. กลับเข้าเส้นทางหลัก ──
    await d.switchRole('secretary', 'กลับเข้าเส้นทางหลัก', 'ฉบับแก้กลับถึงเลขาธิการฯ ที่การ์ดคำสั่งชี้ขาด ดำเนินการต่อตามเส้นทางหลัก', GUIDE_DOSSIER_URL)
    const approve = p.getByTestId('approve-case-button')
    await approve.waitFor()
    await d.scrollTo(approve)
    await d.result(p.getByText('คำสั่งชี้ขาดของเลขาธิการ ป.ป.ท.').first(), 'แฟ้มกลับมารอคำสั่งชี้ขาดอีกครั้ง')
  },
} satisfies GuideFlow
