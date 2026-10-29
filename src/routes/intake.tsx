import { Button } from "../components/common/Button"
import React, { useMemo, useState, useEffect } from 'react'
import { createFileRoute, useNavigate, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { Badge } from '../components/common/Badge'
import { useAuthStore } from '../store/useAuthStore'
import { useCaseStore } from '../store/useCaseStore'
import { generateNextCaseNo, nowDisplay } from '../lib/utils'
import { showToast } from '../lib/swal'
import { isIntakeClerk } from '../lib/permissions'
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

export function IntakePage() {
    const { currentRole, currentOfficerUserId, currentOrgUnitId, getCurrentUserAccount } = useAuthStore()
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
     * ธุรการสำนัก/กอง และธุรการคดี กอท. รับคำร้องเหมือนกัน
     * ขั้นรับเรื่องไม่มีการกลั่นกรองความเร่งด่วน — เจ้าหน้าที่ที่รับเรื่องเองเชื่อมโยงคดีหลักในแฟ้มก่อนส่ง ผอ.
     * ธุรการส่ง ผอ. ได้ทันที แล้วเจ้าของสำนวนเชื่อมโยงคดีหลังจัดทำ คบ.1 · การกลั่นกรองทำหลัง คบ.1 เสมอ
     */
    const isReceiver = isIntakeClerk(currentRole)

    /** ผู้รับเรื่องตั้งต้นตามบทบาทปัจจุบัน — ใช้เติมค่าเริ่มต้นให้ช่อง "ผู้รับเรื่อง"/"หน่วยงานที่รับ" */
    const defaultActor = useMemo(() => {
        const actor = getCurrentUserAccount()
        if (actor) return actor
        // ผู้ดูแลระบบใช้ผู้ปฏิบัติตั้งต้นสำหรับข้อมูลสาธิต บัญชีทั่วไปห้ามรับเรื่องแทนบุคคลอื่นโดยอัตโนมัติ
        return currentRole === 'admin' ? ECMIS_USER_DIRECTORY.find((u) => u.id === 'OFF-001') : undefined
    }, [isReceiver, currentRole, currentOfficerUserId, currentOrgUnitId, getCurrentUserAccount])

    const [receivedByName, setReceivedByName] = useState(defaultActor?.name || '')
    const [receivingUnit, setReceivingUnit] = useState(defaultActor?.unit || '')
    const [archiveNo, setArchiveNo] = useState('')

    /** บทบาทเปลี่ยน → เติมผู้รับเรื่อง/หน่วยงานที่รับใหม่ */
    useEffect(() => {
        setReceivedByName(defaultActor?.name || '')
        setReceivingUnit(defaultActor?.unit || '')
    }, [defaultActor])

    /** ประเภทเอกสาร (คำร้อง / คบ.1 / คบ.2) เลือกจากการ์ดที่กด — คบ.1/คบ.2 ไม่ต้องกรอกชื่อผู้ส่งซ้ำ เพราะอยู่ในแบบฟอร์มของตนเองแล้ว */
    const canIntake = (type: IntakeDocTypeValue) => allowedDocTypes.some((t) => t.value === type)

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
        if (needsPetitionerName && !petitionerName.trim()) {
            showToast('กรุณาระบุชื่อผู้ส่ง/ผู้แจ้ง', "error")
            return
        }
        if (docType === 'petition' && !archiveNo.trim()) {
            showToast('กรุณาระบุเลขสารบัญ', "error")
            return
        }
        if (!selectedDocType) {
            showToast('บทบาทนี้ยังไม่มีสิทธิ์รับเรื่องเข้าระบบ', "error")
            return
        }

        const nextNo = generateNextCaseNo(cases.length + 500)
        const actor = defaultActor
        if (!actor) {
            showToast('ไม่พบบัญชีผู้รับเรื่อง กรุณาเข้าสู่ระบบด้วยบัญชีของตนเองอีกครั้ง', 'error')
            return
        }

        /**
         * ขั้นตอนที่ 1 — ประเภทเอกสารเป็นตัวกำหนดงานที่เหลือ ส่วนเส้นทางเหมือนกันทุกกรณี:
         *   ผู้รับเรื่อง → เอกสารตั้งต้น → ผอ. มอบหมาย → คบ.1 (ถ้ายังไม่ได้ทำ) → เชื่อมโยงคดีหลัก (ถ้ายังไม่ได้ทำ) → กลั่นกรอง → คบ.3 → คบ.6 หรือ คบ.4/คบ.5
         *  - ธุรการ            : รับได้เฉพาะ "คำร้อง" แล้วส่ง ผอ. ได้เลย
         *  - เจ้าหน้าที่/เจ้าของสำนวน : รับ คำร้อง / คบ.1 / คบ.2 แล้วเชื่อมโยงคดีหลัก (หรือบันทึก "ไม่พบคดี") ในแฟ้มก่อนส่ง ผอ.
         * ความเร่งด่วนยังไม่ตัดสินที่ขั้นนี้ — เจ้าของสำนวนที่ ผอ. มอบหมายกลั่นกรองหลังจัดทำ คบ.1 (lib/intakeSequence)
         */
        const followUp = [...selectedDocType.followUp]
        /** รอพยานเข้ามาลงนาม คบ.1 เกิดเฉพาะกรณีรับแจ้งทางโทรศัพท์ (คบ.2) เท่านั้น — คำร้องทั่วไปแค่ยังไม่ได้กรอก คบ.1 ไม่ใช่รอลงนามยินยอม */
        const needsKb1 = docType === 'kb2'

        const newCase: CaseItem = {
            no: nextNo,
            form: selectedDocType.form,
            person: petitionerName,
            status: isReceiver ? 'ธุรการรับเรื่องเข้าทะเบียนแล้ว' : 'เจ้าหน้าที่รับเรื่องเข้าทะเบียนแล้ว',
            stage: isReceiver ? 'receiver_intake' : 'officer_intake',
            owner: actor.name,
            next: isReceiver
                ? 'ตรวจเอกสารแล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน (เจ้าของสำนวนเชื่อมโยงคดีหลักและกลั่นกรองความเร่งด่วนหลังจัดทำ คบ.1)'
                : 'เชื่อมโยงคดีหลัก (หรือบันทึก "ไม่พบคดี") แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน',
            risk: 'ยังไม่ประเมิน',
            urgent: false,
            intakeDocType: selectedDocType.value,
            intakeChannel: selectedDocType.channel,
            intakeByRole: currentRole,
            pendingIntakeForms: followUp,
            kb1SignaturePending: needsKb1,
            receivedBy: receivedByName.trim() || actor.name,
            receivedByUserId: actor.id,
            orgUnitId: actor.orgUnitId,
            intakeUnit: receivingUnit.trim() || actor.unit,
            archiveNo: docType === 'petition' ? archiveNo.trim() : undefined,
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
            navigate({ to: '/dossier/$caseNo', params: { caseNo: nextNo } })
        }
    }

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="ทะเบียนและรับคำร้อง · งานคุ้มครองพยาน"
                title="รับคำร้องขอคุ้มครองพยานใหม่"
                description={isReceiver ? 'ธุรการรับ "คำร้อง" เข้าทะเบียน แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน' : undefined}
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

            {/* รับเอกสารต้นทางเข้าทะเบียน — "คำร้อง" ที่ยังไม่ต้องระบุว่าเป็น คบ.1 หรือ คบ.2 */}
            {canIntake('petition') && (
                <section className="ws-card p-4 sm:p-6 space-y-4" data-testid="intake-source-card">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-soft text-navy">
                        <i className="fa-solid fa-inbox" />
                    </div>
                    <div>
                        <h2 className="text-[1.1rem] font-bold leading-snug text-navy">รับเอกสารต้นทางเข้าทะเบียน</h2>
                    </div>

                    <div className="ws-field">
                        <label htmlFor="intakeSourceType">แหล่งที่มาของเรื่อง <span className="text-danger">*</span></label>
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
                            <label htmlFor="intakeChannel">ช่องทางที่รับ <span className="text-danger">*</span></label>
                            <input id="intakeChannel" type="text" value={channelReceived} onChange={(e) => setChannelReceived(e.target.value)} className="ws-input w-full" />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakePetitioner">ผู้ส่ง/ผู้แจ้ง <span className="text-danger">*</span></label>
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
                            <label htmlFor="intakeReceivedBy">ผู้รับเรื่อง <span className="text-danger">*</span></label>
                            <input id="intakeReceivedBy" type="text" value={receivedByName} onChange={(e) => setReceivedByName(e.target.value)} className="ws-input w-full" />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakeUnit">หน่วยงานที่รับ <span className="text-danger">*</span></label>
                            <input id="intakeUnit" type="text" value={receivingUnit} onChange={(e) => setReceivingUnit(e.target.value)} className="ws-input w-full" />
                        </div>
                        <div className="ws-field">
                            <label htmlFor="intakeArchiveNo">เลขสารบัญ <span className="text-danger">*</span></label>
                            <input
                                id="intakeArchiveNo"
                                type="text"
                                value={archiveNo}
                                onChange={(e) => setArchiveNo(e.target.value)}
                                placeholder="ระบุเลขสารบัญของเอกสารต้นทาง"
                                className="ws-input w-full"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="ws-actions">
                            <label className={`inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition cursor-pointer hover:bg-slate-50`}>
                                <i className="fa-solid fa-images" />
                                เลือกจากคลังภาพ/ไฟล์
                                <input type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(e) => handleFileUpload('petition', e)} className="hidden" aria-label="เลือกไฟล์เอกสารต้นทาง" />
                            </label>
                            <label className={`inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition cursor-pointer hover:bg-slate-50`}>
                                <i className="fa-solid fa-camera" />
                                ถ่ายภาพ
                                <input type="file" accept="image/*" capture="environment" onChange={(e) => handleFileUpload('petition', e)} className="hidden" aria-label="ถ่ายภาพเอกสารต้นทาง" />
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
                        </div>
                        <p className="text-[0.8rem] text-muted">{ATTACHMENT_RULE_TEXT} · ไม่บังคับแนบ</p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                        {isReceiver && (
                            <p className="text-[0.8rem] text-muted">เอกสารจะเข้าทะเบียนแล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน</p>
                        )}
                        <Button type="button" onClick={() => handleGenericIntakeSubmit('petition')} variant="primary" size="md" className="ml-auto disabled:opacity-50">
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
                            desc: 'ใช้บันทึกคำร้องหลักเมื่อผู้ยื่นหรือพยานให้ข้อมูลและลงลายมือชื่อ แล้วเชื่อมโยงคดีหลักก่อนส่ง ผอ. มอบหมาย จากนั้นเจ้าของสำนวนกลั่นกรองความเร่งด่วนและจัดทำ คบ.3',
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
                                    <label className={`inline-flex min-h-[38px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy transition cursor-pointer hover:bg-slate-50`}>
                                        <i className="fa-solid fa-upload" />
                                        {c.uploadLabel}
                                        <input type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={(e) => handleFileUpload(c.type, e)} className="hidden" aria-label={c.uploadLabel} />
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
