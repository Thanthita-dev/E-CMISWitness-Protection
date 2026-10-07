import { NoticeDecisionWorkspace } from '../../components/dossier/NoticeDecisionWorkspace'
import { NoticeDispatchCard } from '../../components/dossier/NoticeDispatchCard'
import { FormSignatureModal } from '../../components/forms/FormSignatureModal'
import { ResultNoticeCard } from '../../components/dossier/ResultNoticeCard'
import { kb11Gate } from '../../lib/formSignature'
import { NOTICE_STATUS_LABELS } from '../../lib/noticeDocuments'
import { Button } from "../../components/common/Button"
import React from 'react'
import { createFileRoute, Link, useParams, useSearch, useNavigate } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
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
import { GenericKbEditor } from '../../components/forms/GenericKbEditor'
import { FormCaseScope } from '../../components/forms/FormCaseScope'
import { canViewHandoffCase, handoffBlocksOperations } from '../../lib/protectionHandoff'
import { FORMS_CATALOG } from '../../lib/constants'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { activateCaseForms, buildSeedForCase } from '../../lib/formPrefill'
import { showToast, showSuccessAlert } from '../../lib/swal'
import { isPrivacyBlocked, privacyBlockedMessage } from '../../lib/privacyGuard'
import { useAuthStore } from '../../store/useAuthStore'
import { canEditFormsInDossier } from '../../lib/permissions'
import { useAuditStore } from '../../store/useAuditStore'

export const Route = createFileRoute('/form/$formId')({
    component: FormDetailPage,
    /**
     * `context` แยกบริบทของแบบที่ใบเดียวรับใช้หลายเส้นทาง — ปัจจุบันคือ คบ.12
     * 'method4'  = ส่งมอบตามวิธีที่ 4 ข้อ 15(4) โดยคำสั่งยังอยู่กับ ป.ป.ท. (WIT0848)
     * ไม่ระบุ    = ส่งต่อหน่วยงานภายนอกเมื่อครบเพดาน 180 วัน (แท็บ 11C) ซึ่งเป็นค่าเดิมของระบบ
     */
    validateSearch: (search: Record<string, unknown>): { caseNo?: string; context?: 'method4'; from?: 'forms' | 'termination' } => ({
        caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
        context: search.context === 'method4' ? 'method4' : undefined,
        /** TC-053 — เปิดมาจากเมนู แบบฟอร์ม คบ. (/forms) ปุ่มกลับและหลังบันทึกต้องกลับหน้ารายการแบบฟอร์ม */
        from: search.from === 'forms' || search.from === 'termination' ? search.from : undefined,
    }),
})

