import type { Page } from '@playwright/test'
import type { UserRole } from '../../../../src/types/user'
import { isoDaysFromToday } from '../../../director'
import type { GuideDirector } from '../guide-director'
import { GUIDE_CASE_NO } from '../types'

/**
 * เส้นหลัก ช่วงท้าย (Case 1.13 → 1.19): รายงาน คบ.13 → ทบทวน/ยุติ → คบ.15 → อนุมัติ → คำสั่ง คบ.16 + หนังสือ คบ.17
 * → กรอบอุทธรณ์ 30 วัน → ปิดงานคุ้มครอง
 *
 * สมมติฐานตอนเข้า: แฟ้มอยู่ในสถานะ "กำลังคุ้มครอง" (วิธีที่ 1 เริ่มปฏิบัติจริงแล้ว = สิ้นสุด Case 1.12/1.13 ต้น)
 * จะมีรอบ คบ.13 ที่เปิดไว้แล้วหรือยังไม่เปิดก็ได้ (ถ้ายังไม่เปิดจะเปิดรอบและจัดทำให้เอง)
 * สถานะตอนจบ: ปิดงานคุ้มครองแล้ว (stage = terminated, มี closedAt)
 */

/** อ่านชื่อเจ้าหน้าที่ผู้ปฏิบัติ และชื่อพยาน จากข้อมูลแฟ้มจริง เพื่อใช้กับช่องลงนาม/ข้อความ */
async function readPeople(page: Page, caseNo: string) {
  return page.evaluate((no) => {
    const raw = localStorage.getItem('ecmis-case-storage-v2')
    const c = raw ? (JSON.parse(raw).state.cases as any[]).find((x) => x.no === no) : null
    return { officer: (c?.assignedOfficer || c?.owner || 'เจ้าหน้าที่ผู้ปฏิบัติ') as string, witness: (c?.person || 'พยาน') as string }
  }, caseNo)
}

/** สลับบทบาท และเปิดหัวข้อใหม่เสมอ (switchRole เปิดหัวข้อให้เฉพาะตอนบทบาทเปลี่ยน) */
async function asRole(d: GuideDirector, role: UserRole, label: string, detail: string, path: string) {
  const same = d.currentRole === role
  await d.switchRole(role, label, detail, path)
  if (same) d.section(label, detail)
}

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string) =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

type FormFill = { label: RegExp; value: string; note: string }

/** เจ้าหน้าที่เปิดแบบ คบ. จากแถวในแฟ้ม กรอกตามป้ายช่อง บันทึก แล้วกลับหน้าแฟ้ม */
async function fillDossierForm(d: GuideDirector, code: string, fills: FormFill[], opts: { rule?: RegExp; result: string }) {
  const p = d.page
  const dossierUrl = new URL(p.url()).pathname
  const row = formRow(p, code)
  await row.waitFor()
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: `กด "เปิดแบบฟอร์ม" ของ ${code}`, after: 1200 })
  await p.waitForURL(/\/form\//)
  if (opts.rule) await d.highlight(p.getByText(opts.rule).first(), 'กฎที่แบบนี้เตือนไว้ตลอดเวลา')
  for (const f of fills) await d.fill(p.getByLabel(f.label), f.value, { note: f.note })
  await d.click(p.getByRole('button', { name: `บันทึกแบบ ${code}` }), { note: `กด "บันทึกแบบ ${code}"`, after: 1500 })
  if (new URL(p.url()).pathname !== dossierUrl) await d.goto(dossierUrl)
  await row.waitFor()
  await d.scrollTo(row)
  await d.result(row, opts.result)
}

/**
 * ข้ามเวลาเพื่อการสาธิตเท่านั้น — เลื่อนวันที่พยานได้รับ คบ.17 และกำหนดครบอุทธรณ์ ย้อนหลัง N วัน
 * (ระบบตัดสินกรอบอุทธรณ์จาก kb17.appealDueAt เทียบวันนี้ — ดู evaluateCloseGuard ใน terminationProgress.ts)
 * ไม่แตะซอร์สแอป: แก้ localStorage 'ecmis-case-storage-v2' แล้วโหลดหน้าใหม่
 */
