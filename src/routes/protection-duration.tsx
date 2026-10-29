import { startReferralInDossier } from '../lib/startReferralInDossier'
import React from 'react'
import { createPortal } from 'react-dom'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { BackLink } from '../components/common/BackLink'
import { PageHeader } from '../components/common/PageHeader'
import { CaseLockScope } from '../components/common/CaseLockScope'
import { ProtectionTimeBar } from '../components/protection/ProtectionTimeBar'
import { ProtectionMonthlyUploads } from '../components/protection/ProtectionMonthlyUploads'
import { Button } from '../components/common/Button'
import { canAccessRoute, isCaseWorker } from '../lib/permissions'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { canOperateHandoff, protectionResponsibleName, visibleOperationCase } from '../lib/protectionHandoff'
import { canProposeAgencyReferral, deriveEpisode, summarizeEpisode } from '../lib/episode'
import { monthLabel, legacyMonthLabel } from '../lib/protectionMonths'
import { formatThaiDate } from '../lib/utils'
import { anyMethodActive } from '../lib/methodProgress'
import { usesExternalReport } from '../lib/kb13'
import { article14Agency } from '../lib/constants'
import { promptArticle14Agency } from '../lib/article14AgencyPrompt'

export const Route = createFileRoute('/protection-duration')({
    validateSearch: (search: Record<string, unknown>): { caseNo?: string } => ({ caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined }),
    component: ProtectionDurationPage,
})

