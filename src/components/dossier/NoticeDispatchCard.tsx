import { kb10ClerkAllowed, noticeForCase, noticeWorkerAllowed, missingNoticeFields, NOTICE_FIELD_LABELS } from '../../lib/noticeDocuments'
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { APPEAL_WINDOW_DAYS, ECMIS_USER_DIRECTORY, isCaseWorkerRole } from '../../lib/constants'
import { formatThaiDateTime, daysUntil } from '../../lib/utils'
import { showToast, showConfirmAlert, confirmBody } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'
import { Kb10ScreeningCard } from './Kb10ScreeningCard'

interface NoticeDispatchCardProps {
    caseItem: CaseItem
    onActionComplete?: () => void
    allowPreparation?: boolean
    onBeforeDispatch?: () => void
}

/** หนังสือส่งออกที่ลงนามจากหน้าแบบฟอร์มของฉบับนั้น — การ์ดนี้แสดงสถานะและพาไปลงนาม */
const OUTGOING_NOTICES = [
    { formId: '9', code: 'คบ.9 หนังสือแจ้งตอบรับการคุ้มครอง', track: 'approved', signedAt: (c: CaseItem) => c.kb9SignedAt },
    { formId: '10', code: 'คบ.10 หนังสือแจ้งไม่ให้การคุ้มครอง', track: 'rejected', signedAt: (c: CaseItem) => c.kb10SignedAt },
] as const

const CHANNELS = ['ไปรษณีย์ตอบรับด่วน (EMS)', 'ส่งมอบโดยตรงถึงตัวพยาน']
const LEGACY_ELECTRONIC_CHANNEL = 'สื่ออิเล็กทรอนิกส์ / ระบบ ป.ป.ท.'

/** WIT0806 — หลักฐานการรับทราบที่ใช้ยืนยันว่าหนังสือถึงมือพยานแล้ว */
const ACK_TYPES = [
    'ใบตอบรับไปรษณีย์ (EMS)',
    'ใบรับเอกสารลงลายมือชื่อผู้รับ',
    'บันทึกการรับทราบทางอิเล็กทรอนิกส์',
    'ภาพถ่าย/หลักฐานการส่งมอบด้วยตนเอง',
]

/** WIT0806 — ผู้ที่รับหนังสือแทนพยานได้ตามกฎหมาย */
const RECIPIENT_RELATIONS = ['พยานรับด้วยตนเอง', 'ผู้แทนโดยชอบ', 'บุคคลในครอบครัว']

/** รับแทนพยาน — ต้องระบุชื่อ/ความสัมพันธ์เพิ่ม เพราะเป็นข้อมูลสำคัญทางกฎหมาย */
const needsRelationDetail = (relation: string) => relation !== RECIPIENT_RELATIONS[0]

/** หลักฐานที่ตรงกับช่องทางนำส่งมากที่สุด — ใช้เป็นค่าตั้งต้นของ dropdown */
const defaultAckType = (channel?: string) =>
    channel === CHANNELS[1] ? ACK_TYPES[1] : channel === LEGACY_ELECTRONIC_CHANNEL ? ACK_TYPES[2] : ACK_TYPES[0]

/**
 * ขั้นตอนที่ 5 (ต่อ) — รอบลงนาม คบ.9 ก่อนส่งออกถึงพยาน,
 * การนำส่งหนังสือ, วันที่พยานได้รับ (จุดตั้งต้นนับอุทธรณ์ 30 วัน) และการยื่นอุทธรณ์
 */
