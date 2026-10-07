import { Button } from '../common/Button'
import React from 'react'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import {
  PROTECTION_DURATION_OPTIONS,
  PROTECTION_MAX_DAYS,
  PROTECTION_DEFAULT_DAYS,
  KB6_PROTECTION_METHOD_FIELD,
  KB6_METHOD_EXTERNAL,
  KB6_LEGAL_REFS_FIELD,
  readLegalRefs,
  KB6_SHOW_RATIONALE_FIELD,
  readShowRationale,
  ROLE_NAMES,
} from '../../lib/constants'
import { formatThaiDate, addDays } from '../../lib/utils'
import { toThaiDigits } from './paper/PaperPrimitives'
import { showToast } from '../../lib/swal'
import { Area, DateField, EditorShell, Field, Grid, OfficerRosterFields, ProtectionMethodChecks, Section } from './fields/FormKit'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { VersionHistory, VersionHistoryEntry } from '../common/VersionHistory'
import { KB6_SIGNERS, Kb6Signer, canEditKb6Opinion } from '../../lib/formSignature'
import { saveKb6Opinions } from '../../lib/mockApi'
import { Kb6SignatureActions } from './Kb6SignatureActions'

interface Kb6FormEditorProps {
  onSaved?: () => void
  /** แฟ้มคำร้องที่เปิดแบบ คบ.6 นี้ — ใช้ผูกลายมือชื่อความเห็นตามลำดับชั้นเข้ากับแฟ้ม */
  caseNo?: string
}

/** ช่องกรอกที่สูงตามเนื้อหา — ข้อความกฎหมายยาวหลายบรรทัด ต้องเห็นครบโดยไม่ต้องเลื่อน */
const AutoTextarea: React.FC<{
  id: string
  value: string
  onChange: (next: string) => void
}> = ({ id, value, onChange }) => {
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])

  return (
    <textarea
      id={id}
      ref={ref}
      rows={2}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ws-input resize-none overflow-hidden"
    />
  )
}

/**
 * ช่องความเห็นข้อ 10-13 ของ คบ.6 — ล็อกเป็นรายข้อตามลำดับชั้น (WIT0513) ไม่ใช้ล็อกทั้งฉบับ (locks[6])
 * เหมือนช่องอื่น ๆ เพราะข้อ 11-13 ต้องแก้ไขต่อได้แม้ฉบับจะถูกล็อกทั้งฉบับแล้วตั้งแต่ข้อ 10 ลงนาม (TC-010)
 * ช่องที่ปิดใช้งานมี title อธิบายเหตุผลเสมอ (ลงนามแล้ว / ยังไม่ถึงลำดับชั้นนี้) ตามที่ผู้ใช้กำหนด
 */
const Kb6OpinionArea: React.FC<{
  signer: Kb6Signer
  value: string
  editable: boolean
  signedAt?: string
  onChange: (next: string) => void
  /** เรียกเมื่อพยายามแก้ไขทั้งที่ไม่มีสิทธิ์ (เช่น งัด disabled ออกทาง DevTools) — ค่าจะไม่ถูกเขียนลง store */
  onBlockedAttempt: () => void
}> = ({ signer, value, editable, signedAt, onChange, onBlockedAttempt }) => {
  const title = signedAt
    ? 'ลงนามแล้ว — แก้ไขไม่ได้'
    : !editable
      ? `ยังไม่ถึงลำดับชั้นนี้ — ช่องนี้สำหรับ${signer.signerRole}เท่านั้น`
      : undefined
  return (
    <div>
      <label className="ws-label">
        {signer.no}. {signer.label}
      </label>
      <textarea
        rows={2}
        value={value}
        disabled={!editable}
        title={title}
        onChange={(e) => {
          if (!editable) {
            onBlockedAttempt()
            return
          }
          onChange(e.target.value)
        }}
        className={`ws-input${
          !editable ? ' cursor-not-allowed' : ''
        }`}
      />
    </div>
  )
}

