import type { Page } from '@playwright/test'
import type { GuideDirector } from '../guide-director'
import type { GuideFlow } from '../types'

const CASE_613 = 'WP-2569-000613'

/** ส่งต่อ ผอ. จากการ์ดส่งงาน แล้วยืนยัน */
async function forwardToDirector(d: GuideDirector, note: string) {
  const btn = d.page.getByTestId('forward-case-button')
  await d.scrollTo(btn)
  await d.click(btn, { note, after: 500 })
  await d.confirm('ยืนยันส่งต่อ', 'ยืนยันส่งต่อให้ ผอ.สำนัก/กอง')
}

/** เจ้าหน้าที่รับเรื่องใหม่ผ่านหน้า "รับคำร้องใหม่" — เลือกการ์ด คบ.1 / คบ.2 ตามประเภทเอกสาร */
async function officerIntake(d: GuideDirector, kb: 'kb1' | 'kb2', fileName: string, note: string) {
  const p = d.page
  await d.click(p.getByRole('radio', { name: /^กรณีปกติ/ }), { note: 'คัดกรองความเร่งด่วนเบื้องต้น: เลือก "กรณีปกติ"' })
  await d.fill(p.locator('#intakeScreeningNote'), 'ไม่มีเหตุให้ต้องเริ่มคุ้มครองชั่วคราวในทันที', { note: 'ระบุเหตุผลการคัดกรองเบื้องต้น' })
  const card = p.getByTestId(`intake-${kb}-card`)
  await d.scrollTo(card)
  await d.highlight(card, note)
  await d.attach(card.locator('input[type=file]'), fileName, kb === 'kb1' ? 'อัปโหลดไฟล์ คบ.1' : 'อัปโหลดไฟล์ คบ.2')
  const action = kb === 'kb1' ? 'เจ้าหน้าที่กรอก คบ.1' : 'เจ้าหน้าที่บันทึก คบ.2'
  await d.click(card.getByRole('button', { name: action }), { note: `กด "${action}"`, after: 1200 })
  // ระบบเปิดแฟ้มใหม่และเปิดแบบ คบ. ให้กรอกต่อทันที
  await p.waitForURL(/\/form\/[12]\?caseNo=WP-/)
  const caseNo = p.url().match(/WP-\d{4}-\d{6}/)![0]
  await d.highlight(p.getByRole('heading').first(), `ระบบเปิดแบบ ${kb === 'kb1' ? 'คบ.1' : 'คบ.2'} ให้กรอกต่อทันที`)
  await d.goto(`/dossier/${caseNo}`)
  await p.getByTestId('forward-case-button').waitFor()
}

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const field = (p: Page, label: string) => p.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::input[1]')

/** เจ้าหน้าที่เปิดแบบ คบ.1 / คบ.2 ในแฟ้ม กรอกชื่อพยาน บันทึก แล้วกลับหน้าแฟ้ม */
async function fillWitnessForm(d: GuideDirector, code: 'คบ.1' | 'คบ.2') {
  const p = d.page
  const dossierUrl = new URL(p.url()).pathname
  const row = p.getByTestId('dossier-forms').locator('div.rounded-xl', { has: p.getByText(code, { exact: true }) })
  await row.waitFor()
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: `กด "เปิดแบบฟอร์ม" ของ ${code}`, after: 1200 })
  await p.waitForURL(/\/form\//)
  if (code === 'คบ.2') {
    await d.fill(field(p, 'ชื่อตัว'), 'ตรีรุด', { note: 'กรอกชื่อพยานผู้แจ้ง' })
    await d.fill(field(p, 'ชื่อสกุล'), 'หล่อจัง', { note: 'กรอกนามสกุล' })
    await d.fill(field(p, 'โทรศัพท์'), '0812345678', { note: 'กรอกเบอร์โทรศัพท์' })
  } else {
    await d.fill(field(p, 'ชื่อ'), 'ตรีรุด', { note: 'กรอกชื่อพยานผู้ยื่น' })
    await d.fill(field(p, 'นามสกุล'), 'หล่อจัง', { note: 'กรอกนามสกุล' })
    await d.fill(field(p, 'โทรศัพท์'), '0812345678', { note: 'กรอกเบอร์โทรศัพท์' })
  }
  const save = p.getByRole('button', { name: `บันทึกแบบ ${code}` })
  const next = p.getByRole('button', { name: 'ส่วนถัดไป' })
  for (let i = 0; i < 10 && !(await save.isVisible()); i++) await d.click(next, { note: i === 0 ? 'กด "ส่วนถัดไป" จนถึงส่วนท้าย' : undefined, after: 300 })
  await d.click(save, { note: `กด "บันทึกแบบ ${code}"`, after: 1500 })
  if (new URL(p.url()).pathname !== dossierUrl) await d.goto(dossierUrl)
  await p.getByTestId('forward-case-button').waitFor()
  await d.scrollTo(row)
  await d.result(row, `บันทึก ${code} แล้ว — ข้อมูลพยาน "ตรีรุด หล่อจัง" อยู่ในแบบ`)
}

