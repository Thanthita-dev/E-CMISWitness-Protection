import { protectionMonths, monthLabel } from '../lib/protectionMonths'
import React from 'react'
import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { Button } from '../components/common/Button'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { visibleOperationCase, protectionResponsibleName } from '../lib/protectionHandoff'
import { formatThaiDate } from '../lib/utils'
import type { CaseItem } from '../types/case'
import { protectionOverviewDemos } from '../lib/protectionOverviewDemos'
import { deriveEpisode, summarizeEpisode } from '../lib/episode'

export const Route = createFileRoute('/protection')({
  validateSearch: (search: Record<string, unknown>): { caseNo?: string } => ({ caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined }),
  component: ProtectionPage,
})

const CLOSED = ['terminated', 'transferred', 'withdrawn']
const workStatus = (c: CaseItem) => CLOSED.includes(c.stage) ? 'closed' :
  c.stage === 'article14' ? 'referral' :
  c.stage === 'protection' || c.methodTracks?.some((t) => t.status === 'active') ? 'active' : 'preparing'
const STATUS_LABELS = { preparing: 'เตรียมดำเนินการคุ้มครอง', active: 'กำลังคุ้มครอง', referral: 'รอส่งต่อกรมคุ้มครองสิทธิฯ', closed: 'สิ้นสุดแล้ว' }

