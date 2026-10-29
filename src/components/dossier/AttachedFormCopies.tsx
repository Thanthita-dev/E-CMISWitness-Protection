import { DocumentViewButton } from '../common/DocumentViewButton'
import React from 'react'
import { Button } from '../common/Button'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import { FORMS_CATALOG } from '../../lib/constants'
import { useCaseStore } from '../../store/useCaseStore'
import type { CaseItem } from '../../types/case'

/** เอกสารแนบแต่ละครั้งมีข้อมูลของตนเอง ไม่ใช้ร่างหรือลายมือชื่อร่วมกับฉบับในกระบวนงาน */
export function AttachedFormCopies({ caseItem, canEdit }: { caseItem: CaseItem; canEdit: boolean }) {
  const [opened, setOpened] = React.useState<string | null>(null)
  const copies = caseItem.attachedFormCopies || []
  const active = copies.find(copy => copy.id === opened)
  const update = (key: string, value: any) => {
    if (!active || !canEdit) return
    const store = useCaseStore.getState()
    const latest = store.getCase(caseItem.no)
    if (!latest) return
    store.updateCase(caseItem.no, { attachedFormCopies: latest.attachedFormCopies?.map(copy => copy.id === active.id ? { ...copy, fields: { ...copy.fields, [key]: value } } : copy) })
  }
  const remove = (id: string) => {
    if (!canEdit) return
    const store = useCaseStore.getState()
    const latest = store.getCase(caseItem.no)
    if (!latest) return
    store.updateCase(caseItem.no, { attachedFormCopies: (latest.attachedFormCopies || []).filter(copy => copy.id !== id) })
    if (opened === id) setOpened(null)
  }
  const context = { no: caseItem.no, person: caseItem.person, form: caseItem.form, orgUnitId: caseItem.orgUnitId } as CaseItem
  return <div className="space-y-2" data-testid="attached-form-copies">
    {copies.map((copy, index) => {
      const meta = FORMS_CATALOG.find(form => form.n === copy.formNo)
      return <div key={copy.id} data-testid={`attached-form-${copy.id}`} className="rounded-xl border border-[#e6cf86] bg-[#fdf8e7] px-3 py-2">
        <div className="grid min-h-[4rem] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue"><i className="fa-solid fa-file-lines" aria-hidden="true" /></span>
            <div className="min-w-0"><strong className="block text-[0.88rem] font-semibold text-navy">{meta?.t || meta?.code}</strong><p className="text-xs text-muted">รายการแนบที่ {index + 1} · {new Date(copy.createdAt).toLocaleString('th-TH')}</p></div>
          </div>
          <span className="ws-status justify-self-start sm:justify-self-center">ร่าง</span>
          <div className="flex items-center justify-end gap-2">
            <>{canEdit ? <Button variant="secondary" size="md" onClick={() => setOpened(copy.id)}><i className="fa-solid fa-pen-to-square" aria-hidden="true" />เปิดแบบฟอร์ม</Button> : <DocumentViewButton onClick={() => setOpened(copy.id)} />}</>
            {canEdit && <Button variant="ghost" size="icon" title="นำรายการแนบออก" aria-label={`นำรายการแนบที่ ${index + 1} ออก`} onClick={() => remove(copy.id)}><i className="fa-solid fa-xmark" aria-hidden="true" /></Button>}
          </div>
        </div>
      </div>
    })}
    {active && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" aria-label="เอกสารแนบฉบับแยก" className="flex max-h-[95vh] w-full max-w-4xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="font-bold text-navy">{FORMS_CATALOG.find(f => f.n === active.formNo)?.code} · เอกสารแนบฉบับแยก</h2><p className="text-xs text-muted">{canEdit ? 'แก้ไขบนกระดาษและบันทึกอัตโนมัติ' : 'ดูเอกสาร'} · ข้อมูลแยกจากฉบับในกระบวนงาน</p></div><Button variant="secondary" onClick={() => setOpened(null)}>ปิด</Button></div>
        <div className="min-h-0 overflow-auto p-3"><FormPaperViewer formId={active.formNo} caseNo={caseItem.no} versionSnapshot={{ fields: active.fields, signatures: {} }} snapshotCase={context} onSnapshotChange={update} editable={canEdit} bare preview /></div>
      </div>
    </div>}
  </div>
}
