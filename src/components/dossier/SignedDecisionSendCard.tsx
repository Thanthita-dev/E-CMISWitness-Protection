import React from 'react'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { showConfirmAlert, showToast } from '../../lib/swal'

export const SignedDecisionSendCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const role = useAuthStore((state) => state.currentRole)
  const [busy, setBusy] = React.useState(false)
  if (caseItem.protectionHandoff?.step !== 'pending_send') return null
  const formNo = caseItem.activity7State === 'rejected' ? 10 : 9
  const send = async () => {
    if (busy) return
    setBusy(true)
    try {
      const answer = await showConfirmAlert({ title: 'ส่งให้ธุรการสำนักงานเลขาธิการออกเลข?', text: 'หลังออกเลขส่ง เรื่องจะไปยังธุรการหน่วยงานปลายทางเพื่อลงเลขรับก่อนส่งต่อผู้รับผิดชอบ', showCancelButton: true, confirmButtonText: 'ยืนยันส่ง', cancelButtonText: 'ยกเลิก' })
      if (!answer.isConfirmed) return
      const ok = useCaseStore.getState().sendSignedDecision(caseItem.no)
      showToast(ok ? 'ส่งให้ธุรการสำนักงานเลขาธิการแล้ว' : 'ยังส่งไม่ได้ กรุณาตรวจสอบสถานะและสิทธิ์', ok ? 'success' : 'warning')
    } finally { setBusy(false) }
  }
  return <section className="ws-card p-5 space-y-3" data-testid="signed-decision-send">
    <h2 className="font-semibold text-navy">คบ.{formNo}{formNo === 9 && caseItem.policeLetters ? ' และหนังสือตำรวจทั้งสองฉบับ' : formNo === 9 && caseItem.coordinationApproval?.signature ? ' และหนังสือประสานหน่วยงาน' : ''} ลงนามแล้ว · รอส่ง</h2>
    {['secretary', 'admin'].includes(role) && <div className="flex justify-end"><Button type="button" variant="primary" size="md" disabled={busy} onClick={send}><i className="fa-solid fa-paper-plane" />ส่งให้ธุรการออกเลข</Button></div>}
  </section>
}
