import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import React, { useLayoutEffect, useRef, useState } from 'react'
import { selectCaseDraft, useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { FORMS_CATALOG } from '../../lib/constants'
import { getFormPages, LETTER_STYLE_FORMS } from './paper/formPages'
import { PaperContext } from './paper/PaperPrimitives'
import { useConsentSigningStore } from '../../store/useConsentSigningStore'
import { applicantSignatureFor, consentFingerprint, latestRequestFor, latestSignedFor } from '../../lib/consentSigning'
import type { NoticeSnapshot } from '../../lib/noticeDocuments'
import type { CaseItem } from '../../types/case'

/** ความกว้างกระดาษ A4 ที่ 96 dpi */
const A4_WIDTH = 794

interface FormPaperViewerProps {
  formId: number
  activeSection?: number
  /** แฟ้มที่เปิดแบบอยู่ — ใช้หาลายมือชื่อผู้ขอคุ้มครองที่ลงผ่านลิงก์ (คบ.1) */
  caseNo?: string
  /** ฉบับหนังสือแจ้งผลที่เก็บไว้ ณ เวลานั้น ใช้ข้อมูลจาก snapshot เท่านั้น */
  noticeSnapshot?: NoticeSnapshot
  /** ร่างที่ตรวจพร้อมผลก่อนยืนยัน ยังไม่มีลายมือชื่อหรือฉบับลงนาม */
  noticeDraftPreview?: { fields: Record<string, string>; caseContext: CaseItem }
}

export const FormPaperViewer: React.FC<FormPaperViewerProps> = ({ formId, activeSection = 0, caseNo, noticeSnapshot, noticeDraftPreview }) => {
  const draftState = useFormDraftStore()
  const { drafts, manualPage, setManualPage, relatedPersons, signatures: draftSignatures } = draftState
  const liveCaseItem = useCaseStore((state) => state.getCase(caseNo))
  const resultNotice = formId === 9 || formId === 10 ? liveCaseItem?.resultNotices?.[formId] : undefined
  const candidate = noticeSnapshot || resultNotice?.versions[resultNotice.versions.length - 1]
  const draftPreview = (formId === 9 || formId === 10) && noticeDraftPreview?.caseContext.no === caseNo ? noticeDraftPreview : undefined
  const snapshot = !draftPreview && (formId === 9 || formId === 10) && candidate?.formNo === formId && candidate.caseNo === caseNo
    ? candidate : undefined
  const originalSignature = snapshot?.signatureVerification === 'simulated_original'
  const caseItem = snapshot ? {
    ...snapshot.caseContext,
    kb9SignedAt: snapshot.formNo === 9 && originalSignature ? snapshot.signedAt : undefined,
    kb9SignedBy: snapshot.formNo === 9 && originalSignature ? snapshot.signedBy : undefined,
    kb10SignedAt: snapshot.formNo === 10 && originalSignature ? snapshot.signedAt : undefined,
    kb10SignedBy: snapshot.formNo === 10 && originalSignature ? snapshot.signedBy : undefined,
  } : draftPreview ? {
    ...draftPreview.caseContext,
    kb9SignedAt: undefined, kb9SignedBy: undefined,
    kb10SignedAt: undefined, kb10SignedBy: undefined,
  } : liveCaseItem
  const consentRequests = useConsentSigningStore((s) => s.requests)

  const formMeta = FORMS_CATALOG.find((f) => f.n === formId) || FORMS_CATALOG[0]
  const pages = getFormPages(formId)
  const totalPages = pages.length

  const currentPage = Math.min(manualPage !== null ? manualPage : activeSection + 1, totalPages)
  const draft = snapshot?.fields || draftPreview?.fields || (formId === 9 || formId === 10 || formId === 11
    ? selectCaseDraft(draftState, formId, caseNo) : drafts[formId] || {})
  const isLetter = LETTER_STYLE_FORMS.includes(formId)

  /** draft ก่อน → แฟ้มจริง → ค่าเริ่มต้น */
  const val = (key: string, fallback = '') => {
    const v = draft[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
    // ช่องว่างในฉบับที่เก็บไว้ต้องยังเป็นช่องว่าง ไม่เติมจากข้อมูลแฟ้มที่เปลี่ยนภายหลัง
    return snapshot || draftPreview ? '' : fallback
  }

  /**
   * คบ.1 — ช่อง "ผู้ยื่นคำร้อง" แสดงลายมือชื่อที่ผู้ขอคุ้มครองลงเองผ่านลิงก์ และเฉพาะเมื่อเนื้อหาปัจจุบันตรงกับฉบับที่ลงชื่อ
   * ใช้กับแฟ้มที่มีคำขอลงชื่อผ่านลิงก์แล้ว หรือแฟ้มที่ยังรอพยานลงนาม — แฟ้มอื่นคงลายมือชื่อเดิมตามเดิม
   */
  const consentCaseNo = caseNo || caseItem?.no
  const fingerprint = formId === 1 ? consentFingerprint(draft, relatedPersons) : ''
  const usesConsentLink =
    formId === 1 && Boolean(consentCaseNo) && (Boolean(latestRequestFor(consentRequests, consentCaseNo!)) || Boolean(caseItem?.kb1SignaturePending))
  const scopedSignatures = formId === 11 && caseNo && draftState.draftCaseNo[11] !== caseNo ? draftState.caseDrafts[caseNo]?.signatures || {} : draftSignatures
  const signatures = { ...scopedSignatures }
  let consentNote: string | null = null
  if (usesConsentLink && consentCaseNo) {
    const applicant = applicantSignatureFor(consentRequests, consentCaseNo, fingerprint)
    if (applicant) signatures['kb1-applicant'] = applicant
    else delete signatures['kb1-applicant']
    const signedOld = latestSignedFor(consentRequests, consentCaseNo)
    consentNote = applicant
      ? null
      : signedOld
        ? `เนื้อหา คบ.1 ถูกแก้ไขหลังลงชื่อ — ลายมือชื่อเดิมผูกกับฉบับที่ ${signedOld.version} จึงไม่แสดงบนฉบับนี้ ต้องให้ผู้ขอคุ้มครองลงชื่อฉบับใหม่`
        : 'ผู้ขอคุ้มครองยังไม่ได้ลงชื่อในฉบับนี้'
  }

  const ctx: PaperContext = { formMeta, draft, caseItem, relatedPersons: snapshot || draftPreview ? [] : relatedPersons, signatures: snapshot || draftPreview ? {} : signatures, val }

  /** ย่อกระดาษให้พอดีคอลัมน์ โดยยังคงความกว้างเลย์เอาต์จริงของ A4 */
  const stageRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const stage = stageRef.current
    if (!stage || typeof ResizeObserver === 'undefined') return
    const measure = () => {
      const style = window.getComputedStyle(stage)
      const inner =
        stage.clientWidth - parseFloat(style.paddingLeft || '0') - parseFloat(style.paddingRight || '0')
      setScale(inner > 0 ? Math.min(1, inner / A4_WIDTH) : 1)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const renderPage = pages[currentPage - 1] || pages[0]

  return (
    <div className="flex flex-col items-center">
      {/* Top Controls: Page switcher */}
      <div className="ws-card mb-3 flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[0.88rem] font-bold text-navy">
            {formMeta.code} - {formMeta.t}
          </span>
          <Badge variant="info" className="flex-shrink-0">
            {isLetter ? 'หนังสือราชการ A4' : 'แบบฟอร์ม A4'}
          </Badge>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
            <Button
              key={pageNum}
              type="button"
              onClick={() => setManualPage(pageNum)}
              aria-label={`หน้า ${pageNum}`}
              aria-current={currentPage === pageNum ? 'page' : undefined}
              className={`min-h-[38px] min-w-[38px] rounded-lg px-2 text-[0.88rem] font-bold transition ${
                currentPage === pageNum ? 'bg-navy text-white' : 'bg-[#edf2f6] text-navy hover:bg-line'
              }`}
            >
              {pageNum}
            </Button>
          ))}
          <span className="ml-1 text-[0.8rem] font-medium text-muted">
            (หน้า {currentPage}/{totalPages})
          </span>
        </div>
      </div>

      {/* A4 Paper — เรนเดอร์ที่ความกว้างจริง 794px แล้วย่อทั้งแผ่นให้พอดีคอลัมน์
          เพื่อให้การตัดบรรทัดเหมือนกระดาษจริงไม่ว่าพื้นที่แสดงผลจะกว้างเท่าใด */}
      <div
        ref={stageRef}
        className="relative w-full overflow-hidden rounded-xl border border-slate-300 bg-[#525659] p-3 md:p-6 shadow-2xl flex justify-center"
      >
        <div
          className="paper-a4 relative rounded-sm bg-white px-14 pt-8 pb-16 text-[#111827] leading-relaxed shadow-lg text-[14px] font-sarabun select-text"
          style={{ width: A4_WIDTH, zoom: scale }}
        >
          {/* ชั้นความลับหัวกระดาษ */}
          <div className="text-center font-black text-rose-600 text-xl leading-none mb-3">ลับ</div>

          <div>{renderPage(ctx)}</div>

          {snapshot && (
            <p data-testid="notice-paper-signature-disclosure" className="mt-4 text-center text-[11px] text-slate-600">
              ข้อมูลสำหรับสาธิต · รุ่นที่ {snapshot.version} · ลายมือชื่อจำลอง ไม่มีผลทางกฎหมาย
              {!originalSignature && ' · มีการเติมรายละเอียดหลังลงนาม เนื้อหาที่เติมไม่ได้รับการรับรองด้วยลายมือชื่อเดิม'}
            </p>
          )}
          {draftPreview && <p data-testid="notice-paper-draft-disclosure" className="mt-4 text-center text-[11px] text-slate-600">ข้อมูลสำหรับสาธิต · ร่างก่อนยืนยันผลและลงนาม · ยังไม่ถือว่าส่งแจ้งผลแล้ว</p>}

          {/* ชั้นความลับท้ายกระดาษ */}
          <div className="absolute bottom-4 left-0 right-0 text-center font-black text-rose-600 text-xl">ลับ</div>
        </div>
      </div>

      {consentNote && (
        <div data-testid="paper-consent-note" className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <i className="fa-solid fa-signature mr-1.5" />
          {consentNote}
        </div>
      )}

      {caseItem && (
        <div className="ws-readonly mt-2 w-full text-[0.8rem] text-muted">
          <i className="fa-solid fa-link mr-1.5 text-blue" />
          {snapshot ? `ข้อมูลบนกระดาษจากฉบับที่เก็บไว้ รุ่นที่ ${snapshot.version} ของแฟ้ม ` : draftPreview ? 'ข้อมูลบนกระดาษจากร่างในชุดเสนอที่กำลังตรวจสอบของแฟ้ม ' : 'ข้อมูลบนกระดาษดึงจากร่างในแบบฟอร์ม และเติมด้วยข้อมูลจริงของแฟ้ม '}
          <span className="font-bold text-navy-deep">{caseItem.no}</span> ({caseItem.person})
        </div>
      )}
    </div>
  )
}
