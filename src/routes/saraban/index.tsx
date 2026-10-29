import React from 'react'
import { kb10ClerkAllowed } from '../../lib/noticeDocuments'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { PageHeader } from '../../components/common/PageHeader'
import { SegmentedTabs } from '../../components/common/SegmentedTabs'
import { Badge } from '../../components/common/Badge'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { sarabanRouteFor } from '../../components/saraban/sarabanDisplay'
import { formatThaiDate } from '../../lib/utils'
import type { CaseItem, SarabanCheckpoint } from '../../types/case'
import {
  SARABAN_CHECKPOINT_META, activeSarabanCheckpoint, formatSarabanDate, isSarabanQueueCase,
  sarabanCheckpointProgress, sarabanClerkRole,
} from '../../lib/saraban'
import { LETTER_NUMBERING_STATUS, isLetterNumberingDoneCase, isLetterNumberingQueueCase, letterNumberingOf, letterNumberingOpen } from '../../lib/coordinationLetterNumbering'

export const Route = createFileRoute('/saraban/')({ component: SarabanListPage })

type TabKey = 'pending' | 'done'

interface Row {
  c: CaseItem
  /** letter = ธุรการออกเลขหนังสือประสาน (วิธีที่ 4) แยกจากจุดลงทะเบียนชุด คบ. */
  cp: SarabanCheckpoint | 'letter' | 'kb10-dispatch' | 'police'
  lastAt?: string
}

