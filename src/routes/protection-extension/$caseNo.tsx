import React from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { Kb14Section } from '../../components/protection/Kb14Section'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { formatThaiDate } from '../../lib/utils'
import { CaseLockScope } from '../../components/common/CaseLockScope'

export const Route = createFileRoute('/protection-extension/$caseNo')({
  component: ProtectionExtensionPage,
})

/**
 * แท็บ 11B — ขยายระยะเวลาการคุ้มครอง (คบ.14)
 * รับงานต่อจาก 11A เมื่อแนวทางที่เลือกคือ "ขยายเวลา" (WIT1109 → WIT1112)
 */
function ProtectionExtensionPage() {
  const { caseNo } = useParams({ from: '/protection-extension/$caseNo' })
  const { currentRole } = useAuthStore()
  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo))

  if (!caseItem) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-lg font-bold text-slate-700">ไม่พบข้อมูลแฟ้มคำร้อง {caseNo}</h2>
        <Link to="/protection-reviews" className="text-sm font-semibold text-blue mt-2 inline-block hover:underline">
          กลับรายการทบทวน
        </Link>
      </div>
    )
  }

  return (
    <CaseLockScope caseItem={caseItem} className="space-y-6">
      <BackLink to="/protection-duration" search={{ caseNo }}>กลับระยะเวลาคุ้มครอง</BackLink>

      <DetailHeaderCard
        kicker="ขยายระยะเวลาการคุ้มครอง"
        refNo={caseItem.no}
        title={`ขอขยายเวลา คบ.14 · ${caseItem.person}`}
        meta={[`คำสั่งเดิมสิ้นสุด ${formatThaiDate(caseItem.protectionEndAt)}`]}
        status={<span className="ws-status">{caseItem.status}</span>}
        owner={`ผู้รับผิดชอบ: ${caseItem.owner}`}
      />

      <Kb14Section caseItem={caseItem} role={currentRole} />

    </CaseLockScope>
  )
}
