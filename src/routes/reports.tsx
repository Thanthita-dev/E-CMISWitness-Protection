import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { useCaseStore } from '../store/useCaseStore'

export const Route = createFileRoute('/reports')({
  component: ReportsPage,
})

function ReportsPage() {
  const cases = useCaseStore((state) => state.cases)

  const normalCount = cases.filter((c) => !c.urgent).length
  const urgentCount = cases.filter((c) => c.urgent).length
  const highRiskCount = cases.filter((c) => c.risk === 'สูง' || c.risk === 'วิกฤต').length

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · รายงานและสถิติ"
        title="รายงานและสถิติการคุ้มครองพยาน"
        description="สถิติภาพรวมการรับคำร้อง การประเมินความเสี่ยง การอนุมัติมาตรการ และการปฏิบัติตามกรอบเวลา (SLA)"
      />

      {/* KPI Overview */}
      <StatGrid>
        <StatCard label="คำร้องทั้งหมดในปีนี้" value={cases.length} subtext="คดีคุ้มครองพยาน" />
        <StatCard label="กรณีจำเป็นเร่งด่วน" value={urgentCount} subtext="มีคำสั่งคุ้มครองชั่วคราว" variant="danger" />
        <StatCard label="ความเสี่ยงสูง/วิกฤต" value={highRiskCount} subtext="จัดชุดคุ้มครองพิเศษ" variant="warning" />
        <StatCard label="ความสำเร็จตาม SLA" value="96.5%" subtext="ดำเนินการทันเวลา" variant="success" />
      </StatGrid>

      {/* Statistical Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Risk Level Distribution */}
        <div className="ws-card p-5 space-y-4">
          <h2 className="text-[1.1rem] font-bold leading-snug text-navy border-b border-line pb-2">
            สัดส่วนการจำแนกระดับความเสี่ยงภัยคุกคาม
          </h2>
          <div className="space-y-3 text-[0.88rem]">
            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-ink">วิกฤต (Critical)</span>
                <span className="font-bold text-danger">
                  {cases.filter((c) => c.risk === 'วิกฤต').length} รายการ
                </span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full bg-rose-600 rounded-full" style={{ width: '25%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-ink">สูง (High)</span>
                <span className="font-bold text-warning">
                  {cases.filter((c) => c.risk === 'สูง').length} รายการ
                </span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full bg-gold rounded-full" style={{ width: '55%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-ink">ปานกลาง (Medium)</span>
                <span className="font-bold text-blue">
                  {cases.filter((c) => c.risk === 'ปานกลาง').length} รายการ
                </span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full bg-blue rounded-full" style={{ width: '15%' }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between mb-1">
                <span className="font-semibold text-ink">ต่ำ (Low)</span>
                <span className="font-bold text-success">
                  {cases.filter((c) => c.risk === 'ต่ำ').length} รายการ
                </span>
              </div>
              <div className="h-2 rounded-full bg-soft overflow-hidden">
                <div className="h-full bg-success rounded-full" style={{ width: '5%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Channel Distribution */}
        <div className="ws-card p-5 space-y-4">
          <h2 className="text-[1.1rem] font-bold leading-snug text-navy border-b border-line pb-2">
            ช่องทางการรับคำร้อง (คบ.1 vs คบ.2)
          </h2>
          <div className="space-y-4 text-[0.88rem]">
            <div className="rounded-lg border border-line bg-blue-soft p-4">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-[0.88rem] font-bold text-navy">ยื่นด้วยตนเอง (แบบ คบ.1)</strong>
                  <div className="text-muted text-[0.8rem]">พยานมาบันทึกและลงนามคำร้องโดยตรง</div>
                </div>
                <span className="text-xl font-bold text-blue">{normalCount}</span>
              </div>
            </div>

            <div className="rounded-lg border border-gold/40 bg-warning-soft/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <strong className="text-[0.88rem] font-bold text-warning">ผ่านช่องทางสื่อสาร (แบบ คบ.2)</strong>
                  <div className="text-muted text-[0.8rem]">โทรศัพท์สายด่วน 1206 / อีเมล / โทรสาร</div>
                </div>
                <span className="text-xl font-bold text-warning">{urgentCount}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
