import { noticeForCase, NOTICE_STATUS_LABELS } from '../lib/noticeDocuments'
import React, { useState } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { SegmentedTabs } from '../components/common/SegmentedTabs'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { Badge } from '../components/common/Badge'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { canAccessRoute } from '../lib/permissions'
import { formatThaiDate } from '../lib/utils'
import { visibleOperationCase } from '../lib/protectionHandoff'

export const Route = createFileRoute('/notice')({
  component: NoticePage,
})

const CHANNEL_TABS = [
  { key: 'all', label: 'ทุกช่องทางนำส่ง', icon: 'fa-list' },
  { key: 'ไปรษณีย์ตอบรับด่วน (EMS)', label: 'ไปรษณีย์ตอบรับด่วน (EMS)', icon: 'fa-envelope-circle-check' },
  { key: 'ส่งมอบโดยตรงถึงตัวพยาน', label: 'ส่งมอบโดยตรงถึงตัวพยาน', icon: 'fa-handshake' },
  { key: 'สื่ออิเล็กทรอนิกส์ / ระบบ ป.ป.ท.', label: 'สื่ออิเล็กทรอนิกส์ / ระบบ ป.ป.ท.', icon: 'fa-at' },
]

/** แท็บเชื่อมสองหน้าของงานเดียวกัน — ก่อนนำส่ง (แจ้งผล) กับระหว่าง/หลังนำส่ง (ติดตามพัสดุ) */
const WORKFLOW_TABS = [
  { to: '/notice', label: 'แจ้งผล (ก่อนนำส่ง)' },
  { to: '/delivery-tracking', label: 'การนำส่งและติดตาม' },
] as const

