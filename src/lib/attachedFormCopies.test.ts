import { beforeEach, expect, it } from 'vitest'
import { useCaseStore } from '../store/useCaseStore'
import { useFormDraftStore } from '../store/useFormDraftStore'
import { FORMS_CATALOG } from './constants'
import type { CaseItem } from '../types/case'

beforeEach(() => {
  useCaseStore.setState({ cases: [{ no: 'ATTACH-1', form: 'คบ.1', person: 'ทดสอบ', stage: 'staff_review', extraForms: [6] } as CaseItem] })
  useFormDraftStore.setState({ drafts: { 6: { เหตุผล: 'ต้นฉบับ' } }, draftCaseNo: { 6: 'ATTACH-1' }, caseDrafts: {}, signatures: { 'kb6-officer': { signed: true } as any }, locks: {}, revisions: {} })
})
it('keeps repeated attachments independent without changing the workflow original or its signature', () => {
  const store = useCaseStore.getState()
  store.addExtraForm('ATTACH-1', 6)
  store.addExtraForm('ATTACH-1', 6)
  const c = store.getCase('ATTACH-1')!
  const copies = c.attachedFormCopies!
  expect(copies).toHaveLength(2)
  expect(copies[0].id).not.toBe(copies[1].id)
  copies[0].fields.เหตุผล = 'แก้ฉบับแนบ'
  expect(copies[1].fields.เหตุผล).toBe('ต้นฉบับ')
  expect(useFormDraftStore.getState().drafts[6].เหตุผล).toBe('ต้นฉบับ')
  expect(useFormDraftStore.getState().signatures['kb6-officer'].signed).toBe(true)
  expect(c.extraForms).toEqual([6])
})
it('accepts every catalog form including fast-track and flow-only documents', () => {
  FORMS_CATALOG.forEach(f => useCaseStore.getState().addExtraForm('ATTACH-1', f.n))
  expect(useCaseStore.getState().getCase('ATTACH-1')!.attachedFormCopies?.map(c => c.formNo)).toEqual(FORMS_CATALOG.map(f => f.n))
})
it('does not copy a draft owned by another case or an unscoped draft', () => {
  useFormDraftStore.setState({ draftCaseNo: { 6: 'OTHER' }, drafts: { 6: { private: 'other' }, 1: { private: 'unscoped' } } })
  useCaseStore.getState().addExtraForm('ATTACH-1', 6)
  useCaseStore.getState().addExtraForm('ATTACH-1', 1)
  expect(useCaseStore.getState().getCase('ATTACH-1')!.attachedFormCopies?.map(c => c.fields)).toEqual([{}, {}])
})
