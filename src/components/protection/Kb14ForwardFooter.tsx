import React from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { canSubmitKb14, submitKb14Draft } from '../../lib/kb14Submit'
import { sarabanInTransit } from '../../lib/saraban'
import { canActOnKb14, Kb14DecisionActions } from './Kb14DecisionActions'

interface Kb14ForwardFooterProps {
  caseItem: CaseItem
  role: string
  /** สิทธิ์ลงมือในแฟ้มของเจ้าหน้าที่ (เจ้าของสำนวน) — ปิดเมื่อดูอย่างเดียว */
  canEdit?: boolean
}

/**
 * ขั้น 11B — ส่ง/ส่งต่อ คบ.14 ตามลำดับชั้น อยู่นอกหน้าแบบฟอร์ม (หน้าแบบฟอร์มมีแค่บันทึก)
 * เจ้าหน้าที่ → ผู้บังคับบัญชาชั้นต้น → ผอ.กอง → รองเลขาธิการ → เลขาธิการ
 * แต่ละชั้นต้องลงนาม คบ.6 ฉบับขยายเวลาก่อน ปุ่มส่งต่อชั้นถัดไป/อนุมัติจึงกดได้
 */
export const Kb14ForwardFooter: React.FC<Kb14ForwardFooterProps> = ({ caseItem, role, canEdit = true }) => {
  const draft = useFormDraftStore((s) => selectCaseDraft(s, 14, caseItem.no))
  const latest = caseItem.extensionRequests?.at(-1)
  const canSubmit = canEdit && canSubmitKb14(caseItem, role)
  const reviewing = Boolean(latest && canActOnKb14(latest, role, caseItem))
  const inTransit = sarabanInTransit(caseItem, 'kb14')
  if (!canSubmit && !reviewing && !inTransit) return null

  const reason = String(draft['เหตุผลขยายเวลา'] || '').trim()

  const handleSubmit = () => {
    showConfirmAlert({
      icon: 'question',
      title: 'ส่ง คบ.14 ให้ผู้บังคับบัญชาชั้นต้น?',
      html: confirmBody(`ขอขยายระยะเวลาคุ้มครองของแฟ้ม ${caseItem.no}`, [['เหตุผล', reason || '-']], 'ผู้บังคับบัญชาชั้นต้นลงนาม คบ.6 แล้วจึงส่งต่อตามลำดับชั้น'),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่ง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      const error = submitKb14Draft(caseItem)
      if (error) return showToast(error, 'warning')
      showToast(latest?.status === 'returned' ? 'จัดทำ คบ.14 เวอร์ชันใหม่แล้ว ส่งให้ผู้บังคับบัญชาชั้นต้นอีกครั้ง' : 'ส่งแบบ คบ.14 ให้ผู้บังคับบัญชาชั้นต้นแล้ว')
    })
  }

  return (
    <section className="ws-card space-y-4 p-5" data-testid="kb14-forward-footer">
      {inTransit && (
        <p className="rounded-xl border border-line bg-soft p-3 text-[0.8rem] font-medium text-ink" data-testid="kb14-in-transit-note">
          <i className="fa-solid fa-inbox mr-2 text-amber-500" aria-hidden="true" />
          อยู่ระหว่างธุรการลงทะเบียนนำส่ง
        </p>
      )}

      {canSubmit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            size="lg"
            disabled={!reason}
            title={reason ? undefined : 'กรุณาบันทึกแบบ คบ.14 พร้อมเหตุผลก่อนจึงส่งได้'}
            onClick={handleSubmit}
            data-testid="kb14-submit-button"
          >
            ส่งให้ผู้บังคับบัญชาชั้นต้น
            <i className="fa-solid fa-arrow-right" aria-hidden="true" />
          </Button>
        </div>
      )}

      {reviewing && latest && <Kb14DecisionActions caseItem={caseItem} proposal={latest} role={role} forwardOnly className="flex justify-end" />}
    </section>
  )
}