/** 7. กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง — แก้ไข เพิ่ม และลบได้ทั้งหมด ลบจนหมดได้ */
const LegalRefsFields: React.FC<{ refs: string[]; onChange: (next: string[]) => void }> = ({
  refs,
  onChange,
}) => (
  <div className="space-y-2">
    {refs.map((text, i) => {
      const no = `7.${toThaiDigits(i + 1)}`
      const id = `kb6-legal-ref-${i}`
      return (
        <div key={i}>
          <div className="flex items-center justify-between mb-1">
            <label htmlFor={id} className="ws-label">
              {no}
            </label>
            <button
              type="button"
              aria-label={`ลบข้อ ${no}`}
              onClick={() => onChange(refs.filter((_, j) => j !== i))}
              className="rounded-lg border border-danger bg-danger-soft p-3 text-[0.88rem] leading-relaxed text-danger-dark"
            >
              <i className="fa-solid fa-xmark" /> ลบ
            </button>
          </div>
          <AutoTextarea
            id={id}
            value={text}
            onChange={(next) => onChange(refs.map((t, j) => (j === i ? next : t)))}
          />
        </div>
      )
    })}
    {refs.length === 0 && (
      <p className="text-[0.8rem] text-muted">ยังไม่มีรายการ — เอกสารจะแสดงเฉพาะหัวข้อ 7.</p>
    )}
    <Button
      type="button"
      onClick={() => onChange([...refs, ''])}
      className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-blue px-3 py-[0.68rem] text-[0.88rem] font-semibold text-blue hover:bg-blue-soft transition"
    >
      <i className="fa-solid fa-plus text-[0.8rem]" />
      เพิ่มกฎหมาย กฎ ระเบียบ
    </Button>
  </div>
)

