import { Button } from '../common/Button'
import { ApplicantConsentPanel, useKb1DocumentForCase } from '../forms/ApplicantConsentPanel'
import { Kb6SignatureActions } from '../forms/Kb6SignatureActions'
import { useConsentSigningStore } from '../../store/useConsentSigningStore'
import { latestSignedFor } from '../../lib/consentSigning'
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CaseItem, ReturnIssue } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { RETURN_ISSUE_CATALOG, isCaseWorkerRole } from '../../lib/constants'
import { fastTrackStep, temporaryDecisionPending } from '../../lib/fastTrack'
import { isKb6Prepared, KB6_SIGNERS } from '../../lib/formSignature'
import { showToast, showConfirmAlert, confirmBody, MySwal } from '../../lib/swal'

interface ForwardWorkflowCardProps {
  caseItem: CaseItem
  onActionComplete?: () => void
}

const FORWARD_LABELS: Record<string, string> = {
  officer_intake: 'ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน →',
  director_assign: 'ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน →',
  staff_review: 'ส่งเจ้าของสำนวนที่ได้รับมอบหมาย →',
  supervisor_review: 'ส่งผู้บังคับบัญชาชั้นต้น →',
  director_review: 'เสนอ ผอ.สำนัก/กอง →',
  deputy_review: 'ส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง →',
  external_pending: 'เสนอเลขาธิการ ป.ป.ท. →',
}

const ReturnModalBody: React.FC<{
  catalog: ReturnIssue[]
  onCancel: () => void
  onConfirm: (issue: string, note: string) => void
}> = ({ catalog, onCancel, onConfirm }) => {
  const [issue, setIssue] = useState(catalog[0]?.value ?? '')
  const [note, setNote] = useState('')

  return (
    <div className="space-y-3 text-left">
      <div>
        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ประเด็นที่ต้องดำเนินการแก้ไข *</label>
        <select
          value={issue}
          data-testid="return-issue-select"
          onChange={(e) => setIssue(e.target.value)}
          className="ws-input w-full text-ink"
        >
          {catalog.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">รายละเอียดข้อสั่งการเพิ่มเติม *</label>
        <textarea
          rows={4}
          value={note}
          data-testid="return-note-input"
          onChange={(e) => setNote(e.target.value)}
          placeholder="ระบุข้อเท็จจริงหรือเอกสารที่ต้องเพิ่มเติมอย่างชัดเจน..."
          className="ws-input w-full text-ink"
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          size="md"
        >
          ยกเลิก
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(issue, note)}
          data-testid="return-confirm-button"
          variant="danger"
          size="md"
        >
          <i className="fa-solid fa-rotate-left" />
          ยืนยันส่งกลับแก้ไข
        </Button>
      </div>
    </div>
  )
}

