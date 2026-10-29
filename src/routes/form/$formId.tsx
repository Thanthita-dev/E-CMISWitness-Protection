import { TerminationAuthoritySignature, canSignTerminationAuthority } from '../../components/protection/TerminationAuthoritySignature'
import { Kb15ReviewerSignature } from '../../components/protection/Kb15ReviewerSignature'
import { Kb15HeadSignature } from '../../components/protection/Kb15HeadSignature'
import { ReferralDocumentWorkspace } from '../../components/forms/ReferralDocumentWorkspace'
import { isRightsReferral } from '../../lib/referralDocumentIdentity'
import { SignedDecisionSendCard } from '../../components/dossier/SignedDecisionSendCard'
import { AppealKb10Workspace } from '../../components/appeal/AppealKb10Workspace'
import { activeSarabanCheckpoint, canRecordSaraban, sarabanFormsFor } from '../../lib/saraban'
import { FormSarabanPanel } from '../../components/forms/FormSarabanPanel'
import { NoticeDecisionWorkspace } from '../../components/dossier/NoticeDecisionWorkspace'
import { NoticeDispatchCard } from '../../components/dossier/NoticeDispatchCard'
import { Kb11SignatureActions } from '../../components/forms/Kb11SignatureActions'
import { kb11Gate } from '../../lib/formSignature'
import { NOTICE_STATUS_LABELS, noticeWorkerAllowed } from '../../lib/noticeDocuments'
import { Button } from "../../components/common/Button"
import React from 'react'
import { createFileRoute, Link, useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { LegacyFormsNotice } from '../../components/common/LegacySourceBadge'
import { FormPaperViewer } from '../../components/forms/FormPaperViewer'
import { Kb1FormEditor } from '../../components/forms/Kb1FormEditor'
import { Kb2FormEditor } from '../../components/forms/Kb2FormEditor'
import { Kb3FormEditor } from '../../components/forms/Kb3FormEditor'
import { Kb4FormEditor } from '../../components/forms/Kb4FormEditor'
import { Kb5FormEditor } from '../../components/forms/Kb5FormEditor'
import { Kb6FormEditor } from '../../components/forms/Kb6FormEditor'
import { Kb16FormEditor } from '../../components/forms/Kb16FormEditor'
import { Kb7FormEditor } from '../../components/forms/Kb7FormEditor'
import { Kb11FormEditor } from '../../components/forms/Kb11FormEditor'
import { Kb12FormEditor } from '../../components/forms/Kb12FormEditor'
import { Kb13FormEditor } from '../../components/forms/Kb13FormEditor'
import { Kb14FormEditor } from '../../components/forms/Kb14FormEditor'
import { Kb15FormEditor } from '../../components/forms/Kb15FormEditor'
import { Article14LetterEditor } from '../../components/forms/Article14LetterEditor'
import { GenericKbEditor } from '../../components/forms/GenericKbEditor'
import { FormCaseScope, useIsFormCaseClosed } from '../../components/forms/FormCaseScope'
import { FormInitialTabContext } from '../../components/forms/FormInitialTab'
import { DocumentActionBar, DocumentPageHead, DocumentPageNav, DocumentWorkspace, type DocumentViewMode } from '../../components/forms/DocumentWorkspace'
import { ActionBarSlotContext, DocActions, EditorViewContext, type EditorView } from '../../components/forms/EditorView'
import { getFormPages } from '../../components/forms/paper/formPages'
import { FormPreviewDialog } from '../../components/forms/FormPreviewDialog'
import { canViewHandoffCase, handoffBlocksOperations, gotReviewChain } from '../../lib/protectionHandoff'
import { FORMS_CATALOG } from '../../lib/constants'
import { signaturesForCase, useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { activateCaseForms, buildSeedForCase } from '../../lib/formPrefill'
import { showToast, showSuccessAlert } from '../../lib/swal'
import { isPrivacyBlocked, privacyBlockedMessage } from '../../lib/privacyGuard'
import { useAuthStore } from '../../store/useAuthStore'
import { canEditFormsInDossier } from '../../lib/permissions'
import { useIsFormLocked } from '../../components/forms/fields/FormKit'
import { appealAddendumEditable, getActiveExtensionDocs, isFormSignedForCase, isKb6Prepared } from '../../lib/formSignature'
import { useAuditStore } from '../../store/useAuditStore'

export const Route = createFileRoute('/form/$formId')({
    component: ReferralAwareFormDetail,
    /**
     * `context` แยกบริบทของแบบที่ใบเดียวรับใช้หลายเส้นทาง — ปัจจุบันคือ คบ.12
     * 'method4'  = ส่งมอบตามวิธีที่ 4 ข้อ 15(4) โดยคำสั่งยังอยู่กับ ป.ป.ท. (WIT0848)
     * ไม่ระบุ    = ส่งต่อหน่วยงานภายนอกเมื่อครบเพดาน 180 วัน (แท็บ 11C) ซึ่งเป็นค่าเดิมของระบบ
     */
    validateSearch: (search: Record<string, unknown>): { caseNo?: string; context?: 'method4'; from?: 'forms' | 'termination'; tab?: 'saraban'; appealNotice?: boolean } => ({
        appealNotice: search.appealNotice === true || search.appealNotice === 'true' ? true : undefined,
        caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
        context: search.context === 'method4' ? 'method4' : undefined,
        /** TC-053 — เปิดมาจากเมนู แบบฟอร์ม คบ. (/forms) ปุ่มกลับและหลังบันทึกต้องกลับหน้ารายการแบบฟอร์ม */
        from: search.from === 'forms' || search.from === 'termination' ? search.from : undefined,
        /** เปิดตรงแท็บทะเบียนสารบรรณของแบบ (ลิงก์จากแฟ้มคำร้อง) */
        tab: search.tab === 'saraban' ? 'saraban' : undefined,
    }),
})

/** ช่องจำเป็นของ คบ.3 (ตามแบบกรอก) — ใช้ตัดสินสถานะ "ครบถ้วน" */
const KB3_REQUIRED_FIELDS = ['สถานที่บันทึก', 'ผู้ให้ถ้อยคำ', 'ชื่อพยาน', 'บันทึกถ้อยคำ', 'ความเห็นเจ้าหน้าที่']
const EMPTY_FORM_VALUES: Record<string, unknown> = {}

function ReferralAwareFormDetail() {
    const { formId } = useParams({ from: '/form/$formId' })
    const { caseNo } = useSearch({ from: '/form/$formId' })
    const c = useCaseStore(s => caseNo ? s.cases.find(c => c.no === caseNo) : undefined)
    const navigate = useNavigate()
    if (formId === '19' || formId === '20' || (formId === '18' && c && isRightsReferral(c))) {
        return <ReferralDocumentWorkspace id={formId === '19' ? 'chairman-signature' : 'rights-assistance-letter'} caseNo={caseNo} onBack={() => { void navigate({ to: '/forms', search: {} }) }} />
    }
    return <FormDetailPage />
}

function FormDetailPage() {
    const { formId } = useParams({ from: '/form/$formId' })
    const { caseNo, context, from, tab, appealNotice } = useSearch({ from: '/form/$formId' })
    const navigate = useNavigate()
    const [previewButton, setPreviewButton] = React.useState<HTMLButtonElement | null>(null)
    const allowSaveClick = React.useRef(false)
    /** เปิดมาที่ "กรอกบนเอกสาร" เสมอ (แบบเดียวกับหน้าเอกสารงานหมายจับ) — สลับไปกรอกผ่านแบบฟอร์มได้ ใช้ร่างชุดเดียวกัน */
    const [mode, setMode] = React.useState<DocumentViewMode>('document')
    const formNumber = Number(formId) || 1
    const totalPages = getFormPages(formNumber).length
    const [page, setPage] = React.useState(1)
    const [allPages, setAllPages] = React.useState(false)
    /** ปุ่มท้ายแบบ (บันทึก/ลงนาม) ของโหมดกรอกบนเอกสาร ถูกยกมาวางในแถบดำเนินการล่าง */
    const [actionSlot, setActionSlot] = React.useState<HTMLElement | null>(null)
    React.useEffect(() => { setPage(1); setAllPages(false) }, [formNumber])
    const formLocked = useIsFormLocked(formNumber)
    const formMeta = FORMS_CATALOG.find((f) => f.n === formNumber) || FORMS_CATALOG[0]
    const { section } = useFormDraftStore()
    const ensureDraftForCase = useFormDraftStore((s) => s.ensureDraftForCase)
    const getCase = useCaseStore((s) => s.getCase)
    const draftTouched = useFormDraftStore((s) => Boolean(s.draftTouched[formNumber]))
    const currentDraft = useFormDraftStore((s) => s.drafts[formNumber]) || EMPTY_FORM_VALUES
    const allSignatures = useFormDraftStore((s) => s.signatures)
    const signatureCases = useFormDraftStore((s) => s.signatureCases)

    /**
     * WIT0833 / WIT0837 — มาตรการปกปิดข้อ 15(3) ต้องบล็อกการสั่งพิมพ์ของผู้ใช้นอกขอบเขตจริง
     * และทุกครั้งที่พิมพ์/ถูกบล็อก ต้องถูกบันทึกลง Access Log ของแฟ้ม ไม่ใช่แค่เก็บธงไว้เฉย ๆ
     */
    const currentRole = useAuthStore((s) => s.currentRole)
    const currentOfficerUserId = useAuthStore((s) => s.currentOfficerUserId)
    const currentOrgUnitId = useAuthStore((s) => s.currentOrgUnitId)
    const addAuditLog = useAuditStore((s) => s.addLog)
    const printCase = useCaseStore((state) => caseNo ? state.getCase(caseNo) : undefined)
    const noticeDocument = formNumber === 9 || formNumber === 10 ? printCase?.resultNotices?.[formNumber] : undefined
    const noticeSnapshot = noticeDocument?.original ? noticeDocument.versions.at(-1) : undefined
    const [noticePatch, setNoticePatch] = React.useState<Record<string, string>>({})
    React.useEffect(() => { setNoticePatch({}) }, [caseNo, formNumber])
    const canFillNotice = Boolean(noticeDocument?.original && printCase && noticeWorkerAllowed(currentRole, printCase, currentOfficerUserId) && !printCase.kb10DispatchRequestedAt && !printCase.dispatchedAt && noticeDocument.policy.confirmed && !['ready', 'sent'].includes(noticeDocument.status))
    const saveNoticeDetails = () => {
        if (!Object.keys(noticePatch).length) return true
        if (!printCase || (formNumber !== 9 && formNumber !== 10)) return false
        const ok = useCaseStore.getState().completeResultNotice(printCase.no, formNumber, noticePatch)
        if (ok) setNoticePatch({})
        else showToast('บันทึกไม่สำเร็จ กรุณาตรวจสอบข้อมูลและสิทธิ์', 'warning')
        return ok
    }

    /** ชุดเอกสารขอขยาย: คบ.3/คบ.6 ฉบับใหม่แก้ไข/ลงนามได้แม้เป็นแฟ้มที่ส่งต่อให้ กอท. */
    const extensionDocsActive = Boolean(printCase && (formNumber === 3 || formNumber === 6) && (getActiveExtensionDocs(printCase) || appealAddendumEditable(printCase)))
    const routedReadOnly = Boolean(printCase?.protectionHandoff && (
        handoffBlocksOperations(currentRole, printCase, currentOfficerUserId) || (formNumber <= 6 && !extensionDocsActive)
    )) || Boolean(formNumber === 11 && printCase && (!canEditFormsInDossier(currentRole, printCase, currentOfficerUserId) || printCase.activity7State !== 'approved')) || currentRole === 'got_receiver' || (currentRole === 'got_director' && !gotReviewChain(printCase)) || (currentRole === 'got_officer' && !printCase)
    const sarabanCheckpoint = printCase ? activeSarabanCheckpoint(printCase) : null
    const sarabanClerkHere = Boolean(printCase && sarabanCheckpoint && canRecordSaraban(currentRole, printCase, sarabanCheckpoint, currentOrgUnitId ?? undefined) && sarabanFormsFor(printCase, sarabanCheckpoint).includes(formNumber))
    /** กรอกบนกระดาษได้เมื่อแบบนี้แก้ไขได้ตามสิทธิ์และสถานะเดียวกับแบบกรอกด้านซ้าย */
    const editingOnPaper = !routedReadOnly && !formLocked && !noticeDocument?.original
    /** แฟ้มปิดงานคุ้มครองแล้ว (WIT1148) — ลงนามเพิ่มบนกระดาษไม่ได้ */
    const caseClosedForForm = useIsFormCaseClosed(formNumber)
    const printBlocked = Boolean(printCase && isPrivacyBlocked(printCase, currentRole, 'print'))
    const handlePrint = () => {
        if (printCase) {
            addAuditLog({
                caseNo: printCase.no,
                actorName: currentRole,
                actorRole: currentRole,
                action: printBlocked
                    ? `ถูกบล็อกการสั่งพิมพ์ตามมาตรการปกปิดข้อมูลพยาน: แบบ ${formMeta.code}`
                    : `สั่งพิมพ์/ส่งออกเอกสาร: แบบ ${formMeta.code}`,
                docRef: formMeta.code,
            })
        }
        if (printBlocked) {
            showToast(privacyBlockedMessage('print'), 'warning')
            return
        }
        window.print()
    }

    /**
     * WIT0837 — "ทุกการเปิดดู/ส่งออกต้องมี Audit Log"
     * การเปิดดูแบบฟอร์มของแฟ้มคือการเปิดดูข้อมูลพยานรายการหนึ่ง จึงต้องบันทึกแยกรายแบบ
     * กันซ้ำต่อ (แฟ้ม, แบบ, บทบาท) เพื่อไม่ให้การ re-render ของหน้าเดียวกันสร้างรายการซ้ำ
     */
    const loggedViewRef = React.useRef<string>('')
    React.useEffect(() => {
        if (!printCase) return
        const key = `${printCase.no}|${formNumber}|${currentRole}`
        if (loggedViewRef.current === key) return
        loggedViewRef.current = key
        addAuditLog({
            caseNo: printCase.no,
            actorName: currentRole,
            actorRole: currentRole,
            action: `เปิดดูเอกสาร: แบบ ${formMeta.code}`,
            docRef: formMeta.code,
        })
    }, [printCase, formNumber, currentRole, formMeta.code, addAuditLog])

    /**
     * WIT0311-0312 — แฟ้มที่รับเรื่องด้วย คบ.2 ต้องจัดทำ คบ.1 ต่อ โดยยกข้อมูลที่รับแจ้งไว้แล้วมาเป็นค่าตั้งต้น
     * ร่าง คบ.1 จึงต้องผูกกับแฟ้มที่กำลังเปิด ไม่ใช่ร่างกลางที่ใช้ปนกันทุกแฟ้ม — เปิด คบ.1 ของอีกแฟ้มเมื่อใด
     * ต้องเริ่มจากข้อมูลของแฟ้มนั้น ไม่ใช่ข้อมูลที่ค้างจากคำขอก่อนหน้า และช่องที่ไม่มีข้อมูลต้องเว้นว่าง
     *
     * แบบอื่นและแฟ้มที่รับเรื่องด้วยคำร้อง/คบ.1 ยังใช้ร่างเดิมตามที่เป็นอยู่ ไม่มีข้อกำหนดให้ตั้งต้นข้ามแบบ
     */
    React.useEffect(() => {
        if (!caseNo || formNumber !== 1) return
        const caseItem = getCase(caseNo)
        if (!caseItem || caseItem.legacySource || caseItem.intakeDocType !== 'kb2') return
        const { drafts, draftCaseNo, draftTouched } = useFormDraftStore.getState()
        /** ใช้ร่าง คบ.2 เป็นแหล่งข้อมูลได้ต่อเมื่อเป็นร่างของแฟ้มนี้และถูกกรอกจริงแล้ว */
        const kb2Draft = draftCaseNo[2] === caseNo && draftTouched[2] ? drafts[2] : undefined
        ensureDraftForCase(formNumber, caseNo, buildSeedForCase(formNumber, caseItem, kb2Draft))
    }, [caseNo, formNumber, getCase, ensureDraftForCase])

    /**
     * GAP-010 — คบ.3/4/5/6 ต้องเป็นร่างของแฟ้มที่เปิดอยู่ ไม่ใช่ร่างกลางที่ใช้ปนกันทุกแฟ้ม
     * เปิดแบบเดียวกันจากอีกแฟ้มเมื่อใด ต้องเห็นข้อมูลของแฟ้มนั้น (หรือค่าตั้งต้น) ไม่ใช่ข้อมูลของแฟ้มก่อนหน้า
     */
    React.useLayoutEffect(() => {
        if (!caseNo) return
        const caseItem = getCase(caseNo)
        /** เรื่องจากระบบเดิมไม่มีข้อมูลแบบ — ห้ามสร้างร่าง/ค่าตั้งต้นให้ */
        if (caseItem && !caseItem.legacySource && canViewHandoffCase(currentRole, caseItem, currentOfficerUserId)) { activateCaseForms(caseItem); if (caseItem.appealFolder?.addendum) useCaseStore.getState().startAppealDocs(caseItem.no) }
    }, [caseNo, getCase, currentRole, currentOfficerUserId])

    /** เปิดจากแฟ้ม = กลับแฟ้ม · เปิดจากเมนูแบบฟอร์ม = กลับรายการแบบฟอร์ม · นอกนั้นกลับทะเบียน (TC-053) */
    const backTo = caseNo && (from === 'termination' || formNumber === 15)
        ? ({ to: '/termination/$caseNo', params: { caseNo }, search: { source: formNumber === 7 ? 'witness_kb7' as const : undefined } } as const)
        : caseNo
        ? ({ to: '/dossier/$caseNo', params: { caseNo } } as const)
        : from === 'forms'
          ? ({ to: '/forms' } as const)
          : ({ to: '/registry' } as const)
    const backLabel = caseNo && (from === 'termination' || formNumber === 15) ? 'กลับเรื่องยุติการคุ้มครอง' : caseNo ? 'กลับแฟ้มคำร้อง' : from === 'forms' ? 'กลับรายการแบบฟอร์ม' : 'กลับทะเบียน'

    const handleSaved = () => {
        if ((formNumber === 7 || formNumber === 15) && caseNo) {
            navigate({ to: '/dossier/$caseNo', params: { caseNo } })
            return
        }
        if (caseNo && (formNumber === 3 || formNumber === 6)) {
            const c = getCase(caseNo)
            if (c?.appealFolder?.addendum) useCaseStore.getState().updateCase(caseNo, {
                appealFolder: { ...c.appealFolder, addendum: { ...c.appealFolder.addendum,
                    savedForms: { ...c.appealFolder.addendum.savedForms, [formNumber]: new Date().toISOString() },
                } },
            })
        }
        if (formNumber === 14 && caseNo) {
            const c = getCase(caseNo)
            if (c && getActiveExtensionDocs(c)) { navigate({ to: '/dossier/$caseNo', params: { caseNo } }); return }
            navigate({ to: '/protection-extension/$caseNo', params: { caseNo } })
            return
        }
        navigate(backTo)
    }

    const renderEditor = () => {
        switch (formNumber) {
            case 1:
                return <Kb1FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 2:
                return <Kb2FormEditor onSaved={handleSaved} />
            case 3:
                return <Kb3FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 4:
                return <Kb4FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 5:
                return <Kb5FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 6:
                return <Kb6FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 7:
                return <Kb7FormEditor onSaved={handleSaved} caseNo={caseNo} terminationIntake={from === 'termination'} />
            case 11:
                return <Kb11FormEditor onSaved={handleSaved} />
            case 12:
                return <Kb12FormEditor onSaved={handleSaved} context={context} />
            case 13:
                return <Kb13FormEditor onSaved={handleSaved} />
            case 14:
                return <Kb14FormEditor onSaved={handleSaved} caseNo={caseNo} />
            case 16:
                return <Kb16FormEditor caseNo={caseNo} onSaved={handleSaved} />
            case 15:
                return <Kb15FormEditor onSaved={handleSaved} />
            case 18:
                return <Article14LetterEditor onSaved={handleSaved} caseNo={caseNo} />
            default:
                return <GenericKbEditor formId={formNumber} onSaved={handleSaved} caseNo={caseNo} />
        }
    }

    if (printCase && !canViewHandoffCase(currentRole, printCase, currentOfficerUserId)) {
        return <div className="ws-card p-8 text-center">ไม่มีสิทธิ์เปิดเอกสารของแฟ้มนี้ในบทบาทปัจจุบัน</div>
    }

    if (formNumber === 10 && appealNotice && printCase?.appealKb10) return <AppealKb10Workspace caseItem={printCase} onBack={() => navigate({ to: '/dossier/$caseNo', params: { caseNo: printCase.no } })} />

    /** เรื่องจากระบบเดิม: ไม่ดึงร่างตัวอย่างของระบบมาแสดง — แจ้งไฟล์ที่ย้ายมาแทน (ทุกเลขแบบ) */
    if (printCase?.legacySource) {
        return <div className="space-y-6">
            <BackLink to={backTo.to} params={'params' in backTo ? backTo.params : undefined} search={'search' in backTo ? backTo.search : undefined}>{backLabel}</BackLink>
            <DetailHeaderCard
                kicker="แบบฟอร์ม คบ. · เรื่องจากระบบเดิม"
                refNo={`แบบ ${formMeta.code}`}
                title={formMeta.t}
                meta={[`แฟ้ม ${printCase.no}`]}
                status={<span className="ws-status">ดูอย่างเดียว</span>}
            />
            <LegacyFormsNotice legacySource={printCase.legacySource} />
        </div>
    }

    if (printCase?.preliminaryDecision && (formNumber === 9 || formNumber === 10) && !noticeDocument?.original) {
        return <div className="space-y-4">
            {printCase.preliminaryDecision.formNo === formNumber
                ? <NoticeDecisionWorkspace caseItem={printCase} onBack={() => navigate({ to: '/dossier/$caseNo', params: { caseNo: printCase.no } })} onConfirmed={() => {
                    showSuccessAlert(`ลงนาม คบ.${formNumber} แล้ว`, 'เอกสารยังไม่ได้ส่ง กรุณากดส่งให้ธุรการออกเลขเมื่อพร้อม', () => navigate({ to: '/dossier/$caseNo', params: { caseNo: printCase.no } }))
                }} />
                : <div className="ws-card space-y-3 p-5"><p>ร่างนี้ไม่ได้ใช้งานกับผลที่เลือกปัจจุบัน ข้อมูลร่างยังเก็บไว้ในแฟ้ม</p><BackLink to="/dossier/$caseNo" params={{ caseNo: printCase.no }}>กลับแฟ้มเพื่อเปิดร่างที่เลือก</BackLink></div>}
        </div>
    }

    /**
     * แบบกรอกชุดเดียว ใช้ทั้งโหมดกรอกผ่านแบบฟอร์ม (เต็ม) และโหมดกรอกบนเอกสาร (aside: ซ่อนไว้ ปุ่มท้ายแบบไปแถบล่าง)
     * หนังสือแจ้งผลฉบับลงนาม (คบ.9/10) ยังมีแผงข้างกระดาษ เพราะงานนำส่งอยู่ในการ์ดของแผงนั้น
     */
    const editorContent = (view: EditorView) => (
        <EditorViewContext.Provider value={view}><ActionBarSlotContext.Provider value={actionSlot}>
            {routedReadOnly && <p className="ws-readonly text-[0.88rem]">เอกสารจากแฟ้มเดิม · ดูข้อมูลอ้างอิง</p>}
            {noticeDocument?.original && (noticeDocument.formNo !== 10 || Boolean(printCase?.dispatchedAt)) && printCase && <>
                <NoticeDispatchCard caseItem={printCase} allowPreparation />
            </>}
            {/* ธุรการที่ลงทะเบียนสารบรรณได้ ณ จุดนี้ แต่หน้ากรอกถูกล็อกเป็นอ่านอย่างเดียว — แสดงสถานะทะเบียนและลิงก์ไปหน้า /saraban นอกส่วนที่ล็อก */}
            {routedReadOnly && sarabanClerkHere && <FormCaseScope.Provider value={caseNo}><div className="ws-card p-4 md:p-6"><FormSarabanPanel formId={formNumber} /></div></FormCaseScope.Provider>}
            {!noticeDocument?.original && <fieldset disabled={routedReadOnly} className="m-0 min-w-0 border-0 p-0">
                <FormCaseScope.Provider value={caseNo}><FormInitialTabContext.Provider value={tab}>{renderEditor()}</FormInitialTabContext.Provider></FormCaseScope.Provider>

            </fieldset>}
        </ActionBarSlotContext.Provider></EditorViewContext.Provider>
    )

    /**
     * สถานะเอกสาร: ยังไม่ได้กรอก → ร่าง (กรอกแล้วบางส่วน) → ครบถ้วน (บันทึกฉบับสมบูรณ์/ช่องจำเป็นครบ) → ลงนามแล้ว (ลายมือชื่อครบ)
     * ใช้เกณฑ์เดิมของแต่ละแบบ: คบ.1 = บันทึก คบ.1 ฉบับสมบูรณ์ · คบ.6 = กดบันทึกแบบ คบ.6 แล้ว · คบ.3 = ช่องจำเป็นของแบบครบ
     */
    const formSigned = Boolean(printCase) && isFormSignedForCase(formNumber, printCase!, signaturesForCase(allSignatures, signatureCases, caseNo))
    const formComplete = Boolean(printCase) && (
        formNumber === 1 ? Boolean(printCase!.kb1CompletedAt)
            : formNumber === 6 ? isKb6Prepared(printCase!)
                : formNumber === 3 ? KB3_REQUIRED_FIELDS.every((key) => String(currentDraft[key] ?? '').trim())
                    : false)
    /** ร่าง = มีข้อมูลในแบบแล้ว (กรอกเองหรือเติมจากแฟ้ม) แม้ยังไม่ครบ */
    const draftHasContent = draftTouched || Object.values(currentDraft).some((value) => Array.isArray(value) ? value.length > 0 : String(value ?? '').trim() !== '')
    const docStatus = formSigned ? 'ลงนามแล้ว' : formComplete ? 'ครบถ้วน' : draftHasContent ? 'ร่าง' : 'ยังไม่ได้กรอก'
    const statusLabel = formNumber === 10 && printCase?.deliveredAt && !printCase.appealFiledAt && !printCase.nonApprovalClosedAt ? 'พยานได้รับหนังสือแล้ว · ยื่นอุทธรณ์ได้' : noticeDocument ? NOTICE_STATUS_LABELS[noticeDocument.status] : docStatus
    const goToPage = (next: number) => { setAllPages(false); setPage(Math.min(Math.max(next, 1), totalPages)) }

    /**
     * ก่อนบันทึกแบบ ต้องตรวจพรีวิวเอกสารครบทุกหน้าก่อน (แบบเดียวกับหน้าคำร้องของงานหมายจับ)
     * ดักการกดปุ่ม "บันทึก…" ของแบบ (ยกเว้นบันทึกร่าง) ทั้งในแถบล่างและแบบกรอกเต็ม — ยืนยันแล้วจึงส่งต่อให้ปุ่มเดิมทำงาน
     */
    const interceptSave = (event: React.MouseEvent) => {
        const button = (event.target as HTMLElement).closest('button')
        if (!button || button.disabled || allowSaveClick.current) { allowSaveClick.current = false; return }
        const label = button.textContent?.trim() || ''
        if (!/^บันทึก(แบบ|คำสั่ง|หนังสือ)/.test(label)) return
        event.preventDefault()
        event.stopPropagation()
        setPreviewButton(button)
    }
    const confirmPreview = () => {
        const button = previewButton
        setPreviewButton(null)
        if (!button) return
        allowSaveClick.current = true
        button.click()
    }

    return (
        <div className="space-y-3" onClickCapture={interceptSave}>
            <DocumentPageHead
                title={`${formMeta.code} ${formMeta.t}`}
                meta={<>{caseNo ? `แฟ้ม ${caseNo}` : 'ไม่ได้เปิดจากแฟ้มคำร้อง'}{printCase?.person ? ` · ${printCase.person}` : ''}</>}
                status={<span data-testid="form-doc-status" className={noticeDocument?.original || formSigned || formComplete ? 'ws-status success' : 'ws-status'}>{statusLabel}</span>}
                actions={<>
                    {totalPages > 1 && <Button type="button" variant="secondary" size="md" aria-pressed={allPages} data-testid="form-all-pages" onClick={() => setAllPages((v) => !v)}>
                        <i className={`fa-regular ${allPages ? 'fa-file' : 'fa-copy'}`} aria-hidden="true" />
                        {allPages ? 'ดูทีละหน้า' : 'ดูครบทุกหน้า'}
                    </Button>}
                    <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        onClick={handlePrint}
                        data-testid="form-print-button"
                        title={printBlocked ? privacyBlockedMessage('print') : 'พิมพ์เอกสาร A4'}
                    >
                        <i className="fa-solid fa-print" />
                        พิมพ์เอกสาร A4
                    </Button>
                </>}
            />

            {(formNumber === 9 || formNumber === 10) && printCase && <SignedDecisionSendCard caseItem={printCase} />}

            {formNumber === 11 && printCase && !routedReadOnly && !caseClosedForForm && <EditorViewContext.Provider value="aside"><ActionBarSlotContext.Provider value={actionSlot}><Kb11SignatureActions caseNo={printCase.no} paperOnly /></ActionBarSlotContext.Provider></EditorViewContext.Provider>}

            {formNumber === 15 && printCase && !routedReadOnly && !caseClosedForForm && <>
                <Kb15HeadSignature caseItem={printCase} />
                <Kb15ReviewerSignature caseItem={printCase} />
            </>}

            {printCase && [16, 17].includes(formNumber) && <TerminationAuthoritySignature caseItem={printCase} form={formNumber} />}

            <DocumentWorkspace
                mode={mode}
                onModeChange={setMode}
                editor={editorContent('full')}
                aside={noticeDocument?.original && (noticeDocument.formNo !== 10 || Boolean(printCase?.dispatchedAt)) ? editorContent('aside') : undefined}
                nav={totalPages > 1 && !allPages ? <DocumentPageNav total={totalPages} current={page} onChange={goToPage} /> : undefined}
                status={noticeDocument?.original ? undefined : editingOnPaper ? 'บันทึกร่างอัตโนมัติ' : 'อ่านอย่างเดียวตามสิทธิ์'}
            >
                <FormPaperViewer formId={formNumber} activeSection={section} caseNo={caseNo} noticeSnapshot={noticeSnapshot && canFillNotice ? { ...noticeSnapshot, fields: { ...noticeDocument!.fields, ...noticePatch } } : noticeSnapshot} noticeDetailEdit={canFillNotice ? { fields: noticeDocument!.policy.allowedAfterSigning, onChange: (key, value) => setNoticePatch((old) => ({ ...old, [key]: value })) } : undefined} editable={mode === 'document' && (editingOnPaper || canFillNotice)} signable={Boolean(printCase && canSignTerminationAuthority(printCase, formNumber, currentRole)) || (!routedReadOnly && !noticeDocument?.original && !caseClosedForForm && formNumber !== 9 && formNumber !== 10)} page={allPages ? undefined : page} bare printable />
            </DocumentWorkspace>

            {mode === 'document' && !noticeDocument?.original && <div hidden>{editorContent('aside')}</div>}

            <DocumentActionBar
                back={<Link to={backTo.to} params={'params' in backTo ? backTo.params : undefined} search={'search' in backTo ? backTo.search : undefined} className="ws-backlink !mb-0">
                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />{backLabel}
                </Link>}
                info={allPages ? `ทั้งหมด ${totalPages} หน้า` : `หน้า ${page} จาก ${totalPages}`}
            >
                {canFillNotice && <Button type="button" variant="secondary" size="md" disabled={!Object.keys(noticePatch).length} onClick={() => { if (saveNoticeDetails()) showToast('บันทึกรายละเอียดแล้ว') }}>บันทึก</Button>}
                {formNumber === 10 && noticeDocument?.original && printCase && !printCase.kb10DispatchRequestedAt && !printCase.dispatchedAt && noticeWorkerAllowed(currentRole, printCase, currentOfficerUserId) && <Button type="button" variant="primary" size="md" onClick={() => {
                    if (!saveNoticeDetails()) return
                    const ok = useCaseStore.getState().requestKb10Dispatch(printCase.no)
                    showToast(ok ? 'ส่ง คบ.10 เข้าคิวธุรการแล้ว' : 'ยังส่งไม่ได้ กรุณาตรวจสถานะรับเรื่องและสิทธิ์', ok ? 'success' : 'warning')
                }}><i className="fa-solid fa-paper-plane" />ส่งให้ธุรการออกเลขและนำส่ง</Button>}
                {!allPages && page > 1 && <Button type="button" variant="secondary" size="md" onClick={() => goToPage(page - 1)}>
                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />ก่อนหน้า: หน้า {page - 1}
                </Button>}
                {!allPages && page < totalPages && <Button type="button" variant="primary" size="md" data-testid="document-next-page" onClick={() => goToPage(page + 1)}>
                    ถัดไป: หน้า {page + 1}<i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </Button>}
                {/* บันทึก/ลงนามท้ายแบบขึ้นเมื่อไล่ถึงหน้าสุดท้ายแล้ว (หรือดูครบทุกหน้า) — หน้าก่อนหน้ามีแค่ปุ่มไปหน้าถัดไป */}
                <div ref={setActionSlot} className={!allPages && page < totalPages ? 'hidden' : 'flex flex-wrap items-center gap-2 empty:hidden'} />
            </DocumentActionBar>
            {previewButton && <FormPreviewDialog
                formId={formNumber}
                caseNo={caseNo}
                title={`พรีวิว ${formMeta.code} ก่อนยืนยัน`}
                confirmLabel={`ยืนยันบันทึก ${formMeta.code}`}
                onClose={() => setPreviewButton(null)}
                onConfirm={confirmPreview}
            />}
        </div>
    )
}
