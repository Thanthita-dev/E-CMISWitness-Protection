import { ReferralPaperPreview } from './ReferralPaperPreview'
import { referralValues } from '../../lib/referralDocuments'
import { isRightsReferral, referralFormNo } from '../../lib/referralDocumentIdentity'
import { readRoutableProtectionMethods } from '../../lib/constants'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { selectCaseDraft, signaturesForCase, useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { FORMS_CATALOG } from '../../lib/constants'
import { getFormPages, LETTER_STYLE_FORMS } from './paper/formPages'
import { PaperContext, PaperDraftContext, PaperEditContext } from './paper/PaperPrimitives'
import { PaperSignUiContext } from './paper/paperSign'
import { SignatureModal } from '../common/SignatureModal'
import { showToast } from '../../lib/swal'
import { useConsentSigningStore } from '../../store/useConsentSigningStore'
import { applicantSignatureFor, consentFingerprint, latestRequestFor, latestSignedFor } from '../../lib/consentSigning'
import type { NoticeSnapshot } from '../../lib/noticeDocuments'
import type { CaseItem } from '../../types/case'
import { SarabanStampStack } from '../saraban/SarabanStamp'
import { LegacyFormsNotice } from '../common/LegacySourceBadge'

/** ความกว้างกระดาษ A4 ที่ 96 dpi */
const A4_WIDTH = 794
/** ขนาดคำว่า "ลับ" หัว/ท้ายกระดาษตาม Word ต้นฉบับ — ส่วนใหญ่ 28pt ตัวหนาสีแดง, คบ.11/13/14 ใช้ 16pt */
/** ภาพต้นฉบับพิมพ์ "ลับ" ขนาดใหญ่ทุกแบบ (Word ของ คบ.11/13/14 ตั้ง 16pt แต่ภาพต้นฉบับเป็นตัวใหญ่ ยึดภาพ) */
const stampSize = (_formId: number) => '28pt'
/** ระยะบรรทัดตาม Word (w:line ต่อ 240) — คบ.6 = 216, คบ.4/8 = 228, คบ.12/14 = 235 ส่วนแบบอื่นเป็นบรรทัดเดี่ยว */
const LINE_FACTOR: Record<number, number> = { 4: 0.95, 6: 0.9, 8: 0.95, 12: 0.98, 14: 0.98 }
const lineHeight = (formId: number) => 1.1 * (LINE_FACTOR[formId] ?? 1)
const A4_HEIGHT = 1123

/**
 * กันเนื้อหาล้นหรือถูกตัดท้ายกระดาษ: ถ้าเนื้อหาสูงเกิน A4 ย่อทั้งหน้าเท่าที่จำเป็น (ช่องกรอกที่ยืดตามข้อมูลทำให้ยาวกว่า Word ได้)
 */
/**
 * คบ.1 / คบ.3 / คบ.6 ไม่ย่อทั้งหน้า (ตัวหนังสือต้องคงขนาดตามแบบ) — ข้อมูลยาวให้กระดาษบนจอยืดลง
 * และฉบับพิมพ์ไหลต่อแผ่นถัดไปแทน
 */
const NO_SHRINK_FORMS = [1, 3, 6]

const FitPage: React.FC<{ children: React.ReactNode; deps: unknown; shrink?: boolean }> = ({ children, deps, shrink = true }) => {
  const ref = useRef<HTMLDivElement>(null)
  const [zoom, setZoom] = useState(1)
  // วัดเฉพาะตอนไม่ย่อ (zoom เปลี่ยนการตัดบรรทัด วัดซ้ำตอนย่อจะวนไม่จบ) — ข้อมูลเปลี่ยนให้กลับไปวัดใหม่
  useLayoutEffect(() => { setZoom(1) }, [deps])
  useLayoutEffect(() => {
    const el = ref.current
    const paper = el?.closest('.kb-paper') as HTMLElement | null
    if (!shrink || !el || !paper || zoom !== 1) return
    const style = getComputedStyle(paper)
    const available = A4_HEIGHT - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
    // วัดจากกระดาษจริง (รวม margin ของบรรทัดสุดท้ายที่ไม่นับใน scrollHeight ของเนื้อหา)
    const needed = Math.max(el.scrollHeight, paper.scrollHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))
    if (needed > available + 1) setZoom(Math.max(0.8, (available / needed) * 0.99))
  }, [zoom, deps, shrink])
  return <div ref={ref} style={zoom < 1 ? { zoom } : undefined} data-fit-zoom={zoom < 1 ? zoom.toFixed(3) : undefined}>{children}</div>
}

