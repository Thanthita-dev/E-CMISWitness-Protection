import { noticeForCase, NOTICE_STATUS_LABELS } from '../../lib/noticeDocuments'
import React from 'react'
import { CaseItem } from '../../types/case'
import { CurrentStepCard } from '../common/CurrentStepCard'
import { NumberedStepper, StepperStep } from '../common/NumberedStepper'
import { handoffReady } from '../../lib/protectionHandoff'
import { ARTICLE14_STEP_LABELS, article14Agency } from '../../lib/constants'

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

/**
 * แฟ้มที่เข้าเส้นทางส่งต่อกรมคุ้มครองสิทธิฯ (ข้อ 14) — หมุด 13 เป็นปลายทางของเส้นทาง ไม่มีหมุดคำสั่งยุติ/ปิดงาน
 * คณะกรรมการไม่เห็นชอบแล้วกลับไปคุ้มครองตามคำสั่งเดิม จึงใช้หมุดชุดปกติ
 */
export const isArticle14Path = (c: CaseItem): boolean =>
    c.article14 ? c.article14.step !== 'committee_rejected' : c.stage === 'article14'

const ARTICLE14_STAGE = { key: 'article14', label: 'ส่งต่อกรมคุ้มครองสิทธิฯ', step: '7' }

const isNonApprovalPath = (c: CaseItem): boolean =>
    c.activity7State === 'rejected' || Boolean(c.appealFolder && c.appealAgainst !== 'kb17' && c.appealResolution?.outcome !== 'overturn')
const NON_APPROVAL_STAGES = [
    ...STAGES.slice(0, 9),
    { key: 'appeal', label: 'พิจารณาอุทธรณ์', step: '5' },
    { key: 'appeal_closed', label: 'ปิดขั้นอุทธรณ์', step: '5' },
]

/** หมุดที่แสดงของแฟ้มนี้ — เส้นทางข้อ 14 แทนหมุด 13 และตัดหมุด 14 ออก */
export const stagesFor = (c: CaseItem) =>
    (isNonApprovalPath(c) ? NON_APPROVAL_STAGES : isArticle14Path(c) ? [...STAGES.slice(0, 12), ARTICLE14_STAGE] : STAGES).map((s) =>
        c.stage === 'director_outgoing_registry' && s.key === 'director_review' ? { ...s, label: 'ธุรการออกเลขส่ง' } : s)

/** ตำแหน่งหมุด "แจ้งผล/นำส่ง" ใช้ตัดสินว่าจะกางรายละเอียดขั้นย่อยของหมุดนี้หรือไม่ */

export function getStageIndex(c: CaseItem): number {
    if (isNonApprovalPath(c)) {
        if (c.appealClosedAt || c.nonApprovalClosedAt || c.appealResolution?.outcome === 'uphold') return 10
        if (c.appealFolder || c.appealFiledAt) return 9
        return 8
    }
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
    /** ทะเบียนสารบรรณ (ธุรการ) ระหว่าง ผอ. กับรองเลขาธิการฯ — ใช้หมุด ผอ. ต่อ แสดงขั้นย่อยที่ข้อความใต้หมุด */
    if (c.stage === 'director_review' || c.stage === 'director_outgoing_registry' || c.stage === 'secretary_incoming_registry') return 5
    if (c.stage === 'supervisor_review') return 4
    if (c.stage === 'staff_review') return 3
    if (c.stage === 'director_assign') return 2
    if (c.stage === 'receiver_intake' || c.stage === 'officer_intake') return c.linkedMainCaseId || c.mainCaseNotFound ? 1 : 0
    if (c.linkedMainCaseId) return 3
    return 1
}

