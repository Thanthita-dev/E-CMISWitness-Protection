import React from 'react'
import { createPortal } from 'react-dom'
import { createFileRoute, Link } from '@tanstack/react-router'
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
import { deriveEpisode, summarizeEpisode } from '../lib/episode'

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
  const active = Boolean(c && !closed && (c.stage === 'protection' || c.methodTracks?.some((t) => t.status === 'active')))
  const needsMethodWork = Boolean(c && !closed && !active && !referral && c.methodTracks?.find((t) => t.method === 4)?.coordination?.responseStatus !== 'accepted')
  const account = useAuthStore.getState().getCurrentUserAccount()
  const isResponsible = Boolean(c && isCaseWorker(currentRole) && canOperateHandoff(currentRole, c, currentOfficerUserId) &&
    (c.protectionHandoff || c.protectionOwnerUserId === currentOfficerUserId || account?.name === (c.protectionOwner || c.assignedOfficer || c.owner)))
  const reminderKey = needsReview && isResponsible ? `${c!.no}:${c!.reviewHandoff!.at}:${currentOfficerUserId}` : ''
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
        {(needsReview || needsExtension) && isResponsible && <Link to="/form/$formId" params={{ formId: '14' }} search={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ขอขยายเวลา คบ.14</Link>}
        {referral && canAccessRoute(currentRole, '/article14') && <Link to="/article14" search={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ส่งต่อกรมคุ้มครองสิทธิฯ</Link>}
        {needsMethodWork && canAccessRoute(currentRole, '/protection-method-work') && <Link to="/protection-method-work" search={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line bg-white px-4 py-2 font-semibold text-navy">ดำเนินการตามวิธี</Link>}
        <Button variant="primary" size="md" onClick={() => setReportOpen(true)} disabled={currentRole === 'protection'}>เพิ่มหนังสือ คบ.13</Button>
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
        {c && <Link to="/form/$formId" params={{ formId: '14' }} search={{ caseNo: c.no }} onClick={dismissReminder} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white">จัดทำ คบ.14</Link>}
      </div>
    </dialog>, document.body)}
  </div>
}
