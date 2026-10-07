import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'
import { newCaseNoAfterIntake } from '../helpers/seed'

/**
 * Sheet 02 · รับคำขอ / เชื่อมโยงเลขสำนวน (WIT0202 → WIT0216)
 *
 * ครอบคลุมช่องทางรับเรื่องทั้งสาม (เข้าพบ/โทรศัพท์/หนังสือต้นทาง), การกลั่นกรองความเร่งด่วนก่อน
 * จัดทำแบบ (WIT0207-0208), การเชื่อมโยงเลขสำนวนหลัก (WIT0212-0215 — ห้ามปัดตกแม้เชื่อมโยงไม่ได้),
 * การจัดทำ คบ.1 และการตรวจ Audit Log ของขั้นรับเรื่อง
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
/** ไฟล์ทดสอบสร้างเป็น buffer ในหน่วยความจำ ไม่พึ่งไฟล์จริงบนเครื่อง */
const pdfFile = (name: string, bytes = 2 * 1024) => ({
  name,
  mimeType: 'application/pdf',
  buffer: Buffer.alloc(bytes, 0x20),
})

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** อ่านเลขคำร้องใหม่จาก URL หลังกดบันทึกรับเรื่องเข้าทะเบียนบนหน้า /intake */
async function newCaseNoFromUrl(page: Page): Promise<string> {
  return newCaseNoAfterIntake(page)
}

