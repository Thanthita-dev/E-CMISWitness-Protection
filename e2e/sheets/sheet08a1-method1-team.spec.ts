import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Sheet 08A-1 · WIT0814 → WIT0821 — วิธีที่ 1 จัดชุดคุ้มครอง
 *
 * ผัง: รับงานวิธีที่ 1 (WIT0814) → จำแนกคำสั่งชั่วคราว/หลัก (WIT0815-0818)
 *      → จัดแผนปฏิบัติ (WIT0819) → ชี้แจง Need-to-Know (WIT0820) → เริ่มปฏิบัติจริง (WIT0821)
 *
 * กฎหลัก: กรณีคำร้องหลักต้องลงนาม คบ.8 ก่อนจึงเริ่มปฏิบัติได้ (method1Gate) — กรณีเร่งด่วนใช้ คบ.5 แทนได้
 * และ Phase TEMPORARY → MAIN ต้องต่อวันสะสมโดยไม่รีเซ็ต (episode.ts)
 */

const CASE_NO = 'WP-2569-000501'
const OFFICER = 'นางสาวอรุณี ใจมั่น'
const METHOD1_URL = `/protection-method/1?caseNo=${CASE_NO}`

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName }).click()
  await dialog.waitFor({ state: 'detached' })
}

async function signInPlace(page: Page) {
  const nameInput = page.getByTestId('signature-name-input')
  await expect(nameInput).toBeVisible()
  if ((await nameInput.inputValue()).trim() === '') await nameInput.fill('นายสุรศักดิ์ ธรรมพิทักษ์')
  await page.getByTestId('signature-certify-checkbox').check()
  await page.getByTestId('signature-confirm-button').click()
}

const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString()

