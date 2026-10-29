import React from 'react'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { createNoticeDraft, signNoticeSnapshot, NOTICE_DETAIL_FIELDS, NOTICE_FIELD_LABELS } from '../../lib/noticeDocuments'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import { DocumentWorkspace, DocumentPageHead, DocumentActionBar, type DocumentViewMode } from '../forms/DocumentWorkspace'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { showToast } from '../../lib/swal'

export const AppealKb10Workspace: React.FC<{ caseItem: CaseItem; onBack: () => void }> = ({ caseItem, onBack }) => {
  const auth = useAuthStore()
  const document = caseItem.appealKb10!
  const [mode, setMode] = React.useState<DocumentViewMode>('document')
  const [fields, setFields] = React.useState({ ...document.fields, 'แจ้งผลอุทธรณ์': 'true' } as Record<string, string>)
  const [signOpen, setSignOpen] = React.useState(false)
  const canSign = ['secretary', 'admin'].includes(auth.currentRole) && !document.snapshot
  const canEdit = !document.snapshot && (canSign || (['officer', 'case_owner'].includes(auth.currentRole) && auth.currentOfficerUserId === caseItem.assignedOfficerUserId))
  const update = (key: string, value: string) => setFields((old) => ({ ...old, [key]: value }))
  const save = () => {
    if (!canEdit) return
    useCaseStore.getState().updateCase(caseItem.no, { appealKb10: { ...document, fields } })
    showToast('บันทึก คบ.10 ฉบับแจ้งผลอุทธรณ์แล้ว')
  }
  const editableFields = [...NOTICE_DETAIL_FIELDS, 'สาระสำคัญ']
  return <div className="space-y-3">
    <DocumentPageHead title="คบ.10 หนังสือแจ้งคำสั่งไม่ให้พยานได้รับการคุ้มครอง" meta={`แฟ้ม ${caseItem.no} · ฉบับแจ้งผลอุทธรณ์`} status={document.snapshot ? 'ลงนามแล้ว' : 'รอลงนาม'} actions={<Button size="md" variant="secondary" onClick={() => window.print()}>พิมพ์เอกสาร A4</Button>} />
    <DocumentWorkspace mode={mode} onModeChange={canEdit ? setMode : undefined}>
      {mode === 'form' && canEdit ? <div className="ws-card space-y-3 p-5">{editableFields.map((key) => <label key={key} className="block"><span className="ws-label">{NOTICE_FIELD_LABELS[key] || key}</span><textarea className="ws-input" rows={key === 'สาระสำคัญ' ? 4 : 1} value={fields[key] || ''} onChange={(event) => update(key, event.target.value)} /></label>)}</div> : <FormPaperViewer formId={10} caseNo={caseItem.no} bare printable editable={canEdit} noticeSnapshot={document.snapshot} noticeDraftPreview={document.snapshot ? undefined : { fields, caseContext: caseItem, editableFields, onFieldChange: canEdit ? update : undefined }} />}
    </DocumentWorkspace>
    <DocumentActionBar back={<Button size="md" variant="secondary" onClick={onBack}>กลับแฟ้มคำร้อง</Button>}>
      {canEdit && <Button size="md" variant="secondary" onClick={save}>บันทึกร่าง คบ.10</Button>}
      {canSign && <Button size="md" onClick={() => { if (!fields['สาระสำคัญ']?.trim()) { showToast('กรุณาระบุเหตุผล', 'warning'); return }; setSignOpen(true) }}>ลงนาม คบ.10</Button>}
    </DocumentActionBar>
    <SignatureModal isOpen={signOpen} title="ลงนาม คบ.10 ฉบับแจ้งผลอุทธรณ์" signerRole="เลขาธิการ ป.ป.ท." defaultSignerName={auth.getCurrentUserAccount()?.name || ''} onClose={() => setSignOpen(false)} onConfirm={(name, image) => {
      if (!canSign) return
      const signed = signNoticeSnapshot(createNoticeDraft(10, caseItem, document.createdAt, name, fields), caseItem, new Date().toISOString(), name, caseItem.appealResolution?.resolutionNo || '', fields['สาระสำคัญ'])
      useCaseStore.getState().updateCase(caseItem.no, { appealKb10: { ...document, fields: signed.fields, snapshot: { ...signed.original!, signatureImage: image } } })
      setSignOpen(false)
      showToast('ลงนาม คบ.10 ฉบับแจ้งผลอุทธรณ์แล้ว')
    }} />
  </div>
}