function ProtectionPage() {
  const cases = useCaseStore((s) => s.cases)
  const { caseNo } = Route.useSearch()
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const [tab, setTab] = React.useState('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const jobs = cases.filter((c) => visibleOperationCase(currentRole, c, currentOfficerUserId) &&
    (['method_operation', 'protection', 'article14', ...CLOSED].includes(c.stage) || c.reviewHandoff || c.extensionRequests?.length ||
      c.methodTracks?.some((t) => t.coordination?.responseStatus === 'accepted')))
  const query = searchQuery.trim().toLocaleLowerCase('th-TH')
  const rows = jobs.filter((c) => (tab === 'all' || workStatus(c) === tab) &&
    (!query || [c.no, c.person, c.mainCaseNo, protectionResponsibleName(c), c.methodTracks?.find((t) => t.method === 4)?.coordination?.agency]
      .some((value) => value?.toLocaleLowerCase('th-TH').includes(query))))
  if (caseNo) return <Navigate to="/protection-duration" search={{ caseNo }} replace />

  return <div className="space-y-5">
    <PageHeader eyebrow="งานคุ้มครองพยาน · คุ้มครองและติดตาม" title="ภาพรวมการคุ้มครอง" description="ดูจำนวนเคสคุ้มครอง ค้นหา และติดตามการดำเนินงานของแต่ละเคส" actions={jobs[0] && <Button variant="secondary" size="md" onClick={() => {
      const store = useCaseStore.getState()
      for (const demo of protectionOverviewDemos(jobs[0])) if (!store.cases.some((c) => c.no === demo.no)) store.addCase(demo)
      setTab('all'); setSearchQuery('')
    }}>เพิ่มเคสตัวอย่างทบทวน / ขยายเวลา / ส่งต่อ</Button>} />
    <StatGrid>
      <StatCard label="เคสคุ้มครองทั้งหมด" value={jobs.length} subtext="ทุกสถานะ · นับแยกรายเคส" active={tab === 'all'} onClick={() => setTab('all')} />
      <StatCard label="เตรียมดำเนินการคุ้มครอง" value={jobs.filter((c) => workStatus(c) === 'preparing').length} subtext="รอเริ่มคุ้มครอง" active={tab === 'preparing'} onClick={() => setTab('preparing')} />
      <StatCard label="กำลังคุ้มครอง" value={jobs.filter((c) => workStatus(c) === 'active').length} subtext="เคสที่เริ่มปฏิบัติแล้ว" active={tab === 'active'} onClick={() => setTab('active')} />
      <StatCard label="รอส่งต่อกรมคุ้มครองสิทธิฯ" value={jobs.filter((c) => workStatus(c) === 'referral').length} subtext="ครบเพดาน · รอพิจารณาส่งต่อ" active={tab === 'referral'} onClick={() => setTab('referral')} />
      <StatCard label="สิ้นสุดการคุ้มครอง" value={jobs.filter((c) => workStatus(c) === 'closed').length} subtext="ยุติ / ส่งต่อ / ถอนคำร้อง" active={tab === 'closed'} onClick={() => setTab('closed')} />
    </StatGrid>
    <div className="ws-card p-5 grid gap-3 md:grid-cols-[2fr_1fr_auto] items-end">
      <label className="block"><span className="ws-label">ค้นหา</span><input type="search" className="ws-input w-full" placeholder="ค้นหาเลขคำร้อง ชื่อพยาน หรือหน่วยงานที่คุ้มครอง..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></label>
      <label className="block"><span className="ws-label">สถานะงาน</span><select className="ws-input w-full" value={tab} onChange={(e) => setTab(e.target.value)}><option value="all">ทุกสถานะ</option>{Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <Button type="button" variant="secondary" size="md" onClick={() => { setTab('all'); setSearchQuery('') }}>ล้างเงื่อนไข</Button>
    </div>
    <section id="protection-work-panel" aria-label="รายการเคสคุ้มครองพยาน" className="ws-card overflow-hidden">
      <header className="border-b border-line p-5"><h2 className="text-lg font-bold text-navy">รายการเคสคุ้มครองพยาน</h2><p className="mt-1 text-sm text-muted">พบทั้งหมด {rows.length} เคส</p></header>
      <div className="overflow-x-auto">
        <table className="ws-table text-sm">
          <thead><tr><th>เลขคำร้อง / พยาน</th><th>วิธีคุ้มครอง</th><th>คุ้มครองโดย</th><th>ระยะเวลา / วันสิ้นสุด</th><th>สถานะงาน</th><th>การดำเนินการ</th></tr></thead>
          <tbody>{rows.length === 0 ? <tr><td colSpan={6} className="py-10 text-center text-muted">ไม่มีงานในสถานะนี้</td></tr> : rows.map((c) => {
            const status = workStatus(c)
            const co = c.methodTracks?.find((t) => t.method === 4)?.coordination
            const methods = c.orderedMethods || c.approvedMethods || c.methodTracks?.map((t) => t.method) || []
            const episode = summarizeEpisode(c.episode || deriveEpisode(c))
            const sixMonthDemo = c.demoData && c.no.endsWith('-009903')
            const atCap = episode.atCap || sixMonthDemo
            const referral = !CLOSED.includes(c.stage) && (c.stage === 'article14' || atCap)
            const latestExtension = c.extensionRequests?.at(-1)
            const extension = !CLOSED.includes(c.stage) && !referral && (latestExtension && ['submitted', 'returned', 'pending'].includes(latestExtension.status) || c.reviewProposals?.at(-1)?.appliedOutcome === 'extend')
            const review = !CLOSED.includes(c.stage) && !referral && !extension && c.reviewHandoff && !c.reviewProposals?.at(-1)?.appliedOutcome
            const workLabel = referral ? 'ครบ 6 เดือน · รอส่งต่อกรมคุ้มครองสิทธิฯ' : extension ? 'อยู่ระหว่างขอขยายเวลา' : review ? 'รอทบทวนการคุ้มครอง' : STATUS_LABELS[status]
            return <tr key={c.no}>
              <td><Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="font-bold text-navy">{c.no}</Link><p>{c.person}</p></td>
              <td>{methods.length ? methods.map((m) => `วิธีที่ ${m}`).join(', ') : '—'}</td>
              <td><strong>{co?.agency || protectionResponsibleName(c) || 'ยังไม่ระบุ'}</strong></td>
              <td>{sixMonthDemo ? '6 เดือน' : protectionMonths(c) ? monthLabel(protectionMonths(c)) : '—'}<p className="text-muted">{c.protectionEndAt ? `สิ้นสุด ${formatThaiDate(c.protectionEndAt)}` : 'รอบันทึกวันเริ่มจริง'}</p>{c.episode && <p className="text-muted">{referral && atCap ? 'สะสมครบ 6 เดือน' : `สะสม ${Number((episode.cumulative / episode.cap * 6).toFixed(1))} / 6 เดือน`}</p>}</td>
              <td><span className="rounded-full bg-soft px-3 py-1 font-semibold text-navy">{workLabel}</span>{c.demoData && <small className="block mt-1 text-muted">เคสตัวอย่าง</small>}</td>
              <td><div className="flex flex-wrap gap-2">
                <Link to="/protection-duration" search={{ caseNo: c.no }} className="inline-flex min-h-[38px] items-center rounded-lg bg-navy px-3 py-2 font-semibold text-white">ดูระยะเวลาคุ้มครอง</Link>
              </div></td>
            </tr>
          })}</tbody>
        </table>
      </div>
    </section>

  </div>
}
