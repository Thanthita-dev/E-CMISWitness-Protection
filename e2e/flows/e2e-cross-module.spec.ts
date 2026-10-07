import { expect, test, type Page } from '@playwright/test'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * E2E ข้ามโมดูล / Business Rule รวม — TC-154 .. TC-161
 *
 * เทสต์ชุดนี้เป็นการเดินทาง (journey) ข้ามหลายแท็บ/บทบาท และกฎธุรกิจส่วนกลาง
 * (สิทธิ์ตามบทบาท, SLA, audit trail, การเก็บความลับเอกสาร, การนับ Episode/วัน)
 *
 * แนวทาง: ผังจริงยาว 8-15 ขั้นตอน ไม่มีทางลัดผ่าน UI ครบทุกขั้นในโปรโตไทป์ — ตามคำแนะนำของ BRIEF
 * จึงใช้ seedMockState + casePatch "ประกอบ" สถานะปลายทาง (เสมือนเดินมาถึงจุดนั้นแล้ว) แล้วตรวจสอบ
 * กฎ/ผลลัพธ์จริงที่ UI แสดง แทนการกดผ่านทุกจอ — จุดที่ขับผ่าน UI ได้จริง (เช่น ข้อ 14, อุทธรณ์, ขยายเวลา,
 * แยกวิธีคุ้มครอง) จะเดินผ่านปุ่ม/ฟอร์มจริงเพื่อยืนยันกฎเหล่านั้นด้วย
 */

const CASE_NO = 'WP-2569-000501'
const DOSSIER_URL = `/dossier/${CASE_NO}`
const MONITOR_URL = `/protection-monitor?caseNo=${CASE_NO}`
const TERMINATION_URL = `/termination/${CASE_NO}`
const EXTENSION_URL = `/protection-extension/${CASE_NO}`
const APPEAL_URL = `/appeal-folder/${CASE_NO}`

const OFFICER = 'นางสาวอรุณี ใจมั่น'
const SUPERVISOR = 'นายกิตติศักดิ์ ธรรมรักษ์'
const COMMITTEE = 'นางสาวปิยะนุช เลขะกุล'

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

