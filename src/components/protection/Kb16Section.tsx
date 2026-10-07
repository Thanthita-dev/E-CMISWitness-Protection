import React, { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'
import { formatThaiDate, parseAnyDate } from '../../lib/utils'
import { showToast } from '../../lib/swal'

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

/**
 * ขั้น 11D (ส่วนแรก) — รับเรื่องจาก 11C พิจารณาอนุมัติ แล้วออกคำสั่งยุติ คบ.16
 * WIT1135-WIT1140
 *
 * ด่านที่ห้ามข้าม: WIT1136 ต้องมีผลพิจารณาก่อนจึงจะร่าง คบ.16 ได้
 * และ WIT1139 ห้ามเริ่มสถานะยุติก่อนมีคำสั่งที่ลงนาม
 */
export const Kb16Section: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const navigate = useNavigate()
  const { decideTerminationApproval, signKb16, recordOperationStopped } = useCaseStore()
  const kb16 = caseItem.kb16
  const approval = caseItem.terminationApproval

  const [stoppedAt, setStoppedAt] = useState(todayIso())
  const [decisionNote, setDecisionNote] = useState('')

  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isAuthority = ['secretary', 'director', 'admin'].includes(role)
  const endorsed = caseItem.kb15?.status === 'endorsed'

  if (!endorsed && !kb16) return null

  const effective = parseAnyDate(/^\d{4}-\d{2}-\d{2}$/.test(kb16?.effectiveAt || '') ? `${kb16?.effectiveAt}T00:00:00+07:00` : kb16?.effectiveAt)
  const inForce = Boolean(kb16?.signedAt && effective && effective.getTime() <= Date.now())

  return (
    <SectionCard
      title="คำสั่งยุติการคุ้มครอง · คบ.16"
      hint="จัดทำคำสั่ง → เสนอลงนาม → แจ้งพยานด้วย คบ.17"
    >
      {/* ---------- WIT1136 — ผู้มีอำนาจพิจารณาก่อน จึงจะร่าง คบ.16 ได้ ---------- */}
      {!approval && isAuthority && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <span className="ws-label">อนุมัติให้ยุติหรือไม่</span>
          <input
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="ความเห็นประกอบผลพิจารณา"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                decideTerminationApproval(caseItem.no, true, decisionNote || 'อนุมัติให้ยุติการคุ้มครองตามที่เสนอ')
                setDecisionNote('')
                showToast('อนุมัติให้ยุติ — จัดทำร่าง คบ.16 ได้')
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              อนุมัติให้ยุติ
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!decisionNote.trim()) {
                  showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'warning')
                  return
                }
                decideTerminationApproval(caseItem.no, false, decisionNote)
                setDecisionNote('')
                showToast('บันทึกไม่อนุมัติ — คุ้มครองต่อภายใต้คำสั่งเดิม')
              }}
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              ไม่อนุมัติ
            </Button>
          </div>
        </div>
      )}

      {/* ---------- WIT1137 — ไม่อนุมัติ: คุ้มครองต่อและกลับแท็บ 10 ---------- */}
      {approval && !approval.approved && (
        <div className="flex flex-wrap items-center gap-2 ws-callout text-[0.85rem] leading-relaxed">
          <span>
            <i className="fa-solid fa-rotate-left mr-1.5" />
            ไม่อนุมัติให้ยุติเมื่อ {approval.decidedAt} โดย {approval.decidedBy} · {approval.note}
          </span>
          <Link
            to="/protection-monitor"
            search={{ caseNo: caseItem.no }}
            className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-[0.8rem] font-bold text-amber-800 hover:bg-amber-50 transition"
          >
            กลับไปรายงานผลการคุ้มครอง · คุ้มครองต่อภายใต้คำสั่งเดิม
          </Link>
        </div>
      )}

      {approval?.approved && !kb16 && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-soft p-5">
          <div>
            <span className="ws-status success">อนุมัติให้จัดทำคำสั่งแล้ว</span>
            <p className="mt-3 font-semibold text-navy">คบ.16 · คำสั่งยุติการให้ความคุ้มครองพยาน</p>
            <p className="mt-1 text-sm text-muted">กรอกเลขคำสั่ง เหตุยุติ และวันที่ในแบบฟอร์ม</p>
          </div>
          {isOfficer ? <Button type="button" onClick={() => navigate({ to: '/form/$formId', params: { formId: '16' }, search: { caseNo: caseItem.no, from: 'termination' } })}>จัดทำ คบ.16</Button>
            : <span className="text-sm text-muted">รอผู้รับผิดชอบจัดทำ คบ.16</span>}
        </div>
      )}

      {/* ---------- WIT1140 — สามวันที่ที่ต้องบันทึกแยกกัน ---------- */}
      {kb16 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-2">
          <div>
            <strong>คำสั่งที่ {kb16.orderNo}</strong> — {kb16.reason}
          </div>
          {kb16.backdatedReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-2 text-[0.8rem] text-rose-800">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />
              วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง — เหตุผล: {kb16.backdatedReason}
            </div>
          )}
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-[0.8rem] text-muted">วันที่ออกคำสั่ง</dt>
              <dd className="font-bold text-navy-deep">{formatThaiDate(kb16.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[0.8rem] text-muted">วันที่มีผล</dt>
              <dd className="font-bold text-navy-deep">{formatThaiDate(kb16.effectiveAt)}</dd>
            </div>
            <div>
              <dt className="text-[0.8rem] text-muted">วันหยุดปฏิบัติจริง</dt>
              <dd className="font-bold text-navy-deep">
                {kb16.operationStoppedAt ? formatThaiDate(kb16.operationStoppedAt) : 'ยังไม่บันทึก'}
              </dd>
            </div>
          </dl>
          <div>
            {kb16.signedAt ? (
              <span className="font-bold text-emerald-700">
                ลงนามแล้วเมื่อ {kb16.signedAt} โดย {kb16.signedBy}
                {kb16.locked ? ' · ล็อกฉบับลงนาม' : ''}
                {!inForce && ' — ยังไม่ถึงวันที่มีผล การคุ้มครองยังดำเนินอยู่'}
              </span>
            ) : (
              <span className="font-bold text-amber-700">
                ยังไม่ลงนาม — การคุ้มครองยังไม่สิ้นสุด
              </span>
            )}
          </div>
        </div>
      )}

      {kb16 && !kb16.signedAt && kb16.status !== 'submitted' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <span className="text-sm text-muted">ร่าง คบ.16 · ยังไม่เสนอลงนาม</span>
          {isOfficer && <Button type="button" onClick={() => navigate({ to: '/form/$formId', params: { formId: '16' }, search: { caseNo: caseItem.no, from: 'termination' } })}>แก้ไขและส่ง คบ.16</Button>}
        </div>
      )}

      {kb16?.status === 'submitted' && !kb16.signedAt && (
        <p className="text-[0.8rem] text-blue-700">
          <i className="fa-solid fa-paper-plane mr-1" />
          ส่งให้อนุมัติเมื่อ {kb16.submittedAt} โดย {kb16.submittedBy} — รอผู้มีอำนาจลงนาม
        </p>
      )}

      {/* ---------- WIT1139 — ลงนาม ---------- */}
      {kb16 && !kb16.signedAt && kb16.status === 'submitted' && isAuthority && (
        <Button
          type="button"
          onClick={() => {
            signKb16(caseItem.no)
            showToast('ลงนามคำสั่ง คบ.16 และล็อกฉบับลงนามแล้ว')
          }}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          <i className="fa-solid fa-signature mr-1.5" />
          ลงนามคำสั่ง คบ.16
        </Button>
      )}

      {kb16?.signedAt && !kb16.operationStoppedAt && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
          <label className="block w-44">
            <span className="block text-[0.8rem] text-muted mb-1">วันหยุดปฏิบัติจริง</span>
            <input
              type="date"
              value={stoppedAt}
              onChange={(e) => setStoppedAt(e.target.value)}
              className="ws-input w-full"
            />
            <ThaiDateHint value={stoppedAt} testId="kb16-stopped-be" />
          </label>
          <Button
            type="button"
            onClick={() => {
              recordOperationStopped(caseItem.no, stoppedAt)
              showToast('บันทึกวันหยุดปฏิบัติจริงแล้ว')
            }}
            className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
          >
            บันทึกวันหยุดปฏิบัติจริง
          </Button>
        </div>
      )}
    </SectionCard>
  )
}
