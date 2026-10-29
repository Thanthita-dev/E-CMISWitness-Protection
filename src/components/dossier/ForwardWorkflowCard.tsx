import { isGotIntakeCase } from '../../lib/protectionHandoff'
import { createPortal } from 'react-dom'
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
import { kb1Completed } from '../../lib/intakeSequence'
import { UrgencyScreeningPanel } from './UrgencyScreeningPanel'
import { FastTrackSubmitPanel } from './FastTrackSubmitPanel'
import { FastTrackPanel } from './FastTrackPanel'
import {
    FAST_TRACK_RETURN_ISSUES,
    RETURN_ISSUE_CATALOG,
    isCaseWorkerRole,
    protectionMethodSelectionIssue,
    readMethodSubitems,
    readRoutableProtectionMethods,
} from '../../lib/constants'
import { fastTrackStep, temporaryDecisionPending } from '../../lib/fastTrack'
import { isKb6Prepared, KB6_SIGNERS } from '../../lib/formSignature'
import { methodWorkOpened } from '../../lib/methodProgress'
import { showToast, MySwal } from '../../lib/swal'
import { VoiceTextarea } from '../common/VoiceTextarea'

interface ForwardWorkflowCardProps {
    urgencySlot?: HTMLElement | null
    caseItem: CaseItem
    onActionComplete?: () => void
}

const FORWARD_LABELS: Record<string, string> = {
    officer_intake: 'ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
    director_assign: 'ส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
    staff_review: 'ส่งเจ้าของสำนวนที่ได้รับมอบหมาย',
    supervisor_review: 'ส่งผู้บังคับบัญชาชั้นต้น',
    director_review: 'เสนอ ผอ.สำนัก/กอง',
    /** ผอ.ลงนาม คบ.6 แล้วต้องผ่านธุรการสำนัก/กอง ออกเลขทะเบียนส่งก่อน (ขั้นนั้นจัดการที่ SarabanTransitCard) */
    director_outgoing_registry: 'ส่งธุรการสำนัก/กอง ออกเลขทะเบียนส่ง',
    deputy_review: 'ส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง',
    external_pending: 'เสนอเลขาธิการ ป.ป.ท.',
}

type ReturnDestination = 'owner' | 'got'

