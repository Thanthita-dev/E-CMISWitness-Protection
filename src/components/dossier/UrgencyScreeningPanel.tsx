import { Button } from '../common/Button'
import React, { useState } from 'react'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { showToast, showConfirmAlert, confirmBody } from '../../lib/swal'
import { urgencyScreened } from '../../lib/intakeSequence'
import { VoiceTextarea } from '../common/VoiceTextarea'

interface UrgencyScreeningPanelProps {
    caseItem: CaseItem
    onActionComplete?: () => void
    /** card = การ์ดเดี่ยว (คอลัมน์ขวาของหน้าแฟ้ม) · inline = กล่องภายในการ์ดอื่น (การ์ดส่งต่อของ ผบช.ชั้นต้น) */
    variant?: 'card' | 'inline'
    readOnly?: boolean
}

/**
 * กลั่นกรองความเร่งด่วน (ปกติ / เร่งด่วน)
 *  - staff_review      : เจ้าของสำนวนกลั่นกรองครั้งแรก หลังจัดทำ คบ.1 และเชื่อมโยงคดีหลัก (แสดงในการ์ดคดีหลัก)
 *  - supervisor_review : ผบช.ชั้นต้นทบทวน/แก้ผลเดิม (WIT0410) — เลือกเร่งด่วนจะตัดเข้าเส้นทาง คบ.4 → คบ.5 ทันที
 * ผลกลั่นกรองกำหนดว่าเรื่องจะไป คบ.6 (ปกติ) หรือ คบ.4 → คบ.5 (เร่งด่วน)
 */
export const UrgencyScreeningPanel: React.FC<UrgencyScreeningPanelProps> = ({ caseItem, onActionComplete, variant = 'card', readOnly = false }) => {
    const { forwardCase, assessUrgency } = useCaseStore()
    /** ร่างแบบ คบ.4 — ใช้เตือนก่อนซ่อนเมื่อเปลี่ยนผลประเมิน */
    const kb4Draft = useFormDraftStore((s) => selectCaseDraft(s, 4, caseItem.no))
    const [urgencyNote, setUrgencyNote] = useState('')
    const [isEditingUrgency, setIsEditingUrgency] = useState(false)

    const isFastTrack = Boolean(caseItem.urgent || caseItem.urgency === 'urgent')
    const urgencyAssessed = urgencyScreened(caseItem)
    /** ขั้นกลั่นกรองเป็นการ "แก้ไข" ผลเดิมเสมอ — กลั่นกรองครั้งแรกทำที่ขั้นเจ้าของสำนวน */
    const isUrgencyRevisionStage = caseItem.stage === 'supervisor_review'

    /** ช่องที่มีค่าจริงในร่าง คบ.4 — ใช้ทั้งเตือนก่อนซ่อนและแนบสำเนาลง Audit Log (TC-008) */
    const kb4FilledEntries = Object.entries(kb4Draft).filter(
        ([, value]) => String(value ?? '').trim() !== ''
    ) as Array<[string, string]>

    const handleAssessUrgency = (urgency: 'normal' | 'urgent') => {
        if (readOnly) return
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
                        ? 'บันทึกผลกลั่นกรอง: กรณีจำเป็นเร่งด่วน — จัดทำ คบ.3 แล้วเข้าเส้นทาง คบ.4 → คบ.5'
                        : 'บันทึกผลกลั่นกรอง: กรณีปกติ — จัดทำ คบ.3 แล้วดำเนินการตามเส้นทาง คบ.6'
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

    return (
        <section
            data-testid="urgency-screening-panel"
            aria-label="กลั่นกรองความเร่งด่วน"
            className={variant === 'card'
                ? 'ws-card space-y-3 p-5 text-[0.88rem]'
                : `rounded-xl border p-4 space-y-3 ${urgencyAssessed ? 'border-slate-200 bg-slate-50/60' : 'border-amber-300 bg-amber-50/70'}`}
        >
            {/* หัวการ์ดแบบเดียวกับ "สรุปข้อมูลแฟ้ม" */}
            <h2 className="border-b border-line pb-2 text-[1.1rem] font-bold text-navy">
                {readOnly ? 'ผลประเมินความเร่งด่วน' : isUrgencyRevisionStage ? 'ทบทวนผลประเมินความเร่งด่วน' : 'กลั่นกรองความเร่งด่วน'}
            </h2>
            {!readOnly && <p className="text-[0.8rem] text-muted">{isUrgencyRevisionStage ? 'ผู้บังคับบัญชาชั้นต้นเป็นผู้ตัดสิน' : 'ผู้รับมอบหมายเป็นผู้ตัดสิน'}</p>}

            {readOnly || (urgencyAssessed && !isEditingUrgency) ? (
                <>
                    <p className="text-[0.88rem] text-slate-600 leading-relaxed">
                        ผลการประเมิน:{' '}
                        <strong className={isFastTrack ? 'text-rose-700' : 'text-emerald-700'}>
                            {!urgencyAssessed ? 'ยังไม่ได้ประเมิน' : isFastTrack ? 'กรณีจำเป็นเร่งด่วน' : 'กรณีปกติ'}
                        </strong>
                    </p>
                    {!readOnly && <Button
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
                    </Button>}
                    {readOnly && caseItem.urgencyAssessmentNote && <p className="whitespace-pre-wrap text-muted">{caseItem.urgencyAssessmentNote}</p>}
                </>
            ) : (
                <>
                    <VoiceTextarea
                        rows={2}
                        value={urgencyNote}
                        onChange={(e) => setUrgencyNote(e.target.value)}
                        placeholder="เหตุผลประกอบการประเมิน (ไม่บังคับ)..."
                        className="ws-input w-full text-ink"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            onClick={() => handleAssessUrgency('normal')}
                            variant="secondary"
                            size="sm"
                        >
                            <i className="fa-solid fa-circle-check" />
                            กรณีปกติ
                        </Button>
                        <Button
                            type="button"
                            onClick={() => handleAssessUrgency('urgent')}
                            variant="danger"
                            size="sm"
                        >
                            <i className="fa-solid fa-bolt" />
                            กรณีจำเป็นเร่งด่วน
                        </Button>
                        {isEditingUrgency && (
                            <Button
                                type="button"
                                onClick={() => {
                                    setIsEditingUrgency(false)
                                    setUrgencyNote('')
                                }}
                                variant="ghost"
                                size="sm"
                            >
                                ยกเลิก
                            </Button>
                        )}
                    </div>
                </>
            )}
        </section>
    )
}
