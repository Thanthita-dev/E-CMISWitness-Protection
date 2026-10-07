import React, { useState } from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'
import { CaseItem, ConsentDeclineAction, ConsentDeclineProposal, ProtectionMethodNo } from '../../types/case'
import { PROTECTION_METHOD_OPTIONS, protectionMethodSwitchNotice, toggleProtectionMethod } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/** วิธีที่เปิดเป็นเส้นทางปฏิบัติได้จริงคือ 1-4 (ข้อ 5 เป็นมาตรการเสริมใน คบ.4 ไม่ใช่เส้นทางแยก) */
const ROUTABLE_METHODS: ProtectionMethodNo[] = [1, 2, 3, 4]

/** WIT0812 — สามแนวทางที่ผังให้เลือกเมื่อพยานไม่ยินยอม พร้อมปลายทางจริงของแต่ละแนวทาง */
export const DECLINE_ACTIONS: Array<{
  value: ConsentDeclineAction
  label: string
  detail: string
}> = [
  {
    value: 'review',
    label: 'ทบทวนแนวทางคุ้มครอง',
    detail: 'ส่งเข้าทบทวนผลการคุ้มครองเพื่อจำแนกแนวทางใหม่',
  },
  {
    value: 'change_method',
    label: 'เปลี่ยนวิธีคุ้มครอง',
    detail: 'เปิดชุดวิธีคุ้มครองชุดใหม่ แล้วปรับ คบ.11 และขอความยินยอมจากพยานอีกครั้ง',
  },
  {
    value: 'terminate',
    label: 'ยุติการคุ้มครอง',
    detail: 'บันทึกเหตุยุติเข้าแฟ้มเดิม แล้วเข้าเส้นทางจัดทำเรื่องยุติ (คบ.15)',
  },
]

const ACTION_LABEL: Record<ConsentDeclineAction, string> = {
  review: 'ทบทวนแนวทางคุ้มครอง',
  change_method: 'เปลี่ยนวิธีคุ้มครอง',
  terminate: 'ยุติการคุ้มครอง',
}

const STAGE_LABEL: Record<ConsentDeclineProposal['stage'], string> = {
  supervisor: 'รอ ผบช.ชั้นต้น พิจารณา',
  director: 'ผบช.ชั้นต้นเห็นชอบแล้ว · รอ ผอ.สำนัก/กอง อนุมัติ',
  approved: 'ผอ.สำนัก/กอง อนุมัติแล้ว',
  returned: 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไข',
}

const STAGE_TONE: Record<ConsentDeclineProposal['stage'], string> = {
  supervisor: 'border-amber-300 bg-amber-50/70 text-amber-900',
  director: 'border-blue-300 bg-blue-50/70 text-blue-900',
  approved: 'border-emerald-300 bg-emerald-50/70 text-emerald-900',
  returned: 'border-rose-300 bg-rose-50/70 text-rose-900',
}

export const latestDeclineProposal = (caseItem: CaseItem): ConsentDeclineProposal | undefined => {
  const list = caseItem.consentDeclineProposals || []
  return list[list.length - 1]
}

/**
 * WIT0812 — การ์ดเดียวครอบทั้ง node: บันทึกการไม่ยินยอม เลือกหนึ่งในสามแนวทาง
 * แล้วเดินตามลำดับผู้บังคับบัญชา (ผบช.ชั้นต้น → ผอ.สำนัก/กอง) จนแนวทางถูกนำไปใช้จริง
 *
 * ทุกปุ่มในการ์ดนี้เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม จึงผ่านจอยืนยันทุกปุ่ม
 */
