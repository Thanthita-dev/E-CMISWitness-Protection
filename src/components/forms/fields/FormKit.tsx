import { showConfirmAlert } from '../../../lib/swal'
import React, { useCallback, useContext, useId, useState } from 'react'
import { Button } from '../../common/Button'
import { Badge } from '../../common/Badge'
import { FormCodeTooltip } from '../../common/FormCodeTooltip'
import { useFormDraftStore } from '../../../store/useFormDraftStore'
import { useCaseStore } from '../../../store/useCaseStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { FormFilesPanel } from '../FormFilesPanel'
import { FormSarabanPanel } from '../FormSarabanPanel'
import { FormInitialTabContext } from '../FormInitialTab'
import { AsideSlotContext, DocActions, useEditorView } from '../EditorView'
import { CaseClosedBanner, useIsFormCaseClosed, useIsFormCaseLegacy } from '../FormCaseScope'
import { ThaiDateHint } from '../../common/ThaiDateHint'
import { formatThaiDateTime, isoFromThaiParts, thaiPartsFromIso, toIsoDate, toIsoDateTimeLocal } from '../../../lib/utils'
import {
  KB6_METHOD_EXTERNAL,
  PROTECTION_METHOD_OPTIONS,
  ROLE_NAMES,
  protectionMethodSelectionIssue,
  toggleProtectionMethod,
} from '../../../lib/constants'
import { VoiceTextarea } from '../../common/VoiceTextarea'

/**
 * ชุดคอนโทรลสำหรับหน้ากรอกแบบ คบ. — ทุกตัวผูกกับ key เดียวกับที่หน้ากระดาษ A4 อ่าน
 * เพื่อให้ "ช่องกรอก" กับ "ช่องบนกระดาษ" ตรงกันหนึ่งต่อหนึ่งตามต้นฉบับราชการ
 */

const INPUT = 'ws-input'
const AREA = 'ws-input'

export const useField = (formId: number) => {
  const { getDraft, updateField } = useFormDraftStore()
  const draft = getDraft(formId)
  return {
    draft,
    get: (key: string, fallback = '') => (draft[key] ?? fallback) as string,
    set: (key: string, value: unknown) => updateField(formId, key, value),
  }
}

/** หัวข้อหมวดของหน้ากรอก พร้อมเลขข้อตามต้นฉบับ */
export const Section: React.FC<{ no?: string; title: string; hint?: string; children: React.ReactNode }> = ({
  no,
  title,
  hint,
  children,
}) => (
  <div className="space-y-3">
    <div className="border-b border-line pb-2">
      <h4 className="text-[1.05rem] font-bold text-navy">
        {no && <span className="mr-1.5 text-blue">{no}</span>}
        {title}
      </h4>
      {hint && <p className="text-[0.8rem] text-muted mt-0.5">{hint}</p>}
    </div>
    {children}
  </div>
)

/** วางช่องกรอกเป็นคอลัมน์ */
export const Grid: React.FC<{ cols?: 1 | 2 | 3 | 4; children: React.ReactNode }> = ({ cols = 2, children }) => (
  <div
    className={`grid gap-[0.72rem] grid-cols-1 ${
      cols === 1 ? '' : cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
    }`}
  >
    {children}
  </div>
)

const Label: React.FC<{ label: string; required?: boolean; htmlFor?: string }> = ({ label, required, htmlFor }) => (
  <label className="ws-label" htmlFor={htmlFor}>
    {label}
    {required && <span className="text-danger"> *</span>}
  </label>
)

/** แบบ คบ. ฉบับนี้ถูกล็อกอยู่หรือไม่ — ใช้ปิดช่องกรอกอัตโนมัติเมื่อฉบับลงนามแล้ว หรือแฟ้มปิดงานคุ้มครองแล้ว (WIT1148) */
export const useIsFormLocked = (formId: number) => {
  const signedLock = useFormDraftStore((s) => Boolean(s.locks[formId]))
  const caseClosed = useIsFormCaseClosed(formId)
  return signedLock || caseClosed
}