export async function skipDays(d: GuideDirector, caseNo: string, days: number) {
  await d.page.evaluate(
    ({ no, days }) => {
      const KEY = 'ecmis-case-storage-v2'
      const raw = localStorage.getItem(KEY)
      if (!raw) throw new Error('ไม่พบข้อมูลแฟ้มใน localStorage')
      const store = JSON.parse(raw)
      const shift = (v: unknown) => {
        if (typeof v !== 'string') return v
        const t = Date.parse(v)
        return Number.isNaN(t) ? v : new Date(t - days * 86400000).toISOString()
      }
      for (const c of store.state.cases as any[]) {
        if (c.no !== no) continue
        if (c.appealDueAt) c.appealDueAt = shift(c.appealDueAt)
        if (c.kb17) {
          c.kb17.deliveredAt = shift(c.kb17.deliveredAt)
          c.kb17.appealDueAt = shift(c.kb17.appealDueAt)
          for (const a of c.kb17.deliveryAttempts || []) a.attemptedAt = shift(a.attemptedAt)
        }
      }
      localStorage.setItem(KEY, JSON.stringify(store))
    },
    { no: caseNo, days }
  )
  await d.page.reload()
  await d.page.waitForLoadState('networkidle').catch(() => {})
}

/** เส้นหลักช่วงท้าย: รอบรายงาน คบ.13 → ทบทวนแล้วยุติ → ปิดงาน */
export async function reportToClose(d: GuideDirector, caseNo = GUIDE_CASE_NO) {
  await reportRound(d, caseNo)
  await reviewToClose(d, caseNo)
}

/**
 * 1.13: ตั้งรอบ/เปิดรอบรายงาน จัดทำและลงนาม คบ.13 ตรวจรับ ล็อกรอบ แล้วส่งเข้าทบทวน
 * จบ: เจ้าหน้าที่อยู่หน้าติดตามผล — ส่งเรื่องเข้าหน้าทบทวน (/protection-review/<caseNo>) แล้ว
 */
