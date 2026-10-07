import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { APPEAL_WINDOW_DAYS, isCaseWorkerRole } from '../../lib/constants'
import { daysUntil } from '../../lib/utils'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/** ชั้นความเห็นที่ผังกำหนด — เรียงตามลำดับการเสนอ ไม่ใช่ตามบทบาทผู้ใช้ */
const OPINION_LEVELS = [
  {
    stage: 'officer_opinion' as const,
    level: 'officer' as const,
    code: 'WIT0915',
    title: 'เจ้าหน้าที่ผู้รับผิดชอบ — ตรวจข้อเท็จจริงและเอกสาร พร้อมบันทึกความเห็นของตน',
    hint: 'ความเห็นเก็บแยกจากข้อความคำอุทธรณ์ของผู้ยื่น — ห้ามแก้ไขคำอุทธรณ์',
    button: 'บันทึกความเห็นและเสนอ ผบช.ชั้นต้น',
    effect: 'แฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> เพื่อให้ความเห็นและลงนามเสนอตามลำดับชั้น',
    key: 'officerOpinion' as const,
  },
  {
    stage: 'supervisor' as const,
    level: 'supervisor' as const,
    code: 'WIT0915',
    title: 'ผบช.ชั้นต้น — ตรวจความครบถ้วนและให้ความเห็นตามลำดับชั้น',
    hint: 'ให้ความเห็นแล้วเสนอ ผอ.สำนัก/กอง — ยังเสนอรองเลขาธิการฯ ข้ามชั้นไม่ได้',
    button: 'ให้ความเห็นและเสนอ ผอ.สำนัก/กอง',
    effect: 'แฟ้มย้ายไปอยู่กับ <strong>ผอ.สำนัก/กอง</strong> เพื่อตรวจ ให้ความเห็น และลงนามเสนอ',
    key: 'supervisorOpinion' as const,
  },
  {
    stage: 'director' as const,
    level: 'director' as const,
    code: 'WIT0916',
    title: 'ผอ.สำนัก/กอง — ตรวจ ให้ความเห็น และลงนามเสนอรองเลขาธิการฯ',
    hint: 'ลงนามเสนอแฟ้มอุทธรณ์ขึ้นรองเลขาธิการฯ',
    button: 'ลงนามเสนอรองเลขาธิการฯ',
    effect: 'แฟ้มย้ายไปอยู่กับ <strong>รองเลขาธิการฯ</strong> เพื่อกลั่นกรองและให้ความเห็นประกอบ',
    key: 'directorOpinion' as const,
  },
  {
    stage: 'deputy' as const,
    level: 'deputy' as const,
    code: 'WIT0917',
    title: 'รองเลขาธิการฯ — กลั่นกรองแฟ้มอุทธรณ์และให้ความเห็นประกอบ',
    hint: 'กลั่นกรองก่อนถึงเลขาธิการฯ — กดได้ครั้งเดียว สถานะแฟ้มเปลี่ยนจริง',
    button: 'บันทึกความเห็นและเสนอเลขาธิการฯ',
    effect: 'แฟ้มย้ายไปอยู่กับ <strong>เลขาธิการฯ</strong> และหน้าแฟ้มแสดงว่า<strong>ผ่านการกลั่นกรองแล้ว</strong>',
    key: 'deputyOpinion' as const,
  },
  {
    stage: 'secretary' as const,
    level: 'secretary' as const,
    code: 'WIT0918',
    title: 'เลขาธิการฯ — รับทราบ/ให้ความเห็นประกอบ และส่งเสนอคณะกรรมการ',
    hint: 'เลขาธิการฯ ไม่ใช่ผู้วินิจฉัยอุทธรณ์ เป็นผู้ส่งเรื่อง — อำนาจวินิจฉัยอยู่ที่คณะกรรมการ',
    button: 'ส่งเสนอคณะกรรมการ ป.ป.ท.',
    effect: 'แฟ้มย้ายไปอยู่กับ <strong>ฝ่ายเลขานุการคณะกรรมการ</strong> เพื่อบรรจุระเบียบวาระ',
    key: 'secretaryOpinion' as const,
  },
]

