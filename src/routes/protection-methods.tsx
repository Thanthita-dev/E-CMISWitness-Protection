import React, { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Button } from '../components/common/Button'
import { useCaseStore } from '../store/useCaseStore'
import { SegmentedTabs } from '../components/common/SegmentedTabs'
import { useAuthStore } from '../store/useAuthStore'
import { CaseItem, ProtectionMethodNo } from '../types/case'
import { METHOD_LABELS, METHOD_STATUS_LABELS, hasConsent, summarizeEpisode } from '../lib/episode'
import { confirmBody, showConfirmAlert, showToast } from '../lib/swal'
import { ConsentDeclineCard, latestDeclineProposal } from '../components/protection/ConsentDeclineCard'
import { MethodPanel } from '../components/protection/MethodPanels'
import { MethodChoicePanel } from '../components/protection/MethodChoicePanel'
import { kb11Gate } from '../lib/formSignature'
import { methodWorkOpened } from '../lib/methodProgress'
import { visibleOperationCase } from '../lib/protectionHandoff'

export const Route = createFileRoute('/protection-methods')({
  component: ProtectionMethodsPage,
})

const STATUS_TONE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-700',
  preparing: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  blocked: 'bg-rose-100 text-rose-800',
  ended: 'bg-slate-200 text-slate-600',
}

/**
 * หน้า 08A — รับคำสั่งและแยกแนวทางคุ้มครอง
 *
 * ตรวจฐานคำสั่ง (คบ.5 กรณีเร่งด่วน หรือผลอนุมัติคำร้องหลัก) และความยินยอมของพยาน
 * ก่อนเปิดเส้นทางปฏิบัติแยกรายวิธี — อนุมัติหลายวิธีก็เปิดได้พร้อมกัน (WIT0813)
 */
