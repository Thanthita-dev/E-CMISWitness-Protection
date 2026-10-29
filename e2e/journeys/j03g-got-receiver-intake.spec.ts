import { expect, test } from '@playwright/test'
import { newCaseNoAfterIntake, readCase, seedMockState, switchRole } from '../helpers/seed'
import { confirmDialog, expectStage } from './journey-helpers'

/**
 * J03-g · ธุรการคดี กอท. รับคำร้องเข้าทะเบียนเหมือนธุรการเขต → ผอ.กอท. มอบหมายเจ้าของสำนวน → ไหลต่อตามเส้นทางเดิม
 *
 * ธุรการ กอท. รับได้เฉพาะ "คำร้อง" (ไม่กลั่นกรองความเร่งด่วน) และเห็นในทะเบียนเฉพาะเรื่องของหน่วยงาน กอท.
 */

const pdfFile = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024, 0x20) })

test('J03-g · ธุรการ กอท. รับคำร้อง → ผอ.กอท. มอบหมาย → เจ้าของสำนวนรับงาน', async ({ page }) => {
  test.setTimeout(120_000)
  let caseNo = ''

  await test.step('ธุรการ กอท. กด "รับคำร้องใหม่" จากทะเบียน แล้วรับคำร้องเข้าทะเบียน', async () => {
    await seedMockState(page, 'Case 1', 'got_receiver')
    await page.goto('/registry')
    await page.getByRole('link', { name: 'รับคำร้องใหม่' }).click()
    await expect(page).toHaveURL(/\/intake$/)
    await expect(page.getByText('กลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ. *')).toHaveCount(0)
    await expect(page.getByText(/ส่ง ผอ\.กอท\. มอบหมายเจ้าของสำนวน/).first()).toBeVisible()
    await page.getByPlaceholder('ชื่อบุคคลหรือหน่วยงาน').fill('นายภูมิพัฒน์ ใจซื่อ')
    await page.getByLabel('เลือกไฟล์เอกสารต้นทาง').setInputFiles(pdfFile('got-petition.pdf'))
    await page.getByRole('button', { name: 'รับเอกสารเข้าทะเบียน' }).click()
    caseNo = await newCaseNoAfterIntake(page)
    const created = await readCase(page, caseNo)
    expect(created?.intakeByRole).toBe('got_receiver')
    expect(created?.receivedByUserId).toBe('GOT-REC-001')
    expect(created?.intakeDocType).toBe('petition')
    await expectStage(page, 'receiver_intake', caseNo)
  })

  await test.step('ทะเบียนของธุรการ กอท. แสดงเรื่องที่ กอท. รับเข้าเอง', async () => {
    await page.goto('/registry')
    await expect(page.getByText(caseNo).first()).toBeVisible()
  })

  await test.step('ธุรการ กอท. ส่ง ผอ.กอท. มอบหมายเจ้าของสำนวน', async () => {
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ', 'ผอ.กอท.')
    await expectStage(page, 'director_assign', caseNo)
    expect((await readCase(page, caseNo))?.status).toBe('รอ ผอ.กอท. มอบหมายเจ้าของสำนวน')
  })

  await test.step('ผอ.กอท. เห็นเรื่องในคิว มอบหมายเจ้าของสำนวน แล้วส่งต่อตามเส้นทางเดิม', async () => {
    await switchRole(page, 'got_director')
    await page.goto('/queue/got_director')
    await expect(page.getByText(caseNo).first()).toBeVisible()
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await page.getByRole('button', { name: 'มอบหมายเจ้าของสำนวน' }).click()
    await expect(page.getByText(/มอบหมายแล้ว:/)).toBeVisible()
    expect((await readCase(page, caseNo))?.assignedOfficerUserId).toBeTruthy()
    await page.getByTestId('forward-case-button').click()
    await confirmDialog(page, 'ยืนยันส่งต่อ')
    await expectStage(page, 'staff_review', caseNo)
  })

  await test.step('เจ้าของสำนวนที่ได้รับมอบหมายเปิดแฟ้มทำงานต่อได้', async () => {
    await switchRole(page, 'officer')
    await page.goto(`/dossier/${encodeURIComponent(caseNo)}`)
    await expect(page.getByText('คดีหลักและการประเมินภัย')).toBeVisible()
  })
})
