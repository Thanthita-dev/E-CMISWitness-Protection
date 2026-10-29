import { Kb10ScreeningCard } from '../../components/dossier/Kb10ScreeningCard'
import { AppealIntakeForm } from '../../components/appeal/AppealIntakeForm'
import { noticeWorkerAllowed, noticeForCase } from '../../lib/noticeDocuments'
import { createFileRoute, Link, Navigate, useNavigate, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { Badge } from '../../components/common/Badge'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { formatThaiDate } from '../../lib/utils'
import { showToast } from '../../lib/swal'

export const Route = createFileRoute('/appeal-folder/$caseNo')({
  component: AppealFolderPage,
})

/**
 * หน้ารับคำอุทธรณ์เข้าแฟ้มเดิม (WIT0911-0913) — รับแล้วไปทำงานอุทธรณ์ต่อในแฟ้มคดี (/dossier/:caseNo)
 * หน้าแฟ้มคำอุทธรณ์แยกเดิมถูกยกเลิก แฟ้มที่รับคำอุทธรณ์แล้วจึงพาไปแฟ้มคดีเสมอ
 */
function AppealFolderPage() {
  const { caseNo } = useParams({ from: '/appeal-folder/$caseNo' })
  const { getCase } = useCaseStore()
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const navigate = useNavigate()
  const caseItem = getCase(caseNo)

  if (!caseItem) {
    return (
      <div className="ws-card p-8 text-center">
        <h2 className="text-[1.1rem] font-bold text-navy">ไม่พบแฟ้ม {caseNo}</h2>
        <Link to="/appeal" className="mt-2 inline-block text-[0.88rem] font-semibold text-blue hover:underline">
          ← กลับหน้าอุทธรณ์
        </Link>
      </div>
    )
  }

  if (caseItem.appealFiledAt || caseItem.appealFolder || caseItem.appealResolution) {
    return <Navigate to="/dossier/$caseNo" params={{ caseNo: caseItem.no }} replace />
  }

  const isTermination = Boolean(caseItem.kb17?.deliveredAt)
  const delivered = isTermination ? caseItem.kb17?.deliveredAt : caseItem.deliveredAt
  const eligible = !caseItem.nonApprovalClosedAt && (isTermination || caseItem.activity7State === 'rejected')
  const canReceive = ['receiver', 'got_receiver', 'admin'].includes(currentRole) || ['officer', 'case_owner', 'got_officer'].includes(currentRole) && (!noticeForCase(caseItem) || noticeWorkerAllowed(currentRole, caseItem, currentOfficerUserId))
  return <div className="space-y-5">
    <BackLink to="/appeal">กลับรายการงานอุทธรณ์</BackLink>
    <DetailHeaderCard kicker="อุทธรณ์ · รับคำอุทธรณ์" refNo={caseItem.no} title={caseItem.person}
      meta={[isTermination ? 'คำสั่งยุติ คบ.17' : 'คำสั่งไม่อนุมัติ คบ.10', delivered ? `พยานได้รับหนังสือ ${formatThaiDate(delivered)}` : 'รอพยานได้รับหนังสือ']}
      status={<Badge>{delivered ? 'รอรับคำอุทธรณ์' : 'รอบันทึกการรับหนังสือ'}</Badge>} />
    {eligible && delivered && canReceive ? <div className="ws-card p-5">
      <AppealIntakeForm caseItem={caseItem} submitLabel="รับคำร้องอุทธรณ์เข้าระบบ"
        onSubmit={(reason, intake, lateReason) => {
          try {
            const saved = useCaseStore.getState().fileAppeal(caseItem.no, reason, intake, { against: isTermination ? 'kb17' : 'kb10', recordedBy: useAuthStore.getState().getCurrentUserAccount()?.name, lateReason })
            if (!saved) { showToast('ยังไม่ได้บันทึกคำอุทธรณ์ กรุณาตรวจสิทธิ์ผู้รับเรื่องและสถานะแฟ้ม', 'error'); return }
            showToast('รับคำอุทธรณ์และบันทึกเข้าแฟ้มแล้ว')
            navigate({ to: '/form/$formId', params: { formId: '3' }, search: { caseNo: caseItem.no } })
          } catch {
            showToast('บันทึกคำอุทธรณ์ไม่สำเร็จ กรุณาตรวจพื้นที่เก็บข้อมูลและลองอีกครั้ง', 'error')
          }
        }} />
    </div> : <div className="ws-card p-5 text-muted">{!eligible ? 'ไม่เปิดรับคำอุทธรณ์สำหรับเคสนี้' : !delivered ? 'บันทึกวันที่พยานได้รับหนังสือก่อนรับคำอุทธรณ์' : 'ผู้รับผิดชอบเป็นผู้รับคำอุทธรณ์เข้าระบบ'}
      {!delivered && <Link to="/form/$formId" params={{ formId: isTermination ? '17' : '10' }} search={{ caseNo: caseItem.no }} className="mt-3 block font-semibold text-navy">เปิดหนังสือแจ้งผล</Link>}
    </div>}
    {eligible && delivered && canReceive && !isTermination && <details className="ws-card p-5"><summary className="cursor-pointer font-semibold text-navy">บันทึกกรณีพยานไม่ประสงค์อุทธรณ์</summary><div className="mt-4"><Kb10ScreeningCard caseItem={caseItem} compact /></div></details>}
  </div>
}
