import { beforeEach, describe, expect, it } from 'vitest'
import { canLinkMainCase, isCaseOwnedBy, isMyQueueCase } from './permissions'
import { canViewHandoffCase } from './protectionHandoff'
import { findLoginAccount } from './loginAccounts'
import { useAuthStore } from '../store/useAuthStore'
import type { CaseItem } from '../types/case'

beforeEach(() => {
  useAuthStore.setState({ currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'central-wp', loginUsername: null })
})

describe('ขอบเขตงานรายบุคคล', () => {
  it('ไม่เห็นงานคนอื่นหรือแฟ้มที่ยังไม่มีผู้รับผิดชอบ และผู้รับเรื่องเองเชื่อมได้ก่อนมอบหมาย', () => {
    const intake = { receivedByUserId: 'OFF-002' }
    for (const role of ['officer', 'case_owner'] as const) {
      expect(canViewHandoffCase(role, intake, 'OFF-001')).toBe(false)
      expect(canViewHandoffCase(role, {}, 'OFF-001')).toBe(false)
      expect(isMyQueueCase(role, intake, 'OFF-001')).toBe(false)
      expect(isCaseOwnedBy(role, intake, 'OFF-001')).toBe(false)
      expect(canLinkMainCase(role, intake, 'OFF-002')).toBe(true)
    }
  })

  it('เมื่อมอบหมายแล้ว ผู้รับเรื่องเดิมไม่เห็นหรือเชื่อมงานของเจ้าหน้าที่คนใหม่', () => {
    const assigned = { assignedOfficerUserId: 'OFF-002', receivedByUserId: 'OFF-001' }
    expect(canViewHandoffCase('officer', assigned, 'OFF-001')).toBe(false)
    expect(isMyQueueCase('officer', assigned, 'OFF-001')).toBe(false)
    expect(canLinkMainCase('officer', assigned, 'OFF-001')).toBe(false)
    expect(canLinkMainCase('case_owner', assigned, 'OFF-002')).toBe(true)
  })

  it('หลังส่งมอบ กอท. ใช้ผู้รับผิดชอบคนปัจจุบันเชื่อมเลขสำนวน ไม่ใช้เจ้าของต้นทาง', () => {
    const item = { assignedOfficerUserId: 'OFF-001', protectionHandoff: {
      destination: 'got', step: 'accepted', originalOwnerUserId: 'OFF-001', assigneeUserId: 'GOT-OFF-001',
    } } as CaseItem
    useAuthStore.getState().login(findLoginAccount('got.officer')!)
    expect(canLinkMainCase('got_officer', item, 'GOT-OFF-001')).toBe(true)
    expect(canLinkMainCase('got_officer', item, 'GOT-OFF-002')).toBe(false)
    expect(canLinkMainCase('got_officer', { ...item, protectionHandoff: { ...item.protectionHandoff!, step: 'assigned' } }, 'GOT-OFF-001')).toBe(false)
    useAuthStore.setState({ currentRole: 'officer', currentOfficerUserId: 'OFF-001', currentOrgUnitId: 'central-wp' })
    expect(canLinkMainCase('officer', item, 'OFF-001')).toBe(false)
  })

  it('บัญชีเขต 2–9 แยกบุคคลจริง ไม่ใช้รหัสส่วนกลาง และไม่เห็นงานข้ามเขต', () => {
    const ids = new Set<string>()
    for (let region = 2; region <= 9; region++) {
      for (const role of ['officer', 'caseowner']) {
        const account = findLoginAccount(`reg${region}.${role}`)!
        useAuthStore.getState().login(account)
        const state = useAuthStore.getState()
        expect(state.currentOfficerUserId).toBe(account.userId)
        expect(state.currentOfficerUserId).not.toBe('OFF-001')
        expect(state.getCurrentUserAccount()?.orgUnitId).toBe(`pacc-reg-${region}`)
        ids.add(state.currentOfficerUserId)
        expect(canViewHandoffCase(account.role, { assignedOfficerUserId: 'OFF-001' }, state.currentOfficerUserId)).toBe(false)
      }
    }
    expect(ids.size).toBe(16)
  })
})

describe('คิวงานธุรการสำนักงานเลขาธิการ', () => {
  it('ชุดนำส่งที่รอธุรการ สลธ. ออกเลขส่ง (เช่น ส่งต่อกรมคุ้มครองสิทธิฯ) เข้าคิวงานของฉัน', () => {
    const dispatch = (checkpoint: 'secretary_outgoing' | 'destination_incoming') => ({
      stage: 'protection', protectionHandoff: undefined,
      sarabanDispatch: { checkpoint, unitClerkRole: 'receiver', unitId: 'central-wp', forms: [18] },
    }) as unknown as CaseItem
    expect(isMyQueueCase('secretary_receiver', dispatch('secretary_outgoing'), 'SECREC-001')).toBe(true)
    expect(isMyQueueCase('secretary_receiver', dispatch('destination_incoming'), 'SECREC-001')).toBe(false)
  })
})
