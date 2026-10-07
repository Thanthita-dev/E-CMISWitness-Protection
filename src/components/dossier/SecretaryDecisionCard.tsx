import { NOTICE_FIELD_LABELS, NOTICE_DETAIL_FIELDS, noticeCanSign } from '../../lib/noticeDocuments'
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { CaseItem, ProtectionHandoffDestination } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast, MySwal } from '../../lib/swal'
import { GOT_UNIT_NAME } from '../../lib/protectionHandoff'
import { PROTECTION_DEFAULT_DAYS, readRoutableProtectionMethods } from '../../lib/constants'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import { useAuthStore } from '../../store/useAuthStore'

interface SecretaryDecisionCardProps {
    caseItem: CaseItem
    /** เรียกหลังสั่งการเสร็จ เผื่อหน้าที่เรียกใช้ต้องรีเฟรชมุมมอง */
    onDecisionComplete?: () => void
    onOpenNotice?: (formNo: 9 | 10) => void
}

/** WIT0704 — ผลพิจารณามี 4 แขนง: อนุมัติ · ไม่อนุมัติ · ส่งกลับ/ขอข้อมูลเพิ่ม · เห็นควรตามข้อ 14 */
type DecisionMode = 'approve' | 'reject' | 'return' | 'article14'

/** WIT0703 — เทียบเลขแฟ้มแบบไม่ติดช่องว่าง/ตัวพิมพ์ เพื่อไม่ให้เตือนผิดเพราะรูปแบบการพิมพ์ */
const normalizeCaseNo = (value: string) => value.trim().replace(/\s+/g, '').toUpperCase()

interface DecisionConfirmInput {
    destination?: ProtectionHandoffDestination
    instruction: string
    decisionNo: string
    reason: string
    returnIssue: string
    /** เลขแฟ้ม / เลขคำร้องที่ระบุไว้ในผลพิจารณาฉบับที่รับเข้ามา */
    refCaseNo: string
    /** true เมื่อผู้ใช้ยืนยันผูกผลพิจารณาเข้าแฟ้มนี้ทั้งที่เลขแฟ้มไม่ตรง */
    caseNoMismatch: boolean
}

