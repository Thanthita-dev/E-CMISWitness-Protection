import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { Area, DateTimeField, DocHeaderFields, EditorShell, Field, Grid, Radios, Section } from './fields/FormKit'

interface Kb2FormEditorProps {
  onSaved?: () => void
}

/** คบ.2 — คำร้องขอคุ้มครองพยานผ่านช่องทางการสื่อสาร (เจ้าพนักงานเป็นผู้บันทึก) */
export const Kb2FormEditor: React.FC<Kb2FormEditorProps> = ({ onSaved }) => (
  <EditorShell
    code="คบ.2"
    formId={2}
    title="คำร้องขอให้มีการคุ้มครองพยานตามมาตรการคุ้มครองเบื้องต้น ผ่านช่องทางการสื่อสาร"
    hint="ใช้สำหรับเจ้าพนักงานบันทึกรายละเอียดกรณีเร่งด่วนและผู้ร้องขอไม่อาจมายื่นคำร้องขอด้วยตนเอง"
    footer={
      <Button
        type="button"
        onClick={() => {
          showToast('บันทึกแบบ คบ.2 เรียบร้อยแล้ว')
          onSaved?.()
        }}
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
      >
        <i className="fa-solid fa-check" />
        บันทึกแบบ คบ.2
      </Button>
    }
  >
    <Section title="หัวเอกสาร">
      <DocHeaderFields formId={2} />
    </Section>

    <Section title="ข้อมูลผู้ร้องขอ">
      <Grid cols={4}>
        <Field formId={2} name="คำนำหน้า" label="นาย/นาง/นางสาว/อื่นๆ" />
        <Field formId={2} name="ชื่อผู้แจ้ง" label="ชื่อตัว" required />
        <Field formId={2} name="นามสกุลผู้แจ้ง" label="ชื่อสกุล" required />
        <Field formId={2} name="อายุ" label="อายุ (ปี)" />
      </Grid>
      <Grid cols={4}>
        <Field formId={2} name="บ้านเลขที่" label="ที่อยู่ตามทะเบียนบ้าน เลขที่" />
        <Field formId={2} name="หมู่ที่" label="หมู่ที่" />
        <Field formId={2} name="ตรอกซอย" label="ตรอก/ซอย" />
        <Field formId={2} name="ถนน" label="ถนน" />
      </Grid>
      <Grid cols={4}>
        <Field formId={2} name="ตำบล" label="ตำบล/แขวง" />
        <Field formId={2} name="อำเภอ" label="อำเภอ/เขต" />
        <Field formId={2} name="จังหวัด" label="จังหวัด" />
        <Field formId={2} name="รหัสไปรษณีย์" label="รหัสไปรษณีย์" />
      </Grid>
      <Grid cols={3}>
        <Field formId={2} name="เบอร์โทรศัพท์" label="โทรศัพท์" required />
        <Field formId={2} name="โทรสาร" label="โทรสาร" />
        <Field formId={2} name="อีเมล" label="e-mail" />
      </Grid>
      <Field
        formId={2}
        name="ฐานะที่เป็น"
        label="เกี่ยวข้องกับเรื่องกล่าวหาร้องเรียนการทุจริตในภาครัฐในฐานะที่เป็น"
        placeholder="เช่น ผู้กล่าวหา ผู้เสียหาย ผู้แจ้งเบาะแส"
      />
    </Section>

    <Section title="ความประสงค์และพฤติการณ์">
      <Radios
        formId={2}
        name="ช่วงเวลาคุ้มครอง"
        label="มีความประสงค์จะขอรับการคุ้มครองจากการ"
        options={['ก่อนมาเป็นพยาน', 'ขณะเป็นพยาน', 'หลังมาเป็นพยาน']}
        required
      />
      <Field formId={2} name="อ้างอิงคดี" label="ในคดีทุจริตในภาครัฐเกี่ยวกับเรื่อง" required />
      <Area
        formId={2}
        name="รายละเอียดข้อเท็จจริง"
        label="เนื่องจากมีพฤติการณ์ (ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยาน)"
        rows={4}
        required
      />
    </Section>

    <Section title="การรับแจ้งและผู้บันทึก">
      <Grid>
        <Field
          formId={2}
          name="ช่องทางการสื่อสาร"
          label="โดยได้แจ้งผ่านช่องทางการสื่อสาร"
          placeholder="เช่น โทรศัพท์สายด่วน 1206 / อีเมล / โทรสาร"
          required
        />
        <DateTimeField formId={2} name="วันเวลารับแจ้ง" label="วันและเวลาที่รับแจ้ง" />
      </Grid>
      <Area formId={2} name="รายละเอียดอื่น" label="รายละเอียดอื่นๆ (ถ้ามี)" rows={2} />
      <Grid>
        <Field formId={2} name="เจ้าหน้าที่ผู้รับแจ้ง" label="เจ้าพนักงานผู้บันทึก" required />
        <Field formId={2} name="ตำแหน่งผู้รับแจ้ง" label="ตำแหน่ง" placeholder="นักสืบสวนสอบสวนชำนาญการ" />
      </Grid>
    </Section>
  </EditorShell>
)
