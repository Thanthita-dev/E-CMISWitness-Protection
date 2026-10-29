import React, { useId, useState } from 'react'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast } from '../../lib/swal'
import type { CaseItem, SarabanCheckpoint } from '../../types/case'
import { FORMS_CATALOG } from '../../lib/constants'
import {
  SARABAN_CHECKPOINT_META,
  nextOutgoingSarabanNumber,
  formatSarabanDate,
  sarabanFormsFor,
  sarabanRecordFor,
  sarabanUnitName,
  suggestSarabanInput,
  validateSarabanInput,
} from '../../lib/saraban'

interface SarabanNumberDialogProps {
  caseItem: CaseItem
  checkpoint: SarabanCheckpoint
  recipient: string
  /** ลำดับผู้รับในจุดนี้ (ใช้ตั้ง testid ให้ตรงกับช่องลงทะเบียนเดิม) */
  index: number
  kb10Dispatch?: boolean
  onClose: () => void
}

/** หน้าต่างออกเลข/ลงรับของผู้รับหนึ่งราย (แบบเดียวกับหน้าออกเลขของงานหมายจับ) — ยืนยันแล้วตราประทับขึ้นบนกระดาษ */
export const SarabanNumberDialog: React.FC<SarabanNumberDialogProps> = ({ caseItem, checkpoint, recipient, index, onClose, kb10Dispatch = false }) => {
  const uid = useId()
  const cases = useCaseStore((s) => s.cases)
  const recordSaraban = useCaseStore((s) => s.recordSaraban)
  const meta = SARABAN_CHECKPOINT_META[checkpoint]
  const record = kb10Dispatch ? undefined : sarabanRecordFor(caseItem, checkpoint, recipient)
  const [input, setInput] = useState(() => record
    ? { number: record.number, date: record.date, time: record.time }
    : suggestSarabanInput(caseItem, checkpoint, new Date(), recipient))
  const [documentNumber, setDocumentNumber] = useState(record?.documentNumber || '')
  const [saveError, setSaveError] = useState('')
  const [errors, setErrors] = useState<Partial<Record<'number' | 'date' | 'time' | 'documentNumber', string>>>({})
  const incoming = meta.direction === 'incoming'
  const action = incoming ? 'ลงรับ' : 'ออกเลข'
  const registryNumber = record?.number || nextOutgoingSarabanNumber(cases, sarabanUnitName(caseItem, checkpoint), input.date)
  const forms = (kb10Dispatch ? [10] : sarabanFormsFor(caseItem, checkpoint)).map((n) => FORMS_CATALOG.find((f) => f.n === n)?.code || `คบ.${n}`)

  const submit = () => {
    const now = new Date()
    const payload = incoming ? input : {
      ...input, number: registryNumber, documentNumber,
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    }
    setSaveError('')
    const found = validateSarabanInput(payload)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    if (kb10Dispatch ? useCaseStore.getState().numberKb10ForDispatch(caseItem.no, documentNumber, input.date) : recordSaraban(caseItem.no, checkpoint, recipient, payload)) {
      showToast(`${action}แล้ว ${incoming ? 'จาก' : 'ส่งถึง'}${recipient}`)
      onClose()
    } else setSaveError('ไม่สามารถบันทึกได้ กรุณาตรวจสอบสถานะงานและสิทธิ์อีกครั้ง')
  }

  const inputClass = 'min-h-[44px] w-full rounded-[7px] border border-[#aebdca] bg-white px-3 py-[0.66rem] text-[0.88rem] text-ink'
  const errorText = (msg?: string) => msg ? <small role="alert" className="mt-0.5 block text-[0.8rem] font-semibold text-danger">{msg}</small> : null
  const row = (label: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[9rem_minmax(0,1fr)] gap-3 text-[0.88rem]">
      <dt className="text-muted">{label}</dt>
      <dd className="m-0 break-words text-ink">{value}</dd>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,0.52)] p-4 backdrop-blur-[2px]">
      <div role="dialog" aria-modal="true" aria-label={`${action}ฉบับถึง${recipient}`} className="flex max-h-[calc(100vh-2rem)] w-full max-w-[42rem] flex-col overflow-hidden rounded-xl bg-white shadow-[0_20px_50px_rgba(8,43,80,0.25)]">
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="m-0 text-[1.05rem] font-bold text-navy-deep">{action}ฉบับ{incoming ? 'จาก' : 'ถึง'}{recipient}</h2>
          <Button onClick={onClose} variant="icon" size="icon" aria-label="ปิด" className="text-slate-500">
            <i className="fa-solid fa-xmark" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-2">
          <div data-testid={`saraban-entry-form-${checkpoint}-${index}`} className="space-y-4 rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[1rem] font-bold text-navy-deep">{incoming ? 'ลงทะเบียนรับ' : 'ออกเลขหนังสือ'}</h3>
              <span className="ws-status">{record ? `${action}แล้ว` : `รอ${action}`}</span>
            </div>
            <dl className="m-0 space-y-1.5">
              {row('หนังสือ', `ชุดเอกสารคุ้มครองพยาน ${forms.join(' / ')} ราย${caseItem.person}`)}
              {row('เลขคำร้อง', caseItem.no)}
              {row(incoming ? 'หน่วยงานที่ลงทะเบียน' : 'หน่วยงานเจ้าของหนังสือ', sarabanUnitName(caseItem, checkpoint))}
              {row(incoming ? 'รับจาก' : 'ส่งถึง', recipient)}
            </dl>
            <div className={incoming ? "grid grid-cols-1 gap-3 sm:grid-cols-3" : "space-y-4"}>
              <div className="min-w-0">
                <label htmlFor={`${uid}-number`} className="ws-label">{incoming ? meta.numberLabel : 'เลขที่หนังสือ'} <span className="text-danger">*</span></label>
                <input id={`${uid}-number`} type="text" className={inputClass} value={incoming ? input.number : documentNumber} placeholder={incoming ? undefined : 'ที่ ปป'} aria-invalid={Boolean(incoming ? errors.number : errors.documentNumber)}
                  onChange={(e) => incoming ? setInput({ ...input, number: e.target.value }) : setDocumentNumber(e.target.value)} />
                {errorText(incoming ? errors.number : errors.documentNumber)}
              </div>
              <div className="min-w-0">
                <label htmlFor={`${uid}-date`} className="ws-label">{incoming ? 'วันที่' : 'วันที่หนังสือ'} <span className="text-danger">*</span></label>
                {!incoming && <p className="mb-1 text-xs text-muted">{formatSarabanDate(input.date)}</p>}
                <input id={`${uid}-date`} type="date" className={inputClass} value={input.date} aria-invalid={Boolean(errors.date)}
                  onChange={(e) => setInput({ ...input, date: e.target.value })} />
                {incoming && <ThaiDateHint value={input.date} />}
                {errorText(errors.date)}
              </div>
              {incoming && <div className="min-w-0">
                <label htmlFor={`${uid}-time`} className="ws-label">เวลา <span className="text-danger">*</span></label>
                <input id={`${uid}-time`} type="time" className={inputClass} value={input.time} aria-invalid={Boolean(errors.time)}
                  onChange={(e) => setInput({ ...input, time: e.target.value })} />
                {errorText(errors.time)}
              </div>}
            </div>
            {!incoming && <p className="text-[0.88rem] text-ink">
              เลขทะเบียนส่ง: <strong>{registryNumber}</strong>{' '}
              <span className="text-[0.8rem] text-muted">(ออกจากทะเบียนส่งของหน่วยเมื่อยืนยัน)</span>
            </p>}
            {saveError && <p role="alert" className="text-[0.85rem] text-danger">{saveError}</p>}
            <div className="flex justify-end">
              <Button type="button" variant="primary" size="md" data-testid="saraban-number-confirm" onClick={submit}>
                <i className="fa-solid fa-stamp" aria-hidden="true" />ยืนยัน{action}{incoming ? '' : 'หนังสือ'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
