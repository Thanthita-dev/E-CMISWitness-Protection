import React, { useEffect, useMemo, useState } from 'react'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useConsentSigningStore } from '../../store/useConsentSigningStore'
import { ECMIS_USER_DIRECTORY, ROLE_NAMES } from '../../lib/constants'
import { buildSeedForCase } from '../../lib/formPrefill'
import { MySwal, showToast } from '../../lib/swal'
import {
  CONSENT_CHANNEL_LABELS,
  CONSENT_EVENT_LABELS,
  CONSENT_EXPIRY_OPTIONS,
  CONSENT_STATUS_META,
  ConsentChannel,
  ConsentDisplayStatus,
  ConsentDocumentSnapshot,
  ConsentRequest,
  DEFAULT_CONSENT_EXPIRY_HOURS,
  applicantNameFromDraft,
  consentFingerprint,
  consentLinkUrl,
  effectiveStatus,
  formatConsentDateTime,
  latestRequestFor,
  latestSignedFor,
  recipientAddress,
  toSignatureRecord,
} from '../../lib/consentSigning'
import { ConsentDocumentPaper } from './ConsentDocumentPaper'
import { QrCodeImage } from '../common/QrCodeImage'

/**
 * ร่าง คบ.1 ของแฟ้มที่ระบุ — ให้ตรงกับที่หน้า /form/1 แสดง
 * ร่างผูกกับแฟ้มนี้แล้วใช้ร่างนั้น · แฟ้มที่รับเรื่องด้วย คบ.2 แต่ยังไม่เคยเปิด คบ.1 ใช้ค่าตั้งต้นจากแฟ้ม · นอกนั้นใช้ร่างกลางเดิม
 */
export const useKb1DocumentForCase = (caseNo?: string) => {
  const caseItem = useCaseStore((s) => (caseNo ? s.cases.find((c) => c.no === caseNo) : undefined))
  const drafts = useFormDraftStore((s) => s.drafts)
  const draftCaseNo = useFormDraftStore((s) => s.draftCaseNo)
  const draftTouched = useFormDraftStore((s) => s.draftTouched)
  const relatedPersons = useFormDraftStore((s) => s.relatedPersons)
  const signatures = useFormDraftStore((s) => s.signatures)

  return useMemo(() => {
    let draft: Record<string, any> = drafts[1] || {}
    if (caseItem && draftCaseNo[1] !== caseItem.no && caseItem.intakeDocType === 'kb2') {
      const kb2Draft = draftCaseNo[2] === caseItem.no && draftTouched[2] ? drafts[2] : undefined
      draft = buildSeedForCase(1, caseItem, kb2Draft)
    }
    const officer = signatures['kb1-officer']
    const snapshot: ConsentDocumentSnapshot = {
      draft: { ...draft },
      relatedPersons: relatedPersons.map((p) => ({ ...p })),
      fallback: {
        person: caseItem?.person,
        mainCaseNo: caseItem?.mainCaseNo,
        assignedOfficer: caseItem?.assignedOfficer,
      },
      officerSign: officer?.signed ? { ...officer } : undefined,
    }
    return {
      caseItem,
      snapshot,
      fingerprint: consentFingerprint(draft, relatedPersons),
      applicantName: applicantNameFromDraft(draft, caseItem?.person || ''),
    }
  }, [caseItem, drafts, draftCaseNo, draftTouched, relatedPersons, signatures])
}

/** สถานะที่แสดงฝั่งเจ้าของสำนวน */
export const consentDisplayStatus = (req?: ConsentRequest): ConsentDisplayStatus => (req ? effectiveStatus(req) : 'not_sent')

const useActorName = () => {
  const currentRole = useAuthStore((s) => s.currentRole)
  const officerId = useAuthStore((s) => s.currentOfficerUserId)
  const officer = ECMIS_USER_DIRECTORY.find((u) => u.id === officerId)
  return currentRole === 'officer' || currentRole === 'case_owner'
    ? officer?.name || ROLE_NAMES[currentRole]
    : ROLE_NAMES[currentRole] || currentRole
}

export const DemoTag: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-800 ${className}`}
  >
    <i className="fa-solid fa-flask" />
    ข้อมูลสำหรับสาธิต
  </span>
)

export const ConsentStatusBadge: React.FC<{ status: ConsentDisplayStatus }> = ({ status }) => {
  const meta = CONSENT_STATUS_META[status]
  return (
    <span
      data-testid="consent-status-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${meta.tone}`}
    >
      <i className={`fa-solid ${meta.icon} text-[10px]`} />
      {meta.label}
    </span>
  )
}

