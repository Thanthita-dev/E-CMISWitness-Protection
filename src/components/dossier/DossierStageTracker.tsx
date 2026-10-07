import { noticeForCase, NOTICE_STATUS_LABELS } from '../../lib/noticeDocuments'
import React from 'react'
import { CaseItem } from '../../types/case'
import { CurrentStepCard } from '../common/CurrentStepCard'
import { NumberedStepper, StepperStep } from '../common/NumberedStepper'
import { handoffReady } from '../../lib/protectionHandoff'

interface DossierStageTrackerProps {
    caseItem: CaseItem
}

/**
 * 14 หมุดตาม User_Flow v5 แท็บ 02 — ครอบคลุมขั้นตอนที่ 1 ถึง 7
 * ท้ายเส้นทาง (ขั้น 6-7) แยกตามหน้าในผังจริง: 10 ติดตาม/รายงาน คบ.13 → 11A ทบทวนผล
 * → 11B/11C ขยายเวลา หรือจัดทำเรื่องยุติ → 11D คำสั่งยุติ แจ้งผล และปิดงาน
 */
export const STAGES = [
    { key: 'intake', label: 'รับเรื่อง', step: '1' },
    { key: 'main_case', label: 'เชื่อมคดีหลัก', step: '1' },
    { key: 'assign', label: 'มอบหมายสำนวน', step: '2' },
    { key: 'documents', label: 'จัดทำเอกสาร', step: '3' },
    { key: 'supervisor_review', label: 'กลั่นกรอง', step: '4' },
    { key: 'director_review', label: 'ผอ.ลงนาม คบ.6', step: '4' },
    { key: 'deputy_review', label: 'รองเลขาธิการฯ', step: '4' },
    { key: 'external_pending', label: 'เลขาธิการฯ', step: '5' },
    { key: 'notice', label: 'แจ้งผล/นำส่ง', step: '5' },
    /** 08A/08B — หลังพยานลงนาม คบ.11 แล้วแยกเส้นทางปฏิบัติรายวิธีตามข้อ 15 (WIT0813) — รวมหมุด "คุ้มครองตามคำสั่ง (SLA)" เข้าไว้ในหมุดนี้แล้ว */
    { key: 'method_operation', label: 'ปฏิบัติตามวิธีคุ้มครอง', step: '6' },
    /** 10 — รอบรายงาน คบ.13 (WIT1001-WIT1013) */
    { key: 'monitoring', label: 'ติดตาม/รายงาน คบ.13', step: '6' },
    /** 11A — ทบทวนผลและจำแนกแนวทาง (WIT1101-WIT1111) */
    { key: 'review', label: 'ทบทวนผล', step: '7' },
    /** 11B/11C — ขยายเวลา คบ.14 หรือจัดทำเรื่องยุติ คบ.7/คบ.15 */
    { key: 'extension_termination', label: 'ขยายเวลา/เรื่องยุติ', step: '7' },
    /** 11D — คำสั่งยุติ แจ้งผล อุทธรณ์ และปิดงาน (คบ.16/คบ.17) */
    { key: 'closure', label: 'คำสั่งยุติ/ปิดงาน', step: '7' },
]

const CLOSING_STAGES = ['terminated', 'transferred', 'withdrawn']

/** ตำแหน่งหมุด "แจ้งผล/นำส่ง" ใช้ตัดสินว่าจะกางรายละเอียดขั้นย่อยของหมุดนี้หรือไม่ */