const DecisionModalBody: React.FC<{
    mode: DecisionMode
    /** เลขคำร้องของแฟ้มที่เปิดอยู่ — ต้นทางที่ใช้เทียบความสอดคล้องตาม WIT0703 */
    caseNo: string
    originalOwnerName: string
    durationDays: number
    methods: number[]
    initialDecisionNo: string
    initialReason: string
    onCancel: () => void
    onConfirm: (input: DecisionConfirmInput) => boolean
}> = ({ mode, caseNo, originalOwnerName, durationDays, methods, initialDecisionNo, initialReason, onCancel, onConfirm }) => {
    const previewCase = useCaseStore((state) => state.getCase(caseNo))
    const notices = previewCase?.resultNotices
    const notice = mode === 'approve' ? notices?.[9] : mode === 'reject' ? notices?.[10] : undefined
    const [decisionNo, setDecisionNo] = useState(initialDecisionNo)
    const [reason, setReason] = useState(initialReason)
    const [returnIssue, setReturnIssue] = useState('ข้อเท็จจริงหรือเอกสารประกอบไม่ครบ')
    /** WIT0703 — ตั้งต้นด้วยเลขแฟ้มปัจจุบัน แล้วให้แก้เป็นเลขที่ปรากฏจริงในผลพิจารณาได้ */
    const [refCaseNo, setRefCaseNo] = useState(caseNo)
    const [mismatchAck, setMismatchAck] = useState(false)
    /** แจ้งเตือนในโมดัล — ใช้ toast ไม่ได้เพราะ SweetAlert เป็น singleton แล้วจะปิดโมดัลนี้ทิ้ง */
    const [error, setError] = useState('')
    const [destination, setDestination] = useState<ProtectionHandoffDestination | ''>('')
    const [instruction, setInstruction] = useState('')
    const [review, setReview] = useState(false)
    const recipientName = destination === 'got' ? `ธุรการคดี ${GOT_UNIT_NAME}` : originalOwnerName

    const checksCaseNo = mode !== 'return'
    const mismatch =
        checksCaseNo && refCaseNo.trim().length > 0 && normalizeCaseNo(refCaseNo) !== normalizeCaseNo(caseNo)

    const handleConfirm = () => {
        if (checksCaseNo && !refCaseNo.trim()) {
            setError('กรุณาระบุเลขแฟ้ม / เลขคำร้องที่อ้างอิงในผลพิจารณา')
            return
        }
        if (mismatch && !mismatchAck) {
            setError('เลขแฟ้มในผลพิจารณาไม่ตรงกับคำร้องของแฟ้มนี้ — ตรวจสอบและติ๊กยืนยันก่อนจึงจะผูกเข้าแฟ้มได้')
            return
        }
        if (!reason.trim()) {
            setError('กรุณาระบุเหตุผลและข้อสั่งการ')
            return
        }
        if (mode === 'approve' && !destination) {
            setError('กรุณาเลือกผู้รับผิดชอบดำเนินการต่อก่อนยืนยัน')
            return
        }
        if (notice && !noticeCanSign(notice)) { setError(notice.policy.confirmed ? 'หนังสือแจ้งผลยังขาดข้อมูลที่ต้องครบก่อนลงนาม กรุณาเติมร่างในชุดเสนอ' : 'หนังสือแจ้งผลยังขาดข้อมูลที่ต้องครบก่อนลงนาม — รายการช่องที่เติมภายหลังยังรอเจ้าของงานยืนยัน'); return }
        if ((mode === 'approve' || mode === 'reject') && !review) {
            setError('')
            setReview(true)
            return
        }
        setError('')
        const saved = onConfirm({ decisionNo, reason, returnIssue, refCaseNo: refCaseNo.trim(), caseNoMismatch: mismatch, destination: destination || undefined, instruction })
        if (!saved) setError('สถานะงานหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาเปิดแฟ้มเพื่อตรวจสอบอีกครั้ง')
    }

    return (
        <div className="space-y-3 text-left">
            {notice && <section className="ws-readonly space-y-2" data-testid="decision-notice-preview">
                <strong>หนังสือแจ้งผลในชุดเสนอ: คบ.{notice.formNo} · {mode === 'approve' ? 'อนุมัติคุ้มครอง' : 'ไม่อนุมัติคุ้มครอง'}</strong>
                <p>ยืนยันผลครั้งนี้จะลงนามจำลองเฉพาะ คบ.{notice.formNo} ไม่ลงนามหนังสืออีกผลพร้อมกัน</p>
                <dl>{NOTICE_DETAIL_FIELDS.map((field) => <div key={field}><dt className="inline font-semibold">{NOTICE_FIELD_LABELS[field]}: </dt><dd className="inline">{notice.fields[field] || '(ยังขาด)'} {notice.policy.confirmed && notice.policy.allowedAfterSigning.includes(field) ? '· อนุญาตเติมหลังลงนาม' : '· ต้องครบก่อนลงนาม'}<br /></dd></div>)}</dl>
                <p className="text-[0.8rem] text-muted">ข้อมูลที่ต้องครบก่อนลงนาม: ผลพิจารณาและเหตุผลในหน้านี้ ส่วนผู้ลงนาม{notice.formNo === 9 ? ' วันที่อนุมัติ' : ''} และวันเวลาลงนามจะบันทึกอัตโนมัติเมื่อยืนยัน</p>
                <p>ผลพิจารณา เหตุผล ผู้ลงนาม และวันเวลาลงนามจะถูกเก็บในฉบับเดิมแบบแก้ทับไม่ได้ ลายมือชื่อจำลองไม่มีผลทางกฎหมาย</p>
                {previewCase && <details data-testid="decision-notice-paper">
                    <summary className="cursor-pointer font-semibold text-navy">ตรวจเนื้อหาหนังสือ คบ.{notice.formNo} บนกระดาษ A4 ก่อนลงนาม</summary>
                    <p className="my-2 text-[0.8rem] text-muted">วันและเวลาลงนามจริงจะบันทึกเมื่อยืนยัน ร่างนี้ยังไม่มีลายมือชื่อ</p>
                    <FormPaperViewer formId={notice.formNo} caseNo={caseNo} noticeDraftPreview={{
                        caseContext: previewCase,
                        fields: { ...notice.fields, เลขาธิการ: useAuthStore.getState().getCurrentUserAccount()?.name || '', ...(notice.formNo === 9 ? { วันที่อนุมัติ: new Date().toISOString() } : { สาระสำคัญ: reason }) },
                    }} />
                </details>}
                {!notice.policy.confirmed && <p className="text-warning">รายการช่องที่อนุญาตเติมหลังลงนามยังรอเจ้าของงานยืนยัน จึงไม่เปิดแก้หลังลงนามโดยอัตโนมัติ</p>}
            </section>}
            {review ? (
                <section data-testid="decision-review-step" className="ws-readonly space-y-3">
                    <h3 className="font-bold text-navy">ตรวจสอบก่อนยืนยันผลและลงนามหนังสือแจ้งผล</h3>
                    <dl className="space-y-2 text-[0.88rem] text-ink">
                        <div><dt className="ws-label">เลขคำร้อง / เลขอ้างอิงผลพิจารณา</dt><dd>{caseNo} / {decisionNo}</dd></div>
                        {mode === 'approve' && <div><dt className="ws-label">ผู้รับผิดชอบดำเนินการต่อ</dt><dd>{destination === 'got' ? 'กอท.' : 'เจ้าของสำนวนเดิม'}: {recipientName}</dd></div>}
                        <div><dt className="ws-label">ผลพิจารณาและระยะเวลา</dt><dd>{mode === 'approve' ? `อนุมัติคุ้มครอง ${durationDays} วัน` : 'ไม่อนุมัติคุ้มครอง'}</dd></div>
                        {mode === 'approve' && <div><dt className="ws-label">วิธีคุ้มครองตามคำสั่ง</dt><dd>{methods.length ? methods.map((m) => `วิธีที่ ${m}`).join(' · ') : 'ตามแบบ คบ.6 ในแฟ้ม'}</dd></div>}
                        <div><dt className="ws-label">เหตุผลประกอบ</dt><dd className="whitespace-pre-wrap break-words">{reason}</dd></div>
                        <div><dt className="ws-label">คำสั่ง / หมายเหตุ</dt><dd className="whitespace-pre-wrap break-words">{instruction || 'ไม่ระบุ'}</dd></div>
                    </dl>
                    {destination === 'got' && <p className="text-[0.8rem] text-muted">ธุรการคดี กอท. รับเรื่อง → ส่งเสนอ ผอ. กอท. → ผอ. มอบหมาย → ผู้รับผิดชอบรับงาน</p>}
                </section>
            ) : <>
            {checksCaseNo && (
                <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
                        เลขแฟ้มของผลพิจารณาที่รับเข้ามา (เลขคำร้อง) *
                    </label>
                    <input
                        type="text"
                        value={refCaseNo}
                        data-testid="decision-ref-case-no-input"
                        onChange={(e) => {
                            setRefCaseNo(e.target.value)
                            setMismatchAck(false)
                            setError('')
                        }}
                        className={`w-full h-10 rounded-lg border px-3 text-[0.8rem] text-ink focus:outline-none ${mismatch ? 'border-amber-500 bg-amber-50/60 focus:border-amber-600' : 'border-slate-300 focus:border-blue'
                            }`}
                    />
                    <p className="mt-1 text-[0.8rem] text-muted">แฟ้มที่เปิดอยู่: {caseNo}</p>
                </div>
            )}

            {mismatch && (
                <div
                    data-testid="decision-case-no-mismatch-warning"
                    className="rounded-xl border border-amber-300 bg-amber-50 p-3 space-y-2"
                >
                    <p className="text-[0.8rem] font-semibold text-amber-900">
                        <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                        เลขแฟ้มในผลพิจารณาไม่ตรงกับคำร้องของแฟ้มนี้ ({caseNo})
                    </p>
                    <p className="text-[0.8rem] text-amber-800">
                        ตรวจสอบว่ารับผลพิจารณามาถูกแฟ้มหรือไม่ — ระบบจะไม่ผูกผลพิจารณาเข้าแฟ้มนี้ให้โดยอัตโนมัติ
                    </p>
                    <label className="flex items-start gap-2 text-[0.8rem] font-semibold text-amber-900">
                        <input
                            type="checkbox"
                            checked={mismatchAck}
                            data-testid="decision-case-no-mismatch-ack"
                            onChange={(e) => {
                                setMismatchAck(e.target.checked)
                                setError('')
                            }}
                            className="mt-0.5"
                        />
                        ตรวจสอบแล้ว ยืนยันผูกผลพิจารณาฉบับนี้เข้ากับแฟ้ม {caseNo} (บันทึกลง Audit Log)
                    </label>
                </div>
            )}
            {mode !== 'return' && (
                <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
                        เลขที่คำสั่ง / เลขอ้างอิงผลพิจารณา *
                    </label>
                    <input
                        type="text"
                        value={decisionNo}
                        onChange={(e) => setDecisionNo(e.target.value)}
                        className="ws-input w-full text-ink"
                    />
                </div>
            )}

            {mode === 'return' && (
                <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ประเด็นที่ต้องแก้ไข *</label>
                    <select
                        value={returnIssue}
                        onChange={(e) => setReturnIssue(e.target.value)}
                        className="ws-input w-full text-ink"
                    >
                        <option value="ข้อเท็จจริงหรือเอกสารประกอบไม่ครบ">ข้อเท็จจริงหรือเอกสารประกอบไม่ครบ</option>
                        <option value="ความเห็นตามลำดับชั้นไม่ชัดเจน">ความเห็นตามลำดับชั้นไม่ชัดเจน</option>
                        <option value="ผลประเมินภัยหรือวิธีคุ้มครองไม่ครบ">ผลประเมินภัยหรือวิธีคุ้มครองไม่ครบ</option>
                        <option value="ลายมือชื่อหรือฉบับเอกสารไม่ครบ">ลายมือชื่อหรือฉบับเอกสารไม่ครบ</option>
                    </select>
                </div>
            )}

            <div>
                <label htmlFor="decisionReason" className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เหตุผลประกอบและข้อสั่งการ *</label>
                <textarea
                    id="decisionReason"
                    data-testid="decision-reason-input"
                    rows={4}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="ws-input w-full text-ink"
                />
            </div>
            {mode === 'approve' && (
                <div className="space-y-3">
                    <div className="ws-field">
                        <label htmlFor="decisionDestination" className="ws-label">ผู้รับผิดชอบดำเนินการต่อ *</label>
                        <select id="decisionDestination" data-testid="decision-destination-select" className="ws-input w-full" value={destination}
                            onChange={(e) => { setDestination(e.target.value as ProtectionHandoffDestination | ''); setError('') }}>
                            <option value="">เลือกผู้รับผิดชอบดำเนินการต่อ</option>
                            <option value="original_owner">เจ้าของสำนวนเดิม</option>
                            <option value="got">กอท.</option>
                        </select>
                        {destination && <p data-testid="decision-recipient" className="text-[0.88rem] text-ink">ผู้รับ: {recipientName}</p>}
                    </div>
                    <div className="ws-field">
                        <label htmlFor="decisionInstruction" className="ws-label">คำสั่ง / หมายเหตุ</label>
                        <textarea id="decisionInstruction" data-testid="decision-instruction-input" className="ws-input w-full" rows={3}
                            value={instruction} onChange={(e) => setInstruction(e.target.value)} />
                    </div>
                </div>
            )}
            </>}

            {error && (
                <p
                    data-testid="decision-validation-error"
                    className="rounded-lg border border-rose-300 bg-rose-50 min-h-[44px] px-4 py-2 text-sm font-semibold text-rose-700"
                >
                    <i className="fa-solid fa-circle-exclamation mr-1.5" />
                    {error}
                </p>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
                {review && <Button type="button" variant="secondary" size="md" onClick={() => setReview(false)}>กลับไปแก้ไข</Button>}
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
                    onClick={handleConfirm}
                    data-testid="decision-confirm-button"
                    variant={mode === 'reject' ? 'danger' : 'primary'}
                    size="lg"
                >
                    <i className="fa-solid fa-check" />
                    {mode === 'approve' ? (review ? 'ยืนยันอนุมัติและส่งงาน' : 'ตรวจสอบก่อนส่งงาน') : 'ยืนยันและส่งผล'}
                </Button>
            </div>
        </div>
    )
}

/**
 * ขั้นที่ 5 — คำสั่งชี้ขาดของเลขาธิการ ป.ป.ท. ในหน้าแฟ้มคำร้อง
 * อยู่ท้ายแฟ้มคู่กับการ์ดส่งต่อของบทบาทอื่น — ลงนามความเห็นข้อ 13 ที่แบบ คบ.6 ก่อน
 * แล้วจึงสั่งอนุมัติ / ไม่อนุมัติ ได้ที่นี่ (ส่งกลับแก้ไขกดได้ตลอด)
 */
export const SecretaryDecisionCard: React.FC<SecretaryDecisionCardProps> = ({ caseItem, onDecisionComplete, onOpenNotice }) => {
    const { secretaryApprove, secretaryReject, secretaryReturn, secretaryReferArticle14, logHistory } = useCaseStore()

    const secretarySigned = Boolean(caseItem.kb6SecretarySignedAt)
    /** ผู้กระทำที่บันทึกลง Audit Log ของแฟ้ม — ตรงกับผู้ลงนามความเห็นข้อ 13 ใน คบ.6 ถ้ามี */
    const secretaryLabel = caseItem.kb6SecretarySignedBy || 'เลขาธิการ ป.ป.ท.'

    const openNoticeDraft = (outcome: 'approved' | 'rejected') => {
        if (!useCaseStore.getState().beginPreliminaryDecision(caseItem.no, outcome)) { showToast('ยังเปิดร่างไม่ได้: ตรวจสิทธิและสถานะของแฟ้ม', 'warning'); return }
        onOpenNotice?.(outcome === 'approved' ? 9 : 10)
    }

    const openDecisionModal = (mode: DecisionMode, defaultReason: string) => {
        if (mode !== 'return' && !secretarySigned) {
            showToast('ต้องลงนามความเห็นเลขาธิการฯ (ข้อ 13) ใน คบ.6 ก่อนจึงจะสั่งการได้')
            return
        }
        useCaseStore.getState().prepareResultNotices(caseItem.no)
        const proposedMethods = readRoutableProtectionMethods(useFormDraftStore.getState().getDraft(6))
        MySwal.fire({
            title:
                mode === 'approve'
                    ? 'ลงนามอนุมัติให้ความคุ้มครองพยาน'
                    : mode === 'reject'
                        ? 'ลงนามคำสั่งไม่อนุมัติ'
                        : mode === 'article14'
                            ? 'เห็นควรส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ'
                            : 'ส่งกลับให้แก้ไขตามข้อสั่งการ',
            html: (
                <DecisionModalBody
                    mode={mode}
                    caseNo={caseItem.no}
                    originalOwnerName={caseItem.assignedOfficer || 'ยังไม่ได้มอบหมายเจ้าของสำนวน'}
                    durationDays={caseItem.protectionDays || PROTECTION_DEFAULT_DAYS}
                    methods={proposedMethods.length > 0 ? proposedMethods : caseItem.orderedMethods || []}
                    initialDecisionNo={`ลธ.ปปท./${caseItem.no.slice(-6)}/2569`}
                    initialReason={defaultReason}
                    onCancel={() => MySwal.close()}
                    onConfirm={({ decisionNo, reason, returnIssue, refCaseNo, caseNoMismatch, destination, instruction }) => {
                        if (mode === 'approve') {
                            if (!destination || !secretaryApprove(caseItem.no, decisionNo, reason, destination, instruction, caseItem.protectionDays)) return false
                            showToast('เลขาธิการ ป.ป.ท. ลงนามอนุมัติคำสั่งคุ้มครองพยานเรียบร้อยแล้ว')
                        } else if (mode === 'reject') {
                            secretaryReject(caseItem.no, decisionNo, reason)
                            if (!useCaseStore.getState().getCase(caseItem.no)?.resultNotices?.[10]?.original) return false
                            showToast('เลขาธิการ ป.ป.ท. ลงนามคำสั่งไม่อนุมัติเรียบร้อยแล้ว')
                        } else if (mode === 'article14') {
                            secretaryReferArticle14(caseItem.no, decisionNo, reason)
                            showToast('บันทึกผล "เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ" และส่งเรื่องไปหน้าส่งต่อกรมคุ้มครองสิทธิฯ แล้ว')
                        } else {
                            secretaryReturn(caseItem.no, returnIssue, reason)
                            showToast('ส่งกลับแก้ไขเรียบร้อยแล้ว')
                        }

                        /**
                         * WIT0703 — ผูกผลพิจารณาที่เลขแฟ้มไม่ตรงกับคำร้องได้ต่อเมื่อผู้สั่งการยืนยันเอง
                         * และต้องเห็นร่องรอยใน Audit Log ของแฟ้มเสมอว่ายืนยันทับความไม่สอดคล้องไว้
                         */
                        if (caseNoMismatch) {
                            logHistory(
                                caseItem.no,
                                'ยืนยันผูกผลพิจารณาที่เลขแฟ้มไม่ตรงกับคำร้อง',
                                secretaryLabel,
                                `เลขแฟ้มที่อ้างอิงในผลพิจารณา "${refCaseNo}" ไม่ตรงกับเลขคำร้องของแฟ้มนี้ (${caseItem.no}) — ผู้สั่งการตรวจสอบและยืนยันผูกเข้าแฟ้มนี้`
                            )
                        }

                        MySwal.close()
                        onDecisionComplete?.()
                        return true
                    }}
                />
            ),
            showConfirmButton: false,
            showCloseButton: true,
            customClass: { popup: 'font-sans rounded-xl' },
        })
    }

    return (
        <section data-testid="secretary-decision-card" className="ws-card border-l-4 border-l-gold p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-blue-100 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue text-white font-bold">
                        <i className="fa-solid fa-stamp text-sm" />
                    </div>
                    <div>
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">คำสั่งชี้ขาดของเลขาธิการ ป.ป.ท.</h2>
                        <p className="text-[0.8rem] text-muted">
                            {secretarySigned
                                ? 'เลือกอนุมัติหรือไม่อนุมัติเพื่อเปิดหนังสือแจ้งผล จากนั้นตรวจและยืนยันลงนามในส่วนแบบฟอร์ม'
                                : 'ต้องลงนามความเห็นเลขาธิการฯ (ข้อ 13) ใน คบ.6 ก่อนจึงจะสั่งการอนุมัติหรือไม่อนุมัติได้'}
                        </p>
                    </div>
                </div>
            </div>

            {!secretarySigned && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                    <p className="text-[0.8rem] font-semibold text-amber-800">
                        <i className="fa-solid fa-lock mr-1.5" />
                        ยังไม่ได้ลงนามความเห็นข้อ 13 ในแบบ คบ.6
                    </p>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1 border-t border-blue-100">
                <Button
                    type="button"
                    data-testid="secretary-return-button"
                    onClick={() =>
                        openDecisionModal('return', 'ข้อเท็จจริงหรือผลประเมินความเสี่ยงยังไม่ครบถ้วนตามหลักเกณฑ์')
                    }
                    variant="secondary"
                    size="md"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                    <i className="fa-solid fa-rotate-left" />
                    ส่งกลับแก้ไข
                </Button>

                <Button
                    type="button"
                    disabled={!secretarySigned}
                    data-testid="refer-article14-button"
                    onClick={() =>
                        openDecisionModal(
                            'article14',
                            'พฤติการณ์ภัยคุกคามเกินขอบเขตมาตรการเบื้องต้นของ ป.ป.ท. เห็นควรส่งต่อกรมคุ้มครองสิทธิและเสรีภาพ'
                        )
                    }
                    variant="secondary"
                    size="md"
                    title={secretarySigned ? undefined : 'ต้องลงนามความเห็นข้อ 13 ก่อน'}
                >
                    <i className="fa-solid fa-building-columns" />
                    เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ
                </Button>

                <Button
                    type="button"
                    disabled={!secretarySigned}
                    data-testid="reject-case-button"
                    onClick={() =>
                        openNoticeDraft('rejected')
                    }
                    variant="danger"
                    size="md"
                    title={secretarySigned ? undefined : 'ต้องลงนามความเห็นข้อ 13 ก่อน'}
                >
                    <i className="fa-solid fa-ban" />
                    ไม่อนุมัติคุ้มครอง
                </Button>

                <Button
                    type="button"
                    disabled={!secretarySigned}
                    data-testid="approve-case-button"
                    onClick={() =>
                        openNoticeDraft('approved')
                    }
                    variant="primary"
                    size="lg"
                    title={secretarySigned ? undefined : 'ต้องลงนามความเห็นข้อ 13 ก่อน'}
                >
                    <i className="fa-solid fa-signature" />
                    อนุมัติคุ้มครอง
                </Button>
            </div>
        </section>
    )
}
