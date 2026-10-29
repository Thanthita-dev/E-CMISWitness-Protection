import React from 'react'
import type { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { Link } from '@tanstack/react-router'
import { FormCodeTooltip } from '../common/FormCodeTooltip'

export const AppealKb10Card: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const resolution = caseItem.appealResolution
  const applies = resolution?.outcome === 'uphold' && caseItem.appealAgainst !== 'kb17'
  React.useEffect(() => {
    if (!applies || !resolution || caseItem.appealKb10) return
    useCaseStore.getState().updateCase(caseItem.no, {
      appealClosedAt: resolution.resolvedAt,
      appealKb10: { createdAt: resolution.resolvedAt, fields: {
        'คำร้องลงวันที่': caseItem.createdAt?.slice(0, 10) || '',
        'แจ้งผลอุทธรณ์': 'true',
              'สาระสำคัญ': `คณะกรรมการ ป.ป.ท. มีมติที่ ${resolution.resolutionNo} ยกคำร้องอุทธรณ์ และยืนยันคำสั่งไม่ให้ได้รับการคุ้มครองพยาน เนื่องจาก ${resolution.note}`,
      } },
      status: 'คณะกรรมการยกคำร้อง · ปิดขั้นอุทธรณ์',
      next: 'ปิดขั้นอุทธรณ์แล้ว · จัดทำ คบ.10 ฉบับใหม่เพื่อแจ้งผลมติคณะกรรมการ',
    })
  }, [applies, resolution, caseItem.no, caseItem.appealKb10])
  if (!applies || !caseItem.appealKb10) return null
  return <div className="rounded-xl border border-[#e6cf86] bg-[#fdf8e7] px-3 py-2">
    <div className="grid min-h-[4rem] cursor-pointer list-none grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem] [&::-webkit-details-marker]:hidden">
      <div className="flex min-w-0 items-center gap-3">
        <FormCodeTooltip formNo={10}><span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue">คบ.10</span></FormCodeTooltip>
        <div className="min-w-0"><strong className="block text-[0.88rem] font-semibold text-navy">หนังสือแจ้งคำสั่งไม่ให้พยานได้รับการคุ้มครอง</strong><span className="text-[0.8rem] text-muted">ฉบับใหม่แจ้งผลอุทธรณ์</span></div>
      </div>
      <span className="ws-status justify-self-start sm:justify-self-center">{caseItem.appealKb10.snapshot ? 'ลงนามแล้ว' : 'รอลงนาม'}</span>
      <Link to="/form/$formId" params={{ formId: '10' }} search={{ caseNo: caseItem.no, appealNotice: true }} className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] justify-self-end rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-slate-50"><i className="fa-solid fa-pen-to-square text-xs" />เปิดแบบฟอร์ม</Link>
    </div>
  </div>
}
