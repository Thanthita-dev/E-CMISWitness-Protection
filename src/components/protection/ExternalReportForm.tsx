import React, { useState } from 'react'
import { Button } from '../common/Button'
import { MonthlyReport } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'
import { EXTERNAL_REPORT_LABEL } from '../../lib/kb13'
import { formatThaiDate, thaiMonthName } from '../../lib/utils'
import { showToast } from '../../lib/swal'

const todayIso = () => new Date().toISOString().slice(0, 10)

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

type FieldErrors = Partial<Record<'agency' | 'letterNo' | 'file', string>>

/**
 * WIT1005 (รอบหนังสือภายนอก) — บันทึกรับหนังสือรายงานจากหน่วยงานภายนอกแทนการจัดทำ/ลงนาม คบ.13 (WIT1006/1007)
 * แก้ไขและบันทึกซ้ำได้จนกว่ารอบจะถูกตรวจรับ (store กันไว้ให้อีกชั้น)
 */
export const ExternalReportForm: React.FC<{ caseNo: string; round: MonthlyReport }> = ({ caseNo, round }) => {
  const { recordExternalReport } = useCaseStore()
  const recorded = round.externalLetter
  const locked = Boolean(round.reviewedAt || round.lockedAt)

  const [agency, setAgency] = useState(recorded?.agency || '')
  const [letterNo, setLetterNo] = useState(recorded?.letterNo || '')
  const [letterDate, setLetterDate] = useState(recorded?.letterDate || '')
  const [receivedAt, setReceivedAt] = useState(recorded?.receivedAt || todayIso())
  const [receiveNo, setReceiveNo] = useState(recorded?.receiveNo || '')
  const [file, setFile] = useState<{ name: string; url: string } | null>(
    recorded?.documentUrl ? { name: recorded.documentName, url: recorded.documentUrl } : null
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  const handleFile = async (picked?: File) => {
    if (!picked) return
    const rejection = getAttachmentRejection(picked)
    if (rejection) {
      setErrors((e) => ({ ...e, file: rejection }))
      return
    }
    try {
      const url = await readAsDataUrl(picked)
      setFile({ name: picked.name, url })
      setErrors((e) => ({ ...e, file: undefined }))
    } catch {
      setErrors((e) => ({ ...e, file: 'อ่านไฟล์ไม่สำเร็จ กรุณาลองอีกครั้ง' }))
    }
  }

  const handleSubmit = () => {
    const next: FieldErrors = {}
    if (!agency.trim()) next.agency = 'กรุณาระบุหน่วยงานผู้ส่ง'
    if (!letterNo.trim()) next.letterNo = 'กรุณาระบุเลขที่หนังสือ'
    if (!file) next.file = 'กรุณาแนบไฟล์หนังสือ'
    setErrors(next)
    if (Object.keys(next).length > 0 || !file) return
    setBusy(true)
    const by = useAuthStore.getState().getCurrentUserAccount()?.name
    recordExternalReport(
      caseNo,
      round.id,
      {
        agency: agency.trim(),
        letterNo: letterNo.trim(),
        letterDate,
        receivedAt,
        receiveNo: receiveNo.trim(),
        documentName: file.name,
        documentUrl: file.url,
      },
      by
    )
    setBusy(false)
    showToast(recorded ? 'แก้ไขการบันทึกรับหนังสือแล้ว' : `บันทึกรับ${EXTERNAL_REPORT_LABEL}แล้ว`)
  }

  const idp = `ext-${round.id}`
  const errorText = (key: keyof FieldErrors) =>
    errors[key] ? (
      <p id={`${idp}-${key}-err`} role="alert" className="mt-1 text-[0.8rem] text-rose-700">
        {errors[key]}
      </p>
    ) : null

  return (
    <section className="space-y-3 rounded-xl border border-line bg-paper p-5">
      <div className="border-b border-slate-200 pb-2">
        <h3 className="text-sm font-bold text-navy-deep">บันทึกรับ{EXTERNAL_REPORT_LABEL} งวด {thaiMonthName(round.period)}</h3>
        <p className="mt-0.5 text-[0.8rem] text-muted">
          รอบนี้ใช้หนังสือจากหน่วยงานที่ปฏิบัติการคุ้มครองแทน คบ.13 — ไม่ต้องจัดทำและลงนาม บันทึกรับและแนบไฟล์หนังสือ
        </p>
      </div>

      {recorded && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-[0.8rem] text-emerald-900">
          <strong className="block">
            <i className="fa-solid fa-circle-check mr-1.5" />
            บันทึกรับแล้ว — {recorded.agency} · เลขที่ {recorded.letterNo}
          </strong>
          <span className="block">
            ลงวันที่ {recorded.letterDate ? formatThaiDate(recorded.letterDate) : '-'} · รับวันที่{' '}
            {recorded.receivedAt ? formatThaiDate(recorded.receivedAt) : '-'}
            {recorded.receiveNo ? ` · เลขรับ ${recorded.receiveNo}` : ''}
          </span>
          <span className="block">
            บันทึกโดย {recorded.recordedBy} · {recorded.recordedAt}
          </span>
          <a
            href={recorded.documentUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block font-semibold text-blue underline"
          >
            <i className="fa-solid fa-paperclip mr-1.5" />
            เปิดไฟล์ {recorded.documentName}
          </a>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={`${idp}-agency`} className="ws-label">หน่วยงานผู้ส่ง</label>
          <input
            id={`${idp}-agency`}
            value={agency}
            disabled={locked}
            aria-invalid={Boolean(errors.agency)}
            aria-describedby={errors.agency ? `${idp}-agency-err` : undefined}
            onChange={(e) => setAgency(e.target.value)}
            placeholder="เช่น สถานีตำรวจภูธร..."
            className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
          />
          {errorText('agency')}
        </div>
        <div>
          <label htmlFor={`${idp}-letterNo`} className="ws-label">เลขที่หนังสือ</label>
          <input
            id={`${idp}-letterNo`}
            value={letterNo}
            disabled={locked}
            aria-invalid={Boolean(errors.letterNo)}
            aria-describedby={errors.letterNo ? `${idp}-letterNo-err` : undefined}
            onChange={(e) => setLetterNo(e.target.value)}
            className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
          />
          {errorText('letterNo')}
        </div>
        <div>
          <label htmlFor={`${idp}-letterDate`} className="ws-label">ลงวันที่หนังสือ</label>
          <input
            id={`${idp}-letterDate`}
            type="date"
            value={letterDate}
            disabled={locked}
            onChange={(e) => setLetterDate(e.target.value)}
            className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
        <div>
          <label htmlFor={`${idp}-receivedAt`} className="ws-label">วันที่รับ</label>
          <input
            id={`${idp}-receivedAt`}
            type="date"
            value={receivedAt}
            disabled={locked}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
        <div>
          <label htmlFor={`${idp}-receiveNo`} className="ws-label">เลขรับ</label>
          <input
            id={`${idp}-receiveNo`}
            value={receiveNo}
            disabled={locked}
            onChange={(e) => setReceiveNo(e.target.value)}
            className="ws-input w-full disabled:bg-slate-100 disabled:text-slate-400"
          />
        </div>
        <div>
          <label htmlFor={`${idp}-file`} className="ws-label">ไฟล์หนังสือ</label>
          <input
            id={`${idp}-file`}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            disabled={locked}
            aria-invalid={Boolean(errors.file)}
            aria-describedby={errors.file ? `${idp}-file-err` : undefined}
            onChange={(e) => {
              void handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
            className="block w-full text-[0.8rem]"
          />
          {file && <p className="mt-1 text-[0.8rem] text-slate-600">ไฟล์ที่เลือก: {file.name}</p>}
          {errorText('file')}
        </div>
      </div>

      {locked ? (
        <p className="text-[0.8rem] font-semibold text-emerald-700">
          <i className="fa-solid fa-lock mr-1.5" />
          ตรวจรับรอบนี้แล้ว — แก้การบันทึกรับหนังสือไม่ได้อีก
        </p>
      ) : (
        <Button
          type="button"
          disabled={busy}
          onClick={handleSubmit}
          className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          <i className="fa-solid fa-inbox mr-1.5" />
          {recorded ? 'บันทึกการแก้ไขหนังสือ' : 'บันทึกรับหนังสือ'}
        </Button>
      )}
    </section>
  )
}
