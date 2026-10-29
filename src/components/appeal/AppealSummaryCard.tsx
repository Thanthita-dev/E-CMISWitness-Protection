import React from 'react'
import type { CaseItem } from '../../types/case'
import { formatThaiDate } from '../../lib/utils'
import { Badge } from '../common/Badge'

export const AppealSummaryCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const folder = caseItem.appealFolder
  if (!folder) return null
  const intake = folder.intake
  const late = (folder.lateDays || 0) > 0
  const notice = caseItem.appealAgainst === 'kb17' ? 'คบ.17' : 'คบ.10'
  const deliveredAt = caseItem.appealKb6PreviousResult?.deliveredAt || caseItem.deliveredAt

  return (
    <section className="ws-card space-y-3 p-4" aria-labelledby="appeal-summary-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="appeal-summary-title" className="font-bold text-navy">คำอุทธรณ์คำสั่ง {notice}</h2>
        <Badge variant={late ? 'danger' : 'success'}>{late ? 'ยื่นเกินกำหนด' : 'ยื่นภายในกำหนด'}</Badge>
      </div>
      <div className="text-[0.88rem]">
        <span className="font-semibold text-muted">เหตุผลที่ขออุทธรณ์: </span>
        <span className="whitespace-pre-wrap break-words text-ink">{caseItem.appealReason || 'ยังไม่บันทึกเหตุผล'}</span>
      </div>
      <details className="border-t border-line pt-2 text-[0.82rem]">
        <summary className="cursor-pointer font-medium text-blue">ข้อมูลการรับคำอุทธรณ์ · {caseItem.appealFiledAt || 'ยังไม่บันทึก'}</summary>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><dt className="text-muted">ช่องทางรับ</dt><dd>{intake?.channel === 'letter' ? 'รับผ่านสารบรรณกลาง' : 'รับด้วยวาจา'}</dd></div>
          <div><dt className="text-muted">พยานได้รับ {notice}</dt><dd>{deliveredAt ? formatThaiDate(deliveredAt) : 'ยังไม่บันทึก'}</dd></div>
          {intake?.channel === 'letter' && <>
            <div><dt className="text-muted">เลขรับสารบรรณ</dt><dd>{intake.registryNo}</dd></div>
            <div><dt className="text-muted">รับเอกสารครั้งแรก</dt><dd>{formatThaiDate(intake.firstReceivedAt)}</dd></div>
          </>}
          {intake?.channel === 'oral' && <div className="sm:col-span-2"><dt className="text-muted">บันทึกถ้อยคำ</dt><dd className="whitespace-pre-wrap break-words">{intake.statement}</dd></div>}
        </dl>
      </details>
    </section>
  )
}
