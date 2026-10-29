import { Button } from '../common/Button'
import React from 'react'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { SignatureModal } from '../common/SignatureModal'
import { PaperSignRegistration } from './paper/paperSign'
import { showToast } from '../../lib/swal'
import { kb5RequiresOfficerTeam } from '../../lib/constants'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { FastTrackSignatureActions } from './FastTrackSignatureActions'
import { EditorShell, Field, Grid, OfficerRosterFields, Section, ThaiDateFields, ThaiDatePickerFields } from './fields/FormKit'

interface Kb5FormEditorProps {
  onSaved?: () => void
  caseNo?: string
}

/** คบ.5 — คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว */
export const Kb5FormEditor: React.FC<Kb5FormEditorProps> = ({ onSaved, caseNo }) => {
  /** เลือกวิธีที่ 1 ใน คบ.4 เท่านั้นที่ต้องมีชุดเจ้าพนักงาน — วิธีอื่นซ่อนส่วนชุดทั้งส่วน */
  const needsTeam = kb5RequiresOfficerTeam(useFormDraftStore((st) => st.drafts[4]) ?? {})
  const caseItem = useCaseStore((state) => caseNo ? state.getCase(caseNo) : undefined)
  const auth = useAuthStore()
  const [witnessSignOpen, setWitnessSignOpen] = React.useState(false)
  const witnessSigned = useFormDraftStore((state) => Boolean(state.draftCaseNo[5] === caseNo && state.signatures['kb5-witness']?.signed))
  const canWitnessSign = Boolean(caseItem) && !witnessSigned && !caseItem?.fastTrack?.witnessAckAt &&
    (auth.currentRole === 'admin' || (['officer', 'case_owner'].includes(auth.currentRole) && caseItem?.assignedOfficerUserId === auth.currentOfficerUserId))

  return (
  <EditorShell
    code="คบ.5"
    formId={5}
    caseNo={caseNo}
    title="คำสั่งมอบหมายเจ้าพนักงานดำเนินการให้ความคุ้มครองชั่วคราว"
    hint="คำสั่งของผู้อำนวยการสำนัก/กอง/ศูนย์ ในสังกัดสำนักงาน ป.ป.ท."
    footer={
      <>
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
      {/* ผอ. ลงนามคำสั่งที่นี่ที่เดียว ข้าง "บันทึกคำสั่ง คบ.5" (เช่นเดียวกับ คบ.6) */}
      <FastTrackSignatureActions formId={5} caseNo={caseNo} />
      <PaperSignRegistration signKey="kb5-witness" handler={canWitnessSign ? { onSign: () => setWitnessSignOpen(true) } : null} />
      {witnessSignOpen && caseItem && <SignatureModal isOpen external title="พยานลงนามรับทราบและยินยอม" signerRole="พยานผู้รับการคุ้มครอง" defaultSignerName={caseItem.person || ''} onClose={() => setWitnessSignOpen(false)} onConfirm={(name, image) => {
        if (!canWitnessSign) return
        useFormDraftStore.getState().signDocument('kb5-witness', name, image, caseItem.no)
        useCaseStore.getState().acknowledgeKb5Order(caseItem.no, name)
        setWitnessSignOpen(false)
        showToast('บันทึกการลงนามยินยอมของพยานแล้ว')
      }} />}
      </>
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
        {/* WIT0603 — ช่วงวันที่นี้คือที่มาของจำนวนวันคุ้มครองชั่วคราวที่ระบบใช้ตรวจเพดานรวม 180 วันก่อนส่ง ผอ. */}
        <ThaiDatePickerFields
          formId={5}
          label="ตั้งแต่วันที่"
          dayKey="เริ่มวันที่"
          monthKey="เริ่มเดือน"
          yearKey="เริ่มพ.ศ."
          required
          testId="kb5-period-start"
        />
        <ThaiDatePickerFields
          formId={5}
          label="ถึงวันที่"
          dayKey="ถึงวันที่"
          monthKey="ถึงเดือน"
          yearKey="ถึงพ.ศ."
          required
          testId="kb5-period-end"
        />
      </Grid>
    </Section>

    <Section title={needsTeam ? 'เจ้าพนักงานที่ได้รับมอบหมาย' : 'การรายงานผล'}>
      {needsTeam && <OfficerRosterFields formId={5} />}
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
}