// ---------------------------------------------------------------------------
// TC-154 · [E2E-01] เส้นทางเร่งด่วนเต็มรูปแบบ: คบ.2→คบ.5→คุ้มครอง→คบ.13→ยุติ
// ---------------------------------------------------------------------------
test.describe('TC-154 · [E2E-01] เส้นเร่งด่วนเต็มรูปแบบ — Episode ต่อเนื่อง TEMPORARY+MAIN = 120 วัน และเอกสารถูกล็อก', () => {
  test('TC-154 · ปลายทางของเส้นทางเร่งด่วน: Episode เดียวไม่ถูกรีเซ็ต วันสะสมรวม 120 วัน และคำสั่งยุติถูกล็อก', async ({ page }) => {
    // ประกอบสถานะ "ปลายทาง" ของเส้นทาง — TEMPORARY (คบ.5) 20 วัน ต่อเนื่องด้วย MAIN (คบ.8) 100 วัน ใน Episode เดียวกัน
    // ปิดทั้งสอง Phase แล้ว (ยุติแล้ว) เพื่อให้ยอดสะสมคงที่ ไม่ผูกกับวันที่รันเทสต์
    const END_STATE = {
      stage: 'terminated',
      kb5Approved: true,
      kb8Signed: true,
      kb8SignedAt: '01/01/2569 09:00',
      kb11Signed: true,
      episode: {
        id: 'EP-TC154',
        openedAt: '2026-01-01T00:00:00.000Z',
        closedAt: '2026-05-01T00:00:00.000Z',
        closeReason: 'ยุติการคุ้มครอง — ภัยระงับแล้ว',
        phases: [
          { id: 'PH-TC154-T', kind: 'TEMPORARY', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-21T00:00:00.000Z', orderRef: 'คบ.5' },
          { id: 'PH-TC154-M', kind: 'MAIN', startedAt: '2026-01-21T00:00:00.000Z', endedAt: '2026-05-01T00:00:00.000Z', orderRef: 'คบ.8' },
        ],
      },
      methodTracks: [{ method: 1, status: 'ended', startedAt: '2026-01-21T00:00:00.000Z', endedAt: '2026-05-01T00:00:00.000Z' }],
      kb16: {
        orderNo: '016/2569',
        reason: 'ภัยระงับแล้ว ผู้รับการคุ้มครองไม่ประสงค์รับความคุ้มครองต่อ',
        issuedAt: '2026-04-28',
        effectiveAt: '2026-05-01',
        operationStoppedAt: '2026-05-01',
        signedAt: '28/04/2569 10:00',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
      closedAt: '2026-05-01T00:00:00.000Z',
    }

    await seedMockState(page, 'Case 1.13', 'officer', END_STATE)

    // แท็บ 10 — วันสะสมต่อเนื่องข้าม Phase ไม่ถูกรีเซ็ต: 20 (TEMPORARY) + 100 (MAIN) = 120 วัน คงเหลือ 60 จากเพดาน 180
    await page.goto(MONITOR_URL)
    await expect(page.getByText(/สะสม\s*120\s*วัน\s*คงเหลือ\s*60\s*จากเพดาน\s*180\s*วัน/)).toBeVisible()

    // แท็บ 11D — คำสั่งยุติ (คบ.16) ถูกล็อกฉบับลงนาม แก้ทับไม่ได้
    await page.goto(TERMINATION_URL)
    await expect(page.getByText(/สะสม\s*120\/180\s*วัน/)).toBeVisible()
    await expect(page.getByText('ล็อกฉบับลงนาม')).toBeVisible()

    // ยืนยันด้วยข้อมูลใน store — Episode เดียว (ไม่ถูกสร้างใหม่) มีสอง Phase ต่อเนื่องกัน
    const finalCase = await readCase(page, CASE_NO)
    const episode = finalCase?.episode as { id: string; phases: Array<Record<string, unknown>> }
    expect(episode.id).toBe('EP-TC154')
    expect(episode.phases).toHaveLength(2)
    expect(episode.phases[0].endedAt).toBe(episode.phases[1].startedAt) // ต่อเนื่องไม่มีช่องว่าง/ไม่ทับซ้อน
  })
})

// ---------------------------------------------------------------------------
// TC-155 · [E2E-02] เส้นทางปกติเต็มรูปแบบ + ขยายเวลาด้วย คบ.14
// ---------------------------------------------------------------------------
test.describe('TC-155 · [E2E-02] อนุมัติขยายเวลา คบ.14 — เพิ่มช่วงคุ้มครองใหม่โดยไม่ทับคำสั่งเดิม แล้วกลับแท็บ 10', () => {
  test('TC-155 · เลขาธิการฯ อนุมัติ คบ.14 ขยาย 30 วัน → เพิ่ม Phase ใหม่ต่อท้าย (ไม่แก้ทับ) → ลิงก์กลับแท็บ 10', async ({ page }) => {
    const AT_PENDING_EXTENSION = {
      stage: 'protection',
      episode: {
        id: 'EP-TC155',
        openedAt: '2026-01-01T00:00:00.000Z',
        phases: [{ id: 'PH-TC155', kind: 'MAIN', startedAt: '2026-01-01T00:00:00.000Z', orderRef: 'คบ.11' }],
      },
      protectionEndAt: '2026-03-01T00:00:00.000Z',
      extensionRequests: [
        {
          id: 'EXT-TC155',
          requestedAt: '20/02/2569 09:00',
          requestedBy: OFFICER,
          reason: 'ยังมีภัยต่อเนื่องตามผลประเมิน คบ.13 งวดล่าสุด',
          durationDays: 30,
          status: 'pending',
          version: 1,
          periodFrom: '2026-03-01',
          periodTo: '2026-03-31',
        },
      ],
    }

    await seedMockState(page, 'Case 1.13', 'secretary', AT_PENDING_EXTENSION)
    await page.goto(EXTENSION_URL)

    await expect(page.getByText('อนุมัติแล้วจะเพิ่มช่วงคุ้มครองใหม่ต่อจากวันสิ้นสุดเดิม โดยไม่แก้ทับช่วงเดิม')).toBeVisible()
    await page.getByPlaceholder('ความเห็นประกอบคำสั่ง').fill('เห็นควรอนุมัติตามที่เสนอ')
    await page.getByRole('button', { name: /อนุมัติขยายเวลา\s*$/ }).click()
    await confirmDialog(page, 'ยืนยันอนุมัติ', 'เพิ่มช่วงคุ้มครองใหม่ต่อจากวันสิ้นสุดเดิม')

    // UI แสดงผลอนุมัติและลิงก์กลับแท็บ 10 ให้กำหนดรอบ คบ.13 ถัดไป
    await expect(page.getByText(/อนุมัติขยายเวลา\s*30\s*วันแล้ว/)).toBeVisible()
    const backLink = page.getByRole('link', { name: 'กลับไปรายงานผลการคุ้มครอง · กำหนดรอบ คบ.13 ถัดไป' })
    await expect(backLink).toBeVisible()
    await backLink.click()
    // TC-155 — ลิงก์กลับแท็บ 10 ต้องพกเลขคำร้อง (search caseNo) ไปด้วย เพื่อเปิดแท็บ 10 ของแฟ้มนี้โดยตรง
    // แทนที่จะเด้งไปหน้ารวม '/protection' ให้ผู้ใช้เลือกสำนวนซ้ำอีกครั้ง
    await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO}`))

    // ช่วงคุ้มครองใหม่ถูก "เพิ่ม" เป็น Phase ที่สอง ไม่ใช่แก้ทับ Phase เดิม
    const after = await readCase(page, CASE_NO)
    const episode = after?.episode as { phases: Array<Record<string, unknown>> }
    expect(episode.phases).toHaveLength(2)
    expect(episode.phases[0].startedAt).toBe('2026-01-01T00:00:00.000Z') // Phase เดิมยังอยู่ครบ ไม่ถูกลบ/แก้ค่าเริ่ม
    const requests = (after?.extensionRequests ?? []) as Array<Record<string, unknown>>
    expect(requests[0].status).toBe('approved')
    expect(requests[0].locked).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// TC-156 · [E2E-03] ไม่อนุมัติ → อุทธรณ์ → คณะกรรมการเปลี่ยนคำสั่ง → เริ่มคุ้มครอง
// ---------------------------------------------------------------------------
test.describe('TC-156 · [E2E-03] อุทธรณ์สำเร็จ — ไม่สร้าง คบ.1 ใหม่ และคุ้มครองเริ่มได้ตามคำสั่งใหม่', () => {
  test('TC-156 · คณะกรรมการมีมติเปลี่ยนคำสั่งเป็นอนุมัติ → แฟ้มเดิมกลับ 08A พร้อมเริ่มคุ้มครอง', async ({ page }) => {
    const AT_AGENDA = {
      stage: 'appeal',
      activity7State: 'committee',
      appealAgainst: 'kb10',
      decisionNumber: 'ลธ.ปปท./000501/2569',
      deliveredAt: new Date(Date.now() - 20 * 86400000).toISOString(),
      appealDueAt: new Date(Date.now() + 10 * 86400000).toISOString(),
      appealFiledAt: new Date(Date.now() - 5 * 86400000).toISOString(),
      appealReason: 'มีพยานหลักฐานใหม่แสดงความเชื่อมโยงของผู้ข่มขู่กับผู้ถูกกล่าวหา',
      appealFolder: {
        stage: 'agenda',
        checkedAt: '01/08/2569 09:00',
        checkedBy: OFFICER,
        lateDays: 0,
        officerNote: 'เอกสารครบถ้วน',
        supervisorNote: 'เห็นควรเสนอ',
        supervisorSignedAt: '02/08/2569 09:00',
        deputyNote: 'เห็นควรเสนอ',
        deputyAt: '03/08/2569 09:00',
        secretaryNote: 'เห็นควรเสนอคณะกรรมการ',
        secretaryAt: '04/08/2569 09:00',
        agendaNo: 'วาระที่ 5/2569',
        agendaAt: '05/08/2569 09:00',
      },
      appealResolution: undefined,
    }

    await seedMockState(page, 'Case 1.8', 'committee', AT_AGENDA)
    await page.goto(APPEAL_URL)

    await page.getByTestId('appeal-resolution-no').fill('มติที่ 56/2569')
    await page.getByTestId('appeal-resolution-note').fill('พยานหลักฐานใหม่รับฟังได้ ให้เปลี่ยนแปลงคำสั่งเดิม')
    await page.getByTestId('appeal-resolution-overturn').click()
    // จอยืนยันย้ำข้อห้ามสำคัญของเส้นทางนี้ — ห้ามสร้าง คบ.1 ใหม่
    await confirmDialog(page, 'ยืนยันมติเปลี่ยนแปลงคำสั่ง', 'ไม่สร้าง คบ.1 ใหม่')

    const resolved = await readCase(page, CASE_NO)
    expect((resolved?.appealResolution as Record<string, unknown>).outcome).toBe('overturn')
    expect(resolved?.stage).toBe('method_operation')
    // คำอุทธรณ์และมติผูกกับแฟ้มเดิม — ยังเป็นเลขคำร้องเดิม ไม่มีการเปิดแฟ้มที่สอง
    expect(resolved?.no).toBe(CASE_NO)
    const allCases = await page.evaluate(() => {
      const raw = localStorage.getItem('ecmis-case-storage-v2')
      return raw ? (JSON.parse(raw).state.cases as unknown[]).length : 0
    })
    expect(allCases).toBe(1)

    // การคุ้มครองเริ่มได้ตามคำสั่งใหม่ — แฟ้มปรากฏเป็นสำนวนที่ต้องแยกแนวทางปฏิบัติที่หน้า 08A ทันที
    await switchRole(page, 'officer')
    await page.goto('/protection-methods')
    await expect(page.getByRole('heading', { name: `${CASE_NO} · สมชาย ใจดี` })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// TC-157 · [E2E-04] ครบเพดาน 180 วันแต่ยังมีภัย → ข้อ 14 → ส่งมอบกรม
// ---------------------------------------------------------------------------
test.describe('TC-157 · [E2E-04] ครบเพดาน 180 วัน — ข้อ 14 ห้ามขยาย คบ.14 และปิด Episode ตามวันที่มีผล', () => {
  test('TC-157 · เดินเต็มเส้นข้อ 14: จัดทำ→กลั่นกรอง 2 ชั้น→มติคณะกรรมการ→หนังสือ→ส่งมอบ', async ({ page }) => {
    const AT_CAP = {
      stage: 'protection',
      episode: {
        id: 'EP-TC157',
        openedAt: '2026-01-01T00:00:00.000Z',
        phases: [{ id: 'PH-TC157', kind: 'MAIN', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-06-30T00:00:00.000Z', orderRef: 'คบ.8' }],
      },
      article14: undefined,
      article14Referral: undefined,
      extensionRequests: [],
    }

    await seedMockState(page, 'Case 1.13', 'officer', AT_CAP)

    // WIT1150 — ถึงเพดานแล้ว ห้ามจัดทำ คบ.14 เพิ่ม ต้องไปแขนงข้อ 14 แทน
    await page.goto(EXTENSION_URL)
    await expect(page.getByText(/ถึงเพดานรวม\s*180\s*วันแล้ว.*ห้ามจัดทำ\s*คบ\.14\s*เพิ่ม/)).toBeVisible()
    await expect(page.getByRole('button', { name: /จัดทำ คบ\.14/ })).toHaveCount(0)

    // WIT0854 — จัดทำและเสนอเรื่องตามข้อ 14
    await page.goto('/article14')
    await expect(page.getByText(/คุ้มครองสะสม\s*180\s*วัน\s*·\s*คงเหลือ\s*0\s*วัน\s*จากเพดาน\s*180\s*วัน/)).toBeVisible()
    await page.getByLabel('เหตุความไม่ปลอดภัยที่ยังคงอยู่ *').fill('ยังมีกลุ่มผู้ต้องหาติดตามคุกคามต่อเนื่อง')
    await page
      .getByLabel('รายงานผล / ประเมินความเสี่ยง (อ้าง คบ.13 และคำสั่งเดิม) *')
      .fill('ผลประเมินตาม คบ.13 ล่าสุดยังพบความเสี่ยงระดับสูง')
    await page.getByTestId('submit-article14-proposal').click()
    await confirmDialog(page, 'ยืนยันเสนอ', 'เข้าคิวผู้บังคับบัญชาตรวจ')

    // ผู้บังคับบัญชาชั้นต้นเห็นชอบ
    await switchRole(page, 'supervisor')
    await page.goto('/article14')
    await page.getByTestId('article14-endorse-button').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    // เลขาธิการฯ เห็นชอบเสนอคณะกรรมการ
    await switchRole(page, 'secretary')
    await page.goto('/article14')
    await page.getByTestId('article14-endorse-button').click()
    await confirmDialog(page, 'ยืนยันเห็นชอบ')

    // คณะกรรมการมีมติเห็นชอบส่งกรม
    await switchRole(page, 'committee')
    await page.goto('/article14')
    await page.getByTestId('article14-committee-approve').getByRole('button')
    await page.locator('input[placeholder="เลขที่มติ / ครั้งที่ประชุม"]').fill('มติที่ 12/2569')
    await page.locator('input[placeholder="สาระสำคัญของมติ"]').fill('เห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ')
    await page.getByTestId('article14-committee-approve').click()
    await confirmDialog(page, 'ยืนยันมติ')

    expect(((await readCase(page, CASE_NO))?.article14 as Record<string, unknown>)?.step).toBe('letter_sent')

    // เจ้าหน้าที่บันทึกหนังสือขาออกและส่งมอบจริง — Episode ปิดตามวันที่มีผล เชื่อมหน่วยงานผู้รับไว้ในแฟ้มเดิม
    await switchRole(page, 'officer')
    await page.goto('/article14')
    await page.locator('input[placeholder="เลขที่หนังสือ (สารบรรณเดิม)"]').fill('ปปท 0007/9001')
    await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
    await confirmDialog(page, 'ยืนยันบันทึก')
    // WIT0860 — บันทึกหนังสือตอบรับจากกรมก่อนส่งมอบ
    await page.getByPlaceholder('เลขที่หนังสือตอบรับของกรม').fill('ยธ 0007/2569')
    await page.getByPlaceholder('ผู้ประสานของกรม').fill('นายประสาน ตอบรับ')
    await page.getByLabel('วันนัดส่งมอบ').fill('2026-10-01')
    await page.getByTestId('article14-reply-file').setInputFiles({ name: 'reply.pdf', mimeType: 'application/pdf', buffer: Buffer.from('mock') })
    await page.getByTestId('article14-record-reply').click()
    await confirmDialog(page, 'ยืนยันบันทึก')

    await page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }).click()
    await confirmDialog(page, 'ยืนยันส่งมอบ')

    await expect(page.getByText(/ส่งมอบให้กรมคุ้มครองสิทธิฯ เรียบร้อยแล้ว/)).toBeVisible()

    const done = await readCase(page, CASE_NO)
    expect(((done?.article14 as Record<string, unknown>)?.step)).toBe('handover_done')
    expect(done?.stage).toBe('transferred')
    const episode = done?.episode as Record<string, unknown>
    expect(episode.closedAt).toBeTruthy() // Episode มาตรการเบื้องต้นของ ป.ป.ท. ปิดแล้ว
    expect(episode.successorAgency).toBeTruthy() // เชื่อมหน่วยงานผู้รับ (กรมคุ้มครองสิทธิและเสรีภาพ)
    expect((episode.phases as unknown[]).length).toBe(1) // ประวัติ Phase เดิมยังอยู่ครบ ไม่ถูกลบ
  })
})

// ---------------------------------------------------------------------------
// TC-158 · [E2E-05] อนุมัติหลายวิธีพร้อมกันและติดตามรวมในรอบเดียว
// ---------------------------------------------------------------------------
test.describe('TC-158 · [E2E-05] วิธี 1/3/4 ทำงานพร้อมกัน — คบ.13 รวมทุกวิธีในรอบเดียว แต่วันสะสมนับเป็น Episode เดียว', () => {
  test('TC-158 · แต่ละวิธีมีสถานะ/วันเริ่มของตนเอง ขณะที่รอบ คบ.13 เดียวรวมทุกวิธี', async ({ page }) => {
    const AT_MULTI_METHOD = {
      stage: 'protection',
      approvedMethods: [1, 3, 4],
      episode: {
        id: 'EP-TC158',
        openedAt: '2026-01-01T00:00:00.000Z',
        phases: [{ id: 'PH-TC158', kind: 'MAIN', startedAt: '2026-01-01T00:00:00.000Z', orderRef: 'คบ.8' }],
      },
      methodTracks: [
        { method: 1, status: 'active', startedAt: '2026-01-01T00:00:00.000Z' },
        { method: 3, status: 'active', startedAt: '2026-01-05T00:00:00.000Z' },
        { method: 4, status: 'preparing', startedAt: '2026-01-08T00:00:00.000Z' },
      ],
      monthlyReports: [
        { id: 'MR-TC158', period: '2026-01', submittedAt: '2026-01-31T00:00:00.000Z', submittedBy: OFFICER, summary: '' },
      ],
      kb8Signed: true,
      kb11Signed: true,
    }

    await seedMockState(page, 'Case 1.13', 'officer', AT_MULTI_METHOD)

    // 08A — แต่ละวิธีคงสถานะ/วันเริ่มของตนเอง (ต่างกัน) แต่แสดงเป็น Phase เดียวของ Episode เดียวกัน
    await page.goto('/protection-methods')
    await expect(page.getByText('วิธีที่ 1', { exact: false }).first()).toBeVisible()

    // แท็บ 10 — รอบยังไม่จัดทำ ระบบเสนอวิธีที่ active มาเป็นค่าเริ่มต้นให้ครบ (WIT1005)
    await page.goto(MONITOR_URL)
    const method1Btn = page.getByRole('button', { name: /^วิธีที่ 1/ })
    const method3Btn = page.getByRole('button', { name: /^วิธีที่ 3/ })
    const method4Btn = page.getByRole('button', { name: /^วิธีที่ 4/ })
    const method2Btn = page.getByRole('button', { name: /^วิธีที่ 2/ })
    await expect(method1Btn).toHaveClass(/border-blue/)
    await expect(method3Btn).toHaveClass(/border-blue/)
    // วิธีที่ 4 ยังเป็น "preparing" ไม่ใช่ active — ระบบจึงไม่ติ๊กให้อัตโนมัติ (ต้องเลือกเองถ้าจะรวมในรอบนี้)
    await expect(method2Btn).not.toHaveClass(/border-blue/)
    await method4Btn.click()

    // คำสั่งที่อ้างอิงและผู้ปฏิบัติมีค่าเริ่มต้นให้แล้ว (จาก Episode/เจ้าของสำนวน) เหลือกรอกสรุปผลอีกช่องเดียว
    await page.getByLabel('สรุปผลการดำเนินการ').fill('ปฏิบัติทั้งสามวิธีตามแผนในรอบเดือนมกราคม 2569 ไม่มีเหตุการณ์ผิดปกติ')
    await page.getByRole('button', { name: 'จัดทำ คบ.13 และส่งลงนาม' }).click()

    const after = await readCase(page, CASE_NO)
    const round = ((after?.monthlyReports ?? []) as Array<Record<string, unknown>>)[0]
    expect((round.methods as number[]).sort()).toEqual([1, 3, 4]) // คบ.13 รวมทุกวิธีในรอบเดียว

    // แต่ยอดวันสะสมยังนับเป็น Episode เดียว ไม่ใช่ผลรวมแยกตามวิธี
    const episode = after?.episode as { phases: unknown[] }
    expect(episode.phases).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// TC-159 · [E2E-06] ตรวจสอบความสมบูรณ์ของ Audit Trail ตลอดวงจร
// ---------------------------------------------------------------------------
test.describe('TC-159 · [E2E-06] Audit Trail ตลอดวงจร — แท็บ Timeline & Audit Trail ครบทุกเหตุการณ์ + Export CSV', () => {
  test('TC-159 · แฟ้มที่ปิดงานแล้วเปิดแท็บ Audit Log เห็นครบทุกเหตุการณ์ ไม่มีปุ่มลบ/แก้ไข และ Export CSV เพิ่มรายการส่งออก', async ({ page }) => {
    const RICH_HISTORY = [
      { at: '10/01/2569 09:00', action: 'รับเรื่องเข้าทะเบียน', actor: 'ธุรการ', detail: 'รับคำร้อง คบ.1' },
      { at: '10/01/2569 10:00', action: 'ผอ. มอบหมายเจ้าของสำนวน', actor: 'ผอ.สำนัก', detail: `มอบหมาย ${OFFICER}` },
      { at: '12/01/2569 09:00', action: 'จัดทำเอกสารหลักฐานประกอบคำร้อง', actor: OFFICER, detail: 'แนบบันทึกจับกุมเข้าแฟ้ม' },
      { at: '15/01/2569 09:00', action: 'ลงนามคำสั่ง คบ.8', actor: OFFICER, detail: 'ลงนามคำสั่งจัดชุดคุ้มครอง' },
      { at: '20/01/2569 14:00', action: 'เข้าถึงข้อมูลพยาน', actor: SUPERVISOR, detail: 'เปิดดูข้อมูลระบุตัวพยานเพื่อกลั่นกรอง คบ.13' },
      { at: '25/01/2569 15:00', action: 'ส่งออกรายงาน', actor: COMMITTEE, detail: 'ส่งออกรายงานสรุปแฟ้มเป็น PDF' },
      { at: '01/05/2569 09:00', action: 'ปิดงาน', actor: OFFICER, detail: 'ยุติการคุ้มครองและปิดงาน' },
    ]
    const CLOSED_STATE = {
      stage: 'terminated',
      closedAt: '2026-05-01T00:00:00.000Z',
      assignmentHistory: RICH_HISTORY,
      kb16: { orderNo: '016/2569', reason: 'ยุติ', effectiveAt: '2026-05-01', signedAt: '28/04/2569 10:00', signedBy: 'เลขาธิการ', locked: true },
    }

    await seedMockState(page, 'Case 1.13', 'officer', CLOSED_STATE)

    // เปิดแฟ้ม แล้วสลับไปแท็บ "ประวัติ / Audit Log" — Timeline & Audit Trail ต้องเห็นได้ทุกบทบาทที่เปิดแฟ้มนี้ได้
    await page.goto(DOSSIER_URL)

    // แฟ้มมีเหตุการณ์ครบในฐานข้อมูล (assignmentHistory) — ตรวจว่าข้อมูลไม่หาย
    const seeded = await readCase(page, CASE_NO)
    const history = (seeded?.assignmentHistory ?? []) as Array<Record<string, string>>
    expect(history.some((h) => h.action.includes('เข้าถึงข้อมูลพยาน'))).toBe(true)
    expect(history.some((h) => h.action.includes('ส่งออกรายงาน'))).toBe(true)

    await page.getByTestId('dossier-tab-audit').click()

    const auditLog = page.getByTestId('dossier-audit-log')
    await expect(auditLog).toBeVisible()
    const list = page.getByTestId('dossier-audit-log-list')

    // ครบทุกประเภทเหตุการณ์ตามวงจร: รับเรื่อง มอบหมาย จัดทำ/แก้ไขเอกสาร ลงนาม เข้าถึงข้อมูลพยาน ส่งออก ปิดงาน
    await expect(list.getByText('รับเรื่องเข้าทะเบียน')).toBeVisible()
    await expect(list.getByText('ผอ. มอบหมายเจ้าของสำนวน')).toBeVisible()
    await expect(list.getByText('จัดทำเอกสารหลักฐานประกอบคำร้อง')).toBeVisible()
    await expect(list.getByText('ลงนามคำสั่ง คบ.8')).toBeVisible()
    await expect(list.getByText('เข้าถึงข้อมูลพยาน').first()).toBeVisible()
    await expect(list.getByText('ส่งออกรายงาน').first()).toBeVisible()
    await expect(list.getByText('ปิดงาน', { exact: true })).toBeVisible()
    // การเปิดแฟ้มของผู้ใช้ปัจจุบันเองก็ต้องถูกบันทึกเป็นการเข้าถึงข้อมูลพยาน (WIT0306)
    await expect(list.getByText('เปิดดูแฟ้มคำร้องคุ้มครองพยาน')).toBeVisible()

    // อ่านอย่างเดียว — ไม่มีปุ่มลบ/แก้ไขรายการใดในรายการเหตุการณ์ (ยกเว้นตัวกรอง/ปุ่ม Export ที่อยู่นอกรายการ)
    await expect(list.locator('button')).toHaveCount(0)
    await expect(page.getByText('ลบรายการ')).toHaveCount(0)

    // Export CSV — ต้องดาวน์โหลดไฟล์ และเพิ่มเหตุการณ์ "ส่งออก Audit Log" ต่อท้าย Log โดยไม่ลบ/ทับของเดิม
    const downloadPromise = page.waitForEvent('download')
    await page.getByTestId('dossier-audit-log-export-csv').click()
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('audit-log-')
    expect(download.suggestedFilename()).toContain(CASE_NO)

    await expect(list.getByText('ส่งออก Audit Log')).toBeVisible()
    // เหตุการณ์เดิมทั้งหมดยังอยู่ครบหลังส่งออก — ไม่มีรายการใดถูกทับหรือหาย
    await expect(list.getByText('รับเรื่องเข้าทะเบียน')).toBeVisible()
    await expect(list.getByText('ปิดงาน', { exact: true })).toBeVisible()

    // ตัวกรองหมวดหมู่ทำงาน — เลือก "ส่งออกข้อมูล" แล้วเห็นเฉพาะเหตุการณ์หมวดนั้น
    await page.getByTestId('dossier-audit-log-category-filter').selectOption('export')
    await expect(list.getByText('ส่งออก Audit Log')).toBeVisible()
    await expect(list.getByText('รับเรื่องเข้าทะเบียน')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// TC-160 · [E2E-07] ความสอดคล้องของวันสำคัญทุกประเภทในแฟ้มเดียว
// ---------------------------------------------------------------------------
test.describe('TC-160 · [E2E-07] 5 ประเภทวันในแฟ้มเดียว — นับระยะคุ้มครองจากวันเริ่มจริง/วันที่มีผลเท่านั้น', () => {
  test('TC-160 · วันอัปโหลดเอกสารที่ต่างไปมากไม่กระทบยอดสะสม และวันแต่ละประเภทแสดงแยกกันถูกต้อง', async ({ page }) => {
    const FIVE_DATES_STATE = {
      stage: 'protection',
      activity7State: 'approved',
      // (1) วันเริ่มจริง — ฐานการนับวันสะสม
      episode: {
        id: 'EP-TC160',
        openedAt: '2026-01-01T00:00:00.000Z',
        phases: [{ id: 'PH-TC160', kind: 'MAIN', startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-02-10T00:00:00.000Z', orderRef: 'คบ.8' }],
      },
      // (2) วันอัปโหลดเอกสาร — ต่างจากวันเริ่มจริงมาก ต้องไม่ถูกใช้นับระยะคุ้มครอง
      documents: [
        {
          id: 'DOC-TC160',
          category: 'source' as const,
          name: 'บันทึกจับกุม.pdf',
          uploadedAt: '2026-08-01T09:00:00.000Z',
          uploadedBy: OFFICER,
        },
      ],
      // (3) วันส่งมอบ (นำส่งหนังสือถึงพยาน — จุดตั้งต้นนับสิทธิอุทธรณ์)
      dispatchedAt: '2026-01-10T00:00:00.000Z',
      dispatchChannel: 'ไปรษณีย์',
      deliveredAt: '2026-01-15T00:00:00.000Z',
      // (4) วันที่มีผล และ (5) วันหยุดปฏิบัติจริง — แยกจากวันออกคำสั่ง
      kb16: {
        orderNo: '016/2569',
        reason: 'ยุติการคุ้มครอง',
        issuedAt: '2026-02-08',
        effectiveAt: '2026-02-10',
        operationStoppedAt: '2026-02-12',
        signedAt: '08/02/2569 10:00',
        signedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
        locked: true,
      },
      kb8Signed: true,
      kb11Signed: true,
    }

    await seedMockState(page, 'Case 1.13', 'officer', FIVE_DATES_STATE)

    // นับระยะคุ้มครองอ้างอิงวันเริ่มจริง (1 ม.ค.) ถึงวันที่มีผล/สิ้นสุด Phase (10 ก.พ.) = 40 วัน
    // แม้เอกสารจะอัปโหลดช้ากว่ามาก (1 ส.ค.) ก็ไม่กระทบยอดสะสมนี้เลย
    await page.goto(MONITOR_URL)
    await expect(page.getByText(/สะสม\s*40\s*วัน/)).toBeVisible()

    // วันที่มีผล / วันหยุดปฏิบัติจริง / วันออกคำสั่ง แสดงแยกกันชัดเจนที่แท็บ 11D (ไม่ใช่ค่าเดียวกัน)
    await page.goto(TERMINATION_URL)
    await expect(page.getByText('วันที่ออกคำสั่ง', { exact: true })).toBeVisible()
    await expect(page.getByText('วันที่มีผล', { exact: true })).toBeVisible()
    await expect(page.getByText('วันหยุดปฏิบัติจริง', { exact: true })).toBeVisible()
    await expect(page.getByText('10/02/2569')).toBeVisible() // วันที่มีผล
    await expect(page.getByText('12/02/2569')).toBeVisible() // วันหยุดปฏิบัติจริง — คนละวันกับวันที่มีผล

    // วันส่งมอบ/นำส่งแสดงแยกต่างหากที่หน้าติดตามพัสดุ ไม่ปนกับวันเริ่มคุ้มครองหรือวันอัปโหลด
    await page.goto('/delivery-tracking')
    await expect(page.getByText(/15\/01\/2569|14\/01\/2569/).first()).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// TC-161 · [E2E-08] การควบคุมเวอร์ชันเอกสารทุกประเภท
// ---------------------------------------------------------------------------
test.describe('TC-161 · [E2E-08] เวอร์ชันเอกสารทุกแบบ — คบ.3/คบ.6/คบ.8/คบ.14/คบ.15 มีประวัติครบและล็อกฉบับลงนามจริง', () => {
  test('TC-161 · ตรวจประวัติเวอร์ชันของ คบ.3, คบ.6, คบ.8, คบ.14, คบ.15 อย่างละ 1 ครั้ง', async ({ page }) => {
    const VERSIONED_STATE = {
      stage: 'termination_review',
      // คบ.3/คบ.6 — ถูกตีกลับแก้ไขไปแล้ว 1 ครั้ง (WIT0505/WIT0708) แล้วฉบับที่ 2 ถูกลงนามรับรองแล้ว
      kb3Version: 2,
      kb3PreviousVersions: [
        {
          version: 1,
          returnedAt: '05/03/2569 09:00',
          returnedBy: SUPERVISOR,
          returnReason: 'ข้อมูลไม่ครบถ้วน แก้ไขก่อนเสนอใหม่',
        },
      ],
      kb6Version: 2,
      kb6PreviousVersions: [
        {
          version: 1,
          returnedAt: '05/03/2569 09:00',
          returnedBy: SUPERVISOR,
          returnReason: 'ข้อมูลไม่ครบถ้วน แก้ไขก่อนเสนอใหม่',
        },
      ],
      kb6Signed: true,
      kb6SupervisorSignedAt: '06/03/2569 10:00',
      kb6SupervisorSignedBy: SUPERVISOR,
      // คบ.8 — ถูกส่งกลับแก้ไขไปแล้ว 1 ครั้ง (WIT0818) แล้วฉบับที่ 2 ถูกลงนามแล้ว
      kb8Version: 2,
      kb8PreviousVersions: [
        {
          version: 1,
          submittedAt: '08/03/2569 09:00',
          submittedBy: OFFICER,
          returnedAt: '09/03/2569 09:00',
          returnedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
          returnReason: 'ระบุจำนวนวันคุ้มครองไม่ถูกต้อง',
        },
      ],
      kb8Signed: true,
      kb8SignedAt: '10/03/2569 09:00',
      kb8SignedBy: 'นายสุรศักดิ์ ธรรมพิทักษ์',
      extensionRequests: [
        {
          id: 'EXT-TC161',
          requestedAt: '10/03/2569 09:00',
          requestedBy: OFFICER,
          reason: 'ขยายเวลาต่อเนื่อง',
          durationDays: 30,
          status: 'approved',
          version: 2,
          previousVersions: [{ version: 1, createdAt: '05/03/2569 09:00', reason: 'ฉบับแรกที่ถูกตีกลับ', durationDays: 20 }],
          locked: true,
        },
      ],
      kb15: {
        version: 2,
        createdAt: '01/04/2569 09:00',
        createdBy: OFFICER,
        trigger: 'due_or_officer' as const,
        summary: 'สรุปผลการยุติ ฉบับแก้ไข',
        status: 'endorsed' as const,
        previousVersions: [{ version: 1, createdAt: '28/03/2569 09:00', summary: 'ฉบับแรกที่ถูกส่งคืนแก้ไข' }],
      },
    }

    await seedMockState(page, 'Case 1.13', 'officer', VERSIONED_STATE)

    // คบ.14 — มีฉบับที่แล้วถูกเก็บไว้และล็อกฉบับลงนามหลังอนุมัติ (WIT1119/WIT1122)
    await page.goto(EXTENSION_URL)
    await expect(page.getByText('เก็บฉบับเดิมไว้ 1 ฉบับ — ไม่แก้ทับ')).toBeVisible()
    await expect(page.getByText('ล็อกฉบับลงนาม')).toBeVisible()

    // คบ.15 — มีฉบับที่แล้วถูกเก็บไว้เช่นกัน (WIT1133)
    await page.goto(TERMINATION_URL)
    await expect(page.getByText('เก็บฉบับเดิมไว้ 1 ฉบับ — ไม่แก้ทับ')).toBeVisible()

    // TC-161 — คบ.3/คบ.6/คบ.8 ต้องมีประวัติเวอร์ชันครบ เก็บฉบับเดิมไว้ทั้งหมด และฉบับที่ลงนามแล้วถูกล็อกไม่ให้แก้ทับ
    for (const formNo of [3, 6, 8]) {
      await page.goto(`/form/${formNo}?caseNo=${CASE_NO}`)
      const history = page.getByTestId(`kb${formNo}-version-history`)
      await expect(history).toBeVisible()
      await expect(history).toContainText('เก็บฉบับเดิมไว้ 1 ฉบับ — ไม่แก้ทับ')

      // เปิดประวัติเวอร์ชัน — ต้องเห็นทั้งฉบับเดิมที่ถูกตีกลับและฉบับปัจจุบัน
      await page.getByTestId(`kb${formNo}-version-history-toggle`).click()
      await expect(page.getByTestId(`kb${formNo}-version-history-item-1`)).toContainText('ถูกส่งกลับแก้ไข')
      await expect(history).toContainText('ฉบับปัจจุบัน (เวอร์ชัน 2)')

      // ฉบับปัจจุบันลงนามแล้ว — ต้องถูกล็อกห้ามแก้ทับ และช่องกรอกต้องถูกปิดใช้งานจริง
      await expect(page.getByTestId(`kb${formNo}-version-history-locked`)).toContainText(
        'ฉบับลงนามถูกล็อก — แก้ทับไม่ได้'
      )
      const disabledInput = page.locator('input:disabled, textarea:disabled').first()
      await expect(disabledInput).toBeVisible()
    }
  })
})
