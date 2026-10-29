import React, { useId, useState } from 'react'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { showToast } from '../../lib/swal'
import type { SarabanCheckpoint } from '../../types/case'
import {
  SARABAN_CHECKPOINT_META,
  canRecordSaraban,
  formatSarabanDate,
  sarabanRecordFor,
  suggestSarabanInput,
  validateSarabanInput,
} from '../../lib/saraban'

interface SarabanFormEntryProps {
  caseNo: string
  checkpoint: SarabanCheckpoint
  /** ผู้รับที่เลขนี้ออกให้ — เลขสารบรรณออกต่อผู้รับ ไม่ใช่ต่อ คบ. */
  recipient: string
  /** ลำดับผู้รับในจุดนี้ (ใช้ตั้ง testid) */
  index?: number
  /** แถวเดียว — ใช้ในรายการของแฟ้ม */
  compact?: boolean
}

/** ช่องลงทะเบียนเลขรับ/เลขทะเบียนส่งของผู้รับหนึ่งราย (ครอบคลุมทุก คบ. ในชุด) ณ จุดส่งต่อหนึ่งจุด */
export const SarabanFormEntry: React.FC<SarabanFormEntryProps> = ({ caseNo, checkpoint, recipient, index = 0, compact = false }) => {
  const uid = useId()
  const caseItem = useCaseStore((s) => s.cases.find((c) => c.no === caseNo))
  const recordSaraban = useCaseStore((s) => s.recordSaraban)
  const role = useAuthStore((s) => s.currentRole)
  const orgUnitId = useAuthStore((s) => s.currentOrgUnitId) ?? undefined
  const [editing, setEditing] = useState(false)
  const [input, setInput] = useState(() => suggestSarabanInput(caseItem || { sarabanRecords: [] }, checkpoint, new Date(), recipient))
  const [errors, setErrors] = useState<Partial<Record<'number' | 'date' | 'time', string>>>({})

  if (!caseItem) return null
  const meta = SARABAN_CHECKPOINT_META[checkpoint]
  const record = sarabanRecordFor(caseItem, checkpoint, recipient)
  const canRecord = canRecordSaraban(role, caseItem, checkpoint, orgUnitId)
  const showForm = canRecord && (!record || editing)

  const startEdit = () => {
    if (record) setInput({ number: record.number, date: record.date, time: record.time })
    setErrors({})
    setEditing(true)
  }

  const submit = () => {
    const found = validateSarabanInput(input)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (recordSaraban(caseNo, checkpoint, recipient, input)) {
      setEditing(false)
      showToast(`บันทึก${meta.numberLabel}ถึง ${recipient} แล้ว`)
    }
  }

  if (record && !showForm) {
    return (
      <div data-testid={`saraban-entry-${checkpoint}-${index}`} className={`ws-readonly text-[0.88rem] ${compact ? 'flex flex-wrap items-center gap-x-4 gap-y-1' : 'grid gap-1'}`}>
        <span><span className="text-muted">{meta.numberLabel} </span><strong className="text-navy-deep">{record.number}</strong></span>
        <span><span className="text-muted">วันที่ </span>{formatSarabanDate(record.date)}</span>
        <span><span className="text-muted">เวลา </span>{record.time} น.</span>
        <span className="text-muted">{record.clerkName} · {record.unitName}</span>
        {canRecord && (
          <Button type="button" variant="secondary" size="sm" onClick={startEdit}>
            <i className="fa-solid fa-pen" aria-hidden="true" />แก้ไข
          </Button>
        )}
      </div>
    )
  }

  if (!showForm) {
    return (
      <p data-testid={`saraban-pending-${checkpoint}-${index}`} className="text-[0.88rem] text-muted">
        <i className="fa-solid fa-hourglass-half mr-1.5" aria-hidden="true" />รอธุรการลงทะเบียน
      </p>
    )
  }

  const inputClass = 'min-h-[44px] w-full rounded-[7px] border border-[#aebdca] bg-white px-3 py-[0.66rem] text-[0.88rem] text-ink'
  const errorText = (msg?: string) => msg ? <small role="alert" className="mt-0.5 block text-[0.8rem] font-semibold text-danger">{msg}</small> : null

  return (
    <div data-testid={`saraban-entry-form-${checkpoint}-${index}`} className="space-y-3">
      <div className={compact ? 'grid grid-cols-1 gap-3 sm:grid-cols-3' : 'grid grid-cols-1 gap-3 md:grid-cols-3'}>
        <div className="ws-field min-w-0">
          <label htmlFor={`${uid}-number`} className="ws-label">{meta.numberLabel}</label>
          <input id={`${uid}-number`} type="text" className={inputClass} value={input.number} aria-invalid={Boolean(errors.number)}
            onChange={(e) => setInput({ ...input, number: e.target.value })} />
          {errorText(errors.number)}
        </div>
        <div className="ws-field min-w-0">
          <label htmlFor={`${uid}-date`} className="ws-label">วันที่</label>
          <input id={`${uid}-date`} type="date" className={inputClass} value={input.date} aria-invalid={Boolean(errors.date)}
            onChange={(e) => setInput({ ...input, date: e.target.value })} />
          <ThaiDateHint value={input.date} />
          {errorText(errors.date)}
        </div>
        <div className="ws-field min-w-0">
          <label htmlFor={`${uid}-time`} className="ws-label">เวลา</label>
          <input id={`${uid}-time`} type="time" className={inputClass} value={input.time} aria-invalid={Boolean(errors.time)}
            onChange={(e) => setInput({ ...input, time: e.target.value })} />
          {errorText(errors.time)}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        {editing && <Button type="button" variant="secondary" size="md" onClick={() => setEditing(false)}>ยกเลิก</Button>}
        <Button type="button" variant="primary" size="md" onClick={submit}>
          <i className="fa-solid fa-stamp" aria-hidden="true" />บันทึกเลขทะเบียน
        </Button>
      </div>
    </div>
  )
}
