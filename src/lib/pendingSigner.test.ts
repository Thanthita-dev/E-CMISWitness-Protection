import { describe, expect, it } from 'vitest'
import { pendingSignerLabel } from './formSignature'
import type { CaseItem } from '../types/case'

const base = (patch: Partial<CaseItem> = {}): CaseItem => ({
  no: '0601/2569', form: 'คบ.1', person: 'นายทดสอบ ลงนาม', stage: 'director_review',
  status: 'รอผู้อำนวยการพิจารณา', owner: 'ผู้อำนวยการ', next: 'พิจารณา', risk: 'สูง',
  createdAt: '2026-10-01T08:00:00.000Z', ...patch,
})

describe('pendingSignerLabel — กรอบแดงในรายการแบบฟอร์มของแฟ้ม', () => {
  it('ระบุตำแหน่งและข้อของ คบ.6 เมื่อถึงคิวบทบาทนี้', () => {
    const caseItem = base({ kb6SupervisorSignedAt: '2026-10-02T08:00:00Z' })
    expect(pendingSignerLabel({ formNo: 6, caseItem, currentRole: 'director', canEditDossier: false })).toBe('ผู้อำนวยการสำนัก/กอง')
  })

  it('ไม่แสดงเมื่อยังไม่ถึงคิวบทบาทนี้', () => {
    const caseItem = base()
    expect(pendingSignerLabel({ formNo: 6, caseItem, currentRole: 'secretary', canEditDossier: false })).toBeNull()
  })

  it('ไม่แสดงเมื่อข้อนั้นลงนามแล้ว', () => {
    const caseItem = base({ kb6DirectorSignedAt: '2026-10-03T08:00:00Z' })
    expect(pendingSignerLabel({ formNo: 6, caseItem, currentRole: 'director', canEditDossier: false })).toBeNull()
  })

  it('แบบที่ไม่มีขั้นลงนามไม่ขึ้นกรอบแดง', () => {
    expect(pendingSignerLabel({ formNo: 4, caseItem: base(), currentRole: 'admin', canEditDossier: true })).toBeNull()
  })
})