const WORK_LABELS: Record<string, string> = { pending: 'รอดำเนินการ', awaiting: 'รอหนังสือตอบรับ', accepted: 'ตอบรับแล้ว', active: 'เริ่มปฏิบัติแล้ว', blocked: 'ติดขัด' }
function coordinationWorkStatus(c: CaseItem) {
  if (c.methodTracks?.some((t) => t.status === 'blocked')) return 'blocked'
  if (c.methodTracks?.some((t) => t.status === 'active')) return 'active'
  const response = c.methodTracks?.find((t) => t.method === 4)?.coordination?.responseStatus
  return response === 'accepted' ? 'accepted' : response === 'awaiting' ? 'awaiting' : 'pending'
}
function ProtectionMethodsPage() {
  const cases = useCaseStore((s) => s.cases)
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const [tab, setTab] = useState('all')
  const [query, setQuery] = useState('')
  const eligible = cases.filter((c) => visibleOperationCase(currentRole, c, currentOfficerUserId) &&
    (c.kb5Approved || c.activity7State === 'approved' || c.stage === 'method_operation' || c.stage === 'protection') &&
    !['terminated', 'transferred', 'withdrawn'].includes(c.stage))
  const rows = eligible.filter((c) => (tab === 'all' || coordinationWorkStatus(c) === tab) &&
    [c.no, c.person, c.methodTracks?.find((t) => t.method === 4)?.coordination?.agency].some((v) => v?.toLowerCase().includes(query.trim().toLowerCase())))
  const tabs = [{ key: 'all', label: 'งานทั้งหมด', count: eligible.length }, ...Object.entries(WORK_LABELS).map(([key, label]) => ({ key, label, count: eligible.filter((c) => coordinationWorkStatus(c) === key).length }))]
    .map((t) => ({ ...t, id: `method-work-${t.key}`, controls: 'method-work-panel' }))
  return <div className="space-y-5">
    <PageHeader eyebrow="งานคุ้มครองพยาน · ดำเนินการตามวิธีคุ้มครอง" title="งานดำเนินการตามวิธีคุ้มครอง" />
    <SegmentedTabs items={tabs} value={tab} onChange={setTab} ariaLabel="งานดำเนินการตามวิธีคุ้มครอง" />
    <label className="ws-card p-4 block"><span className="ws-label">ค้นหางาน</span><input type="search" className="ws-input w-full" placeholder="เลขคำร้อง ชื่อพยาน หรือสถานีตำรวจที่ประสาน" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
    <section id="method-work-panel" role="tabpanel" aria-labelledby={`method-work-${tab}`} className="ws-card overflow-hidden">
      <div className="border-b border-line p-4 font-semibold text-navy">พบ {rows.length} เคส</div>
      <div className="overflow-x-auto"><table className="ws-table text-sm">
        <thead><tr><th>เลขคำร้อง / พยาน</th><th>วิธีคุ้มครอง</th><th>หน่วยงานที่ประสาน</th><th>สถานะงาน</th><th>การดำเนินการ</th></tr></thead>
        <tbody>{rows.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-muted">ไม่มีงานในสถานะนี้</td></tr> : rows.map((c) => <tr key={c.no}>
          <td><strong className="text-navy">{c.no}</strong><p>{c.person}</p></td>
          <td>{(c.orderedMethods || c.approvedMethods || []).map((m) => `วิธีที่ ${m}`).join(', ') || 'รอเปิดเส้นทาง'}</td>
          <td>{c.methodTracks?.find((t) => t.method === 4)?.coordination?.agency || '—'}</td>
          <td><span className="font-semibold text-navy">{WORK_LABELS[coordinationWorkStatus(c)]}</span></td>
          <td><Link to="/protection-method-work" search={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white">เปิดงาน</Link></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>
}

export const CaseMethodPanel: React.FC<{ caseItem: CaseItem; readOnly?: boolean }> = ({ caseItem, readOnly }) => {
  const { recordConsent } = useCaseStore()

  const episode = summarizeEpisode(caseItem.episode)
  /** กรณีเร่งด่วนใช้ความยินยอมใน คบ.5 แทน คบ.11 ได้ (note0801) */
  const consentRef = caseItem.urgent && !caseItem.kb11Signed ? 'kb5' : 'kb11'
  const consented = hasConsent(caseItem, consentRef)
  /** แยกงานชั่วคราวออกแล้ว (temporaryProtection) = งานในหน้านี้เป็นของคำร้องหลัก ใช้ประตูเส้นทางปกติ */
  const isUrgentPath = Boolean(caseItem.urgent && caseItem.kb5Approved && !caseItem.temporaryProtection)
  const orderBase = isUrgentPath ? 'คบ.5 (คำสั่งชั่วคราว)' : 'ผลอนุมัติคำร้องหลัก'
  /**
   * TC-062 — เส้นทางคำร้องหลักต้องมี คบ.9 และ คบ.11 ลงนามครบก่อนเปิดเส้นทางปฏิบัติ
   * ความยินยอมอย่างเดียว (consented) ไม่พอ เพราะ ณ จุดนี้ยังไม่มีหลักฐานว่าแจ้งผล (คบ.9)
   * และทำข้อตกลง (คบ.11) เสร็จจริง — กรณีเร่งด่วนใช้ความยินยอมใน คบ.5 แทนได้ ไม่ต้องเช็คนี้
   */
  const missingOrderDocs: string[] = []
  if (!isUrgentPath) {
    if (!caseItem.kb9Signed) missingOrderDocs.push('คบ.9')
    if (!caseItem.kb11Signed) missingOrderDocs.push('คบ.11')
  }
  const orderGateBlocked = missingOrderDocs.length > 0
  const orderGateReason = orderGateBlocked
    ? `คำร้องหลักต้องมี ${missingOrderDocs.join(' และ ')} ลงนามครบก่อนจึงจะเปิดเส้นทางปฏิบัติได้`
    : undefined
  /** มีข้อเสนอตาม WIT0812 ค้างอยู่ในลำดับชั้น — ระหว่างนี้ยังตัดสินความยินยอมซ้ำไม่ได้ */
  const declineProposal = latestDeclineProposal(caseItem)
  const declinePending = declineProposal?.stage === 'supervisor' || declineProposal?.stage === 'director'

  /**
   * เจ้าหน้าที่ กอท. เลือกแนวทางตอนเปิดงาน (ตาม คบ.6 หรือเลือกใหม่) ก่อนเข้าหน้าปฏิบัติรายวิธี
   * เคสที่เริ่มทำงานในวิธีใดไปแล้วก่อนมีขั้นนี้ ถือว่าเลือกแล้ว ไม่ต้องเลือกซ้ำ
   */
  const choiceDone = methodWorkOpened(caseItem)

  /** WIT0809 แขนง "ยินยอม" → WIT0810/WIT0811 ลงนามและเก็บฉบับลงนาม */
  const handleConsent = () => {
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกว่าพยานยินยอมและลงนามครบ?',
      html: confirmBody(
        `บันทึกความยินยอมตาม ${consentRef === 'kb11' ? 'คบ.11' : 'คบ.5'} ของพยาน`,
        [
          ['พยาน/ผู้ได้รับความคุ้มครอง', caseItem.person],
          ['ฐานคำสั่ง', orderBase],
        ],
        'ปลดประตูความยินยอม ทำให้เริ่มปฏิบัติตามวิธีที่อนุมัติได้ และบันทึกผู้ลงนามกับเวลาไว้ในแฟ้ม'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันว่าพยานยินยอม',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      recordConsent(caseItem.no, { ref: consentRef, consented: true, by: caseItem.person })
      showToast('บันทึกความยินยอมเรียบร้อยแล้ว')
    })
  }

  if (caseItem.appealResolution?.outcome === 'overturn' && caseItem.appealAgainst !== 'kb17' && !caseItem.appealKb6Version) {
    return <section className="ws-card p-5 space-y-4" data-testid="appeal-kb6-revision-task">
      <h2 className="font-bold text-navy">{caseItem.no} · {caseItem.person}</h2>
      <p className="text-ink">จัดทำ คบ.6 รุ่นใหม่ตามมติอุทธรณ์</p>
      {!readOnly && <Link to="/form/$formId" params={{ formId: '6' }} search={{ caseNo: caseItem.no }} onClick={() => useCaseStore.getState().prepareAppealKb6Revision(caseItem.no)} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-blue">จัดทำ คบ.6 v{(caseItem.kb6Version || 1) + 1}</Link>}
    </section>
  }

  // A pending agreement is not a refusal. Show the document task before method selection.
  if (!isUrgentPath && (!caseItem.kb11Signed || !kb11Gate(caseItem).unlocked || !consented)) {
    const noticeReady = kb11Gate(caseItem).unlocked
    return <section className="ws-card p-5 space-y-4" data-testid="method-documents-pending">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div><p className="ws-kicker">งานตามวิธีคุ้มครอง</p><h2 className="text-[1.1rem] font-bold text-navy">{caseItem.no} · {caseItem.person}</h2></div>
        <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-3 py-2 font-semibold text-navy hover:bg-soft">เปิดแฟ้ม</Link>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 p-4">
        <div>
          <h3 className="font-semibold text-navy">{noticeReady ? 'รอข้อตกลง คบ.11 ลงนามครบ' : 'รอแจ้งผล คบ.9 และบันทึกการรับ'}</h3>
          <p className="mt-1 text-[0.85rem] text-muted">{noticeReady ? 'เปิดแบบฟอร์มเพื่อจัดทำข้อตกลงและลงนาม' : kb11Gate(caseItem).reason}</p>
        </div>
        {!readOnly && <Link to="/form/$formId" params={{ formId: noticeReady ? '11' : '9' }} search={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-blue">{noticeReady ? 'เปิด คบ.11' : 'เปิด คบ.9'}</Link>}
      </div>
      {!readOnly && !consented && <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[0.85rem] font-semibold text-muted">พยานไม่ยินยอม</summary>
        <div className="mt-3"><ConsentDeclineCard caseItem={caseItem} consentRef={consentRef} /></div>
      </details>}
    </section>
  }

  if (!readOnly && !choiceDone && consented && !orderGateBlocked && !declinePending) {
    return <MethodChoicePanel caseItem={caseItem} orderBase={orderBase} />
  }

  const method4Track = caseItem.methodTracks?.find((track) => track.method === 4)
  const onlyMethod4 = caseItem.approvedMethods?.length === 1 && caseItem.approvedMethods[0] === 4
  if (!readOnly && choiceDone && onlyMethod4 && method4Track && consented &&
      (isUrgentPath || (caseItem.kb11Signed && kb11Gate(caseItem).unlocked))) {
    return <section className="ws-card p-5 space-y-4" data-testid="automatic-method4-workspace">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div><p className="ws-kicker">ดำเนินการตามวิธีที่ 4</p><h2 className="text-[1.1rem] font-bold text-navy">{caseItem.no} · {caseItem.person}</h2></div>
        <Link to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-3 py-2 font-semibold text-navy hover:bg-soft">เปิดแฟ้ม</Link>
      </header>
      <MethodPanel caseItem={caseItem} track={method4Track} coordinationOnly={method4Track.coordination?.responseStatus === 'accepted'} />
    </section>
  }

  return (
    <section className="ws-card p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-3">
        <div>
          <p className="ws-kicker">งานของเจ้าหน้าที่คุ้มครอง</p>
          <h3 className="text-base font-bold text-navy">
            {caseItem.no} · {caseItem.person}
          </h3>
          <p className="text-[0.8rem] text-muted">
            ฐานคำสั่ง: {orderBase}
            {caseItem.decisionNumber ? ` · เลขที่ ${caseItem.decisionNumber}` : ''}
            {episode.phaseKind ? ` · Phase ${episode.phaseKind}` : ''}
            {caseItem.methodChoice ? ` · แนวทาง: ${caseItem.methodChoice.mode === 'new' ? 'เลือกใหม่' : `ดำเนินการตาม ${caseItem.methodChoice.mode === 'kb4' ? 'คบ.4' : 'คบ.6'}`}` : ''}
          </p>
        </div>
        <Link
          to="/dossier/$caseNo"
          params={{ caseNo: caseItem.no }}
          className="inline-flex min-h-[38px] items-center rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
        >
          เปิดแฟ้ม
        </Link>
      </div>

      {/* ความยินยอมของพยาน — ประตูก่อนเริ่มวิธีใด ๆ */}
      <div
        className={`rounded-xl border p-3.5 text-sm leading-relaxed ${
          consented ? 'border-emerald-200 bg-emerald-50/60 text-emerald-900' : 'border-amber-300 bg-amber-50/70 text-amber-900'
        }`}
      >
        <div className="font-bold mb-1">
          <i className={`fa-solid ${consented ? 'fa-circle-check' : 'fa-triangle-exclamation'} mr-1.5`} />
          ความยินยอมตาม {consentRef === 'kb11' ? 'คบ.11' : 'คบ.5'}
          {consented ? ' — ลงนามครบแล้ว' : ' — ยังไม่บันทึก'}
        </div>
        {!consented && !readOnly && !declinePending && (
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              onClick={handleConsent}
              data-testid="consent-agree"
              className="min-h-[44px] rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
            >
              บันทึกว่าพยานยินยอมและลงนามครบ
            </Button>
          </div>
        )}
      </div>

      {/* WIT0812 — แขนง "ไม่ยินยอม" ของประตู WIT0809 */}
      {!consented && !readOnly && <details className="border-t border-line pt-3">
        <summary className="cursor-pointer text-[0.85rem] font-semibold text-muted">พยานไม่ยินยอม</summary>
        <div className="mt-3"><ConsentDeclineCard caseItem={caseItem} consentRef={consentRef} /></div>
      </details>}

      {orderGateBlocked && (
        <p className="flex items-start gap-1.5 text-[0.8rem] font-bold text-warning">
          <i className="fa-solid fa-lock mt-0.5" />
          <span>{orderGateReason}</span>
        </p>
      )}

      {/* เส้นทางที่เปิดอยู่ */}
      {(caseItem.methodTracks || []).length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {(caseItem.methodTracks || []).map((t) => (
            <Link
              key={t.method}
              to="/protection-method/$method"
              params={{ method: String(t.method) }}
              search={{ caseNo: caseItem.no }}
              className="rounded-xl border border-slate-200 bg-white p-3.5 hover:border-blue hover:bg-blue-50/40 transition"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-navy">{METHOD_LABELS[t.method]}</span>
                <span className={`rounded-full px-[0.58rem] py-[0.28rem] text-[0.74rem] font-semibold ${STATUS_TONE[t.status]}`}>
                  {METHOD_STATUS_LABELS[t.status]}
                </span>
              </div>
              {t.blockedReason && <div className="mt-1 text-[0.8rem] text-rose-700">{t.blockedReason}</div>}
              {t.startedAt && <div className="mt-1 text-[0.8rem] text-muted">เริ่มจริง {t.startedAt.slice(0, 10)}</div>}
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