test.describe('08A-1 · WIT0814-0821 — วิธีที่ 1 จัดชุดคุ้มครอง', () => {
  test('TC-066 · [Happy] เริ่มคุ้มครองชั่วคราวตาม คบ.5 ทันที (TEMPORARY_ACTIVE) โดยคำร้องหลักเดินคู่ขนาน', async ({
    page,
  }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      kb9Signed: false,
      kb11Signed: false,
      kb8Signed: false,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending', wizardStep: 1 }],
      consents: [{ ref: 'kb5', consented: true, at: '01/09/2569 09:00', by: 'สมชาย ใจดี' }],
    })

    await page.goto(METHOD1_URL)
    await expect(page.getByTestId('method-1-start')).toBeEnabled()
    await page.getByTestId('method-1-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง', 'ACTIVE')

    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<{ method: number; status: string; startedAt?: string }>).find(
      (t) => t.method === 1
    )
    expect(track?.status).toBe('active')
    expect(track?.startedAt).toBeTruthy()
    // ยังเป็นคำสั่งชั่วคราว (คบ.5) — คำร้องหลักยังไม่มีผล ยังไม่ลงนาม คบ.8/คบ.11
    expect(after?.episode?.phases?.[0]?.kind).toBe('TEMPORARY')
    expect(after?.kb9Signed).toBeFalsy()
    expect(after?.kb11Signed).toBeFalsy()

    await expect(page.getByText(/สถานะปัจจุบัน: TEMPORARY_ACTIVE/)).toBeVisible()
  })

  test('TC-067 · [Happy] กรณีคำร้องหลัก: จัดทำและลงนาม คบ.8 แล้วจัดแผนปฏิบัติ', async ({ page }) => {
    // Case 1.12: kb11Signed=true, approvedMethods=[1] มาแล้วจากฐาน mock — ยังไม่ได้เสนอ/ลงนาม คบ.8
    await seedMockState(page, 'Case 1.12', 'officer', {
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: 'ส่งเสนอเลขาธิการฯ ลงนาม' }).click()

    let c = await readCase(page, CASE_NO)
    expect(c?.kb8SubmittedAt).toBeTruthy()

    await switchRole(page, 'secretary')
    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: 'ลงนาม' }).click()
    await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
    await signInPlace(page)

    c = await readCase(page, CASE_NO)
    expect(c?.kb8Signed).toBe(true)
    expect(c?.kb8SignedAt).toBeTruthy()

    // กรอกแผนปฏิบัติ (WIT0819) แล้วชี้แจง Need-to-Know (WIT0820) แล้วเริ่มปฏิบัติจริง (WIT0821)
    await switchRole(page, 'officer')
    await page.goto(METHOD1_URL)
    await page.getByLabel('สมาชิกชุดปฏิบัติและการจัดเวร').fill('ร.ต.อ. ก. และสมาชิก 4 นาย')
    await page.getByLabel('ยานพาหนะ').fill('รถกระบะตู้ทึบ 1 คัน')
    await page.getByRole('button', { name: 'ถัดไป' }).click()

    await page.getByLabel('ผู้ชี้แจง').fill(OFFICER)
    await expect(page.getByTestId('method-1-start')).toBeEnabled()
    await page.getByTestId('method-1-start').click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    c = await readCase(page, CASE_NO)
    const track = (c?.methodTracks as Array<{ method: number; status: string; plan?: Record<string, unknown> }>).find(
      (t) => t.method === 1
    )
    expect(track?.status).toBe('active')
    expect(track?.plan?.teamMembers).toContain('ร.ต.อ. ก.')
  })

  test('TC-068 · [Happy] เปลี่ยน Phase จาก TEMPORARY เป็น MAIN โดยไม่รีเซ็ตวันสะสม', async ({ page }) => {
    const startedAt = daysAgoIso(20)
    await seedMockState(page, 'Case 1.12', 'officer', {
      kb5Approved: true,
      kb9Signed: false,
      kb11Signed: true, // ผลคำร้องหลักอนุมัติแล้ว — เหลือแค่ลงนาม คบ.8
      kb8Signed: false,
      kb8SignedAt: undefined,
      kb8SubmittedAt: '10/09/2569 08:00',
      kb8SubmittedBy: OFFICER,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'active', startedAt, wizardStep: 1 }],
      episode: {
        id: 'EP-TC068',
        openedAt: startedAt,
        phases: [{ id: 'PH-TC068', kind: 'TEMPORARY', startedAt, orderRef: 'คบ.5' }],
      },
    })

    await page.goto(`/dossier/${CASE_NO}`)
    const before = await readCase(page, CASE_NO)
    const beforePhases = before?.episode?.phases as Array<{ kind: string }>
    expect(beforePhases).toHaveLength(1)

    await switchRole(page, 'secretary')
    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: 'ลงนาม' }).click()
    await page.getByRole('button', { name: 'ลงนาม คบ.8' }).click()
    await signInPlace(page)

    const after = await readCase(page, CASE_NO)
    const phases = after?.episode?.phases as Array<{ kind: string; startedAt: string; endedAt?: string }>
    // Episode เดิมต้องถูกคงไว้ — เพิ่ม Phase ใหม่ต่อท้าย ไม่เปิด Episode ใหม่ และไม่รีเซ็ตวันสะสม
    expect(phases).toHaveLength(2)
    expect(phases[0].kind).toBe('TEMPORARY')
    expect(phases[0].endedAt).toBeTruthy()
    expect(phases[1].kind).toBe('MAIN')

    await switchRole(page, 'officer')
    await page.goto(METHOD1_URL)
    await expect(page.getByText('สถานะปัจจุบัน: MAIN_ACTIVE')).toBeVisible()
  })

  test('TC-069 · [Negative] วันสะสม TEMPORARY+MAIN ใกล้ครบเพดาน 180 วัน — 08A-1 ไม่มีจุดตรวจเพดานก่อนเริ่ม/ต่อปฏิบัติ', async ({
    page,
  }) => {
    // Episode ที่มีวันสะสมแล้ว 175 วัน — ไม่มีปุ่ม/แบบฟอร์มใดในหน้า 08A-1 ให้ "บันทึกคุ้มครองต่ออีก N วัน"
    // โดยตรง (การขยายเวลาอยู่ที่แท็บ 11A/08C) จึงตรวจว่าเมื่อวิธีนี้เดินต่อ (เช่น กด "เริ่มปฏิบัติจริง"
    // ของวิธีที่ยังไม่ active) ระบบต้องเตือนเพดานเช่นกัน — ของจริง methodStartBlocker (methodProgress.ts)
    // บังคับผ่าน setMethodStatus แล้วว่าใกล้/ครบเพดาน 180 วัน (นับรวมทุก Episode เดียวกัน) ห้ามตั้งสถานะ active
    const startedAt = daysAgoIso(174)
    await seedMockState(page, 'Case 1.12', 'officer', {
      kb5Approved: true,
      approvedMethods: [1, 2],
      methodTracks: [
        { method: 1, status: 'active', startedAt },
        { method: 2, status: 'pending', wizardStep: 3 },
      ],
      episode: {
        id: 'EP-TC069',
        openedAt: startedAt,
        phases: [{ id: 'PH-TC069', kind: 'TEMPORARY', startedAt, orderRef: 'คบ.5' }],
      },
    })

    await page.goto(`/dossier/${CASE_NO}`)
    const before = await readCase(page, CASE_NO)
    expect(before?.episode).toBeTruthy()

    // ธุรกิจที่ถูกต้อง: เริ่มวิธีที่ 2 ต่อ (อีก ~10 วันของ Episode เดียวกัน) ต้องถูกเตือน/ปฏิเสธเมื่อจะเกิน 180 วัน
    await page.goto(`/protection-method/2?caseNo=${CASE_NO}`)
    await page.getByRole('button', { name: 'บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE' }).click()
    await confirmDialog(page, 'ยืนยันเริ่มปฏิบัติจริง')

    const after = await readCase(page, CASE_NO)
    const track2 = (after?.methodTracks as Array<{ method: number; status: string }>).find((t) => t.method === 2)
    // ของจริง: setMethodStatus ปฏิเสธการตั้ง active เมื่อ methodStartBlocker คืนเหตุผล (ใกล้ครบ/ครบเพดาน 180 วัน)
    // สถานะจึงยังคงเป็น pending ไม่ขยับไป active และเหตุผลถูกบันทึกลงประวัติแฟ้ม
    expect(track2?.status).not.toBe('active')
  })

  test('TC-070 · [Negative] คำร้องหลักไม่อนุมัติระหว่างคุ้มครองชั่วคราว — ต้องส่งเรื่องไปแท็บ 09A และยุติช่วงชั่วคราว', async ({
    page,
  }) => {
    const startedAt = daysAgoIso(5)
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      kb9Signed: false,
      kb11Signed: false,
      kb8Signed: false,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'active', startedAt }],
      episode: {
        id: 'EP-TC070',
        openedAt: startedAt,
        phases: [{ id: 'PH-TC070', kind: 'TEMPORARY', startedAt, orderRef: 'คบ.5' }],
      },
      // ผลคำร้องหลัก = ไม่อนุมัติ
      activity7State: 'rejected',
    })

    await page.goto(`/dossier/${CASE_NO}`)
    const after = await readCase(page, CASE_NO)
    const track = (after?.methodTracks as Array<{ status: string; endedAt?: string }>)[0]
    // ธุรกิจที่ถูกต้อง: ต้องยุติช่วงชั่วคราวโดยอัตโนมัติ (endedAt) และแฟ้มต้องย้ายไปเส้นทางแท็บ 09A
    // ของจริง: effect ใน dossier/$caseNo.tsx ตรวจตอนโหลดแฟ้มว่า activity7State === 'rejected' และมี
    // track active/preparing อยู่ แล้วเรียก endProtectionForNonApproval ให้อัตโนมัติ (ยุติ track + ปิด Episode + ต่อ คบ.10 ที่ 09A)
    expect(track.status).toBe('ended')
  })

  test('TC-071 · [Negative] จัดชุดปฏิบัติ/เริ่มปฏิบัติก่อน คบ.8 ลงนาม (กรณีคำร้องหลัก) — ต้องถูกปฏิเสธ', async ({
    page,
  }) => {
    // ร่าง คบ.8 เสนอแล้วแต่ยังไม่ลงนาม และไม่ใช่กรณีเร่งด่วน (ไม่มี คบ.5)
    await seedMockState(page, 'Case 1.12', 'officer', {
      kb5Approved: false,
      kb8Signed: false,
      kb8SubmittedAt: '10/09/2569 08:00',
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    await page.goto(METHOD1_URL)
    await expect(page.getByText(/คบ\.8 ยังไม่ผ่านการลงนาม/)).toBeVisible()
    // ปุ่มถัดไปของ wizard ต้องถูกปิดจนกว่าจะลงนาม คบ.8 — ห้ามเดินไปถึงขั้นจัดแผน/เริ่มปฏิบัติจริง
    await expect(page.getByRole('button', { name: 'ถัดไป' })).toBeDisabled()
  })

  test('TC-072 · [Edge] ส่งกลับแก้ไข คบ.8 — ต้องมีทาง Revision ใหม่ให้เจ้าหน้าที่แก้และเสนอใหม่', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      kb8Signed: false,
      kb8SubmittedAt: '10/09/2569 08:00',
      kb8SubmittedBy: OFFICER,
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    await switchRole(page, 'secretary')
    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: 'ลงนาม' }).click()

    // ธุรกิจที่ถูกต้อง: เลขาธิการฯ ต้องส่งกลับแก้ไข คบ.8 ได้ (เหมือน คบ.6/คบ.10/คบ.14/คบ.15)
    // ของจริง: OutgoingNoticeSignature.tsx เพิ่มปุ่ม "ส่งกลับแก้ไข" (data-testid=kb8-return-for-revision) ให้ formNo===8
    // เท่านั้น — ต้องกรอกเหตุผลก่อนยืนยัน แล้วเรียก returnKb8ForRevision เพื่อจัดเก็บฉบับเดิมและเปิดรอบแก้ไขใหม่
    await expect(page.getByRole('button', { name: /ส่งกลับ|ส่งคืนแก้ไข|ไม่ผ่าน/ })).toBeVisible()
  })

  test('TC-073 · [Edge] แผนปฏิบัติไม่ระบุผู้ใกล้ชิดที่อนุมัติ — ต้องเตือนก่อนเริ่มปฏิบัติ', async ({ page }) => {
    await seedMockState(page, 'Case 1.12', 'officer', {
      urgent: true,
      kb5Approved: true,
      approvedMethods: [1],
      methodTracks: [{ method: 1, status: 'pending' }],
    })

    await page.goto(METHOD1_URL)
    // เว้นช่อง "ผู้ใกล้ชิดที่ได้รับอนุมัติให้ติดต่อ" ไว้โดยเจตนา แล้วพยายามเริ่มปฏิบัติจริงทันที
    await expect(page.getByLabel('ผู้ใกล้ชิดที่ได้รับอนุมัติให้ติดต่อ')).toHaveValue('')
    await page.getByRole('button', { name: 'ถัดไป' }).click()
    await page.getByTestId('method-1-start').click()

    // ธุรกิจที่ถูกต้อง: ต้องเตือนว่าแผนยังไม่ครบ (ขาดผู้ใกล้ชิดที่อนุมัติ) ก่อนให้ยืนยัน/เริ่มปฏิบัติ
    // ของจริง: ไม่มีการเตือนใด ๆ เลย ระบบพาเข้าสู่จอยืนยันเริ่มปฏิบัติจริงทันที
    await expect(page.locator('.swal2-popup')).toContainText(/ผู้ใกล้ชิด|ยังไม่ครบ/)
  })
})
