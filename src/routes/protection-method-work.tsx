import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { BackLink } from '../components/common/BackLink'
import { PageHeader } from '../components/common/PageHeader'
import { CaseLockScope } from '../components/common/CaseLockScope'
import { CaseMethodPanel } from './protection-methods'
import { useCaseStore } from '../store/useCaseStore'
import { useAuthStore } from '../store/useAuthStore'
import { visibleOperationCase } from '../lib/protectionHandoff'

export const Route = createFileRoute('/protection-method-work')({
  validateSearch: (search: Record<string, unknown>): { caseNo?: string } => ({ caseNo: typeof search.caseNo === 'string' ? search.caseNo : undefined }),
  component: ProtectionMethodWorkPage,
})
function ProtectionMethodWorkPage() {
  const { caseNo } = Route.useSearch()
  const cases = useCaseStore((s) => s.cases)
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const c = cases.find((c) => c.no === caseNo && visibleOperationCase(currentRole, c, currentOfficerUserId) &&
    (c.kb5Approved || c.activity7State === 'approved' || c.stage === 'method_operation' || c.stage === 'protection') &&
    !['terminated', 'transferred', 'withdrawn'].includes(c.stage))
  return <div className="space-y-5">
    <BackLink to="/protection-methods">กลับรายการงานตามวิธีคุ้มครอง</BackLink>
    <PageHeader eyebrow="งานคุ้มครองพยาน · งานรายเคส" title="ดำเนินการตามวิธีคุ้มครอง" />
    {c ? <CaseLockScope caseItem={c}><CaseMethodPanel caseItem={c} readOnly={currentRole === 'protection'} /></CaseLockScope> : <div className="ws-card p-6 text-muted">ไม่พบงานที่เปิดดำเนินการได้</div>}
  </div>
}