test.describe('Sheet 02 — รับคำขอ / เชื่อมโยงเลขสำนวน', () => {
  test('TC-001 · [Happy] เข้าพบเจ้าหน้าที่ ทำ คบ.1 เชื่อมโยงเลขสำนวน แล้วส่ง ผอ. มอบหมาย', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')

    // WIT0207-0208 — กลั่นกรองความเร่งด่วนก่อนจัดทำแบบ (เจ้าหน้าที่ ป.ป.ท. ไม่ใช่ธุรการ ต้องกลั่นกรอง)
    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('ไม่มีเหตุอันตรายเร่งด่วน')

    // WIT0211 — เลือกจัดทำแบบ คบ.1 (ช่องทางเข้าพบเจ้าหน้าที่)
    await page.getByLabel('อัปโหลดไฟล์ คบ.1').setInputFiles(pdfFile('scan.pdf'))
    await expect(page.getByText('scan.pdf')).toBeVisible()

    await page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' }).click()
    // เลือก คบ.1 = เปิดแบบ คบ.1 ให้กรอกต่อทันที
    await expect(page).toHaveURL(/\/form\/1\?caseNo=WP-/)
    const newCaseNo = await newCaseNoFromUrl(page)

    // WIT0212/0214 — ค้นและเชื่อมโยงเลขสำนวนหลัก แล้วยืนยัน
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()

    const linked = await readCase(page, newCaseNo)
    expect(linked?.mainCaseStatus).toBe('linked')
    expect(linked?.linkedMainCaseId).toBeTruthy()

    // WIT0216 — ส่งคำขอให้ ผอ. มอบหมาย
    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()

    await expect.poll(async () => (await readCase(page, newCaseNo))?.stage).toBe('director_assign')

    // งานปรากฏใน Inbox ของ ผอ.
    await switchRole(page, 'director')
    await page.goto('/queue/director')
    await expect(page.getByText(newCaseNo)).toBeVisible()
  })

  test('TC-002 · [Happy] รับแจ้งทางโทรศัพท์ด้วย คบ.2 แล้วเปิดงานจัดทำ คบ.1 ต่อเนื่องอัตโนมัติ', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')

    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('รับแจ้งทางโทรศัพท์ ยังไม่มีเหตุเร่งด่วนชัดเจน')

    await page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' }).click()
    // เลือก คบ.2 = เปิดแบบ คบ.2 ให้บันทึกต่อทันที
    await expect(page).toHaveURL(/\/form\/2\?caseNo=WP-/)
    const newCaseNo = await newCaseNoFromUrl(page)

    const created = await readCase(page, newCaseNo)
    expect(created?.form).toBe('คบ.2')
    // ระบบเปิดงานค้าง "จัดทำ คบ.1" ต่อเนื่อง ไม่ถือว่าจบเพียง คบ.2
    expect(created?.kb1SignaturePending).toBe(true)
    expect(created?.pendingIntakeForms).toContain('คบ.1')

    // ผูกกับคำขอเดิม (คนละแบบฟอร์ม แต่เลขคำร้องเดียวกัน) — ไม่ใช่งานที่ปิดจบแล้ว
    expect(created?.stage).not.toBe('closed')
  })

  test('TC-003 · [Happy] ธุรการรับหนังสือต้นทางเข้า E-CMIS โดยไม่ต้องกลั่นกรองความเร่งด่วน', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto('/intake')

    // ไม่มีการบังคับให้ธุรการกรอกผลกลั่นกรอง — ไม่มีขั้นตอนกลั่นกรองปรากฏเลย
    await expect(page.getByTestId('intake-triage')).toHaveCount(0)
    await expect(page.getByText('การกลั่นกรองความเร่งด่วน: ดำเนินการตามกระบวนการปกติ')).toHaveCount(0)

    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นายทดสอบ ผู้ร้อง')
    await page.getByLabel('เลือกไฟล์เอกสารต้นทาง').setInputFiles(pdfFile('scan.pdf'))

    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    const newCaseNo = await newCaseNoFromUrl(page)

    const created = await readCase(page, newCaseNo)
    expect(created?.intakeChannel).toBe('document')
    expect(created?.urgency).toBeFalsy()
    expect(created?.stage).toBe('receiver_intake')

    // คำขอยังส่งต่อไป ผอ. ได้ตามปกติ — ไม่มีสิ่งกีดขวางจากการไม่มีผลกลั่นกรอง
    await expect(page.getByTestId('forward-case-button')).toBeVisible()
  })

  test('TC-004 · [Happy] บันทึกผลการกลั่นกรองเป็นเร่งด่วน พร้อมเหตุผล', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')

    await page.getByRole('radio', { name: /^กรณีจำเป็นเร่งด่วน/ }).click()
    await page.locator('#intakeScreeningNote').fill('ถูกข่มขู่คุกคามถึงชีวิต')
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นางสาวทดสอบ พยาน')

    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    const newCaseNo = await newCaseNoFromUrl(page)

    // สรุปข้อมูลแฟ้มไม่แสดงระดับความเสี่ยงแล้ว — ตรวจผลกระทบที่มองเห็นได้จากช่องความเร่งด่วนแทน
    await expect(page.getByText('ความเร่งด่วน:')).toBeVisible()

    const created = await readCase(page, newCaseNo)
    expect(created?.risk).toBe('วิกฤต')
    expect(created?.urgency).toBe('urgent')
    expect(created?.urgencyAssessedAt).toBeTruthy()
    expect(created?.urgencyAssessedBy).toBeTruthy()
    expect(created?.urgencyAssessmentNote).toContain('ข่มขู่คุกคามถึงชีวิต')
  })

  test('TC-005 · [Negative] เชื่อมโยงเลขสำนวนหลักไม่ได้ ต้องรับเรื่องต่อ ห้ามปัดตก', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer', {
      stage: 'officer_intake',
      receivedByUserId: 'OFF-001',
    })
    await page.goto(DOSSIER_URL)

    // WIT0215 — ต้องเลือกเหตุผลก่อน ถ้ายังไม่เลือกแล้วกดบันทึก ระบบต้องปฏิเสธและยังไม่เปลี่ยนสถานะ
    await page.getByTestId('main-case-not-found-button').click()
    await expect(page.locator('.swal2-toast')).toContainText('กรุณาเลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ก่อน')
    expect((await readCase(page, CASE_NO))?.mainCaseStatus).not.toBe('not_found')

    // เลือกเหตุผลจากรายการที่ระบบกำหนด แล้วจึงบันทึกสถานะ "ไม่พบคดี" ได้
    const reason = 'ยังไม่ได้เปิดสำนวนคดีหลักในกิจกรรมที่ 4 / 5'
    await page.getByTestId('main-case-not-found-reason-select').selectOption(reason)
    await page.getByTestId('main-case-not-found-button').click()

    // Business rule สำคัญ: ห้ามปัดตก — จอยืนยันต้องบอกว่ารับเรื่องต่อ ไม่ใช่ปัดตก
    const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
    await dialog.waitFor()
    await expect(dialog).toContainText('ยืนยันระบุสถานะ "ไม่พบคดี"')
    await expect(dialog).toContainText(reason)
    await expect(dialog).toContainText('ห้ามปัดตก')
    await page.getByRole('button', { name: 'ยืนยันไม่พบคดี', exact: true }).click()
    await dialog.waitFor({ state: 'detached' })

    const marked = await readCase(page, CASE_NO)
    expect(marked?.mainCaseStatus).toBe('not_found')
    // เหตุผลที่เลือกต้องถูกบันทึกไว้ในแฟ้มและแสดงให้เห็นบนหน้าจอ
    expect(marked?.mainCaseNotFoundReason).toBe(reason)
    await expect(page.getByTestId('main-case-not-found-reason')).toContainText(reason)
    const notFoundLog = (marked?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(notFoundLog.some((h) => h.action.includes('ไม่พบคดี') && h.detail.includes(reason))).toBe(true)

    // ไม่มีปุ่ม/เส้นทางปัดตกคำขออัตโนมัติ — ไม่มีปุ่มปฏิเสธ/ปัดตกปรากฏในแฟ้มเลย
    await expect(page.getByRole('button', { name: /ปัดตก|ปฏิเสธคำร้อง/ })).toHaveCount(0)

    // ยังต้องส่งคำขอไป ผอ. ได้ตามปกติ
    await expect(page.getByTestId('forward-case-button')).toBeEnabled()
    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_assign')
  })

  test('TC-006 · [Negative] ส่งคำขอไป ผอ. โดยยังไม่บันทึกผลกลั่นกรอง (ช่องทางบังคับกลั่นกรอง)', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')

    // ข้าม WIT0207-0208 — ไม่เลือกผลกลั่นกรองเลย แล้วกดส่งทันที
    // ปุ่มรับเข้าทะเบียนทุกการ์ดถูกล็อก พร้อมบอกเหตุผล จนกว่าจะเลือกผลคัดกรอง
    await expect(page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'เจ้าหน้าที่กรอก คบ.1' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'เจ้าหน้าที่บันทึก คบ.2' })).toBeDisabled()
    await expect(page.getByText('กรุณาเลือกผลคัดกรองความเร่งด่วนเบื้องต้นก่อน (กรณีปกติ / กรณีจำเป็นเร่งด่วน)')).toBeVisible()
    // ไม่อนุญาตให้ส่งต่อ — ยังอยู่หน้า /intake เดิม ไม่มีคำร้องใหม่ถูกสร้าง
    await expect(page).toHaveURL(/\/intake$/)
  })

  // TC-007 · ข้ามตามที่ตกลงกับผู้ใช้ — แบบ คบ.1 ตั้งใจไม่บังคับฟิลด์เพื่อให้เดโมกรอกข้ามได้เร็ว
  test.skip('TC-007 · [Negative] จัดทำ คบ.1 โดยไม่กรอกฟิลด์บังคับ / ไม่แนบหลักฐาน', async ({ page }) => {
    await seedMockState(page, 'Case 1.3', 'officer')
    await page.goto(`/form/1?caseNo=${CASE_NO}`)

    await page.getByRole('button', { name: '8. ลายมือชื่อ' }).click()
    await page.getByRole('button', { name: 'บันทึกแบบ คบ.1' }).click()

    await expect(page).toHaveURL(/\/form\/1/)
  })

  test('TC-008 · [Edge] เลขสำนวนหลักหนึ่งเลขมีคำขอคุ้มครองพยานมากกว่า 1 คำขอ', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer')
    await page.goto('/intake')

    // คำขอที่ 1
    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('กรณีปกติ')
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('พยานที่หนึ่ง')
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    const case1 = await newCaseNoFromUrl(page)
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    const linked1 = await readCase(page, case1)

    // คำขอที่ 2 ของพยานคนละคน — ผูกเลขสำนวนหลักเดียวกัน
    await page.goto('/intake')
    await page.getByRole('radio', { name: /^กรณีปกติ/ }).click()
    await page.locator('#intakeScreeningNote').fill('กรณีปกติ')
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('พยานที่สอง')
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    const case2 = await newCaseNoFromUrl(page)
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    const linked2 = await readCase(page, case2)

    expect(linked1?.linkedMainCaseId).toBe(linked2?.linkedMainCaseId)
    expect(linked1?.person).toBe('พยานที่หนึ่ง')
    expect(linked2?.person).toBe('พยานที่สอง')
    expect(case1).not.toBe(case2)

    // หน้าทะเบียนแสดงทั้งสองคำขอแยกรายพยาน ข้อมูลไม่ทับกัน
    await page.goto('/registry')
    await expect(page.getByText('พยานที่หนึ่ง')).toBeVisible()
    await expect(page.getByText('พยานที่สอง')).toBeVisible()
  })

  test('TC-009 · [Edge] เชื่อมโยงเลขสำนวนภายหลังจากที่เคยบันทึกเป็น unlinked', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer', {
      stage: 'officer_intake',
      receivedByUserId: 'OFF-001',
    })
    await page.goto(DOSSIER_URL)

    await page
      .getByTestId('main-case-not-found-reason-select')
      .selectOption('ค้นแล้วไม่พบสำนวนที่ตรงกันในระบบ E-CMIS')
    await page.getByTestId('main-case-not-found-button').click()
    await confirmDialog(page, 'ยืนยันไม่พบคดี', 'ยืนยันระบุสถานะ "ไม่พบคดี"')
    await expect(page.getByText('ไม่พบคดีหลักในระบบ (กิจกรรมที่ 4 / 5)')).toBeVisible()

    // ค้นหาและเชื่อมโยงเลขสำนวนหลักที่เพิ่งเปิดใหม่
    await page.getByPlaceholder('เช่น กบค. 001/2569 หรือชื่อโครงการ...').fill('045')
    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()

    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    const after = await readCase(page, CASE_NO)
    expect(after?.mainCaseStatus).toBe('linked')
    expect(after?.mainCaseNotFound).toBe(false)
    expect(after?.person).toBe('สมชาย ใจดี') // ไม่ลบข้อมูลคำขอเดิม

    // เก็บประวัติเดิมว่าเคย unlinked ไว้ในแฟ้ม (Audit trail ภายใน) และมีการเชื่อมโยงใหม่ต่อท้าย
    const history = (after?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action.includes('ไม่พบคดี'))).toBe(true)
    expect(history.some((h) => h.action.includes('เชื่อมโยงเลขคดีหลัก'))).toBe(true)
  })

  test('TC-010 · [Edge] แนบไฟล์สแกนขนาดใหญ่ / นามสกุลไม่รองรับ', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto('/intake')

    const picker = page.getByLabel('เลือกไฟล์เอกสารต้นทาง')

    // ไฟล์ PDF ขนาดปกติต้องอัปโหลดสำเร็จ
    await picker.setInputFiles(pdfFile('scan_2MB.pdf', 2 * 1024 * 1024))
    await expect(page.getByText('scan_2MB.pdf')).toBeVisible()

    // นามสกุลไม่รองรับ (.exe) ต้องถูกปฏิเสธพร้อมข้อความชัดเจน และไม่เข้าไปอยู่ในรายการไฟล์
    await picker.setInputFiles({
      name: 'malware.exe',
      mimeType: 'application/octet-stream',
      buffer: Buffer.from('MZ'),
    })
    await expect(page.locator('.swal2-toast')).toContainText('นามสกุลไม่รองรับ')
    await expect(page.getByText('malware.exe')).toHaveCount(0)

    // ไฟล์เกิน 20MB ต้องถูกปฏิเสธพร้อมบอกเกณฑ์ขนาด
    await picker.setInputFiles(pdfFile('scan_50MB.pdf', 21 * 1024 * 1024))
    await expect(page.locator('.swal2-toast')).toContainText('เกินขนาดที่กำหนด')
    await expect(page.getByText('scan_50MB.pdf')).toHaveCount(0)

    // ไฟล์ที่ผ่านเกณฑ์ก่อนหน้ายังอยู่ในรายการเดิม ไม่ถูกล้างทิ้งไปด้วย
    await expect(page.getByText('scan_2MB.pdf')).toBeVisible()
  })

  test('TC-011 · [Audit] ตรวจ Audit Log ของการรับคำขอ', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'officer', {
      stage: 'officer_intake',
      receivedByUserId: 'OFF-001',
    })
    await page.goto(DOSSIER_URL)

    await page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' }).click()
    await expect(page.getByText('เชื่อมโยงแล้ว')).toBeVisible()
    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_assign')

    // เนื้อหา Log มีครบจริงในแฟ้มข้อมูล (ตรวจแบบ secondary ผ่าน store)
    const history = (await readCase(page, CASE_NO))?.assignmentHistory as Array<Record<string, string>> | undefined
    expect(history?.some((h) => h.action.includes('เชื่อมโยงเลขคดีหลัก'))).toBe(true)
    expect(history?.every((h) => h.actor && h.at)).toBe(true)

    // ต้องมีแท็บ "ประวัติ / Audit Log" ที่ผู้ใช้เปิดดูได้จริงในแฟ้มคำร้อง
    const auditTab = page.getByTestId('dossier-tab-audit')
    await expect(auditTab).toBeVisible()
    await auditTab.click()

    const auditLog = page.getByTestId('dossier-audit-log')
    await expect(auditLog).toBeVisible()
    await expect(auditLog).toContainText('ประวัติการดำเนินการ / Audit Log')

    // ทุกรายการใน store ต้องถูก render ออกหน้าจอครบ และทุกบรรทัดระบุผู้กระทำ
    const entries = page.getByTestId('dossier-audit-log-entry')
    await expect(entries).toHaveCount((history ?? []).length)
    const rendered = await entries.allInnerTexts()
    expect(rendered.every((t) => t.includes('ผู้กระทำ:'))).toBe(true)

    // เนื้อหาสำคัญของขั้นรับคำขอต้องอ่านได้จากหน้าจอ ไม่ใช่มีแค่ใน store
    await expect(auditLog).toContainText('เชื่อมโยงเลขคดีหลัก')
    await expect(auditLog).toContainText('ส่งต่อ')
  })

  test('TC-012 · [Permission] ธุรการไม่เห็นการ์ดเชื่อมโยงคดีหลัก แต่ส่ง ผอ. ได้โดยยังไม่เชื่อมโยง', async ({ page }) => {
    await seedMockState(page, 'Case 1', 'receiver')
    await page.goto(DOSSIER_URL)

    await expect(page.getByRole('button', { name: 'ยืนยันเชื่อมโยงคดี' })).toHaveCount(0)
    await expect(page.getByTestId('main-case-not-found-button')).toHaveCount(0)
    await page.getByTestId('forward-case-button').click()
    await page.getByRole('button', { name: 'ยืนยันส่งต่อ' }).click()
    await expect.poll(async () => (await readCase(page, CASE_NO))?.stage).toBe('director_assign')
    expect((await readCase(page, CASE_NO))?.mainCaseStatus).not.toBe('linked')
  })
})
