import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CaseItem } from '../../types/case'
import { protectionSchedule } from '../../lib/protectionSchedule'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { Button } from '../common/Button'

const normalizePeriod = (period: string) => {
  if (/^\d{4}-\d{2}$/.test(period)) return period
  const [month, year] = period.split('/').map(Number)
  return month && year ? `${year > 2400 ? year - 543 : year}-${String(month).padStart(2, '0')}` : period
}
const monthLabel = (period: string) => {
  const [year, month] = normalizePeriod(period).split('-').map(Number)
  return year && month ? new Date(year, month - 1, 1).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' }) : period
}

export function ProtectionMonthlyUploads({ caseItem, open, onClose, readOnly }: { caseItem: CaseItem; open: boolean; onClose: () => void; readOnly: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [period, setPeriod] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }).slice(0, 7))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close() }, [open])
  const periods = [...new Set([...protectionSchedule(caseItem).periods, ...(caseItem.protectionReportUploads || []).map((r) => normalizePeriod(r.period)), ...(caseItem.monthlyReports || []).map((r) => normalizePeriod(r.period))])].sort()
  const upload = async (file?: File) => {
    if (!file || readOnly || busy) return
    const rejection = getAttachmentRejection(file)
    if (rejection) { setError(rejection); return }
    if (!/^\d{4}-\d{2}$/.test(period)) { setError('กรุณาเลือกรอบเดือน'); return }
    setBusy(true); setError('')
    try {
      const documentUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) })
      const store = useCaseStore.getState()
      const current = store.cases.find((c) => c.no === caseItem.no)
      if (!current) return
      const by = useAuthStore.getState().getCurrentUserAccount()?.name || 'ผู้ใช้งาน'
      store.updateCase(caseItem.no, { protectionReportUploads: [...(current.protectionReportUploads || []), { id: crypto.randomUUID(), period, documentName: file.name, documentUrl, uploadedAt: new Date().toISOString(), uploadedBy: by }] })
      store.logHistory(caseItem.no, 'อัปโหลดหนังสือ คบ.13', by, `${monthLabel(period)} · ${file.name}`)
      onClose()
    } catch { setError('อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง') } finally { setBusy(false) }
  }
  return <>
    <section className="ws-card overflow-hidden" aria-label="รายงาน คบ.13 รายเดือน">
      <header className="border-b border-line p-5"><h2 className="text-lg font-bold text-navy">รายงานการคุ้มครองพยาน คบ.13 รายเดือน</h2></header>
      <div className="overflow-x-auto"><table className="ws-table text-sm"><thead><tr><th>รอบเดือน</th><th>สถานะรายงาน</th><th>หนังสือ คบ.13</th></tr></thead>
        <tbody>{periods.length === 0 ? <tr><td colSpan={3} className="p-6 text-center text-muted">ยังไม่มีกำหนดรอบเดือน เพิ่มหนังสือและระบุรอบเดือนได้จากปุ่มด้านบน</td></tr> : periods.map((month) => {
          const uploads = (caseItem.protectionReportUploads || []).filter((r) => r.period === month)
          const reports = (caseItem.monthlyReports || []).filter((r) => normalizePeriod(r.period) === month)
          return <tr key={month}><td className="font-semibold text-navy">{monthLabel(month)}</td><td>{uploads.length ? `อัปโหลดแล้ว ${uploads.length} ฉบับ` : reports.length ? 'มีรายงานในแฟ้ม' : 'รออัปโหลดหนังสือ'}</td><td><div className="space-y-2">{uploads.length ? uploads.map((r) => <a key={r.id} href={r.documentUrl} target="_blank" rel="noreferrer" className="block font-semibold text-blue underline">{r.documentName}</a>) : <span className="text-muted">—</span>}</div></td></tr>
        })}</tbody>
      </table></div>
    </section>
    {createPortal(<dialog ref={dialog} onCancel={onClose} aria-label="เพิ่มหนังสือ คบ.13" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-xl bg-paper p-6 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
      <h2 className="text-lg font-bold text-navy">เพิ่มหนังสือ คบ.13</h2>
      <label className="mt-4 block"><span className="ws-label">รอบเดือนรายงาน</span><input type="month" className="ws-input w-full" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={busy} /></label>
      <label className="mt-4 block"><span className="ws-label">อัปโหลดหนังสือ คบ.13</span><input type="file" accept={ATTACHMENT_ACCEPT} disabled={readOnly || busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = '' }} className="block w-full" /></label>
      {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
      {busy && <p className="mt-3 text-muted">กำลังบันทึกหนังสือ...</p>}
      <div className="mt-5 flex justify-end"><Button variant="secondary" size="md" onClick={onClose} disabled={busy}>ปิด</Button></div>
    </dialog>, document.body)}
  </>
}
