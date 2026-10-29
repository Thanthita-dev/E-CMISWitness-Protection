import React from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { REFERRAL_DOCUMENTS, hasReferralDocument, referralFormNo } from '../../lib/referralDocumentIdentity'
import { canEditReferralDocument, ensureReferralDocument, type ReferralDocumentMeta } from '../../lib/referralDocuments'
import { Button } from '../common/Button'

export function ReferralDocumentsPanel({ caseItem, prepare = false }: { caseItem: CaseItem; prepare?: boolean }) {
  const forms = useFormDraftStore()
  const role = useAuthStore(s => s.currentRole)
  const navigate = useNavigate()
  const [filter, setFilter] = React.useState('')
  const attached = REFERRAL_DOCUMENTS.filter(d => hasReferralDocument(caseItem, d.id))
  if (!prepare && !attached.length) return null
  return <section className="space-y-2" aria-label="ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ" data-testid="referral-documents-panel">
    {prepare && <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-base font-bold text-navy">ส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ</h3>
      <select aria-label="ประเภทหนังสือส่งต่อกรมคุ้มครองสิทธิฯ" className="ws-input max-w-full sm:max-w-80" value={filter} onChange={e => setFilter(e.target.value)}><option value="">หนังสือประกอบทั้งหมด</option>{REFERRAL_DOCUMENTS.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
    </div>}
    {(prepare ? REFERRAL_DOCUMENTS : attached).filter(d => !filter || filter === d.id).map(d => {
      const exists = hasReferralDocument(caseItem, d.id)
      const fields = selectCaseDraft(forms, referralFormNo(caseItem, d.id), caseItem.no)
      const meta = fields._referralMeta as ReferralDocumentMeta | undefined
      const editable = canEditReferralDocument(caseItem, d.id)
      const canSign = d.id === 'chairman-signature' && ['secretary', 'admin'].includes(role) && ['secretary_review', 'committee_pending'].includes(caseItem.article14?.step || '') && !caseItem.article14?.secretarySignature && !caseItem.sarabanDispatch
      const signed = d.id === 'chairman-signature' && Boolean(caseItem.article14?.secretarySignature)
      const status = !exists ? 'ยังไม่ได้จัดทำ' : editable ? 'ร่างเอกสาร' : ['letter_sent', 'reply_received', 'handover', 'completed'].includes(caseItem.article14?.step || '') ? 'นำส่งแล้ว' : signed ? 'ลงนามแล้ว' : 'เอกสารในกระบวนงาน'
      const sent = ['letter_sent', 'reply_received', 'handover', 'completed'].includes(caseItem.article14?.step || '')
      return <article key={d.id} className={`rounded-xl border px-3 py-2 transition ${sent || signed ? 'border-[#9fd0b4] bg-[#eef8f2]' : 'border-[#e6cf86] bg-[#fdf8e7]'}`} data-testid={`referral-row-${d.id}`} data-document-id={meta?.id}>
        <div className="grid min-h-[4rem] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue"><i className="fa-solid fa-file-lines" aria-hidden="true" /><span className="sr-only">หนังสือประกอบ</span></span>
            <div className="min-w-0">
              <strong className="block text-[0.88rem] font-semibold text-navy">{d.title}</strong>
            </div>
          </div>
          <div className="flex min-w-0 sm:justify-center"><span className={`ws-status text-center ${sent || signed ? 'success' : ''}`}>{status}</span></div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {exists ? <Link to="/forms" search={{ additional: d.id, caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"><i className={`fa-solid ${editable || canSign ? 'fa-pen-to-square' : 'fa-eye'} text-xs`} aria-hidden="true" />{editable || canSign ? 'เปิดแบบฟอร์ม' : 'ดูเอกสาร'}</Link>
              : editable && <Button variant="primary" size="md" onClick={() => { if (ensureReferralDocument(caseItem.no, d.id) !== null) void navigate({ to: '/forms', search: { additional: d.id, caseNo: caseItem.no } }) }}>แนบเข้าแฟ้ม</Button>}
          </div>
        </div>
      </article>
    })}
  </section>
}
