import { describe, expect, it } from 'vitest'
import type { CaseItem } from '../types/case'
import { canScreenUrgencyNow, kb1Completed, kb3Unlocked, nextSequenceStep } from './intakeSequence'

const owner = (patch: Partial<CaseItem> = {}) =>
  ({ no: '0999/2569', stage: 'staff_review', ...patch }) as CaseItem

describe('ลำดับงานเจ้าของสำนวน: คบ.1 → เชื่อมโยงคดีหลัก → กลั่นกรอง → คบ.3', () => {
  it('ยังไม่บันทึก คบ.1 — ขั้นถัดไปคือ คบ.1 และยังกลั่นกรอง/เปิด คบ.3 ไม่ได้', () => {
    const c = owner()
    expect(nextSequenceStep(c)).toBe('kb1')
    expect(canScreenUrgencyNow(c)).toBe(false)
    expect(kb3Unlocked(c)).toBe(false)
  })

  it('บันทึก คบ.1 แล้วแต่ยังไม่เชื่อมโยงคดีหลัก — ยังกลั่นกรองไม่ได้', () => {
    const c = owner({ kb1CompletedAt: '01/10/2569 10:00' })
    expect(nextSequenceStep(c)).toBe('main_case')
    expect(canScreenUrgencyNow(c)).toBe(false)
  })

  it('บันทึก "ไม่พบคดี" ถือว่าผ่านขั้นคดีหลัก — กลั่นกรองได้ แต่ คบ.3 ยังล็อกจนกว่าจะกลั่นกรอง', () => {
    const c = owner({ kb1CompletedAt: '01/10/2569 10:00', mainCaseNotFound: true })
    expect(nextSequenceStep(c)).toBe('screening')
    expect(canScreenUrgencyNow(c)).toBe(true)
    expect(kb3Unlocked(c)).toBe(false)
  })

  it('กลั่นกรองแล้ว — เปิด คบ.3 ได้', () => {
    const c = owner({ kb1CompletedAt: '01/10/2569 10:00', linkedMainCaseId: 'MC-1', urgency: 'normal' })
    expect(nextSequenceStep(c)).toBeNull()
    expect(kb3Unlocked(c)).toBe(true)
  })

  it('แฟ้มที่พ้นขั้นเจ้าของสำนวนแล้วไม่บังคับลำดับนี้ (ข้อมูลเดิมไม่มี kb1CompletedAt)', () => {
    const c = owner({ stage: 'supervisor_review' })
    expect(kb1Completed(c)).toBe(true)
    expect(kb3Unlocked(c)).toBe(true)
    expect(nextSequenceStep(c)).toBeNull()
  })
})