export const stageDesc = (key: string, c: CaseItem): string => {
    switch (key) {
        case 'appeal':
            return c.appealResolution ? 'คณะกรรมการวินิจฉัยแล้ว' : c.appealFolder ? c.status : 'รอการยื่นอุทธรณ์'
        case 'appeal_closed':
            return c.appealResolution?.outcome === 'uphold' ? 'คณะกรรมการยกคำร้อง' : c.nonApprovalClosedAt ? 'ปิดเรื่องไม่อนุมัติ' : 'รอผลพิจารณา'

        case 'article14':
            if (c.stage === 'transferred') return 'ส่งมอบแล้ว'
            return c.article14 ? ARTICLE14_STEP_LABELS[c.article14.step] : 'รอจัดทำข้อเสนอ'
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
            return c.urgent ? 'ข้าม' : 'ผบช.ต้น'
        case 'director_review':
            if (c.stage === 'director_outgoing_registry') return 'ธุรการสำนัก/กอง ออกเลขส่ง'
            if (c.stage === 'secretary_incoming_registry') return 'ธุรการสำนักงานเลขาธิการ ลงเลขรับ'
            return c.kb6DirectorSignedAt ? 'ลงนามแล้ว' : 'คบ.6'
        case 'deputy_review':
            return c.deputyScreenedAt ? 'กลั่นกรองแล้ว' : 'กลั่นกรองก่อนเสนอ'
        case 'external_pending':
            return c.decisionNumber || 'พิจารณาอนุมัติ'
        case 'notice':
            if (isNonApprovalPath(c)) return c.deliveredAt ? 'พยานได้รับ คบ.10 แล้ว' : c.dispatchedAt ? 'นำส่ง คบ.10 แล้ว' : 'จัดทำและนำส่ง คบ.10'
            if (!handoffReady(c)) return 'ส่งงานหลังพิจารณา · กอท.'
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
            if (c.stage === 'article14') return `ส่งต่อ${article14Agency(c).short}`
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
    if (!handoffReady(c)) return { label: 'ส่งงานหลังพิจารณา', desc: c.status }
    const stages = stagesFor(c)
    const stage = stages[Math.min(getStageIndex(c), stages.length - 1)]
    return { label: stage.label, desc: stageDesc(stage.key, c) }
}

export const DossierStageTracker: React.FC<DossierStageTrackerProps> = ({ caseItem }) => {
    const activeIndex = getStageIndex(caseItem)
    const completed = Boolean(caseItem.kb17?.deliveredAt || caseItem.terminationDocumentsClosedAt)
    /** ไม่มีเส้นทางปัดตกเพราะไม่พบเลขสำนวนหลักอีกต่อไป (WIT0215) — คงตัวแปรไว้สำหรับเส้นทางยุติ */
    const isRejected = caseItem.activity7State === 'rejected'
    const isFastTrack = Boolean(caseItem.urgent)
    const stages = stagesFor(caseItem)
    const article14Path = isArticle14Path(caseItem)
    const currentStage = stages[Math.min(activeIndex, stages.length - 1)]
    const nextStage = stages[activeIndex + 1]
    /** เส้นทางข้อ 14 ไม่มีหมุดถัดไป — ปลายทางคือส่งมอบให้กรมคุ้มครองสิทธิฯ */
    const nextLabel = isNonApprovalPath(caseItem) && activeIndex === 10 ? (caseItem.appealKb10 ? 'จัดทำและนำส่ง คบ.10 แจ้งผลมติ' : 'สิ้นสุดการพิจารณา') : nextStage ? nextStage.label : article14Path && activeIndex < stages.length ? `ส่งมอบให้${article14Agency(caseItem).short}` : 'ปิดงานแล้ว'
    const steps: StepperStep[] = stages.map((stage, idx) => ({
        key: stage.key,
        label: stage.label,
        sublabel: stageDesc(stage.key, caseItem),
        state: completed || idx < activeIndex ? 'done' : idx === activeIndex ? 'current' : 'pending',
    }))

    return (
        <div className="min-w-0 max-w-full space-y-4" data-testid="dossier-stage-tracker">
            <CurrentStepCard
                current={completed ? 'ปิดงานแล้ว' : !handoffReady(caseItem) ? 'ส่งงานหลังพิจารณา' : currentStage.label}
                responsible={completed ? 'แจ้งคำสั่งยุติและบันทึกพยานรับ คบ.17 แล้ว' : !handoffReady(caseItem) ? `${caseItem.owner} · ${caseItem.status}` : `${stageDesc(currentStage.key, caseItem)} · ขั้นตอนที่ ${currentStage.step}`}
                next={completed ? 'ดำเนินการครบแล้ว' : !handoffReady(caseItem) ? caseItem.next : nextLabel}
                nextNote={completed ? undefined : nextStage ? `ขั้นตอนที่ ${nextStage.step}` : article14Path && activeIndex < stages.length ? `ขั้นตอนที่ ${currentStage.step}` : undefined}
                index={completed ? stages.length : Math.min(activeIndex, stages.length - 1) + 1}
                total={stages.length}
                caption={[
                    isNonApprovalPath(caseItem) ? 'เส้นทางไม่อนุมัติ · แจ้งผลและอุทธรณ์' : undefined,
                    isFastTrack ? 'กรณีเร่งด่วน: ข้ามขั้นกลั่นกรอง' : isRejected ? 'ผลพิจารณา: ไม่อนุมัติ' : undefined,
                ]}
            >
                <NumberedStepper steps={steps} ariaLabel={`เส้นทางการดำเนินงาน ${stages.length} หมุด`} />
            </CurrentStepCard>


        </div>
    )
}
