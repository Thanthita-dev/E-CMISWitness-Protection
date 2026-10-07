import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { BackLink } from '../components/common/BackLink'
import { PageHeader } from '../components/common/PageHeader'
import { Badge } from '../components/common/Badge'
import { useCaseStore } from '../store/useCaseStore'
import { Kb13MonitorPanel } from '../components/protection/Kb13MonitorPanel'
import { kb13DueStatus } from '../lib/kb13'
import { formatThaiDate } from '../lib/utils'
import { CaseLockScope } from '../components/common/CaseLockScope'

interface MonitorSearch {
  caseNo?: string
}

export const Route = createFileRoute('/protection-monitor')({
  validateSearch: (search: Record<string, unknown>): MonitorSearch => ({
    caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined,
  }),
  /** ไม่มี caseNo — แสดงรายการสำนวนที่ต้องรายงาน คบ.13 ที่หน้านี้เลย (เมนู 'รายงานผลการคุ้มครอง (คบ.13)' ต้องเปิดหน้ารายงาน ไม่เด้งไปภาพรวม) */
  component: ProtectionMonitorPage,
})

/**
 * หน้าแท็บ 10 — ติดตามและรายงานผลการคุ้มครอง (คบ.13) รายสำนวน
 *
 * ต่อจากทุกวิธีในหน้า 08A/08B ที่กดเริ่มปฏิบัติจริงแล้ว (WIT0821/0829/0837/0851)
 * ไม่มี caseNo ใน URL จะเด้งกลับไปหน้ารวมทุกสำนวนที่ /protection ให้เลือกสำนวนจากที่นั่น
 */
function ProtectionMonitorPage() {
  const { caseNo } = Route.useSearch()
  const cases = useCaseStore((s) => s.cases)
  const caseItem = cases.find((c) => c.no === caseNo)

  /**
   * ถึงตรงนี้โดยไม่มี caseNo ได้เฉพาะบทบาทที่ไม่มีสิทธิ์หน้ารวม '/protection' (เช่น ผบช.ชั้นต้น)
   * จึงต้องมีรายการให้เลือกสำนวนไว้ที่นี่ ไม่งั้นจะไม่มีทางเข้าถึงแท็บ 10 ของตนเลย
   */
  if (!caseNo) {
    const monitorCases = cases.filter((c) => c.stage === 'protection')
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="งานคุ้มครองพยาน · ติดตามผล (คบ.13)"
          title="ติดตามและรายงานผลการคุ้มครอง (คบ.13)"
          description="เลือกสำนวนที่อยู่ระหว่างการคุ้มครองเพื่อตรวจและลงความเห็นในรายงานประจำรอบ"
        />
        {monitorCases.length === 0 ? (
          <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
            ยังไม่มีสำนวนที่อยู่ระหว่างการคุ้มครอง
          </div>
        ) : (
          <ul className="ws-card divide-y divide-slate-200 overflow-hidden">
            {monitorCases.map((c) => (
              <li key={c.no}>
                <Link
                  to="/protection-monitor"
                  search={{ caseNo: c.no }}
                  className="flex min-h-[44px] items-center justify-between gap-4 px-5 py-4 text-sm transition hover:bg-slate-50"
                >
                  <span className="font-semibold text-slate-800">{c.no}</span>
                  <span className="min-w-0 text-muted">{c.person}</span>
                  <i className="fa-solid fa-chevron-right text-[0.8rem] text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    )
  }

  if (!caseItem) {
    return (
      <div className="space-y-6">
        <BackLink to="/protection">กลับคุ้มครองและติดตาม</BackLink>
        <div className="ws-card border-dashed p-10 text-center text-[0.88rem] text-muted">
          ไม่พบสำนวนที่ระบุ — กรุณาเลือกสำนวนจากหน้า{' '}
          <Link to="/protection" className="font-semibold text-blue-700 underline">
            คุ้มครองและติดตาม
          </Link>
        </div>
      </div>
    )
  }

  const status = kb13DueStatus(caseItem)

  return (
    <CaseLockScope caseItem={caseItem} className="space-y-6">
      <BackLink to="/protection">กลับคุ้มครองและติดตาม</BackLink>

      <PageHeader
        eyebrow={`งานคุ้มครองพยาน · ติดตามผล (คบ.13) · ${caseItem.no}`}
        title="ติดตามและรายงานผลการคุ้มครอง (คบ.13)"
        description={`${caseItem.no} · ${caseItem.person} — สะสม ${status.episode.cumulative} วัน คงเหลือ ${status.episode.remaining} จากเพดาน ${status.episode.cap} วัน`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {status.dueAt && (
              <Badge variant={status.overdue ? 'danger' : status.due ? 'warning' : 'success'}>
                รอบถัดไป {formatThaiDate(status.dueAt)}
              </Badge>
            )}
            <Link
              to="/protection-methods"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-4 py-2.5 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-diagram-project" />
              หน้าดำเนินการตามวิธีคุ้มครอง
            </Link>
            <Link
              to="/dossier/$caseNo"
              params={{ caseNo: caseItem.no }}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-4 py-2.5 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
            >
              <i className="fa-solid fa-folder-open" />
              เปิดแฟ้ม
            </Link>
          </div>
        }
      />

      <Kb13MonitorPanel caseItem={caseItem} />
    </CaseLockScope>
  )
}