export const NoticeDispatchCard: React.FC<NoticeDispatchCardProps> = ({ caseItem, onActionComplete, allowPreparation = false, onBeforeDispatch }) => {
    const { currentRole } = useAuthStore()
    const { submitOutgoingForSignature, recordDispatch, recordDelivery, reportDispatchFailure } = useCaseStore()
    const { ensureSetForForm, addFileToSet } = useFormDraftStore()

    const [deliveryComplete, setDeliveryComplete] = useState(false)
    const [channel, setChannel] = useState(CHANNELS[0])
    const [tracking, setTracking] = useState('')
    const [failureReason, setFailureReason] = useState('')
    const [dispatchError, setDispatchError] = useState('')
    const [deliveredDate, setDeliveredDate] = useState((caseItem.deliveredAt || new Date().toISOString()).slice(0, 10))
    const [recipient, setRecipient] = useState(caseItem.deliveryRecipient || caseItem.person)
    const [recipientRelation, setRecipientRelation] = useState(RECIPIENT_RELATIONS[0])
    const [relationDetail, setRelationDetail] = useState('')
    const [ackType, setAckType] = useState(defaultAckType(caseItem.dispatchChannel))
    const [ackFile, setAckFile] = useState<File | null>(null)

    /** หลักฐานการรับทราบต้องผ่านเกณฑ์ไฟล์แนบเดียวกับทั้งระบบก่อนจึงเก็บไว้แนบ */
    const handleAckFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        e.target.value = ''
        if (!file) return
        const rejection = getAttachmentRejection(file)
        if (rejection) {
            showToast(rejection, 'error')
            return
        }
        setAckFile(file)
    }

    const document = noticeForCase(caseItem)
    const isOfficer = isCaseWorkerRole(currentRole) && (!document || noticeWorkerAllowed(currentRole, caseItem, useAuthStore.getState().currentOfficerUserId))
    /** WIT0912 — ธุรการสำนัก/กองรับคำอุทธรณ์ช่องทางหนังสือเข้าแฟ้มเดิมได้ แล้วเรื่องเดินต่อที่เจ้าหน้าที่ตรวจ (WIT0914) */
    const isReceiver = currentRole === 'receiver'
    const canRecordReceipt = isOfficer || (document?.formNo === 10 && kb10ClerkAllowed(currentRole, caseItem, useAuthStore.getState().currentOrgUnitId))
    const isPostalChannel = channel === CHANNELS[0]

    const isApproved = caseItem.activity7State === 'approved'
    const isRejected = caseItem.activity7State === 'rejected'
    const step = caseItem.approvalStep || 0

    /** เลขาธิการ ป.ป.ท. ลงนามหนังสือส่งออกของขั้นแจ้งผลแล้ว (คบ.9 เส้นทางอนุมัติ / คบ.10 เส้นทางไม่อนุมัติ) */
    const outgoingSigned = document ? Boolean(document.original && ['ready', 'sent'].includes(document.status)) : Boolean(caseItem.outgoingSignedAt)

    const appealDaysLeft = daysUntil(caseItem.appealDueAt)
    /** WIT0909 — ปิดเรื่องไม่อนุมัติแล้ว (พยานไม่ประสงค์อุทธรณ์/ครบ 30 วัน) ไม่รับคำอุทธรณ์ คบ.10 อีก */
    const nonApprovalClosed = Boolean(caseItem.nonApprovalClosedAt)
    const appealOpen = isRejected && Boolean(caseItem.deliveredAt) && !caseItem.appealFiledAt && !nonApprovalClosed

    /** WIT0806 — วันรับ ผู้รับ และหลักฐานการรับทราบต้องครบ ก่อนจะปลดล็อก คบ.11 */
    const handleRecordDelivery = () => {
        if (!recipient.trim()) {
            showToast('กรุณาระบุชื่อผู้รับหนังสือ')
            return
        }
        if (needsRelationDetail(recipientRelation) && !relationDetail.trim()) {
            showToast(`กรุณาระบุรายละเอียดผู้รับแทน (${recipientRelation})`)
            return
        }
        if (!ackFile) {
            showToast('กรุณาแนบไฟล์หลักฐานการรับทราบ')
            return
        }

        /** หลักฐานรับหนังสือเก็บกับแบบที่ตรงผล และเก็บแยกจากเนื้อหาฉบับส่ง */
        addFileToSet(ensureSetForForm(isRejected ? 10 : 9), {
            name: ackFile.name,
            size: ackFile.size,
            type: ackFile.type,
            lastModified: ackFile.lastModified,
            previewUrl: URL.createObjectURL(ackFile),
        })

        recordDelivery(caseItem.no, new Date(deliveredDate).toISOString(), {
            recipient: recipient.trim(),
            recipientRelation: needsRelationDetail(recipientRelation)
                ? `${recipientRelation} — ${relationDetail.trim()}`
                : recipientRelation,
            ackType,
            ackDocument: ackFile.name,
        })
        const saved = useCaseStore.getState().getCase(caseItem.no)
        if (!saved?.deliveredAt) { showToast('ยังบันทึกการรับหนังสือไม่ได้ กรุณาตรวจข้อมูลและสิทธิ์', 'warning'); return }
        showToast(isApproved ? 'บันทึกการรับ คบ.9 แล้ว ให้พยานลงนาม คบ.11 ต่อ' : 'บันทึกการรับ คบ.10 แล้ว · ยื่นอุทธรณ์ได้')
        onActionComplete?.()
    }

    /** TC-064 — บันทึกว่าการนำส่งครั้งล่าสุดตีกลับ/ไม่สำเร็จ เปิดทางให้เปลี่ยนช่องทางแล้วส่งใหม่ */
    const handleReportFailure = () => {
        if (!failureReason.trim()) {
            showToast('กรุณาระบุเหตุผลที่นำส่งไม่สำเร็จ/ตีกลับ')
            return
        }
        showConfirmAlert({
            icon: 'warning',
            title: 'แจ้งว่าการนำส่งไม่สำเร็จ/ตีกลับ?',
            html: confirmBody(
                'บันทึกว่าการนำส่งหนังสือครั้งล่าสุดไม่สำเร็จ/ตีกลับ',
                [['เหตุผล', failureReason.trim()]],
                'เปิดให้เปลี่ยนช่องทางนำส่ง (เช่น นำส่งโดยตรง) และบันทึกการนำส่งใหม่อีกครั้ง'
            ),
            showCancelButton: true,
            confirmButtonText: 'ยืนยันว่าไม่สำเร็จ',
            cancelButtonText: 'ยกเลิก',
        }).then((res) => {
            if (!res.isConfirmed) return
            reportDispatchFailure(caseItem.no, failureReason.trim())
            setFailureReason('')
            setChannel(CHANNELS[1])
            showToast('บันทึกว่าการนำส่งไม่สำเร็จแล้ว — เลือกช่องทางใหม่แล้วบันทึกการนำส่งอีกครั้ง', 'warning')
            onActionComplete?.()
        })
    }



    // เติมรายละเอียดและตรวจฉบับในหน้าแบบฟอร์ม จะแสดงส่วนส่งหนังสือเมื่อพร้อมส่งแล้ว
    if (document && !['ready', 'sent'].includes(document.status) && !(allowPreparation && document.original)) return null

    if (isRejected && caseItem.deliveredAt) return null

    return (
        <section id="notice-dispatch" data-testid="notice-dispatch-card" className="ws-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
                        <i className="fa-solid fa-envelope-circle-check text-sm" />
                    </div>
                    <div>
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">{document ? 'นำส่งหนังสือแจ้งผล' : 'ขั้นที่ 5 · จัดทำ ลงนาม และนำส่งหนังสือแจ้งผล'}</h2>
                        {isApproved && <p className="text-[0.8rem] text-muted">ส่ง คบ.9 ให้พยาน แล้วบันทึกการรับแจ้งก่อนลงนาม คบ.11</p>}
                    </div>
                </div>
            </div>

            {/* WIT0904 / WIT0905 / WIT0909 — ด่านก่อนรอบลงนาม คบ.10 และปลายทาง "ไม่อุทธรณ์" */}
            {!document && caseItem.outgoingSignedAt && <p className="ws-readonly">ข้อมูลจากโฟลว์เดิม — ไม่มีฉบับลงนามเดิมและประวัติรุ่นที่ระบบนี้บันทึกไว้ ไม่อ้างว่ามีหลักฐานตรวจสอบลายมือชื่อย้อนหลัง</p>}
            {isRejected && (!document || Boolean(caseItem.deliveredAt) || Boolean(caseItem.nonApprovalClosedAt)) && <Kb10ScreeningCard caseItem={caseItem} />}

            {/* รอบลงนามหนังสือส่งออก — ตัวลงนามจริงอยู่ในหน้าแบบฟอร์มของแต่ละฉบับ */}
            {!document && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 text-[0.8rem]">
                <div className="font-bold text-navy">
                    {isApproved ? 'คบ.9 ลงนามพร้อมผลอนุมัติในชุดเสนอ' : 'คบ.10 ลงนามพร้อมผลไม่อนุมัติในชุดเสนอ'}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {OUTGOING_NOTICES.filter((n) => (isApproved ? n.track === 'approved' : n.track === 'rejected')).map((n) => {
                        const signedAt = n.signedAt(caseItem)
                        return (
                            <Link
                                key={n.formId}
                                to="/form/$formId"
                                params={{ formId: n.formId }}
                                search={{ caseNo: caseItem.no }}
                                className={`flex items-center justify-between gap-2 rounded-lg border p-2.5 transition hover:border-blue ${signedAt ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-white'
                                    }`}
                            >
                                <div className="min-w-0">
                                    <strong className="block text-navy">{n.code}</strong>
                                    <span className="block text-[0.8rem] text-muted truncate">
                                        {signedAt
                                            ? `ลงนามแล้ว ${signedAt}`
                                            : (isRejected ? (caseItem.nonApprovalStep || 0) >= 2 : step >= 2)
                                                ? 'รอเลขาธิการฯ ลงนามในแบบฟอร์ม'
                                                : isRejected
                                                    ? 'รอผ่านด่านกลั่นกรองของรองเลขาธิการฯ ก่อน'
                                                    : 'ยังไม่ได้เสนอลงนาม'}
                                    </span>
                                </div>
                                <i
                                    className={`fa-solid ${signedAt ? 'fa-circle-check text-emerald-600' : 'fa-pen-nib text-muted'}`}
                                />
                            </Link>
                        )
                    })}
                </div>

                <p className="text-[0.88rem] text-muted leading-relaxed">
                    <i className="fa-solid fa-circle-info mr-1.5" />
                    เลขาธิการลงนามหนังสือแจ้งผลพร้อมการพิจารณาในชุดเสนอ คลิกหนังสือเพื่อตรวจฉบับเดิมและประวัติ การลงนามยังไม่ถือว่าส่งแจ้งผลแล้ว
                </p>

                {!document && isApproved && isOfficer && step < 2 && !caseItem.kb9Signed && (
                    <div className="flex flex-wrap justify-end gap-2">
                        <Button
                            type="button"
                            onClick={() => {
                                submitOutgoingForSignature(caseItem.no)
                                showToast('เสนอ คบ.9 ให้เลขาธิการ ป.ป.ท. ลงนามแล้ว')
                                onActionComplete?.()
                            }}
                            variant="primary"
                            size="md"
                        >
                            <i className="fa-solid fa-paper-plane" />
                            เสนอเลขาธิการฯ ลงนาม คบ.9
                        </Button>
                    </div>
                )}
            </div>}

            {/* Dispatch & delivery — เปิดให้นำส่งได้หลังเลขาธิการ ป.ป.ท. ลงนามหนังสือส่งออกครบแล้วเท่านั้น */}
            {(outgoingSigned || (allowPreparation && document?.original)) && (
                <div className="space-y-4 text-[0.88rem]">
                    <div className="font-semibold text-navy">ข้อมูลการนำส่ง</div>

                    {caseItem.dispatchedAt && (
                        <div className="grid grid-cols-1 gap-2">
                            <div className="rounded-lg border border-slate-200 p-2.5">
                                <span className="block text-[0.8rem] text-muted">ช่องทางนำส่ง</span>
                                <strong className="text-ink">{caseItem.dispatchChannel}</strong>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-2.5">
                                <span className="block text-[0.8rem] text-muted">เลขติดตาม / วันที่ส่ง</span>
                                <strong className="text-ink">{caseItem.dispatchTracking || '-'}</strong>
                                <div className="text-[0.8rem] text-muted">{caseItem.dispatchedAt}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 p-2.5">
                                <span className="block text-[0.8rem] text-muted">วันที่พยานได้รับหนังสือ</span>
                                <strong className={caseItem.deliveredAt ? 'text-emerald-700' : 'text-amber-700'}>
                                    {caseItem.deliveredAt ? formatThaiDateTime(caseItem.deliveredAt) : 'อยู่ระหว่างจัดส่ง'}
                                </strong>
                            </div>
                            {caseItem.deliveredAt && (
                                <>
                                    <div className="rounded-lg border border-slate-200 p-2.5">
                                        <span className="block text-[0.8rem] text-muted">ผู้รับหนังสือ</span>
                                        <strong className="text-ink">{caseItem.deliveryRecipient || '-'}</strong>
                                        {caseItem.deliveryRecipientRelation && (
                                            <div className="text-[0.8rem] text-muted">{caseItem.deliveryRecipientRelation}</div>
                                        )}
                                    </div>
                                    <div className="rounded-lg border border-slate-200 p-2.5 sm:col-span-2">
                                        <span className="block text-[0.8rem] text-muted">หลักฐานการรับทราบ</span>
                                        <strong className="text-ink">{caseItem.deliveryAckType || '-'}</strong>
                                        {caseItem.deliveryAckDocument && (
                                            <div className="text-[0.8rem] text-muted">
                                                <i className="fa-solid fa-paperclip mr-1" />
                                                {caseItem.deliveryAckDocument}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                    {/* TC-064 — ฟอร์มบันทึกการนำส่งยังต้องเปิดใช้ได้ต่อไปตราบใดที่พยานยังไม่ได้รับจริง
                        (deliveredAt ว่าง) เพื่อให้เปลี่ยนช่องทางเป็น "นำส่งโดยตรง" แล้วส่งใหม่ได้หลังตีกลับ */}
                    {caseItem.dispatchedAt && !caseItem.deliveredAt && isOfficer && document?.formNo !== 10 && <div className="space-y-4" data-testid="notice-delivery-result">
                        <label className="block"><span className="ws-label">ผลการนำส่ง</span>
                            <select aria-label="ผลการนำส่ง" className="ws-input w-full" value={deliveryComplete ? 'delivered' : 'pending'} onChange={(e) => setDeliveryComplete(e.target.value === 'delivered')}>
                                <option value="pending">อยู่ระหว่างจัดส่ง</option>
                                <option value="delivered">นำส่งสำเร็จ / พยานได้รับหนังสือแล้ว</option>
                            </select>
                        </label>
                        {deliveryComplete && <>
                            <label className="block"><span className="ws-label">วันที่ได้รับหนังสือ</span><input aria-label="วันที่ได้รับหนังสือ" type="date" className="ws-input w-full" value={deliveredDate} onChange={(e) => setDeliveredDate(e.target.value)} /></label>
                            <label className="block"><span className="ws-label">ชื่อผู้รับหนังสือ</span><input aria-label="ชื่อผู้รับหนังสือ" className="ws-input w-full" value={recipient} onChange={(e) => setRecipient(e.target.value)} /></label>
                            <p className="text-sm text-muted">การบันทึกนี้เป็นการยืนยันของเจ้าหน้าที่ว่าผู้รับได้รับหนังสือแล้ว</p>
                            <Button type="button" className="w-full" disabled={!recipient.trim() || !deliveredDate} onClick={() => {
                                recordDelivery(caseItem.no, new Date(`${deliveredDate}T12:00:00`).toISOString(), {
                                    recipient: recipient.trim(), recipientRelation: 'พยานผู้รับการคุ้มครอง',
                                    ackType: 'เจ้าหน้าที่ยืนยันผลการนำส่ง',
                                    ackDocument: 'บันทึกยืนยันการรับหนังสือผ่านระบบ',
                                })
                                if (!useCaseStore.getState().getCase(caseItem.no)?.deliveredAt) { showToast('บันทึกไม่สำเร็จ กรุณาตรวจสถานะและสิทธิ์', 'warning'); return }
                                showToast('บันทึกนำส่งสำเร็จแล้ว สามารถลงนาม คบ.11 ต่อได้')
                                onActionComplete?.()
                            }}>บันทึกผลนำส่งสำเร็จ</Button>
                        </>}
                    </div>}
                    {caseItem.deliveredAt && isApproved && <Link to="/form/$formId" params={{ formId: '11' }} search={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center font-semibold text-navy underline">ไปลงนาม คบ.11</Link>}
                    {!caseItem.deliveredAt && (!caseItem.dispatchedAt || caseItem.dispatchHistory?.at(-1)?.outcome === 'failed') && isOfficer && document?.formNo !== 10 && (
                        <div className="flex flex-col gap-4">
                            <div className="sm:col-span-full">
                                <label className="block font-semibold text-slate-700 mb-1">ช่องทางนำส่ง <span className="text-danger">*</span></label>
                                <select
                                    data-testid="notice-delivery-channel"
                                    aria-label="ช่องทางนำส่ง"
                                    value={channel}
                                    onChange={(e) => setChannel(e.target.value)}
                                    className="ws-input w-full"
                                >
                                    {CHANNELS.map((c) => (
                                        <option key={c} value={c}>
                                            {c === CHANNELS[1] ? 'เจ้าหน้าที่ส่งมอบด้วยตนเอง' : c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {isApproved && <p className="text-muted sm:col-span-full" data-testid="notice-delivery-instruction">
                                {isPostalChannel ? 'เมื่อพยานได้รับ คบ.9 ให้บันทึกใบตอบรับ แล้วนัดชี้แจงและให้พยานลงนาม คบ.11' : 'นำ คบ.9 และ คบ.11 ไปพร้อมกันได้ แจ้งผลและบันทึกการรับ คบ.9 ก่อนให้พยานลงนาม คบ.11 ในคราวเดียวกัน'}
                                <Link to="/form/$formId" params={{ formId: '11' }} search={{ caseNo: caseItem.no }} className="ml-2 font-semibold text-navy underline">เตรียม คบ.11</Link>
                            </p>}
                            {isPostalChannel && (
                                <div>
                                    <label htmlFor={`notice-tracking-${caseItem.no}`} className="block font-semibold text-slate-700 mb-1">เลขติดตามพัสดุ</label>
                                    <input
                                        id={`notice-tracking-${caseItem.no}`}
                                        placeholder="ระบุเลขติดตามพัสดุ"
                                        value={tracking}
                                        onChange={(e) => setTracking(e.target.value)}
                                        className="ws-input w-full"
                                    />
                                </div>
                            )}
                            <Button
                                type="button"
                                onClick={() => {
                                    setDispatchError('')
                                    onBeforeDispatch?.()
                                    const current = useCaseStore.getState().getCase(caseItem.no)
                                    const currentNotice = current && noticeForCase(current)
                                    if (currentNotice && !['ready', 'sent'].includes(currentNotice.status)) {
                                        const missing = missingNoticeFields(currentNotice)
                                        if (missing.length) {
                                            setDispatchError(`กรุณากรอก ${missing.map((key) => NOTICE_FIELD_LABELS[key] || key).join(' · ')} ก่อนนำส่ง`)
                                            const input = window.document.querySelector<HTMLInputElement>(`[data-testid="${CSS.escape(`notice-detail-${missing[0]}`)}"]`)
                                            input?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                                            input?.focus({ preventScroll: true })
                                            return
                                        }
                                        if (!useCaseStore.getState().checkResultNoticeReady(caseItem.no)) {
                                            setDispatchError('ยังตรวจพร้อมส่งไม่ได้ กรุณาตรวจรายละเอียดหนังสือและสิทธิ์ดำเนินการ')
                                            return
                                        }
                                    }
                                    const before = useCaseStore.getState().getCase(caseItem.no)?.dispatchHistory?.length || 0
                                    recordDispatch(caseItem.no, channel, isPostalChannel ? tracking : '')
                                    if ((useCaseStore.getState().getCase(caseItem.no)?.dispatchHistory?.length || 0) === before) {
                                        showToast('ยังบันทึกการนำส่งไม่ได้: ตรวจข้อมูล สิทธิ์ หรือรายการส่งเดิมที่ยังอยู่ระหว่างนำส่ง', 'warning')
                                        return
                                    }
                                    setAckType(defaultAckType(channel))
                                    showToast('บันทึกการนำส่งหนังสือแล้ว — ขั้นถัดไปคือบันทึกผู้รับและหลักฐานการรับทราบ')
                                    onActionComplete?.()
                                }}
                                variant="primary"
                                size="md"
                                className="w-full whitespace-nowrap"
                            >
                                <i className="fa-solid fa-truck-fast" />
                                บันทึกการนำส่ง
                            </Button>
                            {dispatchError && <p role="alert" data-testid="notice-dispatch-error" className="text-danger sm:col-span-full">{dispatchError}</p>}
                        </div>
                    )}


                </div>
            )}

            {/* WIT0805-0807 / WIT0813 — ทางเดินต่อของเส้นทางอนุมัติ
      {isApproved && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 space-y-3 text-[0.8rem]">
          <div className="font-bold text-navy">ขั้นถัดไปตามแนวทาง 08A</div>
          <ol className="space-y-1.5 text-[0.88rem] text-blue-900 leading-relaxed list-decimal list-inside">
            <li>
              จัดทำ <strong>คบ.9</strong> หนังสือแจ้งตอบรับการให้ความคุ้มครอง อ้างอิงผลอนุมัติฉบับลงนาม
            </li>
            <li>ส่ง/มอบ คบ.9 ให้พยาน แล้วบันทึกช่องทาง วันส่ง และวันที่พยานได้รับ</li>
            <li>
              จัดทำ <strong>คบ.11</strong> ตามวิธี ระยะเวลา และเงื่อนไขที่อนุมัติ ชี้แจงข้อตกลง แล้วให้ลงลายมือชื่อครบทุกฝ่าย
            </li>
            <li>บันทึกความยินยอมและเปิดเส้นทางปฏิบัติแยกรายวิธีตามข้อ 15</li>
          </ol>

          <div className="flex flex-wrap gap-2">
            <Link
              to="/form/$formId"
              params={{ formId: '9' }}
              search={{ caseNo: caseItem.no }}
              className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
            >
              <i className="fa-solid fa-file-lines" />
              เปิด คบ.9
            </Link>
            <Link
              to="/form/$formId"
              params={{ formId: '11' }}
              search={{ caseNo: caseItem.no }}
              className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
            >
              <i className="fa-solid fa-file-signature" />
              เปิด คบ.11
              {caseItem.kb11Signed && <span className="text-emerald-700">· ลงนามแล้ว</span>}
            </Link>
            <Link
              to="/protection-methods"
              className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg bg-navy px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition hover:bg-blue"
            >
              <i className="fa-solid fa-diagram-project" />
              ไปแยกวิธีคุ้มครองตามข้อ 15
            </Link>
          </div>

          {!caseItem.kb9Signed && (
            <p className="text-[0.8rem] font-semibold text-amber-800">
              <i className="fa-solid fa-triangle-exclamation mr-1" />
              คำร้องหลักต้องมี คบ.9 และ คบ.11 ลงนามครบก่อนเริ่มคุ้มครอง (กรณีเร่งด่วนใช้ความยินยอมใน คบ.5 แทนได้)
            </p>
          )}
        </div>
      )} */}

            {/* Appeal window (rejected path) */}
            {isRejected && caseItem.appealResolution && <p className="ws-callout">คำวินิจฉัยอุทธรณ์เป็นที่สุด — ไม่สามารถยื่นอุทธรณ์รอบที่ 2 ได้</p>}
            {isRejected && caseItem.deliveredAt && !caseItem.appealResolution && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-3 text-[0.8rem]">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-bold text-rose-900">
                            <i className="fa-solid fa-scale-balanced mr-1.5" />
                            สิทธิยื่นอุทธรณ์ภายใน {APPEAL_WINDOW_DAYS} วัน
                        </div>
                        <span
                            className={`rounded-full px-3 py-1 font-bold ${appealDaysLeft !== null && appealDaysLeft >= 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'
                                }`}
                        >
                            {appealDaysLeft === null
                                ? 'ยังไม่เริ่มนับ'
                                : appealDaysLeft >= 0
                                    ? `เหลือ ${appealDaysLeft} วัน (ครบกำหนด ${formatThaiDateTime(caseItem.appealDueAt)})`
                                    : `เกินกำหนดมาแล้ว ${Math.abs(appealDaysLeft)} วัน`}
                        </span>
                    </div>
                    <p className="text-rose-800 leading-relaxed">
                        นับตั้งแต่วันที่พยานได้รับหนังสือ คบ.10 ({formatThaiDateTime(caseItem.deliveredAt)}) ตามวันที่ไปรษณีย์ส่งถึงบ้านพยาน
                    </p>

                    {caseItem.appealFiledAt ? (
                        <div className="rounded-lg bg-white border border-rose-200 p-3">
                            <strong className="block text-rose-900">ยื่นอุทธรณ์แล้วเมื่อ {caseItem.appealFiledAt}</strong>
                            <div className="text-slate-700 mt-1">{caseItem.appealReason}</div>
                            <div className="text-[0.8rem] text-muted mt-1">เอกสาร: {caseItem.appealDocumentName}</div>
                            {caseItem.appealFolder?.intake && (
                                <div className="text-[0.8rem] text-muted mt-1">
                                    ช่องทาง:{' '}
                                    {caseItem.appealFolder.intake.channel === 'letter'
                                        ? `หนังสือ · เลขรับสารบรรณกลาง ${caseItem.appealFolder.intake.registryNo}`
                                        : 'ด้วยวาจา'}
                                </div>
                            )}
                        </div>
                    ) : nonApprovalClosed ? (
                        <div
                            className="rounded-lg border border-slate-300 bg-slate-100 p-3 font-bold text-slate-700"
                            data-testid="appeal-intake-closed-notice"
                        >
                            <i className="fa-solid fa-lock mr-1.5" />
                            ปิดเรื่องแล้ว — ไม่สามารถรับคำอุทธรณ์ได้
                        </div>
                    ) : (
                        appealOpen &&
                        (isOfficer || isReceiver) && (
                            <Link to="/appeal-folder/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white">ไปหน้ารับคำอุทธรณ์</Link>
                        )
                    )}
                </div>
            )}

        </section>
    )
}
