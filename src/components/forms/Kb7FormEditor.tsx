import { Button } from '../common/Button'
import React from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { TERMINATION_REASONS } from '../../lib/constants'
import { showToast } from '../../lib/swal'
import { Area, Checks, DocHeaderFields, EditorShell, Field, Grid, Radios, Section, ThaiDateFields } from './fields/FormKit'

interface Kb7FormEditorProps {
  onSaved?: () => void
  caseNo?: string
  terminationIntake?: boolean
}

/** คบ.7 — คำร้องขอยุติการคุ้มครองพยาน (ข้อ 1–8 ตามต้นฉบับ) */
export const Kb7FormEditor: React.FC<Kb7FormEditorProps> = ({ onSaved, caseNo, terminationIntake }) => {
  const { getDraft, updateField } = useFormDraftStore()
  const { getCase, requestTermination } = useCaseStore()
  const draft = getDraft(7)
  const caseItem = getCase(caseNo)

  const reason = draft['เหตุผลการยุติ'] || ''

  return (
    <EditorShell
      code="คบ.7"
      formId={7}
      title="คำร้องขอยุติการคุ้มครองพยาน"
      hint="บันทึกคำขอของพยาน แล้วจัดทำ คบ.15 เสนอพิจารณา"
      footer={
        <>
          <Button
            type="button"
            onClick={() => showToast('บันทึกร่างแบบ คบ.7 เรียบร้อยแล้ว')}
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy hover:bg-soft"
          >
            บันทึกร่าง
          </Button>
          <Button
            type="button"
            onClick={() => {
              if (!caseItem) return showToast('ไม่พบแฟ้มคำร้องที่เปิดอยู่')
              if (!String(reason).trim()) return showToast('กรุณาระบุเหตุผลในการขอให้ยุติการคุ้มครอง')
              if (terminationIntake) {
                showToast('บันทึกแบบ คบ.7 แล้ว กรุณาแนบฉบับที่พยานลงนามเพื่อดำเนินเรื่องยุติต่อ')
                onSaved?.()
                return
              }
              requestTermination(caseItem.no, reason)
              showToast('เสนอ คบ.7 ให้เลขาธิการ ป.ป.ท. ลงนามสั่งยุติแล้ว')
              onSaved?.()
            }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy-mid px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-navy transition"
          >
            <i className="fa-solid fa-circle-stop" />
            {terminationIntake ? 'บันทึก คบ.7 และกลับเรื่องยุติ' : 'เสนอเลขาธิการฯ ลงนามสั่งยุติ'}
          </Button>
        </>
      }
    >
      <Section title="หัวเอกสาร">
        <DocHeaderFields formId={7} />
        <ThaiDateFields formId={7} label="สำนักงาน ป.ป.ท. วันที่" dayKey="วันที่" monthKey="เดือน" yearKey="พ.ศ." />
      </Section>

      <Section no="1." title="ผู้ยื่นคำร้อง">
        <Grid>
          <Field formId={7} name="ชื่อผู้ยื่น" label="ข้าพเจ้า นาย/นาง/นางสาว/อื่นๆ" required />
          <Field formId={7} name="นามสกุลผู้ยื่น" label="นามสกุล" required />
        </Grid>
        <Radios formId={7} name="ฐานะผู้ยื่น" label="เกี่ยวข้องในฐานะ" options={['พยาน', 'ผู้ใกล้ชิด']} />
        <Field
          formId={7}
          name="ความสัมพันธ์ใกล้ชิด"
          label="บุคคลผู้มีความสัมพันธ์ใกล้ชิดกับพยาน (ระบุความสัมพันธ์)"
        />
      </Section>

      <Section no="2.–3." title="วิธีการคุ้มครองเดิมและหน่วยงานที่ดำเนินการ">
        <Radios
          formId={7}
          name="วิธีการคุ้มครองเดิม"
          label="วิธีการ/มาตรการที่ใช้ในการคุ้มครองพยาน"
          options={['การคุ้มครองชั่วคราว', 'การคุ้มครองเบื้องต้น']}
          required
        />
        <Field formId={7} name="หน่วยงานคุ้มครอง" label="หน่วยงานที่ดำเนินการคุ้มครองพยาน" />
      </Section>

      <Section no="4." title="ข้อมูลพยาน">
        <Grid>
          <Field formId={7} name="ชื่อพยาน" label="ชื่อ นาย/นาง/นางสาว/อื่นๆ" required />
          <Field formId={7} name="นามสกุลพยาน" label="นามสกุล" />
        </Grid>
        <Grid>
          <Field formId={7} name="อาชีพ" label="อาชีพ" />
          <Radios formId={7} name="สถานภาพ" label="สถานภาพ" options={['โสด', 'สมรส', 'หย่า', 'หม้าย']} />
        </Grid>
        <Grid>
          <Field formId={7} name="ชื่อบิดา" label="ชื่อบิดา" />
          <Field formId={7} name="ชื่อมารดา" label="ชื่อมารดา" />
        </Grid>
        <Grid>
          <Field formId={7} name="ที่อยู่ปัจจุบัน" label="ที่อยู่ปัจจุบัน (ที่สามารถติดต่อได้)" />
          <Field formId={7} name="เบอร์โทรศัพท์" label="โทรศัพท์" />
        </Grid>
        <Grid>
          <Field formId={7} name="สถานที่ทำงาน" label="สถานที่ทำงาน" />
          <Field formId={7} name="โทรศัพท์ที่ทำงาน" label="โทรศัพท์ที่ทำงาน" />
        </Grid>
        <Grid cols={3}>
          <Field formId={7} name="เลขบัตรประชาชน" label="เลขประจำตัวประชาชน (13 หลัก)" />
          <Field formId={7} name="บัตรอื่นๆ" label="หรือเลขที่บัตรประจำตัวอื่นๆ (ระบุ)" />
          <Field formId={7} name="ออกโดย" label="ออกโดย" />
        </Grid>
      </Section>

      <Section no="5." title="บุคคลที่สามารถติดต่อได้">
        <Grid>
          <Field formId={7} name="ผู้ติดต่อได้" label="ชื่อ - สกุล" />
          <Field formId={7} name="ผู้ติดต่อที่อยู่" label="ที่อยู่" />
        </Grid>
        <Grid cols={3}>
          <Field formId={7} name="ผู้ติดต่อโทรศัพท์" label="โทรศัพท์" />
          <Field formId={7} name="ผู้ติดต่อที่ทำงาน" label="สถานที่ทำงาน" />
          <Field formId={7} name="ผู้ติดต่อโทรที่ทำงาน" label="โทรศัพท์ที่ทำงาน" />
        </Grid>
      </Section>

      <Section no="6.–7." title="ความประสงค์และเหตุผลในการขอให้ยุติการคุ้มครอง">
        <Radios formId={7} name="ยุติให้ใคร" label="มีความประสงค์ขอให้ยุติการคุ้มครอง" options={['พยาน', 'ผู้ใกล้ชิด']} />
        <Field formId={7} name="ชื่อผู้ใกล้ชิด" label="บุคคลผู้มีความสัมพันธ์ใกล้ชิด (ระบุชื่อ – สกุล)" />
        <div>
          <label className="ws-label">
            เหตุผลในการขอให้ยุติการคุ้มครอง <span className="text-danger">*</span>
          </label>
          <select
            value={TERMINATION_REASONS.includes(reason) ? reason : ''}
            onChange={(e) => updateField(7, 'เหตุผลการยุติ', e.target.value)}
            className="ws-input mb-2"
          >
            <option value="">- เลือกเหตุผลมาตรฐาน หรือพิมพ์เองด้านล่าง -</option>
            {TERMINATION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            rows={4}
            value={reason}
            onChange={(e) => updateField(7, 'เหตุผลการยุติ', e.target.value)}
            className="ws-input"
            placeholder="ระบุเหตุผลและผลการประเมินความปลอดภัยล่าสุด..."
          />
        </div>
      </Section>

      <Section no="8." title="เอกสารประกอบการยื่นคำร้อง">
        <Checks
          formId={7}
          name="เอกสารประกอบ"
          label="ประเภทเอกสารที่แนบ"
          options={['สำเนาบัตรประชาชน', 'สำเนาทะเบียนบ้าน']}
          columns
        />
        <Field formId={7} name="เอกสารอื่นๆ" label="เอกสารอื่นๆ (ระบุ)" />
        <Grid>
          <Field formId={7} name="ตำแหน่งผู้ยื่น" label="ตำแหน่งผู้ยื่นคำร้อง" />
          <Field
            formId={7}
            name="ตำแหน่งเจ้าพนักงาน"
            label="ตำแหน่งเจ้าพนักงาน"
            placeholder="นักสืบสวนสอบสวนชำนาญการ"
          />
        </Grid>
        <Area formId={7} name="ความเห็นผู้เสนอ" label="ความเห็นเจ้าพนักงานผู้เสนอ (บันทึกภายใน)" rows={2} />
      </Section>
    </EditorShell>
  )
}
