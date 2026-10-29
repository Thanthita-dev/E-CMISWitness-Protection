import React from 'react'
import { terminationReasonText } from '../../lib/terminationRules'
import { Button } from '../common/Button'
import { Area, DateField, EditorShell, Field, Grid, Section } from './fields/FormKit'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { showToast } from '../../lib/swal'

/**
 * คบ.16 — คำสั่งยุติการให้ความคุ้มครองพยาน
 * หน้านี้กรอกและบันทึกอย่างเดียวเหมือน คบ.15/คบ.17 การเสนอลงนามอยู่ที่ปุ่ม "ส่งให้อนุมัติ" แถว คบ.16 ในแฟ้มคำร้อง
 */
export const Kb16FormEditor: React.FC<{ caseNo?: string; onSaved?: () => void }> = ({ caseNo, onSaved }) => {
  const draft = useFormDraftStore((s) => s.drafts[16]) || {}
  const caseItem = useCaseStore((s) => caseNo ? s.getCase(caseNo) : undefined)
  const role = useAuthStore((s) => s.currentRole)
  const { issueKb16, updateCase } = useCaseStore()
  const backdated = Boolean(draft['วันที่ออกคำสั่ง'] && draft['วันที่มีผล'] && draft['วันที่มีผล'] < draft['วันที่ออกคำสั่ง'])
  const readOnly = !['officer', 'case_owner', 'got_officer', 'admin'].includes(role) || Boolean(caseItem?.kb16?.signedAt || caseItem?.kb16?.status === 'submitted')

  if (!caseItem) return <p className="ws-readonly">เปิดแบบ คบ.16 จากแฟ้มที่ต้องการยุติการคุ้มครอง</p>

  /** บันทึกร่างเข้าแฟ้ม เพื่อให้ปุ่ม "ส่งให้อนุมัติ" ที่แถว คบ.16 ใช้ได้ — ตรวจช่องบังคับตอนกดส่ง */
  const save = () => {
    const orderNo = String(draft['เลขที่คำสั่ง'] || '').trim()
    const year = String(draft['ปีคำสั่ง'] || '').trim()
    const input = {
      orderNo: orderNo && year && !orderNo.includes('/') ? `${orderNo}/${year}` : orderNo,
      reason: terminationReasonText(caseItem.kb15),
      issuedAt: String(draft['วันที่ออกคำสั่ง'] || ''),
      effectiveAt: String(draft['วันที่มีผล'] || ''),
      backdatedReason: backdated ? String(draft['เหตุผลวันที่มีผลย้อนหลัง'] || '').trim() || undefined : undefined,
    }
    if (caseItem.kb16) updateCase(caseItem.no, { kb16: { ...caseItem.kb16, ...input } })
    else issueKb16(caseItem.no, input)
    showToast('บันทึกแบบ คบ.16 เรียบร้อยแล้ว')
    onSaved?.()
  }

  return <EditorShell code="คบ.16" formId={16} title="คำสั่งยุติการให้ความคุ้มครองพยาน" hint="กรอกและบันทึกที่นี่ แล้วกด “ส่งให้อนุมัติ” ที่แถว คบ.16 ในแฟ้มคำร้อง เพื่อเสนอเลขาธิการ ป.ป.ท.ลงนาม" footer={readOnly ? <Button type="button" variant="primary" size="md" className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition" onClick={() => { showToast('บันทึกแบบ คบ.16 เรียบร้อยแล้ว'); onSaved?.() }}>บันทึกแบบ คบ.16</Button> : (
    <Button
      type="button"
      onClick={save}
      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
    >
      <i className="fa-solid fa-check" />
      บันทึกแบบ คบ.16
    </Button>
  )}>
    <fieldset disabled={readOnly} className="min-w-0 space-y-5">
      <Section title="ข้อมูลคำสั่ง">
        <Grid><Field formId={16} name="เลขที่คำสั่ง" label="คำสั่งที่" required /><Field formId={16} name="ปีคำสั่ง" label="ปี พ.ศ." required /></Grid>
        <Field formId={16} name="ชื่อพยาน" label="ชื่อพยาน" required />
        <Field formId={16} name="คำสั่งเดิม" label="อ้างถึงคำสั่งคุ้มครองเดิม" />
      </Section>
      <Section title="เหตุยุติและวันที่">
        <div className="ws-readonly"><span className="ws-label">เหตุจาก คบ.15 ที่ผ่านการพิจารณา</span><p>{terminationReasonText(caseItem.kb15)}</p></div>
        <Grid><DateField formId={16} name="วันที่ออกคำสั่ง" label="วันที่ออกคำสั่ง" required /><DateField formId={16} name="วันที่มีผล" label="วันที่คำสั่งมีผล" required /></Grid>
        {backdated && <Area formId={16} name="เหตุผลวันที่มีผลย้อนหลัง" label="เหตุผลที่วันที่มีผลย้อนหลัง" rows={2} required />}
        <p className="text-sm text-muted">วันที่ออกคำสั่งและวันที่มีผลต้องตรงกับเหตุและผลพิจารณาใน คบ.15</p>
      </Section>
    </fieldset>
  </EditorShell>
}
