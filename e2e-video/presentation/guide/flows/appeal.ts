import type { Locator, Page } from '@playwright/test'
import { isoDaysFromToday } from '../../../director'
import type { GuideDirector } from '../guide-director'
import { GUIDE_CASE_NO, type GuideFlow } from '../types'

/**
 * ทางแยก 2 — เลขาธิการฯ ไม่อนุมัติ → คบ.10 แจ้งสิทธิอุทธรณ์ → พยานอุทธรณ์ → คณะกรรมการวินิจฉัย → แจ้งผล
 * (พัฒนาด้วยเรื่อง 000501 ผ่าน runAppeal(d, caseNo) — ค่าตั้งต้นคือเรื่องของคู่มือ)
 */

/** แถวของแบบ คบ. ในการ์ด "แบบฟอร์ม คบ. ในแฟ้มนี้" */
const formRow = (page: Page, code: string): Locator =>
  page.getByTestId('dossier-forms').locator('div.rounded-xl', { has: page.getByText(code, { exact: true }) })

/** ช่องกรอกของ FormKit หาจากป้ายข้อความ (ไม่มี htmlFor) */
const areaField = (page: Page, label: string): Locator =>
  page.locator(`label:text-is("${label}")`).locator('xpath=following-sibling::textarea[1]')

/** ไล่เสนอแฟ้มอุทธรณ์ทีละชั้น — ผู้ใช้แต่ละชั้นกรอกความเห็นแล้วกดส่งต่อ */
async function opinionLayer(d: GuideDirector, note: string, hint: string, confirmNote: string) {
  await d.fill(d.page.getByTestId('appeal-opinion-note'), note, { note: hint })
  await d.click(d.page.getByTestId('appeal-opinion-submit'), { note: 'กดบันทึกความเห็นและส่งต่อ' })
  await d.confirm('ยืนยัน', confirmNote)
}

