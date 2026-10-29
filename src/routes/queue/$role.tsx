import { isReferralCommitteeTask } from '../../lib/referralCommittee'
import { isPoliceQueueCase } from '../../lib/policeLetterActions'
import React from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { PageHeader } from '../../components/common/PageHeader'
import { StatCard, StatGrid } from '../../components/common/StatCard'
import { Badge } from '../../components/common/Badge'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { ROLE_NAMES } from '../../lib/constants'
import { isAppealFolderStageReviewer, isMyQueueCase } from '../../lib/permissions'
import { UserRole } from '../../types/user'
import { formatThaiDate } from '../../lib/utils'
import { gotDutyOf, gotReviewChain, isGotReviewCase, isHandoffQueueCase, isKb14StageReviewer, isKb15StageReviewer, isOwnIntakeCase } from '../../lib/protectionHandoff'
import { isSarabanQueueCase } from '../../lib/saraban'
import { isLetterNumberingQueueCase } from '../../lib/coordinationLetterNumbering'

export const Route = createFileRoute('/queue/$role')({
    component: RoleQueuePage,
})

function RoleQueuePage() {
    const { role } = useParams({ from: '/queue/$role' })
    const cases = useCaseStore((state) => state.cases)
    const currentRole = useAuthStore((state) => state.currentRole)
    const currentOfficerUserId = useAuthStore((state) => state.currentOfficerUserId)
    const currentOrgUnitId = useAuthStore((state) => state.currentOrgUnitId) ?? undefined

    const currentRoleName = ROLE_NAMES[role as UserRole] || 'เจ้าหน้าที่'

    /** เปิดได้เฉพาะคิวงานของบทบาทตนเอง (Super Admin ดูได้ทุกคิว) */
    if (currentRole !== 'admin' && role !== currentRole) {
        return (
            <div className="ws-callout mx-auto max-w-lg p-8 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gold-soft text-warning">
                    <i className="fa-solid fa-lock text-xl" />
                </div>
                <h2 className="text-[1.1rem] font-bold text-navy">ไม่มีสิทธิ์ดูคิวงานของบทบาทอื่น</h2>
                <p className="mt-2 text-[0.88rem] leading-relaxed text-ink">
                    บทบาทปัจจุบันของคุณคือ <strong>{ROLE_NAMES[currentRole]}</strong> จึงเปิดได้เฉพาะคิวงานของตนเองเท่านั้น
                </p>
                <Link
                    to="/queue/$role"
                    params={{ role: currentRole }}
                    className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white transition hover:bg-blue"
                >
                    <i className="fa-solid fa-inbox" />
                    ไปที่คิวงานของฉัน
                </Link>
            </div>
        )
    }

    /**
     * คิวงานของผู้ปฏิบัติต้องเป็น "งานของตัวเอง" — แฟ้มที่ ผอ. มอบหมายให้คนอื่นแล้วต้องหายไปจากคิวนี้
     * (WIT0306) ส่วนบทบาทที่พิจารณาตามลำดับชั้นยังเห็นทุกแฟ้มในขั้นของตนตามเดิม
     */
    const visibleCases = cases.filter((c) => isPoliceQueueCase(role, c, currentOrgUnitId) || isMyQueueCase(role as UserRole, c, currentOfficerUserId) || isSarabanQueueCase(role as UserRole, c, currentOrgUnitId))

    // Filter cases relevant to this role
    const roleCases = visibleCases.filter((c) => {
        if (role === 'committee') return isReferralCommitteeTask(c) || isAppealFolderStageReviewer('committee', c)
        if (isPoliceQueueCase(role, c, currentOrgUnitId)) return true
        /** ธุรการหน่วยเจ้าของเรื่องมีหนังสือประสาน (วิธีที่ 4) รอออกเลข/นำส่ง */
        if (isLetterNumberingQueueCase(role as UserRole, c, currentOrgUnitId) || isSarabanQueueCase(role as UserRole, c, currentOrgUnitId)) return true
        /** ชุดนำส่งค้างที่ธุรการ — อยู่ในคิวธุรการของจุดนั้นเท่านั้น ผู้รับยังไม่เห็นจนกว่าจะลงเลขรับครบ */
        if (c.sarabanDispatch) return isSarabanQueueCase(role as UserRole, c, currentOrgUnitId)
        const extension = c.extensionRequests?.at(-1)
        if (extension && ['submitted', 'pending'].includes(extension.status) && extension.formSnapshot && role !== 'admin' && isKb14StageReviewer(role, extension.approvalStage || 'supervisor', c)) return true
        /** คบ.15 ที่รอชั้นนี้ลงนาม — ผอ.กอง/สำนัก → รองเลขาธิการ → เลขาธิการ */
        if (role !== 'admin' && isKb15StageReviewer(role, c)) return true
        /** แฟ้มที่ส่งต่อ กอท. — งานตามลำดับชั้นเข้าคิว ผบช.ต้น กอท. / ผอ. กอท. แทนสายบังคับบัญชาของสำนัก/กองเดิม */
        if (role === 'got_supervisor') return isGotReviewCase(c, 'supervisor') || isHandoffQueueCase(role, c, currentOfficerUserId)
        if (role === 'got_director' && isGotReviewCase(c, 'director')) return true
        /** ธุรการคดี กอท. — งานส่งต่อหลังอนุมัติ และคำร้องที่ตนรับเข้าทะเบียนแล้วยังไม่ส่ง ผอ. */
        if (role === 'got_receiver' && c.stage === 'receiver_intake' && isOwnIntakeCase('got_receiver', c, currentOfficerUserId)) return true
        if (role.startsWith('got_')) return isHandoffQueueCase(role as UserRole, c, currentOfficerUserId)
        /** ตำแหน่งของ กอท. (บทบาททั่วไป + บัญชี กอท.) มีงานรับมอบหลังอนุมัติเพิ่มจากงานปกติ */
        if (gotDutyOf(role as UserRole) && isHandoffQueueCase(role as UserRole, c, currentOfficerUserId)) return true
        /** ธุรการสำนัก/กอง: รับเรื่องเข้าทะเบียน + ออกเลขส่งชุดเสนอ + ลงเลขรับเมื่อส่งงานกลับเจ้าของสำนวนเดิม */
        if (role === 'receiver') return c.stage === 'receiver_intake' || isSarabanQueueCase('receiver', c, currentOrgUnitId)
        if (role === 'secretary_receiver') return isSarabanQueueCase('secretary_receiver', c, currentOrgUnitId)
        /** แฟ้มอุทธรณ์ที่ถึงชั้นของบทบาทนี้ (เจ้าหน้าที่ → ผบช.ชั้นต้น → ผอ. → รองเลขาธิการฯ → เลขาธิการฯ → ฝ่ายเลขานุการ) */
        if (isAppealFolderStageReviewer(role as UserRole, c)) return true
        if (role === 'officer' || role === 'case_owner')
            return (
                c.stage === 'officer_intake' ||
                c.stage === 'staff_review' ||
                c.returned ||
                (c.stage === 'notice' && !c.deliveredAt) ||
                (c.stage === 'protection' && !c.policeAckAt) ||
                (Boolean(c.protectionHandoff) && ['notice', 'method_operation', 'protection'].includes(c.stage))
            )
        /** WIT0812 — ข้อเสนอแนวทางหลังพยานไม่ยินยอม ต้องเป็นงานค้างจริงในคิวของผู้พิจารณาชั้นนั้น */
        const declineStage = (c.consentDeclineProposals || []).slice(-1)[0]?.stage
        /** WIT0845 — ข้อเสนอหน่วยงานใหม่หลังหน่วยงานปลายทางปฏิเสธ ก็เป็นงานค้างจริงในคิวเช่นกัน */
        const coordinationStage = (c.coordinationProposals || []).slice(-1)[0]?.stage
        if (role === 'supervisor')
            return !gotReviewChain(c) && (
                c.stage === 'supervisor_review' ||
                c.article14?.step === 'supervisor_review' ||
                c.withdrawalRequest?.approvalStage === 'supervisor' ||
                declineStage === 'supervisor' ||
                coordinationStage === 'supervisor'
            )
        if (role === 'director')
            return !gotReviewChain(c) && (
                c.stage === 'director_assign' ||
                c.stage === 'director_review' ||
                c.article14?.step === 'director_review' ||
                c.withdrawalRequest?.approvalStage === 'director' ||
                declineStage === 'director' ||
                coordinationStage === 'director'
            )
        if (role === 'deputy_secretary')
            return (
                c.stage === 'deputy_review' ||
                /** แฟ้มอุทธรณ์ตามลำดับชั้นเข้าคิวเมื่อถึงชั้นรองเลขาธิการฯ เท่านั้น (ข้างบน) */
                (c.stage === 'appeal' && !c.appealFolder) ||
                (c.stage === 'notice' && c.activity7State === 'rejected') ||
                c.stage === 'article14'
            )
        if (role === 'secretary')
            return (
                c.stage === 'external_pending' || c.protectionHandoff?.step === 'pending_send' ||
                c.secretaryReviewState === 'pending' ||
                c.article14?.step === 'secretary_review' || (c.article14?.step === 'committee_pending' && !c.article14.secretarySignature) ||
                (c.extensionRequests || []).some((r) => r.status === 'pending' && r.approvalStage === 'secretary') ||
                c.terminationRequest?.status === 'pending' ||
                (c.kb15?.status === 'endorsed' && !c.terminationApproval) ||
                (c.kb16?.status === 'submitted' && !c.kb16.signedAt) ||
                (c.kb17?.status === 'submitted' && !c.kb17.signedAt) ||
                (c.stage === 'notice' &&
                    c.activity7State === 'approved' &&
                    !c.kb9Signed &&
                    (c.approvalStep || 0) >= 2) ||
                (c.stage === 'notice' && c.activity7State === 'rejected' && !c.kb10Signed)
            )
        if (role === 'protection') return c.stage === 'protection'
        if (role === 'appeal') return c.stage === 'appeal'
        return true
    })

    const urgentCount = roleCases.filter((c) => c.urgent).length
    const returnedCount = roleCases.filter((c) => c.returned).length

    return (
        <div className="space-y-5">
            <PageHeader
                eyebrow="คิวงาน · งานของฉัน"
                title={`คิวงานของฉัน: ${currentRoleName}`}
                description={`รายการคำร้องและภาระงานที่ต้องดำเนินการตามบทบาท ${currentRoleName}`}
                actions={
                    role === 'receiver' || role === 'got_receiver' || role === 'officer' || role === 'case_owner' || role === 'admin' ? (
                        <Link
                            to="/intake"
                            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white hover:bg-blue transition"
                        >
                            <i className="fa-solid fa-plus" />
                            รับคำร้องใหม่
                        </Link>
                    ) : undefined
                }
            />

            {/* Role Banner Guide */}
            {/* <div className="ws-callout space-y-1">
                <div className="flex items-center gap-2 text-navy font-bold text-[1rem]">
                    <i className="fa-solid fa-user-gear text-blue" />
                    <span>บทบาทปัจจุบัน: {currentRoleName}</span>
                </div>
                <p className="text-[0.88rem] text-ink leading-relaxed">
                    {role === 'secretary_receiver'
                        ? 'ธุรการสำนักงานเลขาธิการ ลงเลขทะเบียนรับชุดเสนอ คบ.1 / คบ.3 / คบ.6 จากสำนัก/กอง ก่อนส่งรองเลขาธิการ ป.ป.ท. และออกเลขทะเบียนส่งผลอนุมัติ (คบ.1 / คบ.3 / คบ.6 / คบ.9) ไปยังธุรการปลายทาง'
                        : role === 'got_receiver'
                        ? 'รับคำร้องขอคุ้มครองพยานเข้าทะเบียนแล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน และลงเลขทะเบียนรับผลอนุมัติจากสำนักงานเลขาธิการ แล้วรับเรื่องและส่งเสนอ ผอ. กอท. เพื่อมอบหมายผู้รับผิดชอบ'
                        : role === 'got_director'
                        ? 'มอบหมายผู้รับผิดชอบจากบุคลากร กอท. ที่มีสิทธิรับงาน พร้อมคำสั่งมอบหมายตามผลอนุมัติเดิม'
                        : role === 'got_supervisor'
                        ? 'ผู้บังคับบัญชาชั้นต้น กอท. กลั่นกรองงานของแฟ้มที่ส่งต่อ กอท. ได้แก่ คบ.14 พร้อม คบ.3/คบ.6 ฉบับขยายเวลา คำขอถอนตัว ข้อเสนอแนวทางหรือหน่วยงานใหม่ และเรื่องส่งต่อกรมคุ้มครองสิทธิฯ ก่อนเสนอ ผอ. กอท.'
                        : role === 'got_officer'
                        ? 'รับงานที่ ผอ. กอท. มอบหมาย ตรวจผลอนุมัติและเอกสารในแฟ้มเดิม แล้วดำเนินการคุ้มครองต่อ'
                        : role === 'deputy_secretary'
                        ? 'รองเลขาธิการ ป.ป.ท. กลั่นกรองชุดเสนอ คบ.6 ที่ ผอ. ลงนามแล้ว (ขั้นที่ 4) หนังสือ คบ.10 แฟ้มอุทธรณ์ และเรื่องเสนอส่งต่อกรมคุ้มครองสิทธิฯ ก่อนถึงเลขาธิการ ป.ป.ท.'
                        : role === 'committee'
                        ? 'ฝ่ายเลขานุการคณะกรรมการ ป.ป.ท. บรรจุวาระและบันทึกมติ/คำวินิจฉัยของคณะกรรมการ (อุทธรณ์ และเรื่องส่งต่อกรมคุ้มครองสิทธิฯ)'
                        : role === 'secretary'
                        ? 'เลขาธิการ ป.ป.ท. ตรวจทานแฟ้มคำร้องทั้งหมด ตรวจลายมือชื่อ และลงนามอนุมัติ/ไม่อนุมัติ/ส่งกลับแก้ไข'
                        : role === 'director'
                            ? 'ผู้อำนวยการสำนัก/กอง มอบหมายเจ้าของสำนวน (ขั้นที่ 2) พิจารณาคำสั่ง คบ.5 (กรณีเร่งด่วน) และลงนามใน คบ.6 ก่อนส่งรองเลขาธิการ ป.ป.ท. กลั่นกรอง'
                            : role === 'supervisor'
                                ? 'ผู้บังคับบัญชาชั้นต้น กลั่นกรองข้อเท็จจริงและความสมบูรณ์ของแบบ คบ.6 ก่อนเสนอ ผอ.สำนัก/กอง'
                                : role === 'protection'
                                    ? 'ชุดปฏิบัติการคุ้มครองพยาน (ร่วมกับตำรวจ/หน่วยงานภายนอกในพื้นที่) ปฏิบัติการคุ้มครองความปลอดภัย และจัดทำรายงานผลประจำเดือน (คบ.13)'
                                    : role === 'appeal'
                                        ? 'นิติกรงานอุทธรณ์ ตรวจสอบความถูกต้องและเสนอคณะกรรมการ ป.ป.ท. วินิจฉัยชี้ขาด'
                                        : role === 'receiver'
                                            ? 'ธุรการสำนัก/กอง เปิดรับคำร้อง สแกนเอกสาร ค้นหาและเชื่อมโยงเลขคดีหลักจากกิจกรรมที่ 4/5 แล้วส่ง ผอ.สำนัก/กอง มอบหมายเจ้าของสำนวน · ออกเลขทะเบียนส่งชุดเสนอ คบ.1 / คบ.3 / คบ.6 หลัง ผอ. ลงนาม และลงเลขทะเบียนรับเมื่อเลขาธิการส่งงานกลับเจ้าของสำนวนเดิม'
                                            : 'เจ้าหน้าที่ ป.ป.ท. ตรวจสอบข้อมูลพยาน จัดทำบันทึกข้อเท็จจริง คบ.3 เชื่อมโยงคดีหลัก และประเมินความเสี่ยง คบ.6'}
                </p>
            </div> */}

            {/* KPI Stats */}
            <StatGrid>
                <StatCard label="งานในคิวทั้งหมด" value={roleCases.length} subtext="รอการดำเนินการ" />
                <StatCard label="กรณีจำเป็นเร่งด่วน" value={urgentCount} subtext="ดำเนินการทันที" variant="danger" />
                <StatCard label="ส่งกลับแก้ไข" value={returnedCount} subtext="รอปรับปรุงข้อมูล" variant="warning" />
                <StatCard label="ดำเนินการแล้วเสร็จ" value="12" subtext="ในรอบเดือน" variant="success" />
            </StatGrid>

            {/* Cases Table */}
            <div className="ws-card overflow-hidden">
                <div className="border-b border-line p-4 sm:px-6">
                    <h2 className="text-[1.1rem] font-bold leading-snug text-navy">รายการคำร้องในคิวงาน ({roleCases.length} รายการ)</h2>
                </div>

                <div className="ws-table-wrap">
                    <table className="ws-table">
                        <thead>
                            <tr>
                                <th>เลขคำร้อง</th>
                                <th>แบบ / ความเร่งด่วน</th>
                                <th>ผู้ขอรับการคุ้มครอง</th>
                                <th>ขั้นตอน / สถานะ</th>
                                <th>งานที่ต้องทำในขั้นตอนนี้</th>
                                <th className="text-right">เปิดแฟ้ม</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roleCases.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="py-12 text-center text-muted">
                                        <i className="fa-solid fa-circle-check text-3xl text-emerald-500 mb-2 block" />
                                        ไม่มีงานค้างในคิวบทบาทนี้
                                    </td>
                                </tr>
                            ) : (
                                roleCases.map((c) => (
                                    <tr key={c.no} className="hover:bg-soft transition">
                                        <td className="font-bold text-blue-700">
                                            <Link to={(isSarabanQueueCase(role as UserRole, c, currentOrgUnitId) || isLetterNumberingQueueCase(role as UserRole, c, currentOrgUnitId)) ? '/saraban/$caseNo' : '/dossier/$caseNo'} params={{ caseNo: c.no }}>
                                                {c.no}
                                            </Link>
                                            <div className="text-[0.8rem] text-muted mt-0.5">{formatThaiDate(c.createdAt)}</div>
                                            {c.demoData && <small className="block text-[0.8rem] text-muted">ข้อมูลสำหรับสาธิต</small>}
                                        </td>

                                        <td>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge variant="info">{c.form}</Badge>
                                                {c.urgent && (
                                                    <Badge variant="danger" icon="fa-triangle-exclamation">
                                                        เร่งด่วน
                                                    </Badge>
                                                )}
                                                {c.returned && (
                                                    <Badge variant="danger" icon="fa-rotate-left">
                                                        แก้ไข
                                                    </Badge>
                                                )}
                                            </div>
                                        </td>

                                        <td>
                                            <strong className="block text-ink">{c.person}</strong>
                                            <small className="text-[0.8rem] text-muted">{c.mainCaseNotFound ? 'ไม่พบคดีหลัก' : c.mainCaseNo || 'กบค. 001/2569'}</small>
                                        </td>

                                        <td>
                                            {c.protectionHandoff && <div className={`mb-1 text-[0.8rem] font-semibold ${(c.appealResolution ? c.appealResolution.outcome === 'uphold' : c.appealFolder ? c.appealAgainst === 'kb10' : c.activity7State === 'rejected') ? 'text-danger' : 'text-success-dark'}`}>
                                                {c.appealResolution ? `ผลอุทธรณ์: ${c.appealResolution.outcome === 'overturn' ? 'อนุมัติให้ความคุ้มครอง' : 'ไม่อนุมัติให้ความคุ้มครอง'}` : c.appealFolder ? `คำสั่งที่อุทธรณ์: ${c.appealAgainst === 'kb17' ? 'ยุติการคุ้มครอง' : 'ไม่อนุมัติให้ความคุ้มครอง'}` : `ผลพิจารณา: ${c.activity7State === 'rejected' ? 'ไม่อนุมัติ' : c.activity7State === 'approved' ? 'อนุมัติ' : 'อยู่ระหว่างพิจารณา'}`}
                                            </div>}
                                            <Badge>{c.status}</Badge>
                                        </td>

                                        <td className="max-w-xs text-ink font-medium">
                                            {c.next}
                                        </td>

                                        <td className="text-right">
                                            <Link
                                                to={c.extensionRequests?.at(-1) && ['submitted', 'pending', 'returned'].includes(c.extensionRequests.at(-1)!.status) ? '/dossier/$caseNo' : (isSarabanQueueCase(role as UserRole, c, currentOrgUnitId) || isLetterNumberingQueueCase(role as UserRole, c, currentOrgUnitId)) ? '/saraban/$caseNo' : '/dossier/$caseNo'}
                                                params={{ caseNo: c.no }}
                                                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-navy px-3 py-1.5 text-[0.85rem] font-semibold text-white hover:bg-blue transition whitespace-nowrap"
                                            >
                                                <i className="fa-solid fa-folder-open text-xs" />
                                                เปิดแฟ้ม
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
