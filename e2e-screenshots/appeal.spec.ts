import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../e2e/helpers/seed'
import { createRecorder, fieldAfterLabel } from './shot'

/**
 * ภาพหน้าจอทีละขั้น — เส้นทางหลักของการอุทธรณ์ (09A → 09B)
 * ขั้นตอนและข้อมูลตั้งต้นยกมาจาก e2e/sheets/sheet09a-non-approval.spec.ts และ sheet09b-appeal-folder.spec.ts
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const APPEAL_URL = `/appeal-folder/${CASE_NO}`
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const DEPUTY = 'นายพิพัฒน์ ศรีสุวรรณ'
const SECRETARY = 'นายสุรศักดิ์ ธรรมพิทักษ์'
const COMMITTEE = 'นางสาวปิยะนุช เลขะกุล'

const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * 86400000).toISOString()

const AT_KB10_DRAFT = {
  stage: 'notice',
  activity7State: 'rejected',
  activity7Label: 'ไม่อนุมัติให้การคุ้มครอง',
  extraForms: [10],
  kb11Signed: false,
  nonApprovalStep: 0,
  approvalStep: 0,
  kb9Signed: false,
  kb10Signed: false,
  kb10SignedAt: undefined,
  outgoingSignedAt: undefined,
  dispatchedAt: undefined,
  dispatchChannel: undefined,
  deliveredAt: undefined,
  appealDueAt: undefined,
  appealFiledAt: undefined,
  nonApprovalClosedAt: undefined,
}

const AT_PRE_APPEAL = {
  ...AT_KB10_DRAFT,
  nonApprovalStep: 3,
  kb10Signed: true,
  kb10SignedAt: '01/07/2569 10:00',
  outgoingSignedAt: '01/07/2569 10:00',
  dispatchedAt: '02/07/2569 09:00',
  dispatchChannel: 'ไปรษณีย์ตอบรับด่วน (EMS)',
  deliveredAt: iso(-5),
  appealDueAt: iso(25),
  appealFolder: undefined,
  decisionNumber: 'ลธ.ปปท./000501/2569',
}

const AT_APPEAL_RECEIVED = {
  stage: 'appeal',
  activity7State: 'committee',
  appealAgainst: 'kb10',
  decisionNumber: 'ลธ.ปปท./000501/2569',
  deliveredAt: iso(-20),
  appealDueAt: iso(10),
  appealFiledAt: iso(-5),
  appealReason: 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา',
  appealFolder: { stage: 'received' },
  appealResolution: undefined,
}

const AT_AGENDA = {
  ...AT_APPEAL_RECEIVED,
  appealFolder: {
    stage: 'agenda',
    checkedAt: '01/08/2569 09:00',
    checkedBy: OFFICER,
    lateDays: 0,
    officerOpinion: { at: '01/08/2569 09:10', by: OFFICER, note: 'เอกสารครบ' },
    supervisorOpinion: { at: '02/08/2569 09:00', by: SUPERVISOR, note: 'เห็นควรเสนอ' },
    deputyOpinion: { at: '03/08/2569 09:00', by: DEPUTY, note: 'กลั่นกรองแล้ว' },
    secretaryOpinion: { at: '04/08/2569 09:00', by: SECRETARY, note: 'ส่งเสนอคณะกรรมการ' },
    agendaNo: 'วาระที่ 4.2 ครั้งที่ 9/2569',
    agendaAt: '05/08/2569 09:00',
    agendaBy: COMMITTEE,
  },
}

test('A1 · 09A ไม่อนุมัติ — จัดทำ คบ.10 กลั่นกรอง ลงนาม นำส่ง และเริ่มนับสิทธิอุทธรณ์ 30 วัน', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'appeal-1-kb10-notice',
      flow: 'appeal',
      order: 1,
      title: 'ไม่อนุมัติและแจ้งสิทธิอุทธรณ์ (คบ.10)',
      summary: 'เจ้าหน้าที่เสนอร่าง คบ.10 → รองเลขาธิการฯ กลั่นกรอง → เลขาธิการฯ ลงนาม → นำส่ง → บันทึกวันที่พยานได้รับจริง แล้วระบบเริ่มนับกรอบอุทธรณ์ 30 วัน',
      testRef: 'e2e/sheets/sheet09a-non-approval.spec.ts · TC-101',
    },
    'officer'
  )
  await seedMockState(page, 'Case 1.8', 'officer', AT_KB10_DRAFT)
  await page.goto(DOSSIER_URL)
  await r.shot('แฟ้มคำร้องที่ผลพิจารณาเป็น "ไม่อนุมัติ"', 'ร่าง คบ.10 จัดทำแล้ว รอเจ้าหน้าที่ตรวจความครบถ้วน (WIT0903)')

  await page.getByTestId('kb10-readiness-note').fill('ตรวจร่าง คบ.10 ครบถ้วนตามผลพิจารณา — เหตุผล ฐานการพิจารณา และสิทธิอุทธรณ์ 30 วัน')
  await r.shot('เจ้าหน้าที่บันทึกผลตรวจความครบถ้วน', 'WIT0904 — กรอกบันทึกก่อนเสนอกลั่นกรอง', page.getByTestId('kb10-readiness-note'))
  await page.getByTestId('kb10-submit-screening').click()
  await r.confirm('ยืนยันเสนอกลั่นกรอง', 'เสนอ คบ.10 ให้รองเลขาธิการฯ กลั่นกรอง')

  await r.asRole('deputy_secretary')
  await r.shot('รองเลขาธิการฯ เปิดแฟ้มเพื่อกลั่นกรอง', 'WIT0905', page.getByTestId('kb10-deputy-note'))
  await page.getByTestId('kb10-deputy-note').fill('ข้อความตรงกับผลพิจารณาและแจ้งสิทธิอุทธรณ์ครบถ้วน')
  await r.shot('รองเลขาธิการฯ บันทึกผลกลั่นกรอง', '', page.getByTestId('kb10-deputy-pass'))
  await page.getByTestId('kb10-deputy-pass').click()
  await r.confirm('ยืนยันกลั่นกรองผ่าน', 'กลั่นกรองผ่าน ส่งเลขาธิการฯ ลงนาม')

  await r.asRole('secretary')
  await expect(page.getByText('รอเลขาธิการฯ ลงนามในแบบฟอร์ม')).toBeVisible()
  await r.shot('เลขาธิการฯ เห็นงานรอลงนาม คบ.10', 'WIT0906', page.getByTestId('dossier-forms'))
  await page.getByTestId('dossier-forms').getByRole('button', { name: 'ลงนาม' }).click()
  await page.waitForTimeout(300)
  await r.shot('เปิดดูฉบับพิมพ์ คบ.10 ก่อนลงนาม')
  await page.getByRole('button', { name: 'ลงนาม' }).last().click()
  await page.getByTestId('signature-name-input').fill(SECRETARY)
  await page.getByTestId('signature-certify-checkbox').check()
  await r.shot('กรอกชื่อและรับรองการลงนามอิเล็กทรอนิกส์')
  await page.getByTestId('signature-confirm-button').click()
  await expect(page.getByTestId('dossier-forms').getByText('ลงนามแล้ว').first()).toBeVisible()
  await r.shot('คบ.10 ลงนามแล้ว', 'ฉบับที่ลงนามถูกล็อก', page.getByTestId('dossier-forms'))

  await r.asRole('officer')
  const dispatchSection = page
    .getByText('การนำส่งหนังสือและวันที่พยานได้รับ')
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await r.shot('เจ้าหน้าที่เตรียมนำส่งหนังสือ', 'ช่องทางตั้งต้น: ไปรษณีย์ตอบรับด่วน (EMS)', dispatchSection, 'start')
  await dispatchSection.getByRole('button', { name: 'บันทึกการนำส่ง' }).click()
  await r.shot('บันทึกการนำส่งแล้ว', 'รอบันทึกวันที่พยานได้รับจริง', dispatchSection, 'start')

  await dispatchSection.locator('input[type="date"]').fill('2026-09-10')
  await fieldAfterLabel(dispatchSection, 'ผู้รับหนังสือ').fill('นางสาวศิริพร ใจดี')
  await dispatchSection
    .locator('label', { hasText: 'เลือกไฟล์อัปโหลด' })
    .locator('input[type="file"]')
    .setInputFiles({ name: 'ใบตอบรับ-EMS.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock ack file') })
  await r.shot('บันทึกวันที่พยานได้รับจริงและแนบใบตอบรับ', 'WIT0907 — วันที่รับจริง 10 ก.ย. 2569', dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }))
  await dispatchSection.getByRole('button', { name: 'ยืนยันการรับหนังสือ' }).click()
  await expect(page.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')).toBeVisible()
  await r.shot('ระบบเริ่มนับกรอบอุทธรณ์ 30 วัน', 'นับจากวันที่พยานได้รับจริง ไม่ใช่วันที่นำส่ง', page.getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน'), 'start')
})

test('A2 · 09A → 09B ผู้ยื่นประสงค์อุทธรณ์ — รับคำอุทธรณ์เข้าแฟ้มเดิม และ ผบช.มอบหมายเจ้าหน้าที่อุทธรณ์', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'appeal-2-intake-assign',
      flow: 'appeal',
      order: 2,
      title: 'รับคำอุทธรณ์และมอบหมายเจ้าหน้าที่อุทธรณ์',
      summary: 'เจ้าหน้าที่รับคำอุทธรณ์ (หนังสือ) ในแฟ้มเดิม ไม่สร้าง คบ.1 ใหม่ → ผบช.ชั้นต้นมอบหมายเจ้าหน้าที่อุทธรณ์ ซึ่งเป็นจุดเดียวที่เปลี่ยนเจ้าของเรื่อง',
      testRef: 'e2e/sheets/sheet09a-non-approval.spec.ts · TC-103',
    },
    'officer'
  )
  await seedMockState(page, 'Case 1.8', 'officer', AT_PRE_APPEAL)
  await page.goto(DOSSIER_URL)
  const appealSection = page
    .getByText('สิทธิยื่นอุทธรณ์ภายใน 30 วัน')
    .locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]')
  await r.shot('แฟ้มอยู่ในกรอบอุทธรณ์ 30 วัน', 'WIT0908 — ยังไม่มีผู้ยื่นอุทธรณ์ ปุ่มปิดเรื่องยังไม่แสดง', appealSection, 'start')

  await appealSection.getByTestId('appeal-intake-reason').fill('มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา')
  await appealSection.getByTestId('appeal-intake-channel-letter').click()
  await appealSection.getByTestId('appeal-intake-registry-no').fill('512/2569')
  await appealSection.getByTestId('appeal-intake-evidence-file').setInputFiles({
    name: 'คำร้องอุทธรณ์.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 mock'),
  })
  await r.shot('กรอกคำอุทธรณ์ ช่องทางหนังสือ', 'WIT0911/0912 — เหตุผล เลขรับสารบรรณกลาง และไฟล์หนังสืออุทธรณ์', appealSection.getByTestId('appeal-intake-registry-no'))
  await appealSection.getByTestId('appeal-intake-submit').click()
  await r.confirm('ยืนยัน', 'รับคำอุทธรณ์เข้าแฟ้มเดิม', 'WIT0913 — ผูกกับแฟ้มเดิม ไม่สร้างแฟ้ม/คบ.1 ใหม่')

  await r.asRole('supervisor', APPEAL_URL)
  const assignSection = page.getByTestId('appeal-assign')
  await expect(assignSection).toBeVisible()
  await r.shot('ผบช.ชั้นต้นเปิดแฟ้มอุทธรณ์', 'หน้าแฟ้มอุทธรณ์ (09B)', assignSection)
  await assignSection.getByTestId('appeal-assign-officer').selectOption('APP-001')
  await r.shot('เลือกเจ้าหน้าที่อุทธรณ์', '', assignSection)
  await assignSection.getByTestId('appeal-assign-submit').click()
  await r.confirm('ยืนยัน', 'มอบหมายเจ้าหน้าที่อุทธรณ์', 'เจ้าของเรื่องเปลี่ยนเป็นเจ้าหน้าที่อุทธรณ์')
})

test('A3 · 09B ตรวจครบถ้วน และเสนอตามลำดับชั้นจนบรรจุวาระคณะกรรมการ', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'appeal-3-hierarchy',
      flow: 'appeal',
      order: 3,
      title: 'เสนอแฟ้มอุทธรณ์ตามลำดับชั้นจนบรรจุวาระ',
      summary: 'เจ้าหน้าที่ตรวจครบถ้วน → ความเห็นเจ้าหน้าที่ → ผบช.ชั้นต้น → รองเลขาธิการฯ → เลขาธิการฯ (รับทราบ ไม่ใช่ผู้วินิจฉัย) → คณะกรรมการบรรจุวาระ',
      testRef: 'e2e/sheets/sheet09b-appeal-folder.spec.ts · TC-108',
    },
    'officer'
  )
  await seedMockState(page, 'Case 1.8', 'officer', AT_APPEAL_RECEIVED)
  await page.goto(APPEAL_URL)
  await r.shot('แฟ้มอุทธรณ์ที่รับเข้ามาแล้ว', 'ยื่นภายในกรอบ 30 วัน รอตรวจความครบถ้วน (WIT0914)', page.getByTestId('appeal-check-submit'))
  await page.getByTestId('appeal-check-submit').click()
  await r.confirm('ยืนยันแฟ้มครบถ้วน', 'ตรวจแฟ้มครบถ้วน', 'ระบบคำนวณกรอบ 30 วัน แฟ้มเข้าชั้นความเห็นเจ้าหน้าที่')

  await page.getByTestId('appeal-opinion-note').fill('ตรวจข้อเท็จจริงและเอกสารแล้ว เห็นควรเสนอตามลำดับชั้น')
  await r.shot('เจ้าหน้าที่บันทึกความเห็น', 'WIT0915 — ความเห็นแยกจากคำอุทธรณ์ของผู้ยื่น', page.getByTestId('appeal-opinion-note'))
  await page.getByTestId('appeal-opinion-submit').click()
  await r.confirm('ยืนยัน', 'ส่งต่อ ผบช.ชั้นต้น')

  const layers: Array<[string, string, string]> = [
    ['supervisor', 'ตรวจความครบถ้วนแล้ว ลงนามเสนอรองเลขาธิการฯ', 'WIT0916 — ผบช.ชั้นต้นลงนามเสนอ'],
    ['deputy_secretary', 'กลั่นกรองแฟ้มแล้ว ความเห็นประกอบครบ', 'WIT0917 — รองเลขาธิการฯ กลั่นกรอง'],
    ['secretary', 'รับทราบและให้ความเห็นประกอบ ส่งเสนอคณะกรรมการวินิจฉัย', 'WIT0918 — เลขาธิการฯ ไม่ใช่ผู้วินิจฉัยอุทธรณ์ ส่งเสนอคณะกรรมการ'],
  ]
  for (const [role, note, detail] of layers) {
    await r.asRole(role)
    await page.getByTestId('appeal-opinion-note').fill(note)
    await r.shot(`${detail.split(' — ')[1]}`, detail, page.getByTestId('appeal-opinion-note'))
    await page.getByTestId('appeal-opinion-submit').click()
    await r.confirm('ยืนยัน', `ส่งต่อชั้นถัดไป (${detail.split(' — ')[0]})`)
  }

  await r.asRole('committee')
  await page.getByTestId('appeal-agenda-no').fill('วาระที่ 4.2 ครั้งที่ 9/2569')
  await r.shot('ฝ่ายเลขานุการคณะกรรมการบรรจุวาระ', 'WIT0919', page.getByTestId('appeal-agenda-no'))
  await page.getByTestId('appeal-agenda-submit').click()
  await r.confirm('ยืนยันบรรจุวาระ', 'บรรจุวาระ รอคณะกรรมการ ป.ป.ท. วินิจฉัย')
  const folder = (await readCase(page, CASE_NO))?.appealFolder as Record<string, unknown>
  expect(folder.stage).toBe('agenda')
})

test('A4 · 09B คณะกรรมการยืนคำสั่งเดิม — บันทึกมติ แจ้งผล และปิดขั้นอุทธรณ์', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'appeal-4-uphold',
      flow: 'appeal',
      order: 4,
      title: 'ผลอุทธรณ์: ยืนคำสั่งเดิม',
      summary: 'คณะกรรมการบันทึกมติยืนคำสั่งเดิม (เป็นที่สุด) → เจ้าหน้าที่ออกหนังสือแจ้งผลผ่านสารบรรณ เก็บหลักฐานการรับ แล้วจึงปิดขั้นอุทธรณ์',
      testRef: 'e2e/sheets/sheet09b-appeal-folder.spec.ts · TC-111',
    },
    'committee'
  )
  await seedMockState(page, 'Case 1.8', 'committee', AT_AGENDA)
  await page.goto(APPEAL_URL)
  await r.shot('คณะกรรมการเปิดแฟ้มที่บรรจุวาระแล้ว', 'WIT0920 — รอวินิจฉัย', page.getByTestId('appeal-resolution-no'))
  await page.getByTestId('appeal-resolution-no').fill('มติที่ 55/2569')
  await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่ไม่เปลี่ยนสาระสำคัญของคำสั่งเดิม')
  await r.shot('กรอกเลขที่มติและสาระสำคัญ', '', page.getByTestId('appeal-resolution-note'))
  await page.getByTestId('appeal-resolution-uphold').click()
  await r.confirm('ยืนยันมติยืนคำสั่งเดิม', 'มติยืนคำสั่งเดิม', 'มติเป็นที่สุด แต่ยังต้องแจ้งผลอย่างเป็นทางการ')

  await r.asRole('officer')
  const form = page.getByTestId('appeal-notice-form')
  await expect(form).toBeVisible()
  await r.shot('เจ้าหน้าที่เห็นฟอร์มหนังสือแจ้งผลอุทธรณ์', 'WIT0921', form)
  await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_สมชาย.pdf')
  await page.getByTestId('appeal-notice-registry').fill('ปปท 0007/4412')
  await page.getByTestId('appeal-notice-ack').fill('ใบตอบรับไปรษณีย์ (EMS)')
  await r.shot('กรอกหนังสือแจ้งผล เลขทะเบียนส่ง และหลักฐานการรับ', '', page.getByTestId('appeal-notice-form'))
  await page.getByTestId('appeal-notice-submit').click()
  await r.confirm('ยืนยันบันทึกหนังสือแจ้งผล', 'แจ้งผลและปิดขั้นอุทธรณ์', '', page.getByTestId('appeal-notice-done'))
  await expect(page.getByTestId('appeal-notice-done')).toContainText('แจ้งผลอุทธรณ์ให้พยานแล้ว')
})

test('A5 · 09B คณะกรรมการเปลี่ยนคำสั่งเป็นอนุมัติ — แจ้งผลแล้วกลับไป 08A โดยไม่สร้าง คบ.1 ใหม่', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'appeal-5-overturn',
      flow: 'appeal',
      order: 5,
      title: 'ผลอุทธรณ์: เปลี่ยนคำสั่งเป็นอนุมัติ',
      summary: 'คณะกรรมการมีมติเปลี่ยนคำสั่ง → แฟ้มเดิมกลับเข้าเส้นทาง 08A (ไม่สร้าง คบ.1 ใหม่) → เจ้าหน้าที่ยังต้องออกหนังสือแจ้งผลให้พยาน',
      testRef: 'e2e/sheets/sheet09b-appeal-folder.spec.ts · TC-110',
    },
    'committee'
  )
  await seedMockState(page, 'Case 1.8', 'committee', AT_AGENDA)
  await page.goto(APPEAL_URL)
  await r.shot('คณะกรรมการเปิดแฟ้มที่บรรจุวาระแล้ว', 'WIT0920 — รอวินิจฉัย', page.getByTestId('appeal-resolution-no'))
  await page.getByTestId('appeal-resolution-no').fill('มติที่ 56/2569')
  await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่รับฟังได้ ให้เปลี่ยนแปลงคำสั่งเดิม')
  await r.shot('กรอกเลขที่มติและสาระสำคัญ', '', page.getByTestId('appeal-resolution-note'))
  await page.getByTestId('appeal-resolution-overturn').click()
  await r.confirm('ยืนยันมติเปลี่ยนแปลงคำสั่ง', 'มติเปลี่ยนคำสั่งเป็นอนุมัติ', 'WIT0922 — แฟ้มเดิมกลับเส้นทาง 08A ไม่สร้าง คบ.1 ใหม่')

  await r.asRole('officer')
  await page.getByTestId('appeal-notice-document').fill('หนังสือแจ้งผลอุทธรณ์_เปลี่ยนคำสั่ง.pdf')
  await page.getByTestId('appeal-notice-registry').fill('ปปท 0007/4413')
  await r.shot('เจ้าหน้าที่กรอกหนังสือแจ้งผลอุทธรณ์', '', page.getByTestId('appeal-notice-form'))
  await page.getByTestId('appeal-notice-submit').click()
  await r.confirm('ยืนยันบันทึกหนังสือแจ้งผล', 'แจ้งผลแล้วไปต่อที่ 08A')
  expect((await readCase(page, CASE_NO))?.stage).toBe('method_operation')
})
