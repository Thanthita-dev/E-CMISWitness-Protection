import { Button } from '../common/Button'
import React from 'react'
import { FORMS_CATALOG } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { VersionHistory, VersionHistoryEntry } from '../common/VersionHistory'
import {
  Area,
  DateField,
  EditorShell,
  Field,
  Grid,
  OfficerRosterFields,
  Section,
  ThaiDateFields,
} from './fields/FormKit'
import { OutgoingNoticeFormNo } from '../../types/case'

interface GenericKbEditorProps {
  formId: number
  onSaved?: () => void
  /** เลขคำร้องของแฟ้มที่เปิดแบบนี้ — ใช้ผูกการลงนามหนังสือส่งออกกับแฟ้ม */
  caseNo?: string
}

/** หนังสือส่งออกที่เลขาธิการ ป.ป.ท. ลงนามจากหน้าแบบฟอร์มของฉบับนั้น */
const OUTGOING_NOTICE_FORMS: OutgoingNoticeFormNo[] = [8, 9, 10]

/**
 * TC-161 — ประวัติเวอร์ชันของ คบ.8 อ่านจาก kb8Version/kb8PreviousVersions ของแฟ้ม (WIT0818)
 * และล็อกฉบับแก้ไขในหน้านี้เมื่อฉบับปัจจุบันถูกลงนามแล้ว (kb8SignedAt) ห้ามแก้ทับจนกว่าจะถูกส่งกลับ
 */
const Kb8VersionHistory: React.FC<{ caseNo?: string }> = ({ caseNo }) => {
  const getCase = useCaseStore((s) => s.getCase)
  const caseItem = caseNo ? getCase(caseNo) : undefined
  const kb8Lock = useFormDraftStore((s) => s.locks[8])
  const lockForm = useFormDraftStore((s) => s.lockForm)

  const kb8SignedAt = caseItem?.kb8SignedAt
  const kb8SignedBy = caseItem?.kb8SignedBy
  React.useEffect(() => {
    if (!kb8SignedAt) return
    const { locks, revisions } = useFormDraftStore.getState()
    if (locks[8] || (revisions[8] || []).length > 0) return
    lockForm(8, kb8SignedBy || 'เลขาธิการ ป.ป.ท.', `ลงนามคำสั่ง คบ.8 เมื่อ ${kb8SignedAt}`)
  }, [kb8SignedAt, kb8SignedBy, lockForm])

  const version = caseItem?.kb8Version || 1
  const previousVersions = caseItem?.kb8PreviousVersions || []
  const entries: VersionHistoryEntry[] = previousVersions.map((v) => ({
    version: v.version,
    at: v.returnedAt,
    by: v.returnedBy,
    status: 'returned',
    note: v.returnReason,
  }))

  return (
    <VersionHistory
      code="kb8"
      currentVersion={version}
      entries={entries}
      locked={Boolean(kb8Lock)}
      lockedBy={kb8SignedBy}
      lockedNote={kb8SignedAt ? `ลงนามคำสั่ง คบ.8 เมื่อ ${kb8SignedAt}` : undefined}
    />
  )
}

/** คบ.8 — คำสั่งมอบหมายเจ้าพนักงานฯ ตามมาตรการคุ้มครองเบื้องต้น */
const Kb8Fields: React.FC<{ caseNo?: string }> = ({ caseNo }) => (
  <>
    <Kb8VersionHistory caseNo={caseNo} />
    <Section title="หัวคำสั่ง">
      <Grid>
        <Field formId={8} name="เลขที่คำสั่ง" label="คำสั่งที่" placeholder="045" />
        <Field formId={8} name="ปีคำสั่ง" label="ปี พ.ศ." placeholder="2569" />
      </Grid>
    </Section>

    <Section title="พยานและระยะเวลาที่อนุมัติ">
      <Grid>
        <Field formId={8} name="ชื่อพยาน" label="ชื่อพยาน/ผู้ขอรับการคุ้มครอง" required />
        <Field formId={8} name="จำนวนวัน" label="รวมจำนวน (วัน)" />
      </Grid>
      <Grid>
        <ThaiDateFields
          formId={8}
          label="นับตั้งแต่วันที่"
          dayKey="เริ่มวันที่"
          monthKey="เริ่มเดือน"
          yearKey="เริ่มพ.ศ."
        />
        <ThaiDateFields formId={8} label="ถึงวันที่" dayKey="ถึงวันที่" monthKey="ถึงเดือน" yearKey="ถึงพ.ศ." />
      </Grid>
    </Section>

    <Section title="องค์ประกอบชุดปฏิบัติการ">
      <OfficerRosterFields formId={8} />
    </Section>

    <Section title="ผู้ลงนามและวันที่สั่ง">
      <ThaiDateFields formId={8} label="สั่ง ณ วันที่" dayKey="สั่งวันที่" monthKey="สั่งเดือน" yearKey="สั่งพ.ศ." />
      <Field
        formId={8}
        name="เลขาธิการ"
        label="เลขาธิการคณะกรรมการป้องกันและปราบปรามการทุจริตในภาครัฐ"
        required
      />
    </Section>
  </>
)