/**
 * บริบทของ Audit Log สำหรับฉบับที่ถูกล็อก (WIT0611)
 * `EditorShell` เป็นผู้ประกาศว่าแบบนี้อยู่ในแฟ้มไหนและใช้รหัสอะไร
 * ช่องกรอกทุกช่องจึงรายงาน "ความพยายามแก้ไข" กลับเข้าแฟ้มเดียวกันได้โดยไม่ต้องรับ prop ทีละชั้น
 */
const FormLockAuditContext = React.createContext<{ caseNo?: string; code?: string }>({})

/**
 * รายงานความพยายามแก้ไขช่องของฉบับลงนาม
 * ช่องที่ล็อกถูก `disabled` ไว้จึงไม่มี change event — เหตุการณ์ที่จับได้จริงคือการกดลงบนช่อง
 * ซึ่งเบราว์เซอร์ส่งต่อขึ้นมาที่กล่องหุ้ม เพราะตัว input ที่ disabled ไม่รับ event เอง
 */
const useLockedEditAttempt = (locked: boolean, fieldLabel: string) => {
  const { caseNo, code } = useContext(FormLockAuditContext)
  const recordLockedEditAttempt = useCaseStore((s) => s.recordLockedEditAttempt)
  const currentRole = useAuthStore((s) => s.currentRole)

  return useCallback(() => {
    if (!locked || !caseNo) return
    recordLockedEditAttempt(caseNo, code || 'แบบ คบ.', fieldLabel, ROLE_NAMES[currentRole] || 'ผู้ใช้งานระบบ')
  }, [locked, caseNo, code, fieldLabel, recordLockedEditAttempt, currentRole])
}

export const Field: React.FC<{
  formId: number
  name: string
  label: string
  placeholder?: string
  required?: boolean
  type?: string
  disabled?: boolean
}> = ({ formId, name, label, placeholder, required, type = 'text', disabled }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const isDisabled = disabled || locked
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const inputId = useId()
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={inputId} />
      <input
        id={inputId}
        type={type}
        value={f.get(name)}
        placeholder={placeholder}
        disabled={isDisabled}
        onChange={(e) => f.set(name, e.target.value)}
        className={`${INPUT}${isDisabled ? ' cursor-not-allowed' : ''}`}
      />
    </div>
  )
}

export const Area: React.FC<{
  formId: number
  name: string
  label: string
  rows?: number
  placeholder?: string
  required?: boolean
}> = ({ formId, name, label, rows = 3, placeholder, required }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const areaId = useId()
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={areaId} />
      <VoiceTextarea
        id={areaId}
        rows={rows}
        value={f.get(name)}
        placeholder={placeholder}
        disabled={locked}
        onChange={(e) => f.set(name, e.target.value)}
        className={`${AREA}${locked ? ' cursor-not-allowed' : ''}`}
      />
    </div>
  )
}

export const Select: React.FC<{
  formId: number
  name: string
  label: string
  options: string[]
  required?: boolean
}> = ({ formId, name, label, options, required }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const selectId = useId()
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={selectId} />
      <select
        id={selectId}
        value={f.get(name)}
        disabled={locked}
        onChange={(e) => f.set(name, e.target.value)}
        className={`${INPUT}${locked ? ' cursor-not-allowed' : ''}`}
      >
        <option value="">- เลือก -</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** ตัวเลือกเดียว — ตรงกับช่อง ☐ แบบเลือกได้ข้อเดียวในต้นฉบับ */
export const Radios: React.FC<{
  formId: number
  name: string
  label: string
  options: string[]
  required?: boolean
}> = ({ formId, name, label, options, required }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const current = f.get(name)
  return (
    <div>
      <Label label={label} required={required} />
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={locked}
            onClick={() => f.set(name, current === o ? '' : o)}
            className={`min-h-[44px] rounded-lg border px-3 py-2 text-[0.88rem] font-semibold transition ${
              locked ? 'cursor-not-allowed opacity-60' : ''
            } ${
              current === o
                ? 'border-blue bg-blue text-white'
                : 'border-[#aebdca] bg-white text-ink hover:bg-soft'
            }`}
          >
            {current === o ? '☑' : '☐'} {o}
          </button>
        ))}
      </div>
    </div>
  )
}