const ROLE_FOR_LEVEL: Record<string, string[]> = {
  officer: ['officer', 'case_owner', 'admin'],
  supervisor: ['supervisor', 'admin'],
  director: ['director', 'admin'],
  deputy: ['deputy_secretary', 'admin'],
  secretary: ['secretary', 'admin'],
}

/**
 * Sheet 09B · WIT0914 → WIT0919 — ลำดับชั้นของแฟ้มอุทธรณ์
 *
 * จุดสำคัญสองอย่างที่การ์ดนี้รับผิดชอบ
 * 1. WIT0914 — เคสที่ยื่นเกิน 30 วันต้องเดินต่อได้เสมอ ผังห้ามปัดตกอัตโนมัติ
 *    ระบบจึงต้องมีช่องบันทึกเหตุผลความล่าช้า และให้ ผบช.ชั้นต้นรับเรื่องไว้
 * 2. WIT0915-WIT0918 — ทุกชั้นเขียนสถานะแฟ้มจริง ไม่ใช่บันทึกประวัติเปล่า
 *    ปุ่มของชั้นถัดไปจึงโผล่ก็ต่อเมื่อชั้นก่อนหน้าทำเสร็จแล้ว
 *
 * ทุกปุ่มในการ์ดนี้เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม จึงผ่านจอยืนยันทุกปุ่ม
 */
