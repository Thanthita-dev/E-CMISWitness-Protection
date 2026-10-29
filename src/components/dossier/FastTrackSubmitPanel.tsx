import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem, ProtectionMethodNo } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { KB4_PROTECTION_METHOD_FIELD, readMethodSubitems, readRoutableProtectionMethods } from '../../lib/constants'
import { fastTrackStep, kb5TemporaryPeriod, submitFastTrackGate, temporaryDurationCheck } from '../../lib/fastTrack'
import { formatThaiDate } from '../../lib/utils'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { VoiceTextarea } from '../common/VoiceTextarea'

interface FastTrackSubmitPanelProps {
  caseItem: CaseItem
  onActionComplete?: () => void
}

/**
 * WIT0603 → WIT0604 · และ WIT0608 รอบแก้ไข — เจ้าหน้าที่ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ.
 *
 * แสดงในการ์ดส่งงาน (ForwardWorkflowCard) แทนปุ่มส่งต่อทั่วไป ให้เส้นทางเร่งด่วนส่งถึง ผอ. ได้ทางเดียว
 * โดยตรวจลายมือชื่อผู้เสนอและเพดานรวม 180 วัน (GAP-014)
 */
export const FastTrackSubmitPanel: React.FC<FastTrackSubmitPanelProps> = ({ caseItem, onActionComplete }) => {
  const { submitFastTrackForDecision } = useCaseStore()
  const forms = useFormDraftStore()
  const draft4 = selectCaseDraft(forms, 4, caseItem.no)
  const draft5 = selectCaseDraft(forms, 5, caseItem.no)

  const [submitNote, setSubmitNote] = useState('จัดทำ คบ.4 และร่างคำสั่ง คบ.5 พร้อมหลักฐานภัยคุกคามครบถ้วนแล้ว')

  const step = fastTrackStep(caseItem)
  const fastTrack = caseItem.fastTrack
  const isRework = step === 'returned'
  /** วิธีที่ติ๊กไว้ในข้อ 4.2 ของ คบ.4 — เป็นค่าที่ส่งเข้าแฟ้มตอนกดเสนอ (WIT0603) */
  const draftMethods = readRoutableProtectionMethods(draft4, KB4_PROTECTION_METHOD_FIELD) as ProtectionMethodNo[]
  /** WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวอ่านจากร่าง คบ.5 · ต้องอยู่ในเพดานรวม 180 วันของ Episode เดียวกัน */
  const period = kb5TemporaryPeriod(draft5)
  const requestedDays = period.days
  const durationCheck = temporaryDurationCheck(caseItem, requestedDays)
  const formGate = submitFastTrackGate(caseItem, draftMethods, requestedDays, period.error, readMethodSubitems(draft4))
  /** ผู้เสนอต้องลงลายมือชื่อท้าย คบ.4 ก่อนส่ง ผอ. — รอบแก้ไขถูกล้างและต้องลงนามใหม่ (resetFastTrackSignatures) */
  const officerSign = forms.draftCaseNo[4] === undefined || forms.draftCaseNo[4] === caseItem.no
    ? forms.signatures['kb4-officer']
    : forms.caseDrafts[caseItem.no]?.signatures['kb4-officer']
  const gate =
    formGate.unlocked && !officerSign?.signed
      ? { unlocked: false, reason: 'ผู้เสนอยังไม่ได้ลงนามในแบบ คบ.4 — เปิดแบบ คบ.4 แล้วกด "ลงนาม" ท้ายหน้า' }
      : formGate
  const periodLabel = `${formatThaiDate(period.startIso)} – ${formatThaiDate(period.endIso)}`

  const handleSubmit = () => {
    if (!gate.unlocked) {
      showToast(gate.reason || 'ยังส่งให้ ผอ. พิจารณาไม่ได้')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: isRework ? 'ส่งฉบับแก้ไขให้ ผอ. ตรวจใหม่?' : 'ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ.?',
      html: confirmBody(
        isRework
          ? 'ฉบับแก้ไขจะถูกส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง'
          : 'แบบ คบ.4 พร้อมร่างคำสั่ง คบ.5 จะถูกเสนอตรงถึง ผอ.สำนัก/กอง',
        [
          ['วิธีคุ้มครองที่เสนอ', draftMethods.map((m) => `วิธีที่ ${m}`).join(' · ') || 'ยังไม่ระบุ'],
          ['ระยะเวลาคุ้มครองชั่วคราวตามร่าง คบ.5', `${periodLabel} รวม ${requestedDays} วัน (คงเหลือจากเพดานรวม ${durationCheck.remaining} วัน)`],
          ['ผู้เสนอลงนาม คบ.4', officerSign?.signerName || '-'],
          ['ความเห็นประกอบ', submitNote.trim() || '-'],
        ],
        'แฟ้มย้ายไปอยู่กับ ผอ.สำนัก/กอง ทันที <strong>โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong> และจะแก้ไขเองไม่ได้จนกว่า ผอ. จะส่งกลับ'
      ),
      showCancelButton: true,
      confirmButtonText: isRework ? 'ยืนยันส่งตรวจใหม่' : 'ยืนยันส่งตรง ผอ.',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      submitFastTrackForDecision(caseItem.no, draftMethods, submitNote.trim() || undefined, {
        days: requestedDays,
        startDate: period.startIso,
      })
      if (fastTrackStep(useCaseStore.getState().getCase(caseItem.no) || caseItem) !== 'director_review') {
        showToast('ยังส่งไม่สำเร็จ กรุณาตรวจสอบข้อมูลแล้วลองอีกครั้ง')
        return
      }
      showToast('ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ.สำนัก/กอง แล้ว — ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
      onActionComplete?.()
    })
  }

  return (
    <div className="space-y-4" data-testid="fast-track-submit-panel" data-fast-track-step={step || 'drafting'}>
      {/* WIT0607 — ประเด็นที่ ผอ. สั่งให้แก้ ค้างอยู่บนแฟ้มจนกว่าจะส่งฉบับแก้ไขขึ้นไปใหม่ */}
      {isRework && (
        <div
          data-testid="fast-track-return-banner"
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-[0.88rem] text-amber-900 leading-relaxed"
        >
          <strong className="block mb-0.5">
            <i className="fa-solid fa-rotate-left mr-1.5" />
            ผอ.สำนัก/กอง ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5
          </strong>
          <span className="block">ประเด็น: {fastTrack?.returnIssueLabel}</span>
          <span className="block">ข้อสั่งการ: {fastTrack?.returnNote}</span>
          <span className="block mt-1">
            แก้แล้ว <strong>ส่งกลับ ผอ. ตรวจใหม่โดยตรง ไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong>
          </span>
        </div>
      )}

      <div>
        <label htmlFor="fast-track-submit-note" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
          ความเห็นประกอบการส่ง
        </label>
        <VoiceTextarea
          id="fast-track-submit-note"
          rows={2}
          value={submitNote}
          data-testid="fast-track-submit-note"
          onChange={(e) => setSubmitNote(e.target.value)}
          className="ws-input w-full text-ink"
        />
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
        {!gate.unlocked && (
          <p className="text-[0.8rem] font-semibold text-amber-700">
            <i className="fa-solid fa-lock mr-1" />
            {gate.reason}
          </p>
        )}
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={!gate.unlocked}
          data-testid="fast-track-submit-button"
          variant="primary"
          size="lg"
        >
          <i className="fa-solid fa-bolt" />
          {isRework ? 'ส่งฉบับแก้ไขให้ ผอ. ตรวจใหม่' : 'ส่งตรง ผอ. พิจารณาคุ้มครองชั่วคราว'}
        </Button>
      </div>
    </div>
  )
}