interface FormPaperViewerProps {
  formId: number
  /** เดิมใช้เลือกหน้าที่แสดง — ปัจจุบันแสดงทุกหน้าต่อกัน คงไว้ให้ผู้เรียกเดิม */
  activeSection?: number
  /** แฟ้มที่เปิดแบบอยู่ — ใช้หาลายมือชื่อผู้ขอคุ้มครองที่ลงผ่านลิงก์ (คบ.1) */
  caseNo?: string
  /** ฉบับหนังสือแจ้งผลที่เก็บไว้ ณ เวลานั้น ใช้ข้อมูลจาก snapshot เท่านั้น */
  noticeSnapshot?: NoticeSnapshot
  noticeDetailEdit?: { fields: readonly string[]; onChange: (key: string, value: string) => void }
  /** ร่างที่ตรวจพร้อมผลก่อนยืนยัน ยังไม่มีลายมือชื่อหรือฉบับลงนาม */
  noticeDraftPreview?: { fields: Record<string, string>; caseContext: CaseItem; editableFields?: readonly string[]; onFieldChange?: (key: string, value: string) => void }
  /** ขยายเอกสาร: กรอกในช่องบนกระดาษได้ โดยใช้ร่างชุดเดียวกับแบบกรอกด้านซ้าย */
  editable?: boolean
  /** หน้าเปิดแบบ: เตรียมกระดาษครบทุกหน้าไว้ให้คำสั่งพิมพ์ (พิมพ์เฉพาะเอกสาร ไม่พิมพ์หน้าจอแอป) */
  printable?: boolean
  /** ฉบับเดิมที่เก็บไว้ (เวอร์ชันก่อนหน้า) — แสดงตามค่าที่บันทึกในฉบับนั้นเท่านั้น */
  snapshotCase?: CaseItem
  onSnapshotChange?: (key: string, value: any) => void
  versionSnapshot?: { fields: Record<string, any>; signatures?: Record<string, any> }
  /** แสดงบนจอเฉพาะหน้านี้ (เริ่ม 1) — ไม่ระบุ = ทุกหน้าต่อกัน · ชุดพิมพ์ยังครบทุกหน้า */
  page?: number
  /** อยู่ในพื้นที่ทำงานเอกสาร: ไม่มีแถบชื่อแบบเหนือกระดาษ และพื้นหลังกระดาษโทนอ่อน */
  bare?: boolean
  /**
   * ลงนามจากเส้นลงชื่อบนกระดาษได้ (ช่องที่ยังไม่มีขั้นลงนามเฉพาะ) — แยกจาก editable
   * เพราะลายมือชื่อแรกล็อกฉบับ แต่ผู้ลงนามคนถัดไปของฉบับเดียวกันยังต้องลงนามได้
   */
  signable?: boolean
  /** พรีวิวก่อนยืนยัน: กระดาษอย่างเดียว ไม่มีปุ่มลงนามบนกระดาษ */
  preview?: boolean
}

