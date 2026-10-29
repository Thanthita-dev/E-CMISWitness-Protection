import { describe, expect, it } from 'vitest'
import { INTAKE_DOC_TYPES_BY_ROLE } from './constants'
import { canAccessRoute, canCreateIntake, canSeeDossierCard, canSeeFormsSection, isCaseOwnedBy, isMyQueueCase } from './permissions'
import { canViewHandoffCase, handoffBlocksOperations, isHandoffQueueCase } from './protectionHandoff'
import type { CaseItem } from '../types/case'

const own = { stage: 'receiver_intake', receivedByUserId: 'GOT-REC-001' } as CaseItem
const other = { stage: 'receiver_intake', receivedByUserId: 'REC-001' } as CaseItem

describe('ธุรการคดี กอท. รับคำร้องขอคุ้มครองพยานเหมือนธุรการสำนัก/กอง', () => {
  it('เข้าหน้ารับคำร้องได้ และรับได้เฉพาะ "คำร้อง" เหมือนธุรการ', () => {
    expect(canCreateIntake('got_receiver')).toBe(true)
    expect(canAccessRoute('got_receiver', '/intake')).toBe(true)
    expect(INTAKE_DOC_TYPES_BY_ROLE.got_receiver).toEqual(INTAKE_DOC_TYPES_BY_ROLE.receiver)
    // ไม่ได้สิทธิ์งานอื่นของธุรการสำนัก/กองเพิ่ม
    expect(canAccessRoute('got_receiver', '/delivery-tracking')).toBe(false)
    expect(canAccessRoute('got_receiver', '/appeal')).toBe(false)
  })

  it('เปิดแฟ้มที่ตนรับเข้า แนบเอกสาร และส่ง ผอ. ได้ แต่ไม่เห็นแบบ คบ. เหมือนธุรการ', () => {
    expect(canViewHandoffCase('got_receiver', own, 'GOT-REC-001')).toBe(true)
    expect(handoffBlocksOperations('got_receiver', own, 'GOT-REC-001')).toBe(false)
    expect(isCaseOwnedBy('got_receiver', own, 'GOT-REC-001')).toBe(true)
    expect(isMyQueueCase('got_receiver', own, 'GOT-REC-001')).toBe(true)
    expect(canSeeDossierCard('got_receiver', 'forward')).toBe(true)
    expect(canSeeDossierCard('got_receiver', 'editDossier')).toBe(true)
    expect(canSeeFormsSection('got_receiver', own, 'GOT-REC-001')).toBe(false)
    expect(canSeeFormsSection('receiver', own, 'REC-001')).toBe(false)
  })

  it('ไม่เห็นแฟ้มที่ผู้อื่นรับเข้า และสิทธิ์อื่นของ กอท. คงเดิม', () => {
    expect(canViewHandoffCase('got_receiver', other, 'GOT-REC-001')).toBe(false)
    expect(handoffBlocksOperations('got_receiver', other, 'GOT-REC-001')).toBe(true)
    expect(canViewHandoffCase('got_director', own, 'GOT-REC-001')).toBe(false)
    expect(handoffBlocksOperations('got_officer', own, 'GOT-REC-001')).toBe(true)
    expect(isHandoffQueueCase('got_receiver', own, 'GOT-REC-001')).toBe(false)
  })
})
