import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { CaseItem, ProtectionMethodNo } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { METHOD_LABELS } from '../../lib/episode'
import {
  FAST_TRACK_DEFAULT_OPINION,
  fastTrackReviewItems,
  fastTrackStep,
  isFastTrackCase,
  mainPetitionNotice,
} from '../../lib/fastTrack'
import { isCaseWorkerRole } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { VoiceTextarea } from '../common/VoiceTextarea'

interface FastTrackPanelProps {
  caseItem: CaseItem
}

const StatusNote: React.FC<{ tone: 'amber' | 'emerald' | 'slate'; title: string; children?: React.ReactNode }> = ({
  tone,
  title,
  children,
}) => {
  const palette =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/70 text-amber-900'
        : 'border-slate-200 bg-white text-slate-700'
  return (
    <div className={`rounded-xl border p-3.5 text-[0.88rem] leading-relaxed ${palette}`}>
      <strong className="block mb-0.5">{title}</strong>
      {children}
    </div>
  )
}

/**
 * Sheet 06 — เรื่องคุ้มครองชั่วคราวของเส้นทางเร่งด่วน (WIT0605 → WIT0614) ภายในการ์ดส่งงาน (ForwardWorkflowCard)
 *
 * แสดงเฉพาะสิ่งที่ผู้ใช้คนนั้นทำได้ในขั้นปัจจุบัน — ผอ. เห็นขั้นตรวจและตัดสิน
 * เจ้าหน้าที่เห็นผลและขั้นพยานลงนาม ส่วนขั้นจัดทำ/แก้ไข คบ.4 และร่าง คบ.5 (WIT0603 · WIT0608) อยู่ที่ FastTrackSubmitPanel
 * การส่งกลับแก้ไข (WIT0607) ใช้ปุ่ม "ส่งกลับแก้ไข / ตีกลับ" ของการ์ดส่งงาน
 *
 * ประตูตามผัง
 *  WIT0606 ข้อมูลครบ? → "ไม่ครบ" ใช้ปุ่มส่งกลับแก้ไข (WIT0607) · "ครบ" = ผอ. ลงนาม คบ.4 → คบ.5 แล้วกดอนุมัติที่ WIT0609
 *  WIT0609 อนุมัติคุ้มครองชั่วคราว?  → "ไม่อนุมัติ" ไป WIT0610 · "อนุมัติ" ไป WIT0611
 */
