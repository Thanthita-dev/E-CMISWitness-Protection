import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { VersionHistory, VersionHistoryEntry } from '../common/VersionHistory'
import { Area, DateField, DocHeaderFields, EditorShell, Field, Grid, Section, ThaiDateFields } from './fields/FormKit'

interface Kb3FormEditorProps {
  onSaved?: () => void
  /** แฟ้มคำร้องที่เปิดแบบ คบ.3 นี้ — ใช้ผูกประวัติเวอร์ชัน/ล็อกฉบับลงนามเข้ากับแฟ้ม (TC-161) */
  caseNo?: string
}

/** คบ.3 — บันทึกข้อเท็จจริงประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น (ข้อ 1–5 ตามต้นฉบับ) */
export const Kb3FormEditor: React.FC<Kb3FormEditorProps> = ({ onSaved, caseNo }) => {
  const getCase = useCaseStore((s) => s.getCase)
  const caseItem = caseNo ? getCase(caseNo) : undefined
  const kb3Lock = useFormDraftStore((s) => s.locks[3])

  /**
   * TC-161 — ชุดเสนอ คบ.3/คบ.6 ถือว่าถูกล็อกพร้อมกันตั้งแต่ ผบช.ชั้นต้นลงนามข้อ 10 ของ คบ.6 (WIT0513)
   * เพราะจากจุดนั้นชุดเสนอถูกรับรองเข้าสู่ชั้นกลั่นกรองแล้ว แก้ต่อได้ต่อเมื่อสร้างเวอร์ชันใหม่
   */
  const kb6SupervisorSignedAt = caseItem?.kb6SupervisorSignedAt
  const kb6SupervisorSignedBy = caseItem?.kb6SupervisorSignedBy
  React.useEffect(() => {
    if (!kb6SupervisorSignedAt) return
    const { locks, revisions, lockForm } = useFormDraftStore.getState()
    if (locks[3] || (revisions[3] || []).length > 0) return
    lockForm(
      3,
      kb6SupervisorSignedBy || 'ผู้บังคับบัญชาชั้นต้น',
      `ลงนามรับรองชุดเสนอ (ความเห็นผู้บังคับบัญชาชั้นต้นข้อ 10 ของ คบ.6) เมื่อ ${kb6SupervisorSignedAt}`
    )
  }, [kb6SupervisorSignedAt, kb6SupervisorSignedBy])

  const kb3Version = caseItem?.kb3Version || 1
  const kb3PreviousVersions = caseItem?.kb3PreviousVersions || []
  const historyEntries: VersionHistoryEntry[] = kb3PreviousVersions.map((v) => ({
    version: v.version,
    at: v.returnedAt,
    by: v.returnedBy,
    status: 'returned',
    note: v.returnReason,
  }))

  return (
  <EditorShell
    code="คบ.3"
    formId={3}
    title="บันทึกข้อเท็จจริง ประกอบการขอใช้มาตรการคุ้มครองเบื้องต้น"
    hint="สำหรับเจ้าพนักงาน ป.ป.ท. บันทึกถ้อยคำของผู้ให้ถ้อยคำต่อหน้าเจ้าพนักงาน"
    footer={
      <Button
        type="button"
        onClick={() => {
          showToast('บันทึกแบบ คบ.3 เรียบร้อยแล้ว')
          onSaved?.()
        }}
        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
      >
        <i className="fa-solid fa-check" />
        บันทึกแบบ คบ.3
      </Button>
    }
  >
    <VersionHistory
      code="kb3"
      currentVersion={kb3Version}
      entries={historyEntries}
      locked={Boolean(kb3Lock)}
      lockedBy={kb6SupervisorSignedBy}
      lockedNote={kb6SupervisorSignedAt ? `ลงนามรับรองชุดเสนอเมื่อ ${kb6SupervisorSignedAt}` : undefined}
    />

    <Section title="หัวเอกสาร">
      <DocHeaderFields formId={3} />
      <Grid>
        <Field formId={3} name="สถานที่บันทึก" label="เขียนที่" required />
        <ThaiDateFields formId={3} label="วันที่บันทึก" dayKey="วันที่" monthKey="เดือน" yearKey="พ.ศ." />
      </Grid>
    </Section>

    <Section no="1." title="ข้อมูลผู้ให้ถ้อยคำ">
      <Field formId={3} name="ผู้ให้ถ้อยคำ" label="ข้าพเจ้า นาย/นาง/นางสาว/อื่นๆ" required />
      <Grid cols={4}>
        <Field formId={3} name="เกิดวันที่" label="เกิดวันที่" />
        <Field formId={3} name="เกิดเดือน" label="เดือน" />
        <Field formId={3} name="เกิดพ.ศ." label="พ.ศ." />
        <Field formId={3} name="อายุ" label="อายุ" />
      </Grid>
      <Grid cols={3}>
        <Field formId={3} name="เชื้อชาติ" label="เชื้อชาติ" />
        <Field formId={3} name="สัญชาติ" label="สัญชาติ" />
        <Field formId={3} name="อาชีพ" label="อาชีพ" />
      </Grid>
      <Grid cols={4}>
        <Field formId={3} name="บ้านเลขที่" label="ที่อยู่ตามทะเบียนบ้าน เลขที่" />
        <Field formId={3} name="หมู่ที่" label="หมู่ที่" />
        <Field formId={3} name="ตรอกซอย" label="ตรอก/ซอย" />
        <Field formId={3} name="ถนน" label="ถนน" />
      </Grid>
      <Grid cols={4}>
        <Field formId={3} name="ตำบล" label="ตำบล/แขวง" />
        <Field formId={3} name="อำเภอ" label="อำเภอ/เขต" />
        <Field formId={3} name="จังหวัด" label="จังหวัด" />
        <Field formId={3} name="รหัสไปรษณีย์" label="รหัสไปรษณีย์" />
      </Grid>
      <Field formId={3} name="เบอร์โทรศัพท์" label="โทรศัพท์" />
    </Section>

    <Section no="2." title="ที่อยู่ปัจจุบัน">
      <Grid cols={4}>
        <Field formId={3} name="ปัจจุบันเลขที่" label="เลขที่" />
        <Field formId={3} name="ปัจจุบันหมู่ที่" label="หมู่ที่" />
        <Field formId={3} name="ปัจจุบันตรอกซอย" label="ตรอก/ซอย" />
        <Field formId={3} name="ปัจจุบันถนน" label="ถนน" />
      </Grid>
      <Grid cols={4}>
        <Field formId={3} name="ปัจจุบันตำบล" label="ตำบล/แขวง" />
        <Field formId={3} name="ปัจจุบันอำเภอ" label="อำเภอ/เขต" />
        <Field formId={3} name="ปัจจุบันจังหวัด" label="จังหวัด" />
        <Field formId={3} name="ปัจจุบันรหัสไปรษณีย์" label="รหัสไปรษณีย์" />
      </Grid>
      <Field formId={3} name="ปัจจุบันโทรศัพท์" label="โทรศัพท์" />
    </Section>

    <Section no="3." title="หนังสือสำคัญแสดงตน">
      <Grid>
        <Field formId={3} name="ชนิดหนังสือสำคัญ" label="ชนิด" placeholder="บัตรประจำตัวประชาชน" />
        <Field formId={3} name="เลขบัตรประชาชน" label="หมายเลข" />
      </Grid>
      <Grid cols={3}>
        <Field formId={3} name="ออกให้ที่" label="ออกให้ที่" />
        <DateField formId={3} name="วันออกบัตร" label="วันออก" />
        <DateField formId={3} name="บัตรหมดอายุ" label="วันสิ้นอายุ" />
      </Grid>
    </Section>

    <Section no="4." title="ถ้อยคำประกอบคำร้องขอการคุ้มครองพยาน">
      <Field formId={3} name="ชื่อพยาน" label="ให้ถ้อยคำประกอบคำร้องขอของ นาย/นาง/นางสาว/อื่นๆ" required />
      <Area
        formId={3}
        name="บันทึกถ้อยคำ"
        label="ซึ่งเป็นพยานคดีทุจริตในภาครัฐเรื่อง"
        rows={4}
        placeholder="ระบุเรื่องที่เป็นพยานและรายละเอียดถ้อยคำ..."
        required
      />
    </Section>

    <Section no="5." title="พฤติการณ์แห่งความไม่ปลอดภัย">
      <Area
        formId={3}
        name="ความเห็นเจ้าหน้าที่"
        label="ระบุพฤติการณ์แห่งความไม่ปลอดภัยจากการมาเป็นพยานในคดีทุจริตในภาครัฐ"
        rows={6}
        required
      />
      <Field
        formId={3}
        name="ตำแหน่งเจ้าพนักงาน"
        label="ตำแหน่งเจ้าพนักงานผู้บันทึก"
        placeholder="นักสืบสวนสอบสวนชำนาญการ"
      />
    </Section>
  </EditorShell>
  )
}
