import type { Locator, Page } from '@playwright/test'
import { isoDaysFromToday } from '../../../director'
import { GUIDE_CASE_NO, type GuideFlow } from '../types'
import type { GuideDirector } from '../guide-director'

const TARGET_AGENCY = 'กรมคุ้มครองสิทธิและเสรีภาพ'

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** การ์ดของเรื่องนี้ในหน้า /article14 (หน้านี้แสดงได้หลายเรื่อง) */
const panelOf = (page: Page, caseNo: string): Locator =>
  page.locator('section.ws-card', { has: page.getByRole('heading', { name: new RegExp(caseNo) }) }).last()

/** เลขาธิการฯ ลงนามความเห็นข้อ 13 ใน คบ.6 */
async function signArticle13(d: GuideDirector, dossierUrl: string) {
  const { page } = d
  const row = formRow(page, 'คบ.6')
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6 เพื่อลงนามความเห็นข้อ 13' })
  await page.waitForURL(/\/form\/6/)
  await d.pause(800)
  const area = areaField(page, '13. ความเห็นเลขาธิการฯ')
  await d.scrollTo(area)
  if (!(await area.inputValue())) {
    await d.fill(area, 'เห็นควรส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ เนื่องจากภัยคุกคามเกินขอบเขตมาตรการของ ป.ป.ท.', { note: 'บันทึกความเห็นข้อ 13' })
  } else {
    await d.highlight(area, 'ความเห็นข้อ 13 ของเลขาธิการฯ')
  }
  await d.click(page.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม" เพื่อลงลายมือชื่ออิเล็กทรอนิกส์' })
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await d.pause(800)
  if (!(await nameInput.inputValue())) await d.fill(nameInput, 'นายสุรศักดิ์ ธรรมพิทักษ์', { note: 'ชื่อผู้ลงนาม' })
  else await d.highlight(nameInput, 'ระบบใส่ชื่อผู้ลงนามให้อัตโนมัติ')
  await d.check(page.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองว่าเป็นลายมือชื่อของตนเอง' })
  await d.click(page.getByTestId('signature-confirm-button'), { note: 'กด "ยืนยัน" เพื่อลงนาม', after: 1500 })
  await d.goto(dossierUrl)
}

/** ขั้นตอนทั้งหมดของทางแยกที่เริ่มจากเลขาธิการฯ ชี้ขาด — รับเลขแฟ้มเพื่อใช้พัฒนากับเรื่องอื่นได้ */
export async function article14Steps(d: GuideDirector, caseNo: string = GUIDE_CASE_NO) {
  await referFromSecretary(d, caseNo)
  await article14ProposalSteps(d, caseNo)
}

/** ขั้นตอนที่ 1: เลขาธิการฯ ลงนามข้อ 13 และเห็นควรส่งต่อกรมคุ้มครองสิทธิฯ */
async function referFromSecretary(d: GuideDirector, caseNo: string) {
  const p = d.page
  const dossierUrl = `/dossier/${caseNo}`
  // ── 1. เลขาธิการฯ ลงนามข้อ 13 และส่งต่อ ──
  d.section('เลขาธิการฯ ลงนามข้อ 13 และเห็นควรส่งกรมคุ้มครองสิทธิฯ', 'ต้องลงนามความเห็นข้อ 13 ใน คบ.6 ก่อน จึงจะสั่งการชี้ขาดได้')
  const refer = p.getByTestId('refer-article14-button')
  await d.scrollTo(refer)
  await d.highlight(refer, 'ปุ่มยังกดไม่ได้ — ต้องลงนามข้อ 13 ก่อน')
  await signArticle13(d, dossierUrl)
  await d.scrollTo(refer)
  await d.click(refer, { note: 'กด "เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ"', after: 1000 })
  const dialog = p.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await d.fill(dialog.getByRole('textbox').nth(1), 'ปปท. 91/2569', { note: 'กรอกเลขที่คำสั่ง' })
  await d.fill(
    dialog.getByRole('textbox').last(),
    'พฤติการณ์ภัยคุกคามเกินขอบเขตมาตรการเบื้องต้นของ ป.ป.ท. เห็นควรส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ',
    { note: 'กรอกเหตุผลประกอบคำสั่ง' }
  )
  await d.click(p.getByTestId('decision-confirm-button'), { note: 'กด "ยืนยันและส่งผล"', after: 1500 })
  await dialog.waitFor({ state: 'detached' })
  await d.result(p.getByText(/เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ/).first(), 'สถานะ: เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ · เจ้าหน้าที่จัดทำเรื่องเสนอ')
}

/**
 * ขั้นตอนที่ 2–8 บนหน้า /article14: เจ้าหน้าที่จัดทำเรื่องเสนอ → ผบช.ชั้นต้น → เลขาธิการฯ → คณะกรรมการ → หนังสือถึงกรม → ตอบรับ → ส่งมอบ
 * ใช้ร่วมกับทางแยกที่เข้าหน้านี้จากทบทวนครบเพดาน (article14-ceiling) — ป้ายที่มา "มาจากผลพิจารณาและคำสั่ง" มีเฉพาะทางเลขาธิการฯ
 */
export async function article14ProposalSteps(d: GuideDirector, caseNo: string = GUIDE_CASE_NO) {
  const p = d.page
  const panel = panelOf(p, caseNo)

  // ── 2. เจ้าหน้าที่จัดทำเรื่องเสนอ ──
  const here = new URL(p.url()).pathname
  if (here === '/article14' && d.currentRole === 'officer') {
    d.section('เจ้าหน้าที่จัดทำเรื่องเสนอส่งกรมคุ้มครองสิทธิฯ', 'อยู่ที่หน้า "ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ" แล้ว ระบุเหตุภัยและผลประเมิน')
  } else {
    await d.switchRole('officer', 'เจ้าหน้าที่จัดทำเรื่องเสนอส่งกรมคุ้มครองสิทธิฯ', 'เปิดหน้า "ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ" แล้วระบุเหตุภัยและผลประเมิน', '/article14')
  }
  const badge = panel.getByTestId('article14-referral-badge')
  if (await badge.count()) await d.highlight(badge, 'ป้ายแสดงที่มา: มาจากผลพิจารณาและคำสั่งของเลขาธิการฯ')
  await d.fill(
    panel.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }),
    'พยานยังถูกข่มขู่และติดตามความเคลื่อนไหว ภัยคุกคามเกินขอบเขตมาตรการเบื้องต้นของ ป.ป.ท.',
    { note: 'ระบุเหตุความไม่ปลอดภัย' }
  )
  await d.fill(
    panel.getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ }),
    'อ้างอิง คบ.6 และคำสั่งของเลขาธิการฯ — ความเสี่ยงสูง ควรให้กรมคุ้มครองสิทธิฯ ดูแลต่อ',
    { note: 'ระบุผลประเมินความเสี่ยง' }
  )
  await d.click(panel.getByTestId('submit-article14-proposal'), { note: 'กด "จัดทำและเสนอเรื่อง"' })
  await d.confirm('ยืนยันเสนอ', 'ยืนยันเสนอเรื่องให้ ผบช.ชั้นต้น')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'ขั้นตอน: รอ ผบช.ชั้นต้นตรวจ')

  // ── 3. ผบช.ชั้นต้น ──
  await d.switchRole('supervisor', 'ผบช.ชั้นต้นตรวจเรื่องเสนอ', 'ตรวจเหตุภัยและข้อเสนอ เห็นชอบแล้วเสนอเลขาธิการฯ', '/article14')
  await d.highlight(panel.getByTestId('article14-return-button'), 'ถ้าไม่ครบถ้วน กดส่งคืนแก้ไขได้ (ต้องระบุเหตุผล)')
  await d.fill(panel.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข'), 'ข้อมูลครบถ้วน เห็นควรเสนอเลขาธิการฯ', { note: 'บันทึกความเห็นประกอบ' })
  await d.click(panel.getByTestId('article14-endorse-button'), { note: 'กด "เห็นชอบ · เสนอขั้นถัดไป"' })
  await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเห็นชอบและเสนอขั้นถัดไป')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'ขั้นตอน: รอเลขาธิการฯ เสนอคณะกรรมการ')

  // ── 4. เลขาธิการฯ เสนอคณะกรรมการ ──
  await d.switchRole('secretary', 'เลขาธิการฯ เสนอเรื่องต่อคณะกรรมการ ป.ป.ท.', 'เลขาธิการฯ พิจารณาและเสนอเรื่องพร้อมความเห็น', '/article14')
  await d.fill(panel.getByPlaceholder('ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข'), 'เห็นชอบ เสนอคณะกรรมการ ป.ป.ท. พิจารณา', { note: 'บันทึกความเห็นประกอบ' })
  await d.click(panel.getByTestId('article14-endorse-button'), { note: 'กด "เห็นชอบ · เสนอขั้นถัดไป"' })
  await d.confirm('ยืนยันเห็นชอบ', 'ยืนยันเสนอคณะกรรมการ')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'ขั้นตอน: รอคณะกรรมการมีมติ')

  // ── 5. คณะกรรมการมีมติ ──
  await d.switchRole('committee', 'คณะกรรมการ ป.ป.ท. มีมติ', 'มีมติเห็นชอบหรือไม่เห็นชอบส่งกรมคุ้มครองสิทธิฯ', '/article14')
  await d.fill(panel.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม'), 'มติที่ 25/2569', { note: 'กรอกเลขที่มติ' })
  await d.fill(panel.getByPlaceholder('สาระสำคัญของมติ'), 'เห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ', { note: 'กรอกสาระสำคัญของมติ' })
  await d.highlight(panel.getByTestId('article14-committee-reject'), 'ถ้าไม่เห็นชอบ ให้ดำเนินการตามคำสั่งเดิมต่อไป')
  await d.click(panel.getByTestId('article14-committee-approve'), { note: 'กด "มติ: เห็นชอบส่งกรม"' })
  await d.confirm('ยืนยันมติ', 'ยืนยันมติเห็นชอบ')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'ขั้นตอน: มติเห็นชอบ รอออกหนังสือถึงกรม')

  // ── 6. เจ้าหน้าที่ออกหนังสือถึงกรม ──
  await d.switchRole('officer', `เจ้าหน้าที่ออกหนังสือถึง${TARGET_AGENCY}`, 'บันทึกหนังสือขาออกจากระบบสารบรรณเดิม', '/article14')
  await d.fill(panel.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'), 'ปปท 0001/7788', { note: 'กรอกเลขที่หนังสือขาออก' })
  await d.click(panel.getByRole('button', { name: 'บันทึกหนังสือขาออก' }), { note: 'กด "บันทึกหนังสือขาออก"' })
  await d.confirm('ยืนยันบันทึก', 'ยืนยันบันทึกหนังสือขาออก')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'ส่งหนังสือถึงกรมแล้ว รอหนังสือตอบรับ')

  // ── 7. บันทึกหนังสือตอบรับ ──
  d.section('บันทึกหนังสือตอบรับจากกรม', 'เมื่อกรมตอบรับ ให้บันทึกหนังสือพร้อมนัดวันส่งมอบ')
  await d.fill(panel.getByPlaceholder('เลขที่หนังสือตอบรับของกรม'), 'ยธ 0501/2569', { note: 'กรอกเลขที่หนังสือตอบรับ' })
  await d.fill(panel.getByPlaceholder('ผู้ประสานของกรม'), 'นายประสาน ตอบรับ', { note: 'ระบุผู้ประสานของกรม' })
  await d.fillDate(panel.getByLabel('วันนัดส่งมอบ'), isoDaysFromToday(3), 'เลือกวันนัดส่งมอบ')
  // ช่องอัปโหลดซ่อนอยู่ จึงแนบไฟล์ด้วย setInputFiles
  await panel.getByTestId('article14-reply-file').setInputFiles({ name: 'หนังสือตอบรับกรม.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock reply') })
  await d.pause(500)
  await d.click(panel.getByTestId('article14-record-reply'), { note: 'กด "บันทึกหนังสือตอบรับ"' })
  await d.confirm('ยืนยันบันทึก', 'ยืนยันบันทึกหนังสือตอบรับ')
  await d.result(panel.getByText(/ขั้นตอน:/).first(), 'บันทึกหนังสือตอบรับแล้ว พร้อมส่งมอบ')

  // ── 8. ส่งมอบ ──
  d.section('ส่งมอบและเริ่มมาตรการภายใต้กรมคุ้มครองสิทธิฯ', 'ส่งมอบจริงแล้วระบบปิดช่วงคุ้มครองเดิมของ ป.ป.ท.')
  await d.fillDate(panel.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่'), isoDaysFromToday(3), 'เลือกวันเริ่มมาตรการของกรม')
  await d.fill(panel.getByLabel('ฐานกฎหมายของหน่วยงานใหม่'), 'มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ', { note: 'ระบุฐานกฎหมายของกรม' })
  await d.click(panel.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }), { note: 'กด "บันทึกส่งมอบ"' })
  await d.confirm('ยืนยันส่งมอบ', 'ยืนยันส่งมอบและปิดช่วงคุ้มครองเดิม')
  await d.result(panel.getByText(/เริ่มมาตรการตั้งแต่/).first(), 'ส่งมอบเรียบร้อย — กรมคุ้มครองสิทธิฯ เริ่มมาตรการแล้ว ปิดช่วงคุ้มครองเดิมของ ป.ป.ท.')
}

export default {
  id: 'article14',
  branchSection: 'เลขาธิการฯ พิจารณาชี้ขาด',
  title: 'ทางแยก 1: เลขาธิการฯ ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ',
  summary:
    'เลขาธิการฯ ลงนามข้อ 13 แล้วเห็นควรส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ (ข้อ 14) เรื่องผ่าน ผบช.ชั้นต้น เลขาธิการฯ และมติคณะกรรมการ ป.ป.ท. จากนั้นออกหนังสือถึงกรม รับหนังสือตอบรับ และส่งมอบ',
  run: async (d) => {
    await article14Steps(d)
  },
} satisfies GuideFlow