/** ตัวเลือกหลายข้อ — เก็บเป็น array ตรงกับกลุ่ม ☐ ในต้นฉบับ */
export const Checks: React.FC<{
  formId: number
  name: string
  label: string
  options: string[]
  columns?: boolean
}> = ({ formId, name, label, options, columns }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const selected: string[] = Array.isArray(f.draft[name]) ? f.draft[name] : []
  const toggle = (o: string) =>
    f.set(name, selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o])
  return (
    <div>
      <Label label={label} />
      <div className={columns ? 'space-y-1' : 'flex flex-wrap gap-1.5'}>
        {options.map((o) => (
          <button
            key={o}
            type="button"
            disabled={locked}
            onClick={() => toggle(o)}
            className={`min-h-[44px] rounded-lg border px-3 py-2 text-[0.88rem] font-semibold text-left transition ${
              columns ? 'block w-full' : ''
            } ${locked ? 'cursor-not-allowed opacity-60' : ''} ${
              selected.includes(o)
                ? 'border-blue bg-blue-soft text-navy'
                : 'border-[#aebdca] bg-white text-ink hover:bg-soft'
            }`}
          >
            {selected.includes(o) ? '☑' : '☐'} {o}
          </button>
        ))}
      </div>
    </div>
  )
}

/** แถวรายชื่อเจ้าพนักงานชุดปฏิบัติการ 4 นาย (คบ.4 / คบ.5 / คบ.6 / คบ.8) */
export const OfficerRosterFields: React.FC<{ formId: number; count?: number; disabled?: boolean }> = ({
  formId,
  count = 4,
  disabled,
}) => (
  <div className="space-y-2">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="grid grid-cols-1 sm:grid-cols-[1.4fr_1fr_auto] gap-[0.72rem] items-end">
        <Field formId={formId} name={`ชุดชื่อ${i + 1}`} label={`${i + 1}. ชื่อ - สกุล`} disabled={disabled} />
        <Field formId={formId} name={`ชุดตำแหน่ง${i + 1}`} label="ตำแหน่ง" disabled={disabled} />
        <div className="pb-2.5 text-[0.8rem] font-semibold text-muted sm:whitespace-nowrap">
          {i === 0 ? 'เป็นหัวหน้าชุด' : 'เป็นชุดปฏิบัติการ'}
        </div>
      </div>
    ))}
  </div>
)

/** หัวเอกสาร: เลขที่แบบ / ปี / วันเดือนปี ที่ปรากฏมุมขวาบนของทุกแบบ คบ. */
export const DocHeaderFields: React.FC<{ formId: number }> = ({ formId }) => (
  <Grid cols={3}>
    <Field formId={formId} name="เลขที่แบบ" label="เลขที่" placeholder="เช่น 012" />
    <Field formId={formId} name="ปีที่ยื่น" label="ปี พ.ศ. 25..." placeholder="69" />
    <DateField formId={formId} name="วันเดือนปี" label="วัน/เดือน/ปี" />
  </Grid>
)

/** วันที่แบบราชการ 3 ช่อง: วันที่ / เดือน / พ.ศ. */
export const ThaiDateFields: React.FC<{
  formId: number
  label: string
  dayKey: string
  monthKey: string
  yearKey: string
}> = ({ formId, label, dayKey, monthKey, yearKey }) => (
  <div>
    <Label label={label} />
    <div className="grid grid-cols-3 gap-[0.72rem]">
      <Field formId={formId} name={dayKey} label="วันที่" />
      <Field formId={formId} name={monthKey} label="เดือน" />
      <Field formId={formId} name={yearKey} label="พ.ศ." />
    </div>
  </div>
)

/**
 * กรอบหน้ากรอกมาตรฐานของทุกแบบ คบ.
 * ส่ง formId เข้ามาเพื่อเปิดแท็บ "รวมไฟล์ คบ." ที่รวมไฟล์แนบของทุกแบบ คบ. ในสำนวนเดียวกัน
 */
