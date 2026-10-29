import { beforeEach, describe, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { useNotificationStore } from '../store/useNotificationStore'
import type { CaseItem } from '../types/case'
import { sarabanInTransit } from './saraban'
import { passSarabanCheckpoint } from './sarabanTestHelpers'

/** ข้อ 14 — ผอ.→รองเลขาธิการ (ขาไป) และผลจาก รองเลขาธิการ/เลขาธิการ → หน่วย (ขากลับ) ต้องผ่านธุรการทั้งสองฝั่ง */
const NO = '9914/2569'
const base = (step: 'director_review' | 'deputy_review' | 'secretary_review'): CaseItem => ({
  no: NO, form: 'คำร้อง', person: 'พยานตัวอย่าง', stage: 'article14',
  status: 'รอพิจารณาเรื่องส่งต่อกรมคุ้มครองสิทธิฯ', owner: 'ผู้พิจารณา', next: 'พิจารณา', risk: 'ต่ำ',
  assignedOfficerUserId: 'OFF-REG1', orgUnitId: 'pacc-reg-1', assignmentHistory: [],
  article14: { step, threatSummary: 'ภัย', riskAssessment: 'สูง', openedAt: 'x', openedBy: 'เจ้าหน้าที่', revisions: [], letterVersion: 2, approvals: [] },
})
const store = () => useCaseStore.getState()
const current = () => store().cases.find((c) => c.no === NO)!
const seed = (step: Parameters<typeof base>[0]) => useCaseStore.setState({ cases: [base(step)], activeCaseNo: NO })

beforeEach(() => {
  localStorage.clear()
  useAuthStore.getState().setRole('director')
  useNotificationStore.setState({ notifications: [], unreadCount: 0 })
})

describe('ข้อ 14 ผ่านธุรการ', () => {
  it('ขาไป: ผอ.เห็นชอบ → ธุรการหน่วย → ธุรการสำนักงาน → รองเลขาธิการพิจารณาได้', () => {
    seed('director_review')
    store().reviewArticle14(NO, 'director', true, 'เห็นชอบ')
    expect(sarabanInTransit(current(), 'article14')).toBe(true)
    expect(current().sarabanDispatch).toMatchObject({ direction: 'up', forms: [18], subject: 'เรื่องส่งต่อกรมคุ้มครองสิทธิฯ · หนังสือฉบับที่ 2' })
    // รองเลขาธิการยังพิจารณาไม่ได้ขณะอยู่ที่ธุรการ
    store().reviewArticle14(NO, 'deputy_secretary', true, 'เห็นชอบ')
    expect(current().article14?.step).toBe('deputy_review')
    expect(current().article14?.approvals).toHaveLength(1)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().status).toContain('รองเลขาธิการ')
    store().reviewArticle14(NO, 'deputy_secretary', true, 'เห็นชอบ')
    expect(current().article14?.step).toBe('secretary_review')
    expect(sarabanInTransit(current())).toBe(false)
  })

  it('เลขาธิการลงนามและส่งตรงคณะกรรมการ แล้วส่งผลมติกลับผ่านธุรการ', () => {
    seed('secretary_review')
    useAuthStore.getState().setRole('secretary')
    store().reviewArticle14(NO, 'secretary', true, 'เห็นชอบ')
    expect(current().article14?.step).toBe('secretary_review')
    expect(store().signArticle14Secretary(NO, 'เลขาธิการ')).toBe(true)
    store().reviewArticle14(NO, 'secretary', true, 'เห็นชอบ')
    expect(current().article14?.step).toBe('committee_pending')
    expect(current().sarabanDispatch).toBeUndefined()
    expect(current().article14?.committeeSentAt).toBeTruthy()
    useAuthStore.getState().setRole('committee')
    store().recordArticle14Resolution(NO, '1/2569', true, 'เห็นชอบส่งต่อ')
    expect(current().article14?.step).toBe('letter_sent')
    expect(current().sarabanDispatch).toMatchObject({ direction: 'down', flow: 'article14', forms: [19, 18] })
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(passSarabanCheckpoint(NO)).toBe(true)
    expect(current().sarabanDispatch).toBeUndefined()
  })

  it('ส่งคืนแก้ไขที่รองเลขาธิการ/เลขาธิการผ่านธุรการ แต่ที่ ผอ. ไม่ผ่าน', () => {
    seed('deputy_review')
    store().reviewArticle14(NO, 'deputy_secretary', false, 'แก้ไข')
    expect(current().article14?.step).toBe('proposal_draft')
    expect(current().sarabanDispatch).toMatchObject({ direction: 'down', subject: 'ส่งคืนแก้ไขเรื่องส่งต่อกรมคุ้มครองสิทธิฯ' })
    store().openArticle14(NO, { threatSummary: 'x', riskAssessment: 'y' })
    expect(current().article14?.revisionPreparedAt).toBeUndefined()

    seed('director_review')
    store().reviewArticle14(NO, 'director', false, 'แก้ไข')
    expect(current().article14?.step).toBe('proposal_draft')
    expect(current().sarabanDispatch).toBeUndefined()
  })
})
