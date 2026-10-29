import { describe, expect, it } from 'vitest'
import type { CaseItem, Kb15Report, TerminationClause } from '../types/case'
import { ARTICLE19_REASONS, confirmedAppealDeadline, reasonOptions, showKb17AppealNotice, terminationEffectiveAt, terminationExpiry, validateTerminationBasis } from './terminationRules'
import { evaluateCloseGuard, isTerminationAppealable, getTerminationProgress, defaultTerminationClause } from './terminationProgress'

const report = (clause: TerminationClause): Kb15Report => ({
  version: 1, createdAt: '2026-10-25', createdBy: 'ผู้จัดทำ', trigger: 'due_or_officer', status: 'endorsed',
  regulationClause: clause, summary: reasonOptions(clause)[0], article19Reason: clause === 4 ? 1 : undefined,
  facts: 'ข้อเท็จจริงจากการตรวจ', evidenceNote: 'หลักฐานในแฟ้ม', occurredAt: '2026-10-01', proposedEndAt: '2026-10-01',
  basis: clause === 1 ? { kb7: { applicant: 'พยาน', receivedAt: '2026-10-01', requestedEndAt: '2026-10-01', reason: 'ประสงค์ขอยุติ', signed: true, documentName: 'คำร้องลงนาม.pdf' } } : undefined,
})
const base = (clause: TerminationClause): CaseItem => ({
  no: 'TERM/2569', person: 'พยาน', form: 'คำร้อง', stage: 'termination_order', status: '', owner: '', next: '', risk: 'สูง',
  kb15: report(clause), protectionEndAt: '2026-10-01',
  episode: { id: 'EP', openedAt: '2026-06-01', phases: [{ id: 'P', kind: 'MAIN', startedAt: '2026-06-01', orderRef: 'คำสั่ง 1/2569' }] },
})

