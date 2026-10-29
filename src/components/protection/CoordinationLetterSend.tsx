import React, { useState } from 'react'
import type { CaseItem, OfficialLetter } from '../../types/case'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { OFFICIAL_LETTER_CHANNELS } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { formatSarabanDate } from '../../lib/saraban'

/**
 * ช่องทางนำส่ง + ปุ่ม "ยืนยันนำส่งหนังสือประสาน" ของหนังสือที่ธุรการออกเลขแล้ว
 * ใช้ร่วมกันทั้งหน้าวิธีที่ 4 ของเจ้าหน้าที่และหน้าทะเบียนสารบรรณของธุรการ — ใครกดก่อนก็ได้
 */
export const CoordinationLetterSend: React.FC<{
  caseItem: CaseItem
  agencyNoun: string
  /** ปิดหน้าต่างหนังสือก่อนเปิดจอยืนยัน (ซ้อน dialog ไม่ได้) และเปิดคืนเมื่อยกเลิก */
  onConfirmOpen?: () => void
  onCancel?: () => void
  onSent?: () => void
}> = ({ caseItem, agencyNoun, onConfirmOpen, onCancel, onSent }) => {
  const send = useCaseStore((s) => s.sendCoordinationLetter)
  const [channel, setChannel] = useState<NonNullable<OfficialLetter['channel']>>('direct')
  const [trackingNo, setTrackingNo] = useState('')
  const co = caseItem.methodTracks?.find((t) => t.method === 4)?.coordination
  const draft = co?.letterDraft

  const handleSend = () => {
    if (!draft) return
    onConfirmOpen?.()
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกหนังสือประสานขาออก?',
      html: confirmBody(
        'บันทึกหนังสือประสานขอความร่วมมือคุ้มครองพยานเข้าทะเบียนหนังสือของวิธีนี้',
        [
          ['หน่วยงานปลายทาง', co?.agency || '-'],
          ['เลขที่หนังสือ', draft.registryNo],
          ['ลงวันที่', formatSarabanDate(draft.registryDate)],
          ['ช่องทางนำส่ง', OFFICIAL_LETTER_CHANNELS.find((c) => c.value === channel)?.label || channel],
          ['เลขติดตาม', trackingNo.trim() || '-'],
        ],
        `บันทึกหนังสือประสานพร้อมฉบับที่นำส่ง และเปิดขั้นแนบหนังสือตอบรับจาก${agencyNoun}`
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึกหนังสือขาออก',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) { onCancel?.(); return }
      if (!send(caseItem.no, { channel, trackingNo })) {
        showToast('สถานะหนังสือหรือสิทธิ์เปลี่ยนไปแล้ว กรุณาตรวจสอบอีกครั้ง', 'warning')
        return
      }
      showToast('บันทึกหนังสือประสานขาออกแล้ว')
      onSent?.()
    })
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className="ws-label">ส่งหนังสือประสานโดย</span>
          <select aria-label="ส่งหนังสือประสานโดย" className="ws-input w-full" value={channel} onChange={(e) => setChannel(e.target.value as typeof channel)}>
            <option value="direct">เจ้าหน้าที่ส่งมอบด้วยตนเอง</option><option value="post">ไปรษณีย์</option>
          </select>
        </label>
        {channel === 'post' && <label className="block"><span className="ws-label">เลขติดตามไปรษณีย์</span><input className="ws-input w-full" value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} /></label>}
      </div>
      <Button type="button" variant="primary" size="md" onClick={handleSend} data-testid="coordination-send-outgoing">ยืนยันนำส่งหนังสือประสาน</Button>
    </div>
  )
}
