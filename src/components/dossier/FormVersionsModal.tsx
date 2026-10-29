import { DocumentViewButton } from '../common/DocumentViewButton'
import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { FormCodeTooltip } from '../common/FormCodeTooltip'
import { FormPaperViewer } from '../forms/FormPaperViewer'
import type { CaseItem, ExtensionKb6SignerRole, ExtensionRequest } from '../../types/case'
import { addendumLabel, addendumRoundForVersion, extensionAddenda, extensionKb6PendingSigner, getActiveExtensionDocs, isAddendumVersion } from '../../lib/formSignature'
import { FORMS_CATALOG } from '../../lib/constants'
import { formatThaiDate } from '../../lib/utils'
import { signaturesForCase, useFormDraftStore } from '../../store/useFormDraftStore'
import { useAuthStore } from '../../store/useAuthStore'

/** แบบที่มีประวัติฉบับ/บันทึกเพิ่มเติม (ขยายระยะเวลา) ในแถวแฟ้ม */
export const VERSIONED_FORMS = [3, 6, 14, 15, 16, 17] as const

const LINK_BUTTON =
  'inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50'

/** ลำดับลงนาม คบ.6 ฉบับขยายเวลา = ลำดับเห็นชอบ คบ.14 */
const SIGN_ORDER: { role: ExtensionKb6SignerRole; stage: string; label: string }[] = [
  { role: 'supervisor', stage: 'supervisor', label: 'ผู้บังคับบัญชา' },
  { role: 'director', stage: 'director', label: 'ผู้อำนวยการ' },
  { role: 'deputy', stage: 'deputy_secretary', label: 'รองเลขาธิการ' },
  { role: 'secretary', stage: 'secretary', label: 'เลขาธิการ' },
]

