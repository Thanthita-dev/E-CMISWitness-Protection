import React from 'react'
import { PaperSignTrigger } from './paperSign'
import { demoSignature } from '../../../lib/savedSignature'
import { CaseItem, RelatedPerson } from '../../../types/case'
import { FormMeta } from '../../../types/forms'
import { formatThaiDate, caseNoSeq } from '../../../lib/utils'

export interface SignatureRecord {
  signed: boolean
  signerName: string
  signedAt: string
  signatureImage?: string
  /** หมายเหตุกำกับลายมือชื่ออิเล็กทรอนิกส์ (วันเวลา/รุ่นเอกสาร) — แสดงใต้ช่องลงชื่อ ไม่ใช่ข้อความของแบบฟอร์ม */
  note?: string
}

/** ข้อมูลทั้งหมดที่หน้ากระดาษหนึ่งใบใช้เรนเดอร์ */
export interface PaperContext {
  formMeta: FormMeta
  draft: Record<string, any>
  caseItem?: CaseItem
  relatedPersons: RelatedPerson[]
  signatures: Record<string, SignatureRecord>
  /** อ่านค่าจาก draft ก่อน ถ้าไม่มีจึงใช้ค่าจากแฟ้มจริง แล้วจึงเป็นค่าเริ่มต้น */
  val: (key: string, fallback?: string) => string
}

const LOGO = '/assets/images/pacc-logo.webp'

/**
 * ตราครุฑตาม Word ต้นฉบับ (แบบที่เป็นบันทึกข้อความ คำสั่ง และหนังสือภายนอก) — ขนาดตามที่วางใน Word (ซม. × 37.8 px)
 * แบบอื่น (คบ.1, 2, 3, 7, 11, 12, 14) ใช้ตราสำนักงาน ป.ป.ท. ตามต้นฉบับ
 */
const EMBLEM_BASE = '/assets/forms/official/emblem/'
const GARUDA: Record<number, { src: string; w: number; h: number }> = {
  4: { src: `${EMBLEM_BASE}garuda-memo.jpg`, w: 60, h: 60 },
  6: { src: `${EMBLEM_BASE}garuda-memo.jpg`, w: 60, h: 60 },
  5: { src: `${EMBLEM_BASE}garuda-order.png`, w: 89, h: 97 },
  8: { src: `${EMBLEM_BASE}garuda-order.png`, w: 81, h: 90 },
  9: { src: `${EMBLEM_BASE}garuda-letter.png`, w: 107, h: 120 },
  10: { src: `${EMBLEM_BASE}garuda-letter.png`, w: 107, h: 120 },
  15: { src: `${EMBLEM_BASE}garuda-kb15.png`, w: 60, h: 63 },
  16: { src: `${EMBLEM_BASE}garuda-kb16.png`, w: 117, h: 124 },
}
const Garuda: React.FC<{ formNo: number; className?: string }> = ({ formNo, className }) => {
  const g = GARUDA[formNo]
  if (!g) return <img src={LOGO} alt="ตราสำนักงาน ป.ป.ท." className={`${className || ''} h-16 w-16 object-contain`} />
  return <img src={g.src} alt="ตราครุฑ" className={`${className || ''} object-contain`} style={{ width: g.w, height: g.h }} />
}

/** เลขไทยสำหรับหัวกระดาษราชการ */
export const toThaiDigits = (input: string | number): string =>
  String(input).replace(/[0-9]/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[Number(d)])

/* ------------------------------------------------------------------ *
 * ช่องเติมข้อความ
 * ------------------------------------------------------------------ */

/**
 * กรอกบนกระดาษเมื่อขยายเอกสาร — ใช้ draft ชุดเดียวกับแบบกรอกด้านซ้าย (key เดียวกับ ctx.val)
 * ไม่มี Provider = กระดาษอ่านอย่างเดียวตามเดิม
 */
export interface PaperEditState {
  editableFields?: readonly string[]
  draft: Record<string, any>
  /** ค่าเป็นข้อความ หรือรายการ (เช่น รูปแบบการคุ้มครองที่เลือก) */
  set: (key: string, value: string | number[]) => void
}
export const PaperEditContext = React.createContext<PaperEditState | null>(null)

/** ร่างของแบบที่กระดาษแสดง (ทั้งบนจอและชุดพิมพ์) — ใช้กับส่วนที่อ่านค่าเองได้ เช่น ชื่อ/ตำแหน่งใต้เส้นลงชื่อ */
export const PaperDraftContext = React.createContext<Record<string, any> | null>(null)

