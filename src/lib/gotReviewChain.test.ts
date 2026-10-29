import { describe, expect, it } from 'vitest'
import type { CaseItem, ExtensionRequest } from '../types/case'
import { canViewHandoffCase, handoffBlocksOperations, isGotReviewCase, isKb14StageReviewer, isReviewerFor } from './protectionHandoff'

/** แฟ้มที่ส่งต่อ กอท. และผู้รับผิดชอบ กอท. รับงานแล้ว ส่ง คบ.14 (พร้อม คบ.3/คบ.6) รอผู้ตรวจ */
const kb14 = (approvalStage: ExtensionRequest['approvalStage'], status: ExtensionRequest['status'] = 'submitted'): ExtensionRequest => ({
  id: 'EXT-1', requestedAt: '2026-10-10', requestedBy: 'นางสาวอรุณี ใจมั่น', reason: 'ภัยยังคงอยู่', durationDays: 30,
  status, approvalStage, formSnapshot: { reason: 'ภัยยังคงอยู่' }, kb6Snapshot: {},
})
const gotCase = (extra: Partial<CaseItem> = {}): CaseItem => ({
  no: '9902/2569', form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'protection',
  status: 'จัดทำ คบ.14 ฉบับที่ 1 · รอผู้ตรวจตรวจเอกสาร', owner: 'นายกิตติศักดิ์ ธรรมรักษ์', next: '', risk: 'ต่ำ',
  protectionHandoff: { destination: 'got', step: 'active', assigneeUserId: 'GOT-OFF-001' } as CaseItem['protectionHandoff'],
  extensionRequests: [kb14('supervisor')],
  ...extra,
})

describe('สายกลั่นกรองของแฟ้มที่ส่งต่อ กอท.', () => {
  it('คบ.14 ขั้น ผบช.ต้น เข้าคิว ผบช.ต้น กอท. ไม่ใช่ ผบช.ชั้นต้นของสำนัก/กองเดิม', () => {
    const c = gotCase()
    expect(isGotReviewCase(c, 'supervisor')).toBe(true)
    expect(isKb14StageReviewer('got_supervisor', 'supervisor', c)).toBe(true)
    expect(isKb14StageReviewer('supervisor', 'supervisor', c)).toBe(false)
  })

  it('ผบช.ต้น กอท. เปิดแฟ้มและทำงานกลั่นกรองได้เมื่อผู้รับผิดชอบรับงานแล้ว', () => {
    const c = gotCase()
    expect(canViewHandoffCase('got_supervisor', c, 'GOT-SUP-001')).toBe(true)
    expect(handoffBlocksOperations('got_supervisor', c, 'GOT-SUP-001')).toBe(false)
    const notAccepted = gotCase({ protectionHandoff: { destination: 'got', step: 'assigned' } as CaseItem['protectionHandoff'] })
    expect(canViewHandoffCase('got_supervisor', notAccepted, 'GOT-SUP-001')).toBe(false)
    expect(isGotReviewCase(notAccepted, 'supervisor')).toBe(false)
  })

  it('คบ.14 ขั้น ผอ. ของแฟ้ม กอท. เป็นของ ผอ. กอท.', () => {
    const c = gotCase({ extensionRequests: [kb14('director', 'pending')] })
    expect(isKb14StageReviewer('got_director', 'director', c)).toBe(true)
    expect(isKb14StageReviewer('director', 'director', c)).toBe(false)
    expect(isGotReviewCase(c, 'supervisor')).toBe(false)
  })

  it('งานขั้น ผบช.ต้น อื่นของแฟ้ม กอท. (ถอนตัว ข้อ 14) ก็เป็นของ ผบช.ต้น กอท.', () => {
    const withdrawal = gotCase({ extensionRequests: [], withdrawalRequest: { approvalStage: 'supervisor' } as CaseItem['withdrawalRequest'] })
    expect(isGotReviewCase(withdrawal, 'supervisor')).toBe(true)
    const article14 = gotCase({ extensionRequests: [], article14: { step: 'supervisor_review' } as CaseItem['article14'] })
    expect(isGotReviewCase(article14, 'supervisor')).toBe(true)
    expect(isReviewerFor('got_supervisor', 'supervisor', article14)).toBe(true)
    expect(isReviewerFor('supervisor', 'supervisor', article14)).toBe(false)
  })

  it('แฟ้มที่ไม่ได้ส่งต่อ กอท. ยังใช้ ผบช.ชั้นต้น/ผอ. ของสำนัก/กองตามเดิม', () => {
    const c = gotCase({ protectionHandoff: undefined })
    expect(isKb14StageReviewer('supervisor', 'supervisor', c)).toBe(true)
    expect(isKb14StageReviewer('got_supervisor', 'supervisor', c)).toBe(false)
    expect(isKb14StageReviewer('director', 'director', c)).toBe(true)
    expect(isGotReviewCase(c, 'supervisor')).toBe(false)
  })
  it('กอท. เหมือนอีกเขต — งานขั้น ผอ. ทุกประเภทของแฟ้ม กอท. เป็นของ ผอ. กอท. ที่เปิดและลงนามได้', () => {
    const c = gotCase({ extensionRequests: [kb14('director', 'pending')] })
    expect(isGotReviewCase(c, 'director')).toBe(true)
    expect(handoffBlocksOperations('got_director', c, 'GOT-DIR-001')).toBe(false)
    const withdrawal = gotCase({ extensionRequests: [], withdrawalRequest: { approvalStage: 'director' } as CaseItem['withdrawalRequest'] })
    expect(isGotReviewCase(withdrawal, 'director')).toBe(true)
    expect(isReviewerFor('got_director', 'director', withdrawal)).toBe(true)
    expect(isReviewerFor('director', 'director', withdrawal)).toBe(false)
  })
})
