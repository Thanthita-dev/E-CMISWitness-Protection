import React from 'react'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'
import { MySwal, showToast } from '../../lib/swal'
import { sarabanInTransit } from '../../lib/saraban'

export function ReferralCommitteeCard({ caseItem }: { caseItem: CaseItem }) {
  const role = useAuthStore(s => s.currentRole)
  const a = caseItem.article14
  if (!a || a.step !== 'committee_pending') return null
  const canAct = ['committee', 'admin'].includes(role) && Boolean(a.committeeSentAt) && !sarabanInTransit(caseItem, 'article14') && Boolean(a.secretarySignature)
  const resolve = async (approved: boolean) => {
    const result = await MySwal.fire({
      title: approved ? 'อนุมัติส่งต่อกรมคุ้มครองสิทธิฯ' : 'ไม่อนุมัติส่งต่อกรมคุ้มครองสิทธิฯ',
      html: '<label class="ws-label" for="referral-resolution-no">เลขที่มติ</label><input id="referral-resolution-no" class="swal2-input" placeholder="เลขที่มติ"><label class="ws-label" for="referral-resolution-note">สาระสำคัญของคำวินิจฉัย</label><textarea id="referral-resolution-note" class="swal2-textarea" placeholder="เหตุผลและสาระสำคัญ"></textarea>',
      showCancelButton: true, confirmButtonText: 'ยืนยันผลพิจารณา', cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const no = (document.getElementById('referral-resolution-no') as HTMLInputElement).value.trim()
        const note = (document.getElementById('referral-resolution-note') as HTMLTextAreaElement).value.trim()
        if (!no || !note) { MySwal.showValidationMessage('กรุณาระบุเลขที่มติและสาระสำคัญของคำวินิจฉัย'); return false }
        return { no, note }
      },
    })
    if (!result.isConfirmed || !result.value) return
    useCaseStore.getState().recordArticle14Resolution(caseItem.no, result.value.no, approved, result.value.note)
    if (useCaseStore.getState().getCase(caseItem.no)?.article14?.committeeResolutionNo === result.value.no) showToast('บันทึกมติและส่งผลกลับเจ้าหน้าที่ผ่านธุรการแล้ว')
  }
  return <section className="space-y-4" data-testid="referral-committee-card">
    <h3 className="ws-section-title border-b border-line pb-4">ผลพิจารณาส่งต่อกรมคุ้มครองสิทธิฯ ของคณะกรรมการ ป.ป.ท.</h3>
    {a.committeeSentAt && <p className="ws-callout text-sm leading-relaxed" data-testid="referral-committee-sent">
      <i className="fa-solid fa-paper-plane mr-1.5" aria-hidden="true" />
      ส่งให้คณะกรรมการแล้ว · {a.committeeSentAt}{a.committeeSentBy ? ` · โดย ${a.committeeSentBy}` : ''}
    </p>}
    {canAct ? <>
      <div className="ws-actions justify-end pb-4">
        <Button variant="secondary" size="md" onClick={() => resolve(false)} className="!border-red-200 !text-red-800"><i className="fa-solid fa-ban" />ไม่อนุมัติส่งต่อ</Button>
        <Button variant="primary" size="md" onClick={() => resolve(true)}><i className="fa-solid fa-signature" />อนุมัติส่งต่อ</Button>
      </div>
      <div className="flex items-center justify-between border-t border-line pt-4"><span className="text-muted">การดำเนินการอื่น</span><Button variant="secondary" size="md" onClick={async () => {
        const result = await MySwal.fire({ title: 'ส่งกลับแก้ไข', input: 'textarea', inputLabel: 'เหตุผลที่ส่งกลับ', showCancelButton: true, confirmButtonText: 'ยืนยันส่งกลับ', cancelButtonText: 'ยกเลิก', inputValidator: value => value.trim() ? undefined : 'กรุณาระบุเหตุผล' })
        if (result.isConfirmed) useCaseStore.getState().returnArticle14Committee(caseItem.no, result.value)
      }}><i className="fa-solid fa-rotate-left" />ส่งกลับแก้ไข</Button></div>
    </> : <p className="text-muted">{!a.secretarySignature ? 'รอเลขาธิการลงนามบันทึกเสนอประธานกรรมการ' : !a.committeeSentAt ? 'ยังไม่ได้ส่งให้คณะกรรมการ' : sarabanInTransit(caseItem, 'article14') ? 'อยู่ระหว่างธุรการลงทะเบียนนำส่ง' : 'รอฝ่ายเลขานุการคณะกรรมการบันทึกมติ · ดำเนินการต่อด้วยบทบาทฝ่ายเลขานุการคณะกรรมการ'}</p>}
  </section>
}