export async function reportRound(d: GuideDirector, caseNo = GUIDE_CASE_NO, reviewReason = 'พยานยื่น คบ.7 ขอยุติการคุ้มครอง ความเสี่ยงต่ำ') {
  const p = d.page
  const DOSSIER = `/dossier/${caseNo}`
  const MONITOR = `/protection-monitor?caseNo=${caseNo}`

  // ─────────────── 1.13 รายงานผล คบ.13 ───────────────
  await asRole(d, 'officer', 'จัดทำและลงนามรายงานผล คบ.13', 'ระหว่างคุ้มครอง เจ้าหน้าที่เปิดรอบรายงาน จัดทำ คบ.13 ให้เจ้าหน้าที่และพยานลงนามรับรอง แล้วตรวจรับผลและล็อกรอบรายงาน', MONITOR)
  const people = await readPeople(p, caseNo)

  // วิธีที่ 1 เพิ่งเริ่มปฏิบัติ — ต้องตั้งกำหนดรอบรายงานก่อน (ระบบเสนอวันครบรอบให้แล้ว)
  const setCycle = p.getByRole('button', { name: 'ตั้งรอบแจ้งเตือน' })
  if (await setCycle.isVisible().catch(() => false)) {
    await d.highlight(p.getByLabel('กำหนดรอบรายงานถัดไป'), 'ระบบเสนอกำหนดรอบรายงานถัดไปให้ ปรับวันได้')
    await d.click(setCycle, { note: 'กด "ตั้งรอบแจ้งเตือน"' })
  }

  const openBtn = p.getByRole('button', { name: /^เปิดรอบรายงานงวด/ })
  await openBtn.first().waitFor({ timeout: 5000 }).catch(() => {})
  if (await openBtn.first().isVisible().catch(() => false)) {
    await d.click(openBtn.first(), { note: 'กด "เปิดรอบรายงาน" ของงวดปัจจุบัน' })
    await d.fill(p.getByRole('textbox').last(), 'บันทึกการปฏิบัติงานประจำงวด รายงานจากหน่วยงานที่ประสานงาน', { note: 'ระบุหลักฐานที่รวบรวมได้ (บรรทัดละรายการ)' })
    await d.click(p.getByRole('button', { name: /เปิดรอบรายงานงวด/ }).last(), { note: 'กดยืนยันเปิดรอบรายงาน' })
  }
  const draftBtn = p.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' })
  if (await draftBtn.isVisible().catch(() => false)) {
    const summary = p.getByLabel('สรุปผลการดำเนินการ')
    if (!(await summary.inputValue().catch(() => '')).trim()) {
      await d.fill(summary, 'ผลปฏิบัติงวดนี้เป็นไปตามแผน ไม่พบเหตุการณ์ผิดปกติ พยานให้ความร่วมมือดี', { note: 'สรุปผลการดำเนินการในรอบนี้' })
    }
    await d.click(draftBtn, { note: 'จัดทำ คบ.13 และส่งลงนาม' })
  }

  await d.goto(DOSSIER)
  await d.click(p.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }), { note: 'เปิด คบ.13 เพื่อลงนามรับรองรายงาน' })
  await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: 'เจ้าหน้าที่ผู้ปฏิบัติลงลายมือชื่อ' })
  await d.sign(people.officer)
  await d.click(p.getByRole('button', { name: 'ลงลายมือชื่อ' }).first(), { note: 'พยานลงลายมือชื่อรับรอง' })
  await d.sign(people.witness)
  await d.pause(800)

  await d.goto(MONITOR)
  await d.click(p.getByRole('button', { name: 'ตรวจรับรายงาน' }), { note: 'ตรวจรับ คบ.13 ที่ลงนามครบแล้ว' })
  await d.click(p.getByRole('button', { name: 'รับรายงานและตรวจผล' }), { note: 'รับรายงานและตรวจผลเทียบวิธีที่อนุมัติ' })
  await d.click(p.getByRole('button', { name: 'ต่ำ', exact: true }), { note: 'เลือกระดับความเสี่ยง' })
  await d.fill(p.getByLabel('ปัญหา/อุปสรรคที่พบ'), 'ไม่พบปัญหาหรือเหตุคุกคามต่อเนื่อง', { note: 'บันทึกปัญหา/อุปสรรคที่พบ' })
  await d.fill(p.getByLabel('ข้อเสนอสำหรับรอบถัดไป'), 'คงมาตรการเดิม', { note: 'ข้อเสนอสำหรับรอบถัดไป' })
  await d.click(p.getByRole('button', { name: 'บันทึกสถานะล่าสุด' }), { note: 'บันทึกสถานะล่าสุดของพยาน' })
  await d.click(p.locator('button.bg-emerald-600').filter({ hasText: 'ล็อกเป็นรอบรายงานใหม่' }), { note: 'ล็อกรอบรายงาน ห้ามแก้ทับ' })
  await d.confirm('ยืนยัน')
  await d.click(p.getByRole('button', { name: 'ประเมิน' }), { note: 'ประเมินว่าคุ้มครองต่อหรือต้องทบทวน' })
  await d.click(p.getByRole('button', { name: /เลือกแขนง ต้องทบทวน/ }), { note: 'เลือกแขนง "ต้องทบทวน"' })
  await d.fill(p.getByLabel('เหตุผลที่ต้องทบทวน'), reviewReason, { note: 'ระบุเหตุผลที่ต้องทบทวน' })
  await d.click(p.getByRole('button', { name: 'ส่งเข้าทบทวนผลการคุ้มครอง' }), { note: 'ส่งทบทวนผลการคุ้มครอง' })
  await d.confirm('ยืนยัน')
  await d.result(p.getByText(/ส่งทบทวนแล้วเมื่อ/), 'ส่งเรื่องเข้าหน้าทบทวนแล้ว พร้อม คบ.13 ความเสี่ยง และยอดวันสะสม')

}