/** ช่องเติมข้อความแบบเส้นประของหนังสือราชการ — `grow` ให้ยืดเต็มบรรทัดที่เหลือ · `field` = key ใน draft ที่กรอกบนกระดาษได้ */
export const Fill: React.FC<{ children?: React.ReactNode; w?: string; grow?: boolean; field?: string; date?: boolean }> = ({
  children,
  w,
  grow,
  field,
  date,
}) => {
  const edit = React.useContext(PaperEditContext)
  const raw = field && edit ? edit.draft[field] : undefined
  // ค่าที่เป็นรายการ/ตัวเลือก (เช่น checkbox) ยังกรอกที่แบบด้านซ้าย
  if (edit && field && (!edit.editableFields || edit.editableFields.includes(field)) && (raw === undefined || raw === null || typeof raw === 'string' || typeof raw === 'number')) {
    const value = raw === undefined || raw === null ? (date ? '' : typeof children === 'string' ? children : '') : String(raw)
    // วันที่เก็บเป็น ปปปป-ดด-วว เหมือนช่องวันที่ด้านซ้าย ค่าเดิมที่เป็นข้อความอิสระกรอกแบบข้อความต่อได้
    const asDate = Boolean(date) && (value === '' || /^\d{4}-\d{2}-\d{2}/.test(value))
    return (
      <input
        type={asDate ? 'date' : 'text'}
        className={`official-dotted-fill official-fill-input${asDate && !value ? ' is-empty' : ''}`}
        aria-label={field}
        data-paper-field={field}
        value={asDate ? value.slice(0, 10) : value}
        onChange={(event) => edit.set(field, event.target.value)}
        style={{
          minWidth: w || (grow ? '60px' : '4em'),
          ...(grow ? { flex: 1 } : null),
        }}
      />
    )
  }
  return (
    <span
      className="official-dotted-fill"
      style={{
        minWidth: w,
        display: grow || w ? 'inline-block' : 'inline',
        // ยืดเต็มบรรทัดที่เหลือ แต่ไม่หดเล็กกว่าข้อความ — ค่ายาวขึ้นบรรทัดใหม่แทนการทับคำถัดไป
        ...(grow ? { flex: '1 1 auto', minWidth: '60px', maxWidth: '100%', overflowWrap: 'anywhere' } : null),
      }}
    >
      {children || ' '}
    </span>
  )
}

/**
 * บรรทัดของเอกสารราชการ: ข้อความปนช่องเติม โดยช่องสุดท้ายยืดจนสุดบรรทัด
 * — คำบรรยาย (span) ห้ามตัดกลางคำ ถ้าบรรทัดยาวเกินให้ขึ้นบรรทัดใหม่ทั้งก้อนแทน
 */
export const Row: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div
    className={`flex flex-wrap items-baseline gap-x-1 gap-y-0.5 [&>span]:whitespace-nowrap ${className || ''}`}
  >
    {children}
  </div>
)

/** เส้นประเปล่าสำหรับเขียนข้อความยาว (แทน TextBlock ในเอกสารต้นฉบับ) */
export const DottedRows: React.FC<{ n?: number; children?: React.ReactNode; field?: string }> = ({ n = 3, children, field }) => {
  const edit = React.useContext(PaperEditContext)
  const raw = field && edit ? edit.draft[field] : undefined
  /** กรอกบนเอกสาร: ข้อความยาวพิมพ์ได้หลายบรรทัด สูงตามข้อความ (ไม่น้อยกว่าจำนวนบรรทัดของแบบ) */
  if (edit && field && (!edit.editableFields || edit.editableFields.includes(field)) && (raw === undefined || raw === null || typeof raw === 'string')) {
    const value = raw ?? (typeof children === 'string' ? children : '')
    return (
      <textarea
        className="official-fill-input paper-rows-input"
        aria-label={field}
        data-paper-field={field}
        value={value}
        style={{ minHeight: `${n * 1.45}em` }}
        onChange={(event) => edit.set(field, event.target.value)}
      />
    )
  }
  return <DottedRowsView n={n}>{children}</DottedRowsView>
}

/**
 * อ่าน/พิมพ์: ข้อความยาวขึ้นบรรทัดตามจริง ทุกบรรทัดมีเส้นจุดใต้ข้อความ (เส้นขอบ จึงติดไปกับฉบับพิมพ์)
 * แล้วเติมบรรทัดจุดว่างจนครบจำนวนบรรทัดของแบบ — ข้อความยาวกว่านั้นให้กระดาษยืด ไม่ตัดทิ้ง
 */
