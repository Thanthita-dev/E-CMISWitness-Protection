import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { KB4_PROTECTION_METHOD_FIELD } from '../../lib/constants'
import { Area, DateField, EditorShell, Field, Grid, OfficerRosterFields, ProtectionMethodChecks, Section } from './fields/FormKit'

interface Kb4FormEditorProps {
  onSaved?: () => void
}

/** คบ.4 — บันทึกข้อความ (ด่วนที่สุด) ขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน */
export const Kb4FormEditor: React.FC<Kb4FormEditorProps> = ({ onSaved }) => {
  const { getDraft, updateField } = useFormDraftStore()
  const methods: number[] = Array.isArray(getDraft(4)[KB4_PROTECTION_METHOD_FIELD])
    ? getDraft(4)[KB4_PROTECTION_METHOD_FIELD]
    : []

  return (
  <EditorShell
    code="คบ.4"
    formId={4}
    title="บันทึกข้อความ การขอคุ้มครองพยานชั่วคราว กรณีจำเป็นเร่งด่วน"
    hint="เจ้าพนักงานเสนอผู้อำนวยการสำนัก/กอง/ศูนย์ พิจารณาอนุมัติมาตรการชั่วคราวทันที"
    footer={
      <Button
        type="button"
        onClick={() => {
          showToast('บันทึกแบบ คบ.4 เรียบร้อยแล้ว')
          onSaved?.()
        }}
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
      >
        <i className="fa-solid fa-check" />
        บันทึกแบบ คบ.4
      </Button>
    }
  >
    <Section title="หัวบันทึกข้อความ">
      <Grid>
        <Field formId={4} name="ส่วนราชการ" label="ส่วนราชการ" required />
        <Field formId={4} name="โทร" label="โทร." />
      </Grid>
      <Grid cols={3}>
        <Field formId={4} name="เลขที่เอกสาร" label="ที่ ปป 00 ..." placeholder="05/423" />
        <DateField formId={4} name="วันที่" label="วันที่" />
        <Field formId={4} name="สำนวนคดีเลขที่" label="สำนวนคดีเลขที่" />
      </Grid>
      <Field formId={4} name="เรียน" label="เรียน ผู้อำนวยการสำนัก/กอง/ศูนย์" required />
    </Section>

    <Section no="1." title="เรื่องเดิม">
      <Grid cols={3}>
        <Field formId={4} name="พยาน" label="พยานผู้ขอรับการคุ้มครอง" required />
        <Field formId={4} name="เลขคำร้อง" label="คำร้องหมายเลขที่" />
        <Field formId={4} name="อ้างอิงคดี" label="ในคดีเรื่องที่" />
      </Grid>
      <Grid>
        <Field formId={4} name="วิธีการคุ้มครอง" label="ขอให้คุ้มครองด้วยวิธีการ" />
        <Field formId={4} name="เรื่องกล่าวหา" label="ในเรื่องร้องเรียน/กล่าวหา" />
      </Grid>
    </Section>

    <Section no="2." title="ข้อเท็จจริง">
      <Area formId={4} name="พฤติการณ์แห่งคดี" label="2.1 รายละเอียดพฤติการณ์แห่งคดี" rows={4} required />
      <Grid cols={3}>
        <Field formId={4} name="รูปแบบการคุ้มครอง" label="รูปแบบการคุ้มครองที่ขอ" />
        <DateField formId={4} name="เริ่มวันที่" label="ในระหว่างวันที่" />
        <DateField formId={4} name="ถึงวันที่" label="ถึงวันที่" />
      </Grid>
    </Section>

    <Section no="4.1" title="เจ้าพนักงานดำเนินการคุ้มครองชั่วคราวที่มอบหมาย">
      <OfficerRosterFields formId={4} />
    </Section>

    <Section no="4.2–4.4" title="การดำเนินการ การเดินทาง และค่าใช้จ่าย">
      <Grid>
        <Field formId={4} name="ดำเนินการโดย" label="4.2 ดำเนินการคุ้มครองโดยการ" />
        <Field formId={4} name="ผู้ดำเนินการคุ้มครอง" label="4.3 อนุมัติให้ (ผู้ดำเนินการ)" />
      </Grid>
      {/**
        * WIT0603 — วิธีคุ้มครองตามข้อ 15 (1)–(4) เลือกได้มากกว่าหนึ่งวิธี
        * ชุดที่ติ๊กไว้ตรงนี้คือชุดที่ ผอ. จะอนุมัติแล้วส่งไปเปิดเส้นทางปฏิบัติที่แท็บ 08 (WIT0613)
        * ไม่ใช่แค่ข้อความบนเอกสาร — การ์ดเส้นทางเร่งด่วนในแฟ้มอ่านค่าจากช่องนี้โดยตรง
        */}
      <ProtectionMethodChecks
        withFifth
        selected={methods}
        testIdPrefix="kb4-method-option"
        onChange={(next) => updateField(4, KB4_PROTECTION_METHOD_FIELD, next)}
      />
      <p className="rounded-lg border border-line bg-blue-soft p-3 text-[0.88rem] leading-relaxed text-navy">
        <i className="fa-solid fa-circle-info mr-1.5" />
        ข้อ 1–4 เปิดเป็นเส้นทางปฏิบัติที่หน้าดำเนินการตามวิธีคุ้มครองได้เมื่อ ผอ. อนุมัติคำสั่ง คบ.5 · ข้อ 5 เป็นมาตรการเสริมที่ไม่เปิดเส้นทางแยก
      </p>
      <Grid cols={3}>
        <Field formId={4} name="พื้นที่คุ้มครอง" label="ในพื้นที่" />
        <DateField formId={4} name="ระหว่างวันที่" label="ระหว่างวันที่" />
        <Field formId={4} name="ทะเบียนรถ" label="รถยนต์ส่วนกลาง ทะเบียน" />
      </Grid>
      <Grid>
        <Field formId={4} name="จำนวนเงิน" label="4.4 ขออนุมัติยืมเงินทดรองราชการ (บาท)" />
        <Field formId={4} name="จำนวนเงินตัวอักษร" label="จำนวนเงิน (ตัวอักษร)" />
      </Grid>
    </Section>

    <Section no="5." title="ความเห็น ข้อเสนอแนะ และการสั่งการ">
      <Field formId={4} name="สภ." label="5.2 มีหนังสือถึง ผกก.สภ." />
      <Grid>
        <Field formId={4} name="ผู้เสนอ" label="ผู้เสนอ (นักสืบสวนสอบสวนชำนาญการ)" />
        <Field formId={4} name="ผู้อำนวยการ" label="ผู้อำนวยการสำนัก/กอง/ศูนย์" />
      </Grid>
      <Area
        formId={4}
        name="ความเห็นผู้อำนวยการ"
        label="13. ความเห็นผู้อำนวยการสำนัก"
        rows={3}
        placeholder="เห็นชอบ / อนุมัติ ..."
      />
    </Section>
  </EditorShell>
  )
}
