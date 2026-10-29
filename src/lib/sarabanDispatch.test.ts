import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { activeSarabanCheckpoint, isSarabanQueueCase, sarabanClerkRole, sarabanInTransit, sarabanStampsFor, sarabanUnitName } from './saraban'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** ชุดนำส่งผ่านธุรการ — เรื่องที่ข้ามหน่วย↔สำนักงานเลขาธิการต้องผ่านธุรการทั้งสองฝั่ง */
const NO = '9902/2569'
const base = (extra: Partial<CaseItem> = {}): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'protection',
  status: 'คบ.14 · รอรองเลขาธิการพิจารณา', owner: 'นายพิพัฒน์ ศรีสุวรรณ', next: 'รองเลขาธิการพิจารณา คบ.14', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  ...extra,
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [base()], activeCaseNo: NO })
  useAuthStore.getState().setRole('director')
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('ชุดนำส่งผ่านธุรการ', () => {
  it('ขาไป: ธุรการเขตออกเลขส่ง → ธุรการ สลธ. ลงเลขรับ → ถึงผู้รับพร้อมสถานะเดิม', () => {
    expect(store().openSarabanDispatch(NO, { flow: 'kb14', direction: 'up', forms: [14, 3, 6], subject: 'คบ.14 ฉบับที่ 1 · ขอขยายระยะเวลา' })).toBe(true)
    expect(sarabanInTransit(current(), 'kb14')).toBe(true)
    expect(activeSarabanCheckpoint(current())).toBe('director_outgoing')
    expect(sarabanClerkRole(current(), 'director_outgoing')).toBe('receiver')
    expect(isSarabanQueueCase('receiver', current(), 'pacc-reg-1')).toBe(true)
    expect(isSarabanQueueCase('receiver', current(), 'pacc-reg-2')).toBe(false)
    expect(current().status).toContain('ออกเลขทะเบียนส่ง')

    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(activeSarabanCheckpoint(current())).toBe('secretary_incoming')
    expect(isSarabanQueueCase('secretary_receiver', current())).toBe(true)

    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().owner).toBe('นายพิพัฒน์ ศรีสุวรรณ')
    expect(current().status).toBe('คบ.14 · รอรองเลขาธิการพิจารณา')
    expect(sarabanStampsFor(current(), 14).map((r) => r.checkpoint)).toEqual(['director_outgoing', 'secretary_incoming'])
  })

  it('ขากลับของแฟ้ม กอท.: ธุรการ สลธ. ออกเลขส่ง → ธุรการคดี กอท. ลงเลขรับ', () => {
    useCaseStore.setState({ cases: [base({ owner: 'นางสาวอรุณี ใจมั่น', status: 'อนุมัติขยายเวลา', next: 'ดำเนินการต่อ',
      protectionHandoff: { destination: 'got', step: 'active', originalOwnerUserId: 'OFF-001', originalOwnerName: 'x', secretaryInstruction: '', assigneeUserId: 'GOT-OFF-001', events: [] } })] })
    expect(store().openSarabanDispatch(NO, { flow: 'kb14', direction: 'down', forms: [14], subject: 'ผลพิจารณา คบ.14' })).toBe(true)
    expect(activeSarabanCheckpoint(current())).toBe('secretary_outgoing')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(sarabanClerkRole(current(), 'destination_incoming')).toBe('got_receiver')
    expect(sarabanUnitName(current(), 'destination_incoming')).toContain('กอท')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().owner).toBe('นางสาวอรุณี ใจมั่น')
    expect(current().sarabanDispatch).toBeUndefined()
  })

  it('เปิดซ้ำระหว่างที่ยังมีชุดค้างไม่ได้', () => {
    expect(store().openSarabanDispatch(NO, { flow: 'kb14', direction: 'up', forms: [14], subject: 'a' })).toBe(true)
    expect(store().openSarabanDispatch(NO, { flow: 'article14', direction: 'up', forms: [18], subject: 'b' })).toBe(false)
  })
})
