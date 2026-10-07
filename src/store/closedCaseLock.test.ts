import { describe, it, expect, beforeEach } from 'vitest'
import { useCaseStore } from './useCaseStore'
import { useFormDraftStore } from './useFormDraftStore'
import { isCaseClosed } from '../lib/permissions'

const CASE_NO = 'WP-TEST-000065'

const seed = (closed: boolean) => {
  useCaseStore.setState({
    cases: [
      {
        no: CASE_NO,
        form: 'คบ.1',
        person: 'นางสาวทดสอบ ระบบดี',
        status: closed ? 'ปิดงานคุ้มครองแล้ว' : 'กำลังคุ้มครอง',
        stage: closed ? 'terminated' : 'protection',
        owner: 'ร.ต.อ. อนุชา กล้าหาญ',
        next: '-',
        risk: 'สูง',
        assignedOfficer: 'นางสาวอรุณี ใจมั่น',
        linkedMainCaseId: 'GBK-2569-0001',
        mainCaseNo: 'กบค. 001/2569',
        closedAt: closed ? '01/10/2569' : undefined,
      },
    ],
    activeCaseNo: CASE_NO,
  })
  useFormDraftStore.setState({
    drafts: { 6: { 'ชื่อ': 'เดิม' } },
    draftCaseNo: { 6: CASE_NO },
    locks: { 6: { lockedAt: 'x', lockedBy: 'ผู้ทดสอบ', reason: 'ลงนาม' } },
    revisions: {},
    attachmentSets: [{ id: 1, formId: 6, category: 'เอกสารประกอบ', description: 'x', files: [] }],
  })
}

const current = () => useCaseStore.getState().getCase(CASE_NO)!

describe('TC-065 / WIT1148 — ปิดงานคุ้มครองแล้วล็อกทั้งแฟ้ม', () => {
  it('isCaseClosed จริงเฉพาะเมื่อมี closedAt และ stage = terminated', () => {
    expect(isCaseClosed({ closedAt: '01/10/2569', stage: 'terminated' })).toBe(true)
    expect(isCaseClosed({ closedAt: undefined, stage: 'terminated' })).toBe(false)
    expect(isCaseClosed({ closedAt: '01/10/2569', stage: 'protection' })).toBe(false)
    expect(isCaseClosed(undefined)).toBe(false)
  })

  describe('ก่อนปิดงาน', () => {
    beforeEach(() => seed(false))

    it('ยกเลิกเชื่อมโยงคดีหลักและสร้างเวอร์ชันใหม่ได้ตามปกติ', () => {
      useCaseStore.getState().unlinkMainCase(CASE_NO)
      expect(current().linkedMainCaseId).toBeFalsy()

      const next = useFormDraftStore.getState().reviseForm(6, 'เจ้าหน้าที่', 'แก้ไข')
      expect(next).toBe(2)
      expect(useFormDraftStore.getState().revisions[6]).toHaveLength(1)
    })
  })

  describe('หลังปิดงาน', () => {
    beforeEach(() => seed(true))

    it('updateCase / unlinkMainCase ไม่มีผล แต่บันทึกประวัติ (Audit) ยังได้', () => {
      useCaseStore.getState().unlinkMainCase(CASE_NO)
      expect(current().linkedMainCaseId).toBe('GBK-2569-0001')

      useCaseStore.getState().updateCase(CASE_NO, { status: 'แก้ทับ' })
      expect(current().status).toBe('ปิดงานคุ้มครองแล้ว')

      useCaseStore.getState().logHistory(CASE_NO, 'พยายามแก้ไข', 'ผู้ใช้', 'ถูกปฏิเสธ')
      expect(current().assignmentHistory).toHaveLength(1)
    })

    it('reviseForm / updateField / updateSignedField / signDocument ไม่มีผลกับแบบของแฟ้มนี้', () => {
      const s = useFormDraftStore.getState()
      s.reviseForm(6, 'เจ้าหน้าที่', 'แก้ไข')
      s.updateSignedField(6, 'ชื่อ', 'แก้ทับ')
      s.updateField(6, 'ชื่อ', 'แก้ทับ')
      s.signDocument('kb6-tc065-test', 'ผู้ลงนาม')

      const after = useFormDraftStore.getState()
      expect(after.revisions[6] || []).toHaveLength(0)
      expect(after.locks[6]).toBeTruthy()
      expect(after.drafts[6]['ชื่อ']).toBe('เดิม')
      expect(after.signatures['kb6-tc065-test']).toBeUndefined()
    })

    it('เพิ่ม/ลบไฟล์แนบของแบบนี้ไม่ได้', () => {
      const s = useFormDraftStore.getState()
      s.addFileToSet(1, { name: 'a.pdf' })
      s.attachFilesToSet(1, [{ name: 'b.pdf', size: 1, type: 'application/pdf', previewUrl: null, uploadedAt: '', uploadedBy: '' }])
      expect(useFormDraftStore.getState().attachmentSets[0].files).toHaveLength(0)
      expect(s.addAttachmentSet('x', 'y', 6)).toBe(0)
      expect(useFormDraftStore.getState().attachmentSets).toHaveLength(1)
      s.removeAttachmentSet(1)
      expect(useFormDraftStore.getState().attachmentSets).toHaveLength(1)
    })
  })
})
