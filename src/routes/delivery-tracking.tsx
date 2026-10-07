import React from 'react'
import { visibleOperationCase } from '../lib/protectionHandoff'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { SegmentedTabs } from '../components/common/SegmentedTabs'
import { Badge } from '../components/common/Badge'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { CaseItem } from '../types/case'
import { formatThaiDateTime } from '../lib/utils'

export const Route = createFileRoute('/delivery-tracking')({ component: DeliveryTrackingPage })

type WorkStatus = 'pending' | 'receipt' | 'agreement' | 'done'
const STATUS_LABELS: Record<WorkStatus, string> = {
  pending: 'รอนำส่ง', receipt: 'รอบันทึกรับแจ้ง', agreement: 'รอลงนาม คบ.11', done: 'เสร็จแล้ว',
}
const workStatus = (c: CaseItem): WorkStatus => {
  if (!c.dispatchedAt) return 'pending'
  if (!c.deliveredAt || !c.deliveryRecipient || !c.deliveryAckType) return 'receipt'
  if (c.activity7State === 'approved' && !c.kb11Signed) return 'agreement'
  return 'done'
}
const ACTION_LABELS: Record<WorkStatus, string> = {
  pending: 'เตรียมและนำส่ง', receipt: 'บันทึกการรับแจ้ง', agreement: 'ลงนาม คบ.11', done: 'เปิดแฟ้ม',
}

function DeliveryTrackingPage() {
  const cases = useCaseStore((state) => state.cases)
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const [tab, setTab] = React.useState('all')
  const jobs = cases.filter((c) => visibleOperationCase(currentRole, c, currentOfficerUserId) &&
    (c.dispatchedAt || c.activity7State === 'approved' || c.activity7State === 'rejected'))
  const rows = jobs.filter((c) => tab === 'all' || workStatus(c) === tab)
  const tabs = [
    { key: 'all', label: 'ทั้งหมด', count: jobs.length },
    ...Object.entries(STATUS_LABELS).map(([key, label]) => ({ key, label, count: jobs.filter((c) => workStatus(c) === key).length })),
  ].map((item) => ({ ...item, id: `delivery-tab-${item.key}`, controls: 'delivery-work-panel' }))

  return <div className="space-y-5">
    <PageHeader eyebrow="งานคุ้มครองพยาน" title="งานนำส่งหนังสือแจ้งผล"
      description="นำส่ง คบ.9 / คบ.10 บันทึกการรับแจ้ง และติดตามการลงนามข้อตกลง คบ.11" />
    <SegmentedTabs ariaLabel="สถานะงานนำส่งหนังสือ" items={tabs} value={tab} onChange={setTab} />
    <section id="delivery-work-panel" role="tabpanel" aria-labelledby={`delivery-tab-${tab}`} className="ws-card overflow-hidden" data-testid="delivery-work-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line p-4">
        <h2 className="text-[1rem] font-bold text-navy">{tab === 'all' ? 'รายการงานทั้งหมด' : STATUS_LABELS[tab as WorkStatus]}</h2>
        <span className="text-[0.8rem] text-muted">{rows.length} รายการ</span>
      </div>
      {rows.length === 0 ? <p className="p-8 text-center text-[0.88rem] text-muted">ไม่มีงานในสถานะนี้</p> :
        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead><tr><th scope="col">เลขคำร้อง / พยาน</th><th scope="col">หนังสือ</th><th scope="col">ช่องทาง / เลขติดตาม</th><th scope="col">วันที่พยานได้รับ</th><th scope="col">สถานะงาน</th><th scope="col">ดำเนินการ</th></tr></thead>
            <tbody>{rows.map((c) => {
              const status = workStatus(c)
              const formNo = c.activity7State === 'rejected' ? '10' : '9'
              return <tr key={c.no}>
                <td><Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="font-semibold text-navy hover:underline">{c.no}</Link><p className="mt-1 text-[0.8rem] text-muted">{c.person}</p></td>
                <td>คบ.{formNo}</td>
                <td><span>{c.dispatchChannel || 'ยังไม่เลือกช่องทาง'}</span>{c.dispatchTracking && <p className="mt-1 text-[0.8rem] text-muted">{c.dispatchTracking}</p>}</td>
                <td>{c.deliveredAt ? formatThaiDateTime(c.deliveredAt) : 'ยังไม่บันทึก'}</td>
                <td><Badge variant={status === 'done' ? 'success' : 'warning'}>{STATUS_LABELS[status]}</Badge></td>
                <td>{status !== 'done' ?
                  <Link to="/form/$formId" params={{ formId: status === 'agreement' ? '11' : formNo }} search={{ caseNo: c.no }} hash={status === 'agreement' ? undefined : 'notice-dispatch'} className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-line px-3 py-2 font-semibold text-navy hover:bg-soft">{ACTION_LABELS[status]}</Link> :
                  <Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="inline-flex min-h-[44px] items-center whitespace-nowrap rounded-lg border border-line px-3 py-2 font-semibold text-navy hover:bg-soft">{ACTION_LABELS[status]}</Link>}
                </td>
              </tr>
            })}</tbody>
          </table>
        </div>}
    </section>
  </div>
}
