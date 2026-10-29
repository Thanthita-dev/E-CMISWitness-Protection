import { useAuthStore } from '../../store/useAuthStore'
import { canViewHandoffCase } from '../../lib/protectionHandoff'
import React from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useCaseStore } from '../../store/useCaseStore'
import { CoordinationSigningWorkspace } from '../../components/protection/CoordinationSigningWorkspace'
export const Route = createFileRoute('/coordination/$caseNo')({
  validateSearch: (s: Record<string, unknown>): { document: 'station' | 'national' | 'agency' } => ({ document: s.document === 'national' || s.document === 'agency' ? s.document : 'station' }),
  component: Page,
})
function Page() {
  const { caseNo } = Route.useParams(), { document } = Route.useSearch(), navigate = Route.useNavigate()
  const c = useCaseStore(s => s.cases.find(c => c.no === caseNo))
  const auth = useAuthStore()
  if (c && !canViewHandoffCase(auth.currentRole, c, auth.currentOfficerUserId)) return <p>ไม่มีสิทธิ์เปิดเอกสารของแฟ้มนี้</p>
  if (!c) return <p>ไม่พบแฟ้มคำร้อง</p>
  return <CoordinationSigningWorkspace key={`${caseNo}:${document}`} caseItem={c} document={document} onBack={() => navigate({ to: '/dossier/$caseNo', params: { caseNo } })} />
}
