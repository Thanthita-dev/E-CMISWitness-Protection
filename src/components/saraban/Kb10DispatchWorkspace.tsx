import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { kb10ClerkAllowed } from '../../lib/noticeDocuments'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { Button } from '../common/Button'
import { SarabanNumberDialog } from './SarabanNumberDialog'
import { formatSarabanDate } from '../../lib/saraban'
import { FormPaperViewer } from '../forms/FormPaperViewer'

export const Kb10DispatchWorkspace: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const auth = useAuthStore()
  const [numberDialogOpen, setNumberDialogOpen] = useState(false)
  const [channel, setChannel] = useState('ไปรษณีย์ตอบรับด่วน (EMS)')
  const [tracking, setTracking] = useState('')
  const [error, setError] = useState('')
  if ((!caseItem.kb10DispatchRequestedAt && !caseItem.kb10DispatchNumbering) || caseItem.activity7State !== 'rejected' || !caseItem.resultNotices?.[10]?.original || caseItem.sarabanDispatch || !kb10ClerkAllowed(auth.currentRole, caseItem, auth.currentOrgUnitId)) return null
  const numbered = caseItem.kb10DispatchNumbering
  const sent = caseItem.resultNotices[10].status === 'sent'
  return <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-4 items-start">
    <FormPaperViewer formId={10} caseNo={caseItem.no} bare />
    <div className="ws-card p-5 space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[1.05rem] font-bold text-navy">ผู้รับ (1)</h2>
        <span className="text-[0.8rem] text-muted">ลงทะเบียนแล้ว {numbered ? 1 : 0}/1 ผู้รับ</span>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-navy">1. {caseItem.person || 'ผู้ยื่นคำร้องขอคุ้มครองพยาน'}</p>
          <p className={`text-sm ${numbered ? 'text-success' : 'text-muted'}`}>{numbered ? `เลขทะเบียนส่ง ${numbered.registryNumber || '-'} · หนังสือ ${numbered.number} · ${formatSarabanDate(numbered.date)}` : 'ยังไม่ออกเลข'}</p>
        </div>
        {!numbered && <Button type="button" variant="primary" size="md" onClick={() => setNumberDialogOpen(true)}><i className="fa-solid fa-stamp" />ออกเลข</Button>}
      </div>
      {numberDialogOpen && <SarabanNumberDialog caseItem={caseItem} checkpoint="director_outgoing" recipient={caseItem.person || 'ผู้ยื่นคำร้องขอคุ้มครองพยาน'} index={0} kb10Dispatch onClose={() => setNumberDialogOpen(false)} />}
      {numbered && <div className="border-t border-line pt-4 space-y-4">
        {sent ? <div className="space-y-3">
          <p className="ws-status success">{caseItem.deliveredAt ? 'พยานได้รับหนังสือแล้ว' : 'ส่งหนังสือแล้ว · รอผลนำส่ง'}</p>
          {!caseItem.deliveredAt ? <>
            <p className="text-sm text-muted">ยืนยันเมื่อพยานได้รับหนังสือแล้ว ระบบจะใช้วันที่วันนี้เป็นวันรับหนังสือ{caseItem.appealResolution ? ' โดยไม่เปิดสิทธิอุทธรณ์ซ้ำ' : 'และเริ่มนับระยะเวลาอุทธรณ์'}</p>
            <Button type="button" variant="primary" size="md" className="w-full" onClick={() => {
              useCaseStore.getState().recordDelivery(caseItem.no, new Date().toISOString())
              if (!useCaseStore.getState().getCase(caseItem.no)?.deliveredAt) setError('บันทึกไม่สำเร็จ กรุณาตรวจสอบสถานะและสิทธิ์')
            }}>ยืนยันนำส่งสำเร็จ</Button>
          </> : caseItem.appealResolution ? <p className="ws-callout">คำวินิจฉัยอุทธรณ์เป็นที่สุด — ไม่มีการอุทธรณ์รอบที่ 2</p> : <Link to="/appeal-folder/$caseNo" params={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-navy px-4 py-3 font-semibold text-white">รับคำอุทธรณ์</Link>}
        </div> : <>
          <label className="block"><span className="ws-label">ช่องทางนำส่ง *</span><select className="ws-input w-full" value={channel} onChange={(e) => setChannel(e.target.value)}><option>ไปรษณีย์ตอบรับด่วน (EMS)</option><option>ส่งมอบโดยตรงถึงตัวพยาน</option></select></label>
          {channel.includes('EMS') && <label className="block"><span className="ws-label">เลขติดตามพัสดุ *</span><input className="ws-input w-full" value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="ระบุเลขติดตามพัสดุ" /></label>}
          <Button type="button" variant="primary" size="md" className="w-full" onClick={() => {
            setError('')
            if (channel.includes('EMS') && !tracking.trim()) { setError('กรุณาระบุเลขติดตามพัสดุ'); return }
            useCaseStore.getState().recordDispatch(caseItem.no, channel, channel.includes('EMS') ? tracking.trim() : '')
            if (useCaseStore.getState().getCase(caseItem.no)?.resultNotices?.[10]?.status !== 'sent') setError('บันทึกไม่สำเร็จ กรุณาตรวจสถานะและสิทธิ์นำส่ง')
          }}>บันทึกการนำส่ง</Button>
        </>}
      </div>}
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
    </div>
  </section>
}
