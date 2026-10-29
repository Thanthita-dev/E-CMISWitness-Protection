import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { sarabanInTransit } from './saraban'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** แฟ้มอุทธรณ์ (appeal) และกลั่นกรอง คบ.10 (kb10) — ข้ามหน่วย↔สำนักงานเลขาธิการต้องผ่านธุรการ */
const NO = '9903/2569'
const base = (extra: Partial<CaseItem> = {}): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'notice',
  status: 'แฟ้มอุทธรณ์', owner: 'ผอ.', next: 'x', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  ...extra,
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!

beforeEach(() => {
  localStorage.clear()
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
  useAuthStore.getState().setRole('director')
})

describe('appeal ผ่านธุรการ', () => {
  it('ผอ.ลงนามเสนอ → ธุรการสองฝั่ง → รองเลขาธิการฯ จึงให้ความเห็นได้', () => {
    useCaseStore.setState({ cases: [base({ appealAgainst: 'kb10', appealFolder: { stage: 'director' } as CaseItem['appealFolder'] })] })
    store().recordAppealOpinion(NO, 'director', 'เห็นควรเสนอ')
    expect(sarabanInTransit(current(), 'appeal')).toBe(true)
    expect(current().sarabanDispatch).toMatchObject({ direction: 'up', forms: [10] })
    store().recordAppealOpinion(NO, 'deputy', 'ลัดขั้น')
    expect(current().appealFolder?.deputyOpinion).toBeUndefined()
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    expect(sarabanInTransit(current(), 'appeal')).toBe(false)
    store().recordAppealOpinion(NO, 'deputy', 'กลั่นกรองแล้ว')
    expect(current().appealFolder?.stage).toBe('secretary')
    expect(current().sarabanDispatch).toBeUndefined()
  })

  it('มติคณะกรรมการลงหน่วยผ่านธุรการ และแจ้งผลได้หลังรับ', () => {
    useCaseStore.setState({ cases: [base({ appealAgainst: 'kb10', owner: 'คณะกรรมการ', appealFolder: { stage: 'agenda', agendaAt: 'x' } as CaseItem['appealFolder'] })] })
    useAuthStore.getState().setRole('committee')
    store().recordAppealResolution(NO, { resolutionNo: '1/2569', outcome: 'uphold', note: 'ยกคำร้อง' })
    expect(current().sarabanDispatch).toMatchObject({ direction: 'down', subject: 'ผลวินิจฉัยอุทธรณ์ · ยกคำร้อง' })
    const input = { documentName: 'a.pdf', registryNo: '1', sentAt: '2026-10-12', deliveredAt: '2026-10-13', recipient: 'พยาน', ackDocument: 'ack' }
    store().recordAppealNotice(NO, input)
    expect(current().appealResolution?.noticeDocumentName).toBeUndefined()
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    store().recordAppealNotice(NO, input)
    expect(current().appealResolution?.noticeDocumentName).toBe('a.pdf')
  })
})

describe('kb10 ผ่านธุรการ', () => {
  it('เสนอกลั่นกรองขาขึ้น แล้วส่งคืนแก้ไขขาลง; ผ่านกลั่นกรองไม่มีธุรการ', () => {
    useCaseStore.setState({ cases: [base({ stage: 'external_pending', nonApprovalStep: 0 })] })
    store().submitKb10ForScreening(NO, 'ครบ')
    expect(current().sarabanDispatch).toMatchObject({ flow: 'kb10', direction: 'up', forms: [10] })
    store().screenKb10ByDeputy(NO, true, 'ลัดขั้น')
    expect(current().nonApprovalStep).toBe(1)
    store().submitKb10ForScreening(NO, 'ซ้ำ')
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    store().screenKb10ByDeputy(NO, false, 'แก้ข้อความ')
    expect(current().sarabanDispatch).toMatchObject({ flow: 'kb10', direction: 'down', subject: 'ส่งคืนแก้ไข คบ.10' })
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    expect(current().nonApprovalStep).toBe(0)
    store().submitKb10ForScreening(NO, 'แก้แล้ว')
    passSarabanCheckpoint(NO)
    passSarabanCheckpoint(NO)
    store().screenKb10ByDeputy(NO, true, 'ผ่าน')
    expect(current().nonApprovalStep).toBe(2)
    expect(current().sarabanDispatch).toBeUndefined()
  })
})

/** ชื่อผู้ดำเนินการในแฟ้มอุทธรณ์ต้องเป็นบัญชีที่ล็อกอินอยู่ ไม่ใช่ชื่อตั้งต้นของส่วนกลาง */
describe('appeal ผู้ดำเนินการ', () => {
  it('ผบช.ชั้นต้น เขต 1 เสนอ ผอ. ได้ทันทีโดยไม่ต้องมอบหมาย และให้ความเห็นในนามของตนเอง', () => {
    useCaseStore.setState({ cases: [base({ appealAgainst: 'kb10', appealFolder: { stage: 'supervisor' } as CaseItem['appealFolder'] })] })
    useAuthStore.getState().setRole('supervisor')
    useAuthStore.setState({ currentOfficerUserId: 'SUP-REG1', currentOrgUnitId: 'pacc-reg-1' })
    store().recordAppealOpinion(NO, 'supervisor', 'เห็นควรเสนอ')
    expect(current().appealFolder?.stage).toBe('director')
    expect(current().appealFolder?.supervisorOpinion?.by).toBe('พ.ต.ท. เกรียงไกร มั่นคง')
  })
})
