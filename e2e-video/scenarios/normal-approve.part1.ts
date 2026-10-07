import type { Locator, Page } from '@playwright/test'
import type { Director } from '../director'
import type { CheckpointScript } from '../types'

/**
 * เส้นทางปกติ ช่วงแรก (Case 1 – 1.9)
 * ธุรการตรวจแฟ้มแล้วส่ง ผอ. (ไม่เชื่อมโยงคดีหลัก) → ผอ. มอบหมาย → เจ้าของสำนวนเชื่อมโยงคดีหลัก แล้วทำ คบ.3/คบ.6 → ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ
 * → เลขาธิการฯ อนุมัติ → เจ้าหน้าที่เสนอ คบ.9 → เลขาธิการฯ ลงนาม คบ.9
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`

/** ปุ่ม "ส่งต่อ" ของการ์ดส่งงาน แล้วยืนยัน */
async function forwardCase(d: Director, note: string, confirmNote: string) {
  const btn = d.page.getByTestId('forward-case-button')
  await d.scrollTo(btn)
  await d.highlight(btn, 'ปุ่มส่งต่อ — ชื่อปุ่มบอกว่าจะส่งให้ใคร', 1600)
  await d.click(btn, { note, after: 500 })
  await d.confirm('ยืนยันส่งต่อ', confirmNote)
}

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** ไฮไลต์ข้อมูลหัวแฟ้ม (เลขที่คำร้อง/สถานะ) ที่ผู้เรียนต้องเห็นทุกครั้งที่เปิดแฟ้ม */
async function showCaseHeader(d: Director, note: string) {
  await d.highlight(d.page.getByRole('heading', { name: new RegExp(CASE_NO) }).first(), note, 1500)
}

