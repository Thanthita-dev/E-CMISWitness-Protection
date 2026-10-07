import { Button } from '../common/Button'
import React from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import { useCaseStore } from '../../store/useCaseStore'
import { EXTERNAL_TRANSFER_AGENCIES, PROTECTION_MAX_DAYS } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { DocHeaderFields, EditorShell, Field, Grid, Section, ThaiDateFields, useField } from './fields/FormKit'

interface Kb12FormEditorProps {
  onSaved?: () => void
  /**
   * แบบ คบ.12 ใบเดียวรับใช้สองเส้นทางที่ความหมายต่างกัน จึงต้องรู้บริบทก่อนบันทึก
   * 'method4' — ส่งมอบตามวิธีที่ 4 ข้อ 15(4) คำสั่งยังอยู่กับ ป.ป.ท. (WIT0847-0848)
   * ไม่ระบุ   — ส่งต่อหน่วยงานภายนอกเมื่อครบเพดาน 180 วัน (แท็บ 11C) ซึ่งพาแฟ้มออกจากความรับผิดชอบ
   */
  context?: 'method4'
}

/** คบ.12 — บันทึกการส่งมอบพยานในคดีการทุจริตในภาครัฐ */
export const Kb12FormEditor: React.FC<Kb12FormEditorProps> = ({ onSaved, context }) => {
  const { getDraft, updateField } = useFormDraftStore()
  const f = useField(12)
  const { getCase, requestTransfer, completeMethod4Handover } = useCaseStore()
  const draft = getDraft(12)
  const caseItem = getCase()

  const isMethod4 = context === 'method4'
  /** บริบทวิธีที่ 4 ผูกหน่วยงานกับที่ประสานไว้ในแฟ้มแล้ว ไม่ให้เลือกใหม่ในแบบจนคลาดกับหนังสือประสาน */
  const method4Agency =
    (caseItem?.methodTracks || []).find((t) => t.method === 4)?.coordination?.agency || ''
  const agency = isMethod4 ? method4Agency : draft['หน่วยงานผู้รับมอบ'] || ''

  const handleSave = () => {
    if (!caseItem) return showToast('ไม่พบแฟ้มคำร้องที่เปิดอยู่', 'warning')
    if (!agency) {
      return showToast(
        isMethod4 ? 'ยังไม่ได้ระบุหน่วยงานที่ประสานในวิธีที่ 4' : 'กรุณาเลือกหน่วยงานผู้รับมอบพยาน',
        'warning'
      )
    }
    const body = isMethod4
      ? confirmBody(
          `ลงนามในแบบ คบ.12 เพื่อส่งมอบพยานให้ ${agency} ตามวิธีที่ 4 (ประสานหน่วยงานอื่น)`,
          [
            ['บริบทการส่งมอบ', 'วิธีที่ 4 ตามคำสั่งเดิม'],
            ['หน่วยงานผู้รับมอบ', agency],
            ['ผู้ส่งมอบ', f.get('ผู้ส่งมอบ') || '-'],
          ],
          'บันทึกวันส่งมอบและวันเริ่มปฏิบัติจริงของวิธีที่ 4 · <strong>คำสั่งยังอยู่กับ ป.ป.ท.</strong> แฟ้มไม่เข้าเส้นทางส่งต่อเมื่อครบเพดาน 180 วัน'
        )
      : confirmBody(
          `จัดทำ คบ.12 ส่งมอบพยานให้ ${agency} รับหน้าที่ดูแลความปลอดภัยต่อ`,
          [
            ['บริบทการส่งมอบ', 'ส่งต่อหน่วยงานภายนอกเมื่อครบเพดาน'],
            ['หน่วยงานผู้รับมอบ', agency],
            ['เหตุผลการส่งต่อ', f.get('เหตุผลการส่งต่อ') || `ครบระยะเวลา ${PROTECTION_MAX_DAYS} วันตามสิทธิ์ของ ป.ป.ท.`],
          ],
          `แฟ้มเปลี่ยนสถานะเป็น <strong>รอส่งมอบพยานให้ ${agency} (คบ.12)</strong> และ<strong>ออกจากความรับผิดชอบของ ป.ป.ท.</strong> เมื่อส่งมอบเสร็จ`
        )

    showConfirmAlert({
      icon: 'question',
      title: isMethod4 ? 'ลงนาม คบ.12 ส่งมอบตามวิธีที่ 4?' : 'จัดทำ คบ.12 ส่งต่อหน่วยงานภายนอก?',
      html: body,
      showCancelButton: true,
      confirmButtonText: isMethod4 ? 'ยืนยันส่งมอบตามวิธีที่ 4' : 'ยืนยันจัดทำ คบ.12',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      if (isMethod4) {
        completeMethod4Handover(caseItem.no)
        showToast(`บันทึกการส่งมอบตามวิธีที่ 4 ให้ ${agency} และลงนาม คบ.12 แล้ว`)
      } else {
        requestTransfer(
          caseItem.no,
          agency,
          draft['เหตุผลการส่งต่อ'] ||
            `ครบระยะเวลา ${PROTECTION_MAX_DAYS} วันตามสิทธิ์ของ ป.ป.ท. แล้ว แต่สถานการณ์ภัยคุกคามยังรุนแรงเกินขอบเขตอำนาจของสำนักงาน ป.ป.ท.`
        )
        showToast(`จัดทำ คบ.12 ส่งมอบพยานให้ ${agency} เรียบร้อยแล้ว`)
      }
      onSaved?.()
    })
  }

  return (
    <EditorShell
      code="คบ.12"
      formId={12}
      title="บันทึกการส่งมอบพยานในคดีการทุจริตในภาครัฐ"
      hint="ส่งมอบพยานและบุคคลใกล้ชิดให้หน่วยงานภายนอกรับหน้าที่ดูแลความปลอดภัยต่อ พร้อมรายงานการปฏิบัติหน้าที่"
      footer={
        <Button
          type="button"
          onClick={handleSave}
          data-testid="kb12-save"
          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
        >
          <i className="fa-solid fa-right-left" />
          {isMethod4 ? 'ลงนาม คบ.12 ส่งมอบตามวิธีที่ 4' : 'จัดทำบันทึกการส่งมอบ คบ.12'}
        </Button>
      }
    >
      <div
        data-testid="kb12-context-banner"
        className={`rounded-lg border p-3 text-[0.88rem] leading-relaxed ${
          isMethod4
            ? 'border-line bg-blue-soft text-navy'
            : 'border-gold bg-gold-soft text-warning'
        }`}
      >
        <i className="fa-solid fa-circle-info mr-1.5" />
        {isMethod4
          ? 'บริบท: ส่งมอบตามวิธีที่ 4 (ประสานหน่วยงานอื่น) — คำสั่งคุ้มครองยังอยู่กับ ป.ป.ท. บันทึกในแบบนี้จะไม่พาแฟ้มเข้าเส้นทางส่งต่อเมื่อครบเพดาน 180 วัน'
          : 'บริบท: ส่งต่อหน่วยงานภายนอกเมื่อครบเพดานการคุ้มครอง — บันทึกแล้วแฟ้มจะเข้าเส้นทางส่งมอบและออกจากความรับผิดชอบของ ป.ป.ท.'}
      </div>

      <Section title="หัวเอกสาร">
        <DocHeaderFields formId={12} />
        <ThaiDateFields formId={12} label="สำนักงาน ป.ป.ท. วันที่" dayKey="วันที่" monthKey="เดือน" yearKey="พ.ศ." />
      </Section>

      <Section no="1." title="ผู้ส่งมอบและหน่วยงานผู้รับมอบ">
        <Grid>
          <Field formId={12} name="ผู้ส่งมอบ" label="ข้าพเจ้า (เจ้าพนักงานผู้ส่งมอบ)" required />
          <Field formId={12} name="ตำแหน่งผู้ส่งมอบ" label="ตำแหน่ง" />
        </Grid>
        <div>
          <label className="ws-label">
            ขอส่งมอบพยานให้กับ (ระบุหน่วยงาน) <span className="text-danger">*</span>
          </label>
          {isMethod4 ? (
            <div
              data-testid="kb12-method4-agency"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[#9aabba] bg-soft px-2.5 py-[0.68rem] text-[0.88rem] font-semibold text-navy"
            >
              {agency || 'ยังไม่ได้ระบุหน่วยงานที่ประสานในวิธีที่ 4'}
            </div>
          ) : (
            <select
              value={agency}
              onChange={(e) => updateField(12, 'หน่วยงานผู้รับมอบ', e.target.value)}
              className="ws-input"
            >
              <option value="">- เลือกหน่วยงาน -</option>
              {EXTERNAL_TRANSFER_AGENCIES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
        </div>
        <Field formId={12} name="จำนวนคน" label="จำนวนผู้ส่งมอบ (คน)" />
      </Section>

      <Section no="1.1" title="พยาน">
        <Grid>
          <Field formId={12} name="ชื่อพยาน" label="ชื่อ" required />
          <Field formId={12} name="นามสกุลพยาน" label="นามสกุล" />
        </Grid>
        <p className="text-[0.8rem] text-muted">
          รายชื่อบุคคลซึ่งมีความสัมพันธ์ใกล้ชิด (ข้อ 1.2) ดึงจากรายการ “บุคคลที่เกี่ยวข้อง” ที่บันทึกไว้ในแบบ คบ.1
          โดยอัตโนมัติ
        </p>
      </Section>

      {[1, 2].map((n) => (
        <Section
          key={n}
          no={`2.${n === 1 ? '1' : '2'}`}
          title={n === 1 ? 'ผู้ประสานงานในฐานะผู้ส่งมอบพยาน' : 'ผู้ประสานงานในฐานะผู้รับมอบพยาน'}
        >
          <Field formId={12} name={`ผู้ประสาน${n}`} label="ชื่อ นามสกุล ตำแหน่ง สังกัด" />
          <Grid cols={3}>
            <Field formId={12} name={`ผู้ประสานโทรที่ทำงาน${n}`} label="โทรศัพท์ (ที่ทำงาน)" />
            <Field formId={12} name={`ผู้ประสานมือถือ${n}`} label="โทรศัพท์ (เคลื่อนที่)" />
            <Field formId={12} name={`ผู้ประสานโทรสาร${n}`} label="โทรสาร" />
          </Grid>
        </Section>
      ))}

      <Section title="เหตุผลการส่งมอบ (บันทึกภายใน) และผู้รับมอบ">
        <div>
          <label className="ws-label">
            เหตุผลและความจำเป็นในการส่งต่อ
          </label>
          <textarea
            rows={3}
            value={f.get('เหตุผลการส่งต่อ')}
            onChange={(e) => updateField(12, 'เหตุผลการส่งต่อ', e.target.value)}
            placeholder={`ครบระยะเวลา ${PROTECTION_MAX_DAYS} วันตามสิทธิ์ของ ป.ป.ท. แล้ว แต่สถานการณ์ภัยคุกคามยังรุนแรง...`}
            className="ws-input"
          />
        </div>
        <Field formId={12} name="ตำแหน่งผู้รับมอบ" label="ตำแหน่งผู้รับมอบพยาน" />
      </Section>
    </EditorShell>
  )
}
