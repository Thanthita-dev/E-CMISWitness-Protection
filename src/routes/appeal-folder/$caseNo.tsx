import { Kb10ScreeningCard } from '../../components/dossier/Kb10ScreeningCard'
import { AppealIntakeForm } from '../../components/appeal/AppealIntakeForm'
import { noticeWorkerAllowed, noticeForCase } from '../../lib/noticeDocuments'
import { Button } from '../../components/common/Button'
import React, { useState } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { BackLink } from '../../components/common/BackLink'
import { DetailHeaderCard } from '../../components/common/DetailHeaderCard'
import { CurrentStepCard } from '../../components/common/CurrentStepCard'
import { NumberedStepper, type StepperStep } from '../../components/common/NumberedStepper'
import { Badge } from '../../components/common/Badge'
import type { AppealFolderStage } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { APPEAL_WINDOW_DAYS, ECMIS_USER_DIRECTORY } from '../../lib/constants'
import { daysUntil, formatThaiDate, nowDisplay } from '../../lib/utils'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, filterValidAttachments } from '../../lib/fileValidation'
import { AppealFolderWorkflowCard } from '../../components/appeal/AppealFolderWorkflowCard'
import { AppealNoticeCard } from '../../components/appeal/AppealNoticeCard'

/** เจ้าหน้าที่ที่เลือกมอบหมายให้เป็นผู้รับผิดชอบแฟ้มอุทธรณ์ได้ — ทะเบียนเดียวกับ ECMIS_USER_DIRECTORY */
const APPEAL_OFFICERS = ECMIS_USER_DIRECTORY.filter((u) => u.roles.includes('appeal') && u.active)

/** ลำดับชั้นแฟ้มอุทธรณ์ตามผัง 09B — อ่านจาก appealFolder.stage เดิม (late_pending = ยังอยู่ชั้นรับเรื่อง) */
const APPEAL_STEPS: Array<{ key: AppealFolderStage; label: string; holder: string }> = [
  { key: 'received', label: 'รับเรื่อง', holder: 'ตรวจความครบถ้วนและกรอบ 30 วัน' },
  { key: 'officer_opinion', label: 'เจ้าหน้าที่', holder: 'เจ้าหน้าที่ผู้รับผิดชอบบันทึกความเห็น' },
  { key: 'supervisor', label: 'ผบช.ชั้นต้น', holder: 'ผบช.ชั้นต้น' },
  { key: 'director', label: 'ผอ.สำนัก/กอง', holder: 'ผอ.สำนัก/กอง' },
  { key: 'deputy', label: 'รองเลขาธิการฯ', holder: 'รองเลขาธิการฯ' },
  { key: 'secretary', label: 'เลขาธิการฯ', holder: 'เลขาธิการฯ' },
  { key: 'agenda', label: 'ระเบียบวาระ', holder: 'คณะกรรมการ ป.ป.ท.' },
  { key: 'resolved', label: 'วินิจฉัยแล้ว', holder: 'คณะกรรมการวินิจฉัยแล้ว' },
]

export const Route = createFileRoute('/appeal-folder/$caseNo')({
  component: AppealFolderPage,
})

