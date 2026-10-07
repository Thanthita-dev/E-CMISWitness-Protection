import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'
import { CaseItem, MethodChangeProposal, ProtectionMethodNo } from '../../types/case'
import { ROUTABLE_PROTECTION_METHODS, protectionMethodSwitchNotice, toggleProtectionMethod } from '../../lib/constants'
import { METHOD_LABELS } from '../../lib/episode'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

const STAGE_LABEL: Record<MethodChangeProposal['stage'], string> = {
  supervisor: 'รอ ผบช.ชั้นต้น พิจารณา',
  director: 'ผบช.ชั้นต้นเห็นชอบแล้ว · รอ ผอ.สำนัก/กอง อนุมัติ',
  approved: 'ผอ.สำนัก/กอง อนุมัติแล้ว · ปรับ คบ.11 และขอความยินยอมใหม่',
  returned: 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไข',
}

const STAGE_TONE: Record<MethodChangeProposal['stage'], string> = {
  supervisor: 'border-amber-300 bg-amber-50/70 text-amber-900',
  director: 'border-blue-300 bg-blue-50/70 text-blue-900',
  approved: 'border-emerald-300 bg-emerald-50/70 text-emerald-900',
  returned: 'border-rose-300 bg-rose-50/70 text-rose-900',
}

export const latestMethodChangeProposal = (caseItem: CaseItem): MethodChangeProposal | undefined => {
  const list = caseItem.methodChangeProposals || []
  return list[list.length - 1]
}

const methodText = (methods: ProtectionMethodNo[]) =>
  methods.length > 0 ? `วิธีที่ ${methods.join(', ')}` : '-'

/**
 * WIT1110 — เปลี่ยนวิธี/เงื่อนไข: เสนออนุมัติและปรับ คบ.11
 *
 * ผังเขียนแขนงนี้ไว้สองครึ่ง — "เสนออนุมัติ" แล้วจึง "ปรับ คบ.11"
 * ครึ่งแรกต้องเป็นงานจริงในคิวของ ผบช.ชั้นต้น → ผอ.สำนัก/กอง (ลำดับเดียวกับ WIT0812 / WIT0845)
 * ครึ่งหลังเกิดทันทีที่ ผอ. อนุมัติ — ชุดวิธีที่อนุมัติถูกแทนที่ ความยินยอมตาม คบ.11 เดิมถูกล้าง
 * และถ้าวิธีใหม่รวมวิธีที่ 1 ต้องจัดทำ/แก้ คบ.8 ให้ลงนามก่อนจึงเริ่มปฏิบัติได้
 *
 * ทุกปุ่มในการ์ดนี้เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม จึงผ่านจอยืนยันทุกปุ่ม
 */
