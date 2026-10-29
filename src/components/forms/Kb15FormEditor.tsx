import { terminationTriggerReference } from '../../lib/terminationRules'
import { Button } from '../common/Button'
import React from 'react'
import { showToast } from '../../lib/swal'
import { Area, DateField, EditorShell, Field, Grid, Section, Select } from './fields/FormKit'
import { TerminationReasonFields } from '../protection/TerminationReasonFields'
import { useFormDraftStore, selectCaseDraft } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'

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
export const Kb15FormEditor: React.FC<Kb15FormEditorProps> = ({ onSaved }) => {
  const caseNo = useFormDraftStore(s => s.draftCaseNo[15])
  const caseItem = useCaseStore(s => caseNo ? s.getCase(caseNo) : undefined)
  return (
  <EditorShell
    code="คบ.15"
    formId={15}
    title="รายงานการให้ความคุ้มครองพยานสิ้นสุด"
    hint="กรอกและบันทึกที่นี่ แล้วกด “ส่งตรวจ” ที่แถว คบ.15 ในแฟ้มคำร้องเพื่อเสนอผู้บังคับบัญชาตรวจสอบ"
    footer={
      <Button
        type="button"
        onClick={() => {
          if (caseItem && !caseItem.terminationTrigger && !caseItem.kb15) {
            const draft = selectCaseDraft(useFormDraftStore.getState(), 15, caseItem.no)
            const ref = terminationTriggerReference(caseItem, draft)
            useCaseStore.getState().recordTerminationTrigger(caseItem.no, {
              source: 'due_or_officer',
              ref,
              receivedAt: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()),
              detail: String(draft['ข้อเท็จจริง'] || ''),
            })
            if (!useCaseStore.getState().getCase(caseItem.no)?.terminationTrigger) {
              showToast('ไม่สามารถบันทึกเรื่องยุติได้ กรุณาตรวจสิทธิ์ผู้รับผิดชอบ', 'warning')
              return
            }
          }
          if (caseItem) {
            const latest = useCaseStore.getState().getCase(caseItem.no)
            useCaseStore.getState().updateCase(caseItem.no, {
              extraForms: Array.from(new Set([...(latest?.extraForms || []), 15, 16, 17])),
            })
          }
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
      <strong>ข้อควรทราบ:</strong> การจัดทำ คบ.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด ต้องตรวจฐานเหตุและวันที่เกิดเหตุจริงแยกจากวันที่จัดทำเอกสาร กรณีข้อ 19 ต้องมีคำสั่งลงนามและถึงวันที่มีผล
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
      <TerminationReasonFields caseItem={caseItem} />
      <p className="text-[0.85rem] text-muted">ความเห็น ผอ. รองเลขาธิการ และเลขาธิการ บันทึกโดยผู้พิจารณาในขั้นตรวจและลงนาม คบ.15</p>
      <Area formId={15} name="เอกสารแนบ" label="เอกสารแนบ" rows={3} />
    </Section>
  </EditorShell>
)
}
