import { canSignTerminationAuthority } from '../../components/protection/TerminationAuthoritySignature'
import { terminationTriggerReference } from '../../lib/terminationRules'
import { DocumentViewButton } from '../../components/common/DocumentViewButton'
import { terminationSubmissionErrors, terminationSignatures } from '../../lib/terminationDraft'
import { startReferralInDossier } from '../../lib/startReferralInDossier'
import { Article14CoordinationPanel } from '../../components/protection/Article14CoordinationPanel'
import { ReferralDocumentsPanel } from '../../components/dossier/ReferralDocumentsPanel'
import { REFERRAL_DOCUMENTS, completedProtectionOriginals, hasReferralDocument, isReferralDocumentId, isRightsReferral } from '../../lib/referralDocumentIdentity'
import { ensureReferralDocument } from '../../lib/referralDocuments'
import { AttachedFormCopies } from '../../components/dossier/AttachedFormCopies'
import { ApprovalCoordinationPanel } from '../../components/protection/ApprovalCoordinationPanel'
import { noticeWorkerAllowed, kb10ClerkAllowed } from '../../lib/noticeDocuments'
import { UrgencyScreeningPanel } from '../../components/dossier/UrgencyScreeningPanel'
import { Button } from "../../components/common/Button"
import React, { useState } from 'react'
import { createFileRoute, Link, Navigate, useParams, useNavigate } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { Badge } from '../../components/common/Badge'
import { DossierStageTracker } from '../../components/dossier/DossierStageTracker'
import { MainCaseLinkCard } from '../../components/dossier/MainCaseLinkCard'
import { ForwardWorkflowCard } from '../../components/dossier/ForwardWorkflowCard'
import { Kb14ForwardFooter } from '../../components/protection/Kb14ForwardFooter'
import { Article14ReviewFlow, article14ReviewVisible } from '../../components/protection/Article14ReviewFlow'
import { SecretaryDecisionCard } from '../../components/dossier/SecretaryDecisionCard'
import { ProtectionHandoffCard } from '../../components/dossier/ProtectionHandoffCard'
import { SarabanTransitCard } from '../../components/dossier/SarabanTransitCard'
import { AddendumViewerModal, ExtensionAddendumList, FormVersionsModal } from '../../components/dossier/FormVersionsModal'
import { canViewHandoffCase, handoffBlocksOperations, roleForCase, isKb15StageReviewer, kb15PendingStage, kb15StageLabel } from '../../lib/protectionHandoff'
import { DirectorAssignmentCard } from '../../components/dossier/DirectorAssignmentCard'
import { ReturnRevisionAssignmentCard } from '../../components/dossier/ReturnRevisionAssignmentCard'
import { AppealCaseSection } from '../../components/appeal/AppealCaseSection'
import { AppealKb10Card } from '../../components/appeal/AppealKb10Card'
import { AppealSummaryCard } from '../../components/appeal/AppealSummaryCard'
import { SkipKb3Button } from '../../components/dossier/SkipKb3Button'
import { LegacySourceBadge, LegacySourcePanel } from '../../components/common/LegacySourceBadge'
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
import { PER_CASE_FORMS, signaturesForCase, useFormDraftStore } from '../../store/useFormDraftStore'
import { FAST_TRACK_SIGNERS, fastTrackSignerTurn } from '../../lib/fastTrack'
import { ECMIS_USER_DIRECTORY, FORMS_CATALOG, ROLE_NAMES, STAGE_LABELS, article14Agency } from '../../lib/constants'
import { promptArticle14Agency } from '../../lib/article14AgencyPrompt'
import { FormCodeTooltip } from '../../components/common/FormCodeTooltip'
import {
    canEditFormsInDossier,
    isCaseClosed,
    isLegacyCase,
    canSeeAllForms,
    canSeeDossierCard,
    canSeeFormsSection,
    isCaseOwnedBy,
} from '../../lib/permissions'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { formatThaiDate, getCaseFormNumbers, isPetitionAwaitingAssignment, toIsoDate } from '../../lib/utils'
import { activateCaseForms } from '../../lib/formPrefill'
import { KB6_SIGNERS, appealAddendumEditable, appealAddendumVersion, canEditKb6Opinion, canSignFormNow, canSubmitKb8Now, extensionAddenda, getActiveExtensionDocs, isAddendumVersion, isFormFullySigned, isFormSignedForCase, kb11Gate, pendingSignerLabel } from '../../lib/formSignature'
import { sarabanInTransit } from '../../lib/saraban'
import { canProposeAgencyReferral, deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { capWarning } from '../../lib/capWarning'
import { kb3Unlocked } from '../../lib/intakeSequence'
import { useConsentSigningStore } from '../../store/useConsentSigningStore'
import { latestSignedFor } from '../../lib/consentSigning'
import { defaultTerminationClause, terminationClauseFromLabel, terminationClauseLabel } from '../../lib/terminationProgress'

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
    const { getCase, addExtraForm, removeExtraForm, submitKb8ForSignature, draftKb14, draftKb15, issueKb16, submitKb16ForSignature, submitKb17ForSignature, endProtectionForNonApproval } = useCaseStore()
    const formLocks = useFormDraftStore((s) => s.locks)
    const formSignatures = useFormDraftStore((s) => s.signatures)
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
        if (c && canViewHandoffCase(currentRole, c, currentOfficerUserId)) { activateCaseForms(c); if (c.appealResolution?.outcome === 'overturn') useCaseStore.getState().prepareAppealKb6Revision(c.no); if (c.appealFolder?.addendum) useCaseStore.getState().startAppealDocs(c.no) }
    }, [caseNo, caseExists, currentRole, currentOfficerUserId])
    /** ยังไม่เลือก = 0 — ห้ามตั้งค่าเริ่มต้นเป็นแบบใดแบบหนึ่ง เพราะกดแนบโดยไม่ตั้งใจจะได้ฉบับที่ไม่ได้เห็นบนจอ */
    const [selectedExtraForm, setSelectedExtraForm] = useState<string>('')
    const navigate = useNavigate()
    const openNoticeWorkspace = (formNo: 9 | 10) => {
        navigate({ to: '/form/$formId', params: { formId: String(formNo) }, search: { caseNo } })
    }
    const [previewFormNo, setPreviewFormNo] = useState<number | null>(null)
    /** การ์ดกลั่นกรองความเร่งด่วน (จากการ์ดคดีหลัก) วางบนสุดของคอลัมน์ขวา เป็นงานที่ต้องทำในขั้นนี้ */
    const [urgencySlot, setUrgencySlot] = useState<HTMLDivElement | null>(null)
    /** ปุ่ม "เวอร์ชัน" ของ คบ.3/คบ.6/คบ.14 — รายการฉบับพร้อมสถานะ (และลำดับลงนามของ คบ.6) */
    const [versionsFormNo, setVersionsFormNo] = useState<number | null>(null)
    const formRevisions = useFormDraftStore((s) => s.revisions)
    const formDraftCaseNo = useFormDraftStore((s) => s.draftCaseNo)
    const formCaseDrafts = useFormDraftStore((s) => s.caseDrafts)
    const formSignatureCases = useFormDraftStore((s) => s.signatureCases)
    /** คบ.1: ผู้ขอคุ้มครองลงชื่อผ่านลิงก์ (นับเป็นลายมือชื่อผู้ยื่นคำร้อง) */
    const consentRequests = useConsentSigningStore((s) => s.requests)
    const kb1ApplicantSigned = Boolean(latestSignedFor(consentRequests, caseNo))
    /** ดูฉบับเดิมของ คบ.3/คบ.6 เมื่อมีบันทึกเพิ่มเติม (/form/N แสดงบันทึกเพิ่มเติมแล้ว) */
    const [originalViewFormNo, setOriginalViewFormNo] = useState<3 | 6 | null>(null)
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
    React.useEffect(() => {
        if (caseItem?.stage === 'external_pending' && caseItem.kb6SecretarySignedAt && caseItem.kb6SecretaryOpinionChoice && !caseItem.preliminaryDecision && !caseItem.appealFolder?.addendum && !caseItem.extensionDocs && ['secretary', 'admin'].includes(currentRole)) {
            useCaseStore.getState().beginPreliminaryDecision(caseItem.no, caseItem.kb6SecretaryOpinionChoice === 'agree' ? 'approved' : 'rejected')
        }
    }, [caseItem, currentRole])
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
     * ขั้นที่ 5 (ต่อ) — แสดงสถานะแจ้งผลและทางไปทำงานในหน้าแบบฟอร์ม
     * ทั้งเส้นทางอนุมัติ (คบ.9/11) และไม่อนุมัติ (คบ.10 + สิทธิอุทธรณ์)
     */
    /**
     * เดินเลยขั้นแจ้งผลแล้ว — ทบทวน/ยุติ/ส่งต่อกรมคุ้มครองสิทธิฯ หรือเริ่มคุ้มครองหลังลงนาม คบ.11 แล้ว
     * activity7State ยังคงเป็น 'approved' ตลอดอายุแฟ้ม จึงใช้ตัดสินขั้นแจ้งผลอย่างเดียวไม่ได้
     */
    const pastNoticeStage =
        ['article14', 'termination_review', 'termination_order'].includes(caseItem.stage) ||
        (['protection', 'method_operation'].includes(caseItem.stage) && Boolean(caseItem.kb11Signed))
    const isNoticeStage =
        !pastNoticeStage &&
        (caseItem.stage === 'notice' ||
            caseItem.stage === 'appeal' ||
            caseItem.activity7State === 'approved' ||
            caseItem.activity7State === 'rejected')
    /** เจ้าหน้าที่/เจ้าของสำนวนลงมือได้เฉพาะสำนวนที่ตนได้รับมอบหมาย */
    const ownsCase = isCaseOwnedBy(currentRole, caseItem, currentOfficerUserId)
    /** ขั้นทะเบียนสารบรรณ (ธุรการ) ส่งต่อผ่าน SarabanTransitCard เท่านั้น */
    const stageAllowsForward = ![
        'director_outgoing_registry',
        'secretary_incoming_registry',
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
    const capWarningInfo = capWarning(caseItem)
    const canEditDossier = canSeeDossierCard(currentRole, 'editDossier') && ownsCase && !caseClosed && !handoffBlocked
    /** เปิดแก้ไขแบบฟอร์ม คบ. ได้เฉพาะผู้ที่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้ — คนอื่นดูเอกสารได้อย่างเดียว */
    const canEditForm = canEditFormsInDossier(currentRole, caseItem, currentOfficerUserId) && !caseClosed
    const canForward = stageAllowsForward && canSeeDossierCard(currentRole, 'forward') && ownsCase && !caseClosed
    /** ผู้ปฏิบัติต้องได้รับมอบหมายเป็นเจ้าของสำนวนก่อน จึงจะเห็นส่วนแบบฟอร์ม คบ. ในแฟ้มนี้ */
    /** คำร้องดิบที่ ผอ. ยังไม่มอบหมาย ยังไม่มีแบบ คบ. ให้ทำ จึงซ่อนส่วนนี้ทุกบทบาท */
    const seesFormsSection =
        canSeeFormsSection(currentRole, caseItem, currentOfficerUserId) && !isPetitionAwaitingAssignment(caseItem)
    /** ผอ.สำนัก/กอง ก่อนมอบหมายเจ้าของสำนวน — ดูแบบฟอร์ม คบ. และไฟล์แนบได้อย่างเดียวเพื่อตรวจเอกสารตั้งต้น (WIT0302-0303)
     * แต่ยังไม่เปิดการ์ดเส้นทางเร่งด่วนจนกว่าจะมอบหมาย */
    const directorAwaitingAssignment = currentRole === 'director' && !caseItem.assignedOfficerUserId

    // รวม คบ.7 ที่ลงนามไว้ก่อนหน้า แม้บันทึกด้วยหน้ารุ่นเดิมที่ยังไม่ผูกเข้ารายการแฟ้ม
    const kb7Signatures = formDraftCaseNo[7] === caseItem.no ? formSignatures : formCaseDrafts[caseItem.no]?.signatures || {}
    const hasSignedKb7 = Boolean(kb7Signatures['kb7-applicant']?.signed || kb7Signatures['kb7-officer']?.signed)
    const originalForms = Array.from(new Set([...getCaseFormNumbers(caseItem), ...(hasSignedKb7 ? [7, 15, 16, 17] : [])])).sort((a, b) => a - b)
    const uniqueForms = caseItem.extensionDocs
      ? Array.from(new Set([...originalForms, ...(caseItem.kb11Signed ? [11] : [])])).filter(n => n !== 10 || Boolean(caseItem.resultNotices?.[10]?.original))
      : originalForms
    /** ชุดเอกสารขอขยายที่กำลังดำเนินการ — คบ.3/คบ.6 เป็นฉบับใหม่ของรอบนี้ */
    const extDocs = getActiveExtensionDocs(caseItem)
    /** บันทึกเพิ่มเติม (อุทธรณ์) ของ คบ.3/คบ.6 ที่เจ้าหน้าที่ยังแก้ไขได้ (ก่อนเสนอ ผบช.ชั้นต้น) */
    const appealDocsEditable = appealAddendumEditable(caseItem)
    /** มีบันทึกเพิ่มเติม (อุทธรณ์) ของ คบ.3 — เปิดได้แม้ คบ.3 ฉบับเดิมถูกกดข้าม และไม่ต้องรอลำดับงานรับเรื่องเดิม */
    const hasAppealKb3 = Boolean(appealAddendumVersion(caseItem, 3))
    /** หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน (แบบ 18) ของเรื่องส่งต่อกรมคุ้มครองสิทธิฯ */
    const a14LetterVersion = caseItem.article14?.letterVersion || 0
    /** TC-005 — ยังไม่ได้ประเมินความเร่งด่วน จึงยังตัดสินไม่ได้ว่าเส้นทางจะไป คบ.4/5 (เร่งด่วน) หรือ คบ.6 (ปกติ) */
    /** ก่อนได้รับมอบหมายเป็นเจ้าของสำนวน เห็นได้เฉพาะแบบฟอร์มที่ใช้รับเรื่อง (คบ.1 หรือ คบ.2) */
    const seesAllForms = canSeeAllForms(currentRole, caseItem, currentOfficerUserId)
    const intakeFormNo = caseItem.form === 'คบ.2' ? 2 : 1
    const hidePendingKb11 = !caseItem.kb11Signed && (['director', 'got_director'].includes(currentRole) || (currentRole === 'secretary' && !['accepted', 'active'].includes(caseItem.protectionHandoff?.step || '')))
    const normalProtectionDemo = caseItem.no === '9904/2569' || (caseItem.demoData && caseItem.stage === 'protection' && !caseItem.article14 && !caseItem.reviewHandoff)
    const visibleForms = (seesAllForms ? uniqueForms : uniqueForms.filter((n) => n === intakeFormNo)).filter((n) => !(normalProtectionDemo && [13, 18].includes(n)) && (n !== 10 || !completedProtectionOriginals(caseItem) || Boolean(caseItem.resultNotices?.[10]?.original)) && (n !== 11 || !hidePendingKb11) && !(n === 13 && caseItem.article14 && isRightsReferral(caseItem)) && n !== 19 && n !== 20 && !(n === 18 && isRightsReferral(caseItem)))
    // รายการแนบอิสระ เลือกแบบเดิมซ้ำได้ทุกครั้ง โดยไม่แก้ฉบับในกระบวนงาน
    const attachableForms = FORMS_CATALOG.filter(f => f.n <= 18)
    const canAttachSelected = isReferralDocumentId(selectedExtraForm) || attachableForms.some((f) => String(f.n) === selectedExtraForm)

    /** WIT1112-1116 — ปุ่ม "ส่งตรวจ" ของ คบ.14 ในรายการแบบฟอร์ม ใช้ค่าที่บันทึกไว้ในแบบฟอร์มแล้วส่งเข้าคิวผู้ตรวจ */
    const kb14Requests = caseItem.extensionRequests || []
    const kb14Latest = kb14Requests[kb14Requests.length - 1]
    const kb14Episode = caseItem.episode || deriveEpisode(caseItem)
    const kb14Summary = summarizeEpisode(kb14Episode)
    const kb14Reason = kb14Draft['เหตุผลขยายเวลา']
    const kb14Days = Number(kb14Draft['ขยายวัน']) || 0
    /** รอบขอขยายที่ใช้ชุดเอกสาร คบ.3/คบ.6 ฉบับใหม่ — ส่ง คบ.14 ที่ footer แทนปุ่ม "ส่งตรวจ" ในแถวแบบฟอร์ม */
    const showKb14Footer = Boolean(extDocs || (kb14Latest && ['submitted', 'pending'].includes(kb14Latest.status))) && !caseClosed && !handoffBlocked
    const canSubmitKb14 =
        !showKb14Footer &&
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        !kb14Summary.atCap &&
        (!kb14Latest || kb14Latest.status === 'returned' || kb14Latest.status === 'rejected') &&
        Boolean(kb14Reason && String(kb14Reason).trim()) &&
        kb14Days > 0

    /** WIT1129-WIT1134 — ปุ่ม "ส่งตรวจ" / "ตรวจ คบ.15" ของ คบ.15 ในรายการแบบฟอร์ม */
    const kb15 = caseItem.kb15
    const kb15Trigger = caseItem.terminationTrigger
    const kb15Reason = String(kb15Draft['เหตุยุติ'] || '').trim()
    const kb15Ref = terminationTriggerReference(caseItem, kb15Draft)
    /** FB-029 — ข้อระเบียบที่เลือกในแบบ คบ.15 หรือค่าตั้งต้นตามที่มาของเหตุ */
    const kb15Clause =
        terminationClauseFromLabel(String(kb15Draft['ข้อระเบียบ'] || ''))
    const kb15Stage = kb15PendingStage(caseItem)
    const kb15Errors = terminationSubmissionErrors(caseItem)
    const canSubmitKb15 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        Boolean(kb15Trigger) &&
        (!kb15 || ['draft', 'returned'].includes(kb15.status)) &&
        kb15Errors.length === 0
    /** เหตุผลที่ปุ่มยังกดไม่ได้ — บอกให้ตรงจุดว่าต้องไปทำอะไรก่อน */
    const kb15BlockedReason = !['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole)
        ? 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.15 ตรวจได้'
        : !kb15Trigger
            ? 'ยังไม่ได้บันทึกเหตุเริ่มยุติ — บันทึกที่หน้าจัดทำเรื่องยุติ (คบ.15) ก่อน'
            : kb15Stage
                ? `เสนอตามลำดับชั้นแล้ว — รอ${kb15StageLabel(kb15Stage, caseItem)}${kb15Stage === 'secretary' ? 'ลงนาม' : 'ตรวจ'}`
                : kb15?.status === 'endorsed'
                    ? 'เลขาธิการพิจารณาและลงนามแล้ว — จัดทำคำสั่ง คบ.16 ตามผลพิจารณา'
                    : !kb15Ref
                        ? ''
                        : kb15Errors[0] || 'กรุณาระบุเหตุแห่งการยุติในแบบ คบ.15 ก่อน'
    const canReviewKb15 = isKb15StageReviewer(currentRole, caseItem)

    /** WIT1138 → WIT1139 — ปุ่ม "ส่งให้อนุมัติ" ของ คบ.16 ในรายการแบบฟอร์ม */
    const kb16 = caseItem.kb16
    const canSubmitKb16 =
        ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole) &&
        Boolean(caseItem.terminationApproval?.approved) &&
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
            backdatedReason: pick('เหตุผลวันที่มีผลย้อนหลัง'),
        }
    }
    /** ช่องบังคับของ คบ.16 ที่ยังว่าง (รวมค่าร่างเดิมในแฟ้ม) — ว่างทั้งหมด = ส่งได้ */
    const kb16Missing = (patch: ReturnType<typeof kb16Patch>) => {
        const missing: string[] = []
        if (!(patch.orderNo || kb16?.orderNo)) missing.push('คำสั่งที่')
        if (!String(kb16Draft['ชื่อพยาน'] || '').trim()) missing.push('ชื่อพยาน')
        if (!(patch.reason || kb16?.reason)) missing.push('เหตุยุติ')
        const issuedAt = patch.issuedAt || kb16?.issuedAt
        const effectiveAt = patch.effectiveAt || kb16?.effectiveAt
        if (!issuedAt) missing.push('วันที่ออกคำสั่ง')
        if (!effectiveAt) missing.push('วันที่คำสั่งมีผล')
        if (issuedAt && effectiveAt && effectiveAt < issuedAt && !(patch.backdatedReason || kb16?.backdatedReason)) missing.push('เหตุผลที่วันที่มีผลย้อนหลัง')
        return missing
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
        if (isReferralDocumentId(selectedExtraForm)) {
            if (ensureReferralDocument(caseItem.no, selectedExtraForm) !== null) void navigate({ to: '/forms', search: { additional: selectedExtraForm, caseNo: caseItem.no } })
            return
        }
        addExtraForm(caseItem.no, Number(selectedExtraForm))
        showToast(`แนบ ${FORMS_CATALOG.find(f => String(f.n) === selectedExtraForm)?.code} ฉบับใหม่เข้าแฟ้มเรียบร้อยแล้ว`)
        setSelectedExtraForm('')
    }

    const clerkRole = roleForCase(currentRole, caseItem)
    if (['receiver', 'secretary_receiver', 'got_receiver'].includes(clerkRole) && (caseItem.protectionHandoff || caseItem.sarabanDispatch)) {
        return <Navigate to="/saraban/$caseNo" params={{ caseNo: caseItem.no }} replace />
    }

    return (
        <div className="min-w-0 space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <BackLink to="/registry">กลับทะเบียนคำร้อง</BackLink>
                {caseItem.activity7State === 'rejected' && caseItem.deliveredAt && !caseItem.appealFiledAt && !caseItem.appealFolder && !caseItem.appealResolution && !caseItem.nonApprovalClosedAt && (
                    noticeWorkerAllowed(currentRole, caseItem, currentOfficerUserId) || kb10ClerkAllowed(currentRole, caseItem, useAuthStore.getState().currentOrgUnitId) || currentRole === 'admin'
                ) ? <Link to="/appeal-folder/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-navy px-5 py-3 font-semibold text-white hover:bg-blue"><i className="fa-solid fa-scale-balanced" />รับคำอุทธรณ์</Link> : undefined}
            </div>

            <DetailHeaderCard
                kicker="แฟ้มคำร้องอิเล็กทรอนิกส์ · งานคุ้มครองพยาน"
                refNo={caseItem.no}
                title={
                    caseItem.legacySource && !caseItem.person?.trim() ? (
                        <>
                            ผู้ขอรับการคุ้มครอง: <span className="font-normal text-muted">ไม่มีข้อมูลในระบบเดิม</span>
                        </>
                    ) : (
                        `ผู้ขอรับการคุ้มครอง: ${caseItem.person}`
                    )
                }
                meta={[
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
                    <span data-testid="dossier-header-status" className="inline-flex flex-wrap items-center gap-1.5">
                        <LegacySourceBadge legacySource={caseItem.legacySource} />
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

            {isNoticeStage && !caseClosed && ownsCase && (caseItem.activity7State === 'approved' || caseItem.activity7State === 'rejected') && (() => {
                const formNo = caseItem.activity7State === 'approved' ? 9 : 10
                const notice = caseItem.resultNotices?.[formNo]
                if (!notice?.original || caseItem.deliveredAt || (caseItem.protectionHandoff && !['accepted', 'active'].includes(caseItem.protectionHandoff.step))) return null
                const sent = notice.status === 'sent' || Boolean(caseItem.dispatchedAt)
                const inTransit = sarabanInTransit(caseItem)
                return <section className="ws-card p-4 flex flex-wrap items-center justify-between gap-3" aria-label="งานแจ้งผลให้พยาน">
                    <div className="min-w-0 space-y-1">
                        <h2 className="text-[1rem] font-bold text-navy">{sent ? 'รอบันทึกการรับหนังสือ' : inTransit ? 'รอธุรการส่งต่อหนังสือแจ้งผล' : formNo === 10 ? (caseItem.kb10DispatchRequestedAt || caseItem.kb10DispatchNumbering ? 'รอธุรการออกเลขและนำส่ง คบ.10' : 'ส่ง คบ.10 ให้ธุรการออกเลขและนำส่ง') : 'รอส่งหนังสือแจ้งผลให้พยาน'}</h2>
                        <p className="text-[0.88rem] text-muted">คบ.{formNo} ลงนามแล้ว · {sent ? 'ส่งแล้ว · รอบันทึกการรับหนังสือ' : inTransit ? 'รอธุรการลงทะเบียนครบ' : 'ยังไม่ได้ส่ง'}</p>
                    </div>
                    <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo }} className={LINK_BUTTON}>
                        <i className={`fa-solid ${sent ? 'fa-clipboard-check' : 'fa-envelope'}`} />
                        {sent ? 'บันทึกการรับหนังสือ' : inTransit ? `ดูหนังสือ คบ.${formNo}` : formNo === 10 ? (caseItem.kb10DispatchRequestedAt || caseItem.kb10DispatchNumbering ? 'ดูหนังสือ คบ.10' : 'เปิดเพื่อส่งให้ธุรการ') : 'เตรียมและส่งหนังสือ'}
                    </Link>
                </section>
            })()}

            {caseClosed && <CaseClosedBanner legacy={isLegacyCase(caseItem)} />}
            {caseItem.legacySource && <LegacySourcePanel legacySource={caseItem.legacySource} />}

            {/* 11-Stage Progress Tracker */}
            <DossierStageTracker caseItem={caseItem} />

            {/* แจ้งเตือนล่วงหน้า 1 เดือนก่อนครบระยะเวลาคุ้มครอง 6 เดือน */}
            {!caseClosed && capWarningInfo && (
                <div className="ws-callout" role="note" data-testid="dossier-near-cap-warning">
                    <h3 className="text-[0.95rem] font-semibold text-ink">
                        <i className="fa-solid fa-hourglass-half mr-2" aria-hidden="true" />
                        ใกล้ครบระยะเวลาคุ้มครอง 6 เดือน — อีก {capWarningInfo.remaining} วัน (ประมาณ {formatThaiDate(capWarningInfo.capDate)})
                    </h3>
                    <p className="mt-1 text-[0.88rem] leading-relaxed">
                        {caseItem.article14
                            ? `เรื่องส่งต่อ${article14Agency(caseItem).short} อยู่ระหว่างดำเนินการ — ติดตามให้ทันก่อนครบกำหนดเพื่อไม่ให้การคุ้มครองขาดช่วง`
                            : 'หากยังมีภัยให้เริ่มเรื่องส่งต่อหน่วยงานอื่นก่อนครบกำหนด เพื่อไม่ให้การคุ้มครองขาดช่วง'}
                    </p>
                    {!caseItem.article14 && ownsCase && canProposeAgencyReferral(caseItem) && (
                        <button
                            type="button"
                            onClick={async () => {
                                /** เลือกหน่วยงานปลายทางในป็อปอัปก่อน แล้วไปหน้าจัดทำข้อเสนอพร้อมหน่วยงานที่เลือก */
                                const agency = await promptArticle14Agency()
                                if (agency) startReferralInDossier(caseItem.no, agency)
                            }}
                            className="mt-2 inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                        >
                            เสนอส่งต่อหน่วยงานอื่น
                        </button>
                    )}
                </div>
            )}

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
            {caseItem.secretaryContinuation && (
                <section className="ws-card p-5 space-y-2">
                    <h2 className="font-semibold text-navy">ความเห็นเลขาธิการจาก คบ.6 ข้อ 13 · ฉบับที่ {caseItem.secretaryContinuation.version}</h2>
                    <p className="whitespace-pre-wrap text-sm text-ink">{caseItem.secretaryContinuation.instruction}</p>
                    <p className="text-xs text-muted">ลงนามโดย {caseItem.secretaryContinuation.signedBy} · {caseItem.secretaryContinuation.signedAt} · ส่งให้ {caseItem.secretaryContinuation.destination === 'got' ? 'กอท.' : 'เจ้าของสำนวนเดิม'} ดำเนินการต่อ</p>
                </section>
            )}
            {caseItem.activity7State === 'returned' && caseItem.stage === 'director_review' && !sarabanInTransit(caseItem, 'decision') &&
                !caseItem.revisionAssignedAt &&
                (currentRole === 'admin' || (caseItem.gotRevision ? roleForCase(currentRole, caseItem) === 'got_director' : currentRole === 'director')) && <ReturnRevisionAssignmentCard caseItem={caseItem} />}

            {/* ขั้นที่ 2 — มอบหมายเจ้าของสำนวน */}
            {isAssignmentStage && !caseClosed && canSeeDossierCard(currentRole, 'assignment') && <DirectorAssignmentCard caseItem={caseItem} />}

            {roleForCase(currentRole, caseItem) === 'got_director' && caseItem.protectionHandoff?.step === 'pending_assignment' && <ProtectionHandoffCard caseItem={caseItem} />}

            {/* สถานะทะเบียนสารบรรณ (อ่านอย่างเดียว) — ธุรการลงเลขที่หน้า /saraban */}
            <SarabanTransitCard caseItem={caseItem} />

            {/* Main workspace and case summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Left 2 Columns */}
                <div className="lg:col-span-2 space-y-6">
                    {caseItem.protectionHandoff && caseItem.protectionHandoff.step !== 'pending_send' && !(roleForCase(currentRole, caseItem) === 'got_receiver' && caseItem.protectionHandoff.step === 'received') && !(roleForCase(currentRole, caseItem) === 'got_director' && caseItem.protectionHandoff.step === 'pending_assignment') && <ProtectionHandoffCard caseItem={caseItem} />}
                    {/* Main Case Linkage */}
                    {canSeeDossierCard(currentRole, 'mainCaseLink') && ownsCase && <MainCaseLinkCard caseItem={caseItem} urgencySlot={urgencySlot} />}

                    {caseItem.appealFolder && <AppealSummaryCard caseItem={caseItem} />}

                    {/* Attached Forms List */}
                    {seesFormsSection && (
                        <section className="ws-card space-y-4 p-5" data-testid="dossier-forms">
                            <div className="flex items-center justify-between border-b border-line pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-soft text-blue font-bold">
                                        <i className="fa-solid fa-file-lines text-sm" />
                                    </div>
                                    <div>
                                        <p className="ws-kicker">งานของ {ROLE_NAMES[currentRole] || currentRole}</p>
                                        <h2 data-testid="dossier-form-count" className="text-[1.1rem] font-bold text-navy">แบบฟอร์ม คบ. ในแฟ้มนี้ ({(caseItem.appealResolution?.outcome === 'uphold' && caseItem.appealAgainst !== 'kb17' ? 1 : 0) + visibleForms.length + (normalProtectionDemo ? 0 : REFERRAL_DOCUMENTS.filter(d => hasReferralDocument(caseItem, d.id)).length) + ([3, 6] as const).filter((n) => visibleForms.includes(n)).reduce((count, n) => count + extensionAddenda(caseItem, n).length, 0) + visibleForms.filter((n) => (n === 3 || n === 6) && appealAddendumVersion(caseItem, n)).length} ฉบับ)</h2>
                                        <p className="text-[0.8rem] text-muted">คลิกเพื่อเปิดกรอก ตรวจสอบข้อมูล หรือดูฉบับพิมพ์ A4</p>
                                    </div>
                                </div>
                            </div>



                            <div className="space-y-2">
                                {(() => {
                                  const formRows = visibleForms.map((formNo) => {
                                    const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]
                                    const selectedNotice = caseItem.preliminaryDecision?.formNo === formNo && !caseItem.resultNotices?.[formNo as 9 | 10]?.original
                                    /** คบ.3 ที่ถูกกดข้ามยังอยู่ในแฟ้ม แต่จางลงและเปิดแบบฟอร์มไม่ได้จนกว่าจะกู้คืน */
                                    const isSkipped = formNo === 3 && Boolean(caseItem.kb3Skipped) && !hasAppealKb3
                                    /** คบ.11 ยังเปิดไม่ได้จนกว่าจะส่ง/มอบ คบ.9 และบันทึกการรับครบตาม WIT0806 */
                                    const kb11Locked = formNo === 11 ? kb11Gate(caseItem) : null
                                    /** คบ.3 จัดทำหลังกลั่นกรองความเร่งด่วนแล้วเท่านั้น (ลำดับงานเจ้าของสำนวน) */
                                    const kb3SequenceLocked = formNo === 3 && !extDocs && !hasAppealKb3 && !kb3Unlocked(caseItem)
                                    const isLocked = kb3SequenceLocked || Boolean(kb11Locked && !kb11Locked.unlocked && caseItem.activity7State !== 'approved' && caseItem.preliminaryDecision?.formNo !== 9)
                                    /** ฉบับลงนามแล้วถูกล็อกถาวร (เช่น คบ.11 หลังพยานยอมรับการคุ้มครอง) — เปิดได้แค่ดูเอกสาร แก้ไขไม่ได้อีก */
                                    /** คบ.3/คบ.6 ฉบับขยายเวลาที่ยังแก้ไขได้ ไม่ถือเป็นฉบับลงนามล็อก */
                                    const extVersion = extDocs && (formNo === 3 || formNo === 6) ? (formNo === 3 ? extDocs.kb3Version : extDocs.kb6Version) : 0
                                    /** ฉบับของหนังสือแจ้งกรมฯ (แบบ 18) — เพิ่มทุกครั้งที่เสนอ Revision ใหม่ของเรื่องส่งต่อกรมคุ้มครองสิทธิฯ */
                                    const a14Version = formNo === 18 ? a14LetterVersion : 0
                                    /** คบ.1/คบ.3 แก้ได้ตลอดที่อยู่กับเจ้าของสำนวน — ส่งต่อผู้บังคับบัญชา/ผู้ตรวจ อนุมัติ ออกผล หรือปิดงานแล้วเหลือแค่ดูเอกสาร */
                                    const kbPastOwner = (formNo === 1 || formNo === 3) && !(formNo === 3 && appealDocsEditable) && (caseClosed || ['supervisor', 'director_review', 'notice', 'protection', 'appeal', 'termination_review', 'termination_order', 'terminated', 'transferred', 'resolved'].includes(caseItem.stage))
                                    const isSignedLocked = (Boolean(formLocks[formNo]) && !(extVersion && extDocs?.editable) && !((formNo === 3 || formNo === 6) && appealDocsEditable)) || kbPastOwner
                                    /** คบ.3/คบ.6 มีบันทึกเพิ่มเติม (ขยายเวลาหรืออุทธรณ์) แนบต่อท้ายฉบับเดิม */
                                    const hasAddendum = (formNo === 3 || formNo === 6) && (extensionAddenda(caseItem, formNo).length > 0 || Boolean(appealAddendumVersion(caseItem, formNo)))
                                    /** ถึงคิวลงนามของผู้ใช้คนนี้หรือยัง — ถ้ายังไม่ถึงคิวจะไม่แสดงปุ่มลงนามเลย */
                                    const noSignatureRequired = formNo === 1 && ['supervisor', 'director', 'got_supervisor', 'got_director', 'deputy_secretary', 'secretary'].includes(currentRole)
                                    const kb15ReviewerSigned = Boolean(kb15Stage && terminationSignatures(caseItem, 15)[`kb15-${kb15Stage}`]?.signed)
                                    const canSignKb15 = formNo === 15 && canReviewKb15 && !sarabanInTransit(caseItem) && !kb15ReviewerSigned
                                    const canSignTermination = canSignTerminationAuthority(caseItem, formNo, currentRole)
                                    const canOpenTerminationForm = ['secretary', 'admin'].includes(currentRole) &&
                                        ((formNo === 16 && !caseItem.kb16?.signedAt) || (formNo === 17 && !caseItem.kb17?.signedAt))
                                    const canSign = canSignKb15 || canSignTermination ||
                                        !noSignatureRequired &&
                                        !isSkipped &&
                                        !isLocked &&
                                        canSignFormNow({ formNo, caseItem, currentRole, canEditDossier })
                                    /** ถึงคิวลงนามของบทบาทนี้ — สีเหลืองพร้อมป้ายระบุตำแหน่งผู้ลงนาม */
                                    const formSignerLabel = !hasAddendum && canSign ? pendingSignerLabel({ formNo, caseItem, currentRole, canEditDossier }) : null
                                    /** คบ.4 (ข้อ 13) → คบ.5 ของเส้นทางเร่งด่วน — ผอ. ลงนามในหน้าแบบ ตามลำดับ คบ.4 ก่อน คบ.5 */
                                    const fastTrackSigner =
                                        formNo === 4 || formNo === 5
                                            ? FAST_TRACK_SIGNERS.find(
                                                  (sg) =>
                                                      sg.byDirector &&
                                                      sg.formId === formNo &&
                                                      !formSignatures[sg.key]?.signed &&
                                                      fastTrackSignerTurn(sg, caseItem, currentRole) &&
                                                      (sg.key !== 'kb5-director' || Boolean(formSignatures['kb4-director']?.signed))
                                              )
                                            : undefined
                                    let signerLabel = formSignerLabel || fastTrackSigner?.signerRole || null
                                    const fullySigned = isFormFullySigned(formNo, caseItem)
                                    /** WIT0817 → WIT0818 — เจ้าหน้าที่เสนอ คบ.8 เข้ารอบลงนามก่อนเลขาธิการฯ จะลงนามได้ */
                                    const canSubmitKb8 = formNo === 8 && !isSkipped && !isLocked && canSubmitKb8Now(caseItem, canEditDossier)
                                    const kb8AwaitingSignature = formNo === 8 && Boolean(caseItem.kb8SubmittedAt) && !fullySigned && !canSign
                                    /** เหลือง = ยังลงนามไม่ครบ · เขียว = ลงนามครบ (ลายมือชื่อของแฟ้มนี้) */
                                    const caseRevisions = formDraftCaseNo[formNo] === caseItem.no
                                        ? formRevisions[formNo] || []
                                        : formCaseDrafts[caseItem.no]?.revisions[formNo] || []
                                    const originalRevision = hasAddendum
                                        ? [...caseRevisions].reverse().find((revision) => !isAddendumVersion(caseItem, formNo as 3 | 6, revision.version))
                                        : undefined
                                    const caseFormSignatures = hasAddendum
                                        ? originalRevision?.signatures || {}
                                        : PER_CASE_FORMS.includes(formNo) && formDraftCaseNo[formNo] !== caseItem.no
                                            ? formCaseDrafts[caseItem.no]?.signatures || {}
                                            : signaturesForCase(formSignatures, formSignatureCases, caseItem.no)
                                    const signedNotice = (formNo === 9 || formNo === 10) && Boolean(caseItem.resultNotices?.[formNo]?.original || (formNo === 9 && caseItem.approvalNoticeSignature))
                                    const formFullySigned = signedNotice || isFormSignedForCase(formNo, caseItem, formNo === 1 && kb1ApplicantSigned
                                        ? { ...caseFormSignatures, 'kb1-applicant': { signed: true } }
                                        : caseFormSignatures)
                                    if (formFullySigned) signerLabel = null
                                    if (canSignKb15 && kb15Stage) signerLabel = kb15StageLabel(kb15Stage, caseItem)
                                    if (canSignTermination) signerLabel = 'เลขาธิการ ป.ป.ท.'
                                    // สีแถวสะท้อนงานลงนามของผู้เสนอแล้ว ส่วนป้ายยังบอกว่ารอความเห็นตามลำดับชั้น
                                    const officerSigned = ((formNo === 4 || formNo === 6) && Boolean(caseFormSignatures[`kb${formNo}-officer`]?.signed)) || (formNo === 5 && Boolean(caseFormSignatures['kb5-witness']?.signed || caseItem.fastTrack?.witnessAckAt))
                                    const reviewerRole = currentRole === 'got_director' ? 'director' : currentRole === 'got_supervisor' ? 'supervisor' : currentRole
                                    const reviewer = formNo === 6 ? KB6_SIGNERS.find((signer) => signer.userRole === reviewerRole) : undefined
                                    const reviewerSigned = Boolean(reviewer && (
                                        caseFormSignatures[`kb6-${reviewer.role}`]?.signed ||
                                        (!hasAddendum && !extDocs && reviewer.signedAt(caseItem))
                                    ))
                                    const completedBeforeExtension = completedProtectionOriginals(caseItem) && !isSkipped && !(extVersion && extDocs?.editable) && !((formNo === 3 || formNo === 6) && appealDocsEditable) && [1, 2, 3, 4, 5, 6, 8, 9, 10, 11].includes(formNo)
                                    if (completedBeforeExtension) signerLabel = null
                                    const formSigned = completedBeforeExtension || (!signerLabel && (noSignatureRequired || formFullySigned || officerSigned || reviewerSigned))
                                    const pendingNoticeDelivery = (formNo === 9 || formNo === 10) && Boolean(caseItem.resultNotices?.[formNo]?.original) && isNoticeStage && !caseClosed && !caseItem.deliveredAt
                                    const noticeSent = (formNo === 9 || formNo === 10) && (caseItem.resultNotices?.[formNo]?.status === 'sent' || Boolean(caseItem.dispatchedAt))
                                    const signStatusLabel = signerLabel ? 'รอลงนาม' : completedBeforeExtension ? 'ดำเนินการแล้ว · ฉบับเดิม' : (formNo === 9 || formNo === 10) && !caseItem.preliminaryDecision && !signedNotice ? 'ร่างรอผลพิจารณา' : pendingNoticeDelivery ? (noticeSent ? 'รอบันทึกการรับ' : formNo === 10 ? 'รอธุรการนำส่ง' : 'รอส่งให้พยาน') : formFullySigned ? 'ลงนามแล้ว' : officerSigned || reviewerSigned ? 'ลงนามแล้ว' : 'รอลงนาม'
                                    return (
                                        <React.Fragment key={formNo}>
                                        <div
                                            data-testid="dossier-form-row" data-form-number={formNo}
                                            data-awaiting-signature={signerLabel ? 'true' : undefined}
                                            data-form-signed={formSigned ? 'true' : 'false'}
                                            className={`rounded-xl border px-3 py-2 transition ${completedBeforeExtension || signedNotice ? 'border-[#9fd0b4] bg-[#eef8f2]' : signerLabel ? 'border-[#e6cf86] bg-[#fdf8e7]' : selectedNotice ? 'border-[#e6cf86] bg-[#fdf8e7]' : isSkipped || isLocked ? 'border-line bg-soft opacity-60' : formSigned ? 'border-[#9fd0b4] bg-[#eef8f2]' : 'border-[#e6cf86] bg-[#fdf8e7]'
                                                }`}
                                        >
                                            {/* ชื่อแบบซ้าย · ปุ่มขวาในแถวเดียวกัน (จอแคบจึงลงบรรทัดใหม่) */}
                                            <div className={`grid min-h-[4rem] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]`}>
                                                <div className="flex min-w-0 flex-1 items-center gap-3">
                                                    <FormCodeTooltip formNo={formNo}>
                                                        <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue">
                                                            {meta.code}
                                                        </span>
                                                    </FormCodeTooltip>
                                                    <div className="min-w-0">
                                                        <strong className="block text-[0.88rem] font-semibold text-navy">{meta.t}{a14Version > 0 && <span data-testid="article14-letter-version" className="ws-status ml-2">ฉบับที่ {a14Version}</span>}</strong>
                                                        {signerLabel && (
                                                            <span data-testid="awaiting-signature-badge" className="ws-status mt-1">
                                                                <i className="fa-solid fa-signature text-[0.7rem]" aria-hidden="true" />
                                                                รอลงนาม: {signerLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                <div className="flex min-w-0 sm:justify-center">
                                                    {!isSkipped && !isLocked && !noSignatureRequired && <span data-testid="form-sign-status" className={`ws-status text-center ${formSigned ? 'success' : ''}`}>{signStatusLabel}</span>}
                                                </div>
                                                <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                                                    {formNo === 3 && !completedBeforeExtension && !formFullySigned && !formSigned && canEditDossier && !kb3SequenceLocked && !hasAppealKb3 && (
                                                        <SkipKb3Button caseItem={caseItem} />
                                                    )}

                                                    {/* เวอร์ชันของ คบ.3/คบ.6 (ฉบับเดิม + ฉบับขยายเวลา) และ คบ.14 (ฉบับที่ถูกส่งกลับ/แต่ละครั้งที่ขอขยาย) */}
                                                    {/* คบ.14: ประวัติการแก้ไขเปิดจากรายการบันทึกเพิ่มเติมด้านล่าง ไม่มีปุ่มระดับแถว */}
                                                    {/* WIT1112-1116 — ส่ง คบ.14 ที่บันทึกไว้แล้วเข้าคิวผู้ตรวจ ไม่ต้องแยกไปหน้า 11B */}
                                                    {formNo === 14 && canEditDossier && !showKb14Footer && (
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
                                                                            ? 'แก้ไข คบ.14 แล้ว ส่งให้ผู้ตรวจอีกครั้ง'
                                                                            : 'ส่ง คบ.14 ให้ผู้ตรวจแล้ว'
                                                                    )
                                                                })
                                                            }}
                                                            variant="primary"
 size="sm"
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

                                                    {/* รอบรายงาน คบ.13 รายเดือน — เปิดดูจากแฟ้มได้เลย ไม่ต้องเข้าหน้าติดตามและรายงานผล */}
                                                    {formNo === 13 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setShowKb13Rounds(true)}
                                                            variant="secondary"
 size="sm"
                                                            title="ดูรอบรายงาน คบ.13 ที่ส่งไปแล้วในแฟ้มนี้"
                                                        >
                                                            <i className="fa-solid fa-clock-rotate-left text-xs" />
                                                            รอบรายงาน ({(caseItem.monthlyReports || []).length})
                                                        </Button>
                                                    )}

                                                    {/* ลงนามแบบ คบ. ที่นี่ที่เดียว — ปุ่มโผล่เฉพาะเมื่อถึงคิวลงนามของผู้ใช้คนนี้ */}

                                                    {/* คบ.6 — ปุ่ม "ลงนาม" ย้ายไปอยู่ในหน้า /form/6 เอง (ตามลำดับความเห็นข้อ 10-13) ไม่แสดงซ้ำที่รายการแบบฟอร์มนี้ */}
                                                    {canSign && formNo !== 6 && formNo !== 11 && formNo !== 9 && formNo !== 10 && ![7, 15, 16, 17].includes(formNo) && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => setSignFormNo(formNo)}
                                                            variant="primary"
 size="sm"
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
 size="sm"
                                                            title="ส่งร่าง คบ.8 ที่จัดทำเสร็จแล้วให้เลขาธิการ ป.ป.ท. ลงนาม"
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่งเสนอเลขาธิการฯ ลงนาม
                                                        </Button>
                                                    )}

                                                    {kb8AwaitingSignature && (
                                                        <Badge variant="warning" icon="fa-hourglass-half">
                                                            {sarabanInTransit(caseItem, 'kb8') ? 'อยู่ระหว่างธุรการลงทะเบียนนำส่ง' : 'รอเลขาธิการ ป.ป.ท. ลงนาม'}
                                                        </Badge>
                                                    )}

                                                    {canOpenTerminationForm ? (
                                                        <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo }} className={LINK_BUTTON}>
                                                            <i className="fa-solid fa-pen-to-square text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </Link>
                                                    ) : hasAddendum ? (
                                                        <DocumentViewButton data-testid="original-view-button" onClick={() => setOriginalViewFormNo(formNo)} title="ดูฉบับเดิมที่ลงนามไว้ก่อนบันทึกเพิ่มเติม" />
                                                    ) : formSigned || signedNotice ? <DocumentViewButton onClick={() => setPreviewFormNo(formNo)} /> : formNo === 11 && (caseItem.preliminaryDecision?.formNo === 9 || caseItem.activity7State === 'approved') ? <Link to="/form/$formId" params={{ formId: '11' }} search={{ caseNo }} className={LINK_BUTTON}>เปิดแบบฟอร์ม</Link> : selectedNotice ? (
                                                        <Button type="button" variant="secondary" size="md" onClick={() => openNoticeWorkspace(formNo as 9 | 10)}><i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />เปิดแบบฟอร์ม</Button>
                                                    ) : fastTrackSigner ? (
                                                        <Link
                                                            to="/form/$formId"
                                                            params={{ formId: String(formNo) }}
                                                            search={{ caseNo }}
                                                            className={LINK_BUTTON}
                                                            data-testid={`fast-track-open-kb${formNo}-sign`}
                                                            title={`ถึงคิวลงนาม ${meta.code} ของท่าน — ลงนามในหน้าแบบฟอร์ม`}
                                                        >
                                                            <i className="fa-solid fa-pen-nib text-xs" />
                                                            เปิดแบบฟอร์มเพื่อลงนาม
                                                        </Link>
                                                    ) : (formNo === 6 && canSign) || canSignKb15 || canSignTermination ? (
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
                                                            title={kb3SequenceLocked ? 'จัดทำ คบ.1 เชื่อมโยงคดีหลัก และกลั่นกรองความเร่งด่วนก่อน จึงจะเปิดแบบ คบ.3 ได้' : kb11Locked?.reason}
                                                        >
                                                            <i className="fa-solid fa-lock text-xs" />
                                                            เปิดแบบฟอร์ม
                                                        </span>
                                                    ) : isSignedLocked ? (
                                                        <DocumentViewButton onClick={() => setPreviewFormNo(formNo)} title={formLocks[formNo]?.reason || 'ฉบับลงนามถูกล็อก — แก้ไขไม่ได้ ดูเอกสารได้อย่างเดียว'} />
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
                                                        <DocumentViewButton onClick={() => setPreviewFormNo(formNo)} title="ไม่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้ — ดูเอกสารได้อย่างเดียว" />
                                                    )}

                                                    {canEditDossier && formNo > 3 && formNo !== 6 && formNo !== 11 && formNo !== 9 && formNo !== 10 && ![7, 15, 16, 17].includes(formNo) && (
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
                                            {formNo === 14 && <ExtensionAddendumList formNo={14} caseItem={caseItem} onOpenHistory={setVersionsFormNo} />}
                                        </React.Fragment>
                                    )
                                })
                                  return <>
                                {formRows.filter((_, index) => ![15, 16, 17].includes(visibleForms[index]) && visibleForms[index] !== 11 && !(caseItem.extensionDocs && visibleForms[index] === 14))}
                                {([3, 6] as const).filter((formNo) => visibleForms.includes(formNo) && appealAddendumVersion(caseItem, formNo)).map((formNo) => {
                                    const meta = FORMS_CATALOG.find((form) => form.n === formNo)!
                                    const appealSignatures = formDraftCaseNo[formNo] === caseItem.no ? formSignatures : formCaseDrafts[caseItem.no]?.signatures || {}
                                    const signed = formNo === 3
                                        ? Boolean(appealSignatures['kb3-witness']?.signed && appealSignatures['kb3-officer']?.signed)
                                        : Boolean(appealSignatures['kb6-officer']?.signed)
                                    const saved = Boolean(caseItem.appealFolder?.addendum?.savedForms?.[formNo])
                                    const appealStage = caseItem.appealFolder?.stage || ''
                                    const appealSigner = KB6_SIGNERS.find((signer) => signer.role === appealStage)
                                    const awaitingMySignature = formNo === 6 && Boolean(appealSigner && canEditKb6Opinion(appealSigner, currentRole, caseItem)) && !appealSignatures[`kb6-${appealStage}`]?.signed
                                    const ready = !awaitingMySignature && (signed || saved || !appealDocsEditable)
                                    return (
                                            <div key={`appeal-${formNo}`} className={`rounded-xl border px-3 py-2 ${ready ? 'border-[#9fd0b4] bg-[#eef8f2]' : 'border-[#e6cf86] bg-[#fdf8e7]'}`} data-testid="appeal-new-document-row">
                                                <div className="grid min-h-[4rem] grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem]">
                                                    <div className="flex min-w-0 flex-1 items-center gap-3">
                                                        <FormCodeTooltip formNo={formNo}><span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue">คบ.{formNo}</span></FormCodeTooltip>
                                                        <div className="min-w-0"><strong className="block text-[0.88rem] font-semibold text-navy">{meta.t}</strong><span className="text-[0.8rem] text-muted">ฉบับใหม่สำหรับอุทธรณ์</span></div>
                                                    </div>
                                                    <span className={`ws-status justify-self-start sm:justify-self-center ${ready ? 'success' : ''}`}>{awaitingMySignature ? 'รอลงนาม' : signed ? 'ลงนามแล้ว' : saved ? 'บันทึกแล้ว' : appealDocsEditable ? 'รอจัดทำ' : 'เสนอพิจารณาแล้ว'}</span>
                                                    <>{ready ? <DocumentViewButton className="justify-self-end" onClick={() => setPreviewFormNo(formNo)} /> : <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo }} className={`${LINK_BUTTON} justify-self-end`}>
                                                        <i className={`fa-solid ${awaitingMySignature ? 'fa-signature' : appealDocsEditable && canEditForm ? 'fa-pen-to-square' : 'fa-eye'} text-xs`} />
                                                        {awaitingMySignature ? 'เปิดเพื่อลงนาม' : 'จัดทำเอกสาร'}
                                                    </Link>}</>
                                                </div>
                                            </div>
                                    )
                                })}
                                <AppealKb10Card caseItem={caseItem} />
                                {formRows.filter((_, index) => visibleForms[index] === 11)}
                                {caseItem.extensionDocs && <>
                                  <ApprovalCoordinationPanel caseItem={caseItem} compact onOpenSigning={(document) => navigate({ to: '/coordination/$caseNo', params: { caseNo }, search: { document } })} />
                                  <section aria-label="ชุดเอกสารขอขยายเวลา" className="space-y-2 border-t border-line pt-4">
                                    <h3 className="text-[1rem] font-bold text-navy">ชุดเอกสารขอขยายเวลา</h3>
                                    {([3, 6] as const).filter(n => visibleForms.includes(n)).map(n => <ExtensionAddendumList key={n} formNo={n} caseItem={caseItem} onOpenHistory={setVersionsFormNo} />)}
                                    {formRows.filter((_, index) => visibleForms[index] === 14)}
                                  </section>
                                </>}

                            {!caseItem.extensionDocs && <ApprovalCoordinationPanel caseItem={caseItem} compact onOpenSigning={(document) => navigate({ to: '/coordination/$caseNo', params: { caseNo }, search: { document } })} />}
                            {!normalProtectionDemo && <ReferralDocumentsPanel caseItem={caseItem} />}
                            <AttachedFormCopies caseItem={caseItem} canEdit={canEditDossier} />
                                {formRows.filter((_, index) => [15, 16, 17].includes(visibleForms[index]))}
                                  </>
                                })()}
                            </div>



                            {/* Add Extra Form Selector — เฉพาะผู้ที่ได้รับมอบหมายเป็นเจ้าของสำนวนนี้เท่านั้น */}
                            {canEditDossier && (
                                <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                                    <select
                                        value={canAttachSelected ? selectedExtraForm : 0}
                                        onChange={(e) => setSelectedExtraForm(e.target.value)}
                                        className="ws-input min-w-0 flex-1 text-ink"
                                        aria-label="เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม"
                                        data-testid="extra-form-select"
                                    >
                                        <option value={0} disabled>
                                            — เลือกแบบฟอร์มที่จะแนบเข้าแฟ้ม —
                                        </option>
                                        <optgroup label="แบบ คบ.">{attachableForms.filter(f => f.n <= 17).map(f => <option key={f.n} value={String(f.n)}>{f.code} - {f.t}</option>)}</optgroup>
                                        <optgroup label="หนังสือประกอบ">
                                            {REFERRAL_DOCUMENTS.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}
                                            <option value="18">หนังสือส่งต่อหน่วยงานอื่น (กรมการปกครอง / ตำรวจ / ทหาร)</option>
                                        </optgroup>
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

                    {visibleForms.includes(15) && !caseItem.terminationDocumentsClosedAt && <section className="ws-card space-y-4 p-5" data-testid="termination-forward-footer">
                      <div>
                        <h2 className="text-[1.1rem] font-bold text-navy">ส่งแฟ้มพิจารณายุติการคุ้มครอง</h2>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
                                                    {/* WIT1129-WIT1134 — ส่ง คบ.15 ที่บันทึกไว้ให้ผู้บังคับบัญชาตรวจ ไม่ต้องแยกไปหน้า 11C */}
                                                    {visibleForms.includes(15) && canEditDossier && kb15?.status === 'submitted' && (
                                                        <Badge variant="warning" icon="fa-hourglass-half">
                                                            ส่งตรวจแล้ว · รอ{kb15Stage ? kb15StageLabel(kb15Stage, caseItem) : 'ผู้บังคับบัญชา'}{kb15Stage === 'secretary' ? 'ลงนาม' : 'ตรวจ'}
                                                        </Badge>
                                                    )}
                                                    {visibleForms.includes(15) && canEditDossier && kb15?.status === 'endorsed' && (
                                                        <Badge variant="success" icon="fa-circle-check">
                                                            เลขาธิการลงนามแล้ว · รอคำสั่งยุติ (คบ.16)
                                                        </Badge>
                                                    )}
                                                    {visibleForms.includes(15) && canEditDossier && kb15?.status !== 'submitted' && kb15?.status !== 'endorsed' && (
                                                        <Button
                                                            type="button"
                                                            disabled={!canSubmitKb15}
                                                            onClick={() => {
                                                                showConfirmAlert({
                                                                    icon: 'question',
                                                                    title: `ส่งแฟ้มและเอกสารทั้งหมดให้${kb15StageLabel('supervisor', caseItem)}ตรวจสอบ?`,
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
                                                                        regulationClause: kb15Clause,
                                                                    })
                                                                    showToast(
                                                                        kb15?.status === 'returned'
                                                                            ? `จัดทำ คบ.15 เวอร์ชันใหม่แล้ว ส่งให้${kb15StageLabel('supervisor', caseItem)}อีกครั้ง`
                                                                            : `ส่ง คบ.15 ให้${kb15StageLabel('supervisor', caseItem)}ตรวจสอบแล้ว`
                                                                    )
                                                                })
                                                            }}
                                                            variant="primary"
 size="sm"
                                                            title={
                                                                canSubmitKb15
                                                                    ? 'ส่ง คบ.15 ที่บันทึกไว้ให้ผู้บังคับบัญชาตรวจเหตุผลและเอกสารประกอบ'
                                                                    : kb15BlockedReason
                                                            }
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่งชุดเอกสารให้พิจารณา
                                                        </Button>
                                                    )}

                                                    {/* WIT1141 — กรอกแบบ คบ.17 ในแฟ้มเสร็จแล้ว เสนอเลขาธิการ ป.ป.ท. ลงนามก่อนออกเลขสารบรรณ */}
                                                    {visibleForms.includes(17) && Boolean(kb16?.signedAt) && canEditDossier && kb17?.status && !kb17.signedAt && (
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
 size="sm"
                                                                title={
                                                                    canSubmitKb17
                                                                        ? 'ส่งแบบ คบ.17 ที่กรอกไว้ให้เลขาธิการ ป.ป.ท. ลงนาม'
                                                                        : 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.17 ให้ลงนามได้'
                                                                }
                                                            >
                                                                <i className="fa-solid fa-paper-plane text-xs" />
                                                                ส่งชุดเอกสารให้ลงนาม
                                                            </Button>
                                                        )
                                                    )}

                                                    {/* WIT1138 → WIT1139 — กรอกแบบ คบ.16 ในแฟ้มเสร็จแล้ว ส่งให้ผู้มีอำนาจอนุมัติและลงนาม */}
                                                    {visibleForms.includes(16) && kb15?.status === 'endorsed' && canEditDossier && !kb16?.signedAt && (
                                                        kb16?.status === 'submitted' ? (
                                                            <Badge variant="warning" icon="fa-hourglass-half">
                                                                รอเลขาธิการ ป.ป.ท.ลงนาม
                                                            </Badge>
                                                        ) : (
                                                            <Button
                                                                type="button"
                                                                disabled={!canSubmitKb16}
                                                                onClick={() => {
                                                                    const patch = kb16Patch()
                                                                    const missing = kb16Missing(patch)
                                                                    if (missing.length) {
                                                                        showToast(`กรุณากรอกแบบ คบ.16 ให้ครบก่อนส่ง: ${missing.join(' ')}`, 'warning')
                                                                        return
                                                                    }
                                                                    showConfirmAlert({
                                                                        icon: 'question',
                                                                        title: 'ส่งคำสั่งยุติ คบ.16 ให้เลขาธิการ ป.ป.ท.อนุมัติ?',
                                                                        text: `คำสั่งที่ ${patch.orderNo || kb16?.orderNo || '-'} · มีผล ${formatThaiDate(patch.effectiveAt || kb16?.effectiveAt)}`,
                                                                        showCancelButton: true,
                                                                        confirmButtonText: 'ส่งให้อนุมัติ',
                                                                        cancelButtonText: 'ยกเลิก',
                                                                    }).then((res) => {
                                                                        if (!res.isConfirmed) return
                                                                        /** ยังไม่เคยกดบันทึกแบบ — เปิดร่างจากค่าที่กรอกไว้ก่อนส่ง */
                                                                        if (!kb16) issueKb16(caseItem.no, { orderNo: patch.orderNo || '', reason: patch.reason || '', issuedAt: patch.issuedAt || '', effectiveAt: patch.effectiveAt || '', backdatedReason: patch.backdatedReason })
                                                                        submitKb16ForSignature(caseItem.no, patch)
                                                                        if (getCase(caseItem.no)?.kb16?.status !== 'submitted') {
                                                                            showToast('ยังส่งไม่ได้ กรุณาตรวจผู้รับผิดชอบปัจจุบันของแฟ้ม', 'warning')
                                                                            return
                                                                        }
                                                                        showToast('ส่งคำสั่ง คบ.16 ให้เลขาธิการ ป.ป.ท.อนุมัติและลงนามแล้ว')
                                                                    })
                                                                }}
                                                                variant="primary"
 size="sm"
                                                                title={
                                                                    canSubmitKb16
                                                                        ? 'ส่งแบบ คบ.16 ที่กรอกไว้ให้เลขาธิการ ป.ป.ท.อนุมัติและลงนาม'
                                                                        : 'เฉพาะเจ้าหน้าที่เจ้าของสำนวนเท่านั้นที่ส่ง คบ.16 ให้อนุมัติได้ หลังเลขาธิการ ป.ป.ท.อนุมัติให้ยุติแล้ว'
                                                                }
                                                            >
                                                                <i className="fa-solid fa-paper-plane text-xs" />
                                                                ส่งชุดเอกสารให้อนุมัติ
                                                            </Button>
                                                        )
                                                    )}

                                                    {/* WIT1131 — ผู้บังคับบัญชาตรวจ คบ.15 แล้วเห็นชอบหรือส่งคืนแก้ไขจากในแฟ้ม */}
                                                    {visibleForms.includes(15) && canReviewKb15 && (
                                                        <Button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!kb15Stage || !terminationSignatures(caseItem, 15)[`kb15-${kb15Stage}`]?.signed) {
                                                                    showToast('กรุณาลงนาม คบ.15 ในช่องของท่านก่อนส่ง', 'warning')
                                                                    return
                                                                }
                                                                showConfirmAlert({
                                                                    icon: 'question', title: 'ยืนยันส่งแฟ้มตามลำดับชั้น?',
                                                                    showCancelButton: true, confirmButtonText: 'ส่ง', cancelButtonText: 'ยกเลิก',
                                                                }).then((result) => {
                                                                    if (!result.isConfirmed) return
                                                                    useCaseStore.getState().reviewKb15(caseItem.no, true, 'เอกสารครบถ้วน')
                                                                    const latest = useCaseStore.getState().getCase(caseItem.no)
                                                                    if (latest?.kb15?.approvalStage !== kb15Stage) showToast('ส่งแฟ้มแล้ว')
                                                                })
                                                            }}
                                                            variant="primary"
 size="sm"
                                                            title="ส่งแฟ้มตามลำดับชั้น"
                                                        >
                                                            <i className="fa-solid fa-paper-plane text-xs" />
                                                            ส่ง
                                                        </Button>
                                                    )}


                      </div>
                      {canEditDossier && (!kb15 || ['draft', 'returned'].includes(kb15.status)) && !canSubmitKb15 && kb15BlockedReason && <p className="text-[0.85rem] text-muted">{kb15BlockedReason}</p>}
                    </section>}

                    {/* 09B — รับคำอุทธรณ์แล้ว งานอุทธรณ์ทั้งหมดอยู่ในแฟ้มคดีเดิม แทนที่การ์ดหนังสือแจ้งผลที่ถูกอุทธรณ์ */}
                    {caseItem.appealFolder && <AppealCaseSection caseItem={caseItem} />}

                    {/* ขั้นที่ 6-7 — ปฏิบัติการคุ้มครอง รายงานผล และการทบทวน */}
                    {isProtectionStage && !caseClosed && !handoffBlocked && canSeeDossierCard(currentRole, 'protection') && ownsCase && <ProtectionOperationsCard caseItem={caseItem} />}

                    {/* Workflow Forward & Return — รวมเส้นทางเร่งด่วน คบ.4 / คบ.5 (Sheet 06 · WIT0603-WIT0614) ไว้ในการ์ดเดียว */}

                    {canForward && <ForwardWorkflowCard caseItem={caseItem} urgencySlot={urgencySlot} />}

                    {/* 11B — ส่ง/ส่งต่อ คบ.14 ตามลำดับชั้น (ลงนาม คบ.6 ฉบับขยายเวลาก่อนส่งต่อ) */}
                    {showKb14Footer && <Kb14ForwardFooter caseItem={caseItem} role={currentRole} canEdit={canEditDossier} />}

                    {/* 08C — Revision เรื่องส่งต่อกรมคุ้มครองสิทธิฯ: แก้ คบ.3 ฉบับใหม่แล้วส่ง/พิจารณาตามลำดับชั้นจนถึงเลขาธิการ */}
                    {article14ReviewVisible(caseItem) && !caseClosed && !handoffBlocked && (
                        <Article14ReviewFlow caseItem={caseItem} role={currentRole} canEdit={canEditDossier} variant="footer" />
                    )}

                    {caseItem.article14 && ['letter_sent', 'response_received', 'handover_ready', 'handover_done', 'delivery_failed'].includes(caseItem.article14.step) && ownsCase && !handoffBlocked && (
                        <Article14CoordinationPanel caseItem={caseItem} role={currentRole} />
                    )}

                    {/* ขั้นที่ 5 — เลขาธิการ ป.ป.ท. สั่งการอนุมัติ / ไม่อนุมัติ / ส่งกลับแก้ไข */}
                    {canSeeDossierCard(currentRole, 'secretaryReview') &&
                        caseItem.stage === 'external_pending' &&
                        caseItem.secretaryReviewState !== 'signed' && <SecretaryDecisionCard caseItem={caseItem} onOpenNotice={openNoticeWorkspace} />}
                    {caseItem.protectionHandoff?.step === 'pending_send' && <ProtectionHandoffCard caseItem={caseItem} />}
                </div>

                {/* Right Sidebar: Timeline & Audit Trail */}
                <div className="space-y-6">
                    <div ref={setUrgencySlot} className="empty:hidden" />
                    {['director', 'got_director', 'deputy_secretary', 'secretary'].includes(currentRole) && (
                        <UrgencyScreeningPanel caseItem={caseItem} readOnly />
                    )}
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

            <FormPreviewModal formId={previewFormNo} caseNo={caseNo} onClose={() => setPreviewFormNo(null)} />

            {(() => {
                const orig = originalViewFormNo
                    ? [...(formRevisions[originalViewFormNo] || [])].reverse().find((r) => !isAddendumVersion(caseItem, originalViewFormNo, r.version))
                    : undefined
                return (
                    <AddendumViewerModal
                        formNo={originalViewFormNo || 3}
                        caseNo={caseItem.no}
                        title="ฉบับเดิม"
                        snapshot={orig ? { fields: orig.snapshot, signatures: orig.signatures } : null}
                        onClose={() => setOriginalViewFormNo(null)}
                    />
                )
            })()}
            <FormVersionsModal formNo={versionsFormNo} caseItem={caseItem} onClose={() => setVersionsFormNo(null)} />

            <FormSignatureModal formNo={signFormNo} caseNo={caseItem.no} onClose={() => setSignFormNo(null)} />

            <Kb13RoundsModal caseItem={caseItem} open={showKb13Rounds} onClose={() => setShowKb13Rounds(false)} />

            <Kb15ReviewModal caseItem={caseItem} open={showKb15Review} onClose={() => setShowKb15Review(false)} />
        </div>
    )
}
