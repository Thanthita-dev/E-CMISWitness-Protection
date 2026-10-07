import React, { useState } from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'
import { CaseItem, CoordinationDeclineProposal } from '../../types/case'
import { EXTERNAL_TRANSFER_AGENCIES } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

const STAGE_LABEL: Record<CoordinationDeclineProposal['stage'], string> = {
  supervisor: 'รอ ผบช.ชั้นต้น พิจารณา',
  director: 'ผบช.ชั้นต้นเห็นชอบแล้ว · รอ ผอ.สำนัก/กอง อนุมัติ',
  approved: 'ผอ.สำนัก/กอง อนุมัติแล้ว · ประสานหน่วยงานใหม่ได้',
  returned: 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไข',
}

const STAGE_TONE: Record<CoordinationDeclineProposal['stage'], string> = {
  supervisor: 'border-amber-300 bg-amber-50/70 text-amber-900',
  director: 'border-blue-300 bg-blue-50/70 text-blue-900',
  approved: 'border-emerald-300 bg-emerald-50/70 text-emerald-900',
  returned: 'border-rose-300 bg-rose-50/70 text-rose-900',
}

export const latestCoordinationProposal = (caseItem: CaseItem): CoordinationDeclineProposal | undefined => {
  const list = caseItem.coordinationProposals || []
  return list[list.length - 1]
}

/**
 * WIT0845 — หน่วยงานปลายทางปฏิเสธการรับดำเนินการตามข้อ 15(4)
 *
 * ครึ่งแรกของ node (บันทึกหนังสือปฏิเสธและเหตุผล) อยู่ที่การ์ด WIT0844-0846 ในแผงวิธีที่ 4
 * การ์ดนี้คือครึ่งหลัง — "เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่" ซึ่งต้องเป็นงานจริง
 * ในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง ไม่ใช่ข้อความแจ้งเตือนที่เด้งขึ้นมาแล้วหายไป
 *
 * ทุกปุ่มในการ์ดนี้เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม จึงผ่านจอยืนยันทุกปุ่ม
 */
