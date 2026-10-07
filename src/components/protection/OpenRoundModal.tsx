import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { addDays, currentReportPeriod, thaiMonthName } from '../../lib/utils'
import { showToast } from '../../lib/swal'

interface OpenRoundModalProps {
  caseItem: CaseItem
  open: boolean
  onClose: () => void
}

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * WIT1004 — รวบรวมผลการปฏิบัติของทุกวิธี + หลักฐาน + รายงานภายนอก แล้วเปิดรอบรายงาน คบ.13
 *
 * เปิดจากปุ่ม "เปิดรอบรายงานงวด {เดือน}" ที่การ์ด WIT1004 แทนที่จะแปะฟอร์มไว้กลางหน้าตลอด
 * เหมือนรูปแบบเดียวกับ ReceiveReportModal / ReviewBranchModal
 */
export const OpenRoundModal: React.FC<OpenRoundModalProps> = ({ caseItem, open, onClose }) => {
  const { openKb13Round } = useCaseStore()
  const period = currentReportPeriod()
  const [from, setFrom] = useState(addDays(todayIso(), -30).slice(0, 10))
  const [to, setTo] = useState(todayIso())
  const [evidence, setEvidence] = useState('')

  if (!open) return null

  const events = caseItem.importantEvents || []

  const handleSubmit = () => {
    openKb13Round(caseItem.no, {
      period,
      periodFrom: from,
      periodTo: to,
      evidenceRefs: evidence
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    })
    showToast(`เปิดรอบรายงาน คบ.13 งวด ${thaiMonthName(period)} แล้ว`)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col ws-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-deep">
              <i className="fa-solid fa-folder-plus text-blue" />
              <span>เปิดรอบรายงานงวด {thaiMonthName(period)}</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              บันทึกปฏิบัติ + หลักฐาน + รายงานภายนอก เมื่อถึงรอบหรือมีเหตุสำคัญ
            </p>
          </div>
          <Button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted hover:bg-slate-200 text-[0.8rem]">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="ws-label">ช่วงรายงาน — ตั้งแต่</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="ws-input w-full"
              />
            </label>
            <label className="block">
              <span className="ws-label">ช่วงรายงาน — ถึง</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="ws-input w-full"
              />
            </label>
          </div>

          <label className="block">
            <span className="ws-label">
              หลักฐาน/บันทึกที่รวบรวมได้ (บรรทัดละรายการ)
            </span>
            <textarea
              rows={4}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              className="ws-input w-full"
            />
          </label>

          <p className="text-[0.8rem] text-muted">
            เหตุสำคัญที่บันทึกไว้ในแฟ้มช่วงนี้: {events.length} รายการ — จะถูกนับเข้ารอบรายงานนี้อัตโนมัติ
          </p>

          <Button
            type="button"
            onClick={handleSubmit}
            className="w-full rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition"
          >
            <i className="fa-solid fa-folder-plus mr-1.5" />
            เปิดรอบรายงานงวด {thaiMonthName(period)}
          </Button>
        </div>
      </div>
    </div>
  )
}