export const FastTrackPanel: React.FC<FastTrackPanelProps> = ({ caseItem }) => {
  const { currentRole } = useAuthStore()
  const {
    approveTemporaryProtection,
    denyTemporaryProtection,
    acknowledgeKb5Order,
  } = useCaseStore()
  const { signDocument, lockForm, signatures } = useFormDraftStore()
  const kb4Draft = useFormDraftStore((s) => selectCaseDraft(s, 4, caseItem.no))
  const kb5Draft = useFormDraftStore((s) => selectCaseDraft(s, 5, caseItem.no))

  const [decision, setDecision] = useState<'deny' | null>(null)
  const [denyReason, setDenyReason] = useState('')
  const [signingWitness, setSigningWitness] = useState(false)

  if (!isFastTrackCase(caseItem)) return null

  const step = fastTrackStep(caseItem)
  if (step === 'drafting' || step === 'returned') return null
  const fastTrack = caseItem.fastTrack
  const isOfficer = isCaseWorkerRole(currentRole)
  const isDirector = currentRole === 'director' || currentRole === 'admin'
  const approvedMethods = fastTrack?.proposedMethods || []
  const mainNotice = mainPetitionNotice(caseItem)
  const directorSigned = Boolean(signatures['kb5-director']?.signed)
  /** ข้อ 13 ของ คบ.4 — ผอ. ลงความเห็นและลงนามที่หน้าแบบ คบ.4 ก่อนอนุมัติ ควบคู่กับลงนามคำสั่งที่หน้าแบบ คบ.5 */
  const kb4DirectorSigned = Boolean(signatures['kb4-director']?.signed)
  const opinion = String(kb4Draft['ความเห็นผู้อำนวยการ'] ?? '').trim() || FAST_TRACK_DEFAULT_OPINION
  /** เลขที่คำสั่งจากร่าง คบ.5 ("คำสั่งที่ …/ปี …") — กรอกที่หน้าแบบ คบ.5 ไม่บังคับ */
  const draftOrderNo = [kb5Draft['เลขที่คำสั่ง'], kb5Draft['ปีคำสั่ง']].map((v) => String(v ?? '').trim()).filter(Boolean).join('/')
  const orderNoValue = draftOrderNo

  /** ปุ่มอนุมัติเปิดเมื่อ ผอ. ลงนาม คบ.4 (ข้อ 13) ตามด้วย คบ.5 แล้ว */
  const approveBlocker = !kb4DirectorSigned
    ? 'ต้องลงความเห็นข้อ 13 และลงนามในแบบ คบ.4 ก่อน'
    : !directorSigned
      ? 'ต้องลงนามคำสั่งในแบบ คบ.5 ก่อน'
      : ''
  const canApprove = !approveBlocker

  const handleApprove = () => {
    if (!kb4DirectorSigned) {
      showToast('กรุณาลงความเห็นข้อ 13 และลงนามที่หน้าแบบ คบ.4 ก่อนอนุมัติ')
      return
    }
    if (!directorSigned) {
      showToast('กรุณาลงนามคำสั่งที่หน้าแบบ คบ.5 ก่อนอนุมัติ')
      return
    }
    const signerName = signatures['kb5-director']?.signerName
    showConfirmAlert({
      icon: 'warning',
      title: 'อนุมัติคุ้มครองชั่วคราวและออกคำสั่ง คบ.5?',
      html: confirmBody(
        'จุดชี้ขาดของเส้นทางเร่งด่วน — อนุมัติแล้วคำสั่งจะมีผลทันที',
        [
          ['ผู้ลงนาม', signerName || '-'],
          ['วิธีที่จะได้รับอนุมัติ', approvedMethods.map((m) => `วิธีที่ ${m}`).join(' · ') || '-'],
          ['ความเห็นข้อ 13 ของ คบ.4', opinion],
          ['ผู้ลงนามข้อ 13 ของ คบ.4', signatures['kb4-director']?.signerName || '-'],
        ],
        '<strong>ล็อก คบ.4 และฉบับคำสั่ง คบ.5 ที่ลงนามถาวร แก้ไขทับไม่ได้อีก</strong> · แฟ้มกลับไปที่เจ้าหน้าที่เพื่อแจ้งพยานรับทราบและลงนามยินยอม · คำร้องหลักยังเดินต่อควบคู่กัน'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันอนุมัติและออกคำสั่ง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      approveTemporaryProtection(caseItem.no, {
        opinion,
        orderNo: orderNoValue.trim() || '-',
        signerName,
      })
      /** WIT0611 — ระบบล็อกฉบับที่ลงนามแล้ว ห้ามแก้ทับ เช่นเดียวกับ คบ.1 / คบ.3 / คบ.6 / คบ.8 */
      lockForm(4, signatures['kb4-director']?.signerName || 'ผู้อำนวยการสำนัก/กอง', 'ผอ. ลงนามความเห็นข้อ 13 ของ คบ.4 แล้ว ห้ามแก้ไขทับฉบับลงนาม')
      lockForm(5, signerName || 'ผู้อำนวยการสำนัก/กอง', 'ลงนามคำสั่ง คบ.5 แล้ว ห้ามแก้ไขทับฉบับลงนาม')
      setDecision(null)
      showToast('อนุมัติคุ้มครองชั่วคราวและลงนามคำสั่ง คบ.5 แล้ว')
    })
  }

  const handleDeny = () => {
    if (!denyReason.trim()) {
      showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติการคุ้มครองชั่วคราว')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'ไม่อนุมัติการคุ้มครองชั่วคราว?',
      html: confirmBody(
        'บันทึกผลไม่อนุมัติ <strong>เฉพาะการคุ้มครองชั่วคราว</strong> เท่านั้น',
        [
          ['เหตุผล', denyReason.trim()],
          ['ผู้รับงานต่อ', caseItem.assignedOfficer || '-'],
        ],
        'คำร้องหลัก <strong>ไม่ถูกปิด</strong> และ <strong>ไม่ออก คบ.10</strong> จึงยังไม่เกิดสิทธิอุทธรณ์ · แฟ้มกลับไปที่เจ้าหน้าที่เพื่อจัดทำ/เสนอ คบ.6 ที่หน้ากลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันไม่อนุมัติชั่วคราว',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      denyTemporaryProtection(caseItem.no, denyReason.trim())
      setDecision(null)
      showToast('บันทึกผลไม่อนุมัติชั่วคราวแล้ว — คำร้องหลักยังเดินต่อ ไม่ออก คบ.10')
    })
  }

  return (
    <div data-testid="fast-track-card" data-fast-track-step={step || 'director_review'} className="space-y-4">
      {/* วิธีที่อนุมัติ — ขั้น ผอ. ตรวจมีอยู่ในรายการที่ต้องตรวจแล้ว */}
      {step !== 'director_review' && step !== 'denied' && (
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-[0.8rem]" data-testid="fast-track-methods">
        <strong className="block text-slate-700 mb-1">วิธีคุ้มครองที่เสนอในแบบ คบ.4</strong>
        {approvedMethods.length === 0 ? (
          <span className="text-amber-700">
            ยังไม่ได้เลือกวิธี — เปิดแบบ คบ.4 แล้วติ๊กวิธีที่ 1–4 เลือกได้มากกว่าหนึ่งวิธี
          </span>
        ) : (
          <ul className="space-y-0.5 text-slate-700">
            {approvedMethods.map((m) => (
              <li key={m}>☑ {METHOD_LABELS[m as ProtectionMethodNo] || `วิธีที่ ${m}`}</li>
            ))}
          </ul>
        )}
      </div>
      )}

      {/* WIT0605 — ผอ. ตรวจ คบ.4 ร่าง คบ.5 หลักฐาน ระดับภัย และมาตรการคุ้มครองชั่วคราว */}
      {isDirector && step === 'director_review' && (
        <div className="space-y-3">
          {/* WIT0609 — จุดชี้ขาด: ไม่มีด่านกด "ครบ — พร้อมพิจารณา" แยกแล้ว การลงนาม คบ.4 → คบ.5 คือการยืนยันว่าตรวจครบ */}
          <div className="space-y-3" data-testid="fast-track-decision-panel">
            {/* WIT0610 — ไม่อนุมัติเฉพาะชั่วคราว ไม่ปิดคำร้องหลักและไม่ออก คบ.10 */}
            {decision === 'deny' && (
              <div className="space-y-2.5 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                <p className="text-[0.88rem] leading-relaxed text-rose-900">
                  <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                  การไม่อนุมัติในขั้นนี้คือ <strong>ไม่อนุมัติเฉพาะการคุ้มครองชั่วคราว</strong> เท่านั้น —
                  คำร้องหลักไม่ปิด และ <strong>ไม่ออก คบ.10</strong> จึงยังไม่เกิดสิทธิอุทธรณ์
                </p>
                <VoiceTextarea
                  rows={3}
                  value={denyReason}
                  data-testid="fast-track-deny-reason"
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="เหตุผลที่ยังไม่อนุมัติให้คุ้มครองชั่วคราว ..."
                  className="ws-input w-full text-ink"
                />
                <div className="flex justify-end">
                  <Button
                    type="button"
                    onClick={handleDeny}
                    data-testid="fast-track-deny-confirm"
                    variant="danger"
                    size="md"
                  >
                    <i className="fa-solid fa-ban" />
                    ยืนยันไม่อนุมัติชั่วคราว (คำร้องหลักเดินต่อ)
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                onClick={() => setDecision(decision === 'deny' ? null : 'deny')}
                data-testid="fast-track-deny-button"
                variant="secondary"
                size="md"
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                <i className="fa-solid fa-ban" />
                ไม่อนุมัติคุ้มครองชั่วคราว
              </Button>
              <Button
                type="button"
                onClick={handleApprove}
                disabled={!canApprove}
                title={canApprove ? undefined : approveBlocker}
                data-testid="fast-track-approve-confirm"
                variant="primary"
                size="md"
              >
                <i className="fa-solid fa-file-signature" />
                อนุมัติและออกคำสั่ง คบ.5
              </Button>
            </div>
            {!canApprove && (
              <p className="text-right text-[0.8rem] font-semibold text-amber-700">
                <i className="fa-solid fa-lock mr-1" />
                {approveBlocker}
              </p>
            )}
          </div>
        </div>
      )}

      {/* รอ ผอ. พิจารณา — มุมมองของคนที่ไม่ใช่ผู้ตัดสิน */}
      {!isDirector && step === 'director_review' && (
        <StatusNote tone="amber" title="เสนอ ผอ.สำนัก/กอง พิจารณาแล้ว">
          ส่งตรงถึง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น เมื่อ {fastTrack?.submittedAt} — รอผลการพิจารณาคุ้มครองชั่วคราว
        </StatusNote>
      )}

      {/* WIT0612 — พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอม */}
      {step === 'approved' && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" data-testid="fast-track-ack-panel">
          <StatusNote tone="emerald" title={`อนุมัติคุ้มครองชั่วคราวแล้ว — คำสั่ง คบ.5 ที่ ${fastTrack?.kb5OrderNo}`}>
            <span className="block">ลงนามโดย {fastTrack?.kb5SignedBy} เมื่อ {fastTrack?.kb5SignedAt}</span>
            <span className="block">ความเห็นข้อ 13 ของ คบ.4: {fastTrack?.directorOpinion}</span>
            <span className="block mt-1">ฉบับลงนามถูกล็อกแล้ว — แก้ไขทับไม่ได้</span>
          </StatusNote>
          <p className="text-[0.88rem] text-slate-600 leading-relaxed">
            พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอมรับการคุ้มครองชั่วคราว
            (ความยินยอมอ้างอิง คบ.5 ใช้แทน คบ.11 ของเส้นทางปกติ)
          </p>
          {(isOfficer || currentRole === 'admin') && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setSigningWitness(true)}
                data-testid="kb5-witness-ack-button"
                variant="primary"
                size="md"
              >
                <i className="fa-solid fa-file-signature" />
                พยานลงนามยินยอมรับการคุ้มครองชั่วคราว
              </Button>
            </div>
          )}
        </div>
      )}

      {/* WIT0613 — คำสั่ง คบ.5 พร้อมดำเนินการ ส่งวิธีที่อนุมัติไปแท็บ 08 */}
      {step === 'active' && (
        <StatusNote tone="emerald" title="คำสั่ง คบ.5 พร้อมดำเนินการ">
          <span className="block">
            พยานลงนามยินยอมเมื่อ {fastTrack?.witnessAckAt} — ส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติที่หน้าดำเนินการตามวิธีคุ้มครองแล้ว
          </span>
          <span className="block">
            ระยะเวลาคุ้มครองช่วงชั่วคราวเริ่มนับเมื่อวิธีแรกเริ่มปฏิบัติจริง และนับต่อเนื่องเมื่อเปลี่ยนเป็นช่วงคำร้องหลัก
          </span>
        </StatusNote>
      )}

      {/* WIT0610 — ผลไม่อนุมัติชั่วคราว */}
      {step === 'denied' && (
        <StatusNote tone="amber" title="ไม่อนุมัติการคุ้มครองชั่วคราว">
          <span className="block">เหตุผล: {caseItem.temporaryDeniedReason}</span>
          <span className="block">บันทึกเมื่อ {caseItem.temporaryDeniedAt}</span>
        </StatusNote>
      )}

      {/* WIT0614 — คำร้องหลักยังเดินต่อเสมอ */}
      {mainNotice && (
        <div data-testid="fast-track-main-petition-notice">
          <StatusNote tone="slate" title="คำร้องหลักยังเดินต่อ">
            {mainNotice}
          </StatusNote>
        </div>
      )}

      {signingWitness && (
        <SignatureModal
          isOpen
          title="ลงลายมือชื่อยินยอมรับการคุ้มครองชั่วคราว (คบ.5)"
          signerRole="พยานผู้รับการคุ้มครอง"
          defaultSignerName={caseItem.person}
          onClose={() => setSigningWitness(false)}
          onConfirm={(name, img) => {
            signDocument('kb5-witness', name, img)
            acknowledgeKb5Order(caseItem.no, name)
            setSigningWitness(false)
            showToast('พยานลงนามยินยอมแล้ว — ส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติที่หน้าดำเนินการตามวิธีคุ้มครอง')
          }}
        />
      )}
    </div>
  )
}