describe('ฐานเหตุสิ้นสุดจากเอกสารลูกค้า', () => {
  it('ไม่เดาเหตุหลักจากที่มาของเรื่อง และไม่ปิดรับอุทธรณ์จากข้อความกำกับ คบ.17', () => {
    expect(defaultTerminationClause('witness_kb7')).toBeUndefined()
    expect(defaultTerminationClause('external_letter')).toBeUndefined()
    for (const clause of [1, 2, 3, 4] as const) {
      expect(isTerminationAppealable(base(clause))).toBe(true)
      expect(showKb17AppealNotice(base(clause))).toBe(clause === 4)
      expect(getTerminationProgress(base(clause)).steps.find(s => s.code === 'WIT1145')?.label).toBe('บันทึกการรับแจ้ง')
    }
    const old = base(4); old.kb15!.regulationClause = undefined
    expect(validateTerminationBasis(old, old.kb15!)).toContain('กรุณาตรวจยืนยันเหตุสิ้นสุดตามข้อ 18 จากหลักฐานเดิม')
    expect(terminationEffectiveAt(old)).toBeUndefined()
  })
  it('18(1) ต้องมีคำร้องลงนาม แต่ร่าง/คำร้องที่ขอวันที่อนาคตยังไม่สิ้นสุดทันที', () => {
    const c = base(1)
    expect(validateTerminationBasis(c, c.kb15!)).toEqual([])
    expect(terminationEffectiveAt(c, new Date('2026-10-28T00:00:00Z'))).toBe('2026-10-01')
    c.kb15!.basis!.kb7!.signed = false
    expect(validateTerminationBasis(c, c.kb15!).length).toBeGreaterThan(0)
    c.kb15!.basis!.kb7!.signed = true
    c.kb15!.basis!.kb7!.requestedEndAt = '2026-12-01'
    expect(terminationEffectiveAt(c, new Date('2026-10-28T00:00:00Z'))).toBeUndefined()
  })
  it('18(2) ตรวจคำสั่งขยายเวลา ไม่บังคับภัยหมด และแยกเพดาน 6 เดือนจากวันครบกำหนดรอบ', () => {
    const c = base(2)
    c.kb15!.basis = { expiry: terminationExpiry(c) }
    expect(validateTerminationBasis(c, c.kb15!)).toEqual([])
    expect(terminationExpiry(c)).toMatchObject({ currentEndAt: '2026-10-01', capAt: '2026-12-01' })
    c.extensionRequests = [{ id: 'EXT-1', status: 'approved', requestedAt: '', requestedBy: '', reason: 'ยังมีภัย', durationDays: 30, periodTo: '2026-11-01' }]
    expect(validateTerminationBasis(c, c.kb15!)).toContain('คำสั่งหรือระยะเวลาคุ้มครองเปลี่ยนแล้ว กรุณาตรวจข้อมูลล่าสุด')
    c.kb15!.basis.expiry = terminationExpiry(c)
    c.kb15!.occurredAt = c.kb15!.proposedEndAt = '2026-11-01'
    expect(validateTerminationBasis(c, c.kb15!)).toEqual([])
    expect(terminationEffectiveAt(c, new Date('2026-10-28T00:00:00Z'))).toBeUndefined()
    c.extensionRequests[0].status = 'pending'
    expect(validateTerminationBasis(c, c.kb15!)).toContain('มีคำขอขยายเวลารอพิจารณา ต้องตรวจผลก่อนสรุปเหตุครบกำหนด')
  })
  it('18(3) ส่งหนังสือ/รับพิจารณายังไม่พอ ต้องมีวันรับคุ้มครองและหลักฐานจากงานเดิม', () => {
    const c = base(3)
    c.article14 = { step: 'letter_sent', openedAt: '', openedBy: '', threatSummary: '', riskAssessment: '', revisions: [] }
    expect(validateTerminationBasis(c, c.kb15!).length).toBeGreaterThan(0)
    c.article14.step = 'response_received'
    c.article14.replyDocumentName = 'หนังสือรับเรื่อง.pdf'
    expect(validateTerminationBasis(c, c.kb15!).length).toBeGreaterThan(0)
    Object.assign(c.article14, { step: 'handover_done', handoverCompletedAt: '2026-10-01', successorStartedAt: '2026-10-01', successorLegalBasis: 'กฎหมายคุ้มครองพยานในคดีอาญา' })
    c.kb15!.basis = { referral: { agency: 'กรมคุ้มครองสิทธิฯ', documentName: c.article14.replyDocumentName, effectiveAt: '2026-10-01', legalBasis: c.article14.successorLegalBasis! } }
    expect(validateTerminationBasis(c, c.kb15!)).toEqual([])
    expect(terminationEffectiveAt(c)).toBe('2026-10-01')
  })
  it('ข้อ 19 ทุกเหตุย่อยใช้หลักฐานและคำสั่ง โดยไม่บังคับช่องข้อเท็จจริง', () => {
    for (let i = 0; i < 5; i++) {
      const c = base(4)
      c.kb15!.article19Reason = i + 1 as 1 | 2 | 3 | 4 | 5
      c.kb15!.summary = ARTICLE19_REASONS[i]
      expect(validateTerminationBasis(c, c.kb15!)).toEqual([])
      expect(terminationEffectiveAt(c)).toBeUndefined()
      c.kb16 = { orderNo: '1/2569', reason: c.kb15!.summary, signedAt: '2026-10-28', effectiveAt: '2026-10-01' }
      expect(terminationEffectiveAt(c)).toBe('2026-10-01')
      c.kb15!.facts = ''
      expect(terminationEffectiveAt(c)).toBe('2026-10-01')
    }
    const c = base(1); c.kb15!.summary = reasonOptions(2)[0]
    expect(validateTerminationBasis(c, c.kb15!)).toContain('เหตุย่อยไม่สอดคล้องกับเหตุหลัก กรุณาตรวจยืนยันใหม่')
  })
  it('นับ 30 วันจากวันรับจริงตามปฏิทินไทยเท่านั้น และไม่ผูกการปิดเอกสารกับคำอุทธรณ์', () => {
    const c = base(4)
    expect(confirmedAppealDeadline(c, '2026-10-28')).toBe('2026-11-27')
    expect(confirmedAppealDeadline(c, '2026-12-31')).toBe('2027-01-30')
    expect(confirmedAppealDeadline(base(1), '2026-10-28')).toBeUndefined()
    c.kb16 = { orderNo: '1', reason: '', signedAt: '2026-10-01', effectiveAt: '2026-10-01' }
    c.kb17 = { signedAt: '2026-10-01', dispatchedAt: '2026-10-01', deliveredAt: '2026-10-28', receiptEvidence: 'ใบรับ.pdf', appealDueAt: '2026-11-27' }
    c.appealAgainst = 'kb17'; c.appealFiledAt = '2026-10-28'
    expect(evaluateCloseGuard(c).allowed).toBe(true)
    c.kb17.receiptEvidence = ''
    expect(evaluateCloseGuard(c).allowed).toBe(false)
  })
})
