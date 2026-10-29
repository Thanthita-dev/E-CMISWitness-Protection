import React from 'react'
import { isKb15StageReviewer, kb15PendingStage, kb15StageLabel } from '../../lib/protectionHandoff'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { clauseFromDraft } from '../../lib/terminationRules'
import { SectionCard } from './SectionCard'
import { CaseItem } from '../../types/case'
import { TERMINATION_TRIGGERS } from '../../lib/constants'
import {
  terminationClauseLabel,
} from '../../lib/terminationProgress'
import { Kb15ReviewActions } from './Kb15ReviewActions'
import { TerminationReasonFields } from './TerminationReasonFields'

/**
 * ขั้น 11C — จัดทำเรื่องยุติการคุ้มครอง (คบ.7 / คบ.15) · WIT1124-WIT1134
 *
 * กฎที่หน้านี้บังคับ (WIT1130): การยุติยังไม่เกิดขึ้นเพียงเพราะรับ คบ.7 หรือจัดทำ คบ.15
 * ต้องรอคำสั่ง คบ.16 ที่ลงนามและถึงวันที่มีผลก่อน
 */
export const Kb15Section: React.FC<{ caseItem: CaseItem; role: string; initialSource?: 'witness_kb7' }> = ({ caseItem, role }) => {
  const navigate = useNavigate()
  const formState = useFormDraftStore()
  const draft = selectCaseDraft(formState, 15, caseItem.no)
  const clause = clauseFromDraft(draft)
  const kb15 = caseItem.kb15
  const trigger = caseItem.terminationTrigger

  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  const isKb15Reviewer = isKb15StageReviewer(role, caseItem)
  const kb15Stage = kb15PendingStage(caseItem)

  return (
    <SectionCard
      title={trigger || kb15 ? "จัดทำ คบ.15" : undefined}
    >
      {isOfficer && (!kb15 || ['draft', 'returned'].includes(kb15.status)) && <div className="mb-5">
        <TerminationReasonFields caseItem={caseItem} section="choice" onClauseSelected={(selected) => {
          if (selected === 2) void navigate({ to: '/form/$formId', params: { formId: '15' }, search: { caseNo: caseItem.no, from: 'termination' } })
        }} />
        <div className="mt-4 flex justify-end">
          <Button type="button" variant="primary" size="lg" className="min-w-[140px] rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue" disabled={!clause || Boolean(formState.locks[15]) || (clause === 4 && !draft['เหตุยุติ'])}
            onClick={() => void navigate({ to: '/form/$formId', params: { formId: clause === 1 ? '7' : '15' }, search: { caseNo: caseItem.no, from: 'termination' } })}>
            ตกลง
          </Button>
        </div>
      </div>}
      {/* ---------- สถานะ คบ.15 ---------- */}
      {kb15 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-1">
          <div>
            <strong>คบ.15 ฉบับที่ {kb15.version}</strong> ·{' '}
            {TERMINATION_TRIGGERS.find((t) => t.value === kb15.trigger)?.label}
          </div>
          <div>{kb15.summary}</div>
          {kb15.regulationClause && (
            <div data-testid="kb15-regulation-clause">
              {terminationClauseLabel(kb15.regulationClause)} ·{' '}
              {kb15.regulationClause === 4 ? 'แจ้งสิทธิอุทธรณ์ตามข้อ 19' : 'บันทึกเหตุสิ้นสุดแล้ว'}
            </div>
          )}
          {kb15.evidenceNote && <div className="text-[0.8rem] text-muted">{kb15.evidenceNote}</div>}
          <div>
            สถานะ:{' '}
            {kb15Stage
              ? `รอ${kb15StageLabel(kb15Stage, caseItem)}${kb15Stage === 'secretary' ? 'ลงนาม' : 'ตรวจ'}`
              : kb15.status === 'endorsed'
                ? 'เลขาธิการพิจารณาและลงนามแล้ว — จัดทำคำสั่ง คบ.16'
                : 'ส่งคืนแก้ไข'}
            {kb15.reviewNote ? ` · ${kb15.reviewNote}` : ''}
          </div>
          {(kb15.approvalHistory || []).length > 0 && (
            <ol className="list-decimal pl-5 text-[0.8rem] text-muted" data-testid="kb15-approval-history">
              {kb15.approvalHistory!.map((h) => (
                <li key={`${h.role}-${h.at}`}>
                  {kb15StageLabel(h.role, caseItem)} · {h.endorsed ? (h.role === 'secretary' ? 'ลงนาม' : 'เห็นชอบ') : 'ส่งคืน'} · {h.by} · {h.at}
                  {h.note ? ` · ${h.note}` : ''}
                </li>
              ))}
            </ol>
          )}
          {(kb15.previousVersions || []).length > 0 && (
            <div className="text-[0.8rem] text-muted">
              เก็บฉบับเดิมไว้ {kb15.previousVersions?.length} ฉบับ — ไม่แก้ทับ
            </div>
          )}
        </div>
      )}

      {/* ---------- WIT1131 / WIT1132 / WIT1133 / WIT1134 — ตรวจและเสนอผู้มีอำนาจ ---------- */}
      {isKb15Reviewer && <Kb15ReviewActions caseItem={caseItem} />}
    </SectionCard>
  )
}