export function getStageIndex(c: CaseItem): number {
    /** ปิดงานแล้ว — หมุดสุดท้าย (11D WIT1148) */
    if (CLOSING_STAGES.includes(c.stage)) return 13
    /** ผู้มีอำนาจพิจารณาเรื่องยุติแล้ว หรือมีคำสั่ง คบ.16 — อยู่หน้า 11D (WIT1136) */
    if (c.stage === 'termination_order' || c.kb16 || c.terminationApproval?.approved) return 13
    /** จัดทำ คบ.15 หรือส่งข้อ 14 — หมุดขยายเวลา/เรื่องยุติ (11B/11C) */
    if (c.stage === 'termination_review' || c.stage === 'article14' || c.terminationTrigger) return 12
    if (c.stage === 'protection') {
        if (c.terminationRequest || c.kb15) return 12
        if (c.extensionRequests?.length) return 12
        /** WIT1013 — ส่ง คบ.13 ล่าสุดไปทบทวนที่ 11A แล้ว */
        if (c.reviewHandoff || c.reviewProposals?.length) return 11
        /** เข้ารอบรายงาน คบ.13 แล้ว (WIT1003/WIT1004) */
        if (c.nextReportDueAt || c.monthlyReports?.length) return 10
        /** ยังไม่เข้ารอบรายงาน — รวมเข้ากับหมุด "ปฏิบัติตามวิธี (08A/08B)" */
        return 9
    }
    /** แยกแนวทางคุ้มครองแล้ว (08A/08B) — หมุดปฏิบัติรายวิธี ขั้นที่ 6 ไม่ถอยกลับไปขั้นจัดทำเอกสาร */
    if (c.stage === 'method_operation') return 9
    if (c.stage === 'notice') return c.dispatchedAt ? 9 : 8
    if (c.stage === 'appeal') return 8
    if (c.stage === 'external_pending') return 7
    /** WIT0512-0513 — รองเลขาธิการฯ กลั่นกรองชุดเสนอก่อนถึงเลขาธิการฯ */
    if (c.stage === 'deputy_review') return 6
    if (c.stage === 'director_review') return 5
    if (c.stage === 'supervisor_review') return 4
    if (c.stage === 'staff_review') return 3
    if (c.stage === 'director_assign') return 2
    if (c.stage === 'receiver_intake' || c.stage === 'officer_intake') return c.linkedMainCaseId || c.mainCaseNotFound ? 1 : 0
    if (c.linkedMainCaseId) return 3
    return 1
}

export const stageDesc = (key: string, c: CaseItem): string => {
    switch (key) {
        case 'intake':
            return c.form
        case 'main_case':
            return c.mainCaseNotFound ? 'ไม่พบคดี' : c.mainCaseNo || 'กบค.'
        case 'assign':
            return c.assignedOfficer ? c.assignedOfficer.split(' ')[0] : 'ผอ.สำนัก/กอง'
        case 'documents':
            if (c.urgent) return 'คบ.4/5 เร่งด่วน'
            if (!c.urgency) return 'รอประเมินความเร่งด่วน'
            return c.kb3Skipped ? 'ข้าม คบ.3' : c.intakeDocType === 'kb1' ? 'คบ.3/6' : 'คบ.1/3/6'
        case 'supervisor_review':
            return c.urgent ? 'ข้าม (Fast Track)' : 'ผบช.ต้น'
        case 'director_review':
            return c.kb6DirectorSignedAt ? 'ลงนามแล้ว' : 'คบ.6'
        case 'deputy_review':
            return c.deputyScreenedAt ? 'กลั่นกรองแล้ว' : 'กลั่นกรองก่อนเสนอ'
        case 'external_pending':
            return c.decisionNumber || 'พิจารณาอนุมัติ'
        case 'notice':
            if (!handoffReady(c)) return 'ส่งงานหลังอนุมัติ · กอท.'
            return noticeForCase(c) ? NOTICE_STATUS_LABELS[noticeForCase(c)!.status] : c.activity7State === 'rejected' ? 'คบ.10' : 'คบ.9/11'
        case 'method_operation': {
            const tracks = c.methodTracks || []
            if (!c.kb11Signed) return 'รอพยานลงนาม คบ.11'
            if (!tracks.length) return 'รอแยกวิธีตาม คบ.6'
            return `${tracks.filter((t) => t.status === 'active').length}/${tracks.length} วิธีเริ่มแล้ว`
        }
        /** 10 — รอบรายงาน คบ.13 (WIT1003/WIT1010/WIT1012) */
        case 'monitoring': {
            const rounds = c.monthlyReports || []
            const locked = rounds.filter((r) => r.lockedAt).length
            if (!rounds.length) return c.nextReportDueAt ? `รอบแรก ${c.nextReportDueAt.slice(0, 10)}` : 'รอกำหนดรอบ คบ.13'
            return `คบ.13 ${locked}/${rounds.length} รอบ`
        }
        /** 11A — ทบทวนผลและจำแนกแนวทาง (WIT1101-WIT1107) */
        case 'review': {
            const proposals = c.reviewProposals || []
            const last = proposals[proposals.length - 1]
            if (last) return last.status === 'endorsed' ? 'ผลทบทวนผ่านแล้ว' : last.status === 'returned' ? 'ส่งกลับแก้ไข' : 'รอตรวจข้อเสนอ'
            if (c.reviewHandoff) return `คงเหลือ ${c.reviewHandoff.remainingDays} วัน`
            return 'ทบทวนตาม คบ.13'
        }
        /** 11B/11C — ขยายเวลา คบ.14 หรือจัดทำเรื่องยุติ คบ.7/คบ.15 */
        case 'extension_termination': {
            if (c.stage === 'article14') return 'ส่งต่อกรมคุ้มครองสิทธิฯ'
            if (c.kb15) return `คบ.15 v${c.kb15.version}`
            if (c.terminationRequest) return 'เรื่องยุติ คบ.7'
            /** WIT1125-WIT1128 — รับเหตุยุติแล้วแต่ยังไม่ได้จัดทำ คบ.15 */
            if (c.terminationTrigger) return 'รับเหตุยุติแล้ว'
            const ext = c.extensionRequests || []
            const lastExt = ext[ext.length - 1]
            if (lastExt) {
                if (lastExt.status === 'approved') return `ขยาย ${lastExt.durationDays} วัน`
                if (lastExt.status === 'rejected') return 'ไม่อนุมัติขยาย'
                if (lastExt.status === 'returned') return `คบ.14 v${lastExt.version || 1} ส่งกลับแก้`
                if (lastExt.status === 'submitted') return `คบ.14 v${lastExt.version || 1} รอตรวจ`
                return 'รออนุมัติ คบ.14'
            }
            return 'คบ.14 / คบ.7-15'
        }
        /** 11D — คำสั่งยุติ แจ้งผล และปิดงาน (WIT1135-WIT1148) */
        case 'closure':
            if (c.stage === 'terminated') return 'ยุติแล้ว'
            if (c.stage === 'transferred') return 'ส่งต่อแล้ว'
            if (c.stage === 'withdrawn') return 'ถอนคำขอ'
            if (c.kb17?.deliveredAt) return 'พยานรับ คบ.17 แล้ว'
            if (c.kb17) return 'นำส่ง คบ.17'
            if (c.kb16?.signedAt) return `คบ.16 ${c.kb16.orderNo}`
            if (c.kb16) return 'ร่าง คบ.16 รอลงนาม'
            if (c.terminationApproval) return c.terminationApproval.approved ? 'อนุมัติให้ยุติ' : 'ไม่อนุมัติให้ยุติ'
            return 'คบ.16/17'
        default:
            return ''
    }
}