export const ConsentDeclineCard: React.FC<{ caseItem: CaseItem; consentRef: 'kb11' | 'kb5' }> = ({
  caseItem,
  consentRef,
}) => {
  const { declineConsent, reviewConsentDecline } = useCaseStore()
  const { currentRole } = useAuthStore()

  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState('')
  const [action, setAction] = useState<ConsentDeclineAction>('review')
  const [newMethods, setNewMethods] = useState<ProtectionMethodNo[]>([])
  const [decisionNote, setDecisionNote] = useState('')

  const proposal = latestDeclineProposal(caseItem)
  const isOfficer = currentRole === 'officer' || currentRole === 'case_owner' || currentRole === 'got_officer' || currentRole === 'admin'
  const pendingProposal = proposal && (proposal.stage === 'supervisor' || proposal.stage === 'director') ? proposal : undefined
  const canDecide =
    pendingProposal &&
    ((pendingProposal.stage === 'supervisor' && (currentRole === 'supervisor' || currentRole === 'admin')) ||
      (pendingProposal.stage === 'director' && (currentRole === 'director' || currentRole === 'admin')))

  /** เจ้าหน้าที่เสนอได้เมื่อยังไม่มีข้อเสนอค้าง หรือข้อเสนอรอบก่อนถูกส่งคืนมาแก้ */
  const canPropose = isOfficer && (!proposal || proposal.stage === 'returned')

  const toggleMethod = (n: ProtectionMethodNo) => {
    const notice = protectionMethodSwitchNotice(newMethods, n)
    if (notice) showToast(notice, 'warning')
    setNewMethods(toggleProtectionMethod(newMethods, n))
  }

  const handleDecline = () => {
    if (!reason.trim()) {
      showToast('กรุณาระบุเหตุที่พยานไม่ยินยอม', 'warning')
      return
    }
    if (action === 'change_method' && newMethods.length === 0) {
      showToast('เลือกวิธีคุ้มครองที่เสนอใช้แทนอย่างน้อยหนึ่งวิธี', 'warning')
      return
    }
    const chosen = DECLINE_ACTIONS.find((a) => a.value === action)!
    showConfirmAlert({
      icon: 'warning',
      title: 'บันทึกการไม่ยินยอมและเสนอแนวทางตามลำดับชั้น?',
      html: confirmBody(
        `บันทึกเหตุและหลักฐานการไม่ยินยอมตาม ${consentRef === 'kb11' ? 'คบ.11' : 'คบ.5'} แล้วเสนอแนวทางขึ้นผู้บังคับบัญชา`,
        [
          ['เหตุที่พยานไม่ยินยอม', reason.trim()],
          ['หลักฐานประกอบ', evidence.trim() || '-'],
          ['แนวทางที่เสนอ', chosen.label],
          ...(action === 'change_method'
            ? ([['วิธีที่เสนอใช้แทน', newMethods.map((m) => `วิธีที่ ${m}`).join(' · ')]] as Array<[string, string]>)
            : []),
        ],
        'วิธีที่ยังไม่เริ่มปฏิบัติจะถูก<strong>ระงับทันที</strong> และแฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> เพื่อพิจารณาก่อนส่งต่อ ผอ.สำนัก/กอง'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึกไม่ยินยอม',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      declineConsent(caseItem.no, {
        ref: consentRef,
        by: caseItem.person,
        reason: reason.trim(),
        evidence: evidence.trim() || undefined,
        proposedAction: action,
        proposedMethods: action === 'change_method' ? newMethods : undefined,
      })
      setReason('')
      setEvidence('')
      setNewMethods([])
      showToast('บันทึกการไม่ยินยอม ระงับวิธีที่ยังไม่เริ่ม และเสนอแนวทางขึ้น ผบช.ชั้นต้นแล้ว')
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
    const actionLabel = ACTION_LABEL[pendingProposal.proposedAction]
    const effect = !endorse
      ? 'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อทบทวนเหตุผลและเสนอแนวทางใหม่'
      : isSupervisor
        ? 'แฟ้มเดินต่อขึ้น <strong>ผอ.สำนัก/กอง</strong> เพื่ออนุมัติแนวทาง'
        : pendingProposal.proposedAction === 'review'
          ? 'ส่งเรื่องเข้า<strong>ทบทวนผลการคุ้มครอง</strong>ทันที'
          : pendingProposal.proposedAction === 'change_method'
            ? 'เปิดชุดวิธีใหม่ตามที่อนุมัติ · <strong>ล้างความยินยอมตาม คบ.11</strong> เพื่อชี้แจงและขอลงนามใหม่'
            : 'บันทึกเหตุยุติเข้าแฟ้มเดิมและเข้าเส้นทาง <strong>จัดทำเรื่องยุติ (คบ.15)</strong>'

    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse
        ? isSupervisor
          ? 'เห็นชอบข้อเสนอและเสนอต่อ ผอ.?'
          : 'อนุมัติแนวทางหลังพยานไม่ยินยอม?'
        : 'ส่งคืนแก้ไขข้อเสนอแนวทาง?',
      html: confirmBody(
        `${roleLabel}พิจารณาข้อเสนอแนวทางหลังพยานไม่ยินยอมของแฟ้ม ${caseItem.no}`,
        [
          ['แนวทางที่เสนอ', actionLabel],
          ['เหตุที่พยานไม่ยินยอม', pendingProposal.reason],
          ...(pendingProposal.proposedMethods?.length
            ? ([
                ['วิธีที่เสนอใช้แทน', pendingProposal.proposedMethods.map((m) => `วิธีที่ ${m}`).join(' · ')],
              ] as Array<[string, string]>)
            : []),
          ['ความเห็น/ข้อสั่งการ', decisionNote.trim() || '-'],
        ],
        effect
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? (isSupervisor ? 'ยืนยันเห็นชอบ' : 'ยืนยันอนุมัติแนวทาง') : 'ยืนยันส่งคืนแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewConsentDecline(
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
            ? 'เห็นชอบข้อเสนอและเสนอต่อ ผอ.สำนัก/กอง แล้ว'
            : `อนุมัติแนวทาง: ${actionLabel} — แฟ้มเดินต่อตามเส้นทางที่อนุมัติแล้ว`
          : 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว'
      )
    })
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3.5 space-y-3" data-testid="wit0812-card">
      <div className="text-[0.8rem] font-bold text-rose-900">
        <i className="fa-solid fa-scale-balanced mr-1.5" />
        พยานไม่ยินยอม: ห้ามเริ่มวิธีนั้น แล้วเสนอทบทวน เปลี่ยนวิธี หรือยุติ ผ่านลำดับผู้บังคับบัญชา
      </div>

      {proposal && (
        <div className={`rounded-lg border p-3 text-[0.8rem] leading-relaxed ${STAGE_TONE[proposal.stage]}`} data-testid="wit0812-status">
          <div className="font-bold">
            แนวทางที่เสนอ: {ACTION_LABEL[proposal.proposedAction]} · {STAGE_LABEL[proposal.stage]}
          </div>
          <div className="mt-1">เหตุที่พยานไม่ยินยอม: {proposal.reason}</div>
          {proposal.evidence && <div>หลักฐานประกอบ: {proposal.evidence}</div>}
          {proposal.proposedMethods && proposal.proposedMethods.length > 0 && (
            <div>วิธีที่เสนอใช้แทน: {proposal.proposedMethods.map((m) => `วิธีที่ ${m}`).join(' · ')}</div>
          )}
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

      {/* ชั้นเจ้าหน้าที่ — บันทึกเหตุและเลือกแนวทางที่จะเสนอ */}
      {canPropose && (
        <div className="space-y-2.5" data-testid="wit0812-propose">
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุที่พยานไม่ยินยอม"
            data-testid="decline-reason"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="หลักฐานประกอบ เช่น บันทึกถ้อยคำ เลขที่เอกสาร"
            data-testid="decline-evidence"
            className="ws-input border w-full border-rose-300 focus:border-rose-500"
          />

          <div className="text-[0.8rem] font-bold text-slate-700">แนวทางที่เสนอผ่านลำดับผู้บังคับบัญชา (เลือกหนึ่งแนวทาง)</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {DECLINE_ACTIONS.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAction(a.value)}
                data-testid={`decline-action-${a.value}`}
                aria-pressed={action === a.value}
                className={`rounded-xl border p-2.5 text-left text-[0.8rem] leading-relaxed transition ${
                  action === a.value
                    ? 'border-rose-500 bg-white text-rose-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block font-bold">{a.label}</span>
                {a.detail}
              </button>
            ))}
          </div>

          {action === 'change_method' && (
            <div className="space-y-1.5 rounded-lg border border-slate-200 bg-white p-2.5">
              <div className="text-[0.8rem] font-bold text-slate-700">วิธีคุ้มครองที่เสนอใช้แทน</div>
              <div className="grid gap-1.5 sm:grid-cols-2">
                {PROTECTION_METHOD_OPTIONS.filter((o) => ROUTABLE_METHODS.includes(o.n as ProtectionMethodNo)).map((o) => {
                  const n = o.n as ProtectionMethodNo
                  const on = newMethods.includes(n)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => toggleMethod(n)}
                      data-testid={`decline-new-method-${n}`}
                      aria-pressed={on}
                      className={`rounded-lg border p-2 text-left text-[0.8rem] transition ${
                        on ? 'border-blue bg-blue-50/70 text-blue-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-bold">({n}) </span>
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <Button
            type="button"
            onClick={handleDecline}
            data-testid="decline-submit"
            className="rounded-lg bg-rose-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-rose-700 transition"
          >
            บันทึกไม่ยินยอมและเสนอแนวทางตามลำดับชั้น
          </Button>
        </div>
      )}

      {/* ชั้นผู้บังคับบัญชา — ผบช.ชั้นต้น แล้วต่อด้วย ผอ.สำนัก/กอง */}
      {canDecide && pendingProposal && (
        <div className="space-y-2" data-testid="wit0812-decide">
          <textarea
            rows={2}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={
              pendingProposal.stage === 'supervisor'
                ? 'ความเห็นของ ผบช.ชั้นต้น (จำเป็นเมื่อส่งคืนแก้ไข)'
                : 'ความเห็น/ข้อสั่งการของ ผอ.สำนัก/กอง (จำเป็นเมื่อส่งคืนแก้ไข)'
            }
            data-testid="decline-decision-note"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleDecide(true)}
              data-testid="decline-endorse"
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              {pendingProposal.stage === 'supervisor' ? 'เห็นชอบและเสนอต่อ ผอ.' : 'อนุมัติแนวทางที่เสนอ'}
            </Button>
            <Button
              type="button"
              onClick={() => handleDecide(false)}
              data-testid="decline-return"
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