const copyText = (text: string) => {
  navigator.clipboard?.writeText(text).then(
    () => showToast('คัดลอกลิงก์แล้ว'),
    () => showToast('คัดลอกอัตโนมัติไม่ได้ กรุณาเลือกข้อความในช่องลิงก์แล้วคัดลอกเอง', 'warning')
  )
}

/* ------------------------------------------------------------------ *
 * หน้าต่างส่งลิงก์: กรอกผู้รับ/ช่องทาง/อายุลิงก์ → ตรวจทานก่อนยืนยันส่ง
 * ------------------------------------------------------------------ */
const SendConsentModal: React.FC<{
  caseNo: string
  reissue: boolean
  onClose: () => void
  onSent: (token: string) => void
}> = ({ caseNo, reissue, onClose, onSent }) => {
  const { snapshot, applicantName, fingerprint } = useKb1DocumentForCase(caseNo)
  const sendRequest = useConsentSigningStore((s) => s.sendRequest)
  const requests = useConsentSigningStore((s) => s.requests)
  const actor = useActorName()

  const [step, setStep] = useState<'form' | 'review'>('form')
  const [name, setName] = useState(applicantName)
  const [channel, setChannel] = useState<ConsentChannel>('manual')
  const [hours, setHours] = useState(DEFAULT_CONSENT_EXPIRY_HOURS)

  const sameVersion = Object.values(requests).find((r) => r.caseNo === caseNo && r.fingerprint === fingerprint)
  const nextVersion = sameVersion
    ? sameVersion.version
    : Object.values(requests).filter((r) => r.caseNo === caseNo).reduce((m, r) => Math.max(m, r.version), 0) + 1
  const expiresPreview = new Date(Date.now() + hours * 3600_000).toISOString()

  const canReview = name.trim() !== ''

  const confirmSend = () => {
    const token = sendRequest({
      caseNo,
      snapshot,
      recipient: { name: name.trim() },
      channel,
      expiresInHours: hours,
      createdBy: actor,
    })
    useCaseStore
      .getState()
      .logHistory(
        caseNo,
        reissue ? 'ออกลิงก์ลงชื่อยินยอม คบ.1 ใหม่ (ลิงก์เดิมถูกยกเลิก)' : 'ส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อยินยอมใน คบ.1',
        actor,
        `ถึง ${name.trim()} · ${CONSENT_CHANNEL_LABELS[channel]} · หมดอายุ ${formatConsentDateTime(expiresPreview)} · เอกสารฉบับที่ ${nextVersion} (Prototype — ไม่ได้ส่งจริง)`
      )
    onSent(token)
  }

  const recipientLine = recipientAddress({ channel })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="consent-send-title">
      <div className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl bg-white shadow-2xl border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
          <div id="consent-send-title" className="flex items-center gap-2 text-navy-deep font-bold text-sm">
            <i className="fa-solid fa-paper-plane text-blue" />
            {reissue ? 'ออกลิงก์ใหม่ให้ผู้ขอคุ้มครองลงชื่อ' : 'ส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อ'}
          </div>
          <Button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 text-xs">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        {step === 'form' ? (
          <div className="p-5 space-y-4 text-xs">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-[11px] text-violet-900 leading-relaxed">
              <DemoTag className="mb-1" />
              <div>
                ระบบไม่ส่งข้อความออกไปเอง หลังยืนยันจะได้ลิงก์ให้คัดลอกส่งเอง หรือ QR Code ให้ผู้ขอคุ้มครองสแกนจากหน้าจอ
                และเปิดหน้าจอจำลองฝั่งผู้ขอคุ้มครองได้
              </div>
            </div>

            <div>
              <label htmlFor="consent-recipient-name" className="block font-bold text-slate-700 mb-1">ผู้รับ (ผู้ขอคุ้มครอง / ผู้ยื่นคำร้อง) *</label>
              <input
                id="consent-recipient-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-10 rounded-lg border border-slate-300 px-3 text-xs focus:border-blue focus:outline-none"
              />
              <p className="mt-1 text-[11px] text-slate-500">ดึงจากข้อ 1 ของ คบ.1 — ลิงก์นี้ใช้ลงชื่อได้เฉพาะผู้ยื่นคำร้องรายนี้</p>
            </div>

            <fieldset>
              <legend className="block font-bold text-slate-700 mb-1">ช่องทางส่ง *</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(Object.keys(CONSENT_CHANNEL_LABELS) as ConsentChannel[]).map((c) => (
                  <label
                    key={c}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer ${channel === c ? 'border-blue bg-blue/5 font-bold text-navy-deep' : 'border-slate-300 text-slate-600'}`}
                  >
                    <input type="radio" name="consent-channel" checked={channel === c} onChange={() => setChannel(c)} />
                    <i className={`fa-solid ${c === 'qr' ? 'fa-qrcode' : 'fa-copy'}`} />
                    {CONSENT_CHANNEL_LABELS[c]}
                  </label>
                ))}
              </div>
            </fieldset>


            <div>
              <label htmlFor="consent-expiry" className="block font-bold text-slate-700 mb-1">อายุลิงก์ *</label>
              <select id="consent-expiry" value={hours} onChange={(e) => setHours(Number(e.target.value))} className="w-full h-10 rounded-lg border border-slate-300 bg-white px-3 text-xs">
                {CONSENT_EXPIRY_OPTIONS.map((o) => (
                  <option key={o.hours} value={o.hours}>{o.label}</option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">ตัวเลือกอายุลิงก์เป็นค่าสมมติของ Prototype — ระยะเวลาจริงต้องยืนยันก่อนใช้งาน</p>
            </div>

            {reissue && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                <i className="fa-solid fa-triangle-exclamation mr-1" />
                ลิงก์ที่ยังรอลงชื่ออยู่จะถูกยกเลิกทันที และเปิดใช้ต่อไม่ได้
              </p>
            )}
          </div>
        ) : (
          <div className="p-5 space-y-3 text-xs" data-testid="consent-send-review">
            <p className="font-bold text-navy-deep">ตรวจทานก่อนยืนยันส่ง</p>
            <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100">
              {[
                ['ผู้รับ', name],
                ['ช่องทางส่ง', CONSENT_CHANNEL_LABELS[channel]],
                ['ส่งไปที่', recipientLine],
                ['ลิงก์หมดอายุ', formatConsentDateTime(expiresPreview)],
                ['เอกสารที่ให้ลงชื่อ', `คบ.1 ฉบับที่ ${nextVersion} (รหัสเอกสาร ${fingerprint})`],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-3 py-2">
                  <dt className="w-28 flex-shrink-0 text-slate-500">{k}</dt>
                  <dd className="font-semibold text-slate-800 break-words min-w-0">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              ผู้รับจะเห็นเฉพาะเอกสาร คบ.1 ฉบับนี้ ไม่เห็นสำนวนหรือข้อมูลอื่นในแฟ้ม
            </p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 bg-slate-50 px-5 py-3.5 border-t border-slate-100">
          {step === 'form' ? (
            <>
              <Button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">ยกเลิก</Button>
              <Button
                type="button"
                disabled={!canReview}
                onClick={() => setStep('review')}
                data-testid="consent-send-next"
                className="flex items-center gap-1.5 rounded-lg bg-blue px-5 py-2 text-xs font-bold text-white hover:bg-blue-dark disabled:opacity-50"
              >
                ตรวจทานก่อนส่ง
                <i className="fa-solid fa-arrow-right" />
              </Button>
            </>
          ) : (
            <>
              <Button type="button" onClick={() => setStep('form')} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
                <i className="fa-solid fa-arrow-left mr-1" />
                แก้ไข
              </Button>
              <Button type="button" onClick={confirmSend} data-testid="consent-send-confirm" className="flex items-center gap-1.5 rounded-lg bg-blue px-5 py-2 text-xs font-bold text-white hover:bg-blue-dark">
                <i className="fa-solid fa-paper-plane" />
                ยืนยันส่งลิงก์
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * ดูเอกสารฉบับที่ลงชื่อ (ฉบับเดิมเก็บไว้เสมอ แม้เอกสารปัจจุบันถูกแก้ไขแล้ว)
 * ------------------------------------------------------------------ */
const SignedVersionModal: React.FC<{ req: ConsentRequest; onClose: () => void }> = ({ req, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="เอกสารฉบับที่ลงชื่อ">
    <div className="w-full max-w-3xl max-h-[92vh] overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-5 py-3.5">
        <div className="text-sm font-bold text-navy-deep">
          <i className="fa-solid fa-file-shield text-blue mr-1.5" />
          คบ.1 ฉบับที่ {req.version} (รหัส {req.fingerprint}) · ลงชื่อ {formatConsentDateTime(req.signedAt)}
        </div>
        <Button type="button" onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-slate-400 hover:bg-slate-200 text-xs">
          <i className="fa-solid fa-xmark text-sm" />
        </Button>
      </div>
      <div className="overflow-y-auto bg-[#525659] p-4">
        <ConsentDocumentPaper snapshot={req.snapshot} applicantSign={toSignatureRecord(req)} />
      </div>
    </div>
  </div>
)

/* ------------------------------------------------------------------ *
 * แผงลายมือชื่อผู้ขอคุ้มครอง (ฝั่งเจ้าของสำนวน)
 * ------------------------------------------------------------------ */
export const ApplicantConsentPanel: React.FC<{ caseNo: string; compact?: boolean }> = ({ caseNo, compact }) => {
  const requests = useConsentSigningStore((s) => s.requests)
  const allEvents = useConsentSigningStore((s) => s.events)
  const markExpired = useConsentSigningStore((s) => s.markExpired)
  const cancelRequest = useConsentSigningStore((s) => s.cancelRequest)
  const expireNowForDemo = useConsentSigningStore((s) => s.expireNowForDemo)
  const { fingerprint } = useKb1DocumentForCase(caseNo)
  const actor = useActorName()

  const [sendMode, setSendMode] = useState<null | 'send' | 'reissue'>(null)
  const [viewSigned, setViewSigned] = useState<ConsentRequest | null>(null)
  const [showHistory, setShowHistory] = useState(!compact)
  /** ให้สถานะหมดอายุเปลี่ยนเองเมื่อถึงเวลา แม้ไม่มีการกดอะไร */
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const latest = latestRequestFor(requests, caseNo)
  const signed = latestSignedFor(requests, caseNo)
  const status = consentDisplayStatus(latest)
  /** ลงชื่อแล้วแต่เนื้อหา คบ.1 เปลี่ยนภายหลัง — ลายมือชื่อเดิมใช้กับฉบับใหม่ไม่ได้ */
  const needsResign = Boolean(signed && signed.fingerprint !== fingerprint)
  const validSigned = signed && !needsResign ? signed : undefined

  /** บันทึกเหตุการณ์ "หมดอายุ" ให้ลิงก์ที่เลยกำหนด */
  useEffect(() => {
    Object.values(requests)
      .filter((r) => r.caseNo === caseNo && r.status === 'pending' && effectiveStatus(r) === 'expired')
      .forEach((r) => markExpired(r.token))
  }, [requests, caseNo, markExpired])

  const events = useMemo(
    () => allEvents.filter((e) => e.caseNo === caseNo).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)),
    [allEvents, caseNo]
  )

  const pendingLink = latest && status === 'pending' ? latest : undefined
  const url = pendingLink ? consentLinkUrl(pendingLink.token) : ''

  const handleCancel = async () => {
    if (!pendingLink) return
    const result = await MySwal.fire({
      icon: 'warning',
      title: 'ยกเลิกลิงก์ลงชื่อ',
      html: '<p style="font-size:13px">ลิงก์นี้จะใช้ลงชื่อต่อไม่ได้ทันที ระบุเหตุผลการยกเลิก</p>',
      input: 'text',
      inputValue: 'ส่งผิดผู้รับ / ข้อมูลติดต่อไม่ถูกต้อง',
      showCancelButton: true,
      confirmButtonText: 'ยืนยันยกเลิกลิงก์',
      cancelButtonText: 'ไม่ยกเลิก',
      confirmButtonColor: '#a52c25',
      reverseButtons: true,
      inputValidator: (v: string) => (!v.trim() ? 'กรุณาระบุเหตุผล' : undefined),
      customClass: { popup: 'font-sans rounded-2xl shadow-xl' },
    })
    if (!result.isConfirmed) return
    cancelRequest(pendingLink.token, actor, String(result.value))
    useCaseStore.getState().logHistory(caseNo, 'ยกเลิกลิงก์ลงชื่อยินยอม คบ.1', actor, String(result.value))
    showToast('ยกเลิกลิงก์แล้ว — ลิงก์เดิมใช้ต่อไม่ได้')
  }

  const sendButton = (
    <Button
      type="button"
      onClick={() => setSendMode(pendingLink ? 'reissue' : 'send')}
      data-testid="consent-send-button"
      className="flex items-center gap-1.5 rounded-lg bg-blue px-4 py-2 text-xs font-bold text-white hover:bg-blue-dark transition shadow-sm"
    >
      <i className="fa-solid fa-paper-plane" />
      {pendingLink
        ? 'ออกลิงก์ใหม่ (ยกเลิกลิงก์เดิม)'
        : needsResign
          ? 'ส่งลิงก์ให้ลงชื่อฉบับใหม่'
          : status === 'not_sent'
            ? 'ส่งลิงก์ให้ผู้ขอคุ้มครองลงชื่อ'
            : 'ส่งลิงก์ใหม่ให้ผู้ขอคุ้มครองลงชื่อ'}
    </Button>
  )

  return (
    <div data-testid="applicant-consent-panel" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-navy-deep">ลายมือชื่อผู้ขอคุ้มครอง (ผู้ยื่นคำร้อง)</div>
          <p className="text-[11px] text-slate-500 mt-0.5">ผู้ขอคุ้มครองลงชื่อด้วยตนเองผ่านลิงก์ — เจ้าหน้าที่ลงชื่อแทนไม่ได้</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <DemoTag />
          <ConsentStatusBadge status={status} />
          {needsResign && status !== 'pending' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-800">
              <i className="fa-solid fa-rotate text-[10px]" />
              ต้องลงชื่อฉบับใหม่
            </span>
          )}
        </div>
      </div>

      {needsResign && signed && (
        <div data-testid="consent-resign-warning" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
          <i className="fa-solid fa-triangle-exclamation mr-1" />
          เนื้อหา คบ.1 ถูกแก้ไขหลังผู้ขอคุ้มครองลงชื่อ ลายมือชื่อเดิมผูกกับ<strong>ฉบับที่ {signed.version}</strong> เท่านั้น
          ระบบจึงไม่นำมาแสดงบนฉบับปัจจุบัน (รหัส {fingerprint}) — ต้องส่งลิงก์ให้ลงชื่อฉบับใหม่
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button type="button" onClick={() => setViewSigned(signed)} className="rounded-md border border-amber-400 bg-white px-2.5 py-1 font-bold text-amber-900 hover:bg-amber-100">
              <i className="fa-solid fa-eye mr-1" />
              ดูฉบับเดิมที่ลงชื่อ (ฉบับที่ {signed.version})
            </Button>
          </div>
        </div>
      )}

      {validSigned && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 flex flex-wrap items-center gap-3">
          <div className="flex-shrink-0 rounded-md border border-emerald-200 bg-white px-3 py-1.5">
            {validSigned.signatureImage ? (
              <img src={validSigned.signatureImage} alt="ลายมือชื่อผู้ขอคุ้มครอง" className="h-10 w-auto object-contain" />
            ) : (
              <span className="italic font-serif text-blue-900">{validSigned.signerName}</span>
            )}
          </div>
          <div className="text-[11px] text-emerald-900 leading-relaxed min-w-[12rem] flex-1">
            <div className="font-bold">{validSigned.signerName}</div>
            <div>ลงชื่อเมื่อ {formatConsentDateTime(validSigned.signedAt)}</div>
            <div>เอกสาร คบ.1 ฉบับที่ {validSigned.version} (รหัส {validSigned.fingerprint})</div>
          </div>
          <Button type="button" onClick={() => setViewSigned(validSigned)} className="rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100">
            <i className="fa-solid fa-eye mr-1" />
            ดูฉบับที่ลงชื่อ
          </Button>
        </div>
      )}

      {pendingLink && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 space-y-2 text-[11px]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-slate-700">
            <div>ผู้รับ: <strong>{pendingLink.recipient.name}</strong></div>
            <div>ช่องทาง: <strong>{CONSENT_CHANNEL_LABELS[pendingLink.channel] || pendingLink.channel}</strong></div>
            <div>ส่งเมื่อ: {formatConsentDateTime(pendingLink.createdAt)}</div>
            <div>หมดอายุ: <strong>{formatConsentDateTime(pendingLink.expiresAt)}</strong></div>
            <div>เอกสาร: คบ.1 ฉบับที่ {pendingLink.version} (รหัส {pendingLink.fingerprint})</div>
          </div>
          {pendingLink.fingerprint !== fingerprint && (
            <p className="font-semibold text-amber-800">
              <i className="fa-solid fa-circle-exclamation mr-1" />
              คบ.1 ถูกแก้ไขหลังส่งลิงก์นี้ — ควรออกลิงก์ใหม่เพื่อให้ลงชื่อฉบับล่าสุด
            </p>
          )}
          {pendingLink.channel === 'qr' && (
            <div className="flex flex-col items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-3" data-testid="consent-qr">
              <QrCodeImage value={url} size={184} label="QR Code ลิงก์ลงชื่อ คบ.1" />
              <p className="text-center text-[11px] text-slate-600">ให้ผู้ขอคุ้มครองสแกนด้วยกล้องโทรศัพท์ เพื่อเปิดหน้าลงชื่อ</p>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={url}
              aria-label="ลิงก์ลงชื่อ"
              data-testid="consent-link-input"
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 min-w-[14rem] h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-[11px] text-slate-700"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => copyText(url)} className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50">
                <i className="fa-solid fa-copy" />
                คัดลอกลิงก์
              </Button>
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                data-testid="consent-open-witness"
                className="flex items-center gap-1 rounded-lg border border-blue/30 bg-blue/5 px-3 py-1.5 font-bold text-blue hover:bg-blue/10 whitespace-nowrap"
              >
                <i className="fa-solid fa-mobile-screen" />
                เปิดหน้าจอฝั่งพยาน (จำลอง)
              </a>
            </div>
          </div>
        </div>
      )}

      {status === 'expired' && latest && !validSigned && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-[11px] text-rose-800">
          <i className="fa-solid fa-clock mr-1" />
          ลิงก์ล่าสุดหมดอายุเมื่อ {formatConsentDateTime(latest.expiresAt)} โดยยังไม่ได้ลงชื่อ — ออกลิงก์ใหม่ได้
        </p>
      )}
      {status === 'cancelled' && latest && !validSigned && (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] text-slate-700">
          <i className="fa-solid fa-ban mr-1" />
          ลิงก์ล่าสุดถูกยกเลิกเมื่อ {formatConsentDateTime(latest.cancelledAt)} ({latest.cancelReason}) — ลิงก์นั้นใช้ต่อไม่ได้
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(!validSigned || needsResign || pendingLink) && sendButton}
        {pendingLink && (
          <Button type="button" onClick={handleCancel} data-testid="consent-cancel-button" className="flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50">
            <i className="fa-solid fa-ban" />
            ยกเลิกลิงก์
          </Button>
        )}
        {pendingLink && (
          <Button
            type="button"
            onClick={() => {
              expireNowForDemo(pendingLink.token, actor)
              showToast('จำลองให้ลิงก์หมดอายุแล้ว', 'warning')
            }}
            data-testid="consent-demo-expire"
            className="ml-auto rounded-lg border border-dashed border-violet-300 px-3 py-1.5 text-[11px] font-semibold text-violet-800 hover:bg-violet-50"
            title="เครื่องมือสาธิต — ไม่มีในระบบจริง"
          >
            <i className="fa-solid fa-flask mr-1" />
            สาธิต: ทำให้ลิงก์หมดอายุทันที
          </Button>
        )}
      </div>

      <div className="border-t border-slate-100 pt-2">
        <Button type="button" onClick={() => setShowHistory((v) => !v)} className="text-[11px] font-bold text-slate-600 hover:text-navy-deep" aria-expanded={showHistory}>
          <i className={`fa-solid ${showHistory ? 'fa-chevron-down' : 'fa-chevron-right'} mr-1`} />
          ประวัติการส่งลิงก์และการลงชื่อ ({events.length})
        </Button>
        {showHistory && (
          <ol data-testid="consent-history" className="mt-2 space-y-1.5">
            {events.length === 0 && <li className="text-[11px] text-slate-400">ยังไม่มีประวัติ</li>}
            {events.map((e) => (
              <li key={e.id} className="flex gap-2 text-[11px] leading-relaxed">
                <span className="w-32 flex-shrink-0 text-slate-500">{formatConsentDateTime(e.at)}</span>
                <span className="min-w-0">
                  <strong className="text-slate-800">{CONSENT_EVENT_LABELS[e.type]}</strong>{' '}
                  <span className="text-slate-500">· ฉบับที่ {e.version} · โดย {e.actor}</span>
                  {e.detail && <span className="block text-slate-500 break-words">{e.detail}</span>}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      {sendMode && (
        <SendConsentModal
          caseNo={caseNo}
          reissue={sendMode === 'reissue'}
          onClose={() => setSendMode(null)}
          onSent={() => {
            setSendMode(null)
            showToast('สร้างลิงก์แล้ว (สาธิต — ไม่ได้ส่ง SMS/อีเมลจริง)')
          }}
        />
      )}
      {viewSigned && <SignedVersionModal req={viewSigned} onClose={() => setViewSigned(null)} />}
    </div>
  )
}
