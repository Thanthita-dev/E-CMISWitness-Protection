import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import type { CaseItem } from '../types/case'
import { sarabanInTransit } from './saraban'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** ขากลับจากสำนักงานเลขาธิการ (คบ.8 / ผลพิจารณา / ส่งคืนแก้ไข) ต้องผ่านธุรการทั้งสองฝั่ง */
const NO = '9903/2569'
const base = (extra: Partial<CaseItem> = {}): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'external_pending',
  status: 'รอเลขาธิการพิจารณา', owner: 'เลขาธิการ ป.ป.ท.', next: 'พิจารณา', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  ...extra,
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [base()], activeCaseNo: NO })
  useAuthStore.getState().setRole('secretary')
})

describe('ชุดนำส่ง flow decision / kb8', () => {
  it('เลขาธิการส่งคืนแก้ไข: เปิดชุดนำส่งขากลับ และ ผอ. มอบหมายแก้ไขไม่ได้จนกว่าธุรการลงครบ', () => {
    useCaseStore.setState({ cases: [base({ kb6SecretarySignedAt: 'x' })] })
    store().secretaryReturn(NO, 'ข้อมูลไม่ครบ', 'ให้เพิ่มเติม')
    expect(sarabanInTransit(current(), 'decision')).toBe(true)
    expect(current().sarabanDispatch?.direction).toBe('down')
    expect(current().sarabanDispatch?.forms).toEqual([1, 3, 6])
    useAuthStore.getState().setRole('director')
    store().assignReturnRevision(NO, 'แก้ไข')
    expect(current().stage).toBe('director_review')
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().stage).toBe('director_review')
    store().assignReturnRevision(NO, 'แก้ไข')
    expect(current().stage).toBe('staff_review')
  })

  it('เลขาธิการส่งต่อข้อ 14: เปิดชุดนำส่ง [1,3,6]', () => {
    store().secretaryReferArticle14(NO, 'เลขที่ 1/2569', 'เกินขอบเขต')
    expect(current().sarabanDispatch?.subject).toContain('ข้อ 14')
    expect(current().stage).toBe('article14')
  })

  it('คบ.8: เสนอขาไป → ลงนามไม่ได้ระหว่างธุรการ → ลงนามแล้วขากลับ', () => {
    useCaseStore.setState({ cases: [base({ stage: 'protection', kb11Signed: true, approvedMethods: [1], owner: 'นายพิพัฒน์ ศรีสุวรรณ' })] })
    store().submitKb8ForSignature(NO)
    expect(current().sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'up', forms: [8] })
    store().signOutgoingNotice(NO, 8)
    expect(current().kb8Signed).toBeFalsy()
    passSarabanCheckpoint(NO); passSarabanCheckpoint(NO)
    expect(current().sarabanDispatch).toBeUndefined()
    store().signOutgoingNotice(NO, 8)
    expect(current().kb8Signed).toBe(true)
    expect(current().sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'down', subject: 'คบ.8 ลงนามแล้ว' })
  })

  it('คบ.8 ส่งคืนแก้ไข: เปิดชุดขากลับ', () => {
    useCaseStore.setState({ cases: [base({ stage: 'protection', kb11Signed: true, approvedMethods: [1], kb8SubmittedAt: 'x' })] })
    store().returnKb8ForRevision(NO, 'แก้ไข')
    expect(current().sarabanDispatch).toMatchObject({ flow: 'kb8', direction: 'down', subject: 'ส่งคืนแก้ไข คบ.8' })
    expect(current().kb8Version).toBe(2)
  })
})
