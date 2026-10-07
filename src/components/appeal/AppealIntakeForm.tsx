import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { AppealIntakeInput } from '../../store/useCaseStore'
import { showToast, showConfirmAlert, confirmBody } from '../../lib/swal'
import { ATTACHMENT_ACCEPT, getAttachmentRejection } from '../../lib/fileValidation'

interface AppealIntakeFormProps {
  caseItem: CaseItem
  /** ข้อความปุ่มยืนยัน — Kb17Section ใช้ข้อความเดิม 'มีอุทธรณ์ภายในกำหนด (WIT1147)' เพื่อไม่ให้ selector เดิมพัง */
  submitLabel: string
  onSubmit: (reason: string, intake: AppealIntakeInput) => void
  /** WIT0912 — ธุรการสำนัก/กองรับได้เฉพาะช่องทางหนังสือ ช่องทางวาจาต้องให้เจ้าหน้าที่บันทึกถ้อยคำ */
  letterOnly?: boolean
}

type Channel = 'letter' | 'oral'

/**
 * WIT0911/WIT0912 — ฟอร์มรับคำอุทธรณ์เดียวใช้ทุกช่องทาง (หนังสือ/วาจา)
 * ใช้ร่วมกันทั้งอุทธรณ์คำสั่งไม่อนุมัติ (คบ.10, NoticeDispatchCard) และอุทธรณ์คำสั่งยุติ (คบ.17, Kb17Section)
 * คำอุทธรณ์ไม่มีเลข คบ. ไม่ว่าช่องทางใด
 */
