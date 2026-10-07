import { expect, test, type Page } from '@playwright/test'
import { captureEvidence } from '../helpers/evidence'
import { readCase, seedMockState, switchRole } from '../helpers/seed'

/**
 * Feedback 28 Sep · แท็บ 10-11 (TC-043, TC-045, TC-050, TC-051, TC-052)
 *
 * BUG-007 / TC-043  WIT1149 (ข้อ 14) เลือกไม่ได้จนกว่าจะครบเพดาน 180 วัน และเมื่อเลือกได้แล้วสำนวนต้องไปต่อที่ 08C ได้
 * TC-045            หลัง WIT1109 มีปุ่มไปแท็บ 11B (และ WIT1111 มีปุ่มไป 11C)
 * TC-050            คบ.16 หลังลงนามต้องแสดงเลขคำสั่งและวันที่มีผลตามที่กรอก
 * TC-051 / TC-052   เมนู "รายงานผลการคุ้มครอง (คบ.13)" เปิดหน้ารายงาน คบ.13 ไม่เด้งไปภาพรวม
 */

const CASE_NO = 'WP-2569-000501'
const REVIEW_URL = `/protection-review/${CASE_NO}`

const pad = (n: number) => String(n).padStart(2, '0')
const isoDaysFromToday = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function confirmDialog(page: Page, buttonName: string, expectedText?: string | RegExp) {
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  if (expectedText) await expect(dialog).toContainText(expectedText)
  await page.getByRole('button', { name: buttonName, exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
}

/** ตั้งต้น 11A — ปัจจุบันคุ้มครองวิธีที่ 1 สะสม `days` วัน (เพดานรวม 180 วัน) */
function reviewSeed(days: number) {
  const start = new Date()
  start.setDate(start.getDate() - days)
  const iso = start.toISOString()
  return {
    approvedMethods: [1],
    methodTracks: [{ method: 1, status: 'active', startedAt: iso }],
    episode: {
      id: 'EP-FB28',
      openedAt: iso,
      phases: [{ id: 'PH-FB28', kind: 'MAIN', startedAt: iso, orderRef: 'คบ.8' }],
    },
    kb11Signed: true,
    reviewProposals: [],
    methodChangeProposals: [],
  }
}

/** WIT1105-WIT1107 — เสนอ ผบช. เห็นชอบ แล้วเจ้าหน้าที่กด "ดำเนินการตามแนวทางที่เห็นชอบ" */
async function proposeEndorseApply(page: Page, outcome: string, applyConfirmText: string | RegExp) {
  await page.goto(REVIEW_URL)
  await page.getByTestId(`review-outcome-${outcome}`).click()
  await page.getByRole('textbox', { name: /ผลประเมินความเสี่ยงและความจำเป็น/ }).fill('ประเมินความเสี่ยงตามผลทบทวน')
  await page.getByPlaceholder('อ้างอิง คบ.13 คำสั่งเดิม และกรณีครบเพดานแต่ยังมีภัย').fill('ผลทบทวนตาม คบ.13')
  await page.getByTestId('review-submit-proposal').click()
  await confirmDialog(page, 'ยืนยันเสนอผลทบทวน')
  await switchRole(page, 'supervisor')
  await page.getByTestId('review-endorse').click()
  await confirmDialog(page, 'ยืนยันเห็นชอบ')
  await switchRole(page, 'officer')
  await page.getByTestId('review-apply-outcome').click()
  await confirmDialog(page, 'ยืนยันดำเนินการ', applyConfirmText)
}

/** กางกลุ่มย่อย "คุ้มครองและติดตาม" ในเมนูด้านข้าง (ถ้ายังพับอยู่) */
async function openMonitorMenu(page: Page) {
  const link = page.getByRole('link', { name: /รายงานผลการคุ้มครอง \(คบ\.13\)/ }).first()
  if (await link.isVisible()) return
  await page.getByRole('navigation').getByRole('button', { name: /คุ้มครองและติดตาม/ }).click()
}

test.describe('Feedback 28 Sep · แท็บ 10-11', () => {
  test('TC-043 · [BUG-007] WIT1149 ข้อ 14 เลือกไม่ได้ก่อนครบ 180 วัน', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(1))
    await page.goto(REVIEW_URL)
    await expect(page.getByTestId('review-outcome-article14')).toBeDisabled()
    await expect(page.getByText(/ทำไม่ได้ — ยังไม่ครบเพดาน 180 วัน/)).toBeVisible()
    // แนวทางอื่นยังเลือกได้
    await expect(page.getByTestId('review-outcome-extend')).toBeEnabled()
    await captureEvidence(page, 'TC-043-a', page.getByTestId('review-outcome-article14').locator('xpath=ancestor::label[1]'), 'WIT1149 ข้อ 14 กดเลือกไม่ได้ เพราะสะสมเพียง 1/180 วัน')
    await captureEvidence(page, 'TC-043-b', page.getByText(/ทำไม่ได้ — ยังไม่ครบเพดาน 180 วัน/), 'ระบบแจ้งเหตุผล: ยังไม่ครบเพดาน 180 วัน')
  })

  test('TC-043 · [BUG-007] ครบ 180 วันเลือก WIT1149 ได้ และหน้าข้อ 14 (08C) ต้องเห็นสำนวนให้เดินต่อ', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(180))
    await page.goto(REVIEW_URL)
    await expect(page.getByTestId('review-outcome-article14')).toBeEnabled()
    await captureEvidence(page, 'TC-043-c', page.getByTestId('review-outcome-article14').locator('xpath=ancestor::label[1]'), 'ครบ 180 วันแล้ว จึงเลือก WIT1149 ข้อ 14 ได้')

    await proposeEndorseApply(page, 'article14', 'ไปหน้าส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ')
    await page.getByRole('main').getByRole('link', { name: /ส่งต่อกรมคุ้มครองสิทธิฯ$/ }).click()
    await expect(page).toHaveURL(/\/article14/)
    await expect(page.getByText(CASE_NO).first()).toBeVisible()
    await expect(page.getByText(/ยังไม่มีสำนวน/)).toHaveCount(0)
    await captureEvidence(page, 'TC-043-d', page.getByText(CASE_NO).first(), 'หน้าข้อ 14 แสดงสำนวนนี้แล้ว เดินต่อได้')
  })

  test('TC-045 · WIT1109 ขยายเวลา — หลังดำเนินการมีปุ่มไปแท็บ 11B จัดทำ คบ.14', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(120))
    await proposeEndorseApply(page, 'extend', 'คบ.14')
    const link = page.getByTestId('review-goto-11b')
    await expect(link).toBeVisible()
    await captureEvidence(page, 'TC-045-a', link, 'มีปุ่มไปแท็บ 11B จัดทำ คบ.14 แล้ว')
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/protection-extension/${CASE_NO}`))
  })

  test('TC-045 · WIT1111 ยุติ — หลังดำเนินการมีปุ่มไปแท็บ 11C', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer', reviewSeed(45))
    await proposeEndorseApply(page, 'terminate', 'คบ.15')
    const link = page.getByTestId('review-goto-11c')
    await expect(link).toBeVisible()
    await captureEvidence(page, 'TC-045-b', link, 'มีปุ่มไปแท็บ 11C แล้ว')
    await link.click()
    await expect(page).toHaveURL(new RegExp(`/termination/${CASE_NO}`))
  })

  test('TC-050 · คบ.16 หลังลงนามแสดงเลขคำสั่งและวันที่มีผลตามที่กรอก', async ({ page }) => {
    await seedMockState(page, 'Case 1.16', 'secretary')
    await page.goto(`/termination/${CASE_NO}`)
    await page.getByPlaceholder('ความเห็นประกอบผลพิจารณา').fill('อนุมัติให้ยุติตามที่เสนอ')
    await page.getByRole('button', { name: 'อนุมัติให้ยุติ' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('อนุมัติให้ยุติ')

    // เจ้าหน้าที่ร่าง คบ.16 ที่ 11D
    await switchRole(page, 'officer')
    await page.goto(`/termination/${CASE_NO}`)
    await page.getByPlaceholder('คำสั่งที่').fill('001/2569')
    await page.getByLabel('วันที่ออกคำสั่ง').fill(isoDaysFromToday(0))
    await page.getByLabel('วันที่คำสั่งมีผล').fill(isoDaysFromToday(0))
    await page.getByRole('button', { name: 'เปิดแฟ้มคดี' }).click()
    await expect(page).toHaveURL(new RegExp(`/dossier/${CASE_NO}`))

    // กรอกเฉพาะเลขคำสั่งและปีในแบบ คบ.16 (ไม่กรอกช่องอื่น) แล้วส่งให้อนุมัติ
    await page.goto(`/form/16?caseNo=${CASE_NO}`)
    await page.getByPlaceholder('088').fill('คส.QA-001')
    await page.getByPlaceholder('2569').fill('2569')
    await page.goto(`/dossier/${CASE_NO}`)
    await page.getByRole('button', { name: /ส่งให้ผู้มีอำนาจอนุมัติ|ส่งให้อนุมัติ|ส่งคำสั่ง/ }).first().click()
    await confirmDialog(page, 'ส่งให้อนุมัติ')

    const submitted = (await readCase(page, CASE_NO))?.kb16 as Record<string, unknown>
    expect(submitted.orderNo).toBe('คส.QA-001/2569')
    // ช่องที่ไม่ได้กรอกต้องไม่ทับค่าร่างเดิมเป็น undefined
    expect(submitted.effectiveAt).toBeTruthy()
    expect(submitted.issuedAt).toBeTruthy()

    await switchRole(page, 'secretary')
    await page.goto(`/termination/${CASE_NO}`)
    await page.getByRole('button', { name: 'ลงนามคำสั่ง คบ.16' }).click()
    await expect(page.locator('.swal2-toast')).toContainText('ลงนามคำสั่ง คบ.16')
    await expect(page.getByText('คำสั่งที่ คส.QA-001/2569')).toBeVisible()
    await expect(page.getByText(/undefined/)).toHaveCount(0)
    await expect(page.getByText('คำสั่งที่ —')).toHaveCount(0)
    await captureEvidence(page, 'TC-050-a', page.getByText('คำสั่งที่ คส.QA-001/2569'), 'แสดงเลขคำสั่งและวันที่มีผลตามที่กรอก (ไม่ใช่ — / undefined)')
  })

  test('TC-051 · เมนูด้านข้างทุกเมนูเปิดตรงหน้า รวม คบ.13', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto('/registry')
    await openMonitorMenu(page)
    const menu = page.getByRole('link', { name: /รายงานผลการคุ้มครอง \(คบ\.13\)/ }).first()
    await expect(menu).toBeVisible()
    await menu.click()
    // เมนูที่เปิดอยู่ต้องถูกไฮไลต์ตรงชื่อ
    await expect(menu).toHaveClass(/text-gold/)
    await expect(page).toHaveURL(/\/protection-monitor/)
    const h = page.getByRole('heading', { name: /ติดตามและรายงานผลการคุ้มครอง \(คบ\.13\)/ })
    await expect(h).toBeVisible()
    await captureEvidence(page, 'TC-051-a', [menu, h], 'เมนู คบ.13 ถูกเลือก และเปิดหน้ารายงาน คบ.13 ตรงชื่อเมนู')
  })

  test('TC-052 · เมนูรายงานผลการคุ้มครอง (คบ.13) เปิดหน้ารายงาน คบ.13 พร้อมรายการสำนวน ไม่เด้งไปภาพรวม', async ({ page }) => {
    await seedMockState(page, 'Case 1.14', 'officer')
    await page.goto('/registry')
    await openMonitorMenu(page)
    await page.getByRole('link', { name: /รายงานผลการคุ้มครอง \(คบ\.13\)/ }).first().click()
    await expect(page).toHaveURL(/\/protection-monitor/)
    await expect(page).not.toHaveURL(/\/protection$/)
    await expect(page.getByText(CASE_NO)).toBeVisible()
    await captureEvidence(page, 'TC-052-a', page.getByText(CASE_NO), 'กดเมนู คบ.13 แล้วเปิดหน้ารายงาน พร้อมรายการสำนวน (ไม่เด้งไปภาพรวม)')
    await page.getByRole('link', { name: new RegExp(CASE_NO) }).click()
    await expect(page).toHaveURL(new RegExp(`/protection-monitor\\?caseNo=${CASE_NO}`))
  })
})
