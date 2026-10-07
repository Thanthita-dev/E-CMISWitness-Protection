import React from 'react'
import { Button } from '../common/Button'
import { Area, DateField, EditorShell, Field, Grid, Section } from './fields/FormKit'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { showToast } from '../../lib/swal'

/** คบ.16 จากเรื่องยุติ: กรอกครั้งเดียวแล้วเสนอผู้มีอำนาจลงนาม */
export const Kb16FormEditor: React.FC<{ caseNo?: string; onSaved?: () => void }> = ({ caseNo, onSaved }) => {
  const draft = useFormDraftStore((s) => s.drafts[16]) || {}
  const caseItem = useCaseStore((s) => caseNo ? s.getCase(caseNo) : undefined)
  const role = useAuthStore((s) => s.currentRole)
  const { issueKb16, submitKb16ForSignature } = useCaseStore()
  const backdated = Boolean(draft['วันที่ออกคำสั่ง'] && draft['วันที่มีผล'] && draft['วันที่มีผล'] < draft['วันที่ออกคำสั่ง'])
  const readOnly = !['officer', 'case_owner', 'got_officer', 'admin'].includes(role) || Boolean(caseItem?.kb16?.signedAt || caseItem?.kb16?.status === 'submitted')

  if (!caseItem) return <p className="ws-readonly">เปิดแบบ คบ.16 จากแฟ้มที่ต้องการยุติการคุ้มครอง</p>
  if (!caseItem.terminationApproval?.approved) return <p className="ws-readonly">รอผลอนุมัติให้จัดทำคำสั่งยุติ</p>

  const submit = () => {
    const orderNo = String(draft['เลขที่คำสั่ง'] || '').trim()
    const year = String(draft['ปีคำสั่ง'] || '').trim()
    const reason = String(draft['เหตุยุติ'] || '').trim()
    const issuedAt = String(draft['วันที่ออกคำสั่ง'] || '')
    const effectiveAt = String(draft['วันที่มีผล'] || '')
    const backdatedReason = String(draft['เหตุผลวันที่มีผลย้อนหลัง'] || '').trim()
    if (!orderNo || !year || !reason || !issuedAt || !effectiveAt || !String(draft['ชื่อพยาน'] || '').trim()) {
      showToast('กรุณากรอกคำสั่งที่ ชื่อพยาน เหตุยุติ และวันที่ให้ครบ', 'warning')
      return
    }
    if (backdated && !backdatedReason) {
      showToast('กรุณาระบุเหตุผลที่วันที่มีผลย้อนหลัง', 'warning')
      return
    }
    issueKb16(caseItem.no, { orderNo: orderNo.includes('/') ? orderNo : `${orderNo}/${year}`, reason, issuedAt, effectiveAt, backdatedReason: backdated ? backdatedReason : undefined })
    submitKb16ForSignature(caseItem.no)
    if (useCaseStore.getState().getCase(caseItem.no)?.kb16?.status !== 'submitted') {
      showToast('ยังส่งไม่ได้ กรุณาตรวจผู้รับผิดชอบปัจจุบันของแฟ้ม', 'warning')
      return
    }
    showToast('ส่ง คบ.16 ให้ผู้มีอำนาจลงนามแล้ว')
    onSaved?.()
  }

  return <EditorShell code="คบ.16" formId={16} title="คำสั่งยุติการให้ความคุ้มครองพยาน" hint="กรอกคำสั่ง แล้วเสนอผู้มีอำนาจลงนาม" footer={readOnly ? <span className="text-sm text-muted">{caseItem.kb16?.signedAt ? 'ลงนามแล้ว' : 'รอผู้มีอำนาจลงนาม'}</span> : <>
    <Button type="button" variant="secondary" onClick={() => showToast('บันทึกร่าง คบ.16 แล้ว')}>บันทึกร่าง</Button>
    <Button type="button" onClick={submit}>ส่งให้ผู้มีอำนาจลงนาม</Button>
  </>}>
    <fieldset disabled={readOnly} className="min-w-0 space-y-5">
      <Section title="ข้อมูลคำสั่ง">
        <Grid><Field formId={16} name="เลขที่คำสั่ง" label="คำสั่งที่" required /><Field formId={16} name="ปีคำสั่ง" label="ปี พ.ศ." required /></Grid>
        <Field formId={16} name="ชื่อพยาน" label="ชื่อพยาน" required />
        <Field formId={16} name="คำสั่งเดิม" label="อ้างถึงคำสั่งคุ้มครองเดิม" />
      </Section>
      <Section title="เหตุยุติและวันที่">
        <Area formId={16} name="เหตุยุติ" label="เหตุยุติ" rows={3} required />
        <Grid><DateField formId={16} name="วันที่ออกคำสั่ง" label="วันที่ออกคำสั่ง" required /><DateField formId={16} name="วันที่มีผล" label="วันที่คำสั่งมีผล" required /></Grid>
        {backdated && <Area formId={16} name="เหตุผลวันที่มีผลย้อนหลัง" label="เหตุผลที่วันที่มีผลย้อนหลัง" rows={2} required />}
        <p className="text-sm text-muted">การคุ้มครองสิ้นสุดเมื่อคำสั่งลงนามและถึงวันที่มีผล</p>
      </Section>
    </fieldset>
  </EditorShell>
}