export const MethodChangeCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { proposeMethodChange, reviewMethodChange } = useCaseStore()
  const { currentRole } = useAuthStore()

  const currentMethods = caseItem.approvedMethods || []
  const [methods, setMethods] = useState<ProtectionMethodNo[]>(currentMethods)
  const [conditions, setConditions] = useState('')
  const [reason, setReason] = useState('')
  const [decisionNote, setDecisionNote] = useState('')

  const proposal = latestMethodChangeProposal(caseItem)
  const isOfficer = currentRole === 'officer' || currentRole === 'case_owner' || currentRole === 'got_officer' || currentRole === 'admin'
  const pendingProposal =
    proposal && (proposal.stage === 'supervisor' || proposal.stage === 'director') ? proposal : undefined
  const canDecide =
    pendingProposal &&
    ((pendingProposal.stage === 'supervisor' && (currentRole === 'supervisor' || currentRole === 'admin')) ||
      (pendingProposal.stage === 'director' && (currentRole === 'director' || currentRole === 'admin')))

  /** เสนอได้เมื่อยังไม่มีข้อเสนอค้าง หรือข้อเสนอรอบก่อนถูกส่งคืนมาแก้ */
  const canPropose = isOfficer && (!proposal || proposal.stage === 'returned')

  const toggleMethod = (m: ProtectionMethodNo) => {
    const notice = protectionMethodSwitchNotice(methods, m)
    if (notice) showToast(notice, 'warning')
    setMethods(toggleProtectionMethod(methods, m))
  }

  const sorted = [...methods].sort() as ProtectionMethodNo[]
  const unchanged =
    sorted.length === currentMethods.length && sorted.every((m, i) => m === [...currentMethods].sort()[i])

  const handlePropose = () => {
    if (sorted.length === 0) {
      showToast('กรุณาเลือกวิธีคุ้มครองที่เสนอใช้แทนอย่างน้อย 1 วิธี', 'warning')
      return
    }
    if (unchanged && !conditions.trim()) {
      showToast('ชุดวิธีไม่ต่างจากเดิม — เลือกวิธีใหม่ หรือระบุเงื่อนไข/ข้อกำหนดที่ขอปรับ', 'warning')
      return
    }
    if (!reason.trim()) {
      showToast('กรุณาระบุเหตุผลที่ขอเปลี่ยนวิธี/เงื่อนไข', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'เสนอเปลี่ยนวิธี/เงื่อนไขต่อผู้มีอำนาจ?',
      html: confirmBody(
        'เสนอขออนุมัติเปลี่ยนวิธี/เงื่อนไขการคุ้มครอง ขึ้นผู้บังคับบัญชาตามลำดับชั้น',
        [
          ['วิธีที่ใช้อยู่', methodText(currentMethods)],
          ['วิธีที่เสนอใช้แทน', methodText(sorted)],
          ['เงื่อนไข/ข้อกำหนดที่ขอปรับใน คบ.11', conditions.trim() || '-'],
          ['เหตุผล', reason.trim()],
        ],
        'แฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> เพื่อพิจารณาก่อนเสนอ ผอ.สำนัก/กอง · วิธีเดิมยังเดินตามคำสั่งเดิมจนกว่าจะอนุมัติ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเสนอเปลี่ยนวิธี',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      proposeMethodChange(caseItem.no, {
        proposedMethods: sorted,
        conditions: conditions.trim() || undefined,
        reason: reason.trim(),
      })
      setConditions('')
      setReason('')
      showToast('เสนอเปลี่ยนวิธี/เงื่อนไขขึ้น ผบช.ชั้นต้นแล้ว')
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
      ? 'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อทบทวนวิธี/เงื่อนไขและเสนอใหม่'
      : isSupervisor
        ? 'แฟ้มเดินต่อขึ้น <strong>ผอ.สำนัก/กอง</strong> เพื่ออนุมัติการเปลี่ยนวิธีและปรับ คบ.11'
        : `ปรับ <strong>คบ.11</strong> เป็น${methodText(pendingProposal.proposedMethods)} · <strong>ล้างความยินยอมตาม คบ.11 เดิม</strong> ต้องชี้แจงและให้พยานลงนามใหม่${
            pendingProposal.requiresKb8
              ? ' · วิธีที่ 1 ต้อง<strong>จัดทำ/แก้ คบ.8</strong> ให้เลขาธิการฯ ลงนามก่อนเริ่มปฏิบัติ'
              : ''
          } แล้วกลับไปดำเนินการตามวิธีคุ้มครอง`

    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse
        ? isSupervisor
          ? 'เห็นชอบการเปลี่ยนวิธีและเสนอต่อ ผอ.?'
          : 'อนุมัติเปลี่ยนวิธีและปรับ คบ.11?'
        : 'ส่งคืนแก้ไขข้อเสนอเปลี่ยนวิธี?',
      html: confirmBody(
        `${roleLabel}พิจารณาข้อเสนอเปลี่ยนวิธี/เงื่อนไขของแฟ้ม ${caseItem.no}`,
        [
          ['วิธีที่ใช้อยู่', methodText(pendingProposal.currentMethods)],
          ['วิธีที่เสนอใช้แทน', methodText(pendingProposal.proposedMethods)],
          ['เงื่อนไข/ข้อกำหนดที่ขอปรับใน คบ.11', pendingProposal.conditions || '-'],
          ['เหตุผล', pendingProposal.reason],
          ['ความเห็น/ข้อสั่งการ', decisionNote.trim() || '-'],
        ],
        effect
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? (isSupervisor ? 'ยืนยันเห็นชอบ' : 'ยืนยันอนุมัติเปลี่ยนวิธี') : 'ยืนยันส่งคืนแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewMethodChange(
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
            : `อนุมัติเปลี่ยนเป็น${methodText(pendingProposal.proposedMethods)} — ปรับ คบ.11 และขอความยินยอมใหม่ได้`
          : 'ส่งคืนเจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว'
      )
    })
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4 space-y-3" data-testid="wit1110-card">
      <div className="text-[0.8rem] font-bold text-navy-deep">
        <i className="fa-solid fa-list-check mr-1.5 text-blue" />
        เปลี่ยนวิธี/เงื่อนไข: เสนออนุมัติและปรับ คบ.11
      </div>
      <p className="text-[0.8rem] leading-relaxed text-slate-600">
        เสนอผ่าน <strong>ผบช.ชั้นต้น → ผอ.สำนัก/กอง</strong> · อนุมัติแล้วชุดวิธีที่อนุมัติจะถูกแทนที่
        ความยินยอมตาม คบ.11 เดิมถูกล้างและต้องขอใหม่ทุกวิธี · ถ้าวิธีใหม่รวมวิธีที่ 1 ต้องจัดทำ/แก้ คบ.8
        ให้ลงนามก่อนจึงเริ่มปฏิบัติได้ แล้วจึงกลับไปดำเนินการตามวิธีคุ้มครอง
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem] leading-relaxed text-slate-600">
        วิธีคุ้มครองที่อนุมัติอยู่ปัจจุบัน:{' '}
        <span className="font-bold text-slate-800" data-testid="wit1110-current-methods">
          {methodText(currentMethods)}
        </span>
      </div>

      {proposal && (
        <div
          className={`rounded-lg border p-3 text-[0.8rem] leading-relaxed ${STAGE_TONE[proposal.stage]}`}
          data-testid="wit1110-status"
        >
          <div className="font-bold">
            เสนอเปลี่ยนเป็น{methodText(proposal.proposedMethods)} · {STAGE_LABEL[proposal.stage]}
          </div>
          <div className="mt-1">เหตุผล: {proposal.reason}</div>
          {proposal.conditions && <div>เงื่อนไข/ข้อกำหนดที่ขอปรับใน คบ.11: {proposal.conditions}</div>}
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
          {proposal.stage === 'approved' && (
            <div className="mt-2 space-y-1">
              <div className="font-bold">
                <i className="fa-solid fa-arrow-right-long mr-1" />
                ปรับ คบ.11 เป็น{methodText(proposal.proposedMethods)} แล้วชี้แจงและขอความยินยอมจากพยานใหม่
                {proposal.requiresKb8 ? ' · จัดทำ/แก้ คบ.8 ให้เลขาธิการฯ ลงนามก่อนเริ่มวิธีที่ 1' : ''}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                <Link
                  to="/dossier/$caseNo"
                  params={{ caseNo: caseItem.no }}
                  data-testid="wit1110-goto-dossier"
                  className="min-h-[38px] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
                >
                  <i className="fa-solid fa-folder-open mr-1.5" />
                  เปิดแฟ้ม · ปรับ คบ.11 {proposal.requiresKb8 ? '/ คบ.8' : ''}
                </Link>
                <Link
                  to="/protection-methods"
                  data-testid="wit1110-goto-methods"
                  className="min-h-[38px] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
                >
                  <i className="fa-solid fa-diagram-project mr-1.5" />
                  ไปหน้าดำเนินการตามวิธีคุ้มครอง
                </Link>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ชั้นเจ้าหน้าที่ — เลือกชุดวิธีใหม่ตามข้อ 15 (1)-(4) และเงื่อนไขที่ขอปรับ */}
      {canPropose && (
        <div className="space-y-2.5" data-testid="wit1110-propose">
          <div>
            <span className="ws-label">วิธีที่เสนอใช้แทน (วิธีที่ 1–4)</span>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {ROUTABLE_PROTECTION_METHODS.map((n) => {
                const m = n as ProtectionMethodNo
                const checked = methods.includes(m)
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-[0.8rem] transition ${
                      checked ? 'border-blue bg-blue-50/70 text-navy-deep' : 'border-slate-200 bg-white text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleMethod(m)}
                      data-testid={`method-change-option-${m}`}
                      className="ws-checkbox"
                    />
                    <span>
                      {METHOD_LABELS[m]}
                      {currentMethods.includes(m) && <span className="ml-1 text-[0.8rem] opacity-70">— ใช้อยู่</span>}
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <textarea
            rows={2}
            value={conditions}
            onChange={(e) => setConditions(e.target.value)}
            placeholder="เงื่อนไข/ข้อกำหนดเพิ่มเติมที่ขอปรับใน คบ.11 (ระยะเวลา สถานที่ ข้อจำกัด — ไม่บังคับ)"
            data-testid="method-change-conditions"
            className="ws-input w-full"
          />
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลที่ขอเปลี่ยนวิธี/เงื่อนไข อ้างผลทบทวนและความเหมาะสมของวิธีที่ใช้อยู่"
            data-testid="method-change-reason"
            className="ws-input w-full"
          />
          <Button
            type="button"
            onClick={handlePropose}
            data-testid="method-change-submit"
            className="rounded-lg bg-blue px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
          >
            เสนอเปลี่ยนวิธีตามลำดับชั้น
          </Button>
        </div>
      )}

      {/* ชั้นผู้บังคับบัญชา — ผบช.ชั้นต้น แล้วต่อด้วย ผอ.สำนัก/กอง */}
      {canDecide && pendingProposal && (
        <div className="space-y-2" data-testid="wit1110-decide">
          <textarea
            rows={2}
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder={
              pendingProposal.stage === 'supervisor'
                ? 'ความเห็นของ ผบช.ชั้นต้น (จำเป็นเมื่อส่งคืนแก้ไข)'
                : 'ความเห็น/ข้อสั่งการของ ผอ.สำนัก/กอง (จำเป็นเมื่อส่งคืนแก้ไข)'
            }
            data-testid="method-change-decision-note"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => handleDecide(true)}
              data-testid="method-change-endorse"
              className="rounded-lg bg-emerald-600 px-4 py-1.5 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              {pendingProposal.stage === 'supervisor' ? 'เห็นชอบและเสนอต่อ ผอ.' : 'อนุมัติเปลี่ยนวิธีและปรับ คบ.11'}
            </Button>
            <Button
              type="button"
              onClick={() => handleDecide(false)}
              data-testid="method-change-return"
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
