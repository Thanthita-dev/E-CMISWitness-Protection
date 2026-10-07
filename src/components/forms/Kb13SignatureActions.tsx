import React, { useState } from 'react'
import { Button } from '../common/Button'
import { SignatureModal } from '../common/SignatureModal'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast } from '../../lib/swal'
import { KB13_SIGN_SLOTS, Kb13SignSlot, pendingKb13Report } from '../../lib/formSignature'
import { thaiMonthName } from '../../lib/utils'

interface Kb13SignatureActionsProps {
    /** เลขคำร้องของแฟ้มที่เปิดแบบ คบ.13 นี้ */
    caseNo?: string
    /** เรียกหลังลงนามครบทั้งสองช่อง เพื่อปิดโมดัลกลับไปที่แฟ้ม */
    onSaved?: () => void
}

/**
 * ลายมือชื่อท้ายรายงานผลประจำงวด คบ.13 — WIT1006 เจ้าหน้าที่ผู้ปฏิบัติ แล้ว WIT1007 พยานลงนามรับรอง
 *
 * ต่างจาก คบ.6/8/9/10/11 ตรงที่ลงนาม "รายรอบรายงาน" ไม่ใช่รายแฟ้ม แผงนี้จึงผูกกับรอบที่ยังค้าง
 * ลงนามอยู่รอบเดียว (รอบเก่าสุดที่ยังไม่ครบ) ไม่ข้ามไปรอบใหม่จนกว่ารอบนั้นจะรับรองครบ
 */
export const Kb13SignatureActions: React.FC<Kb13SignatureActionsProps> = ({ caseNo, onSaved }) => {
    const { getCase, signMonthlyReport } = useCaseStore()
    const caseItem = caseNo ? getCase(caseNo) : undefined
    const [activeSlot, setActiveSlot] = useState<Kb13SignSlot | null>(null)

    if (!caseItem) {
        return (
            <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
                <i className="fa-solid fa-circle-info mr-1.5" />
                เปิดแบบ คบ.13 จากแฟ้มคำร้องเพื่อลงนามรายงานผลประจำงวด — หน้านี้ยังไม่ผูกกับแฟ้มใด
            </p>
        )
    }

    const report = pendingKb13Report(caseItem)

    if (!report) {
        return (
            <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
                <i className="fa-solid fa-circle-check mr-1.5 text-success" />
                {(caseItem.monthlyReports || []).length === 0
                    ? 'ยังไม่ได้จัดทำรายงานผล คบ.13 ของรอบใด — จัดทำรายงานที่แฟ้มหรือหน้ารายงานผลการคุ้มครองก่อน'
                    : 'รายงานผล คบ.13 ทุกรอบลงนามครบแล้ว'}
            </p>
        )
    }

    return (
        <div className="space-y-2.5">
            <div className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
                <i className="fa-solid fa-file-signature mr-1.5" />
                รอบรายงานที่รอลงนาม: <strong>งวด {thaiMonthName(report.period)}</strong> · จัดทำเมื่อ {report.submittedAt} โดย{' '}
                {report.submittedBy} — ต้องลงนามครบทั้งเจ้าหน้าที่ผู้ปฏิบัติและพยานผู้รับการคุ้มครอง
            </div>

            <div className="flex flex-col gap-3">
                {KB13_SIGN_SLOTS.map((slot) => {
                    const signedAt = slot.signedAt(report)
                    const signedBy = slot.signedBy(report)
                    /** WIT1007 — พยานรับรองหลังเจ้าหน้าที่ลงนามแล้วเท่านั้น ตามลำดับในผัง */
                    const waitingOfficer = slot.key === 'witness' && !report.officerSignedAt

                    return (
                        <div key={slot.key} className="rounded-lg border border-line bg-white p-4 space-y-3">
                            <div className="text-[0.95rem] font-semibold text-navy">
                                {slot.label}
                            </div>
                            <div className="rounded-lg bg-soft border border-line p-4 text-center">
                                {signedAt ? (
                                    <div>
                                        <div className="text-sm font-bold text-navy-mid italic font-serif underline decoration-blue-500">
                                            {signedBy}
                                        </div>
                                        <div className="text-[0.8rem] text-success font-bold mt-1">✓ ลงนามแล้ว ({signedAt})</div>
                                    </div>
                                ) : (
                                    <div className="text-[0.8rem] text-muted italic">ยังไม่ได้ลงลายมือชื่อ</div>
                                )}
                            </div>
                            <Button
                                type="button"
                                disabled={Boolean(signedAt) || waitingOfficer}
                                onClick={() => setActiveSlot(slot.key)}
                                title={
                                    signedAt
                                        ? 'ลงนามในรอบนี้แล้ว — ลงนามซ้ำไม่ได้'
                                        : waitingOfficer
                                            ? 'รอเจ้าหน้าที่ผู้ปฏิบัติลงนามก่อน'
                                            : undefined
                                }
                                className={`w-full flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition ${signedAt || waitingOfficer ? 'bg-muted cursor-not-allowed' : 'bg-navy hover:bg-blue'
                                    }`}
                            >
                                <i className="fa-solid fa-pen-nib" />
                                {signedAt ? 'ลงนามแล้ว' : 'ลงลายมือชื่อ'}
                            </Button>
                        </div>
                    )
                })}
            </div>

            {activeSlot && (() => {
                const slot = KB13_SIGN_SLOTS.find((s) => s.key === activeSlot)!
                const defaultName =
                    activeSlot === 'witness' ? caseItem.person || '' : caseItem.assignedOfficer || caseItem.owner || ''

                return (
                    <SignatureModal
                        isOpen
                        title={`ลงลายมือชื่อ${slot.label} · คบ.13 งวด ${thaiMonthName(report.period)}`}
                        signerRole={slot.role}
                        defaultSignerName={defaultName}
                        onClose={() => setActiveSlot(null)}
                        onConfirm={(name) => {
                            signMonthlyReport(caseItem.no, report.id, activeSlot, name)
                            setActiveSlot(null)
                            const done = activeSlot === 'officer' ? Boolean(report.witnessSignedAt) : Boolean(report.officerSignedAt)
                            showToast(
                                done
                                    ? `ลงนาม คบ.13 งวด ${thaiMonthName(report.period)} ครบทั้งสองช่องแล้ว`
                                    : 'บันทึกลายมือชื่อในรายงานผล คบ.13 แล้ว'
                            )
                            if (done) onSaved?.()
                        }}
                    />
                )
            })()}
        </div>
    )
}
