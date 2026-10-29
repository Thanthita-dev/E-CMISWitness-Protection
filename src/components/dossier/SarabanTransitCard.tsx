import React from 'react'
import { Link } from '@tanstack/react-router'
import type { CaseItem } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { Badge } from '../common/Badge'
import {
  SARABAN_CHECKPOINT_META, activeSarabanCheckpoint, canRecordSaraban,
  sarabanCheckpointProgress, sarabanCheckpointLabel } from '../../lib/saraban'

/**
 * สถานะทะเบียนหนังสือรับ-ส่ง (สารบรรณ) ของแฟ้ม — อ่านอย่างเดียวสำหรับทุกบทบาท
 * ธุรการที่มีสิทธิ์ลงทะเบียนจะมีลิงก์ไปหน้า /saraban/$caseNo (การกรอกเลขและส่งต่อทำที่หน้านั้นเท่านั้น)
 */
export const SarabanTransitCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const currentRole = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId) ?? undefined
  const cp = activeSarabanCheckpoint(caseItem)

  if (!cp || (caseItem.sarabanDispatch?.flow === 'termination' && caseItem.kb17?.deliveredAt)) {
    return null
  }

  const meta = { ...SARABAN_CHECKPOINT_META[cp], label: sarabanCheckpointLabel(caseItem, cp) }
  const progress = sarabanCheckpointProgress(caseItem, cp)
  const canRecord = canRecordSaraban(currentRole, caseItem, cp, orgUnitId)

  return (
    <section data-testid="saraban-transit-card" data-checkpoint={cp} className="ws-card border-l-4 border-l-gold space-y-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[1.1rem] font-bold text-navy">รอ{meta.label}</h2>
        </div>
        <Badge variant={progress.complete ? 'success' : 'warning'} icon={progress.complete ? 'fa-circle-check' : 'fa-clock'}>
          <span data-testid="saraban-progress">ลงทะเบียนแล้ว {progress.done.length}/{progress.recipients.length} ผู้รับ</span>
        </Badge>
      </header>

      {canRecord && (
        <div className="flex flex-wrap justify-end">
          <Link to="/saraban/$caseNo" params={{ caseNo: caseItem.no }} data-testid="saraban-open-link"
            className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white transition hover:bg-blue">
            <i className="fa-solid fa-stamp" aria-hidden="true" />ไปหน้าทะเบียนสารบรรณ
          </Link>
        </div>
      )}

    </section>
  )
}
