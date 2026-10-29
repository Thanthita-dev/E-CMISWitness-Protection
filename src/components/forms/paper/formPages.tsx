import { showKb17AppealNotice, terminationReasonText } from '../../../lib/terminationRules'
import { extensionKb6PendingSigner, getActiveExtensionDocs } from '../../../lib/formSignature'
import React from 'react'
import {
  PaperContext,
  PaperEditContext,
  Fill,
  CheckBox,
  CheckLine,
  IdBoxes,
  DottedRows,
  SolidRows,
  SignSlot,
  SignRow,
  WitnessAckBox,
  FormHead,
  MemoHead,
  OrderHead,
  LetterHead,
  LetterParagraph,
  LetterSignOff,
  ContactFooter,
  PageFooter,
  PageNumber,
  Row,
  SignatureRecord,
  SignatureInk,
  MemoSignBlock,
  toThaiDigits,
} from './PaperPrimitives'
import { PaperSignTrigger, PaperSignUiContext } from './paperSign'
import { useAuthStore } from '../../../store/useAuthStore'
import { useCaseStore } from '../../../store/useCaseStore'
import { formatThaiDate, formatThaiDateTime, thaiMonthName, parseAnyDate } from '../../../lib/utils'
import { isTerminationAppealable } from '../../../lib/terminationProgress'
import type { ExtensionKb6SignerRole } from '../../../types/case'
import {
  PROTECTION_METHOD_OPTIONS,
  ECMIS_USER_DIRECTORY,
  KB4_PROTECTION_METHOD_FIELD,
  KB6_DURATION_DETAIL_FIELD,
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD_EXTERNAL,
  readLegalRefs,
  KB6_RATIONALE_FIELD,
  KB6_METHOD2_DETAIL_FIELD,
  KB6_METHOD3_DETAIL_FIELD,
  KB6_METHOD_LABELS,
  KB6_METHOD_SUBITEMS,
  readMethodSubitems,
  KB6_METHOD_SUBITEM_FIELDS,
  toggleProtectionMethod,
  KB6_RATIONALE_BLANK_ROWS,
  article14Agency,
  kb5RequiresOfficerTeam,
} from '../../../lib/constants'
import { useFormDraftStore } from '../../../store/useFormDraftStore'

/** รูปแบบการคุ้มครองที่เลือกไว้ใน 8.2 ของ คบ.6 */
const kb6Methods = (ctx: PaperContext): number[] =>
  Array.isArray(ctx.draft[KB6_PROTECTION_METHOD_FIELD]) ? ctx.draft[KB6_PROTECTION_METHOD_FIELD] : []

/** FB-015 — รายละเอียดที่เจ้าหน้าที่กรอกใต้รูปแบบข้อ 2/3 ของ คบ.6 (พิมพ์ต่อเมื่อเลือกข้อนั้นและมีข้อความ) */
const kb6MethodExtras = (ctx: PaperContext) => (n: number): React.ReactNode => {
  if (!kb6Methods(ctx).includes(n)) return null
  if (n === 2 || n === 3) {
    const detail = String(ctx.draft[n === 2 ? KB6_METHOD2_DETAIL_FIELD : KB6_METHOD3_DETAIL_FIELD] ?? '').trim()
    if (!detail) return null
    return (
      <div className="pl-8 whitespace-pre-wrap" data-testid={`kb6-paper-method-detail-${n}`}>
        {detail}
      </div>
    )
  }
  return null
}

/** WIT0603 — วิธีตามข้อ 15 ที่เลือกไว้ในข้อ 4.2 ของ คบ.4 (เส้นทางเร่งด่วน) */
const kb4Methods = (ctx: PaperContext): number[] =>
  Array.isArray(ctx.draft[KB4_PROTECTION_METHOD_FIELD]) ? ctx.draft[KB4_PROTECTION_METHOD_FIELD] : []

/** วันที่แบบไทย โดยเว้นว่างไว้ (ไม่ใช่ "-") เมื่อยังไม่มีข้อมูล เพื่อให้เป็นเส้นประเปล่าตามต้นฉบับ */
const docDate = (value?: string): string => {
  const formatted = formatThaiDate(value)
  return !value || formatted === '-' ? '' : toThaiDigits(formatted)
}

/** วันที่ พ.ศ. แบบ วว/ดด/ปปปป (เลขอารบิก) — ค่าว่างหรือข้อความอิสระคงเดิม */
const beDate = (value?: string): string => (value && value.trim() ? formatThaiDate(value) : '')

/** ลายมือชื่อสังเคราะห์จากสถานะของแฟ้มจริง สำหรับเอกสารที่ไม่มี key ใน draft store */
const derivedSign = (name?: string, at?: string): SignatureRecord | undefined =>
  name && at ? { signed: true, signerName: name, signedAt: at } : undefined

type PageRenderer = (ctx: PaperContext) => React.ReactNode

/** แสดงเฉพาะตอนกรอกบนเอกสาร / เฉพาะตอนอ่านหรือพิมพ์ */
const PaperEditOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (React.useContext(PaperEditContext) ? <>{children}</> : null)
const PaperReadOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => (React.useContext(PaperEditContext) ? null : <>{children}</>)

/** ย่อหน้าเลขข้อย่อยของบันทึกข้อความ (เยื้องแบบหนังสือราชการ) */
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-justify indent-[3rem]">{children}</p>
)

/** ตารางรายชื่อเจ้าพนักงานชุดปฏิบัติการ 4 นาย (คบ.4 / คบ.5 / คบ.6 / คบ.8) */
const OfficerRoster: React.FC<{ ctx: PaperContext; keyPrefix: string; arabic?: boolean; leadLabel?: string }> = ({ ctx, keyPrefix, arabic, leadLabel = 'เป็นหัวหน้าชุด' }) => (
  <div className="pl-12 space-y-1">
    {['1', '2', '3', '4'].map((n, i) => (
      <div key={n} className="flex items-baseline gap-1">
        {/* Word ของ คบ.5 ใช้เลขอารบิก แบบอื่นใช้เลขไทย */}
        <span className="w-5">{arabic ? n : toThaiDigits(n)}.</span>
        <Fill grow field={`${keyPrefix}ชื่อ${i + 1}`}>{ctx.val(`${keyPrefix}ชื่อ${i + 1}`, '')}</Fill>
        <span>ตำแหน่ง</span>
        <Fill w="120px" field={`${keyPrefix}ตำแหน่ง${i + 1}`}>{ctx.val(`${keyPrefix}ตำแหน่ง${i + 1}`, '')}</Fill>
        <span className="whitespace-nowrap text-right">{i === 0 ? leadLabel : 'เป็นชุดปฏิบัติการ'}</span>
      </div>
    ))}
  </div>
)

/**
 * รูปแบบการคุ้มครองที่เลือกไว้ (ใช้ร่วมกันใน ๘.๒ ของ คบ.6 และ ๔.๒ ของ คบ.4)
 * พิมพ์เฉพาะข้อที่เลือก เรียงเลขข้อใหม่ตั้งแต่ ๑ — ยังไม่เลือกเลยจึงไม่พิมพ์ข้อใด
 */
const ProtectionMethods: React.FC<{
  withFifth?: boolean
  selected: number[]
  /** FB-014 — ชื่อรูปแบบที่ใช้แทนชื่อมาตรฐานเป็นรายข้อ (คบ.4/คบ.6) */
  labels?: Record<number, string>
  /** ตัวเลือกย่อยใต้แต่ละข้อ พิมพ์เฉพาะที่เลือกไว้ ตามเลขข้อที่พิมพ์จริง เช่น ๑.๑ ส่งให้ตำรวจ */
  subitems?: Record<number, string[]>
  subitemSelected?: Record<number, string>
  /** FB-015 — บรรทัดเสริมใต้แต่ละข้อ (รายละเอียดข้อ 2/3 ของ คบ.6) */
  renderAfter?: (n: number) => React.ReactNode
  /** key ใน draft ของรายการที่เลือก — กรอกบนเอกสาร: แสดงทุกข้อให้ติ๊กเลือกบนกระดาษได้ */
  field?: string
  /** key ของรายละเอียดใต้ข้อ (คบ.6 ข้อ 2/3) ให้พิมพ์บนกระดาษเมื่อเลือกข้อนั้น */
  detailFields?: Record<number, string>
}> = (props) => {
  const edit = React.useContext(PaperEditContext)
  return edit && props.field ? <ProtectionMethodPicker {...props} field={props.field} edit={edit} /> : <ProtectionMethodList {...props} />
}

/**
 * กรอกบนเอกสาร: ทุกข้อเป็นช่องติ๊ก (กติกาเดียวกับแบบกรอก — ข้อ 1–3 เลือกร่วมกันได้ ข้อ 4 เลือกเดี่ยว)
 * ข้อที่เลือกแล้วมีตัวเลือกย่อยและช่องรายละเอียดใต้ข้อ — ไม่ติดไปกับฉบับพิมพ์ (ชุดพิมพ์ไม่มีโหมดแก้ไข)
 */
