import { addProtectionMonths, calendarDays, monthLabel, legacyMonthLabel, protectionMonths } from '../../lib/protectionMonths'
import { Button } from '../common/Button'
import React, { useEffect, useState } from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { formatThaiDate, daysUntil, addDays } from '../../lib/utils'
import { deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { showToast } from '../../lib/swal'
import { Area, DocHeaderFields, EditorShell, Field, Grid, Section, ThaiDateFields } from './fields/FormKit'
import { Kb14DecisionActions } from '../protection/Kb14DecisionActions'

interface Kb14FormEditorProps {
  onSaved?: () => void
  caseNo?: string
}

/**
 * คบ.14 — หนังสือขยายระยะเวลาการคุ้มครองพยาน
 * WIT1112-1123 — เจ้าหน้าที่ร่าง → ผู้ตรวจตรวจเอกสาร → ผู้มีอำนาจ (เลขาธิการ ป.ป.ท.) พิจารณาอนุมัติ
 */
export const Kb14FormEditor: React.FC<Kb14FormEditorProps> = ({ onSaved, caseNo: caseNoProp }) => {
  const { getDraft, updateField } = useFormDraftStore()
  const { cases } = useCaseStore()
  const { currentRole } = useAuthStore()
  const draft = getDraft(14)

  const protectionCases = cases.filter((c) => c.stage === 'protection' || c.no === caseNoProp)
  const [caseNo, setCaseNo] = useState(
    (caseNoProp && cases.some((c) => c.no === caseNoProp) ? caseNoProp : protectionCases[0]?.no) || ''
  )
  const [months, setMonths] = useState(1)

  const selected = cases.find((c) => c.no === caseNo)
  const left = daysUntil(selected?.protectionEndAt)

  const requests = selected?.extensionRequests || []
  const latest = requests[requests.length - 1]
  const episode = selected?.episode || (selected ? deriveEpisode(selected) : undefined)
  const summary = selected ? summarizeEpisode(episode) : undefined

  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(currentRole)
  const editable = latest && (latest.status === 'returned' || latest.status === 'submitted') ? latest : undefined
  const canDraft =
    isOfficer && !summary?.atCap && (!latest || latest.status === 'returned' || latest.status === 'rejected' || latest.status === 'submitted' && !latest.formSnapshot)

  useEffect(() => {
    if (!selected) return
    const store = useFormDraftStore.getState()
    store.ensureDraftForCase(14, selected.no, { 'ชื่อพยาน': selected.person, 'รวมเดือน': String(protectionMonths(selected)), 'เหตุผลขยายเวลา': latest?.reason || '', 'ขยายวัน': String(latest?.durationDays || 30), ...(latest?.formSnapshot || {}), periodFrom: latest?.periodFrom || (selected.protectionEndAt ? addDays(selected.protectionEndAt, 1).slice(0, 10) : ''), attachments: latest?.attachments || ['คบ.13 รอบล่าสุด', 'ผลประเมินความเสี่ยงล่าสุด'] })
    const saved = store.getDraft(14)
    if (selected.demoData && !latest?.formSnapshot) {
      const now = new Date()
      const defaults: Record<string, any> = {
        'เลขที่แบบ': `สาธิต-${selected.no.slice(-6)}`, 'ปีที่ยื่น': String(now.getFullYear() + 543),
        'วันเดือนปี': now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
        'ชื่อพยาน': selected.person, 'เลขคดี': selected.mainCaseNo || `คดีสาธิต/${selected.no.slice(-6)}`,
        'รวมปี': '0', 'รวมเดือน': '2', 'รวมวัน': '0',
        'เหตุผลขยายเวลา': 'ข้อมูลสาธิต: ยังมีภัยคุกคามต่อพยาน จึงขอขยายเวลาคุ้มครองเพิ่ม 1 เดือน เพื่อดำเนินมาตรการเดิมและติดตามความปลอดภัยต่อเนื่อง',
        'ครั้งที่': '1', 'ปีครั้งที่': String(now.getFullYear() + 543), 'มติวันที่': String(now.getDate()),
        'มติเดือน': String(now.getMonth() + 1), 'มติพ.ศ.': String(now.getFullYear() + 543),
        'คุ้มครองครั้งที่': String((selected.extensionRequests?.filter((r) => r.status === 'approved').length || 0) + 2),
        'ขยายเดือน': '1', 'ขยายวัน': '30',
        'เงื่อนไขปฏิบัติ': 'ข้อมูลสาธิต: ดำเนินมาตรการตามคำสั่งเดิมและส่งรายงาน คบ.13 ทุกเดือน',
      }
      for (const [key, value] of Object.entries(defaults)) if (!saved[key]) store.updateField(14, key, value)
    }

    if (!saved['ชื่อพยาน']) store.updateField(14, 'ชื่อพยาน', selected.person)
    const dateParts = (prefix: string, iso?: string) => {
      if (!iso) return
      const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
      if (!y || !m || !d) return
      for (const [key, value] of Object.entries({ [`${prefix}วันที่`]: String(d), [`${prefix}เดือน`]: String(m), [`${prefix}พ.ศ.`]: String(y + 543) })) if (!saved[key]) store.updateField(14, key, value)
    }
    dateParts('ขยายเริ่ม', saved.periodFrom)
    dateParts('ขยายถึง', saved.periodFrom ? addProtectionMonths(saved.periodFrom, Number(saved['ขยายเดือน']) || latest?.durationMonths || 1) : undefined)
    dateParts('เริ่ม', selected.actualStartedAt)
    dateParts('ถึง', selected.protectionEndAt)

    setMonths(Number(store.getDraft(14)['ขยายเดือน']) || latest?.durationMonths || 1)
  }, [caseNo])

  return (
    <EditorShell
      code="คบ.14"
      formId={14}
      caseNo={caseNo}
      title="หนังสือขยายระยะเวลาการคุ้มครองพยาน"
      hint="ผู้บังคับบัญชาชั้นต้น → ผอ.กอง → รองเลขาธิการ → เลขาธิการ"
      footer={
        protectionCases.length > 0 && (canDraft || (isOfficer && editable?.status === 'returned')) ? (
          <Button
            type="button"
            onClick={() => {
              const reason = draft['เหตุผลขยายเวลา']
              if (!reason || !String(reason).trim()) {
                return showToast('กรุณาระบุข้อพิจารณาและเหตุผลในการขยายระยะเวลา')
              }
              if (!selected) return
              const fieldsDate = (prefix: string) => {
                const y = Number(draft[`${prefix}พ.ศ.`]); const m = Number(draft[`${prefix}เดือน`]); const d = Number(draft[`${prefix}วันที่`])
                return y && m && d ? `${y > 2400 ? y - 543 : y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : undefined
              }
              const periodFrom = fieldsDate('ขยายเริ่ม') || draft.periodFrom || (selected.protectionEndAt ? addDays(selected.protectionEndAt, 1).slice(0, 10) : '')
              if (!periodFrom) return showToast('กรุณาระบุวันเริ่มขยายเวลา', 'warning')
              const periodTo = addProtectionMonths(periodFrom, months)
              const days = calendarDays(periodFrom, periodTo)
              const capEnd = summary?.startedAt ? addProtectionMonths(summary.startedAt, 6) : undefined
              if (months < 1 || months > 2 || capEnd && periodTo > capEnd) return showToast('ขยายได้ครั้งละไม่เกิน 2 เดือน และรวมไม่เกิน 6 เดือน', 'warning')
              updateField(14, 'ขยายวัน', String(days))
              useCaseStore.getState().draftKb14(selected.no, { reason: String(reason), durationDays: days, durationMonths: months, periodFrom, periodTo, attachments: draft.attachments || latest?.attachments || [], gapDays: draft.gapDays, gapReason: draft.gapReason, formSnapshot: { ...draft, 'ขยายวัน': String(days), 'ขยายเดือน': String(months), periodFrom, periodTo, 'ขยายถึงวันที่': periodTo.slice(8), 'ขยายถึงเดือน': String(Number(periodTo.slice(5, 7))), 'ขยายถึงพ.ศ.': String(Number(periodTo.slice(0, 4)) + 543) } })
              showToast('ส่งแบบ คบ.14 ให้ผู้บังคับบัญชาชั้นต้นแล้ว')
              onSaved?.()
            }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white transition bg-navy hover:bg-blue"
          >
            <i className="fa-solid fa-floppy-disk" />
            ส่งให้ผู้บังคับบัญชาชั้นต้น
          </Button>
        ) : undefined
      }
    >
      {protectionCases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#aebdca] p-6 text-center text-[0.8rem] text-muted">
          ยังไม่มีพยานที่อยู่ระหว่างการคุ้มครอง
        </div>
      ) : (
        <>
          <fieldset disabled={!canDraft} className="m-0 min-w-0 space-y-4 border-0 p-0">
          <Section title="หัวเอกสาร">
            <DocHeaderFields formId={14} />
          </Section>

          <Section no="1." title="พยานและระยะเวลาคุ้มครองเดิม">
            <Grid cols={3}>
              <div>
                <label className="ws-label">
                  แฟ้มที่ขอขยายเวลา <span className="text-danger">*</span>
                </label>
                <select
                  disabled={Boolean(caseNoProp)}
                  value={caseNo}
                  onChange={(e) => setCaseNo(e.target.value)}
                  className="ws-input"
                >
                  {protectionCases.map((c) => (
                    <option key={c.no} value={c.no}>
                      {c.no} — {c.person}
                    </option>
                  ))}
                </select>
              </div>
              <Field formId={14} name="ชื่อพยาน" label="ข้าพเจ้า นาย/นาง/นางสาว" required />
              <Field formId={14} name="นามสกุลพยาน" label="นามสกุล" />
            </Grid>
            <Field formId={14} name="เลขคดี" label="พยานในคดีหมายเลขที่" />
            <Grid>
              <ThaiDateFields
                formId={14}
                label="ตั้งแต่วันที่"
                dayKey="เริ่มวันที่"
                monthKey="เริ่มเดือน"
                yearKey="เริ่มพ.ศ."
              />
              <ThaiDateFields formId={14} label="ถึงวันที่" dayKey="ถึงวันที่" monthKey="ถึงเดือน" yearKey="ถึงพ.ศ." />
            </Grid>
            <Field formId={14} name="รวมเดือน" label="ระยะเวลาคุ้มครองเดิม (เดือน)" />

            {selected && (
              <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div>
                  <span className="block text-muted">คำสั่งอนุมัติเดิม</span>
                  <strong className="text-ink">{selected.decisionNumber || '-'}</strong>
                </div>
                <div>
                  <span className="block text-muted">ครบกำหนดเดิม</span>
                  <strong className="text-ink">{formatThaiDate(selected.protectionEndAt)}</strong>
                </div>
                <div>
                  <span className="block text-muted">คงเหลือ</span>
                  <strong className={left !== null && left <= 15 ? 'text-warning' : 'text-ink'}>
                    {left === null ? '-' : left >= 0 ? monthLabel(left / 30) : `เกินกำหนด ${monthLabel(Math.abs(left) / 30)}`}
                  </strong>
                </div>
              </div>
            )}
          </Section>

          <Section no="2." title="ข้อพิจารณาและเหตุผลในการขยายระยะเวลาการคุ้มครองพยาน">
            <Area
              formId={14}
              name="เหตุผลขยายเวลา"
              label="เหตุผลความจำเป็น (ภัยคุกคามยังไม่หมดไป)"
              rows={5}
              placeholder="ระบุพฤติการณ์ภัยคุกคามที่ยังคงอยู่ ผลการประเมินความเสี่ยงล่าสุด และความจำเป็นในการคุ้มครองต่อเนื่อง..."
              required
            />
          </Section>

          <Section no="3." title="มติที่ประชุมคณะอนุกรรมการกลั่นกรอง">
            <Grid cols={4}>
              <Field formId={14} name="ครั้งที่" label="ครั้งที่" />
              <Field formId={14} name="ปีครั้งที่" label="ปี พ.ศ." />
              <Field formId={14} name="มติวันที่" label="เมื่อวันที่" />
              <Field formId={14} name="มติเดือน" label="เดือน" />
            </Grid>
            <Grid cols={3}>
              <Field formId={14} name="มติพ.ศ." label="พ.ศ." />
              <Field formId={14} name="คุ้มครองครั้งที่" label="เข้ารับการคุ้มครองครั้งที่" />
              <div>
                <label className="ws-label">
                  ระยะเวลาที่ขอขยาย (ครั้งละไม่เกิน 2 เดือน) <span className="text-danger">*</span>
                </label>
                <select
                  value={months}
                  onChange={(e) => {
                    const value = Number(e.target.value)
                    setMonths(value); updateField(14, 'ขยายเดือน', String(value))
                    const from = draft.periodFrom
                    if (from) {
                      const end = addProtectionMonths(from, value)
                      updateField(14, 'ขยายถึงวันที่', end.slice(8))
                      updateField(14, 'ขยายถึงเดือน', String(Number(end.slice(5, 7))))
                      updateField(14, 'ขยายถึงพ.ศ.', String(Number(end.slice(0, 4)) + 543))
                    }
                  }}
                  className="ws-input"
                >
                  {[1, 2].map((d) => (
                    <option key={d} value={d}>
                      {d} เดือน
                    </option>
                  ))}
                </select>
              </div>
            </Grid>
            <Grid>
              <ThaiDateFields
                formId={14}
                label="นับตั้งแต่วันที่"
                dayKey="ขยายเริ่มวันที่"
                monthKey="ขยายเริ่มเดือน"
                yearKey="ขยายเริ่มพ.ศ."
              />
              <ThaiDateFields
                formId={14}
                label="ถึงวันที่"
                dayKey="ขยายถึงวันที่"
                monthKey="ขยายถึงเดือน"
                yearKey="ขยายถึงพ.ศ."
              />
            </Grid>
          </Section>

          <Section no="4.–5." title="ความเห็นเลขาธิการฯ และเงื่อนไขการปฏิบัติ">
            <Area formId={14} name="ความเห็นเลขาธิการ" label="4. ความเห็นของเลขาธิการคณะกรรมการ ป.ป.ท." rows={2} />
            <Area formId={14} name="เงื่อนไขปฏิบัติ" label="5. เงื่อนไขการปฏิบัติตามคำสั่ง" rows={3} />
            <Grid cols={3}>
              <Field formId={14} name="ลงวัน" label="ลงวันที่ (วัน)" />
              <Field formId={14} name="ลงเดือน" label="(เดือน)" />
              <Field formId={14} name="ลงปี" label="(ปี)" />
            </Grid>
          </Section>

          </fieldset>

          {summary?.atCap && (
            <div className="rounded-lg border border-danger bg-danger-soft p-3 text-[0.88rem] leading-relaxed text-danger-dark">
              <i className="fa-solid fa-ban mr-1.5" />
              ถึงเพดานรวมแล้ว ห้ามจัดทำ คบ.14 เพิ่ม
            </div>
          )}

          {/* ---------- สถานะ คบ.14 ฉบับล่าสุด ---------- */}
          {latest && (
            <div className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
              <div>
                <strong>คบ.14 ฉบับที่ {latest.version || 1}</strong> · ขอขยาย {latest.durationMonths ? monthLabel(latest.durationMonths) : legacyMonthLabel(latest.durationDays)}
                {latest.locked && <span className="ml-1.5 text-success font-bold">· ล็อกฉบับลงนาม</span>}
              </div>
              <div>เหตุผล: {latest.reason}</div>
              <div>
                สถานะ:{' '}
                {
                  {
                    submitted: 'รอผู้ตรวจตรวจเอกสาร',
                    returned: 'ส่งคืนแก้ไข',
                    pending: 'เสนอตามลำดับชั้น · รอเลขาธิการ ป.ป.ท. อนุมัติ',
                    approved: 'อนุมัติแล้ว',
                    rejected: 'ไม่อนุมัติ',
                  }[latest.status]
                }
                {latest.reviewNote ? ` · ${latest.reviewNote}` : ''}
                {latest.decisionNote ? ` · ${latest.decisionNote}` : ''}
              </div>
            </div>
          )}

          {/* ---------- WIT1117-WIT1123 — ผู้ตรวจตรวจเอกสาร / เลขาธิการ ป.ป.ท. พิจารณา ---------- */}
          {selected && latest && (latest.status === 'submitted' || latest.status === 'pending') && (
            <div className="rounded-lg border border-line p-3">
              <Kb14DecisionActions
                caseItem={selected}
                proposal={latest}
                role={currentRole}
                onDone={onSaved}
                className="space-y-2"
              />
            </div>
          )}
        </>
      )}
    </EditorShell>
  )
}
