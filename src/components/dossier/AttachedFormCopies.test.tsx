import React from 'react'
import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { AttachedFormCopies } from './AttachedFormCopies'
import { useCaseStore } from '../../store/useCaseStore'
import type { CaseItem } from '../../types/case'

afterEach(cleanup)

it('opens a separate editable copy and saves only that attachment', () => {
  const c = { no: 'COPY-UI', form: 'คบ.1', person: 'ทดสอบ', stage: 'staff_review', status: 'จัดทำ', owner: 'เจ้าหน้าที่', next: '', risk: 'ต่ำ', attachedFormCopies: [
    { id: 'a', formNo: 9, createdAt: '2026-10-27', fields: { เลขที่หนังสือ: '101' } },
    { id: 'b', formNo: 9, createdAt: '2026-10-27', fields: { เลขที่หนังสือ: '202' } },
  ] } as CaseItem
  useCaseStore.setState({ cases: [c] })
  render(<AttachedFormCopies caseItem={c} canEdit />)
  fireEvent.click(screen.getAllByRole('button', { name: 'เปิดแบบฟอร์ม' })[0])
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  fireEvent.change(screen.getByDisplayValue('101'), { target: { value: '303' } })
  const copies = useCaseStore.getState().getCase(c.no)!.attachedFormCopies!
  expect(copies[0].fields.เลขที่หนังสือ).toBe('303')
  expect(copies[1].fields.เลขที่หนังสือ).toBe('202')
})


it('removes only the selected attached copy and preserves workflow forms', () => {
  const c = { no: 'REMOVE-COPY', form: 'คบ.1', stage: 'staff_review', extraForms: [9], attachedFormCopies: [
    { id: 'remove-a', formNo: 9, createdAt: '2026-10-27', fields: {} },
    { id: 'keep-b', formNo: 9, createdAt: '2026-10-27', fields: { เลขที่หนังสือ: '202' } },
  ] } as CaseItem
  useCaseStore.setState({ cases: [c] })
  const view = render(<AttachedFormCopies caseItem={c} canEdit />)
  fireEvent.click(view.getByRole('button', { name: 'นำรายการแนบที่ 1 ออก' }))
  const updated = useCaseStore.getState().getCase(c.no)!
  expect(updated.attachedFormCopies?.map(copy => copy.id)).toEqual(['keep-b'])
  expect(updated.extraForms).toEqual([9])
})
