import React from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { FORMS_CATALOG } from '../../lib/constants'
import { SARABAN_CHECKPOINT_META, SARABAN_CHECKPOINT_ORDER, activeSarabanCheckpoint, canRecordSaraban, formatSarabanDate, sarabanFormsFor, sarabanRecordsCovering, sarabanRecordForms, sarabanCheckpointLabel } from '../../lib/saraban'
import { Link } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { FormCaseScope } from './FormCaseScope'

interface FormSarabanPanelProps {
  /** แบบ คบ. ที่กำลังเปิดอยู่ */
  formId: number
}

/**
 * แท็บ "ทะเบียนสารบรรณ" ในหน้ากรอกแบบฟอร์ม
 * ดูสถานะและประวัติเลขรับ/เลขทะเบียนส่งของแบบนี้ทุกจุดและทุกรอบ — อ่านอย่างเดียว
 * การลงทะเบียนทำที่หน้า /saraban/$caseNo (ธุรการเท่านั้น)
 */
export const FormSarabanPanel: React.FC<FormSarabanPanelProps> = ({ formId }) => {
  const meta = FORMS_CATALOG.find((f) => f.n === formId)
  const code = meta?.code || `คบ.${formId}`
  const scopeCaseNo = React.useContext(FormCaseScope)
  const ownerCaseNo = useFormDraftStore((s) => s.draftCaseNo[formId])
  const caseNo = scopeCaseNo ?? ownerCaseNo
  const caseItem = useCaseStore((s) => (caseNo ? s.cases.find((c) => c.no === caseNo) : undefined))
  const role = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId) ?? undefined

  const checkpoint = caseItem ? activeSarabanCheckpoint(caseItem) : null
  const activeHere = caseItem && checkpoint && sarabanFormsFor(caseItem, checkpoint).includes(formId) ? checkpoint : null
  const history = (caseItem?.sarabanRecords || [])
    .filter((r) => sarabanRecordForms(r).includes(formId))
    .sort((a, b) => (a.round - b.round) || (SARABAN_CHECKPOINT_ORDER.indexOf(a.checkpoint) - SARABAN_CHECKPOINT_ORDER.indexOf(b.checkpoint)))

  return (
    <div data-testid="form-saraban-panel" className="space-y-4">
      <div className="border-b border-line pb-3">
        <h4 className="text-[1.05rem] font-bold text-navy">
          <i className="fa-solid fa-stamp mr-1.5 text-blue" />
          ทะเบียนสารบรรณของแบบ {code}
        </h4>
        <p className="text-[0.8rem] text-muted">
          เลขรับ/เลขทะเบียนส่ง วันที่ และเวลา ที่ธุรการลงทุกครั้งที่แบบนี้ส่งต่อระหว่างหน่วยงาน — ตราประทับจะแสดงที่มุมขวาบนของหน้าแรกในตัวอย่างกระดาษ
        </p>
      </div>

      {!caseItem ? (
        <div className="ws-readonly text-[0.88rem]">
          <i className="fa-solid fa-circle-info mr-1.5" aria-hidden="true" />
          แบบนี้ยังไม่ผูกกับแฟ้มคำร้อง — เปิดจากแฟ้มคำร้องเพื่อดูทะเบียนสารบรรณ
        </div>
      ) : (
        <>
          {activeHere && (
            <section className="ws-callout space-y-2" data-testid="form-saraban-status">
              <div className="text-[0.88rem] font-semibold text-navy">รอ{sarabanCheckpointLabel(caseItem, activeHere)}</div>
              <div className="text-[0.88rem]">
                {(() => { const rs = sarabanRecordsCovering(caseItem, activeHere, formId); return rs.length
                  ? rs.map((r) => <div key={r.id}>ลงทะเบียนแล้ว{r.recipient ? ` · ถึง ${r.recipient}` : ''} · {SARABAN_CHECKPOINT_META[activeHere].numberLabel} <strong>{r.number}</strong> · {formatSarabanDate(r.date)} {r.time} น.</div>)
                  : 'แบบนี้ยังไม่ได้ลงทะเบียน ณ จุดนี้ (ลงเลขตามผู้รับของทั้งชุดที่หน้าทะเบียนสารบรรณ)' })()}
              </div>
              {checkpoint && canRecordSaraban(role, caseItem, checkpoint, orgUnitId) && (
                <Link to="/saraban/$caseNo" params={{ caseNo: caseItem.no }} data-testid="form-saraban-open-link"
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.88rem] font-semibold text-white transition hover:bg-blue">
                  <i className="fa-solid fa-stamp" aria-hidden="true" />ไปหน้าทะเบียนสารบรรณเพื่อลงเลข
                </Link>
              )}
            </section>
          )}

          <div className="ws-table-wrap">
            <table className="ws-table min-w-[640px]" data-testid="form-saraban-history">
              <thead>
                <tr>
                  <th>รอบ</th><th>จุดลงทะเบียน</th><th>ผู้รับ</th><th>เลขที่</th><th>วันที่</th><th>เวลา</th><th>ผู้ลงทะเบียน</th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={7} className="text-center text-muted">ยังไม่มีการลงทะเบียนรับ-ส่ง</td></tr>
                ) : history.map((r) => (
                  <tr key={r.id}>
                    <td>{r.round}</td>
                    <td className="whitespace-nowrap">{SARABAN_CHECKPOINT_META[r.checkpoint].short}</td>
                    <td>{r.recipient || '-'}</td>
                    <td><span className="text-muted">{SARABAN_CHECKPOINT_META[r.checkpoint].numberLabel} </span><strong>{r.number}</strong></td>
                    <td className="whitespace-nowrap">{formatSarabanDate(r.date)}</td>
                    <td className="whitespace-nowrap">{r.time} น.</td>
                    <td>{r.clerkName}<div className="text-[0.8rem] text-muted">{r.unitName}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
