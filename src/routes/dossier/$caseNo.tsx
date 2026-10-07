import { Button } from "../../components/common/Button"
import React, { useState } from 'react'
import { createFileRoute, Link, useParams, useNavigate } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { Badge } from '../../components/common/Badge'
import { DossierStageTracker } from '../../components/dossier/DossierStageTracker'
import { MainCaseLinkCard } from '../../components/dossier/MainCaseLinkCard'
import { ForwardWorkflowCard } from '../../components/dossier/ForwardWorkflowCard'
import { FastTrackCard } from '../../components/dossier/FastTrackCard'
import { SecretaryDecisionCard } from '../../components/dossier/SecretaryDecisionCard'
import { ProtectionHandoffCard } from '../../components/dossier/ProtectionHandoffCard'
import { canViewHandoffCase, handoffBlocksOperations } from '../../lib/protectionHandoff'
import { DirectorAssignmentCard } from '../../components/dossier/DirectorAssignmentCard'
import { ReturnRevisionAssignmentCard } from '../../components/dossier/ReturnRevisionAssignmentCard'
import { NoticeDispatchCard } from '../../components/dossier/NoticeDispatchCard'
import { SkipKb3Button } from '../../components/dossier/SkipKb3Button'
import { CaseClosedBanner } from '../../components/forms/FormCaseScope'
import { ProtectionOperationsCard } from '../../components/dossier/ProtectionOperationsCard'
import { FileManager } from '../../components/common/FileManager'
import { FormPreviewModal } from '../../components/forms/FormPreviewModal'
import { Kb13RoundsModal } from '../../components/protection/Kb13RoundsModal'
import { Kb15ReviewModal } from '../../components/protection/Kb15ReviewModal'
import { FormSignatureModal } from '../../components/forms/FormSignatureModal'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useAuditStore } from '../../store/useAuditStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { ECMIS_USER_DIRECTORY, FORMS_CATALOG, ROLE_NAMES, STAGE_LABELS } from '../../lib/constants'
import {
    canEditFormsInDossier,
    isCaseClosed,
    canSeeAllForms,
    canSeeDossierCard,
    canSeeFormsSection,
    isCaseOwnedBy,
} from '../../lib/permissions'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { FAST_TRACK_FORM_NUMBERS, formatThaiDate, getCaseFormNumbers, toIsoDate } from '../../lib/utils'
import { activateCaseForms } from '../../lib/formPrefill'
import { canSignFormNow, canSubmitKb8Now, isFormFullySigned, kb11Gate } from '../../lib/formSignature'
import { deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { isFastTrackCase } from '../../lib/fastTrack'

export const Route = createFileRoute('/dossier/$caseNo')({
    component: DossierPage,
})

/** อ้างอิงค่าเดียวคงที่ กัน useFormDraftStore selector คืน object ใหม่ทุก render จนเกิด infinite update loop */
const EMPTY_DRAFT: Record<string, any> = {}

/** ลิงก์นำทางที่หน้าตาเท่าปุ่ม secondary (.ws-button.secondary) — Button เป็น <button> จึงใช้กับ <Link> ไม่ได้ */
const LINK_BUTTON =
    'inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50'
/** ปุ่มที่ยังกดไม่ได้ในแถวแบบฟอร์ม (ข้าม/ล็อก) — ไม่ใช่ปุ่ม จึงใช้ span พร้อม title บอกเหตุผล */
const LINK_BUTTON_DISABLED =
    'inline-flex min-h-[44px] cursor-not-allowed items-center justify-center gap-[0.45rem] rounded-lg border border-line bg-soft px-4 py-[0.68rem] text-[0.88rem] font-semibold text-muted'

function DossierPage() {
    const { caseNo } = useParams({ from: '/dossier/$caseNo' })
    const { currentRole, currentOfficerUserId } = useAuthStore()
    const { getCase, addExtraForm, removeExtraForm, submitKb8ForSignature, draftKb14, draftKb15, submitKb16ForSignature, submitKb17ForSignature, endProtectionForNonApproval } = useCaseStore()
    const formLocks = useFormDraftStore((s) => s.locks)
    const kb14Draft = useFormDraftStore((s) => s.drafts[14] || EMPTY_DRAFT)
    const kb15Draft = useFormDraftStore((s) => s.drafts[15] || EMPTY_DRAFT)
    const kb16Draft = useFormDraftStore((s) => s.drafts[16] || EMPTY_DRAFT)

    const caseItem = getCase(caseNo)
    /**
     * GAP-010 — ร่าง คบ.3/4/5/6 และลายมือชื่อ คบ.5 เป็นของแฟ้มที่เปิดอยู่เท่านั้น
     * สลับเข้ามาตอนเปิดแฟ้ม เพื่อให้ด่านตรวจ (ความเห็น คบ.6, ลายมือชื่อ ผอ. ใน คบ.5) อ่านข้อมูลของแฟ้มนี้จริง
     */
    const caseExists = Boolean(caseItem)
    React.useLayoutEffect(() => {
        const c = useCaseStore.getState().getCase(caseNo)
        if (c && canViewHandoffCase(currentRole, c, currentOfficerUserId)) activateCaseForms(c)
    }, [caseNo, caseExists, currentRole, currentOfficerUserId])
    /** ยังไม่เลือก = 0 — ห้ามตั้งค่าเริ่มต้นเป็นแบบใดแบบหนึ่ง เพราะกดแนบโดยไม่ตั้งใจจะได้ฉบับที่ไม่ได้เห็นบนจอ */
    const [selectedExtraForm, setSelectedExtraForm] = useState(0)
    const navigate = useNavigate()
    const openNoticeWorkspace = (formNo: 9 | 10) => {
        navigate({ to: '/form/$formId', params: { formId: String(formNo) }, search: { caseNo } })
    }
    const [previewFormNo, setPreviewFormNo] = useState<number | null>(null)
    /** แบบ คบ. ที่กำลังเปิดโมดัลลงนามจากรายการแบบฟอร์มในแฟ้ม */
    const [signFormNo, setSignFormNo] = useState<number | null>(null)
    /** เปิดดูรอบรายงาน คบ.13 ที่ผ่านมาจากแถวแบบฟอร์มในแฟ้ม โดยไม่ต้องข้ามไปหน้าติดตามและรายงานผล */
    const [showKb13Rounds, setShowKb13Rounds] = useState(false)
    /** WIT1131 — ผู้บังคับบัญชาเปิดตรวจ คบ.15 จากแถวแบบฟอร์มในแฟ้ม ไม่ต้องเข้าหน้าฟอร์ม */
    const [showKb15Review, setShowKb15Review] = useState(false)
    /** วิธีคุ้มครองที่กำลังเปิดอยู่ในการ์ดแท็บ 08A/08B — กดจากหมุดเส้นทางด้านบนก็เปลี่ยนแท็บได้ */

    /**
     * WIT0306 / Need-to-Know — บันทึกการเข้าถึงแฟ้มพยานทุกครั้งลง Audit Log ไม่ว่าจะมีสิทธิ์หรือไม่
     * ข้อมูลพยานอ่อนไหว จึงต้องตรวจสอบย้อนหลังได้ว่าใครเปิดดูแฟ้มไหนเมื่อใด และถูกปฏิเสธสิทธิ์หรือไม่
     * ตัวบันทึกอยู่คนละที่กับประวัติการดำเนินการ (assignmentHistory) เพื่อไม่ให้ประวัติการทำงานถูกกลบด้วยรายการเปิดดู
     */
    const addAccessLog = useAuditStore((s) => s.addLog)
    const accessGranted = caseItem ? isCaseOwnedBy(currentRole, caseItem, currentOfficerUserId) : false
    const loggedAccessRef = React.useRef<string>('')
    React.useEffect(() => {
        if (!caseItem) return
        const key = `${caseNo}|${currentRole}|${currentOfficerUserId}|${accessGranted}`
        if (loggedAccessRef.current === key) return
        loggedAccessRef.current = key
        const actor = ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId)
        addAccessLog({
            caseNo,
            actorName: actor?.name || currentOfficerUserId,
            actorRole: ROLE_NAMES[currentRole] || currentRole,
            actorUserId: currentOfficerUserId,
            action: accessGranted
                ? 'เปิดดูแฟ้มคำร้องคุ้มครองพยาน'
                : 'พยายามเข้าถึงแฟ้มโดยไม่ได้รับมอบหมาย — จำกัดการแสดงผลตาม Need-to-Know',
            docRef: caseNo,
        })
    }, [caseNo, currentRole, currentOfficerUserId, accessGranted, caseItem, addAccessLog])

    /**
     * TC-070 — ผลคำร้องหลัก "ไม่อนุมัติ" ระหว่างที่ยังคุ้มครองชั่วคราวอยู่ (active/preparing)
     * ต้องยุติช่วงชั่วคราวและย้ายไปเส้นทางแท็บ 09A โดยอัตโนมัติเมื่อเปิดแฟ้ม — ข้อมูล mock ที่ seed ไว้
     * ตรงๆ ข้าม store action ตอน seed จึงต้องพึ่ง effect นี้ตอนโหลดแฟ้มมาปรับให้ถูกต้อง
     * เก็บเป็น Set ไม่ใช่ค่าเดียว เพราะสลับแฟ้ม A → B → A แล้วค่าเดียวจะลืมว่าเคยทำ A ไปแล้ว
     */
    const nonApprovalReconciledRef = React.useRef<Set<string>>(new Set())
    React.useEffect(() => {
        if (!caseItem) return
        if (nonApprovalReconciledRef.current.has(caseNo)) return
        if (caseItem.activity7State !== 'rejected') return
        const tracks = caseItem.methodTracks || []
        if (!tracks.some((t) => t.status === 'active' || t.status === 'preparing')) return
        nonApprovalReconciledRef.current.add(caseNo)
        endProtectionForNonApproval(caseItem.no)
    }, [caseNo, caseItem, endProtectionForNonApproval])

    if (!caseItem) {
        return (
            <div className="ws-card p-8 text-center">
                <h1 className="text-[1.1rem] font-bold text-navy">ไม่พบข้อมูลแฟ้มคำร้อง {caseNo}</h1>
                <Link to="/registry" className="mt-2 inline-block text-[0.88rem] font-semibold text-blue hover:underline">
                    ← กลับหน้าทะเบียนคำร้อง
                </Link>
            </div>
        )
    }

    const isAssignmentStage = caseItem.stage === 'director_assign' || caseItem.stage === 'receiver_intake'
    if (!canViewHandoffCase(currentRole, caseItem, currentOfficerUserId)) {
        return <div className="ws-card p-8 text-center text-ink">ไม่มีสิทธิ์เปิดแฟ้มนี้ในบทบาทปัจจุบัน</div>
    }
    const handoffBlocked = handoffBlocksOperations(currentRole, caseItem, currentOfficerUserId)
    const isProtectionStage =
        caseItem.stage === 'protection' ||
        caseItem.stage === 'terminated' ||
        caseItem.stage === 'transferred' ||
        caseItem.stage === 'withdrawn' ||
        caseItem.stage === 'method_operation' ||
        (caseItem.activity7State === 'approved' && Boolean(caseItem.kb11Signed || caseItem.kb8Signed))
    /**
     * ขั้นที่ 5 (ต่อ) — เมื่อมีผลพิจารณาแล้ว แฟ้มต้องมีการ์ดจัดทำ ลงนาม และนำส่งหนังสือแจ้งผล
     * ทั้งเส้นทางอนุมัติ (คบ.9/11) และไม่อนุมัติ (คบ.10 + สิทธิอุทธรณ์)
     */
    const isNoticeStage =
        caseItem.stage === 'notice' ||
        caseItem.stage === 'appeal' ||
        caseItem.activity7State === 'approved' ||
        caseItem.activity7State === 'rejected'
    /** เจ้าหน้าที่/เจ้าของสำนวนลงมือได้เฉพาะสำนวนที่ตนได้รับมอบหมาย */
    const ownsCase = isCaseOwnedBy(currentRole, caseItem, currentOfficerUserId)
    const stageAllowsForward = ![
        'terminated',
        'transferred',
        'withdrawn',
        'notice',
        'protection',
        'appeal',
        'method_operation',
        'article14',
        'termination_review',
        'termination_order',
    ].includes(caseItem.stage)
    /** สิทธิ์แก้ไขแฟ้ม — อัปโหลดเอกสาร เพิ่ม/ถอนแบบฟอร์ม และบันทึกลายมือชื่อ คบ.1 */
    /** WIT1148 — ปิดงานคุ้มครองแล้วล็อกทั้งแฟ้ม: ไม่มีสิทธิ์แก้ไข/แนบ/ส่งต่อใด ๆ เหลือเพียงดู พิมพ์ ดาวน์โหลด */
    const caseClosed = isCaseClosed(caseItem)
    const canEditDossier = canSeeDossierCard(currentRole, 'editDossier') && ownsCase && !caseClosed && !handoffBlocked
    /** เปิดแก้ไขแบบฟอร์ม คบ. ได้เฉพาะผู้ที่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้ — คนอื่นดูเอกสารได้อย่างเดียว */
    const canEditForm = canEditFormsInDossier(currentRole, caseItem, currentOfficerUserId) && !caseClosed
    const canForward = stageAllowsForward && canSeeDossierCard(currentRole, 'forward') && ownsCase && !caseClosed
    /** ผู้ปฏิบัติต้องได้รับมอบหมายเป็นเจ้าของสำนวนก่อน จึงจะเห็นส่วนแบบฟอร์ม คบ. ในแฟ้มนี้ */
    const seesFormsSection = canSeeFormsSection(currentRole, caseItem, currentOfficerUserId)
    /** ผอ.สำนัก/กอง ก่อนมอบหมายเจ้าของสำนวน ยังไม่เห็นแบบฟอร์ม คบ. และเอกสารหลักฐานของแฟ้มนี้ */
    const directorAwaitingAssignment = currentRole === 'director' && !caseItem.assignedOfficerUserId

    const uniqueForms = getCaseFormNumbers(caseItem)
    /** TC-005 — ยังไม่ได้ประเมินความเร่งด่วน จึงยังตัดสินไม่ได้ว่าเส้นทางจะไป คบ.4/5 (เร่งด่วน) หรือ คบ.6 (ปกติ) */
    const urgencyAssessed = Boolean(caseItem.urgencyAssessedAt) || Boolean(caseItem.urgency)
    /** ก่อนได้รับมอบหมายเป็นเจ้าของสำนวน เห็นได้เฉพาะแบบฟอร์มที่ใช้รับเรื่อง (คบ.1 หรือ คบ.2) */
    const seesAllForms = canSeeAllForms(currentRole, caseItem, currentOfficerUserId)
    const intakeFormNo = caseItem.form === 'คบ.2' ? 2 : 1
    const visibleForms = seesAllForms ? uniqueForms : uniqueForms.filter((n) => n === intakeFormNo)
    /** แบบที่ยังแนบเพิ่มได้ — ประเมินเป็นกรณีปกติแล้ว ไม่ใช่เส้นทาง คบ.4/คบ.5 จึงไม่เปิดให้เลือก (WIT0411) */
    const attachableForms = FORMS_CATALOG.filter(
        (f) =>
            !uniqueForms.includes(f.n) &&
            !(urgencyAssessed && !caseItem.urgent && FAST_TRACK_FORM_NUMBERS.includes(f.n))
    )
    const canAttachSelected = attachableForms.some((f) => f.n === selectedExtraForm)

    /** WIT1112-1116 — ปุ่ม "ส่งตรวจ" ของ คบ.14 ในรายการแบบฟอร์ม ใช้ค่าที่บันทึกไว้ในแบบฟอร์มแล้วส่งเข้าคิวผู้ตรวจ */
    const kb14Requests = caseItem.extensionRequests || []
    const kb14Latest = kb14Requests[kb14Requests.length - 1]
    const kb14Episode = caseItem.episode || deriveEpisode(caseItem)
    const kb14Summary = summarizeEpisode(kb14Episode)
    const kb14Reason = kb14Draft['เหตุผลขยายเวลา']
    const kb14Days = Number(kb14Draft['ขยายวัน']) || 0
    const canSubmitKb14 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        !kb14Summary.atCap &&
        (!kb14Latest || kb14Latest.status === 'returned' || kb14Latest.status === 'rejected') &&
        Boolean(kb14Reason && String(kb14Reason).trim()) &&
        kb14Days > 0

    /** WIT1129-WIT1134 — ปุ่ม "ส่งตรวจ" / "ตรวจ คบ.15" ของ คบ.15 ในรายการแบบฟอร์ม */
    const kb15 = caseItem.kb15
    const kb15Trigger = caseItem.terminationTrigger
    const kb15Reason = String(kb15Draft['เหตุยุติ'] || '').trim()
    const kb15Ref = String(kb15Draft['อ้างอิงเหตุยุติ'] || '').trim()
    const canSubmitKb15 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        Boolean(kb15Trigger) &&
        (!kb15 || kb15.status === 'returned') &&
        Boolean(kb15Reason) &&
        Boolean(kb15Ref)
    /** เหตุผลที่ปุ่มยังกดไม่ได้ — บอกให้ตรงจุดว่าต้องไปทำอะไรก่อน */
    const kb15BlockedReason = !['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole)
        ? 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.15 ตรวจได้'
        : !kb15Trigger
            ? 'ยังไม่ได้บันทึกเหตุเริ่มยุติ — บันทึกที่หน้าจัดทำเรื่องยุติ (คบ.15) ก่อน'
            : kb15?.status === 'submitted'
                ? 'ส่งให้ผู้บังคับบัญชาตรวจแล้ว — รอผลการตรวจ'
                : kb15?.status === 'endorsed'
                    ? 'เห็นชอบแล้ว — เรื่องอยู่ระหว่างผู้มีอำนาจพิจารณาออกคำสั่งยุติ (คบ.16)'
                    : !kb15Ref
                        ? 'กรุณาระบุอ้างอิงเหตุยุติในแบบ คบ.15 ก่อน'
                        : 'กรุณาระบุเหตุแห่งการยุติในแบบ คบ.15 ก่อน'
    const canReviewKb15 = ['supervisor', 'admin'].includes(currentRole) && kb15?.status === 'submitted'

    /** WIT1138 → WIT1139 — ปุ่ม "ส่งให้อนุมัติ" ของ คบ.16 ในรายการแบบฟอร์ม */
    const kb16 = caseItem.kb16
    const canSubmitKb16 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        Boolean(kb16) &&
        !kb16?.signedAt &&
        kb16?.status !== 'submitted'
    /** ค่าที่กรอกในแบบฟอร์ม คบ.16 จะทับค่าร่างจากแท็บ 11D ตอนกดส่งเท่านั้น — ช่องที่เว้นไว้ใช้ค่าร่างเดิม */
    const kb16Patch = () => {
        const pick = (key: string) => String(kb16Draft[key] || '').trim() || undefined
        /** วันที่เก็บเป็น ISO (ค.ศ.) เสมอ — ค่าเก่าที่พิมพ์เป็น dd/mm/พ.ศ. แปลงให้ */
        const pickDate = (key: string) => toIsoDate(pick(key)) || pick(key)
        const orderNo = pick('เลขที่คำสั่ง')
        const year = pick('ปีคำสั่ง')
        return {
            orderNo: orderNo ? (year ? `${orderNo}/${year}` : orderNo) : undefined,
            reason: pick('เหตุยุติ'),
            issuedAt: pickDate('วันที่ออกคำสั่ง'),
            effectiveAt: pickDate('วันที่มีผล'),
            operationStoppedAt: pickDate('วันหยุดปฏิบัติ'),
        }
    }

    /** WIT1141 — ปุ่ม "ส่งให้ลงนาม" ของ คบ.17 ในรายการแบบฟอร์ม เสนอเลขาธิการ ป.ป.ท. ลงนามก่อนออกเลข */
    const kb17 = caseItem.kb17
    const canSubmitKb17 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        Boolean(kb17?.status) &&
        !kb17?.signedAt &&
        kb17?.status !== 'submitted'

    const handleAddExtraForm = () => {
        if (!canAttachSelected) return
        addExtraForm(caseItem.no, selectedExtraForm)
        showToast(`แนบแบบฟอร์ม คบ.${selectedExtraForm} เข้าแฟ้มเรียบร้อยแล้ว`)
        setSelectedExtraForm(0)
    }

    return (
        <div className="min-w-0 space-y-6">
            <BackLink to="/registry">กลับทะเบียนคำร้อง</BackLink>

            <DetailHeaderCard
                kicker="แฟ้มคำร้องอิเล็กทรอนิกส์ · งานคุ้มครองพยาน"
                refNo={caseItem.no}
                title={`ผู้ขอรับการคุ้มครอง: ${caseItem.person}`}
                meta={[
                    `เจ้าของเรื่อง: ${caseItem.owner}`,
                    `ประเภทแบบ: ${caseItem.form}`,
                    `ขั้นตอนปัจจุบัน: ${STAGE_LABELS[caseItem.stage] || caseItem.stage}`,
                    /*
                      WIT0304 — เจ้าของสำนวนคดีหลักเดิมกับผู้รับผิดชอบงานคุ้มครองพยานเป็นคนละบทบาท
                      มอบหมายให้คนละคนกันได้ และต้องแสดงคู่กันในแฟ้มโดยไม่แทนที่กัน
                    */
                    ...(caseItem.mainCaseLeadOfficer || caseItem.assignedOfficer
                        ? [
                              <span key="roles" data-testid="case-officer-roles">
                                  เจ้าของสำนวนคดีหลักเดิม:{' '}
                                  <strong className="font-semibold text-ink">
                                      {caseItem.mainCaseLeadOfficer || 'ยังไม่ได้เชื่อมโยงคดีหลัก'}
                                  </strong>{' '}
                                  | ผู้รับผิดชอบงานคุ้มครองพยาน:{' '}
                                  <strong className="font-semibold text-ink">
                                      {caseItem.protectionHandoff ? caseItem.protectionHandoff.assigneeName || 'รอ ผอ. กอท. มอบหมาย' : caseItem.assignedOfficer || 'รอ ผอ.สำนัก/กอง มอบหมาย'}
                                  </strong>
                              </span>,
                          ]
                        : []),
                ]}
                status={
                    <span data-testid="dossier-header-status">
                        <Badge
                            variant={
                                caseItem.activity7State === 'rejected' || caseItem.returned
                                    ? 'danger'
                                    : caseItem.activity7State === 'approved'
                                      ? 'success'
                                      : 'default'
                            }
                        >
                            {caseItem.status}
                        </Badge>
                    </span>
                }
                owner={`ผู้รับผิดชอบขั้นปัจจุบัน: ${caseItem.owner}`}
            />

            {caseClosed && <CaseClosedBanner />}

            {/* 11-Stage Progress Tracker */}
            <DossierStageTracker caseItem={caseItem} />

            {/* ยังเชื่อมโยงเลขสำนวนหลักไม่ได้ — เดินเรื่องต่อ ห้ามปัดตก (WIT0215) */}
            {caseItem.mainCaseNotFound && !caseItem.linkedMainCaseId && (
                <div className="ws-callout" role="note">
                    <h3 className="text-[0.95rem] font-semibold text-ink">
                        <i className="fa-solid fa-link-slash mr-2" />
                        ยังไม่ได้เชื่อมโยงเลขสำนวนหลัก — คำร้องยังเดินต่อตามปกติ
                    </h3>
                    <p className="mt-1 text-[0.88rem] leading-relaxed">
                        ระเบียบห้ามปัดตกคำร้องเพราะยังไม่มีเลขสำนวนหลัก ให้บันทึกเหตุผลไว้ เสนอ ผอ. มอบหมายต่อ
                        แล้วติดตามเชื่อมโยงเลขสำนวนภายหลัง
                    </p>
                </div>
            )}

            {/* WIT0708 — เลขาธิการฯ ส่งกลับ/ขอข้อมูลเพิ่ม แล้ว ผอ. มอบหมายเจ้าหน้าที่แก้เป็น Revision ใหม่ */}
            {caseItem.activity7State === 'returned' &&
                !caseItem.revisionAssignedAt &&
                canSeeDossierCard(currentRole, 'assignment') && <ReturnRevisionAssignmentCard caseItem={caseItem} />}

            {/* ขั้นที่ 2 — มอบหมายเจ้าของสำนวน */}
            {isAssignmentStage && !caseClosed && canSeeDossierCard(currentRole, 'assignment') && <DirectorAssignmentCard caseItem={caseItem} />}

            {currentRole === 'got_director' && caseItem.protectionHandoff?.step === 'pending_assignment' && <ProtectionHandoffCard caseItem={caseItem} />}

            {/* Main workspace and case summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left 2 Columns */}
                <div className="lg:col-span-2 space-y-6">
                    {caseItem.demoData && !caseItem.protectionHandoff && <p className="ws-readonly text-[0.88rem]">ข้อมูลสำหรับสาธิต · รอเลขาธิการเลือกปลายทางเมื่ออนุมัติ</p>}
                    {caseItem.protectionHandoff && !(currentRole === 'got_director' && caseItem.protectionHandoff.step === 'pending_assignment') && <ProtectionHandoffCard caseItem={caseItem} />}
                    {/* Main Case Linkage */}
                    {canSeeDossierCard(currentRole, 'mainCaseLink') && ownsCase && <MainCaseLinkCard caseItem={caseItem} />}

                    {/* Attached Forms List */}
                    {seesFormsSection && !directorAwaitingAssignment && (
                        <section className="ws-card space-y-4 p-5" data-testid="dossier-forms">
                            <div className="flex items-center justify-between border-b border-line pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-soft text-blue font-bold">
                                        <i className="fa-solid fa-file-lines text-sm" />
                                    </div>
                                    <div>
                                        <p className="ws-kicker">งานของ {ROLE_NAMES[currentRole] || currentRole}</p>
                                        <h2 data-testid="dossier-form-count" className="text-[1.1rem] font-bold text-navy">แบบฟอร์ม คบ. ในแฟ้มนี้ ({visibleForms.length} แบบ)</h2>
                                        <p className="text-[0.8rem] text-muted">คลิกเพื่อเปิดกรอก ตรวจสอบข้อมูล หรือดูฉบับพิมพ์ A4</p>
                                    </div>
                                </div>
                            </div>

                            {!urgencyAssessed && seesAllForms && (
                                <div className="ws-callout text-[0.88rem] leading-relaxed" role="note">
                                    <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                                    ยังไม่ได้ประเมินความเร่งด่วน — กรุณาประเมินความเร่งด่วนก่อน จึงจะเปิดแบบ คบ.4/คบ.6 ได้
                                </div>
                            )}

                            <div className="space-y-2">
                                {visibleForms.map((formNo) => {
                                    const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]
                                    const selectedNotice = caseItem.preliminaryDecision?.formNo === formNo && !caseItem.resultNotices?.[formNo as 9 | 10]?.original
                                    /** คบ.3 ที่ถูกกดข้ามยังอยู่ในแฟ้ม แต่จางลงและเปิดแบบฟอร์มไม่ได้จนกว่าจะกู้คืน */
                                    const isSkipped = formNo === 3 && Boolean(caseItem.kb3Skipped)
                                    /** คบ.11 ยังเปิดไม่ได้จนกว่าจะส่ง/มอบ คบ.9 และบันทึกการรับครบตาม WIT0806 */
                                    const kb11Locked = formNo === 11 ? kb11Gate(caseItem) : null
                                    const isLocked = Boolean(kb11Locked && !kb11Locked.unlocked && caseItem.activity7State !== 'approved' && caseItem.preliminaryDecision?.formNo !== 9)
                                    /** ฉบับลงนามแล้วถูกล็อกถาวร (เช่น คบ.11 หลังพยานยอมรับการคุ้มครอง) — เปิดได้แค่ดูเอกสาร แก้ไขไม่ได้อีก */
                                    const isSignedLocked = Boolean(formLocks[formNo])
                                    /** ถึงคิวลงนามของผู้ใช้คนนี้หรือยัง — ถ้ายังไม่ถึงคิวจะไม่แสดงปุ่มลงนามเลย */
                                    const canSign =
                                        !isSkipped &&
                                        !isLocked &&
                                        canSignFormNow({ formNo, caseItem, currentRole, canEditDossier })
                                    const fullySigned = isFormFullySigned(formNo, caseItem)
                                    /** WIT0817 → WIT0818 — เจ้าหน้าที่เสนอ คบ.8 เข้ารอบลงนามก่อนเลขาธิการฯ จะลงนามได้ */
                                    const canSubmitKb8 = formNo === 8 && !isSkipped && !isLocked && canSubmitKb8Now(caseItem, canEditDossier)
                                    const kb8AwaitingSignature = formNo === 8 && Boolean(caseItem.kb8SubmittedAt) && !fullySigned && !canSign
                                    return (
                                        <div
                                            key={formNo}
                                            data-testid="dossier-form-row" data-form-number={formNo}
                                            className={`rounded-xl border border-line p-3 transition ${selectedNotice ? 'bg-blue-soft border-blue' : isSkipped || isLocked ? 'bg-soft opacity-60' : 'bg-white hover:border-[#9aabba]'
                                                }`}
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue">
                                                        {meta.code}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <strong className="block text-[0.88rem] font-semibold text-navy">{meta.t}</strong>
                                                        <small className="block max-w-sm truncate text-[0.8rem] text-muted">{meta.d}</small>
                                                    </div>
                                                </div>

                                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                                    {formNo === 3 && canEditDossier && (
                                                        <SkipKb3Button caseItem={caseItem} />
                                                    )}

                                                    {/* WIT1112-1116 — ส่ง คบ.14 ที่บันทึกไว้แล้วเข้าคิวผู้ตรวจ ไม่ต้องแยกไปหน้า 11B */}
                                                    {formNo === 14 && canEditDossier && (
                                                        <Button
                                                            type="button"
                                                            disabled={!canSubmitKb14}
                                                            onClick={() => {
                                                                showConfirmAlert({
                                                                    icon: 'question',
                                                                    title: 'ส่ง คบ.14 เข้าคิวผู้ตรวจ?',
                                                                    text: `ขอขยายเวลา ${kb14Days} วัน · เหตุผล: ${String(kb14Reason)}`,
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'ส่งตรวจ',
                                                                    cancelButtonText: 'ยกเลิก',
                                                                }).then((res) => {
                                                                    if (!res.isConfirmed) return
                                                                    draftKb14(caseItem.no, { reason: String(kb14Reason), durationDays: kb14Days })
                                                                    showToast(
                                                                        kb14Latest?.status === 'returned'
                                                                            ? 'จัดทำ คบ.14 เวอร์ชันใหม่แล้ว ส่งให้ผู้ตรวจอีกครั้ง'
                                                                            : 'ส่ง คบ.14 ให้ผู้ตรวจแล้ว'
                                                                    )
                                                                })
                                                            }}
                                                            variant="primary"
 size="md"
                                                            title={
                                                                canSubmitKb14
                                                                    ? 'ส่ง คบ.14 ที่บันทึกไว้เข้าคิวผู้ตรวจ'
                                                                    : 'กรุณาบันทึกแบบ คบ.14 (ระบุเหตุผลและจำนวนวัน) ก่อนจึงส่งตรวจได้'
                                                            }
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่งตรวจ
                                                        </Button>
                                                    )}

                                                    {/* WIT1129-WIT1134 — ส่ง คบ.15 ที่บันทึกไว้ให้ผู้บังคับบัญชาตรวจ ไม่ต้องแยกไปหน้า 11C */}
                                                    {formNo === 15 && canEditDossier && (
                                                        <Button
                                                            type="button"
                                                            disabled={!canSubmitKb15}
                                                            onClick={() => {
                                                                showConfirmAlert({
                                                                    icon: 'question',
                                                                    title: 'ส่ง คบ.15 ให้ผู้บังคับบัญชาตรวจสอบ?',
                                                                    text: `เหตุยุติ: ${kb15Reason} · อ้างอิง ${kb15Ref}`,
                                                                    showCancelButton: true,
                                                                    confirmButtonText: 'ส่งตรวจ',
                                                                    cancelButtonText: 'ยกเลิก',
                                                                }).then((res) => {
                                                                    if (!res.isConfirmed || !kb15Trigger) return
                                                                    draftKb15(caseItem.no, {
                                                                        trigger: kb15Trigger.source,
                                                                        triggerRef: kb15Ref,
                                                                        summary: kb15Reason,
                                                                        evidenceNote: String(kb15Draft['สรุปผล'] || '').trim() || undefined,
                                                                        triggerDocumentName: kb15Trigger.documentName,
                                                                        triggerReceivedAt: kb15Trigger.receivedAt,
                                                                    })
                                                                    showToast(
                                                                        kb15?.status === 'returned'
                                                                            ? 'จัดทำ คบ.15 เวอร์ชันใหม่แล้ว ส่งให้ผู้บังคับบัญชาอีกครั้ง'
                                                                            : 'ส่ง คบ.15 ให้ผู้บังคับบัญชาตรวจสอบแล้ว'
                                                                    )
                                                                })
                                                            }}
                                                            variant="primary"
 size="md"
                                                            title={
                                                                canSubmitKb15
                                                                    ? 'ส่ง คบ.15 ที่บันทึกไว้ให้ผู้บังคับบัญชาตรวจเหตุผลและเอกสารประกอบ'
                                                                    : kb15BlockedReason
                                                            }
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่งตรวจ
                                                        </Button>
                                                    )}

                                                    {/* WIT1141 — กรอกแบบ คบ.17 ในแฟ้มเสร็จแล้ว เสนอเลขาธิการ ป.ป.ท. ลงนามก่อนออกเลขสารบรรณ */}
                                                    {formNo === 17 && canEditDossier && kb17?.status && !kb17.signedAt && (
                                                        kb17.status === 'submitted' ? (
                                                            <Badge variant="warning" icon="fa-hourglass-half">
                                                                รอเลขาธิการฯ ลงนาม
                                                            </Badge>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                disabled={!canSubmitKb17}
                                                                onClick={() => {
                                                                    showConfirmAlert({
                                                                        icon: 'question',
                                                                        title: 'ส่ง คบ.17 ให้เลขาธิการ ป.ป.ท. ลงนาม?',
                                                                        text: 'ลงนามแล้วจึงออกเลขและนำส่งผ่านระบบสารบรรณเดิมได้',
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'ส่งให้ลงนาม',
                                                                        cancelButtonText: 'ยกเลิก',
                                                                    }).then((res) => {
                                                                        if (!res.isConfirmed) return
                                                                        submitKb17ForSignature(caseItem.no)
                                                                        showToast('ส่ง คบ.17 ให้เลขาธิการ ป.ป.ท. ลงนามแล้ว')
                                                                    })
                                                                }}
                                                                variant="primary"
 size="md"
                                                                title={
                                                                    canSubmitKb17
                                                                        ? 'ส่งแบบ คบ.17 ที่กรอกไว้ให้เลขาธิการ ป.ป.ท. ลงนาม'
                                                                        : 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.17 ให้ลงนามได้'
                                                                }
                                                            >
                                                                <i className="fa-solid fa-paper-plane text-xs" />
                                                                ส่งให้ลงนาม
                                                            </Button>
                                                        )
                                                    )}

                                                    {/* WIT1138 → WIT1139 — กรอกแบบ คบ.16 ในแฟ้มเสร็จแล้ว ส่งให้ผู้มีอำนาจอนุมัติและลงนาม */}
                                                    {formNo === 16 && canEditDossier && !kb16?.signedAt && (
                                                        kb16?.status === 'submitted' ? (
                                                            <Badge variant="warning" icon="fa-hourglass-half">
                                                                รอผู้มีอำนาจลงนาม
                                                            </Badge>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                disabled={!canSubmitKb16}
                                                                onClick={() => {
                                                                    const patch = kb16Patch()
                                                                    showConfirmAlert({
                                                                        icon: 'question',
                                                                        title: 'ส่งคำสั่งยุติ คบ.16 ให้ผู้มีอำนาจอนุมัติ?',
                                                                        text: `คำสั่งที่ ${patch.orderNo || kb16?.orderNo || '-'} · มีผล ${formatThaiDate(patch.effectiveAt || kb16?.effectiveAt)}`,
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'ส่งให้อนุมัติ',
                                                                        cancelButtonText: 'ยกเลิก',
                                                                    }).then((res) => {
                                                                        if (!res.isConfirmed) return
                                                                        submitKb16ForSignature(caseItem.no, patch)
                                                                        showToast('ส่งคำสั่ง คบ.16 ให้ผู้มีอำนาจอนุมัติและลงนามแล้ว')
                                                                    })
                                                                }}
                                                                variant="primary"
 size="md"
                                                                title={
                                                                    canSubmitKb16
                                                                        ? 'ส่งแบบ คบ.16 ที่กรอกไว้ให้ผู้มีอำนาจอนุมัติและลงนาม'
                                                                        : 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.16 ให้อนุมัติได้'
                                                                }
                                                            >
                                                                <i className="fa-solid fa-paper-plane text-xs" />
                                                                ส่งให้อนุมัติ
                                                            </Button>
                                                        )
                                                    )}

                                                    {/* WIT1131 — ผู้บังคับบัญชาตรวจ คบ.15 แล้วเห็นชอบหรือส่งคืนแก้ไขจากในแฟ้ม */}
                                                    {formNo === 15 && canReviewKb15 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setShowKb15Review(true)}
                                                            variant="primary"
 size="md"
                                                            title="ตรวจเหตุผลและเอกสารประกอบ แล้วเห็นชอบหรือส่งคืนแก้ไข"
                                                        >
                                                            <i className="fa-solid fa-clipboard-check text-xs" />
                                                            ตรวจ คบ.15
                                                        </Button>
                                                    )}

                                                    {/* รอบรายงาน คบ.13 รายเดือน — เปิดดูจากแฟ้มได้เลย ไม่ต้องเข้าหน้าติดตามและรายงานผล */}
                                                    {formNo === 13 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setShowKb13Rounds(true)}
                                                            variant="secondary"
 size="md"
                                                            title="ดูรอบรายงาน คบ.13 ที่ส่งไปแล้วในแฟ้มนี้"
                                                        >
                                                            <i className="fa-solid fa-clock-rotate-left text-xs" />
                                                            รอบรายงาน ({(caseItem.monthlyReports || []).length})
                                                        </Button>
                                                    )}

                                                    {/* ลงนามแบบ คบ. ที่นี่ที่เดียว — ปุ่มโผล่เฉพาะเมื่อถึงคิวลงนามของผู้ใช้คนนี้ */}
                                                    {fullySigned && (
                                                        <Badge variant="success" icon="fa-circle-check">
                                                            ลงนามแล้ว
                                                        </Badge>
                                                    )}

                                                    {/* คบ.6 — ปุ่ม "ลงนาม" ย้ายไปอยู่ในหน้า /form/6 เอง (ตามลำดับความเห็นข้อ 10-13) ไม่แสดงซ้ำที่รายการแบบฟอร์มนี้ */}
                                                    {canSign && formNo !== 6 && formNo !== 11 && formNo !== 9 && formNo !== 10 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setSignFormNo(formNo)}
                                                            variant="primary"
 size="md"
                                                            title={`ถึงคิวลงนาม ${meta.code} ของท่าน`}
                                                        >
                                                            <i className="fa-solid fa-pen-nib text-xs" />
                                                            ลงนาม
                                                        </Button>
                                                    )}

                                                    {canSubmitKb8 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => {
                                                                submitKb8ForSignature(caseItem.no)
                                                                showToast('เสนอ คบ.8 ให้เลขาธิการ ป.ป.ท. ลงนามแล้ว')
                                                            }}
                                                            variant="primary"
 size="md"
                                                            title="ส่งร่าง คบ.8 ที่จัดทำเสร็จแล้วให้เลขาธิการ ป.ป.ท. ลงนาม"
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่งเสนอเลขาธิการฯ ลงนาม
                                                        </Button>
                                                    )}

                                                    {kb8AwaitingSignature && (
                                                        <Badge variant="warning" icon="fa-hourglass-half">
                                                            รอเลขาธิการ ป.ป.ท. ลงนาม
                                                        </Badge>
                                                    )}

                                                    {formNo === 11 && (caseItem.preliminaryDecision?.formNo === 9 || caseItem.activity7State === 'approved') ? <Link to="/form/$formId" params={{ formId: '11' }} search={{ caseNo }} className={LINK_BUTTON}>เปิดแบบฟอร์ม</Link> : selectedNotice ? (
                                                        <><span className="ws-status">ร่าง รอยืนยันลงนาม</span><Button type="button" variant="secondary" onClick={() => openNoticeWorkspace(formNo as 9 | 10)}>เปิดแบบฟอร์ม</Button></>
                                                    ) : formNo === 6 && canSign ? (
                                                        /* ถึงคิวกรอกความเห็นและลงนาม คบ.6 ของผู้ใช้คนนี้ (ข้อ 10-13) — ผู้บังคับบัญชาแต่ละชั้นไม่ใช่เจ้าของสำนวน
                                                           และฉบับอาจถูกล็อกส่วนของเจ้าหน้าที่แล้ว จึงต้องเปิดหน้าแบบฟอร์มให้ได้ตรงนี้ แทนที่จะเหลือแค่ "ดูเอกสาร" */
                                                        <Link
                                                            to="/form/$formId"
                                                            params={{ formId: String(formNo) }}
                                                            search={{ caseNo }}
                                                            className={LINK_BUTTON}
                                                            title={`ถึงคิวกรอกความเห็นและลงนาม ${meta.code} ของท่าน — ดำเนินการในหน้าแบบฟอร์ม`}
                                                        >
                                                            <i className="fa-solid fa-pen-to-square text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </Link>
                                                    ) : isSkipped ? (
                                                        <span
                                                            className={LINK_BUTTON_DISABLED}
                                                            title="แบบ คบ.3 ถูกกดข้าม — กดกู้คืนก่อนจึงจะเปิดแบบฟอร์มได้"
                                                        >
                                                            <i className="fa-solid fa-ban text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </span>
                                                    ) : isLocked ? (
                                                        <span
                                                            className={LINK_BUTTON_DISABLED}
                                                            title={kb11Locked?.reason}
                                                        >
                                                            <i className="fa-solid fa-lock text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </span>
                                                    ) : isSignedLocked ? (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setPreviewFormNo(formNo)}
                                                            variant="secondary"
 size="md"
                                                            title={formLocks[formNo]?.reason || 'ฉบับลงนามถูกล็อก — แก้ไขไม่ได้ ดูเอกสารได้อย่างเดียว'}
                                                        >
                                                            <i className="fa-solid fa-eye text-xs" />
                                                            ดูเอกสาร
                                                        </Button>
                                                    ) : canEditForm ? (
                                                        <Link
                                                            to="/form/$formId"
                                                            params={{ formId: String(formNo) }}
                                                            search={{ caseNo }}
                                                            className={LINK_BUTTON}
                                                        >
                                                            <i className="fa-solid fa-pen-to-square text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </Link>
                                                    ) : (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setPreviewFormNo(formNo)}
                                                            variant="secondary"
 size="md"
                                                            title="ไม่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้ — ดูเอกสารได้อย่างเดียว"
                                                        >
                                                            <i className="fa-solid fa-eye text-xs" />
                                                            ดูเอกสาร
                                                        </Button>
                                                    )}

                                                    {canEditDossier && formNo > 3 && formNo !== 6 && formNo !== 11 && formNo !== 9 && formNo !== 10 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => removeExtraForm(caseItem.no, formNo)}
                                                            variant="icon"
                                                            size="icon"
                                                            className="hover:bg-rose-50 hover:text-rose-600"
                                                            aria-label="นำแบบฟอร์มออกจากแฟ้ม"
                                                            title="นำแบบฟอร์มออกจากแฟ้ม"
                                                        >
                                                            <i className="fa-solid fa-xmark text-xs" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>

                            {/* Add Extra Form Selector — เฉพาะผู้ที่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้เท่านั้น */}
                            {canEditDossier && (
                                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                                    <select
                                        value={canAttachSelected ? selectedExtraForm : 0}
                                        onChange={(e) => setSelectedExtraForm(Number(e.target.value))}
                                        className="ws-input min-w-0 flex-1 text-ink"
                                        aria-label="เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม"
                                        data-testid="extra-form-select"
                                    >
                                        <option value={0} disabled>
                                            — เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม —
                                        </option>
                                        {attachableForms.map((f) => (
                                            <option key={f.n} value={f.n}>
                                                แนบ {f.code} - {f.t}
                                            </option>
                                        ))}
                                    </select>
                                    <Button
                                        type="button"
                                        onClick={handleAddExtraForm}
                                        disabled={!canAttachSelected}
                                        variant="primary"
 size="md"
                                        data-testid="extra-form-attach"
                                    >
                                        <i className="fa-solid fa-plus" />
                                        แนบเข้าแฟ้ม
                                    </Button>
                                </div>
                            )}
                        </section>
                    )}

                    {/* เอกสารหลักฐานและไฟล์แนบ — ตัวจัดการไฟล์ทั้งแฟ้ม (ไฟล์ใน คบ. ทุกฉบับ + ไฟล์ที่ไม่ผูก คบ.) */}
                    {!directorAwaitingAssignment && (
                        <section className="ws-card space-y-4 p-5">
                            <div className="flex items-center gap-2.5 border-b border-line pb-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-soft text-blue font-bold">
                                    <i className="fa-solid fa-folder-tree text-sm" />
                                </div>
                                <div>
                                    <p className="ws-kicker">เอกสารประกอบแฟ้ม</p>
                                    <h2 className="text-[1.1rem] font-bold text-navy">เอกสารหลักฐานและไฟล์แนบ</h2>
                                    <p className="text-[0.8rem] text-muted">
                                        โฟลเดอร์ของแบบ คบ. แต่ละฉบับ และไฟล์แฟ้มที่ไม่ผูกกับ คบ. — อัปโหลดที่รากแฟ้มเลือกปลายทางได้
                                    </p>
                                </div>
                            </div>

                            <FileManager scope="dossier" caseNo={caseItem.no} canEdit={canEditDossier} />
                        </section>
                    )}

                    {/* ขั้นที่ 5 (ต่อ) — จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล (คบ.8/9/11 หรือ คบ.10) */}
                    {isNoticeStage && !caseClosed && !handoffBlocked && canSeeDossierCard(currentRole, 'notice') && ownsCase && (
                        <NoticeDispatchCard caseItem={caseItem} />
                    )}

                    {/* ขั้นที่ 6-7 — ปฏิบัติการคุ้มครอง รายงานผล และการทบทวน */}
                    {isProtectionStage && !caseClosed && !handoffBlocked && canSeeDossierCard(currentRole, 'protection') && ownsCase && <ProtectionOperationsCard caseItem={caseItem} />}

                    {/* Sheet 06 — เส้นทางเร่งด่วน คบ.4 / คบ.5 (WIT0603-WIT0614)
                        อยู่เหนือการ์ดส่งงานตามลำดับชั้น เพราะต้องตัดสินเรื่องคุ้มครองชั่วคราวก่อน
                        จึงจะส่งคำร้องหลักต่อขึ้นไปได้ */}
                    {isFastTrackCase(caseItem) && !caseClosed && !handoffBlocked && !directorAwaitingAssignment && <FastTrackCard caseItem={caseItem} />}

                    {/* Workflow Forward & Return */}
                    {canForward && <ForwardWorkflowCard caseItem={caseItem} />}

                    {/* ขั้นที่ 5 — เลขาธิการ ป.ป.ท. สั่งการอนุมัติ / ไม่อนุมัติ / ส่งกลับแก้ไข */}
                    {canSeeDossierCard(currentRole, 'secretaryReview') &&
                        caseItem.stage === 'external_pending' &&
                        caseItem.secretaryReviewState !== 'signed' && <SecretaryDecisionCard caseItem={caseItem} onOpenNotice={openNoticeWorkspace} />}
                </div>

                {/* Right Sidebar: Timeline & Audit Trail */}
                <div className="space-y-6">
                    {/* Quick Case Info */}
                    <section className="ws-card space-y-3 p-5 text-[0.88rem]">
                        <h2 className="border-b border-line pb-2 text-[1.1rem] font-bold text-navy">สรุปข้อมูลแฟ้ม</h2>
                        <div className="space-y-2">
                            <div className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-slate-500">เลขคำร้อง:</span>
                                <strong className="text-navy">{caseItem.no}</strong>
                            </div>
                            <div className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-slate-500">ประเภทแบบ:</span>
                                <span className="font-semibold text-blue">{caseItem.form}</span>
                            </div>
                            {/* <div className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-slate-500">ระดับความเสี่ยง:</span>
                                <span className="font-bold text-rose-700">{caseItem.risk}</span>
                            </div> */}
                            <div className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-slate-500">ความเร่งด่วน:</span>
                                <span className={caseItem.urgent ? 'font-semibold text-danger-dark' : 'font-semibold text-success-dark'}>
                                    {caseItem.urgent
                                        ? 'จำเป็นเร่งด่วน'
                                        : caseItem.urgency === 'normal'
                                            ? 'ปกติ'
                                            : 'ยังไม่ประเมิน'}
                                </span>
                            </div>
                            <div className="flex flex-wrap justify-between gap-x-3">
                                <span className="text-slate-500">ผู้รับผิดชอบ:</span>
                                <span className="font-semibold text-ink">{caseItem.owner}</span>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            <FormPreviewModal formId={previewFormNo} onClose={() => setPreviewFormNo(null)} />

            <FormSignatureModal formNo={signFormNo} caseNo={caseItem.no} onClose={() => setSignFormNo(null)} />

            <Kb13RoundsModal caseItem={caseItem} open={showKb13Rounds} onClose={() => setShowKb13Rounds(false)} />

            <Kb15ReviewModal caseItem={caseItem} open={showKb15Review} onClose={() => setShowKb15Review(false)} />
        </div>
    )
}