export async function runAppeal(d: GuideDirector, caseNo: string = GUIDE_CASE_NO) {
  const p = d.page
  const dossier = `/dossier/${caseNo}`
  const appealUrl = `/appeal-folder/${caseNo}`

  // ───── 1. เลขาธิการฯ ลงนามข้อ 13 และไม่อนุมัติ ─────
  d.section('เลขาธิการฯ ลงนามข้อ 13 และไม่อนุมัติคุ้มครอง')
  const reject = p.getByTestId('reject-case-button')
  await d.scrollTo(reject)
  await d.highlight(reject, 'ปุ่มไม่อนุมัติ ยังกดไม่ได้ ต้องลงนามข้อ 13 ใน คบ.6 ก่อน')
  const row = formRow(p, 'คบ.6')
  await d.scrollTo(row)
  await d.click(row.getByRole('link', { name: 'เปิดแบบฟอร์ม' }), { note: 'เปิดแบบ คบ.6' })
  await p.waitForURL(/\/form\/6/)
  await d.pause()
  const area = areaField(p, '13. ความเห็นเลขาธิการฯ')
  await d.scrollTo(area)
  if (!(await area.inputValue())) {
    await d.fill(area, 'ไม่เห็นควรอนุมัติให้ความคุ้มครองพยาน เนื่องจากข้อเท็จจริงไม่เข้าเงื่อนไขการคุ้มครอง', { note: 'บันทึกความเห็นข้อ 13' })
  } else {
    await d.highlight(area, 'ความเห็นข้อ 13 ของเลขาธิการฯ')
  }
  await d.click(p.getByRole('button', { name: /^ลงนาม$/ }), { note: 'กดลงนาม' })
  const nameInput = p.getByTestId('signature-name-input')
  await nameInput.waitFor()
  await d.pause()
  if (!(await nameInput.inputValue())) await d.fill(nameInput, 'นายสุรศักดิ์ ธรรมพิทักษ์', { note: 'ชื่อผู้ลงนาม' })
  else await d.highlight(nameInput, 'ระบบใส่ชื่อผู้ลงนามให้')
  await d.check(p.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองลายมือชื่อ' })
  await d.click(p.getByTestId('signature-confirm-button'), { note: 'ยืนยันลงนาม', after: 1500 })

  await d.goto(dossier)
  await d.scrollTo(reject)
  await d.click(reject, { note: 'กด "ไม่อนุมัติคุ้มครอง"', after: 1000 })
  const dialog = p.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await d.fill(dialog.getByRole('textbox').nth(1), 'ปปท. 91/2569', { note: 'กรอกเลขที่คำสั่ง' })
  await d.fill(dialog.getByRole('textbox').last(), 'พิจารณาแล้วข้อเท็จจริงและภัยคุกคามยังไม่เข้าเงื่อนไขการคุ้มครองพยาน จึงไม่อนุมัติ', { note: 'กรอกเหตุผล' })
  await d.click(p.getByTestId('decision-confirm-button'), { note: 'กด "ยืนยันและส่งผล"', after: 1500 })
  await dialog.waitFor({ state: 'detached' })
  await d.result(p.getByText(/ไม่อนุมัติ/).first(), 'สถานะ: ไม่อนุมัติ รอจัดทำ คบ.10')

  // ชื่อพยานของแฟ้ม (ใช้เป็นผู้รับหนังสือ/ชื่อไฟล์) — ไม่ตรึงชื่อเรื่องใดเรื่องหนึ่ง
  const headText = (await p.getByText(/ผู้ขอรับการคุ้มครอง:/).first().textContent()) ?? ''
  const witness = headText.replace(/.*ผู้ขอรับการคุ้มครอง:\s*/, '').trim() || 'พยาน'

  // ───── 2. คบ.10 แจ้งผลไม่อนุมัติและสิทธิอุทธรณ์ ─────
  await d.switchRole('officer', 'เจ้าหน้าที่ตรวจร่าง คบ.10 และเสนอกลั่นกรอง', 'คบ.10 แจ้งเหตุผลที่ไม่อนุมัติและสิทธิอุทธรณ์ภายใน 30 วัน', dossier)
  await d.highlight(p.getByTestId('kb10-readiness-note'), 'ร่าง คบ.10 แจ้งเหตุผลและสิทธิอุทธรณ์ 30 วัน')
  await d.fill(p.getByTestId('kb10-readiness-note'), 'ตรวจร่าง คบ.10 ครบถ้วนตามผลพิจารณา มีเหตุผล ฐานการพิจารณา และสิทธิอุทธรณ์ 30 วัน', {
    note: 'บันทึกผลตรวจร่าง คบ.10',
  })
  await d.click(p.getByTestId('kb10-submit-screening'), { note: 'กดเสนอกลั่นกรอง' })
  await d.confirm('ยืนยันเสนอกลั่นกรอง', 'ยืนยันเสนอ คบ.10 ให้รองเลขาธิการฯ')

  await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ กลั่นกรอง คบ.10', 'ตรวจว่าข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบ', dossier)
  await d.fill(p.getByTestId('kb10-deputy-note'), 'ข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบถ้วน', { note: 'บันทึกผลกลั่นกรอง' })
  await d.click(p.getByTestId('kb10-deputy-pass'), { note: 'กลั่นกรองผ่าน' })
  await d.confirm('ยืนยันกลั่นกรองผ่าน', 'ยืนยันกลั่นกรองผ่าน ส่งเลขาธิการฯ ลงนาม')

  await d.switchRole('secretary', 'เลขาธิการฯ ลงนาม คบ.10', 'เมื่อลงนามแล้ว ฉบับถูกล็อก', dossier)
  const forms = p.getByTestId('dossier-forms')
  await d.scrollTo(forms)
  await d.highlight(forms, 'คบ.10 รอเลขาธิการฯ ลงนาม')
  await d.click(forms.getByRole('button', { name: 'ลงนาม' }), { note: 'เปิดดูฉบับพิมพ์ก่อนลงนาม' })
  await d.pause()
  await d.click(p.getByRole('button', { name: 'ลงนาม' }).last(), { note: 'กดลงนาม' })
  const kb10Name = p.getByTestId('signature-name-input')
  if (!(await kb10Name.inputValue())) await d.fill(kb10Name, 'นายสุรศักดิ์ ธรรมพิทักษ์', { note: 'ชื่อผู้ลงนาม' })
  await d.check(p.getByTestId('signature-certify-checkbox'), { note: 'ติ๊กรับรองลายมือชื่อ' })
  await d.click(p.getByTestId('signature-confirm-button'), { note: 'ยืนยันลงนาม' })
  await d.result(forms.getByText('ลงนามแล้ว').first(), 'คบ.10 ลงนามแล้ว ฉบับถูกล็อก')

  await d.switchRole('officer', 'เจ้าหน้าที่นำส่ง คบ.10 และบันทึกวันที่พยานรับ', 'บันทึกวันที่พยานได้รับจริงเพื่อเริ่มนับ 30 วัน', dossier)
  const dispatch = p.getByText('การนำส่งหนังสือและวันที่พยานได้รับ').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await d.scrollTo(dispatch)
  await d.click(dispatch.getByRole('button', { name: 'บันทึกการนำส่ง' }), { note: 'บันทึกการนำส่ง' })
  await d.fillDate(dispatch.locator('input[type="date"]'), isoDaysFromToday(-5), 'วันที่พยานได้รับหนังสือจริง')
  await d.fill(dispatch.locator('label', { hasText: 'ผู้รับหนังสือ' }).locator('xpath=following-sibling::*[1]'), witness, { note: 'ชื่อผู้รับหนังสือ' })
  await d.attach(
    dispatch.locator('label', { hasText: 'เลือกไฟล์อัปโหลด' }).locator('input[type="file"]'),
    'ใบตอบรับ-EMS.pdf',
    'แนบใบตอบรับไปรษณีย์'
  )
  await d.click(dispatch.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }), { note: 'ยืนยันการรับหนังสือ' })
  await d.result(p.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน').first(), 'ระบบเริ่มนับกรอบอุทธรณ์ 30 วัน จากวันที่พยานได้รับ')

  // ───── 3. พยานยื่นอุทธรณ์ — เจ้าหน้าที่รับเข้าแฟ้มเดิม ─────
  d.section('พยานยื่นอุทธรณ์ — เจ้าหน้าที่รับเข้าแฟ้มเดิม', 'เมื่อพยานแสดงความประสงค์อุทธรณ์ภายใน 30 วัน เจ้าหน้าที่บันทึกรับคำอุทธรณ์ ไม่สร้าง คบ.1 ใหม่')
  await d.fill(p.getByTestId('appeal-intake-reason'), 'มีพยานหลักฐานใหม่ที่แสดงว่าภัยคุกคามยังมีอยู่และเข้าเงื่อนไขการคุ้มครอง', { note: 'บันทึกเหตุผลการอุทธรณ์' })
  await d.click(p.getByTestId('appeal-intake-channel-letter'), { note: 'ช่องทางรับ: หนังสือ' })
  await d.fill(p.getByTestId('appeal-intake-registry-no'), '512/2569', { note: 'เลขรับสารบรรณกลาง' })
  await d.attach(p.getByTestId('appeal-intake-evidence-file'), 'คำร้องอุทธรณ์.pdf', 'แนบหนังสืออุทธรณ์')
  await d.click(p.getByTestId('appeal-intake-submit'), { note: 'กดรับคำอุทธรณ์' })
  await d.confirm('ยืนยัน', 'ยืนยันรับคำอุทธรณ์เข้าแฟ้มเดิม')

  await d.switchRole('supervisor', 'ผบช.ชั้นต้นมอบหมายเจ้าหน้าที่อุทธรณ์', 'เปิดแฟ้มอุทธรณ์แล้วเลือกเจ้าหน้าที่ผู้รับผิดชอบ', appealUrl)
  const assign = p.getByTestId('appeal-assign')
  await d.highlight(assign, 'แฟ้มอุทธรณ์ในแฟ้มเดิมของพยาน')
  await d.select(assign.getByTestId('appeal-assign-officer'), 'APP-001', { note: 'เลือกเจ้าหน้าที่อุทธรณ์' })
  await d.click(assign.getByTestId('appeal-assign-submit'), { note: 'กดมอบหมาย' })
  await d.confirm('ยืนยัน', 'ยืนยันมอบหมายเจ้าหน้าที่อุทธรณ์')
  await d.result(p.getByTestId('appeal-assign'), 'มอบหมายแล้ว เจ้าของแฟ้มอุทธรณ์เปลี่ยนเป็นเจ้าหน้าที่ที่เลือก')

  // ───── 4. เสนอแฟ้มอุทธรณ์ตามลำดับชั้นและบรรจุวาระ ─────
  await d.switchRole('officer', 'เจ้าหน้าที่อุทธรณ์ตรวจแฟ้มและให้ความเห็น', 'ตรวจความครบถ้วนและกรอบ 30 วัน แล้วเสนอขึ้นตามลำดับ', appealUrl)
  await d.click(p.getByTestId('appeal-check-submit'), { note: 'ตรวจแฟ้มครบถ้วน' })
  await d.confirm('ยืนยันแฟ้มครบถ้วน', 'ระบบคำนวณกรอบ 30 วัน แล้วเข้าชั้นความเห็นเจ้าหน้าที่')
  await opinionLayer(d, 'ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น', 'ความเห็นเจ้าหน้าที่', 'ส่งต่อ ผบช.ชั้นต้น')

  await d.switchRole('supervisor', 'ผบช.ชั้นต้น ให้ความเห็น', 'ตรวจแฟ้มก่อนเสนอ ผอ.สำนัก/กอง', appealUrl)
  await opinionLayer(d, 'ตรวจความครบถ้วนแล้ว เห็นควรเสนอ ผอ.สำนัก/กอง', 'ความเห็น ผบช.ชั้นต้น', 'ส่งต่อ ผอ.สำนัก/กอง')

  await d.switchRole('director', 'ผอ.สำนัก/กอง ลงนามเสนอ', 'ข้ามชั้นไม่ได้', appealUrl)
  await opinionLayer(d, 'ตรวจแฟ้มแล้ว เห็นควรเสนอรองเลขาธิการฯ', 'ความเห็น ผอ.สำนัก/กอง', 'ส่งต่อรองเลขาธิการฯ')

  await d.switchRole('deputy_secretary', 'รองเลขาธิการฯ กลั่นกรองแฟ้ม', 'ให้ความเห็นประกอบก่อนถึงเลขาธิการฯ', appealUrl)
  await opinionLayer(d, 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบถ้วน', 'ความเห็นรองเลขาธิการฯ', 'ส่งต่อเลขาธิการฯ')

  await d.switchRole('secretary', 'เลขาธิการฯ ส่งเสนอคณะกรรมการ', 'เลขาธิการฯ ไม่ใช่ผู้วินิจฉัยอุทธรณ์ ทำหน้าที่ส่งเรื่องให้คณะกรรมการ ป.ป.ท.', appealUrl)
  await opinionLayer(d, 'รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย', 'ความเห็นเลขาธิการฯ', 'ส่งเสนอคณะกรรมการ')

  await d.switchRole('committee', 'ฝ่ายเลขานุการคณะกรรมการบรรจุวาระ', 'นำแฟ้มอุทธรณ์เสนอประธานเพื่อบรรจุระเบียบวาระ', appealUrl)
  await d.fill(p.getByTestId('appeal-agenda-no'), 'วาระที่ 4.2 ครั้งที่ 9/2569', { note: 'ระบุวาระที่และครั้งที่ประชุม' })
  await d.click(p.getByTestId('appeal-agenda-submit'), { note: 'กดบรรจุวาระ' })
  await d.confirm('ยืนยันบรรจุวาระ', 'บรรจุวาระ รอคณะกรรมการ ป.ป.ท. วินิจฉัย')
  await d.result(p.getByTestId('appeal-resolution-no'), 'บรรจุวาระแล้ว รอคณะกรรมการวินิจฉัย')

  // ───── 5. คณะกรรมการวินิจฉัยและแจ้งผล ─────
  d.section('คณะกรรมการ ป.ป.ท. วินิจฉัยอุทธรณ์', 'บันทึกมติที่ประชุม ในที่นี้ยืนคำสั่งเดิม ส่วนอีกทางเลือกคือเปลี่ยนคำสั่งเป็นอนุมัติ')
  await d.fill(p.getByTestId('appeal-resolution-no'), 'มติที่ 55/2569', { note: 'เลขที่มติ' })
  await d.fill(p.getByTestId('appeal-resolution-note'), 'พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม', { note: 'สาระสำคัญของมติ' })
  await d.highlight(p.getByTestId('appeal-resolution-overturn'), 'ทางเลือกอื่น: เปลี่ยนคำสั่งเป็นอนุมัติ')
  await d.click(p.getByTestId('appeal-resolution-uphold'), { note: 'มติยืนคำสั่งเดิม' })
  await d.confirm('ยืนยันมติยืนคำสั่งเดิม', 'ยืนยันมติ ซึ่งเป็นที่สุด แต่ยังต้องแจ้งผลอย่างเป็นทางการ')

  await d.switchRole('officer', 'เจ้าหน้าที่แจ้งผลอุทธรณ์', 'ออกหนังสือแจ้งผลอุทธรณ์ผ่านสารบรรณ พร้อมเก็บหลักฐานการรับ', appealUrl)
  await d.highlight(p.getByTestId('appeal-notice-form'), 'ฟอร์มหนังสือแจ้งผลอุทธรณ์')
  await d.fill(p.getByTestId('appeal-notice-document'), 'หนังสือแจ้งผลอุทธรณ์.pdf', { note: 'ชื่อไฟล์หนังสือแจ้งผล' })
  await d.fill(p.getByTestId('appeal-notice-registry'), 'ปปท 0007/4412', { note: 'เลขทะเบียนส่งสารบรรณ' })
  await d.fill(p.getByTestId('appeal-notice-ack'), 'ใบตอบรับไปรษณีย์ (EMS)', { note: 'หลักฐานการรับ' })
  await d.click(p.getByTestId('appeal-notice-submit'), { note: 'บันทึกแจ้งผล' })
  await d.confirm('ยืนยันบันทึกหนังสือแจ้งผล', 'ยืนยันแจ้งผลและปิดขั้นอุทธรณ์')
  await d.result(p.getByTestId('appeal-notice-done'), 'แจ้งผลอุทธรณ์ให้พยานแล้ว ปิดขั้นอุทธรณ์')
}

export default {
  id: 'appeal',
  branchSection: 'เลขาธิการฯ พิจารณาชี้ขาด',
  title: 'ทางแยก 2: เลขาธิการฯ ไม่อนุมัติ → พยานยื่นอุทธรณ์',
  summary:
    'เลขาธิการฯ ลงนามข้อ 13 แล้วสั่งไม่อนุมัติคุ้มครอง ระบบออก คบ.10 แจ้งสิทธิอุทธรณ์ 30 วัน เมื่อพยานอุทธรณ์ แฟ้มเดิมจะเดินต่อตามลำดับชั้นจนคณะกรรมการ ป.ป.ท. วินิจฉัยและแจ้งผล',
  run: (d) => runAppeal(d),
} satisfies GuideFlow
