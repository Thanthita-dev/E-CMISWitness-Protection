import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { Badge } from '../components/common/Badge'
import { useCaseStore } from '../store/useCaseStore'
import { formatThaiDate } from '../lib/utils'

export const Route = createFileRoute('/activity7-results')({
  component: Activity7ResultsPage,
})

function Activity7ResultsPage() {
  const cases = useCaseStore((state) => state.cases)

  // Cases with activity 7 interaction or secretary decisions
  const a7Cases = cases.filter((c) => c.stage === 'external_pending' || c.activity7State || c.secretaryReviewState)

  const approvedCases = cases.filter((c) => c.activity7State === 'approved')
  const rejectedCases = cases.filter((c) => c.activity7State === 'rejected')
  const returnedCases = cases.filter((c) => c.activity7State === 'returned')
  /** WIT0713 — แขนงที่ 4 ของผลพิจารณา: เห็นควรดำเนินการตามข้อ 14 (ไปแท็บ 08C) */
  const article14Cases = cases.filter((c) => c.activity7State === 'article14')
  const pendingCases = cases.filter((c) => c.stage === 'external_pending')

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · ผลพิจารณาและคำสั่ง"
        title="ผลพิจารณาและคำสั่ง (เลขาธิการ ป.ป.ท. / กิจกรรมที่ 7)"
        description="ติดตามผลการพิจารณาคำขอคุ้มครองพยาน 4 แขนง — อนุมัติ · ไม่อนุมัติ · ส่งกลับ/ขอข้อมูลเพิ่ม · เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ"
      />

      {/* KPI Stats */}
      <StatGrid>
        <StatCard label="รอผลพิจารณา" value={pendingCases.length} subtext="อยู่ระหว่างตรวจทาน" variant="warning" />
        <StatCard label="อนุมัติให้ความคุ้มครอง" value={approvedCases.length} subtext="มีคำสั่งอนุมัติแล้ว" variant="success" />
        <StatCard label="ไม่อนุมัติ" value={rejectedCases.length} subtext="รอจัดทำ คบ.10 แจ้งผล" variant="danger" />
        <StatCard label="ส่งกลับแก้ไข" value={returnedCases.length} subtext="แก้ไขตามข้อสั่งการ" variant="gold" />
        <StatCard label="เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ" value={article14Cases.length} subtext="ส่งเรื่องไปดำเนินการต่อแล้ว" variant="default" />
      </StatGrid>

      {/* Results Table Card */}
      <div className="ws-card overflow-hidden">
        <div className="border-b border-line p-4 sm:px-6">
          <h2 className="text-[1.1rem] font-bold leading-snug text-navy">รายการผลพิจารณาและคำสั่ง</h2>
          <p className="text-[0.8rem] text-muted">พบทั้งหมด {a7Cases.length} รายการ</p>
        </div>

        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>เลขคำร้อง</th>
                <th>ผู้ขอรับการคุ้มครอง</th>
                <th>ผลพิจารณา / คำสั่ง</th>
                <th>เลขที่คำสั่ง / วันที่</th>
                <th>ขั้นตอนถัดไป</th>
                <th className="text-right">เปิดดู</th>
              </tr>
            </thead>
            <tbody>
              {a7Cases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    ไม่พบรายการผลพิจารณา
                  </td>
                </tr>
              ) : (
                a7Cases.map((c) => (
                  <tr key={c.no} className="hover:bg-soft transition">
                    <td className="font-bold text-blue-700">
                      <Link to="/dossier/$caseNo" params={{ caseNo: c.no }}>
                        {c.no}
                      </Link>
                    </td>

                    <td>
                      <strong className="block text-ink">{c.person}</strong>
                      <small className="text-[0.8rem] text-muted">{c.mainCaseNo || 'กบค. 001/2569'}</small>
                    </td>

                    <td>
                      {c.activity7State === 'approved' ? (
                        <Badge variant="success" icon="fa-circle-check">
                          อนุมัติให้ความคุ้มครอง
                        </Badge>
                      ) : c.activity7State === 'rejected' ? (
                        <Badge variant="danger" icon="fa-circle-xmark">
                          ไม่อนุมัติ
                        </Badge>
                      ) : c.activity7State === 'returned' ? (
                        <Badge variant="warning" icon="fa-rotate-left">
                          ส่งกลับแก้ไข
                        </Badge>
                      ) : c.activity7State === 'article14' ? (
                        <Badge variant="info" icon="fa-building-columns">
                          เห็นควรส่งต่อกรมคุ้มครองสิทธิฯ
                        </Badge>
                      ) : (
                        <Badge variant="info" icon="fa-clock">
                          รอผลพิจารณา
                        </Badge>
                      )}
                    </td>

                    <td>
                      <div className="font-semibold text-ink">{c.decisionNumber || c.externalReference || '-'}</div>
                      <small className="text-[0.8rem] text-muted">{c.resultAt || formatThaiDate(c.createdAt)}</small>
                    </td>

                    <td className="max-w-xs text-ink font-medium">
                      {c.next}
                    </td>

                    <td className="text-right">
                      <Link
                        to="/dossier/$caseNo"
                        params={{ caseNo: c.no }}
                        className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
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
