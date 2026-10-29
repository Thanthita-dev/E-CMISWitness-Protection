import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import { readCase, switchRole } from './seed'
import { ROLE_ORG_ASSIGNMENTS } from '../../src/lib/constants'
import { activeSarabanCheckpoint, sarabanClerkAccount } from '../../src/lib/saraban'
import type { CaseItem } from '../../src/types/case'

/**
 * สลับเป็นธุรการแบบเดียวกับปุ่มสลับบทบาทของแอป (useAuthStore.setRole) — ย้ายหน่วยงานตามบทบาทด้วย
 * หน้าทะเบียนตรวจหน่วยงานของผู้ลงเลข ถ้าคงหน่วยงานของบทบาทก่อนหน้า หน้าจะเป็นอ่านอย่างเดียว
 * `orgUnitId` ระบุเมื่อแฟ้มอยู่หน่วยงานอื่นจากหน่วยตั้งต้นของบทบาท (เช่น ธุรการเขต)
 */
export async function switchClerkRole(page: Page, role: string, orgUnitId?: string) {
  const assignment = ROLE_ORG_ASSIGNMENTS[role] || ROLE_ORG_ASSIGNMENTS.receiver
  const unit = orgUnitId ?? (assignment.central ? 'central-wp' : (assignment.units[0] || 'central-wp'))
  // เหมือน switchRole แต่ตั้งหน่วยงานด้วย (init script ตัวหลังสุดชนะ การสลับบทบาทครั้งถัดไปจึงทับบทบาทได้ตามเดิม)
  await page.addInitScript(({ r, u }: { r: string; u: string }) => {
    const raw = localStorage.getItem('ecmis-auth-storage')
    if (!raw) return
    const auth = JSON.parse(raw)
    auth.state.currentRole = r
    auth.state.currentOrgUnitId = u
    localStorage.setItem('ecmis-auth-storage', JSON.stringify(auth))
  }, { r: role, u: unit })
  await page.reload()
}

/**
 * ทะเบียนสารบรรณ (ธุรการ) — การ์ด `saraban-transit-card` ในหน้าแฟ้มลิงก์ไปหน้าทะเบียน /saraban/$caseNo
 * สลับเป็นบทบาทธุรการ → เปิดหน้าทะเบียน → ออกเลข/ลงรับทุกผู้รับ (ค่าตั้งต้นถูกเติมให้แล้ว) → กดส่งต่อและยืนยัน
 * `afterRole` ใช้สลับกลับเป็นบทบาทผู้ปฏิบัติถัดไป (ไม่ระบุ = อยู่ที่ธุรการ)
 */
export async function passSarabanCheckpoint(
  page: Page,
  caseNo: string,
  clerkRole: 'receiver' | 'secretary_receiver' | 'got_receiver',
  opts: { afterRole?: string; shot?: (name: string) => Promise<void> } = {},
) {
  // ธุรการของหน่วยงานที่แฟ้มอยู่ (ธุรการ receiver ลงเลขได้เฉพาะหน่วยตนเอง เช่น แฟ้มเขต 1 ต้องเป็นธุรการเขต 1)
  const c = (await readCase(page, caseNo)) as CaseItem | null
  const cp = c && clerkRole === 'receiver' ? activeSarabanCheckpoint(c) : null
  const unit = c && cp ? sarabanClerkAccount(c, cp)?.orgUnitId : undefined
  await switchClerkRole(page, clerkRole, unit)
  await page.goto(`/saraban/${encodeURIComponent(caseNo)}`)
  const card = page.getByTestId('saraban-workspace')
  await expect(card).toBeVisible()
  // ผู้รับที่ยังไม่ลงเลข: ปุ่ม "ออกเลข"/"ลงรับ" ในแผงผู้รับ → หน้าต่างลงเลข (ค่าตั้งต้นถูกเติมให้แล้ว) → ยืนยัน
  const pending = card.locator('[data-testid^="saraban-recipient-number-"]').filter({ hasText: /^(ออกเลข|ลงรับ)$/ })
  while ((await pending.count()) > 0) {
    const before = await pending.count()
    await pending.first().click()
    await page.getByTestId('saraban-number-confirm').click()
    await expect(pending).toHaveCount(before - 1)
  }
  await expect(card.getByTestId('saraban-blocker')).toHaveCount(0)
  await opts.shot?.('recorded')
  await card.getByTestId('saraban-submit-button').click()
  const dialog = page.locator('.swal2-popup:not(.swal2-toast)')
  await dialog.waitFor()
  await dialog.locator('.swal2-confirm').click()
  await dialog.waitFor({ state: 'detached' })
  if (opts.afterRole) await switchRole(page, opts.afterRole)
}
