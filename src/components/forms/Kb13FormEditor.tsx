import { Button } from '../common/Button'
import React, { useState } from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { currentReportPeriod, thaiMonthName, formatThaiDate } from '../../lib/utils'
import { showToast } from '../../lib/swal'
import { deriveEpisode } from '../../lib/episode'
import { Area, DateField, DocHeaderFields, EditorShell, Field, Grid, Section } from './fields/FormKit'

interface Kb13FormEditorProps {
  onSaved?: () => void
}

/** 12 งวดย้อนหลังจากงวดปัจจุบัน สำหรับเลือกงวดรายงาน */
function recentPeriods(count = 12): string[] {
  const out: string[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`)
  }
  return out
}

/** คบ.13 — รายงานผลการปฏิบัติการคุ้มครองพยาน (รอบรายเดือนตลอดระยะเวลาคุ้มครอง) */
export const Kb13FormEditor: React.FC<Kb13FormEditorProps> = ({ onSaved }) => {
  const { getDraft, updateField } = useFormDraftStore()
  const { cases } = useCaseStore()
  const draft = getDraft(13)

  /** เกณฑ์เดียวกับ Kb13MonitorPanel/getKb13Progress — เริ่มนับจากวันเริ่มจริง (episode) ไม่ใช่วันอัปโหลดใบตอบรับตำรวจ */
  const protectionCases = cases.filter((c) => Boolean((c.episode || deriveEpisode(c))?.phases?.length))
  const [caseNo, setCaseNo] = useState(protectionCases[0]?.no || '')
  const [period, setPeriod] = useState(currentReportPeriod())

  const selected = cases.find((c) => c.no === caseNo)
  const alreadySent = (selected?.monthlyReports || []).some((r) => r.period === period)

  return (
    <EditorShell
      code="คบ.13"
      formId={13}
      title="รายงานผลการปฏิบัติการคุ้มครองพยาน"
      hint="ตำรวจผู้ดูแลหรือเจ้าพนักงาน ป.ป.ท. จัดส่งรายงานการปฏิบัติงานอย่างต่อเนื่องทุกเดือนตลอดระยะเวลาคุ้มครอง"
      footer={
        protectionCases.length > 0 ? (
          <Button
            type="button"
            onClick={() => {
              const summary = draft['สรุปผลการปฏิบัติงาน']
              if (!summary || !String(summary).trim()) {
                return showToast('กรุณาระบุสรุปผลการดำเนินการ')
              }
              if (alreadySent) {
                return showToast(`งวด ${thaiMonthName(period)} ส่งรายงานไปแล้ว`)
              }
              showToast(`บันทึกแบบ คบ.13 งวด ${thaiMonthName(period)} เรียบร้อยแล้ว`)
              onSaved?.()
            }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
          >
            <i className="fa-solid fa-floppy-disk" />
            บันทึกแบบ คบ.13
          </Button>
        ) : undefined
      }
    >
      {protectionCases.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#aebdca] p-6 text-center text-[0.8rem] text-muted">
          ยังไม่มีพยานที่อยู่ระหว่างการคุ้มครอง (ต้องมีวิธีคุ้มครองเริ่มปฏิบัติจริงก่อน ระบบจึงจะเริ่มนับระยะเวลาได้)
        </div>
      ) : (
        <>
          <Section title="หัวเอกสารและงวดรายงาน">
            <DocHeaderFields formId={13} />
            <Grid cols={3}>
              <div>
                <label className="ws-label">
                  แฟ้มที่รายงาน <span className="text-danger">*</span>
                </label>
                <select
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
              <div>
                <label className="ws-label">
                  งวดรายงาน (รายเดือน) <span className="text-danger">*</span>
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="ws-input"
                >
                  {recentPeriods().map((p) => (
                    <option key={p} value={p}>
                      {thaiMonthName(p)}
                    </option>
                  ))}
                </select>
              </div>
              <Field formId={13} name="สำนักกอง" label="สำนัก/กอง" />
            </Grid>
            <Grid cols={3}>
              <Field formId={13} name="เลขคดี" label="คุ้มครองพยานคดี" />
              <Field formId={13} name="ปีคดี" label="ปี พ.ศ." />
              <div className="rounded-lg border border-line bg-soft px-2.5 py-1.5 text-[0.8rem]">
                <span className="block text-muted">ตั้งแต่วันที่ – ถึงวันที่</span>
                <strong className="text-ink">
                  {formatThaiDate(selected?.actualStartedAt)} – {formatThaiDate(selected?.protectionEndAt)}
                </strong>
                <span className={`ml-2 font-bold ${alreadySent ? 'text-success' : 'text-danger'}`}>
                  {alreadySent ? 'งวดนี้ส่งแล้ว' : 'งวดนี้ยังไม่ส่ง'}
                </span>
              </div>
            </Grid>
          </Section>

          <Section no="1." title="ข้อมูลพยาน">
            <Grid>
              <Field formId={13} name="ชื่อพยาน" label="ชื่อ นาย/นาง/นางสาว/อื่นๆ" required />
              <Field formId={13} name="อาชีพ" label="อาชีพ" />
            </Grid>
            <Grid cols={3}>
              <Field formId={13} name="สถานที่ทำงาน" label="สถานที่ทำงาน" />
              <Field formId={13} name="ที่อยู่ปัจจุบัน" label="ที่อยู่ปัจจุบัน" />
              <Field formId={13} name="เบอร์โทรศัพท์" label="โทรศัพท์" />
            </Grid>
          </Section>

          <Section no="2." title="เจ้าหน้าที่ที่ดำเนินการคุ้มครอง">
            <Field formId={13} name="จำนวนเจ้าหน้าที่" label="จำนวน (ราย)" />
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Field formId={13} name={`ชุดชื่อ${i}`} label={`(${i}) ชื่อ นาย/นาง/นางสาว`} />
                  <Field formId={13} name={`ชุดนามสกุล${i}`} label="นามสกุล" />
                  <Field formId={13} name={`ชุดตำแหน่ง${i}`} label="ตำแหน่ง" />
                </div>
              ))}
            </div>
          </Section>

          <Section no="3.–5." title="คำสั่ง ระยะเวลา และสรุปผล">
            <Grid cols={3}>
              <Field formId={13} name="เลขคำสั่ง" label="3. ตามคำสั่ง" />
              <DateField formId={13} name="คำสั่งลงวันที่" label="ลงวันที่" />
              <Field formId={13} name="จำนวนวัน" label="4. ระยะเวลาให้การคุ้มครอง (วัน)" />
            </Grid>
            <Area
              formId={13}
              name="สรุปผลการปฏิบัติงาน"
              label="5. สรุปผลการดำเนินการ"
              rows={5}
              placeholder="สรุปมาตรการที่ดำเนินการ การตรวจตรา การประสานหน่วยงานในพื้นที่ และสภาพความปลอดภัยของพยาน..."
              required
            />
            <div>
              <label className="ws-label">จำนวนเหตุสำคัญในงวด</label>
              <input
                type="number"
                min={0}
                value={draft['จำนวนเหตุสำคัญ'] ?? 0}
                onChange={(e) => updateField(13, 'จำนวนเหตุสำคัญ', Number(e.target.value))}
                className="ws-input"
              />
            </div>
          </Section>
        </>
      )}
    </EditorShell>
  )
}