function ProtectionDurationPage() {
    const { caseNo } = Route.useSearch()
    const cases = useCaseStore((s) => s.cases)
    const { currentRole, currentOfficerUserId } = useAuthStore()
    const c = cases.find((c) => c.no === caseNo && visibleOperationCase(currentRole, c, currentOfficerUserId))
    const [reportOpen, setReportOpen] = React.useState(false)
    const closed = c && ['terminated', 'transferred', 'withdrawn'].includes(c.stage)
    const latestReview = c?.reviewProposals?.at(-1)
    const referral = Boolean(c && !closed && (c.stage === 'article14' || summarizeEpisode(c.episode || deriveEpisode(c)).atCap))
    const latestExtension = c?.extensionRequests?.at(-1)
    const needsExtension = Boolean(!closed && !referral && (latestReview?.appliedOutcome === 'extend' || latestExtension && ['submitted', 'pending', 'returned'].includes(latestExtension.status)))
    const needsReview = Boolean(c?.reviewHandoff && !referral && !needsExtension && !latestReview?.appliedOutcome && !closed)
    /** ขอขยายได้หลายครั้งจนครบเพดาน 6 เดือน: หลังอนุมัติครั้งก่อนแล้วยังขอครั้งถัดไปได้ */
    const capSummary = c ? summarizeEpisode(c.episode || deriveEpisode(c)) : undefined
    const canExtendMore = Boolean(c && !closed && !referral && !capSummary?.atCap && latestExtension?.status === 'approved')
    const active = Boolean(c && !closed && (c.stage === 'protection' || anyMethodActive(c)))
    /** เคสที่เริ่มคุ้มครองแล้วเสนอส่งต่อหน่วยงานอื่นตามข้อ 14 ได้ทุกเมื่อ รวมถึงแฟ้มที่เลือกวิธีที่ 4 (ก่อนครบ 6 เดือนต้องผ่านคณะกรรมการ) */
    const canProposeReferral = Boolean(c && !referral && !c.article14 && canProposeAgencyReferral(c))
    const needsMethodWork = Boolean(c && !closed && !active && !referral && c.methodTracks?.find((t) => t.method === 4)?.coordination?.responseStatus !== 'accepted')
    const account = useAuthStore.getState().getCurrentUserAccount()
    const isResponsible = Boolean(c && isCaseWorker(currentRole) && canOperateHandoff(currentRole, c, currentOfficerUserId) &&
        (c.protectionHandoff || c.protectionOwnerUserId === currentOfficerUserId || account?.name === (c.protectionOwner || c.assignedOfficer || c.owner)))
    /** ผลพิจารณา คบ.14 จากเลขาธิการที่เจ้าของสำนวนยังไม่รับทราบ — แจ้งด้วยป็อปอัปก่อนเตือนทบทวน */
    const decision = c && isResponsible && latestExtension && ['approved', 'rejected'].includes(latestExtension.status) && !latestExtension.ownerAcknowledgedAt ? latestExtension : undefined
    const startExtensionDocs = useCaseStore((s) => s.startExtensionDocs)
    const navigate = useNavigate()
    /** เริ่มชุดเอกสารขอขยาย (คบ.3/คบ.6 ฉบับใหม่ + คบ.14) แล้วไปที่แฟ้ม — mock: ถ้าเริ่มไม่ได้ก็เปิดแฟ้มต่อ */
    const openExtensionDocs = () => { if (!c) return; startExtensionDocs(c.no); navigate({ to: '/dossier/$caseNo', params: { caseNo: c.no } }) }
    /** เลือกหน่วยงานปลายทางในป็อปอัปก่อน แล้วไปหน้าจัดทำข้อเสนอพร้อมหน่วยงานที่เลือก */
    const proposeReferral = async () => {
        if (!c) return
        const agency = await promptArticle14Agency()
        if (agency && startReferralInDossier(c.no, agency)) navigate({ to: '/dossier/$caseNo', params: { caseNo: c.no } })
    }
    const acknowledgeExtensionDecision = useCaseStore((s) => s.acknowledgeExtensionDecision)
    const decisionDialog = React.useRef<HTMLDialogElement>(null)
    const acknowledgeDecision = () => { if (c && decision) acknowledgeExtensionDecision(c.no, decision.id, account?.name || protectionResponsibleName(c)); decisionDialog.current?.close() }
    React.useEffect(() => {
        if (decision && !decisionDialog.current?.open) decisionDialog.current?.showModal()
        else if (!decision) decisionDialog.current?.close()
    }, [decision])
    const reminderKey = needsReview && isResponsible && !decision ? `${c!.no}:${c!.reviewHandoff!.at}:${currentOfficerUserId}` : ''
    const [dismissedReminder, setDismissedReminder] = React.useState('')
    const reviewDialog = React.useRef<HTMLDialogElement>(null)
    const dismissReminder = () => { setDismissedReminder(reminderKey); reviewDialog.current?.close() }
    React.useEffect(() => {
        if (reminderKey && dismissedReminder !== reminderKey && !reviewDialog.current?.open) reviewDialog.current?.showModal()
        else if (!reminderKey || dismissedReminder === reminderKey) reviewDialog.current?.close()
    }, [reminderKey, dismissedReminder])
    return <div className="space-y-5">
        <div className="flex flex-wrap justify-between gap-3">
            <BackLink to="/protection" search={{}}>กลับภาพรวมการคุ้มครอง</BackLink>
            {c && !closed && <div className="flex flex-wrap gap-3">
                {(needsReview || needsExtension || canExtendMore) && isResponsible && <button type="button" onClick={openExtensionDocs} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ขอขยายเวลา</button>}
                {referral && canAccessRoute(currentRole, '/article14') && <Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ส่งต่อ{article14Agency(c).short}</Link>}
                {canProposeReferral && canAccessRoute(currentRole, '/article14') && <button type="button" onClick={proposeReferral} data-testid="duration-propose-article14" className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ส่งต่อหน่วยงานอื่น</button>}
                {needsMethodWork && canAccessRoute(currentRole, '/protection-method-work') && <Link to="/protection-method-work" search={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ดำเนินการตามวิธี</Link>}
                <Button variant="primary" size="md" onClick={() => setReportOpen(true)} disabled={currentRole === 'protection'}>{usesExternalReport(c) ? 'เพิ่มหนังสือรายงาน' : 'เพิ่มหนังสือ คบ.13'}</Button>
            </div>}
        </div>
        <PageHeader eyebrow="งานคุ้มครองพยาน · รายละเอียดรายเคส" title="ระยะเวลาคุ้มครอง" description={c ? `${c.no} · ${c.person}` : undefined} />
        {!c ? <div className="ws-card p-6 text-muted">ไม่พบเคสคุ้มครองที่เปิดดูได้</div> : <CaseLockScope caseItem={c}>
            <div className="space-y-4">
                <ProtectionTimeBar caseItem={c} />
                <ProtectionMonthlyUploads caseItem={c} open={reportOpen} onClose={() => setReportOpen(false)} readOnly={currentRole === 'protection' || Boolean(closed)} />
                {!closed && canAccessRoute(currentRole, '/termination') && <div className="flex justify-end"><Link to="/termination/$caseNo" params={{ caseNo: c.no }} className="inline-flex min-h-[52px] items-center gap-2 rounded-xl bg-rose-700 px-5 py-3 font-bold text-white hover:bg-rose-800"><i className="fa-solid fa-hand" aria-hidden="true" />ยุติคุ้มครองพยาน</Link></div>}
            </div>
        </CaseLockScope>}
        {createPortal(<dialog ref={reviewDialog} aria-label="แจ้งเตือนทบทวนการคุ้มครอง" onCancel={dismissReminder}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-paper p-6 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
            <h2 className="text-xl font-bold text-navy">ถึงรอบทบทวนการคุ้มครอง</h2>
            <p className="mt-3 font-semibold">{c?.no} · {c?.person}</p>
            <p className="mt-2 text-muted">ผู้รับผิดชอบปัจจุบัน: {c ? protectionResponsibleName(c) : ''}</p>
            <p className="mt-3">แนบ คบ.13 และผลประเมินภัยล่าสุด เพื่อขอขยายเวลา</p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
                <Button variant="secondary" size="md" onClick={dismissReminder}>ภายหลัง</Button>
                {c && <button type="button" onClick={() => { dismissReminder(); openExtensionDocs() }} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white">จัดทำ คบ.14</button>}
            </div>
        </dialog>, document.body)}
        {createPortal(<dialog ref={decisionDialog} aria-label="ผลพิจารณาขอขยายระยะเวลาคุ้มครอง" onCancel={(e) => { e.preventDefault(); acknowledgeDecision() }}
            className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-paper p-6 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
            {decision ? <>
                <div className="flex flex-col items-center text-center">
                    <span className={`grid h-16 w-16 place-items-center rounded-full text-3xl text-white ${decision.status === 'approved' ? 'bg-emerald-600' : 'bg-rose-600'}`}><i className={`fa-solid ${decision.status === 'approved' ? 'fa-check' : 'fa-xmark'}`} /></span>
                    <h2 className={`mt-3 text-2xl font-bold ${decision.status === 'approved' ? 'text-emerald-800' : 'text-rose-800'}`}>{decision.status === 'approved' ? 'ขยายระยะเวลาคุ้มครองแล้ว' : 'ไม่อนุมัติขยายระยะเวลาคุ้มครอง'}</h2>
                    <p className="mt-1 font-semibold">{c?.no} · {c?.person}</p>
                </div>
                {decision.status === 'approved' && <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4 text-center text-emerald-950">
                    <div><div className="text-[0.78rem] text-emerald-800">ขยายเพิ่ม</div><div className="text-2xl font-bold">{decision.durationMonths ? monthLabel(decision.durationMonths) : legacyMonthLabel(decision.durationDays)}</div></div>
                    <div><div className="text-[0.78rem] text-emerald-800">คุ้มครองถึง</div><div className="text-2xl font-bold">{c?.protectionEndAt ? formatThaiDate(c.protectionEndAt) : '-'}</div></div>
                </div>}
                <dl className="mt-3 grid grid-cols-[auto,1fr] gap-x-4 gap-y-2 text-sm">
                    <dt className="text-muted">ผู้พิจารณา</dt><dd>{decision.decidedBy || 'เลขาธิการ ป.ป.ท.'}{decision.decidedAt ? ` · ${decision.decidedAt}` : ''}</dd>
                    {decision.status === 'approved' ? <>
                        {decision.periodFrom ? <><dt className="text-muted">ช่วงที่ขยาย</dt><dd>{formatThaiDate(decision.periodFrom)} – {formatThaiDate(decision.periodTo)}</dd></> : null}
                    </> : <><dt className="text-muted">คำสั่งเดิม</dt><dd>คงไว้จนถึงวันสิ้นสุด{c?.protectionEndAt ? ` (${formatThaiDate(c.protectionEndAt)})` : ''}</dd></>}
                    {decision.decisionNote ? <><dt className="text-muted">ความเห็น</dt><dd>{decision.decisionNote}</dd></> : null}
                </dl>
                {decision.status !== 'approved' && <p className="mt-4 text-sm text-muted">เมื่อถึงวันสิ้นสุดให้จัดทำเรื่องยุติการคุ้มครอง (คบ.15)</p>}
                <div className="mt-5 flex justify-end"><Button variant="primary" size="md" onClick={acknowledgeDecision}>รับทราบ</Button></div>
            </> : null}
        </dialog>, document.body)}
    </div>
}
