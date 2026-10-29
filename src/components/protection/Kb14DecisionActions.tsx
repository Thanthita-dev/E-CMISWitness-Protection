import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import { isKb14StageReviewer, gotReviewChain } from '../../lib/protectionHandoff'
import React, { useState } from 'react'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, ExtensionRequest } from '../../types/case'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { formatThaiDate } from '../../lib/utils'
import { ROLE_NAMES } from '../../lib/constants'
import { addendumLabel, extensionKb6SignerFor } from '../../lib/formSignature'
import { Link } from '@tanstack/react-router'

/** ค่า default เมื่อไม่ระบุความเห็น — single source of truth ให้ทุกจุดที่เรียก reviewKb14/decideExtension ใช้ค่าเดียวกัน */
export const KB14_DEFAULT_REVIEW_NOTE = 'เอกสารครบถ้วน'
export const KB14_DEFAULT_APPROVE_NOTE = 'อนุมัติขยายระยะเวลาคุ้มครองตามที่เสนอ'

const KB6_EXT_ROLE_LABEL: Record<string, string> = {
  supervisor: ROLE_NAMES.supervisor,
  director: ROLE_NAMES.director,
  deputy: ROLE_NAMES.deputy_secretary,
  secretary: ROLE_NAMES.secretary,
}

/** บทบาทนี้มีปุ่มตัดสินใจ คบ.14 ในขั้นปัจจุบันไหม (ผู้ตรวจตามลำดับชั้น หรือเลขาธิการผู้มีอำนาจ) */
export const canActOnKb14 = (proposal: ExtensionRequest, role: string, caseItem?: Pick<CaseItem, 'protectionHandoff' | 'sarabanDispatch'>): boolean => {
  if (caseItem?.sarabanDispatch?.flow === 'kb14') return false
  if (!proposal.formSnapshot || !['submitted', 'pending'].includes(proposal.status)) return false
  const step = proposal.approvalStage || 'supervisor'
  if (step === 'secretary') return proposal.status === 'pending' && ['secretary', 'admin'].includes(role)
  return isKb14StageReviewer(role, step, caseItem)
}