const ReturnModalBody: React.FC<{
    catalog: ReturnIssue[]
    /** FB-018 — รองเลขาธิการฯ เลือกปลายทางส่งกลับ: เจ้าของเรื่อง หรือ กอท. */
    withDestination?: boolean
    onCancel: () => void
    onConfirm: (issue: string, note: string, destination: ReturnDestination) => void
}> = ({ catalog, withDestination, onCancel, onConfirm }) => {
    const [issue, setIssue] = useState(catalog[0]?.value ?? '')
    const [note, setNote] = useState('')
    const [destination, setDestination] = useState<ReturnDestination>('owner')

    return (
        <div className="space-y-3 text-left">
            {withDestination && (
                <fieldset data-testid="return-destination-group" className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <legend className="px-1 text-[0.8rem] font-semibold text-slate-700">ส่งกลับให้ใครแก้ไข <span className="text-danger">*</span></legend>
                    <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {([
                            ['owner', 'เจ้าของเรื่อง', 'เจ้าของสำนวนเดิม / ผอ.สำนัก/กอง ตามประเด็นที่เลือก'],
                            ['got', 'กอท.', 'กองอำนวยการต่อต้านทุจริต — ผู้รับผิดชอบ กอท. แก้แล้วเสนอผ่าน ผบช.ต้น → ผอ. กอท.'],
                        ] as const).map(([value, label, hint]) => (
                            <label key={value} className="flex min-h-[44px] cursor-pointer items-start gap-2 text-[0.88rem] text-ink">
                                <input
                                    type="radio"
                                    name="return-destination"
                                    value={value}
                                    checked={destination === value}
                                    data-testid={`return-destination-${value}`}
                                    onChange={() => setDestination(value)}
                                    style={{ width: 18, height: 18, marginTop: 3 }}
                                />
                                <span>
                                    <strong className="block">{label}</strong>
                                    <span className="block text-[0.8rem] text-muted">{hint}</span>
                                </span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}

            <div>
                <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ประเด็นที่ต้องดำเนินการแก้ไข <span className="text-danger">*</span></label>
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
                <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">รายละเอียดข้อสั่งการเพิ่มเติม <span className="text-danger">*</span></label>
                <VoiceTextarea
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
                    onClick={() => onConfirm(issue, note, destination)}
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

export const ForwardWorkflowCard: React.FC<ForwardWorkflowCardProps> = ({ caseItem, onActionComplete, urgencySlot }) => {
    const { currentRole } = useAuthStore()
    const { forwardCase, returnCase, returnFastTrackForRework, getNextStage } = useCaseStore()
    /** ร่างแบบ คบ.6 — ใช้ตรวจเนื้อหาความเห็นข้อ 10-12 ก่อนอนุญาตส่งต่อ */
    const kb6Draft = useFormDraftStore((s) => selectCaseDraft(s, 6, caseItem.no))
    /** คบ.1 ถูกแก้ไขหลังผู้ขอคุ้มครองลงชื่อผ่านลิงก์ — ลายมือชื่อเดิมใช้กับฉบับใหม่ไม่ได้ ต้องลงชื่อฉบับใหม่ก่อนส่งต่อ */
    const kb1Fingerprint = useKb1DocumentForCase(caseItem.no).fingerprint
    const kb1SignedViaLink = useConsentSigningStore((s) => latestSignedFor(s.requests, caseItem.no))
    const kb1NeedsResign = Boolean(kb1SignedViaLink && kb1SignedViaLink.fingerprint !== kb1Fingerprint)
    const [forwardNote, setForwardNote] = useState(
        'ตรวจข้อมูลและเอกสารประกอบครบถ้วนแล้ว เห็นควรเสนอเพื่อโปรดพิจารณาตามลำดับชั้น'
    )

    const isOfficer = isCaseWorkerRole(currentRole)
    /** FB-018 — รอบแก้ไขที่ รองเลขาธิการฯ ส่งให้ กอท. ทำต่อ: ผบช.ต้น / ผอ. กอท. กลั่นกรองแทนสายของสำนัก/กอง */
    const gotStandIn = Boolean(caseItem.gotRevision) || isGotIntakeCase(caseItem)
    const isSupervisor = currentRole === 'supervisor' || currentRole === 'admin' || (gotStandIn && currentRole === 'got_supervisor')
    const isDirector = currentRole === 'director' || currentRole === 'admin' || (gotStandIn && currentRole === 'got_director')
    const isReceiver = currentRole === 'receiver' || currentRole === 'got_receiver' || currentRole === 'admin'
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
     * GAP-014 — ช่วงจัดทำ/แก้ไข คบ.4 และร่าง คบ.5 (WIT0603 · WIT0608) การ์ดนี้ใช้ส่วนส่งของเส้นทางเร่งด่วนแทนปุ่มส่งต่อทั่วไป
     * เพื่อให้ส่งถึง ผอ. ได้ทางเดียวคือผ่านด่านเลือกวิธีตามข้อ 15 และเพดานรวม 180 วัน
     * รวมรอบที่ ผอ. ส่งกลับจากเส้นทางเร่งด่วน (directorReturn = true) ไม่ให้ไหลไปปุ่มส่งฉบับแก้ไขของเส้นทางปกติ
     */
    const fastTrackStepNow = fastTrackStep(caseItem)
    const fastTrackSubmitMode =
        caseItem.stage === 'staff_review' &&
        !isSecretaryRevision &&
        (fastTrackStepNow === 'drafting' || fastTrackStepNow === 'returned')
    /**
     * WIT0605 → WIT0609 — ผอ. ตรวจและตัดสินเรื่องคุ้มครองชั่วคราวในการ์ดนี้ (FastTrackPanel)
     * ปุ่มส่งต่อคำร้องหลักยังไม่ใช้ในช่วงนี้ ส่วนปุ่มส่งกลับแก้ไขทำหน้าที่ WIT0607 (ส่งกลับตรงเจ้าหน้าที่แก้ คบ.4 / ร่าง คบ.5)
     */
    const fastTrackReviewMode = caseItem.stage === 'director_review' && fastTrackStepNow === 'director_review'

    /**
     * ขั้นที่ 3 — ผู้ที่ ผอ.สำนัก/กอง มอบหมาย กลั่นกรองว่าเป็นกรณีปกติหรือเร่งด่วน หลังจัดทำ คบ.1 และเชื่อมโยงคดีหลัก
     * การกลั่นกรองครั้งแรกอยู่ในการ์ดคดีหลัก (MainCaseLinkCard) — การ์ดนี้ตรวจเพียงว่าทำครบก่อนส่งต่อ
     */
    const urgencyAssessed = Boolean(caseItem.urgencyAssessedAt) || Boolean(caseItem.urgency)
    const needsUrgencyAssessment = caseItem.stage === 'staff_review' && !urgencyAssessed
    /** ลำดับงานของเจ้าของสำนวน: คบ.1 ต้องมาก่อนการเชื่อมโยงคดีหลักและการกลั่นกรอง */
    const kb1Done = kb1Completed(caseItem)

    /**
     * WIT0410 — ผลกลั่นกรองแก้ไขได้ตราบใดที่เรื่องยังไม่พ้นชั้นกลั่นกรอง
     * ขั้นเจ้าของสำนวนแก้ได้ที่การ์ดคดีหลัก ส่วนชั้นผู้บังคับบัญชาชั้นต้นทบทวนผลที่การ์ดนี้
     */
    const showUrgencyCard = caseItem.stage === 'supervisor_review' && canForwardThisStage

    /** เงื่อนไขความพร้อมก่อนส่งต่อ */
    const mainCaseReady = Boolean(caseItem.linkedMainCaseId)
    /**
     * เจ้าหน้าที่ที่รับเรื่องเอง (officer_intake) ต้องเชื่อมโยงคดีหลักหรือบันทึก "ไม่พบคดี" ก่อนส่ง ผอ.
     * ธุรการส่ง ผอ. ได้เลยโดยยังไม่เชื่อมโยง — เจ้าของสำนวนที่ได้รับมอบหมายเชื่อมโยงหลังจัดทำ คบ.1
     */
    const mainCaseDeferred = ['receiver_intake', 'director_assign'].includes(caseItem.stage)
    const kb1Ready = !caseItem.kb1SignaturePending && !kb1NeedsResign
    const kb6SupervisorSigned = Boolean(caseItem.kb6SupervisorSignedAt)
    const kb6DirectorSigned = Boolean(caseItem.kb6DirectorSignedAt)
    const kb6DeputySigned = Boolean(caseItem.kb6DeputySignedAt)

    const isAssigned = Boolean(caseItem.assignedOfficerUserId)

    /**
     * WIT0606 → WIT0609 — เคสเร่งด่วนต้องได้ข้อยุติเรื่องคุ้มครองชั่วคราวก่อน จึงจะเดินคำร้องหลักต่อได้
     * ก่อนแก้จุดนี้ เคสเร่งด่วนไหลกลับเข้าเส้นทางปกติที่ชั้น ผอ. ได้ทันที โดยไม่เคยตัดสินเรื่องชั่วคราวเลย
     */
    const temporaryPending = isFastTrack && temporaryDecisionPending(caseItem)

    const blockers: string[] = []
    if (caseItem.stage === 'staff_review' && !kb1Done) blockers.push('ยังไม่ได้จัดทำแบบ คบ.1')
    if (!mainCaseReady && !caseItem.mainCaseNotFound && !mainCaseDeferred) blockers.push('ยังไม่ได้เชื่อมโยงคดีหลัก')
    /**
     * WIT0708 — เมื่อเลขาธิการฯ ส่งกลับ ผอ. ต้องมอบหมายเจ้าหน้าที่ผู้รับผิดชอบให้แก้เป็น Revision ใหม่ก่อน
     * จะเสนอแฟ้มเดิมขึ้นไปใหม่โดยไม่มีรอบแก้ไขไม่ได้
     */
    if (caseItem.activity7State === 'returned' && !caseItem.revisionAssignedAt)
        blockers.push('ยังไม่ได้มอบหมายแก้ไขเป็น Revision ใหม่ตามข้อสั่งการเลขาธิการฯ')
    if (caseItem.stage === 'director_assign' && !isAssigned) blockers.push('ยังไม่ได้มอบหมายเจ้าของสำนวน')
    if (needsUrgencyAssessment) blockers.push('ยังไม่ได้กลั่นกรองความเร่งด่วน (ปกติ / เร่งด่วน)')
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
    /** ชุดเสนอ คบ.6 ต้องเลือกรูปแบบการคุ้มครองในข้อ 8.2 (และตัวเลือกย่อยของข้อ 4) ก่อนเจ้าหน้าที่ส่งต่อครั้งแรก */
    const kb6MethodIssue = protectionMethodSelectionIssue(readRoutableProtectionMethods(kb6Draft), readMethodSubitems(kb6Draft))
    if (caseItem.stage === 'staff_review' && (temporaryDecided || !(isFastTrack || caseItem.fastTracked)) && kb6MethodIssue)
        blockers.push(`${kb6MethodIssue} ในแบบ คบ.6 ข้อ 8.2`)
    /** เส้นทางเร่งด่วนที่ ผอ. อนุมัติ คบ.5 แล้ว ต้องเปิดงานตามวิธีคุ้มครองก่อน จึงส่งคำร้องหลักให้ ผบช.ชั้นต้น ได้ */
    if (caseItem.stage === 'staff_review' && temporaryDecided && caseItem.kb5Approved && !methodWorkOpened(caseItem))
        blockers.push('ยังไม่ได้ดำเนินการตามวิธีคุ้มครองตามคำสั่ง คบ.5 — เปิดงานที่หน้าดำเนินการตามวิธีคุ้มครองก่อน')
    /** WIT0615 — แฟ้มถูกตัดเข้าเร่งด่วนกลางทาง ยังไม่มี คบ.4 / ร่าง คบ.5 ให้ ผอ. ตัดสิน ต้องส่งกลับให้เจ้าหน้าที่จัดทำก่อน */
    const fastTrackNotDrafted = fastTrackStepNow === 'drafting' || fastTrackStepNow === 'returned'
    if (caseItem.stage === 'director_review' && temporaryPending)
        blockers.push(
            fastTrackNotDrafted
                ? 'ยังไม่มี คบ.4 / ร่าง คบ.5 ให้พิจารณาคุ้มครองชั่วคราว — ส่งกลับให้เจ้าหน้าที่จัดทำก่อน'
                : 'ยังไม่ได้พิจารณาคุ้มครองชั่วคราว (คบ.4 / คบ.5) — ตัดสินที่การ์ดเส้นทางเร่งด่วนก่อน'
        )

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
        if (useCaseStore.getState().getCase(caseItem.no)?.stage !== nextStage) {
            showToast('ส่งต่อไม่ได้ กรุณาตรวจสถานะและหน่วยงานของแฟ้ม')
            return
        }
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
            if (blockers[0]) showToast(`ยังส่งต่อไม่ได้: ${blockers[0]}`)
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

    /** WIT0606 แขนง "ไม่ครบ" → WIT0607 — ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบ ไม่ผ่าน ผบช.ชั้นต้น */
    const handleFastTrackReturnClick = () => {
        MySwal.fire({
            title: 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5',
            html: (
                <ReturnModalBody
                    catalog={FAST_TRACK_RETURN_ISSUES}
                    onCancel={() => MySwal.close()}
                    onConfirm={(issue, note) => {
                        if (!note.trim()) {
                            showToast('กรุณาระบุประเด็นและเหตุผลที่ต้องแก้ไข')
                            return
                        }
                        const issueLabel = FAST_TRACK_RETURN_ISSUES.find((i) => i.value === issue)?.label || 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5'
                        returnFastTrackForRework(caseItem.no, issueLabel, note.trim())
                        MySwal.close()
                        showToast('ส่งกลับให้เจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว — ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
                        onActionComplete?.()
                    }}
                />
            ),
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'font-sans rounded-xl' },
        })
    }

    const handleReturnClick = () => {
        if (fastTrackReviewMode) return handleFastTrackReturnClick()
        /** บัญชีสาย กอท. ที่ถือแฟ้มในรอบแก้ไข ส่งกลับตามชั้นเดียวกับ ผบช.ชั้นต้น / ผอ. */
        const actingRole = currentRole === 'got_director' ? 'director' : currentRole === 'got_supervisor' ? 'supervisor' : currentRole
        const catalog =
            actingRole === 'deputy_secretary'
                ? RETURN_ISSUE_CATALOG.deputy_secretary
                : actingRole === 'director'
                    ? RETURN_ISSUE_CATALOG.director
                    : RETURN_ISSUE_CATALOG.supervisor
        MySwal.fire({
            title: 'ส่งกลับแก้ไข / ตีกลับแฟ้มคำร้อง',
            html: (
                <ReturnModalBody
                    catalog={catalog}
                    withDestination={actingRole === 'deputy_secretary'}
                    onCancel={() => MySwal.close()}
                    onConfirm={(issue, note, destination) => {
                        if (!note.trim()) {
                            showToast('กรุณาระบุรายละเอียดข้อสั่งการในการส่งกลับแก้ไข')
                            return
                        }
                        const returnedBy =
                            actingRole === 'deputy_secretary'
                                ? 'รองเลขาธิการ ป.ป.ท.'
                                : actingRole === 'director'
                                    ? gotStandIn ? 'ผู้อำนวยการ กอท.' : 'ผู้อำนวยการสำนัก/กอง'
                                    : gotStandIn ? 'ผู้บังคับบัญชาชั้นต้น กอท.' : 'ผู้บังคับบัญชาชั้นต้น'
                        const issueObj = catalog.find((i) => i.value === issue)
                        /** WIT0510 — ผอ. ส่งกลับตรงเจ้าหน้าที่ผู้รับผิดชอบเป็นค่าตั้งต้น ไม่ย้อนผ่าน ผบช.ชั้นต้น */
                        const targetRole =
                            issueObj?.target || (actingRole === 'deputy_secretary' ? 'director' : 'officer')
                        const returnedByRole =
                            actingRole === 'deputy_secretary' ? 'deputy_secretary' : actingRole === 'director' ? 'director' : 'supervisor'
                        const returned = returnCase(
                            caseItem.no,
                            returnedBy,
                            issueObj?.label || 'ส่งกลับแก้ไข',
                            note,
                            targetRole,
                            returnedByRole,
                            returnedByRole === 'deputy_secretary' ? { destination } : undefined
                        )
                        if (!returned) {
                            showToast(destination === 'got' && returnedByRole === 'deputy_secretary'
                                ? 'ส่งกลับ กอท. ไม่สำเร็จ — ไม่พบผู้รับผิดชอบ กอท. ที่มอบหมายได้'
                                : 'ส่งกลับแก้ไขไม่สำเร็จ — แฟ้มไม่ได้อยู่ในขั้นของผู้สั่ง')
                            return
                        }
                        MySwal.close()
                        showToast(
                            returnedByRole === 'deputy_secretary' && destination === 'got'
                                ? 'ส่งกลับ กอท. แก้ไขเรียบร้อยแล้ว'
                                : 'ส่งกลับแก้ไขเรียบร้อยแล้ว'
                        )
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
                        <p className="text-[0.8rem] text-muted">ส่งต่อตามลำดับชั้นหรือสั่งแก้ไข</p>
                    </div>
                </div>

                {isFastTrack && (
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-[0.8rem] font-semibold text-rose-800 border border-rose-200">
                        <i className="fa-solid fa-bolt mr-1" />
                        เร่งด่วน
                    </span>
                )}
            </div>


            {/* Sheet 06 — เรื่องคุ้มครองชั่วคราว: ผอ. ตรวจ/ตัดสิน · พยานลงนาม คบ.5 · ผลชั่วคราว (แสดงเองตามขั้น) */}
            {isFastTrack && <FastTrackPanel caseItem={caseItem} />}

            {/* WIT0410 — ผบช.ชั้นต้นทบทวนผลกลั่นกรองความเร่งด่วน (ขั้นเจ้าของสำนวนกลั่นกรองที่การ์ดคดีหลัก) */}
            {showUrgencyCard && (urgencySlot
                ? createPortal(<UrgencyScreeningPanel caseItem={caseItem} onActionComplete={onActionComplete} />, urgencySlot)
                : <UrgencyScreeningPanel caseItem={caseItem} onActionComplete={onActionComplete} />)}

            {caseItem.gotRevision && caseItem.appealResolution?.outcome !== 'overturn' && (
                <div
                    data-testid="got-revision-banner"
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-[0.88rem] text-amber-900 leading-relaxed"
                >
                    <strong className="block text-amber-900 mb-0.5">
                        <i className="fa-solid fa-rotate-left mr-1.5" />
                        รองเลขาธิการฯ ส่งกลับให้ กอท. แก้ไข
                    </strong>
                    {caseItem.returnIssueLabel ? <span className="block">ประเด็น: {caseItem.returnIssueLabel}</span> : null}
                    ผู้รับผิดชอบ {caseItem.gotRevision.assigneeName} แก้ คบ.6 เป็นฉบับใหม่ แล้วเสนอผ่าน
                    <strong> ผบช.ต้น กอท. → ผอ. กอท. → รองเลขาธิการฯ</strong> ตามลำดับ
                </div>
            )}

            {isSecretaryRevision && caseItem.appealResolution?.outcome !== 'overturn' && (
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

            {isDirectorRework && !isSecretaryRevision && !fastTrackSubmitMode && (
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

            {temporaryPending && caseItem.stage === 'director_review' && !fastTrackReviewMode && (
                <div
                    data-testid="fast-track-decision-required-banner"
                    className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 text-[0.88rem] text-rose-800 leading-relaxed"
                >
                    <strong className="block text-rose-900 mb-0.5">
                        <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                        ยังไม่ได้พิจารณาคุ้มครองชั่วคราว
                    </strong>
                    {fastTrackNotDrafted ? (
                        <>
                            แฟ้มถูกตัดเข้าเส้นทางเร่งด่วนแต่ยังไม่มี <strong>คบ.4 / ร่าง คบ.5</strong> ให้พิจารณา —
                            กด "ส่งกลับแก้ไข / ตีกลับ" ให้เจ้าหน้าที่ผู้รับผิดชอบจัดทำและส่งตรงกลับมาก่อน
                        </>
                    ) : (
                        <>
                            เคสเร่งด่วนต้องตัดสินเรื่อง <strong>คบ.4 / คบ.5</strong> ที่การ์ดเส้นทางเร่งด่วนก่อน
                            จะข้ามไปเดินคำร้องหลักตามลำดับชั้นทันทีไม่ได้
                        </>
                    )}
                </div>
            )}

            {fastTrackSubmitMode ? (
                canForwardThisStage && <FastTrackSubmitPanel caseItem={caseItem} onActionComplete={onActionComplete} />
            ) : (
                <>
                    {/* Note field */}
                    {!canForwardThisStage && caseItem.stage === 'director_assign' && <p className="text-sm text-muted">รอ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวนและส่งต่อ</p>}
                    {canForwardThisStage && !fastTrackReviewMode && (
                        <div>
                            <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ความเห็นประกอบการส่งต่อ <span className="text-danger">*</span></label>
                            <VoiceTextarea
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

                        {canForwardThisStage && !fastTrackReviewMode && (
                            <Button
                                type="button"
                                onClick={handleForwardClick}
                                disabled={!canForward}
                                data-testid="forward-case-button"
                                variant="primary"
                                size="lg"
                                title={canForward ? undefined : blockers[0]}
                            >
                                <span>{FORWARD_LABELS[nextStage] || 'ส่งต่อ'}</span>
                                <i className="fa-solid fa-arrow-right" />
                            </Button>
                        )}
                    </div>

                    {canForwardThisStage && !canForward && blockers.length > 0 && !fastTrackReviewMode && (
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
                </>
            )}

        </section>
    )
}
