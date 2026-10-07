import { expect, test } from '@playwright/test'
import { readCase, seedMockState } from '../e2e/helpers/seed'
import { createRecorder } from './shot'

/**
 * ภาพหน้าจอทีละขั้น — เส้นทางหลักของการส่งกรมคุ้มครองสิทธิและเสรีภาพตามข้อ 14 (08C)
 * ขั้นตอนและข้อมูลตั้งต้นยกมาจาก e2e/sheets/sheet08c-article14-referral.spec.ts
 */

const CASE_NO = 'WP-2569-000501'
const ARTICLE14_URL = '/article14'
const TARGET_AGENCY = 'สำนักงานคุ้มครองพยาน กรมคุ้มครองสิทธิและเสรีภาพ กระทรวงยุติธรรม'

function episodeWithCumulativeDays(days: number) {
  const startedAt = new Date(Date.now() - (days - 1) * 86400000).toISOString()
  return {
    id: `EP-TEST-${days}`,
    openedAt: startedAt,
    phases: [{ id: `PH-TEST-${days}`, kind: 'MAIN' as const, startedAt, orderRef: 'คบ.11' }],
  }
}

const AT_NEAR_CAP = {
  approvedMethods: [1],
  methodTracks: [{ method: 1, status: 'active' }],
  kb11Signed: true,
  episode: episodeWithCumulativeDays(178),
  article14: undefined,
  article14Referral: undefined,
}

const AT_LETTER_SENT = {
  ...AT_NEAR_CAP,
  article14: {
    step: 'letter_sent' as const,
    openedAt: '10/09/2569 09:00',
    openedBy: 'นางสาวอรุณี ใจมั่น',
    threatSummary: 'ยังมีกลุ่มผู้มีอิทธิพลเฝ้าติดตามที่พักพยาน',
    riskAssessment: 'ความเสี่ยงสูงต่อเนื่อง ยังไม่มีสัญญาณว่าภัยลดลง',
    recommendedMeasure: 'special' as const,
    supervisorNote: 'เห็นชอบ',
    supervisorAt: '10/09/2569 10:00',
    secretaryNote: 'เห็นชอบเสนอคณะกรรมการ',
    secretaryAt: '10/09/2569 11:00',
    committeeResolutionNo: 'มติที่ 25/2569',
    committeeResolvedAt: '10/09/2569 13:00',
    committeeApproved: true,
    committeeNote: 'เห็นชอบส่งกรมคุ้มครองสิทธิฯ',
    revisions: [],
  },
}