export const AppealIntakeForm: React.FC<AppealIntakeFormProps> = ({ caseItem, submitLabel, onSubmit, letterOnly }) => {
  const [reason, setReason] = useState('')
  const [channel, setChannel] = useState<Channel>('letter')
  const [documentSource, setDocumentSource] = useState<'appellant_document' | 'agency_form'>('appellant_document')
  const [saving, setSaving] = useState(false)

  // ช่องทางหนังสือ — รับผ่านสารบรรณกลาง
  const [registryNo, setRegistryNo] = useState('')
  const [firstReceivedAt, setFirstReceivedAt] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null)

  // ช่องทางวาจา — บันทึกถ้อยคำและให้ลงชื่อรับรอง
  const [statement, setStatement] = useState('')
  const [appellantSigned, setAppellantSigned] = useState(false)
  const [signedFile, setSignedFile] = useState<File | null>(null)

  const handleFileChange = (setter: (f: File | null) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = getAttachmentRejection(file)
    if (rejection) {
      showToast(rejection, 'error')
      return
    }
    setter(file)
  }

  const handleSubmit = () => {
    if (saving) return
    if (!reason.trim()) {
      showToast('กรุณาระบุเหตุผลในการอุทธรณ์')
      return
    }

    if (channel === 'letter') {
      if (!registryNo.trim()) {
        showToast('กรุณาระบุเลขรับสารบรรณกลาง')
        return
      }
      if (!firstReceivedAt) {
        showToast('กรุณาระบุวันที่รับครั้งแรก')
        return
      }
      if (!evidenceFile) {
        showToast('กรุณาแนบไฟล์หนังสืออุทธรณ์')
        return
      }
    } else {
      if (!statement.trim()) {
        showToast('กรุณาบันทึกถ้อยคำผู้ยื่นอุทธรณ์')
        return
      }
      if (!appellantSigned) {
        showToast('กรุณายืนยันว่าผู้ยื่นลงลายมือชื่อรับรองบันทึกถ้อยคำแล้ว')
        return
      }
      if (!signedFile) {
        showToast('กรุณาแนบไฟล์บันทึกถ้อยคำที่ลงลายมือชื่อ')
        return
      }
    }

    const summary: Array<[string, string]> =
      channel === 'letter'
        ? [
            ['ช่องทาง', 'หนังสือ (รับผ่านสารบรรณกลาง)'],
            ['ประเภทเอกสาร', documentSource === 'agency_form' ? 'แบบคำอุทธรณ์ของ ป.ป.ท.' : 'เอกสารที่ผู้ร้องจัดทำเอง'],
            ['ไฟล์', evidenceFile!.name],
            ['เลขรับสารบรรณกลาง', registryNo.trim()],
            ['วันที่รับครั้งแรก', firstReceivedAt],
            ['เหตุผลในการอุทธรณ์', reason.trim()],
          ]
        : [
            ['ช่องทาง', 'ด้วยวาจา (บันทึกถ้อยคำและให้ลงชื่อ)'],
            ['เหตุผลในการอุทธรณ์', reason.trim()],
          ]

    showConfirmAlert({
      icon: 'question',
      title: `${submitLabel}?`,
      html: confirmBody('รับคำร้องอุทธรณ์เข้าระบบและผูกกับแฟ้มเดิม (ไม่มีเลข คบ.)', summary, 'นำเรื่องเข้าสู่กระบวนการพิจารณาต่อไป'),
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    }).then(async (res) => {
      if (!res.isConfirmed) return

      setSaving(true)
      const file = channel === 'letter' ? evidenceFile! : signedFile!
      const documentDataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('อ่านไฟล์ไม่ได้'))
        reader.readAsDataURL(file)
      }).catch(() => { showToast('อ่านไฟล์ไม่สำเร็จ กรุณาเลือกไฟล์อีกครั้ง', 'error'); return '' })
      if (!documentDataUrl) { setSaving(false); return }
      const intake: AppealIntakeInput =
        channel === 'letter'
          ? {
              channel: 'letter',
              registryNo: registryNo.trim(),
              firstReceivedAt,
              evidenceDocumentName: evidenceFile!.name,
              evidenceDataUrl: documentDataUrl,
              documentSource,
            }
          : {
              channel: 'oral',
              statement: statement.trim(),
              appellantSigned: true,
              signedRecordDocumentName: signedFile!.name,
              signedRecordDataUrl: documentDataUrl,
            }

      try { onSubmit(reason.trim(), intake) } finally { setSaving(false) }
    })
  }

  return (
    <div className="space-y-3 text-[0.88rem]" data-testid="appeal-intake-form">
      <div className="flex items-start gap-3 border-b border-line pb-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-soft text-navy"><i className="fa-solid fa-inbox" aria-hidden="true" /></span>
        <div><h2 className="text-lg font-bold text-navy">รับเอกสารคำอุทธรณ์</h2><p className="mt-1 text-muted">ผูกกับแฟ้ม {caseItem.no} โดยไม่สร้างคำร้อง คบ.1 ใหม่</p></div>
      </div>
      <div className="space-y-1.5">
        <span className="ws-label !mb-0">ช่องทางการยื่นอุทธรณ์ *</span>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={channel === 'letter' ? 'primary' : 'secondary'}
            size="md"
            aria-pressed={channel === 'letter'}
            onClick={() => setChannel('letter')}
            data-testid="appeal-intake-channel-letter"
          >
            รับเอกสาร
          </Button>
          {!letterOnly && (
          <Button
            type="button"
            variant={channel === 'oral' ? 'primary' : 'secondary'}
            size="md"
            aria-pressed={channel === 'oral'}
            onClick={() => setChannel('oral')}
            data-testid="appeal-intake-channel-oral"
          >
            รับด้วยวาจา
          </Button>
          )}
        </div>
      </div>

      {channel === 'letter' ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="appeal-document-source" className="ws-label">ประเภทเอกสารคำอุทธรณ์ *</label>
            <select id="appeal-document-source" data-testid="appeal-intake-document-source" className="ws-input" value={documentSource} onChange={(e) => setDocumentSource(e.target.value as typeof documentSource)}>
              <option value="appellant_document">เอกสารที่ผู้ร้องจัดทำเอง (เขียนมือ / พิมพ์)</option>
              <option value="agency_form">แบบคำอุทธรณ์ของ ป.ป.ท. ที่ผู้ร้องกรอกและลงชื่อ</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="ws-label">เลขรับสารบรรณกลาง *</label>
              <input
                value={registryNo}
                onChange={(e) => setRegistryNo(e.target.value)}
                placeholder="เช่น 512/2569"
                data-testid="appeal-intake-registry-no"
                className="ws-input"
              />
            </div>
            <div>
              <label className="ws-label">วันที่รับครั้งแรก *</label>
              <input
                type="date"
                value={firstReceivedAt}
                onChange={(e) => setFirstReceivedAt(e.target.value)}
                data-testid="appeal-intake-first-received"
                className="ws-input"
              />
            </div>
          </div>
          <div>
            <label className="ws-label">อัปโหลดเอกสารคำอุทธรณ์ *</label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50 focus-within:ring-[3px] focus-within:ring-[rgba(202,166,49,0.18)]">
                <i className="fa-solid fa-cloud-arrow-up" />
                {evidenceFile ? 'เปลี่ยนไฟล์' : 'อัปโหลด PDF / ภาพเอกสาร'}
                <input
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  className="sr-only"
                  data-testid="appeal-intake-evidence-file"
                  onChange={handleFileChange(setEvidenceFile)}
                />
              </label>
              {evidenceFile && (
                <span className="flex items-center gap-1.5 min-w-0 ws-readonly !py-2 !px-2.5 text-[0.88rem] text-ink">
                  <i className="fa-solid fa-file-pdf text-danger" />
                  <span className="truncate max-w-[16rem] font-medium">{evidenceFile.name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div>
            <label className="ws-label">บันทึกถ้อยคำผู้ยื่นอุทธรณ์ *</label>
            <textarea
              rows={3}
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              placeholder="บันทึกถ้อยคำที่ผู้ยื่นแจ้งด้วยวาจา..."
              data-testid="appeal-intake-statement"
              className="ws-input"
            />
          </div>
          <label className="flex items-center gap-2 text-[0.88rem] font-semibold text-ink">
            <input
              type="checkbox"
              checked={appellantSigned}
              onChange={(e) => setAppellantSigned(e.target.checked)}
              data-testid="appeal-intake-signed"
              className="ws-checkbox"
            />
            ผู้ยื่นลงลายมือชื่อรับรองบันทึกถ้อยคำแล้ว *
          </label>
          <div>
            <label className="ws-label">ไฟล์บันทึกถ้อยคำที่ลงลายมือชื่อ *</label>
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50 focus-within:ring-[3px] focus-within:ring-[rgba(202,166,49,0.18)]">
                <i className="fa-solid fa-cloud-arrow-up" />
                {signedFile ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์อัปโหลด'}
                <input
                  type="file"
                  accept={ATTACHMENT_ACCEPT}
                  className="sr-only"
                  data-testid="appeal-intake-signed-file"
                  onChange={handleFileChange(setSignedFile)}
                />
              </label>
              {signedFile && (
                <span className="flex items-center gap-1.5 min-w-0 ws-readonly !py-2 !px-2.5 text-[0.88rem] text-ink">
                  <i className="fa-solid fa-file-pdf text-danger" />
                  <span className="truncate max-w-[16rem] font-medium">{signedFile.name}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      <div>
        <label className="ws-label">เหตุผลในการอุทธรณ์ *</label>
        <textarea
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ระบุพยานหลักฐานใหม่หรือข้อโต้แย้งคำสั่ง..."
          data-testid="appeal-intake-reason"
          className="ws-input"
        />
      </div>

      <p className="text-[0.8rem] text-muted">
        <i className="fa-solid fa-circle-info mr-1" />
        คำอุทธรณ์ไม่มีเลข คบ.
      </p>

      <div className="ws-actions justify-end">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          data-testid="appeal-intake-submit"
          variant="primary"
          size="md"
        >
          <i className="fa-solid fa-file-arrow-up" />
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