const FormPaperViewerInner: React.FC<FormPaperViewerProps> = ({ formId, caseNo, noticeSnapshot, noticeDetailEdit, noticeDraftPreview, editable = false, printable = false, versionSnapshot, snapshotCase, onSnapshotChange, page, bare = false, signable = false, preview = false }) => {
  const draftState = useFormDraftStore()
  const { drafts, relatedPersons, signatures: draftSignatures } = draftState
  const liveCaseItem = useCaseStore((state) => state.getCase(caseNo))
  const resultNotice = formId === 9 || formId === 10 ? liveCaseItem?.resultNotices?.[formId] : undefined
  const candidate = noticeSnapshot || resultNotice?.versions[resultNotice.versions.length - 1]
  const draftPreview = (formId === 9 || formId === 10) && noticeDraftPreview?.caseContext.no === caseNo ? noticeDraftPreview : undefined
  const snapshot = !versionSnapshot && !draftPreview && (formId === 9 || formId === 10) && candidate?.formNo === formId && candidate.caseNo === caseNo
    ? candidate : undefined
  const originalSignature = snapshot?.signatureVerification === 'simulated_original'
  const appealDraftCase = formId === 6 && liveCaseItem?.appealFolder?.addendum && !versionSnapshot ? {
    ...liveCaseItem,
    kb6Signed: false,
    kb6SupervisorSignedAt: undefined, kb6SupervisorSignedBy: undefined,
    kb6DirectorSignedAt: undefined, kb6DirectorSignedBy: undefined,
    kb6DeputySignedAt: undefined, kb6DeputySignedBy: undefined,
    kb6SecretarySignedAt: undefined, kb6SecretarySignedBy: undefined,
    secretarySignedAt: undefined, secretarySignedBy: undefined,
    kb6DeputyOpinionChoice: undefined, kb6SecretaryOpinionChoice: undefined,
    extensionDocs: undefined,
  } : liveCaseItem
  const caseItem = snapshotCase || (snapshot ? {
    ...snapshot.caseContext,
    kb9SignedAt: snapshot.formNo === 9 && originalSignature ? snapshot.signedAt : undefined,
    kb9SignedBy: snapshot.formNo === 9 && originalSignature ? snapshot.signedBy : undefined,
    kb10SignedAt: snapshot.formNo === 10 && originalSignature ? snapshot.signedAt : undefined,
    kb10SignedBy: snapshot.formNo === 10 && originalSignature ? snapshot.signedBy : undefined,
  } : draftPreview ? {
    ...draftPreview.caseContext,
    kb9SignedAt: undefined, kb9SignedBy: undefined,
    kb10SignedAt: undefined, kb10SignedBy: undefined,
  } : appealDraftCase)
  const consentRequests = useConsentSigningStore((s) => s.requests)

  const formMeta = FORMS_CATALOG.find((f) => f.n === formId) || FORMS_CATALOG[0]
  const pages = getFormPages(formId)
  const totalPages = pages.length

  const terminationSnapshot = formId === 15 && caseItem?.kb15?.status !== 'returned' ? caseItem?.kb15?.formSnapshot : formId === 16 && caseItem?.kb16?.signedAt ? caseItem.kb16.formSnapshot : formId === 17 && caseItem?.kb17?.signedAt ? caseItem.kb17.formSnapshot : undefined
  const draft = versionSnapshot?.fields || snapshot?.fields || draftPreview?.fields || terminationSnapshot || ([7, 9, 10, 11, 15, 16, 17].includes(formId)
    ? selectCaseDraft(draftState, formId, caseNo) : drafts[formId] || {})
  const isLetter = LETTER_STYLE_FORMS.includes(formId)

  /** draft ก่อน → แฟ้มจริง → ค่าเริ่มต้น */
  const val = (key: string, fallback = '') => {
    const v = draft[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v)
    // ช่องว่างในฉบับที่เก็บไว้ต้องยังเป็นช่องว่าง ไม่เติมจากข้อมูลแฟ้มที่เปลี่ยนภายหลัง
    return snapshot || draftPreview || versionSnapshot || terminationSnapshot ? '' : fallback
  }

  /**
   * คบ.1 — ช่อง "ผู้ยื่นคำร้อง" แสดงลายมือชื่อที่ผู้ขอคุ้มครองลงเองผ่านลิงก์ และเฉพาะเมื่อเนื้อหาปัจจุบันตรงกับฉบับที่ลงชื่อ
   * ใช้กับแฟ้มที่มีคำขอลงชื่อผ่านลิงก์แล้ว หรือแฟ้มที่ยังรอพยานลงนาม — แฟ้มอื่นคงลายมือชื่อเดิมตามเดิม
   */
  const consentCaseNo = caseNo || caseItem?.no
  const fingerprint = formId === 1 ? consentFingerprint(draft, relatedPersons) : ''
  const usesConsentLink =
    !snapshotCase && formId === 1 && Boolean(consentCaseNo) && (Boolean(latestRequestFor(consentRequests, consentCaseNo!)) || Boolean(caseItem?.kb1SignaturePending))
  const scopedSignatures = [7, 11, 15, 16, 17].includes(formId) && caseNo && draftState.draftCaseNo[formId] !== caseNo
    ? draftState.caseDrafts[caseNo]?.signatures || {}
    : signaturesForCase(draftSignatures, draftState.signatureCases, caseNo)
  const signatures = { ...scopedSignatures }
  if (terminationSnapshot && caseItem?.kb15?.headSignature && formId === 15) signatures['kb15-officer'] = caseItem.kb15.headSignature
  if (formId === 16 && caseItem?.kb16?.signedAt) signatures['kb16-authority'] = { signed: true, signerName: caseItem.kb16.signedBy || '', signedAt: caseItem.kb16.signedAt, signatureImage: caseItem.kb16.signatureImage }
  if (formId === 17 && caseItem?.kb17?.signedAt) signatures['kb17-signer'] = { signed: true, signerName: caseItem.kb17.signedBy || '', signedAt: caseItem.kb17.signedAt, signatureImage: caseItem.kb17.signatureImage }

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
        // ยังไม่ได้ลงชื่อ: บนกระดาษมีปุ่ม/ป้ายที่เส้นลงชื่ออยู่แล้ว ไม่ต้องมีแถบแจ้งซ้ำใต้กระดาษ
        : null
  }

  const ctx: PaperContext = { formMeta, draft, caseItem, relatedPersons: snapshot || draftPreview || snapshotCase ? [] : relatedPersons, signatures: versionSnapshot ? versionSnapshot.signatures || {} : snapshot ? (originalSignature ? { [`kb${formId}-secretary`]: { signed: true, signerName: snapshot.signedBy, signedAt: snapshot.signedAt, signatureImage: snapshot.signatureImage } } : {}) : draftPreview ? {} : signatures, val }

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

  useEffect(() => {
    if (!printable) return
    document.body.classList.add('kb-printing')
    return () => document.body.classList.remove('kb-printing')
  }, [printable])

  /** กระดาษหนึ่งแผ่น — ใช้ร่วมกันทั้งตัวอย่างบนหน้าจอและชุดพิมพ์ */
  const sheet = (render: (typeof pages)[number], key?: number, style?: React.CSSProperties) => (
    <div key={key} className="paper-a4 kb-paper relative rounded-sm bg-white shadow-lg select-text" style={{ width: A4_WIDTH, lineHeight: lineHeight(formId), ...style }}>
      <div className="absolute top-3 left-0 right-0 text-center font-bold text-rose-600 leading-none" style={{ fontSize: stampSize(formId) }}>ลับ</div>
      <FitPage deps={draft} shrink={!NO_SHRINK_FORMS.includes(formId)}><PaperDraftContext.Provider value={draft}>{render(ctx)}</PaperDraftContext.Provider></FitPage>
      {snapshot && (
        <p data-testid="notice-paper-signature-disclosure" className="mt-4 text-center text-[11px] text-slate-600">
          ข้อมูลสำหรับสาธิต · รุ่นที่ {snapshot.version} · ลายมือชื่อจำลอง ไม่มีผลทางกฎหมาย
          {!originalSignature && ' · มีการเติมรายละเอียดหลังลงนาม เนื้อหาที่เติมไม่ได้รับการรับรองด้วยลายมือชื่อเดิม'}
        </p>
      )}
      {draftPreview && <p data-testid="notice-paper-draft-disclosure" className="mt-4 text-center text-[11px] text-slate-600">ข้อมูลสำหรับสาธิต · ร่างก่อนยืนยันผลและลงนาม · ยังไม่ถือว่าส่งแจ้งผลแล้ว</p>}
      <div className="absolute bottom-2 left-0 right-0 text-center font-bold text-rose-600 leading-none" style={{ fontSize: stampSize(formId) }}>ลับ</div>
    </div>
  )

  /**
   * ปุ่มลงนามบนเส้นลงชื่อ: ช่องที่แบบมีขั้นลงนามเฉพาะใช้หน้าต่างลงนามของแบบนั้น (ลงทะเบียนใน paperSign)
   * ช่องที่ยังไม่มีขั้นลงนามเฉพาะ (PAPER_SIGN_FALLBACK_KEYS) ลงนามจากกระดาษได้เมื่อ signable
   */
  const [fallbackSlot, setFallbackSlot] = useState<{ key: string; role?: string; defaultName?: string } | null>(null)
  const liveSheet = !snapshot && !draftPreview && !versionSnapshot && !terminationSnapshot
  // Submitted คบ.15 freezes report fields while each reviewer adds their signature.
  const terminationReviewSheet = formId === 15 && caseItem?.kb15?.status === 'submitted' && !versionSnapshot && !snapshot && !snapshotCase
  const signUi = React.useMemo(() => (liveSheet || ((draftPreview || terminationReviewSheet) && signable)) && !preview ? {
    fallback: signable ? { onSign: (key: string, slot: { role?: string; defaultName?: string }) => setFallbackSlot({ key, ...slot }) } : undefined,
  } : null, [liveSheet, Boolean(draftPreview), terminationReviewSheet, signable, preview])

  /** หน้าที่แสดงบนจอ — page เกินจำนวนหน้าให้แสดงหน้าสุดท้าย */
  const screenIndexes = page ? [Math.min(Math.max(page, 1), totalPages) - 1] : pages.map((_, index) => index)
  const screenSheets = () => screenIndexes.map((index) => screenSheet(pages[index], index))

  /** กระดาษบนหน้าจอหนึ่งแผ่น — ตราประทับทะเบียนสารบรรณ overlay มุมขวาบนของหน้า 1 ไม่เปลี่ยนขอบกระดาษของแบบ */
  const screenSheet = (render: (typeof pages)[number], index: number) => (
    <div
      key={index}
      data-testid={`paper-page-${index + 1}`}
      aria-label={`หน้า ${index + 1} จาก ${totalPages}`}
      className="paper-a4 kb-paper relative rounded-sm bg-white shadow-lg select-text"
      style={{ width: A4_WIDTH, zoom: scale, lineHeight: lineHeight(formId) }}
    >
      <div className="absolute top-3 left-0 right-0 text-center font-bold text-rose-600 leading-none" style={{ fontSize: stampSize(formId) }}>ลับ</div>
      {index === 0 && !draftPreview && !snapshotCase && <SarabanStampStack caseNo={caseNo} formNo={formId} originalDocument={Boolean(versionSnapshot)} />}
      <FitPage deps={draft} shrink={!NO_SHRINK_FORMS.includes(formId)}><PaperDraftContext.Provider value={draft}>{render(ctx)}</PaperDraftContext.Provider></FitPage>
      {snapshot && (
        <p data-testid="notice-paper-signature-disclosure" className="mt-4 text-center text-[11px] text-slate-600">
          ข้อมูลสำหรับสาธิต · รุ่นที่ {snapshot.version} · ลายมือชื่อจำลอง ไม่มีผลทางกฎหมาย
          {!originalSignature && ' · มีการเติมรายละเอียดหลังลงนาม เนื้อหาที่เติมไม่ได้รับการรับรองด้วยลายมือชื่อเดิม'}
        </p>
      )}
      {draftPreview && <p data-testid="notice-paper-draft-disclosure" className="mt-4 text-center text-[11px] text-slate-600">ข้อมูลสำหรับสาธิต · ร่างก่อนยืนยันผลและลงนาม · ยังไม่ถือว่าส่งแจ้งผลแล้ว</p>}
      <div className="absolute bottom-2 left-0 right-0 text-center font-bold text-rose-600 leading-none" style={{ fontSize: stampSize(formId) }}>ลับ</div>
    </div>
  )

  return (
    <div className="flex flex-col items-center">
      {/* หัวเอกสาร: ชื่อแบบและจำนวนหน้า */}
      {!bare && <div className="ws-card mb-3 flex w-full flex-wrap items-center justify-between gap-2 px-4 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-[0.88rem] font-bold text-navy">
            {formMeta.code} - {formMeta.t}
          </span>
          <Badge variant="info" className="flex-shrink-0">
            {isLetter ? 'หนังสือราชการ A4' : 'แบบฟอร์ม A4'}
          </Badge>
        </div>

        <span className="flex-shrink-0 text-[0.8rem] font-medium text-muted">
          ทั้งหมด {totalPages} หน้า{totalPages > 1 ? ' · เลื่อนดูต่อเนื่อง' : ''}
        </span>
      </div>}

      {/* A4 Paper — เรนเดอร์ที่ความกว้างจริง 794px แล้วย่อทั้งแผ่นให้พอดีคอลัมน์
          เพื่อให้การตัดบรรทัดเหมือนกระดาษจริงไม่ว่าพื้นที่แสดงผลจะกว้างเท่าใด
          ทุกหน้าเรียงต่อกันในแนวตั้ง เลื่อนดูได้โดยไม่ต้องกดเปลี่ยนหน้า */}
      <div
        ref={stageRef}
        className={bare
          ? 'relative w-full overflow-hidden rounded-[10px] bg-[#e9edf1] px-3 py-4 flex flex-col items-center gap-4 md:gap-6'
          : 'relative w-full overflow-hidden rounded-xl border border-slate-300 bg-[#525659] p-3 md:p-6 shadow-2xl flex flex-col items-center gap-4 md:gap-6'}
      >
        <PaperSignUiContext.Provider value={signUi}>
        {editable && (liveSheet || Boolean(draftPreview?.onFieldChange) || Boolean(snapshot && noticeDetailEdit) || Boolean(versionSnapshot && onSnapshotChange))
          ? <PaperEditContext.Provider value={{ draft, editableFields: noticeDetailEdit?.fields || draftPreview?.editableFields, set: (key, value) => {
              if (versionSnapshot && onSnapshotChange) {
                onSnapshotChange(key, value)
              } else if (noticeDetailEdit && snapshot) {
                if (typeof value === 'string' && noticeDetailEdit.fields.includes(key)) noticeDetailEdit.onChange(key, value)
              } else if (draftPreview?.onFieldChange) {
                if (typeof value === 'string') draftPreview.onFieldChange(key, value)
              } else draftState.updateField(formId, key, value)
            } }}>
              <div data-testid="paper-editable" className="flex flex-col items-center gap-4 md:gap-6">{screenSheets()}</div>
            </PaperEditContext.Provider>
          : screenSheets()}
        </PaperSignUiContext.Provider>
      </div>

      {fallbackSlot && (
        <SignatureModal
          isOpen
          title={fallbackSlot.role ? `ลงนามในฐานะ${fallbackSlot.role}` : `ลงนามใน ${formMeta.code}`}
          signerRole={fallbackSlot.role || formMeta.code}
          defaultSignerName={fallbackSlot.defaultName || ''}
          onClose={() => setFallbackSlot(null)}
          onConfirm={(name, img) => {
            if (fallbackSlot.key === 'kb6-officer' && !readRoutableProtectionMethods(useFormDraftStore.getState().getDraft(6)).length) {
              showToast('กรุณาเลือกรูปแบบการคุ้มครองในข้อ 8.2 ก่อนลงนาม', 'warning')
              setFallbackSlot(null)
              return
            }
            draftState.signDocument(fallbackSlot.key, name, img, caseNo)
            setFallbackSlot(null)
            showToast('บันทึกลายมือชื่ออิเล็กทรอนิกส์แล้ว')
          }}
        />
      )}

      {printable && typeof document !== 'undefined' && createPortal(
        <div className="kb-print-root" aria-hidden="true">{pages.map((render, index) => sheet(render, index))}</div>,
        document.body,
      )}

      {consentNote && (
        <div data-testid="paper-consent-note" className="mt-2 w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <i className="fa-solid fa-signature mr-1.5" />
          {consentNote}
        </div>
      )}

      {caseItem && !bare && (
        <div className="ws-readonly mt-2 w-full text-[0.8rem] text-muted">
          <i className="fa-solid fa-link mr-1.5 text-blue" />
          {snapshot ? `ข้อมูลบนกระดาษจากฉบับที่เก็บไว้ รุ่นที่ ${snapshot.version} ของแฟ้ม ` : draftPreview ? 'ข้อมูลบนกระดาษจากร่างในชุดเสนอที่กำลังตรวจสอบของแฟ้ม ' : 'ข้อมูลบนกระดาษดึงจากร่างในแบบฟอร์ม และเติมด้วยข้อมูลจริงของแฟ้ม '}
          <span className="font-bold text-navy-deep">{caseItem.no}</span> ({caseItem.person})
        </div>
      )}
    </div>
  )
}

/** เรื่องจากระบบเดิมมีแต่ไฟล์ PDF — ไม่แสดงกระดาษที่เติมด้วยร่างตัวอย่างของระบบ */
const StandardFormPaperViewer: React.FC<FormPaperViewerProps> = (props) => {
  const legacySource = useCaseStore((state) => state.getCase(props.caseNo))?.legacySource
  if (legacySource) return <LegacyFormsNotice legacySource={legacySource} />
  return <FormPaperViewerInner {...props} />
}

export const FormPaperViewer: React.FC<FormPaperViewerProps> = (props) => {
  const live = useCaseStore(s => props.caseNo ? s.cases.find(c => c.no === props.caseNo) : undefined)
  const forms = useFormDraftStore()
  const c = props.snapshotCase || live
  if (props.formId === 19 || props.formId === 20 || (props.formId === 18 && c && isRightsReferral(c))) {
    const id = props.formId === 19 ? 'chairman-signature' : 'rights-assistance-letter'
    const fields = props.versionSnapshot?.fields || (c ? selectCaseDraft(forms, referralFormNo(c, id), c.no) : {})
    return <ReferralPaperPreview id={id} draft={referralValues(c, id, fields)} />
  }
  return <StandardFormPaperViewer {...props} />
}
