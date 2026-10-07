import { noticeForCase, noticeWorkerAllowed, NOTICE_STATUS_LABELS } from '../../lib/noticeDocuments'
import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { isCaseWorkerRole, APPEAL_WINDOW_DAYS } from '../../lib/constants'
import { daysUntil } from '../../lib/utils'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/** ขั้นของเส้นทางไม่อนุมัติตามผัง 09A — 0 ร่าง → 1 เสนอกลั่นกรอง → 2 ผ่านกลั่นกรอง → 3 ลงนาม → 4 ส่งออก/ปิด */
const STEP_LABEL = [
  'จัดทำร่าง คบ.10',
  'เจ้าหน้าที่ตรวจครบแล้ว · รอรองเลขาธิการฯ กลั่นกรอง',
  'ผ่านการกลั่นกรอง · เข้ารอบลงนาม คบ.10',
  'ลงนาม คบ.10 แล้ว',
  'สิ้นสุดกระบวนการไม่อนุมัติ',
]

/**
 * Sheet 09A · WIT0904 → WIT0905 → WIT0909
 *
 * สองด่านที่ผังแยกเป็น node ต่างหากก่อนถึงผู้ลงนาม คบ.10 และปลายทาง "ไม่อุทธรณ์"
 * ด่านกลั่นกรองของรองเลขาธิการฯ มีไว้กันความผิดพลาดเรื่องข้อความแจ้งสิทธิอุทธรณ์
 * จึงเป็นเงื่อนไขของรอบลงนาม (`outgoingSubmitted`) ไม่ใช่ป้ายสถานะเฉย ๆ
 *
 * ทุกปุ่มในการ์ดนี้เปลี่ยนเจ้าของงานหรือสถานะแฟ้ม จึงผ่านจอยืนยันทุกปุ่ม
 */