/** เจ้าหน้าที่ที่รับเรื่องเอง (ไม่ใช่ธุรการ) บันทึกว่าเชื่อมโยงเลขสำนวนหลักไม่ได้ แล้วส่งต่อ ผอ. */
async function noMainCaseAndForward(d: GuideDirector) {
  const p = d.page
  const sel = p.getByTestId('main-case-not-found-reason-select')
  await d.scrollTo(sel)
  await d.select(sel, 'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5', { note: 'เลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้' })
  await d.click(p.getByTestId('main-case-not-found-button'), { note: 'กด "ค้นไม่พบ" — คำร้องยังเดินต่อตามปกติ', after: 600 })
  await d.confirm('ยืนยันไม่พบคดี', 'ยืนยันสถานะ "ไม่พบคดี"')
  await d.result(p.getByTestId('main-case-not-found-reason'), 'บันทึกเหตุผลลงแฟ้มแล้ว ติดตามเชื่อมโยงภายหลังได้')
  await forwardToDirector(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน')
}

export default {
  id: 'intake',
  title: 'ทางแยก: รับเรื่องแบบอื่น',
  summary: 'ธุรการส่งเรื่องที่ยังไม่ได้เชื่อมโยงคดีหลักให้ ผอ. มอบหมายได้เลย (เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยงภายหลัง) ส่วนเจ้าหน้าที่ที่รับเรื่องเองบันทึกเหตุผลที่ยังไม่มีเลขสำนวนหลักแล้วส่ง ผอ. ได้ และเจ้าหน้าที่รับเรื่องใหม่ได้ทั้งทางโทรศัพท์ (คบ.2) และแบบ คบ.1 โดยไม่ต้องผ่านธุรการ',
  caseNo: CASE_613,
  branchSection: 'ธุรการ: เลือกเรื่องจากทะเบียน',
  prefix: async () => {},
  run: async (d: GuideDirector) => {
    const p: Page = d.page

    // ── 1. เรื่องที่ยังไม่ได้เชื่อมโยงคดีหลัก (ธุรการไม่เชื่อมโยง ส่ง ผอ. ต่อได้เลย) ──
    d.section('ธุรการ: เรื่องที่ยังไม่ได้เชื่อมโยงคดีหลัก', 'เรื่อง "น้ำป่าไหลหลากในหมู่บ้าน A" ของ "ตรีรุด หล่อจัง" ยังไม่ได้เชื่อมโยงเลขสำนวนหลัก — ธุรการไม่เชื่อมโยงหรือระบุ "ไม่พบคดี" เอง ส่ง ผอ. มอบหมายต่อ แล้วเจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง')
    const search = p.locator('#registry-search')
    await search.waitFor()
    await d.fill(search, CASE_613, { note: `พิมพ์เลขคำร้อง ${CASE_613} ในช่องค้นหา` })
    const row = p.locator('tbody tr', { hasText: CASE_613 })
    await row.waitFor()
    await d.click(row.getByRole('link', { name: 'เปิดแฟ้ม' }), { note: 'กด "เปิดแฟ้ม" ของเรื่อง "น้ำป่าไหลหลากในหมู่บ้าน A"' })
    await p.waitForURL(new RegExp(`/dossier/${CASE_613}`))
    await p.getByTestId('forward-case-button').waitFor()
    const deferred = p.getByText('ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง ส่งต่อได้')
    await d.scrollTo(deferred)
    await d.highlight(deferred, 'ยังไม่ได้เชื่อมโยงคดีหลัก — ธุรการไม่ต้องเชื่อมโยง ส่งต่อ ผอ. ได้เลย (เจ้าของสำนวนเชื่อมโยงภายหลัง)')
    await forwardToDirector(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน')
    await d.result(p.getByText('ขั้นตอนปัจจุบัน:').first(), 'ส่งต่อ ผอ.สำนัก/กอง แล้ว โดยไม่ต้องเชื่อมโยงคดีหลัก — ผอ. มอบหมายเจ้าของสำนวนในขั้นถัดไป')

    // ── 2. รับแจ้งทางโทรศัพท์ (คบ.2) ──
    await d.switchRole('officer', 'เจ้าหน้าที่: รับแจ้งทางโทรศัพท์ (คบ.2)', 'พยาน "ตรีรุด หล่อจัง" โทรแจ้งผ่านสายด่วน เจ้าหน้าที่รับเรื่องเองด้วยแบบ คบ.2 โดยไม่ผ่านธุรการ', '/intake')
    await p.locator('#intakeScreeningNote').waitFor()
    await officerIntake(d, 'kb2', 'บันทึกรับแจ้งทางโทรศัพท์.pdf', 'การ์ด "บันทึกรับเรื่อง คบ.2" (แจ้งทางโทรศัพท์)')
    await d.result(p.getByRole('heading', { name: new RegExp('WP-') }).first(), 'ระบบเปิดแฟ้มใหม่ ประเภทแบบ คบ.2')
    await fillWitnessForm(d, 'คบ.2')
    await noMainCaseAndForward(d)
    await d.result(p.getByText('ขั้นตอนปัจจุบัน:').first(), 'ส่ง ผอ. แล้ว — คบ.1 และ คบ.3 ทำต่อหลังมอบหมาย')

    // ── 3. รับเรื่องด้วยแบบ คบ.1 ──
    await d.switchRole('officer', 'เจ้าหน้าที่: รับเรื่องด้วยแบบ คบ.1', 'พยานเข้ามาติดต่อและลงนามแบบ คบ.1 เอง เจ้าหน้าที่รับเข้าทะเบียนแล้วทำ คบ.3 ต่อได้ทันที', '/intake')
    await p.locator('#intakeScreeningNote').waitFor()
    await officerIntake(d, 'kb1', 'แบบ คบ.1.pdf', 'การ์ด "จัดทำคำร้อง คบ.1" (พยานมาติดต่อเอง)')
    await d.result(p.getByRole('heading', { name: new RegExp('WP-') }).first(), 'ระบบเปิดแฟ้มใหม่ ประเภทแบบ คบ.1')
    await fillWitnessForm(d, 'คบ.1')
    await noMainCaseAndForward(d)
    await d.result(p.getByText('ขั้นตอนปัจจุบัน:').first(), 'ส่ง ผอ. แล้ว — ผอ. มอบหมาย แล้วทำ คบ.3 ต่อได้ทันที')
  },
} satisfies GuideFlow
