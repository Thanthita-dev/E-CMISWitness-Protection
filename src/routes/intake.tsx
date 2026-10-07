import { Button } from "../components/common/Button"
import React, { useMemo, useState, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Badge } from '../components/common/Badge'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { generateNextCaseNo, nowDisplay } from '../lib/utils'
import { showToast } from '../lib/swal'
import { ATTACHMENT_ACCEPT, ATTACHMENT_RULE_TEXT, filterValidAttachments } from '../lib/fileValidation'
import { CaseItem } from '../types/case'
import {
    INTAKE_DOC_TYPES,
    INTAKE_DOC_TYPES_BY_ROLE,
    INTAKE_CHANNELS,
    INTAKE_SOURCE_TYPES,
    IntakeDocTypeValue,
    ECMIS_USER_DIRECTORY,
    ROLE_NAMES,
} from '../lib/constants'

export const Route = createFileRoute('/intake')({
    component: IntakePage,
})

function IntakePage() {
    const { currentRole } = useAuthStore()
    const { cases, addCase } = useCaseStore()
    const navigate = useNavigate()

    /** ประเภทเอกสารที่บทบาทนี้รับเข้าระบบได้ (ธุรการ → คำร้อง เท่านั้น) */
    const allowedDocTypes = useMemo(() => {
        const allowed = INTAKE_DOC_TYPES_BY_ROLE[currentRole] || ['petition']
        return INTAKE_DOC_TYPES.filter((t) => allowed.includes(t.value))
    }, [currentRole])

    /** ผู้ส่ง/ผู้แจ้งเอกสารต้นทาง — ใช้เป็นชื่อคดีในทะเบียนสำหรับขั้นรับ "คำร้อง" (อาจไม่ใช่ชื่อพยานเสมอไป จนกว่าจะทำแบบ คบ.1) */
    const [petitionerName, setPetitionerName] = useState('')
    const [sourceType, setSourceType] = useState<string>(INTAKE_SOURCE_TYPES[2].value)
    const [channelReceived, setChannelReceived] = useState<string>(INTAKE_SOURCE_TYPES[2].defaultChannel)
    /** ไฟล์แนบแยกตามการ์ด — เอกสารต้นทาง (คำร้อง) / คบ.1 / คบ.2 */
    const [uploadedFiles, setUploadedFiles] = useState<Record<IntakeDocTypeValue, Array<{ name: string; size: number }>>>({
        petition: [],
        kb1: [],
        kb2: [],
    })
    /**
     * WIT0207-0208 — เจ้าหน้าที่ ป.ป.ท. ผู้รับเรื่องกลั่นกรองความเร่งด่วนก่อนจัดทำแบบ คบ.
     * ธุรการไม่ต้องกลั่นกรอง (E09) จึงเว้นว่างและปล่อยให้ผู้ที่ ผอ. มอบหมายเป็นผู้ประเมินในขั้นที่ 3
     */
    const [screenedUrgency, setScreenedUrgency] = useState<'' | 'normal' | 'urgent'>('')
    const [screeningNote, setScreeningNote] = useState('')

    const isReceiver = currentRole === 'receiver'
    /** ธุรการรับได้เฉพาะ "คำร้อง" และไม่มีหน้าที่กลั่นกรอง */
    const canScreenUrgency = !isReceiver

    /** ผู้รับเรื่องตั้งต้นตามบทบาทปัจจุบัน — ใช้เติมค่าเริ่มต้นให้ช่อง "ผู้รับเรื่อง"/"หน่วยงานที่รับ" */
    const defaultActor = useMemo(() => {
        const officer = ECMIS_USER_DIRECTORY.find((u) => u.id === 'OFF-001')!
        const receiver = ECMIS_USER_DIRECTORY.find((u) => u.id === 'REC-001')!
        return isReceiver ? receiver : officer
    }, [isReceiver])

    const [receivedByName, setReceivedByName] = useState(defaultActor.name)
    const [receivingUnit, setReceivingUnit] = useState(defaultActor.unit)

    /** บทบาทเปลี่ยน → เติมผู้รับเรื่อง/หน่วยงานที่รับใหม่ และล้างผลคัดกรองของบทบาทที่ไม่มีหน้าที่คัดกรอง */
    useEffect(() => {
        if (!canScreenUrgency) {
            setScreenedUrgency('')
        }
        setReceivedByName(defaultActor.name)
        setReceivingUnit(defaultActor.unit)
    }, [canScreenUrgency, defaultActor])

    /** ประเภทเอกสาร (คำร้อง / คบ.1 / คบ.2) เลือกจากการ์ดที่กด — คบ.1/คบ.2 ไม่ต้องกรอกชื่อผู้ส่งซ้ำ เพราะอยู่ในแบบฟอร์มของตนเองแล้ว */
    const canIntake = (type: IntakeDocTypeValue) => allowedDocTypes.some((t) => t.value === type)
    /** เจ้าหน้าที่ต้องคัดกรองความเร่งด่วนก่อนจึงรับเอกสารได้ (ธุรการไม่มีหน้าที่คัดกรอง) */
    const intakeLocked = canScreenUrgency && !screenedUrgency

    const handleFileUpload = (target: IntakeDocTypeValue, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files
        if (!files || files.length === 0) return
        /** คัดไฟล์ที่นามสกุลไม่รองรับ/เกิน 20MB ออกก่อน แล้วแจ้งเหตุผลรายไฟล์ */
        const { accepted, rejections } = filterValidAttachments(Array.from(files))
        e.target.value = ''
        rejections.forEach((message) => showToast(message, 'error'))
        if (accepted.length === 0) return
        const fileList = accepted.map((f) => ({ name: f.name, size: f.size }))
        setUploadedFiles((prev) => ({ ...prev, [target]: [...prev[target], ...fileList] }))
        showToast(`อัปโหลดเอกสาร ${accepted.length} รายการเรียบร้อยแล้ว`)
    }

    const handleGenericIntakeSubmit = (submitType: IntakeDocTypeValue) => {
        const selectedDocType = allowedDocTypes.find((t) => t.value === submitType)
        const docType = submitType
        const needsPetitionerName = docType !== 'kb1' && docType !== 'kb2'
        if (canScreenUrgency && !screenedUrgency) {
            showToast('กรุณาเลือกผลคัดกรองความเร่งด่วนเบื้องต้นก่อน (กรณีปกติ / กรณีจำเป็นเร่งด่วน)', "error")
            return
        }
        if (screenedUrgency && !screeningNote.trim()) {
            showToast('กรุณาระบุเหตุผลประกอบผลการกลั่นกรองความเร่งด่วน', "error")
            return
        }
        if (needsPetitionerName && !petitionerName.trim()) {
            showToast('กรุณาระบุชื่อผู้ส่ง/ผู้แจ้ง', "error")
            return
        }
        if (!selectedDocType) {
            showToast('บทบาทนี้ยังไม่มีสิทธิ์รับเรื่องเข้าระบบ', "error")
            return
        }

        const nextNo = generateNextCaseNo(cases.length + 500)
        const actor = defaultActor

        /**
         * ขั้นตอนที่ 1 — ประเภทเอกสารเป็นตัวกำหนดงานที่เหลือ ส่วนเส้นทางเหมือนกันทุกกรณี:
         *   ผู้รับเรื่อง → เอกสารตั้งต้น → ผอ. มอบหมาย → งานที่เหลือ (คบ.1) → คบ.3 → คบ.6 หรือ คบ.4/คบ.5
         *  - ธุรการ            : รับได้เฉพาะ "คำร้อง" แล้วส่ง ผอ. ได้เลย (ไม่เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้ทำ)
         *  - เจ้าหน้าที่/เจ้าของสำนวน : รับ คำร้อง / คบ.1 / คบ.2 แล้วส่ง ผอ. มอบหมายได้ทันที
         * ความเร่งด่วนยังไม่ตัดสินที่ขั้นนี้ — ผู้ที่ ผอ. มอบหมายเป็นผู้ประเมินในขั้นที่ 3
         */
        const followUp = [...selectedDocType.followUp]
        /** รอพยานเข้ามาลงนาม คบ.1 เกิดเฉพาะกรณีรับแจ้งทางโทรศัพท์ (คบ.2) เท่านั้น — คำร้องทั่วไปแค่ยังไม่ได้กรอก คบ.1 ไม่ใช่รอลงนามยินยอม */
        const needsKb1 = docType === 'kb2'

        const newCase: CaseItem = {
            no: nextNo,
            form: selectedDocType.form,
            person: petitionerName,
            status: isReceiver
                ? 'ธุรการรับเรื่องเข้าทะเบียนแล้ว'
                : 'เจ้าหน้าที่รับเรื่องและกำลังเชื่อมโยงคดีหลัก',
            stage: isReceiver ? 'receiver_intake' : 'officer_intake',
            owner: actor.name,
            next: isReceiver
                ? 'ตรวจเอกสารแล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน (เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยงคดีหลัก)'
                : 'เชื่อมโยงเลขคดีหลักจากกิจกรรมที่ 4/5 แล้วกดส่งให้ ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
            risk: screenedUrgency === 'urgent' ? 'วิกฤต' : 'ยังไม่ประเมิน',
            /**
             * ผลกลั่นกรองขั้นรับเรื่อง (WIT0208) — บันทึกไว้เพื่อให้ ผอ. เห็นก่อนมอบหมาย
             * ถ้าเว้นว่าง (ธุรการ) ผู้ที่ถูกมอบหมายจะเป็นผู้ประเมินในขั้นที่ 3 ตามเดิม
             */
            urgency: screenedUrgency || undefined,
            urgent: screenedUrgency === 'urgent',
            urgencyAssessedAt: screenedUrgency ? nowDisplay() : undefined,
            urgencyAssessedBy: screenedUrgency ? actor.name : undefined,
            urgencyAssessmentNote: screenedUrgency ? screeningNote.trim() || undefined : undefined,
            intakeDocType: selectedDocType.value,
            intakeChannel: selectedDocType.channel,
            intakeByRole: currentRole,
            pendingIntakeForms: followUp,
            kb1SignaturePending: needsKb1,
            receivedBy: receivedByName.trim() || actor.name,
            receivedByUserId: actor.id,
            intakeUnit: receivingUnit.trim() || actor.unit,
            source: needsPetitionerName ? channelReceived.trim() || undefined : undefined,
            scanStatus: isReceiver ? 'pending' : undefined,
            createdAt: new Date().toISOString(),
            assignmentHistory: [
                {
                    at: nowDisplay(),
                    action: `รับ${selectedDocType.form}เข้าสู่ระบบ`,
                    actor: `${actor.name} (${ROLE_NAMES[currentRole]})`,
                    detail: `ประเภทเอกสาร: ${selectedDocType.form} · ช่องทาง: ${INTAKE_CHANNELS.find((c) => c.value === selectedDocType.channel)?.label
                        }${needsPetitionerName ? ` · แหล่งที่มา: ${INTAKE_SOURCE_TYPES.find((s) => s.value === sourceType)?.label} (${channelReceived})` : ''} · งานที่เหลือหลังมอบหมาย: ${followUp.join(', ')}`,
                },
                ...(screenedUrgency
                    ? [
                        {
                            at: nowDisplay(),
                            action: `กลั่นกรองขั้นรับเรื่อง: ${screenedUrgency === 'urgent' ? 'กรณีจำเป็นเร่งด่วน' : 'กรณีปกติ'}`,
                            actor: `${actor.name} (${ROLE_NAMES[currentRole]})`,
                            detail: screeningNote.trim() || (screenedUrgency === 'urgent' ? 'ระบุเป็นกรณีจำเป็นเร่งด่วน (Fast Track)' : 'ระบุเป็นกรณีปกติ'),
                        },
                    ]
                    : []),
            ],
            documents: uploadedFiles[docType].map((f, idx) => ({
                id: `DOC-${Date.now()}-${idx}`,
                category: 'source',
                name: f.name,
                uploadedBy: `${actor.name} (${ROLE_NAMES[currentRole]})`,
                uploadedAt: nowDisplay(),
            })),
        }

        addCase(newCase)
        showToast(`รับเรื่องเข้าทะเบียนสำเร็จ เลขคำร้อง: ${nextNo}`)
        /** เลือก คบ.1 / คบ.2 = เปิดแบบฟอร์มให้กรอกต่อทันที (บันทึกแล้วกลับแฟ้มเอง) · เอกสารต้นทางไปที่แฟ้ม */
        if (docType === 'kb1' || docType === 'kb2') {
            navigate({ to: '/form/$formId', params: { formId: docType === 'kb1' ? '1' : '2' }, search: { caseNo: nextNo } })
        } else {
            navigate({ to: `/dossier/${nextNo}` })
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="ทะเบียนและรับคำร้อง · งานคุ้มครองพยาน"
                title="รับคำร้องขอคุ้มครองพยานใหม่"
                description={
                    isReceiver
                        ? 'ธุรการรับ "คำร้อง" เข้าทะเบียน แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน'
                        : `${ROLE_NAMES[currentRole]} รับ คำร้อง / คบ.1 / คบ.2 เข้าทะเบียน แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน`
                }
                actions={
                    <Link
                        to="/registry"
                        className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
                    >
                        <i className="fa-solid fa-arrow-left" />
                        กลับทะเบียนคำร้อง
                    </Link>
                }
            />

            {/* WIT0207-0208 — คัดกรองความเร่งด่วนเบื้องต้น (เจ้าหน้าที่ ป.ป.ท.) ก่อนรับเอกสารเข้าทะเบียน */}
            {canScreenUrgency && (
                <section className="ws-card border-l-4 border-l-navy p-4 sm:p-5" data-testid="intake-triage">
                    <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-soft text-navy">
                            <i className="fa-solid fa-triangle-exclamation" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                            <div>
                                <h2 className="text-[1rem] font-bold leading-snug text-navy">
                                    คัดกรองความเร่งด่วนเบื้องต้น <span className="text-danger">*</span>
                                </h2>
                                <p className="text-[0.8rem] text-muted leading-relaxed">
                                    ผู้รับเรื่องต้องประเมินจากข้อเท็จจริงที่ได้รับก่อนเปิดแบบหรือรับเอกสารเข้าทะเบียน
                                    ผลนี้เป็นการคัดกรองเบื้องต้น และเจ้าของเรื่องต้องทบทวนในแฟ้มอีกครั้ง
                                </p>
                            </div>
                            <div className="ws-grid-2" role="radiogroup" aria-label="ผลคัดกรองความเร่งด่วนเบื้องต้น">
                                {([
                                    {
                                        value: 'normal' as const,
                                        label: 'กรณีปกติ',
                                        hint: 'ไม่มีเหตุให้ต้องเริ่มคุ้มครองชั่วคราวในทันที',
                                        activeClass: 'border-success bg-success-soft/50 ring-2 ring-success/20',
                                        idleClass: 'border-line bg-white hover:border-slate-300',
                                        dot: 'border-success bg-success',
                                    },
                                    {
                                        value: 'urgent' as const,
                                        label: 'กรณีจำเป็นเร่งด่วน',
                                        hint: 'มีเหตุด้านความปลอดภัยที่ต้องแจ้งและพิจารณาคุ้มครองชั่วคราวโดยเร็ว',
                                        activeClass: 'border-danger bg-danger-soft/60 ring-2 ring-danger/20',
                                        idleClass: 'border-rose-200 bg-danger-soft/30 hover:border-rose-300',
                                        dot: 'border-danger bg-danger',
                                    },
                                ] as const).map((o) => {
                                    const isSelected = screenedUrgency === o.value
                                    return (
                                        <button
                                            key={o.value}
                                            type="button"
                                            role="radio"
                                            aria-checked={isSelected}
                                            onClick={() => setScreenedUrgency(o.value)}
                                            className={`flex items-start gap-3 rounded-lg border p-3.5 text-left transition ${isSelected ? o.activeClass : o.idleClass}`}
                                        >
                                            <span
                                                aria-hidden="true"
                                                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-2 ${isSelected ? o.dot : 'border-slate-400 bg-white'}`}
                                            >
                                                {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                                            </span>
                                            <span className="min-w-0">
                                                <span className="block text-[0.88rem] font-bold text-navy">{o.label}</span>
                                                <span className="block text-[0.8rem] text-muted leading-snug">{o.hint}</span>
                                            </span>
                                        </button>
                                    )
                                })}
                            </div>
                            <div className="ws-field">
                                <label htmlFor="intakeScreeningNote">เหตุผลการคัดกรองเบื้องต้น *</label>
                                <textarea
                                    id="intakeScreeningNote"
                                    rows={3}
                                    value={screeningNote}
                                    onChange={(e) => setScreeningNote(e.target.value)}
                                    placeholder="ระบุพฤติการณ์หรือเหตุผลที่ใช้ประเมิน เช่น มีภัยคุกคามเฉพาะหน้า หรือยังไม่พบเหตุเร่งด่วน"
                                    className="ws-input w-full"
                                />
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* รับเอกสารต้นทางเข้าทะเบียน — "คำร้อง" ที่ยังไม่ต้องระบุว่าเป็น คบ.1 หรือ คบ.2 */}
            {canIntake('petition') && (
                <section className="ws-card p-4 sm:p-6 space-y-4" data-testid="intake-source-card">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-soft text-navy">
                        <i className="fa-solid fa-inbox" />
                    </div>
                    <div>
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">รับเอกสารต้นทางเข้าทะเบียน</h2>
                        <p className="text-[0.8rem] text-muted leading-relaxed">
                            รับหนังสือ เอกสารที่พยานเขียนเอง เอกสารจากภาคสนาม หรือเรื่องที่หน่วยงานอื่นส่งต่อเข้าทะเบียนก่อนได้
                            โดยยังไม่ต้องระบุว่าเป็น คบ.1 หรือ คบ.2 จนกว่าเจ้าหน้าที่จะตรวจรับ
                        </p>
                    </div>

                    <div className="ws-field">
                        <label htmlFor="intakeSourceType">แหล่งที่มาของเรื่อง *</label>
                        <select
                            id="intakeSourceType"
                            value={sourceType}
                            onChange={(e) => {
                                const next = e.target.value
                                setSourceType(next)
                                setChannelReceived(INTAKE_SOURCE_TYPES.find((s) => s.value === next)?.defaultChannel || '')
                            }}
                            className="ws-input w-full"
                        >
                            {INTAKE_SOURCE_TYPES.map((s) => (
                                <option key={s.value} value={s.value}>{s.label}</option>
                            ))}
                        </select>
                    </div>
                    <div className="ws-grid-2">
                        <div className="ws-field">
                            <label htmlFor="intakeChannel">ช่องทางที่รับ *</label>
                            <input id="intakeChannel" type="text" value={channelReceived} onChange={(e) => setChannelReceived(e.target.value)} className="ws-input w-full" />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakePetitioner">ผู้ส่ง/ผู้แจ้ง *</label>
                            <input
                                id="intakePetitioner"
                                type="text"
                                value={petitionerName}
                                onChange={(e) => setPetitionerName(e.target.value)}
                                placeholder="ชื่อบุคคลหรือหน่วยงาน"
                                className="ws-input w-full"
                            />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakeReceivedBy">ผู้รับเรื่อง *</label>
                            <input id="intakeReceivedBy" type="text" value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} className="ws-input w-full" />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakeUnit">หน่วยงานที่รับ *</label>
                            <input id="intakeUnit" type="text" value={receivingUnit} onChange={(e) => setReceivingUnit(e.target.value)} className="ws-input w-full" />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="ws-actions">
                            <label className={`inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition ${intakeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <i className="fa-solid fa-images" />
                                เลือกจากคลังภาพ/ไฟล์
                                <input type="file" multiple accept={ATTACHMENT_ACCEPT} disabled={intakeLocked} onChange={(e) => handleFileUpload('petition', e)} className="hidden" aria-label="เลือกไฟล์เอกสารต้นทาง" />
                            </label>
                            <label className={`inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition ${intakeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                <i className="fa-solid fa-camera" />
                                ถ่ายภาพ
                                <input type="file" accept="image/*" capture="environment" disabled={intakeLocked} onChange={(e) => handleFileUpload('petition', e)} className="hidden" aria-label="ถ่ายภาพเอกสารต้นทาง" />
                            </label>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-soft px-3 py-2 text-[0.8rem]">
                            <span className="flex flex-wrap gap-1.5 text-muted">
                                {uploadedFiles.petition.length === 0
                                    ? 'ยังไม่ได้เลือกไฟล์'
                                    : uploadedFiles.petition.map((f, i) => (
                                        <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-0.5 text-ink">
                                            <i className="fa-solid fa-file-lines text-blue" />
                                            {f.name}
                                        </span>
                                    ))}
                            </span>
                            {intakeLocked && (
                                <span className="font-semibold text-warning">กรุณาเลือกผลคัดกรองความเร่งด่วนเบื้องต้นก่อน (กรณีปกติ / กรณีจำเป็นเร่งด่วน)</span>
                            )}
                        </div>
                        <p className="text-[0.8rem] text-muted">{ATTACHMENT_RULE_TEXT} · ไม่บังคับแนบ</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        <p className="text-[0.8rem] text-muted">
                            {canScreenUrgency
                                ? 'เอกสารจะเข้าทะเบียนพร้อมผลคัดกรองความเร่งด่วนเบื้องต้น โดยเจ้าของเรื่องต้องทบทวนผลอีกครั้งในแฟ้ม'
                                : 'เอกสารจะเข้าทะเบียนแล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน'}
                        </p>
                        <Button type="button" onClick={() => handleGenericIntakeSubmit('petition')} disabled={intakeLocked} variant="primary" size="md" className="disabled:opacity-50">
                            <i className="fa-solid fa-folder-plus" />
                            รับเอกสารเข้าทะเบียน
                        </Button>
                    </div>
                </section>
            )}

            {/* คบ.1 / คบ.2 — เจ้าหน้าที่ ป.ป.ท. / เจ้าของสำนวนเท่านั้น */}
            {(canIntake('kb1') || canIntake('kb2')) && (
                <div className="ws-grid-2 items-stretch">
                    {([
                        {
                            type: 'kb1' as const,
                            tag: 'คบ.1',
                            title: 'จัดทำคำร้อง คบ.1',
                            desc: 'ใช้บันทึกคำร้องหลักเมื่อผู้ยื่นหรือพยานให้ข้อมูลและลงลายมือชื่อ จากนั้นจัดทำ คบ.3 เชื่อมคดีหลัก และประเมินความเร่งด่วนแยกต่างหาก',
                            uploadLabel: 'อัปโหลดไฟล์ คบ.1',
                            uploadHint: 'แนบแบบ คบ.1 ที่จัดทำนอกระบบหรือเอกสารประกอบได้ เมื่อเปิดคำร้องระบบจะเก็บไฟล์ในแฟ้ม แต่เจ้าหน้าที่ต้องกรอกข้อมูลตามฟิลด์ในระบบให้ครบถ้วน',
                            action: 'เจ้าหน้าที่กรอก คบ.1',
                            icon: 'fa-pen-to-square',
                        },
                        {
                            type: 'kb2' as const,
                            tag: 'คบ.2',
                            title: 'บันทึกรับเรื่อง คบ.2',
                            desc: 'ใช้เมื่อรับแจ้งผ่านโทรศัพท์ โทรสาร อีเมล หรือช่องทางสื่อสารในกรณีที่ผู้แจ้งยังไม่สามารถมายื่นด้วยตนเอง แล้วจึงจัดทำข้อมูลและเอกสารในกระบวนการหลักให้ครบ',
                            uploadLabel: 'อัปโหลดไฟล์ คบ.2',
                            uploadHint: 'แนบแบบ คบ.2 ที่จัดทำนอกระบบหรือเอกสารประกอบได้ เมื่อเปิดคำร้องระบบจะเก็บไฟล์ในแฟ้ม แต่เจ้าหน้าที่ต้องกรอกข้อมูลตามฟิลด์ในระบบให้ครบถ้วน',
                            action: 'เจ้าหน้าที่บันทึก คบ.2',
                            icon: 'fa-headset',
                        },
                    ]).filter((c) => canIntake(c.type)).map((c) => (
                        <section key={c.type} className="ws-card flex flex-col gap-3 p-4 sm:p-6" data-testid={`intake-${c.type}-card`}>
                            <span className="self-start rounded-lg bg-soft px-3 py-1.5 text-[0.8rem] font-semibold text-navy">{c.tag}</span>
                            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">{c.title}</h2>
                            <p className="text-[0.88rem] text-muted leading-relaxed">{c.desc}</p>
                            <div className="mt-auto rounded-lg border border-dashed border-[#9aabba] p-3 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <label className={`inline-flex min-h-[38px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy transition ${intakeLocked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-slate-50'}`}>
                                        <i className="fa-solid fa-upload" />
                                        {c.uploadLabel}
                                        <input type="file" multiple accept={ATTACHMENT_ACCEPT} disabled={intakeLocked} onChange={(e) => handleFileUpload(c.type, e)} className="hidden" aria-label={c.uploadLabel} />
                                    </label>
                                    <Badge variant={uploadedFiles[c.type].length ? 'success' : 'gold'}>
                                        {uploadedFiles[c.type].length ? `${uploadedFiles[c.type].length} ไฟล์` : 'ยังไม่ได้เลือกไฟล์'}
                                    </Badge>
                                </div>
                                {uploadedFiles[c.type].length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {uploadedFiles[c.type].map((f, i) => (
                                            <span key={i} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-2 py-0.5 text-[0.8rem] text-ink">
                                                <i className="fa-solid fa-file-pdf text-rose-600" />
                                                {f.name}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <p className="text-[0.8rem] text-muted leading-snug">{c.uploadHint}</p>
                            </div>
                            <Button
                                type="button"
                                onClick={() => handleGenericIntakeSubmit(c.type)}
                                disabled={intakeLocked}
                                variant="primary"
                                size="md"
                                className="self-start disabled:opacity-50"
                            >
                                <i className={`fa-solid ${c.icon}`} />
                                {c.action}
                            </Button>
                        </section>
                    ))}
                </div>
            )}
        </div>
    )
}