const KB14_STATUS: Record<ExtensionRequest['status'], string> = {
  submitted: 'ส่งตรวจแล้ว · รอผู้ตรวจ',
  returned: 'ส่งกลับแก้ไข',
  pending: 'อยู่ระหว่างเสนอตามลำดับ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}

interface VersionRow {
  key: string
  label: string
  status: string
  meta?: string
  note?: string
  current: boolean
  /** ฉบับเดิมที่เก็บไว้ — เปิดดูได้อย่างเดียว */
  snapshot?: { fields: Record<string, any>; signatures?: Record<string, any> }
  /** คำขอขยายที่ใช้ฉบับนี้ (คบ.6) — แสดงลำดับลงนาม */
  request?: ExtensionRequest
  caseSnapshot?: CaseItem
}

const metaOf = (at?: string, by?: string) => [at ? formatThaiDate(at) : '', by || ''].filter(Boolean).join(' · ') || undefined

/** สถานะฉบับปัจจุบันของ คบ.3/คบ.6 ในชุดขอขยาย (ยกมาจากการ์ดชุดเอกสารเดิม) */
const currentDocStatus = (formNo: 3 | 6, caseItem: CaseItem, locked: boolean): string => {
  const docs = caseItem.extensionDocs
  const active = getActiveExtensionDocs(caseItem)
  const request = active?.request ?? (docs ? caseItem.extensionRequests?.[docs.round - 1] : undefined)
  if (docs && (active || request?.status === 'approved')) {
    if (!active) return formNo === 3 ? 'ใช้ประกอบคำขอแล้ว' : 'ลงนามครบ'
    if (active.editable) return 'ร่าง · แก้ไขได้'
    return formNo === 3 ? 'ส่งตรวจแล้ว · ล็อก' : 'อยู่ระหว่างลงนามตามลำดับ'
  }
  return locked ? 'ลงนามแล้ว · ล็อก' : 'ฉบับปัจจุบัน'
}

/** คำขอขยายที่แนบ คบ.6 ฉบับนี้ (docVersion = เลขฉบับ คบ.6) */
const requestForKb6 = (caseItem: CaseItem, version: number) =>
  [...(caseItem.extensionRequests || [])].reverse().find((r) => r.docVersion === version)

export function useFormVersionRows(formNo: number, caseItem: CaseItem): VersionRow[] {
  const revisions = useFormDraftStore((s) => s.revisions[formNo])
  const locked = useFormDraftStore((s) => Boolean(s.locks[formNo]))

  if ([15, 16, 17].includes(formNo)) {
    const state = useFormDraftStore.getState()
    const history = state.draftCaseNo[formNo] === caseItem.no ? revisions || [] : state.caseDrafts[caseItem.no]?.revisions[formNo] || []
    return [...history.map(r => ({ key: `v${r.version}`, label: `ฉบับที่ ${r.version}`, status: 'ฉบับเดิม · เก็บไว้ไม่แก้ทับ', meta: metaOf(r.at, r.by), note: r.reason, current: false, snapshot: { fields: r.snapshot, signatures: r.signatures }, caseSnapshot: r.caseSnapshot })), { key: 'current', label: `ฉบับที่ ${history.length + 1}`, status: 'ฉบับปัจจุบัน', current: true }]
  }

  if (formNo === 3 || formNo === 6) {
    /** บันทึกเพิ่มเติม (ขยายระยะเวลา) ไม่นับเป็นฉบับ — แสดงเฉพาะฉบับเดิมและฉบับที่แก้ไขหลังส่งกลับ */
    const history = revisions || []
    const old: VersionRow[] = history
      .filter((r) => !isAddendumVersion(caseItem, formNo, r.version))
      .map((r) => ({
        key: `v${r.version}`,
        label: `ฉบับที่ ${r.version}`,
        status: 'ฉบับเดิม · เก็บไว้ไม่แก้ทับ',
        meta: metaOf(r.at, r.by),
        note: r.reason,
        current: false,
        snapshot: { fields: r.snapshot, signatures: r.signatures },
        request: formNo === 6 ? requestForKb6(caseItem, r.version) : undefined,
      }))
    const currentVersion = history.length + 1
    /** ฉบับล่าสุดเป็นบันทึกเพิ่มเติม — ฉบับเดิมทุกฉบับอยู่ใน revisions แล้ว ไม่มีแถว "ปัจจุบัน" ของฉบับเดิม */
    if (isAddendumVersion(caseItem, formNo, currentVersion)) return old
    return [
      ...old,
      {
        key: `v${currentVersion}`,
        label: `ฉบับที่ ${currentVersion}`,
        status: currentDocStatus(formNo, caseItem, locked),
        current: true,
        request: formNo === 6 ? requestForKb6(caseItem, currentVersion) : undefined,
      },
    ]
  }

  /** หนังสือแจ้งกรมฯ (แบบ 18) — ฉบับเดิมที่ถูกส่งคืนแก้ไขเก็บไว้ไม่แก้ทับ ฉบับล่าสุดคือฉบับปัจจุบัน */
  if (formNo === 18) {
    const history = revisions || []
    const old: VersionRow[] = history.map((r) => ({
      key: `v${r.version}`,
      label: `ฉบับที่ ${r.version}`,
      status: 'ฉบับเดิม · เก็บไว้ไม่แก้ทับ',
      meta: metaOf(r.at, r.by),
      note: r.reason,
      current: false,
      snapshot: { fields: r.snapshot, signatures: r.signatures },
    }))
    const currentVersion = history.length + 1
    return [...old, { key: `v${currentVersion}`, label: `ฉบับที่ ${currentVersion}`, status: locked ? 'ลงนามแล้ว · ล็อก' : 'ฉบับปัจจุบัน', current: true }]
  }

  if (formNo === 14) {
    const requests = caseItem.extensionRequests || []
    return requests.flatMap((req, i) => {
      const round = addendumLabel(i + 1)
      const isLatest = i === requests.length - 1
      const old: VersionRow[] = (req.previousVersions || []).map((v) => ({
        key: `${req.id}-v${v.version}`,
        label: `${round} · แก้ไขครั้งที่ ${v.version}`,
        status: 'ฉบับก่อนส่งกลับแก้ไข · เก็บไว้ไม่แก้ทับ',
        meta: metaOf(v.createdAt),
        note: v.returnNote,
        current: false,
        snapshot: v.formSnapshot ? { fields: v.formSnapshot } : undefined,
      }))
      return [
        ...old,
        {
          key: `${req.id}-v${req.version || 1}`,
          label: round,
          status: KB14_STATUS[req.status],
          meta: metaOf(req.requestedAt, req.requestedBy),
          current: isLatest,
          snapshot: !isLatest && req.formSnapshot ? { fields: req.formSnapshot } : undefined,
        },
      ]
    })
  }

  return []
}

const SignOrder: React.FC<{ request: ExtensionRequest }> = ({ request }) => {
  const sigs = request.kb6Signatures || {}
  const currentStage = request.status === 'submitted' || request.status === 'pending' ? request.approvalStage : undefined
  return (
    <div className="mt-3 border-t border-line pt-3" data-testid="kb6-sign-order">
      <h4 className="mb-2 text-[0.8rem] font-semibold text-navy">ลำดับลงนาม คบ.6 ฉบับนี้</h4>
      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {SIGN_ORDER.map((s) => {
          const sig = sigs[s.role]
          const state = sig ? 'signed' : currentStage === s.stage ? 'current' : 'pending'
          return (
            <li key={s.role} data-state={state} className="min-w-0 rounded-lg border border-line bg-soft p-2.5 text-[0.8rem]">
              <div className="flex items-center gap-1.5 font-semibold text-navy">
                <i className={`fa-solid ${state === 'signed' ? 'fa-circle-check text-success' : state === 'current' ? 'fa-hourglass-half' : 'fa-circle'} text-xs`} aria-hidden="true" />
                {s.label}
              </div>
              <div className="mt-1 text-muted">
                {state === 'signed' ? `ลงนามแล้ว${sig?.by ? ` · ${sig.by}` : ''}${sig?.at ? ` · ${formatThaiDate(sig.at)}` : ''}` : state === 'current' ? 'ถึงคิวลงนาม' : 'รอลำดับ'}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** รายการเวอร์ชันของแบบ คบ. หนึ่งฉบับ — ฉบับปัจจุบันเปิดแบบฟอร์มได้ ฉบับเดิมเปิดดูอย่างเดียว */
export const FormVersionsModal: React.FC<{ formNo: number | null; caseItem: CaseItem; onClose: () => void }> = ({ formNo, caseItem, onClose }) => {
  if (formNo === null) return null
  return <FormVersionsDialog formNo={formNo} caseItem={caseItem} onClose={onClose} />
}

const FormVersionsDialog: React.FC<{ formNo: number; caseItem: CaseItem; onClose: () => void }> = ({ formNo, caseItem, onClose }) => {
  const rows = useFormVersionRows(formNo, caseItem)
  const [viewing, setViewing] = useState<VersionRow | null>(null)
  const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]
  const title = formNo === 14 ? `ประวัติการแก้ไข ${meta.code}` : `เวอร์ชัน ${meta.code}`

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (viewing) setViewing(null)
      else onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, onClose])

  /** ฉบับล่าสุดอยู่บนสุด */
  const ordered = [...rows].reverse()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="form-versions-modal"
        data-form-number={formNo}
        className={`ws-card flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden ${viewing ? 'max-w-3xl' : 'max-w-2xl'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[1.05rem] font-bold text-navy">
              <i className="fa-solid fa-clock-rotate-left text-blue" aria-hidden="true" />
              <span>{viewing ? `${meta.code} ${viewing.label}` : title}</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {viewing ? 'ฉบับเดิมที่เก็บไว้ — ดูได้อย่างเดียว' : `${meta.t} · ทั้งหมด ${rows.length} ${formNo === 14 ? 'รายการ' : 'ฉบับ'}`}
            </p>
          </div>
          <Button type="button" variant="icon" size="icon" aria-label="ปิด" onClick={onClose}>
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="overflow-y-auto p-5">
          {viewing?.snapshot ? (
            <div className="space-y-3">
              <Button type="button" variant="ghost" size="md" onClick={() => setViewing(null)}>
                <i className="fa-solid fa-arrow-left text-xs" aria-hidden="true" />
                กลับรายการเวอร์ชัน
              </Button>
              <FormPaperViewer formId={formNo} caseNo={caseItem.no} versionSnapshot={viewing.snapshot} snapshotCase={viewing.caseSnapshot} />
            </div>
          ) : rows.length === 0 ? (
            <div className="ws-card border-dashed p-8 text-center text-[0.88rem] text-muted">ยังไม่มีเวอร์ชันของแบบนี้</div>
          ) : (
            <ol className="space-y-2">
              {ordered.map((r) => (
                <li
                  key={r.key}
                  data-testid="form-version-item"
                  data-current={r.current || undefined}
                  className={`rounded-xl border p-3 ${r.current ? 'border-blue bg-blue-soft/40' : 'border-line bg-white'}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <strong className="block text-[0.88rem] font-semibold text-navy">
                        {meta.code} {r.label}
                        {r.current && <span className="ws-status ml-2">ฉบับปัจจุบัน</span>}
                      </strong>
                      <small className="block text-[0.8rem] text-muted">
                        {r.status}
                        {r.meta ? ` · ${r.meta}` : ''}
                      </small>
                      {r.note && <small className="block text-[0.8rem] text-muted">{r.note}</small>}
                    </div>
                    {r.current ? (
                      <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo: caseItem.no }} className={LINK_BUTTON}>
                        <i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />
                        เปิดแบบฟอร์ม
                      </Link>
                    ) : r.snapshot ? (
                      <DocumentViewButton onClick={() => setViewing(r)} />
                    ) : null}
                  </div>
                  {formNo === 6 && r.request && <SignOrder request={r.request} />}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  )
}

/** จำนวนฉบับของแบบเดิม (ไม่นับบันทึกเพิ่มเติมขยายระยะเวลา) — ใช้แสดงปุ่ม "เวอร์ชัน" ในแถวแฟ้ม */
export function originalVersionCount(formNo: 3 | 6 | 18, caseItem: CaseItem, revisions: { version: number }[] = []): number {
  if (formNo === 18) return revisions.length + 1
  const originals = revisions.filter((r) => addendumRoundForVersion(caseItem, formNo, r.version) === undefined).length
  const currentIsAddendum = addendumRoundForVersion(caseItem, formNo, revisions.length + 1) !== undefined
  return originals + (currentIsAddendum ? 0 : 1)
}

/** ดูบันทึกเพิ่มเติมที่เก็บไว้ (อ่านอย่างเดียว) */
export const AddendumViewerModal: React.FC<{
  formNo: number
  caseNo: string
  title: string
  snapshot: { fields: Record<string, any>; signatures?: Record<string, any> } | null
  onClose: () => void
}> = ({ formNo, caseNo, title, snapshot, onClose }) => {
  React.useEffect(() => {
    if (!snapshot) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [snapshot, onClose])
  if (!snapshot) return null
  const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${meta.code} ${title}`}
        data-testid="addendum-viewer-modal"
        className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line bg-soft px-5 py-3">
          <div className="min-w-0">
            <div className="text-[1.05rem] font-bold text-navy">{meta.code} {title}</div>
            <p className="mt-0.5 text-[0.8rem] text-muted">บันทึกที่เก็บไว้ — ดูได้อย่างเดียว</p>
          </div>
          <Button type="button" variant="icon" size="icon" aria-label="ปิด" onClick={onClose}>
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>
        <div className="overflow-y-auto p-5">
          <FormPaperViewer formId={formNo} caseNo={caseNo} versionSnapshot={snapshot} />
        </div>
      </div>
    </div>
  )
}

/** รายการบันทึกเพิ่มเติม (ขยายระยะเวลา) ใต้แถว คบ.3/คบ.6/คบ.14 ในแฟ้ม */
export const ExtensionAddendumList: React.FC<{ formNo: 3 | 6 | 14; caseItem: CaseItem; onOpenHistory?: (formNo: number) => void }> = ({
  formNo,
  caseItem,
  onOpenHistory,
}) => {
  const draftState = useFormDraftStore()
  const currentRole = useAuthStore((s) => s.currentRole)
  const isCurrentCase = draftState.draftCaseNo[formNo] === caseItem.no
  const revisions = isCurrentCase ? draftState.revisions[formNo] : draftState.caseDrafts[caseItem.no]?.revisions[formNo]
  const currentSignatures = isCurrentCase
    ? signaturesForCase(draftState.signatures, draftState.signatureCases, caseItem.no)
    : draftState.caseDrafts[caseItem.no]?.signatures || {}
  const locked = useFormDraftStore((s) => Boolean(s.locks[formNo]))
  const [viewing, setViewing] = useState<{ title: string; snapshot: { fields: Record<string, any>; signatures?: Record<string, any> } } | null>(null)
  const addenda = extensionAddenda(caseItem, formNo)
  if (addenda.length === 0) return null
  const meta = FORMS_CATALOG.find((f) => f.n === formNo) || FORMS_CATALOG[0]

  return (
    <>
      <ul data-testid="addendum-list" className="space-y-2">
        {addenda.map((a) => {
          const title = `${meta.code} ${meta.t} · ฉบับที่ ${a.version}`
          const req = a.request
          let status: string
          let snapshot: { fields: Record<string, any>; signatures?: Record<string, any> } | undefined
          if (formNo === 14) {
            status = req ? KB14_STATUS[req.status] : ''
            snapshot = req?.formSnapshot ? { fields: req.formSnapshot } : undefined
          } else {
            const rev = (revisions || []).find((r) => r.version === a.version)
            const reqSnap = formNo === 3 ? req?.kb3Snapshot : req?.kb6Snapshot
            snapshot = rev ? { fields: rev.snapshot, signatures: rev.signatures } : reqSnap ? { fields: reqSnap, signatures: formNo === 6 ? (req?.kb6Signatures as any) : undefined } : undefined
            status = a.current
              ? currentDocStatus(formNo, caseItem, locked)
              : formNo === 3
                ? 'ใช้ประกอบคำขอแล้ว'
                : req?.status === 'approved' ? 'ลงนามครบ' : req ? KB14_STATUS[req.status] : 'เก็บไว้ไม่แก้ทับ'
          }
          const documentSignatures = a.current ? currentSignatures : snapshot?.signatures || {}
          const signed = formNo === 3
            ? Boolean(documentSignatures['kb3-witness']?.signed && documentSignatures['kb3-officer']?.signed)
            : formNo === 6 ? Boolean(documentSignatures['kb6-officer']?.signed)
              : Boolean(documentSignatures['kb14-witness']?.signed)
          const awaitingMySignature = a.current && formNo === 6 && Boolean(extensionKb6PendingSigner(caseItem, currentRole))
          const needsSignature = a.current && (!signed || awaitingMySignature)
          if (awaitingMySignature) status = 'รอลงนาม'
          else if (signed) status = 'ลงนามแล้ว'
          const returned = formNo === 14 ? req?.previousVersions?.length || 0 : 0
          const metaText = metaOf(req?.requestedAt, req?.requestedBy)
          return (
            <li
              key={a.round}
              data-testid="addendum-item"
              data-round={a.round}
              data-current={a.current || undefined}
              className={`grid min-h-[5rem] grid-cols-1 items-center gap-2 rounded-xl border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_7rem_10rem] ${needsSignature ? 'border-[#e6cf86] bg-[#fdf8e7]' : 'border-[#9fd0b4] bg-[#eef8f2]'}`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <FormCodeTooltip formNo={formNo}>
                  <span className="flex h-9 min-w-12 shrink-0 items-center justify-center rounded-lg bg-blue-soft px-2 text-[0.8rem] font-bold text-blue">{meta.code}</span>
                </FormCodeTooltip>
                <div className="min-w-0">
                  <strong className="block text-[0.88rem] font-semibold text-navy">{meta.t}</strong>
                  <p className="mt-1 text-[0.8rem] text-muted">ฉบับที่ {a.version} · ขอขยายเวลาครั้งที่ {a.round}</p>
                  {metaText && <p className="text-[0.8rem] text-muted">{metaText}</p>}
                  {returned > 0 && <p className="text-[0.8rem] text-muted">ส่งกลับแก้ไข {returned} ครั้ง</p>}
                </div>
              </div>
              <div className="flex min-w-0 sm:justify-center">
                {status && <span className={`ws-status text-center ${!needsSignature ? 'success' : ''}`}>{status}</span>}
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                {formNo === 14 && returned > 0 && onOpenHistory && (
                  <Button type="button" variant="secondary" size="md" data-testid="addendum-history-button" onClick={() => onOpenHistory(14)}>
                    <i className="fa-solid fa-clock-rotate-left text-xs" aria-hidden="true" />
                    ประวัติการแก้ไข
                  </Button>
                )}
                {!needsSignature && snapshot ? (
                  <DocumentViewButton data-testid="addendum-view-button" onClick={() => setViewing({ title, snapshot })} />
                ) : formNo !== 14 && a.current ? (
                  <Link to="/form/$formId" params={{ formId: String(formNo) }} search={{ caseNo: caseItem.no }} className={LINK_BUTTON}>
                    <i className={`fa-solid ${awaitingMySignature ? 'fa-signature' : 'fa-pen-to-square'} text-xs`} aria-hidden="true" />
                    {awaitingMySignature ? 'เปิดเพื่อลงนาม' : 'เปิดแบบฟอร์ม'}
                  </Link>
                ) : formNo === 14 && a.current ? (
                  <Link to="/form/$formId" params={{ formId: '14' }} search={{ caseNo: caseItem.no }} className={LINK_BUTTON}>
                    <i className="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />
                    เปิดแบบฟอร์ม
                  </Link>
                ) : snapshot ? (
                  <DocumentViewButton data-testid="addendum-view-button" onClick={() => setViewing({ title, snapshot: snapshot! })} />
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>
      <AddendumViewerModal formNo={formNo} caseNo={caseItem.no} title={viewing?.title || ''} snapshot={viewing?.snapshot || null} onClose={() => setViewing(null)} />
    </>
  )
}
