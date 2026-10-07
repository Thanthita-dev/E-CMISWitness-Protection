import React, { useState } from 'react'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/** ค่า default เมื่อไม่ระบุความเห็น — single source of truth ให้ทุกจุดที่เรียก reviewKb15 ใช้ค่าเดียวกัน */
export const KB15_DEFAULT_REVIEW_NOTE = 'เอกสารครบถ้วน'

interface Kb15ReviewActionsProps {
  caseItem: CaseItem
  /** เรียกหลังยืนยันการกระทำสำเร็จ (ปิด modal/นำทาง ฯลฯ) — endorsed บอกว่าเป็นการเห็นชอบหรือส่งคืน */
  onDone?: (endorsed: boolean) => void
  className?: string
}

/**
 * WIT1131-WIT1134 — จุดตัดสินใจตรวจ คบ.15 หนึ่งเดียว
 *
 * ใช้ร่วมกันโดย Kb15Section (แท็บ 11C แบบ inline) และ Kb15ReviewModal (จากแถวแบบฟอร์มในแฟ้ม)
 * เพื่อไม่ให้ default ความเห็นเพี้ยนไปคนละทาง
 */
export const Kb15ReviewActions: React.FC<Kb15ReviewActionsProps> = ({ caseItem, onDone, className }) => {
  const reviewKb15 = useCaseStore((s) => s.reviewKb15)
  const [note, setNote] = useState('')
  const kb15 = caseItem.kb15

  if (!kb15 || kb15.status !== 'submitted') return null

  const handleReview = (endorse: boolean) => {
    if (!endorse && !note.trim()) {
      showToast('กรุณาระบุเหตุผลที่ส่งคืน', 'warning')
      return
    }
    showConfirmAlert({
      icon: endorse ? 'question' : 'warning',
      title: endorse ? 'ยืนยันเอกสารครบถ้วน?' : 'ยืนยันส่งคืนแก้ไข?',
      html: confirmBody(
        `ตรวจ คบ.15 ฉบับที่ ${kb15.version} ของแฟ้ม ${caseItem.no}`,
        [
          ['เหตุแห่งการยุติ', kb15.summary || '-'],
          ['ความเห็น', note.trim() || (endorse ? KB15_DEFAULT_REVIEW_NOTE : '-')],
        ],
        endorse
          ? 'เห็นชอบและเสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติ (คบ.16) ต่อไป'
          : 'แฟ้มกลับไปให้เจ้าหน้าที่จัดทำ คบ.15 เวอร์ชันใหม่ โดยไม่แก้ทับฉบับเดิม'
      ),
      showCancelButton: true,
      confirmButtonText: endorse ? 'ยืนยันครบถ้วน' : 'ยืนยันส่งคืน',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      reviewKb15(caseItem.no, endorse, note.trim() || KB15_DEFAULT_REVIEW_NOTE)
      setNote('')
      showToast(
        endorse ? 'เห็นชอบ คบ.15 และเสนอผู้มีอำนาจพิจารณาออกคำสั่งยุติแล้ว' : 'ส่งคืนแก้ไข คบ.15 แล้ว'
      )
      onDone?.(endorse)
    })
  }

  return (
    <div className={className ?? 'space-y-2 border-t border-slate-200 pt-3'}>
      <p className="text-[0.8rem] text-muted">
        ตรวจ คบ.15 เหตุผลและเอกสารประกอบ พร้อมบันทึกความเห็นตามลำดับชั้น
      </p>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="ความเห็น / เหตุผลที่ส่งคืน"
        className="ws-input w-full"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => handleReview(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          ครบถ้วน · เสนอผู้มีอำนาจ
        </Button>
        <Button
          type="button"
          onClick={() => handleReview(false)}
          className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
        >
          ส่งคืนแก้ไข
        </Button>
      </div>
    </div>
  )
}
