import React from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { FormCaseScope } from './FormCaseScope'
import { useAuthStore } from '../../store/useAuthStore'
import { canEditFormsInDossier } from '../../lib/permissions'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { Area, Checks, DateField, DocHeaderFields, EditorShell, Field, Grid, Section } from './fields/FormKit'

interface Kb11FormEditorProps {
  onSaved?: () => void
}

const FORM_OPTIONS = [
  '3.1 จัดเจ้าพนักงานเป็นชุดคุ้มครองความปลอดภัย',
  '3.2 จัดให้พยานอยู่ในสถานที่เหมาะสม',
  '3.3 ปกปิดและรักษาความลับข้อมูลที่ระบุตัวพยาน',
  '3.4 ดำเนินการอื่นใด / ประสานหน่วยงานอื่น',
]

/** คบ.11 — บันทึกข้อตกลงการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น */
export const Kb11FormEditor: React.FC<Kb11FormEditorProps> = ({ onSaved }) => {
  const { getDraft } = useFormDraftStore()
  const draft = getDraft(11)

  const caseNo = React.useContext(FormCaseScope)
  const caseItem = useCaseStore((state) => caseNo ? state.getCase(caseNo) : undefined)
  const auth = useAuthStore()
  const methods = caseItem?.orderedMethods || []
  React.useEffect(() => {
    const forms = useFormDraftStore.getState()
    if (!caseItem || caseItem.activity7State !== 'approved' || !canEditFormsInDossier(auth.currentRole, caseItem, auth.currentOfficerUserId) || forms.draftTouched[11] || !methods.length) return
    if (!forms.getDraft(11)['รูปแบบที่เลือก']?.length) forms.updateField(11, 'รูปแบบที่เลือก', methods.map((method) => `3.${method}`))
  }, [caseNo, caseItem, auth.currentRole, auth.currentOfficerUserId])

  const selectedForms: string[] = Array.isArray(draft['รูปแบบที่เลือก']) ? draft['รูปแบบที่เลือก'] : []

  return (
    <EditorShell
      code="คบ.11"
      formId={11}
      title="บันทึกข้อตกลงการคุ้มครองพยานโดยใช้มาตรการเบื้องต้น"
      hint="จัดทำโดยเจ้าของสำนวน หรือเจ้าหน้าที่ กอท. ที่ได้รับมอบหมาย ตามวิธีคุ้มครองที่อนุมัติ"
      allowRevise={false}
    >
      <Section title="หัวเอกสาร">
        <DocHeaderFields formId={11} />
      </Section>

      <Section no="1." title="ผู้ทำข้อตกลง">
        <Grid cols={3}>
          <Field formId={11} name="ชื่อพยาน" label="ข้าพเจ้า นาย/นาง/นางสาว" required />
          <Field formId={11} name="นามสกุลพยาน" label="นามสกุล" />
          <Field formId={11} name="ผู้ได้รับการคุ้มครอง" label="อนุมัติให้ใช้มาตรการเบื้องต้นแก่" />
        </Grid>
      </Section>

      <Section no="2." title="ข้อมูลพยาน">
        <Grid>
          <Field formId={11} name="อาชีพ" label="อาชีพ" />
          <Field formId={11} name="สถานภาพ" label="สถานภาพ" />
        </Grid>
        <Grid>
          <Field formId={11} name="ชื่อบิดา" label="ชื่อบิดา" />
          <Field formId={11} name="ชื่อมารดา" label="ชื่อมารดา" />
        </Grid>
        <Grid>
          <Field formId={11} name="ที่อยู่ปัจจุบัน" label="ที่อยู่ปัจจุบัน" />
          <Field formId={11} name="เบอร์โทรศัพท์" label="โทรศัพท์" />
        </Grid>
        <Grid>
          <Field formId={11} name="สถานที่ทำงาน" label="สถานที่ทำงาน" />
          <Field formId={11} name="โทรศัพท์ที่ทำงาน" label="โทรศัพท์ที่ทำงาน" />
        </Grid>
        <Grid cols={3}>
          <Field formId={11} name="เลขบัตรประชาชน" label="เลขประจำตัวประชาชน" />
          <Field formId={11} name="เลขบัตรเจ้าหน้าที่รัฐ" label="เลขที่บัตรประจำตัวเจ้าหน้าที่ของรัฐ" />
          <Field formId={11} name="สังกัด" label="สังกัด" />
        </Grid>
        <Grid>
          <DateField formId={11} name="วันออกบัตร" label="วันออกบัตร" />
          <DateField formId={11} name="บัตรหมดอายุ" label="บัตรหมดอายุ" />
        </Grid>
      </Section>

      <Section no="3." title="รูปแบบการคุ้มครองพยาน" hint="เลือกได้หลายข้อ ตามที่ปรากฏบนกระดาษหน้า 1">
        <Checks
          formId={11}
          name="รูปแบบที่เลือก"
          label="รูปแบบที่ใช้"
          options={methods.length ? methods.map((method) => `3.${method}`) : ['3.1', '3.2', '3.3', '3.4']}
        />
        <div className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
          {FORM_OPTIONS.map((o) => (
            <div key={o}>{o}</div>
          ))}
        </div>
        {selectedForms.length === 0 && (
          <p className="text-[0.8rem] font-semibold text-warning">ยังไม่ได้เลือกรูปแบบการคุ้มครอง</p>
        )}
      </Section>

      <Section no="9." title="ข้อตกลงอื่น ๆ">
        <Area
          formId={11}
          name="ข้อตกลงอื่น"
          label="ระบุรายละเอียดวิธีการ และเงื่อนไขการคุ้มครองพยานเพิ่มเติม"
          rows={4}
        />
        <Field formId={11} name="คำรับรองพยาน" label="ชื่อพยานผู้ให้คำรับรองท้ายเอกสาร" />
        <div className="ws-callout text-[0.88rem] leading-relaxed">
          วิธีการและเงื่อนไข 8 ข้อ กับเหตุสิ้นสุดการคุ้มครองเป็นข้อความมาตรฐานตามระเบียบฯ
          จึงพิมพ์คงที่บนกระดาษหน้า 2–3 ไม่ต้องกรอก
        </div>
      </Section>

      <Section title="ลายมือชื่อท้ายบันทึกข้อตกลง">
        <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
          <i className="fa-solid fa-circle-info mr-1.5" />
          พยาน เจ้าพนักงาน ป.ป.ท. และพยานในการทำข้อตกลง ลงลายมือชื่อและบันทึกข้อตกลงได้จากปุ่ม "ลงนาม"
          ในรายการแบบฟอร์ม คบ. ของแฟ้มคำร้อง
        </p>
      </Section>

    </EditorShell>
  )
}
