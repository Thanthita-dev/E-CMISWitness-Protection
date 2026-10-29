import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import type { CaseItem, CoordinationLetterDraft } from '../types/case'
import { canActAsLetterClerk, isLetterNumberingQueueCase, letterNumberingOf } from './coordinationLetterNumbering'
import { currentMethod4Letters } from './methodProgress'

/** หนังสือประสานวิธีที่ 4 — ธุรการหน่วยเจ้าของเรื่องออกเลข (ขาออก) ก่อน แล้วเจ้าหน้าที่หรือธุรการกดนำส่ง */
const NO = '9950/2569'
const draft: CoordinationLetterDraft = {
  registryNo: '', registryDate: '2026-10-21', subject: 'ขอความร่วมมือในการคุ้มครองพยาน', body: 'เนื้อหา', signerName: 'ผู้ลงนาม', signerPosition: 'ตำแหน่ง',
}
const base = (): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'protection',
  status: 'ดำเนินมาตรการคุ้มครอง', owner: 'นายพิพัฒน์ ศรีสุวรรณ', next: '-', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  methodTracks: [{ method: 4, status: 'pending', coordination: { agency: 'สถานีตำรวจภูธรเมือง', responseStatus: 'awaiting', letterDraft: draft } }],
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const as = (role: Parameters<ReturnType<typeof useAuthStore.getState>['setRole']>[0], unit: string | null) => {
  useAuthStore.getState().setRole(role)
  useAuthStore.setState({ currentOrgUnitId: unit })
}
const request = () => store().requestCoordinationLetterNumber(NO, { agency: 'สถานีตำรวจภูธรเมือง', letterDraft: { ...draft, registryNo: 'กรอกเอง' } })

beforeEach(() => {
  localStorage.clear()
  useCaseStore.setState({ cases: [base()], activeCaseNo: NO })
  as('officer', 'pacc-reg-1')
})

describe('ธุรการออกเลขหนังสือประสานขาออก', () => {
  it('เจ้าหน้าที่ส่งขอเลข → เข้าคิวธุรการหน่วยเจ้าของเรื่องเท่านั้น และเลขที่เจ้าหน้าที่กรอกเองไม่ถูกใช้', () => {
    expect(request()).toBe(true)
    expect(letterNumberingOf(current())).toMatchObject({ status: 'pending', clerkRole: 'receiver', unitId: 'pacc-reg-1' })
    expect(current().methodTracks![0].coordination!.letterDraft!.registryNo).toBe('')
    expect(isLetterNumberingQueueCase('receiver', current(), 'pacc-reg-1')).toBe(true)
    expect(isLetterNumberingQueueCase('receiver', current(), 'pacc-reg-2')).toBe(false)
    expect(isLetterNumberingQueueCase('officer', current(), 'pacc-reg-1')).toBe(false)
    /** ส่งซ้ำระหว่างรอธุรการไม่ได้ และยังนำส่งไม่ได้จนกว่าจะออกเลข */
    expect(request()).toBe(false)
    expect(store().sendCoordinationLetter(NO, { channel: 'direct', trackingNo: '' })).toBe(false)
  })

  it('เจ้าหน้าที่ออกเลขเองไม่ได้ — ธุรการคนละหน่วยก็ไม่ได้', () => {
    request()
    expect(store().issueCoordinationLetterNumber(NO, { registryNo: 'ปท 801/2569', registryDate: '2026-10-21' })).toBe(false)
    as('receiver', 'pacc-reg-2')
    expect(canActAsLetterClerk('receiver', current(), 'pacc-reg-2')).toBe(false)
    expect(store().issueCoordinationLetterNumber(NO, { registryNo: 'ปท 801/2569', registryDate: '2026-10-21' })).toBe(false)
  })

  it('ธุรการออกเลข → ธุรการกดนำส่งได้ และวิธีที่ 4 เปิดขั้นรอหนังสือตอบกลับ', () => {
    request()
    as('receiver', 'pacc-reg-1')
    expect(store().issueCoordinationLetterNumber(NO, { registryNo: 'ปท 801/2569', registryDate: '2026-10-22' })).toBe(true)
    expect(current().methodTracks![0].coordination!.letterDraft).toMatchObject({ registryNo: 'ปท 801/2569', registryDate: '2026-10-22' })
    expect(store().sendCoordinationLetter(NO, { channel: 'post', trackingNo: 'EF123' })).toBe(true)
    const track = current().methodTracks![0]
    expect(track.status).toBe('preparing')
    expect(track.wizardStep).toBe(2)
    expect(track.coordination!.letterNumbering!.status).toBe('sent')
    expect(currentMethod4Letters(current())).toEqual([expect.objectContaining({ direction: 'outgoing', registryNo: 'ปท 801/2569', channel: 'post', trackingNo: 'EF123' })])
    expect(isLetterNumberingQueueCase('receiver', current(), 'pacc-reg-1')).toBe(false)
  })

  it('ธุรการออกเลขแล้ว เจ้าหน้าที่ก็กดนำส่งได้', () => {
    request()
    as('receiver', 'pacc-reg-1')
    store().issueCoordinationLetterNumber(NO, { registryNo: 'ปท 801/2569', registryDate: '2026-10-22' })
    as('officer', 'pacc-reg-1')
    expect(store().sendCoordinationLetter(NO, { channel: 'direct', trackingNo: '' })).toBe(true)
    expect(currentMethod4Letters(current())).toHaveLength(1)
  })

  it('ธุรการส่งคืนแก้ไข → เจ้าหน้าที่ส่งขอเลขใหม่ได้', () => {
    request()
    as('receiver', 'pacc-reg-1')
    expect(store().returnCoordinationLetter(NO, '')).toBe(false)
    expect(store().returnCoordinationLetter(NO, 'แก้ชื่อผู้ลงนาม')).toBe(true)
    expect(letterNumberingOf(current())).toMatchObject({ status: 'returned', returnNote: 'แก้ชื่อผู้ลงนาม' })
    expect(isLetterNumberingQueueCase('receiver', current(), 'pacc-reg-1')).toBe(false)
    as('officer', 'pacc-reg-1')
    expect(request()).toBe(true)
    expect(letterNumberingOf(current())!.status).toBe('pending')
  })
})
