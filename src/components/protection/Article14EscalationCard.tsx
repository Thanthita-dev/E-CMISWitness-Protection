import React, { useState } from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'
import { Article14EscalationProposal, CaseItem } from '../../types/case'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

const STAGE_LABEL: Record<Article14EscalationProposal['stage'], string> = {
  supervisor: 'รอ ผบช.ชั้นต้น พิจารณา',
  director: 'ผบช.ชั้นต้นเห็นชอบแล้ว · รอ ผอ.สำนัก/กอง อนุมัติ',
  approved: 'ผอ.สำนัก/กอง อนุมัติแนวทางใหม่แล้ว',
  returned: 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไข',
}

const STAGE_TONE: Record<Article14EscalationProposal['stage'], string> = {
  supervisor: 'border-amber-300 bg-amber-50/70 text-amber-900',
  director: 'border-blue-300 bg-blue-50/70 text-blue-900',
  approved: 'border-emerald-300 bg-emerald-50/70 text-emerald-900',
  returned: 'border-rose-300 bg-rose-50/70 text-rose-900',
}

export const latestArticle14Escalation = (caseItem: CaseItem): Article14EscalationProposal | undefined => {
  const list = caseItem.article14EscalationProposals || []
  return list[list.length - 1]
}

/**
 * WIT0860 แขนง — กรมคุ้มครองสิทธิและเสรีภาพแจ้งว่าดำเนินการตามข้อ 14 ไม่ได้
 *
 * บันทึกครั้งแรก (เหตุผล/แนวทางที่เสนอ) เกิดจากปุ่ม "ดำเนินการไม่ได้" ในหน้า article14.tsx เอง
 * การ์ดนี้คือส่วน "เสนอผู้มีอำนาจพิจารณาแนวทางใหม่" ซึ่งต้องเป็นงานจริงในคิวของ
 * ผบช.ชั้นต้น → ผอ.สำนัก/กอง (ลำดับเดียวกับ WIT0812 / WIT0845) ไม่ใช่ toast ที่เด้งแล้วหายไป
 *
 * ระหว่างที่ข้อเสนอนี้ค้างอยู่ทุกขั้น มาตรการคุ้มครองเดิมของ ป.ป.ท. ยังคงมีผลอยู่ — ไม่ถูกยุติ —
 * เพื่อไม่ให้การคุ้มครองขาดช่วงโดยไม่มีผู้รับผิดชอบ
 */