/** ลงนามความเห็น คบ.6 ข้อที่กำหนดจากหน้าแบบฟอร์ม แล้วลงลายมือชื่ออิเล็กทรอนิกส์ */
async function signKb6(d: Director, no: string, label: string, opinion: string, who: string) {
  const { page } = d
  await d.goto(DOSSIER_URL)
  const row = formRow(page, 'คบ.6')
  await d.scrollTo(row)
  await d.highlight(row, 'แบบ คบ.6 — บันทึกเสนอความเห็นตามลำดับชั้น', 1400)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'กด "เปิดแบบฟอร์ม" ของ คบ.6' })
  await page.waitForURL(/\/form\/6/)
  await d.pause(800)
  const area = areaField(page, `${no}. ${label}`)
  await d.scrollTo(area)
  if (!(await area.inputValue())) {
    await d.fill(area, opinion, { note: `${who} บันทึกความเห็นข้อ ${no}` })
  } else {
    await d.highlight(area, `ความเห็นข้อ ${no} ของ${who}`)
  }
  await d.click(page.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กด "ลงนาม" เพื่อลงลายมือชื่ออิเล็กทรอนิกส์' })
  const nameInput = page.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await d.pause(800)
  if (!(await nameInput.inputValue())) await d.fill(nameInput, who, { note: 'ชื่อผู้ลงนาม' })
  else await d.highlight(nameInput, 'ระบบใส่ชื่อผู้ลงนามให้อัตโนมัติ')
  await d.check(page.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองว่าเป็นลายมือชื่อของตนเอง' })
  await d.click(page.getByTestId('signature-confirm-button'), { note: 'กด "ยืนยัน" เพื่อลงนาม', after: 1500 })
}

export const steps: Record<string, CheckpointScript> = {
  'Case 1': {
    // ธุรการตรวจแฟ้มที่รับเข้าทะเบียน — ไม่เชื่อมโยงคดีหลัก เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง (WIT0203, 0206)
    detail:
      'ธุรการเปิดแฟ้มคำร้องที่รับเข้าทะเบียนแล้ว ตรวจข้อมูลผู้ส่งและเอกสารแนบ ธุรการไม่ต้องเชื่อมโยงคดีหลัก เพราะเจ้าของสำนวนที่ ผอ. มอบหมายจะเป็นผู้เชื่อมโยงภายหลัง',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'เลขที่คำร้องของแฟ้มที่ธุรการรับเข้าระบบ')
      await d.highlight(page.getByText('สรุปข้อมูลแฟ้ม').first(), 'สรุปข้อมูลแฟ้ม: ผู้ส่ง ช่องทาง และสถานะปัจจุบัน', 2200)
      const attach = page.getByText('เอกสารหลักฐานและไฟล์แนบ').first()
      if (await attach.count()) {
        await d.scrollTo(attach)
        await d.highlight(attach, 'เอกสารที่สแกนจากต้นทางถูกแนบไว้ในแฟ้ม', 2000)
      }
      // การ์ดเชื่อมโยงคดีหลักถูกซ่อนสำหรับธุรการ — บอกเป็นข้อความในรายการงานแทน
      const deferred = page.getByText(/ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง/).first()
      if (await deferred.count()) {
        await d.scrollTo(deferred)
        await d.highlight(deferred, 'ธุรการไม่ต้องเชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง', 2600)
      }
    },
  },

  'Case 1.1': {
    // ธุรการส่งต่อ ผอ. มอบหมายเจ้าของสำนวน (WIT0216)
    detail: 'ธุรการตรวจความครบถ้วนของรายการงานในขั้นนี้ (คดีหลักไม่ได้เป็นเงื่อนไขของธุรการ) แล้วส่งแฟ้มต่อให้ ผู้อำนวยการสำนัก/กอง เพื่อมอบหมายเจ้าของสำนวน',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มเลขเดิม — ตอนนี้ยังอยู่ที่ขั้นรับเรื่อง')
      const checklist = page.getByText('ส่งงานและดำเนินการในขั้นตอนนี้').first()
      if (await checklist.count()) {
        await d.scrollTo(checklist)
        await d.highlight(checklist, 'รายการที่ต้องทำในขั้นนี้ — ครบแล้วจึงส่งต่อได้', 2200)
      }
      const deferred = page.getByText(/ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง/).first()
      if (await deferred.count()) await d.highlight(deferred, 'เรื่องคดีหลักรอเจ้าของสำนวน — ไม่ขวางการส่งต่อ', 2400)
      await forwardCase(d, 'กด "ส่งต่อ" เพื่อส่ง ผอ. มอบหมายเจ้าของสำนวน', 'ยืนยันส่งต่อให้ ผอ.สำนัก/กอง')
      await d.pause(1200)
      await d.highlight(page.locator('main').first(), 'แฟ้มถูกส่งแล้ว — สถานะรอ ผอ. มอบหมายเจ้าของสำนวน', 2200)
    },
  },

  'Case 1.2': {
    // ผอ. มอบหมายเจ้าของสำนวน (WIT0301-0303)
    detail: 'ผู้อำนวยการสำนัก/กองรับแฟ้มที่ธุรการส่งมา เห็นข้อมูลคดีหลักแบบอ่านอย่างเดียว (ผู้เชื่อมโยงคือเจ้าของสำนวน) เลือกเจ้าหน้าที่เจ้าของสำนวน แล้วส่งต่อให้เจ้าหน้าที่เริ่มทำงาน',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอ ผอ. มอบหมาย')
      const card = page.getByText('รอมอบหมายเจ้าของสำนวน').first()
      await d.scrollTo(card)
      await d.highlight(card, 'สถานะ: รอมอบหมายเจ้าของสำนวน', 2000)
      const info = page.getByText(/ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายจะเป็นผู้เชื่อมโยง/).first()
      if (await info.count()) await d.highlight(info, 'ผอ. ไม่ต้องเชื่อมโยงคดีหลัก — เจ้าของสำนวนที่มอบหมายจะเป็นผู้เชื่อมโยง', 2600)
      const select = page.locator('select').first()
      if (await select.count()) await d.highlight(select, 'เลือกเจ้าหน้าที่ที่จะเป็นเจ้าของสำนวน', 2600)
      await d.click(page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }), { note: 'กด "มอบหมายเจ้าของสำนวน"', after: 1200 })
      await d.highlight(page.getByText(/มอบหมายแล้ว:/).first(), 'ระบบแสดงชื่อเจ้าของสำนวนที่ได้รับมอบหมาย', 2200)
      await forwardCase(d, 'กด "ส่งต่อ" เพื่อส่งแฟ้มให้เจ้าของสำนวน', 'ยืนยันส่งต่อให้เจ้าหน้าที่เจ้าของสำนวน')
    },
  },

  'Case 1.3': {
    // เจ้าของสำนวนเชื่อมโยงคดีหลัก (WIT0212-0214) + ประเมินความเร่งด่วน + จัดทำ คบ.3/คบ.6 แล้วส่ง ผบช.ชั้นต้น (WIT0304-0309, 0401-0505)
    detail:
      'เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงเลขสำนวนคดีหลักก่อน แล้วประเมินความเร่งด่วน (กรณีปกติ) จัดทำ คบ.3 และ คบ.6 ให้ครบ แล้วส่งให้ผู้บังคับบัญชาชั้นต้นกลั่นกรอง',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'เจ้าหน้าที่เป็นเจ้าของสำนวนแล้ว')
      // เชื่อมโยงคดีหลัก — เฉพาะเจ้าของสำนวนที่ได้รับมอบหมายทำได้
      const link = page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })
      await d.scrollTo(link)
      await d.highlight(page.getByText('คดีหลักและการประเมินภัย').first(), 'เจ้าของสำนวนเป็นผู้เชื่อมโยงคดีหลัก — ระบบเสนอเลขสำนวนจากกิจกรรมที่ 4/5 ให้ตรวจสอบ', 2600)
      await d.click(link, { note: 'ตรวจเลขคดีหลักแล้วกด "ยืนยันเชื่อมโยงคดี"', after: 1200 })
      await d.highlight(page.getByText('เชื่อมโยงแล้ว').first(), 'สถานะเปลี่ยนเป็น "เชื่อมโยงแล้ว" — ส่งต่อในขั้นถัดไปได้', 2200)
      const warn = page.getByText('ต้องเลือกก่อนจึงจะส่งต่อได้').first()
      await d.scrollTo(warn)
      await d.highlight(warn, 'ต้องประเมินความเร่งด่วนก่อน จึงจะส่งต่อได้', 2200)
      await d.click(page.getByRole('button', { name: 'กรณีปกติ (→ คบ.3 → คบ.6)' }), { note: 'เลือก "กรณีปกติ" — ต้องทำ คบ.3 แล้ว คบ.6', after: 1400 })
      await d.highlight(page.getByText('ความเร่งด่วน:').first(), 'สรุปข้อมูลแฟ้มแสดงผล "ปกติ" ตรงกับที่ประเมิน', 2000)

      // คบ.3 — ข้อเท็จจริงประกอบคำร้อง
      let row = formRow(page, 'คบ.3')
      await d.scrollTo(row)
      await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.3 บันทึกข้อเท็จจริง' })
      await page.waitForURL(/\/form\/3/)
      await d.pause(800)
      const facts = areaField(page, 'ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ')
      await d.scrollTo(facts)
      await d.fill(facts, 'พยานถูกข่มขู่ทางโทรศัพท์และมีผู้ติดตามที่พักหลังให้ถ้อยคำต่อเจ้าหน้าที่ ป.ป.ช. เกรงว่าจะเป็นอันตรายต่อตนเองและครอบครัว', {
        note: 'กรอกพฤติการณ์แห่งความไม่ปลอดภัย',
      })
      await d.click(page.getByRole('button', { name: 'บันทึกแบบ คบ.3' }), { note: 'กด "บันทึกแบบ คบ.3"', after: 1500 })

      // คบ.6 — บันทึกเสนอความเห็น (ระดับเจ้าหน้าที่)
      await d.goto(DOSSIER_URL)
      row = formRow(page, 'คบ.6')
      await d.scrollTo(row)
      await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6 บันทึกเสนอความเห็น' })
      await page.waitForURL(/\/form\/6/)
      await d.pause(800)
      const a11 = areaField(page, '11. ความเห็นผู้อำนวยการสำนัก')
      await d.scrollTo(a11)
      await d.highlight(a11, 'ข้อ 11-13 ถูกล็อก — เป็นความเห็นของ ผอ./รองเลขาธิการฯ/เลขาธิการฯ เจ้าหน้าที่กรอกไม่ได้', 2800)
      const f11 = page.locator('label:has-text("1.1 ได้รับคำร้อง")').locator('xpath=following-sibling::input[1]')
      await d.scrollTo(f11)
      if (!(await f11.inputValue())) await d.fill(f11, 'นางสาวกมลชนก บุญรักษา', { note: 'ช่องบังคับ 1.1 ผู้ยื่นคำร้อง' })
      const f22 = page.locator('label:has-text("2.2 ชื่อ-สกุล พยาน")').locator('xpath=following-sibling::input[1]')
      if (!(await f22.inputValue())) await d.fill(f22, 'นางสาวกมลชนก บุญรักษา', { note: 'ช่องบังคับ 2.2 ชื่อพยาน' })
      await d.click(page.getByRole('button', { name: 'บันทึกแบบ คบ.6' }), { note: 'กด "บันทึกแบบ คบ.6"', after: 1500 })

      await d.goto(DOSSIER_URL)
      await forwardCase(d, 'กด "ส่งต่อ" ให้ผู้บังคับบัญชาชั้นต้นกลั่นกรอง', 'ยืนยันส่งต่อให้ผู้บังคับบัญชาชั้นต้น')
    },
  },

  'Case 1.4': {
    // ผบช.ชั้นต้นกลั่นกรอง ลงนามข้อ 10 แล้วส่ง ผอ. (WIT0506-0510)
    detail: 'ผู้บังคับบัญชาชั้นต้นตรวจ คบ.3 และ คบ.6 ที่เจ้าหน้าที่จัดทำ ลงนามความเห็นข้อ 10 แล้วส่งต่อให้ ผอ.สำนัก/กอง',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอผู้บังคับบัญชาชั้นต้นกลั่นกรอง')
      const forms = page.getByTestId('dossier-forms')
      await d.scrollTo(forms)
      await d.highlight(forms, 'ตรวจแบบ คบ.3 / คบ.6 ที่เจ้าหน้าที่จัดทำไว้', 2400)
      await signKb6(d, '10', 'ความเห็นผู้บังคับบัญชาชั้นต้น', 'เห็นชอบตามที่เจ้าหน้าที่เสนอ เห็นควรเสนอ ผอ.สำนัก/กอง พิจารณาต่อ', 'นายกิตติศักดิ์ ธรรมรักษ์')
      await d.goto(DOSSIER_URL)
      await d.highlight(page.getByText(/ลงนามแล้ว/).first(), 'ข้อ 10 ลงนามแล้ว — ปุ่มส่งต่อพร้อมใช้งาน', 2000)
      await forwardCase(d, 'กด "ส่งต่อ" ให้ ผอ.สำนัก/กอง', 'ยืนยันส่งต่อให้ ผอ.สำนัก/กอง')
    },
  },

  'Case 1.5': {
    // ผอ. ลงนามข้อ 11 แล้วส่งรองเลขาธิการฯ (WIT0511-0513)
    detail: 'ผู้อำนวยการสำนัก/กองตรวจชุดเสนอ บันทึกความเห็นข้อ 11 ใน คบ.6 และลงนาม แล้วส่งต่อให้รองเลขาธิการ ป.ป.ท.',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอ ผอ.สำนัก/กองพิจารณา')
      await signKb6(d, '11', 'ความเห็นผู้อำนวยการสำนัก', 'เห็นชอบตามความเห็นของผู้บังคับบัญชาชั้นต้น เห็นควรเสนอรองเลขาธิการ ป.ป.ท.', 'นายวีระยุทธ พิทักษ์ธรรม')
      await d.goto(DOSSIER_URL)
      await forwardCase(d, 'กด "ส่งต่อ" ให้รองเลขาธิการ ป.ป.ท.', 'ยืนยันส่งต่อให้รองเลขาธิการ ป.ป.ท.')
      await d.highlight(page.locator('main').first(), 'ข้อ 10 และ 11 ลงนามแล้ว และถูกล็อกแก้ไขไม่ได้', 2000)
    },
  },

  'Case 1.6': {
    // รองเลขาธิการฯ ลงนามข้อ 12 แล้วส่งเลขาธิการฯ (WIT0514-0517)
    detail: 'รองเลขาธิการ ป.ป.ท. กลั่นกรองชุดเสนอ คบ.1 / คบ.3 / คบ.6 ลงนามความเห็นข้อ 12 แล้วเสนอเลขาธิการ ป.ป.ท.',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอรองเลขาธิการฯ กลั่นกรอง')
      await signKb6(d, '12', 'ความเห็นรองเลขาธิการฯ', 'เห็นชอบตามที่ ผอ.สำนัก/กอง เสนอ เห็นควรเสนอเลขาธิการ ป.ป.ท. พิจารณาอนุมัติ', 'นายพิพัฒน์ ศรีสุวรรณ')
      await d.goto(DOSSIER_URL)
      await forwardCase(d, 'กด "ส่งต่อ" ให้เลขาธิการ ป.ป.ท.', 'ยืนยันส่งต่อให้เลขาธิการ ป.ป.ท.')
      await d.highlight(page.locator('main').first(), 'แฟ้มไปรอเลขาธิการฯ พิจารณาชี้ขาด', 2000)
    },
  },

  'Case 1.7': {
    // เลขาธิการฯ ลงนามข้อ 13 และอนุมัติ (WIT0518, WIT0701-0705)
    detail: 'เลขาธิการ ป.ป.ท. ตรวจแฟ้มทั้งชุด ลงนามความเห็นข้อ 13 แล้วสั่งการชี้ขาด "อนุมัติ" ให้คุ้มครองพยาน',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอเลขาธิการ ป.ป.ท. พิจารณา')
      const approve = page.getByTestId('approve-case-button')
      await d.scrollTo(approve)
      await d.highlight(approve, 'ปุ่มอนุมัติยังกดไม่ได้ — ต้องลงนามข้อ 13 ใน คบ.6 ก่อน', 2600)
      await signKb6(d, '13', 'ความเห็นเลขาธิการฯ', 'อนุมัติให้ความคุ้มครองพยานตามที่เสนอ', 'นายสุรศักดิ์ ธรรมพิทักษ์')
      await d.goto(DOSSIER_URL)
      await d.scrollTo(approve)
      await d.highlight(page.getByText('คำสั่งชี้ขาดของเลขาธิการ ป.ป.ท.').first(), 'การ์ดคำสั่งชี้ขาด: อนุมัติ / ไม่อนุมัติ / ส่งกลับ / ข้อ 14', 2600)
      await d.click(approve, { note: 'กด "อนุมัติและลงนามคำสั่ง"', after: 1000 })
      const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
      await dialog.waitFor()
      await d.highlight(dialog.getByTestId('decision-ref-case-no-input'), 'ระบบใส่เลขแฟ้มให้ — ต้องตรงกับคำร้อง', 2200)
      await d.fill(dialog.getByRole('textbox').nth(1), 'ปปท. 88/2569', { note: 'กรอกเลขที่คำสั่ง' })
      await d.fill(
        dialog.getByTestId('decision-reason-input'),
        'ตรวจทานข้อเท็จจริง พฤติการณ์ภัยคุกคาม และความเห็นตามลำดับชั้นครบถ้วนแล้ว มีเหตุผลสมควรได้รับการคุ้มครองพยานด้วยวิธีที่ 1',
        { note: 'กรอกเหตุผลประกอบคำสั่ง' }
      )
      await dialog.getByTestId('decision-destination-select').selectOption('original_owner')
      await d.highlight(dialog.getByTestId('decision-recipient'), 'เลือกเจ้าของสำนวนเดิมและตรวจชื่อผู้รับ', 1200)
      await d.click(page.getByTestId('decision-confirm-button'), { note: 'ตรวจสอบก่อนส่งงาน', after: 800 })
      await d.click(page.getByTestId('decision-confirm-button'), { note: 'ยืนยันอนุมัติและส่งงานให้เจ้าของสำนวนเดิม', after: 1500 })
      await dialog.waitFor({ state: 'detached' })
      await d.highlight(page.getByText(/อนุมัติแล้ว/).first(), 'สถานะ: อนุมัติแล้ว · รอจัดทำ คบ.9 / คบ.11', 2600)
    },
  },

  'Case 1.8': {
    // เจ้าหน้าที่จัดทำ คบ.9 แล้วเสนอเลขาธิการฯ ลงนาม (WIT0804-0805)
    detail: 'เจ้าของสำนวนรับผลอนุมัติ ตรวจเลขที่คำสั่งและผู้ลงนาม จัดทำหนังสือแจ้งตอบรับ คบ.9 แล้วเสนอเลขาธิการฯ ลงนาม',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มเดิมที่ได้รับอนุมัติแล้ว')
      await d.highlight(page.getByText(/อนุมัติแล้ว/).first(), 'สถานะ: อนุมัติแล้ว · รอจัดทำ คบ.9 / คบ.11', 2200)
      const notice = page.getByText('ขั้นที่ 5 · จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล').first()
      await d.scrollTo(notice)
      await d.highlight(notice, 'ขั้นที่ 5: จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล', 2200)
      const kb9Link = page.getByRole('link', { name: /คบ\.9/ }).first()
      await d.click(kb9Link, { note: 'เปิดแบบ คบ.9 หนังสือแจ้งตอบรับ' })
      await page.waitForURL(/\/form\/9/)
      await d.pause(1000)
      await d.highlight(page.locator('main').first(), 'แบบ คบ.9 อ้างอิงผลอนุมัติฉบับลงนาม — ตรวจข้อมูลก่อนเสนอ', 2600)
      const save = page.getByRole('button', { name: /บันทึกแบบ คบ\.9/ })
      if (await save.count()) await d.click(save, { note: 'กด "บันทึกแบบ คบ.9"', after: 1500 })
      await d.goto(DOSSIER_URL)
      const submit = page.getByRole('button', { name: 'เสนอเลขาธิการฯ ลงนาม คบ.9' })
      await d.scrollTo(submit)
      await d.click(submit, { note: 'กด "เสนอเลขาธิการฯ ลงนาม คบ.9"', after: 1500 })
      await d.highlight(page.getByText('รอเลขาธิการฯ ลงนามในแบบฟอร์ม').first(), 'คบ.9 รอเลขาธิการฯ ลงนาม', 2400)
    },
  },

  'Case 1.9': {
    // เลขาธิการฯ ลงนาม คบ.9 (WIT0805)
    detail: 'เลขาธิการ ป.ป.ท. เปิดหนังสือแจ้งตอบรับ คบ.9 ที่เจ้าหน้าที่เสนอมา ตรวจข้อความแล้วลงนามเพื่อส่งถึงพยาน',
    run: async (d) => {
      const { page } = d
      await showCaseHeader(d, 'แฟ้มที่รอเลขาธิการฯ ลงนาม คบ.9')
      const notice = page.getByText('รอบลงนาม คบ.8 / คบ.9 ก่อนส่งออกภายนอก').first()
      await d.scrollTo(notice)
      await d.highlight(notice, 'รอบลงนามหนังสือส่งออก — คบ.9 รอเลขาธิการฯ', 2200)
      await d.click(page.getByRole('link', { name: /คบ\.9/ }).first(), { note: 'เปิดแบบ คบ.9 เพื่อลงนาม' })
      await page.waitForURL(/\/form\/9/)
      await d.pause(1000)
      await d.highlight(page.locator('main').first(), 'ตรวจข้อความหนังสือแจ้งตอบรับก่อนลงนาม', 2400)
      // การลงนามทำจากปุ่ม "ลงนาม" ของแถว คบ.9 ในรายการแบบฟอร์มของแฟ้ม
      await d.goto(DOSSIER_URL)
      const row = formRow(page, 'คบ.9')
      await d.scrollTo(row)
      await d.click(row.getByRole('button', { name: 'ลงนาม' }), { note: 'กด "ลงนาม" ที่แถว คบ.9' })
      await d.highlight(page.getByText('ถึงคิวลงนามของท่าน').first(), 'ระบบแจ้งว่าถึงคิวลงนามของเลขาธิการฯ แล้ว', 1800)
      await d.click(page.getByRole('button', { name: 'ลงนาม คบ.9' }), { note: 'กด "ลงนาม คบ.9"' })
      const nameInput = page.getByTestId('signature-name-input')
      await nameInput.waitFor()
      await d.pause(800)
      if (!(await nameInput.inputValue())) await d.fill(nameInput, 'นายสุรศักดิ์ ธรรมพิทักษ์', { note: 'ชื่อผู้ลงนาม' })
      else await d.highlight(nameInput, 'ระบบใส่ชื่อผู้ลงนามให้อัตโนมัติ')
      await d.check(page.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองลายมือชื่อ' })
      await d.click(page.getByTestId('signature-confirm-button'), { note: 'กด "ยืนยัน" เพื่อลงนาม คบ.9', after: 1500 })
      await d.goto(DOSSIER_URL)
      await d.highlight(page.getByText(/ลงนามแล้ว/).first(), 'คบ.9 ลงนามแล้ว — เจ้าหน้าที่นำส่งถึงพยานได้', 2600)
    },
  },
}
