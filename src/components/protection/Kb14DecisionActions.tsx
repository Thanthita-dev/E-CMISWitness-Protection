import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import React, { useState } from 'react'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, ExtensionRequest } from '../../types/case'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/** ค่า default เมื่อไม่ระบุความเห็น — single source of truth ให้ทุกจุดที่เรียก reviewKb14/decideExtension ใช้ค่าเดียวกัน */
export const KB14_DEFAULT_REVIEW_NOTE = 'เอกสารครบถ้วน'
export const KB14_DEFAULT_APPROVE_NOTE = 'อนุมัติขยายระยะเวลาคุ้มครองตามที่เสนอ'

interface Kb14DecisionActionsProps {
  caseItem: CaseItem
  proposal: ExtensionRequest
  role: string
  /** เรียกหลังยืนยันการกระทำสำเร็จ (ปิดแผง/นำทาง ฯลฯ) */
  onDone?: () => void
  className?: string
}

/**
 * ขั้น 11B — WIT1117-WIT1123 · จุดตัดสินใจ คบ.14 หนึ่งเดียว
 *
 * ใช้ร่วมกันโดย Kb14Section (แท็บ 11B) และ Kb14FormEditor (แบบฟอร์ม) เพื่อไม่ให้ default
 * ความเห็นและเงื่อนไขสิทธิ์เพี้ยนไปคนละทาง — ทุกปุ่มที่เปลี่ยนสถานะแฟ้มต้องผ่านจอยืนยัน (WIT1121/WIT1123)
 */
export const Kb14DecisionActions: React.FC<Kb14DecisionActionsProps> = ({
  caseItem,
  proposal,
  role,
  onDone,
  className,
}) => {
  const { reviewKb14, decideExtension } = useCaseStore()
  const [note, setNote] = useState('')

  const step = proposal.approvalStage || 'supervisor'
  const isSupervisor = role === 'admin' || role === step || (step === 'director' && role === 'got_director')
  const isAuthority = step === 'secretary' && ['secretary', 'admin'].includes(role)
  const nextLabel = step === 'supervisor' ? 'ผอ.กอง' : step === 'director' ? 'รองเลขาธิการ' : 'เลขาธิการ'

  const handleReview = (endorse: boolean) => {
    if (!endorse && !note.trim()) {
      showToast('กรุณาระบุเหตุผลที่ส่งคืน', 'warning')
      return
    }
    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse ? 'ยืนยันเอกสารครบถ้วน?' : 'ยืนยันส่งคืนแก้ไข?',
      html: confirmBody(
        `ตรวจ คบ.14 ฉบับที่ ${proposal.version || 1} ของแฟ้ม ${caseItem.no}`,
        [
          ['ขอขยาย', proposal.durationMonths ? monthLabel(proposal.durationMonths) : legacyMonthLabel(proposal.durationDays)],
          ['เหตุผลที่เสนอ', proposal.reason || '-'],
          ['ความเห็น', note.trim() || (endorse ? KB14_DEFAULT_REVIEW_NOTE : '-')],
        ],
        endorse
          ? 'เสนอตามลำดับชั้นให้ผู้มีอำนาจพิจารณาอนุมัติต่อไป'
          : 'แฟ้มกลับไปให้เจ้าหน้าที่แก้ไขและจัดทำ คบ.14 เวอร์ชันใหม่'
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? 'ยืนยันครบถ้วน' : 'ยืนยันส่งคืน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewKb14(caseItem.no, proposal.id, endorse, note.trim() || KB14_DEFAULT_REVIEW_NOTE)
      setNote('')
      showToast(
        endorse ? 'เอกสารครบถ้วน — เสนอตามลำดับชั้นแล้ว' : 'ส่งคืนแก้ไข คบ.14 แล้ว'
      )
      onDone?.()
    })
  }

  const handleDecide = (approve: boolean) => {
    if (!approve && !note.trim()) {
      showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'warning')
      return
    }
    showConfirmAlert({
      icon: approve ? 'question' : 'warning',
      title: approve ? 'ยืนยันอนุมัติขยายเวลา?' : 'ยืนยันไม่อนุมัติ?',
      html: confirmBody(
        `พิจารณาอนุมัติขยายเวลาคุ้มครองของแฟ้ม ${caseItem.no}`,
        [
          ['ขอขยาย', proposal.durationMonths ? monthLabel(proposal.durationMonths) : legacyMonthLabel(proposal.durationDays)],
          ['เหตุผลที่เสนอ', proposal.reason || '-'],
          ['ความเห็นประกอบคำสั่ง', note.trim() || (approve ? KB14_DEFAULT_APPROVE_NOTE : '-')],
        ],
        approve
          ? 'ล็อก คบ.14 ฉบับลงนามและเพิ่มช่วงคุ้มครองใหม่ต่อจากวันสิ้นสุดเดิม'
          : 'คงคำสั่งเดิมถึงวันสิ้นสุด แล้วให้จัดทำเรื่องยุติ (คบ.15) ต่อไป'
      ),
      showCancelButton: true,
      confirmButtonText: approve ? 'ยืนยันอนุมัติ' : 'ยืนยันไม่อนุมัติ',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      decideExtension(caseItem.no, proposal.id, approve, note.trim() || KB14_DEFAULT_APPROVE_NOTE)
      setNote('')
      showToast(
        approve
          ? 'อนุมัติขยายเวลา · ล็อก คบ.14 ฉบับลงนามและเพิ่มช่วงคุ้มครองใหม่แล้ว'
          : 'บันทึกไม่อนุมัติ · คงคำสั่งเดิมถึงวันสิ้นสุด'
      )
      onDone?.()
    })
  }

  if (proposal.formSnapshot && ['submitted', 'pending'].includes(proposal.status) && step !== 'secretary' && isSupervisor) {
    return (
      <div className={className ?? 'space-y-2 border-t border-slate-200 pt-3'}>
        <p className="text-[0.8rem] text-muted">
          ตรวจ คบ.14 เหตุผล หลักฐาน ช่วงวันที่ และเพดานวันสะสม
        </p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ความเห็น / เหตุผลที่ส่งคืนแก้ไข"
          className="ws-input w-full"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => handleReview(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
          >
            เห็นชอบ · ส่ง{nextLabel}
          </Button>
          <Button
            type="button"
            onClick={() => handleReview(false)}
            className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
          >
            ส่งคืนแก้ไข
          </Button>
        </div>
      </div>
    )
  }

  if (proposal.formSnapshot && proposal.status === 'pending' && isAuthority) {
    return (
      <div className={className ?? 'space-y-2 border-t border-slate-200 pt-3'}>
        <p className="text-[0.8rem] text-muted">
          อนุมัติแล้วจะเพิ่มช่วงคุ้มครองใหม่ต่อจากวันสิ้นสุดเดิม โดยไม่แก้ทับช่วงเดิม
        </p>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="ความเห็นประกอบคำสั่ง"
          className="ws-input w-full"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={() => handleDecide(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
          >
            <i className="fa-solid fa-signature mr-1.5" />
            อนุมัติขยายเวลา
          </Button>
          <Button
            type="button"
            onClick={() => handleDecide(false)}
            className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
          >
            ไม่อนุมัติ
          </Button>
          <Button type="button" variant="secondary" onClick={() => handleReview(false)}>ส่งคืนแก้ไข</Button>
        </div>
      </div>
    )
  }

  return null
}