/** ส่วนหัวหนังสือราชการภายนอกที่ใช้ร่วมกันของ คบ.9 และ คบ.10 */
const LetterFields: React.FC<{ formId: number }> = ({ formId }) => (
  <>
    <Section title="หัวหนังสือ">
      <Grid>
        <Field formId={formId} name="เลขที่หนังสือ" label="ที่ ปป 00 ..." placeholder="05" />
        <Field formId={formId} name="ปีหนังสือ" label="เลขที่หนังสือ / ปี" placeholder="423" />
      </Grid>
      <ThaiDateFields formId={formId} label="ลงวันที่" dayKey="วันที่" monthKey="เดือน" yearKey="พ.ศ." />
    </Section>

    <Section title="การอ้างถึง">
      <DateField formId={formId} name="คำร้องลงวันที่" label="อ้างถึง คำร้องขอให้คุ้มครองพยาน ลงวันที่" />
    </Section>
  </>
)

/** คบ.15 — รายงานการให้ความคุ้มครองสิ้นสุด (เอกสารประกอบการเสนอ ยังไม่ทำให้การคุ้มครองสิ้นสุด) */
const Kb15Fields: React.FC = () => (
  <>
    <Section title="พยานและคำสั่งเดิม">
      <Grid>
        <Field formId={15} name="ชื่อพยาน" label="ชื่อพยาน/ผู้ได้รับความคุ้มครอง" required />
        <Field formId={15} name="เลขคดี" label="คดีหมายเลขที่" />
      </Grid>
      <Grid>
        <Field formId={15} name="เลขคำร้อง" label="เลขคำร้องคุ้มครองพยาน" />
        <Field formId={15} name="คำสั่งเดิม" label="คำสั่งที่ให้ความคุ้มครอง" />
      </Grid>
    </Section>

    <Section title="ระยะเวลาที่ปฏิบัติจริง" hint="นับจากวันเริ่มจริงตามคำสั่ง ไม่ใช่วันอัปโหลดเอกสาร">
      <Grid>
        <DateField formId={15} name="วันเริ่มจริง" label="วันเริ่มคุ้มครองจริง" />
        <Field formId={15} name="วันสะสม" label="รวมระยะเวลาคุ้มครองสะสม (วัน)" />
      </Grid>
    </Section>

    <Section title="เหตุแห่งการยุติและผลการคุ้มครอง">
      <Area formId={15} name="เหตุยุติ" label="เหตุแห่งการยุติ" rows={3} required />
      <Area formId={15} name="สรุปผล" label="สรุปผลการให้ความคุ้มครองและหลักฐานประกอบ" rows={5} />
      <Area formId={15} name="ความเห็นลำดับชั้น" label="ความเห็นตามลำดับชั้น" rows={4} />
      <Area formId={15} name="เอกสารแนบ" label="เอกสารแนบ" rows={3} />
    </Section>
  </>
)

