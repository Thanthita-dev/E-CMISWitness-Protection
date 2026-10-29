import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { MySwal, showToast } from '../../lib/swal'
import { AppealFolderWorkflowCard } from './AppealFolderWorkflowCard'
import { sarabanInTransit } from '../../lib/saraban'

/**
 * งานอุทธรณ์ในแฟ้มคดี (09B) — ย้ายมาจากหน้าแฟ้มคำอุทธรณ์เดิม
 * คำอุทธรณ์ผูกกับแฟ้มเดิมจึงทำทุกขั้นที่นี่: ตรวจครบถ้วน/กรอบ 30 วัน · ความเห็นตามลำดับชั้นพร้อมบันทึกเพิ่มเติม (อุทธรณ์) ของ คบ.3/คบ.6
 * · บรรจุวาระ · มติคณะกรรมการ · หนังสือแจ้งผลอุทธรณ์
 */
export const AppealCaseSection: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { recordAppealResolution } = useCaseStore()
  const { currentRole } = useAuthStore()

  /** WIT0920-0922 — มติคณะกรรมการ: ยกคำร้อง หรือเปลี่ยนแปลงคำสั่ง */
  const [destination, setDestination] = useState<'original_owner' | 'got' | ''>('')

  /** WIT0920 — มติคณะกรรมการเป็นที่สุด จึงต้องผ่านจอยืนยันที่บอกผลลัพธ์ของแต่ละแขนงก่อนบันทึก */
  const handleResolution = async (outcome: 'uphold' | 'overturn') => {
    if (!destination) { showToast('กรุณาเลือกหน่วยงานรับดำเนินการหลังพิจารณา', 'warning'); return }
    const result = await MySwal.fire({
      title: outcome === 'uphold' ? 'ไม่อนุมัติคุ้มครอง · ยกคำร้องอุทธรณ์' : 'อนุมัติคุ้มครอง · เปลี่ยนแปลงคำสั่ง',
      html: '<label class="ws-label" for="appeal-resolution-no">เลขที่มติ</label><input id="appeal-resolution-no" class="swal2-input" placeholder="เลขที่มติ"><label class="ws-label" for="appeal-resolution-note">สาระสำคัญของคำวินิจฉัย</label><textarea id="appeal-resolution-note" class="swal2-textarea" placeholder="เหตุผลและสาระสำคัญ"></textarea>',
      showCancelButton: true, confirmButtonText: 'ยืนยันผลพิจารณา', cancelButtonText: 'ยกเลิก',
      preConfirm: () => {
        const resolutionNo = (document.getElementById('appeal-resolution-no') as HTMLInputElement).value.trim()
        const note = (document.getElementById('appeal-resolution-note') as HTMLTextAreaElement).value.trim()
        if (!resolutionNo || !note) { MySwal.showValidationMessage('กรุณาระบุเลขที่มติและสาระสำคัญของคำวินิจฉัย'); return false }
        return { resolutionNo, note }
      },
    })
    if (!result.isConfirmed || !result.value) return
    recordAppealResolution(caseItem.no, { ...result.value, outcome, destination })
    if (useCaseStore.getState().getCase(caseItem.no)?.appealResolution) showToast('บันทึกผลพิจารณาอุทธรณ์และส่งต่อแล้ว')
  }

  const handleReturn = async () => {
    const result = await MySwal.fire({ title: 'ส่งกลับแก้ไข', input: 'textarea', inputLabel: 'เหตุผลที่ส่งกลับ', showCancelButton: true, confirmButtonText: 'ยืนยันส่งกลับ', cancelButtonText: 'ยกเลิก', inputValidator: (value) => value.trim() ? undefined : 'กรุณาระบุเหตุผล' })
    if (!result.isConfirmed) return
    useCaseStore.getState().returnAppealForCorrection(caseItem.no, result.value)
  }

  const isCommittee = ['committee', 'admin'].includes(currentRole)
  /** อุทธรณ์คำสั่งยุติ (คบ.17) ผูกกับ คบ.17/หลักฐานการรับ ไม่สร้าง คบ.1 ใหม่ (WIT1147) */

  return (
    <section className="space-y-6" aria-label="การดำเนินงานอุทธรณ์" data-testid="dossier-appeal-section">
      {/* WIT0914-WIT0919 — ลำดับชั้นแฟ้มอุทธรณ์ */}
      <AppealFolderWorkflowCard caseItem={caseItem} />

      {/* WIT0921 / WIT0922 — หนังสือแจ้งผลอุทธรณ์และหลักฐานการรับ */}


      {/* WIT0919-0922 — ฝ่ายเลขานุการบรรจุวาระและบันทึกมติคณะกรรมการ */}
      {isCommittee && !caseItem.appealResolution && caseItem.appealFolder?.stage === 'agenda' && !sarabanInTransit(caseItem, 'appeal') && (
        <div className="ws-card p-5 space-y-3">
          <h2 className="ws-section-title !mb-0 border-b border-line pb-4"><i className="fa-solid fa-stamp mr-3" />ผลพิจารณาอุทธรณ์ของคณะกรรมการ ป.ป.ท.</h2>
          <label className="block py-3"><span className="ws-label">หน่วยงานรับดำเนินการหลังพิจารณา</span>
            <select className="ws-input" value={destination} onChange={(e) => setDestination(e.target.value as typeof destination)}>
              <option value="">เลือกหน่วยงานปลายทาง</option><option value="original_owner">กองของเจ้าของสำนวนเดิม</option><option value="got">กอท.</option>
            </select>
          </label>
          <div className="ws-actions justify-end pb-4">
            <Button type="button" onClick={() => handleResolution('uphold')} variant="secondary" size="md" className="!border-red-200 !text-red-800"><i className="fa-solid fa-ban" />ไม่อนุมัติคุ้มครอง</Button>
            <Button type="button" onClick={() => handleResolution('overturn')} variant="primary" size="md"><i className="fa-solid fa-signature" />อนุมัติคุ้มครอง</Button>
          </div>
          <div className="flex items-center justify-between border-t border-line pt-4"><span className="text-muted">การดำเนินการอื่น</span><Button type="button" variant="secondary" size="md" onClick={handleReturn}><i className="fa-solid fa-rotate-left" />ส่งกลับแก้ไข</Button></div>
        </div>
      )}

      {caseItem.appealResolution && (
        <div className="ws-card border-success/30 !bg-success-soft p-5 text-[0.88rem] text-success-dark space-y-1">
          <div className="font-bold">
            มติคณะกรรมการที่ {caseItem.appealResolution.resolutionNo} ·{' '}
            {caseItem.appealResolution.outcome === 'uphold' ? 'ยกคำร้อง' : 'เปลี่ยนแปลงคำสั่ง'}
          </div>
          <div>{caseItem.appealResolution.note}</div>
          {sarabanInTransit(caseItem, 'appeal') && <div className="text-[0.8rem] font-bold" data-testid="appeal-resolution-in-transit">อยู่ระหว่างธุรการลงทะเบียนนำส่งผลวินิจฉัยถึงหน่วย — เจ้าหน้าที่ดำเนินการต่อได้หลังธุรการบันทึกรับเข้า</div>}

          <div className="text-[0.8rem]">
            วินิจฉัยเมื่อ {caseItem.appealResolution.resolvedAt} · คำวินิจฉัยของคณะกรรมการ ป.ป.ท. เป็นที่สุด
            {caseItem.appealResolution.outcome === 'overturn' &&
              ' — ดำเนินการจัดทำข้อตกลง คบ.11'}
          </div>
        </div>
      )}
    </section>
  )
}
