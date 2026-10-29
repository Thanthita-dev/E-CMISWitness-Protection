import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { CAP_WARNING_TYPE, capWarning, notifyCapWarnings } from './capWarning'
import { canProposeArticle14 } from './episode'
import { passSarabanCheckpoint } from './sarabanTestHelpers'
import { addDays } from './utils'

/** เสนอส่งต่อกรมคุ้มครองสิทธิฯ ก่อนครบ 6 เดือน (ต้องผ่านคณะกรรมการ) และแจ้งเตือนล่วงหน้า 1 เดือน */
const NO = '9920/2569'
const started = (elapsed: number, patch: Partial<CaseItem> = {}): CaseItem => {
  const start = addDays(new Date(), -elapsed)
  return {
    no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'protection',
    status: 'กำลังคุ้มครอง', owner: 'เจ้าหน้าที่', next: 'ติดตามผล', risk: 'สูง',
    assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
    actualStartedAt: start,
    episode: { id: 'EP-1', openedAt: start, phases: [{ id: 'PH-1', kind: 'MAIN', startedAt: start }] },
    ...patch,
  }
}
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const seed = (c: CaseItem) => useCaseStore.setState({ cases: [c], activeCaseNo: NO })
const approveToSecretary = () => {
  useCaseStore.setState({
    cases: [{ ...current(), article14: { ...current().article14!, step: 'secretary_review' } }],
  })
  useAuthStore.getState().setRole('secretary')
  store().signArticle14Secretary(NO, 'เลขาธิการ')
  store().reviewArticle14(NO, 'secretary', true, 'เห็นชอบ')
}

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().setRole('officer')
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('เสนอส่งต่อกรมคุ้มครองสิทธิฯ ก่อนครบ 6 เดือน', () => {
  it('เคสที่เริ่มคุ้มครองแล้วเสนอได้ เคสที่ยังไม่เริ่มหรือปิดงานแล้วเสนอไม่ได้', () => {
    expect(canProposeArticle14(started(10))).toBe(true)
    expect(canProposeArticle14(started(10, { stage: 'terminated' }))).toBe(false)
    expect(canProposeArticle14(started(10, { actualStartedAt: undefined, episode: undefined, stage: 'method_operation' }))).toBe(false)
  })

  it('เปิดเรื่องตอนยังเหลือเกิน 30 วัน = เสนอก่อนครบ → เลขาธิการเห็นชอบแล้วรอส่งคณะกรรมการ', () => {
    seed(started(60))
    store().openArticle14(NO, { threatSummary: 'ภัย', riskAssessment: 'สูง' })
    expect(current().article14?.earlyReferral).toBe(true)
    approveToSecretary()
    expect(current().article14?.step).toBe('committee_pending')
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().article14?.committeeSentAt).toBeTruthy()
    expect(current().next).toContain('คณะกรรมการ')
  })

  it('เปิดเรื่องใกล้ครบเพดาน — เลขาธิการเห็นชอบแล้วยังต้องรอมติคณะกรรมการ', () => {
    seed(started(165))
    store().openArticle14(NO, { threatSummary: 'ภัย', riskAssessment: 'สูง' })
    expect(current().article14?.earlyReferral).toBe(false)
    approveToSecretary()
    expect(current().article14?.step).toBe('committee_pending')
    store().sendArticle14ToCommittee(NO)
    expect(current().article14?.committeeSentAt).toBeTruthy()
  })

  it('เลขาธิการฯ เห็นควรตั้งแต่ชั้นผลพิจารณา ไม่เปลี่ยนตัวระบุเสนอก่อนครบ', () => {
    seed(started(30, { article14Referral: { at: 'x', by: 'เลขาธิการ', decisionNo: '1/2569', reason: 'ภัยสูง' } }))
    store().openArticle14(NO, { threatSummary: 'ภัย', riskAssessment: 'สูง' })
    expect(current().article14?.earlyReferral).toBe(false)
  })
})


  it.each([180, 200])('ครบเพดาน %i วัน ต้องผ่านมติก่อนนำส่ง และมติไม่เห็นชอบไม่เปิดทางนำส่ง', (elapsed) => {
    seed(started(elapsed))
    store().openArticle14(NO, { threatSummary: 'ภัยยังคงอยู่', riskAssessment: 'สูง' })
    approveToSecretary()
    expect(current().article14?.step).toBe('committee_pending')
    store().recordArticle14Resolution(NO, '1/2569', true, 'เลขาธิการบันทึกมติแทนไม่ได้')
    expect(current().article14?.committeeApproved).toBeUndefined()
    expect(current().sarabanDispatch).toBeUndefined()
    useAuthStore.getState().setRole('committee')
    store().recordArticle14Resolution(NO, '', true, '')
    expect(current().article14?.step).toBe('committee_pending')
    store().recordArticle14Resolution(NO, '1/2569', elapsed === 180, 'มติ')
    expect(current().article14?.step).toBe(elapsed === 180 ? 'letter_sent' : 'committee_rejected')
    expect(current().article14?.committeeApproved).toBe(elapsed === 180)
    store().recordArticle14Resolution(NO, '2/2569', true, 'ห้ามแก้มติซ้ำ')
    expect(current().article14?.committeeResolutionNo).toBe('1/2569')
  })

describe('แจ้งเตือนล่วงหน้า 1 เดือนก่อนครบ 6 เดือน', () => {
  it('เตือนเฉพาะช่วงเหลือไม่เกิน 30 วันและยังไม่ครบ', () => {
    expect(capWarning(started(60))).toBeUndefined()
    expect(capWarning(started(165))?.remaining).toBeLessThanOrEqual(30)
    expect(capWarning(started(165, { stage: 'terminated' }))).toBeUndefined()
    expect(capWarning(started(200))).toBeUndefined()
  })

  it('ส่งเข้ากระดิ่งของเจ้าของเรื่องครั้งเดียวต่อแฟ้ม', () => {
    const c = started(165)
    notifyCapWarnings([c])
    notifyCapWarnings([c])
    const sent = useNotificationStore.getState().notifications.filter((n) => n.type === CAP_WARNING_TYPE)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ caseNo: NO, toUserId: 'OFF-REG1' })
  })
})