interface Kb14DecisionActionsProps {
  caseItem: CaseItem
  proposal: ExtensionRequest
  role: string
  /** เรียกหลังยืนยันการกระทำสำเร็จ (ปิดแผง/นำทาง ฯลฯ) */
  onDone?: () => void
  className?: string
  forwardOnly?: boolean
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
  forwardOnly = false,
}) => {
  const { reviewKb14, decideExtension } = useCaseStore()
  const [note, setNote] = useState('')

  const step = proposal.approvalStage || 'supervisor'
  const isSupervisor = isKb14StageReviewer(role, step, caseItem)
  const isAuthority = step === 'secretary' && ['secretary', 'admin'].includes(role)
  const nextLabel = step === 'supervisor' ? (gotReviewChain(caseItem) ? 'ผอ. กอท.' : 'ผอ.กอง') : step === 'director' ? 'รองเลขาธิการ' : 'เลขาธิการ'
  /**
   * รอบขยายเวลาที่แนบ คบ.6 — ทุกชั้นต้องลงนาม คบ.6 ก่อน ปุ่มส่งต่อชั้นถัดไปจึงกดได้
   * ชั้นเลขาธิการต้องลงนามก่อนทุกปุ่ม (อนุมัติ / ไม่อนุมัติ / ส่งคืนแก้ไข)
   */
  const kb6Signer = proposal.kb6Snapshot ? extensionKb6SignerFor(step) : undefined
  const kb6Signed = !kb6Signer || Boolean(proposal.kb6Signatures?.[kb6Signer.role])
  const actionNote = isAuthority
    ? String(proposal.kb6Signatures?.secretary?.opinion || (kb6Signer ? proposal.kb6Snapshot?.[kb6Signer.opinionField] : '') || '').trim()
    : note.trim()

  /** คบ.6 ฉบับขยายเวลาที่แนบมากับ คบ.14 — แต่ละชั้นลงนามก่อนส่งต่อ */
  const kb6Note = proposal.kb6Snapshot ? (
    <div className="space-y-1 text-[0.8rem] text-muted" data-testid="kb14-kb6-note">
      {kb6Signer && !kb6Signed ? (
        <p className="ws-callout text-[0.88rem] leading-relaxed" data-testid="kb14-kb6-sign-required">
          ลงนาม{kb6Signer.label} (ข้อ {kb6Signer.no}) ใน คบ.6 {addendumLabel(Math.max(1, (caseItem.extensionRequests || []).indexOf(proposal) + 1))} ก่อน จึง{step === 'secretary' ? 'อนุมัติ ไม่อนุมัติ หรือส่งคืนแก้ไขได้' : `ส่ง${nextLabel}ได้`} ·{' '}
          <Link to="/form/$formId" params={{ formId: '6' }} search={{ caseNo: caseItem.no }} className="font-bold underline">
            เปิด คบ.6 เพื่อลงนาม
          </Link>
        </p>
      ) : null}
      {Object.entries(proposal.kb6Signatures || {}).map(([signer, sig]) => (
        <p key={signer}>
          <i className="fa-solid fa-check mr-1 text-emerald-600" aria-hidden="true" />
          ลงนาม คบ.6 แล้ว: {KB6_EXT_ROLE_LABEL[signer] || signer} · {sig.by} · {formatThaiDate(sig.at)}
        </p>
      ))}
    </div>
  ) : null

  const handleReview = (endorse: boolean) => {
    if ((endorse || step === 'secretary') && !kb6Signed) {
      showToast(`กรุณาลงนาม คบ.6 (ข้อ ${kb6Signer?.no}) ก่อนส่ง${nextLabel}`, 'warning')
      return
    }
    if (!endorse && !actionNote) {
      showToast(isAuthority ? 'กรุณาระบุเหตุผลที่ส่งคืนใน คบ.6' : 'กรุณาระบุเหตุผลที่ส่งคืน', 'warning')
      return
    }
    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse ? `ยืนยันส่ง${nextLabel}?` : 'ยืนยันส่งคืนแก้ไข?',
      html: confirmBody(
        `ตรวจ คบ.14 ${addendumLabel(Math.max(1, (caseItem.extensionRequests || []).indexOf(proposal) + 1))} ของแฟ้ม ${caseItem.no}`,
        [
          ['ขอขยาย', proposal.durationMonths ? monthLabel(proposal.durationMonths) : legacyMonthLabel(proposal.durationDays)],
          ['เหตุผลที่เสนอ', proposal.reason || '-'],
          ['ความเห็น', actionNote || (endorse ? KB14_DEFAULT_REVIEW_NOTE : '-')],
        ],
        endorse
          ? 'เสนอตามลำดับชั้นให้เลขาธิการ ป.ป.ท.พิจารณาอนุมัติต่อไป'
          : 'แฟ้มกลับไปให้เจ้าหน้าที่แก้ไขและจัดทำ คบ.14 เวอร์ชันใหม่'
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? `ยืนยันส่ง${nextLabel}` : 'ยืนยันส่งคืน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewKb14(caseItem.no, proposal.id, endorse, actionNote || KB14_DEFAULT_REVIEW_NOTE)
      setNote('')
      showToast(
        endorse ? `ส่ง คบ.14 ให้${nextLabel}แล้ว` : 'ส่งคืนแก้ไข คบ.14 แล้ว'
      )
      onDone?.()
    })
  }

  const handleDecide = (approve: boolean) => {
    if (!kb6Signed) {
      showToast(`กรุณาลงนาม คบ.6 (ข้อ ${kb6Signer?.no}) ก่อน${approve ? 'อนุมัติ' : 'ไม่อนุมัติ'}`, 'warning')
      return
    }
    if (!approve && !actionNote) {
      showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติใน คบ.6', 'warning')
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
          ['ความเห็นจาก คบ.6', actionNote || (approve ? KB14_DEFAULT_APPROVE_NOTE : '-')],
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
      decideExtension(caseItem.no, proposal.id, approve, actionNote || KB14_DEFAULT_APPROVE_NOTE)
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
    if (forwardOnly) {
      return (
        <div className={className}>
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!kb6Signed}
            data-testid="kb14-forward-button"
            onClick={() => handleReview(true)}
          >
            ส่งให้ {nextLabel}
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Button>
        </div>
      )
    }
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
            disabled={!kb6Signed}
            data-testid="kb14-forward-button"
            title={kb6Signed ? undefined : `ลงนาม คบ.6 (ข้อ ${kb6Signer?.no}) ก่อนจึงส่งต่อได้`}
            onClick={() => handleReview(true)}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 text-[0.88rem] font-bold text-white hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
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
        {kb6Note}
      </div>
    )
  }

  if (proposal.formSnapshot && proposal.status === 'pending' && isAuthority) {
    return (
      <div className="space-y-4" data-testid="kb14-authority-actions">
        <h2 className="text-[1.1rem] font-bold text-navy">พิจารณาขยายระยะเวลาคุ้มครอง</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            size="md"
            disabled={!kb6Signed}
            data-testid="kb14-approve-button"
            title={kb6Signed ? undefined : `ลงนาม คบ.6 (ข้อ ${kb6Signer?.no}) ก่อนจึงอนุมัติได้`}
            onClick={() => handleDecide(true)}
            className="min-h-[44px] rounded-lg bg-emerald-600 px-4 py-2 text-[0.88rem] font-bold text-white hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="fa-solid fa-signature mr-1.5" />
            อนุมัติขยายเวลา
          </Button>
          <Button
            type="button"
            size="md"
            disabled={!kb6Signed}
            onClick={() => handleDecide(false)}
            className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            ไม่อนุมัติ
          </Button>
          <Button type="button" variant="secondary" size="md" disabled={!kb6Signed} onClick={() => handleReview(false)}>ส่งคืนแก้ไข</Button>
        </div>
        {!kb6Signed && kb6Note}
      </div>
    )
  }

  return null
}