/** คบ.16 — คำสั่งยุติ: วันที่ออกคำสั่ง / วันที่มีผล / วันหยุดปฏิบัติจริง เป็นคนละวัน */
const Kb16Fields: React.FC = () => (
  <>
    <Section title="หัวคำสั่ง">
      <Grid>
        <Field formId={16} name="เลขที่คำสั่ง" label="คำสั่งที่" placeholder="088" />
        <Field formId={16} name="ปีคำสั่ง" label="ปี พ.ศ." placeholder="2569" />
      </Grid>
      <Grid>
        <Field formId={16} name="ชื่อพยาน" label="ชื่อพยานที่ยุติการคุ้มครอง" required />
        <Field formId={16} name="คำสั่งเดิม" label="อ้างถึงคำสั่งให้ความคุ้มครองเดิม" />
      </Grid>
    </Section>

    <Section
      title="เหตุยุติและวันที่"
      hint="วันที่คำสั่งมีผลเป็นตัวกำหนดสถานะยุติ — ต่างจากวันที่ออกคำสั่งและวันหยุดปฏิบัติจริง"
    >
      <Area formId={16} name="เหตุยุติ" label="เหตุแห่งการยุติตามคำสั่ง" rows={3} required />
      <Grid cols={3}>
        <DateField formId={16} name="วันที่ออกคำสั่ง" label="สั่ง ณ วันที่" required />
        <DateField formId={16} name="วันที่มีผล" label="คำสั่งมีผลตั้งแต่วันที่" required />
        <DateField formId={16} name="วันหยุดปฏิบัติ" label="วันหยุดปฏิบัติจริงในพื้นที่" />
      </Grid>
      <div className="ws-callout text-[0.88rem] leading-relaxed">
        <i className="fa-solid fa-triangle-exclamation mr-1.5" />
        ห้ามเริ่มสถานะยุติก่อนคำสั่งฉบับนี้ลงนามและถึงวันที่มีผล
      </div>
    </Section>
  </>
)

/** คบ.17 — หนังสือแจ้งคำสั่งยุติและสิทธิอุทธรณ์ 30 วัน */
const Kb17Fields: React.FC = () => (
  <>
    <LetterFields formId={17} />
    <Section title="คำสั่งที่แจ้งและสิทธิอุทธรณ์">
      <Grid>
        <Field formId={17} name="เรียน" label="เรียน (ผู้ได้รับความคุ้มครอง)" required />
        <Field formId={17} name="เลขคำสั่งยุติ" label="อ้างถึงคำสั่งยุติที่" required />
      </Grid>
      <Grid>
        <DateField formId={17} name="วันที่มีผล" label="คำสั่งมีผลตั้งแต่วันที่" />
        <Field formId={17} name="ผู้ลงนาม" label="ผู้ลงนาม" />
      </Grid>
      <Area formId={17} name="เหตุยุติ" label="เหตุแห่งการยุติที่แจ้งให้ทราบ" rows={3} />
      <div className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
        <i className="fa-solid fa-circle-info mr-1.5" />
        หนังสือฉบับนี้พิมพ์การแจ้งสิทธิอุทธรณ์ภายในสามสิบวันไว้บนกระดาษโดยอัตโนมัติ
        และเริ่มนับกำหนดจาก <strong>วันที่พยานได้รับจริง</strong> ไม่ใช่วันที่ส่ง
      </div>
    </Section>
  </>
)