export const Article14EscalationCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { recordArticle14DeliveryFailure, reviewArticle14Escalation } = useCaseStore()
  const { currentRole } = useAuthStore()

  const proposal = latestArticle14Escalation(caseItem)
  const [reason, setReason] = useState('')
  const [approach, setApproach] = useState('')
  const [note, setNote] = useState('')
  const [decisionNote, setDecisionNote] = useState('')

  const isOfficer = currentRole === 'officer' || currentRole === 'case_owner' || currentRole === 'admin'
  const pendingProposal =
    proposal && (proposal.stage === 'supervisor' || proposal.stage === 'director') ? proposal : undefined
  const canDecide =
    pendingProposal &&
    ((pendingProposal.stage === 'supervisor' && (currentRole === 'supervisor' || currentRole === 'admin')) ||
      (pendingProposal.stage === 'director' && (currentRole === 'director' || currentRole === 'admin')))

  /** เสนอแนวทางใหม่ได้เมื่อรอบก่อนถูกส่งคืนมาแก้ (การเสนอครั้งแรกอยู่ในปุ่ม "ดำเนินการไม่ได้" ของหน้า article14.tsx) */
  const canPropose = isOfficer && proposal?.stage === 'returned'

  if (!proposal) return null

  const handlePropose = () => {
    if (!reason.trim() || !approach.trim()) {
      showToast('กรุณาระบุเหตุผลและแนวทางที่เสนอ', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'เสนอแนวทางใหม่ต่อผู้มีอำนาจ?',
      html: confirmBody(
        'บันทึกแนวทางใหม่หลังถูกส่งคืน แล้วเสนอขึ้นผู้บังคับบัญชาตามลำดับชั้นอีกครั้ง',
        [
          ['เหตุที่ดำเนินการไม่ได้', reason],
          ['แนวทางที่เสนอ', approach],
          ['หมายเหตุ', note.trim() || '-'],
        ],
        'แฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> อีกครั้ง · มาตรการคุ้มครองเดิมยังคงมีผลระหว่างพิจารณา'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเสนอแนวทางใหม่',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      recordArticle14DeliveryFailure(caseItem.no, {
        failedReason: reason.trim(),
        proposedApproach: approach.trim(),
        note: note.trim() || undefined,
      })
      setReason('')
      setApproach('')
      setNote('')
      showToast('เสนอแนวทางใหม่ขึ้น ผบช.ชั้นต้นแล้ว')
    })
  }

  const handleDecide = (endorse: boolean) => {
    if (!pendingProposal) return
    if (!endorse && !decisionNote.trim()) {
      showToast('กรุณาระบุเหตุผลที่ส่งคืนแก้ไข', 'warning')
      return
    }
    const isSupervisor = pendingProposal.stage === 'supervisor'
    const roleLabel = isSupervisor ? 'ผบช.ชั้นต้น' : 'ผอ.สำนัก/กอง'
    const effect = !endorse
      ? 'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อทบทวนแนวทางและเสนอใหม่'
      : isSupervisor
        ? 'แฟ้มเดินต่อขึ้น <strong>ผอ.สำนัก/กอง</strong> เพื่ออนุมัติแนวทางใหม่'
        : `อนุมัติแนวทาง <strong>${pendingProposal.proposedApproach}</strong> — มาตรการคุ้มครองเดิมของ ป.ป.ท. ยังคงมีผลจนกว่าแนวทางใหม่จะเริ่มใช้จริง`

    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse
        ? isSupervisor
          ? 'เห็นชอบแนวทางและเสนอต่อ ผอ.?'
          : 'อนุมัติแนวทางใหม่?'
        : 'ส่งคืนแก้ไขแนวทางใหม่?',
      html: confirmBody(
        `${roleLabel}พิจารณาข้อเสนอแนวทางใหม่ของแฟ้ม ${caseItem.no}`,
        [
          ['หน่วยงานที่แจ้งว่าดำเนินการไม่ได้', pendingProposal.failedAgency],
          ['เหตุที่ดำเนินการไม่ได้', pendingProposal.failedReason || '-'],
          ['แนวทางที่เสนอ', pendingProposal.proposedApproach],
          ['ความเห็น/ข้อสั่งการ', decisionNote.trim() || '-'],
        ],
        effect
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? (isSupervisor ? 'ยืนยันเห็นชอบ' : 'ยืนยันอนุมัติแนวทางใหม่') : 'ยืนยันส่งคืนแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewArticle14Escalation(
        caseItem.no,
        pendingProposal.id,
        pendingProposal.stage as 'supervisor' | 'director',
        endorse,
        decisionNote.trim()
      )
      setDecisionNote('')
      showToast(
        endorse
          ? isSupervisor
            ? 'เห็นชอบและเสนอต่อ ผอ.สำนัก/กอง แล้ว'
            : `อนุมัติแนวทางใหม่แล้ว — ${pendingProposal.proposedApproach}`
          : 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว'
      )
    })
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-3" data-testid="article14-escalation-card">
      <div className="text-[0.8rem] font-bold text-rose-900">
        <i className="fa-solid fa-building-circle-exclamation mr-1.5" />
        {proposal.failedAgency} แจ้งว่าดำเนินการไม่ได้: เสนอผู้มีอำนาจพิจารณาแนวทางใหม่
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[0.8rem] leading-relaxed text-amber-900">
        <i className="fa-solid fa-shield-halved mr-1" />
        มาตรการคุ้มครองเดิมของ ป.ป.ท. <strong>ยังคงมีผลอยู่</strong> ระหว่างรอพิจารณาแนวทางใหม่นี้ ไม่ปล่อยให้การคุ้มครองขาดช่วงโดยไม่มีผู้รับผิดชอบ
      </div>

      <div
        className={`rounded-lg border p-3 text-[0.8rem] leading-relaxed ${STAGE_TONE[proposal.stage]}`}
        data-testid="article14-escalation-status"
      >
        <div className="font-bold">
          แนวทางที่เสนอ: {proposal.proposedApproach} · {STAGE_LABEL[proposal.stage]}
        </div>
        <div className="mt-1">เหตุที่ดำเนินการไม่ได้: {proposal.failedReason || '-'}</div>
        {proposal.note && <div className="mt-1">หมายเหตุ: {proposal.note}</div>}
        <div className="mt-1 text-[0.8rem] opacity-80">
          เสนอโดย {proposal.createdBy} · {proposal.createdAt}
        </div>
        {proposal.supervisorAt && (
          <div className="text-[0.8rem] opacity-80">
            ผบช.ชั้นต้น: {proposal.supervisorBy} · {proposal.supervisorAt}
            {proposal.supervisorNote ? ` — ${proposal.supervisorNote}` : ''}
          </div>
        )}
        {proposal.directorAt && (
          <div className="text-[0.8rem] opacity-80">
            ผอ.สำนัก/กอง: {proposal.directorBy} · {proposal.directorAt}
            {proposal.directorNote ? ` — ${proposal.directorNote}` : ''}
          </div>
        )}
        {proposal.stage === 'returned' && proposal.returnNote && (
          <div className="mt-1 font-bold">ข้อสั่งการให้แก้ไข: {proposal.returnNote}</div>
        )}
      </div>

      {/* ชั้นเจ้าหน้าที่ — เสนอแนวทางใหม่อีกครั้งหลังถูกส่งคืน */}
      {canPropose && (
        <div className="space-y-2.5" data-testid="article14-escalation-propose">
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุที่ดำเนินการไม่ได้ (ปรับปรุงตามข้อสั่งการ)"
            data-testid="article14-escalation-reason"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />
          <input
            value={approach}
            onChange={(e) => setApproach(e.target.value)}
            placeholder="แนวทางที่เสนอ"
            data-testid="article14-escalation-approach"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุประกอบ (ไม่บังคับ)"
            data-testid="article14-escalation-note"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />
          <Button
            type="button"
            onClick={handlePropose}
            data-testid="article14-escalation-submit"
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-rose-700 transition"
          >
            เสนอแนวทางใหม่ตามลำดับชั้น
          </Button>
        </div>
      )}

      {/* ชั้นผู้บังคับบัญชา — ผบช.ชั้นต้น แล้วต่อด้วย ผอ.สำนัก/กอง */}
      {canDecide && pendingProposal && (
        <div className="space-y-2" data-testid="article14-escalation-decide">
          <textarea
            rows={2}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={
              pendingProposal.stage === 'supervisor'
                ? 'ความเห็นของ ผบช.ชั้นต้น (จำเป็นเมื่อส่งคืนแก้ไข)'
                : 'ความเห็น/ข้อสั่งการของ ผอ.สำนัก/กอง (จำเป็นเมื่อส่งคืนแก้ไข)'
            }
            data-testid="article14-escalation-decision-note"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleDecide(true)}
              data-testid="article14-escalation-endorse"
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              {pendingProposal.stage === 'supervisor' ? 'เห็นชอบและเสนอต่อ ผอ.' : 'อนุมัติแนวทางใหม่'}
            </Button>
            <Button
              type="button"
              onClick={() => handleDecide(false)}
              data-testid="article14-escalation-return"
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              ส่งคืนแก้ไข
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
