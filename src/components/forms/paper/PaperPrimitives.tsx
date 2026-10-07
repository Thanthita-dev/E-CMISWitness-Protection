import React from 'react'
import { CaseItem, RelatedPerson } from '../../../types/case'
import { FormMeta } from '../../../types/forms'
import { formatThaiDate } from '../../../lib/utils'

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

/** เลขไทยสำหรับหัวกระดาษราชการ */
export const toThaiDigits = (input: string | number): string =>
  String(input).replace(/[0-9]/g, (d) => '0123456789'[Number(d)])

/* ------------------------------------------------------------------ *
 * ช่องเติมข้อความ
 * ------------------------------------------------------------------ */

/** ช่องเติมข้อความแบบเส้นประของหนังสือราชการ — `grow` ให้ยืดเต็มบรรทัดที่เหลือ */
export const Fill: React.FC<{ children?: React.ReactNode; w?: string; grow?: boolean }> = ({
  children,
  w,
  grow,
}) => (
  <span
    className="official-dotted-fill"
    style={{
      minWidth: w,
      display: grow || w ? 'inline-block' : 'inline',
      ...(grow ? { flex: 1, minWidth: '60px' } : null),
    }}
  >
    {children || ' '}
  </span>
)

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
export const DottedRows: React.FC<{ n?: number; children?: React.ReactNode }> = ({ n = 3, children }) => (
  <div className="space-y-1">
    {children ? (
      <div className="official-dotted-fill block whitespace-pre-line leading-relaxed">{children}</div>
    ) : null}
    {Array.from({ length: children ? Math.max(0, n - 1) : n }, (_, i) => (
      <div key={i} className="border-b border-dotted border-slate-500 h-4" />
    ))}
  </div>
)

/** เส้นทึบเต็มบรรทัด (ช่องความเห็นผู้บังคับบัญชาในบันทึกข้อความ) */
export const SolidRows: React.FC<{ n?: number; children?: React.ReactNode }> = ({ n = 3, children }) => (
  <div className="space-y-3 pt-1">
    {children ? <div className="whitespace-pre-line leading-relaxed text-navy-deep font-bold">{children}</div> : null}
    {Array.from({ length: children ? Math.max(0, n - 1) : n }, (_, i) => (
      <div key={i} className="border-b border-slate-600" />
    ))}
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
  <p className={`leading-loose text-justify whitespace-pre-line ${indent ? 'indent-[3rem]' : ''}`}>{children}</p>
)

/* ------------------------------------------------------------------ *
 * ลายมือชื่อ
 * ------------------------------------------------------------------ */

const SignatureInk: React.FC<{ sign?: SignatureRecord }> = ({ sign }) =>
  sign?.signed ? (
    sign.signatureImage ? (
      <img src={sign.signatureImage} alt="ลายมือชื่อ" className="h-8 object-contain mx-auto" />
    ) : (
      <span className="italic font-serif text-blue-900 underline decoration-blue-500 font-bold">
        {sign.signerName}
      </span>
    )
  ) : (
    <span className="text-slate-400 tracking-tight">................................................</span>
  )

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
}> = ({ prefix = 'ลงชื่อ', role, sign, fallbackName, showPosition, position, showDate, className }) => (
  <div className={`text-center leading-relaxed ${className || ''}`}>
    <div>
      {prefix} <SignatureInk sign={sign} /> {role}
    </div>
    <div>({sign?.signerName || fallbackName || '.........................................'})</div>
    {sign?.signed && sign.note && (
      <div className="text-[11px] leading-snug text-blue-800" data-testid="sign-slot-note">
        {sign.note}
      </div>
    )}
    {showPosition && <div>ตำแหน่ง {position || '.........................................'}</div>}
    {showDate && <div>วันที่ {sign?.signedAt || '..........................................'}</div>}
  </div>
)