function FormDetailPage() {
    const { formId } = useParams({ from: '/form/$formId' })
    const { caseNo, context, from } = useSearch({ from: '/form/$formId' })
    const navigate = useNavigate()
    const pendingNoticeDetails = React.useRef<Record<string, string>>({})
    const trackNoticeDetails = React.useCallback((patch: Record<string, string>) => { pendingNoticeDetails.current = patch }, [])
    const [agreementOpen, setAgreementOpen] = React.useState(false)
    const [previewCollapsed, setPreviewCollapsed] = React.useState(false)
    const formNumber = Number(formId) || 1
    const formMeta = FORMS_CATALOG.find((f) => f.n === formNumber) || FORMS_CATALOG[0]
    const { section } = useFormDraftStore()
    const ensureDraftForCase = useFormDraftStore((s) => s.ensureDraftForCase)
    const getCase = useCaseStore((s) => s.getCase)
    const draftTouched = useFormDraftStore((s) => Boolean(s.draftTouched[formNumber]))

    /**
     * WIT0833 / WIT0837 — มาตรการปกปิดข้อ 15(3) ต้องบล็อกการสั่งพิมพ์ของผู้ใช้นอกขอบเขตจริง
     * และทุกครั้งที่พิมพ์/ถูกบล็อก ต้องถูกบันทึกลง Access Log ของแฟ้ม ไม่ใช่แค่เก็บธงไว้เฉย ๆ
     */
    const currentRole = useAuthStore((s) => s.currentRole)
    const currentOfficerUserId = useAuthStore((s) => s.currentOfficerUserId)
    const addAuditLog = useAuditStore((s) => s.addLog)
    const printCase = useCaseStore((state) => caseNo ? state.getCase(caseNo) : undefined)
    const noticeDocument = formNumber === 9 || formNumber === 10 ? printCase?.resultNotices?.[formNumber] : undefined
    const noticeSnapshot = noticeDocument?.original ? noticeDocument.versions.at(-1) : undefined
    const routedReadOnly = Boolean(printCase?.protectionHandoff && (
        handoffBlocksOperations(currentRole, printCase, currentOfficerUserId) || formNumber <= 6
    )) || Boolean(formNumber === 11 && printCase && (!canEditFormsInDossier(currentRole, printCase, currentOfficerUserId) || printCase.activity7State !== 'approved')) || currentRole === 'got_receiver' || currentRole === 'got_director' || (currentRole === 'got_officer' && !printCase)
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
        if (!caseItem || caseItem.intakeDocType !== 'kb2') return
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
        if (caseItem && canViewHandoffCase(currentRole, caseItem, currentOfficerUserId)) activateCaseForms(caseItem)
    }, [caseNo, getCase, currentRole, currentOfficerUserId])

    /** เปิดจากแฟ้ม = กลับแฟ้ม · เปิดจากเมนูแบบฟอร์ม = กลับรายการแบบฟอร์ม · นอกนั้นกลับทะเบียน (TC-053) */
    const backTo = caseNo && from === 'termination'
        ? ({ to: '/termination/$caseNo', params: { caseNo }, search: { source: formNumber === 7 ? 'witness_kb7' as const : undefined } } as const)
        : caseNo
        ? ({ to: '/dossier/$caseNo', params: { caseNo } } as const)
        : from === 'forms'
          ? ({ to: '/forms' } as const)
          : ({ to: '/registry' } as const)
    const backLabel = from === 'termination' && caseNo ? 'กลับเรื่องยุติการคุ้มครอง' : caseNo ? 'กลับแฟ้มคำร้อง' : from === 'forms' ? 'กลับรายการแบบฟอร์ม' : 'กลับทะเบียน'

    const handleSaved = () => {
        if (formNumber === 14 && caseNo) { navigate({ to: '/protection-extension/$caseNo', params: { caseNo } }); return }
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
                return <Kb4FormEditor onSaved={handleSaved} />
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
            default:
                return <GenericKbEditor formId={formNumber} onSaved={handleSaved} caseNo={caseNo} />
        }
    }

    if (printCase && !canViewHandoffCase(currentRole, printCase, currentOfficerUserId)) {
        return <div className="ws-card p-8 text-center">ไม่มีสิทธิ์เปิดเอกสารของแฟ้มนี้ในบทบาทปัจจุบัน</div>
    }

    if (printCase?.preliminaryDecision && (formNumber === 9 || formNumber === 10) && !noticeDocument?.original) {
        return <div className="space-y-4">
            {printCase.preliminaryDecision.formNo === formNumber
                ? <NoticeDecisionWorkspace caseItem={printCase} onBack={() => navigate({ to: '/dossier/$caseNo', params: { caseNo: printCase.no } })} onConfirmed={() => {
                    const signedCase = useCaseStore.getState().getCase(printCase.no)
                    const destination = signedCase?.preliminaryDecision?.destination
                    const recipient = formNumber === 9 && destination === 'got' ? 'ธุรการคดี กอท.' : signedCase?.assignedOfficer || 'เจ้าของสำนวนเดิม'
                    showSuccessAlert(`ลงนาม คบ.${formNumber} และส่งงานแล้ว`, `ส่งงานให้${recipient}แล้ว เพื่อดำเนินการต่อ${formNumber === 9 && destination === 'got' ? 'และเสนอ ผอ. กอท. มอบหมายผู้รับผิดชอบ' : 'และจัดทำหนังสือแจ้งผล'} โดยหนังสือยังต้องเติมรายละเอียดและตรวจพร้อมส่งก่อนนำส่งผู้ร้อง`, () => navigate({ to: '/dossier/$caseNo', params: { caseNo: printCase.no } }))
                }} />
                : <div className="ws-card space-y-3 p-5"><p>ร่างนี้ไม่ได้ใช้งานกับผลที่เลือกปัจจุบัน ข้อมูลร่างยังเก็บไว้ในแฟ้ม</p><BackLink to="/dossier/$caseNo" params={{ caseNo: printCase.no }}>กลับแฟ้มเพื่อเปิดร่างที่เลือก</BackLink></div>}
        </div>
    }

    return (
        <div className="space-y-6">
            <BackLink to={backTo.to} params={'params' in backTo ? backTo.params : undefined} search={'search' in backTo ? backTo.search : undefined}>{backLabel}</BackLink>

            <DetailHeaderCard
                kicker="แบบฟอร์ม คบ. · จำลองกระดาษ A4"
                refNo={`แบบ ${formMeta.code}`}
                title={formMeta.t}
                meta={[
                    caseNo ? `แฟ้ม ${caseNo}` : 'ไม่ได้เปิดจากแฟ้มคำร้อง',
                    `กระดาษ A4 ${formMeta.pages} หน้า`,
                    formMeta.d,
                ]}
                status={
                    <span className={noticeDocument?.original || draftTouched ? 'ws-status success' : 'ws-status'}>
                        {noticeDocument ? NOTICE_STATUS_LABELS[noticeDocument.status] : draftTouched ? 'มีร่างที่กรอกแล้ว' : 'ยังไม่ได้กรอก'}
                    </span>
                }
                actions={
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
                }
            />

            {/* Document workspace: editor ~44% / preview ~56% (พับ preview เหลือ rail 44px ได้) */}
            <div
                className={`grid grid-cols-1 items-start gap-4 ${
                    previewCollapsed
                        ? 'xl:grid-cols-[minmax(0,1fr)_44px]'
                        : 'xl:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]'
                }`}
            >
                {/* Left Column: Interactive Form Editor */}
                <div className="min-w-0 space-y-4">
                    {routedReadOnly && <p className="ws-readonly text-[0.88rem]">เอกสารจากแฟ้มเดิม · ดูข้อมูลอ้างอิง</p>}
                    {noticeDocument?.original && printCase && <>
                        <NoticeDispatchCard caseItem={printCase} allowPreparation onBeforeDispatch={() => {
                            if (noticeDocument && Object.keys(pendingNoticeDetails.current).length) useCaseStore.getState().completeResultNotice(printCase.no, noticeDocument.formNo, pendingNoticeDetails.current)
                        }} />
                        <ResultNoticeCard caseItem={printCase} onPendingDetailsChange={trackNoticeDetails} />
                    </>}
                    {!noticeDocument?.original && <fieldset disabled={routedReadOnly} className="m-0 min-w-0 border-0 p-0">
                        <FormCaseScope.Provider value={caseNo}>{renderEditor()}</FormCaseScope.Provider>
                        {formNumber === 11 && printCase && !routedReadOnly && !printCase.kb11Signed && <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
                            <Button type="button" data-testid="kb11-form-sign" variant="primary" size="md" disabled={!kb11Gate(printCase).unlocked} onClick={() => setAgreementOpen(true)}>
                                <i className="fa-solid fa-pen-nib" aria-hidden="true" />ลงนาม คบ.11
                            </Button>
                        </div>}
                    </fieldset>}
                </div>

                {/* Right Column: Real-Time Official A4 Government Document */}
                <div className="min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
                    <div className="mb-2 hidden justify-end xl:flex">
                        <Button
                            type="button"
                            variant="secondary"
                            size="icon"
                            aria-expanded={!previewCollapsed}
                            aria-label={previewCollapsed ? 'แสดงตัวอย่างกระดาษ A4' : 'พับตัวอย่างกระดาษ A4'}
                            title={previewCollapsed ? 'แสดงตัวอย่างกระดาษ A4' : 'พับตัวอย่างกระดาษ A4'}
                            data-testid="form-preview-toggle"
                            onClick={() => setPreviewCollapsed((v) => !v)}
                        >
                            <i className={`fa-solid ${previewCollapsed ? 'fa-angles-left' : 'fa-angles-right'}`} />
                        </Button>
                    </div>
                    <div className={previewCollapsed ? 'xl:hidden' : undefined}>
                        <FormPaperViewer formId={formNumber} activeSection={section} caseNo={caseNo} noticeSnapshot={noticeSnapshot} />
                    </div>
                </div>
            </div>
            {printCase && <FormSignatureModal formNo={agreementOpen ? 11 : null} caseNo={printCase.no} onClose={() => setAgreementOpen(false)} />}
        </div>
    )
}
