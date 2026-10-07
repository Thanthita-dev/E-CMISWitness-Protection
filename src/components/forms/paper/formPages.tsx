import React from 'react'
import {
  PaperContext,
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
  toThaiDigits,
} from './PaperPrimitives'
import { formatThaiDate, formatThaiDateTime, thaiMonthName } from '../../../lib/utils'
import {
  PROTECTION_METHOD_OPTIONS,
  KB4_PROTECTION_METHOD_FIELD,
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD_EXTERNAL,
  readLegalRefs,
  readShowRationale,
  KB6_RATIONALE_BLANK_ROWS,
} from '../../../lib/constants'

/** รูปแบบการคุ้มครองที่เลือกไว้ใน 8.2 ของ คบ.6 */
const kb6Methods = (ctx: PaperContext): number[] =>
  Array.isArray(ctx.draft[KB6_PROTECTION_METHOD_FIELD]) ? ctx.draft[KB6_PROTECTION_METHOD_FIELD] : []

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

/** ย่อหน้าเลขข้อย่อยของบันทึกข้อความ (เยื้องแบบหนังสือราชการ) */
const Sub: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="leading-loose text-justify indent-[3rem]">{children}</p>
)

/** ตารางรายชื่อเจ้าพนักงานชุดปฏิบัติการ 4 นาย (คบ.4 / คบ.5 / คบ.6 / คบ.8) */
const OfficerRoster: React.FC<{ ctx: PaperContext; keyPrefix: string }> = ({ ctx, keyPrefix }) => (
  <div className="pl-12 space-y-1">
    {['1', '2', '3', '4'].map((n, i) => (
      <div key={n} className="flex items-baseline gap-1">
        <span className="w-5">{n}.</span>
        <Fill grow>{ctx.val(`${keyPrefix}ชื่อ${i + 1}`, '')}</Fill>
        <span>ตำแหน่ง</span>
        <Fill w="120px">{ctx.val(`${keyPrefix}ตำแหน่ง${i + 1}`, '')}</Fill>
        <span className="w-28 text-right">{i === 0 ? 'เป็นหัวหน้าชุด' : 'เป็นชุดปฏิบัติการ'}</span>
      </div>
    ))}
  </div>
)

/**
 * 5 ข้อของรูปแบบการคุ้มครอง (ใช้ร่วมกันใน คบ.4 และ คบ.6)
 * พิมพ์เป็นข้อความล้วนตามต้นฉบับเสมอ — การเลือกใน 8.2 ไม่แสดงเป็นเครื่องหมายบนกระดาษ
 * แต่มีผลกับการแสดงข้อ 8.1 เท่านั้น
 */
const ProtectionMethods: React.FC<{ withFifth?: boolean; selected?: number[] }> = ({
  withFifth = true,
  selected,
}) => (
  <div className="pl-12 space-y-1 leading-relaxed">
    {PROTECTION_METHOD_OPTIONS.filter((o) => withFifth || o.n !== 5).map((o) => (
      <div key={o.n} className={selected ? 'flex items-baseline gap-1' : undefined}>
        {selected && <span>{selected.includes(o.n) ? '☑' : '☐'}</span>}
        <span>
          {toThaiDigits(o.n)}. {o.label}
        </span>
      </div>
    ))}
  </div>
)

/* ================================================================== *
 * คบ.1 — คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น (4 หน้า)
 * ================================================================== */