/** ข้อมูลหมุดปัจจุบันของแฟ้ม ใช้เติมข้อความอัตโนมัติในหน้าอื่น เช่น Mock State */
export function getCurrentStageInfo(c: CaseItem): { label: string; desc: string } {
    if (!handoffReady(c)) return { label: 'ส่งงานหลังอนุมัติ', desc: c.status }
    const stage = STAGES[Math.min(getStageIndex(c), STAGES.length - 1)]
    return { label: stage.label, desc: stageDesc(stage.key, c) }
}

export const DossierStageTracker: React.FC<DossierStageTrackerProps> = ({ caseItem }) => {
    const activeIndex = getStageIndex(caseItem)
    /** ไม่มีเส้นทางปัดตกเพราะไม่พบเลขสำนวนหลักอีกต่อไป (WIT0215) — คงตัวแปรไว้สำหรับเส้นทางยุติ */
    const isRejected = caseItem.activity7State === 'rejected'
    const isFastTrack = Boolean(caseItem.urgent)
    const currentStage = STAGES[Math.min(activeIndex, STAGES.length - 1)]
    const nextStage = STAGES[activeIndex + 1]
    const steps: StepperStep[] = STAGES.map((stage, idx) => ({
        key: stage.key,
        label: stage.label,
        sublabel: stageDesc(stage.key, caseItem),
        state: idx < activeIndex ? 'done' : idx === activeIndex ? 'current' : 'pending',
    }))

    return (
        <div className="min-w-0 max-w-full space-y-4" data-testid="dossier-stage-tracker">
            <CurrentStepCard
                current={!handoffReady(caseItem) ? 'ส่งงานหลังอนุมัติ' : currentStage.label}
                responsible={!handoffReady(caseItem) ? `${caseItem.owner} · ${caseItem.status}` : `${stageDesc(currentStage.key, caseItem)} · ขั้นตอนที่ ${currentStage.step}`}
                next={!handoffReady(caseItem) ? caseItem.next : nextStage ? nextStage.label : 'ปิดงานแล้ว'}
                nextNote={nextStage ? `ขั้นตอนที่ ${nextStage.step}` : undefined}
                index={activeIndex + 1}
                total={STAGES.length}
                caption={[
                    `เส้นทางการดำเนินงานตามลำดับชั้น · ${STAGES.length} หมุด ครอบคลุมขั้นตอนที่ 1-7`,
                    isFastTrack ? 'Fast Track: ข้ามขั้นกลั่นกรอง' : isRejected ? 'ผลพิจารณา: ไม่อนุมัติ' : undefined,
                ]}
            >
                <NumberedStepper steps={steps} ariaLabel="เส้นทางการดำเนินงาน 14 หมุด" />
            </CurrentStepCard>


        </div>
    )
}