const DottedRowsView: React.FC<{ n: number; children?: React.ReactNode }> = ({ n, children }) => {
  const text = typeof children === 'string' ? children : ''
  const usedLines = children ? (text ? text.split('\n').length : 1) : 0
  return (
    <div>
      {children ? <div className="paper-text-lines"><span>{children}</span></div> : null}
      {/* แต่ละบรรทัดสูงเท่าบรรทัดข้อความ เหมือนบรรทัดจุดในต้นฉบับ */}
      {Array.from({ length: Math.max(0, n - usedLines) }, (_, i) => (
        <div key={i} className="border-b border-dotted border-slate-600" style={{ height: '1lh' }} />
      ))}
    </div>
  )
}

/** เส้นทึบเต็มบรรทัด (ช่องความเห็นผู้บังคับบัญชาในบันทึกข้อความ) */
export const SolidRows: React.FC<{ n?: number; children?: React.ReactNode }> = ({ n = 3, children }) => {
  /** ความเห็นเขียนบนเส้นทึบของแบบ (ทุกบรรทัดที่ข้อความตัดขึ้นใหม่มีเส้นใต้) แล้วเติมเส้นว่างจนครบจำนวนบรรทัด */
  // เส้นทึบเต็มความกว้างทุกบรรทัด (พื้นหลังลายเส้น) — ข้อความยาวกี่บรรทัดก็มีเส้นครบ ไม่สั้นยาวไม่เท่ากัน
  return (
    <div className="paper-solid-rows" style={{ minHeight: `calc(${n} * var(--paper-rule-height, 28px))` }}>
      {children || ' '}
    </div>
  )
}

/**
 * บล็อกลงนามท้ายบันทึกข้อความ (คบ.6 ผู้เสนอ / ข้อ ๑๐–๑๓) — วางค่อนขวาตามต้นฉบับ
 * ช่องว่างเหนือวงเล็บไว้ลงลายมือชื่อ · ชื่อจัดกลางในวงเล็บ · ตำแหน่งใต้ชื่อ
 */
export const MemoSignBlock: React.FC<{ signature?: React.ReactNode; name?: string; children: React.ReactNode }> = ({ signature, name, children }) => (
  <div className="paper-memo-sign ml-auto mr-[6%] mt-1 w-[52%] text-center">
    <div className="paper-sign-anchor flex min-h-[1.25em] w-full items-end justify-center">{signature}</div>
    <div className="flex items-baseline justify-center">
      (<span className="inline-block min-w-[14rem] px-1 text-center">{name || ' '}</span>)
    </div>
    {children}
  </div>
)

/** ช่องกาเครื่องหมาย ☐ ตามต้นฉบับ */
export const CheckBox: React.FC<{ checked?: boolean; label?: React.ReactNode; children?: React.ReactNode }> = ({
  checked,
  label,
  children,
}) => (
  <span className="inline-flex items-baseline mr-3">
    <span className="official-box">{checked ? '✓' : ''}</span>
    <span>{label ?? children}</span>
  </span>
)

/** ช่องกาเครื่องหมายแบบขึ้นบรรทัดของตัวเอง */
export const CheckLine: React.FC<{
  checked?: boolean
  children: React.ReactNode
  indent?: number
}> = ({ checked, children, indent = 0 }) => (
  <div className="flex items-baseline gap-1.5" style={{ paddingLeft: indent * 18 }}>
    <span className="official-box flex-shrink-0">{checked ? '✓' : ''}</span>
    <span className="flex-1 flex items-baseline gap-1">{children}</span>
  </div>
)

/** ช่องกรอกเลขประจำตัวประชาชน 13 ช่อง (จัดกลุ่ม 1-4-5-2-1 ตามต้นฉบับ) */
export const IdBoxes: React.FC<{ value?: string }> = ({ value }) => {
  const digits = (value || '').replace(/\D/g, '').padEnd(13, ' ').slice(0, 13).split('')
  const groups = [1, 4, 5, 2, 1]
  let cursor = 0
  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      {groups.map((size, gi) => {
        const slice = digits.slice(cursor, cursor + size)
        cursor += size
        return (
          <span key={gi} className="inline-flex gap-0.5">
            {slice.map((d, i) => (
              <span key={i} className="official-id-box">
                {d.trim()}
              </span>
            ))}
          </span>
        )
      })}
    </span>
  )
}