function AppealFolderPage() {
  const { caseNo } = useParams({ from: '/appeal-folder/$caseNo' })
  const { getCase, addCaseDocument, recordAppealResolution, assignAppealOfficer } = useCaseStore()
  const { currentRole, currentOfficerUserId } = useAuthStore()
  const caseItem = getCase(caseNo)

  /** WIT0920-0922 — มติคณะกรรมการ: ยืนคำสั่งเดิม หรือเปลี่ยนแปลงคำสั่ง */
  const [resolution, setResolution] = useState({ no: '', note: '' })
  const [appealOfficerId, setAppealOfficerId] = useState(APPEAL_OFFICERS[0]?.id || '')
  const [appealOfficerNote, setAppealOfficerNote] = useState('')

  if (!caseItem) {
    return (
      <div className="ws-card p-8 text-center">
        <h2 className="text-[1.1rem] font-bold text-navy">ไม่พบแฟ้มอุทธรณ์ {caseNo}</h2>
        <Link to="/appeal" className="mt-2 inline-block text-[0.88rem] font-semibold text-blue hover:underline">
          ← กลับหน้าอุทธรณ์
        </Link>
      </div>
    )
  }

  const daysLeft = daysUntil(caseItem.appealDueAt)
  const withinWindow = daysLeft === null || daysLeft >= 0

  const handleUploadAppeal = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    /** คัดไฟล์ที่นามสกุลไม่รองรับ/เกิน 20MB ออกก่อน แล้วแจ้งเหตุผลรายไฟล์ */
    const { accepted, rejections } = filterValidAttachments(Array.from(files))
    e.target.value = ''
    rejections.forEach((message) => showToast(message, 'error'))
    if (accepted.length === 0) return
    accepted.forEach((file) => {
      addCaseDocument(caseItem.no, {
        id: `DOC-APPEAL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: 'official',
        name: file.name,
        reference: 'เอกสารประกอบคำอุทธรณ์',
        uploadedBy: caseItem.owner,
        uploadedAt: nowDisplay(),
      })
    })
    showToast(`อัปโหลดเอกสารประกอบคำอุทธรณ์ ${accepted.length} รายการแล้ว`)
  }

  /** WIT0920 — มติคณะกรรมการเป็นที่สุด จึงต้องผ่านจอยืนยันที่บอกผลลัพธ์ของแต่ละแขนงก่อนบันทึก */
  const handleResolution = (outcome: 'uphold' | 'overturn') => {
    if (!resolution.no.trim()) {
      showToast('กรุณาระบุเลขที่มติ', 'warning')
      return
    }
    if (!resolution.note.trim()) {
      showToast('กรุณาระบุสาระสำคัญของคำวินิจฉัย', 'warning')
      return
    }
    const uphold = outcome === 'uphold'
    showConfirmAlert({
      icon: 'warning',
      title: uphold ? 'บันทึกมติยืนคำสั่งเดิม?' : 'บันทึกมติเปลี่ยนแปลงคำสั่ง?',
      html: confirmBody(
        `${uphold ? 'ยืนคำสั่งเดิม' : 'เปลี่ยนแปลงคำสั่ง'} — คำวินิจฉัยของคณะกรรมการ ป.ป.ท. เป็นที่สุด แก้ไขย้อนหลังไม่ได้`,
        [
          ['แฟ้มอุทธรณ์', `${caseItem.no} · ${caseItem.person}`],
          ['อุทธรณ์คำสั่ง', against],
          ['ระเบียบวาระ', caseItem.appealFolder?.agendaNo || '-'],
          ['เลขที่มติ / ครั้งที่ประชุม', resolution.no.trim()],
          ['สาระสำคัญของคำวินิจฉัย', resolution.note.trim()],
        ],
        uphold
          ? 'ขั้นอุทธรณ์ปิด · ขั้นถัดไปคือ<strong>ทำหนังสือแจ้งผลอุทธรณ์และเก็บหลักฐานการรับ</strong> จึงจะถือว่าปิดสมบูรณ์'
          : 'แฟ้มกลับไป<strong>จัดทำ คบ.6 รุ่นใหม่ตามมติอุทธรณ์</strong> (ไม่สร้าง คบ.1 ใหม่) · ยังต้องทำ<strong>หนังสือแจ้งผลอุทธรณ์</strong>ให้พยานด้วย'
      ),
      showCancelButton: true,
      confirmButtonText: uphold ? 'ยืนยันมติยืนคำสั่งเดิม' : 'ยืนยันมติเปลี่ยนแปลงคำสั่ง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      recordAppealResolution(caseItem.no, { resolutionNo: resolution.no.trim(), outcome, note: resolution.note.trim() })
      showToast(
        uphold
          ? 'บันทึกมติยืนคำสั่งเดิม — ทำหนังสือแจ้งผลและเก็บหลักฐานการรับต่อ'
          : 'บันทึกมติแล้ว — กลับไปจัดทำ คบ.6 รุ่นใหม่'
      )
    })
  }

  /** WIT0911-0913 — มอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน จุดเดียวที่เปลี่ยนเจ้าของแฟ้มอุทธรณ์ได้ */
  const handleAssignAppealOfficer = () => {
    if (!appealOfficerId) {
      showToast('กรุณาเลือกเจ้าหน้าที่อุทธรณ์', 'warning')
      return
    }
    const officer = APPEAL_OFFICERS.find((o) => o.id === appealOfficerId)
    showConfirmAlert({
      icon: 'question',
      title: 'มอบหมายเจ้าหน้าที่อุทธรณ์?',
      html: confirmBody(
        'เปลี่ยนเจ้าของแฟ้มอุทธรณ์อย่างชัดเจน — ไม่ใช่การเปลี่ยนอัตโนมัติ',
        [
          ['แฟ้มอุทธรณ์', `${caseItem.no} · ${caseItem.person}`],
          ['เจ้าของเรื่องเดิม', caseItem.owner],
          ['เจ้าหน้าที่ที่มอบหมาย', officer?.name || '-'],
          ...(appealOfficerNote.trim() ? ([['หมายเหตุ', appealOfficerNote.trim()]] as Array<[string, string]>) : []),
        ],
        'เจ้าของแฟ้มอุทธรณ์เปลี่ยนไปเป็นเจ้าหน้าที่ที่เลือก'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      assignAppealOfficer(caseItem.no, appealOfficerId, appealOfficerNote.trim() || undefined)
      setAppealOfficerNote('')
      showToast('มอบหมายเจ้าหน้าที่อุทธรณ์แล้ว')
    })
  }

  const appealStage = caseItem.appealFolder?.stage
  const appealStepIndex = appealStage ? APPEAL_STEPS.findIndex((st) => st.key === (appealStage === 'late_pending' ? 'received' : appealStage)) : -1
  const appealSteps: StepperStep[] = APPEAL_STEPS.map((st, i) => ({
    key: st.key,
    label: st.label,
    state: i < appealStepIndex || appealStage === 'resolved' ? 'done' : i === appealStepIndex ? 'current' : 'pending',
  }))

  const isCommittee = ['committee', 'admin'].includes(currentRole)
  /** ผู้มีอำนาจมอบหมายเจ้าหน้าที่อุทธรณ์ตามผัง — ผบช.ชั้นต้น / ผอ.สำนัก/กอง / Admin */
  const canAssignAppealOfficer = ['supervisor', 'director', 'admin'].includes(currentRole)
  /** อุทธรณ์คำสั่งยุติ (คบ.17) ผูกกับ คบ.17/หลักฐานการรับ ไม่สร้าง คบ.1 ใหม่ (WIT1147) */
  const against = caseItem.appealAgainst === 'kb17' ? 'คบ.17 (คำสั่งยุติ)' : 'คบ.10 (ไม่อนุมัติ)'

  if (!caseItem.appealFiledAt && !caseItem.appealFolder) {
    const isTermination = Boolean(caseItem.kb17?.deliveredAt)
    const delivered = isTermination ? caseItem.kb17?.deliveredAt : caseItem.deliveredAt
    const eligible = !caseItem.nonApprovalClosedAt && (isTermination || caseItem.activity7State === 'rejected')
    const canReceive = ['receiver', 'admin'].includes(currentRole) || ['officer', 'case_owner'].includes(currentRole) && (!noticeForCase(caseItem) || noticeWorkerAllowed(currentRole, caseItem, currentOfficerUserId))
    return <div className="space-y-5">
      <BackLink to="/appeal">กลับรายการงานอุทธรณ์</BackLink>
      <DetailHeaderCard kicker="อุทธรณ์ · รับคำอุทธรณ์" refNo={caseItem.no} title={caseItem.person}
        meta={[isTermination ? 'คำสั่งยุติ คบ.17' : 'คำสั่งไม่อนุมัติ คบ.10', delivered ? `พยานได้รับหนังสือ ${formatThaiDate(delivered)}` : 'รอพยานได้รับหนังสือ']}
        status={<Badge>{delivered ? 'รอรับคำอุทธรณ์' : 'รอบันทึกการรับหนังสือ'}</Badge>} />
      {eligible && delivered && canReceive ? <div className="ws-card p-5">
        <AppealIntakeForm caseItem={caseItem} submitLabel="รับคำร้องอุทธรณ์เข้าระบบ" letterOnly={currentRole === 'receiver'}
          onSubmit={(reason, intake) => {
            try {
              const saved = useCaseStore.getState().fileAppeal(caseItem.no, reason, intake, { against: isTermination ? 'kb17' : 'kb10', recordedBy: useAuthStore.getState().getCurrentUserAccount()?.name })
              if (!saved) { showToast('ยังไม่ได้บันทึกคำอุทธรณ์ กรุณาตรวจสิทธิ์ผู้รับเรื่องและสถานะแฟ้ม', 'error'); return }
              showToast('รับคำอุทธรณ์และบันทึกเข้าแฟ้มแล้ว')
            } catch {
              showToast('บันทึกคำอุทธรณ์ไม่สำเร็จ กรุณาตรวจพื้นที่เก็บข้อมูลและลองอีกครั้ง', 'error')
            }
          }} />
      </div> : <div className="ws-card p-5 text-muted">{!eligible ? 'ไม่เปิดรับคำอุทธรณ์สำหรับเคสนี้' : !delivered ? 'บันทึกวันที่พยานได้รับหนังสือก่อนรับคำอุทธรณ์' : 'ผู้รับผิดชอบเป็นผู้รับคำอุทธรณ์เข้าระบบ'}
        {!delivered && <Link to="/form/$formId" params={{ formId: isTermination ? '17' : '10' }} search={{ caseNo: caseItem.no }} className="mt-3 block font-semibold text-navy">เปิดหนังสือแจ้งผล</Link>}
      </div>}
      {eligible && delivered && canReceive && !isTermination && <details className="ws-card p-5"><summary className="cursor-pointer font-semibold text-navy">พยานไม่ประสงค์อุทธรณ์ / ปิดเรื่อง</summary><div className="mt-4"><Kb10ScreeningCard caseItem={caseItem} /></div></details>}
    </div>
  }

  const appealDocs = (caseItem.documents || []).filter(
    (d) => d.reference === 'คำร้องอุทธรณ์' || d.reference === 'เอกสารประกอบคำอุทธรณ์'
  )

  return (
    <div className="space-y-6">
      <BackLink to="/appeal">กลับหน้าอุทธรณ์</BackLink>

      <DetailHeaderCard
        kicker="อุทธรณ์ · แฟ้มคำอุทธรณ์"
        refNo={`แฟ้มคำอุทธรณ์ ${caseNo}`}
        title={`ผู้อุทธรณ์: ${caseItem.person}`}
        meta={[`คำสั่งที่อุทธรณ์: ${caseItem.appealAgainst === 'kb17' ? 'คำสั่งยุติ (คบ.17)' : 'ไม่อนุมัติ (คบ.10)'}`, `วันที่รับคำอุทธรณ์ ${caseItem.appealFiledAt || '-'}`]}
        status={
          <Badge
            variant={daysLeft === null ? 'default' : withinWindow ? 'success' : 'danger'}
            icon={daysLeft === null ? 'fa-hourglass-start' : withinWindow ? 'fa-circle-check' : 'fa-circle-xmark'}
          >
            {daysLeft === null
              ? 'ยังไม่เริ่มนับกรอบอุทธรณ์'
              : withinWindow
              ? `ภายในกรอบอุทธรณ์ (เหลือ ${daysLeft} วัน)`
              : `เกินกรอบอุทธรณ์ ${Math.abs(daysLeft)} วัน`}
          </Badge>
        }
        owner={`ผู้รับผิดชอบ: ${caseItem.owner}`}
      />

      {appealStepIndex >= 0 && (
        <CurrentStepCard
          current={APPEAL_STEPS[appealStepIndex].label}
          responsible={APPEAL_STEPS[appealStepIndex].holder}
          next={APPEAL_STEPS[appealStepIndex + 1]?.label}
          index={appealStepIndex + 1}
          total={APPEAL_STEPS.length}
          caption={['ลำดับชั้นของแฟ้มอุทธรณ์ — ข้ามชั้นไม่ได้']}
        >
          <NumberedStepper steps={appealSteps} ariaLabel="ลำดับชั้นแฟ้มอุทธรณ์" />
        </CurrentStepCard>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] lg:grid-cols-3 gap-6 items-start">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-6">
          <section className="ws-card overflow-hidden" aria-labelledby="appeal-details-title">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
              <h2 id="appeal-details-title" className="text-[1.05rem] font-bold text-navy">คำอุทธรณ์</h2>
              <span className={`rounded-full px-3 py-1 text-[0.8rem] font-semibold ${daysLeft === null ? 'bg-slate-100 text-muted' : withinWindow ? 'bg-success-soft text-success-dark' : 'bg-danger-soft text-danger'}`}>
                {daysLeft === null ? 'รอวันที่รับแจ้งผล' : withinWindow ? 'ยื่นภายในกำหนด' : 'ยื่นเกินกำหนด'}
              </span>
            </div>

            <div className="space-y-5 p-5">
              <div>
                <h3 className="mb-2 text-[0.8rem] font-semibold text-muted">เหตุผลที่ขออุทธรณ์</h3>
                <p className="whitespace-pre-wrap break-words text-[0.95rem] leading-relaxed text-ink">{caseItem.appealReason || 'ยังไม่บันทึกเหตุผล'}</p>
              </div>

              {caseItem.appealFolder?.intake && (
                <div className="border-t border-line pt-4" data-testid="appeal-intake-summary">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-[0.8rem] font-semibold text-muted">เอกสารคำอุทธรณ์</h3>
                    <span className="text-[0.8rem] text-muted">{caseItem.appealFolder.intake.channel === 'letter' ? 'รับผ่านสารบรรณกลาง' : 'รับด้วยวาจา'}</span>
                  </div>
                  {caseItem.appealFolder.intake.channel === 'letter' ? (
                    <>
                      <div className="flex min-w-0 items-start gap-3 rounded-xl border border-line bg-slate-50 p-3">
                        <i aria-hidden="true" className="fa-solid fa-file-lines mt-1 text-blue" />
                        <div className="min-w-0 flex-1">
                          {caseItem.appealFolder.intake.evidenceDataUrl ? <a href={caseItem.appealFolder.intake.evidenceDataUrl} download={caseItem.appealFolder.intake.evidenceDocumentName} className="break-all font-semibold text-navy underline underline-offset-4 hover:text-blue">{caseItem.appealFolder.intake.evidenceDocumentName}</a> : <span className="break-all font-semibold text-ink">{caseItem.appealFolder.intake.evidenceDocumentName}</span>}
                          <p className="mt-1 text-[0.8rem] text-muted">{caseItem.appealFolder.intake.documentSource === 'agency_form' ? 'แบบคำอุทธรณ์ของ ป.ป.ท.' : caseItem.appealFolder.intake.documentSource === 'appellant_document' ? 'เอกสารที่ผู้ร้องจัดทำเอง' : 'เอกสารแนบ'}</p>
                        </div>
                        {caseItem.appealFolder.intake.evidenceDataUrl && <i aria-hidden="true" className="fa-solid fa-download mt-1 text-muted" />}
                      </div>
                      <dl className="mt-3 grid grid-cols-1 gap-3 text-[0.85rem] sm:grid-cols-2">
                        <div><dt className="text-muted">เลขรับสารบรรณ</dt><dd className="mt-1 font-medium text-ink">{caseItem.appealFolder.intake.registryNo}</dd></div>
                        <div><dt className="text-muted">รับเอกสารครั้งแรก</dt><dd className="mt-1 text-ink">{formatThaiDate(caseItem.appealFolder.intake.firstReceivedAt)}</dd></div>
                      </dl>
                    </>
                  ) : (
                    <div className="rounded-xl border border-line bg-slate-50 p-3">
                      <p className="mb-3 whitespace-pre-wrap break-words text-[0.9rem] text-ink">{caseItem.appealFolder.intake.statement}</p>
                      <div className="flex items-start gap-2 text-[0.85rem]">
                        <i aria-hidden="true" className="fa-solid fa-paperclip mt-1 text-muted" />
                        {caseItem.appealFolder.intake.signedRecordDataUrl ? <a href={caseItem.appealFolder.intake.signedRecordDataUrl} download={caseItem.appealFolder.intake.signedRecordDocumentName} className="break-all font-semibold text-navy underline underline-offset-4">{caseItem.appealFolder.intake.signedRecordDocumentName}</a> : <span className="break-all">{caseItem.appealFolder.intake.signedRecordDocumentName}</span>}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <dl className="grid grid-cols-1 gap-4 border-t border-line pt-4 text-[0.85rem] sm:grid-cols-2">
                <div>
                  <dt className="text-muted">พยานได้รับ {caseItem.appealAgainst === 'kb17' ? 'คบ.17' : 'คบ.10'}</dt>
                  <dd className="mt-1 font-semibold text-ink">{caseItem.appealKb6PreviousResult?.deliveredAt || caseItem.deliveredAt ? formatThaiDate(caseItem.appealKb6PreviousResult?.deliveredAt || caseItem.deliveredAt!) : 'ยังไม่บันทึก'}</dd>
                </div>
                <div>
                  <dt className="text-muted">บันทึกรับคำอุทธรณ์</dt>
                  <dd className="mt-1 font-semibold text-ink">{caseItem.appealFiledAt || 'ยังไม่บันทึก'}</dd>
                </div>
              </dl>
            </div>
          </section>

          {/* WIT0914-WIT0919 — ลำดับชั้นแฟ้มอุทธรณ์ */}
          <AppealFolderWorkflowCard caseItem={caseItem} />

          {/* WIT0921 / WIT0922 — หนังสือแจ้งผลอุทธรณ์และหลักฐานการรับ */}
          <AppealNoticeCard caseItem={caseItem} />
        </div>

        {/* Right Info */}
        <div className="space-y-4">
          {/* มอบหมายเจ้าหน้าที่อุทธรณ์ — จุดเดียวที่เปลี่ยนเจ้าของแฟ้มอุทธรณ์ได้ ไม่ใช่ด่านของลำดับชั้น WIT0914+ */}
          {caseItem.appealFolder && caseItem.appealFolder.stage !== 'resolved' && (
            <div className="ws-card p-5 space-y-3" data-testid="appeal-assign">
              <h2 className="ws-section-title !mb-0 border-b border-line pb-2">มอบหมายเจ้าหน้าที่อุทธรณ์</h2>

              {caseItem.appealFolder.appealOfficer ? (
                <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-success-dark" data-testid="appeal-assign-current">
                  <strong className="block">{caseItem.appealFolder.appealOfficer.name}</strong>
                  <div className="text-[0.8rem]">
                    มอบหมายเมื่อ {caseItem.appealFolder.appealOfficer.at} โดย {caseItem.appealFolder.appealOfficer.by}
                    {caseItem.appealFolder.appealOfficer.note ? ` — ${caseItem.appealFolder.appealOfficer.note}` : ''}
                  </div>
                </div>
              ) : (
                <p className="text-[0.88rem] text-muted">ยังไม่มีการมอบหมายเจ้าหน้าที่อุทธรณ์อย่างชัดเจน — เจ้าของเรื่องยังคงเดิม</p>
              )}

              {canAssignAppealOfficer && (
                <div className="space-y-2 border-t border-line pt-3">
                  <select
                    value={appealOfficerId}
                    onChange={(e) => setAppealOfficerId(e.target.value)}
                    data-testid="appeal-assign-officer"
                    className="ws-input"
                  >
                    {APPEAL_OFFICERS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} — {o.position}
                      </option>
                    ))}
                  </select>
                  <input
                    value={appealOfficerNote}
                    onChange={(e) => setAppealOfficerNote(e.target.value)}
                    placeholder="หมายเหตุ (ถ้ามี)"
                    data-testid="appeal-assign-note"
                    className="ws-input"
                  />
                  <div className="ws-actions justify-end">
                    <Button
                      type="button"
                      onClick={handleAssignAppealOfficer}
                      data-testid="appeal-assign-submit"
                      variant="primary"
                      size="md"
                    >
                      มอบหมายเจ้าหน้าที่อุทธรณ์
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="ws-card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2">
              <h2 className="ws-section-title !mb-0">เอกสารในแฟ้มอุทธรณ์</h2>
              <label className="inline-flex min-h-[38px] cursor-pointer items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy transition hover:bg-slate-50 focus-within:ring-[3px] focus-within:ring-[rgba(202,166,49,0.18)]">
                <i className="fa-solid fa-cloud-arrow-up" />
                อัปโหลด
                <input type="file" multiple accept={ATTACHMENT_ACCEPT} onChange={handleUploadAppeal} className="sr-only" />
              </label>
            </div>

            <div className="space-y-2">
              {appealDocs.length === 0 ? (
                <div className="rounded-lg border border-dashed border-line p-4 text-center text-[0.88rem] text-muted">
                  ยังไม่มีเอกสารคำอุทธรณ์ — อัปโหลดคำร้องอุทธรณ์ที่พยานยื่นเข้ามา
                </div>
              ) : (
                appealDocs.map((d) => (
                  <div key={d.id} className="ws-readonly flex items-center gap-2 !p-2">
                    <i className="fa-solid fa-file-pdf text-danger text-sm" />
                    <div className="min-w-0">
                      <span className="block text-[0.88rem] font-medium text-ink truncate">{d.name}</span>
                      <small className="text-[0.8rem] text-muted">{d.uploadedAt}</small>
                    </div>
                  </div>
                ))
              )}

              {caseItem.decisionNumber && (
                <div className="ws-readonly flex items-center gap-2 !p-2">
                  <i className="fa-solid fa-file-shield text-blue text-sm" />
                  <span className="min-w-0 truncate text-[0.88rem] font-medium text-ink">
                    คำสั่งเดิมที่อุทธรณ์: {against} ({caseItem.decisionNumber})
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* WIT0919-0922 — ฝ่ายเลขานุการบรรจุวาระและบันทึกมติคณะกรรมการ */}
          {isCommittee && !caseItem.appealResolution && caseItem.appealFolder?.stage === 'agenda' && Boolean(caseItem.appealFolder.agendaAt) && (
            <div className="ws-card p-5 space-y-3">
              <h2 className="ws-section-title !mb-0 border-b border-line pb-2">
                มติคณะกรรมการ ป.ป.ท. (คำวินิจฉัยเป็นที่สุด)
              </h2>
              <div className="ws-grid-2">
                <input
                  value={resolution.no}
                  onChange={(e) => setResolution((p) => ({ ...p, no: e.target.value }))}
                  placeholder="เลขที่มติ / ครั้งที่ประชุม"
                  data-testid="appeal-resolution-no"
                  className="ws-input"
                />
                <input
                  value={resolution.note}
                  onChange={(e) => setResolution((p) => ({ ...p, note: e.target.value }))}
                  placeholder="สาระสำคัญของคำวินิจฉัย"
                  data-testid="appeal-resolution-note"
                  className="ws-input"
                />
              </div>
              <p className="text-[0.8rem] text-muted">อุทธรณ์คำสั่ง: {against}</p>
              <div className="ws-actions">
                <Button
                  type="button"
                  onClick={() => handleResolution('uphold')}
                  data-testid="appeal-resolution-uphold"
                  variant="secondary"
                  size="md"
                >
                  ยืนคำสั่งเดิม · ปิดขั้นอุทธรณ์
                </Button>
                <Button
                  type="button"
                  onClick={() => handleResolution('overturn')}
                  data-testid="appeal-resolution-overturn"
                  variant="primary"
                  size="md"
                >
                  เปลี่ยนแปลงคำสั่ง
                </Button>
              </div>
            </div>
          )}

          {caseItem.appealResolution && (
            <div className="ws-card border-success/30 !bg-success-soft p-5 text-[0.88rem] text-success-dark space-y-1">
              <div className="font-bold">
                มติคณะกรรมการที่ {caseItem.appealResolution.resolutionNo} ·{' '}
                {caseItem.appealResolution.outcome === 'uphold' ? 'ยืนคำสั่งเดิม' : 'เปลี่ยนแปลงคำสั่ง'}
              </div>
              <div>{caseItem.appealResolution.note}</div>
              {caseItem.appealResolution.outcome === 'overturn' && caseItem.appealAgainst !== 'kb17' && <Link to="/form/$formId" params={{ formId: '6' }} search={{ caseNo: caseItem.no }} onClick={() => useCaseStore.getState().prepareAppealKb6Revision(caseItem.no)} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-blue">เปิด คบ.6 v{caseItem.appealKb6Version || (caseItem.kb6Version || 1) + 1}</Link>}
              <div className="text-[0.8rem]">
                วินิจฉัยเมื่อ {caseItem.appealResolution.resolvedAt} · คำวินิจฉัยของคณะกรรมการ ป.ป.ท. เป็นที่สุด
                {caseItem.appealResolution.outcome === 'overturn' &&
                  ' — จัดทำ คบ.6 รุ่นใหม่ในแฟ้มเดิม'}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
