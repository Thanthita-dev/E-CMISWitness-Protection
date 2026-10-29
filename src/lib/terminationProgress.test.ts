import { describe, expect, it } from 'vitest'
import type { CaseItem, Kb15Report, TerminationClause } from '../types/case'
import {
  defaultTerminationClause,
  evaluateCloseGuard,
  getTerminationProgress,
  isTerminationAppealable,
  terminationClauseFromLabel,
  terminationClauseLabel,
} from './terminationProgress'

const kb15 = (clause?: TerminationClause): Kb15Report => ({
  version: 1,
  trigger: 'witness_kb7',
  summary: 'พยานขอยุติ',
  createdAt: 'x',
  createdBy: 'y',
  status: 'endorsed',
  ...(clause ? { regulationClause: clause } : {}),
})

const base = (extra: Partial<CaseItem> = {}): CaseItem =>
  ({
    no: '9950/2569',
    form: 'คำร้อง',
    person: 'พยานตัวอย่าง',
    stage: 'termination_order',
    status: '',
    owner: '',
    next: '',
    risk: 'ต่ำ',
    kb16: { orderNo: '1/2569', reason: 'x', signedAt: 'x' },
    ...extra,
  }) as CaseItem

describe('แยกการรับคำอุทธรณ์ออกจากข้อความในเอกสาร', () => {
  it('รับคำอุทธรณ์ไว้ตรวจพิจารณาทุกเหตุ รวมข้อมูลเดิมที่ยังไม่ยืนยัน', () => {
    expect(isTerminationAppealable({ kb15: kb15(1) })).toBe(true)
    expect(isTerminationAppealable({ kb15: kb15(2) })).toBe(true)
    expect(isTerminationAppealable({ kb15: kb15(3) })).toBe(true)
    expect(isTerminationAppealable({ kb15: kb15(4) })).toBe(true)
    expect(isTerminationAppealable({ kb15: kb15() })).toBe(true)
  })

  it('ไม่เดาเหตุจากที่มา และแปลง label ไปกลับได้', () => {
    expect(defaultTerminationClause('witness_kb7')).toBeUndefined()
    expect(defaultTerminationClause('external_letter')).toBeUndefined()
    expect(defaultTerminationClause('due_or_officer')).toBeUndefined()
    expect(terminationClauseFromLabel(terminationClauseLabel(3))).toBe(3)
    expect(terminationClauseFromLabel('')).toBeUndefined()
  })

  it('ข้อ (1)–(3): ส่งหนังสืออย่างเดียวยังไม่ครบงานเอกสาร ต้องบันทึกรับแจ้ง', () => {
    expect(evaluateCloseGuard(base({ kb15: kb15(1) })).allowed).toBe(false)
    const dispatched = base({ kb15: kb15(1), kb17: { dispatchedAt: 'x', registryNo: '1' } as CaseItem['kb17'] })
    expect(evaluateCloseGuard(dispatched).allowed).toBe(false)
    expect(getTerminationProgress(dispatched).steps.map((s) => s.code)).toContain('WIT1145')
  })

  it('ข้อ (4): นำส่งแล้วแต่ยังไม่มีวันรับ ปิดงานไม่ได้ และยังมีขั้นนับกรอบอุทธรณ์', () => {
    const dispatched = base({ kb15: kb15(4), kb17: { dispatchedAt: 'x', registryNo: '1' } as CaseItem['kb17'] })
    expect(evaluateCloseGuard(dispatched).allowed).toBe(false)
    expect(getTerminationProgress(dispatched).steps.map((s) => s.code)).toContain('WIT1145')
  })
})