/** หัวข้อหมวดในแบบฟอร์ม (ตัวหนา ไม่มีเส้นคาด ตามต้นฉบับ) */
export const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="font-bold pt-1">{children}</div>
)

/** ย่อหน้าเนื้อความหนังสือราชการ (ย่อหน้าแรกเยื้อง) */
export const LetterParagraph: React.FC<{ children: React.ReactNode; indent?: boolean }> = ({
  children,
  indent = true,
}) => (
  <p className={`text-justify whitespace-pre-line ${indent ? 'indent-[3rem]' : ''}`}>{children}</p>
)

/* ------------------------------------------------------------------ *
 * ลายมือชื่อ
 * ------------------------------------------------------------------ */

/** ลายมือชื่อบนเส้นลงชื่อ — signKey = ช่องที่วางปุ่ม "ลงนาม" บนกระดาษได้ (ดู paperSign) */
export const SignatureInk: React.FC<{ sign?: SignatureRecord; signKey?: string; role?: string; defaultName?: string }> = ({ sign, signKey, role, defaultName }) =>
  signKey ? (
    <span className="paper-sign-anchor">
      <SignatureInkMark sign={sign} />
      <PaperSignTrigger signKey={signKey} signed={sign?.signed} role={role} defaultName={defaultName} />
    </span>
  ) : (
    <SignatureInkMark sign={sign} />
  )

/** ลงนามแล้วแสดงเป็นรูปลายมือชื่อ — ฉบับเดิมที่ไม่มีรูป ใช้ลายมือชื่อจำลองของผู้ลงนาม (แสดงชื่อเมื่อสร้างรูปไม่ได้) */
const SignatureInkMark: React.FC<{ sign?: SignatureRecord }> = ({ sign }) => {
  if (!sign?.signed) return <span className="text-slate-400 tracking-tight">................................................</span>
  const image = sign.signatureImage || (sign.signerName ? demoSignature(`signer:${sign.signerName}`) : undefined)
  return image ? (
    <img src={image} alt={`ลายมือชื่อ ${sign.signerName}`} className="inline-block h-9 max-w-[180px] object-contain align-bottom" />
  ) : (
    <span className="italic font-serif text-blue-900 underline decoration-blue-500 font-bold">
      {sign.signerName}
    </span>
  )
}

/**
 * ช่องลงลายมือชื่อรูปแบบต้นฉบับ:
 *   ลงชื่อ ..................... ผู้ยื่นคำร้อง
 *          (.....................)
 *   ตำแหน่ง .....................
 */
export const SignSlot: React.FC<{
  /** คำนำหน้าช่อง เช่น "ลงชื่อ" หรือ "(ลงชื่อ)" */
  prefix?: string
  /** คำต่อท้ายบรรทัดลายมือชื่อ เช่น "ผู้ยื่นคำร้อง" */
  role?: string
  sign?: SignatureRecord
  fallbackName?: string
  /** แสดงบรรทัด "ตำแหน่ง ........." */
  showPosition?: boolean
  position?: string
  /** แสดงบรรทัด "วันที่........เดือน........พ.ศ. ........" */
  showDate?: boolean
  className?: string
  /** ต้นฉบับบางแบบวางตำแหน่ง (เช่น ผู้ยื่นคำร้อง) ไว้ใต้เส้นลงชื่อ */
  roleBelow?: boolean
  /** ต้นฉบับบางแบบไม่มีบรรทัด (ชื่อ) ใต้ลายมือชื่อ */
  hideName?: boolean
  /** ช่องลายมือชื่อในร่าง (เช่น kb3-witness) — วางปุ่ม "ลงนาม" บนเส้นลงชื่อ */
  signKey?: string
}> = ({ prefix = 'ลงชื่อ', role, sign, fallbackName, showPosition, position, showDate, className, roleBelow, hideName, signKey }) => {
  /**
   * ช่องที่ลงนามได้ (signKey): บรรทัด (ชื่อ) และตำแหน่งใต้เส้นลงชื่อกรอกบนกระดาษได้ (แบบเดียวกับหน้าเอกสารงานหมายจับ)
   * เก็บใน draft ของแบบเป็น `<signKey>:ชื่อ` / `<signKey>:ตำแหน่ง` — ฉบับพิมพ์แสดงบรรทัดนั้นเมื่อมีค่า
   */
  const edit = React.useContext(PaperEditContext)
  const draft = React.useContext(PaperDraftContext)
  const nameKey = signKey ? `${signKey}:ชื่อ` : undefined
  const positionKey = signKey ? `${signKey}:ตำแหน่ง` : undefined
  const nameValue = (nameKey && draft?.[nameKey]) || sign?.signerName || fallbackName || ''
  const positionValue = (positionKey && draft?.[positionKey]) || position || ''
  const editing = Boolean(edit && signKey)
  const showName = !hideName || editing || Boolean(nameKey && draft?.[nameKey])
  const showPositionLine = showPosition || editing || Boolean(positionKey && draft?.[positionKey])
  return (
    <div className={`text-center ${className || ''}`}>
      <div>
        {prefix} <SignatureInk sign={sign} signKey={signKey} role={role} defaultName={nameValue} /> {!roleBelow && role}
      </div>
      {roleBelow && role && <div>{role}</div>}
      {showName && (editing
        ? <div className="flex items-baseline justify-center gap-1">(<Fill w="220px" field={nameKey}>{nameValue}</Fill>)</div>
        : <div>({nameValue || '.........................................'})</div>)}
      {sign?.signed && sign.note && (
        <div className="text-[11px] leading-snug text-blue-800" data-testid="sign-slot-note">
          {sign.note}
        </div>
      )}
      {showPositionLine && (editing
        ? <div className="flex items-baseline justify-center gap-1">ตำแหน่ง <Fill w="220px" field={positionKey}>{positionValue}</Fill></div>
        : <div>ตำแหน่ง {positionValue || '.........................................'}</div>)}
      {showDate && <div>{sign?.signedAt ? `วันที่ ${sign.signedAt}` : 'วันที่........เดือน...............พ.ศ. .............'}</div>}
    </div>
  )
}

