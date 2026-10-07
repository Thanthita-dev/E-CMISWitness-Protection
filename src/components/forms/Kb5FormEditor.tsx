import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { EditorShell, Field, Grid, OfficerRosterFields, Section, ThaiDateFields } from './fields/FormKit'

interface Kb5FormEditorProps {
  onSaved?: () => void
  caseNo?: string
}

/** คบ.5 — คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว */
export const Kb5FormEditor: React.FC<Kb5FormEditorProps> = ({ onSaved, caseNo }) => (
  <EditorShell
    code="คบ.5"
    formId={5}
    caseNo={caseNo}
    title="คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว"
    hint="คำสั่งของผู้อำนวยการสำนัก/กอง/ศูนย์ ในสังกัดสำนักงาน ป.ป.ท."
    footer={
      <Button
        type="button"
        onClick={() => {
          showToast('บันทึกคำสั่ง คบ.5 เรียบร้อยแล้ว')
          onSaved?.()
        }}
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-warning px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-gold transition"
      >
        <i className="fa-solid fa-file-signature" />
        บันทึกคำสั่ง คบ.5
      </Button>
    }
  >
    <Section title="หัวคำสั่ง">
      <Grid cols={3}>
        <Field formId={5} name="สำนักกองศูนย์" label="คำสั่งสำนัก/กอง/ศูนย์" required />
        <Field formId={5} name="เลขที่คำสั่ง" label="คำสั่งที่" placeholder="045" />
        <Field formId={5} name="ปีคำสั่ง" label="ปี พ.ศ." placeholder="2569" />
      </Grid>
    </Section>

    <Section title="ผู้อนุมัติและพยานผู้รับการคุ้มครอง">
      <Grid>
        <Field formId={5} name="ผู้อำนวยการ" label="ผู้อำนวยการสำนัก/กอง/ศูนย์ ผู้อนุมัติ" required />
        <Field formId={5} name="ชื่อพยาน" label="ชื่อพยาน/ผู้ขอรับการคุ้มครอง" required />
      </Grid>
      <Grid>
        <ThaiDateFields
          formId={5}
          label="ตั้งแต่วันที่"
          dayKey="เริ่มวันที่"
          monthKey="เริ่มเดือน"
          yearKey="เริ่มพ.ศ."
        />
        <ThaiDateFields formId={5} label="ถึงวันที่" dayKey="ถึงวันที่" monthKey="ถึงเดือน" yearKey="ถึงพ.ศ." />
      </Grid>
    </Section>

    <Section title="เจ้าพนักงานที่ได้รับมอบหมาย">
      <OfficerRosterFields formId={5} />
      <Field
        formId={5}
        name="รายงานทุกกี่วัน"
        label="ให้รายงานผลต่อผู้บังคับบัญชาทุก (วัน)"
        placeholder="เช่น 3"
      />
    </Section>

    <Section title="วันที่สั่ง">
      <ThaiDateFields formId={5} label="สั่ง ณ วันที่" dayKey="สั่งวันที่" monthKey="สั่งเดือน" yearKey="สั่งพ.ศ." />
    </Section>
  </EditorShell>
)
