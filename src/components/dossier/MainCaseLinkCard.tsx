import { Button } from "../common/Button"
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { CaseItem } from '../../types/case'
import { MAIN_CASE_NOT_FOUND_REASONS, MAIN_CASE_OPTIONS } from '../../lib/constants'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { ECMIS_USER_DIRECTORY } from '../../lib/constants'
import { canLinkMainCase, isCaseClosed } from '../../lib/permissions'
import { useAuthStore } from '../../store/useAuthStore'
import { VoiceTextarea } from '../common/VoiceTextarea'
import { kb1Completed } from '../../lib/intakeSequence'
import { UrgencyScreeningPanel } from './UrgencyScreeningPanel'
import { createPortal } from 'react-dom'

interface MainCaseLinkCardProps {
    caseItem: CaseItem
    /** จุดวางการ์ดกลั่นกรองความเร่งด่วน (คอลัมน์ขวาของหน้าแฟ้ม) — ไม่ระบุ = แสดงในการ์ดนี้ */
    urgencySlot?: HTMLElement | null
}

export const MainCaseLinkCard: React.FC<MainCaseLinkCardProps> = ({ caseItem, urgencySlot }) => {
    const { linkMainCase, unlinkMainCase, markMainCaseNotFound } = useCaseStore()
    const { currentRole, currentOfficerUserId } = useAuthStore()
    /** ผู้เชื่อมโยงได้คือเจ้าของสำนวนที่ได้รับมอบหมาย หรือเจ้าหน้าที่ที่รับคำร้องเอง — คนอื่นดูอย่างเดียว */
    const canLink = canLinkMainCase(currentRole, caseItem, currentOfficerUserId)
    const actorName = ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId)?.name
    const [selectedCaseId, setSelectedCaseId] = useState(MAIN_CASE_OPTIONS[0].id)
    const [relationNote, setRelationNote] = useState('ภัยคุกคามเกิดจากการให้ถ้อยคำเป็นพยานในสำนวนคดีหลักนี้')
    const [searchQuery, setSearchQuery] = useState('')
    /** WIT0215 — ต้องเลือกเหตุผลที่เชื่อมโยงไม่ได้ก่อน จึงจะบันทึกสถานะ "ไม่พบคดี" ได้ */
    const [notFoundReason, setNotFoundReason] = useState('')

    const isLinked = Boolean(caseItem.linkedMainCaseId)
    const isNotFound = Boolean(caseItem.mainCaseNotFound)
    /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ดูคดีหลักที่เชื่อมโยงไว้ได้ แต่แก้ไข/ยกเลิก/เชื่อมโยงใหม่ไม่ได้ */
    const closed = isCaseClosed(caseItem)
    /** เรื่องจากระบบเดิม — ไม่แสดงค่าตั้งต้นที่ระบบเติมให้ (คะแนน/เหตุผลความเกี่ยวพัน) ถ้าระบบเดิมไม่มีข้อมูล */
    const hideScoreDefault = Boolean(caseItem.legacySource) && !caseItem.mainCaseScore
    const hideRelationDefault = Boolean(caseItem.legacySource) && !caseItem.mainCaseRelation
    /**
     * เจ้าหน้าที่ที่รับ คำร้อง / คบ.1 / คบ.2 เอง (officer_intake) เชื่อมโยงคดีหลักก่อนส่ง ผอ. มอบหมาย
     * เรื่องที่ธุรการรับยังไม่เชื่อมโยงที่ขั้นรับเรื่อง — เจ้าของสำนวนเชื่อมโยงหลังจัดทำ คบ.1 (lib/intakeSequence)
     */
    const isOfficerIntake = caseItem.stage === 'officer_intake'
    const atIntake = ['receiver_intake', 'director_assign'].includes(caseItem.stage)
    const isOwnerStage = caseItem.stage === 'staff_review'
    const waitingKb1 = isOwnerStage && !kb1Completed(caseItem)
    const showScreening = isOwnerStage && canLink && !closed && (isLinked || isNotFound)
    /** งานเอกสารที่เหลือของเจ้าของสำนวน — คบ.1 หลุดจากรายการเมื่อบันทึกแล้ว */
    const pendingForms = (caseItem.pendingIntakeForms || []).filter((f) => !(f === 'คบ.1' && caseItem.kb1CompletedAt))

    const filteredOptions = MAIN_CASE_OPTIONS.filter(
        (opt) =>
            opt.no.toLowerCase().includes(searchQuery.toLowerCase()) ||
            opt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            opt.accused.toLowerCase().includes(searchQuery.toLowerCase())
    )

    const handleConfirmLink = () => {
        linkMainCase(caseItem.no, selectedCaseId, relationNote, actorName)
        showToast('เชื่อมโยงคดีหลักและประเมินภัยเรียบร้อยแล้ว')
    }

    const handleNotFound = () => {
        if (!notFoundReason) {
            showToast('กรุณาเลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ก่อน', 'error')
            return
        }
        showConfirmAlert({
            icon: 'warning',
            title: 'ยืนยันระบุสถานะ "ไม่พบคดี"?',
            text: `เหตุผล: ${notFoundReason} — ระบบจะบันทึกเหตุผลไว้ในแฟ้มและรับเรื่องต่อ เสนอ ผอ.สำนัก/กอง มอบหมายตามปกติ ระเบียบห้ามปัดตกคำร้องด้วยเหตุนี้`,
            showCancelButton: true,
            confirmButtonText: 'ยืนยันไม่พบคดี',
            cancelButtonText: 'ค้นหาต่อ',
        }).then((res) => {
            if (res.isConfirmed) {
                markMainCaseNotFound(caseItem.no, notFoundReason, actorName)
                showToast('บันทึกเหตุผลและสถานะ "ไม่พบคดี" แล้ว — คำร้องยังเดินต่อตามปกติ')
            }
        })
    }

    const handleUnlink = () => {
        showConfirmAlert({
            icon: 'warning',
            title: 'ยืนยันยกเลิกการเชื่อมโยงคดีหลัก?',
            text: 'การยกเลิกจะทำให้ข้อมูลคดีหลักและผลประเมินความสอดคล้องถูกนำออกจากแฟ้ม',
            confirmButtonText: 'ยืนยันยกเลิก',
            cancelButtonText: 'ปิด',
        }).then((res) => {
            if (res.isConfirmed) {
                unlinkMainCase(caseItem.no)
                showToast('ยกเลิกการเชื่อมโยงแล้ว')
            }
        })
    }

    return (
        <section className="ws-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
                        <i className="fa-solid fa-link text-sm" />
                    </div>
                    <h2 className="text-[1.1rem] font-bold leading-snug text-navy">คดีหลักและการประเมินภัย</h2>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2">
                    {isLinked && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[0.8rem] font-semibold text-success border border-emerald-200">
                            <i className="fa-solid fa-circle-check text-[0.74rem]" />
                            เชื่อมโยงแล้ว
                        </span>
                    )}
                </div>
            </div>

            {isNotFound && !isLinked && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-bold text-rose-900">
                        <i className="fa-solid fa-circle-xmark" />
                        ไม่พบคดีหลักในระบบ (กิจกรรมที่ 4 / 5)
                    </div>
                    <p className="text-[0.88rem] text-rose-800 leading-relaxed">
                        บันทึกเหตุผลไว้แล้วและรับเรื่องต่อตามระเบียบ — ติดตามเชื่อมโยงเลขสำนวนหลักภายหลังได้จากการ์ดนี้
                    </p>
                    {caseItem.mainCaseNotFoundReason && (
                        <div
                            data-testid="main-case-not-found-reason"
                            className="rounded-lg bg-white p-2.5 border border-rose-200/70 text-[0.8rem] space-y-0.5"
                        >
                            <div className="text-muted font-semibold">เหตุผลที่เชื่อมโยงไม่ได้:</div>
                            <div className="text-ink">{caseItem.mainCaseNotFoundReason}</div>
                        </div>
                    )}
                </div>
            )}

            {isLinked ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                    <div className="flex items-start justify-between">
                        <div>
                            <div className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                                <span>{caseItem.mainCaseNo}</span>
                                {!hideScoreDefault && (
                                    <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[0.8rem] font-semibold text-emerald-900">
                                        ตรงกัน {caseItem.mainCaseScore || '100%'}
                                    </span>
                                )}
                            </div>
                            <p className="text-[0.8rem] text-emerald-800 mt-1 font-medium">{caseItem.mainCaseTitle}</p>
                        </div>
                        {!closed && canLink && (
                            <Button
                                type="button"
                                onClick={handleUnlink}
                                variant="secondary"
                                size="md"
                                className="border-rose-300 text-rose-700 hover:bg-rose-50"
                            >
                                แก้ไข / ยกเลิกเชื่อมโยง
                            </Button>
                        )}
                    </div>

                    {!hideRelationDefault && (
                        <div className="rounded-lg bg-white p-3 border border-emerald-200/60 text-[0.8rem] space-y-1">
                            <div className="text-muted font-semibold">เหตุผลความเกี่ยวพัน:</div>
                            <div className="text-ink">{caseItem.mainCaseRelation || 'พยานเป็นผู้ให้ถ้อยคำในสำนวนคดีหลัก'}</div>
                        </div>
                    )}
                </div>
            ) : closed ? (
                <p data-testid="main-case-link-locked" className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.8rem] text-slate-600">
                    <i className="fa-solid fa-lock mr-1.5" />
                    แฟ้มปิดงานคุ้มครองแล้ว — เชื่อมโยง/แก้ไขคดีหลักไม่ได้
                </p>
            ) : atIntake ? (
                <p data-testid="main-case-link-deferred" className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.8rem] text-slate-600">
                    <i className="fa-solid fa-circle-info mr-1.5" />
                    ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ ผอ.สำนัก/กอง มอบหมาย เชื่อมโยงคดีและกลั่นกรองความเร่งด่วนหลังจัดทำ คบ.1
                </p>
            ) : !canLink ? (
                <p data-testid="main-case-link-readonly" className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.8rem] text-slate-600">
                    <i className="fa-solid fa-circle-info mr-1.5" />
                    {isNotFound
                        ? 'เจ้าของสำนวนที่ได้รับมอบหมายติดตามเชื่อมโยงเลขสำนวนหลักภายหลัง'
                        : 'ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายเป็นผู้เชื่อมโยง'}
                </p>
            ) : waitingKb1 ? (
                <div data-testid="main-case-link-waiting-kb1" className="ws-callout flex flex-wrap items-center justify-between gap-3 text-[0.88rem] leading-relaxed">
                    <span>
                        <i className="fa-solid fa-lock mr-1.5" />
                        จัดทำแบบ คบ.1 ก่อน — สอบถามข้อมูลพยานให้ครบ แล้วจึงเชื่อมโยงคดีหลักและกลั่นกรองความเร่งด่วน
                    </span>
                    <Link
                        to="/form/$formId"
                        params={{ formId: '1' }}
                        search={{ caseNo: caseItem.no }}
                        className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg bg-navy px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition hover:bg-blue"
                    >
                        <i className="fa-solid fa-pen-to-square" />
                        จัดทำ คบ.1
                    </Link>
                </div>
            ) : (
                <div className="space-y-3">
                    <div>
                        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
                            ค้นหาเลขสำนวน กบค. / ชื่อผู้ถูกกล่าวหา / ชื่อคดี
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="เช่น กบค. 001/2569 หรือชื่อโครงการ..."
                                className="ws-input w-full text-ink"
                            />
                        </div>
                    </div>

                    {/* Options list */}
                    <div className="space-y-2">
                        {filteredOptions.map((opt) => (
                            <label
                                key={opt.id}
                                className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${selectedCaseId === opt.id
                                        ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                                        : 'border-slate-200 bg-white hover:border-slate-300'
                                    }`}
                            >
                                <input
                                    type="radio"
                                    name="mainCaseSelect"
                                    checked={selectedCaseId === opt.id}
                                    onChange={() => setSelectedCaseId(opt.id)}
                                    className="mt-1 text-blue focus:ring-blue"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                        <strong className="text-[0.8rem] font-semibold text-navy">{opt.no}</strong>
                                        <span className="rounded bg-emerald-100 px-2 py-0.5 text-[0.8rem] font-semibold text-emerald-800">
                                            ตรงกัน {opt.matchScore}%
                                        </span>
                                    </div>
                                    <div className="text-[0.8rem] text-slate-700 font-medium mt-0.5">{opt.title}</div>
                                    <div className="text-[0.8rem] text-muted mt-0.5">
                                        ผู้ถูกกล่าวหา: {opt.accused} | เจ้าของสำนวน: {opt.leadOfficer} ({opt.agency})
                                    </div>
                                </div>
                            </label>
                        ))}
                    </div>

                    <div>
                        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เหตุผลความเกี่ยวพัน <span className="text-danger">*</span></label>
                        <VoiceTextarea
                            rows={2}
                            value={relationNote}
                            onChange={(e) => setRelationNote(e.target.value)}
                            className="ws-input w-full text-ink"
                            placeholder="ระบุเหตุผลความเกี่ยวพันระหว่างพยานกับสำนวนคดีหลัก..."
                        />
                    </div>

                    <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-1.5">
                        <label className="block text-[0.8rem] font-semibold text-rose-900" htmlFor="main-case-not-found-reason-select">
                            เหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ * <span className="font-normal">(บังคับเลือกก่อนกด "ค้นไม่พบ")</span>
                        </label>
                        <select
                            id="main-case-not-found-reason-select"
                            data-testid="main-case-not-found-reason-select"
                            value={notFoundReason}
                            onChange={(e) => setNotFoundReason(e.target.value)}
                            className="ws-input w-full text-ink"
                        >
                            <option value="">— เลือกเหตุผล —</option>
                            {MAIN_CASE_NOT_FOUND_REASONS.map((reason) => (
                                <option key={reason} value={reason}>
                                    {reason}
                                </option>
                            ))}
                        </select>
                        <p className="text-[0.8rem] text-rose-800">
                            บันทึกเหตุผลแล้วคำร้องยังเดินต่อตามปกติ ระเบียบห้ามปัดตกคำร้องเพราะยังไม่มีเลขสำนวนหลัก
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                        <Button
                            type="button"
                            onClick={handleNotFound}
                            data-testid="main-case-not-found-button"
                            variant="secondary"
                            size="md"
                            className="border-rose-300 text-rose-700 hover:bg-rose-50"
                        >
                            <i className="fa-solid fa-magnifying-glass-minus" />
                            ค้นไม่พบ — ระบุสถานะ "ไม่พบคดี"
                        </Button>
                        <Button
                            type="button"
                            onClick={handleConfirmLink}
                            variant="primary"
                            size="md"
                        >
                            <i className="fa-solid fa-check" />
                            ยืนยันเชื่อมโยงคดี
                        </Button>
                    </div>
                </div>
            )}

            {/* ขั้นถัดจากเชื่อมโยงคดีหลัก — กลั่นกรองความเร่งด่วนก่อนจัดทำ คบ.3 · หน้าแฟ้มวางไว้คอลัมน์ขวา (urgencySlot) */}
            {showScreening && (urgencySlot ? createPortal(<UrgencyScreeningPanel caseItem={caseItem} />, urgencySlot) : <UrgencyScreeningPanel caseItem={caseItem} variant="inline" />)}
        </section>
    )
}
