import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { Area, DateField, EditorShell, Field, Grid, Section } from './fields/FormKit'

interface Kb15FormEditorProps {
  onSaved?: () => void
}

/**
 * คบ.15 — รายงานการให้ความคุ้มครองพยานสิ้นสุด (แท็บ 11C · WIT1129)
 *
 * หน้านี้กรอกและบันทึกอย่างเดียวโดยตั้งใจ การเดินเรื่อง (ส่งต่อผู้บังคับบัญชาตรวจ → เห็นชอบ/ส่งคืน)
 * อยู่ที่แถว คบ.15 ในรายการแบบฟอร์มของแฟ้มคำร้อง ที่เดียวกับ คบ.8 และ คบ.14
 * เพื่อไม่ให้มีสองทางส่งเรื่องเดียวกัน
 */
export const Kb15FormEditor: React.FC<Kb15FormEditorProps> = ({ onSaved }) => (
  <EditorShell
    code="คบ.15"
    formId={15}
    title="รายงานการให้ความคุ้มครองพยานสิ้นสุด"
    hint="กรอกและบันทึกที่นี่ แล้วกด “ส่งตรวจ” ที่แถว คบ.15 ในแฟ้มคำร้องเพื่อเสนอผู้บังคับบัญชาตรวจสอบ"
    footer={
      <Button
        type="button"
        onClick={() => {
          showToast('บันทึกแบบ คบ.15 เรียบร้อยแล้ว')
          onSaved?.()
        }}
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
      >
        <i className="fa-solid fa-check" />
        บันทึกแบบ คบ.15
      </Button>
    }
  >
    {/* ---------- WIT1130 — กฎที่ต้องเห็นตลอดเวลา ---------- */}
    <div className="ws-callout text-[0.88rem] leading-relaxed">
      <i className="fa-solid fa-triangle-exclamation mr-1.5" />
      <strong>ข้อควรทราบ:</strong> การจัดทำ คบ.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด สถานะ "ยุติ" เกิดขึ้นเมื่อมีคำสั่ง คบ.16
      ที่ลงนามแล้วและถึงวันที่คำสั่งมีผลเท่านั้น
    </div>

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
      {/* WIT1126-WIT1128 — เลขอ้างอิงของเหตุยุติ ใช้เป็นเงื่อนไขของปุ่ม "ส่งตรวจ" ในแฟ้ม */}
      <Field
        formId={15}
        name="อ้างอิงเหตุยุติ"
        label="อ้างอิง คบ.7 / เลขหนังสือขอยุติ / คำสั่งที่ครบกำหนด"
        placeholder="เช่น คบ.7 เลขรับ 042/2569"
        required
      />
      <Area formId={15} name="เหตุยุติ" label="เหตุแห่งการยุติ" rows={3} required />
      <Area formId={15} name="สรุปผล" label="สรุปผลการให้ความคุ้มครองและหลักฐานประกอบ" rows={5} />
      <Area formId={15} name="ความเห็นลำดับชั้น" label="ความเห็นตามลำดับชั้น" rows={4} />
      <Area formId={15} name="เอกสารแนบ" label="เอกสารแนบ" rows={3} />
    </Section>
  </EditorShell>
)