const WorkflowTabs: React.FC<{ current: string }> = ({ current }) => {
  const currentRole = useAuthStore((s) => s.currentRole)
  const visibleTabs = WORKFLOW_TABS.filter((tab) => canAccessRoute(currentRole, tab.to))

  if (visibleTabs.length < 2) return null

  return (
    <div className="flex flex-wrap gap-2 border-b border-line pb-2">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className={`inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-[0.68rem] text-[0.88rem] font-semibold transition ${
            tab.to === current ? 'bg-navy text-white' : 'border border-[#9aabba] bg-white text-navy hover:bg-slate-50'
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  )
}

function NoticePage() {
  const cases = useCaseStore((state) => state.cases)
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const [selectedChannel, setSelectedChannel] = useState('all')

  const noticeCases = cases.filter(
    (c) => visibleOperationCase(currentRole, c, currentOfficerUserId) && (c.stage === 'notice' || c.activity7State === 'approved' || c.activity7State === 'rejected')
  )

  const visibleCases =
    selectedChannel === 'all' ? noticeCases : noticeCases.filter((c) => c.dispatchChannel === selectedChannel)

  const pendingDispatch = noticeCases.filter((c) => !c.dispatchedAt)
  const inTransit = noticeCases.filter((c) => c.dispatchedAt && !c.deliveredAt)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · แจ้งผลแก่พยาน"
        title="การแจ้งผลการพิจารณาแก่ผู้ขอรับการคุ้มครอง / พยาน"
        description="กรณีอนุมัติ: คบ.9 (แจ้งตอบรับถึงพยาน) · คบ.11 (ข้อตกลงและเงื่อนไข) — กรณีไม่อนุมัติ: คบ.10 พร้อมสิทธิอุทธรณ์ 30 วันนับแต่วันที่พยานได้รับหนังสือ (คบ.8 คำสั่งชุดคุ้มครองจัดทำในขั้นดำเนินการตามวิธีคุ้มครอง หลังลงนาม คบ.11)"
      />

      <WorkflowTabs current="/notice" />

      {/* KPI Band */}
      <StatGrid>
        <StatCard label="หนังสือแจ้งผลทั้งหมด" value={noticeCases.length} subtext="คบ.9 / คบ.10 / คบ.11" />
        <StatCard
          label="แจ้งผลอนุมัติ"
          value={noticeCases.filter((c) => c.activity7State === 'approved').length}
          subtext="คบ.9 / คบ.11"
          variant="success"
        />
        <StatCard
          label="แจ้งไม่อนุมัติ (คบ.10)"
          value={noticeCases.filter((c) => c.activity7State === 'rejected').length}
          subtext="แจ้งสิทธิอุทธรณ์ 30 วัน"
          variant="danger"
        />
        <StatCard
          label="รอนำส่ง / อยู่ระหว่างจัดส่ง"
          value={pendingDispatch.length + inTransit.length}
          subtext={`รอส่ง ${pendingDispatch.length} · ระหว่างส่ง ${inTransit.length}`}
          variant="warning"
        />
      </StatGrid>

      {/* Channel Tabs */}
      <SegmentedTabs
        ariaLabel="ช่องทางนำส่ง"
        items={CHANNEL_TABS.map((tab) => ({ key: tab.key, label: tab.label }))}
        value={selectedChannel}
        onChange={setSelectedChannel}
      />

      {/* Notices Table */}
      <div className="ws-card overflow-hidden">
        <div className="ws-section">
          <h2 className="!mb-0">รายการหนังสือแจ้งผลที่ต้องดำเนินการ ({visibleCases.length})</h2>
        </div>

        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>เลขคำร้อง</th>
                <th>ผู้รับหนังสือ (พยาน)</th>
                <th>ประเภทหนังสือ / การลงนาม</th>
                <th>ช่องทางนำส่ง</th>
                <th>สถานะการนำส่ง</th>
                <th className="text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {visibleCases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    ไม่มีหนังสือแจ้งผลในช่องทางนี้
                  </td>
                </tr>
              ) : (
                visibleCases.map((c) => {
                  const isApproved = c.activity7State === 'approved'
                  return (
                    <tr key={c.no} className="hover:bg-slate-50/70">
                      <td className="font-bold text-blue">
                        <Link to="/dossier/$caseNo" params={{ caseNo: c.no }}>
                          {c.no}
                        </Link>
                      </td>

                      <td>
                        <strong className="block text-ink">{c.person}</strong>
                        <small className="text-[0.8rem] text-muted">{c.owner}</small>
                      </td>

                      <td className="space-y-1.5">
                        {isApproved ? (
                          <Badge variant="success">คบ.9 / คบ.11</Badge>
                        ) : (
                          <Badge variant="danger">คบ.10 แจ้งไม่ให้การคุ้มครอง</Badge>
                        )}
                        <div data-testid="notice-list-document-status" className="text-[0.88rem] font-semibold text-navy">{noticeForCase(c) ? NOTICE_STATUS_LABELS[noticeForCase(c)!.status] : 'ข้อมูลจากโฟลว์เดิม'}</div>
                        {/* ลงนามแยกทีละฉบับจากหน้าแบบฟอร์ม จึงแยกสถานะให้เห็นว่าฉบับใดยังค้าง */}
                        <div className="text-[0.8rem]">
                          {isApproved ? (
                            c.kb9Signed ? (
                              <span className="text-success font-semibold">
                                <i className="fa-solid fa-signature mr-1" />
                                เลขาธิการฯ ลงนาม คบ.9 แล้ว
                              </span>
                            ) : (
                              <span className="text-warning font-semibold">
                                <i className="fa-solid fa-clock mr-1" />
                                รอลงนาม คบ.9
                              </span>
                            )
                          ) : c.kb10Signed ? (
                            <span className="text-success font-semibold">
                              <i className="fa-solid fa-signature mr-1" />
                              เลขาธิการฯ ลงนาม คบ.10 แล้ว
                            </span>
                          ) : (
                            <span className="text-warning font-semibold">
                              <i className="fa-solid fa-clock mr-1" />
                              รอเลขาธิการฯ ลงนาม คบ.10
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        {c.dispatchedAt ? (
                          <div className="flex items-start gap-1.5 text-ink">
                            <i className="fa-solid fa-truck-fast text-blue mt-0.5" />
                            <div>
                              <div>{c.dispatchChannel}</div>
                              <div className="text-[0.8rem] text-muted">{c.dispatchTracking}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-muted">ยังไม่ได้นำส่ง</span>
                        )}
                      </td>

                      <td>
                        {c.deliveredAt ? (
                          <>
                            <Badge variant="success" icon="fa-circle-check">
                              พยานได้รับแล้ว
                            </Badge>
                            <div className="text-[0.8rem] text-muted mt-0.5">{formatThaiDate(c.deliveredAt)}</div>
                          </>
                        ) : c.dispatchedAt ? (
                          <Badge variant="warning" icon="fa-clock">
                            อยู่ระหว่างจัดส่ง
                          </Badge>
                        ) : (
                          <Badge variant="default" icon="fa-inbox">
                            รอนำส่ง
                          </Badge>
                        )}
                      </td>

                      <td className="text-right"><div className="flex flex-wrap justify-end gap-2">
                        <Link
                          to="/form/$formId"
                          params={{ formId: isApproved ? '9' : '10' }}
                          search={{ caseNo: c.no }}
                          className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy transition hover:bg-slate-50"
                        >
                          <i className="fa-solid fa-file-lines text-xs" />
                          เปิดหนังสือ
                        </Link>

                        {!c.deliveredAt && (
                          <Link
                            to="/dossier/$caseNo"
                            params={{ caseNo: c.no }}
                            className="inline-flex min-h-[38px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-navy px-3 py-1.5 text-[0.85rem] font-semibold text-white transition hover:bg-blue"
                          >
                            <i className="fa-solid fa-folder-open text-xs" />
                            เปิดแฟ้มเพื่อบันทึกนำส่ง
                          </Link>
                        )}
                      </div></td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