export const ForwardWorkflowCard: React.FC<ForwardWorkflowCardProps> = ({ caseItem, onActionComplete }) => {
  const { currentRole } = useAuthStore()
  const { forwardCase, returnCase, getNextStage, assessUrgency } = useCaseStore()
  /** ร่างแบบ คบ.6 — ใช้ตรวจเนื้อหาความเห็นข้อ 10-12 ก่อนอนุญาตส่งต่อ และร่างแบบ คบ.4 — ใช้เตือนก่อนซ่อนเมื่อเปลี่ยนผลประเมิน */
  const kb6Draft = useFormDraftStore((s) => selectCaseDraft(s, 6, caseItem.no))
  const kb4Draft = useFormDraftStore((s) => selectCaseDraft(s, 4, caseItem.no))
  /** คบ.1 ถูกแก้ไขหลังผู้ขอคุ้มครองลงชื่อผ่านลิงก์ — ลายมือชื่อเดิมใช้กับฉบับใหม่ไม่ได้ ต้องลงชื่อฉบับใหม่ก่อนส่งต่อ */
  const kb1Fingerprint = useKb1DocumentForCase(caseItem.no).fingerprint
  const kb1SignedViaLink = useConsentSigningStore((s) => latestSignedFor(s.requests, caseItem.no))
  const kb1NeedsResign = Boolean(kb1SignedViaLink && kb1SignedViaLink.fingerprint !== kb1Fingerprint)
  const [forwardNote, setForwardNote] = useState(
    'ตรวจข้อมูลและเอกสารประกอบครบถ้วนแล้ว เห็นควรเสนอเพื่อโปรดพิจารณาตามลำดับชั้น'
  )
  const [urgencyNote, setUrgencyNote] = useState('')
  const [isEditingUrgency, setIsEditingUrgency] = useState(false)

  const isOfficer = isCaseWorkerRole(currentRole)
  const isSupervisor = currentRole === 'supervisor' || currentRole === 'admin'
  const isDirector = currentRole === 'director' || currentRole === 'admin'
  const isReceiver = currentRole === 'receiver' || currentRole === 'admin'
  /** WIT0513 — รองเลขาธิการฯ เป็นผู้ส่งต่อจากขั้นกลั่นกรองไปยังเลขาธิการฯ */
  const isDeputySecretary = currentRole === 'deputy_secretary' || currentRole === 'admin'

  /** ผู้ที่มีหน้าที่ส่งต่อในขั้นตอนปัจจุบันเท่านั้นจึงเห็นปุ่มส่งต่อ */
  const STAGE_FORWARDERS: Record<string, boolean> = {
    receiver_intake: isReceiver,
    officer_intake: isOfficer,
    director_assign: isDirector,
    staff_review: isOfficer,
    supervisor_review: isSupervisor,
    director_review: isDirector,
    deputy_review: isDeputySecretary,
  }
  const canForwardThisStage = STAGE_FORWARDERS[caseItem.stage] ?? false
  /**
   * WIT0505 (TC-014) — ปุ่มส่งกลับแสดงเฉพาะผู้ที่ถือแฟ้มอยู่ในขั้นของตน (ผบช.=กลั่นกรอง, ผอ.=ขั้น ผอ., รองเลขาฯ=ขั้นรองเลขาฯ)
   * ส่งต่อขั้นถัดไปแล้วไม่มีปุ่ม — ผู้ส่งดึงเรื่องกลับจากมือผู้อื่นไม่ได้ (store returnCase กันซ้ำอีกชั้น)
   */
  const canReturnThisStage =
    (isSupervisor && caseItem.stage === 'supervisor_review') ||
    (isDirector && caseItem.stage === 'director_review') ||
    (isDeputySecretary && caseItem.stage === 'deputy_review')

  const nextStage = getNextStage(caseItem)
  const isFastTrack = Boolean(caseItem.urgent || caseItem.urgency === 'urgent')
  /** WIT0511 — รอบแก้ไขตามข้อสั่งการ ผอ. ส่งกลับขึ้น ผอ. โดยตรง ไม่วนผ่าน ผบช.ชั้นต้น ซ้ำ */
  const isDirectorRework = caseItem.stage === 'staff_review' && Boolean(caseItem.directorReturn)
  /** WIT0709 — Revision ตามข้อสั่งการเลขาธิการฯ ต้องเดินครบทุกขั้นตามลำดับเดิม ห้ามส่งข้ามลำดับชั้น */
  const isSecretaryRevision = Boolean(caseItem.secretaryReturnRework)
  /**
   * WIT0614 (TC-019) — ทางลัดส่งตรง ผอ. มีเฉพาะช่วงก่อนมีข้อยุติคุ้มครองชั่วคราว (คบ.4 → คบ.5)
   * ผอ. อนุมัติ/ไม่อนุมัติแล้ว คำร้องหลักเดินแท็บ 05 ตามปกติ: ต้องมี คบ.6 และผ่าน ผบช.ชั้นต้นก่อน
   */
  const temporaryDecided = isFastTrack && !temporaryDecisionPending(caseItem)
  const willSkipSupervisor =
    caseItem.stage === 'staff_review' && isFastTrack && !temporaryDecided && !isDirectorRework && !isSecretaryRevision

  /**
   * ขั้นที่ 3 — ผู้ที่ ผอ.สำนัก/กอง มอบหมาย เป็นผู้ประเมินว่าเป็นกรณีปกติหรือเร่งด่วน
   * ผลการประเมินกำหนดว่าเรื่องจะไป คบ.6 (ปกติ) หรือ คบ.4 → คบ.5 (เร่งด่วน)
   */
  const urgencyAssessed = Boolean(caseItem.urgencyAssessedAt) || Boolean(caseItem.urgency)
  const needsUrgencyAssessment = caseItem.stage === 'staff_review' && !urgencyAssessed
  const pendingForms = caseItem.pendingIntakeForms || []

  /**
   * WIT0410 — ผลประเมินความเร่งด่วนแก้ไขได้ตราบใดที่เรื่องยังไม่พ้นชั้นกลั่นกรอง
   * เดิมการ์ดนี้แสดงเฉพาะขั้น staff_review ทำให้เหตุภัยที่เกิดขึ้นภายหลังไม่มีทางเปลี่ยนเส้นทางได้เลย
   * ผู้แก้ไขคือ "ผู้ที่ถือแฟ้มอยู่ในขั้นนั้น" เท่านั้น จึงใช้เงื่อนไขเดียวกับผู้มีหน้าที่ส่งต่อ
   */
  const showUrgencyCard =
    (caseItem.stage === 'staff_review' || caseItem.stage === 'supervisor_review') && canForwardThisStage
  /** ขั้นกลั่นกรองเป็นการ "แก้ไข" ผลเดิมเสมอ — ประเมินครั้งแรกทำที่ขั้นเจ้าของสำนวน */
  const isUrgencyRevisionStage = caseItem.stage === 'supervisor_review'

  /** ช่องที่มีค่าจริงในร่าง คบ.4 — ใช้ทั้งเตือนก่อนซ่อนและแนบสำเนาลง Audit Log (TC-008) */
  const kb4FilledEntries = Object.entries(kb4Draft).filter(
    ([, value]) => String(value ?? '').trim() !== ''
  ) as Array<[string, string]>

  const handleAssessUrgency = (urgency: 'normal' | 'urgent') => {
    const note = urgencyNote.trim() || undefined
    /** ผู้บันทึกคือผู้ถือแฟ้มในขั้นนั้น — เจ้าของสำนวนที่ staff_review, ผบช.ชั้นต้นที่ supervisor_review */
    const assessor = isUrgencyRevisionStage ? caseItem.owner : caseItem.assignedOfficer

    const applyAssessment = (extraDetail?: string) => {
      assessUrgency(caseItem.no, urgency, note, assessor, extraDetail)

      /** แก้เป็นเร่งด่วนระหว่างชั้นกลั่นกรอง = ตัดเข้าเส้นทาง คบ.4 → คบ.5 ทันที ไม่ต้องรอลงนาม คบ.6 */
      const reroutesToFastTrack = isUrgencyRevisionStage && urgency === 'urgent'
      if (reroutesToFastTrack) {
        forwardCase(caseItem.no, 'director_review', note || 'แก้ผลประเมินเป็นกรณีจำเป็นเร่งด่วน')
      }

      setUrgencyNote('')
      setIsEditingUrgency(false)
      showToast(
        reroutesToFastTrack
          ? 'แก้ผลประเมินเป็นกรณีจำเป็นเร่งด่วน — ส่งต่อ ผอ.สำนัก/กอง เข้าเส้นทาง คบ.4 → คบ.5 แล้ว'
          : urgency === 'urgent'
          ? 'บันทึกผลประเมิน: กรณีจำเป็นเร่งด่วน — เข้าเส้นทาง คบ.4 → คบ.5'
          : 'บันทึกผลประเมิน: กรณีปกติ — ดำเนินการตามเส้นทาง คบ.3 → คบ.6'
      )
      onActionComplete?.()
    }

    /**
     * TC-008 — เปลี่ยนจากเร่งด่วนกลับเป็นปกติ ระหว่างที่มีร่าง คบ.4 กรอกไว้บางส่วนแล้ว
     * ต้องเตือนก่อนเสมอ เพราะการเปลี่ยนผลจะทำให้ คบ.4 หายไปจากรายการแบบฟอร์มของแฟ้ม (ข้อมูลยังอยู่ในระบบ ไม่ถูกลบ)
     */
    const switchingToNormalWithKb4Draft = isFastTrack && urgency === 'normal' && kb4FilledEntries.length > 0
    if (switchingToNormalWithKb4Draft) {
      const snapshotLines = kb4FilledEntries.map(([label, value]) => `${label}: ${value}`).join('\n')
      showConfirmAlert({
        icon: 'warning',
        title: 'ยืนยันเปลี่ยนผลประเมินเป็นกรณีปกติ',
        html: confirmBody(
          'แฟ้มนี้มีร่างแบบ คบ.4 (บันทึกขอความคุ้มครองพยานชั่วคราวกรณีจำเป็นเร่งด่วน) กรอกข้อมูลไว้บางส่วนแล้ว',
          kb4FilledEntries,
          'คบ.4 จะถูกซ่อนออกจากรายการแบบฟอร์มของแฟ้ม (ไม่ใช่เส้นทางกรณีปกติอีกต่อไป) — <strong>ข้อมูลที่กรอกไว้จะยังถูกเก็บไว้ในระบบ ไม่ถูกลบทิ้ง</strong> และจะถูกบันทึกสำเนาไว้ใน Audit Log ของแฟ้ม'
        ),
        showCancelButton: true,
        confirmButtonText: 'ยืนยันเปลี่ยนเป็นกรณีปกติ',
        cancelButtonText: 'ยกเลิก',
      }).then((result) => {
        if (result.isConfirmed) {
          applyAssessment(`ข้อมูลร่าง คบ.4 ที่ถูกซ่อนจากรายการแบบฟอร์ม (ยังเก็บไว้ในระบบ ไม่ถูกลบ):\n${snapshotLines}`)
        }
      })
      return
    }

    applyAssessment()
  }

  /** เงื่อนไขความพร้อมก่อนส่งต่อ */
  const mainCaseReady = Boolean(caseItem.linkedMainCaseId)
  /**
   * ธุรการรับเรื่องแล้วส่ง ผอ. ได้เลยโดยยังไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง
   * จึงยังไม่บังคับในขั้นธุรการรับเรื่องและขั้น ผอ. มอบหมาย (เจ้าหน้าที่ที่รับเรื่องเองยังเชื่อมโยงก่อนส่งตามเดิม)
   */
  const mainCaseDeferred = ['receiver_intake', 'director_assign'].includes(caseItem.stage)
  const kb1Ready = !caseItem.kb1SignaturePending && !kb1NeedsResign
  const kb6SupervisorSigned = Boolean(caseItem.kb6SupervisorSignedAt)
  const kb6DirectorSigned = Boolean(caseItem.kb6DirectorSignedAt)
  const kb6DeputySigned = Boolean(caseItem.kb6DeputySignedAt)

  /**
   * ขั้นรับเรื่อง (คบ.1) จนถึง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน — ยังไม่มีการจัดทำ คบ.3 / คบ.6
   * ผลคัดกรองความเร่งด่วนตอนรับเรื่อง (screenUrgencyAtIntake) ตั้งค่า urgency ไว้ก่อนแล้ว จึงใช้ urgencyAssessed ตัดสินอย่างเดียวไม่ได้
   */
  const isIntakeStage = ['receiver_intake', 'officer_intake', 'director_assign'].includes(caseItem.stage)
  /** คบ.3 จัดทำโดยเจ้าของสำนวน — ไม่แสดงในขั้นรับเรื่องและขั้นมอบหมาย */
  const showKb3Checklist = !isIntakeStage
  /**
   * TC-001/TC-002 — บรรทัด "บันทึกเสนอความเห็น (คบ.6)" แสดงตั้งแต่ขั้นผู้บังคับบัญชาชั้นต้นเป็นต้นไป
   * (ขั้นที่ คบ.6 ถูกเสนอลงนามตามลำดับชั้นแล้ว) — ขั้นเจ้าของสำนวนใช้บล็อก "ชุดเสนอยังไม่ครบ" แจ้งแทน
   */
  const showKb6Checklist =
    (temporaryDecided || !(isFastTrack || caseItem.fastTracked)) && urgencyAssessed && !isIntakeStage && caseItem.stage !== 'staff_review'

  const isAssigned = Boolean(caseItem.assignedOfficerUserId)

  /**
   * WIT0606 → WIT0609 — เคสเร่งด่วนต้องได้ข้อยุติเรื่องคุ้มครองชั่วคราวก่อน จึงจะเดินคำร้องหลักต่อได้
   * ก่อนแก้จุดนี้ เคสเร่งด่วนไหลกลับเข้าเส้นทางปกติที่ชั้น ผอ. ได้ทันที โดยไม่เคยตัดสินเรื่องชั่วคราวเลย
   */
  const temporaryPending = isFastTrack && temporaryDecisionPending(caseItem)

  const blockers: string[] = []
  if (!mainCaseReady && !caseItem.mainCaseNotFound && !mainCaseDeferred) blockers.push('ยังไม่ได้เชื่อมโยงคดีหลัก')
  /**
   * WIT0708 — เมื่อเลขาธิการฯ ส่งกลับ ผอ. ต้องมอบหมายเจ้าหน้าที่ผู้รับผิดชอบให้แก้เป็น Revision ใหม่ก่อน
   * จะเสนอแฟ้มเดิมขึ้นไปใหม่โดยไม่มีรอบแก้ไขไม่ได้
   */
  if (caseItem.activity7State === 'returned' && !caseItem.revisionAssignedAt)
    blockers.push('ยังไม่ได้มอบหมายแก้ไขเป็น Revision ใหม่ตามข้อสั่งการเลขาธิการฯ')
  if (caseItem.stage === 'director_assign' && !isAssigned) blockers.push('ยังไม่ได้มอบหมายเจ้าของสำนวน')
  if (needsUrgencyAssessment) blockers.push('ยังไม่ได้ประเมินความเร่งด่วน (ปกติ / เร่งด่วน)')
  if (caseItem.stage === 'staff_review' && !kb1Ready) blockers.push('พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1')
  /**
   * WIT0501 — เส้นทางปกติส่งชุดเสนอให้ ผบช.ชั้นต้น กลั่นกรองได้ต่อเมื่อชุดเสนอมี คบ.6 จริง
   * เส้นทางเร่งด่วนไม่ผ่านด่านนี้ เพราะยังไม่ต้องจัดทำ คบ.6 ก่อนเสนอ ผอ. (WIT0602)
   * ใช้ isFastTrack ตัวเดียวกับที่การ์ดนี้ใช้ตัดสินเส้นทางทุกจุด แล้วรวม fastTracked เข้าไปด้วย
   * เพราะแฟ้มที่ถูกส่งกลับจากเส้นทางเร่งด่วน (คบ.4 / คบ.5) ยังค้างธง fastTracked ไว้แม้ผลประเมินถูกปรับแล้ว
   */
  if (
    caseItem.stage === 'staff_review' &&
    (temporaryDecided || !(isFastTrack || caseItem.fastTracked)) &&
    !isKb6Prepared(caseItem)
  )
    blockers.push('ชุดเสนอยังไม่ครบ — ยังไม่ได้จัดทำแบบ คบ.6')
  if (caseItem.stage === 'director_review' && temporaryPending)
    blockers.push('ยังไม่ได้พิจารณาคุ้มครองชั่วคราว (คบ.4 / คบ.5) — ตัดสินที่การ์ดเส้นทางเร่งด่วนก่อน')

  /**
   * TC-015 — ผู้ถือแฟ้มในขั้นกลั่นกรอง (ผบช.ชั้นต้น/ผอ./รองเลขาธิการฯ) ต้องกรอกความเห็นข้อ 10-12
   * ของตนเองใน คบ.6 ก่อน จึงจะลงนามและส่งต่อได้ — บล็อกนี้ให้ข้อความชี้ชัดว่าติดที่ข้อไหน แยกจาก
   * บล็อก "ยังไม่ได้ลงนาม" เดิม (ซึ่งใช้เมื่อกรอกความเห็นแล้วแต่ยังไม่กดลงนามรับรอง)
   * ยกเว้นขั้น director_review ระหว่างที่ยังค้างตัดสินคุ้มครองชั่วคราว (temporaryPending) — ให้ตัดสินเรื่องนั้นก่อน
   */
  const skipKb6OpinionCheck = caseItem.stage === 'director_review' && temporaryPending
  const kb6Signer = KB6_SIGNERS.find((s) => s.stage === caseItem.stage)
  const kb6OpinionEmpty = Boolean(
    kb6Signer &&
      !skipKb6OpinionCheck &&
      !kb6Signer.signedAt(caseItem) &&
      !String(kb6Draft[kb6Signer.opinionField] ?? '').trim()
  )
  /** โหมดสาธิต — ไม่บังคับกรอกความเห็นก่อน: กด "ลงนาม" แล้วระบบเติมความเห็นตั้งต้นให้ (Kb6SignatureActions) */
  {
    if (caseItem.stage === 'supervisor_review' && !kb6SupervisorSigned)
      blockers.push('ผู้บังคับบัญชาชั้นต้นยังไม่ได้ลงนามความเห็นใน คบ.6')
    /**
     * เดิมยกเว้นเงื่อนไขลงนาม คบ.6 ให้เคสเร่งด่วน ทำให้เส้นทางเร่งด่วนต่างจากปกติแค่การข้าม ผบช.ชั้นต้น
     * ตาม WIT0614 คำร้องหลักของเคสเร่งด่วนต้องเดินผ่านแท็บ 05 และ 07 ตามปกติ จึงต้องลงนาม คบ.6 เหมือนกัน
     */
    if (caseItem.stage === 'director_review' && !kb6DirectorSigned && !temporaryPending)
      blockers.push('ผอ.สำนัก/กอง ยังไม่ได้ลงนามใน คบ.6')
    /** WIT0513 — รองเลขาธิการฯ ลงนามความเห็นข้อ 12 ใน คบ.6 ก่อนเสนอเลขาธิการฯ */
    if (caseItem.stage === 'deputy_review' && !kb6DeputySigned)
      blockers.push('รองเลขาธิการฯ ยังไม่ได้ลงนามความเห็นใน คบ.6')
  }

  const canForward = blockers.length === 0

  const handleConfirmForward = () => {
    forwardCase(caseItem.no, nextStage, forwardNote)
    showToast(
      isSecretaryRevision
        ? 'ส่ง Revision ต่อตามลำดับเดิมเรียบร้อยแล้ว'
        : isDirectorRework
        ? 'ส่งฉบับแก้ไขกลับ ผอ.สำนัก/กอง ตรวจใหม่โดยตรงแล้ว'
        : willSkipSupervisor
        ? 'ส่งตรงถึง ผอ.สำนัก/กอง ตามเส้นทางกรณีจำเป็นเร่งด่วนแล้ว'
        : 'ส่งต่อแฟ้มคำร้องตามลำดับชั้นเรียบร้อยแล้ว'
    )
    onActionComplete?.()
  }

  const handleForwardClick = () => {
    if (!canForward) {
      showToast(`ยังส่งต่อไม่ได้: ${blockers[0]}`)
      return
    }
    MySwal.fire({
      icon: 'question',
      title: 'ยืนยันการส่งต่อ',
      html: (
        <div className="space-y-3 text-left">
          <p className="text-[0.88rem] text-slate-600 leading-relaxed">
            ยืนยันส่งต่อแฟ้มคำร้อง{willSkipSupervisor ? 'ตรงถึง ผอ.สำนัก/กอง ตามเส้นทางกรณีจำเป็นเร่งด่วน' : 'ไปยังขั้นตอนถัดไป'}{' '}
            — <strong>{FORWARD_LABELS[nextStage] || 'ส่งต่อ'}</strong>
          </p>
          {caseItem.stage === 'director_assign' && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3 text-[0.88rem] text-amber-900 leading-relaxed">
              <span className="block font-bold text-amber-900 mb-0.5">เจ้าของสำนวนที่จะส่งต่อ</span>
              {caseItem.assignedOfficer} — หลังยืนยันจะไม่สามารถเปลี่ยนเจ้าของสำนวนจากขั้นตอนนี้ได้อีก
              หากต้องการเปลี่ยน ให้กด "ยกเลิก" แล้วกด "เปลี่ยนเจ้าของสำนวน" ในการ์ดมอบหมายก่อน
            </div>
          )}
          {forwardNote.trim() && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[0.88rem] text-slate-700 leading-relaxed">
              <span className="block font-bold text-muted mb-0.5">ความเห็นประกอบการส่งต่อ</span>
              {forwardNote}
            </div>
          )}
        </div>
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่งต่อ',
      cancelButtonText: 'ยกเลิก',
      reverseButtons: true,
      confirmButtonColor: '#16558f',
      cancelButtonColor: '#62738a',
      customClass: {
        popup: 'font-sans rounded-xl',
        confirmButton: 'px-5 py-2.5 rounded-lg font-medium text-white',
        cancelButton: 'px-5 py-2.5 rounded-lg font-medium text-white',
      },
    }).then((result) => {
      if (result.isConfirmed) {
        handleConfirmForward()
      }
    })
  }

  const handleReturnClick = () => {
    const catalog =
      currentRole === 'deputy_secretary'
        ? RETURN_ISSUE_CATALOG.deputy_secretary
        : currentRole === 'director'
        ? RETURN_ISSUE_CATALOG.director
        : RETURN_ISSUE_CATALOG.supervisor
    MySwal.fire({
      title: 'ส่งกลับแก้ไข / ตีกลับแฟ้มคำร้อง',
      html: (
        <ReturnModalBody
          catalog={catalog}
          onCancel={() => MySwal.close()}
          onConfirm={(issue, note) => {
            if (!note.trim()) {
              showToast('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
              return
            }
            const returnedBy =
              currentRole === 'deputy_secretary'
                ? 'รองเลขาธิการ ป.ป.ท.'
                : currentRole === 'director'
                ? 'ผู้อำนวยการสำนัก/กอง'
                : 'ผู้บังคับบัญชาชั้นต้น'
            const issueObj = catalog.find((i) => i.value === issue)
            /** WIT0510 — ผอ. ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบเป็นค่าตั้งต้น ไม่ย้อนผ่าน ผบช.ชั้นต้น */
            const targetRole =
              issueObj?.target || (currentRole === 'deputy_secretary' ? 'director' : 'officer')
            const returnedByRole =
              currentRole === 'deputy_secretary' ? 'deputy_secretary' : currentRole === 'director' ? 'director' : 'supervisor'
            returnCase(caseItem.no, returnedBy, issueObj?.label || 'ส่งกลับแก้ไข', note, targetRole, returnedByRole)
            MySwal.close()
            showToast('ส่งกลับแก้ไขเรียบร้อยแล้ว')
            onActionComplete?.()
          }}
        />
      ),
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'font-sans rounded-xl' },
    })
  }

  return (
    <section className="ws-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
            <i className="fa-solid fa-paper-plane text-sm" />
          </div>
          <div>
            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">ส่งงานและดำเนินการในขั้นตอนนี้</h2>
            <p className="text-[0.8rem] text-muted">ตรวจสอบเงื่อนไขความพร้อม และส่งต่อตามลำดับชั้นหรือสั่งแก้ไข</p>
          </div>
        </div>

        {isFastTrack && (
          <span className="rounded-full bg-rose-100 px-3 py-1 text-[0.8rem] font-semibold text-rose-800 border border-rose-200">
            <i className="fa-solid fa-bolt mr-1" />
            Fast Track เร่งด่วน
          </span>
        )}
      </div>

      {/* Conditions checklist */}
      <div className="space-y-2 rounded-xl bg-slate-50 border border-slate-200 p-4 text-[0.8rem]">
        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <i className="fa-solid fa-circle-check text-emerald-600" />
          <span>บันทึกคำร้องและข้อมูลผู้ยื่นครบถ้วน</span>
        </div>

        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <i
            className={`fa-solid ${
              mainCaseReady
                ? 'fa-circle-check text-emerald-600'
                : caseItem.mainCaseNotFound
                ? 'fa-circle-xmark text-rose-500'
                : 'fa-circle-exclamation text-amber-500'
            }`}
          />
          <span>
            {mainCaseReady
              ? 'เชื่อมโยงคดีหลักเรียบร้อยแล้ว'
              : caseItem.mainCaseNotFound
              ? 'ยังไม่พบเลขสำนวนหลัก — บันทึกเหตุผลแล้ว ส่งให้ ผอ.สำนัก/กอง มอบหมายต่อได้'
              : mainCaseDeferred
              ? 'ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง ส่งต่อได้'
              : 'ยังไม่ได้เชื่อมโยงคดีหลัก (ต้องเชื่อมโยงก่อนส่งต่อ)'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-700 font-medium">
          <i className={`fa-solid ${kb1Ready ? 'fa-circle-check text-emerald-600' : 'fa-circle-exclamation text-amber-500'}`} />
          <span>
            {kb1Ready
              ? 'ลายมือชื่อยินยอมในแบบ คบ.1 ครบถ้วน'
              : kb1NeedsResign
                ? 'คบ.1 ถูกแก้ไขหลังผู้ขอคุ้มครองลงชื่อ — ต้องลงชื่อฉบับใหม่'
                : 'รับแจ้งทางโทรศัพท์ (คบ.2) — รอพยานเข้ามาลงนามยินยอมใน คบ.1'}
          </span>
        </div>

        {showKb3Checklist && (
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <i className={`fa-solid ${caseItem.kb3Skipped ? 'fa-circle-minus text-muted' : 'fa-circle-check text-emerald-600'}`} />
            <span>
              {caseItem.kb3Skipped
                ? `ข้าม คบ.3 แล้ว — เหตุผล: ${caseItem.kb3SkipReason}`
                : 'บันทึกข้อเท็จจริงประกอบคำร้อง (คบ.3) อยู่ในแฟ้ม'}
            </span>
          </div>
        )}

        {showKb6Checklist && (
          <div className="flex items-center gap-2 text-slate-700 font-medium">
            <i
              className={`fa-solid ${
                kb6SupervisorSigned || kb6DirectorSigned || kb6DeputySigned
                  ? 'fa-circle-check text-emerald-600'
                  : 'fa-circle-exclamation text-amber-500'
              }`}
            />
            <span>
              บันทึกเสนอความเห็น (คบ.6):{' '}
              {kb6DeputySigned
                ? `รองเลขาธิการฯ ลงนามแล้ว ${caseItem.kb6DeputySignedAt}`
                : kb6DirectorSigned
                ? `ผอ.สำนัก/กอง ลงนามแล้ว ${caseItem.kb6DirectorSignedAt}`
                : kb6SupervisorSigned
                ? `ผบช.ชั้นต้นลงนามแล้ว ${caseItem.kb6SupervisorSignedAt}`
                : 'ยังไม่มีลายมือชื่อตามลำดับชั้น'}
            </span>
          </div>
        )}
      </div>

      {/* ขั้นที่ 3 — ประเมินความเร่งด่วนโดยผู้ที่ ผอ. มอบหมาย (แก้ไขได้ถึงชั้นกลั่นกรอง WIT0410) */}
      {showUrgencyCard && (
        <div
          className={`rounded-xl border p-4 space-y-3 ${
            urgencyAssessed ? 'border-slate-200 bg-slate-50/60' : 'border-amber-300 bg-amber-50/70'
          }`}
        >
          <div className="flex items-center gap-2 text-[0.8rem] font-semibold text-navy">
            <i className={`fa-solid ${urgencyAssessed ? 'fa-circle-check text-emerald-600' : 'fa-triangle-exclamation text-amber-600'}`} />
            <span>
              {isUrgencyRevisionStage
                ? 'ทบทวนผลการประเมินความเร่งด่วน (ผู้บังคับบัญชาชั้นต้นเป็นผู้ตัดสิน)'
                : 'ประเมินความเร่งด่วน (ผู้รับมอบหมายเป็นผู้ตัดสิน)'}
            </span>
            {pendingForms.length > 0 && (
              <span className="ml-auto rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[0.8rem] font-semibold text-muted">
                ต้องจัดทำ: {pendingForms.join(' / ')}
              </span>
            )}
          </div>

          {urgencyAssessed && !isEditingUrgency ? (
            <>
              <p className="text-[0.88rem] text-slate-600 leading-relaxed">
                ผลการประเมิน:{' '}
                <strong className={isFastTrack ? 'text-rose-700' : 'text-emerald-700'}>
                  {isFastTrack ? 'กรณีจำเป็นเร่งด่วน — คบ.3 → คบ.4 → คบ.5' : 'กรณีปกติ — คบ.3 → คบ.6'}
                </strong>
                {caseItem.urgencyAssessedBy ? ` · โดย ${caseItem.urgencyAssessedBy}` : ''}
                {caseItem.urgencyAssessedAt ? ` · ${caseItem.urgencyAssessedAt}` : ''}
                {caseItem.urgencyAssessmentNote ? ` · ${caseItem.urgencyAssessmentNote}` : ''}
              </p>
              <Button
                type="button"
                onClick={() => {
                  setUrgencyNote(caseItem.urgencyAssessmentNote || '')
                  setIsEditingUrgency(true)
                }}
                variant="secondary"
                size="md"
              >
                <i className="fa-solid fa-pen" />
                แก้ไขผลการประเมิน
              </Button>
            </>
          ) : (
            <>
              <p className="text-[0.88rem] text-amber-800 leading-relaxed">
                {isEditingUrgency
                  ? isUrgencyRevisionStage
                    ? 'เลือกผลการประเมินใหม่ — เลือก "กรณีจำเป็นเร่งด่วน" จะตัดเข้าเส้นทาง คบ.4 → คบ.5 ทันที โดยเอกสารเดิมในแฟ้มยังอยู่ครบ'
                    : 'เลือกผลการประเมินใหม่ — จะบันทึกทับผลเดิมและปรับเส้นทางการส่งต่อตามค่าที่เลือก'
                  : 'ต้องเลือกก่อนจึงจะส่งต่อได้ — ผลการประเมินกำหนดว่าเรื่องจะจบที่ '}
                {!isEditingUrgency && (
                  <>
                    <strong>คบ.6 (ปกติ)</strong> หรือเข้าเส้นทาง <strong>คบ.4 → คบ.5 (เร่งด่วน)</strong>{' '}
                    โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น
                  </>
                )}
              </p>
              <textarea
                rows={2}
                value={urgencyNote}
                onChange={(e) => setUrgencyNote(e.target.value)}
                placeholder="เหตุผลประกอบการประเมิน (ไม่บังคับ)..."
                className="ws-input w-full text-ink"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => handleAssessUrgency('normal')}
                  variant="secondary"
                  size="md"
                >
                  <i className="fa-solid fa-circle-check" />
                  กรณีปกติ (→ คบ.3 → คบ.6)
                </Button>
                <Button
                  type="button"
                  onClick={() => handleAssessUrgency('urgent')}
                  variant="danger"
                  size="md"
                >
                  <i className="fa-solid fa-bolt" />
                  กรณีจำเป็นเร่งด่วน (→ คบ.3 → คบ.4 → คบ.5)
                </Button>
                {isEditingUrgency && (
                  <Button
                    type="button"
                    onClick={() => {
                      setIsEditingUrgency(false)
                      setUrgencyNote('')
                    }}
                    variant="secondary"
                    size="md"
                  >
                    ยกเลิก
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {isSecretaryRevision && (
        <div
          data-testid="secretary-revision-banner"
          className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-[0.88rem] text-blue-900 leading-relaxed"
        >
          <strong className="block text-blue-900 mb-0.5">
            <i className="fa-solid fa-list-ol mr-1.5" />
            Revision ครั้งที่ {caseItem.revisionRound || 1} ตามข้อสั่งการเลขาธิการ ป.ป.ท.
          </strong>
          {caseItem.revisionInstruction ? <span className="block">ข้อสั่งการ: {caseItem.revisionInstruction}</span> : null}
          แก้ คบ.3 และ/หรือ คบ.6 เป็นฉบับใหม่ โดยไม่แก้ทับฉบับที่ลงนามแล้ว แล้วเสนอผ่าน
          <strong> ผู้บังคับบัญชาชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการฯ → เลขาธิการฯ ตามลำดับเดิม · ห้ามส่งข้ามลำดับชั้น</strong>
        </div>
      )}

      {isDirectorRework && !isSecretaryRevision && (
        <div
          data-testid="director-rework-banner"
          className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-[0.88rem] text-amber-900 leading-relaxed"
        >
          <strong className="block text-amber-900 mb-0.5">
            <i className="fa-solid fa-rotate-left mr-1.5" />
            แก้ไขตามข้อสั่งการ ผอ.สำนัก/กอง
          </strong>
          {caseItem.returnIssueLabel ? <span className="block">ประเด็น: {caseItem.returnIssueLabel}</span> : null}
          แก้ คบ.3 / คบ.6 เป็นฉบับใหม่ (เก็บฉบับเดิมไว้) แล้ว
          <strong> ส่งกลับ ผอ.สำนัก/กอง ตรวจใหม่โดยตรง ไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong> —
          ผู้บังคับบัญชาชั้นต้นได้รับแจ้งให้ทราบแล้ว
        </div>
      )}

      {temporaryPending && caseItem.stage === 'director_review' && (
        <div
          data-testid="fast-track-decision-required-banner"
          className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-[0.88rem] text-rose-800 leading-relaxed"
        >
          <strong className="block text-rose-900 mb-0.5">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            ยังไม่ได้พิจารณาคุ้มครองชั่วคราว
          </strong>
          เคสเร่งด่วนต้องตัดสินเรื่อง <strong>คบ.4 / คบ.5</strong> ที่การ์ดเส้นทางเร่งด่วนก่อน
          จะข้ามไปเดินคำร้องหลักตามลำดับชั้นทันทีไม่ได้
        </div>
      )}

      {willSkipSupervisor && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-[0.88rem] text-rose-800 leading-relaxed">
          <strong className="block text-rose-900 mb-0.5">
            <i className="fa-solid fa-bolt mr-1.5" />
            เส้นทางกรณีจำเป็นเร่งด่วน (Fast Track)
          </strong>
          จัดทำ คบ.4 และเสนอขอออกคำสั่ง คบ.5 ส่งตรงถึง ผอ.สำนัก/กอง ได้ทันที
          <strong> โดยไม่ต้องผ่านผู้บังคับบัญชาชั้นต้น</strong>
        </div>
      )}

      {/* Note field */}
      {canForwardThisStage && (
      <div>
        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ความเห็นประกอบการส่งต่อ *</label>
        <textarea
          rows={2}
          value={forwardNote}
          onChange={(e) => setForwardNote(e.target.value)}
          className="ws-input w-full text-ink"
        />
      </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
        {canReturnThisStage && (
          <Button
            type="button"
            onClick={handleReturnClick}
            data-testid="return-case-button"
            variant="secondary"
            size="md"
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            <i className="fa-solid fa-rotate-left" />
            ส่งกลับแก้ไข / ตีกลับ
          </Button>
        )}

        {canForwardThisStage && (
        <Button
          type="button"
          onClick={handleForwardClick}
          disabled={!canForward}
          data-testid="forward-case-button"
          variant="primary"
          size="lg"
          title={canForward ? undefined : blockers[0]}
        >
          <span>{FORWARD_LABELS[nextStage] || 'ส่งต่อ →'}</span>
          <i className="fa-solid fa-arrow-right" />
        </Button>
        )}
      </div>

      {canForwardThisStage && !canForward && (
        caseItem.stage === 'staff_review' && !kb1Ready && blockers[0] === 'พยานยังไม่ได้ลงนามยินยอมในแบบ คบ.1' ? (
          <div className="space-y-2">
            <p className="text-right text-[0.8rem] font-semibold text-amber-700">
              <i className="fa-solid fa-lock mr-1" />
              {blockers[0]} — ส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อด้วยตนเอง
            </p>
            <ApplicantConsentPanel caseNo={caseItem.no} compact />
          </div>
        ) : blockers[0].includes('คบ.6') || (kb6Signer && kb6OpinionEmpty && blockers[0].startsWith('ต้องกรอกความเห็น')) ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            <p className="text-[0.8rem] font-semibold text-amber-700">
              <i className="fa-solid fa-lock mr-1" />
              {blockers[0]}
            </p>
            <Link
              to="/form/$formId"
              params={{ formId: '6' }}
              search={{ caseNo: caseItem.no }}
              className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
            >
              <i className="fa-solid fa-file-signature" />
              ไปลงนามในแบบ คบ.6
            </Link>
            {/* ลงนามได้ทันทีจากหน้าแฟ้ม (ถ้าถึงคิวของบทบาทนี้) */}
            <Kb6SignatureActions caseNo={caseItem.no} />
          </div>
        ) : (
          <p className="text-right text-[0.8rem] font-semibold text-amber-700">
            <i className="fa-solid fa-lock mr-1" />
            {blockers[0]}
          </p>
        )
      )}


    </section>
  )
}