const ProtectionMethodPicker: React.FC<React.ComponentProps<typeof ProtectionMethods> & { field: string; edit: React.ContextType<typeof PaperEditContext> & object }> = ({
  withFifth = true, selected, labels, subitems, subitemSelected, field, detailFields, edit,
}) => {
  return (
    <div className="pl-12 space-y-1" data-testid="paper-protection-method-picker">
      {PROTECTION_METHOD_OPTIONS.filter((o) => withFifth || o.n !== 5).map((o) => {
        const checked = selected.includes(o.n)
        const detailField = detailFields?.[o.n]
        return (
          <div key={o.n} className={`rounded px-1 ${checked ? 'bg-[#fdf8e7]' : ''}`}>
            <label className="flex cursor-pointer items-start gap-2">
              <input
                type="checkbox"
                className="mt-[0.3em] h-4 w-4 flex-none accent-navy"
                data-testid={`paper-method-option-${o.n}`}
                checked={checked}
                onChange={() => edit.set(field, toggleProtectionMethod(selected, o.n))}
              />
              <span>{toThaiDigits(o.n)}. {labels?.[o.n] ?? o.label}</span>
            </label>
            {checked && subitems?.[o.n]?.map((text) => (
              <label key={text} className="ml-8 flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name={`paper-method-sub-${field}-${o.n}`}
                  className="mt-[0.3em] h-4 w-4 flex-none accent-navy"
                  checked={subitemSelected?.[o.n] === text}
                  onChange={() => edit.set(KB6_METHOD_SUBITEM_FIELDS[o.n], text)}
                />
                <span>{text}</span>
              </label>
            ))}
            {checked && detailField && (
              <textarea
                aria-label={`รายละเอียดข้อ ${o.n}`}
                className="official-fill-input ml-8 block w-[calc(100%-2rem)] resize-y px-1"
                rows={2}
                value={String(edit.draft[detailField] ?? '')}
                onChange={(event) => edit.set(detailField, event.target.value)}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

const ProtectionMethodList: React.FC<React.ComponentProps<typeof ProtectionMethods>> = ({ withFifth = true, selected, labels, subitems, subitemSelected, renderAfter }) => (
  <div className="pl-12 space-y-1" data-testid="paper-protection-methods">
    {PROTECTION_METHOD_OPTIONS.filter((o) => (withFifth || o.n !== 5) && selected.includes(o.n)).map((o, i) => (
      <React.Fragment key={o.n}>
        <div data-testid="paper-protection-method">
          {toThaiDigits(i + 1)}. {labels?.[o.n] ?? o.label}
        </div>
        {subitems?.[o.n]
          ?.filter((text) => subitemSelected?.[o.n] === text)
          .map((text, j) => (
            <div key={j} className="pl-8" data-testid="paper-protection-method-subitem">
              {toThaiDigits(`${i + 1}.${j + 1}`)} {text}
            </div>
          ))}
        {renderAfter?.(o.n)}
      </React.Fragment>
    ))}
  </div>
)


/* ================================================================== *
 * คบ.1 — คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น (4 หน้า)
 * ================================================================== */
/**
 * คบ.1 — ผู้ยื่นคำร้อง (ข้อ ๑) กับพยาน (ข้อ ๒) เป็นคนละคนได้ (ผู้ซึ่งมีประโยชน์เกี่ยวข้อง / ผู้ยื่นคำร้องแทน)
 * ชื่อในแฟ้มคือชื่อผู้ขอรับความคุ้มครอง (พยาน) — ใช้เติมช่องผู้ยื่นเฉพาะเมื่อผู้ยื่นเป็นพยานเอง
 */
const kb1People = (ctx: PaperContext) => {
  const applicantIsWitness = ctx.val('ฐานะผู้ยื่น') === 'พยาน'
  const [personFirst = '', ...personRest] = (ctx.caseItem?.person || '').trim().split(/\s+/)
  const personLast = personRest.join(' ')
  return {
    applicantIsWitness,
    applicantFirst: ctx.val('ชื่อ', applicantIsWitness ? personFirst : ''),
    applicantLast: ctx.val('นามสกุล', applicantIsWitness ? personLast : ''),
    witnessFirst: ctx.val('พยานชื่อ', applicantIsWitness && ctx.val('ชื่อ') ? `${ctx.val('คำนำหน้า')}${ctx.val('ชื่อ')}` : personFirst),
    witnessLast: ctx.val('พยานนามสกุล', applicantIsWitness && ctx.val('นามสกุล') ? ctx.val('นามสกุล') : personLast),
  }
}

/** ชื่อเต็มผู้ยื่นคำร้อง (ข้อ ๑) สำหรับบรรทัดลงชื่อ */
const kb1ApplicantName = (ctx: PaperContext): string => {
  const people = kb1People(ctx)
  return [`${ctx.val('คำนำหน้า')}${people.applicantFirst}`, people.applicantLast].filter((part) => part.trim()).join(' ')
}

const kb1: PageRenderer[] = [
  (ctx) => {
    const people = kb1People(ctx)
    return (
    <>
      <FormHead ctx={ctx} title="คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น" />

      <div className="space-y-1">
        <Row>
          <span className="font-bold">๑. ข้าพเจ้า</span>
          <span>นาย/นาง/นางสาว</span>
          {/* คำนำหน้า กับ ชื่อ เป็นคนละช่องในร่าง — แยกช่องบนกระดาษ ไม่ให้ช่องเดียวแสดงแค่คำนำหน้า */}
          <Fill w="72px" field={'คำนำหน้า'}>{ctx.val('คำนำหน้า', '')}</Fill>
          <Fill grow field={'ชื่อ'}>{people.applicantFirst}</Fill>
          <span>นามสกุล</span>
          <Fill grow field={'นามสกุล'}>{people.applicantLast}</Fill>
        </Row>

        <Row className="flex-wrap">
          <span>เกี่ยวข้องในฐานะ</span>
          <CheckBox checked={people.applicantIsWitness} label="พยาน" />
          <CheckBox
            checked={ctx.val('ฐานะผู้ยื่น') === 'ผู้ซึ่งมีประโยชน์เกี่ยวข้อง'}
            label="ผู้ซึ่งมีประโยชน์เกี่ยวข้อง"
          />
          <CheckBox checked={ctx.val('ฐานะผู้ยื่น') === 'ผู้ยื่นคำร้องแทน'} label="ผู้ยื่นคำร้องแทน" />
        </Row>

        <Row>
          <span>ที่อยู่ปัจจุบัน</span>
          <Fill grow>
            {[
              ctx.val('บ้านเลขที่', ''),
              ctx.val('หมู่ที่') && `หมู่ที่ ${ctx.val('หมู่ที่')}`,
              ctx.val('ตำบล') && `ตำบล${ctx.val('ตำบล')}`,
              ctx.val('อำเภอ') && `อำเภอ${ctx.val('อำเภอ')}`,
            ]
              .filter(Boolean)
              .join(' ')}
          </Fill>
        </Row>
        <Row>
          <Fill grow>
            {[ctx.val('จังหวัด') && `จังหวัด${ctx.val('จังหวัด')}`, ctx.val('รหัสไปรษณีย์')]
              .filter(Boolean)
              .join(' ')}
          </Fill>
          <span>โทรศัพท์</span>
          <Fill grow field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
        </Row>

        <Row>
          <span>เลขประจำตัวประชาชน</span>
          <IdBoxes value={ctx.val('เลขบัตรประชาชน', '')} />
          <span>หรือ</span>
        </Row>
        <Row>
          <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
          <Fill grow field={'เลขบัตรเจ้าหน้าที่รัฐ'}>{ctx.val('เลขบัตรเจ้าหน้าที่รัฐ', '')}</Fill>
          <span>สังกัด</span>
          <Fill grow field={'สังกัด'}>{ctx.val('สังกัด', '')}</Fill>
        </Row>
        <Row>
          <span>วันออกบัตร</span>
          <Fill grow field={'วันออกบัตร'} date>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
          <span>บัตรหมดอายุ</span>
          <Fill grow field={'บัตรหมดอายุ'} date>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
        </Row>

        <Row className="pt-1">
          <span className="font-bold">๒. ข้อมูลพยาน</span>
          <span>ชื่อ นาย/นาง/นางสาว</span>
          <Fill grow field={'พยานชื่อ'}>{people.witnessFirst}</Fill>
          <span>นามสกุล</span>
          <Fill grow field={'พยานนามสกุล'}>{people.witnessLast}</Fill>
        </Row>
        <Row className="flex-wrap">
          <span>อาชีพ</span>
          {['รับราชการ', 'รับจ้าง', 'นักศึกษา'].map((o) => (
            <CheckBox key={o} checked={ctx.val('อาชีพ') === o} label={o} />
          ))}
          {/* "อื่น ๆ" ติ๊กเมื่อกรอกอาชีพอื่นจริงเท่านั้น — ยังไม่กรอก = ช่องว่างตามแบบ */}
          <CheckBox checked={Boolean(ctx.val('อาชีพ')) && !['รับราชการ', 'รับจ้าง', 'นักศึกษา'].includes(ctx.val('อาชีพ'))} label="อื่น ๆ ระบุ" />
          <Fill grow>
            {!['รับราชการ', 'รับจ้าง', 'นักศึกษา'].includes(ctx.val('อาชีพ')) ? ctx.val('อาชีพ', '') : ''}
          </Fill>
        </Row>
        <Row className="flex-wrap">
          <span>สถานภาพ</span>
          {['โสด', 'สมรส', 'หย่า', 'หม้าย'].map((o) => (
            <CheckBox key={o} checked={ctx.val('สถานภาพ') === o} label={o} />
          ))}
          <CheckBox checked={Boolean(ctx.val('จำนวนบุตร'))} label="บุตรจำนวน" />
          <Fill w="70px" field={'จำนวนบุตร'}>{ctx.val('จำนวนบุตร', '')}</Fill>
          <span>คน</span>
        </Row>
        <Row>
          <span>ชื่อบิดา</span>
          <Fill grow field={'ชื่อบิดา'}>{ctx.val('ชื่อบิดา', '')}</Fill>
          <span>ชื่อมารดา</span>
          <Fill grow field={'ชื่อมารดา'}>{ctx.val('ชื่อมารดา', '')}</Fill>
        </Row>
        <Row>
          <span>ที่อยู่ปัจจุบัน</span>
          <Fill grow field={'พยานที่อยู่'}>{ctx.val('พยานที่อยู่', '')}</Fill>
        </Row>
        <Row>
          <Fill grow field={'พยานที่อยู่ต่อ'}>{ctx.val('พยานที่อยู่ต่อ', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow field={'พยานโทรศัพท์'}>{ctx.val('พยานโทรศัพท์', '')}</Fill>
        </Row>
        <Row>
          <span>สถานที่ทำงาน</span>
          <Fill grow field={'สถานที่ทำงาน'}>{ctx.val('สถานที่ทำงาน', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow field={'โทรศัพท์ที่ทำงาน'}>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
        </Row>
        <Row>
          <span>เลขประจำตัวประชาชน</span>
          <IdBoxes value={ctx.val('พยานเลขบัตรประชาชน', people.applicantIsWitness ? ctx.val('เลขบัตรประชาชน', '') : '')} />
          <span>หรือ</span>
        </Row>
        <Row>
          <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
          <Fill grow field={'พยานเลขบัตรรัฐ'}>{ctx.val('พยานเลขบัตรรัฐ', '')}</Fill>
          <span>สังกัด</span>
          <Fill grow field={'พยานสังกัด'}>{ctx.val('พยานสังกัด', '')}</Fill>
        </Row>
        <Row>
          <span>วันออกบัตร</span>
          <Fill grow field={'พยานวันออกบัตร'} date>{beDate(ctx.val('พยานวันออกบัตร', ''))}</Fill>
          <span>บัตรหมดอายุ</span>
          <Fill grow field={'พยานบัตรหมดอายุ'} date>{beDate(ctx.val('พยานบัตรหมดอายุ', ''))}</Fill>
        </Row>
        <Row>
          <span>ข้อมูลสื่อโซเชียลมีเดีย line id</span>
          <Fill grow field={'line'}>{ctx.val('line', '')}</Fill>
          <span>instragram</span>
          <Fill grow field={'instagram'}>{ctx.val('instagram', '')}</Fill>
          <span>facebook</span>
          <Fill grow field={'facebook'}>{ctx.val('facebook', '')}</Fill>
        </Row>

        <Row className="pt-1">
          <span className="font-bold">๓. บุคคลที่สามารถติดต่อได้</span>
          <Fill grow field={'ผู้ติดต่อได้'}>{ctx.val('ผู้ติดต่อได้', '')}</Fill>
          <span>ที่อยู่</span>
          <Fill grow field={'ผู้ติดต่อที่อยู่'}>{ctx.val('ผู้ติดต่อที่อยู่', '')}</Fill>
        </Row>
        <Row>
          <Fill grow> </Fill>
          <span>โทรศัพท์</span>
          <Fill grow field={'ผู้ติดต่อโทรศัพท์'}>{ctx.val('ผู้ติดต่อโทรศัพท์', '')}</Fill>
        </Row>
        <Row>
          <span>สถานที่ทำงาน</span>
          <Fill grow field={'ผู้ติดต่อที่ทำงาน'}>{ctx.val('ผู้ติดต่อที่ทำงาน', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow field={'ผู้ติดต่อโทรที่ทำงาน'}>{ctx.val('ผู้ติดต่อโทรที่ทำงาน', '')}</Fill>
        </Row>

        <Row className="flex-wrap pt-1">
          <span className="font-bold">๔. มีความประสงค์จะขอรับการคุ้มครองจากการ</span>
          <CheckBox checked={ctx.val('ช่วงเวลาคุ้มครอง') === 'จะมาเป็นพยาน'} label="จะมาเป็นพยาน" />
          <CheckBox checked={ctx.val('ช่วงเวลาคุ้มครอง') === 'ได้มาเป็นพยาน'} label="ได้มาเป็นพยาน" />
        </Row>
        <div>ในเรื่องร้องเรียน/กล่าวหา</div>
        <DottedRows n={2} field={'เกี่ยวข้องกับคดี'}>{ctx.val('เกี่ยวข้องกับคดี', ctx.caseItem?.mainCaseNo || '')}</DottedRows>
      </div>

      <PageFooter page={1} total={4} />
    </>
    )
  },

  (ctx) => {
    const threats: string[] = ctx.draft['ภัยคุกคามที่เลือก'] || []
    const has = (k: string) => threats.includes(k)
    const anyThreat = threats.length > 0 || Boolean(ctx.val('พฤติการณ์ภัยคุกคาม'))
    return (
      <>
        <div className="font-bold mb-2">
          ๕. พฤติการณ์แห่งคดีที่เป็นพยานและความไม่ปลอดภัยที่พยานได้รับ{' '}
          (รายละเอียดของคดี การเข้าเป็นพยานในคดีดังกล่าว และพฤติการณ์ที่แสดงถึงความไม่ปลอดภัย )
        </div>

        <div className="pl-8 space-y-1">
          <CheckLine checked={!anyThreat}>ไม่มี</CheckLine>
          <Row>
            <span className="official-box flex-shrink-0">{anyThreat ? '✓' : ''}</span>
            <span>มี</span>
            <span className="official-box flex-shrink-0">{has('โทรศัพท์ข่มขู่') ? '✓' : ''}</span>
            <span>มีบุคคลไม่ทราบชื่อโทรศัพท์มาข่มขู่พยานและผู้ใกล้ชิด</span>
          </Row>
          <div className="pl-6 space-y-1">
            <CheckLine checked={has('ยานพาหนะติดตาม')}>มีรถยนต์/รถจักรยานยนต์ติดตามพยานและผู้ใกล้ชิด</CheckLine>
            <CheckLine checked={has('บุคคลเฝ้าติดตาม')}>มีบุคคลเฝ้าติดตาม</CheckLine>
            <CheckLine checked={has('ข่มขู่ทางวาจา')}>
              มีการข่มขู่คุกคามทางวาจาหรือสื่ออิเล็กทรอนิกส์ต่อพยานหรือผู้ใกล้ชิด
            </CheckLine>
            <CheckLine checked={has('ทำร้ายร่างกาย')}>
              มีการทำร้ายร่างกาย ทรัพย์สิน พยานหรือผู้ใกล้ชิดที่น่าเชื่อว่าเกิดจากเหตุการณ์เป็นพยาน
            </CheckLine>
            <CheckLine checked={has('จ้างวาน')}>
              มีการจ้างวานให้ผู้อื่นมาชมหรือทำร้าย พยานหรือผู้ใกล้ชิดที่น่าเชื่อว่าเกิดจากเหตุการณ์เป็นพยาน
            </CheckLine>
            <CheckLine checked={Boolean(ctx.val('ภัยคุกคามอื่นๆ'))}>
              <span>อื่นๆ</span>
              <Fill grow field={'ภัยคุกคามอื่นๆ'}>{ctx.val('ภัยคุกคามอื่นๆ', '')}</Fill>
            </CheckLine>
            {/* บรรทัดต่อของ "อื่นๆ" ตามต้นฉบับ */}
            <Row className="pl-6"><Fill grow> </Fill></Row>
          </div>
        </div>

        <div className="mt-3">
          <DottedRows n={15} field={'พฤติการณ์ภัยคุกคาม'}>{ctx.val('พฤติการณ์ภัยคุกคาม', '')}</DottedRows>
        </div>

        <SignRow>
          <SignSlot
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb1-applicant']} signKey="kb1-applicant"
            fallbackName={kb1ApplicantName(ctx)}
            roleBelow
            hideName
          />
          <SignSlot
            role="เจ้าพนักงาน"
            sign={ctx.signatures['kb1-officer']} signKey="kb1-officer"
            fallbackName={ctx.caseItem?.assignedOfficer}
            roleBelow
            hideName
          />
        </SignRow>

        <PageFooter page={2} total={4} />
      </>
    )
  },

  (ctx) => (
    <>
      <div className="font-bold mb-2">
        ๖. กรณีขอให้มีการคุ้มครองบุคคลที่เกี่ยวข้อง{' '}
        <span className="font-normal">(ระบุชื่อและพฤติการณ์ที่แสดงให้เห็นถึงความไม่ปลอดภัย)</span>
      </div>

      <div className="space-y-4">
        {[0, 1, 2, 3].map((i) => {
          const p = ctx.relatedPersons[i]
          return (
            <div key={i} className="space-y-1">
              <CheckLine checked={Boolean(p)}>
                <span>ชื่อ นาย/นาง/นางสาว</span>
                <Fill grow>{p ? `${p.title}${p.firstName}` : ''}</Fill>
                <span>นามสกุล</span>
                <Fill grow>{p?.lastName || ''}</Fill>
              </CheckLine>
              <Row>
                <span>เลขประจำตัวประชาชน</span>
                <Fill grow>{p?.citizenId || ''}</Fill>
              </Row>
              <CheckLine checked={Boolean(p?.relation)}>
                <span>เกี่ยวข้องกับพยานในฐานะ</span>
                <Fill grow>{p?.relation || ''}</Fill>
              </CheckLine>
              <CheckLine checked={Boolean(p?.risk)}>
                <span>พฤติการณ์ความไม่ปลอดภัย</span>
                <Fill grow>{p ? `ความเสี่ยงระดับ${p.risk}` : ''}</Fill>
              </CheckLine>
              <DottedRows n={3} />
            </div>
          )
        })}
      </div>

      <PageFooter page={3} total={4} />
    </>
  ),

  (ctx) => {
    const docs: string[] = ctx.draft['เอกสารประกอบ'] || []
    return (
      <>
        <div className="font-bold mb-1">๗. เอกสารประกอบการยื่นคำร้อง</div>
        <div className="space-y-1">
          <CheckLine checked={docs.includes('หลักฐานแสดงการเป็นพยาน')}>เอกสารหลักฐานแสดงการเป็นพยาน</CheckLine>
          <CheckLine checked={docs.includes('หลักฐานแสดงความเสียหาย')}>
            เอกสารหลักฐานแสดงความเสียหาย เช่น ใบรับรองแพทย์ ภาพถ่าย บันทึกประจำวัน
          </CheckLine>
          <CheckLine checked={Boolean(ctx.val('เอกสารอื่นๆ'))}>
            <span>อื่น ๆ</span>
            <Fill grow field={'เอกสารอื่นๆ'}>{ctx.val('เอกสารอื่นๆ', '')}</Fill>
          </CheckLine>
        </div>

        <div className="font-bold mt-2 mb-1">
          ๘. ทั้งนี้ ข้าพเจ้าได้รับทราบสิทธิที่พยานพึงได้รับเมื่อได้รับการคุ้มครองและยินยอมปฏิบัติตามหลักเกณฑ์
          และวิธีการ และเงื่อนไขของสำนักงาน ป.ป.ท. ดังต่อไปนี้
        </div>

        <div className="space-y-0.5">
          <Sub>
            ๑. ข้าพเจ้าได้รับทราบสิทธิที่พึงจะได้รับตามระเบียบและกฎหมายที่เกี่ยวข้อง (ระเบียบสำนักนายกรัฐมนตรีว่าด้วยค่าใช้จ่ายและวิธีการเบิกจ่ายตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
            พ.ศ. ๒๕๖๕ และที่แก้ไขเพิ่มเติม)
          </Sub>
          <Sub>
            ๒. ข้าพเจ้าจะปฏิบัติตามและให้ความร่วมมือ รวมทั้งชื่อฟังคำแนะนำของเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
            ในเรื่องที่เกี่ยวข้องกับความปลอดภัย และเรื่องอื่นๆ ที่อาจทำให้เกิดความเสียหายแก่ตัวของข้าพเจ้าและผู้เกี่ยวข้องอย่างเคร่งครัด
          </Sub>
          <Sub>
            ๓. ข้าพเจ้ายินยอมจะงดใช้โทรศัพท์หรือเครื่องมือสื่อสารอื่นใด และยินยอมจะมอบโทรศัพท์หรือเครื่องมือสื่อสารให้กับเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
          </Sub>
          <Sub>
            ๔. ข้าพเจ้าจะไม่ทำให้เกิดความเสี่ยงต่อความมั่นคงปลอดภัยของตนเองและเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
          </Sub>
          <Sub>
            ๕. ในกรณีที่มีความจำเป็น ข้าพเจ้ายินยอมให้เจ้าพนักงานที่ดำเนินการคุ้มครองจัดให้ข้าพเจ้าอยู่ในสถานที่ที่ปลอดภัยหรือการปกปิดมิให้มีการเปิดเผยข้อมูลเกี่ยวกับข้าพเจ้า
            ทั้งนี้ ตามความเหมาะสมแก่สถานภาพของข้าพเจ้าและลักษณะของคดี
          </Sub>
          <Sub>
            ๖. ระหว่างอยู่ในการคุ้มครอง หากข้าพเจ้าจำเป็นต้องเดินทางออกจากที่พักที่เจ้าพนักงานหรือที่สำนักงาน ป.ป.ท. จัดให้
            ข้าพเจ้าจะต้องได้รับอนุญาตจากเจ้าพนักงานที่ดำเนินการคุ้มครองก่อน
          </Sub>
          <Sub>
            ๗. ข้าพเจ้ายอมรับว่าหากข้าพเจ้าฝ่าฝืนหรือไม่ปฏิบัติตามเงื่อนไขที่กำหนดข้างต้น ข้าพเจ้ายินยอมให้สำนักงาน ป.ป.ท.
            หรือหน่วยงานอื่นที่ได้รับมอบหมายให้คุ้มครอง ยุติการคุ้มครองข้าพเจ้าทันที
          </Sub>
          <Sub>
            ๘. ก่อน ขณะ และหลังการเป็นพยาน และอยู่ในการคุ้มครองของสำนักงาน ป.ป.ท. หรือหน่วยงานอื่นที่ได้รับมอบหมาย
            หากข้าพเจ้ากระทำการอันเป็นความผิดตามที่กฎหมายบัญญัติ ข้าพเจ้ายินยอมให้ฟ้องร้องดำเนินคดีและยุติการคุ้มครองพยานทันที
          </Sub>
        </div>

        <div className="text-center mt-2">ขอรับรองว่า เป็นการบันทึกถ้อยคำที่ถูกต้อง จึงลงลายมือชื่อไว้ต่อเจ้าหน้าที่</div>

        <div className="mt-1 space-y-1">
          <SignSlot
            prefix=""
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb1-applicant']} signKey="kb1-applicant"
            fallbackName={kb1ApplicantName(ctx)}
          />
          <SignSlot
            prefix=""
            role="เจ้าพนักงาน"
            sign={ctx.signatures['kb1-officer']} signKey="kb1-officer"
            fallbackName={ctx.caseItem?.assignedOfficer}
            showPosition
            position={ctx.val('ตำแหน่งเจ้าพนักงาน', 'นักสืบสวนสอบสวนชำนาญการ')}
          />
        </div>

        <PageFooter page={4} total={4} />
      </>
    )
  },
]

/* ================================================================== *
 * คบ.2 — คำร้องผ่านช่องทางการสื่อสาร (1 หน้า)
 * ================================================================== */
const kb2: PageRenderer[] = [
  (ctx) => {
    const wish = ctx.val('ช่วงเวลาคุ้มครอง', 'ขณะเป็นพยาน')
    return (
      <>
        <FormHead
          ctx={ctx}
          title="คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น"
          subtitle={
            <>
              <div>ผ่านช่องทางการสื่อสาร</div>
              <div>(ใช้สำหรับเจ้าพนักงานบันทึกรายละเอียดกรณีเร่งด่วนและผู้ร้องขอไม่อาจมายื่นคำร้องขอด้วยตนเอง)</div>
            </>
          }
        />

        <div className="space-y-1">
          <Row className="pl-12">
            <span>ด้วย นาย/นาง/นางสาว/อื่นๆ</span>
            <Fill grow field={'คำนำหน้า'}>{ctx.val('คำนำหน้า', '')}</Fill>
            <span>ชื่อตัว</span>
            <Fill grow field={'ชื่อผู้แจ้ง'}>{ctx.val('ชื่อผู้แจ้ง', ctx.caseItem?.person || '')}</Fill>
            <span>ชื่อสกุล</span>
            <Fill grow field={'นามสกุลผู้แจ้ง'}>{ctx.val('นามสกุลผู้แจ้ง', '')}</Fill>
          </Row>
          <Row>
            <span>อายุ</span>
            <Fill w="50px" field={'อายุ'}>{ctx.val('อายุ', '')}</Fill>
            <span>ปี ที่อยู่ตามทะเบียนบ้าน บ้านเลขที่</span>
            <Fill grow field={'บ้านเลขที่'}>{ctx.val('บ้านเลขที่', '')}</Fill>
            <span>หมู่ที่</span>
            <Fill w="55px" field={'หมู่ที่'}>{ctx.val('หมู่ที่', '')}</Fill>
            <span>ตรอก/ซอย</span>
            <Fill grow field={'ตรอกซอย'}>{ctx.val('ตรอกซอย', '')}</Fill>
          </Row>
          <Row>
            <span>ถนน</span>
            <Fill grow field={'ถนน'}>{ctx.val('ถนน', '')}</Fill>
            <span>ตำบล/แขวง</span>
            <Fill grow field={'ตำบล'}>{ctx.val('ตำบล', '')}</Fill>
            <span>อำเภอ/เขต</span>
            <Fill grow field={'อำเภอ'}>{ctx.val('อำเภอ', '')}</Fill>
          </Row>
          <Row>
            <span>จังหวัด</span>
            <Fill grow field={'จังหวัด'}>{ctx.val('จังหวัด', '')}</Fill>
            <span>รหัสไปรษณีย์</span>
            <Fill grow field={'รหัสไปรษณีย์'}>{ctx.val('รหัสไปรษณีย์', '')}</Fill>
            <span>โทรศัพท์</span>
            <Fill grow field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
          </Row>
          <Row>
            <span>โทรสาร</span>
            <Fill grow field={'โทรสาร'}>{ctx.val('โทรสาร', '')}</Fill>
            <span>e-mail</span>
            <Fill grow field={'อีเมล'}>{ctx.val('อีเมล', '')}</Fill>
          </Row>
          <Row>
            <span>เกี่ยวข้องกับเรื่องกล่าวหาร้องเรียนการทุจริตในภาครัฐในฐานะที่เป็น</span>
            <Fill grow field={'ฐานะที่เป็น'}>{ctx.val('ฐานะที่เป็น', '')}</Fill>
          </Row>
          <DottedRows n={1} />

          <Row className="flex-wrap">
            <span>มีความประสงค์จะขอรับการคุ้มครองจากการ</span>
            <CheckBox checked={wish === 'ก่อนมาเป็นพยาน'} label="ก่อนมาเป็นพยาน" />
            <CheckBox checked={wish === 'ขณะเป็นพยาน'} label="ขณะเป็นพยาน" />
            <CheckBox checked={wish === 'หลังมาเป็นพยาน'} label="หลังมาเป็นพยาน" />
          </Row>
          <Row>
            <span>ในคดีทุจริตในภาครัฐเกี่ยวกับเรื่อง</span>
            <Fill grow field={'อ้างอิงคดี'}>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </Row>

          <div className="pl-12 pt-1">
            เนื่องจากมีพฤติการณ์ (ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ)
          </div>
          <DottedRows n={3}>{ctx.val('รายละเอียดข้อเท็จจริง', '')}</DottedRows>

          <Row className="pl-12 pt-1">
            <span>โดยได้แจ้งผ่านช่องทางการสื่อสาร</span>
            <Fill grow field={'ช่องทางการสื่อสาร'}>{ctx.val('ช่องทางการสื่อสาร', '')}</Fill>
          </Row>
          <Row className="pl-12">
            <span>รายละเอียดอื่นๆ(ถ้ามี)</span>
            <Fill grow field={'รายละเอียดอื่น'}>{ctx.val('รายละเอียดอื่น', '')}</Fill>
          </Row>
          <DottedRows n={2} />
        </div>

        <SignRow cols={1}>
          <SignSlot
            role="เจ้าพนักงาน"
            sign={derivedSign(ctx.val('เจ้าหน้าที่ผู้รับแจ้ง'), ctx.val('วันเวลารับแจ้ง') ? formatThaiDateTime(ctx.val('วันเวลารับแจ้ง')) : '')}
            fallbackName={ctx.val('เจ้าหน้าที่ผู้รับแจ้ง', ctx.caseItem?.assignedOfficer)}
            showPosition
            position={ctx.val('ตำแหน่งผู้รับแจ้ง', 'เจ้าพนักงาน ป.ป.ท.')}
          />
        </SignRow>
        <div className="text-center">ผู้บันทึก</div>
      </>
    )
  },
]

/* ================================================================== *
 * คบ.3 — บันทึกข้อเท็จจริงประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น (2 หน้า)
 * ================================================================== */
const kb3: PageRenderer[] = [
  (ctx) => (
    <>
      <FormHead
        ctx={ctx}
        title="บันทึกข้อเท็จจริง"
        subtitle={
          <>
            <div>ประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น</div>
            <div className="mx-auto mt-1 w-48 border-b-2 border-slate-800" />
          </>
        }
      />

      {/* บันทึกเพิ่มเติม (อุทธรณ์) เป็นเอกสารที่จัดทำจริง ไม่ใช่ฉบับที่ถูกกดข้าม */}
      {ctx.caseItem?.kb3Skipped && !ctx.caseItem.appealFolder?.addendum && (
        <div className="mb-2 border border-rose-400 bg-rose-50 p-2 text-rose-900">
          <strong>เอกสารฉบับนี้ถูกกดข้าม</strong> เมื่อ {ctx.caseItem.kb3SkippedAt} โดย {ctx.caseItem.kb3SkippedBy}
          <div>เหตุผล: {ctx.caseItem.kb3SkipReason}</div>
        </div>
      )}

      <div className="space-y-1">
        <Row className="justify-end">
          <span>เขียนที่</span>
          <Fill w="45%" field={'สถานที่บันทึก'}>{ctx.val('สถานที่บันทึก', '')}</Fill>
        </Row>
        <Row className="justify-end">
          <span>วันที่</span>
          <Fill w="70px" field={'วันที่'}>{ctx.val('วันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px" field={'เดือน'}>{ctx.val('เดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px" field={'พ.ศ.'}>{ctx.val('พ.ศ.', '')}</Fill>
        </Row>

        <Row className="pt-3 pl-8">
          <span className="font-bold">๑.</span>
          <span>ข้าพเจ้า นาย/นาง/นางสาว/อื่นๆ</span>
          <Fill grow field={'ผู้ให้ถ้อยคำ'}>{ctx.val('ผู้ให้ถ้อยคำ', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <Row>
          <span>เกิดวันที่</span>
          <Fill w="70px" field={'เกิดวันที่'}>{ctx.val('เกิดวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px" field={'เกิดเดือน'}>{ctx.val('เกิดเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px" field={'เกิดพ.ศ.'}>{ctx.val('เกิดพ.ศ.', '')}</Fill>
          <span>อายุ</span>
          <Fill w="60px" field={'อายุ'}>{ctx.val('อายุ', '')}</Fill>
          <span>เชื้อชาติ</span>
          <Fill grow field={'เชื้อชาติ'}>{ctx.val('เชื้อชาติ', 'ไทย')}</Fill>
        </Row>
        <Row>
          <span>สัญชาติ</span>
          <Fill w="100px" field={'สัญชาติ'}>{ctx.val('สัญชาติ', 'ไทย')}</Fill>
          <span>อาชีพ</span>
          <Fill grow field={'อาชีพ'}>{ctx.val('อาชีพ', '')}</Fill>
          <span>ที่อยู่ตามทะเบียนบ้าน เลขที่</span>
          <Fill grow field={'บ้านเลขที่'}>{ctx.val('บ้านเลขที่', '')}</Fill>
        </Row>
        <Row>
          <span>หมู่ที่</span>
          <Fill w="70px" field={'หมู่ที่'}>{ctx.val('หมู่ที่', '')}</Fill>
          <span>ตรอก/ซอย</span>
          <Fill grow field={'ตรอกซอย'}>{ctx.val('ตรอกซอย', '')}</Fill>
          <span>ถนน</span>
          <Fill grow field={'ถนน'}>{ctx.val('ถนน', '')}</Fill>
        </Row>
        <Row>
          <span>ตำบล/แขวง</span>
          <Fill grow field={'ตำบล'}>{ctx.val('ตำบล', '')}</Fill>
          <span>อำเภอ/เขต</span>
          <Fill grow field={'อำเภอ'}>{ctx.val('อำเภอ', '')}</Fill>
          <span>จังหวัด</span>
          <Fill grow field={'จังหวัด'}>{ctx.val('จังหวัด', '')}</Fill>
        </Row>
        <Row>
          <span>รหัสไปรษณีย์</span>
          <Fill w="140px" field={'รหัสไปรษณีย์'}>{ctx.val('รหัสไปรษณีย์', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill w="200px" field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">๒.</span>
          <span>ที่อยู่ปัจจุบัน เลขที่</span>
          <Fill grow field={'ปัจจุบันเลขที่'}>{ctx.val('ปัจจุบันเลขที่', '')}</Fill>
          <span>หมู่ที่</span>
          <Fill w="80px" field={'ปัจจุบันหมู่ที่'}>{ctx.val('ปัจจุบันหมู่ที่', '')}</Fill>
          <span>ตรอก/ซอย</span>
          <Fill grow field={'ปัจจุบันตรอกซอย'}>{ctx.val('ปัจจุบันตรอกซอย', '')}</Fill>
          <span>ถนน</span>
          <Fill grow field={'ปัจจุบันถนน'}>{ctx.val('ปัจจุบันถนน', '')}</Fill>
        </Row>
        <Row>
          <span>ตำบล/แขวง</span>
          <Fill grow field={'ปัจจุบันตำบล'}>{ctx.val('ปัจจุบันตำบล', '')}</Fill>
          <span>อำเภอ/เขต</span>
          <Fill grow field={'ปัจจุบันอำเภอ'}>{ctx.val('ปัจจุบันอำเภอ', '')}</Fill>
          <span>จังหวัด</span>
          <Fill grow field={'ปัจจุบันจังหวัด'}>{ctx.val('ปัจจุบันจังหวัด', '')}</Fill>
        </Row>
        <Row>
          <span>รหัสไปรษณีย์</span>
          <Fill w="140px" field={'ปัจจุบันรหัสไปรษณีย์'}>{ctx.val('ปัจจุบันรหัสไปรษณีย์', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill w="200px" field={'ปัจจุบันโทรศัพท์'}>{ctx.val('ปัจจุบันโทรศัพท์', '')}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">๓.</span>
          <span>หนังสือสำคัญแสดงตน ชนิด</span>
          <Fill grow field={'ชนิดหนังสือสำคัญ'}>{ctx.val('ชนิดหนังสือสำคัญ', 'บัตรประจำตัวประชาชน')}</Fill>
          <span>หมายเลข</span>
          <Fill grow field={'เลขบัตรประชาชน'}>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
        </Row>
        <Row>
          <span>ออกให้ที่</span>
          <Fill grow field={'ออกให้ที่'}>{ctx.val('ออกให้ที่', '')}</Fill>
          <span>วันออก</span>
          <Fill grow field={'วันออกบัตร'} date>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
          <span>วันสิ้นอายุ</span>
          <Fill grow field={'บัตรหมดอายุ'} date>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">๔.</span>
          <span>
            ข้าพเจ้าขอให้ถ้อยคำเพื่อประกอบคำร้องขอการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้นของ
          </span>
        </Row>
        <Row>
          <span>นาย/นาง/นางสาว/อื่นๆ</span>
          <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>ซึ่งเป็นพยานคดีทุจริตในภาครัฐเรื่อง</span>
        </Row>
        <DottedRows n={3} field={'บันทึกถ้อยคำ'}>{ctx.val('บันทึกถ้อยคำ', ctx.caseItem?.mainCaseNo || '')}</DottedRows>
      </div>

      <SignRow>
        <SignSlot role="ผู้ให้ถ้อยคำ" sign={ctx.signatures['kb3-witness']} signKey="kb3-witness" fallbackName={ctx.caseItem?.person} roleBelow hideName />
        <SignSlot
          role="เจ้าพนักงาน"
          sign={ctx.signatures['kb3-officer']} signKey="kb3-officer"
          fallbackName={ctx.caseItem?.assignedOfficer}
          roleBelow
          hideName
        />
      </SignRow>

      <PageFooter page={1} total={2} />
    </>
  ),

  (ctx) => (
    <>
      <div className="font-bold mb-1">
        ๕. เนื่องจากมีพฤติการณ์{' '}
        <span className="font-normal">
          (ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ)
        </span>
      </div>
      <DottedRows n={18} field={'ความเห็นเจ้าหน้าที่'}>{ctx.val('ความเห็นเจ้าหน้าที่', '')}</DottedRows>

      <LetterParagraph>
        ข้าพเจ้าขอรับรองว่า เจ้าพนักงานของสำนักงาน ป.ป.ท. มิได้ทำหรือจัดให้ทำการใดๆซึ่งเป็นการล่อลวง ขู่เข็ญ
        หรือให้สัญญาเพื่อจูงใจ ให้ข้าพเจ้าให้ถ้อยคำใดๆ และข้าพเจ้าขอรับรองว่า เป็นบันทึกถ้อยคำที่ถูกต้อง
        จึงลงลายมือชื่อไว้ต่อหน้าเจ้าพนักงาน
      </LetterParagraph>

      <div className="mt-6 space-y-4">
        <SignSlot role="ผู้ให้ถ้อยคำ" sign={ctx.signatures['kb3-witness']} signKey="kb3-witness" fallbackName={ctx.caseItem?.person} />
        <SignSlot
          role="เจ้าพนักงาน"
          sign={ctx.signatures['kb3-officer']} signKey="kb3-officer"
          fallbackName={ctx.caseItem?.assignedOfficer}
          showPosition
          position={ctx.val('ตำแหน่งเจ้าพนักงาน', 'นักสืบสวนสอบสวนชำนาญการ')}
        />
      </div>

      <PageFooter page={2} total={2} />
    </>
  ),
]

/* ================================================================== *
 * คบ.4 — บันทึกข้อความ ขอคุ้มครองพยานชั่วคราว กรณีเร่งด่วน (3 หน้า)
 * ================================================================== */
const kb4: PageRenderer[] = [
  (ctx) => (
    <>
      <MemoHead
        ctx={ctx}
        urgent
        subject={
          <span className="flex items-baseline gap-1">
            <span className="underline">การขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน สำนวนคดีเลขที่</span>
            <Fill grow field={'สำนวนคดีเลขที่'}>{ctx.val('สำนวนคดีเลขที่', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </span>
        }
        to={
          <span className="flex-1 flex items-baseline gap-1">
            <span>ผู้อำนวยการสำนัก/กอง/ศูนย์</span>
            <Fill w="240px" field={'เรียน'}>{ctx.val('เรียน', '')}</Fill>
          </span>
        }
      />

      <div className="mt-2 space-y-1">
        <div className="font-bold pl-8">๑. เรื่องเดิม</div>
        <Row className="pl-12">
          <span>สำนักงาน ป.ป.ท. ได้รับคำร้องขอให้มีการคุ้มครองพยานในเบื้องต้นจากพยานราย</span>
          <Fill grow field={'พยาน'}>{ctx.val('พยาน', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <Row>
          <span>คำร้องหมายเลขที่</span>
          <Fill grow field={'เลขคำร้อง'}>{ctx.val('เลขคำร้อง', ctx.caseItem?.no || '')}</Fill>
          <span>ในคดีเรื่องที่</span>
          <Fill grow field={'อ้างอิงคดี'}>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
          <span>โดยขอให้สำนักงาน</span>
        </Row>
        <Row>
          <span>ป.ป.ท. คุ้มครองพยานด้วยวิธีการ</span>
          <Fill grow field={'วิธีการคุ้มครอง'}>{ctx.val('วิธีการคุ้มครอง', '')}</Fill>
          <span>เนื่องจากการมาเป็นพยาน ในเรื่องร้องเรียน/</span>
        </Row>
        <Row>
          <span>กล่าวหา</span>
          <Fill grow field={'เรื่องกล่าวหา'}>{ctx.val('เรื่องกล่าวหา', '')}</Fill>
        </Row>

        <div className="font-bold pl-8 pt-1">๒. ข้อเท็จจริง</div>
        <div className="pl-12">๒.๑ รายละเอียดพฤติการณ์แห่งคดี</div>
        {/* ต้นฉบับไม่มีบรรทัดจุดใต้ ๒.๑ — แสดงเฉพาะเมื่อกรอกรายละเอียดแล้ว */}
        {ctx.val('พฤติการณ์แห่งคดี', '') && <DottedRows n={1}>{ctx.val('พฤติการณ์แห่งคดี', '')}</DottedRows>}
        <Sub>
          ๒.๒ (ชื่อ-สกุล พยาน) เป็น (ผู้กล่าวหา ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์กล่าวโทษ ผู้ให้ถ้อยคำ ผู้แจ้งเบาะแส)
          ได้ให้ (หรือจะมาให้) ข้อมูลอันเป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกันการทุจริตในภาครัฐ
          และจากการให้ข้อมูล ผู้ถูกกล่าวหา (หรือผู้คุกคาม) ในเรื่องดังกล่าว มีพฤติการณ์คุกคาม
          (ข้อมูลเกี่ยวกับพฤติการณ์ความไม่ปลอดภัยมีลักษณะเช่นไร และ/หรือ พฤติกรรมการข่มขู่คุกคามมีลักษณะอย่างไร
          เช่น ภยันตรายภัยคุกคามที่พยาน หรือผู้ใกล้ชิด ได้รับ เป็นอย่างไร ระดับความรุนแรงสูงหรือไม่)
          (ภยันตราย หมายถึงภัยที่เป็นความเสียหายแก่ชีวิต ร่างกาย อนามัย เสรีภาพ ชื่อเสียง ทรัพย์สิน
          หรือสิทธิอย่างหนึ่งอย่างใดของพยาน อันเป็นผลสืบเนื่องจากการที่พยานมาให้ข้อมูล หรือจะมาให้ข้อมูล
          อันเป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน และปราบปรามการทุจริตในภาครัฐ)
          ซึ่งพยานเกรงว่าจะไม่ได้รับความปลอดภัย(หรือถูกข่มขู่คุกคามก่อน ขณะ หรือหลังจากการที่ให้ถ้อยคำ แจ้งเบาะแส
          หรือให้ข้อมูล) จึงประสงค์ขอที่จะรับการคุ้มครองพยานเบื้องต้นจาก สำนักงาน ป.ป.ท. โดยขอให้
        </Sub>
        <Row>
          <span>(รูปแบบการคุ้มครอง)</span>
          <Fill w="150px" field={'รูปแบบการคุ้มครอง'}>{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
          <span>ในระหว่างวันที่</span>
          <Fill w="90px" field={'เริ่มวันที่'} date>{beDate(ctx.val('เริ่มวันที่', ctx.caseItem?.actualStartedAt))}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="110px" field={'ถึงวันที่'} date>{beDate(ctx.val('ถึงวันที่', ctx.caseItem?.protectionEndAt))}</Fill>
          <span>และ (ชื่อ สกุล) ยินยอมให้คุ้มครอง</span>
        </Row>
        <Sub>
          ๒.๓. สถานภาพของพยานในขณะยื่นคำร้องขอให้คุ้มครองในเบื้องต้น (พยานอยู่ในความคุ้มครองของเจ้าหน้าที่ก่อนยื่นคำร้อง
          หรือไม่)
        </Sub>

        <div className="font-bold pl-8 pt-1">๓. ข้อกฎหมาย</div>
        <Sub>
          ๓.๑ พระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม
        </Sub>
        <Sub>
          ๓.๒ ระเบียบคณะกรรมการ ป.ป.ท. ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔
        </Sub>
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold pl-8">๔. ข้อพิจารณา</div>
      <Sub>
        (ชื่อ สกุล) พยาน เป็น (ผู้กล่าวหา ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์กล่าวโทษ ผู้ให้ถ้อยคำ ผู้แจ้งเบาะแส)
        สามารถให้ข้อมูล (หรือจะมาให้ข้อมูล) เป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน
        และปราบปรามการทุจริตในภาครัฐ มีพฤติการณ์ถูกคุกคามโดย
        <Fill w="120px" field={'ผู้คุกคาม'}>{ctx.val('ผู้คุกคาม', '')}</Fill>
        (มีภยันตรายซึ่งเกิดจากการประทุษร้ายอันละเมิดต่อกฎหมาย...ผู้ร้องขอมีพฤติการณ์...(เช่น หวาดกลัว
        ไม่อาจทนอยู่ในเคหสถานได้ ฯลฯ)
      </Sub>
      <Sub>
        พิจารณาแล้วเห็นว่าการให้ข้อมูลและพยานหลักฐานของ (ชื่อ สกุล) พยาน เป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน
        และปราบปรามการทุจริตในภาครัฐ จากการตรวจสอบแล้ว พยาน ได้รับภัยคุกคามจริงจากการให้ข้อมูลและพยานหลักฐานกับ
        (เจ้าหน้าที่ ป.ป.ท., พนักงาน ป.ป.ท.) ผู้รับผิดชอบ และเป็นกรณีเร่งด่วน
        ดังนั้นเห็นควรจัดให้มีการคุ้มครองพยานเป็นการเร่งด่วน ดังนี้
      </Sub>

      <div className="pl-12">๔.๑ มอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว ผู้มีรายชื่อ ดังต่อไปนี้</div>
      <OfficerRoster ctx={ctx} keyPrefix="ชุด" />

      <Row className="pl-12 pt-1">
        <span>๔.๒ ดำเนินการคุ้มครองโดยการ</span>
        <Fill w="120px" field={'ดำเนินการโดย'}>{ctx.val('ดำเนินการโดย', '')}</Fill>
        <span>เลือกรูปแบบการคุ้มครอง</span>
        <Fill grow field={'รูปแบบการคุ้มครอง'}>{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
      </Row>
      <ProtectionMethods
        withFifth={false}
        selected={kb4Methods(ctx)}
        labels={KB6_METHOD_LABELS}
        subitems={KB6_METHOD_SUBITEMS}
        subitemSelected={readMethodSubitems(ctx.draft)}
        field={KB4_PROTECTION_METHOD_FIELD}
      />

      <Row className="pl-12 pt-1">
        <span>ตั้งแต่วันที่</span>
        <Fill w="90px" field={'เริ่มวันที่'} date>{beDate(ctx.val('เริ่มวันที่', ctx.caseItem?.actualStartedAt))}</Fill>
        <span>ถึงวันที่</span>
        <Fill w="120px" field={'ถึงวันที่'} date>{beDate(ctx.val('ถึงวันที่', ctx.caseItem?.protectionEndAt))}</Fill>
        <span>ทั้งนี้หากเจ้าพนักงานปฏิบัติหน้าที่คุ้มครองชั่วคราว</span>
      </Row>
      <div>
        เห็นว่าพฤติการณ์แห่งคดีเปลี่ยนแปลงไป อาจเปลี่ยนรูปแบบการคุ้มครองพยานได้ตามความเหมาะสม
        โดยคำนึงถึงความปลอดภัยของพยาน
      </div>

      <Row className="pl-12 pt-1">
        <span>๔.๓ อนุมัติให้</span>
        <Fill grow field={'ผู้ดำเนินการคุ้มครอง'}>{ctx.val('ผู้ดำเนินการคุ้มครอง', '')}</Fill>
        <span>ดำเนินการคุ้มครองพยานชั่วคราว ในพื้นที่</span>
      </Row>
      <Row>
        <Fill w="200px" field={'พื้นที่คุ้มครอง'}>{ctx.val('พื้นที่คุ้มครอง', '')}</Fill>
        <span>ระหว่างวันที่</span>
        <Fill grow field={'ระหว่างวันที่'} date>{beDate(ctx.val('ระหว่างวันที่', ''))}</Fill>
        <span>โดยใช้รถยนต์ส่วนกลางของทางราชการ</span>
      </Row>
      <Row>
        <span>ทะเบียน</span>
        <Fill w="200px" field={'ทะเบียนรถ'}>{ctx.val('ทะเบียนรถ', '')}</Fill>
      </Row>

      <Sub>
        ๔.๔ ขออนุมัติยืมเงินทดรองราชการ เพื่อเป็นค่าใช้จ่ายในการดำเนินการอื่นใดอันจำเป็นแก่การป้องกันและปราบปรามการทุจริตในภาครัฐ
        ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต เพื่อดำเนินการคุ้มครองพยาน รวมเป็นเงินจำนวน
        <Fill w="130px" field={'จำนวนเงิน'}>{ctx.val('จำนวนเงิน', '')}</Fill>
        บาท (<Fill w="130px" field={'จำนวนเงินตัวอักษร'}>{ctx.val('จำนวนเงินตัวอักษร', '')}</Fill>บาทถ้วน) โดยขอถัวเฉลี่ยทุกรายการ
        รายละเอียดปรากฏตามประมาณการค่าใช้จ่าย
      </Sub>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={3} />
      <div className="font-bold pl-8">๕. ความเห็นและข้อเสนอแนะ</div>
      <Sub>
        ๕.๑ เห็นควรจัดให้มีการคุ้มครองพยานชั่วคราว โดยออกคำสั่งมอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว ตาม ๔.๑
        และดำเนินการคุ้มครอง ตาม ๔.๒ พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว
        และหนังสือแจ้งคำสั่งให้พยานผู้ขอรับการคุ้มครองทราบ พร้อมนี้ด้วยแล้ว
      </Sub>
      <Sub>
        ๕.๒ เห็นควรมีหนังสือถึง ผกก.สภ.
        <Fill w="90px" field={'สภ.'}>{ctx.val('สภ.', '')}</Fill>
        เพื่อประสานให้ดำเนินการคุ้มครองพยาน (กรณีเลือกการดำเนินการคุ้มครองโดยการประสานกับหน่วยงานอื่นให้การคุ้มครองพยาน)
        โดยผู้รับผิดชอบในการส่งต่อพยาน และติดตามผลคือเจ้าพนักงานตามคำสั่งแต่งตั้งเจ้าพนักงานปฏิบัติหน้าที่คุ้มครองชั่วคราว
      </Sub>
      <Sub>๕.๓ เห็นควรอนุมัติการเดินทางและค่าใช้จ่ายในการคุ้มครองพยานตาม ๔.๓ , ๔.๔</Sub>
      <div className="pl-12">จึงเรียนมาเพื่อโปรดพิจารณา</div>

      {/** ผู้เสนอลงนามก่อนส่งตรง ผอ. (FastTrackSubmitPanel) */}
      <div className="mt-8 text-center">
        <SignSlot
          prefix="(ลงชื่อ)"
          sign={ctx.signatures['kb4-officer']} signKey="kb4-officer"
          fallbackName={ctx.val('ผู้เสนอ', ctx.caseItem?.assignedOfficer || '')}
        />
        <div>นักสืบสวนสอบสวนชำนาญการ</div>
      </div>

      <div className="mt-5 pl-12 font-bold">
        ๑๓. ความเห็นผู้อำนวยการสำนัก (เรื่องที่ <span className="inline-block w-20" />)
      </div>
      <SolidRows n={3}>{ctx.val('ความเห็นผู้อำนวยการ', '')}</SolidRows>

      {/** ผอ. ลงนามความเห็นข้อ ๑๓ ก่อนอนุมัติ (FastTrackPanel) */}
      <div className="mt-8 text-center">
        <SignSlot
          prefix="(ลงชื่อ)"
          sign={ctx.signatures['kb4-director']} signKey="kb4-director"
          fallbackName={ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}
        />
        <div>
          ผู้อำนวยการ<span className="inline-block w-32 border-b border-slate-700" />
        </div>
      </div>
    </>
  ),
]

/* ================================================================== *
 * คบ.5 — คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว (1 หน้า)
 * ================================================================== */
const kb5: PageRenderer[] = [
  (ctx) => {
    /** เลือกวิธีที่ 1 ใน คบ.4 เท่านั้นที่มีรายชื่อชุดเจ้าพนักงาน — วิธีอื่นตัดรายชื่อและปรับถ้อยคำ */
    const needsTeam = kb5RequiresOfficerTeam(useFormDraftStore.getState().drafts[4] ?? {})
    return (
    <>
      <OrderHead
        ctx={ctx}
        orderTitle={
          <span className="flex items-baseline justify-center gap-1">
            <span>คำสั่งสำนัก/กอง/ศูนย์</span>
            <Fill w="180px" field={'สำนักกองศูนย์'}>{ctx.val('สำนักกองศูนย์', '')}</Fill>
            <span>(ในสังกัด สำนักงาน ป.ป.ท.)</span>
          </span>
        }
        subject="มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว"
      />

      <div className="space-y-1">
        <Row className="pl-12">
          <span>ด้วยผู้อำนวยการสำนัก/กอง/ศูนย์</span>
          <Fill grow field={'ผู้อำนวยการ'}>{ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}</Fill>
          <span>ได้อนุมัติ</span>
        </Row>
        <Row>
          <span>ให้ดำเนินการคุ้มครองชั่วคราวแก่</span>
          <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>(ระบุชื่อพยาน/ผู้ขอรับการคุ้มครอง)</span>
          <Fill w="90px"> </Fill>
        </Row>
        <Row>
          <span>ตั้งแต่วันที่</span>
          <Fill w="70px" field={'เริ่มวันที่'}>{ctx.val('เริ่มวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px" field={'เริ่มเดือน'}>{ctx.val('เริ่มเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px" field={'เริ่มพ.ศ.'}>{ctx.val('เริ่มพ.ศ.', '')}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="70px" field={'ถึงวันที่'}>{ctx.val('ถึงวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px" field={'ถึงเดือน'}>{ctx.val('ถึงเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px" field={'ถึงพ.ศ.'}>{ctx.val('ถึงพ.ศ.', '')}</Fill>
          <span>ดังนั้น</span>
        </Row>
        <Row>
          <span>สำนัก/กอง/ศูนย์</span>
          <Fill grow field={'สำนักกองศูนย์'}>{ctx.val('สำนักกองศูนย์', '')}</Fill>
          <span>{needsTeam ? 'มีคำสั่งมอบหมายเจ้าพนักงาน' : 'มีคำสั่งให้'}</span>
        </Row>
        <div>
          {needsTeam
            ? 'ดำเนินการให้ความคุ้มครองชั่วคราวดังกล่าว ดังมีรายชื่อต่อไปนี้'
            : 'ดำเนินการให้ความคุ้มครองชั่วคราวดังกล่าว'}
        </div>

        {needsTeam && <OfficerRoster ctx={ctx} keyPrefix="ชุด" />}

        <LetterParagraph>
          {needsTeam
            ? 'ให้ผู้มีรายชื่อดังกล่าวข้างต้นรับผิดชอบในการคุ้มครองชั่วคราวโดยดำเนินการให้เป็นไปตามระเบียบ'
            : 'ให้ดำเนินการคุ้มครองชั่วคราวให้เป็นไปตามระเบียบ'}คณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔ และให้รายงานผลให้ผู้บังคับบัญชาทราบทุกระยะ
          <Fill w="70px" field={'รายงานทุกกี่วัน'}>{ctx.val('รายงานทุกกี่วัน', '')}</Fill>
          วัน (ทุกวัน/ทุกสามวัน/ทุกห้าวัน ตามความเหมาะสมรายกรณี) และหากมีกรณีเร่งด่วนให้รายงานในทันที
          โดยการคุ้มครองชั่วคราวรายดังกล่าวให้{needsTeam ? 'เจ้าหน้าที่ชุดคุ้มครอง' : 'เจ้าหน้าที่ผู้รับผิดชอบ'}จัดให้พยานลงลายมือชื่อยินยอมรับการคุ้มครองชั่วคราวด้วย
        </LetterParagraph>

        <LetterParagraph>
          ทั้งนี้ ตั้งแต่บัดนี้เป็นต้นไปจนกว่าจะมีคำสั่งเปลี่ยนแปลง และให้ถือปฏิบัติโดยเคร่งครัด
        </LetterParagraph>

        <Row className="pl-12">
          <span>สั่ง ณ วันที่</span>
          <Fill w="70px" field={'สั่งวันที่'}>{ctx.val('สั่งวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="130px" field={'สั่งเดือน'}>{ctx.val('สั่งเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px" field={'สั่งพ.ศ.'}>{ctx.val('สั่งพ.ศ.', '')}</Fill>
        </Row>
      </div>

      {/** WIT0611 — ผอ. ลงนามคำสั่ง คบ.5 แล้วระบบล็อกฉบับลงนาม ห้ามแก้ทับ */}
      <div className="mt-8 text-center">
        <SignSlot
          prefix="(ลงชื่อ)"
          sign={ctx.signatures['kb5-director']} signKey="kb5-director"
          fallbackName={ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}
        />
        <Row className="justify-center">
          <span>ผู้อำนวยการสำนัก/กอง/ศูนย์</span>
          <Fill w="200px" field={'สำนักกองศูนย์'}>{ctx.val('สำนักกองศูนย์', '')}</Fill>
        </Row>
      </div>

      <div className="mt-6">
        <WitnessAckBox sign={ctx.signatures['kb5-witness']} signKey="kb5-witness" fallbackName={ctx.caseItem?.person} />
      </div>
    </>
    )
  },
]

/* ================================================================== *
 * คบ.6 — บันทึกข้อความ การคุ้มครองพยานในเบื้องต้น (3 หน้า)
 * ================================================================== */
/** คบ.6 ฉบับขยายเวลา — ลายมือชื่อรายชั้นของรอบนั้นอยู่ที่ ExtensionRequest.kb6Signatures (ไม่ใช่ kb6*SignedAt ของ v1 บน CaseItem) */
const kb6SignedBy = (ctx: PaperContext, role: ExtensionKb6SignerRole, v1By?: string, v1At?: string) => {
    const documentSignature = ctx.signatures[`kb6-${role}`]
    if (documentSignature?.signed) return { name: documentSignature.signerName, signedAt: documentSignature.signedAt }
    const docs = ctx.caseItem?.extensionDocs
    if (!docs) return { name: v1By, signedAt: v1At }
    const sig = ctx.caseItem?.extensionRequests?.[docs.round - 1]?.kb6Signatures?.[role]
    return { name: sig?.by, signedAt: sig?.at ? formatThaiDate(sig.at) : undefined }
}

/** ผลความเห็นข้อ 12 และ 13 แยกตามผู้ลงนาม */
const Kb6OpinionChoice: React.FC<{ ctx: PaperContext; secretary?: boolean }> = ({ ctx, secretary = false }) => {
  const ui = React.useContext(PaperSignUiContext)
  const role = useAuthStore((state) => state.currentRole)
  const setChoice = useCaseStore((state) => secretary ? state.setSecretaryOpinionChoice : state.setDeputyOpinionChoice)
  const item = ctx.caseItem
  const extension = item ? getActiveExtensionDocs(item) : null
  const appeal = !extension && Boolean(item?.appealFolder?.addendum)
  const choiceField = extension
    ? secretary ? 'ผลความเห็นเลขาธิการขยายเวลา' : 'ผลความเห็นรองเลขาธิการขยายเวลา'
    : secretary ? 'ผลความเห็นเลขาธิการอุทธรณ์' : 'ผลความเห็นรองเลขาธิการอุทธรณ์'
  const selected = extension ? extension.request?.kb6Snapshot?.[choiceField] ?? ctx.draft[choiceField] : appeal ? ctx.draft[choiceField] : secretary ? item?.kb6SecretaryOpinionChoice : item?.kb6DeputyOpinionChoice
  const signedAt = appeal ? ctx.signatures[secretary ? 'kb6-secretary' : 'kb6-deputy']?.signed : secretary ? item?.kb6SecretarySignedAt : item?.kb6DeputySignedAt
  const atStage = appeal ? item?.appealFolder?.stage === (secretary ? 'secretary' : 'deputy') : item?.stage === (secretary ? 'external_pending' : 'deputy_review')
  const editable = Boolean(ui && (extension
    ? item && extensionKb6PendingSigner(item, role)?.role === (secretary ? 'secretary' : 'deputy')
    : atStage && !signedAt && [secretary ? 'secretary' : 'deputy_secretary', 'admin'].includes(role)))
  return (
    <div className="pl-12 pt-1" data-testid={secretary ? "kb6-secretary-opinion-choice" : "kb6-deputy-opinion-choice"}>
      {(['agree', 'disagree'] as const).map((choice) => (
        <label key={choice} className={`mr-3 inline-flex items-baseline gap-1 ${editable ? 'cursor-pointer' : ''}`}>
          {editable ? <input
            type="checkbox"
            className="h-4 w-4 accent-navy"
            checked={selected === choice}
            onChange={() => {
              if (!item || !editable) return
              if (extension?.request) {
                useFormDraftStore.getState().updateSignedField(6, choiceField, choice)
                useCaseStore.getState().updateCase(item.no, {
                  extensionRequests: item.extensionRequests?.map(request => request.id === extension.request?.id
                    ? { ...request, kb6Snapshot: { ...request.kb6Snapshot, [choiceField]: choice } } : request),
                })
              } else if (appeal) useFormDraftStore.getState().updateSignedField(6, choiceField, choice)
              else setChoice(item.no, choice)
            }}
          /> : <span>{selected === choice ? '☑' : '☐'}</span>}
          <span>{choice === 'agree' ? 'เห็นควร' : 'ไม่เห็นควร'}</span>
        </label>
      ))}
    </div>
  )
}

/** ตำแหน่งเต็มจากทะเบียนผู้ลงนาม ไม่อิงบัญชีของผู้ที่กำลังเปิดดูเอกสาร */
const kb6SignerPosition = (name: string): string | undefined => {
  const normalized = name.replace(/\s+/g, '')
  if (!normalized) return undefined
  return ECMIS_USER_DIRECTORY.find((user) => user.name.replace(/\s+/g, '') === normalized)?.position || undefined
}

const kb6: PageRenderer[] = [
  (ctx) => (
    <>
      <MemoHead
        ctx={ctx}
        subject={
          <span className="flex items-baseline gap-1">
            <span className="underline">การคุ้มครองพยานในเบื้องต้น สำนวนคดีเลขที่</span>
            <Fill grow field={'สำนวนคดีเลขที่'}>{ctx.val('สำนวนคดีเลขที่', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </span>
        }
        to="เลขาธิการคณะกรรมการ ป.ป.ท."
      />

      <div className="mt-2 space-y-1">
        <div className="font-bold pl-8">๑. การรับเรื่อง</div>
        <Row className="pl-12">
          <span>๑.๑ ได้รับคำร้องขอให้มีการคุ้มครองพยานในเบื้องต้นจาก</span>
          <Fill grow field={'ผู้ยื่นคำร้อง'}>{ctx.val('ผู้ยื่นคำร้อง', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <div>
          ตามมาตรา ๕๓ แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๑
          และที่แก้ไขเพิ่มเติม
        </div>
        <Row>
          <span>เมื่อวันที่</span>
          <Fill grow field={'วันที่รับคำร้อง'} date>{beDate(ctx.val('วันที่รับคำร้อง', ctx.caseItem?.createdAt))}</Fill>
          <span>รายละเอียดปรากฏตามคำร้อง</span>
        </Row>
        <Row>
          <Fill w="180px" field={'เลขคำร้อง'}>{ctx.val('เลขคำร้อง', ctx.caseItem?.no || '')}</Fill>
          <span>ลงวันที่</span>
          <Fill grow field={'คำร้องลงวันที่'} date>{beDate(ctx.val('คำร้องลงวันที่', ''))}</Fill>
          <span>ในคดีเรื่อง</span>
          <Fill grow field={'อ้างอิงคดี'}>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
        </Row>
        <Row className="pl-12">
          <span>๑.๒ ผอ.</span>
          <Fill w="70px" field={'ผอ.'}>{ctx.val('ผอ.', '')}</Fill>
          <span>มอบให้</span>
          <Fill grow field={'มอบให้'}>{ctx.val('มอบให้', ctx.caseItem?.assignedOfficer || '')}</Fill>
          <span>ดำเนินการเมื่อวันที่</span>
          <Fill grow field={'มอบวันที่'} date>{beDate(ctx.val('มอบวันที่', ''))}</Fill>
        </Row>

        <div className="font-bold pl-8 pt-1">๒. ข้อเท็จจริง</div>
        <Row className="pl-12">
          <span>๒.๑ .....ชื่อ-สกุล ตำแหน่ง สังกัด ของผู้ถูกกกล่าวหา</span>
          <Fill grow field={'ผู้ถูกกล่าวหา'}>{ctx.val('ผู้ถูกกล่าวหา', '')}</Fill>
          <span>ถูกกล่าวหาว่า</span>
        </Row>
        <Row>
          <Fill w="45%" field={'ข้อกล่าวหา'}>{ctx.val('ข้อกล่าวหา', '')}</Fill>
          <span>
            โดยมีพฤติการณ์.. (ได้แก่ การกระทำความผิดเกิดขึ้นเมื่อใดมีขั้นตอนหรือรายละเอียด
          </span>
        </Row>
        <Row>
          <span>การกระทำความผิดอย่างไร มีพยานบุคคลรายอื่นรู้เห็นเหตุการณ์หรือไม่)</span>
          <Fill grow> </Fill>
        </Row>
        <Row className="pl-12">
          <span>๒.๒ ชื่อ-สกุล พยาน</span>
          <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>บัตรประจำตัวประชาชนเลขที่</span>
          <Fill grow field={'เลขบัตรประชาชน'}>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
        </Row>
        <Row>
          <span>อายุ</span>
          <Fill w="60px" field={'อายุ'}>{ctx.val('อายุ', '')}</Fill>
          <span>ปี อาชีพ</span>
          <Fill grow field={'อาชีพ'}>{ctx.val('อาชีพ', '')}</Fill>
          <span>ที่อยู่ตามทะเบียนบ้านเลขที่</span>
          <Fill grow field={'ที่อยู่ทะเบียนบ้าน'}>{ctx.val('ที่อยู่ทะเบียนบ้าน', '')}</Fill>
        </Row>
        <Row>
          <span>ที่อยู่ปัจจุบันเลขที่</span>
          <Fill grow field={'ที่อยู่ปัจจุบัน'}>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
          <span>เป็น (ผู้กล่าวหา</span>
        </Row>
        <div className="text-justify">
          ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์ กล่าวโทษ ผู้ให้ถ้อยคำ หรือผู้ที่แจ้งเบาะแส ซึ่งจะมาให้ หรือได้ให้ข้อเท็จจริง
          เบาะแส หรือข้อมูลใด เกี่ยวกับการทุจริตในภาครัฐ หรือข้อมูลอื่นอันเป็นประโยชน์ในการดำเนินการตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหาร
          ในการป้องกันและปราบปรามการทุจริต และให้หมายความรวมถึงบุคคลหรือผู้ถูกกล่าวหาซึ่ง ได้รับการกันไว้เป็นพยานด้วย)
        </div>
        <div className="text-justify pl-12">
          ๒.๓ ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย (พฤติกรรมการข่มขู่คุกคามมีลักษณะอย่างไร ผู้กระทำเป็นใคร
          สามารถระบุได้หรือไม่ ความเสียหายที่ได้รับเป็นอย่างไร หลังจากเหตุการณ์คุกคามได้มีการแจ้งความต่อเจ้าหน้าที่ตำรวจ
          หรือเจ้าหน้าที่อื่นที่เกี่ยวข้องแล้วหรือไม่อย่างไร ผู้ใกล้ชิดถูกคุกคามหรือไม่ และพยานประสงค์ให้คุ้มครองความปลอดภัยของผู้ใกล้ชิดด้วยหรือไม่)
          ซึ่งพยานเกรงว่าจะไม่ได้รับความปลอดภัย(หรือถูกข่มขู่คุกคามก่อน ขณะ หรือหลังจากการที่ให้ถ้อยคำ แจ้งเบาะแส หรือให้ข้อมูล)
          จึงประสงค์ขอที่จะรับการคุ้มครองพยานเบื้องต้นจากสำนักงาน ป.ป.ท.
        </div>

        <div className="font-bold pl-8 pt-1">๓. รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง</div>
        {/* FB-012 — พิมพ์ตามที่เจ้าพนักงานเขียนทุกบรรทัด ถ้ายังว่างแสดงเส้นประให้เขียนด้วยมือ */}
        <div className="pl-12 text-justify">
          <DottedRows n={ctx.val(KB6_DURATION_DETAIL_FIELD, '') ? 1 : 3} field={KB6_DURATION_DETAIL_FIELD}>{ctx.val(KB6_DURATION_DETAIL_FIELD, '')}</DottedRows>
        </div>

        <div className="font-bold pl-8 pt-1">
          ๔. สถานภาพของพยานในขณะยื่นคำร้องขอให้คุ้มครองในเบื้องต้น{' '}
          <span className="font-normal">(พยานอยู่ในความคุ้มครองของเจ้าหน้าที่ก่อนยื่นคำร้อง หรือไม่,อยู่ระหว่างการคุ้มครองชั่วคราว)</span>
        </div>
        <div className="font-bold pl-8">
          ๕. ความยินยอมเข้ารับการคุ้มครองพยานในเบื้องต้น <span className="font-normal">(โดยชัดแจ้ง)</span>
        </div>
        <div className="pl-12">พยานตกลงยินยอมรับการคุ้มครองตามมาตรการคุ้มครองเบื้องต้น</div>
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold pl-8">
        ๖. เอกสารประกอบการยื่นคำร้อง <span className="font-normal">(อย่างน้อยต้องมี)</span>
      </div>
      <Sub>
        ๖.๑ สำเนาบัตรประจำตัวประชาชน/บัตรประจำตัวเจ้าหน้าที่ของรัฐหรือ หลักฐานแสดงตนที่ทางราชการออกให้ (รับรองสำเนาถูกต้อง)
      </Sub>
      <Sub>๖.๒ สำเนาทะเบียนบ้าน (รับรองสำเนาถูกต้อง)</Sub>
      <Sub>๖.๓ สำเนาเอกสารแสดงถึงความเกี่ยวข้องกับเรื่องกล่าวหาร้องเรียน เช่น หมายเรียก (ถ้ามี)</Sub>
      <Sub>๖.๔ สำเนาเอกสารหลักฐานแสดงความเสียหาย เช่น ใบรับรองแพทย์ (ถ้ามี)</Sub>
      <Sub>๖.๕ อื่นๆ</Sub>

      <div className="font-bold pl-8 pt-1">๗. กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง</div>
      {/*
        ข้อที่เว้นว่างไม่พิมพ์ และเลขข้อไล่ใหม่ให้ต่อเนื่องเสมอ
        FB-025 — กั้นหน้าแบบแขวน: เลขข้อเยื้อง 3rem เท่ากับ Sub ส่วนบรรทัดที่ตัดคำ
        เริ่มตรงกับข้อความของบรรทัดแรก ไม่ย้อนไปชิดขอบซ้าย
        ข้อความจัดชิดขอบสองข้าง (text-justify) บรรทัดที่ตัดคำจึงถูกยืดที่อักขระช่องว่าง
        ทุกตัว รวมถึง nbsp ซึ่งนับเป็น word-separator ตาม CSS Text ด้วย — แยกเลขข้อไว้ใน
        inline-block คอลัมน์ของตัวเอง การจัดชิดขอบจึงยืดช่องว่างหลังเลขข้อไม่ได้ ระยะนี้คงที่ทุกข้อ
      */}
      {readLegalRefs(ctx.draft)
        .filter((text) => text.trim())
        .map((text, i) => (
          <p key={i} className="flex pl-[3rem] text-justify" data-testid="kb6-paper-legal-ref">
            <span className="inline-block shrink-0">{`๗.${toThaiDigits(i + 1)} `}</span>
            <span className="min-w-0 flex-1">{text.trim()}</span>
          </p>
        ))}

      <div className="font-bold pl-8 pt-1">๘. ข้อพิจารณา</div>
      {/* FB-013 — เจ้าหน้าที่พิมพ์ข้อพิจารณาเอง ว่าง = เว้นเป็นเส้นประให้เขียนด้วยลายมือ · กรอกบนเอกสาร = พิมพ์ในช่องนี้ */}
      <PaperEditOnly>
        <div className="pl-8 pr-8 pt-3">
          <DottedRows n={KB6_RATIONALE_BLANK_ROWS} field={KB6_RATIONALE_FIELD}>{String(ctx.draft[KB6_RATIONALE_FIELD] ?? '')}</DottedRows>
        </div>
      </PaperEditOnly>
      <PaperReadOnly>
      {String(ctx.draft[KB6_RATIONALE_FIELD] ?? '').trim() ? (
        <div className="pl-12 pr-8 whitespace-pre-wrap" data-testid="kb6-paper-rationale">
          {String(ctx.draft[KB6_RATIONALE_FIELD]).trim()}
        </div>
      ) : (
        /* เยื้องซ้ายให้ตรงกับหัวข้อ ๘. เว้นขอบขวา และเว้นระยะใต้หัวข้อก่อนเริ่มเส้นประ */
        <div className="pl-8 pr-8 pt-3">
          <DottedRows n={KB6_RATIONALE_BLANK_ROWS} />
        </div>
      )}
      </PaperReadOnly>
      {/* ข้อ 4 = ประสานหน่วยงานอื่นคุ้มครองแทน จึงไม่มีคำสั่งมอบหมายชุดเจ้าพนักงานตามข้อ 8.1 */}
      {!kb6Methods(ctx).includes(KB6_METHOD_EXTERNAL) && (
        <>
          <div className="pl-12">
            ๘.๑ มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน ตามมาตรการคุ้มครองเบื้องต้น โดยมีองค์ประกอบดังนี้ ดังต่อไปนี้
          </div>
          <OfficerRoster ctx={ctx} keyPrefix="ชุด" />
        </>
      )}

      <Row className="pl-12 pt-1">
        <span>๘.๒ ดำเนินการคุ้มครองโดยการ</span>
        <Fill w="120px" field={'ดำเนินการโดย'}>{ctx.val('ดำเนินการโดย', '')}</Fill>
        <span>เลือกรูปแบบการคุ้มครอง</span>
        {/* รายการด้านล่างคือรูปแบบที่เลือกจริง ไม่ใช้ข้อความสรุปจากร่างเก่าซึ่งอาจขัดกับข้อ 4 */}
      </Row>
      <ProtectionMethods
        withFifth={false}
        selected={kb6Methods(ctx)}
        labels={KB6_METHOD_LABELS}
        subitems={KB6_METHOD_SUBITEMS}
        subitemSelected={readMethodSubitems(ctx.draft)}
        renderAfter={kb6MethodExtras(ctx)}
        field={KB6_PROTECTION_METHOD_FIELD}
        detailFields={{ 2: KB6_METHOD2_DETAIL_FIELD, 3: KB6_METHOD3_DETAIL_FIELD }}
      />
    </>
  ),

  (ctx) => (
    <div className="kb6-approval-page">
      <PageNumber page={3} />
      {!kb6Methods(ctx).includes(KB6_METHOD_EXTERNAL) && <Sub>๕. ดำเนินการอื่นใด เช่น จัดให้มีการติดต่อสอบถามความเป็นอยู่หรือตรวจสถานที่อยู่อย่างสม่ำเสมอ</Sub>}
      {/* ต้นฉบับเป็นย่อหน้าเดียวต่อเนื่อง — ช่องวันที่อยู่ในบรรทัด ข้อความตัดบรรทัดตามจริง ไม่มีบรรทัดสั้นค้าง */}
      <p className="text-justify indent-[3rem]">
        ตั้งแต่วันที่ <Fill w="110px" field={'เริ่มวันที่'} date>{beDate(ctx.val('เริ่มวันที่', ''))}</Fill>{' '}
        ถึงวันที่ <Fill w="110px" field={'ถึงวันที่'} date>{beDate(ctx.val('ถึงวันที่', ''))}</Fill>{' '}
        (รวม <Fill w="40px" field={'รวมเดือน'}>{ctx.val('รวมเดือน', '')}</Fill> เดือน{' '}
        <Fill w="40px" field={'รวมวัน'}>{ctx.val('รวมวัน', '')}</Fill> วัน) ทั้งนี้ หากเจ้าพนักงานปฏิบัติหน้าที่คุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
        เห็นว่าพฤติการณ์แห่งคดีเปลี่ยนแปลงไป อาจเปลี่ยนรูปแบบการคุ้มครองพยานได้ตามความเหมาะสม โดยคำนึงถึงความปลอดภัยของพยาน
      </p>

      <div className="font-bold pl-8 pt-1">๙. ความเห็นและข้อเสนอแนะ</div>
      {!kb6Methods(ctx).includes(KB6_METHOD_EXTERNAL) && <Sub>
        ๙.๑ เห็นควรจัดให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น โดยมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
        ตาม ๘.๑ พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น มาพร้อมนี้
      </Sub>}
      <Sub>๙.๒ เห็นควรดำเนินการคุ้มครอง ตาม ๘.๒</Sub>
      <div className="pl-12">จึงเรียนมาเพื่อโปรดพิจารณา</div>

      {/* ผู้เสนอ (เจ้าพนักงานผู้จัดทำ) ลงนามเหนือวงเล็บชื่อ — ปุ่ม "ลงนาม" บนกระดาษ */}
      <MemoSignBlock
        name={ctx.val('ผู้เสนอ', ctx.signatures['kb6-officer']?.signerName || ctx.caseItem?.assignedOfficer || '')}
        signature={<>
          {ctx.signatures['kb6-officer']?.signed && <SignatureInk sign={ctx.signatures['kb6-officer']} />}
          <PaperSignTrigger signKey="kb6-officer" signed={ctx.signatures['kb6-officer']?.signed} role="ผู้เสนอ" defaultName={ctx.val('ผู้เสนอ', ctx.caseItem?.assignedOfficer || '')} />
        </>}
      >
        <div>{kb6SignerPosition(ctx.signatures['kb6-officer']?.signerName || ctx.val('ผู้เสนอ', ctx.caseItem?.assignedOfficer || '')) || 'นักสืบสวนสอบสวนชำนาญการ'}</div>
      </MemoSignBlock>

      {/* ข้อ 10-13 ลงนามจากหน้าแบบ คบ.6 — ชื่อและวันที่ที่ลงนามแล้วจะพิมพ์ใต้ช่องลายมือชื่อ */}
      {[
        { no: '10', label: 'ความเห็นผู้บังคับบัญชาชั้นต้น', key: 'ความเห็นผู้บังคับบัญชาชั้นต้น', signer: 'ผู้อำนวยการกลุ่ม', signKey: 'kb6-supervisor', ...kb6SignedBy(ctx, 'supervisor', ctx.caseItem?.kb6SupervisorSignedBy, ctx.caseItem?.kb6SupervisorSignedAt), fallbackName: ctx.val('ผู้บังคับบัญชา', 'นายกิตติศักดิ์ ธรรมรักษ์') },
        { no: '11', label: 'ความเห็นผู้อำนวยการสำนัก', key: 'ความเห็นผู้อำนวยการ', signer: 'ผู้อำนวยการ', signKey: 'kb6-director', ...kb6SignedBy(ctx, 'director', ctx.caseItem?.kb6DirectorSignedBy, ctx.caseItem?.kb6DirectorSignedAt), fallbackName: ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '') },
        { no: '12', label: 'ความเห็นรองเลขาธิการฯ', key: 'ความเห็นรองเลขาธิการ', signer: 'รองเลขาธิการคณะกรรมการ ป.ป.ท', signKey: 'kb6-deputy', ...kb6SignedBy(ctx, 'deputy', ctx.caseItem?.kb6DeputySignedBy, ctx.caseItem?.kb6DeputySignedAt), fallbackName: ctx.val('รองเลขาธิการ', '') },
        { no: '13', label: 'ความเห็นเลขาธิการฯ', key: 'ความเห็นเลขาธิการ', signer: 'เลขาธิการคณะกรรมการ ป.ป.ท', signKey: 'kb6-secretary', ...kb6SignedBy(ctx, 'secretary', ctx.caseItem?.kb6SecretarySignedBy, ctx.caseItem?.kb6SecretarySignedAt), fallbackName: ctx.val('เลขาธิการ', ctx.caseItem?.secretarySignedBy || '') },
      ].map((row) => {
        const position = kb6SignerPosition(row.name || row.fallbackName)
        return (
        <div key={row.no} className="kb6-opinion-section mt-1.5">
          <div className="font-bold pl-12">
            {toThaiDigits(row.no)}. {row.label} (เรื่องที่ <span className="inline-block w-28" />)
          </div>
          {/* FB-018 — ผลความเห็นรองเลขาธิการฯ (เห็นควร / ไม่เห็นควร) พิมพ์ก่อนความเห็นอิสระและลายมือชื่อ */}
          {(row.no === '12' || row.no === '13') && <Kb6OpinionChoice ctx={ctx} secretary={row.no === '13'} />}
          {/* ความเห็นแสดงเมื่อชั้นนั้นลงนามแล้วเท่านั้น — ค่าตั้งต้นในร่างไม่ใช่ความเห็นของผู้ที่ยังไม่ได้รับเรื่อง */}
          <SolidRows n={2}>{row.signedAt ? ctx.val(row.key, '') : ''}</SolidRows>
          <MemoSignBlock
            name={row.name || row.fallbackName}
            signature={<>
              {row.signedAt && <SignatureInk sign={{
                ...derivedSign(row.name || row.fallbackName, row.signedAt)!,
                signatureImage: ctx.signatures[row.signKey]?.signerName === (row.name || row.fallbackName)
                  ? ctx.signatures[row.signKey]?.signatureImage : undefined,
              }} />}
              <PaperSignTrigger signKey={row.signKey} signed={Boolean(row.signedAt)} />
            </>}
          >
            {/* มีข้อมูลผู้ลงนามแสดงตำแหน่งเต็ม ถ้าไม่พบจึงคงช่องตำแหน่งตามแบบ */}
            <div className="flex items-baseline justify-center">
              <span>{position || row.signer}</span>
              {!position && row.no === '10' && <span className="ml-0.5 inline-block w-36 border-b border-dotted border-slate-600" />}
              {!position && row.no === '11' && <span className="ml-0.5 inline-block w-36 border-b border-slate-700" />}
            </div>
            {row.signedAt && <div className="text-[0.85em]">ลงนามเมื่อ {row.signedAt}</div>}
          </MemoSignBlock>
        </div>
        )
      })}
    </div>
  ),
]

/* ================================================================== *
 * คบ.7 — คำร้องขอยุติการคุ้มครองพยาน (2 หน้า)
 * ================================================================== */
const kb7: PageRenderer[] = [
  (ctx) => {
    const method = ctx.val('วิธีการคุ้มครองเดิม', 'การคุ้มครองเบื้องต้น')
    return (
      <>
        <FormHead
          ctx={ctx}
          title={
            <>
              <div className="text-right font-normal pr-4 mb-3">
                <div>สำนักงาน ป.ป.ท.</div>
                <Row className="justify-end">
                  <span>วันที่</span>
                  <Fill w="60px" field={'วันที่'}>{ctx.val('วันที่', '')}</Fill>
                  <span>เดือน</span>
                  <Fill w="110px" field={'เดือน'}>{ctx.val('เดือน', '')}</Fill>
                  <span>พ.ศ.</span>
                  <Fill w="70px" field={'พ.ศ.'}>{ctx.val('พ.ศ.', '')}</Fill>
                </Row>
              </div>
              <div>คำร้องขอยุติการคุ้มครองพยาน</div>
            </>
          }
        />

        <div className="space-y-1">
          <Row>
            <span className="font-bold w-6">๑.</span>
            <span className="font-bold">ข้าพเจ้า</span>
            <span>นาย/นาง/ นางสาว/อื่นๆ</span>
            <Fill grow field={'ชื่อผู้ยื่น'}>{ctx.val('ชื่อผู้ยื่น', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow field={'นามสกุลผู้ยื่น'}>{ctx.val('นามสกุลผู้ยื่น', '')}</Fill>
          </Row>
          <div className="pl-10 space-y-1">
            <div className="flex items-baseline gap-2">
              <span>เกี่ยวข้องในฐานะ</span>
              <CheckBox checked={ctx.val('ฐานะผู้ยื่น', 'พยาน') === 'พยาน'} label="พยาน" />
            </div>
            <Row className="pl-[6.5rem]">
              <span className="official-box flex-shrink-0">
                {ctx.val('ฐานะผู้ยื่น') === 'ผู้ใกล้ชิด' ? '✓' : ''}
              </span>
              <span>บุคคลผู้มีความสัมพันธ์ใกล้ชิดกับพยาน</span>
              <Fill grow field={'ความสัมพันธ์ใกล้ชิด'}>{ctx.val('ความสัมพันธ์ใกล้ชิด', '')}</Fill>
            </Row>
          </div>

          <Row className="flex-wrap">
            <span className="font-bold w-6">๒.</span>
            <span className="font-bold">วิธีการ/มาตรการที่ใช้ในการคุ้มครองพยาน</span>
            <CheckBox checked={method === 'การคุ้มครองชั่วคราว'} label="การคุ้มครองชั่วคราว" />
            <CheckBox checked={method === 'การคุ้มครองเบื้องต้น'} label="การคุ้มครองเบื้องต้น" />
          </Row>

          <Row>
            <span className="font-bold w-6">๓.</span>
            <span className="font-bold">หน่วยงานที่ดำเนินการคุ้มครองพยาน</span>
            <Fill grow field={'หน่วยงานคุ้มครอง'}>{ctx.val('หน่วยงานคุ้มครอง', 'สำนักงาน ป.ป.ท.')}</Fill>
          </Row>

          <Row>
            <span className="font-bold w-6">๔.</span>
            <span className="font-bold">ข้อมูลพยาน</span>
            <span>ชื่อ นาย/นาง/นางสาว/อื่นๆ</span>
            <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow field={'นามสกุลพยาน'}>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-10 space-y-1">
            <Row>
              <span>อาชีพ</span>
              <Fill grow field={'อาชีพ'}>{ctx.val('อาชีพ', '')}</Fill>
            </Row>
            <div className="flex items-baseline gap-2">
              <span>สถานภาพ</span>
              {['โสด', 'สมรส', 'หย่า', 'หม้าย'].map((o) => (
                <CheckBox key={o} checked={ctx.val('สถานภาพ') === o} label={o} />
              ))}
            </div>
            <Row>
              <span>ชื่อบิดา</span>
              <Fill grow field={'ชื่อบิดา'}>{ctx.val('ชื่อบิดา', '')}</Fill>
              <span>ชื่อมารดา</span>
              <Fill grow field={'ชื่อมารดา'}>{ctx.val('ชื่อมารดา', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน (ที่สามารถติดต่อได้)</span>
              <Fill grow field={'ที่อยู่ปัจจุบัน'}>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <Fill grow> </Fill>
              <span>โทรศัพท์</span>
              <Fill grow field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow field={'สถานที่ทำงาน'}>{ctx.val('สถานที่ทำงาน', '')}</Fill>
              <span>โทรศัพท์</span>
              <Fill grow field={'โทรศัพท์ที่ทำงาน'}>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขประจำตัวประชาชน</span>
              <IdBoxes value={ctx.val('เลขบัตรประชาชน', '')} />
              <span>หรือ</span>
            </Row>
            <Row>
              <span>เลขที่บัตรประจำตัวอื่นๆ (ระบุ)</span>
              <Fill grow field={'บัตรอื่นๆ'}>{ctx.val('บัตรอื่นๆ', '')}</Fill>
              <span>ออกโดย</span>
              <Fill grow field={'ออกโดย'}>{ctx.val('ออกโดย', '')}</Fill>
            </Row>
          </div>

          <Row>
            <span className="font-bold w-6">๕.</span>
            <span className="font-bold">บุคคลที่สามารถติดต่อได้</span>
            <Fill grow field={'ผู้ติดต่อได้'}>{ctx.val('ผู้ติดต่อได้', '')}</Fill>
            <span>ที่อยู่</span>
            <Fill grow field={'ผู้ติดต่อที่อยู่'}>{ctx.val('ผู้ติดต่อที่อยู่', '')}</Fill>
          </Row>
          <Row className="pl-10">
            <Fill grow> </Fill>
            <span>โทรศัพท์</span>
            <Fill grow field={'ผู้ติดต่อโทรศัพท์'}>{ctx.val('ผู้ติดต่อโทรศัพท์', '')}</Fill>
          </Row>
          <Row className="pl-10">
            <span>สถานที่ทำงาน</span>
            <Fill grow field={'ผู้ติดต่อที่ทำงาน'}>{ctx.val('ผู้ติดต่อที่ทำงาน', '')}</Fill>
            <span>โทรศัพท์</span>
            <Fill grow field={'ผู้ติดต่อโทรที่ทำงาน'}>{ctx.val('ผู้ติดต่อโทรที่ทำงาน', '')}</Fill>
          </Row>

          <Row>
            <span className="font-bold w-6">๖.</span>
            <span className="font-bold">มีความประสงค์ขอให้ยุติการคุ้มครอง</span>
          </Row>
          <div className="pl-10 space-y-1">
            <CheckLine checked={ctx.val('ยุติให้ใคร', 'พยาน') === 'พยาน'}>พยาน</CheckLine>
            <CheckLine checked={ctx.val('ยุติให้ใคร') === 'ผู้ใกล้ชิด'}>
              <span>บุคคลผู้มีความสัมพันธ์ใกล้ชิดกับพยาน (ระบุชื่อ – สกุล)</span>
              <Fill grow field={'ชื่อผู้ใกล้ชิด'}>{ctx.val('ชื่อผู้ใกล้ชิด', '')}</Fill>
            </CheckLine>
          </div>
          <DottedRows n={2} />
        </div>
      </>
    )
  },

  (ctx) => {
    const docs: string[] = ctx.draft['เอกสารประกอบ'] || []
    return (
      <>
        <div className="font-bold mb-1">๗. เหตุผลในการขอให้ยุติการคุ้มครอง</div>
        <DottedRows n={15} field="เหตุผลการยุติ">
          {ctx.val('เหตุผลการยุติ', ctx.caseItem?.terminationRequest?.reason || '')}
        </DottedRows>

        <div className="font-bold mt-3 mb-1">๘. เอกสารประกอบการยื่นคำร้อง</div>
        <div className="pl-8 space-y-1">
          <CheckLine checked={docs.includes('สำเนาบัตรประชาชน')}>
            <span>สำเนาบัตรประชาชน/บัตรประจำตัวอื่นๆ (ระบุ)</span>
            <Fill grow field={'บัตรอื่นๆ'}>{ctx.val('บัตรอื่นๆ', '')}</Fill>
          </CheckLine>
          <CheckLine checked={docs.includes('สำเนาทะเบียนบ้าน')}>สำเนาทะเบียนบ้าน</CheckLine>
          <CheckLine checked={Boolean(ctx.val('เอกสารอื่นๆ'))}>
            <span>เอกสารอื่นๆ</span>
            <Fill grow field={'เอกสารอื่นๆ'}>{ctx.val('เอกสารอื่นๆ', '')}</Fill>
          </CheckLine>
        </div>

        <div className="mt-12 space-y-6">
          <SignSlot
            prefix="(ลงชื่อ)"
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb7-applicant']} signKey="kb7-applicant"
            fallbackName={ctx.caseItem?.person}
            showPosition
            position={ctx.val('ตำแหน่งผู้ยื่น', '')}
          />
          <SignSlot
            prefix="(ลงชื่อ)"
            role="เจ้าพนักงาน"
            signKey="kb7-officer"
            sign={ctx.signatures['kb7-officer'] || derivedSign(
              ctx.caseItem?.terminationRequest?.decidedBy,
              ctx.caseItem?.terminationRequest?.decidedAt
            )}
            fallbackName={ctx.caseItem?.assignedOfficer}
            showPosition
            position={ctx.val('ตำแหน่งเจ้าพนักงาน', 'นักสืบสวนสอบสวนชำนาญการ')}
            showDate
          />
        </div>
      </>
    )
  },
]

/* ================================================================== *
 * คบ.8 — คำสั่งมอบหมายเจ้าพนักงานฯ ตามมาตรการคุ้มครองเบื้องต้น (1 หน้า)
 * ================================================================== */
const kb8: PageRenderer[] = [
  (ctx) => (
    <>
      <OrderHead
        ctx={ctx}
        orderTitle="คำสั่งสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ"
        subject="มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น"
      />

      <div className="space-y-1">
        <Row className="pl-12">
          <span>
            ตามที่เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ได้อนุมัติ
          </span>
        </Row>
        <Row>
          <span>ให้คุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้นแก่</span>
          <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>(ระบุชื่อพยาน/</span>
        </Row>
        <Row>
          <span>ผู้ขอรับการคุ้มครอง)</span>
          <Fill grow> </Fill>
          <span>รวมจำนวน</span>
          <Fill w="70px" field={'จำนวนวัน'}>{ctx.val('จำนวนวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
          <span>วัน โดยนับตั้งแต่วันที่</span>
          <Fill w="70px" field={'เริ่มวันที่'}>{ctx.val('เริ่มวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="100px" field={'เริ่มเดือน'}>{ctx.val('เริ่มเดือน', '')}</Fill>
        </Row>
        <Row>
          <span>พ.ศ.</span>
          <Fill w="80px" field={'เริ่มพ.ศ.'}>{ctx.val('เริ่มพ.ศ.', '')}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="70px" field={'ถึงวันที่'}>{ctx.val('ถึงวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px" field={'ถึงเดือน'}>{ctx.val('ถึงเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px" field={'ถึงพ.ศ.'}>{ctx.val('ถึงพ.ศ.', '')}</Fill>
          <span>นั้น</span>
        </Row>

        <LetterParagraph>
          อาศัยอำนาจตามความในมาตรา ๕๑ แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๑
          และที่แก้ไขเพิ่มเติม ประกอบระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔ ข้อ ๑๕ และ ข้อ ๑๖ จึงมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
          โดยมีองค์ประกอบและอำนาจหน้าที่ ดังต่อไปนี้
        </LetterParagraph>

        <div className="font-bold pl-8">องค์ประกอบ</div>
        <OfficerRoster ctx={ctx} keyPrefix="ชุด" leadLabel="เป็นหัวหน้าชุดปฏิบัติการ" />

        <div className="font-bold pl-8 pt-1">อำนาจหน้าที่</div>
        <div className="pl-12 space-y-1 text-justify">
          <div>
            ๑. ดำเนินการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้นและให้ปฏิบัติในส่วนที่เกี่ยวข้องกับการคุ้มครองพยานตามที่ระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
            พ.ศ. ๒๕๕๔ กำหนดโดยเคร่งครัด
          </div>
          <div>
            ๒. พิจารณาและเสนอความเห็นในวิธีการ การเปลี่ยนแปลง หรือยกเลิกวิธีการคุ้มครองพยานทั้งหมดหรือบางส่วนต่อเลขาธิการคณะกรรมการ
            ป.ป.ท.
          </div>
          <div>
            ๓. รายงานผลการดำเนินการ การปฏิบัติ รวมถึงเหตุสำคัญอื่นใดต่อเลขาธิการคณะกรรมการ ป.ป.ท. ในห้วงเวลาที่จำเป็น
            หรือทุกระยะเวลาตามความเหมาะสม โดยอาจเสนอความเห็นเป็นข้อพิจารณา หรือ ข้อสั่งการ ประกอบด้วยก็ได้
          </div>
          <div>๔. ดำเนินการอื่นใดตามที่เลขาธิการคณะกรรมการ ป.ป.ท. มอบหมาย</div>
        </div>

        <div className="pl-12 pt-1">ทั้งนี้ ตั้งแต่บัดนี้เป็นต้นไป</div>
        <Row className="pl-16">
          <span>สั่ง ณ วันที่</span>
          <Fill w="70px" field={'สั่งวันที่'}>{ctx.val('สั่งวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="130px" field={'สั่งเดือน'}>{ctx.val('สั่งเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px" field={'สั่งพ.ศ.'}>{ctx.val('สั่งพ.ศ.', '')}</Fill>
        </Row>
      </div>

      <div className="mt-4 grid grid-cols-[auto_1fr] gap-4 items-end">
        <WitnessAckBox sign={ctx.signatures['kb8-witness']} signKey="kb8-witness" fallbackName={ctx.caseItem?.person} />
        <div className="text-center">
          <div className="text-left">(ลงชื่อ)</div>
          <div>
            (
            {ctx.val('เลขาธิการ', ctx.caseItem?.secretarySignedBy || '')}
            <span className="inline-block w-28" />)
          </div>
          <div className="whitespace-nowrap">เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ</div>
        </div>
      </div>
    </>
  ),
]

/* ================================================================== *
 * คบ.9 — หนังสือแจ้งตอบรับการให้ความคุ้มครอง (1 หน้า)
 * ================================================================== */
const kb9: PageRenderer[] = [
  (ctx) => (
    <>
      <LetterHead
        ctx={ctx}
        subject="แจ้งตอบรับการให้ความคุ้มครอง"
        to="ผู้ยื่นร้องขอคุ้มครองพยาน"
        reference={
          <>
            <span>คำร้องขอให้คุ้มครองพยาน ลงวันที่</span>
            <Fill grow field={'คำร้องลงวันที่'} date>{beDate(ctx.val('คำร้องลงวันที่', ctx.caseItem?.createdAt || ''))}</Fill>
          </>
        }
      />

      <LetterParagraph>
        ตามที่ท่านได้ยื่นคำร้องขอให้สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
        ทำการคุ้มครองแก่ พยาน / บุคคลที่เกี่ยวข้อง ตามระเบียบคณะกรรมการป้องกัน และปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ นั้น
      </LetterParagraph>

      <LetterParagraph>
        บัดนี้ สำนักงาน ป.ป.ท. ได้อนุมัติ เมื่อวันที่{' '}
        <Fill w="180px" field={'วันที่อนุมัติ'} date>{beDate(ctx.val('วันที่อนุมัติ', ctx.caseItem?.resultAt || ''))}</Fill> ให้คุ้มครอง
        พยาน/บุคคลที่เกี่ยวข้อง แล้ว ขอให้ท่านปฏิบัติตามเงื่อนไขการปฏิบัติระหว่างอยู่ในความคุ้มครอง
        หากผิดเงื่อนไขอาจทำให้การคุ้มครองสิ้นสุดลง
      </LetterParagraph>

      <LetterParagraph>จึงเรียนมาเพื่อโปรดทราบ</LetterParagraph>

      <LetterSignOff
        signKey="kb9-secretary"
        sign={ctx.signatures['kb9-secretary'] || derivedSign(ctx.caseItem?.kb9SignedBy || ctx.caseItem?.secretarySignedBy, ctx.caseItem?.kb9SignedAt)}
        position={
          <>
            <div>เลขาธิการคณะกรรมการ ป.ป.ท.</div>
            <div>หรือรองเลขาธิการฯ ที่ได้รับมอบหมาย</div>
            <div>หรือ ผอ.สำนักที่ได้รับมอบหมาย</div>
          </>
        }
      />

      <ContactFooter />
    </>
  ),
]

/* ================================================================== *
 * คบ.10 — หนังสือแจ้งคำสั่งไม่ให้พยานได้รับการคุ้มครอง (1 หน้า)
 * ================================================================== */
const kb10: PageRenderer[] = [
  (ctx) => (
    <>
      <LetterHead
        ctx={ctx}
        subject="แจ้งคำสั่งไม่ให้พยานได้รับการคุ้มครอง"
        to="ผู้ยื่นร้องขอคุ้มครองพยาน"
        reference={
          <>
            <span>คำร้องขอให้คุ้มครองพยาน ลงวันที่</span>
            <Fill grow field={'คำร้องลงวันที่'} date>{beDate(ctx.val('คำร้องลงวันที่', ctx.caseItem?.createdAt || ''))}</Fill>
          </>
        }
      />

      <LetterParagraph>
        ตามที่ท่านได้ยื่นคำร้องขอให้สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
        ทำการคุ้มครองแก่ พยาน / บุคคลที่เกี่ยวข้อง ตามระเบียบคณะกรรมการป้องกัน และปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ นั้น
      </LetterParagraph>

      <LetterParagraph>
        บัดนี้ สำนักงาน ป.ป.ท. พิจารณาแล้วเห็นว่า{' '}
        <Fill grow field="สาระสำคัญ">
          {ctx.val('สาระสำคัญ', ctx.caseItem?.resultReason || '(เหตุผลที่ไม่ให้พยานได้รับการคุ้มครอง)')}
        </Fill>
        <br />
        <Fill w="55%"> </Fill> จึงมีคำสั่งไม่ให้พยานได้รับการคุ้มครอง
      </LetterParagraph>

      {ctx.draft['แจ้งผลอุทธรณ์'] === 'true' ? <LetterParagraph>คำวินิจฉัยของคณะกรรมการ ป.ป.ท. เป็นที่สุด ปิดขั้นอุทธรณ์แล้ว</LetterParagraph> : <LetterParagraph>
        อนึ่ง ท่านมีสิทธิอุทธรณ์คำสั่งไม่ให้พยานได้รับการคุ้มครอง ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง
        โดยให้ยื่นเป็นคำร้องต่อคณะกรรมการ ป.ป.ท. ทั้งนี้ ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๒๒
      </LetterParagraph>}

      {ctx.draft['แจ้งผลอุทธรณ์'] !== 'true' && ctx.caseItem?.appealDueAt && (
        <div className="pl-12">
          (วันที่ได้รับหนังสือ {docDate(ctx.caseItem.deliveredAt)} · ครบกำหนดยื่นอุทธรณ์{' '}
          {docDate(ctx.caseItem.appealDueAt)})
        </div>
      )}

      <LetterParagraph>จึงเรียนมาเพื่อโปรดทราบ</LetterParagraph>

      <LetterSignOff
        signKey="kb10-secretary"
        sign={ctx.signatures['kb10-secretary'] || derivedSign(ctx.caseItem?.kb10SignedBy, ctx.caseItem?.kb10SignedAt)}
        position={
          <>
            <div>เลขาธิการคณะกรรมการ ป.ป.ท.</div>
            <div>หรือรองเลขาธิการฯ ที่ได้รับมอบหมาย</div>
            <div>หรือ ผอ.สำนักที่ได้รับมอบหมาย</div>
          </>
        }
      />

      <ContactFooter />
    </>
  ),
]

/* ================================================================== *
 * คบ.11 — บันทึกข้อตกลงการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น (3 หน้า)
 * ================================================================== */
const kb11: PageRenderer[] = [
  (ctx) => {
    const forms: string[] = ctx.draft['รูปแบบที่เลือก'] || []
    return (
      <>
        <FormHead
          ctx={ctx}
          title="บันทึกข้อตกลงการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น"
          subtitle="สำนักงาน ป.ป.ท."
        />

        <div className="space-y-1">
          <Row>
            <span className="font-bold w-6">๑.</span>
            <span className="font-bold">ข้าพเจ้า นาย/นาง/นางสาว</span>
            <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow field={'นามสกุลพยาน'}>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <div>
              ได้ยื่นคำร้องขอให้คุ้มครองพยานต่อสำนักงาน ป.ป.ท. และต่อมาสำนักงาน ป.ป.ท. ได้อนุมัติให้ใช้มาตรการ
            </div>
            <Row>
              <span>เบื้องต้นในการคุ้มครองพยานแก่</span>
              <Fill grow field={'ผู้ได้รับการคุ้มครอง'}>{ctx.val('ผู้ได้รับการคุ้มครอง', ctx.caseItem?.person || '')}</Fill>
            </Row>
            <div className="text-justify">
              ตามพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม
              และระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
              พ.ศ. ๒๕๕๔
            </div>
          </div>

          <Row className="pt-1">
            <span className="font-bold w-6">๒.</span>
            <span className="font-bold">ข้อมูลพยาน ชื่อ นาย/นาง นางสาว</span>
            <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>อาชีพ</span>
              <Fill grow field={'อาชีพ'}>{ctx.val('อาชีพ', '')}</Fill>
              <span>สถานภาพ</span>
              <Fill grow field={'สถานภาพ'}>{ctx.val('สถานภาพ', '')}</Fill>
            </Row>
            <Row>
              <span>ชื่อบิดา</span>
              <Fill grow field={'ชื่อบิดา'}>{ctx.val('ชื่อบิดา', '')}</Fill>
              <span>ชื่อมารดา</span>
              <Fill grow field={'ชื่อมารดา'}>{ctx.val('ชื่อมารดา', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน</span>
              <Fill grow field={'ที่อยู่ปัจจุบัน'}>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <Fill grow> </Fill>
              <span>โทรศัพท์</span>
              <Fill grow field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow field={'สถานที่ทำงาน'}>{ctx.val('สถานที่ทำงาน', '')}</Fill>
              <span>โทรศัพท์</span>
              <Fill grow field={'โทรศัพท์ที่ทำงาน'}>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขประจำตัวประชาชน</span>
              <Fill grow field={'เลขบัตรประชาชน'}>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
              <Fill grow field={'เลขบัตรเจ้าหน้าที่รัฐ'}>{ctx.val('เลขบัตรเจ้าหน้าที่รัฐ', '')}</Fill>
              <span>สังกัด</span>
              <Fill grow field={'สังกัด'}>{ctx.val('สังกัด', '')}</Fill>
            </Row>
            <Row>
              <span>วันออกบัตร</span>
              <Fill grow field={'วันออกบัตร'} date>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
              <span>บัตรหมดอายุ</span>
              <Fill grow field={'บัตรหมดอายุ'} date>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
            </Row>
          </div>

          <div className="font-bold pt-1">๓. รูปแบบการคุ้มครองพยาน</div>
          <div className="pl-8 space-y-1 text-justify">
            <CheckLine checked={forms.includes('3.1')}>
              ๓.๑ จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัยให้กับพยานหรือบุคคลอื่นที่มีความสัมพันธ์ใกล้ชิดกับพยานให้ได้รับความปลอดภัยอันเป็นผลมาจากการที่จะมาหรือได้มาเป็นพยาน
            </CheckLine>
            <CheckLine checked={forms.includes('3.2')}>
              ๓.๒ จัดให้พยานอยู่ในสถานที่เหมาะสมอันเป็นที่อยู่อาศัยประจำของพยานหรือของบุคคลอื่นที่พยานไว้วางใจ
              หรือที่ส่วนราชการของสำนักงานซึ่งมีอำนาจหน้าที่เกี่ยวกับการคุ้มครองพยานกำหนด โดยให้พยานได้รับความปลอดภัยมากที่สุด
            </CheckLine>
            <CheckLine checked={forms.includes('3.3')}>
              ๓.๓ ปกปิด และรักษาความลับที่เกี่ยวกับชื่อตัว ชื่อสกุล ที่อยู่ ภาพ หรือข้อมูลอย่างอื่นที่สามารถระบุตัวพยานในการคุ้มครองความปลอดภัยพยาน
            </CheckLine>
            <CheckLine checked={forms.includes('3.4')}>
              ๓.๔ ดำเนินการอื่นใดเพื่อให้พยานได้รับความช่วยเหลือ หรือได้รับการคุ้มครองตามที่เห็นสมควร
              โดยอาจประสานงานกับหน่วยงานอื่นให้การคุ้มครองพยาน
            </CheckLine>
            <div className="pl-6">
              ทั้งนี้ หากเจ้าหน้าที่ผู้ทำหน้าที่คุ้มครองพยาน พิจารณาแล้วหากพฤติการณ์ในคดีเปลี่ยนแปลงไป
              อาจเปลี่ยนแปลงรูปแบบการคุ้มครองพยานได้ตามความเหมาะสม โดยคำนึงถึงความปลอดภัยของพยาน
              และความคุ้มค่าในการใช้จ่ายงบประมาณของทางราชการ เป็นสำคัญ
            </div>
          </div>
        </div>

        <div className="mt-4">
          <SignSlot
            role="พยานผู้รับการคุ้มครอง"
            sign={ctx.signatures['kb11-witness']} signKey="kb11-witness"
            fallbackName={ctx.caseItem?.person}
          />
        </div>
      </>
    )
  },

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold">๔. ระยะเวลาการคุ้มครองพยาน</div>
      <LetterParagraph>
        สำนักงาน ป.ป.ท. จะอนุมัติการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น คราวละไม่เกิน ๓ เดือน
        หากเจ้าหน้าที่ผู้ทำหน้าที่คุ้มครองพยาน พยานผู้ร้องขอ หรือบุคคลอื่นที่มีประโยชน์เกี่ยวข้อง เห็นว่ายังมีความจำเป็น
        และสมควรในการขยายระยะเวลาการคุ้มครองพยานต่อ โดยคำนึงถึงความปลอดภัยของพยาน
        และความคุ้มค่าในการใช้จ่ายงบประมาณของทางราชการเป็นสำคัญ สามารถร้องขอเป็นหนังสือต่อสำนักงาน ป.ป.ท.
        เพื่อขออนุมัติเลขาธิการคณะกรรมการ ป.ป.ท. ทำการคุ้มครองพยาน ต่อไปเป็นคราวๆ คราวละไม่เกิน ๓ เดือน
        แต่ทั้งนี้ต้องไม่เกิน ๖ เดือน
      </LetterParagraph>

      <div className="font-bold pt-1">๕. วิธีการ และเงื่อนไขการคุ้มครองพยาน มีดังต่อไปนี้</div>
      <div className="pl-8 text-justify">
        (วิธีการ และเงื่อนไขการคุ้มครองพยาน เป็นข้อตกลงยินยอมรับการคุ้มครองพยานกับสำนักงาน ป.ป.ท. ตามมาตรการเบื้องต้น
        โดยพยานรับทราบสิทธิที่พึงจะได้รับการคุ้มครองตามกฎหมาย และยินยอมปฏิบัติตามหลักเกณฑ์ ดังกล่าว )
      </div>
      <div className="space-y-0.5 pt-1">
        <Sub>
          ๑. พยานได้รับทราบสิทธิที่พึงจะได้รับตามระเบียบกระทรวงยุติธรรมว่าด้วยค่าตอบแทนและค่าใช้จ่ายแก่พยานฯ
          โดยให้เลขาธิการคณะกรรมการ ป.ป.ท. เป็นผู้พิจารณาในเรื่องค่าใช้จ่ายการคุ้มครองพยานตามความเหมาะสม
        </Sub>
        <Sub>
          ๒. หากพยานต้องการออกเดินทางไปที่ใดๆ หรือต้องการไปปรากฏตัวในที่สาธารณะ เช่น งานสังคมต่างๆ การประชุม
          หรือต้องการติดต่อสื่อสารบุคคลใดๆ พยานจะแจ้งให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองพยานทราบล่วงหน้า
          และได้รับความเห็นชอบจากเจ้าหน้าที่ฯ ก่อน
        </Sub>
        <Sub>
          ๓. การเดินทางออกนอกพื้นที่คุ้มครองพยาน จะกระทำมิได้ เว้นแต่ได้รับความเห็นชอบจากเจ้าหน้าที่ที่คุ้มครองพยานก่อน
          โดยต้องแจ้งความประสงค์ต่อเจ้าหน้าที่คุ้มครองล่วงหน้าอย่างน้อย ๕ วันทำการ
        </Sub>
        <Sub>
          ๔. พยานจะให้ความร่วมมือ และเชื่อฟังคำแนะนำของเจ้าหน้าที่ที่คุ้มครองพยานของสำนักงาน ป.ป.ท.
          หรือหน่วยงานที่ให้ความคุ้มครองแก่พยาน ในเรื่องที่เกี่ยวข้องกับความปลอดภัย และเรื่องอื่นๆ
          ที่อาจทำให้เกิดความเสียหายแก่ตัวของพยาน และผู้เกี่ยวข้องอย่างเคร่งครัด
        </Sub>
        <Sub>
          ๕. พยานจะไม่ทำให้เกิดความเสี่ยงต่อความมั่นคงปลอดภัยของตนเอง และเจ้าหน้าที่ที่ดำเนินการคุ้มครองพยาน
        </Sub>
        <Sub>
          ๖. หากพยานได้รับข่าวสารว่ากำลังถูกปองร้าย หรือมีเหตุอันควรเชื่อว่าจะมีอันตราย หรือมีการเข้ามายุ่งเหยิงกับพยาน
          ต้องแจ้งให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองพยานทราบทันที
        </Sub>
        <Sub>
          ๗. ในกรณีที่มีความจำเป็น พยานยินยอมให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองจัดให้พยานอยู่ในสถานที่ที่ปลอดภัยหรือมีการปกปิด
          มิให้มีการเปิดเผยข้อมูลเกี่ยวกับพยาน ทั้งนี้ ตามความเหมาะสมแก่สถานะและสภาพของพยาน และลักษณะของคดีอาญาที่เกี่ยวข้อง
        </Sub>
        <Sub>
          ๘. ระหว่างการอยู่ในการคุ้มครองของสำนักงาน ป.ป.ท หรือหน่วยงานที่ได้รับมอบหมาย
          หากพยานกระทำการอันเป็นความผิดตามที่กฎหมายบัญญัติ ยกเว้นความผิดโดยประมาทหรือลหุโทษ จะถูกยกเลิกการคุ้มครองพยานทันที
        </Sub>
      </div>

      <div className="mt-4">
        <SignSlot
          role="พยานผู้รับการคุ้มครอง"
          sign={ctx.signatures['kb11-witness']} signKey="kb11-witness"
          fallbackName={ctx.caseItem?.person}
        />
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={3} />
      <Sub>
        ๙. ตามข้อ ๑ การเบิกจ่ายค่าใช้จ่ายในการคุ้มครองพยาน กรณีการเบิกค่าเช่าที่พักอาศัยของพยาน
        ให้เบิกจ่ายตามความเป็นจริง ความเหมาะสม และคำนึงถึงการใช้งบประมาณของทางราชการเป็นสำคัญ
        โดยเจ้าหน้าที่ผู้ทำหน้าที่คุ้มครองพยาน เป็นผู้ประมาณการในเรื่องค่าใช้จ่ายในการคุ้มครองพยาน ผ่านทางผู้อำนวยกอง/สำนัก
        เพื่อให้เลขาธิการคณะกรรมการ ป.ป.ท. พิจารณาอนุมัติ ตามความเป็นจริง
      </Sub>
      <div className="pl-12">ข้อตกลงอื่น ๆ (ระบุรายละเอียดวิธีการ และเงื่อนไขการคุ้มครองพยาน เพิ่มเติม)</div>
      <div className="pl-8 pt-1">
        <DottedRows n={3}>{ctx.val('ข้อตกลงอื่น', '')}</DottedRows>
      </div>

      <div className="font-bold pt-2">๖. การสิ้นสุดการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น</div>
      <Sub>
        ๑. ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
        พ.ศ. ๒๕๕๔ ข้อ ๑๘ (๑)–(๔) และข้อ ๑๙
      </Sub>
      <Sub>
        ๒. เจ้าหน้าที่ที่คุ้มครองพยานมีอำนาจตักเตือนพยาน โดยจัดทำเป็นหนังสือแจ้งให้พยานทราบ กรณี พยานทำผิดวิธีการ
        และเงื่อนไขการคุ้มครองพยาน (ตามข้อ ๕) หากพยานฝ่าฝืนวิธีการและเงื่อนไขการคุ้มครองพยานดังกล่าว ในข้อหนึ่งข้อใดอีก
        ซึ่งพยานได้ทำบันทึกข้อตกลงไว้กับสำนักงาน ป.ป.ท. ถือเป็นเหตุให้การคุ้มครองพยานสิ้นสุดลง
      </Sub>
      <Sub>
        ทั้งนี้ พยานยอมรับว่า หากไม่ปฏิบัติตามเงื่อนไขที่กำหนดข้างต้น อาจเป็นเหตุให้การคุ้มครองพยานตามมาตรการเบื้องต้นสิ้นสุด
        ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปราม
        การทุจริต พ.ศ. ๒๕๕๔ ข้อ ๑๘ และข้อ ๑๙
      </Sub>
      <Sub>
        พยานขอรับรองว่าสำนักงาน ป.ป.ท. มิได้ทำ หรือจัดให้ทำการใด ๆ ซึ่งเป็นการล่อลวง ขู่เข็ญ หรือให้สัญญา
        เพื่อจูงใจให้พยานให้ถ้อยคำใด ๆ และพยาน
        <Fill w="200px" field={'คำรับรองพยาน'}>{ctx.val('คำรับรองพยาน', '')}</Fill>
        ขอรับรองว่าเป็นการบันทึกถ้อยคำที่ถูกต้อง จึงลงลายมือชื่อไว้ต่อเจ้าหน้าที่
      </Sub>

      <div className="mt-6 space-y-4">
        <SignSlot
          role="พยานผู้รับการคุ้มครอง"
          sign={ctx.signatures['kb11-witness']} signKey="kb11-witness"
          fallbackName={ctx.caseItem?.person}
        />
        <SignSlot
          role="ผู้ให้การคุ้มครอง"
          sign={ctx.signatures['kb11-officer']} signKey="kb11-officer"
          fallbackName={ctx.caseItem?.assignedOfficer}
        />
        <SignSlot role="พยาน" sign={ctx.signatures['kb11-attest1']} signKey="kb11-attest1" />
        <SignSlot role="พยาน" sign={ctx.signatures['kb11-attest2']} signKey="kb11-attest2" />
      </div>
    </>
  ),
]

/* ================================================================== *
 * คบ.12 — บันทึกการส่งมอบพยานในคดีการทุจริตในภาครัฐ (2 หน้า)
 * ================================================================== */
const kb12: PageRenderer[] = [
  (ctx) => {
    const persons = ctx.relatedPersons
    return (
      <>
        <FormHead ctx={ctx} title="บันทึกการส่งมอบพยานในคดีการทุจริตในภาครัฐ" />

        <div className="text-right pr-6">สำนักงาน ป.ป.ท.</div>
        <Row className="justify-center mb-2">
          <span>วันที่</span>
          <Fill w="60px" field={'วันที่'}>{ctx.val('วันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px" field={'เดือน'}>{ctx.val('เดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px" field={'พ.ศ.'}>{ctx.val('พ.ศ.', '')}</Fill>
        </Row>

        <div className="space-y-1">
          <Row className="pl-10">
            <span className="font-bold">๑.</span>
            <span>ข้าพเจ้า</span>
            <Fill grow field={'ผู้ส่งมอบ'}>{ctx.val('ผู้ส่งมอบ', ctx.caseItem?.assignedOfficer || '')}</Fill>
          </Row>
          <Row>
            <span>ตำแหน่ง</span>
            <Fill grow field={'ตำแหน่งผู้ส่งมอบ'}>{ctx.val('ตำแหน่งผู้ส่งมอบ', '')}</Fill>
            <span>สังกัดสำนักงาน ป.ป.ท. ซึ่งได้ดำเนินการให้ความคุ้มครองพยาน</span>
          </Row>
          <Row>
            <span>ขอส่งมอบพยาน และ/หรือ บุคคลซึ่งมีความสัมพันธ์ใกล้ชิดกับพยาน ให้กับ</span>
            <Fill w="70px"> </Fill>
            <span>(ระบุหน่วยงาน)</span>
            <Fill grow field={'หน่วยงานผู้รับมอบ'}>
              {ctx.val('หน่วยงานผู้รับมอบ', ctx.caseItem?.transferRequest?.agency || '')}
            </Fill>
          </Row>
          <Row>
            <Fill grow> </Fill>
            <span>เพื่อดำเนินการคุ้มครองพยานให้ได้รับความปลอดภัย</span>
          </Row>
          <Row>
            <span>จำนวน</span>
            <Fill w="90px" field={'จำนวนคน'}>{ctx.val('จำนวนคน', String(persons.length + 1))}</Fill>
            <span>คน ดังมีรายชื่อต่อไปนี้</span>
          </Row>

          <div className="pl-12 pt-1">๑.๑ พยาน</div>
          <div className="pl-20 space-y-1">
            {['1.1.1', '1.1.2', '1.1.3'].map((n, i) => (
              <div key={n} className="flex items-baseline gap-1">
                <span className="w-14">{toThaiDigits(n)}</span>
                <span>ชื่อ</span>
                <Fill grow>{i === 0 ? ctx.val('ชื่อพยาน', ctx.caseItem?.person || '') : ''}</Fill>
                <span>นามสกุล</span>
                <Fill grow>{i === 0 ? ctx.val('นามสกุลพยาน', '') : ''}</Fill>
              </div>
            ))}
          </div>

          <div className="pl-12 pt-1">๑.๒ บุคคลซึ่งมีความสัมพันธ์ใกล้ชิดกับพยาน</div>
          <div className="pl-20 space-y-1">
            {['1.2.1', '1.2.2', '1.2.3'].map((n, i) => {
              const p = persons[i]
              return (
                <div key={n} className="flex items-baseline gap-1">
                  <span className="w-14">{toThaiDigits(n)}</span>
                  <span>ชื่อ</span>
                  <Fill grow>{p ? `${p.title}${p.firstName}` : ''}</Fill>
                  <span>นามสกุล</span>
                  <Fill grow>{p?.lastName || ''}</Fill>
                </div>
              )
            })}
          </div>

          <div className="pl-12 pt-1">
            ๒. ในระหว่างการคุ้มครองพยาน ให้บุคคลหรือหน่วยงานที่มีภารกิจเกี่ยวข้องในการคุ้มครอง
          </div>
          <div>พยาน ประสานงานหรือติดต่อระหว่างกัน ดังนี้</div>

          {['2.1', '2.2'].map((n, i) => (
            <div key={n} className="space-y-1 pt-1">
              <Row className="pl-12">
                <span>{toThaiDigits(n)} (ระบุชื่อนามสกุล ตำแหน่ง สังกัด)</span>
                <Fill grow field={`ผู้ประสาน${i + 1}`}>{ctx.val(`ผู้ประสาน${i + 1}`, '')}</Fill>
                <span>หมายเลขโทรศัพท์</span>
              </Row>
              <Row>
                <span>(ที่ทำงาน)</span>
                <Fill grow field={`ผู้ประสานโทรที่ทำงาน${i + 1}`}>{ctx.val(`ผู้ประสานโทรที่ทำงาน${i + 1}`, '')}</Fill>
                <span>โทรศัพท์ (เคลื่อนที่)</span>
                <Fill grow field={`ผู้ประสานมือถือ${i + 1}`}>{ctx.val(`ผู้ประสานมือถือ${i + 1}`, '')}</Fill>
              </Row>
              <Row>
                <span>โทรสาร</span>
                <Fill grow field={`ผู้ประสานโทรสาร${i + 1}`}>{ctx.val(`ผู้ประสานโทรสาร${i + 1}`, '')}</Fill>
                <span>{i === 0 ? 'ในฐานะผู้ส่งมอบพยาน' : 'ในฐานะผู้รับมอบพยาน'}</span>
              </Row>
            </div>
          ))}
        </div>

        <SignRow>
          <SignSlot
            role="ผู้ส่งมอบพยาน"
            sign={derivedSign(
              ctx.caseItem?.transferRequest?.requestedBy,
              ctx.caseItem?.transferRequest?.requestedAt
            )}
            fallbackName={ctx.caseItem?.assignedOfficer}
            showPosition
            position={ctx.val('ตำแหน่งผู้ส่งมอบ', '')}
          />
          <SignSlot
            role="ผู้รับมอบพยาน"
            sign={derivedSign(
              ctx.caseItem?.transferRequest?.agency,
              ctx.caseItem?.transferRequest?.handoverAt
            )}
            showPosition
            position={ctx.val('ตำแหน่งผู้รับมอบ', '')}
          />
          <SignSlot role="พยานผู้ส่งมอบ" sign={ctx.signatures['kb12-attest-sender']} signKey="kb12-attest-sender" />
          <SignSlot role="พยานผู้รับมอบ" sign={ctx.signatures['kb12-attest-receiver']} signKey="kb12-attest-receiver" />
        </SignRow>
      </>
    )
  },

  (ctx) => {
    const events = ctx.caseItem?.importantEvents || []
    const rows = Array.from({ length: 4 }, (_, i) => events[i])
    return (
      <>
        <div className="text-center font-bold mb-3">รายงานการปฏิบัติหน้าที่ของเจ้าหน้าที่คุ้มครองพยาน</div>
        <table className="w-full border border-slate-700 border-collapse">
          <thead>
            <tr className="text-center">
              <th className="border border-slate-700 py-1.5 px-1 w-[16%]">วัน เดือน ปี</th>
              <th className="border border-slate-700 py-1.5 px-1 w-[32%]">การปฏิบัติหน้าที่/สถานการณ์ที่เกิดขึ้น</th>
              <th className="border border-slate-700 py-1.5 px-1 w-[18%]">
                ลายมือชื่อ
                <br />
                เจ้าหน้าที่คุ้มครองพยาน
              </th>
              <th className="border border-slate-700 py-1.5 px-1 w-[16%]">
                ลายมือชื่อ
                <br />
                พยาน
              </th>
              <th className="border border-slate-700 py-1.5 px-1 w-[18%]">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={i} className="align-top">
                <td className="border border-slate-700 py-3 px-1 text-center h-28">
                  {e ? e.date : '..../...../....'}
                </td>
                <td className="border border-slate-700 py-3 px-2">
                  <DottedRows n={4}>{e ? `${e.title} — ${e.detail}` : undefined}</DottedRows>
                </td>
                <td className="border border-slate-700" />
                <td className="border border-slate-700" />
                <td className="border border-slate-700" />
              </tr>
            ))}
          </tbody>
        </table>
      </>
    )
  },
]

/* ================================================================== *
 * คบ.13 — รายงานผลการปฏิบัติการคุ้มครองพยาน (1 หน้า, ไม่มีตรา)
 * ================================================================== */
const kb13: PageRenderer[] = [
  (ctx) => {
    const reports = ctx.caseItem?.monthlyReports || []
    const latest = reports[reports.length - 1]
    return (
      <>
        <FormHead ctx={ctx} seal={false} title="รายงานผลการปฏิบัติการคุ้มครองพยาน" />

        <Row className="justify-center">
          <span>คุ้มครองพยานคดี</span>
          <Fill w="110px" field={'เลขคดี'}>{ctx.val('เลขคดี', ctx.caseItem?.no || '')}</Fill>
          <span>/</span>
          <Fill w="110px" field={'ปีคดี'}>{ctx.val('ปีคดี', '')}</Fill>
        </Row>
        <Row className="justify-center mt-2 mb-6">
          <span>ตั้งแต่วันที่</span>
          <Fill w="130px">{docDate(ctx.caseItem?.actualStartedAt)}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="150px">{docDate(ctx.caseItem?.protectionEndAt)}</Fill>
        </Row>

        <div className="space-y-1">
          <Row>
            <span>สำนัก/กอง</span>
            <Fill w="45%" field={'สำนักกอง'}>{ctx.val('สำนักกอง', '')}</Fill>
          </Row>
          <div className="font-bold">๑. ข้อมูลพยาน</div>
          <div className="pl-8 space-y-1">
            <Row>
              <span>ชื่อ นาย/นาง/นางสาว/อื่นๆ</span>
              <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            </Row>
            <Row>
              <span>อาชีพ</span>
              <Fill grow field={'อาชีพ'}>{ctx.val('อาชีพ', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow field={'สถานที่ทำงาน'}>{ctx.val('สถานที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน</span>
              <Fill grow field={'ที่อยู่ปัจจุบัน'}>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <span>โทรศัพท์</span>
              <Fill grow field={'เบอร์โทรศัพท์'}>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
          </div>

          <Row>
            <span className="font-bold">๒ เจ้าหน้าที่ที่ดำเนินการคุ้มครอง จำนวน</span>
            <Fill w="110px" field={'จำนวนเจ้าหน้าที่'}>{ctx.val('จำนวนเจ้าหน้าที่', '')}</Fill>
            <span>ราย ดังนี้</span>
          </Row>
          <div className="pl-10 space-y-1">
            {['(1)', '(2)', '(3)', '(4)', '(5)'].map((n, i) => (
              <div key={n} className="flex items-baseline gap-1">
                <span className="w-8">{toThaiDigits(n)}</span>
                <span>นาย/นาง/นางสาว</span>
                <Fill grow field={`ชุดชื่อ${i + 1}`}>{ctx.val(`ชุดชื่อ${i + 1}`, '')}</Fill>
                <span>นามสกุล</span>
                <Fill grow field={`ชุดนามสกุล${i + 1}`}>{ctx.val(`ชุดนามสกุล${i + 1}`, '')}</Fill>
                <span>ตำแหน่ง</span>
                <Fill grow field={`ชุดตำแหน่ง${i + 1}`}>{ctx.val(`ชุดตำแหน่ง${i + 1}`, '')}</Fill>
              </div>
            ))}
          </div>

          <Row>
            <span className="font-bold">๓. ตามคำสั่ง</span>
            <Fill w="200px" field={'เลขคำสั่ง'}>{ctx.val('เลขคำสั่ง', ctx.caseItem?.decisionNumber || '')}</Fill>
            <span>ลงวันที่</span>
            <Fill w="200px" field={'คำสั่งลงวันที่'} date>{beDate(ctx.val('คำสั่งลงวันที่', ctx.caseItem?.resultAt || ''))}</Fill>
          </Row>
          <Row>
            <span className="font-bold">๔. ระยะเวลาให้การคุ้มครอง จำนวน</span>
            <Fill w="130px" field={'จำนวนวัน'}>{ctx.val('จำนวนวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
            <span>วัน</span>
          </Row>
          <div className="font-bold">
            ๕. สรุปผลการดำเนินการ{latest ? ` (งวด ${thaiMonthName(latest.period)})` : ''}
          </div>
          <DottedRows n={3}>{ctx.val('สรุปผลการปฏิบัติงาน', latest?.summary || '')}</DottedRows>
        </div>
      </>
    )
  },
]

/* ================================================================== *
 * คบ.14 — หนังสือขยายระยะเวลาการคุ้มครองพยาน (1 หน้า)
 * ================================================================== */
const kb14: PageRenderer[] = [
  (ctx) => {
    const requests = ctx.caseItem?.extensionRequests || []
    const latest = requests[requests.length - 1]
    return (
      <>
        <FormHead ctx={ctx} title="หนังสือขยายระยะเวลาการคุ้มครองพยาน" />

        <div className="space-y-1">
          <Row>
            <span className="font-bold w-6">1.</span>
            <span className="font-bold">ข้าพเจ้า นาย / นาง / นางสาว</span>
            <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow field={'นามสกุลพยาน'}>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>พยานในคดีหมายเลข ที่</span>
              <Fill grow field={'เลขคดี'}>{ctx.val('เลขคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
              <span>ซึ่งสำนักงาน ป.ป.ท. ได้อนุมัติให้ใช้มาตรการทั่วไปในการ</span>
            </Row>
            <div className="text-justify">
              คุ้มครองพยานเบื้องต้น โดยอาศัยอำนาจตามพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
              พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม และระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
              ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔
            </div>
            <Row>
              <span>ตั้งแต่วันที่</span>
              <Fill w="80px" field={'เริ่มวันที่'}>{ctx.val('เริ่มวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="110px" field={'เริ่มเดือน'}>{ctx.val('เริ่มเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="70px" field={'เริ่มพ.ศ.'}>{ctx.val('เริ่มพ.ศ.', '')}</Fill>
              <span>ถึง</span>
            </Row>
            <Row>
              <span>วันที่</span>
              <Fill w="70px" field={'ถึงวันที่'}>{ctx.val('ถึงวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="120px" field={'ถึงเดือน'}>{ctx.val('ถึงเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="70px" field={'ถึงพ.ศ.'}>{ctx.val('ถึงพ.ศ.', '')}</Fill>
              <span>รวมระยะเวลาในการคุ้มครองพยาน</span>
              <Fill w="70px" field={'รวมปี'}>{ctx.val('รวมปี', '')}</Fill>
              <span>ปี</span>
              <Fill w="70px" field={'รวมเดือน'}>{ctx.val('รวมเดือน', '')}</Fill>
              <span>เดือน</span>
            </Row>
            <Row>
              <Fill w="120px" field={'รวมวัน'}>{ctx.val('รวมวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
              <span>
                วัน และบัดนี้การคุ้มครองพยานได้สิ้นสุดลง พยานดังกล่าวได้ร้องขอขยายระยะเวลา
              </span>
            </Row>
            <div>การคุ้มครองพยานต่อไป</div>
          </div>

          <div className="font-bold pt-2">๒. ข้อพิจารณาและเหตุผลในการขยายระยะเวลาการคุ้มครองพยาน</div>
          <div className="pl-8">
            <DottedRows n={4}>{ctx.val('เหตุผลขยายเวลา', latest?.reason || '')}</DottedRows>
          </div>

          <Row className="pt-2">
            <span className="font-bold">๓. มติที่ประชุมคณะอนุกรรมการกลั่นกรอง ครั้งที่</span>
            <Fill w="80px" field={'ครั้งที่'}>{ctx.val('ครั้งที่', '')}</Fill>
            <span>/</span>
            <Fill w="90px" field={'ปีครั้งที่'}>{ctx.val('ปีครั้งที่', '')}</Fill>
            <span>เมื่อวันที่</span>
            <Fill w="70px" field={'มติวันที่'}>{ctx.val('มติวันที่', '')}</Fill>
            <span>เดือน</span>
            <Fill w="100px" field={'มติเดือน'}>{ctx.val('มติเดือน', '')}</Fill>
            <span>พ.ศ.</span>
            <Fill w="60px" field={'มติพ.ศ.'}>{ctx.val('มติพ.ศ.', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>ควรให้พยาน ชื่อ นาย/นาง/นางสาว</span>
              <Fill grow field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
              <span>นามสกุล</span>
              <Fill grow field={'นามสกุลพยาน'}>{ctx.val('นามสกุลพยาน', '')}</Fill>
            </Row>
            <Row>
              <span>เข้ารับการคุ้มครองพยานครั้งที่</span>
              <Fill grow field={'คุ้มครองครั้งที่'}>{ctx.val('คุ้มครองครั้งที่', String(requests.length + 1))}</Fill>
              <span>ต่อไป นับตั้งแต่วันที่</span>
              <Fill w="70px" field={'ขยายเริ่มวันที่'}>{ctx.val('ขยายเริ่มวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="100px" field={'ขยายเริ่มเดือน'}>{ctx.val('ขยายเริ่มเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="80px" field={'ขยายเริ่มพ.ศ.'}>{ctx.val('ขยายเริ่มพ.ศ.', '')}</Fill>
            </Row>
            <Row>
              <span>ถึงวันที่</span>
              <Fill w="80px" field={'ขยายถึงวันที่'}>{ctx.val('ขยายถึงวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="140px" field={'ขยายถึงเดือน'}>{ctx.val('ขยายถึงเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="90px" field={'ขยายถึงพ.ศ.'}>{ctx.val('ขยายถึงพ.ศ.', '')}</Fill>
            </Row>
            <Row>
              <span>รวมระยะเวลาในการขอขยายการคุ้มครองพยาน</span>
              <Fill w="120px" field={'ขยายเดือน'}>{ctx.val('ขยายเดือน', '')}</Fill>
              <span>เดือน</span>
              <Fill w="130px" field={'ขยายวัน'}>{ctx.val('ขยายวัน', String(latest?.durationDays || ''))}</Fill>
              <span>วัน</span>
            </Row>
          </div>

          <div className="font-bold pt-2">๔. ความเห็นของเลขาธิการคณะกรรมการ ป.ป.ท.</div>
          <div className="pl-8">
            <DottedRows n={2}>
              {ctx.val(
                'ความเห็นเลขาธิการ',
                latest?.decisionNote ||
                  (latest?.status === 'approved'
                    ? `อนุมัติให้ขยายระยะเวลาการคุ้มครอง ${toThaiDigits(latest.durationDays)} วัน`
                    : '')
              )}
            </DottedRows>
          </div>

          <div className="font-bold pt-2">๕. เงื่อนไขการปฏิบัติตามคำสั่ง</div>
          <div className="pl-8">
            <DottedRows n={3}>{ctx.val('เงื่อนไขปฏิบัติ', '')}</DottedRows>
          </div>
        </div>

        <div className="mt-6 text-center">
          <SignSlot
            role="พยานผู้รับการคุ้มครอง"
            sign={ctx.signatures['kb14-witness']} signKey="kb14-witness"
            fallbackName={ctx.caseItem?.person}
          />
          <div>
            <span className="official-dotted-fill px-3">{ctx.val('ลงวัน', '')}</span>/
            <span className="official-dotted-fill px-3">{ctx.val('ลงเดือน', '')}</span>/
            <span className="official-dotted-fill px-3">{ctx.val('ลงปี', '')}</span>
          </div>
        </div>
      </>
    )
  },
]


/* ================================ คบ.15 ================================ *
 * รายงานการให้ความคุ้มครองพยานสิ้นสุด — เสนอตามลำดับชั้นก่อนออกคำสั่ง คบ.16
 * เอกสารฉบับนี้ยังไม่ทำให้การคุ้มครองสิ้นสุด (flow WIT1130)
 * ---------------------------------------------------------------------- */
const kb15: PageRenderer[] = [
  /*
   * ตาม Word/ภาพต้นฉบับ แบบ คบ.๑๕ เป็นบันทึกข้อความ 2 หน้า
   * key เดิม (ชื่อพยาน, เลขคดี, เหตุยุติ, ความเห็นลำดับชั้น) วางในตำแหน่งที่ต้นฉบับมีช่องตรงกัน
   * ส่วน เลขคำร้อง/คำสั่งเดิม/วันเริ่มจริง/วันสะสม/สรุปผล/เอกสารแนบ ไม่มีช่องในต้นฉบับ จึงไม่พิมพ์บนกระดาษ (ข้อมูลร่างยังอยู่)
   */
  (ctx) => {
    const kb15 = ctx.caseItem?.kb15
    return (
      <>
        <MemoHead ctx={ctx} subject="รายงานการให้ความคุ้มครองพยานสิ้นสุด" to="เลขาธิการคณะกรรมการ ป.ป.ท." />

        <LetterParagraph indent>
          ตามที่ นาย/นาง/นางสาว{' '}
          <Fill w="220px" field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>{' '}
          ได้ร้องขอให้สำนักงาน ป.ป.ท. คุ้มครองพยาน และเลขาธิการคณะกรรมการ ป.ป.ท. ได้อนุมัติให้ใช้มาตรการในการคุ้มครองพยานเบื้องต้น
          ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้น
          ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ คดีระหว่าง{' '}
          <Fill w="150px" field={'ผู้กล่าวหา'}>{ctx.val('ผู้กล่าวหา', '')}</Fill> ผู้กล่าวหา กับ{' '}
          <Fill w="150px" field={'ผู้ถูกกล่าวหา'}>{ctx.val('ผู้ถูกกล่าวหา', '')}</Fill> ผู้ถูกกล่าวหา กรณี{' '}
          <Fill w="90px" field={'กรณี'}>{ctx.val('กรณี', '')}</Fill> (ให้ระบุกรณีข้อกล่าวหา/ร้องเรียน) ตามเรื่องกล่าวหาที่{' '}
          <Fill w="120px" field={'เลขคดี'}>{ctx.val('เลขคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>{' '}
          ให้คุ้มครองพยาน/ บุคคล ที่เกี่ยวข้อง ได้แก่
        </LetterParagraph>
        {[1, 2].map((n) => (
          <div key={n}>
            <Row className="pl-[4.5rem]">
              <span>{toThaiDigits(n)}. ชื่อ-สกุล</span>
              <Fill grow field={`บุคคล${n}`}>{ctx.val(`บุคคล${n}`, '')}</Fill>
              <span>ที่อยู่</span>
              <Fill grow field={`บุคคลที่อยู่${n}`}>{ctx.val(`บุคคลที่อยู่${n}`, '')}</Fill>
            </Row>
            <DottedRows n={1} />
          </div>
        ))}
        <div className="text-center">ฯลฯ</div>

        <LetterParagraph indent>
          บัดนี้ <Fill w="90px" field={'เหตุยุติ'}>{kb15?.status !== 'returned' && kb15?.formSnapshot ? terminationReasonText(kb15) : [ctx.val('ข้อระเบียบ', ''), ctx.val('เหตุยุติ', ''), ctx.val('ข้อเท็จจริง', ''), ctx.val('สรุปผล', '')].filter(Boolean).join(' · ')}</Fill>{' '}
          (เหตุผลที่ทำให้ความจำเป็นในการคุ้มครองพยานสิ้นสุดหรือยุติลง ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔ ข้อ ๑๘,ข้อ ๑๙
        </LetterParagraph>
        <LetterParagraph>
          ชุดปฏิบัติการมีความเห็นว่า ไม่มีความจำเป็นที่จะให้ความคุ้มครองพยานอีกต่อไป หากเห็นชอบขอได้โปรด
          มีคำสั่งให้การคุ้มครองพยานสิ้นสุดลง ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
          ว่าด้วยมาตรการคุ้มครองเบื้องต้น ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔ (ข้อ ๑๘, ข้อ ๑๙ (ตามพฤติการณ์ที่เกิดขึ้น)) ทั้งนี้ ให้สิ้นสุดการคุ้มครองตั้งแต่วันที่{' '}
          <Fill w="210px" field={'วันที่เสนอให้สิ้นสุด'} date>{beDate(ctx.val('วันที่เสนอให้สิ้นสุด', kb15?.proposedEndAt || ''))}</Fill> เป็นต้นไป
        </LetterParagraph>
        <div className="pl-[4.5rem]">จึงเรียนมาเพื่อโปรดพิจารณา</div>

        <div className="mt-8 ml-auto w-[22rem]">
          <SignSlot prefix="(ลงชื่อ)" role="หัวหน้าชุดปฏิบัติการ" sign={ctx.signatures['kb15-officer']} signKey="kb15-officer" fallbackName={kb15?.headSignature?.signerName} />
          <div>(ตำแหน่ง) .........................................</div>
        </div>
      </>
    )
  },
  (ctx) => {
    const kb15 = ctx.caseItem?.kb15
    /** ลงนามตามลำดับชั้น ผอ.กอง/สำนัก → รองเลขาธิการ → เลขาธิการ — อ่านจากความเห็นที่เห็นชอบของฉบับนี้ */
    const signed = (role: 'supervisor' | 'director' | 'deputy_secretary' | 'secretary') =>
      kb15?.approvalHistory?.filter((h) => h.role === role && h.endorsed).at(-1)
    const opinions: { label: string; key: string; signKey: string; sign?: SignatureRecord; name?: string; note?: string }[] = [
      { label: 'ความเห็นผู้บังคับบัญชาชั้นต้น', key: 'ความเห็นผู้บังคับบัญชาชั้นต้น', signKey: 'kb15-supervisor', sign: ctx.signatures['kb15-supervisor'] || (signed('supervisor') ? { signed: true, signerName: signed('supervisor')!.by, signedAt: signed('supervisor')!.at } : undefined), name: signed('supervisor')?.by, note: signed('supervisor')?.note },
      { label: 'ความเห็นผู้อำนวยการกอง/สำนักงาน', key: 'ความเห็นลำดับชั้น', signKey: 'kb15-director', sign: ctx.signatures['kb15-director'] || (signed('director') ? { signed: true, signerName: signed('director')!.by, signedAt: signed('director')!.at } : undefined), name: signed('director')?.by, note: signed('director')?.note },
      { label: 'ความเห็นรองเลขาธิการฯ', key: 'ความเห็นรองเลขาธิการ', signKey: 'kb15-deputy_secretary', sign: ctx.signatures['kb15-deputy_secretary'] || (signed('deputy_secretary') ? { signed: true, signerName: signed('deputy_secretary')!.by, signedAt: signed('deputy_secretary')!.at } : undefined), name: signed('deputy_secretary')?.by, note: signed('deputy_secretary')?.note },
      { label: 'ความเห็นเลขาธิการฯ', key: 'ความเห็นเลขาธิการ', signKey: 'kb15-secretary', sign: ctx.signatures['kb15-secretary'] || (signed('secretary') ? { signed: true, signerName: signed('secretary')!.by, signedAt: signed('secretary')!.at } : undefined), name: signed('secretary')?.by, note: signed('secretary')?.note },
    ]
    return (
      <>
        <PageNumber page={2} />
        {opinions.map((o) => (
          <div key={o.key} className="pt-6">
            <Row className="pl-[4.5rem]">
              <span className="font-bold">{o.label}</span>
              <Fill grow field={o.key}>{ctx.caseItem ? o.note || '' : ctx.val(o.key, '')}</Fill>
            </Row>
            <DottedRows n={1} />
            <div className="mt-8 ml-auto w-[22rem]">
              <SignSlot prefix="(ลงชื่อ)" sign={o.sign} signKey={o.signKey} fallbackName={o.name} />
              <div>(ตำแหน่ง) {kb6SignerPosition(o.sign?.signerName || o.name || '') || '.........................................'}</div>
            </div>
          </div>
        ))}
      </>
    )
  },
]

/* ================================ คบ.16 ================================ *
 * คำสั่งยุติการให้ความคุ้มครองพยาน — แยก "วันที่ออกคำสั่ง" กับ "วันที่มีผล"
 * ---------------------------------------------------------------------- */
const kb16: PageRenderer[] = [
  /*
   * ตาม Word/ภาพต้นฉบับ แบบ คบ.๑๖ "เรื่อง การให้ความคุ้มครองพยานสิ้นสุด"
   * key เดิม: ชื่อพยาน, เหตุยุติ, วันที่มีผล (ทั้งนี้ ตั้งแต่วันที่), วันที่ออกคำสั่ง (สั่ง ณ วันที่)
   * คำสั่งเดิม/วันหยุดปฏิบัติ ไม่มีช่องในต้นฉบับ จึงไม่พิมพ์บนกระดาษ (ข้อมูลร่างยังอยู่)
   */
  (ctx) => {
    const kb16 = ctx.caseItem?.kb16
    const witness = <Fill w="180px" field={'ชื่อพยาน'}>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
    return (
      <>
        <OrderHead
          ctx={ctx}
          orderTitle="คำสั่งสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ"
          subject="การให้ความคุ้มครองพยานสิ้นสุด"
        />
        <LetterParagraph indent>
          ตามที่ <Fill w="160px" field={'ผู้ร้อง'}>{ctx.val('ผู้ร้อง', '')}</Fill> (ผู้ร้อง) ได้ร้องขอให้สำนักงาน ป.ป.ท. ทำการคุ้มครอง
          ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้น
          ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ และ
          เลขาธิการคณะกรรมการ ป.ป.ท. ได้อนุมัติให้คุ้มครอง {witness} (ชื่อ –ชื่อสกุล พยาน)
          ตามมาตรการ ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. ๒๕๕๔ ตั้งแต่วันที่ <Fill w="50px" field={'เริ่มวันที่'}>{ctx.val('เริ่มวันที่', '')}</Fill> เดือน{' '}
          <Fill w="100px" field={'เริ่มเดือน'}>{ctx.val('เริ่มเดือน', '')}</Fill> พ.ศ.{' '}
          <Fill w="60px" field={'เริ่มพ.ศ.'}>{ctx.val('เริ่มพ.ศ.', '')}</Fill> นั้น
        </LetterParagraph>
        <LetterParagraph indent>
          บัดนี้ <Fill w="90px" field={'เหตุยุติ'}>{ctx.val('เหตุยุติ', kb16?.reason || '')}</Fill>{' '}
          ให้เหตุผลที่ทำให้ความจำเป็นในการคุ้มครองพยานสิ้นสุดลงตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมาย
          ว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๑๘)
        </LetterParagraph>
        <LetterParagraph>
          ฉะนั้น อาศัยอำนาจตามความในมาตรา ๕๑ แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริตในภาครัฐ
          พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม ประกอบระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้น
          ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๑๘
          จึงมีคำสั่งให้การคุ้มครองพยานตามมาตรการทั่วไปสิ้นสุดลง
        </LetterParagraph>
        {/* คงข้อความแจ้งสิทธิใน คบ.16 ตามต้นฉบับลูกค้า */}
        {(
          <LetterParagraph indent>
            อนึ่ง {witness} (ชื่อ –ชื่อสกุล พยาน) มีสิทธิอุทธรณ์คำสั่งภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่งโดยให้ยื่นเป็นคำร้องต่อคณะกรรมการ ป.ป.ท.
          </LetterParagraph>
        )}
        <Row className="pl-[4.5rem]">
          <span>ทั้งนี้ ตั้งแต่วันที่</span>
          <Fill w="200px" field={'วันที่มีผล'} date>{beDate(ctx.val('วันที่มีผล', kb16?.effectiveAt || ''))}</Fill>
          <span>เป็นต้นไป</span>
        </Row>
        <Row className="pl-[6.5rem]">
          <span>สั่ง ณ วันที่</span>
          <Fill w="200px" field={'วันที่ออกคำสั่ง'} date>{beDate(ctx.val('วันที่ออกคำสั่ง', kb16?.issuedAt || ''))}</Fill>
        </Row>
        <div className="mt-8 ml-auto mr-16 w-72 text-center">
          <div className="text-left">(ลงชื่อ)<SignatureInk sign={ctx.signatures['kb16-authority']} signKey="kb16-authority" /></div>
          <div>({ctx.signatures['kb16-authority']?.signerName || kb16?.signedBy || '.........................................'})</div>
          <div>เลขาธิการคณะกรรมการ ป.ป.ท.</div>
        </div>
      </>
    )
  },
]

/* ================================ คบ.17 ================================ *
 * หนังสือแจ้งคำสั่งการให้ความคุ้มครองพยานสิ้นสุด — ตรวจจาก Word ลูกค้า
 * ---------------------------------------------------------------------- */
const kb17: PageRenderer[] = [
  (ctx) => {
    const kb16 = ctx.caseItem?.kb16
    return (
      <>
        <LetterHead
          ctx={ctx}
          subject="แจ้งคำสั่งการให้ความคุ้มครองพยานสิ้นสุด"
          to={<span className="underline decoration-dotted">ผู้ยื่นร้องขอคุ้มครองพยาน</span>}
          reference={
            ctx.caseItem ? ctx.caseItem.kb15?.regulationClause === 1 ? `คำร้องขอยุติการคุ้มครองพยาน ${ctx.caseItem.kb15.triggerRef || ''}` : undefined : <span>คำร้องขอยุติการคุ้มครองพยาน/กรณีเจ้าหน้าที่เห็นเองไม่ต้องใส่อ้างถึง</span>
          }
        />
        <LetterParagraph indent>
          ตามที่ ท่านได้ร้องขอให้สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
          ดำเนินการคุ้มครองแก่ <span className="underline decoration-dotted">พยาน / บุคคลที่เกี่ยวข้อง</span> และสำนักงาน ป.ป.ท.
          ได้อนุมัติให้ใช้มาตรการคุ้มครองพยานเบื้องต้น ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
          ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ นั้น
        </LetterParagraph>
        <LetterParagraph indent>
          บัดนี้ <span className="underline decoration-dotted">(เหตุผลที่ทำให้ความจำเป็นในการคุ้มครองพยานสิ้นสุด
          ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของ
          ฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๑๘)</span>{' '}
          <Fill grow field={'เหตุยุติ'}>{ctx.val('เหตุยุติ', kb16?.reason || '')}{kb16?.orderNo ? ` ตามคำสั่งที่ ${kb16.orderNo} ลงวันที่ ${beDate(kb16.issuedAt || '')} มีผลตั้งแต่ ${beDate(kb16.effectiveAt || '')}` : ''}</Fill> จึงมีคำสั่งให้ความคุ้มครองพยานสิ้นสุด
        </LetterParagraph>
        {/*
         * FB-029 — ต้นฉบับกำกับว่า "ใส่เรื่องการแจ้งสิทธิอุทธรณ์เฉพาะกรณีเมื่อเลขาธิการสั่งให้ยุติการคุ้มครองตามข้อ ๑๙"
         * จึงพิมพ์ย่อหน้านี้เฉพาะเหตุข้อ 18 (4) · แบบเปล่า (ไม่มีแฟ้ม) คงย่อหน้าพร้อมคำกำกับเดิม
         */}
        {!ctx.caseItem ? (
          <LetterParagraph indent>
            อนึ่ง ท่านมีสิทธิอุทธรณ์คำสั่งให้ความคุ้มครองพยานสิ้นสุด ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง
            โดยให้ยื่นเป็นคำร้องต่อคณะกรรมการ ป.ป.ท. ทั้งนี้ ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
            ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๒๒{' '}
            <span className="underline decoration-dotted">(ใส่เรื่องการแจ้งสิทธิอุทธรณ์เฉพาะกรณีเมื่อเลขาธิการสั่งให้ยุติการคุ้มครองตามข้อ ๑๙
            ของระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและ
            ปราบปรามการทุจริต พ.ศ. ๒๕๕๔)</span>
          </LetterParagraph>
        ) : showKb17AppealNotice(ctx.caseItem) ? (
          <LetterParagraph indent>
            อนึ่ง ท่านมีสิทธิอุทธรณ์คำสั่งให้ความคุ้มครองพยานสิ้นสุด ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง
            โดยให้ยื่นเป็นคำร้องต่อคณะกรรมการ ป.ป.ท. ทั้งนี้ ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
            ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. ๒๕๕๔ ข้อ ๒๒
          </LetterParagraph>
        ) : null}
        <LetterParagraph indent>จึงเรียนมาเพื่อโปรดทราบ</LetterParagraph>

        <LetterSignOff
          sign={ctx.signatures['kb17-signer']} signKey="kb17-signer" showPrintedName
          name={ctx.val('ผู้ลงนาม', ctx.caseItem?.kb17?.signedBy || '')}
          position={
            <>
              <div>เลขาธิการคณะกรรมการ ป.ป.ท.</div>
              <div>หรือรองเลขาธิการฯ ที่ได้รับมอบหมาย</div>
              <div>หรือ ผอ.สำนักที่ได้รับมอบหมาย</div>
            </>
          }
        />

        <ContactFooter />
      </>
    )
  },
]

/* ================================ หนังสือส่งกรมคุ้มครองสิทธิฯ (แบบที่ 18) ================================ *
 * หนังสือแจ้งให้มีมาตรการช่วยเหลือแก่พยาน ส่งหัวหน้าหน่วยงานปลายทางข้อ 14 (ค่าตั้งต้นอธิบดีกรมคุ้มครองสิทธิและเสรีภาพ)
 * ใช้แทน คบ.3 ในเส้นทางข้อ 14 — ไม่มีป้าย "แบบ ..." มุมขวาบนตามต้นฉบับ
 * ---------------------------------------------------------------------- */

/** วันที่แบบหนังสือราชการ "๑๕ กรกฎาคม ๒๕๖๖" — ไม่ใช่วันที่ที่อ่านได้ให้เป็นค่าว่าง (เส้นประ) */
const letterLongDate = (value?: string, withDay = true): string => {
    const date = parseAnyDate(value)
    if (!date) return ''
    const monthYear = thaiMonthName(`${date.getMonth() + 1}/${date.getFullYear() + 543}`)
    return toThaiDigits(withDay ? `${date.getDate()} ${monthYear}` : monthYear)
}

const a14Letter: PageRenderer[] = [
    (ctx) => (
        <>
            <div className="text-center">
                <img src="/assets/images/Thai_government_Garuda_emblem_(Version_6).svg" alt="ตราครุฑ" className="mx-auto h-20 w-20 object-contain" />
            </div>

            <div className="flex items-start justify-between -mt-6">
                <div className="flex items-baseline gap-1 pt-6">
                    <span>ที่ ปป ๐๐๑๒/</span>
                    <Fill w="90px">{ctx.val('เลขที่หนังสือ', '')}</Fill>
                </div>
                <div className="leading-tight pt-6">
                    <div>สำนักงาน ป.ป.ท.</div>
                    <div>อาคารซอฟต์แวร์ปาร์ค ถนนแจ้งวัฒนะ</div>
                    <div>อำเภอปากเกร็ด จังหวัดนนทบุรี 11120</div>
                </div>
            </div>

            <div className="flex items-baseline justify-center gap-1 mt-1 mb-2">
                <Fill w="180px">{letterLongDate(ctx.val('วันที่หนังสือ', ''))}</Fill>
            </div>

            <div className="space-y-0.5 mb-2">
                <div className="flex items-baseline gap-3">
                    <span className="w-12">เรื่อง</span>
                    <span>แจ้งให้มีมาตรการช่วยเหลือแก่พยาน</span>
                </div>
                <div className="flex items-baseline gap-3">
                    <span className="w-12">เรียน</span>
                    <span>{article14Agency(ctx.caseItem).recipient}</span>
                </div>
            </div>

            <LetterParagraph indent>
                ด้วยสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
                ได้รับคำร้องขอให้มีการคุ้มครองพยานจาก <Fill w="160px">{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>{' '}
                อายุ <Fill w="40px">{ctx.val('อายุ', '')}</Fill> ปี บัตรประจำตัวประชาชนเลขที่{' '}
                <Fill w="130px">{ctx.val('เลขบัตรประชาชน', '')}</Fill> ภูมิลำเนาอยู่ที่{' '}
                <Fill w="140px">{ctx.val('ภูมิลำเนา', '')}</Fill> หมู่ที่ <Fill w="30px">{ctx.val('หมู่ที่', '')}</Fill>{' '}
                ตำบล <Fill w="90px">{ctx.val('ตำบล', '')}</Fill> อำเภอ <Fill w="90px">{ctx.val('อำเภอ', '')}</Fill>{' '}
                จังหวัด <Fill w="90px">{ctx.val('จังหวัด', '')}</Fill> พยานในสำนวนคดีของสำนักงาน ป.ป.ท.
                ซึ่งพยานถือเป็นบุคคลตามมาตรา 53 แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
                พ.ศ. ๒๕๕๑ และที่แก้ไขเพิ่มเติม เป็นพยานที่สามารถให้ข้อมูลอันเป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกันและปราบปรามการทุจริตในภาครัฐ
                ขณะนี้คดีอยู่ในระหว่างการดำเนินการของสำนักงาน ป.ป.ท. นั้น
            </LetterParagraph>

            <LetterParagraph indent>
                ในการนี้ คณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ได้พิจารณาเรื่องดังกล่าวในการประชุม ครั้งที่{' '}
                <Fill w="60px">{ctx.val('ครั้งที่ประชุม', '')}</Fill> เมื่อวันที่{' '}
                <Fill w="150px">{letterLongDate(ctx.val('วันที่ประชุม', ''))}</Fill> ระเบียบวาระที่{' '}
                <Fill w="60px">{ctx.val('ระเบียบวาระ', '')}</Fill> มีมติเป็น<Fill w="80px">{ctx.val('มติ', 'เอกฉันท์')}</Fill>{' '}
                จัดให้มีมาตรการช่วยเหลือแก่พยาน โดยใช้<Fill w="120px">{ctx.val('มาตรการ', 'มาตรการทั่วไป')}</Fill>
                เพื่อให้เป็นไปตามพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551
                และที่แก้ไขเพิ่มเติม มาตรา 54 จึงแจ้งให้ {article14Agency(ctx.caseItem).name}
                {/* ฐานอำนาจตาม พ.ร.บ.คุ้มครองพยานฯ ใช้กับกรมคุ้มครองสิทธิฯ เท่านั้น หน่วยงานอื่นใช้ถ้อยคำกลาง */}
                {(ctx.caseItem?.article14?.targetAgencyType || 'rlpd') === 'rlpd'
                    ? 'ซึ่งเป็นหน่วยงานที่มีอำนาจหน้าที่ในการคุ้มครองพยาน ตามพระราชบัญญัติคุ้มครองพยานในคดีอาญา พ.ศ. 2546'
                    : 'ซึ่งเป็นหน่วยงานที่สามารถให้การคุ้มครองพยานได้'}{' '}
                ดำเนินการตามอำนาจหน้าที่ต่อไป
            </LetterParagraph>

            <LetterParagraph indent>จึงเรียนมาเพื่อโปรดพิจารณา</LetterParagraph>

            <LetterSignOff
                name={ctx.val('ผู้ลงนาม', '')}
                position={ctx.val('ตำแหน่งผู้ลงนาม', 'ประธานกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ')}
            />

            {/* ท้ายหนังสือตามต้นฉบับ — ส่วนราชการเจ้าของเรื่องไม่มีบรรทัดจุด "สำนัก....." นำหน้า */}
            <div className="mt-10 leading-tight">
                <div>{ctx.val('ส่วนราชการเจ้าของเรื่อง', 'กองอำนวยการต่อต้านการทุจริต')}</div>
                <div>โทร. {ctx.val('โทรศัพท์', '๐ ๒๕๐๒ ๖๖๗๐ ต่อ ๔๒๒๒')}</div>
                <div>โทรสาร {ctx.val('โทรสาร', '๐ ๒๕๐๒ ๖๙๔๓')}</div>
            </div>
        </>
    ),
]

const REGISTRY: Record<number, PageRenderer[]> = {
  1: kb1,
  2: kb2,
  3: kb3,
  4: kb4,
  5: kb5,
  6: kb6,
  7: kb7,
  8: kb8,
  9: kb9,
  10: kb10,
  11: kb11,
  12: kb12,
  13: kb13,
  14: kb14,
  15: kb15,
  16: kb16,
  17: kb17,
  18: a14Letter,
}

/** ฟอร์มที่จัดวางเป็นหนังสือราชการ (ครุฑ / บันทึกข้อความ / คำสั่ง) แทนแบบฟอร์มกรอก */
export const LETTER_STYLE_FORMS = [4, 5, 6, 8, 9, 10, 16, 17, 18]

export function getFormPages(formId: number): PageRenderer[] {
  return REGISTRY[formId] || REGISTRY[1]
}
