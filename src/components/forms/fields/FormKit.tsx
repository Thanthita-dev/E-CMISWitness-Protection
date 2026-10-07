import React, { useCallback, useContext, useId, useState } from 'react'
import { Button } from '../../common/Button'
import { Badge } from '../../common/Badge'
import { useFormDraftStore } from '../../../store/useFormDraftStore'
import { useCaseStore } from '../../../store/useCaseStore'
import { useAuthStore } from '../../../store/useAuthStore'
import { FormFilesPanel } from '../FormFilesPanel'
import { CaseClosedBanner, useIsFormCaseClosed } from '../FormCaseScope'
import { ThaiDateHint } from '../../common/ThaiDateHint'
import { formatThaiDateTime, toIsoDate, toIsoDateTimeLocal } from '../../../lib/utils'
import {
  KB6_METHOD_EXTERNAL,
  PROTECTION_METHOD_OPTIONS,
  ROLE_NAMES,
  protectionMethodSwitchNotice,
  toggleProtectionMethod,
} from '../../../lib/constants'
import { showToast } from '../../../lib/swal'

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
    {required && <span className="text-rose-600"> *</span>}
  </label>
)

/** แบบ คบ. ฉบับนี้ถูกล็อกอยู่หรือไม่ — ใช้ปิดช่องกรอกอัตโนมัติเมื่อฉบับลงนามแล้ว หรือแฟ้มปิดงานคุ้มครองแล้ว (WIT1148) */
const useIsFormLocked = (formId: number) => {
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
      <textarea
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
}> = ({ code, title, hint, formId, children, footer, allowRevise = true, caseNo }) => {
  const [tab, setTab] = useState<'form' | 'files'>('form')
  const showFilesTab = typeof formId === 'number'

  const lock = useFormDraftStore((s) => (typeof formId === 'number' ? s.locks[formId] : undefined))
  const revisions = useFormDraftStore((s) => (typeof formId === 'number' ? s.revisions[formId] : undefined))
  const reviseForm = useFormDraftStore((s) => s.reviseForm)
  const revisionCount = revisions?.length || 0
  const version = revisionCount + 1
  const [showRevisions, setShowRevisions] = useState(false)
  /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ล็อกทั้งฉบับ ไม่มีปุ่มสร้างเวอร์ชันใหม่ ดูไฟล์/ประวัติเวอร์ชันได้ */
  const caseClosed = useIsFormCaseClosed(formId ?? 0)

  return (
    <div className="ws-card min-w-0 p-4 md:p-6 space-y-5">
      <div className="border-b border-line pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded bg-blue-soft px-2 py-0.5 text-[0.8rem] font-bold text-blue">{code}</span>
          <h3 className="text-[1.05rem] font-bold text-navy">{title}</h3>
          {typeof formId === 'number' && (
            <Badge variant="neutral">ฉบับที่ {version}</Badge>
          )}
        </div>
        {hint && <p className="text-[0.8rem] text-muted mt-1">{hint}</p>}
      </div>

      {caseClosed && <CaseClosedBanner />}

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
              onClick={() => reviseForm(formId, 'เจ้าหน้าที่ผู้รับผิดชอบ', 'แก้ไขตามเหตุผลที่ส่งกลับ')}
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
              {showRevisions ? 'ซ่อนประวัติเวอร์ชัน' : 'ดูประวัติเวอร์ชัน'}
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
                  <strong className="text-navy-deep">ฉบับที่ {rev.version}</strong>
                  <span className="text-muted"> · </span>
                  <span>{new Date(rev.at).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="text-muted"> · </span>
                  <span>{rev.by}</span>
                  <div className="text-muted">{rev.reason}</div>
                </li>
              ))}
              <li className="rounded-lg border border-line bg-blue-soft px-2.5 py-2 font-semibold text-navy">
                ฉบับปัจจุบันที่กำลังแก้ไข (เวอร์ชัน {version})
              </li>
            </ol>
          )}
        </div>
      )}

      {showFilesTab && (
        <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-soft p-1.5">
          {([
            { key: 'form', label: 'กรอกข้อมูล', icon: 'fa-pen-to-square' },
            { key: 'files', label: 'รวมไฟล์ คบ.', icon: 'fa-folder-open' },
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

      {showFilesTab && tab === 'files' ? (
        <FormFilesPanel formId={formId as number} />
      ) : (
        <FormLockAuditContext.Provider value={{ caseNo, code }}>
          {caseClosed ? (
            /** ปุ่ม/ช่องกรอกทุกตัวในกรอบนี้ใช้ไม่ได้ (เช่น บันทึก ลงนาม) — แท็บและปุ่มดูประวัติอยู่นอก fieldset จึงยังใช้ได้ */
            <fieldset disabled data-testid="case-closed-fieldset" className="m-0 min-w-0 space-y-5 border-0 p-0">
              {children}
              {footer && <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-line">{footer}</div>}
            </fieldset>
          ) : (
            <>
              {children}
              {footer && <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-line">{footer}</div>}
            </>
          )}
        </FormLockAuditContext.Provider>
      )}
    </div>
  )
}

/**
 * รูปแบบการคุ้มครองตามข้อ 15 — ข้อ 1–3 ติ๊กร่วมกันได้ ส่วนข้อ 4 เลือกเดี่ยว (ดู toggleProtectionMethod)
 * ใช้ร่วมกันระหว่างข้อ 8.2 ของ คบ.6 (เส้นทางปกติ) และข้อ 4.2 ของ คบ.4 (เส้นทางเร่งด่วน WIT0603)
 * ข้อ 5 เป็นมาตรการเสริมที่มีเฉพาะใน คบ.4 และไม่เปิดเป็นเส้นทางปฏิบัติที่แท็บ 08
 */
export const ProtectionMethodChecks: React.FC<{
  selected: number[]
  onChange: (next: number[]) => void
  /** คบ.4 มีข้อ 5 ด้วย ส่วน คบ.6 มีเพียงข้อ 1–4 */
  withFifth?: boolean
  disabled?: boolean
  testIdPrefix?: string
}> = ({ selected, onChange, withFifth = false, disabled, testIdPrefix = 'method-option' }) => {
  const externalOn = selected.includes(KB6_METHOD_EXTERNAL)

  const toggle = (n: number) => {
    const notice = protectionMethodSwitchNotice(selected, n)
    if (notice) showToast(notice, 'warning')
    onChange(toggleProtectionMethod(selected, n))
  }

  return (
    <div>
      <label className="ws-label">เลือกรูปแบบการคุ้มครอง</label>
      <div className="space-y-1">
        {PROTECTION_METHOD_OPTIONS.filter((o) => withFifth || o.n !== 5).map((o) => {
          const checked = selected.includes(o.n)
          return (
            <button
              key={o.n}
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
              {checked ? '☑' : '☐'} {o.n}. {o.label}
            </button>
          )
        })}
      </div>
      {externalOn && (
        <p className="mt-1 text-[0.8rem] font-semibold text-warning">
          เลือกข้อ 4 แล้ว — เอกสารจะไม่มีข้อ 8.1 (คำสั่งมอบหมายชุดเจ้าพนักงาน)
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