function SarabanListPage() {
  const cases = useCaseStore((s) => s.cases)
  const role = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId) ?? undefined
  const navigate = useNavigate()
  const [tab, setTab] = React.useState<TabKey>('pending')
  const [query, setQuery] = React.useState('')

  const { pending, done } = React.useMemo(() => {
    const pending: Row[] = []
    const done: Row[] = []
    for (const c of cases) {
      if (['admin', 'secretary_receiver'].includes(role) && c.policeLetters && (Object.values(c.policeLetters.letters).some(l => l.status === 'awaiting_number') || c.policeLetters.revisionStage === 'awaiting_dispatch')) pending.push({ c, cp: 'police' })
      if (c.activity7State === 'rejected' && (c.kb10DispatchRequestedAt || c.kb10DispatchNumbering) && c.resultNotices?.[10]?.original && !c.sarabanDispatch && !c.nonApprovalClosedAt && kb10ClerkAllowed(role, c, orgUnitId)) {
        const sent = c.resultNotices[10].status === 'sent'
        ;(sent ? done : pending).push({ c, cp: 'kb10-dispatch', lastAt: c.kb10DispatchNumbering?.at })
      }
      const active = activeSarabanCheckpoint(c)
      if (active && (role === 'admin' || isSarabanQueueCase(role, c, orgUnitId))) pending.push({ c, cp: active })
      /** ลงทะเบียนแล้ว — ฉบับล่าสุดในจุดที่บทบาทนี้เป็นผู้ลงทะเบียน (admin เห็นทุกจุด) */
      const mine = (c.sarabanRecords || []).filter((r) => role === 'admin' || sarabanClerkRole(c, r.checkpoint) === role)
      const last = mine.at(-1)
      if (last) done.push({ c, cp: last.checkpoint, lastAt: last.recordedAt || `${last.date}T${last.time}` })
      const letter = letterNumberingOf(c)
      if (letterNumberingOpen(letter) && (role === 'admin' || isLetterNumberingQueueCase(role, c, orgUnitId))) pending.push({ c, cp: 'letter', lastAt: letter.requestedAt })
      if (isLetterNumberingDoneCase(role, c, orgUnitId)) done.push({ c, cp: 'letter', lastAt: letter!.sentAt })
    }
    done.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)))
    return { pending, done }
  }, [cases, role, orgUnitId])

  const source = tab === 'pending' ? pending : done
  const q = query.trim().toLowerCase()
  const rows = q ? source.filter(({ c }) => c.no.toLowerCase().includes(q) || c.person.toLowerCase().includes(q)) : source

  const tabs = [
    { key: 'pending', label: 'รอลงทะเบียน', count: pending.length },
    { key: 'done', label: 'ลงทะเบียนแล้ว', count: done.length },
  ].map((t) => ({ ...t, id: `saraban-tab-${t.key}`, controls: 'saraban-panel', testId: `saraban-tab-${t.key}` }))

  const open = (caseNo: string) => navigate({ to: '/saraban/$caseNo', params: { caseNo } })

  const emptyText = source.length === 0
    ? tab === 'pending' ? 'ไม่มีแฟ้มรอลงทะเบียนสารบรรณในขณะนี้' : 'ยังไม่มีแฟ้มที่ลงทะเบียนสารบรรณแล้ว'
    : 'ไม่พบรายการที่ตรงกับคำค้นหา'

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="งานธุรการ"
        title="ทะเบียนสารบรรณ"
        description="ลงเลขทะเบียนรับ-ส่ง วันที่ และเวลา ของ คบ. ทุกฉบับ และออกเลขหนังสือประสานขาออก ก่อนหนังสือเดินทางต่อ"
      />
      <SegmentedTabs ariaLabel="สถานะงานทะเบียนสารบรรณ" items={tabs} value={tab} onChange={(k) => setTab(k as TabKey)} />
      <section id="saraban-panel" role="tabpanel" aria-labelledby={`saraban-tab-${tab}`} className="ws-card overflow-hidden" data-testid="saraban-panel">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="text-[1rem] font-bold text-navy">{tab === 'pending' ? 'แฟ้มรอลงทะเบียน' : 'แฟ้มที่ลงทะเบียนแล้ว'}</h2>
            <span className="text-[0.8rem] text-muted">{rows.length} รายการ</span>
          </div>
          <div className="ws-field w-full sm:w-72">
            <label htmlFor="saraban-search">ค้นหา</label>
            <input id="saraban-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="เลขคำร้อง หรือชื่อผู้ขอรับความคุ้มครอง" className="ws-input w-full" />
          </div>
        </div>
        {rows.length === 0 ? (
          <p data-testid="saraban-empty" className="p-8 text-center text-[0.88rem] text-muted">
            <i className="fa-solid fa-folder-open mb-2 block text-3xl" aria-hidden="true" />{emptyText}
          </p>
        ) : (
          <div className="ws-table-wrap">
            <table className="ws-table min-w-[820px]" data-testid="saraban-table">
              <thead>
                <tr>
                  <th>เลขคำร้อง</th>
                  <th>ผู้ขอรับความคุ้มครอง</th>
                  <th>จุดลงทะเบียน</th>
                  <th>ความคืบหน้า</th>
                  <th>ส่งจาก</th>
                  <th>วันที่ล่าสุด</th>
                  <th className="text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, cp, lastAt }) => {
                  const letter = cp === 'letter' ? letterNumberingOf(c) : undefined
                  const progress = cp === 'police' || cp === 'letter' || cp === 'kb10-dispatch' ? undefined : sarabanCheckpointProgress(c, cp)
                  const lastRec = (c.sarabanRecords || []).at(-1)
                  const isPending = tab === 'pending'
                  return (
                    <tr
                      key={`${c.no}-${cp}`}
                      tabIndex={0}
                      data-testid={`saraban-row-${c.no}`}
                      className="cursor-pointer transition hover:bg-soft focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
                      onClick={() => open(c.no)}
                      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c.no) } }}
                    >
                      <td className="font-bold text-blue-700 whitespace-nowrap">{c.no}</td>
                      <td><strong className="block break-words font-semibold text-ink">{c.person}</strong></td>
                      <td>{cp === 'police' ? c.policeLetters?.revisionStage === 'awaiting_dispatch' ? 'ส่งคืนหนังสือตำรวจฉบับแก้ไขที่ลงนามแล้ว' : 'เตรียมเลขหนังสือตำรวจสองฉบับก่อนลงนาม' : cp === 'kb10-dispatch' ? 'ออกเลขและนำส่ง คบ.10 ให้พยาน' : letter ? 'ขาออก · หนังสือประสานวิธีที่ 4' : SARABAN_CHECKPOINT_META[cp as SarabanCheckpoint].short}</td>
                      <td>
                        {cp === 'police' ? <Badge variant="warning">{c.policeLetters?.revisionStage === 'awaiting_dispatch' ? 'รอส่งคืนหน่วยงาน' : 'รอเตรียมเลขก่อนลงนาม'}</Badge> : cp === 'kb10-dispatch' ? <Badge variant={isPending ? 'warning' : 'success'}>{c.resultNotices?.[10]?.status === 'sent' ? 'นำส่งแล้ว' : c.kb10DispatchNumbering ? 'รอนำส่ง' : 'รอออกเลข'}</Badge> : letter ? (
                          <Badge variant={letter.status === 'pending' ? 'warning' : 'success'} className="whitespace-nowrap">{LETTER_NUMBERING_STATUS[letter.status]}</Badge>
                        ) : (
                          <Badge variant={progress!.complete ? 'success' : 'warning'} className="whitespace-nowrap">
                            {progress!.done.length}/{progress!.recipients.length} ผู้รับ
                          </Badge>
                        )}
                      </td>
                      <td className="text-[0.88rem]">{cp === 'police' || cp === 'kb10-dispatch' ? 'เลขาธิการ' : letter ? letter.requestedBy : sarabanRouteFor(c, cp as SarabanCheckpoint)[0]}</td>
                      <td className="whitespace-nowrap text-[0.88rem]">{letter ? formatThaiDate(lastAt || letter.requestedAt) : lastRec ? formatSarabanDate(lastRec.date) : formatThaiDate(c.createdAt)}</td>
                      <td className="text-right">
                        <Link
                          to="/saraban/$caseNo"
                          params={{ caseNo: c.no }}
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[0.85rem] font-semibold transition ${isPending ? 'bg-navy text-white hover:bg-blue' : 'border border-[#9aabba] bg-white text-navy hover:bg-slate-50'}`}
                        >
                          <i className={`fa-solid ${isPending ? 'fa-stamp' : 'fa-eye'} text-xs`} aria-hidden="true" />
                          {!isPending ? 'ดู' : cp === 'kb10-dispatch' ? (c.kb10DispatchNumbering ? 'นำส่ง' : 'ออกเลข') : letter ? (letter.status === 'pending' ? 'ออกเลข' : 'นำส่ง') : 'ลงทะเบียน'}
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