export const EditorShell: React.FC<{
  code: string
  title: string
  hint?: string
  formId?: number
  children: React.ReactNode
  footer?: React.ReactNode
  /** ฉบับนี้สร้างเวอร์ชันใหม่เพื่อแก้ไขทับได้หรือไม่หลังถูกล็อก — false = ล็อกถาวร (เช่น คบ.11 หลังพยานลงนามยอมรับการคุ้มครอง) */
  allowRevise?: boolean
  /** แฟ้มที่แบบนี้สังกัด — ใช้บันทึกความพยายามแก้ไขฉบับลงนามลง Audit Log ของแฟ้ม (WIT0611) */
  caseNo?: string
  /** ป้ายแทน "ฉบับที่ N" (เช่น บันทึกเพิ่มเติมของการขอขยายระยะเวลา) — ไม่ระบุ = ใช้ค่าเดิม */
  versionLabel?: string
  /** ป้ายของแต่ละรุ่นในประวัติ (ใช้เมื่อกำหนดจะเปลี่ยนคำปุ่มเป็น "ดูฉบับเดิมและบันทึกก่อนหน้า" ด้วย) */
  labelForVersion?: (version: number) => string
}> = ({ code, title, hint, formId, children, footer, allowRevise = true, caseNo, versionLabel, labelForVersion }) => {
  const initialTab = useContext(FormInitialTabContext)
  const [tab, setTab] = useState<'form' | 'files' | 'saraban'>(typeof formId === 'number' && initialTab === 'saraban' ? 'saraban' : 'form')
  const showFilesTab = typeof formId === 'number'

  const lock = useFormDraftStore((s) => (typeof formId === 'number' ? s.locks[formId] : undefined))
  const revisions = useFormDraftStore((s) => (typeof formId === 'number' ? s.revisions[formId] : undefined))
  const reviseForm = useFormDraftStore((s) => s.reviseForm)
  const revisionCount = revisions?.length || 0
  const version = revisionCount + 1
  const [showRevisions, setShowRevisions] = useState(false)
  /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ล็อกทั้งฉบับ ไม่มีปุ่มสร้างเวอร์ชันใหม่ ดูไฟล์/ประวัติเวอร์ชันได้ */
  const caseClosed = useIsFormCaseClosed(formId ?? 0)
  const caseLegacy = useIsFormCaseLegacy(formId ?? 0)
  const view = useEditorView()
  const [asideSlot, setAsideSlot] = useState<HTMLElement | null>(null)
  const aside = view === 'aside'

  /** ปุ่มท้ายแบบ (บันทึก/ลงนาม) — กรอกบนเอกสาร: ยกไปแถบดำเนินการล่างของหน้า */
  const footerRow = footer && (aside
    ? <DocActions>{footer}</DocActions>
    : <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-line">{footer}</div>)
  /**
   * โหมดกรอกบนเอกสาร: ช่องกรอกยังอยู่ (ซ่อนไว้ให้ effect/ค่าตั้งต้นของแต่ละแบบทำงานตามเดิม)
   * ส่วนที่ห่อด้วย DocAside เช่น ปุ่มลงนาม ถูกยกมาแสดงในแผงนี้
   */
  const formBody = aside ? (
    <>
      <div ref={setAsideSlot} className="space-y-4 empty:hidden" />
      <div hidden>
        <AsideSlotContext.Provider value={asideSlot}>{children}</AsideSlotContext.Provider>
      </div>
      {footerRow}
    </>
  ) : (
    <>
      {children}
      {footerRow}
    </>
  )

  const lockedBody = (
    <FormLockAuditContext.Provider value={{ caseNo, code }}>
      {caseClosed ? (
        /** ปุ่ม/ช่องกรอกทุกตัวในกรอบนี้ใช้ไม่ได้ (เช่น บันทึก ลงนาม) — แท็บและปุ่มดูประวัติอยู่นอก fieldset จึงยังใช้ได้ */
        <fieldset disabled data-testid="case-closed-fieldset" className="m-0 min-w-0 space-y-5 border-0 p-0">
          {formBody}
        </fieldset>
      ) : formBody}
    </FormLockAuditContext.Provider>
  )

  return (
    <div className={aside ? 'ws-card min-w-0 p-4 space-y-4' : 'ws-card min-w-0 p-4 md:p-6 space-y-5'}>
      <div className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {typeof formId === 'number' ? (
            <FormCodeTooltip formNo={formId}>
              <span className="rounded bg-blue-soft px-2 py-0.5 text-[0.8rem] font-bold text-blue">{code}</span>
            </FormCodeTooltip>
          ) : (
            <span className="rounded bg-blue-soft px-2 py-0.5 text-[0.8rem] font-bold text-blue">{code}</span>
          )}
          {!aside && <h3 className="text-[1.05rem] font-bold text-navy">{title}</h3>}
          {typeof formId === 'number' && (
            <Badge variant="neutral">{versionLabel ?? `ฉบับที่ ${version}`}</Badge>
          )}
        </div>
        {hint && !aside && <p className="text-[0.8rem] text-muted mt-1">{hint}</p>}
      </div>

      {caseClosed && <CaseClosedBanner legacy={caseLegacy} />}

      {/* ล็อกฉบับลงนาม — ห้ามแก้ทับ ต้องสร้างเวอร์ชันใหม่ (WIT0506 / WIT0513 / WIT1119) */}
      {lock && typeof formId === 'number' && (
        <div className="ws-callout space-y-2 text-[0.88rem] leading-relaxed">
          <div>
            <i className="fa-solid fa-lock mr-1.5" />
            <strong>ฉบับลงนามถูกล็อก — แก้ทับไม่ได้</strong> · ล็อกโดย {lock.lockedBy} · {lock.reason}
          </div>
          {caseClosed ? (
            <div className="text-[0.88rem] font-semibold">
              แฟ้มปิดงานคุ้มครองแล้ว — ไม่สามารถสร้างเวอร์ชันใหม่หรือแก้ไขฉบับนี้ได้
            </div>
          ) : allowRevise ? (
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={async () => {
                if (![15, 16, 17].includes(formId)) { reviseForm(formId, 'เจ้าหน้าที่ผู้รับผิดชอบ', 'แก้ไขตามเหตุผลที่ส่งกลับ'); return }
                const result = await showConfirmAlert({ title: 'สร้างฉบับใหม่เพื่อแก้ไข', input: 'text', inputLabel: 'เหตุผลการแก้ไข', text: 'เก็บฉบับลงนามเดิมไว้ และเริ่มเสนอเอกสารที่ได้รับผลกระทบใหม่ โดยไม่เปลี่ยนผลการคุ้มครองหรือคำอุทธรณ์เดิม', showCancelButton: true, confirmButtonText: 'สร้างฉบับใหม่', cancelButtonText: 'ยกเลิก', inputValidator: value => !value?.trim() ? 'กรุณาระบุเหตุผล' : undefined })
                if (result.isConfirmed) reviseForm(formId, 'เจ้าหน้าที่ผู้รับผิดชอบ', String(result.value))
              }}
            >
              สร้างเวอร์ชันใหม่เพื่อแก้ไข (เก็บฉบับเดิมไว้)
            </Button>
          ) : (
            <div className="text-[0.88rem] font-semibold">
              ล็อกถาวร — ไม่สามารถสร้างเวอร์ชันใหม่หรือแก้ไขข้อตกลงฉบับนี้ได้อีก
            </div>
          )}
        </div>
      )}

      {/* ประวัติเวอร์ชัน — ฉบับเดิมทุกฉบับยังอยู่ครบ ดูเหตุผลที่ถูกตีกลับ ผู้แก้ไข และวันเวลาได้ (WIT0506 / WIT0708) */}
      {revisionCount > 0 && (
        <div
          data-testid="form-revision-history"
          className="ws-readonly space-y-2 text-[0.88rem]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <i className="fa-solid fa-clock-rotate-left mr-1.5" />
              เก็บฉบับเดิมไว้ {revisionCount} ฉบับ — ฉบับก่อนหน้าไม่ถูกแก้ทับ
            </span>
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="form-revision-history-toggle"
              onClick={() => setShowRevisions((v) => !v)}
            >
              {labelForVersion ? (showRevisions ? 'ซ่อนฉบับเดิมและบันทึกก่อนหน้า' : 'ดูฉบับเดิมและบันทึกก่อนหน้า') : showRevisions ? 'ซ่อนประวัติเวอร์ชัน' : 'ดูประวัติเวอร์ชัน'}
            </Button>
          </div>

          {showRevisions && (
            <ol className="space-y-1.5">
              {(revisions || []).map((rev) => (
                <li
                  key={rev.version}
                  data-testid={`form-revision-item-${rev.version}`}
                  className="rounded-lg border border-line bg-white px-2.5 py-2 leading-relaxed"
                >
                  <strong className="text-navy-deep">{labelForVersion ? labelForVersion(rev.version) : `ฉบับที่ ${rev.version}`}</strong>
                  <span className="text-muted"> · </span>
                  <span>{new Date(rev.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="text-muted"> · </span>
                  <span>{rev.by}</span>
                  <div className="text-muted">{rev.reason}</div>
                </li>
              ))}
              <li className="rounded-lg border border-line bg-blue-soft px-2.5 py-2 font-semibold text-navy">
                {labelForVersion ? `ฉบับปัจจุบันที่กำลังแก้ไข (${versionLabel ?? labelForVersion(version)})` : `ฉบับปัจจุบันที่กำลังแก้ไข (เวอร์ชัน ${version})`}
              </li>
            </ol>
          )}
        </div>
      )}

      {showFilesTab && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-soft p-1.5">
          {([
            { key: 'form', label: aside ? 'ลงนามและบันทึก' : 'กรอกข้อมูล', icon: aside ? 'fa-file-signature' : 'fa-pen-to-square' },
            { key: 'files', label: 'รวมไฟล์ คบ.', icon: 'fa-folder-open' },
            { key: 'saraban', label: 'ทะเบียนสารบรรณ', icon: 'fa-stamp' },
          ] as const).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 min-h-[44px] rounded-lg px-3 py-2 text-[0.88rem] font-semibold whitespace-nowrap transition ${
                tab === t.key ? 'bg-navy text-white' : 'text-ink hover:bg-line/60'
              }`}
            >
              <i className={`fa-solid ${t.icon} text-xs`} />
              <span>{t.label}</span>
            </button>
          ))}
        </div>
      )}

      {showFilesTab && tab === 'files' && <FormFilesPanel formId={formId as number} />}
      {showFilesTab && tab === 'saraban' && <FormSarabanPanel formId={formId as number} />}
      {/* แผงข้างกระดาษคงส่วนลงนาม/บันทึกไว้ (ซ่อน) ขณะเปิดแท็บอื่น — ปุ่มลงนามบนกระดาษยังใช้ได้ */}
      {showFilesTab && tab !== 'form' ? (aside ? <div hidden>{lockedBody}</div> : null) : lockedBody}
    </div>
  )
}

/**
 * รูปแบบการคุ้มครองตามข้อ 15 — ข้อ 1–3 ติ๊กร่วมกันได้ ส่วนข้อ 4 เลือกเดี่ยว (ดู toggleProtectionMethod)
 * ใช้ร่วมกันระหว่างข้อ 8.2 ของ คบ.6 (เส้นทางปกติ) และข้อ 4.2 ของ คบ.4 (เส้นทางเร่งด่วน WIT0603)
 * ข้อ 5 เป็นมาตรการเสริม (withFifth) ซึ่งตอนนี้ทั้ง คบ.4 และ คบ.6 ไม่ใช้แล้ว — ไม่เปิดเป็นเส้นทางปฏิบัติที่แท็บ 08
 */
export const ProtectionMethodChecks: React.FC<{
  selected: number[]
  onChange: (next: number[]) => void
  /** คบ.4 มีข้อ 5 ด้วย ส่วน คบ.6 มีเพียงข้อ 1–4 */
  withFifth?: boolean
  disabled?: boolean
  testIdPrefix?: string
  /** FB-014 — ชื่อรูปแบบที่ใช้แทนชื่อมาตรฐานเป็นรายข้อ (คบ.4/คบ.6 ใช้เปลี่ยนข้อ 4) */
  labels?: Record<number, string>
  /** ตัวเลือกย่อยใต้แต่ละข้อ เช่น 4.1 ส่งให้กรมการปกครอง — แสดงเมื่อเลือกข้อนั้น และเลือกได้ข้อเดียว */
  subitems?: Record<number, string[]>
  /** ตัวเลือกย่อยที่เลือกไว้ แยกตามเลขข้อ */
  subitemSelected?: Record<number, string>
  onSubitemChange?: (n: number, text: string) => void
}> = ({
  selected,
  onChange,
  withFifth = false,
  disabled,
  testIdPrefix = 'method-option',
  labels,
  subitems,
  subitemSelected,
  onSubitemChange,
}) => {
  const externalOn = selected.includes(KB6_METHOD_EXTERNAL)
  const selectionIssue = protectionMethodSelectionIssue(selected, subitemSelected)

  /** เลือกข้ามกลุ่ม (ข้อ 1–3 กับข้อ 4) ระบบนำข้อที่ขัดกันออกให้เอง ไม่ต้องแจ้งข้อความ */
  const toggle = (n: number) => onChange(toggleProtectionMethod(selected, n))

  return (
    <div>
      <label className="ws-label">เลือกรูปแบบการคุ้มครอง</label>
      <div className="space-y-1">
        {PROTECTION_METHOD_OPTIONS.filter((o) => withFifth || o.n !== 5).map((o) => {
          const checked = selected.includes(o.n)
          const choices = checked ? subitems?.[o.n] : undefined
          return (
            <React.Fragment key={o.n}>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={checked}
              data-testid={`${testIdPrefix}-${o.n}`}
              onClick={() => toggle(o.n)}
              className={`block w-full min-h-[44px] rounded-lg border px-3 py-2 text-[0.88rem] font-semibold text-left transition ${
                disabled
                  ? 'border-line bg-soft text-muted cursor-not-allowed'
                  : checked
                    ? 'border-blue bg-blue-soft text-navy'
                    : 'border-[#aebdca] bg-white text-ink hover:bg-soft'
              }`}
            >
              {checked ? '☑' : '☐'} {o.n}. {labels?.[o.n] ?? o.label}
            </button>
            {choices && (
              <div role="radiogroup" aria-label={`ตัวเลือกย่อยข้อ ${o.n}`} className="space-y-1 pl-6">
                {choices.map((text, i) => (
                  <label
                    key={i}
                    className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-[0.88rem] text-ink hover:bg-soft"
                  >
                    <input
                      type="radio"
                      name={`${testIdPrefix}-${o.n}-sub`}
                      className="h-[18px] w-[18px]"
                      disabled={disabled}
                      checked={subitemSelected?.[o.n] === text}
                      onChange={() => onSubitemChange?.(o.n, text)}
                      data-testid={`${testIdPrefix}-${o.n}-sub-${i + 1}`}
                    />
                    {o.n}.{i + 1} {text}
                  </label>
                ))}
              </div>
            )}
            </React.Fragment>
          )
        })}
      </div>
      {externalOn && (
        <p className="mt-1 text-[0.8rem] font-semibold text-warning">
          เลือกข้อ 4 แล้ว — เอกสารจะไม่มีข้อ 8.1 (คำสั่งมอบหมายชุดเจ้าพนักงาน)
        </p>
      )}
      {/* ต้องเลือกรูปแบบ (และตัวเลือกย่อยของข้อที่มี) ให้ครบก่อนส่งต่อ — การ์ดส่งงานในแฟ้มใช้เงื่อนไขเดียวกัน */}
      {!disabled && selectionIssue && (
        <p className="mt-1 text-[0.8rem] font-semibold text-warning" role="status" data-testid={`${testIdPrefix}-required`}>
          {selectionIssue} — ต้องเลือกก่อนส่งต่อ
        </p>
      )}
    </div>
  )
}

/**
 * ช่องวันที่แบบปฏิทิน — เก็บค่าเป็น ISO (yyyy-mm-dd, ค.ศ.) ใน draft
 * และแสดง วว/ดด/ปปปป พ.ศ. ใต้ช่องเสมอ ค่าเดิมที่เป็น dd/mm/พ.ศ. จะถูกแปลงเป็น ISO ให้ตอนแสดง
 */
export const DateField: React.FC<{
  formId: number
  name: string
  label: string
  required?: boolean
  disabled?: boolean
}> = ({ formId, name, label, required, disabled }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const isDisabled = disabled || locked
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const iso = toIsoDate(f.get(name))
  const dateId = useId()
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={dateId} />
      <input
        id={dateId}
        type="date"
        value={iso}
        disabled={isDisabled}
        onChange={(e) => f.set(name, e.target.value)}
        className={`${INPUT}${isDisabled ? ' cursor-not-allowed' : ''}`}
      />
      <ThaiDateHint value={iso} />
    </div>
  )
}

/**
 * ช่องวันที่แบบปฏิทินที่เขียนลงช่อง วัน / เดือน / พ.ศ. แยกกันตามหน้ากระดาษราชการ
 * หน้ากระดาษจึงอ่าน key เดิมได้ตามปกติ · ค่าเดิมที่พิมพ์เป็นข้อความ (เดือนชื่อเต็ม/ตัวย่อ/ตัวเลข) แปลงมาแสดงในปฏิทินได้
 */
export const ThaiDatePickerFields: React.FC<{
  formId: number
  label: string
  dayKey: string
  monthKey: string
  yearKey: string
  required?: boolean
  testId?: string
}> = ({ formId, label, dayKey, monthKey, yearKey, required, testId }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const iso = isoFromThaiParts(f.get(dayKey), f.get(monthKey), f.get(yearKey))
  const dateId = useId()
  const handleChange = (value: string) => {
    const parts = thaiPartsFromIso(value)
    f.set(dayKey, parts?.day ?? '')
    f.set(monthKey, parts?.month ?? '')
    f.set(yearKey, parts?.year ?? '')
  }
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={dateId} />
      <input
        id={dateId}
        type="date"
        value={iso}
        disabled={locked}
        data-testid={testId}
        onChange={(e) => handleChange(e.target.value)}
        className={`${INPUT}${locked ? ' cursor-not-allowed' : ''}`}
      />
      <ThaiDateHint value={iso} />
    </div>
  )
}

/**
 * ช่องวันและเวลาแบบปฏิทิน — เก็บค่าเป็น yyyy-mm-ddThh:mm (เวลาท้องถิ่น, ค.ศ.) ใน draft
 * และแสดง วว/ดด/ปปปป hh:mm พ.ศ. ใต้ช่อง ค่าเดิมที่เป็นข้อความวันที่จะถูกแปลงให้ตอนแสดง
 */
export const DateTimeField: React.FC<{
  formId: number
  name: string
  label: string
  required?: boolean
  disabled?: boolean
}> = ({ formId, name, label, required, disabled }) => {
  const f = useField(formId)
  const locked = useIsFormLocked(formId)
  const isDisabled = disabled || locked
  const onLockedAttempt = useLockedEditAttempt(locked, label)
  const value = toIsoDateTimeLocal(f.get(name))
  const inputId = useId()
  return (
    <div onPointerDown={locked ? onLockedAttempt : undefined} data-locked={locked || undefined}>
      <Label label={label} required={required} htmlFor={inputId} />
      <input
        id={inputId}
        type="datetime-local"
        value={value}
        disabled={isDisabled}
        onChange={(e) => f.set(name, e.target.value)}
        className={`${INPUT}${isDisabled ? ' cursor-not-allowed' : ''}`}
      />
      {value && (
        <span className="block text-xs text-slate-500 mt-0.5">
          พ.ศ. <strong className="font-semibold text-slate-700">{formatThaiDateTime(value)} น.</strong>
        </span>
      )}
    </div>
  )
}