/** คบ. ที่ยังไม่มีหน้ากรอกเฉพาะ — ปัจจุบันคือ คบ.8 / คบ.9 / คบ.10 / คบ.15-17 */
export const GenericKbEditor: React.FC<GenericKbEditorProps> = ({ formId, onSaved, caseNo }) => {
  const formMeta = FORMS_CATALOG.find((f) => f.n === formId) || FORMS_CATALOG[0]
  const outgoingNoticeNo = OUTGOING_NOTICE_FORMS.find((n) => n === formId)

  return (
    <EditorShell
      code={formMeta.code}
      formId={formId}
      title={formMeta.t}
      hint={
        formId === 16
          ? 'กรอกและบันทึกที่นี่ แล้วกด “ส่งให้อนุมัติ” ที่แถว คบ.16 ในแฟ้มคำร้อง เพื่อเสนอผู้มีอำนาจลงนาม'
          : formId === 17
            ? 'กรอกและบันทึกที่นี่ แล้วกด “ส่งให้ลงนาม” ที่แถว คบ.17 ในแฟ้มคำร้อง — เลขาธิการ ป.ป.ท. ลงนามแล้วจึงออกเลขและนำส่งผ่านสารบรรณเดิม'
            : formMeta.d
      }
      footer={
        <Button
          type="button"
          onClick={() => {
            showToast(`บันทึกแบบ ${formMeta.code} เรียบร้อยแล้ว`)
            onSaved?.()
          }}
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
        >
          <i className="fa-solid fa-check" />
          บันทึกแบบ {formMeta.code}
        </Button>
      }
    >
      {formId === 8 && <Kb8Fields caseNo={caseNo} />}

      {formId === 9 && (
        <>
          <LetterFields formId={9} />
          <Section title="ผลการพิจารณา">
            <DateField formId={9} name="วันที่อนุมัติ" label="สำนักงาน ป.ป.ท. ได้อนุมัติ เมื่อวันที่" required />
            <Field
              formId={9}
              name="เลขาธิการ"
              label="ผู้ลงนาม (เลขาธิการฯ / รองเลขาธิการฯ / ผอ.สำนัก ที่ได้รับมอบหมาย)"
            />
          </Section>
        </>
      )}

      {formId === 10 && (
        <>
          <LetterFields formId={10} />
          <Section title="เหตุผลของคำสั่งไม่ให้คุ้มครอง">
            <Area
              formId={10}
              name="สาระสำคัญ"
              label="สำนักงาน ป.ป.ท. พิจารณาแล้วเห็นว่า (เหตุผลที่ไม่ให้พยานได้รับการคุ้มครอง)"
              rows={4}
              required
            />
            <Field
              formId={10}
              name="เลขาธิการ"
              label="ผู้ลงนาม (เลขาธิการฯ / รองเลขาธิการฯ / ผอ.สำนัก ที่ได้รับมอบหมาย)"
            />
            <div className="rounded-lg border border-danger bg-danger-soft p-3 text-[0.88rem] leading-relaxed text-danger-dark">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />
              หนังสือฉบับนี้พิมพ์การแจ้งสิทธิอุทธรณ์ภายในสามสิบวันนับแต่วันที่ได้รับแจ้งคำสั่ง
              ตามระเบียบฯ ข้อ 2 ไว้บนกระดาษโดยอัตโนมัติ
            </div>
          </Section>
        </>
      )}

      {/* ลายมือชื่อหนังสือส่งออกย้ายไปลงนามที่รายการแบบฟอร์ม คบ. ในแฟ้มคำร้อง */}
      {outgoingNoticeNo && (
        <Section title="ลายมือชื่อผู้ลงนามหนังสือส่งออก">
          <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
            <i className="fa-solid fa-circle-info mr-1.5" />
            {formId === 8
              ? 'จัดทำร่างฉบับนี้เสร็จแล้ว ให้กดปุ่ม "ส่งเสนอเลขาธิการฯ ลงนาม" ในรายการแบบฟอร์ม คบ. ของแฟ้มคำร้อง — เลขาธิการ ป.ป.ท. จะลงนามได้จากปุ่ม "ลงนาม" หลังรับเรื่องแล้ว'
              : 'เตรียมร่างฉบับนี้ในชุดเสนอ คบ.1 / คบ.3 / คบ.6 เลขาธิการจะลงนามเฉพาะฉบับที่ตรงกับผลพิจารณาเมื่อยืนยันผล จากนั้นผู้รับผิดชอบเติมเฉพาะช่องที่อนุญาตตามงานหลังลงนาม'}
          </p>
        </Section>
      )}

      {formId === 15 && <Kb15Fields />}
      {formId === 16 && <Kb16Fields />}
      {formId === 17 && <Kb17Fields />}

      {![8, 9, 10, 15, 16, 17].includes(formId) && (
        <Section title="ข้อมูลเอกสาร">
          <Grid>
            <Field formId={formId} name="เลขที่เอกสาร" label="เลขที่เอกสาร / หนังสือ" />
            <DateField formId={formId} name="วันที่" label="วันที่ออกเอกสาร" />
          </Grid>
          <Area formId={formId} name="สาระสำคัญ" label="สาระสำคัญ / ข้อความในหนังสือ" rows={5} />
        </Section>
      )}
    </EditorShell>
  )
}