/** วางช่องลายมือชื่อเรียงกัน */
export const SignRow: React.FC<{ children: React.ReactNode; cols?: 1 | 2 | 3 }> = ({ children, cols = 2 }) => (
  <div className={`grid gap-4 pt-6 ${cols === 1 ? 'grid-cols-1' : cols === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
    {children}
  </div>
)

/** กรอบ "พยานได้รับทราบและยินยอม" ท้ายคำสั่ง คบ.5 / คบ.8 */
export const WitnessAckBox: React.FC<{ sign?: SignatureRecord; fallbackName?: string }> = ({
  sign,
  fallbackName,
}) => (
  <div className="border border-slate-700 p-2.5 w-64 leading-relaxed">
    <div className="font-bold">พยานได้รับทราบและยินยอม</div>
    <div className="pl-4">(ลงชื่อ)</div>
    <div className="pl-8">
      (<SignatureInk sign={sign} />
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
  const docNo = toThaiDigits(ctx.val('เลขที่แบบ', ctx.caseItem?.no ? ctx.caseItem.no.split('-').pop() || '' : ''))
  const year = ctx.val('ปีที่ยื่น', '69')
  const rawDocDate = ctx.val('วันเดือนปี', ctx.val('วันที่ยื่น', ''))
  /** ช่องหัวเอกสารเป็นปฏิทิน (ISO) — แสดงเป็น วว/ดด/ปปปป พ.ศ. ส่วนข้อความอิสระที่ไม่ใช่วันที่คงเดิม */
  const docDate = rawDocDate.trim() ? formatThaiDate(rawDocDate) : ''

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
              <Fill grow>{docNo}</Fill>
              <span>/ 25</span>
              <Fill w="52px">{year}</Fill>
            </div>
            <div className="flex items-baseline gap-1">
              <span>วัน/เดือน/ปี</span>
              <Fill grow>{docDate}</Fill>
            </div>
          </div>
        </div>
      </div>

      <div className="text-center font-bold leading-relaxed mb-4">
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
      <div className="grid grid-cols-[auto_1fr_auto] items-center gap-2">
        <div className="flex items-center gap-2">
          <img src={LOGO} alt="ครุฑ" className="h-11 w-11 object-contain" />
          {urgent && <span className="font-black text-rose-600 text-base">ด่วนที่สุด</span>}
        </div>
        <div className="text-center font-bold text-lg">บันทึกข้อความ</div>
        <div className="font-bold self-start">แบบ {thaiCode}</div>
      </div>

      <div className="mt-1 space-y-0.5">
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold">ส่วนราชการ</span>
          <span className="flex-1 text-navy-deep font-bold">
            {ctx.val('ส่วนราชการ', 'กลุ่มงานคุ้มครองพยาน กองบริหารคดี สำนักงาน ป.ป.ท.')}
          </span>
          <span className="font-bold">โทร.</span>
          <span className="w-[38%] text-navy-deep font-bold">{ctx.val('โทร', '0 2502 6670')}</span>
        </div>
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold">ที่</span>
          <span>ปป 00</span>
          <span className="flex-1 text-navy-deep font-bold text-center">{ctx.val('เลขที่เอกสาร', '')}</span>
          <span className="font-bold">วันที่</span>
          <span className="w-[45%] text-navy-deep font-bold">{memoDate(ctx.val('วันที่', ''))}</span>
        </div>
        <div className="flex items-baseline gap-1 border-b border-slate-700">
          <span className="font-bold">เรื่อง</span>
          <span className="flex-1">{subject}</span>
        </div>
      </div>

      <div className="mt-2 flex items-baseline gap-2">
        <span className="font-bold">เรียน</span>
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
        <img src={LOGO} alt="ครุฑ" className="mx-auto h-16 w-16 object-contain" />
      </div>
      <div className="text-center font-bold leading-relaxed mt-1">
        <div>{orderTitle}</div>
        <div className="flex items-baseline justify-center gap-1">
          <span>ที่</span>
          <Fill w="90px">{ctx.val('เลขที่คำสั่ง', '')}</Fill>
          <span>/</span>
          <Fill w="110px">{ctx.val('ปีคำสั่ง', '2569')}</Fill>
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
        <img src={LOGO} alt="ครุฑ" className="mx-auto h-16 w-16 object-contain" />
      </div>

      <div className="flex items-start justify-between -mt-6">
        <div className="flex items-baseline gap-1 pt-6">
          <span>ที่ ปป 00</span>
          <Fill w="70px">{ctx.val('เลขที่หนังสือ', '')}</Fill>
          <span>/</span>
          <Fill w="70px">{ctx.val('ปีหนังสือ', '')}</Fill>
        </div>
        <div className="leading-tight pt-6">
          <div>สำนักงาน ป.ป.ท.</div>
          <div>อาคารซอฟต์แวร์ปาร์ค ถนนแจ้งวัฒนะ</div>
          <div>อำเภอปากเกร็ด จังหวัดนนทบุรี 11120</div>
        </div>
      </div>

      <div className="flex items-baseline justify-center gap-1 mt-1 mb-2">
        <span>วันที่</span>
        <Fill w="60px">{ctx.val('วันที่', '')}</Fill>
        <span>เดือน</span>
        <Fill w="110px">{ctx.val('เดือน', '')}</Fill>
        <span>พ.ศ.</span>
        <Fill w="80px">{ctx.val('พ.ศ.', '2569')}</Fill>
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
}> = ({ sign, name, position, prefix = 'ขอแสดงความนับถือ' }) => (
  <div className="mt-6 flex flex-col items-center ml-auto mr-8 text-center w-72">
    {prefix && <div className="mb-6">{prefix}</div>}
    <div>
      (<SignatureInk sign={sign} />
      {!sign?.signed && name ? name : ''})
    </div>
    <div className="leading-tight">{position}</div>
  </div>
)

/** บล็อกท้ายหนังสือ: สำนัก / โทร / โทรสาร */
export const ContactFooter: React.FC<{ unit?: string; phone?: string; fax?: string }> = ({
  unit = 'กลุ่มงานคุ้มครองพยาน กองบริหารคดี',
  phone = '0 2502 6670',
  fax = '0 2502 6671',
}) => (
  <div className="mt-10 leading-tight">
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
  <div className="text-center mb-3">- {toThaiDigits(page)} -</div>
)