export const CoordinationDeclineCard: React.FC<{ caseItem: CaseItem; declinedAgency: string; declinedReason: string }> = ({
  caseItem,
  declinedAgency,
  declinedReason,
}) => {
  const { proposeCoordinationAgency, reviewCoordinationProposal } = useCaseStore()
  const { currentRole } = useAuthStore()

  const alternatives = EXTERNAL_TRANSFER_AGENCIES.filter((a) => a !== declinedAgency)
  const [agency, setAgency] = useState(alternatives[0] || '')
  const [note, setNote] = useState('')
  const [decisionNote, setDecisionNote] = useState('')

  const proposal = latestCoordinationProposal(caseItem)
  const isOfficer = currentRole === 'officer' || currentRole === 'case_owner' || currentRole === 'got_officer' || currentRole === 'admin'
  const pendingProposal =
    proposal && (proposal.stage === 'supervisor' || proposal.stage === 'director') ? proposal : undefined
  const canDecide =
    pendingProposal &&
    ((pendingProposal.stage === 'supervisor' && (currentRole === 'supervisor' || currentRole === 'admin')) ||
      (pendingProposal.stage === 'director' && (currentRole === 'director' || currentRole === 'admin')))

  /** เสนอได้เมื่อยังไม่มีข้อเสนอค้าง หรือข้อเสนอรอบก่อนถูกส่งคืนมาแก้ */
  const canPropose = isOfficer && (!proposal || proposal.stage === 'returned')

  const handlePropose = () => {
    if (!agency) {
      showToast('กรุณาเลือกหน่วยงานที่เสนอให้ประสานแทน', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'เสนอหน่วยงานใหม่ต่อผู้มีอำนาจ?',
      html: confirmBody(
        'บันทึกผลการปฏิเสธแล้วเสนอหน่วยงานที่จะประสานแทน ขึ้นผู้บังคับบัญชาตามลำดับชั้น',
        [
          ['หน่วยงานที่ปฏิเสธ', declinedAgency],
          ['เหตุผลการปฏิเสธ', declinedReason || '-'],
          ['หน่วยงานที่เสนอให้ประสานแทน', agency],
          ['เหตุผลประกอบ', note.trim() || '-'],
        ],
        'แฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> เพื่อพิจารณาก่อนเสนอ ผอ.สำนัก/กอง · วิธีที่ 4 ยังคงสถานะ "เริ่มไม่ได้" จนกว่าจะอนุมัติหน่วยงานใหม่'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเสนอหน่วยงานใหม่',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      proposeCoordinationAgency(caseItem.no, {
        declinedAgency,
        declinedReason,
        proposedAgency: agency,
        note: note.trim() || undefined,
      })
      setNote('')
      showToast('เสนอหน่วยงานใหม่ขึ้น ผบช.ชั้นต้นแล้ว')
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
      ? 'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อทบทวนหน่วยงานและเสนอใหม่'
      : isSupervisor
        ? 'แฟ้มเดินต่อขึ้น <strong>ผอ.สำนัก/กอง</strong> เพื่ออนุมัติหน่วยงานใหม่'
        : `เปลี่ยนหน่วยงานประสานของวิธีที่ 4 เป็น <strong>${pendingProposal.proposedAgency}</strong> และกลับไปทำ<strong>หนังสือประสานขาออกฉบับใหม่</strong> ภายใต้คำสั่งเดิม`

    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse
        ? isSupervisor
          ? 'เห็นชอบหน่วยงานใหม่และเสนอต่อ ผอ.?'
          : 'อนุมัติให้ประสานหน่วยงานใหม่?'
        : 'ส่งคืนแก้ไขข้อเสนอหน่วยงานใหม่?',
      html: confirmBody(
        `${roleLabel}พิจารณาข้อเสนอหน่วยงานใหม่ของแฟ้ม ${caseItem.no}`,
        [
          ['หน่วยงานที่ปฏิเสธ', pendingProposal.declinedAgency],
          ['เหตุผลการปฏิเสธ', pendingProposal.declinedReason || '-'],
          ['หน่วยงานที่เสนอให้ประสานแทน', pendingProposal.proposedAgency],
          ['ความเห็น/ข้อสั่งการ', decisionNote.trim() || '-'],
        ],
        effect
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? (isSupervisor ? 'ยืนยันเห็นชอบ' : 'ยืนยันอนุมัติหน่วยงานใหม่') : 'ยืนยันส่งคืนแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewCoordinationProposal(
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
            : `อนุมัติให้ประสาน ${pendingProposal.proposedAgency} — ทำหนังสือประสานขาออกฉบับใหม่ได้`
          : 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว'
      )
    })
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-3" data-testid="wit0845-card">
      <div className="text-[0.8rem] font-bold text-rose-900">
        <i className="fa-solid fa-building-circle-exclamation mr-1.5" />
        หน่วยงานปฏิเสธ: บันทึกหนังสือและเหตุผล แล้วเสนอผู้มีอำนาจพิจารณาหน่วยงานใหม่
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem] leading-relaxed text-slate-600">
        <div>
          หน่วยงานที่ปฏิเสธ: <span className="font-bold text-slate-800">{declinedAgency}</span>
        </div>
        <div>เหตุผลตามหนังสือปฏิเสธ: {declinedReason || '-'}</div>
      </div>

      {proposal && (
        <div
          className={`rounded-lg border p-3 text-[0.8rem] leading-relaxed ${STAGE_TONE[proposal.stage]}`}
          data-testid="wit0845-status"
        >
          <div className="font-bold">
            หน่วยงานที่เสนอ: {proposal.proposedAgency} · {STAGE_LABEL[proposal.stage]}
          </div>
          {proposal.note && <div className="mt-1">เหตุผลประกอบ: {proposal.note}</div>}
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
      )}

      {/* ชั้นเจ้าหน้าที่ — เลือกหน่วยงานที่จะเสนอให้ประสานแทน */}
      {canPropose && (
        <div className="space-y-2.5" data-testid="wit0845-propose">
          <label className="block">
            <span className="ws-label">หน่วยงานที่เสนอให้ประสานแทน</span>
            <select
              value={agency}
              onChange={(e) => setAgency(e.target.value)}
              data-testid="coordination-new-agency"
              className="ws-input border w-full border-rose-300 focus:border-rose-500"
            >
              {alternatives.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="เหตุผลประกอบที่เลือกหน่วยงานนี้ (ไม่บังคับ)"
            data-testid="coordination-note"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />
          <Button
            type="button"
            onClick={handlePropose}
            data-testid="coordination-submit"
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-rose-700 transition"
          >
            เสนอหน่วยงานใหม่ตามลำดับชั้น
          </Button>
        </div>
      )}

      {/* ชั้นผู้บังคับบัญชา — ผบช.ชั้นต้น แล้วต่อด้วย ผอ.สำนัก/กอง */}
      {canDecide && pendingProposal && (
        <div className="space-y-2" data-testid="wit0845-decide">
          <textarea
            rows={2}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={
              pendingProposal.stage === 'supervisor'
                ? 'ความเห็นของ ผบช.ชั้นต้น (จำเป็นเมื่อส่งคืนแก้ไข)'
                : 'ความเห็น/ข้อสั่งการของ ผอ.สำนัก/กอง (จำเป็นเมื่อส่งคืนแก้ไข)'
            }
            data-testid="coordination-decision-note"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleDecide(true)}
              data-testid="coordination-endorse"
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              {pendingProposal.stage === 'supervisor' ? 'เห็นชอบและเสนอต่อ ผอ.' : 'อนุมัติหน่วยงานใหม่'}
            </Button>
            <Button
              type="button"
              onClick={() => handleDecide(false)}
              data-testid="coordination-return"
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
