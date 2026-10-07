import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast, MySwal } from '../../lib/swal'

interface ReturnRevisionAssignmentCardProps {
    caseItem: CaseItem
    onAssigned?: () => void
}

const AssignModalBody: React.FC<{
    issue?: string
    reason?: string
    round: number
    officer: string
    initialInstruction: string
    onCancel: () => void
    onConfirm: (instruction: string) => void
}> = ({ issue, reason, round, officer, initialInstruction, onCancel, onConfirm }) => {
    const [instruction, setInstruction] = useState(initialInstruction)

    return (
        <div className="space-y-3 text-left">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[0.8rem] text-amber-900 space-y-1">
                {issue ? (
                    <div>
                        <strong>ประเด็นที่ต้องแก้:</strong> {issue}
                    </div>
                ) : null}
                {reason ? (
                    <div>
                        <strong>ข้อสั่งการ:</strong> {reason}
                    </div>
                ) : null}
                <div>
                    <strong>ผู้รับผิดชอบแก้ไข:</strong> {officer}
                </div>
                <div>
                    <strong>รอบแก้ไข:</strong> Revision ครั้งที่ {round} — ฉบับที่ลงนามแล้วถูกเก็บไว้ ไม่ถูกแก้ทับ
                </div>
            </div>

            <div>
                <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ข้อสั่งการถึงเจ้าหน้าที่ผู้รับผิดชอบ *</label>
                <textarea
                    rows={4}
                    value={instruction}
                    data-testid="revision-instruction-input"
                    onChange={(e) => setInstruction(e.target.value)}
                    className="ws-input w-full text-ink"
                />
            </div>

            <p className="text-[0.88rem] leading-relaxed text-muted">
                เมื่อแก้ครบแล้ว ฉบับแก้ต้องเสนอผ่าน <strong>ผู้บังคับบัญชาชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการฯ → เลขาธิการฯ</strong>
                {' '}ตามลำดับเดิมทุกขั้น <strong>ห้ามส่งข้ามลำดับชั้น</strong>
            </p>

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
                    data-testid="assign-revision-confirm-button"
                    onClick={() => onConfirm(instruction)}
                    variant="primary"
                    size="md"
                >
                    <i className="fa-solid fa-user-check" />
                    ยืนยันมอบหมายแก้ไข
                </Button>
            </div>
        </div>
    )
}

/**
 * WIT0708 — ผอ.สำนัก/กอง รับข้อสั่งการ "ส่งกลับ / ขอข้อมูลเพิ่ม" ของเลขาธิการ ป.ป.ท. (WIT0707)
 * แล้วมอบหมายให้เจ้าหน้าที่ผู้รับผิดชอบแก้ คบ.3 และ/หรือ คบ.6 เป็น Revision ใหม่
 *
 * ก่อนมีการ์ดนี้ เคสที่ถูกส่งกลับจะจอดอยู่ในคิวของ ผอ. โดยไม่มีทางเดินต่อ
 */
export const ReturnRevisionAssignmentCard: React.FC<ReturnRevisionAssignmentCardProps> = ({ caseItem, onAssigned }) => {
    const assignReturnRevision = useCaseStore((s) => s.assignReturnRevision)

    const officer = caseItem.assignedOfficer || 'เจ้าหน้าที่ผู้รับผิดชอบ'
    const round = (caseItem.revisionRound || 0) + 1
    const defaultInstruction =
        caseItem.returnNote || 'แก้ไขเอกสารตามข้อสั่งการของเลขาธิการ ป.ป.ท. และแนบเอกสารประกอบเพิ่มเติมให้ครบถ้วน'

    const openAssignModal = () => {
        MySwal.fire({
            title: 'มอบหมายแก้ไขเป็น Revision ใหม่',
            html: (
                <AssignModalBody
                    issue={caseItem.returnIssueLabel}
                    reason={caseItem.returnNote}
                    round={round}
                    officer={officer}
                    initialInstruction={defaultInstruction}
                    onCancel={() => MySwal.close()}
                    onConfirm={(instruction) => {
                        if (!instruction.trim()) {
                            showToast('กรุณาระบุข้อสั่งการถึงเจ้าหน้าที่ผู้รับผิดชอบ')
                            return
                        }
                        assignReturnRevision(caseItem.no, instruction.trim())
                        MySwal.close()
                        showToast(`มอบหมายให้ ${officer} แก้เป็น Revision ครั้งที่ ${round} แล้ว`)
                        onAssigned?.()
                    }}
                />
            ),
            showConfirmButton: false,
            showCloseButton: true,
            width: 560,
            customClass: { popup: 'font-sans rounded-xl' },
        })
    }

    return (
        <section
            data-testid="return-revision-assignment-card"
            className="ws-card border-l-4 border-l-gold p-5 space-y-4"
        >
            <div className="flex items-center gap-2.5 border-b border-line pb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-white font-bold">
                    <i className="fa-solid fa-rotate-left text-sm" />
                </div>
                <div>
                    <h2 className="text-[1.1rem] font-bold leading-snug text-navy">
                        เลขาธิการ ป.ป.ท. ส่งกลับ / ขอข้อมูลเพิ่ม — มอบหมายแก้ไข
                    </h2>
                    <p className="text-[0.8rem] text-muted">
                        งานยังค้างอยู่ที่ ผอ.สำนัก/กอง จนกว่าจะมอบหมายให้เจ้าหน้าที่ผู้รับผิดชอบแก้เป็นฉบับใหม่
                    </p>
                </div>
            </div>

            <div className="grid gap-2 text-[0.8rem] text-amber-900 sm:grid-cols-2">
                <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
                    <div className="text-[0.8rem] font-semibold text-amber-700">ประเด็นที่ต้องแก้ไข</div>
                    <div className="mt-0.5 font-semibold">{caseItem.returnIssueLabel || '-'}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-white/70 p-3">
                    <div className="text-[0.8rem] font-semibold text-amber-700">ผู้รับผิดชอบแก้ไข</div>
                    <div className="mt-0.5 font-semibold">{officer}</div>
                </div>
            </div>

            {caseItem.returnNote ? (
                <p className="rounded-xl border border-amber-200 bg-white/70 p-3 text-[0.88rem] leading-relaxed text-amber-900">
                    <strong className="block text-[0.8rem] text-amber-700">ข้อสั่งการของเลขาธิการ ป.ป.ท.</strong>
                    {caseItem.returnNote}
                </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-amber-200 pt-3">
                <Button
                    type="button"
                    data-testid="assign-revision-button"
                    onClick={openAssignModal}
                    variant="primary"
                    size="md"
                >
                    <i className="fa-solid fa-user-check" />
                    มอบหมายแก้ไขเป็น Revision ใหม่ →
                </Button>
            </div>
        </section>
    )
}
