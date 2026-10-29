import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { assignableOfficers, canAssignInUnit } from './officerAssignment'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { useNotificationStore } from '../store/useNotificationStore'
import { findLoginAccount } from './loginAccounts'
import { DirectorAssignmentCard } from '../components/dossier/DirectorAssignmentCard'
import type { CaseItem } from '../types/case'
vi.mock('./swal', () => ({ showToast: vi.fn() }))
const initial = (): CaseItem => ({ no: 'ASSIGN-TEST', form: 'คบ.1', person: 'ผู้ร้อง', stage: 'director_review', status: 'รอมอบหมาย', owner: 'ผอ.', next: 'มอบหมาย', risk: 'ต่ำ', orgUnitId: 'pacc-reg-2', receivedByUserId: 'REC-REG2', assignmentHistory: [] })
const login = (name: string) => useAuthStore.getState().login(findLoginAccount(name)!)
beforeEach(() => {
  cleanup()
  login('reg2.director')
  useCaseStore.setState({ cases: [initial()] })
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})
describe('ผอ. มอบหมายเฉพาะหน่วยงานของตน', () => {
  it('แยกรายชื่อทุกเขตและ กอท. และไม่ให้บทบาทเจ้าหน้าที่มอบหมาย', () => {
    for (let n = 1; n <= 9; n++) {
      const users = assignableOfficers('director', `pacc-reg-${n}`)
      expect(users.length).toBeGreaterThan(0)
      expect(users.every((u) => u.orgUnitId === `pacc-reg-${n}` && u.active)).toBe(true)
    }
    expect(assignableOfficers('got_director', 'central-gmc').map((u) => u.id)).toEqual(['GOT-OFF-001', 'GOT-OFF-002'])
    expect(assignableOfficers('officer', 'pacc-reg-2')).toEqual([])
  })
  it('บันทึกเจ้าหน้าที่เขตเดียวกันและแจ้งเตือนผู้รับจริง', () => {
    expect(useCaseStore.getState().assignOfficer('ASSIGN-TEST', 'OWN-REG2')).toBe(true)
    expect(useCaseStore.getState().getCase('ASSIGN-TEST')?.assignedOfficerUserId).toBe('OWN-REG2')
    expect(useNotificationStore.getState().notifications[0].toUserId).toBe('OWN-REG2')
    expect(useCaseStore.getState().getCase('ASSIGN-TEST')?.assignedBy).toBe(useAuthStore.getState().getCurrentUserAccount()?.name)
  })
  it('ปฏิเสธผู้รับต่างเขต สำนวนต่างเขต บทบาทอื่น และไม่เขียนประวัติหรือแจ้งเตือน', () => {
    const before = useCaseStore.getState().cases
    expect(useCaseStore.getState().assignOfficer('ASSIGN-TEST', 'OFF-REG1')).toBe(false)
    login('reg1.director')
    expect(useCaseStore.getState().assignOfficer('ASSIGN-TEST', 'OFF-REG1')).toBe(false)
    login('reg2.officer')
    expect(useCaseStore.getState().assignOfficer('ASSIGN-TEST', 'OWN-REG2')).toBe(false)
    expect(useCaseStore.getState().cases).toBe(before)
    expect(useNotificationStore.getState().notifications).toEqual([])
  })
  it('แฟ้มเก่าอ้างหน่วยงานผู้รับเรื่องก่อนเจ้าของที่เคยมอบผิด และไม่เดาหน่วยงานแฟ้มที่ไม่ทราบ', () => {
    expect(canAssignInUnit('director', 'pacc-reg-2', { receivedByUserId: 'REC-REG2', assignedOfficerUserId: 'OFF-REG1' })).toBe(true)
    expect(canAssignInUnit('director', 'pacc-reg-1', { receivedByUserId: 'REC-REG2', assignedOfficerUserId: 'OFF-REG1' })).toBe(false)
    expect(canAssignInUnit('director', 'pacc-reg-2', {})).toBe(false)
  })
  it('UI ไม่แนะนำเจ้าของต่างเขตและปรับรายชื่อเมื่อเปลี่ยนบัญชี', () => {
    const c = { ...initial(), mainCaseLeadOfficerUserId: 'OFF-REG1' }
    const { rerender } = render(<DirectorAssignmentCard caseItem={c} />)
    let select = screen.getByLabelText('เลือกเจ้าหน้าที่เจ้าของสำนวน *') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['OFF-REG2', 'OWN-REG2'])
    fireEvent.change(select, { target: { value: 'OWN-REG2' } })
    login('reg3.director')
    rerender(<DirectorAssignmentCard caseItem={{ ...c, orgUnitId: 'pacc-reg-3' }} />)
    select = screen.getByLabelText('เลือกเจ้าหน้าที่เจ้าของสำนวน *') as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['OFF-REG3', 'OWN-REG3'])
    expect(select.value).toBe('OFF-REG3')
    rerender(<DirectorAssignmentCard caseItem={c} />)
    expect(screen.queryByLabelText('เลือกเจ้าหน้าที่เจ้าของสำนวน *')).toBeNull()
  })
})