export const AppealFolderWorkflowCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { checkAppealFolder, acceptLateAppeal, recordAppealOpinion, scheduleAppealAgenda } = useCaseStore()
  const { currentRole } = useAuthStore()

  const [lateReason, setLateReason] = useState('')
  const [acceptNote, setAcceptNote] = useState('')
  const [opinion, setOpinion] = useState('')
  const [agendaNo, setAgendaNo] = useState('')

  const folder = caseItem.appealFolder
  const isOfficer = isCaseWorkerRole(currentRole)
  const isSupervisor = currentRole === 'supervisor' || currentRole === 'admin'
  const isCommittee = currentRole === 'committee' || currentRole === 'admin'

  /** ค่าบวก = ยื่นช้ากว่ากำหนดกี่วัน · คำนวณจากวันที่รับแจ้งผลจริงตามผัง */
  const left = daysUntil(caseItem.appealDueAt, caseItem.appealFiledAt)
  const lateDays = left !== null && left < 0 ? Math.abs(left) : 0

  if (!folder) return null

  const handleCheck = () => {
    if (lateDays > 0 && !lateReason.trim()) {
      showToast('ยื่นเกินกำหนดแล้ว — ต้องบันทึกเหตุผลความล่าช้าก่อน (ห้ามปัดตก)', 'warning')
      return
    }
    showConfirmAlert({
      icon: lateDays > 0 ? 'warning' : 'question',
      title: lateDays > 0 ? 'บันทึกเหตุผลความล่าช้าและจัดทำแฟ้มเสนอ?' : 'ยืนยันแฟ้มอุทธรณ์ครบถ้วน?',
      html: confirmBody(
        `ตรวจความครบถ้วนและคำนวณกรอบ ${APPEAL_WINDOW_DAYS} วันจากวันที่รับแจ้งผลจริง`,
        [
          ['วันที่พยานได้รับหนังสือ', caseItem.deliveredAt || '-'],
          ['ครบกำหนดอุทธรณ์', caseItem.appealDueAt || '-'],
          ['วันที่ยื่นคำอุทธรณ์', caseItem.appealFiledAt || '-'],
          ['ผลการคำนวณ', lateDays > 0 ? `ยื่นช้ากว่ากำหนด ${lateDays} วัน` : 'ยื่นภายในกรอบกำหนด'],
          ...(lateDays > 0 ? ([['เหตุผลความล่าช้า', lateReason.trim()]] as Array<[string, string]>) : []),
        ],
        lateDays > 0
          ? 'แฟ้มย้ายไปอยู่กับ <strong>ผบช.ชั้นต้น</strong> เพื่อรับเรื่องไว้ — <strong>ไม่ปัดตกอัตโนมัติ</strong> อำนาจตัดสินว่าจะรับพิจารณาหรือไม่อยู่ที่คณะกรรมการ'
          : 'แฟ้มเดินต่อเข้าชั้น<strong>ความเห็นของเจ้าหน้าที่ผู้รับผิดชอบ</strong>'
      ),
      showCancelButton: true,
      confirmButtonText: lateDays > 0 ? 'ยืนยันบันทึกเหตุผลและเสนอ' : 'ยืนยันแฟ้มครบถ้วน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      checkAppealFolder(caseItem.no, { lateReason: lateReason.trim() || undefined })
      setLateReason('')
      showToast(lateDays > 0 ? 'บันทึกเหตุผลความล่าช้าและเสนอ ผบช.ชั้นต้นแล้ว' : 'ตรวจแฟ้มอุทธรณ์ครบถ้วนแล้ว')
    })
  }

  const handleAcceptLate = () => {
    if (!acceptNote.trim()) {
      showToast('กรุณาบันทึกความเห็นในการรับเรื่องไว้พิจารณา', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: 'รับแฟ้มอุทธรณ์ที่ยื่นเกินกำหนดไว้พิจารณา?',
      html: confirmBody(
        `ผบช.ชั้นต้นรับเรื่องที่ยื่นช้ากว่ากำหนด ${folder.lateDays || lateDays} วัน ไว้จัดทำแฟ้มเสนอ`,
        [
          ['ผู้อุทธรณ์', caseItem.person],
          ['เหตุผลความล่าช้าที่เจ้าหน้าที่บันทึก', folder.lateReason || '-'],
          ['ความเห็นในการรับเรื่อง', acceptNote.trim()],
        ],
        'แฟ้มเดินต่อเข้าชั้น<strong>ความเห็นของเจ้าหน้าที่ผู้รับผิดชอบ</strong> · ระบบไม่ตัดสิทธิ์ผู้ยื่นแทนคณะกรรมการ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันรับเรื่องไว้พิจารณา',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      acceptLateAppeal(caseItem.no, acceptNote.trim())
      setAcceptNote('')
      showToast('รับแฟ้มอุทธรณ์ที่ยื่นเกินกำหนดไว้พิจารณาแล้ว')
    })
  }

  const handleOpinion = (step: (typeof OPINION_LEVELS)[number]) => {
    if (!opinion.trim()) {
      showToast('กรุณาบันทึกความเห็นก่อน', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: `${step.button}?`,
      html: confirmBody(
        step.title,
        [
          ['แฟ้มอุทธรณ์', `${caseItem.no} · ${caseItem.person}`],
          ['ความเห็นที่บันทึก', opinion.trim()],
        ],
        step.effect
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      recordAppealOpinion(caseItem.no, step.level, opinion.trim())
      setOpinion('')
      showToast('บันทึกความเห็นและส่งต่อขั้นถัดไปแล้ว')
    })
  }

  const handleAgenda = () => {
    if (!agendaNo.trim()) {
      showToast('กรุณาระบุระเบียบวาระ / ครั้งที่ประชุม', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: 'บรรจุแฟ้มอุทธรณ์เข้าระเบียบวาระ?',
      html: confirmBody(
        'ฝ่ายเลขานุการเสนอประธานเพื่อบรรจุวาระ พร้อมชุดแฟ้มอุทธรณ์และใบนำ',
        [
          ['แฟ้มอุทธรณ์', `${caseItem.no} · ${caseItem.person}`],
          ['ระเบียบวาระ / ครั้งที่ประชุม', agendaNo.trim()],
        ],
        'แฟ้มพร้อมให้<strong>คณะกรรมการ ป.ป.ท. วินิจฉัย</strong> · ช่องบันทึกมติจะเปิดหลังบรรจุวาระแล้วเท่านั้น'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบรรจุวาระ',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      scheduleAppealAgenda(caseItem.no, agendaNo.trim())
      setAgendaNo('')
      showToast('บรรจุแฟ้มอุทธรณ์เข้าระเบียบวาระแล้ว')
    })
  }

  const activeStep = OPINION_LEVELS.find((s) => s.stage === folder.stage)
  const canActOnStep = activeStep && ROLE_FOR_LEVEL[activeStep.level].includes(currentRole)
  const hasAction = (folder.stage === 'received' && isOfficer)
    || (folder.stage === 'late_pending' && isSupervisor)
    || canActOnStep
    || (folder.stage === 'agenda' && !folder.agendaAt && isCommittee)
  if (!hasAction) return null

  return (
    <div className="ws-card p-5 space-y-3" data-testid="appeal-folder-card">
      {/* WIT0914 — ตรวจความครบถ้วนและกรอบ 30 วัน */}
      {folder.stage === 'received' && isOfficer && (
        <div className="space-y-2" data-testid="appeal-check">
          {lateDays > 0 && (
            <label className="block">
              <span className="ws-label">เหตุผลความล่าช้า * (ห้ามปัดตกอัตโนมัติ)</span>
              <textarea
                rows={3}
                value={lateReason}
                onChange={(e) => setLateReason(e.target.value)}
                placeholder="เช่น พยานเจ็บป่วยเข้ารักษาตัวในโรงพยาบาลตลอดช่วงกรอบเวลาอุทธรณ์"
                data-testid="appeal-late-reason"
                className="ws-input"
              />
            </label>
          )}
          <div className="ws-actions justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleCheck}
              data-testid="appeal-check-submit"
            >
              {lateDays > 0 ? 'บันทึกเหตุผลและจัดทำแฟ้มเสนอ' : 'ยืนยันแฟ้มครบถ้วน'}
            </Button>
          </div>
        </div>
      )}

      {/* WIT0914 แขนงล่าช้า — ผบช.ชั้นต้นรับเรื่องไว้ */}
      {folder.stage === 'late_pending' && isSupervisor && (
        <div className="space-y-2" data-testid="appeal-late-accept">
          <textarea
            rows={3}
            value={acceptNote}
            onChange={(e) => setAcceptNote(e.target.value)}
            placeholder="ความเห็นในการรับเรื่องที่ยื่นเกินกำหนดไว้พิจารณา"
            data-testid="appeal-late-accept-note"
            className="ws-input"
          />
          <div className="ws-actions justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleAcceptLate}
              data-testid="appeal-late-accept-submit"
            >
              รับเรื่องไว้พิจารณา
            </Button>
          </div>
        </div>
      )}

      {/* WIT0915-WIT0918 — ชั้นความเห็นตามลำดับ */}
      {activeStep && canActOnStep && (
        <div className="space-y-2" data-testid={`appeal-opinion-${activeStep.level}`}>
          <label htmlFor="appeal-opinion-note" className="ws-label">ความเห็นประกอบการพิจารณา</label>
          <textarea
            rows={3}
            value={opinion}
            onChange={(e) => setOpinion(e.target.value)}
            placeholder="ความเห็นของท่าน"
            id="appeal-opinion-note"
            data-testid="appeal-opinion-note"
            className="ws-input"
          />
          <div className="ws-actions justify-end">
            <Button
              type="button"
              onClick={() => handleOpinion(activeStep)}
              data-testid="appeal-opinion-submit"
              variant="primary"
              size="md"
            >
              {activeStep.button}
            </Button>
          </div>
        </div>
      )}

      {/* WIT0919 — บรรจุระเบียบวาระ */}
      {folder.stage === 'agenda' && !folder.agendaAt && isCommittee && (
        <div className="space-y-2" data-testid="appeal-agenda">
          <input
            value={agendaNo}
            onChange={(e) => setAgendaNo(e.target.value)}
            placeholder="ระเบียบวาระ / ครั้งที่ประชุม"
            data-testid="appeal-agenda-no"
            className="ws-input"
          />
          <div className="ws-actions justify-end">
            <Button
              type="button"
              variant="primary"
              size="md"
              onClick={handleAgenda}
              data-testid="appeal-agenda-submit"
            >
              บรรจุระเบียบวาระเสนอคณะกรรมการ
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
