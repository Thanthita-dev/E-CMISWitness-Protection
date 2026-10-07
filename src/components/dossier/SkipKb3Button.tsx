import { Button } from '../common/Button'
import React, { useState } from 'react'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast, MySwal } from '../../lib/swal'

const DEFAULT_SKIP_REASON = 'ระบุข้อเท็จจริงและพฤติการณ์ภัยคุกคามไว้ครบถ้วนแล้วในแบบ คบ.1'

const SkipKb3ModalBody: React.FC<{
  onCancel: () => void
  onConfirm: (reason: string) => void
}> = ({ onCancel, onConfirm }) => {
  const [reason, setReason] = useState(DEFAULT_SKIP_REASON)

  return (
    <div className="space-y-3 text-left">
      <p className="text-[0.88rem] text-slate-600 leading-relaxed">
        เจ้าหน้าที่สามารถข้าม คบ.3 ได้หากระบุรายละเอียดใน คบ.1 ครบถ้วนแล้ว
        แต่ <strong>ต้องบันทึกเหตุผลในการกดข้ามไว้ในระบบ</strong>
      </p>
      <div>
        <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เหตุผลในการกดข้าม *</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="ws-input w-full text-ink"
        />
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          size="md"
        >
          ยกเลิก
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(reason)}
          variant="primary"
          size="md"
        >
          <i className="fa-solid fa-check" />
          ยืนยันข้าม คบ.3
        </Button>
      </div>
    </div>
  )
}

interface SkipKb3ButtonProps {
  caseItem: CaseItem
  onActionComplete?: () => void
}

/**
 * ปุ่มข้าม / กู้คืน คบ.3 ประจำแถวแบบฟอร์ม คบ.3 ในแฟ้มคำร้อง
 * ข้ามต้องระบุเหตุผลเสมอ ส่วนการกู้คืนทำได้ทันทีเพื่อให้แก้ความผิดพลาดได้ง่าย
 */
export const SkipKb3Button: React.FC<SkipKb3ButtonProps> = ({ caseItem, onActionComplete }) => {
  const { skipKb3, undoSkipKb3 } = useCaseStore()

  const handleSkipClick = () => {
    MySwal.fire({
      title: 'กดข้ามการจัดทำแบบ คบ.3',
      html: (
        <SkipKb3ModalBody
          onCancel={() => MySwal.close()}
          onConfirm={(reason) => {
            if (!reason.trim()) {
              showToast('ต้องระบุเหตุผลในการกดข้าม คบ.3')
              return
            }
            skipKb3(caseItem.no, reason, caseItem.assignedOfficer)
            MySwal.close()
            showToast('บันทึกการข้าม คบ.3 พร้อมเหตุผลเรียบร้อยแล้ว')
            onActionComplete?.()
          }}
        />
      ),
      showConfirmButton: false,
      showCloseButton: true,
      customClass: { popup: 'font-sans rounded-xl' },
    })
  }

  const handleRestore = () => {
    undoSkipKb3(caseItem.no)
    showToast('กู้คืนแบบ คบ.3 กลับเข้าแฟ้มแล้ว')
    onActionComplete?.()
  }

  return (
    <Button
      type="button"
      onClick={() => (caseItem.kb3Skipped ? handleRestore() : handleSkipClick())}
      variant="secondary"
      size="md"
    >
      <i className={`fa-solid ${caseItem.kb3Skipped ? 'fa-rotate-left' : 'fa-forward'} text-[0.8rem]`} />
      {caseItem.kb3Skipped ? 'กู้คืน คบ.3' : 'กดข้าม คบ.3 (ระบุเหตุผล)'}
    </Button>
  )
}