test('B1 · 08C จัดทำเรื่องข้อ 14 → ผบช. → เลขาธิการฯ → มติคณะกรรมการเห็นชอบ → ออกหนังสือส่งกรม', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'article14-1-proposal-letter',
      flow: 'article14',
      order: 1,
      title: 'เสนอเรื่องข้อ 14 จนออกหนังสือส่งกรม',
      summary: 'คุ้มครองสะสม 178 วัน (ใกล้ครบเพดาน 180 วัน) แต่ยังมีภัย → เจ้าหน้าที่จัดทำข้อเสนอ → ผบช.ชั้นต้น → เลขาธิการฯ → มติคณะกรรมการเห็นชอบ → ออกหนังสือขาออกถึงกรมคุ้มครองสิทธิและเสรีภาพ',
      testRef: 'e2e/sheets/sheet08c-article14-referral.spec.ts · TC-094',
    },
    'officer'
  )
  await seedMockState(page, 'Case 1.12', 'officer', AT_NEAR_CAP)
  await page.goto(ARTICLE14_URL)
  await expect(page.getByText(CASE_NO).first()).toBeVisible()
  await r.shot('หน้า 08C — แฟ้มที่ใกล้ครบเพดาน 180 วัน', 'WIT0852 — สะสม 178 วัน ยังไม่เปิดเรื่องข้อ 14')

  await page.getByRole('textbox', { name: 'เหตุความไม่ปลอดภัยที่ยังคงอยู่' }).fill('ยังมีภัยต่อเนื่องแม้คุ้มครองสะสมใกล้ครบเพดาน 180 วัน')
  await page
    .getByRole('textbox', { name: /รายงานผล \/ ประเมินความเสี่ยง/ })
    .fill('อ้างอิง คบ.13 รอบล่าสุดและคำสั่งเดิม (คบ.11) — สะสม 178 วัน')
  await r.shot('เจ้าหน้าที่จัดทำข้อเสนอและประเมินความเสี่ยง', 'WIT0854', page.getByTestId('submit-article14-proposal'))
  await page.getByTestId('submit-article14-proposal').click()
  await r.confirm('ยืนยันเสนอ', 'เสนอเรื่องข้อ 14 ให้ ผบช.ชั้นต้น')

  await r.asRole('supervisor', ARTICLE14_URL)
  await r.shot('ผบช.ชั้นต้นตรวจข้อเสนอ', 'WIT0855', page.getByTestId('article14-endorse-button'))
  await page.getByTestId('article14-endorse-button').click()
  await r.confirm('ยืนยันเห็นชอบ', 'ผบช.ชั้นต้นเห็นชอบ ส่งเลขาธิการฯ')

  await r.asRole('secretary', ARTICLE14_URL)
  await r.shot('เลขาธิการฯ พิจารณาเสนอคณะกรรมการ', 'WIT0856', page.getByTestId('article14-endorse-button'))
  await page.getByTestId('article14-endorse-button').click()
  await r.confirm('ยืนยันเห็นชอบ', 'เลขาธิการฯ เสนอคณะกรรมการ ป.ป.ท.')

  await r.asRole('committee', ARTICLE14_URL)
  await r.shot('คณะกรรมการ ป.ป.ท. พิจารณาเรื่องข้อ 14', 'WIT0857 — มติคณะกรรมการ?', page.getByTestId('article14-committee-approve'))
  await page.getByPlaceholder('เลขที่มติ / ครั้งที่ประชุม').fill('มติที่ 25/2569')
  await page.getByPlaceholder('สาระสำคัญของมติ').fill('เห็นชอบส่งกรมคุ้มครองสิทธิฯ')
  await r.shot('กรอกเลขที่มติและสาระสำคัญ', '', page.getByTestId('article14-committee-approve'))
  await page.getByTestId('article14-committee-approve').click()
  await r.confirm('ยืนยันมติ', 'มติเห็นชอบส่งกรมคุ้มครองสิทธิและเสรีภาพ')

  await r.asRole('officer', ARTICLE14_URL)
  await r.shot('เจ้าหน้าที่เตรียมออกหนังสือแจ้ง/ประสานกรม', 'WIT0859 — ผ่านสารบรรณเดิม', page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'))
  await page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)').fill('ปปท 0001/7788')
  await r.shot('กรอกเลขที่หนังสือขาออก', `ผู้รับ: ${TARGET_AGENCY}`, page.getByPlaceholder('เลขที่หนังสือ (สารบรรณเดิม)'))
  await page.getByRole('button', { name: 'บันทึกหนังสือขาออก' }).click()
  await r.confirm('ยืนยันบันทึก', 'บันทึกหนังสือขาออกถึงกรม')

  const letters = (await readCase(page, CASE_NO))?.officialLetters as Array<Record<string, unknown>>
  expect(letters[0].agency).toBe(TARGET_AGENCY)
})

test('B2 · 08C กรมตอบรับ — ส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่ ปิด Episode เดิม', async ({ page }) => {
  const r = createRecorder(
    page,
    {
      id: 'article14-2-handover',
      flow: 'article14',
      order: 2,
      title: 'ส่งมอบให้กรมและเริ่มมาตรการใหม่',
      summary: 'หลังส่งหนังสือแล้ว เจ้าหน้าที่บันทึกวันเริ่มมาตรการและฐานกฎหมายของหน่วยงานใหม่ → ระบบปิดช่วงคุ้มครอง (Episode) เดิม และแฟ้มเปลี่ยนสถานะเป็นส่งต่อแล้ว',
      testRef: 'e2e/sheets/sheet08c-article14-referral.spec.ts · TC-095',
    },
    'officer'
  )
  await seedMockState(page, 'Case 1.12', 'officer', AT_LETTER_SENT)
  await page.goto(ARTICLE14_URL)
  await r.shot('แฟ้มที่ส่งหนังสือถึงกรมแล้ว', 'มติที่ 25/2569 เห็นชอบ — รอส่งมอบ (WIT0860–0861)')

  await page.getByLabel('วันเริ่มมาตรการของหน่วยงานใหม่').fill('2026-10-01')
  await page.getByLabel('ฐานกฎหมายของหน่วยงานใหม่').fill('มาตรการพิเศษตามระเบียบกรมคุ้มครองสิทธิและเสรีภาพ')
  await r.shot('กรอกวันเริ่มมาตรการและฐานกฎหมายของหน่วยงานใหม่', 'WIT0862 — แยกจากมาตรการเดิมของ ป.ป.ท.', page.getByLabel('ฐานกฎหมายของหน่วยงานใหม่'))
  await page.getByRole('button', { name: 'บันทึกส่งมอบและเริ่มมาตรการภายใต้หน่วยงานใหม่' }).click()
  await r.confirm('ยืนยันส่งมอบ', 'ส่งมอบและปิด Episode เดิม', 'WIT0863 — แสดงหน่วยงานผู้รับและวันเริ่มมาตรการ')

  await expect(page.getByText(TARGET_AGENCY).first()).toBeVisible()
  expect((await readCase(page, CASE_NO))?.stage).toBe('transferred')
})