export const Kb10ScreeningCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { submitKb10ForScreening, screenKb10ByDeputy, closeNonApprovalCase } = useCaseStore()
  const { currentRole } = useAuthStore()

  const [readinessNote, setReadinessNote] = useState(
    'ตรวจร่าง คบ.10 แล้ว — เหตุผลที่ไม่อนุมัติ ฐานการพิจารณา และข้อความแจ้งสิทธิอุทธรณ์ภายใน 30 วัน ครบถ้วน'
  )
  const [deputyNote, setDeputyNote] = useState('')
  const [closeNote, setCloseNote] = useState('')
  const [waiverNote, setWaiverNote] = useState('')
  const [waiverEvidence, setWaiverEvidence] = useState('')

  const step = caseItem.nonApprovalStep || 0
  const document = noticeForCase(caseItem)
  const isOfficer = isCaseWorkerRole(currentRole) && (!document || noticeWorkerAllowed(currentRole, caseItem, useAuthStore.getState().currentOfficerUserId))
  const isDeputy = currentRole === 'deputy_secretary' || currentRole === 'admin'

  const appealDaysLeft = daysUntil(caseItem.appealDueAt)
  /** WIT0908 แขนง "ไม่อุทธรณ์" — เปิดปุ่มปิดเรื่องเฉพาะเมื่อพ้น 30 วันแล้วและยังไม่มีใครยื่น */
  const appealWindowExpired =
    Boolean(caseItem.deliveredAt) && !caseItem.appealFiledAt && appealDaysLeft !== null && appealDaysLeft < 0
  const closed = Boolean(caseItem.nonApprovalClosedAt)
  /** WIT0908 — พยานรับ คบ.10 แล้วแต่ยังอยู่ในกรอบ 30 วันและยังไม่ยื่น: บันทึกคำแจ้งไม่ประสงค์อุทธรณ์ได้ก่อนครบกำหนด */
  const canRecordWaiver =
    Boolean(caseItem.deliveredAt) && !caseItem.appealFiledAt && !appealWindowExpired && isOfficer

  const handleSubmit = () => {
    if (!readinessNote.trim()) {
      showToast('กรุณาบันทึกผลการตรวจความครบถ้วนของร่าง คบ.10', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: 'เสนอรองเลขาธิการฯ กลั่นกรอง คบ.10?',
      html: confirmBody(
        'ยืนยันว่าร่าง คบ.10 ครบถ้วนแล้ว จึงเสนอขึ้นกลั่นกรองก่อนถึงผู้มีอำนาจลงนาม',
        [
          ['แฟ้มคำร้อง', `${caseItem.no} · ${caseItem.person}`],
          ['ผลการตรวจของเจ้าหน้าที่', readinessNote.trim()],
        ],
        'แฟ้มย้ายไปอยู่กับ <strong>รองเลขาธิการฯ</strong> เพื่อกลั่นกรอง · รอบลงนาม คบ.10 จะยังเปิดไม่ได้จนกว่าจะผ่านด่านนี้'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเสนอกลั่นกรอง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      submitKb10ForScreening(caseItem.no, readinessNote.trim())
      showToast('เสนอรองเลขาธิการฯ กลั่นกรอง คบ.10 แล้ว')
    })
  }

  const handleScreen = (pass: boolean) => {
    if (!deputyNote.trim()) {
      showToast(pass ? 'กรุณาบันทึกความเห็นการกลั่นกรอง' : 'กรุณาระบุข้อสังเกตที่ต้องแก้ไข', 'warning')
      return
    }
    showConfirmAlert({
      icon: pass ? 'question' : 'warning',
      title: pass ? 'กลั่นกรองผ่านและเสนอผู้ลงนาม?' : 'ส่งร่าง คบ.10 กลับแก้ไข?',
      html: confirmBody(
        `รองเลขาธิการฯ กลั่นกรอง คบ.10 ของแฟ้ม ${caseItem.no}`,
        [
          ['ผู้ยื่นคำร้อง', caseItem.person],
          ['ผลการตรวจของเจ้าหน้าที่', caseItem.kb10ReadinessNote || '-'],
          [pass ? 'ความเห็นการกลั่นกรอง' : 'ข้อสังเกตที่ต้องแก้ไข', deputyNote.trim()],
        ],
        pass
          ? 'ยืนยันว่าข้อความ คบ.10 <strong>ตรงกับผลพิจารณา</strong> และ<strong>แจ้งสิทธิอุทธรณ์ครบถ้วน</strong> · แฟ้มย้ายไปอยู่กับเลขาธิการฯ และเปิดรอบลงนาม คบ.10'
          : 'แฟ้มกลับไปอยู่กับ<strong>เจ้าหน้าที่ผู้รับผิดชอบ</strong> เพื่อแก้ร่างแล้วเสนอกลั่นกรองใหม่ · รอบลงนามยังไม่เปิด'
      ),
      showCancelButton: true,
      confirmButtonText: pass ? 'ยืนยันกลั่นกรองผ่าน' : 'ยืนยันส่งกลับแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      screenKb10ByDeputy(caseItem.no, pass, deputyNote.trim())
      setDeputyNote('')
      showToast(pass ? 'กลั่นกรองผ่าน — เปิดรอบลงนาม คบ.10 แล้ว' : 'ส่งร่าง คบ.10 กลับให้เจ้าหน้าที่แก้ไขแล้ว')
    })
  }

  const handleWaiver = () => {
    if (!waiverEvidence.trim()) {
      showToast('กรุณาระบุหลักฐานคำแจ้งของพยาน (หนังสือสละสิทธิ์/บันทึกถ้อยคำลงชื่อ)', 'warning')
      return
    }
    if (!waiverNote.trim()) {
      showToast('กรุณาบันทึกข้อความที่พยานแจ้งไม่ประสงค์อุทธรณ์', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'บันทึกพยานไม่ประสงค์อุทธรณ์และปิดเรื่อง?',
      html: confirmBody(
        'พยานแจ้งชัดเจนว่าไม่ประสงค์อุทธรณ์ก่อนครบกรอบ 30 วัน — สิ้นสุดกระบวนการไม่อนุมัติ',
        [
          ['แฟ้มคำร้อง', `${caseItem.no} · ${caseItem.person}`],
          ['วันที่พยานได้รับ คบ.10', caseItem.deliveredAt || '-'],
          ['ครบกำหนดอุทธรณ์', `${caseItem.appealDueAt || '-'} (ยังไม่พ้นกำหนด)`],
          ['ข้อความที่พยานแจ้ง', waiverNote.trim()],
          ['หลักฐานคำแจ้งของพยาน', waiverEvidence.trim()],
        ],
        'แฟ้มถูก<strong>ปิดอย่างเป็นทางการ</strong> และพยานไม่สามารถยื่นอุทธรณ์ต่อได้อีก'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันปิดเรื่อง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      closeNonApprovalCase(caseItem.no, waiverNote.trim(), { evidence: waiverEvidence.trim() })
      setWaiverNote('')
      setWaiverEvidence('')
      showToast('บันทึกพยานไม่ประสงค์อุทธรณ์และปิดเรื่องแล้ว')
    })
  }

  const handleClose = () => {
    if (!closeNote.trim()) {
      showToast('กรุณาบันทึกเหตุผลการปิดเรื่อง', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'ปิดกระบวนการไม่อนุมัติ?',
      html: confirmBody(
        `พ้นกรอบอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันแล้วโดยไม่มีการยื่นอุทธรณ์ — ปิดเรื่อง`,
        [
          ['แฟ้มคำร้อง', `${caseItem.no} · ${caseItem.person}`],
          ['วันที่พยานได้รับ คบ.10', caseItem.deliveredAt || '-'],
          ['ครบกำหนดอุทธรณ์', `${caseItem.appealDueAt || '-'} (พ้นมาแล้ว ${Math.abs(appealDaysLeft ?? 0)} วัน)`],
          ['บันทึกการปิดเรื่อง', closeNote.trim()],
        ],
        'แฟ้มถูก<strong>ปิดอย่างเป็นทางการ</strong> ไม่ค้างสถานะ "รออุทธรณ์" อีกต่อไป · เป็นการปิดฝั่ง คบ.10 คนละเส้นทางกับการยุติการคุ้มครอง (คบ.17)'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันปิดเรื่อง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      closeNonApprovalCase(caseItem.no, closeNote.trim())
      setCloseNote('')
      showToast('ปิดกระบวนการไม่อนุมัติแล้ว')
    })
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 text-[0.8rem]" data-testid="kb10-screening-card">
      <div className="font-bold text-amber-900">
        <i className="fa-solid fa-user-shield mr-1.5" />
        {document ? 'การรับแจ้งผลและสิทธิอุทธรณ์ คบ.10' : 'ด่านก่อนลงนาม คบ.10 — ตรวจความครบถ้วนและกลั่นกรองข้อความแจ้งสิทธิอุทธรณ์'}
      </div>

      <div
        className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.88rem] leading-relaxed text-slate-600"
        data-testid="kb10-screening-step"
      >
        ขั้นปัจจุบัน: <span className="font-bold text-slate-800">{document && !closed ? NOTICE_STATUS_LABELS[document.status] : STEP_LABEL[Math.min(step, STEP_LABEL.length - 1)]}</span>
        {caseItem.kb10ReadinessCheckedAt && (
          <div className="mt-1">
            เจ้าหน้าที่ตรวจครบ: {caseItem.kb10ReadinessCheckedBy} · {caseItem.kb10ReadinessCheckedAt}
            {caseItem.kb10ReadinessNote ? ` — ${caseItem.kb10ReadinessNote}` : ''}
          </div>
        )}
        {caseItem.kb10DeputyScreenedAt && (
          <div className="mt-1 text-emerald-800">
            รองเลขาธิการฯ กลั่นกรองผ่าน: {caseItem.kb10DeputyScreenedBy} · {caseItem.kb10DeputyScreenedAt}
            {caseItem.kb10DeputyScreenNote ? ` — ${caseItem.kb10DeputyScreenNote}` : ''}
          </div>
        )}
        {caseItem.kb10DeputyReturnNote && (
          <div className="mt-1 font-bold text-rose-700">
            ข้อสังเกตให้แก้ไขจากรองเลขาธิการฯ: {caseItem.kb10DeputyReturnNote}
          </div>
        )}
      </div>

      {/* WIT0904 — ชั้นเจ้าหน้าที่ผู้รับผิดชอบ */}
      {!document && isOfficer && step === 0 && !caseItem.kb10SignedAt && (
        <div className="space-y-2" data-testid="kb10-readiness">
          <label className="block">
            <span className="block font-bold text-slate-700 mb-1">ผลการตรวจความครบถ้วนของร่าง คบ.10 *</span>
            <textarea
              rows={3}
              value={readinessNote}
              onChange={(e) => setReadinessNote(e.target.value)}
              data-testid="kb10-readiness-note"
              className="ws-input w-full text-ink"
            />
          </label>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={handleSubmit}
              data-testid="kb10-submit-screening"
              variant="primary"
              size="md"
            >
              <i className="fa-solid fa-paper-plane" />
              เสนอรองเลขาธิการฯ กลั่นกรอง
            </Button>
          </div>
        </div>
      )}

      {/* WIT0905 — ชั้นรองเลขาธิการฯ */}
      {!document && isDeputy && step === 1 && (
        <div className="space-y-2" data-testid="kb10-deputy">
          <p className="text-[0.88rem] leading-relaxed text-amber-900">
            ตรวจว่าข้อความใน คบ.10 ตรงกับผลพิจารณา และมีข้อความแจ้งสิทธิอุทธรณ์ภายใน {APPEAL_WINDOW_DAYS} วันครบถ้วน
            ก่อนถึงมือผู้ลงนาม
          </p>
          <textarea
            rows={3}
            value={deputyNote}
            onChange={(e) => setDeputyNote(e.target.value)}
            placeholder="ความเห็นการกลั่นกรอง หรือข้อสังเกตที่ต้องแก้ไข"
            data-testid="kb10-deputy-note"
            className="ws-input w-full text-ink"
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              onClick={() => handleScreen(false)}
              data-testid="kb10-deputy-return"
              variant="secondary"
              size="md"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              ส่งกลับแก้ไข
            </Button>
            <Button
              type="button"
              onClick={() => handleScreen(true)}
              data-testid="kb10-deputy-pass"
              variant="primary"
              size="md"
            >
              กลั่นกรองผ่าน · เสนอผู้ลงนาม
            </Button>
          </div>
        </div>
      )}

      {/* WIT0909 — ปลายทาง "ไม่อุทธรณ์" เปิดเฉพาะเมื่อพ้นกรอบ 30 วันแล้ว */}
      {closed ? (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-[0.8rem] text-slate-700" data-testid="kb10-closed">
          <strong className="block">
            <i className="fa-solid fa-circle-check mr-1.5" />
            ปิดกระบวนการไม่อนุมัติแล้วเมื่อ {caseItem.nonApprovalClosedAt} โดย {caseItem.nonApprovalClosedBy}
          </strong>
          <div className="mt-1">{caseItem.nonApprovalCloseNote}</div>
        </div>
      ) : (
        canRecordWaiver && (
          <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3" data-testid="kb10-waiver">
            <div className="font-bold text-slate-800">
              <i className="fa-solid fa-user-slash mr-1.5" />
              พยานแจ้งไม่ประสงค์อุทธรณ์ (บันทึกก่อนครบกรอบ {APPEAL_WINDOW_DAYS} วันได้)
            </div>
            <textarea
              rows={2}
              value={waiverNote}
              onChange={(e) => setWaiverNote(e.target.value)}
              placeholder="ข้อความที่พยานแจ้ง เช่น พยานแจ้งทางโทรศัพท์/ด้วยตนเองว่าไม่ประสงค์อุทธรณ์คำสั่งไม่อนุมัติ"
              data-testid="kb10-waiver-note"
              className="ws-input w-full text-ink"
            />
            <input
              value={waiverEvidence}
              onChange={(e) => setWaiverEvidence(e.target.value)}
              placeholder="หลักฐาน * เช่น หนังสือสละสิทธิ์อุทธรณ์ / บันทึกถ้อยคำที่พยานลงชื่อ"
              data-testid="kb10-waiver-evidence"
              className="ws-input w-full text-ink"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleWaiver}
                data-testid="kb10-waiver-submit"
                variant="primary"
                size="md"
              >
                <i className="fa-solid fa-box-archive" />
                บันทึกพยานไม่ประสงค์อุทธรณ์ · ปิดเรื่อง
              </Button>
            </div>
          </div>
        )
      )}
      {!closed && (
        appealWindowExpired &&
        isOfficer && (
          <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3" data-testid="kb10-close">
            <div className="font-bold text-slate-800">
              <i className="fa-solid fa-flag-checkered mr-1.5" />
              พ้นกรอบอุทธรณ์ {APPEAL_WINDOW_DAYS} วันแล้ว {Math.abs(appealDaysLeft ?? 0)} วัน และไม่มีการยื่นอุทธรณ์
            </div>
            <textarea
              rows={2}
              value={closeNote}
              onChange={(e) => setCloseNote(e.target.value)}
              placeholder="บันทึกการปิดเรื่อง เช่น ตรวจสอบแล้วไม่มีคำอุทธรณ์เข้าระบบภายในกำหนด"
              data-testid="kb10-close-note"
              className="ws-input w-full text-ink"
            />
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={handleClose}
                data-testid="kb10-close-submit"
                variant="primary"
                size="md"
              >
                <i className="fa-solid fa-box-archive" />
                ปิดเรื่อง — ไม่อุทธรณ์ภายในกำหนด
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  )
}
