import { PoliceLetterBundlePanel } from '../../components/protection/PoliceLetterBundlePanel'
import { isPoliceQueueCase } from '../../lib/policeLetterActions'
import { useAuthStore } from '../../store/useAuthStore'
import { createFileRoute, Link, useNavigate, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DocumentPageHead } from '../../components/forms/DocumentWorkspace'
import { Kb10DispatchWorkspace } from '../../components/saraban/Kb10DispatchWorkspace'
import { SarabanWorkspace } from '../../components/saraban/SarabanWorkspace'
import { useCaseStore } from '../../store/useCaseStore'
import { CoordinationLetterNumberingWorkspace } from '../../components/saraban/CoordinationLetterNumberingWorkspace'
import { letterNumberingOf } from '../../lib/coordinationLetterNumbering'
import { SARABAN_CHECKPOINT_META, activeSarabanCheckpoint, sarabanCheckpointLabel } from '../../lib/saraban'

export const Route = createFileRoute('/saraban/$caseNo')({ component: SarabanCasePage })

function SarabanCasePage() {
  const { caseNo } = useParams({ from: '/saraban/$caseNo' })
  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo))
  const navigate = useNavigate()
  const role = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId)

  if (!caseItem) {
    return (
      <div className="space-y-4">
        <BackLink to="/saraban">กลับทะเบียนสารบรรณ</BackLink>
        <div className="ws-card p-8 text-center">
          <h1 className="text-[1.1rem] font-bold text-navy">ไม่พบข้อมูลแฟ้มคำร้อง {caseNo}</h1>
        </div>
      </div>
    )
  }

  const checkpoint = activeSarabanCheckpoint(caseItem)
  const policeTask = !checkpoint && isPoliceQueueCase(role, caseItem, orgUnitId)
  const title = !checkpoint ? 'ทะเบียนรับ-ส่งเอกสาร'
    : SARABAN_CHECKPOINT_META[checkpoint].direction === 'incoming' ? 'ลงรับเรื่องคุ้มครองพยาน' : 'ออกเลขส่งเรื่องคุ้มครองพยาน'

  return (
    <div className="space-y-3">
      <DocumentPageHead
        title={title}
        meta={<span className="break-words">{caseItem.person} · {caseItem.no}{checkpoint ? ` · ${sarabanCheckpointLabel(caseItem, checkpoint)}` : ''}</span>}
        actions={<Link to="/saraban" className="inline-flex min-h-[44px] items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50">กลับ</Link>}
      />
      <Kb10DispatchWorkspace caseItem={caseItem} />
      {policeTask && <PoliceLetterBundlePanel caseItem={caseItem} />}
      {letterNumberingOf(caseItem) && <CoordinationLetterNumberingWorkspace caseItem={caseItem} onSubmitted={() => { void navigate({ to: '/saraban' }) }} />}
      {/** แฟ้มที่มีเฉพาะงานออกเลขหนังสือประสาน ไม่ต้องแสดงกล่อง "ไม่มีงานลงทะเบียนค้าง" ของชุด คบ. */}
      {!policeTask && (checkpoint || (!(caseItem.activity7State === 'rejected' && caseItem.resultNotices?.[10]?.original) && (!letterNumberingOf(caseItem) || caseItem.sarabanRecords?.length))) && (
        <SarabanWorkspace caseItem={caseItem} onSubmitted={() => { void navigate({ to: '/saraban' }) }} />
      )}
    </div>
  )
}