/** วางช่องลายมือชื่อเรียงกัน */
export const SignRow: React.FC<{ children: React.ReactNode; cols?: 1 | 2 | 3 }> = ({ children, cols = 2 }) => (
  <div className={`grid gap-4 pt-6 ${cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
    {children}
  </div>
)

/** กรอบ "พยานได้รับทราบและยินยอม" ท้ายคำสั่ง คบ.5 / คบ.8 */
export const WitnessAckBox: React.FC<{ sign?: SignatureRecord; fallbackName?: string; signKey?: string }> = ({
  sign,
  fallbackName,
  signKey,
}) => (
  <div className="border border-slate-700 p-2.5 w-64">
    <div className="font-bold">พยานได้รับทราบและยินยอม</div>
    <div className="pl-4">(ลงชื่อ)</div>
    <div className="pl-8">
      (<SignatureInk sign={sign} signKey={signKey} role="พยาน" defaultName={fallbackName} />
      {!sign?.signed && fallbackName ? fallbackName : ''})
    </div>
    <div className="pl-6">วันที่ {sign?.signedAt || '.............................................'}</div>
  </div>
)

/* ------------------------------------------------------------------ *
 * หัวกระดาษ
 * ------------------------------------------------------------------ */

/**
 * วันที่หัวบันทึกข้อความ: ค่าจากปฏิทิน (ISO) → วว/ดด/พ.ศ.
 * ค่าอื่นคงเดิม — บางแบบเก็บ "วันที่" เป็นเลขวันของช่องวัน/เดือน/พ.ศ. (เช่น "15") ซึ่งห้ามตีความเป็นปี
 */
const memoDate = (value: string): string => (/^\d{4}-\d{2}-\d{2}/.test(value) ? formatThaiDate(value) : value)

/**
 * หัวแบบฟอร์มที่มีตราสัญลักษณ์ ป.ป.ท. (คบ.1, 2, 3, 7, 11, 12, 14)
 * — "แบบ คบ. n" ชิดขวา, ตราอยู่กลาง, ตามด้วย เลขที่ ...../ 25 ..... และ วัน/เดือน/ปี
 */
/**
 * ปีของเลขที่เอกสารหลัง "๒๕" — รับได้ทั้ง 69, ๖๙, 2569 และ ค.ศ. 2026 (แปลงเป็น พ.ศ. ก่อน)
 * คืน ๒ หลักท้ายของ พ.ศ. หรือค่าว่างเมื่อไม่ใช่ปีที่อ่านได้ (ไม่เติมเลขเอง)
 */
export const docYearSuffix = (value: string): string => {
  const digits = String(value || '').replace(/[๐-๙]/g, (d) => String('๐๑๒๓๔๕๖๗๘๙'.indexOf(d))).replace(/\D/g, '')
  if (digits.length === 2) return digits
  if (digits.length === 4) {
    const year = Number(digits)
    const buddhist = year < 2400 ? year + 543 : year
    return String(buddhist).slice(2)
  }
  return ''
}

export const FormHead: React.FC<{
  ctx: PaperContext
  /** คบ.13 ไม่มีตราสัญลักษณ์บนหัวกระดาษ */
  seal?: boolean
  /** ชื่อแบบ (หลายบรรทัดได้) */
  title?: React.ReactNode
  /** บรรทัดคำอธิบายใต้ชื่อแบบ */
  subtitle?: React.ReactNode
}> = ({ ctx, seal = true, title, subtitle }) => {
  const code = ctx.formMeta.code.replace('คบ.', 'คบ. ')
  const thaiCode = toThaiDigits(code)
  const docNo = toThaiDigits(ctx.val('เลขที่แบบ', ctx.caseItem?.no ? caseNoSeq(ctx.caseItem.no) : ''))
  /** ปีของเลขที่: ต้นฉบับพิมพ์ "๒๕" ไว้แล้ว จึงแสดงเฉพาะ ๒ หลักท้ายของ พ.ศ. — ค่าเริ่มต้นจากปีของเลขคำร้อง */
  const year = toThaiDigits(docYearSuffix(ctx.val('ปีที่ยื่น', ctx.caseItem?.no?.split('/')[1] || '')))
  const rawDocDate = ctx.val('วันเดือนปี', ctx.val('วันที่ยื่น', ''))
  /** ช่องหัวเอกสารเป็นปฏิทิน (ISO) — แสดงเป็น วว/ดด/ปปปป พ.ศ. เลขไทยแบบเดียวกับเลขที่ ส่วนข้อความอิสระที่ไม่ใช่วันที่คงเดิม */
  const docDate = rawDocDate.trim() ? toThaiDigits(formatThaiDate(rawDocDate)) : ''

  return (
    <>
      <div className="relative grid min-h-[6.5rem] grid-cols-[1fr_auto] items-start gap-2 mb-1">
        {seal && (
          <img
            src={LOGO}
            alt="ตราสำนักงาน ป.ป.ท."
            className="absolute left-1/2 top-6 h-20 w-20 -translate-x-1/2 object-contain"
          />
        )}
        <div />
        <div className="w-[46%] min-w-[210px]">
          <div className="text-right font-bold">แบบ {thaiCode}</div>
          <div className="mt-1 pl-6 space-y-0.5">
            <div className="flex items-baseline gap-1">
              <span>เลขที่</span>
              <Fill grow field="เลขที่แบบ">{docNo}</Fill>
              <span>/ ๒๕</span>
              <Fill w="52px" field="ปีที่ยื่น">{year}</Fill>
            </div>
            <div className="flex items-baseline gap-1">
              <span>วัน/เดือน/ปี</span>
              <Fill grow field="วันเดือนปี" date>{docDate}</Fill>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center font-bold mb-4">
        <div>{title || ctx.formMeta.t}</div>
        {subtitle && <div>{subtitle}</div>}
      </div>
    </>
  )
}

/**
 * หัว "บันทึกข้อความ" (คบ.4, คบ.6) — ครุฑเล็กซ้าย ชื่อกลาง เลขแบบขวา
 * แล้วตามด้วย ส่วนราชการ / ที่ / วันที่ / เรื่อง / เรียน แบบเส้นทึบ
 */
/** ค่าบนหัวบันทึกข้อความ — อ่าน/พิมพ์ = ข้อความบนเส้นทึบของแบบ (เลขไทย) · กรอกบนเอกสาร = ช่องกรอกของคีย์เดียวกับแบบกรอก */
const MemoValue: React.FC<{ field: string; date?: boolean; children: React.ReactNode }> = ({ field, date, children }) =>
  React.useContext(PaperEditContext) ? <Fill grow field={field} date={date}>{children}</Fill> : <>{children}</>

export const MemoHead: React.FC<{
  ctx: PaperContext
  subject: React.ReactNode
  to: React.ReactNode
  /** ป้าย "ด่วนที่สุด" หน้าหัวกระดาษ (คบ.4) */
  urgent?: boolean
}> = ({ ctx, subject, to, urgent }) => {
  const thaiCode = toThaiDigits(ctx.formMeta.code)
  return (
    <>
      {/* ขนาดตาม Word: ด่วนที่สุด/บันทึกข้อความ 28pt, หัวข้อ ส่วนราชการ ที่ วันที่ เรื่อง เรียน 18pt ตัวหนา */}
      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-2">
        <div className="flex items-end gap-3">
          <Garuda formNo={ctx.formMeta.n} />
          {urgent && <span className="font-bold text-rose-600 leading-none" style={{ fontSize: '28pt' }}>ด่วนที่สุด</span>}
        </div>
        <div className="text-center font-bold leading-none" style={{ fontSize: '28pt' }}>บันทึกข้อความ</div>
        <div className="font-bold self-start">แบบ {thaiCode}</div>
      </div>

      <div className="mt-1">
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold" style={{ fontSize: '18pt' }}>ส่วนราชการ</span>
          <span data-testid="memo-head-agency" className="flex-1 min-w-0 text-navy-deep font-bold">
            <MemoValue field="ส่วนราชการ">{ctx.val('ส่วนราชการ', '')}</MemoValue>
          </span>
          <span className="font-bold" style={{ fontSize: '18pt' }}>โทร.</span>
          <span data-testid="memo-head-phone" className="w-[26%] shrink-0 text-navy-deep font-bold"><MemoValue field="โทร">{toThaiDigits(ctx.val('โทร', ''))}</MemoValue></span>
        </div>
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold" style={{ fontSize: '18pt' }}>ที่</span>
          <span>ปป ๐๐</span>
          <span className="flex-1 text-navy-deep font-bold text-center"><MemoValue field="เลขที่เอกสาร">{toThaiDigits(ctx.val('เลขที่เอกสาร', ''))}</MemoValue></span>
          <span>/</span>
          <span className="flex-1" />
          <span className="font-bold" style={{ fontSize: '18pt' }}>วันที่</span>
          <span className="w-[45%] text-navy-deep font-bold"><MemoValue field="วันที่" date>{toThaiDigits(memoDate(ctx.val('วันที่', '')))}</MemoValue></span>
        </div>
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold" style={{ fontSize: '18pt' }}>เรื่อง</span>
          <span className="flex-1">{subject}</span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-bold" style={{ fontSize: '18pt' }}>เรียน</span>
        <span>{to}</span>
      </div>
    </>
  )
}

/**
 * หัว "คำสั่ง" (คบ.5, คบ.8) — ครุฑกลาง ชื่อคำสั่ง เลขที่คำสั่ง เรื่อง แล้วเส้นประคั่น
 */
export const OrderHead: React.FC<{
  ctx: PaperContext
  /** บรรทัดชื่อคำสั่ง (รับ ReactNode เพื่อแทรกช่องเติมได้) */
  orderTitle: React.ReactNode
  subject: React.ReactNode
  /** เลขแบบมุมขวาบน */
  showFormCode?: boolean
}> = ({ ctx, orderTitle, subject, showFormCode = true }) => {
  const thaiCode = toThaiDigits(ctx.formMeta.code)
  return (
    <>
      {showFormCode && <div className="text-right font-bold">แบบ {thaiCode}</div>}
      <div className="text-center">
        <Garuda formNo={ctx.formMeta.n} className="mx-auto block" />
      </div>
      {/* หัวคำสั่งตาม Word: ตัวหนา 18pt */}
      <div className="text-center font-bold mt-1" style={{ fontSize: '18pt' }}>
        <div>{orderTitle}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span>ที่</span>
          <Fill w="90px" field={'เลขที่คำสั่ง'}>{ctx.val('เลขที่คำสั่ง', '')}</Fill>
          <span>/</span>
          <Fill w="110px" field={'ปีคำสั่ง'}>{ctx.val('ปีคำสั่ง', '2569')}</Fill>
        </div>
        <div>เรื่อง {subject}</div>
      </div>
      <div className="text-center text-slate-500 tracking-tighter mb-3">
        ............................................................
      </div>
    </>
  )
}

/**
 * หัวหนังสือราชการภายนอก (คบ.9, คบ.10) — ครุฑกลาง, "ที่ ปป 00 ..../....." ซ้าย,
 * ที่อยู่สำนักงานขวา, วันที่กลาง แล้ว เรื่อง / เรียน / อ้างถึง
 */
export const LetterHead: React.FC<{
  ctx: PaperContext
  subject: React.ReactNode
  to: React.ReactNode
  reference?: React.ReactNode
  attachment?: React.ReactNode
}> = ({ ctx, subject, to, reference, attachment }) => {
  const thaiCode = toThaiDigits(ctx.formMeta.code.replace('คบ.', 'คบ. '))
  return (
    <>
      <div className="text-right font-bold">แบบ {thaiCode}</div>
      <div className="text-center -mt-2">
        <Garuda formNo={ctx.formMeta.n} className="mx-auto block" />
      </div>

      <div className="flex items-start justify-between -mt-6">
        <div className="flex items-baseline gap-1 pt-6">
          <span>ที่ ปป ๐๐</span>
          <Fill w="70px" field={'เลขที่หนังสือ'}>{ctx.val('เลขที่หนังสือ', '')}</Fill>
          <span>/</span>
          <Fill w="70px" field={'ปีหนังสือ'}>{ctx.val('ปีหนังสือ', '')}</Fill>
        </div>
        <div className="leading-tight pt-6">
          <div>สำนักงาน ป.ป.ท.</div>
          <div>อาคารซอฟต์แวร์ปาร์ค ถนนแจ้งวัฒนะ</div>
          <div>อำเภอปากเกร็ด จังหวัดนนทบุรี ๑๑๑๒๐</div>
        </div>
      </div>

      <div className="flex items-baseline justify-center gap-1 mt-1 mb-2">
        <span>วันที่</span>
        <Fill w="60px" field={'วันที่'}>{ctx.val('วันที่', '')}</Fill>
        <span>เดือน</span>
        <Fill w="110px" field={'เดือน'}>{ctx.val('เดือน', '')}</Fill>
        <span>พ.ศ.</span>
        <Fill w="80px" field={'พ.ศ.'}>{ctx.val('พ.ศ.', '2569')}</Fill>
      </div>

      <div className="space-y-0.5">
        <div className="flex items-baseline gap-3">
          <span className="w-12">เรื่อง</span>
          <span>{subject}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="w-12">เรียน</span>
          <span className="underline decoration-slate-400">{to}</span>
        </div>
        {reference && (
          <div className="flex items-baseline gap-3">
            <span className="w-12">อ้างถึง</span>
            <span className="flex-1 flex items-baseline gap-1">{reference}</span>
          </div>
        )}
        {attachment && (
          <div className="flex items-baseline gap-3">
            <span>สิ่งที่ส่งมาด้วย</span>
            <span className="flex-1">{attachment}</span>
          </div>
        )}
      </div>
      <div className="mb-2" />
    </>
  )
}

/** บล็อกลงนามท้ายหนังสือราชการ (ชิดขวาค่อนกลาง) */
export const LetterSignOff: React.FC<{
  sign?: SignatureRecord
  name?: string
  position: React.ReactNode
  prefix?: string
  signKey?: string
  showPrintedName?: boolean
}> = ({ sign, name, position, prefix = 'ขอแสดงความนับถือ', signKey, showPrintedName = false }) => (
  <div className="mt-6 flex flex-col items-center ml-auto mr-8 text-center w-72">
    {prefix && <div className="mb-6">{prefix}</div>}
    <div>
      (<SignatureInk sign={sign} signKey={signKey} />
      {!sign?.signed && name ? name : ''})
    </div>
    {showPrintedName && sign?.signed && <div>({sign.signerName || name || '.........................................'})</div>}
    <div className="leading-tight">{position}</div>
  </div>
)

/** บล็อกท้ายหนังสือ: สำนัก / โทร / โทรสาร */
export const ContactFooter: React.FC<{ unit?: string; phone?: string; fax?: string }> = ({
  unit = '',
  phone = '',
  fax = '',
}) => (
  /* ต้นฉบับวางส่วนท้าย สำนัก/โทร/โทรสาร ชิดล่างซ้ายของหน้า และเว้นเป็นเส้นว่าง */
  <div className="absolute bottom-[64px] left-[113px]">
    <div>สำนัก................................ {unit}</div>
    <div>โทร.................................. {phone}</div>
    <div>โทรสาร............................ {fax}</div>
  </div>
)

/** ท้ายกระดาษ "แผ่นที่.......จาก.......หน้า" */
export const PageFooter: React.FC<{ page: number; total: number }> = ({ page, total }) => (
  <div className="pt-6 text-right">
    แผ่นที่<span className="official-dotted-fill px-2">{toThaiDigits(page)}</span>จาก
    <span className="official-dotted-fill px-2">{toThaiDigits(total)}</span>หน้า
  </div>
)

/** เลขหน้ากลางกระดาษของหนังสือหลายหน้า เช่น "- 2 -" */
export const PageNumber: React.FC<{ page: number }> = ({ page }) => (
  <div className="text-center mb-3">-{toThaiDigits(page)}-</div>
)