const kb1: PageRenderer[] = [
  (ctx) => (
    <>
      <FormHead ctx={ctx} title="คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น" />

      <div className="space-y-1">
        <Row>
          <span className="font-bold">1. ข้าพเจ้า</span>
          <span>นาย/นาง/นางสาว</span>
          <Fill grow>
            {ctx.val('คำนำหน้า', '')} {ctx.val('ชื่อ', ctx.caseItem?.person?.split(' ')[0] || '')}
          </Fill>
          <span>นามสกุล</span>
          <Fill grow>{ctx.val('นามสกุล', '')}</Fill>
        </Row>

        <Row className="flex-wrap">
          <span>เกี่ยวข้องในฐานะ</span>
          <CheckBox checked={ctx.val('ฐานะผู้ยื่น', 'พยาน') === 'พยาน'} label="พยาน" />
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
          <Fill grow>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
        </Row>

        <Row>
          <span>เลขประจำตัวประชาชน</span>
          <IdBoxes value={ctx.val('เลขบัตรประชาชน', '')} />
          <span>หรือ</span>
        </Row>
        <Row>
          <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
          <Fill grow>{ctx.val('เลขบัตรเจ้าหน้าที่รัฐ', '')}</Fill>
          <span>สังกัด</span>
          <Fill grow>{ctx.val('สังกัด', '')}</Fill>
        </Row>
        <Row>
          <span>วันออกบัตร</span>
          <Fill grow>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
          <span>บัตรหมดอายุ</span>
          <Fill grow>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
        </Row>

        <Row className="pt-1">
          <span className="font-bold">2. ข้อมูลพยาน</span>
          <span>ชื่อ นาย/นาง/นางสาว</span>
          <Fill grow>{ctx.val('พยานชื่อ', ctx.caseItem?.person || '')}</Fill>
          <span>นามสกุล</span>
          <Fill grow>{ctx.val('พยานนามสกุล', '')}</Fill>
        </Row>
        <Row className="flex-wrap">
          <span>อาชีพ</span>
          {['รับราชการ', 'รับจ้าง', 'นักศึกษา'].map((o) => (
            <CheckBox key={o} checked={ctx.val('อาชีพ') === o} label={o} />
          ))}
          <CheckBox checked={!['รับราชการ', 'รับจ้าง', 'นักศึกษา'].includes(ctx.val('อาชีพ'))} label="อื่น ๆ ระบุ" />
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
          <Fill w="70px">{ctx.val('จำนวนบุตร', '')}</Fill>
          <span>คน</span>
        </Row>
        <Row>
          <span>ชื่อบิดา</span>
          <Fill grow>{ctx.val('ชื่อบิดา', '')}</Fill>
          <span>ชื่อมารดา</span>
          <Fill grow>{ctx.val('ชื่อมารดา', '')}</Fill>
        </Row>
        <Row>
          <span>ที่อยู่ปัจจุบัน</span>
          <Fill grow>{ctx.val('พยานที่อยู่', '')}</Fill>
        </Row>
        <Row>
          <Fill grow>{ctx.val('พยานที่อยู่ต่อ', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow>{ctx.val('พยานโทรศัพท์', '')}</Fill>
        </Row>
        <Row>
          <span>สถานที่ทำงาน</span>
          <Fill grow>{ctx.val('สถานที่ทำงาน', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
        </Row>
        <Row>
          <span>เลขประจำตัวประชาชน</span>
          <IdBoxes value={ctx.val('พยานเลขบัตรประชาชน', ctx.val('เลขบัตรประชาชน', ''))} />
          <span>หรือ</span>
        </Row>
        <Row>
          <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
          <Fill grow>{ctx.val('พยานเลขบัตรรัฐ', '')}</Fill>
          <span>สังกัด</span>
          <Fill grow>{ctx.val('พยานสังกัด', '')}</Fill>
        </Row>
        <Row>
          <span>วันออกบัตร</span>
          <Fill grow>{beDate(ctx.val('พยานวันออกบัตร', ''))}</Fill>
          <span>บัตรหมดอายุ</span>
          <Fill grow>{beDate(ctx.val('พยานบัตรหมดอายุ', ''))}</Fill>
        </Row>
        <Row>
          <span>ข้อมูลสื่อโซเชียลมีเดีย line id</span>
          <Fill grow>{ctx.val('line', '')}</Fill>
          <span>instragram</span>
          <Fill grow>{ctx.val('instagram', '')}</Fill>
          <span>facebook</span>
          <Fill grow>{ctx.val('facebook', '')}</Fill>
        </Row>

        <Row className="pt-1">
          <span className="font-bold">3. บุคคลที่สามารถติดต่อได้</span>
          <Fill grow>{ctx.val('ผู้ติดต่อได้', '')}</Fill>
          <span>ที่อยู่</span>
          <Fill grow>{ctx.val('ผู้ติดต่อที่อยู่', '')}</Fill>
        </Row>
        <Row>
          <Fill grow> </Fill>
          <span>โทรศัพท์</span>
          <Fill grow>{ctx.val('ผู้ติดต่อโทรศัพท์', '')}</Fill>
        </Row>
        <Row>
          <span>สถานที่ทำงาน</span>
          <Fill grow>{ctx.val('ผู้ติดต่อที่ทำงาน', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill grow>{ctx.val('ผู้ติดต่อโทรที่ทำงาน', '')}</Fill>
        </Row>

        <Row className="flex-wrap pt-1">
          <span className="font-bold">4. มีความประสงค์จะขอรับการคุ้มครองจากการ</span>
          <CheckBox checked={ctx.val('ช่วงเวลาคุ้มครอง') === 'จะมาเป็นพยาน'} label="จะมาเป็นพยาน" />
          <CheckBox checked={ctx.val('ช่วงเวลาคุ้มครอง') === 'ได้มาเป็นพยาน'} label="ได้มาเป็นพยาน" />
        </Row>
        <div>ในเรื่องร้องเรียน/กล่าวหา</div>
        <DottedRows n={2}>{ctx.val('เกี่ยวข้องกับคดี', ctx.caseItem?.mainCaseNo || '')}</DottedRows>
      </div>

      <PageFooter page={1} total={4} />
    </>
  ),

  (ctx) => {
    const threats: string[] = ctx.draft['ภัยคุกคามที่เลือก'] || []
    const has = (k: string) => threats.includes(k)
    const anyThreat = threats.length > 0 || Boolean(ctx.val('พฤติการณ์ภัยคุกคาม'))
    return (
      <>
        <div className="font-bold leading-relaxed mb-2">
          5. พฤติการณ์แห่งคดีที่เป็นพยานและความไม่ปลอดภัยที่พยานได้รับ{' '}
          <span className="font-normal">
            (รายละเอียดของคดี การเข้าเป็นพยานในคดีดังกล่าว และพฤติการณ์ที่แสดงถึงความไม่ปลอดภัย )
          </span>
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
              <Fill grow>{ctx.val('ภัยคุกคามอื่นๆ', '')}</Fill>
            </CheckLine>
          </div>
        </div>

        <div className="mt-3">
          <DottedRows n={15}>{ctx.val('พฤติการณ์ภัยคุกคาม', '')}</DottedRows>
        </div>

        <SignRow>
          <SignSlot
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb1-applicant']}
            fallbackName={ctx.caseItem?.person}
          />
          <SignSlot
            role="เจ้าพนักงาน"
            sign={ctx.signatures['kb1-officer']}
            fallbackName={ctx.caseItem?.assignedOfficer}
          />
        </SignRow>

        <PageFooter page={2} total={4} />
      </>
    )
  },

  (ctx) => (
    <>
      <div className="font-bold leading-relaxed mb-2">
        6. กรณีขอให้มีการคุ้มครองบุคคลที่เกี่ยวข้อง{' '}
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
        <div className="font-bold mb-1">7. เอกสารประกอบการยื่นคำร้อง</div>
        <div className="space-y-1">
          <CheckLine checked={docs.includes('หลักฐานแสดงการเป็นพยาน')}>เอกสารหลักฐานแสดงการเป็นพยาน</CheckLine>
          <CheckLine checked={docs.includes('หลักฐานแสดงความเสียหาย')}>
            เอกสารหลักฐานแสดงความเสียหาย เช่น ใบรับรองแพทย์ ภาพถ่าย บันทึกประจำวัน
          </CheckLine>
          <CheckLine checked={Boolean(ctx.val('เอกสารอื่นๆ'))}>
            <span>อื่น ๆ</span>
            <Fill grow>{ctx.val('เอกสารอื่นๆ', '')}</Fill>
          </CheckLine>
        </div>

        <div className="font-bold leading-relaxed mt-2 mb-1">
          8. ทั้งนี้ ข้าพเจ้าได้ทราบสิทธิที่พยานพึงได้รับเมื่อได้รับการคุ้มครองและยินยอมปฏิบัติตามหลักเกณฑ์
          และวิธีการ และเงื่อนไขของสำนักงาน ป.ป.ท. ดังต่อไปนี้
        </div>

        <div className="space-y-0.5">
          <Sub>
            1. ข้าพเจ้าได้รับทราบสิทธิที่พึงจะได้รับตามระเบียบและกฎหมายที่เกี่ยวข้อง (ระเบียบสำนักนายกรัฐมนตรีว่าด้วยค่าใช้จ่ายและวิธีการเบิกจ่ายตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
            พ.ศ. 2565 และที่แก้ไขเพิ่มเติม)
          </Sub>
          <Sub>
            2. ข้าพเจ้าจะปฏิบัติตามและให้ความร่วมมือ รวมทั้งชื่อฟังคำแนะนำของเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
            ในเรื่องที่เกี่ยวข้องกับความปลอดภัย และเรื่องอื่นๆ ที่อาจทำให้เกิดความเสียหายแก่ตัวของข้าพเจ้าและผู้เกี่ยวข้องอย่างเคร่งครัด
          </Sub>
          <Sub>
            3. ข้าพเจ้ายินยอมจะงดใช้โทรศัพท์หรือเครื่องมือสื่อสารอื่นใด และยินยอมจะมอบโทรศัพท์หรือเครื่องมือสื่อสารให้กับเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
          </Sub>
          <Sub>
            4. ข้าพเจ้าจะไม่ทำให้เกิดความเสี่ยงต่อความมั่นคงปลอดภัยของตนเองและเจ้าพนักงานที่ดำเนินการคุ้มครองข้าพเจ้า
          </Sub>
          <Sub>
            5. ในกรณีที่มีความจำเป็น ข้าพเจ้ายินยอมให้เจ้าพนักงานที่ดำเนินการคุ้มครองจัดให้ข้าพเจ้าอยู่ในสถานที่ที่ปลอดภัยหรือการปกปิดมิให้มีการเปิดเผยข้อมูลเกี่ยวกับข้าพเจ้า
            ทั้งนี้ ตามความเหมาะสมแก่สถานภาพของข้าพเจ้าและลักษณะของคดี
          </Sub>
          <Sub>
            6. ระหว่างอยู่ในการคุ้มครอง หากข้าพเจ้าจำเป็นต้องเดินทางออกจากที่พักที่เจ้าพนักงานหรือที่สำนักงาน ป.ป.ท. จัดให้
            ข้าพเจ้าจะต้องได้รับอนุญาตจากเจ้าพนักงานที่ดำเนินการคุ้มครองก่อน
          </Sub>
          <Sub>
            7. ข้าพเจ้าอมรับว่าหากข้าพเจ้าฝ่าฝืนหรือไม่ปฏิบัติตามเงื่อนไขที่กำหนดข้างต้น ข้าพเจ้ายินยอมให้สำนักงาน ป.ป.ท.
            หรือหน่วยงานอื่นที่ได้รับมอบหมายให้คุ้มครอง ยุติการคุ้มครองข้าพเจ้าทันที
          </Sub>
          <Sub>
            8. ก่อน ขณะ และหลังการเป็นพยาน และอยู่ในการคุ้มครองของสำนักงาน ป.ป.ท. หรือหน่วยงานอื่นที่ได้รับมอบหมาย
            หากข้าพเจ้ากระทำการอันเป็นความผิดตามที่กฎหมายบัญญัติ ข้าพเจ้ายินยอมให้ฟ้องร้องดำเนินคดีและยุติการคุ้มครองพยานทันที
          </Sub>
        </div>

        <div className="text-center mt-2">ขอรับรองว่า เป็นการบันทึกถ้อยคำที่ถูกต้อง จึงลงลายมือชื่อไว้ต่อเจ้าหน้าที่</div>

        <div className="mt-1 space-y-1">
          <SignSlot
            prefix=""
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb1-applicant']}
            fallbackName={ctx.caseItem?.person}
          />
          <SignSlot
            prefix=""
            role="เจ้าพนักงาน"
            sign={ctx.signatures['kb1-officer']}
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
            <Fill grow>{ctx.val('คำนำหน้า', '')}</Fill>
            <span>ชื่อตัว</span>
            <Fill grow>{ctx.val('ชื่อผู้แจ้ง', ctx.caseItem?.person || '')}</Fill>
            <span>ชื่อสกุล</span>
            <Fill grow>{ctx.val('นามสกุลผู้แจ้ง', '')}</Fill>
          </Row>
          <Row>
            <span>อายุ</span>
            <Fill w="50px">{ctx.val('อายุ', '')}</Fill>
            <span>ปี ที่อยู่ตามทะเบียนบ้าน บ้านเลขที่</span>
            <Fill grow>{ctx.val('บ้านเลขที่', '')}</Fill>
            <span>หมู่ที่</span>
            <Fill w="55px">{ctx.val('หมู่ที่', '')}</Fill>
            <span>ตรอก/ซอย</span>
            <Fill grow>{ctx.val('ตรอกซอย', '')}</Fill>
          </Row>
          <Row>
            <span>ถนน</span>
            <Fill grow>{ctx.val('ถนน', '')}</Fill>
            <span>ตำบล/แขวง</span>
            <Fill grow>{ctx.val('ตำบล', '')}</Fill>
            <span>อำเภอ/เขต</span>
            <Fill grow>{ctx.val('อำเภอ', '')}</Fill>
          </Row>
          <Row>
            <span>จังหวัด</span>
            <Fill grow>{ctx.val('จังหวัด', '')}</Fill>
            <span>รหัสไปรษณีย์</span>
            <Fill grow>{ctx.val('รหัสไปรษณีย์', '')}</Fill>
            <span>โทรศัพท์</span>
            <Fill grow>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
          </Row>
          <Row>
            <span>โทรสาร</span>
            <Fill grow>{ctx.val('โทรสาร', '')}</Fill>
            <span>e-mail</span>
            <Fill grow>{ctx.val('อีเมล', '')}</Fill>
          </Row>
          <Row>
            <span>เกี่ยวข้องกับเรื่องกล่าวหาร้องเรียนการทุจริตในภาครัฐในฐานะที่เป็น</span>
            <Fill grow>{ctx.val('ฐานะที่เป็น', '')}</Fill>
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
            <Fill grow>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </Row>

          <div className="pl-12 pt-1">
            เนื่องจากมีพฤติการณ์ (ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ)
          </div>
          <DottedRows n={3}>{ctx.val('รายละเอียดข้อเท็จจริง', '')}</DottedRows>

          <Row className="pl-12 pt-1">
            <span>โดยได้แจ้งผ่านช่องทางการสื่อสาร</span>
            <Fill grow>{ctx.val('ช่องทางการสื่อสาร', '')}</Fill>
          </Row>
          <Row className="pl-12">
            <span>รายละเอียดอื่นๆ(ถ้ามี)</span>
            <Fill grow>{ctx.val('รายละเอียดอื่น', '')}</Fill>
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

      {ctx.caseItem?.kb3Skipped && (
        <div className="mb-2 border border-rose-400 bg-rose-50 p-2 text-rose-900">
          <strong>เอกสารฉบับนี้ถูกกดข้าม</strong> เมื่อ {ctx.caseItem.kb3SkippedAt} โดย {ctx.caseItem.kb3SkippedBy}
          <div>เหตุผล: {ctx.caseItem.kb3SkipReason}</div>
        </div>
      )}

      <div className="space-y-1">
        <Row className="justify-end">
          <span>เขียนที่</span>
          <Fill w="45%">{ctx.val('สถานที่บันทึก', '')}</Fill>
        </Row>
        <Row className="justify-end">
          <span>วันที่</span>
          <Fill w="70px">{ctx.val('วันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px">{ctx.val('เดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px">{ctx.val('พ.ศ.', '')}</Fill>
        </Row>

        <Row className="pt-3 pl-8">
          <span className="font-bold">1.</span>
          <span>ข้าพเจ้า นาย/นาง/นางสาว/อื่นๆ</span>
          <Fill grow>{ctx.val('ผู้ให้ถ้อยคำ', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <Row>
          <span>เกิดวันที่</span>
          <Fill w="70px">{ctx.val('เกิดวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px">{ctx.val('เกิดเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px">{ctx.val('เกิดพ.ศ.', '')}</Fill>
          <span>อายุ</span>
          <Fill w="60px">{ctx.val('อายุ', '')}</Fill>
          <span>เชื้อชาติ</span>
          <Fill grow>{ctx.val('เชื้อชาติ', 'ไทย')}</Fill>
        </Row>
        <Row>
          <span>สัญชาติ</span>
          <Fill w="100px">{ctx.val('สัญชาติ', 'ไทย')}</Fill>
          <span>อาชีพ</span>
          <Fill grow>{ctx.val('อาชีพ', '')}</Fill>
          <span>ที่อยู่ตามทะเบียนบ้าน เลขที่</span>
          <Fill grow>{ctx.val('บ้านเลขที่', '')}</Fill>
        </Row>
        <Row>
          <span>หมู่ที่</span>
          <Fill w="70px">{ctx.val('หมู่ที่', '')}</Fill>
          <span>ตรอก/ซอย</span>
          <Fill grow>{ctx.val('ตรอกซอย', '')}</Fill>
          <span>ถนน</span>
          <Fill grow>{ctx.val('ถนน', '')}</Fill>
        </Row>
        <Row>
          <span>ตำบล/แขวง</span>
          <Fill grow>{ctx.val('ตำบล', '')}</Fill>
          <span>อำเภอ/เขต</span>
          <Fill grow>{ctx.val('อำเภอ', '')}</Fill>
          <span>จังหวัด</span>
          <Fill grow>{ctx.val('จังหวัด', '')}</Fill>
        </Row>
        <Row>
          <span>รหัสไปรษณีย์</span>
          <Fill w="140px">{ctx.val('รหัสไปรษณีย์', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill w="200px">{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">2.</span>
          <span>ที่อยู่ปัจจุบัน เลขที่</span>
          <Fill grow>{ctx.val('ปัจจุบันเลขที่', '')}</Fill>
          <span>หมู่ที่</span>
          <Fill w="80px">{ctx.val('ปัจจุบันหมู่ที่', '')}</Fill>
          <span>ตรอก/ซอย</span>
          <Fill grow>{ctx.val('ปัจจุบันตรอกซอย', '')}</Fill>
          <span>ถนน</span>
          <Fill grow>{ctx.val('ปัจจุบันถนน', '')}</Fill>
        </Row>
        <Row>
          <span>ตำบล/แขวง</span>
          <Fill grow>{ctx.val('ปัจจุบันตำบล', '')}</Fill>
          <span>อำเภอ/เขต</span>
          <Fill grow>{ctx.val('ปัจจุบันอำเภอ', '')}</Fill>
          <span>จังหวัด</span>
          <Fill grow>{ctx.val('ปัจจุบันจังหวัด', '')}</Fill>
        </Row>
        <Row>
          <span>รหัสไปรษณีย์</span>
          <Fill w="140px">{ctx.val('ปัจจุบันรหัสไปรษณีย์', '')}</Fill>
          <span>โทรศัพท์</span>
          <Fill w="200px">{ctx.val('ปัจจุบันโทรศัพท์', '')}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">3.</span>
          <span>หนังสือสำคัญแสดงตน ชนิด</span>
          <Fill grow>{ctx.val('ชนิดหนังสือสำคัญ', 'บัตรประจำตัวประชาชน')}</Fill>
          <span>หมายเลข</span>
          <Fill grow>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
        </Row>
        <Row>
          <span>ออกให้ที่</span>
          <Fill grow>{ctx.val('ออกให้ที่', '')}</Fill>
          <span>วันออก</span>
          <Fill grow>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
          <span>วันสิ้นอายุ</span>
          <Fill grow>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
        </Row>

        <Row className="pl-8">
          <span className="font-bold">4.</span>
          <span>
            ข้าพเจ้าขอให้ถ้อยคำเพื่อประกอบคำร้องขอการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้นของ
          </span>
        </Row>
        <Row>
          <span>นาย/นาง/นางสาว/อื่นๆ</span>
          <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>ซึ่งเป็นพยานคดีทุจริตในภาครัฐเรื่อง</span>
        </Row>
        <DottedRows n={3}>{ctx.val('บันทึกถ้อยคำ', ctx.caseItem?.mainCaseNo || '')}</DottedRows>
      </div>

      <SignRow>
        <SignSlot role="ผู้ให้ถ้อยคำ" sign={ctx.signatures['kb3-witness']} fallbackName={ctx.caseItem?.person} />
        <SignSlot
          role="เจ้าพนักงาน"
          sign={ctx.signatures['kb3-officer']}
          fallbackName={ctx.caseItem?.assignedOfficer}
        />
      </SignRow>

      <PageFooter page={1} total={2} />
    </>
  ),

  (ctx) => (
    <>
      <div className="font-bold mb-1">
        5. เนื่องจากมีพฤติการณ์{' '}
        <span className="font-normal">
          (ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ)
        </span>
      </div>
      <DottedRows n={16}>{ctx.val('ความเห็นเจ้าหน้าที่', '')}</DottedRows>

      <LetterParagraph>
        ข้าพเจ้าขอรับรองว่า เจ้าพนักงานของสำนักงาน ป.ป.ท. มิได้ทำหรือจัดให้ทำการใดๆซึ่งเป็นการล่อลวง ขู่เข็ญ
        หรือให้สัญญาเพื่อจูงใจ ให้ข้าพเจ้าให้ถ้อยคำใดๆ และข้าพเจ้าขอรับรองว่า เป็นบันทึกถ้อยคำที่ถูกต้อง
        จึงลงลายมือชื่อไว้ต่อหน้าเจ้าพนักงาน
      </LetterParagraph>

      <div className="mt-6 space-y-4">
        <SignSlot role="ผู้ให้ถ้อยคำ" sign={ctx.signatures['kb3-witness']} fallbackName={ctx.caseItem?.person} />
        <SignSlot
          role="เจ้าพนักงาน"
          sign={ctx.signatures['kb3-officer']}
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
            <Fill grow>{ctx.val('สำนวนคดีเลขที่', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </span>
        }
        to={
          <span className="flex-1 flex items-baseline gap-1">
            <span>ผู้อำนวยการสำนัก/กอง/ศูนย์</span>
            <Fill w="240px">{ctx.val('เรียน', '')}</Fill>
          </span>
        }
      />

      <div className="mt-2 space-y-1">
        <div className="font-bold pl-8">1. เรื่องเดิม</div>
        <Row className="pl-12">
          <span>สำนักงาน ป.ป.ท. ได้รับคำร้องขอให้มีการคุ้มครองพยานในเบื้องต้นจากพยานราย</span>
          <Fill grow>{ctx.val('พยาน', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <Row>
          <span>คำร้องหมายเลขที่</span>
          <Fill grow>{ctx.val('เลขคำร้อง', ctx.caseItem?.no || '')}</Fill>
          <span>ในคดีเรื่องที่</span>
          <Fill grow>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
          <span>โดยขอให้สำนักงาน</span>
        </Row>
        <Row>
          <span>ป.ป.ท. คุ้มครองพยานด้วยวิธีการ</span>
          <Fill grow>{ctx.val('วิธีการคุ้มครอง', '')}</Fill>
          <span>เนื่องจากการมาเป็นพยาน ในเรื่องร้องเรียน/</span>
        </Row>
        <Row>
          <span>กล่าวหา</span>
          <Fill grow>{ctx.val('เรื่องกล่าวหา', '')}</Fill>
        </Row>

        <div className="font-bold pl-8 pt-1">2. ข้อเท็จจริง</div>
        <div className="pl-12">2.1 รายละเอียดพฤติการณ์แห่งคดี</div>
        <DottedRows n={2}>{ctx.val('พฤติการณ์แห่งคดี', '')}</DottedRows>
        <Sub>
          2.2 (ชื่อ-สกุล พยาน) เป็น (ผู้กล่าวหา ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์กล่าวโทษ ผู้ให้ถ้อยคำ ผู้แจ้งเบาะแส)
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
          <Fill w="150px">{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
          <span>ในระหว่างวันที่</span>
          <Fill w="90px">{beDate(ctx.val('เริ่มวันที่', ctx.caseItem?.actualStartedAt))}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="110px">{beDate(ctx.val('ถึงวันที่', ctx.caseItem?.protectionEndAt))}</Fill>
          <span>และ (ชื่อ สกุล) ยินยอมให้คุ้มครอง</span>
        </Row>
        <Sub>
          2.3. สถานภาพของพยานในขณะยื่นคำร้องขอให้คุ้มครองในเบื้องต้น (พยานอยู่ในความคุ้มครองของเจ้าหน้าที่ก่อนยื่นคำร้อง
          หรือไม่)
        </Sub>

        <div className="font-bold pl-8 pt-1">3. ข้อกฎหมาย</div>
        <Sub>
          3.1 พระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551 และที่แก้ไขเพิ่มเติม
        </Sub>
        <Sub>
          3.2 ระเบียบคณะกรรมการ ป.ป.ท. ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. 2554
        </Sub>
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold pl-8">4. ข้อพิจารณา</div>
      <Sub>
        (ชื่อ สกุล) พยาน เป็น (ผู้กล่าวหา ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์กล่าวโทษ ผู้ให้ถ้อยคำ ผู้แจ้งเบาะแส)
        สามารถให้ข้อมูล (หรือจะมาให้ข้อมูล) เป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน
        และปราบปรามการทุจริตในภาครัฐ มีพฤติการณ์ถูกคุกคามโดย
        <Fill w="120px">{ctx.val('ผู้คุกคาม', '')}</Fill>
        (มีภยันตรายซึ่งเกิดจากการประทุษร้ายอันละเมิดต่อกฎหมาย...ผู้ร้องขอมีพฤติการณ์...(เช่น หวาดกลัว
        ไม่อาจทนอยู่ในเคหสถานได้ ฯลฯ)
      </Sub>
      <Sub>
        พิจารณาแล้วเห็นว่าการให้ข้อมูลและพยานหลักฐานของ (ชื่อ สกุล) พยาน เป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน
        และปราบปรามการทุจริตในภาครัฐ จากการตรวจสอบแล้ว พยาน ได้รับภัยคุกคามจริงจากการให้ข้อมูลและพยานหลักฐานกับ
        (เจ้าหน้าที่ ป.ป.ท., พนักงาน ป.ป.ท.) ผู้รับผิดชอบ และเป็นกรณีเร่งด่วน
        ดังนั้นเห็นควรจัดให้มีการคุ้มครองพยานเป็นการเร่งด่วน ดังนี้
      </Sub>

      <div className="pl-12 font-bold">4.1 มอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว ผู้มีรายชื่อ ดังต่อไปนี้</div>
      <OfficerRoster ctx={ctx} keyPrefix="ชุด" />

      <Row className="pl-12 pt-1">
        <span>4.2 ดำเนินการคุ้มครองโดยการ</span>
        <Fill w="120px">{ctx.val('ดำเนินการโดย', '')}</Fill>
        <span>เลือกรูปแบบการคุ้มครอง</span>
        <Fill grow>{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
      </Row>
      <ProtectionMethods selected={kb4Methods(ctx)} />

      <Row className="pl-12 pt-1">
        <span>ตั้งแต่วันที่</span>
        <Fill w="90px">{beDate(ctx.val('เริ่มวันที่', ctx.caseItem?.actualStartedAt))}</Fill>
        <span>ถึงวันที่</span>
        <Fill w="120px">{beDate(ctx.val('ถึงวันที่', ctx.caseItem?.protectionEndAt))}</Fill>
        <span>ทั้งนี้หากเจ้าพนักงานปฏิบัติหน้าที่คุ้มครองชั่วคราว</span>
      </Row>
      <div>
        เห็นว่าพฤติการณ์แห่งคดีเปลี่ยนแปลงไป อาจเปลี่ยนรูปแบบการคุ้มครองพยานได้ตามความเหมาะสม
        โดยคำนึงถึงความปลอดภัยของพยาน
      </div>

      <Row className="pl-12 pt-1">
        <span>4.3 อนุมัติให้</span>
        <Fill grow>{ctx.val('ผู้ดำเนินการคุ้มครอง', '')}</Fill>
        <span>ดำเนินการคุ้มครองพยานชั่วคราว ในพื้นที่</span>
      </Row>
      <Row>
        <Fill w="200px">{ctx.val('พื้นที่คุ้มครอง', '')}</Fill>
        <span>ระหว่างวันที่</span>
        <Fill grow>{beDate(ctx.val('ระหว่างวันที่', ''))}</Fill>
        <span>โดยใช้รถยนต์ส่วนกลางของทางราชการ</span>
      </Row>
      <Row>
        <span>ทะเบียน</span>
        <Fill w="200px">{ctx.val('ทะเบียนรถ', '')}</Fill>
      </Row>

      <Sub>
        4.4 ขออนุมัติยืมเงินทดรองราชการ เพื่อเป็นค่าใช้จ่ายในการดำเนินการอื่นใดอันจำเป็นแก่การป้องกันและปราบปรามการทุจริตในภาครัฐ
        ตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต เพื่อดำเนินการคุ้มครองพยาน รวมเป็นเงินจำนวน
        <Fill w="130px">{ctx.val('จำนวนเงิน', '')}</Fill>
        บาท (<Fill w="130px">{ctx.val('จำนวนเงินตัวอักษร', '')}</Fill>บาทถ้วน) โดยขอถัวเฉลี่ยทุกรายการ
        รายละเอียดปรากฏตามประมาณการค่าใช้จ่าย
      </Sub>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={3} />
      <div className="font-bold pl-8">5. ความเห็นและข้อเสนอแนะ</div>
      <Sub>
        5.1 เห็นควรจัดให้มีการคุ้มครองพยานชั่วคราว โดยออกคำสั่งมอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว ตาม 4.1
        และดำเนินการคุ้มครอง ตาม 4.2 พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงานดำเนินการคุ้มครองชั่วคราว
        และหนังสือแจ้งคำสั่งให้พยานผู้ขอรับการคุ้มครองทราบ พร้อมนี้ด้วยแล้ว
      </Sub>
      <Sub>
        5.2 เห็นควรมีหนังสือถึง ผกก.สภ.
        <Fill w="90px">{ctx.val('สภ.', '')}</Fill>
        เพื่อประสานให้ดำเนินการคุ้มครองพยาน (กรณีเลือกการดำเนินการคุ้มครองโดยการประสานกับหน่วยงานอื่นให้การคุ้มครองพยาน)
        โดยผู้รับผิดชอบในการส่งต่อพยาน และติดตามผลคือเจ้าพนักงานตามคำสั่งแต่งตั้งเจ้าพนักงานปฏิบัติหน้าที่คุ้มครองชั่วคราว
      </Sub>
      <Sub>5.3 เห็นควรอนุมัติการเดินทางและค่าใช้จ่ายในการคุ้มครองพยานตาม 4.3 , 4.4</Sub>
      <div className="pl-12">จึงเรียนมาเพื่อโปรดพิจารณา</div>

      <div className="mt-8 text-center">
        <div>
          (
          {ctx.val('ผู้เสนอ', ctx.caseItem?.assignedOfficer || '')}
          <span className="inline-block w-24" />)
        </div>
        <div>นักสืบสวนสอบสวนชำนาญการ</div>
      </div>

      <div className="mt-5 font-bold">
        13. ความเห็นผู้อำนวยการสำนัก (เรื่องที่ <span className="inline-block w-20" />)
      </div>
      <SolidRows n={3}>{ctx.val('ความเห็นผู้อำนวยการ', '')}</SolidRows>

      <div className="mt-8 text-center">
        <div>
          (
          {ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}
          <span className="inline-block w-24" />)
        </div>
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
  (ctx) => (
    <>
      <OrderHead
        ctx={ctx}
        orderTitle={
          <span className="flex items-baseline justify-center gap-1">
            <span>คำสั่งสำนัก/กอง/ศูนย์</span>
            <Fill w="180px">{ctx.val('สำนักกองศูนย์', '')}</Fill>
            <span>(ในสังกัด สำนักงาน ป.ป.ท.)</span>
          </span>
        }
        subject="มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว"
      />

      <div className="space-y-1">
        <Row className="pl-12">
          <span>ด้วยผู้อำนวยการสำนัก/กอง/ศูนย์</span>
          <Fill grow>{ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}</Fill>
          <span>ได้อนุมัติ</span>
        </Row>
        <Row>
          <span>ให้ดำเนินการคุ้มครองชั่วคราวแก่</span>
          <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>(ระบุชื่อพยาน/ผู้ขอรับการคุ้มครอง)</span>
          <Fill w="90px"> </Fill>
        </Row>
        <Row>
          <span>ตั้งแต่วันที่</span>
          <Fill w="70px">{ctx.val('เริ่มวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px">{ctx.val('เริ่มเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px">{ctx.val('เริ่มพ.ศ.', '')}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="70px">{ctx.val('ถึงวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="110px">{ctx.val('ถึงเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px">{ctx.val('ถึงพ.ศ.', '')}</Fill>
          <span>ดังนั้น</span>
        </Row>
        <Row>
          <span>สำนัก/กอง/ศูนย์</span>
          <Fill grow>{ctx.val('สำนักกองศูนย์', '')}</Fill>
          <span>มีคำสั่งมอบหมายเจ้าพนักงาน</span>
        </Row>
        <div>ดำเนินการให้ความคุ้มครองชั่วคราวดังกล่าว ดังมีรายชื่อต่อไปนี้</div>

        <OfficerRoster ctx={ctx} keyPrefix="ชุด" />

        <LetterParagraph>
          ให้ผู้มีรายชื่อดังกล่าวข้างต้นรับผิดชอบในการคุ้มครองชั่วคราวโดยดำเนินการให้เป็นไปตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. 2554 และให้รายงานผลให้ผู้บังคับบัญชาทราบทุกระยะ
          <Fill w="70px">{ctx.val('รายงานทุกกี่วัน', '')}</Fill>
          วัน (ทุกวัน/ทุกสามวัน/ทุกห้าวัน ตามความเหมาะสมรายกรณี) และหากมีกรณีเร่งด่วนให้รายงานในทันที
          โดยการคุ้มครองชั่วคราวรายดังกล่าวให้เจ้าหน้าที่ชุดคุ้มครองจัดให้พยานลงลายมือชื่อยินยอมรับการคุ้มครองชั่วคราวด้วย
        </LetterParagraph>

        <LetterParagraph>
          ทั้งนี้ ตั้งแต่บัดนี้เป็นต้นไปจนกว่าจะมีคำสั่งเปลี่ยนแปลง และให้ถือปฏิบัติโดยเคร่งครัด
        </LetterParagraph>

        <Row className="pl-12">
          <span>สั่ง ณ วันที่</span>
          <Fill w="70px">{ctx.val('สั่งวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="130px">{ctx.val('สั่งเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="70px">{ctx.val('สั่งพ.ศ.', '')}</Fill>
        </Row>
      </div>

      {/** WIT0611 — ผอ. ลงนามคำสั่ง คบ.5 แล้วระบบล็อกฉบับลงนาม ห้ามแก้ทับ */}
      <div className="mt-8 text-center">
        <SignSlot
          prefix="(ลงชื่อ)"
          sign={ctx.signatures['kb5-director']}
          fallbackName={ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || '')}
        />
        <Row className="justify-center">
          <span>ผู้อำนวยการสำนัก/กอง/ศูนย์</span>
          <Fill w="200px">{ctx.val('สำนักกองศูนย์', '')}</Fill>
        </Row>
      </div>

      <div className="mt-6">
        <WitnessAckBox sign={ctx.signatures['kb5-witness']} fallbackName={ctx.caseItem?.person} />
      </div>
    </>
  ),
]

/* ================================================================== *
 * คบ.6 — บันทึกข้อความ การคุ้มครองพยานในเบื้องต้น (3 หน้า)
 * ================================================================== */
const kb6: PageRenderer[] = [
  (ctx) => (
    <>
      <MemoHead
        ctx={ctx}
        subject={
          <span className="flex items-baseline gap-1">
            <span className="underline">การคุ้มครองพยานในเบื้องต้น สำนวนคดีเลขที่</span>
            <Fill grow>{ctx.val('สำนวนคดีเลขที่', ctx.caseItem?.mainCaseNo || '')}</Fill>
          </span>
        }
        to="เลขาธิการคณะกรรมการ ป.ป.ท."
      />

      <div className="mt-2 space-y-1">
        <div className="font-bold pl-8">1. การรับเรื่อง</div>
        <Row className="pl-12">
          <span>1.1 ได้รับคำร้องขอให้มีการคุ้มครองพยานในเบื้องต้นจาก</span>
          <Fill grow>{ctx.val('ผู้ยื่นคำร้อง', ctx.caseItem?.person || '')}</Fill>
        </Row>
        <div>
          ตามมาตรา 53 แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551
          และที่แก้ไขเพิ่มเติม
        </div>
        <Row>
          <span>เมื่อวันที่</span>
          <Fill grow>{beDate(ctx.val('วันที่รับคำร้อง', ctx.caseItem?.createdAt))}</Fill>
          <span>รายละเอียดปรากฏตามคำร้อง</span>
        </Row>
        <Row>
          <Fill w="180px">{ctx.val('เลขคำร้อง', ctx.caseItem?.no || '')}</Fill>
          <span>ลงวันที่</span>
          <Fill grow>{beDate(ctx.val('คำร้องลงวันที่', ''))}</Fill>
          <span>ในคดีเรื่อง</span>
          <Fill grow>{ctx.val('อ้างอิงคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
        </Row>
        <Row className="pl-12">
          <span>1.2 ผอ.</span>
          <Fill w="70px">{ctx.val('ผอ.', '')}</Fill>
          <span>มอบให้</span>
          <Fill grow>{ctx.val('มอบให้', ctx.caseItem?.assignedOfficer || '')}</Fill>
          <span>ดำเนินการเมื่อวันที่</span>
          <Fill grow>{beDate(ctx.val('มอบวันที่', ''))}</Fill>
        </Row>

        <div className="font-bold pl-8 pt-1">2. ข้อเท็จจริง</div>
        <Row className="pl-12">
          <span>2.1 .....ชื่อ-สกุล ตำแหน่ง สังกัด ของผู้ถูกกกล่าวหา</span>
          <Fill grow>{ctx.val('ผู้ถูกกล่าวหา', '')}</Fill>
          <span>ถูกกล่าวหาว่า</span>
        </Row>
        <Row>
          <Fill w="45%">{ctx.val('ข้อกล่าวหา', '')}</Fill>
          <span>
            โดยมีพฤติการณ์.. (ได้แก่ การกระทำความผิดเกิดขึ้นเมื่อใดมีขั้นตอนหรือรายละเอียด
          </span>
        </Row>
        <Row>
          <span>การกระทำความผิดอย่างไร มีพยานบุคคลรายอื่นรู้เห็นเหตุการณ์หรือไม่)</span>
          <Fill grow> </Fill>
        </Row>
        <Row className="pl-12">
          <span>2.2 ชื่อ-สกุล พยาน</span>
          <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>บัตรประจำตัวประชาชนเลขที่</span>
          <Fill grow>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
        </Row>
        <Row>
          <span>อายุ</span>
          <Fill w="60px">{ctx.val('อายุ', '')}</Fill>
          <span>ปี อาชีพ</span>
          <Fill grow>{ctx.val('อาชีพ', '')}</Fill>
          <span>ที่อยู่ตามทะเบียนบ้านเลขที่</span>
          <Fill grow>{ctx.val('ที่อยู่ทะเบียนบ้าน', '')}</Fill>
        </Row>
        <Row>
          <span>ที่อยู่ปัจจุบันเลขที่</span>
          <Fill grow>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
          <span>เป็น (ผู้กล่าวหา</span>
        </Row>
        <div className="leading-relaxed text-justify">
          ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์ กล่าวโทษ ผู้ให้ถ้อยคำ หรือผู้ที่แจ้งเบาะแส ซึ่งจะมาให้ หรือได้ให้ข้อเท็จจริง
          เบาะแส หรือข้อมูลใด เกี่ยวกับการทุจริตในภาครัฐ หรือข้อมูลอื่นอันเป็นประโยชน์ในการดำเนินการตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหาร
          ในการป้องกันและปราบปรามการทุจริต และให้หมายความรวมถึงบุคคลหรือผู้ถูกกล่าวหาซึ่ง ได้รับการกันไว้เป็นพยานด้วย)
        </div>
        <div className="leading-relaxed text-justify pl-12">
          2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย (พฤติกรรมการข่มขู่คุกคามมีลักษณะอย่างไร ผู้กระทำเป็นใคร
          สามารถระบุได้หรือไม่ ความเสียหายที่ได้รับเป็นอย่างไร หลังจากเหตุการณ์คุกคามได้มีการแจ้งความต่อเจ้าหน้าที่ตำรวจ
          หรือเจ้าหน้าที่อื่นที่เกี่ยวข้องแล้วหรือไม่อย่างไร ผู้ใกล้ชิดถูกคุกคามหรือไม่ และพยานประสงค์ให้คุ้มครองความปลอดภัยของผู้ใกล้ชิดด้วยหรือไม่)
          ซึ่งพยานเกรงว่าจะไม่ได้รับความปลอดภัย(หรือถูกข่มขู่คุกคามก่อน ขณะ หรือหลังจากการที่ให้ถ้อยคำ แจ้งเบาะแส หรือให้ข้อมูล)
          จึงประสงค์ขอที่จะรับการคุ้มครองพยานเบื้องต้นจากสำนักงาน ป.ป.ท.
        </div>

        <div className="font-bold pl-8 pt-1">3. รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง</div>
        <Row className="pl-12">
          <span>พยานมีความประสงค์จะให้เจ้าหน้าที่ดำเนินการ อย่างไร (ถ้ามี) ให้บันทึกรายละเอียด</span>
        </Row>
        <Row>
          <span>ตามระเบียบฯ ข้อ 15</span>
          <Fill w="70px"> </Fill>
          <span>(รูปแบบการคุ้มครอง)</span>
          <Fill grow>{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
        </Row>
        <Row>
          <span>ในระหว่างวันที่</span>
          <Fill w="90px">{beDate(ctx.val('เริ่มวันที่', ''))}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="130px">{beDate(ctx.val('ถึงวันที่', ''))}</Fill>
          <span>(รวมเป็นเวลา</span>
          <Fill w="60px">{ctx.val('รวมเดือน', '')}</Fill>
          <span>เดือน</span>
          <Fill w="60px">{ctx.val('รวมวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
          <span>วัน)</span>
        </Row>

        <div className="font-bold pl-8 pt-1">
          4. สถานภาพของพยานในขณะยื่นคำร้องขอให้คุ้มครองในเบื้องต้น{' '}
          <span className="font-normal">(พยานอยู่ในความคุ้มครองของเจ้าหน้าที่ก่อนยื่นคำร้อง หรือไม่,อยู่ระหว่างการคุ้มครองชั่วคราว)</span>
        </div>
        <div className="font-bold pl-8">
          5. ความยินยอมเข้ารับการคุ้มครองพยานในเบื้องต้น <span className="font-normal">(โดยชัดแจ้ง)</span>
        </div>
        <div className="pl-12">พยานตกลงยินยอมรับการคุ้มครองตามมาตรการคุ้มครองเบื้องต้น</div>
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold pl-8">
        6. เอกสารประกอบการยื่นคำร้อง <span className="font-normal">(อย่างน้อยต้องมี)</span>
      </div>
      <Sub>
        6.1 สำเนาบัตรประจำตัวประชาชน/บัตรประจำตัวเจ้าหน้าที่ของรัฐหรือ หลักฐานแสดงตนที่ทางราชการออกให้ (รับรองสำเนาถูกต้อง)
      </Sub>
      <Sub>6.2 สำเนาทะเบียนบ้าน (รับรองสำเนาถูกต้อง)</Sub>
      <Sub>6.3 สำเนาเอกสารแสดงถึงความเกี่ยวข้องกับเรื่องกล่าวหาร้องเรียน เช่น หมายเรียก (ถ้ามี)</Sub>
      <Sub>6.4 สำเนาเอกสารหลักฐานแสดงความเสียหาย เช่น ใบรับรองแพทย์ (ถ้ามี)</Sub>
      <Sub>6.5 อื่นๆ</Sub>

      <div className="font-bold pl-8 pt-1">7. กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง</div>
      {/*
        ข้อที่เว้นว่างไม่พิมพ์ และเลขข้อไล่ใหม่ให้ต่อเนื่องเสมอ
        Sub จัดข้อความชิดขอบสองข้าง (text-justify) บรรทัดที่ตัดคำจึงถูกยืดที่อักขระช่องว่าง
        ทุกตัว รวมถึง nbsp ซึ่งนับเป็น word-separator ตาม CSS Text ด้วย ข้อยาวกับข้อสั้น
        จึงเริ่มข้อความไม่ตรงกัน — หุ้มเลขข้อไว้ใน inline-block ซึ่งเป็น atomic inline
        การจัดชิดขอบของบรรทัดนอกจึงยืดช่องว่างข้างในไม่ได้ ระยะนี้คงที่ทุกข้อ
      */}
      {readLegalRefs(ctx.draft)
        .filter((text) => text.trim())
        .map((text, i) => (
          <Sub key={i}>
            <span className="inline-block">{`7.${toThaiDigits(i + 1)} `}</span>
            {text.trim()}
          </Sub>
        ))}

      <div className="font-bold pl-8 pt-1">8. ข้อพิจารณา</div>
      {/* ไม่ติ๊ก = เว้นเป็นเส้นประให้เขียนด้วยลายมือ จำนวนบรรทัดเท่าความสูงข้อความเดิม */}
      {readShowRationale(ctx.draft) ? (
        <>
        <Sub>
          (ชื่อ-สกุล) พยาน เป็น (ผู้กล่าวหา ผู้เสียหาย ผู้ทำคำร้อง ผู้ร้องทุกข์กล่าวโทษ ผู้ให้ถ้อยคำ ผู้แจ้งเบาะแส)
          มีพฤติการณ์ถูกคุกคามโดย
          <Fill w="180px">{ctx.val('ผู้คุกคาม', '')}</Fill>
        </Sub>
        <Sub>
          จากการตรวจสอบคำร้องตลอดจนเอกสารหลักฐานต่างๆ และการสอบถามข้อมูลผู้รับผิดชอบคดี พยานมีความเกี่ยวพันและมีความสำคัญต่อรูปคดี
          สามารถให้ข้อมูลอันเป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน และปราบปรามการทุจริตในภาครัฐ ได้ถูกข่มขู่คุกคาม
          (ก่อน ขณะ หรือหลังจากที่ได้ให้ถ้อยคำ แจ้งเบาะแสหรือให้ข้อมูล) และอาจไม่ได้รับความปลอดภัย
        </Sub>
        <Sub>
          พิจารณาแล้วเห็นว่าการให้ข้อมูลและพยานหลักฐานของ (ชื่อ สกุล) พยาน เป็นประโยชน์ต่อการดำเนินการเกี่ยวกับการป้องกัน
          และปราบปรามการทุจริตในภาครัฐ จากการตรวจสอบแล้ว พยาน ได้รับภัยคุกคามจริงจากการให้ข้อมูลและพยานหลักฐานกับ
          (เจ้าหน้าที่ ป.ป.ท., พนักงาน ป.ป.ท.) ผู้รับผิดชอบ ดังนั้นเห็นควรจัดให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
          ดังนี้
        </Sub>
        </>
      ) : (
        /* เยื้องซ้ายให้ตรงกับหัวข้อ 8. เว้นขอบขวา และเว้นระยะใต้หัวข้อก่อนเริ่มเส้นประ */
        <div className="pl-8 pr-8 pt-3">
          <DottedRows n={KB6_RATIONALE_BLANK_ROWS} />
        </div>
      )}
      {/* ข้อ 4 = ประสานหน่วยงานอื่นคุ้มครองแทน จึงไม่มีคำสั่งมอบหมายชุดเจ้าพนักงานตามข้อ 8.1 */}
      {!kb6Methods(ctx).includes(KB6_METHOD_EXTERNAL) && (
        <>
          <div className="pl-12">
            8.1 มอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยาน ตามมาตรการคุ้มครองเบื้องต้น โดยมีองค์ประกอบดังนี้ ดังต่อไปนี้
          </div>
          <OfficerRoster ctx={ctx} keyPrefix="ชุด" />
        </>
      )}

      <Row className="pl-12 pt-1">
        <span>8.2 ดำเนินการคุ้มครองโดยการ</span>
        <Fill w="120px">{ctx.val('ดำเนินการโดย', '')}</Fill>
        <span>เลือกรูปแบบการคุ้มครอง</span>
        <Fill grow>{ctx.val('รูปแบบการคุ้มครอง', '')}</Fill>
      </Row>
      <ProtectionMethods withFifth={false} />
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={3} />
      <Sub>5. ดำเนินการอื่นใด เช่น จัดให้มีการติดต่อสอบถามความเป็นอยู่หรือตรวจสถานที่อยู่อย่างสม่ำเสมอ</Sub>
      <Row className="pl-12">
        <span>ตั้งแต่วันที่</span>
        <Fill w="90px">{beDate(ctx.val('เริ่มวันที่', ''))}</Fill>
        <span>ถึงวันที่</span>
        <Fill w="130px">{beDate(ctx.val('ถึงวันที่', ''))}</Fill>
        <span>(รวม</span>
        <Fill w="60px">{ctx.val('รวมเดือน', '')}</Fill>
        <span>เดือน</span>
        <Fill w="50px">{ctx.val('รวมวัน', '')}</Fill>
        <span>วัน) ทั้งนี้ หากเจ้าพนักงานปฏิบัติ</span>
      </Row>
      <div>
        หน้าที่คุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น เห็นว่าพฤติการณ์แห่งคดีเปลี่ยนแปลงไป
        อาจเปลี่ยนรูปแบบการคุ้มครองพยานได้ตามความเหมาะสม โดยคำนึงถึงความปลอดภัยของพยาน
      </div>

      <div className="font-bold pl-8 pt-1">9. ความเห็นและข้อเสนอแนะ</div>
      <Sub>
        9.1 เห็นควรจัดให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น โดยมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
        ตาม 8.1 พร้อมได้เสนอคำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น มาพร้อมนี้
      </Sub>
      <Sub>9.2 เห็นควรดำเนินการคุ้มครอง ตาม 8.2</Sub>
      <div className="pl-12">จึงเรียนมาเพื่อโปรดพิจารณา</div>

      <div className="mt-6 text-center">
        <div>
          ({ctx.val('ผู้เสนอ', ctx.caseItem?.assignedOfficer || '')}
          <span className="inline-block w-24" />)
        </div>
        <div>นักสืบสวนสอบสวนชำนาญการ</div>
      </div>

      {/* ข้อ 10-13 ลงนามจากหน้าแบบ คบ.6 — ชื่อและวันที่ที่ลงนามแล้วจะพิมพ์ใต้ช่องลายมือชื่อ */}
      {[
        { no: '10', label: 'ความเห็นผู้บังคับบัญชาชั้นต้น', key: 'ความเห็นผู้บังคับบัญชาชั้นต้น', signer: 'ผู้อำนวยการกลุ่ม', name: ctx.caseItem?.kb6SupervisorSignedBy || ctx.val('ผู้บังคับบัญชา', 'นายกิตติศักดิ์ ธรรมรักษ์'), signedAt: ctx.caseItem?.kb6SupervisorSignedAt },
        { no: '11', label: 'ความเห็นผู้อำนวยการสำนัก', key: 'ความเห็นผู้อำนวยการ', signer: 'ผู้อำนวยการ', name: ctx.caseItem?.kb6DirectorSignedBy || ctx.val('ผู้อำนวยการ', ctx.caseItem?.assignedBy || ''), signedAt: ctx.caseItem?.kb6DirectorSignedAt },
        { no: '12', label: 'ความเห็นรองเลขาธิการฯ', key: 'ความเห็นรองเลขาธิการ', signer: 'รองเลขาธิการคณะกรรมการ ป.ป.ท', name: ctx.caseItem?.kb6DeputySignedBy || ctx.val('รองเลขาธิการ', ''), signedAt: ctx.caseItem?.kb6DeputySignedAt },
        { no: '13', label: 'ความเห็นเลขาธิการฯ', key: 'ความเห็นเลขาธิการ', signer: 'เลขาธิการคณะกรรมการ ป.ป.ท', name: ctx.caseItem?.kb6SecretarySignedBy || ctx.val('เลขาธิการ', ctx.caseItem?.secretarySignedBy || ''), signedAt: ctx.caseItem?.kb6SecretarySignedAt },
      ].map((row) => (
        <div key={row.no} className="mt-3">
          <div className="font-bold">
            {row.no}. {row.label} (เรื่องที่ <span className="inline-block w-16" />)
          </div>
          <SolidRows n={2}>{ctx.val(row.key, '')}</SolidRows>
          <div className="mt-5 text-center">
            <div>
              ({row.name}
              <span className="inline-block w-20" />)
            </div>
            <div>{row.signer}</div>
            {row.signedAt && <div>ลงนามเมื่อ {row.signedAt}</div>}
          </div>
        </div>
      ))}
    </>
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
                  <Fill w="60px">{ctx.val('วันที่', '')}</Fill>
                  <span>เดือน</span>
                  <Fill w="110px">{ctx.val('เดือน', '')}</Fill>
                  <span>พ.ศ.</span>
                  <Fill w="70px">{ctx.val('พ.ศ.', '')}</Fill>
                </Row>
              </div>
              <div>คำร้องขอยุติการคุ้มครองพยาน</div>
            </>
          }
        />

        <div className="space-y-1">
          <Row>
            <span className="font-bold w-6">1.</span>
            <span className="font-bold">ข้าพเจ้า</span>
            <span>นาย/นาง/ นางสาว/อื่นๆ</span>
            <Fill grow>{ctx.val('ชื่อผู้ยื่น', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow>{ctx.val('นามสกุลผู้ยื่น', '')}</Fill>
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
              <Fill grow>{ctx.val('ความสัมพันธ์ใกล้ชิด', '')}</Fill>
            </Row>
          </div>

          <Row className="flex-wrap">
            <span className="font-bold w-6">2.</span>
            <span className="font-bold">วิธีการ/มาตรการที่ใช้ในการคุ้มครองพยาน</span>
            <CheckBox checked={method === 'การคุ้มครองชั่วคราว'} label="การคุ้มครองชั่วคราว" />
            <CheckBox checked={method === 'การคุ้มครองเบื้องต้น'} label="การคุ้มครองเบื้องต้น" />
          </Row>

          <Row>
            <span className="font-bold w-6">3.</span>
            <span className="font-bold">หน่วยงานที่ดำเนินการคุ้มครองพยาน</span>
            <Fill grow>{ctx.val('หน่วยงานคุ้มครอง', 'สำนักงาน ป.ป.ท.')}</Fill>
          </Row>

          <Row>
            <span className="font-bold w-6">4.</span>
            <span className="font-bold">ข้อมูลพยาน</span>
            <span>ชื่อ นาย/นาง/นางสาว/อื่นๆ</span>
            <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-10 space-y-1">
            <Row>
              <span>อาชีพ</span>
              <Fill grow>{ctx.val('อาชีพ', '')}</Fill>
            </Row>
            <div className="flex items-baseline gap-2">
              <span>สถานภาพ</span>
              {['โสด', 'สมรส', 'หย่า', 'หม้าย'].map((o) => (
                <CheckBox key={o} checked={ctx.val('สถานภาพ') === o} label={o} />
              ))}
            </div>
            <Row>
              <span>ชื่อบิดา</span>
              <Fill grow>{ctx.val('ชื่อบิดา', '')}</Fill>
              <span>ชื่อมารดา</span>
              <Fill grow>{ctx.val('ชื่อมารดา', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน (ที่สามารถติดต่อได้)</span>
              <Fill grow>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <Fill grow> </Fill>
              <span>โทรศัพท์</span>
              <Fill grow>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow>{ctx.val('สถานที่ทำงาน', '')}</Fill>
              <span>โทรศัพท์</span>
              <Fill grow>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขประจำตัวประชาชน</span>
              <IdBoxes value={ctx.val('เลขบัตรประชาชน', '')} />
              <span>หรือ</span>
            </Row>
            <Row>
              <span>เลขที่บัตรประจำตัวอื่นๆ (ระบุ)</span>
              <Fill grow>{ctx.val('บัตรอื่นๆ', '')}</Fill>
              <span>ออกโดย</span>
              <Fill grow>{ctx.val('ออกโดย', '')}</Fill>
            </Row>
          </div>

          <Row>
            <span className="font-bold w-6">5.</span>
            <span className="font-bold">บุคคลที่สามารถติดต่อได้</span>
            <Fill grow>{ctx.val('ผู้ติดต่อได้', '')}</Fill>
            <span>ที่อยู่</span>
            <Fill grow>{ctx.val('ผู้ติดต่อที่อยู่', '')}</Fill>
          </Row>
          <Row className="pl-10">
            <Fill grow> </Fill>
            <span>โทรศัพท์</span>
            <Fill grow>{ctx.val('ผู้ติดต่อโทรศัพท์', '')}</Fill>
          </Row>
          <Row className="pl-10">
            <span>สถานที่ทำงาน</span>
            <Fill grow>{ctx.val('ผู้ติดต่อที่ทำงาน', '')}</Fill>
            <span>โทรศัพท์</span>
            <Fill grow>{ctx.val('ผู้ติดต่อโทรที่ทำงาน', '')}</Fill>
          </Row>

          <Row>
            <span className="font-bold w-6">6.</span>
            <span className="font-bold">มีความประสงค์ขอให้ยุติการคุ้มครอง</span>
          </Row>
          <div className="pl-10 space-y-1">
            <CheckLine checked={ctx.val('ยุติให้ใคร', 'พยาน') === 'พยาน'}>พยาน</CheckLine>
            <CheckLine checked={ctx.val('ยุติให้ใคร') === 'ผู้ใกล้ชิด'}>
              <span>บุคคลผู้มีความสัมพันธ์ใกล้ชิดกับพยาน (ระบุชื่อ – สกุล)</span>
              <Fill grow>{ctx.val('ชื่อผู้ใกล้ชิด', '')}</Fill>
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
        <div className="font-bold mb-1">7. เหตุผลในการขอให้ยุติการคุ้มครอง</div>
        <DottedRows n={14}>
          {ctx.val('เหตุผลการยุติ', ctx.caseItem?.terminationRequest?.reason || '')}
        </DottedRows>

        <div className="font-bold mt-3 mb-1">8. เอกสารประกอบการยื่นคำร้อง</div>
        <div className="pl-8 space-y-1">
          <CheckLine checked={docs.includes('สำเนาบัตรประชาชน')}>
            <span>สำเนาบัตรประชาชน/บัตรประจำตัวอื่นๆ (ระบุ)</span>
            <Fill grow>{ctx.val('บัตรอื่นๆ', '')}</Fill>
          </CheckLine>
          <CheckLine checked={docs.includes('สำเนาทะเบียนบ้าน')}>สำเนาทะเบียนบ้าน</CheckLine>
          <CheckLine checked={Boolean(ctx.val('เอกสารอื่นๆ'))}>
            <span>เอกสารอื่นๆ</span>
            <Fill grow>{ctx.val('เอกสารอื่นๆ', '')}</Fill>
          </CheckLine>
        </div>

        <div className="mt-12 space-y-6">
          <SignSlot
            prefix="(ลงชื่อ)"
            role="ผู้ยื่นคำร้อง"
            sign={ctx.signatures['kb7-applicant']}
            fallbackName={ctx.caseItem?.person}
            showPosition
            position={ctx.val('ตำแหน่งผู้ยื่น', '')}
          />
          <SignSlot
            prefix="(ลงชื่อ)"
            role="เจ้าพนักงาน"
            sign={derivedSign(
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
          <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          <span>(ระบุชื่อพยาน/</span>
        </Row>
        <Row>
          <span>ผู้ขอรับการคุ้มครอง)</span>
          <Fill grow> </Fill>
          <span>รวมจำนวน</span>
          <Fill w="70px">{ctx.val('จำนวนวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
          <span>วัน โดยนับตั้งแต่วันที่</span>
          <Fill w="70px">{ctx.val('เริ่มวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="100px">{ctx.val('เริ่มเดือน', '')}</Fill>
        </Row>
        <Row>
          <span>พ.ศ.</span>
          <Fill w="80px">{ctx.val('เริ่มพ.ศ.', '')}</Fill>
          <span>ถึงวันที่</span>
          <Fill w="70px">{ctx.val('ถึงวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px">{ctx.val('ถึงเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px">{ctx.val('ถึงพ.ศ.', '')}</Fill>
          <span>นั้น</span>
        </Row>

        <LetterParagraph>
          อาศัยอำนาจตามความในมาตรา 51 แห่งพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551
          และที่แก้ไขเพิ่มเติม ประกอบระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
          พ.ศ. 2554 ข้อ 15 และ ข้อ 16 จึงมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น
          โดยมีองค์ประกอบและอำนาจหน้าที่ ดังต่อไปนี้
        </LetterParagraph>

        <div className="font-bold pl-8">องค์ประกอบ</div>
        <OfficerRoster ctx={ctx} keyPrefix="ชุด" />

        <div className="font-bold pl-8 pt-1">อำนาจหน้าที่</div>
        <div className="pl-12 space-y-1 leading-relaxed text-justify">
          <div>
            1. ดำเนินการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้นและให้ปฏิบัติในส่วนที่เกี่ยวข้องกับการคุ้มครองพยานตามที่ระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
            พ.ศ. 2554 กำหนดโดยเคร่งครัด
          </div>
          <div>
            2. พิจารณาและเสนอความเห็นในวิธีการ การเปลี่ยนแปลง หรือยกเลิกวิธีการคุ้มครองพยานทั้งหมดหรือบางส่วนต่อเลขาธิการคณะกรรมการ
            ป.ป.ท.
          </div>
          <div>
            3. รายงานผลการดำเนินการ การปฏิบัติ รวมถึงเหตุสำคัญอื่นใดต่อเลขาธิการคณะกรรมการ ป.ป.ท. ในห้วงเวลาที่จำเป็น
            หรือทุกระยะเวลาตามความเหมาะสม โดยอาจเสนอความเห็นเป็นข้อพิจารณา หรือ ข้อสั่งการ ประกอบด้วยก็ได้
          </div>
          <div>4. ดำเนินการอื่นใดตามที่เลขาธิการคณะกรรมการ ป.ป.ท. มอบหมาย</div>
        </div>

        <div className="pl-12 pt-1">ทั้งนี้ ตั้งแต่บัดนี้เป็นต้นไป</div>
        <Row className="pl-16">
          <span>สั่ง ณ วันที่</span>
          <Fill w="70px">{ctx.val('สั่งวันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="130px">{ctx.val('สั่งเดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px">{ctx.val('สั่งพ.ศ.', '')}</Fill>
        </Row>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 items-end">
        <WitnessAckBox sign={ctx.signatures['kb8-witness']} fallbackName={ctx.caseItem?.person} />
        <div className="text-center">
          <div className="text-left">(ลงชื่อ)</div>
          <div>
            (
            {ctx.val('เลขาธิการ', ctx.caseItem?.secretarySignedBy || '')}
            <span className="inline-block w-28" />)
          </div>
          <div className="leading-tight">เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ</div>
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
            <Fill grow>{beDate(ctx.val('คำร้องลงวันที่', ctx.caseItem?.createdAt || ''))}</Fill>
          </>
        }
      />

      <LetterParagraph>
        ตามที่ท่านได้ยื่นคำร้องขอให้สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
        ทำการคุ้มครองแก่ พยาน / บุคคลที่เกี่ยวข้อง ตามระเบียบคณะกรรมการป้องกัน และปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2554 นั้น
      </LetterParagraph>

      <LetterParagraph>
        บัดนี้ สำนักงาน ป.ป.ท. ได้อนุมัติ เมื่อวันที่{' '}
        <Fill w="180px">{beDate(ctx.val('วันที่อนุมัติ', ctx.caseItem?.resultAt || ''))}</Fill> ให้คุ้มครอง
        พยาน/บุคคลที่เกี่ยวข้อง แล้ว ขอให้ท่านปฏิบัติตามเงื่อนไขการปฏิบัติระหว่างอยู่ในความคุ้มครอง
        หากผิดเงื่อนไขอาจทำให้การคุ้มครองสิ้นสุดลง
      </LetterParagraph>

      <LetterParagraph>จึงเรียนมาเพื่อโปรดทราบ</LetterParagraph>

      <LetterSignOff
        sign={derivedSign(ctx.caseItem?.kb9SignedBy || ctx.caseItem?.secretarySignedBy, ctx.caseItem?.kb9SignedAt)}
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
            <Fill grow>{beDate(ctx.val('คำร้องลงวันที่', ctx.caseItem?.createdAt || ''))}</Fill>
          </>
        }
      />

      <LetterParagraph>
        ตามที่ท่านได้ยื่นคำร้องขอให้สำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ (สำนักงาน ป.ป.ท.)
        ทำการคุ้มครองแก่ พยาน / บุคคลที่เกี่ยวข้อง ตามระเบียบคณะกรรมการป้องกัน และปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2554 นั้น
      </LetterParagraph>

      <LetterParagraph>
        บัดนี้ สำนักงาน ป.ป.ท. พิจารณาแล้วเห็นว่า{' '}
        <span className="official-dotted-fill">
          {ctx.val('สาระสำคัญ', ctx.caseItem?.resultReason || '(เหตุผลที่ไม่ให้พยานได้รับการคุ้มครอง)')}
        </span>
        <br />
        <Fill w="55%"> </Fill> จึงมีคำสั่งไม่ให้พยานได้รับการคุ้มครอง
      </LetterParagraph>

      <LetterParagraph>
        อนึ่ง ท่านมีสิทธิอุทธรณ์คำสั่งไม่ให้พยานได้รับการคุ้มครอง ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง
        โดยให้ยื่นเป็นคำร้องต่อคณะกรรมการ ป.ป.ท. ทั้งนี้ ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
        ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2554 ข้อ 2
      </LetterParagraph>

      {ctx.caseItem?.appealDueAt && (
        <div className="pl-12">
          (วันที่ได้รับหนังสือ {docDate(ctx.caseItem.deliveredAt)} · ครบกำหนดยื่นอุทธรณ์{' '}
          {docDate(ctx.caseItem.appealDueAt)})
        </div>
      )}

      <LetterParagraph>จึงเรียนมาเพื่อโปรดทราบ</LetterParagraph>

      <LetterSignOff
        sign={derivedSign(ctx.caseItem?.kb10SignedBy, ctx.caseItem?.kb10SignedAt)}
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
            <span className="font-bold w-6">1.</span>
            <span className="font-bold">ข้าพเจ้า นาย/นาง/นางสาว</span>
            <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <div>
              ได้ยื่นคำร้องขอให้คุ้มครองพยานต่อสำนักงาน ป.ป.ท. และต่อมาสำนักงาน ป.ป.ท. ได้อนุมัติให้ใช้มาตรการ
            </div>
            <Row>
              <span>เบื้องต้นในการคุ้มครองพยานแก่</span>
              <Fill grow>{ctx.val('ผู้ได้รับการคุ้มครอง', ctx.caseItem?.person || '')}</Fill>
            </Row>
            <div className="leading-relaxed text-justify">
              ตามพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2551 และที่แก้ไขเพิ่มเติม
              และระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
              พ.ศ. 2554
            </div>
          </div>

          <Row className="pt-1">
            <span className="font-bold w-6">2.</span>
            <span className="font-bold">ข้อมูลพยาน ชื่อ นาย/นาง นางสาว</span>
            <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>อาชีพ</span>
              <Fill grow>{ctx.val('อาชีพ', '')}</Fill>
              <span>สถานภาพ</span>
              <Fill grow>{ctx.val('สถานภาพ', '')}</Fill>
            </Row>
            <Row>
              <span>ชื่อบิดา</span>
              <Fill grow>{ctx.val('ชื่อบิดา', '')}</Fill>
              <span>ชื่อมารดา</span>
              <Fill grow>{ctx.val('ชื่อมารดา', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน</span>
              <Fill grow>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <Fill grow> </Fill>
              <span>โทรศัพท์</span>
              <Fill grow>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow>{ctx.val('สถานที่ทำงาน', '')}</Fill>
              <span>โทรศัพท์</span>
              <Fill grow>{ctx.val('โทรศัพท์ที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขประจำตัวประชาชน</span>
              <Fill grow>{ctx.val('เลขบัตรประชาชน', '')}</Fill>
            </Row>
            <Row>
              <span>เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ</span>
              <Fill grow>{ctx.val('เลขบัตรเจ้าหน้าที่รัฐ', '')}</Fill>
              <span>สังกัด</span>
              <Fill grow>{ctx.val('สังกัด', '')}</Fill>
            </Row>
            <Row>
              <span>วันออกบัตร</span>
              <Fill grow>{beDate(ctx.val('วันออกบัตร', ''))}</Fill>
              <span>บัตรหมดอายุ</span>
              <Fill grow>{beDate(ctx.val('บัตรหมดอายุ', ''))}</Fill>
            </Row>
          </div>

          <div className="font-bold pt-1">3. รูปแบบการคุ้มครองพยาน</div>
          <div className="pl-8 space-y-1 leading-relaxed text-justify">
            <CheckLine checked={forms.includes('3.1')}>
              3.1 จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัยให้กับพยานหรือบุคคลอื่นที่มีความสัมพันธ์ใกล้ชิดกับพยานให้ได้รับความปลอดภัยอันเป็นผลมาจากการที่จะมาหรือได้มาเป็นพยาน
            </CheckLine>
            <CheckLine checked={forms.includes('3.2')}>
              3.2 จัดให้พยานอยู่ในสถานที่เหมาะสมอันเป็นที่อยู่อาศัยประจำของพยานหรือของบุคคลอื่นที่พยานไว้วางใจ
              หรือที่ส่วนราชการของสำนักงานซึ่งมีอำนาจหน้าที่เกี่ยวกับการคุ้มครองพยานกำหนด โดยให้พยานได้รับความปลอดภัยมากที่สุด
            </CheckLine>
            <CheckLine checked={forms.includes('3.3')}>
              3.3 ปกปิด และรักษาความลับที่เกี่ยวกับชื่อตัว ชื่อสกุล ที่อยู่ ภาพ หรือข้อมูลอย่างอื่นที่สามารถระบุตัวพยานในการคุ้มครองความปลอดภัยพยาน
            </CheckLine>
            <CheckLine checked={forms.includes('3.4')}>
              3.4 ดำเนินการอื่นใดเพื่อให้พยานได้รับความช่วยเหลือ หรือได้รับการคุ้มครองตามที่เห็นสมควร
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
            sign={ctx.signatures['kb11-witness']}
            fallbackName={ctx.caseItem?.person}
          />
        </div>
      </>
    )
  },

  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold">4. ระยะเวลาการคุ้มครองพยาน</div>
      <LetterParagraph>
        สำนักงาน ป.ป.ท. จะอนุมัติการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น คราวละไม่เกิน 3 เดือน
        หากเจ้าหน้าที่ผู้ทำหน้าที่คุ้มครองพยาน พยานผู้ร้องขอ หรือบุคคลอื่นที่มีประโยชน์เกี่ยวข้อง เห็นว่ายังมีความจำเป็น
        และสมควรในการขยายระยะเวลาการคุ้มครองพยานต่อ โดยคำนึงถึงความปลอดภัยของพยาน
        และความคุ้มค่าในการใช้จ่ายงบประมาณของทางราชการเป็นสำคัญ สามารถร้องขอเป็นหนังสือต่อสำนักงาน ป.ป.ท.
        เพื่อขออนุมัติเลขาธิการคณะกรรมการ ป.ป.ท. ทำการคุ้มครองพยาน ต่อไปเป็นคราวๆ คราวละไม่เกิน 3 เดือน
        แต่ทั้งนี้ต้องไม่เกิน 6 เดือน
      </LetterParagraph>

      <div className="font-bold pt-1">5. วิธีการ และเงื่อนไขการคุ้มครองพยาน มีดังต่อไปนี้</div>
      <div className="pl-8 leading-relaxed text-justify">
        (วิธีการ และเงื่อนไขการคุ้มครองพยาน เป็นข้อตกลงยินยอมรับการคุ้มครองพยานกับสำนักงาน ป.ป.ท. ตามมาตรการเบื้องต้น
        โดยพยานรับทราบสิทธิที่พึงจะได้รับการคุ้มครองตามกฎหมาย และยินยอมปฏิบัติตามหลักเกณฑ์ ดังกล่าว )
      </div>
      <div className="space-y-0.5 pt-1">
        <Sub>
          1. พยานได้รับทราบสิทธิที่พึงจะได้รับตามระเบียบกระทรวงยุติธรรมว่าด้วยค่าตอบแทนและค่าใช้จ่ายแก่พยานฯ
          โดยให้เลขาธิการคณะกรรมการ ป.ป.ท. เป็นผู้พิจารณาในเรื่องค่าใช้จ่ายการคุ้มครองพยานตามความเหมาะสม
        </Sub>
        <Sub>
          2. หากพยานต้องการออกเดินทางไปที่ใดๆ หรือต้องการไปปรากฏตัวในที่สาธารณะ เช่น งานสังคมต่างๆ การประชุม
          หรือต้องการติดต่อสื่อสารบุคคลใดๆ พยานจะแจ้งให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองพยานทราบล่วงหน้า
          และได้รับความเห็นชอบจากเจ้าหน้าที่ฯ ก่อน
        </Sub>
        <Sub>
          3. การเดินทางออกนอกพื้นที่คุ้มครองพยาน จะกระทำมิได้ เว้นแต่ได้รับความเห็นชอบจากเจ้าหน้าที่ที่คุ้มครองพยานก่อน
          โดยต้องแจ้งความประสงค์ต่อเจ้าหน้าที่คุ้มครองล่วงหน้าอย่างน้อย 5 วันทำการ
        </Sub>
        <Sub>
          4. พยานจะให้ความร่วมมือ และเชื่อฟังคำแนะนำของเจ้าหน้าที่ที่คุ้มครองพยานของสำนักงาน ป.ป.ท.
          หรือหน่วยงานที่ให้ความคุ้มครองแก่พยาน ในเรื่องที่เกี่ยวข้องกับความปลอดภัย และเรื่องอื่นๆ
          ที่อาจทำให้เกิดความเสียหายแก่ตัวของพยาน และผู้เกี่ยวข้องอย่างเคร่งครัด
        </Sub>
        <Sub>
          5. พยานจะไม่ทำให้เกิดความเสี่ยงต่อความมั่นคงปลอดภัยของตนเอง และเจ้าหน้าที่ที่ดำเนินการคุ้มครองพยาน
        </Sub>
        <Sub>
          6. หากพยานได้รับข่าวสารว่ากำลังถูกปองร้าย หรือมีเหตุอันควรเชื่อว่าจะมีอันตราย หรือมีการเข้ามายุ่งเหยิงกับพยาน
          ต้องแจ้งให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองพยานทราบทันที
        </Sub>
        <Sub>
          7. ในกรณีที่มีความจำเป็น พยานยินยอมให้เจ้าหน้าที่ที่ดำเนินการคุ้มครองจัดให้พยานอยู่ในสถานที่ที่ปลอดภัยหรือมีการปกปิด
          มิให้มีการเปิดเผยข้อมูลเกี่ยวกับพยาน ทั้งนี้ ตามความเหมาะสมแก่สถานะและสภาพของพยาน และลักษณะของคดีอาญาที่เกี่ยวข้อง
        </Sub>
        <Sub>
          8. ระหว่างการอยู่ในการคุ้มครองของสำนักงาน ป.ป.ท หรือหน่วยงานที่ได้รับมอบหมาย
          หากพยานกระทำการอันเป็นความผิดตามที่กฎหมายบัญญัติ ยกเว้นความผิดโดยประมาทหรือลหุโทษ จะถูกยกเลิกการคุ้มครองพยานทันที
        </Sub>
      </div>

      <div className="mt-4">
        <SignSlot
          role="พยานผู้รับการคุ้มครอง"
          sign={ctx.signatures['kb11-witness']}
          fallbackName={ctx.caseItem?.person}
        />
      </div>
    </>
  ),

  (ctx) => (
    <>
      <PageNumber page={3} />
      <Sub>
        9. ตามข้อ 1 การเบิกจ่ายค่าใช้จ่ายในการคุ้มครองพยาน กรณีการเบิกค่าเช่าที่พักอาศัยของพยาน
        ให้เบิกจ่ายตามความเป็นจริง ความเหมาะสม และคำนึงถึงการใช้งบประมาณของทางราชการเป็นสำคัญ
        โดยเจ้าหน้าที่ผู้ทำหน้าที่คุ้มครองพยาน เป็นผู้ประมาณการในเรื่องค่าใช้จ่ายในการคุ้มครองพยาน ผ่านทางผู้อำนวยกอง/สำนัก
        เพื่อให้เลขาธิการคณะกรรมการ ป.ป.ท. พิจารณาอนุมัติ ตามความเป็นจริง
      </Sub>
      <div className="pl-12">ข้อตกลงอื่น ๆ (ระบุรายละเอียดวิธีการ และเงื่อนไขการคุ้มครองพยาน เพิ่มเติม)</div>
      <div className="pl-8 pt-1">
        <DottedRows n={3}>{ctx.val('ข้อตกลงอื่น', '')}</DottedRows>
      </div>

      <div className="font-bold pt-2">6. การสิ้นสุดการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น</div>
      <Sub>
        1. ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
        พ.ศ. 2554 ข้อ 18 (1)–(4) และข้อ 19
      </Sub>
      <Sub>
        2. เจ้าหน้าที่ที่คุ้มครองพยานมีอำนาจตักเตือนพยาน โดยจัดทำเป็นหนังสือแจ้งให้พยานทราบ กรณี พยานทำผิดวิธีการ
        และเงื่อนไขการคุ้มครองพยาน (ตามข้อ 5) หากพยานฝ่าฝืนวิธีการและเงื่อนไขการคุ้มครองพยานดังกล่าว ในข้อหนึ่งข้อใดอีก
        ซึ่งพยานได้ทำบันทึกข้อตกลงไว้กับสำนักงาน ป.ป.ท. ถือเป็นเหตุให้การคุ้มครองพยานสิ้นสุดลง
      </Sub>
      <Sub>
        ทั้งนี้ พยานยอมรับว่า หากไม่ปฏิบัติตามเงื่อนไขที่กำหนดข้างต้น อาจเป็นเหตุให้การคุ้มครองพยานตามมาตรการเบื้องต้นสิ้นสุด
        ตามระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปราม
        การทุจริต พ.ศ. 2554 ข้อ 18 และข้อ 19
      </Sub>
      <Sub>
        พยานขอรับรองว่าสำนักงาน ป.ป.ท. มิได้ทำ หรือจัดให้ทำการใด ๆ ซึ่งเป็นการล่อลวง ขู่เข็ญ หรือให้สัญญา
        เพื่อจูงใจให้พยานให้ถ้อยคำใด ๆ และพยาน
        <Fill w="200px">{ctx.val('คำรับรองพยาน', '')}</Fill>
        ขอรับรองว่าเป็นการบันทึกถ้อยคำที่ถูกต้อง จึงลงลายมือชื่อไว้ต่อเจ้าหน้าที่
      </Sub>

      <div className="mt-6 space-y-4">
        <SignSlot
          role="พยานผู้รับการคุ้มครอง"
          sign={ctx.signatures['kb11-witness']}
          fallbackName={ctx.caseItem?.person}
        />
        <SignSlot
          role="ผู้ให้การคุ้มครอง"
          sign={ctx.signatures['kb11-officer']}
          fallbackName={ctx.caseItem?.assignedOfficer}
        />
        <SignSlot role="พยาน" sign={ctx.signatures['kb11-attest1']} />
        <SignSlot role="พยาน" sign={ctx.signatures['kb11-attest2']} />
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
          <Fill w="60px">{ctx.val('วันที่', '')}</Fill>
          <span>เดือน</span>
          <Fill w="120px">{ctx.val('เดือน', '')}</Fill>
          <span>พ.ศ.</span>
          <Fill w="80px">{ctx.val('พ.ศ.', '')}</Fill>
        </Row>

        <div className="space-y-1">
          <Row className="pl-10">
            <span className="font-bold">1.</span>
            <span>ข้าพเจ้า</span>
            <Fill grow>{ctx.val('ผู้ส่งมอบ', ctx.caseItem?.assignedOfficer || '')}</Fill>
          </Row>
          <Row>
            <span>ตำแหน่ง</span>
            <Fill grow>{ctx.val('ตำแหน่งผู้ส่งมอบ', '')}</Fill>
            <span>สังกัดสำนักงาน ป.ป.ท. ซึ่งได้ดำเนินการให้ความคุ้มครองพยาน</span>
          </Row>
          <Row>
            <span>ขอส่งมอบพยาน และ/หรือ บุคคลซึ่งมีความสัมพันธ์ใกล้ชิดกับพยาน ให้กับ</span>
            <Fill w="70px"> </Fill>
            <span>(ระบุหน่วยงาน)</span>
            <Fill grow>
              {ctx.val('หน่วยงานผู้รับมอบ', ctx.caseItem?.transferRequest?.agency || '')}
            </Fill>
          </Row>
          <Row>
            <Fill grow> </Fill>
            <span>เพื่อดำเนินการคุ้มครองพยานให้ได้รับความปลอดภัย</span>
          </Row>
          <Row>
            <span>จำนวน</span>
            <Fill w="90px">{ctx.val('จำนวนคน', String(persons.length + 1))}</Fill>
            <span>คน ดังมีรายชื่อต่อไปนี้</span>
          </Row>

          <div className="pl-12 pt-1">1.1 พยาน</div>
          <div className="pl-20 space-y-1">
            {['1.1.1', '1.1.2', '1.1.3'].map((n, i) => (
              <div key={n} className="flex items-baseline gap-1">
                <span className="w-14">{n}</span>
                <span>ชื่อ</span>
                <Fill grow>{i === 0 ? ctx.val('ชื่อพยาน', ctx.caseItem?.person || '') : ''}</Fill>
                <span>นามสกุล</span>
                <Fill grow>{i === 0 ? ctx.val('นามสกุลพยาน', '') : ''}</Fill>
              </div>
            ))}
          </div>

          <div className="pl-12 pt-1">1.2 บุคคลซึ่งมีความสัมพันธ์ใกล้ชิดกับพยาน</div>
          <div className="pl-20 space-y-1">
            {['1.2.1', '1.2.2', '1.2.3'].map((n, i) => {
              const p = persons[i]
              return (
                <div key={n} className="flex items-baseline gap-1">
                  <span className="w-14">{n}</span>
                  <span>ชื่อ</span>
                  <Fill grow>{p ? `${p.title}${p.firstName}` : ''}</Fill>
                  <span>นามสกุล</span>
                  <Fill grow>{p?.lastName || ''}</Fill>
                </div>
              )
            })}
          </div>

          <div className="pl-12 pt-1">
            2. ในระหว่างการคุ้มครองพยาน ให้บุคคลหรือหน่วยงานที่มีภารกิจเกี่ยวข้องในการคุ้มครอง
          </div>
          <div>พยาน ประสานงานหรือติดต่อระหว่างกัน ดังนี้</div>

          {['2.1', '2.2'].map((n, i) => (
            <div key={n} className="space-y-1 pt-1">
              <Row className="pl-12">
                <span>{n} (ระบุชื่อนามสกุล ตำแหน่ง สังกัด)</span>
                <Fill grow>{ctx.val(`ผู้ประสาน${i + 1}`, '')}</Fill>
                <span>หมายเลขโทรศัพท์</span>
              </Row>
              <Row>
                <span>(ที่ทำงาน)</span>
                <Fill grow>{ctx.val(`ผู้ประสานโทรที่ทำงาน${i + 1}`, '')}</Fill>
                <span>โทรศัพท์ (เคลื่อนที่)</span>
                <Fill grow>{ctx.val(`ผู้ประสานมือถือ${i + 1}`, '')}</Fill>
              </Row>
              <Row>
                <span>โทรสาร</span>
                <Fill grow>{ctx.val(`ผู้ประสานโทรสาร${i + 1}`, '')}</Fill>
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
          <SignSlot role="พยานผู้ส่งมอบ" sign={ctx.signatures['kb12-attest-sender']} />
          <SignSlot role="พยานผู้รับมอบ" sign={ctx.signatures['kb12-attest-receiver']} />
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
          <Fill w="110px">{ctx.val('เลขคดี', ctx.caseItem?.no || '')}</Fill>
          <span>/</span>
          <Fill w="110px">{ctx.val('ปีคดี', '')}</Fill>
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
            <Fill w="45%">{ctx.val('สำนักกอง', '')}</Fill>
          </Row>
          <div className="font-bold">1. ข้อมูลพยาน</div>
          <div className="pl-8 space-y-1">
            <Row>
              <span>ชื่อ นาย/นาง/นางสาว/อื่นๆ</span>
              <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            </Row>
            <Row>
              <span>อาชีพ</span>
              <Fill grow>{ctx.val('อาชีพ', '')}</Fill>
            </Row>
            <Row>
              <span>สถานที่ทำงาน</span>
              <Fill grow>{ctx.val('สถานที่ทำงาน', '')}</Fill>
            </Row>
            <Row>
              <span>ที่อยู่ปัจจุบัน</span>
              <Fill grow>{ctx.val('ที่อยู่ปัจจุบัน', '')}</Fill>
            </Row>
            <Row>
              <span>โทรศัพท์</span>
              <Fill grow>{ctx.val('เบอร์โทรศัพท์', '')}</Fill>
            </Row>
          </div>

          <Row>
            <span className="font-bold">2 เจ้าหน้าที่ที่ดำเนินการคุ้มครอง จำนวน</span>
            <Fill w="110px">{ctx.val('จำนวนเจ้าหน้าที่', '')}</Fill>
            <span>ราย ดังนี้</span>
          </Row>
          <div className="pl-10 space-y-1">
            {['(1)', '(2)', '(3)', '(4)', '(5)'].map((n, i) => (
              <div key={n} className="flex items-baseline gap-1">
                <span className="w-8">{n}</span>
                <span>นาย/นาง/นางสาว</span>
                <Fill grow>{ctx.val(`ชุดชื่อ${i + 1}`, '')}</Fill>
                <span>นามสกุล</span>
                <Fill grow>{ctx.val(`ชุดนามสกุล${i + 1}`, '')}</Fill>
                <span>ตำแหน่ง</span>
                <Fill grow>{ctx.val(`ชุดตำแหน่ง${i + 1}`, '')}</Fill>
              </div>
            ))}
          </div>

          <Row>
            <span className="font-bold">3. ตามคำสั่ง</span>
            <Fill w="200px">{ctx.val('เลขคำสั่ง', ctx.caseItem?.decisionNumber || '')}</Fill>
            <span>ลงวันที่</span>
            <Fill w="200px">{beDate(ctx.val('คำสั่งลงวันที่', ctx.caseItem?.resultAt || ''))}</Fill>
          </Row>
          <Row>
            <span className="font-bold">4. ระยะเวลาให้การคุ้มครอง จำนวน</span>
            <Fill w="130px">{ctx.val('จำนวนวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
            <span>วัน</span>
          </Row>
          <div className="font-bold">
            5. สรุปผลการดำเนินการ{latest ? ` (งวด ${thaiMonthName(latest.period)})` : ''}
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
            <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
            <span>นามสกุล</span>
            <Fill grow>{ctx.val('นามสกุลพยาน', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>พยานในคดีหมายเลข ที่</span>
              <Fill grow>{ctx.val('เลขคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
              <span>ซึ่งสำนักงาน ป.ป.ท. ได้อนุมัติให้ใช้มาตรการทั่วไปในการ</span>
            </Row>
            <div className="leading-relaxed text-justify">
              คุ้มครองพยานเบื้องต้น โดยอาศัยอำนาจตามพระราชบัญญัติมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต
              พ.ศ. 2551 และที่แก้ไขเพิ่มเติม และระเบียบคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ
              ว่าด้วยมาตรการคุ้มครองเบื้องต้นตามกฎหมายว่าด้วยมาตรการของฝ่ายบริหารในการป้องกันและปราบปรามการทุจริต พ.ศ. 2554
            </div>
            <Row>
              <span>ตั้งแต่วันที่</span>
              <Fill w="80px">{ctx.val('เริ่มวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="110px">{ctx.val('เริ่มเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="70px">{ctx.val('เริ่มพ.ศ.', '')}</Fill>
              <span>ถึง</span>
            </Row>
            <Row>
              <span>วันที่</span>
              <Fill w="70px">{ctx.val('ถึงวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="120px">{ctx.val('ถึงเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="70px">{ctx.val('ถึงพ.ศ.', '')}</Fill>
              <span>รวมระยะเวลาในการคุ้มครองพยาน</span>
              <Fill w="70px">{ctx.val('รวมปี', '')}</Fill>
              <span>ปี</span>
              <Fill w="70px">{ctx.val('รวมเดือน', '')}</Fill>
              <span>เดือน</span>
            </Row>
            <Row>
              <Fill w="120px">{ctx.val('รวมวัน', String(ctx.caseItem?.protectionDays || ''))}</Fill>
              <span>
                วัน และบัดนี้การคุ้มครองพยานได้สิ้นสุดลง พยานดังกล่าวได้ร้องขอขยายระยะเวลา
              </span>
            </Row>
            <div>การคุ้มครองพยานต่อไป</div>
          </div>

          <div className="font-bold pt-2">2. ข้อพิจารณาและเหตุผลในการขยายระยะเวลาการคุ้มครองพยาน</div>
          <div className="pl-8">
            <DottedRows n={4}>{ctx.val('เหตุผลขยายเวลา', latest?.reason || '')}</DottedRows>
          </div>

          <Row className="pt-2">
            <span className="font-bold">3. มติที่ประชุมคณะอนุกรรมการกลั่นกรอง ครั้งที่</span>
            <Fill w="80px">{ctx.val('ครั้งที่', '')}</Fill>
            <span>/</span>
            <Fill w="90px">{ctx.val('ปีครั้งที่', '')}</Fill>
            <span>เมื่อวันที่</span>
            <Fill w="70px">{ctx.val('มติวันที่', '')}</Fill>
            <span>เดือน</span>
            <Fill w="100px">{ctx.val('มติเดือน', '')}</Fill>
            <span>พ.ศ.</span>
            <Fill w="60px">{ctx.val('มติพ.ศ.', '')}</Fill>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>ควรให้พยาน ชื่อ นาย/นาง/นางสาว</span>
              <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
              <span>นามสกุล</span>
              <Fill grow>{ctx.val('นามสกุลพยาน', '')}</Fill>
            </Row>
            <Row>
              <span>เข้ารับการคุ้มครองพยานครั้งที่</span>
              <Fill grow>{ctx.val('คุ้มครองครั้งที่', String(requests.length + 1))}</Fill>
              <span>ต่อไป นับตั้งแต่วันที่</span>
              <Fill w="70px">{ctx.val('ขยายเริ่มวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="100px">{ctx.val('ขยายเริ่มเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="80px">{ctx.val('ขยายเริ่มพ.ศ.', '')}</Fill>
            </Row>
            <Row>
              <span>ถึงวันที่</span>
              <Fill w="80px">{ctx.val('ขยายถึงวันที่', '')}</Fill>
              <span>เดือน</span>
              <Fill w="140px">{ctx.val('ขยายถึงเดือน', '')}</Fill>
              <span>พ.ศ.</span>
              <Fill w="90px">{ctx.val('ขยายถึงพ.ศ.', '')}</Fill>
            </Row>
            <Row>
              <span>รวมระยะเวลาในการขอขยายการคุ้มครองพยาน</span>
              <Fill w="120px">{ctx.val('ขยายเดือน', '')}</Fill>
              <span>เดือน</span>
              <Fill w="130px">{ctx.val('ขยายวัน', String(latest?.durationDays || ''))}</Fill>
              <span>วัน</span>
            </Row>
          </div>

          <div className="font-bold pt-2">4. ความเห็นของเลขาธิการคณะกรรมการ ป.ป.ท.</div>
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

          <div className="font-bold pt-2">5. เงื่อนไขการปฏิบัติตามคำสั่ง</div>
          <div className="pl-8">
            <DottedRows n={3}>{ctx.val('เงื่อนไขปฏิบัติ', '')}</DottedRows>
          </div>
        </div>

        <div className="mt-6 text-center">
          <SignSlot
            role="พยานผู้รับการคุ้มครอง"
            sign={ctx.signatures['kb14-witness']}
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
  (ctx) => {
    const kb15 = ctx.caseItem?.kb15
    return (
      <>
        <FormHead ctx={ctx} title="รายงานการให้ความคุ้มครองพยานสิ้นสุด" />

        <div className="space-y-1.5">
          <Row>
            <span className="font-bold w-6">1.</span>
            <span>พยาน ชื่อ นาย/นาง/นางสาว</span>
            <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill>
          </Row>
          <Row>
            <span className="pl-6">คดีหมายเลขที่</span>
            <Fill grow>{ctx.val('เลขคดี', ctx.caseItem?.mainCaseNo || '')}</Fill>
            <span>เลขคำร้อง</span>
            <Fill grow>{ctx.val('เลขคำร้อง', ctx.caseItem?.no || '')}</Fill>
          </Row>

          <Row className="pt-2">
            <span className="font-bold w-6">2.</span>
            <span className="font-bold">คำสั่งที่ให้ความคุ้มครองและระยะเวลาที่ปฏิบัติจริง</span>
          </Row>
          <div className="pl-8 space-y-1">
            <Row>
              <span>ตามคำสั่งที่</span>
              <Fill grow>{ctx.val('คำสั่งเดิม', ctx.caseItem?.decisionNumber || '')}</Fill>
              <span>เริ่มคุ้มครองจริงวันที่</span>
              <Fill grow>{beDate(ctx.val('วันเริ่มจริง', ctx.caseItem?.actualStartedAt?.slice(0, 10) || ''))}</Fill>
            </Row>
            <Row>
              <span>รวมระยะเวลาคุ้มครองสะสม</span>
              <Fill w="120px">{ctx.val('วันสะสม', '')}</Fill>
              <span>วัน</span>
            </Row>
          </div>

          <Row className="pt-2">
            <span className="font-bold w-6">3.</span>
            <span className="font-bold">เหตุแห่งการยุติ</span>
          </Row>
          <div className="pl-8">
            <DottedRows n={3}>{ctx.val('เหตุยุติ', kb15?.summary || '')}</DottedRows>
          </div>

          <Row className="pt-2">
            <span className="font-bold w-6">4.</span>
            <span className="font-bold">สรุปผลการให้ความคุ้มครองและหลักฐานประกอบ</span>
          </Row>
          <div className="pl-8">
            <DottedRows n={5}>{ctx.val('สรุปผล', kb15?.evidenceNote || '')}</DottedRows>
          </div>

          <div className="pt-2 text-[0.95em] leading-relaxed">
            หมายเหตุ — รายงานฉบับนี้เป็นเอกสารประกอบการเสนอเท่านั้น การคุ้มครองจะสิ้นสุดต่อเมื่อ
            มีคำสั่งยุติ (แบบ คบ. 16) ที่ลงนามแล้วและถึงวันที่คำสั่งมีผล
          </div>
        </div>

        <SignRow>
          <SignSlot role="เจ้าหน้าที่ผู้รับผิดชอบ (ผู้จัดทำรายงาน)" sign={ctx.signatures['kb15-officer']} fallbackName={kb15?.createdBy} />
          <SignSlot role="ผู้บังคับบัญชา (ความเห็นตามลำดับชั้น)" sign={ctx.signatures['kb15-supervisor']} fallbackName={kb15?.reviewedBy} />
        </SignRow>
      </>
    )
  },
  (ctx) => (
    <>
      <PageNumber page={2} />
      <div className="font-bold">ความเห็นตามลำดับชั้น</div>
      <DottedRows n={8}>{ctx.val('ความเห็นลำดับชั้น', ctx.caseItem?.kb15?.reviewNote || '')}</DottedRows>
      <div className="font-bold pt-3">เอกสารแนบ</div>
      <DottedRows n={6}>{ctx.val('เอกสารแนบ', '')}</DottedRows>
      <PageFooter page={2} total={2} />
    </>
  ),
]

/* ================================ คบ.16 ================================ *
 * คำสั่งยุติการให้ความคุ้มครองพยาน — แยก "วันที่ออกคำสั่ง" กับ "วันที่มีผล"
 * ---------------------------------------------------------------------- */
const kb16: PageRenderer[] = [
  (ctx) => {
    const kb16 = ctx.caseItem?.kb16
    return (
      <>
        <OrderHead
          ctx={ctx}
          orderTitle="คำสั่งสำนักงานคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ"
          subject="ยุติการให้ความคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น"
        />

        <LetterParagraph>
          ตามที่สำนักงาน ป.ป.ท. ได้มีคำสั่งให้ความคุ้มครองพยาน ราย{' '}
          <Fill grow>{ctx.val('ชื่อพยาน', ctx.caseItem?.person || '')}</Fill> ตามคำสั่งที่{' '}
          <Fill w="140px">{ctx.val('คำสั่งเดิม', ctx.caseItem?.decisionNumber || '')}</Fill> นั้น
        </LetterParagraph>

        <LetterParagraph>
          บัดนี้ปรากฏเหตุแห่งการยุติ ดังนี้
        </LetterParagraph>
        <div className="pl-8">
          <DottedRows n={3}>{ctx.val('เหตุยุติ', kb16?.reason || '')}</DottedRows>
        </div>

        <LetterParagraph>
          จึงมีคำสั่งให้ยุติการให้ความคุ้มครองพยานรายดังกล่าว โดยให้คำสั่งนี้
          <span className="font-bold"> มีผลตั้งแต่วันที่ </span>
          <Fill w="150px">{beDate(ctx.val('วันที่มีผล', kb16?.effectiveAt || ''))}</Fill> เป็นต้นไป
        </LetterParagraph>

        <div className="pt-2 space-y-1">
          <Row>
            <span>สั่ง ณ วันที่</span>
            <Fill w="150px">{beDate(ctx.val('วันที่ออกคำสั่ง', kb16?.issuedAt || ''))}</Fill>
          </Row>
          <Row>
            <span>วันที่หยุดปฏิบัติจริงในพื้นที่</span>
            <Fill w="150px">{beDate(ctx.val('วันหยุดปฏิบัติ', kb16?.operationStoppedAt || ''))}</Fill>
          </Row>
        </div>

        <LetterSignOff
          prefix=""
          sign={ctx.signatures['kb16-authority']}
          name={kb16?.signedBy}
          position={<>เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ</>}
        />
      </>
    )
  },
]

/* ================================ คบ.17 ================================ *
 * หนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ภายใน 30 วัน
 * ---------------------------------------------------------------------- */
const kb17: PageRenderer[] = [
  (ctx) => {
    const kb16 = ctx.caseItem?.kb16
    return (
      <>
        <LetterHead
          ctx={ctx}
          subject="แจ้งคำสั่งยุติการให้ความคุ้มครองพยาน"
          to={<Fill grow>{ctx.val('เรียน', ctx.caseItem?.person || '')}</Fill>}
          reference={
            <Row>
              <span>คำสั่งยุติการให้ความคุ้มครองพยาน ที่</span>
              <Fill grow>{ctx.val('เลขคำสั่งยุติ', kb16?.orderNo || '')}</Fill>
            </Row>
          }
        />

        <LetterParagraph indent>
          ตามที่ท่านได้รับความคุ้มครองตามมาตรการคุ้มครองเบื้องต้นของสำนักงาน ป.ป.ท. นั้น
          สำนักงาน ป.ป.ท. ได้มีคำสั่งให้ยุติการให้ความคุ้มครอง โดยมีผลตั้งแต่วันที่{' '}
          <Fill w="140px">{beDate(ctx.val('วันที่มีผล', kb16?.effectiveAt || ''))}</Fill> ด้วยเหตุ{' '}
          <Fill grow>{ctx.val('เหตุยุติ', kb16?.reason || '')}</Fill>
        </LetterParagraph>

        <LetterParagraph indent>
          หากท่านไม่เห็นด้วยกับคำสั่งดังกล่าว ท่านมีสิทธิอุทธรณ์ต่อคณะกรรมการ ป.ป.ท.
          <span className="font-bold"> ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่งนี้</span>
        </LetterParagraph>

        <LetterSignOff
          sign={ctx.signatures['kb17-signer']}
          name={ctx.val('ผู้ลงนาม', '')}
          position={<>เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ</>}
        />

        <ContactFooter />
      </>
    )
  },
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
}

/** ฟอร์มที่จัดวางเป็นหนังสือราชการ (ครุฑ / บันทึกข้อความ / คำสั่ง) แทนแบบฟอร์มกรอก */
export const LETTER_STYLE_FORMS = [4, 5, 6, 8, 9, 10, 16, 17]

export function getFormPages(formId: number): PageRenderer[] {
  return REGISTRY[formId] || REGISTRY[1]
}
