import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { canOperateHandoff } from '../../lib/protectionHandoff'
import { NOTICE_FIELD_LABELS, NOTICE_DETAIL_FIELDS, NOTICE_STATUS_LABELS, noticeForCase, noticeWorkerAllowed } from '../../lib/noticeDocuments'
import { Button } from '../common/Button'
import { showToast } from '../../lib/swal'

/** เฉพาะช่องที่เจ้าของงานยืนยันอนุญาต: ไม่ใช้ generic editor แก้ฉบับลงนาม */
export const ResultNoticeCard: React.FC<{ caseItem: CaseItem; onPendingDetailsChange?: (patch: Record<string, string>) => void }> = ({ caseItem, onPendingDetailsChange }) => {
  const document = noticeForCase(caseItem)
  const auth = useAuthStore()
  const complete = useCaseStore((s) => s.completeResultNotice)
  const check = useCaseStore((s) => s.checkResultNoticeReady)
  const [patch, setPatch] = useState<Record<string, string>>({})
  React.useEffect(() => { onPendingDetailsChange?.(patch) }, [patch, onPendingDetailsChange])
  const allowed = noticeWorkerAllowed(auth.currentRole, caseItem, auth.currentOfficerUserId)
  if (!document?.original) return null
  return <section className="ws-card p-4 md:p-5 space-y-3" data-testid="result-notice-card">
    <h3 className="font-bold text-navy">เติมรายละเอียดหนังสือแจ้งผลหลังลงนาม · คบ.{document.formNo}</h3>
    <p data-testid="result-notice-status" className="ws-readonly">{NOTICE_STATUS_LABELS[document.status]}</p>
    {!document.policy.confirmed && <p data-testid="notice-policy-pending" className="rounded-lg border border-gold bg-gold-soft p-3 text-warning">รอเจ้าของงานยืนยันรายการช่องที่เติมหลังลงนามได้ จึงยังไม่เปิดแก้ไขช่องใด รายการเสนอให้ยืนยัน: {NOTICE_DETAIL_FIELDS.map((key) => NOTICE_FIELD_LABELS[key]).join(' · ')}</p>}
    {allowed && document.policy.confirmed && !['ready', 'sent'].includes(document.status) && <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{document.policy.allowedAfterSigning.map((field) => <label className="ws-field" key={field}>
        <span className="ws-label">{NOTICE_FIELD_LABELS[field] || field}</span>
        <input data-testid={`notice-detail-${field}`} className="ws-input w-full" value={patch[field] ?? document.fields[field] ?? ''} onChange={(e) => setPatch({ ...patch, [field]: e.target.value })} />
      </label>)}</div>
      <Button data-testid="notice-save-details" onClick={() => { const ok = complete(caseItem.no, document.formNo, patch); showToast(ok ? 'เก็บรุ่นใหม่และประวัติการเติมรายละเอียดแล้ว' : 'ไม่มีการเปลี่ยนแปลงหรือไม่มีสิทธิเติมช่องที่ระบุ', ok ? 'success' : 'warning'); if (ok) setPatch({}) }}>บันทึกการเติมรายละเอียด</Button>
    </>}
    {allowed && document.status === 'completed' && <Button data-testid="notice-check-ready" onClick={() => { const ok = check(caseItem.no); showToast(ok ? 'ตรวจข้อมูลครบ — พร้อมส่งแจ้งผล' : 'ข้อมูลหรือสิทธิยังไม่ครบ', ok ? 'success' : 'warning') }}>ตรวจฉบับที่จะส่งและยืนยันพร้อมส่ง</Button>}
    {allowed && document.status === 'ready' && <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} hash="notice-dispatch" data-testid="notice-go-dispatch" className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-navy px-4 py-2 text-[0.88rem] font-semibold text-white hover:bg-navy-2">เลือกช่องทางและนำส่ง คบ.{document.formNo}</Link>}
    {!allowed && <p className="text-muted">ดูเอกสารได้ตามสิทธิ แต่ไม่มีสิทธิเติมรายละเอียดหรือยืนยันพร้อมส่ง</p>}
    {document.versions.length > 1 && <p className="text-warning font-semibold" data-testid="notice-post-sign-warning">มีการเติมรายละเอียดหลังลงนาม — ลายมือชื่อเดิมไม่รับรองเนื้อหาที่เติมใหม่</p>}
    <details data-testid="notice-audit-history"><summary className="cursor-pointer font-semibold text-navy">ประวัติการเปลี่ยนแปลง ({document.audit.length}) และการส่ง ({document.dispatches.length})</summary>
      {document.audit.map((entry) => <div key={entry.id} className="ws-readonly mt-2">รุ่น {entry.version} · {entry.at} · {entry.by}<ul>{entry.changes.map((change) => <li key={change.field}>{NOTICE_FIELD_LABELS[change.field] || change.field}: {change.before || '(ว่าง)'} → {change.after || '(ว่าง)'}</li>)}</ul></div>)}
      {document.dispatches.map((dispatch) => <div key={dispatch.id} className="ws-readonly mt-2">ส่งรุ่น {dispatch.snapshot.version} · {dispatch.at} · {dispatch.by} · {dispatch.channel} · {dispatch.tracking || '-'}<p>หลักฐานการส่ง: {dispatch.evidence.description}</p>{dispatch.receipt && <p>หลักฐานการรับ: {dispatch.receipt.documentName} · {dispatch.receipt.recipient} · {dispatch.receipt.receivedAt}</p>}</div>)}
    </details>
  </section>
}