/** 1.14 – 1.19: ทบทวนแล้วเห็นควรยุติ → คบ.15 → อนุมัติยุติ → คบ.16/คบ.17 → พ้นกรอบอุทธรณ์ → ปิดงาน */
export async function reviewToClose(d: GuideDirector, caseNo = GUIDE_CASE_NO) {
  const p = d.page
  const REVIEW = `/protection-review/${caseNo}`
  const TERM = `/termination/${caseNo}`

  // ─────────────── 1.14 ทบทวน → เห็นควรยุติ → คบ.15 ───────────────
  await asRole(d, 'officer', 'ทบทวนผลคุ้มครองและเสนอยุติ', 'เจ้าหน้าที่ทบทวนผลการคุ้มครอง ประเมินความเสี่ยง และเสนอให้เข้าสู่กระบวนการยุติ (ตัวอย่าง: พยานยื่น คบ.7 ขอยุติ)', REVIEW)
  await d.highlight(p.getByTestId('review-outcome-terminate'), 'ระบบรวมข้อมูล คบ.13 ความเสี่ยง และวันคงเหลือให้ครบแล้ว')
  await d.click(p.getByTestId('review-outcome-terminate'), { note: 'เลือกแนวทาง "เข้าสู่กระบวนการยุติ"' })
  await d.check(p.locator('input[name^="termination-trigger"]').first(), { note: 'เหตุเริ่มยุติ: พยานยื่น คบ.7' })
  await d.attach(p.locator('label', { hasText: 'อัปโหลดไฟล์ คบ.7' }).locator('input[type="file"]'), 'คบ7_คำร้องขอยุติการคุ้มครองพยาน.pdf')
  await d.fill(p.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }), 'ความเสี่ยงต่ำ ไม่พบเหตุคุกคามต่อเนื่อง ไม่มีความจำเป็นต้องคุ้มครองต่อ', { note: 'ประเมินความเสี่ยงและความจำเป็น' })
  await d.fill(p.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย'), 'อ้างอิง คบ.13 งวดล่าสุด และ คบ.7 ของพยาน', { note: 'เหตุผลและหลักฐานอ้างอิง' })
  await d.click(p.getByTestId('review-submit-proposal'), { note: 'เสนอผลทบทวน' })
  await d.confirm('ยืนยันเสนอผลทบทวน')

  await d.switchRole('supervisor', 'ผู้บังคับบัญชาเห็นชอบข้อเสนอ', 'ผู้บังคับบัญชาชั้นต้นตรวจข้อเสนอผลทบทวน แล้วเห็นชอบหรือส่งคืนแก้ไข', REVIEW)
  await d.click(p.getByTestId('review-endorse'), { note: 'เห็นชอบข้อเสนอ' })
  await d.confirm('ยืนยันเห็นชอบ')

  await d.switchRole('officer', 'เจ้าหน้าที่จัดทำ คบ.15', 'เจ้าหน้าที่ดำเนินการตามแนวทางที่เห็นชอบ แล้วจัดทำ คบ.15 รายงานการให้ความคุ้มครองสิ้นสุด', REVIEW)
  await d.click(p.getByTestId('review-apply-outcome'), { note: 'ดำเนินการตามแนวทางที่เห็นชอบ' })
  await d.confirm('ยืนยันดำเนินการ')
  await d.click(p.getByRole('link', { name: `เปิดแฟ้ม ${caseNo}` }), { note: 'เปิดแฟ้ม — ระบบแนบแบบ คบ.15 รอกรอกไว้ให้แล้ว' })
  await p.waitForURL(/\/dossier\//)
  const { witness } = await readPeople(p, caseNo)
  await fillDossierForm(
    d,
    'คบ.15',
    [
      { label: /^ชื่อพยาน\/ผู้ได้รับความคุ้มครอง/, value: witness, note: 'ชื่อพยานผู้ได้รับความคุ้มครอง' },
      { label: /^อ้างอิง คบ\.7/, value: 'คบ.7 ของพยาน และ คบ.13 งวดล่าสุด', note: 'อ้างอิง คบ.7 / เหตุยุติ' },
      { label: /^เหตุแห่งการยุติ/, value: 'พยานมีความปลอดภัยอย่างสมบูรณ์ ภัยคุกคามหมดไป', note: 'เหตุแห่งการยุติ' },
      { label: /^สรุปผลการให้ความคุ้มครอง/, value: 'พยานยื่น คบ.7 ติดตามผลแล้วไม่พบภัยคุกคามเพิ่มเติม', note: 'สรุปผลการคุ้มครองและหลักฐานประกอบ' },
    ],
    { rule: /การจัดทำ คบ\.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด/, result: 'บันทึกแบบ คบ.15 แล้ว พร้อมส่งตรวจ' }
  )
  await d.click(formRow(p, 'คบ.15').getByRole('button', { name: 'ส่งตรวจ' }), { note: 'ส่ง คบ.15 ให้ผู้บังคับบัญชาตรวจ' })
  await d.confirm('ส่งตรวจ')
  await d.result(formRow(p, 'คบ.15'), 'เสนอ คบ.15 แล้ว รอผู้บังคับบัญชาตรวจ')

  // ─────────────── 1.15 ผู้บังคับบัญชาตรวจ คบ.15 ───────────────
  await asRole(d, 'supervisor', 'ผู้บังคับบัญชาตรวจ คบ.15', 'ผู้บังคับบัญชาชั้นต้นตรวจเหตุผลและเอกสารประกอบ ถ้าครบถ้วนเสนอผู้มีอำนาจ ถ้าไม่ครบส่งกลับแก้', TERM)
  await d.highlight(p.getByPlaceholder('ความเห็น / เหตุผลที่ส่งคืน'), 'ถ้าไม่ครบถ้วน ใส่เหตุผลแล้วกดส่งคืนแก้ไข')
  await d.click(p.getByRole('button', { name: /ครบถ้วน · เสนอผู้มีอำนาจ/ }), { note: 'คบ.15 ครบถ้วน เสนอผู้มีอำนาจ' })
  await d.confirm('ยืนยันครบถ้วน')
  await d.result(p.getByText('พิจารณาและออกคำสั่งยุติ (คบ.16)').first(), 'เรื่องไปอยู่ที่ผู้มีอำนาจ เพื่อพิจารณาออกคำสั่งยุติ (คบ.16)')

  // ─────────────── 1.16 ผอ. อนุมัติให้ยุติ ───────────────
  await asRole(d, 'director', 'ผอ.สำนัก/กอง อนุมัติให้ยุติ', 'ผู้มีอำนาจตรวจ คบ.7 / คบ.15 และความเห็นผู้บังคับบัญชา แล้วอนุมัติให้ยุติการคุ้มครอง (ถ้าไม่อนุมัติ แฟ้มกลับไปคุ้มครองต่อภายใต้คำสั่งเดิม)', TERM)
  await d.highlight(p.getByText('เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)'), 'สรุป คบ.7 / คบ.15 และความเห็นจากผู้บังคับบัญชา')
  await d.fill(p.getByPlaceholder('ความเห็นประกอบผลพิจารณา'), 'อนุมัติให้ยุติตามที่เสนอ', { note: 'ความเห็นของผู้มีอำนาจ' })
  await d.highlight(p.getByRole('button', { name: 'ไม่อนุมัติ' }), 'ถ้าไม่อนุมัติ ต้องใส่เหตุผล แฟ้มกลับไปคุ้มครองต่อ')
  await d.click(p.getByRole('button', { name: 'อนุมัติให้ยุติ' }), { note: 'อนุมัติให้ยุติ' })
  await d.result(p.getByText(/อนุมัติให้ยุติ/).first(), 'ผู้มีอำนาจอนุมัติให้ยุติแล้ว')

  // ─────────────── 1.17 คำสั่ง คบ.16 และหนังสือ คบ.17 ───────────────
  await asRole(d, 'officer', 'เจ้าหน้าที่ร่างคำสั่งยุติ คบ.16', 'เจ้าหน้าที่ร่างคำสั่งยุติการคุ้มครอง (คบ.16) แล้วเสนอเลขาธิการฯ ลงนาม', TERM)
  await d.fill(p.getByPlaceholder('คำสั่งที่'), '118/2569', { note: 'เลขที่คำสั่งยุติ' })
  await d.fill(p.getByPlaceholder('เหตุยุติตามคำสั่ง'), 'พยานปลอดภัยสมบูรณ์ ภัยคุกคามหมดไป', { note: 'เหตุยุติตามคำสั่ง' })
  await d.fill(p.getByLabel('วันที่ออกคำสั่ง'), isoDaysFromToday(0), { note: 'วันที่ออกคำสั่ง' })
  await d.fill(p.getByLabel('วันที่คำสั่งมีผล'), isoDaysFromToday(1), { note: 'วันที่คำสั่งมีผล' })
  await d.click(p.getByRole('button', { name: 'เปิดแฟ้มคดี' }), { note: 'เปิดแฟ้มเพื่อกรอกแบบ คบ.16' })
  await p.waitForURL(/\/dossier\//)
  await fillDossierForm(
    d,
    'คบ.16',
    [
      { label: /^คำสั่งที่/, value: '118', note: 'เลขที่คำสั่ง' },
      { label: /^ปี พ\.ศ\./, value: '2569', note: 'ปีของคำสั่ง' },
      { label: /^ชื่อพยานที่ยุติการคุ้มครอง/, value: witness, note: 'ชื่อพยานที่ยุติการคุ้มครอง' },
      { label: /^เหตุแห่งการยุติตามคำสั่ง/, value: 'พยานปลอดภัยสมบูรณ์ ภัยคุกคามหมดไป', note: 'เหตุแห่งการยุติตามคำสั่ง' },
      { label: /^วันหยุดปฏิบัติจริงในพื้นที่/, value: isoDaysFromToday(1), note: 'วันหยุดปฏิบัติจริงในพื้นที่' },
    ],
    { result: 'บันทึกแบบ คบ.16 แล้ว พร้อมส่งให้อนุมัติ' }
  )
  await d.click(p.getByRole('button', { name: 'ส่งให้อนุมัติ' }), { note: 'ส่ง คบ.16 ให้ผู้มีอำนาจอนุมัติและลงนาม' })
  await d.confirm('ส่งให้อนุมัติ')

  await d.switchRole('secretary', 'เลขาธิการฯ ลงนามคำสั่ง คบ.16', 'ผู้มีอำนาจลงนามคำสั่งยุติ คบ.16 — สถานะ "ยุติ" เริ่มได้เมื่อมีคำสั่งที่ลงนามแล้วเท่านั้น', TERM)
  await d.click(p.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }), { note: 'ลงนามคำสั่ง คบ.16 — ฉบับถูกล็อก' })

  await d.switchRole('officer', 'เจ้าหน้าที่จัดทำหนังสือ คบ.17', 'เจ้าหน้าที่จัดทำหนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ (คบ.17) เสนอลงนาม', TERM)
  await d.fill(p.getByPlaceholder('ชื่อไฟล์หนังสือ'), 'คบ17_แจ้งคำสั่งยุติ.pdf', { note: 'ชื่อไฟล์ คบ.17' })
  await d.click(p.getByRole('button', { name: 'เปิดแฟ้มคดี' }), { note: 'เปิดแฟ้มเพื่อกรอกแบบ คบ.17' })
  await p.waitForURL(/\/dossier\//)
  await fillDossierForm(
    d,
    'คบ.17',
    [
      { label: /^เรียน/, value: witness, note: 'เรียนผู้ได้รับความคุ้มครอง' },
      { label: /^อ้างถึงคำสั่งยุติที่/, value: '118/2569', note: 'อ้างถึงคำสั่งยุติ คบ.16' },
      { label: /^เหตุแห่งการยุติที่แจ้งให้ทราบ/, value: 'พยานปลอดภัยสมบูรณ์ ภัยคุกคามหมดไป', note: 'เหตุแห่งการยุติที่แจ้งให้ทราบ' },
    ],
    { result: 'บันทึกแบบ คบ.17 แล้ว พร้อมส่งให้ลงนาม' }
  )
  await d.click(p.getByRole('button', { name: 'ส่งให้ลงนาม' }), { note: 'ส่ง คบ.17 ให้เลขาธิการฯ ลงนาม' })
  await d.confirm('ส่งให้ลงนาม')

  await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.17 และออกเลข', 'เลขาธิการฯ ลงนาม คบ.17 แล้วออกเลขหนังสือจากระบบสารบรรณเดิมเพื่อนำส่ง', TERM)
  await d.click(p.getByRole('button', { name: 'ลงนาม คบ.17' }), { note: 'ลงนาม คบ.17' })
  await d.fill(p.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'), 'สลข.0017/2569', { note: 'เลขที่หนังสือจากสารบรรณเดิม' })
  await d.click(p.getByRole('button', { name: 'ออกเลขและนำส่ง คบ.17' }), { note: 'ออกเลขและนำส่ง' })

  await d.switchRole('officer', 'เจ้าหน้าที่บันทึกวันที่พยานได้รับ', 'พยานรับ คบ.17 นอกระบบ เจ้าหน้าที่บันทึกวันที่พยานได้รับจริง ระบบจึงเริ่มนับกรอบอุทธรณ์ 30 วัน', TERM)
  await d.fill(p.getByLabel('วันที่พยานได้รับจริง'), isoDaysFromToday(0), { note: 'วันที่พยานได้รับ คบ.17 จริง' })
  await d.click(p.getByRole('button', { name: 'บันทึกวันที่พยานได้รับ' }), { note: 'บันทึกวันที่ — เริ่มนับอุทธรณ์ 30 วัน' })
  await d.result(p.getByText(/เหลือ \d+ วัน/).first(), 'กรอบอุทธรณ์ 30 วันเริ่มนับแล้ว')

  // ─────────────── 1.18 ยังอยู่ในกรอบอุทธรณ์ ───────────────
  d.section('อยู่ในกรอบอุทธรณ์ 30 วัน — ยังปิดงานไม่ได้', 'พยานได้รับ คบ.17 แล้ว เจ้าหน้าที่เฝ้าดูจำนวนวันที่เหลือ หากมีอุทธรณ์ให้ส่งต่อแท็บ 09B หากไม่มีให้รอพ้นกำหนดก่อนปิดงาน')
  await d.highlight(p.getByText(/เหลือ \d+ วัน/).first(), 'อยู่ในกรอบอุทธรณ์ 30 วัน นับจากวันที่พยานได้รับจริง')
  await d.highlight(p.getByRole('button', { name: /มีอุทธรณ์ภายในกำหนด/ }), 'ถ้ามีอุทธรณ์ภายในกำหนด กดที่นี่แล้วไปแท็บ 09B')
  await d.highlight(p.getByRole('button', { name: /ไม่มีอุทธรณ์ \/ พ้นกำหนด/ }), 'ปุ่มปิดงานยังกดไม่ได้จนกว่าจะพ้นกำหนด 30 วัน')

  // ─────────────── ข้ามเวลา (สาธิต) ───────────────
  d.section('ข้ามเวลา 30 วัน (สำหรับสาธิต)', 'ในการใช้งานจริงต้องรอพ้นกรอบอุทธรณ์ 30 วัน')
  await skipDays(d, caseNo, 31)
  await d.highlight(p.getByText(/พ้นกำหนดแล้ว/).first(), 'ผ่านไป 31 วันนับจากวันที่พยานได้รับ คบ.17 — พ้นกรอบอุทธรณ์ 30 วันแล้ว')

  // ─────────────── 1.19 ปิดงานคุ้มครอง ───────────────
  d.section('ปิดงานคุ้มครอง', 'พ้นกรอบอุทธรณ์ 30 วันแล้วและไม่มีอุทธรณ์ เจ้าหน้าที่ปิดงานคุ้มครอง แฟ้มเปลี่ยนเป็นยุติและเอกสารถูกล็อก')
  await d.click(p.getByRole('button', { name: /ไม่มีอุทธรณ์ \/ พ้นกำหนด/ }), { note: 'ปิดงานคุ้มครอง' })
  await d.result(p.getByText(/ปิดงานคุ้มครองแล้วเมื่อ/), 'แฟ้มเป็นสถานะ "ยุติ" เอกสารถูกล็อก — จบกระบวนการ')
}
