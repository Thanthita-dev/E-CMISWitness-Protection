import { describe, expect, it } from 'vitest'
import type { CaseItem } from '../types/case'
import { MOCK_STATES } from './mockState'
import { getRoleSet } from './roleSets'
import { canViewHandoffCase } from './protectionHandoff'
import { isCaseOwnedBy, isCaseClosed } from './permissions'

const state = MOCK_STATES.find((s) => s.name === 'ระบบเดิม - สำนวน 9125/2567')!
const cases = JSON.parse(state.localStorageData['ecmis-case-storage-v2']).state.cases as CaseItem[]
const auth = JSON.parse(state.localStorageData['ecmis-auth-storage']).state

describe('mock state ข้อมูลจากระบบเดิม สำนวน 9125/2567', () => {
  it('มีเรื่องเดียว สิ้นสุดแล้ว และมี legacySource', () => {
    expect(cases).toHaveLength(1)
    const c = cases[0]
    expect(c.stage).toBe('terminated')
    expect(c.legacySource?.runId).toBe('RUN-2026-001')
    expect(c.legacySource?.sourceCaseNo).toBe('9125/2567')
    expect(c.legacySource?.migratedFiles).toHaveLength(1)
    expect(c.documents).toHaveLength(1)
  })

  it('ไม่แต่งข้อมูลที่ระบบเดิมไม่มี', () => {
    const c = cases[0]
    expect(c.person).toBe('')
    expect(c.closedAt).toBeUndefined()
    expect(c.risk).toBe('ยังไม่ประเมิน')
    expect(state.capturedAt).toBeUndefined()
    expect(c.formData).toBeUndefined()
    expect(c.mainCaseStatus).toBe('ชี้มูลแล้ว')
    expect(c.assignmentHistory).toBeUndefined()
    expect(c.receivedBy).toBeUndefined()
    expect(c.documents?.[0]?.uploadedBy).toBeUndefined()
  })

  it('ชุดบทบาท legacy-migration แสดงชื่อเจ้าของสำนวน และบัญชีเป็นเขต 4', () => {
    const set = getRoleSet(state.localStorageData['ecmis-role-set'])
    expect(set.id).toBe('legacy-migration')
    expect(set.users.find((u) => u.id === 'OWN-REG4')?.name).toBe('วีระพงษ์ ขยันยิ่ง')
    expect(set.users.find((u) => u.id === 'REC-REG4')?.name).toBe('ปวีณา บันทึกไว')
    expect(set.mockStateAccounts.case_owner).toBe('reg4.caseowner')
    expect(cases[0].owner).toBe('')
  })

  it('เจ้าของสำนวนเขต 4 เห็นและเป็นเจ้าของแฟ้ม', () => {
    expect(auth.currentRole).toBe('case_owner')
    expect(auth.currentOfficerUserId).toBe('OWN-REG4')
    expect(canViewHandoffCase(auth.currentRole, cases[0], auth.currentOfficerUserId)).toBe(true)
    expect(isCaseOwnedBy(auth.currentRole, cases[0], auth.currentOfficerUserId)).toBe(true)
  })

  it('isCaseClosed ถือว่าปิดเมื่อมี legacySource', () => {
    expect(isCaseClosed(cases[0])).toBe(true)
  })
})