/** คบ.6 — บันทึกข้อความ การคุ้มครองพยานในเบื้องต้น (เสนอเลขาธิการคณะกรรมการ ป.ป.ท.) */
export const Kb6FormEditor: React.FC<Kb6FormEditorProps> = ({ onSaved, caseNo }) => {
  const { getDraft, updateField, updateSignedField } = useFormDraftStore()
  const draft = getDraft(6)
  const getCase = useCaseStore((s) => s.getCase)
  const markKb6Prepared = useCaseStore((s) => s.markKb6Prepared)
  const logHistory = useCaseStore((s) => s.logHistory)
  const currentRole = useAuthStore((s) => s.currentRole)
  const caseItem = caseNo ? getCase(caseNo) : undefined

  /**
   * TC-012 — ช่องความเห็นข้อ 10-13 ที่ผู้ใช้พยายามแก้ไขทั้งที่ไม่ถึงลำดับชั้นของตน (เช่น งัด disabled
   * ออกทาง DevTools) ค่าที่พิมพ์จะไม่ถูกเขียนลง store เลย (กันไว้ตั้งแต่ onChange) แต่ต้องจำไว้ว่ามีความ
   * พยายามเกิดขึ้น เพื่อแจ้งเตือนและบันทึก Audit Log ตอนกด "บันทึกแบบ คบ.6"
   */
  const blockedOpinionAttemptsRef = React.useRef<Set<string>>(new Set())

  /**
   * WIT0513 — ฉบับที่ลงนามความเห็นตามลำดับชั้นแล้วต้องถูกล็อก ห้ามแก้ทับ
   * ล็อกตั้งแต่ ผบช.ชั้นต้น ลงนามข้อ 10 เพราะตั้งแต่จุดนั้นชุดเสนอถูกรับรองเข้าสู่ชั้นกลั่นกรองแล้ว
   * จะแก้ต่อได้ก็ต่อเมื่อสร้างเวอร์ชันใหม่ (เก็บฉบับลงนามเดิมไว้) — จึงไม่ล็อกซ้ำเมื่อมีเวอร์ชันใหม่แล้ว
   */
  const kb6SupervisorSignedAt = caseItem?.kb6SupervisorSignedAt
  const kb6SupervisorSignedBy = caseItem?.kb6SupervisorSignedBy
  React.useEffect(() => {
    if (!kb6SupervisorSignedAt) return
    const { locks, revisions, lockForm } = useFormDraftStore.getState()
    if (locks[6] || (revisions[6] || []).length > 0) return
    lockForm(
      6,
      kb6SupervisorSignedBy || 'ผู้บังคับบัญชาชั้นต้น',
      `ลงนามความเห็นผู้บังคับบัญชาชั้นต้น (ข้อ 10) เมื่อ ${kb6SupervisorSignedAt}`
    )
  }, [kb6SupervisorSignedAt, kb6SupervisorSignedBy])

  const kb6Lock = useFormDraftStore((s) => s.locks[6])
  const kb6Version = caseItem?.kb6Version || 1
  const kb6PreviousVersions = caseItem?.kb6PreviousVersions || []
  const kb6HistoryEntries: VersionHistoryEntry[] = kb6PreviousVersions.map((v) => ({
    version: v.version,
    at: v.returnedAt,
    by: v.returnedBy,
    status: 'returned',
    note: v.returnReason,
  }))

  const durationDays = Number(draft['ระยะเวลาคุ้มครองวัน'] ?? PROTECTION_DEFAULT_DAYS)
  const methods: number[] = Array.isArray(draft[KB6_PROTECTION_METHOD_FIELD])
    ? draft[KB6_PROTECTION_METHOD_FIELD]
    : []
  /** ข้อ 4 ตัดชุดเจ้าพนักงานออก จึงปิดช่องกรอก 8.1 ไว้ แต่ยังเก็บค่าเดิมไม่ลบ */
  const rosterDisabled = methods.includes(KB6_METHOD_EXTERNAL)
  const legalRefs = readLegalRefs(draft)
  const showRationale = readShowRationale(draft)

  return (
    <EditorShell
      code="คบ.6"
      formId={6}
      title="บันทึกข้อความ การคุ้มครองพยานในเบื้องต้น"
      hint="เจ้าพนักงานประเมินความเสี่ยง เสนอมาตรการ และผ่านความเห็นตามลำดับชั้นถึงเลขาธิการคณะกรรมการ ป.ป.ท."
      footer={
        <>
          <Button
            type="button"
            onClick={async () => {
              if (durationDays > PROTECTION_MAX_DAYS) {
                showToast(`ระยะเวลาคุ้มครองต้องไม่เกิน ${PROTECTION_MAX_DAYS} วันต่อครั้ง`)
                return
              }
              /**
               * เติมช่องชื่อที่รู้อยู่แล้วเมื่อยังว่าง (ไม่แต่งข้อเท็จจริงอื่นแทนเจ้าหน้าที่)
               * แหล่งชื่อ: แบบ คบ.1 ของแฟ้มนี้ (แฟ้มที่รับเป็น คบ.1 ไม่มีชื่อในตัวแฟ้ม) → ชื่อในทะเบียนแฟ้ม
               * ร่าง คบ.1 อ่านแบบเดียวกับหน้า /form/1: ผูกกับแฟ้มนี้ หรือเป็นร่างกลาง (แฟ้มที่ไม่ได้รับด้วย คบ.2 ใช้ร่างกลาง)
               */
              const { drafts, draftCaseNo } = useFormDraftStore.getState()
              const kb1Owner = draftCaseNo[1]
              const kb1 =
                kb1Owner === caseNo || (caseItem?.intakeDocType !== 'kb2' && (!kb1Owner || kb1Owner === caseNo))
                  ? drafts[1] || {}
                  : {}
              const joinName = (...parts: unknown[]) => parts.map((p) => String(p ?? '').trim()).filter(Boolean).join(' ')
              const applicantName =
                joinName(`${kb1['คำนำหน้า'] || ''}${kb1['ชื่อ'] || ''}`, kb1['นามสกุล']) || caseItem?.person?.trim() || ''
              const witnessName = joinName(kb1['พยานชื่อ'], kb1['พยานนามสกุล']) || applicantName
              const fromCase: Record<string, string | undefined> = {
                ผู้ยื่นคำร้อง: applicantName,
                ชื่อพยาน: witnessName,
              }
              Object.entries(fromCase).forEach(([field, value]) => {
                if (!String(draft[field] ?? '').trim() && value?.trim()) updateField(6, field, value.trim())
              })
              updateField(6, 'รวมวัน', String(durationDays))
              updateField(6, 'ระยะเวลาคุ้มครอง', `${durationDays} วัน (นับแต่วันที่อัปโหลดใบตอบรับจากตำรวจ)`)
              /** WIT0501 — บันทึกแล้วถือว่าชุดเสนอของแฟ้มนี้มีแบบ คบ.6 จริง จึงส่งกลั่นกรองต่อได้ */
              if (caseNo) markKb6Prepared(caseNo)

              /** TC-012 — ตรวจกับ mock API ก่อนถือว่าบันทึกสำเร็จ ถ้ามีความพยายามแก้ไขข้ามลำดับชั้นให้ 403 */
              const attempted = Array.from(blockedOpinionAttemptsRef.current)
              if (attempted.length > 0 && caseItem) {
                const result = await saveKb6Opinions({
                  caseItem,
                  currentRole,
                  values: Object.fromEntries(
                    KB6_SIGNERS.map((s) => [s.opinionField, String(draft[s.opinionField] ?? '')])
                  ),
                  attemptedUnauthorizedFields: attempted,
                })
                if (!result.ok) {
                  showToast(result.message || 'ไม่มีสิทธิบันทึกความเห็นชั้นดังกล่าว', 'warning')
                  if (caseNo) {
                    const labels = KB6_SIGNERS.filter((s) => attempted.includes(s.opinionField))
                      .map((s) => `ข้อ ${s.no} (${s.label})`)
                      .join(', ')
                    logHistory(
                      caseNo,
                      'ปฏิเสธการบันทึกความเห็นข้ามลำดับชั้น (403)',
                      ROLE_NAMES[currentRole] || currentRole,
                      `พยายามแก้ไขข้ามลำดับชั้น: ${labels}`
                    )
                  }
                  blockedOpinionAttemptsRef.current.clear()
                  return
                }
              }
              blockedOpinionAttemptsRef.current.clear()
              showToast('บันทึกแบบ คบ.6 เรียบร้อยแล้ว')
              onSaved?.()
            }}
            className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-navy px-6 py-[0.68rem] text-[0.88rem] font-semibold text-white hover:bg-blue transition"
          >
            <i className="fa-solid fa-check" />
            บันทึกแบบ คบ.6
          </Button>
          {/* TC-011 — ปุ่มลงนามความเห็นตามลำดับชั้น (ข้อ 10-13) อยู่ที่นี่ที่เดียว ข้าง "บันทึกแบบ คบ.6" */}
          <Kb6SignatureActions caseNo={caseNo} />
        </>
      }
    >
      <VersionHistory
        code="kb6"
        currentVersion={kb6Version}
        entries={kb6HistoryEntries}
        locked={Boolean(kb6Lock)}
        lockedBy={kb6SupervisorSignedBy}
        lockedNote={kb6SupervisorSignedAt ? `ลงนามความเห็นผู้บังคับบัญชาชั้นต้น (ข้อ 10) เมื่อ ${kb6SupervisorSignedAt}` : undefined}
      />

      <Section title="หัวบันทึกข้อความ">
        <Grid>
          <Field formId={6} name="ส่วนราชการ" label="ส่วนราชการ" required />
          <Field formId={6} name="โทร" label="โทร." />
        </Grid>
        <Grid cols={3}>
          <Field formId={6} name="เลขที่เอกสาร" label="ที่ ปป 00 ..." />
          <DateField formId={6} name="วันที่" label="วันที่" />
          <Field formId={6} name="สำนวนคดีเลขที่" label="สำนวนคดีเลขที่" />
        </Grid>
      </Section>

      <Section no="1." title="การรับเรื่อง">
        <Grid cols={3}>
          <Field formId={6} name="ผู้ยื่นคำร้อง" label="1.1 ได้รับคำร้องจาก" required />
          <DateField formId={6} name="วันที่รับคำร้อง" label="เมื่อวันที่" />
          <Field formId={6} name="เลขคำร้อง" label="เลขที่คำร้อง" />
        </Grid>
        <Grid cols={3}>
          <DateField formId={6} name="คำร้องลงวันที่" label="คำร้องลงวันที่" />
          <Field formId={6} name="อ้างอิงคดี" label="ในคดีเรื่อง" />
          <Field formId={6} name="ผอ." label="1.2 ผอ." />
        </Grid>
        <Grid>
          <Field formId={6} name="มอบให้" label="มอบให้ (เจ้าของสำนวน)" />
          <DateField formId={6} name="มอบวันที่" label="ดำเนินการเมื่อวันที่" />
        </Grid>
      </Section>

      <Section no="2." title="ข้อเท็จจริง">
        <Grid>
          <Field formId={6} name="ผู้ถูกกล่าวหา" label="2.1 ชื่อ-สกุล ตำแหน่ง สังกัด ของผู้ถูกกล่าวหา" />
          <Field formId={6} name="ข้อกล่าวหา" label="ถูกกล่าวหาว่า" />
        </Grid>
        <Grid cols={3}>
          <Field formId={6} name="ชื่อพยาน" label="2.2 ชื่อ-สกุล พยาน" required />
          <Field formId={6} name="เลขบัตรประชาชน" label="บัตรประจำตัวประชาชนเลขที่" />
          <Field formId={6} name="อายุ" label="อายุ (ปี)" />
        </Grid>
        <Grid cols={3}>
          <Field formId={6} name="อาชีพ" label="อาชีพ" />
          <Field formId={6} name="ที่อยู่ทะเบียนบ้าน" label="ที่อยู่ตามทะเบียนบ้าน" />
          <Field formId={6} name="ที่อยู่ปัจจุบัน" label="ที่อยู่ปัจจุบัน" />
        </Grid>
        <Area
          formId={6}
          name="ผลประเมินภัย"
          label="2.3 ข้อเท็จจริงเกี่ยวกับพฤติการณ์ความไม่ปลอดภัย"
          rows={4}
          required
        />
        <Field formId={6} name="ผู้คุกคาม" label="มีพฤติการณ์ถูกคุกคามโดย" />
      </Section>

      <Section no="3." title="รูปแบบวิธีและระยะเวลาการดำเนินการคุ้มครอง">
        <Grid>
          <Field formId={6} name="รูปแบบการคุ้มครอง" label="รูปแบบการคุ้มครอง (ตามระเบียบฯ ข้อ 15)" required />
          <div>
            <label className="ws-label">
              ระยะเวลาที่เสนอขอความคุ้มครอง <span className="text-danger">*</span> (ครั้งละไม่เกิน{' '}
              2 เดือน)
            </label>
            <select
              value={durationDays}
              onChange={(e) => updateField(6, 'ระยะเวลาคุ้มครองวัน', Number(e.target.value))}
              className="ws-input"
            >
              {PROTECTION_DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d / 30} เดือน
                  {d === PROTECTION_DEFAULT_DAYS
                    ? ' (ที่มักอนุมัติในรอบแรก)'
                    : d === PROTECTION_MAX_DAYS
                    ? ' (สูงสุดต่อครั้ง)'
                    : ''}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[0.8rem] text-muted">
              นับแต่วันที่เจ้าหน้าที่อัปโหลดใบตอบรับจากตำรวจ — หากเริ่มวันนี้จะครบกำหนด{' '}
              <strong className="text-navy">{formatThaiDate(addDays(new Date(), durationDays))}</strong>
            </p>
            {durationDays > PROTECTION_MAX_DAYS && (
              <p className="mt-1 text-[0.8rem] font-bold text-danger">
                ระยะเวลาเกินกรอบอำนาจ ป.ป.ท. ({PROTECTION_MAX_DAYS} วันต่อครั้ง) — หากยังจำเป็นต้องใช้ คบ.14
                ขอขยายเวลา
              </p>
            )}
          </div>
        </Grid>
        <Grid cols={4}>
          <DateField formId={6} name="เริ่มวันที่" label="ในระหว่างวันที่" />
          <DateField formId={6} name="ถึงวันที่" label="ถึงวันที่" />
          <Field formId={6} name="รวมเดือน" label="รวมเป็นเวลา (เดือน)" />
          <Field formId={6} name="รวมวัน" label="และ (วัน)" />
        </Grid>
      </Section>

      <Section
        no="7."
        title="กฎหมาย กฎ ระเบียบที่เกี่ยวข้อง"
        hint="แก้ไข เพิ่ม หรือลบได้เมื่อกฎหมายเปลี่ยน — ข้อที่เว้นว่างจะไม่ถูกพิมพ์ลงเอกสาร"
      >
        <LegalRefsFields
          refs={legalRefs}
          onChange={(next) => updateField(6, KB6_LEGAL_REFS_FIELD, next)}
        />
      </Section>

      <Section no="8." title="ข้อพิจารณา — เจ้าพนักงานที่มอบหมาย">
        <button
          type="button"
          aria-pressed={showRationale}
          onClick={() => updateField(6, KB6_SHOW_RATIONALE_FIELD, !showRationale)}
          className={`block w-full min-h-[44px] rounded-lg border px-3 py-2 text-[0.88rem] font-semibold text-left transition ${
            showRationale
              ? 'border-blue bg-blue-soft text-navy'
              : 'border-[#aebdca] bg-white text-ink hover:bg-soft'
          }`}
        >
          {showRationale ? '☑' : '☐'} พิมพ์ข้อความข้อพิจารณามาตรฐานลงในเอกสาร
          <span className="block font-normal text-muted">
            ไม่ติ๊ก = เว้นเป็นเส้นประให้เขียนด้วยลายมือ
          </span>
        </button>
        <OfficerRosterFields formId={6} disabled={rosterDisabled} />
        <Field formId={6} name="ดำเนินการโดย" label="8.2 ดำเนินการคุ้มครองโดยการ" />
        <ProtectionMethodChecks
          selected={methods}
          onChange={(next) => updateField(6, KB6_PROTECTION_METHOD_FIELD, next)}
        />
        <Area formId={6} name="มาตรการทั่วไป" label="มาตรการทั่วไปที่เสนอให้ความคุ้มครอง" rows={4} />
      </Section>

      <Section no="9.–13." title="ความเห็นตามลำดับชั้น">
        <Field formId={6} name="ผู้เสนอ" label="ผู้เสนอ (นักสืบสวนสอบสวนชำนาญการ)" />
        <Grid>
          <Field formId={6} name="ผู้บังคับบัญชา" label="ผู้อำนวยการกลุ่ม (ผู้บังคับบัญชาชั้นต้น)" />
          <Field formId={6} name="ผู้อำนวยการ" label="ผู้อำนวยการสำนัก" />
        </Grid>
        <Grid>
          <Field formId={6} name="รองเลขาธิการ" label="รองเลขาธิการคณะกรรมการ ป.ป.ท." />
          <Field formId={6} name="เลขาธิการ" label="เลขาธิการคณะกรรมการ ป.ป.ท." />
        </Grid>
        {KB6_SIGNERS.map((signer) => (
          <Kb6OpinionArea
            key={signer.role}
            signer={signer}
            value={String(draft[signer.opinionField] ?? '')}
            editable={caseItem ? canEditKb6Opinion(signer, currentRole, caseItem) : false}
            signedAt={caseItem ? signer.signedAt(caseItem) : undefined}
            onChange={(next) => updateSignedField(6, signer.opinionField, next)}
            onBlockedAttempt={() => blockedOpinionAttemptsRef.current.add(signer.opinionField)}
          />
        ))}
        <p className="ws-readonly text-[0.88rem] leading-relaxed text-muted">
          <i className="fa-solid fa-circle-info mr-1.5" />
          กรอกความเห็นของท่านในข้อที่ถึงคิว แล้วกดปุ่ม "ลงนาม" ท้ายหน้านี้เพื่อยืนยันด้วยลายมือชื่ออิเล็กทรอนิกส์ —
          แต่ละข้อจำกัดสิทธิ์แก้ไขตามลำดับชั้นและขั้นตอนของแฟ้มโดยอัตโนมัติ
        </p>
      </Section>
    </EditorShell>
  )
}
