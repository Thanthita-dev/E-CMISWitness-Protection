import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CoordinationLetterComposer, defaultCoordinationLetter } from './CoordinationLetterComposer'
import { PoliceStationPicker, POLICE_STATIONS } from './PoliceStationPicker'
import { protectionResponsibleName } from '../../lib/protectionHandoff'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem, MethodSiteEvaluation, ProtectionMethodNo, ProtectionMethodTrack } from '../../types/case'
import {
  MASKABLE_IDENTIFIERS,
  OFFICIAL_LETTER_CHANNELS,
  ROLE_NAMES,
} from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import {
  allowedSiteTypes,
  currentPhaseKind,
  deriveEpisode,
  hasConsent,
  privacyWindow,
  SITE_TYPE_LABELS,
} from '../../lib/episode'
import { method1Gate, methodStartBlocker, method4ReplyRecorded, wizardSectionCount } from '../../lib/methodProgress'
import { ATTACHMENT_ACCEPT, ATTACHMENT_RULE_TEXT, getAttachmentRejection } from '../../lib/fileValidation'
import { CoordinationDeclineCard } from './CoordinationDeclineCard'

export const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * แผงปฏิบัติรายวิธีตามข้อ 15 — 08A-1 / 08A-2 / 08A-3 / 08B
 *
 * ใช้ร่วมกันระหว่างหน้าเส้นทางเดี่ยว /protection-method/$method และการ์ดแท็บในแฟ้มคำร้อง
 * (ProtectionMethodTabsCard) เพื่อให้เจ้าหน้าที่กรอกข้อมูลที่เดียวได้โดยไม่ต้องออกจากแฟ้ม
 */
export const MethodPanel: React.FC<{
  caseItem: CaseItem
  track: ProtectionMethodTrack
  coordinationOnly?: boolean
}> = ({ caseItem, track, coordinationOnly }) => {
  if (track.method === 1) return <Method1Panel caseItem={caseItem} track={track} />
  if (track.method === 2) return <Method2Panel caseItem={caseItem} track={track} />
  if (track.method === 3) return <Method3Panel caseItem={caseItem} track={track} />
  if (track.method === 4) return <Method4Panel caseItem={caseItem} track={track} coordinationOnly={coordinationOnly} />
  return null
}

const Card: React.FC<{ title: string; hint?: string; action?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, action, children }) => (
  <section className="rounded-xl border border-line bg-paper p-5 space-y-3">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2">
      <div>
      <h3 className="text-sm font-bold text-navy-deep">{title}</h3>
      {hint && <p className="text-[0.8rem] text-muted mt-0.5">{hint}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
)

/**
 * ขั้นปัจจุบันของ wizard แต่ละวิธี — เก็บใน track.wizardStep (ไม่ใช่ state ในตัวคอมโพเนนต์) เพื่อให้
 * แถบความคืบหน้า (getMethodProgress) รับรู้ว่ากดถัดไปผ่านขั้นไหนมาแล้วบ้าง แม้ข้อมูลของขั้นนั้นยังไม่ครบ
 * และยังอยู่ถูกที่เดิมเมื่อสลับแท็บ/แฟ้มไปมาเพราะผูกกับแฟ้มโดยตรง
 */
const useWizardStep = (caseNo: string, method: ProtectionMethodNo, current: number | undefined) => {
  const { updateMethodTrack } = useCaseStore()
  /**
   * ปุ่มเริ่มปฏิบัติจริงตั้ง wizardStep = จำนวน section (เกิน index สุดท้าย) เพื่อให้ขั้นสุดท้ายนับว่าผ่าน
   * ตอนแสดงผลจึงต้อง clamp กลับมาที่ section สุดท้าย ไม่งั้นจะ render section ที่ไม่มีอยู่แล้วได้หน้าว่าง
   */
  const step = Math.min(Math.max(0, current || 0), wizardSectionCount(method) - 1)
  const setStep = (next: number) => updateMethodTrack(caseNo, method, { wizardStep: Math.max(0, next) })
  return [step, setStep] as const
}

/**
 * แถบปุ่มย้อนกลับ/ถัดไปของ wizard รายวิธี — เดินอิสระไม่บังคับกรอกให้ครบก่อนถึงจะกดถัดไปได้
 * เพื่อให้เจ้าหน้าที่สลับไปดู/แก้ขั้นอื่นได้ตลอดเวลา
 *
 * ข้อยกเว้นคือ blockedReason — ขั้นที่ผังกำหนดเงื่อนไขไว้ก่อนหน้า (เช่น วิธีที่ 1 ต้องลงนาม คบ.8 ก่อน)
 * ปุ่มถัดไปจะถูกปิดพร้อมบอกเหตุผล ส่วนย้อนกลับยังกดได้เสมอเพื่อกลับไปดู/แก้ข้อมูลเดิม
 */
const WizardNav: React.FC<{
  step: number
  total: number
  onChange: (step: number) => void
  blockedReason?: string
}> = ({ step, total, onChange, blockedReason }) => (
  <div className="space-y-2">
  <div className="flex items-center justify-between gap-2 border-t border-slate-200 pt-3">
    <Button
      type="button"
      onClick={() => onChange(step - 1)}
      disabled={step === 0}
      className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition disabled:cursor-not-allowed disabled:opacity-40"
    >
      <i className="fa-solid fa-chevron-left mr-1.5" />
      ย้อนกลับ
    </Button>
    <span className="text-[0.8rem] font-bold text-muted">
      ขั้นตอน {step + 1} จาก {total}
    </span>
    <Button
      type="button"
      onClick={() => onChange(step + 1)}
      disabled={step === total - 1 || Boolean(blockedReason)}
      className="rounded-lg bg-blue px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
    >
      ถัดไป
      <i className="fa-solid fa-chevron-right ml-1.5" />
    </Button>
    </div>
    {blockedReason && (
      <p className="flex items-start gap-1.5 text-[0.8rem] font-bold text-amber-700">
        <i className="fa-solid fa-lock mt-0.5" />
        <span>{blockedReason}</span>
      </p>
    )}
  </div>
)

const TextField: React.FC<{
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}> = ({ label, value, onChange, placeholder, type = 'text' }) => (
  <label className="block">
    <span className="ws-label">{label}</span>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="ws-input w-full"
    />
  </label>
)

const AreaField: React.FC<{ label: string; value: string; onChange: (v: string) => void; rows?: number }> = ({
  label,
  value,
  onChange,
  rows = 3,
}) => (
  <label className="block">
    <span className="ws-label">{label}</span>
    <textarea
      rows={rows}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="ws-input w-full"
    />
  </label>
)

const StartButton: React.FC<{
  caseNo: string
  method: ProtectionMethodNo
  label: string
  orderRef?: string
  /** เหตุผลที่ยังเริ่มปฏิบัติจริงไม่ได้ — มีค่าเมื่อขั้นก่อนหน้าตามผังยังไม่ผ่าน (เช่น คบ.8 ยังไม่ลงนาม) ปุ่มถูกปิด */
  blockedReason?: string
  /**
   * เหตุผลที่ store (setMethodStatus/methodStartBlocker) จะปฏิเสธการเริ่มปฏิบัติจริงเช่นกัน แต่ปุ่มยังต้องกดได้
   * และเปิดจอยืนยันได้ตามปกติ (เช่น ใกล้/ครบเพดาน Episode ที่ต้องให้เจ้าหน้าที่กดยืนยันแล้วเห็นผลว่าถูกปฏิเสธจริง
   * ไม่ใช่ทางเข้าอื่นที่ข้ามเงื่อนไขได้ — ด่านสุดท้ายอยู่ที่ store เสมอ) ต่างจาก blockedReason ตรงที่ไม่ disable ปุ่ม
   */
  hardBlockNotice?: string
  /**
   * คำเตือนแบบ "ไม่ใช่ hard block" — ข้อมูลแผนยังไม่ครบแต่ยังยืนยันเริ่มปฏิบัติต่อได้ (WIT0819/0820, TC-073)
   * ต่างจาก blockedReason ตรงที่ปุ่มยังกดได้ แต่ต้องผ่านจอเตือน+ยืนยันก่อนเข้าสู่จอยืนยันเริ่มปฏิบัติจริงตามปกติ
   */
  warnBeforeStart?: string
  /** วันเริ่มจริงตั้งต้น — ใช้เมื่อขั้นก่อนหน้าบันทึกวันจริงไว้แล้ว (เช่น วันส่งมอบจริงของวิธีที่ 4) */
  defaultStartedAt?: string
}> = ({ caseNo, method, label, orderRef, blockedReason, hardBlockNotice, warnBeforeStart, defaultStartedAt }) => {
  const { setMethodStatus, updateMethodTrack } = useCaseStore()
  const [startedAt, setStartedAt] = useState(defaultStartedAt || todayIso())

  const openStartConfirm = () => {
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกวันเริ่มปฏิบัติจริงและเปิดใช้มาตรการ?',
      html: confirmBody(
        `เปลี่ยนสถานะวิธีที่ ${method} เป็น ACTIVE ของแฟ้ม ${caseNo}`,
        [
          ['วันเริ่มจริง', startedAt],
          ...(orderRef ? ([['อ้างอิงคำสั่ง', orderRef]] as Array<[string, string]>) : []),
        ],
        'วันเริ่มจริงเป็นจุดตั้งต้นของ<strong>วันสะสมใน Episode</strong> ซึ่งใช้นับเพดานการคุ้มครอง — แยกจากวันอัปโหลดเอกสาร'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเริ่มปฏิบัติจริง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      setMethodStatus(caseNo, method, 'active', { at: new Date(startedAt).toISOString(), orderRef })
      /**
       * store เป็นด่านสุดท้ายและ "ปฏิเสธเงียบ ๆ" ได้ (methodStartBlocker) — จึงต้องอ่านสถานะจริงกลับมาดู
       * ก่อนจะบอกผู้ใช้ว่าสำเร็จ ไม่งั้นจะขึ้นข้อความว่าเริ่มปฏิบัติแล้วทั้งที่ระบบปฏิเสธไปแล้ว
       */
      const after = useCaseStore.getState().getCase(caseNo)
      const started = (after?.methodTracks || []).find((t) => t.method === method)?.status === 'active'
      if (!started) {
        showToast(
          (after && methodStartBlocker(after, method)) ||
            'ระบบไม่อนุญาตให้เริ่มปฏิบัติวิธีนี้ในขณะนี้ — ตรวจเงื่อนไขที่แสดงไว้ด้านบน',
          'warning'
        )
        return
      }
      /**
       * ปิด wizard ทุก section พร้อมกัน — section สุดท้ายกด "ถัดไป" ต่อไม่ได้ (ปุ่มถูก disable)
       * ถ้าไม่ดันค่านี้ ขั้นสุดท้ายของ wizard จะค้างว่ายังไม่เสร็จ และแถบความคืบหน้าซึ่งนับสะสม
       * จะไม่ยอมเดินต่อไปถึงขั้น ACTIVE (WIT0821/0829/0837/0851) ทั้งที่เริ่มปฏิบัติจริงแล้ว
       */
      updateMethodTrack(caseNo, method, { wizardStep: wizardSectionCount(method) })
      showToast('บันทึกวันเริ่มจริงและเปลี่ยนสถานะวิธีเป็น ACTIVE แล้ว')
    })
  }

  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
      <div className="w-44">
        <TextField label="วันเริ่มจริง" value={startedAt} onChange={setStartedAt} type="date" />
      </div>
      <Button
        type="button"
        onClick={() => {
          if (blockedReason) {
            showToast(blockedReason, 'warning')
            return
          }
          if (warnBeforeStart) {
            showConfirmAlert({
              icon: 'warning',
              title: 'ข้อมูลแผนปฏิบัติยังไม่ครบ — ยืนยันดำเนินการต่อ?',
              html: confirmBody(
                warnBeforeStart,
                [],
                'ยืนยันแล้วจะไปต่อที่จอยืนยันเริ่มปฏิบัติจริงตามปกติ — ยกเลิกเพื่อกลับไปแก้แผนก่อน'
              ),
              showCancelButton: true,
              confirmButtonText: 'ยืนยันดำเนินการต่อ',
              cancelButtonText: 'ยกเลิก',
            }).then((res) => {
              if (!res.isConfirmed) return
              openStartConfirm()
            })
            return
          }
          openStartConfirm()
        }}
        disabled={Boolean(blockedReason)}
        data-testid={`method-${method}-start`}
        className="rounded-lg bg-emerald-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-600"
      >
        <i className="fa-solid fa-play mr-1.5" />
        {label}
      </Button>
      {blockedReason || hardBlockNotice ? (
        <p className="flex w-full items-start gap-1.5 text-[0.8rem] font-bold text-amber-700">
          <i className="fa-solid fa-lock mt-0.5" />
          <span>{blockedReason || hardBlockNotice}</span>
        </p>
      ) : (
        <p className="w-full text-[0.8rem] text-muted">
          วันเริ่มจริงเป็นจุดตั้งต้นของวันสะสมใน Episode — แยกจากวันอัปโหลดเอกสาร
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// 08A-1 — วิธีที่ 1 จัดชุดคุ้มครองและเริ่มปฏิบัติ
// ---------------------------------------------------------------------------

/**
 * WIT0817 — คำสั่งมอบหมายเจ้าพนักงานชุดคุ้มครอง (คบ.8) ของวิธีที่ 1
 *
 * คบ.8 ถูกแนบเข้าแฟ้มอัตโนมัติตอนแยกแนวทาง (setApprovedMethods) แล้ว การ์ดนี้จึงเป็นหมุด
 * ติดตามสองขั้น — จัดทำร่าง แล้วเสนอเลขาธิการฯ ลงนาม — โดยเปิดแบบฟอร์มและลงนามที่แฟ้มที่เดียว
 * ตามกติกาเดิมของระบบ (SIGNABLE_FORMS / รายการแบบฟอร์มในแฟ้ม) ไม่ลงนามซ้ำที่แผงนี้
 */
/**
 * WIT0821 — คำร้องหลักพร้อมมีผลอนุมัติแล้วหรือยัง
 *
 * ผังแยกไว้สองแขนงหลังชุดคุ้มครองเริ่มปฏิบัติ และทั้งสองแขนงจบที่แท็บ 10 เหมือนกัน
 *  - ยังรอผลหลัก (TEMPORARY_ACTIVE) — คุ้มครองต่อพร้อมเดินเอกสารคำร้องหลักคู่ขนาน
 *  - ผลหลักอนุมัติ (MAIN_ACTIVE) — เปลี่ยน Phase ต่อเนื่องใน Episode เดิม ไม่รีเซ็ตวันสะสม
 *
 * การเปลี่ยน Phase เกิดอัตโนมัติตอนเลขาธิการฯ ลงนาม คบ.8 (ดู signOutgoingNotice)
 * การ์ดนี้จึงเป็นการบอกว่าตอนนี้อยู่แขนงใดและอะไรคือเงื่อนไขข้ามไปอีกแขนง ไม่ใช่ปุ่มสั่งเปลี่ยนเอง
 */
const Wit0821Branch: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack }> = ({ caseItem, track }) => {
  const started = track.status === 'active' || Boolean(track.startedAt)
  const phase = currentPhaseKind(caseItem.episode || deriveEpisode(caseItem))
  /** ผลอนุมัติคำร้องหลักถือตามคำสั่งที่ลงนามแล้ว — คบ.8 ของวิธีที่ 1 หรือข้อตกลง คบ.11 */
  const mainApproved = Boolean(caseItem.kb8Signed || caseItem.kb11Signed)
  const isMain = phase === 'MAIN' || (!phase && mainApproved)

  return (
    <div className="rounded-lg border border-line bg-soft p-3 space-y-2">
      <div className="text-[0.8rem] font-bold text-navy-deep">
        คำร้องหลักพร้อมมีผลอนุมัติแล้วหรือยัง?
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className={`rounded-lg border p-2.5 text-[0.8rem] leading-relaxed ${
            started && !isMain ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-white text-muted'
          }`}
        >
          <strong className="block">ยังรอผลหลัก — TEMPORARY_ACTIVE</strong>
          คุ้มครองต่อตาม คบ.5 และเดินเอกสารคำร้องหลักคู่ขนาน; ไปที่รายงานผลการคุ้มครอง เมื่อผลออกจะกลับมาเดินแขนงคำร้องหลัก
        </div>
        <div
          className={`rounded-lg border p-2.5 text-[0.8rem] leading-relaxed ${
            started && isMain ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-muted'
          }`}
        >
          <strong className="block">ผลหลักอนุมัติ — MAIN_ACTIVE</strong>
          ถ้ามีช่วงชั่วคราวมาก่อน ระบบเปลี่ยน Phase ต่อเนื่องใน Episode เดิมให้อัตโนมัติเมื่อลงนาม คบ.8 — ไม่รีเซ็ตวันสะสม
        </div>
      </div>

      <p className="text-[0.8rem] text-muted">
        {!started
          ? 'ยังไม่ได้กดเริ่มปฏิบัติจริง — จะรู้แขนงเมื่อบันทึกวันเริ่มจริงแล้ว'
          : isMain
          ? 'สถานะปัจจุบัน: MAIN_ACTIVE — ไปติดตามรอบรายงานและวันสะสมที่หน้ารายงานผลการคุ้มครอง'
          : 'สถานะปัจจุบัน: TEMPORARY_ACTIVE — เมื่อเลขาธิการฯ ลงนาม คบ.8 ระบบจะเปลี่ยนเป็น MAIN ให้เอง'}
      </p>
    </div>
  )
}

const Method1Panel: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack }> = ({ caseItem, track }) => {
  const { updateMethodTrack } = useCaseStore()
  const plan = track.plan || {}
  const set = (k: string, v: string) => updateMethodTrack(caseItem.no, 1, { plan: { ...plan, [k]: v } })

  /** คำสั่งชั่วคราว (คบ.5) หรือคำร้องหลัก (คบ.8) — ตัวกำหนด Phase ของ Episode */
  const isTemporary = Boolean(caseItem.kb5Approved && !caseItem.kb8Signed && !caseItem.kb11Signed)

  /**
   * WIT0818 เป็นประตูของขั้น WIT0819-0821 — ยังไม่ลงนาม คบ.8 (และไม่มีคำสั่งชั่วคราว คบ.5)
   * ก็ยังเดินต่อหรือกดเริ่มปฏิบัติจริงไม่ได้ กรอกแผนไว้ก่อนได้ตามปกติ
   */
  const gate = method1Gate(caseItem)
  const blockedReason = gate.unlocked ? undefined : gate.reason

  /**
   * TC-073 — แผนปฏิบัติยังไม่ระบุทั้งสมาชิกชุดและผู้ใกล้ชิดที่อนุมัติให้ติดต่อเลยแม้แต่อย่างเดียว ไม่ใช่ hard block
   * (ยืนยันต่อได้) แต่ต้องเตือนก่อนเริ่มปฏิบัติจริง เพราะสองช่องนี้เป็นฐานของการทำงานจริงหน้างาน
   * ใช้เงื่อนไข "ทั้งคู่ว่าง" (ไม่ใช่ข้อใดข้อหนึ่ง) เพื่อไม่เตือนซ้ำเมื่อกรอกไปแล้วบางส่วน (เช่น TC-067 ที่กรอกสมาชิกชุดไว้)
   * ไม่เตือนกรณีคำสั่งชั่วคราว (isTemporary) ล้วน ๆ ที่ยังไม่มีผลคำร้องหลักเลย — เป็นการตอบสนองเหตุฉุกเฉินทันที
   * ตามคำสั่ง คบ.5 อย่างเดียว (WIT0821 แขนง TEMPORARY_ACTIVE) ซึ่งผังยอมให้จัดแผนละเอียดตามทีหลังได้
   */
  const planWarning = !isTemporary && !plan.teamMembers?.trim() && !plan.approvedContacts?.trim()
    ? 'แผนปฏิบัติยังไม่ครบ — ยังไม่ได้ระบุสมาชิกชุดปฏิบัติและผู้ใกล้ชิดที่ได้รับอนุมัติให้ติดต่อเลย ยืนยันดำเนินการต่อได้ แต่ควรกลับไปกรอกให้ครบก่อนเริ่มปฏิบัติจริง'
    : undefined

  const [step, setStep] = useWizardStep(caseItem.no, 1, track.wizardStep)
  const sections = [
    <Card key="0819" title="แผนปฏิบัติของชุดคุ้มครอง" hint="สมาชิก/เวร รถ อุปกรณ์ พื้นที่ จุดรับ-ส่ง และช่องทางฉุกเฉิน">
      <div className="grid gap-3 sm:grid-cols-2">
        <AreaField label="สมาชิกชุดปฏิบัติและการจัดเวร" value={plan.teamMembers || ''} onChange={(v) => set('teamMembers', v)} />
        <AreaField label="ตารางเวร / ผลัดปฏิบัติ" value={plan.shiftPlan || ''} onChange={(v) => set('shiftPlan', v)} />
        <TextField label="ยานพาหนะ" value={plan.vehicles || ''} onChange={(v) => set('vehicles', v)} />
        <TextField label="อุปกรณ์ประจำกาย/ประจำชุด" value={plan.equipment || ''} onChange={(v) => set('equipment', v)} />
        <TextField label="พื้นที่ปฏิบัติ" value={plan.area || ''} onChange={(v) => set('area', v)} />
        <TextField label="จุดรับ–ส่ง" value={plan.pickupPoints || ''} onChange={(v) => set('pickupPoints', v)} />
        <TextField label="ช่องทางติดต่อฉุกเฉิน" value={plan.emergencyChannel || ''} onChange={(v) => set('emergencyChannel', v)} />
        <TextField
          label="ผู้ใกล้ชิดที่ได้รับอนุมัติให้ติดต่อ"
          value={plan.approvedContacts || ''}
          onChange={(v) => set('approvedContacts', v)}
        />
      </div>
    </Card>,
    <Card key="0820" title="ชี้แจงภารกิจแบบ Need-to-Know" hint="บันทึกการรับงาน เวลาเข้าเวร และผู้รับผิดชอบ">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="ผู้ชี้แจง" value={plan.briefedBy || ''} onChange={(v) => set('briefedBy', v)} />
        <TextField label="วันเวลาที่ชี้แจง" value={plan.briefedAt || ''} onChange={(v) => set('briefedAt', v)} type="datetime-local" />
      </div>
      <StartButton
        caseNo={caseItem.no}
        method={1}
        label="เริ่มปฏิบัติจริง"
        orderRef={isTemporary ? 'คบ.5' : 'คบ.8'}
        blockedReason={blockedReason}
        hardBlockNotice={methodStartBlocker(caseItem, 1, track)}
        warnBeforeStart={planWarning}
      />
      <Wit0821Branch caseItem={caseItem} track={track} />
    </Card>,
  ]

  return (
    <div className="space-y-5">
      {sections[step]}
      <WizardNav step={step} total={sections.length} onChange={setStep} blockedReason={blockedReason} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 08A-2 — วิธีที่ 2 จัดสถานที่ปลอดภัย
// ---------------------------------------------------------------------------

/**
 * หมายเหตุใต้หน้า 08A-2 — สถานที่ไม่เหมาะสมและต้องให้หน่วยงานภายนอกดำเนินการแทน
 * ผังให้ "เปลี่ยนเป็นวิธีที่ 4 แล้วไปหน้า 08B" — วิธีที่ 4 เลือกร่วมกับวิธีที่ 1–3 ไม่ได้ (toggleProtectionMethod)
 * จึงเปลี่ยนชุดวิธีในแฟ้มเป็นวิธีที่ 4 อย่างเดียว แล้วพาไปหน้า 08B
 */
const EscalateToMethod4: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { setApprovedMethods, logHistory } = useCaseStore()
  const navigate = useNavigate()
  const dropped = (caseItem.approvedMethods || []).filter((m) => m !== 4)

  const handleSwitch = () => {
    showConfirmAlert({
      icon: 'question',
      title: 'เปลี่ยนไปใช้วิธีที่ 4 แทน?',
      html: confirmBody(
        'ให้หน่วยงานภายนอกดำเนินการแทน (วิธีที่ 4 ประสานหน่วยงานอื่น)',
        [['วิธีที่จะนำออกจากแฟ้ม', dropped.map((m) => `วิธีที่ ${m}`).join(' · ') || '—']],
        'วิธีที่ 4 ต้องเลือกเดี่ยว — วิธีที่ 1–3 ในแฟ้มนี้จะถูกนำออก'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเปลี่ยนเป็นวิธีที่ 4',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      const actor = protectionResponsibleName(caseItem)
      setApprovedMethods(caseItem.no, [4], actor)
      logHistory(
        caseItem.no,
        'เปลี่ยนเป็นวิธีที่ 4 ประสานหน่วยงานอื่นให้คุ้มครอง',
        actor,
        `ประเมินแล้วสถานที่ปลอดภัยไม่เหมาะสม จึงให้หน่วยงานภายนอกดำเนินการแทน (นำวิธีที่ ${dropped.join(', ')} ออก · ไปหน้าประสานหน่วยงานอื่น)`
      )
      showToast('เปลี่ยนเป็นวิธีที่ 4 ประสานหน่วยงานอื่นในแฟ้มนี้แล้ว')
      navigate({ to: '/protection-method/$method', params: { method: '4' }, search: { caseNo: caseItem.no } })
    })
  }

  return (
    <div className="ws-callout text-[0.85rem] leading-relaxed space-y-2">
      <p className="leading-relaxed">
        หากต้องให้หน่วยงานภายนอกดำเนินการแทน ให้เปลี่ยนเป็น <strong>วิธีที่ 4 (ประสานหน่วยงานอื่น)</strong>{' '}
        แล้วไปหน้าประสานหน่วยงานอื่น — วิธีที่ 4 เลือกร่วมกับวิธีที่ 1–3 ไม่ได้
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleSwitch}
          className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-[0.88rem] font-semibold text-white hover:bg-amber-700 transition"
        >
          <i className="fa-solid fa-right-left mr-1.5" />
          เปลี่ยนไปใช้วิธีที่ 4 แทน
        </Button>
        <Link
          to="/protection-method/$method"
          params={{ method: '4' }}
          search={{ caseNo: caseItem.no }}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-[0.8rem] font-bold text-slate-600 transition hover:bg-slate-50"
        >
          <i className="fa-solid fa-arrow-right-long mr-1.5" />
          ดูหน้าวิธีที่ 4 ก่อน
        </Link>
      </div>
    </div>
  )
}

const SITE_TYPES = [
  { value: 'witness_home', label: 'ที่อยู่ของพยานเอง' },
  { value: 'trusted_person', label: 'บ้านบุคคลที่พยานไว้ใจ' },
  { value: 'pacc_designated', label: 'สถานที่ที่ ป.ป.ท. กำหนด' },
]

const Method2Panel: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack }> = ({ caseItem, track }) => {
  const { updateMethodTrack, setMethodStatus } = useCaseStore()
  const site = track.site || {}
  const set = (patch: Record<string, unknown>) => updateMethodTrack(caseItem.no, 2, { site: { ...site, ...patch } })

  /**
   * TC-078 — ขอบเขตสถานที่ตามคำสั่ง/ข้อความ WIT0823 จำกัดประเภทสถานที่ที่เสนอได้ที่ WIT0824
   * allowed เป็น undefined แปลว่าไม่จำกัด (parseSiteScope ไม่พบคำจำกัดขอบเขตในข้อความ)
   */
  const allowed = allowedSiteTypes(caseItem, site.budgetNote)
  const outOfScope = Boolean(allowed && site.siteType && !allowed.includes(site.siteType))

  const handleSiteTypeChange = (value: string) => {
    if (allowed && !allowed.includes(value as (typeof allowed)[number])) {
      showToast(
        `เลือกไม่ได้ — ขอบเขตที่อนุมัติจำกัดเฉพาะ ${allowed.map((t) => SITE_TYPE_LABELS[t]).join(', ')} เท่านั้น`,
        'warning'
      )
      return
    }
    set({ siteType: value })
  }

  /** TC-075 — เก็บประวัติการประเมินทุกรอบไว้ใน site.evaluations ไม่เขียนทับของเดิม */
  const recordEvaluation = (suitable: boolean) => {
    const round = site.round || 1
    const entry: MethodSiteEvaluation = {
      id: `EV-${Date.now()}`,
      round,
      proposedSite: site.proposedSite || '',
      siteType: site.siteType || 'witness_home',
      custodian: site.custodian || '',
      safetyScore: site.safetyScore || '',
      accessRoutes: site.accessRoutes || '',
      suitable,
      unsuitableReason: suitable ? undefined : site.accessRoutes,
      assessedAt: new Date().toISOString(),
      assessedBy: site.assessedBy || protectionResponsibleName(caseItem),
    }
    /** WIT0826 → WIT0824 (TC-028) — ไม่เหมาะสมพากลับขั้นเสนอสถานที่ (index 1) ทันที */
    if (!suitable) updateMethodTrack(caseItem.no, 2, { wizardStep: 1 })
    set({
      suitable,
      assessedAt: entry.assessedAt,
      evaluations: [...(site.evaluations || []), entry],
      /** ไม่เหมาะสม — รอบถัดไปนับเพิ่ม แต่ไม่ล้างค่าที่กรอกไว้ ให้เจ้าหน้าที่แก้ต่อจากของเดิมได้ (TC-075) */
      ...(suitable ? {} : { round: round + 1 }),
    })
    showToast(suitable ? 'บันทึกผลประเมิน: สถานที่เหมาะสม' : 'บันทึกผลประเมิน: ไม่เหมาะสม — เลือกสถานที่ใหม่')
  }

  /** WIT0827 — ปุ่มเริ่มปฏิบัติจริงต้องผ่านเงื่อนไขกลาง (methodStartBlocker) เดียวกับที่ store บังคับ */
  const blockedReason = methodStartBlocker(caseItem, 2, track)

  /** WIT0827 — หลักฐานผู้ส่งมอบ-รับมอบ (site.handoverEvidenceDocument) เก็บชื่อไฟล์อย่างเดียวเหมือน คบ.7 ใน ReviewSection */
  const handleEvidenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = getAttachmentRejection(file)
    if (rejection) {
      showToast(rejection, 'error')
      return
    }
    set({ handoverEvidenceDocument: file.name })
    showToast('แนบหลักฐานการส่งมอบ-รับมอบตัวพยานแล้ว')
  }

  const [step, setStep] = useWizardStep(caseItem.no, 2, track.wizardStep)
  const sections = [
    <Card key="0823" title="ขอบเขตที่อนุมัติและความจำเป็น" hint="บุคคลร่วมคุ้มครอง ระยะเวลา และข้อจำกัด">
      <AreaField label="ขอบเขต ข้อจำกัด และบุคคลร่วมคุ้มครอง" value={site.budgetNote || ''} onChange={(v) => set({ budgetNote: v })} />
    </Card>,
    <Card key="0824" title="เสนอสถานที่ปลอดภัย" hint="ตามผลอนุมัติเท่านั้น">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="ws-label">ประเภทสถานที่</span>
          <select
            value={site.siteType || 'witness_home'}
            onChange={(e) => handleSiteTypeChange(e.target.value)}
            className="ws-input w-full"
          >
            {SITE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <TextField label="สถานที่ที่เสนอ" value={site.proposedSite || ''} onChange={(v) => set({ proposedSite: v })} />
        <TextField label="ผู้ดูแลสถานที่" value={site.custodian || ''} onChange={(v) => set({ custodian: v })} />
        <TextField label="ผู้ประเมิน" value={site.assessedBy || ''} onChange={(v) => set({ assessedBy: v })} />
      </div>
      {/** WIT0826 → WIT0824 (TC-028) — ประเมินไม่เหมาะสมแล้วกลับมาที่นี่ ยังเสนอให้หน่วยงานอื่นทำแทน (วิธีที่ 4) ได้จากขั้นนี้ */}
      {site.suitable === false && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-3 text-[0.8rem] leading-relaxed text-rose-900">
          <i className="fa-solid fa-rotate-left mr-1.5" />
          ผลประเมินรอบล่าสุด <strong>ไม่เหมาะสม</strong> — เสนอสถานที่ใหม่แล้วประเมินให้ผ่านก่อนจึงเริ่มปฏิบัติได้
        </div>
      )}
      {site.suitable === false && <EscalateToMethod4 caseItem={caseItem} />}
      {/** TC-078 — ขอบเขตจำกัดประเภทสถานที่ไว้ ต้องเสนอเปลี่ยนวิธี/เงื่อนไข (WIT1110) แทนถ้าจำเป็นต้องใช้สถานที่นอกขอบเขต */}
      {allowed && (
        <div className={`rounded-xl border p-3 text-[0.8rem] leading-relaxed ${outOfScope ? 'border-rose-300 bg-rose-50/70 text-rose-900' : 'border-slate-200 bg-slate-50/70 text-slate-600'}`}>
          <i className="fa-solid fa-scale-balanced mr-1.5" />
          ขอบเขตที่อนุมัติจำกัดเฉพาะ <strong>{allowed.map((t) => SITE_TYPE_LABELS[t]).join(', ')}</strong>
          {outOfScope && (
            <div className="mt-2 space-y-1.5">
              <p>สถานที่ที่เลือกอยู่นอกขอบเขตที่อนุมัติ — เลือกใหม่ให้อยู่ในขอบเขต หรือเสนอเปลี่ยนวิธี/เงื่อนไขก่อน</p>
              <Link
                to="/protection-review/$caseNo"
                params={{ caseNo: caseItem.no }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400 bg-white px-3 py-1.5 text-[0.8rem] font-bold text-rose-800 hover:bg-rose-50 transition"
              >
                <i className="fa-solid fa-list-check" />
                เสนอเปลี่ยนวิธี/เงื่อนไข
              </Link>
            </div>
          )}
        </div>
      )}
    </Card>,
    <Card key="0825" title="ประเมินความปลอดภัย" hint="ความลับ ทางเข้า-ออก ผู้ดูแล การเดินทาง ทรัพยากรและงบประมาณ">
      <div className="grid gap-3 sm:grid-cols-2">
        <AreaField label="ผลประเมินความปลอดภัยและความลับ" value={site.safetyScore || ''} onChange={(v) => set({ safetyScore: v })} />
        <AreaField label="ทางเข้า–ออกและจุดเสี่ยง" value={site.accessRoutes || ''} onChange={(v) => set({ accessRoutes: v })} />
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          type="button"
          onClick={() => recordEvaluation(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          สถานที่เหมาะสม
        </Button>
        <Button
          type="button"
          onClick={() => recordEvaluation(false)}
          className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
        >
          ไม่เหมาะสม — เลือกใหม่
        </Button>
      </div>
      {site.suitable === false && <EscalateToMethod4 caseItem={caseItem} />}
      {/** ประวัติผลประเมินทุกรอบ — ไม่ลบทิ้งเมื่อประเมินรอบใหม่ (TC-075) มิเรอร์การแสดงประวัติ tests ของ Method3Panel */}
      {(site.evaluations || []).length > 0 && (
        <ul className="space-y-1 pt-2">
          {(site.evaluations || []).map((ev) => (
            <li key={ev.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[0.8rem] text-slate-600">
              <span className={ev.suitable ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                รอบ {ev.round} · {ev.suitable ? 'เหมาะสม' : 'ไม่เหมาะสม'}
              </span>{' '}
              · {ev.proposedSite || '-'} · {ev.accessRoutes || '-'} · {ev.assessedAt.slice(0, 10)}
            </li>
          ))}
        </ul>
      )}
    </Card>,
    <Card key="0827" title="แผนย้าย / รับ–ส่ง และการเข้าพัก" hint="เส้นทางสำรอง การติดต่อฉุกเฉิน และผู้ส่ง-ผู้รับมอบ">
      {!site.suitable && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-600">
          ยังไม่ได้บันทึกผลว่าสถานที่เหมาะสม — กรอกไว้ล่วงหน้าได้ แต่ควรย้อนไปประเมินความปลอดภัยให้ครบก่อนเริ่มปฏิบัติจริง
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <AreaField label="แผนย้าย / รับ–ส่ง" value={site.movePlan || ''} onChange={(v) => set({ movePlan: v })} />
        <AreaField label="เส้นทางสำรองและการติดต่อฉุกเฉิน" value={site.backupRoute || ''} onChange={(v) => set({ backupRoute: v })} />
        <TextField label="ผู้ส่งมอบ" value={site.handoverBy || ''} onChange={(v) => set({ handoverBy: v })} />
        <TextField label="ผู้รับมอบ" value={site.handoverTo || ''} onChange={(v) => set({ handoverTo: v })} />
        <AreaField label="เหตุผิดแผน (ถ้ามี)" value={site.deviationNote || ''} onChange={(v) => set({ deviationNote: v })} rows={2} />
      </div>
      {/** TC-077 — หลักฐานผู้ส่งมอบ-รับมอบต้องแนบก่อนบันทึกเข้าพักได้ (methodStartBlocker บังคับซ้ำที่ store) */}
      <div className="space-y-1.5">
        <span className="ws-label">หลักฐานการส่งมอบ-รับมอบตัวพยาน</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-blue px-3.5 text-[0.8rem] font-bold text-white transition hover:bg-blue-dark">
            <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
            แนบหลักฐานส่งมอบ-รับมอบ
            <input
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              data-testid="site-handover-evidence-input"
              onChange={handleEvidenceUpload}
            />
          </label>
          {site.handoverEvidenceDocument && (
            <span className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[0.8rem] font-semibold text-emerald-800">
              <i className="fa-solid fa-paperclip" />
              {site.handoverEvidenceDocument}
            </span>
          )}
        </div>
      </div>
      {/**
       * ปุ่มนี้ต้องกดได้เสมอเพื่อเปิดจอยืนยันตามปกติ — ด่านบังคับจริงอยู่ที่ methodStartBlocker/setMethodStatus
       * ในสโตร์ (ปฏิเสธเงียบเมื่อเงื่อนไขไม่ผ่าน) ส่วนที่นี่แสดงเหตุผลล่วงหน้าให้เจ้าหน้าที่เห็นก่อนกดเท่านั้น
       */}
      <StartButton
        caseNo={caseItem.no}
        method={2}
        label="บันทึกเข้าพัก/ย้ายแล้ว · ACTIVE"
        hardBlockNotice={blockedReason}
      />
      <div className="pt-2">
        <Button
          type="button"
          onClick={() => {
            setMethodStatus(caseItem.no, 2, 'preparing')
            showToast('บันทึกสถานะอยู่ระหว่างจัดเตรียม')
          }}
          className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
        >
          ทำเครื่องหมายว่าอยู่ระหว่างจัดเตรียม
        </Button>
      </div>
    </Card>,
  ]

  return (
    <div className="space-y-5">
      {sections[step]}
      <WizardNav step={step} total={sections.length} onChange={setStep} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 08A-3 — วิธีที่ 3 ปกปิดข้อมูลและจำกัดสิทธิ
// ---------------------------------------------------------------------------

/** WIT0832 — role ของเจ้าหน้าที่ผู้รับผิดชอบสำนวนเอง ต้องมีสิทธิ์ขั้นต่ำเสมอ ปิดกั้นทั้งหมดไม่ได้ (TC-082) */
const Method3Panel: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack }> = ({ caseItem, track }) => {
  const responsibleOfficerRole = caseItem.protectionHandoff?.destination === 'got' ? 'got_officer' : 'officer'
  const { updateMethodTrack } = useCaseStore()
  const privacy = track.privacy || {}
  const set = (patch: Record<string, unknown>) => updateMethodTrack(caseItem.no, 3, { privacy: { ...privacy, ...patch } })
  const [testNote, setTestNote] = useState('')

  const masked = privacy.maskedIdentifiers || []
  /** สิทธิ์ขั้นต่ำ — เจ้าหน้าที่ผู้รับผิดชอบสำนวนต้องอยู่ในชุด role ที่เข้าถึงได้เสมอ ไม่ว่าจะตั้งค่าไว้อย่างไร */
  const rawRoles = privacy.allowedRoles || []
  const roles = rawRoles.includes(responsibleOfficerRole) ? rawRoles : [responsibleOfficerRole, ...rawRoles]
  const missingOfficerFloor = !rawRoles.includes(responsibleOfficerRole)
  const tests = privacy.tests || []
  const passed = tests.length > 0 && tests[tests.length - 1].passed

  /** TC-085 — สิทธิ์สิ้นผลตามช่วงเวลาที่อนุมัติ ไม่ลบ tests/policyVersion/ประวัติเดิม */
  const win = privacyWindow(privacy)
  React.useEffect(() => {
    if (win.expired && !privacy.expiredAt) {
      updateMethodTrack(caseItem.no, 3, { privacy: { ...privacy, expiredAt: new Date().toISOString() } })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [win.expired, privacy.expiredAt])

  const toggleId = (id: string) =>
    set({ maskedIdentifiers: masked.includes(id) ? masked.filter((v) => v !== id) : [...masked, id] })
  const toggleRole = (r: string) => {
    if (r === responsibleOfficerRole) {
      showToast(
        'ต้องคงสิทธิ์ขั้นต่ำให้เจ้าหน้าที่ผู้รับผิดชอบสำนวนเสมอ · การตั้งค่านี้ปิดกั้นเกินความจำเป็น',
        'warning'
      )
      return
    }
    set({ allowedRoles: roles.includes(r) ? roles.filter((v) => v !== r) : [...roles, r] })
  }

  const addTest = (ok: boolean) => {
    if (!testNote.trim()) {
      showToast('กรุณาบันทึกผลการทดสอบ')
      return
    }
    set({
      tests: [...tests, { id: `T-${Date.now()}`, at: new Date().toISOString(), by: protectionResponsibleName(caseItem), passed: ok, note: testNote }],
      ...(ok ? { effectiveAt: new Date().toISOString(), policyVersion: (privacy.policyVersion || 0) + 1, auditBaseline: tests.length + 1 } : {}),
    })
    setTestNote('')
    showToast(ok ? 'ทดสอบผ่าน — บันทึก Policy Version และ Audit Baseline แล้ว' : 'ทดสอบไม่ผ่าน — แก้ Role/Policy/Masking แล้วทดสอบซ้ำ')
  }

  const [step, setStep] = useWizardStep(caseItem.no, 3, track.wizardStep)
  const sections = [
    <Card key="0831" title="ข้อมูล/ตัวระบุที่ต้องปกปิด" hint="ระบุช่องทางและช่วงเวลาที่อนุมัติด้วย">
      <div className="flex flex-wrap gap-2">
        {MASKABLE_IDENTIFIERS.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => toggleId(id)}
            className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-bold transition ${
              masked.includes(id) ? 'border-blue bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {id}
          </button>
        ))}
      </div>
      <AreaField label="ช่องทางที่ต้องปกปิด" value={privacy.channels || ''} onChange={(v) => set({ channels: v })} rows={2} />
    </Card>,
    <Card key="0832" title="สิทธิ์ตามหน้าที่ (Need-to-Know)" hint="กำหนด Role ผู้มีสิทธิ์ เหตุผล และผู้อนุมัติสิทธิ์">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(ROLE_NAMES) as Array<keyof typeof ROLE_NAMES>)
          .filter((r) => r !== 'admin')
          .map((r) => {
            const isFloor = r === responsibleOfficerRole
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                title={isFloor ? 'สิทธิ์ขั้นต่ำของเจ้าหน้าที่ผู้รับผิดชอบสำนวน — ปิดไม่ได้' : undefined}
                className={`rounded-full border px-3 py-1.5 text-[0.8rem] font-bold transition ${
                  roles.includes(r)
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {isFloor && <i className="fa-solid fa-lock mr-1" />}
                {ROLE_NAMES[r]}
              </button>
            )
          })}
      </div>
      {missingOfficerFloor && (
        <p className="flex items-start gap-1.5 text-[0.8rem] font-bold text-amber-700">
          <i className="fa-solid fa-triangle-exclamation mt-0.5" />
          <span>ต้องคงสิทธิ์ขั้นต่ำให้เจ้าหน้าที่ผู้รับผิดชอบสำนวนเสมอ · การตั้งค่านี้ปิดกั้นเกินความจำเป็น</span>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <AreaField label="เหตุผลของการให้สิทธิ์" value={privacy.needToKnowReason || ''} onChange={(v) => set({ needToKnowReason: v })} rows={2} />
        <TextField label="ผู้อนุมัติสิทธิ์" value={privacy.approver || ''} onChange={(v) => set({ approver: v })} />
      </div>
    </Card>,
    <Card key="0833" title="มาตรการจำกัดการใช้ข้อมูล" hint="จำกัดการค้นหา ดาวน์โหลด พิมพ์ และส่งต่อ">
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ['restrictSearch', 'จำกัดการค้นหา'],
            ['restrictDownload', 'จำกัดการดาวน์โหลด'],
            ['restrictPrint', 'จำกัดการพิมพ์'],
            ['restrictForward', 'จำกัดการส่งต่อ'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem]">
            <input
              type="checkbox"
              checked={Boolean(privacy[key])}
              onChange={(e) => set({ [key]: e.target.checked })}
              className="ws-checkbox"
            />
            {label}
          </label>
        ))}
      </div>
      {/** TC-085 — ช่วงเวลาที่อนุมัติของมาตรการปกปิด ไม่ระบุ approvedTo ให้ถือค่าเริ่มต้นตาม PRIVACY_DEFAULT_APPROVAL_DAYS */}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="ช่วงเวลาที่อนุมัติ — เริ่ม"
          value={privacy.approvedFrom || ''}
          onChange={(v) => set({ approvedFrom: v })}
          type="date"
        />
        <TextField
          label="ช่วงเวลาที่อนุมัติ — สิ้นสุด"
          value={privacy.approvedTo || ''}
          onChange={(v) => set({ approvedTo: v })}
          type="date"
        />
      </div>
    </Card>,
    <Card key="0834" title="ทดสอบสิทธิ์และการรั่วไหล" hint="ไม่ผ่านให้แก้แล้วทดสอบซ้ำ เก็บผลทดสอบและผู้แก้ไข">
      <AreaField label="ผลการทดสอบ" value={testNote} onChange={setTestNote} rows={2} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => addTest(true)}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          บันทึกผล: ผ่าน
        </Button>
        <Button
          type="button"
          onClick={() => addTest(false)}
          className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
        >
          บันทึกผล: ไม่ผ่าน
        </Button>
      </div>

      {tests.length > 0 && (
        <ul className="space-y-1 pt-2">
          {tests.map((t) => (
            <li key={t.id} className="rounded-lg border border-slate-200 bg-white p-2 text-[0.8rem] text-slate-600">
              <span className={t.passed ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                {t.passed ? 'ผ่าน' : 'ไม่ผ่าน'}
              </span>{' '}
              · {t.at.slice(0, 10)} · {t.note}
            </li>
          ))}
        </ul>
      )}

      {passed && (
        <div className="border-t border-slate-200 pt-3 text-[0.8rem] text-slate-600">
          Policy Version {privacy.policyVersion} · Audit Baseline {privacy.auditBaseline} · มีผล{' '}
          {privacy.effectiveAt?.slice(0, 10)}
        </div>
      )}

      {passed && (
        <StartButton
          caseNo={caseItem.no}
          method={3}
          label="เปิดใช้มาตรการ · ACTIVE"
          hardBlockNotice={methodStartBlocker(caseItem, 3, track)}
        />
      )}
    </Card>,
  ]

  return (
    <div className="space-y-5">
      <div className="ws-callout text-[0.85rem] leading-relaxed leading-relaxed">
        <i className="fa-solid fa-triangle-exclamation mr-1.5" />
        ห้ามซ่อนจนเจ้าหน้าที่ตามสิทธิ์ทำงานไม่ได้ · ทุกการเปิดดูและส่งออกต้องมี Audit Log
      </div>

      {/** TC-085 — สิทธิ์ตามมาตรการปกปิดสิ้นผลตามช่วงเวลาที่อนุมัติ ไม่ ACTIVE ตลอดไป */}
      {win.expired && (
        <div className="rounded-xl border border-rose-300 bg-rose-50/70 p-4 text-[0.8rem] text-rose-900 leading-relaxed">
          <i className="fa-solid fa-hourglass-end mr-1.5" />
          <strong>สิ้นผลแล้ว</strong> — ช่วงเวลาที่อนุมัติสิ้นสุดเมื่อ {win.to?.slice(0, 10) || '-'}
          {win.overdueDays > 0 ? ` (เกินกำหนดมาแล้ว ${win.overdueDays} วัน)` : ''} สิทธิ์ตามมาตรการปกปิดข้อมูลชุดนี้จึงสิ้นผลลง
          ต้องขออนุมัติช่วงเวลาใหม่หรือทบทวนมาตรการก่อนจึงจะใช้สิทธิ์ต่อได้ — ประวัติผลทดสอบและ Policy Version เดิมยังเก็บไว้ครบ
        </div>
      )}

      {sections[step]}
      <WizardNav step={step} total={sections.length} onChange={setStep} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// 08B — วิธีที่ 4 ประสานหน่วยงานอื่นตามข้อ 15(4)
// ---------------------------------------------------------------------------

const Method4Panel: React.FC<{ caseItem: CaseItem; track: ProtectionMethodTrack; coordinationOnly?: boolean }> = ({ caseItem, track, coordinationOnly }) => {
  const navigate = useNavigate()
  const { updateMethodTrack, addOfficialLetter, setMethodStatus, completeMethod4Handover } =
    useCaseStore()
  const co = track.coordination || {}
  const set = (patch: Record<string, unknown>) => updateMethodTrack(caseItem.no, 4, { coordination: { ...co, ...patch } })

  const letters = (caseItem.officialLetters || []).filter((l) => l.context === 'method4')
  const letterDraft = co.letterDraft || defaultCoordinationLetter(caseItem)
  const [letterOpen, setLetterOpen] = useState(false)
  const [letterError, setLetterError] = useState('')
  const letterDialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (letterOpen) letterDialog.current?.showModal()
    else letterDialog.current?.close()
  }, [letterOpen])
  const [outgoing, setOutgoing] = useState({ channel: 'direct', trackingNo: '' })
  const [incoming, setIncoming] = useState({ registryNo: '', registryDate: todayIso(), contactPerson: '', accepted: true, reason: '' })
  /** ไฟล์หนังสือตอบกลับขาเข้า (ไม่บังคับ) — เก็บชื่อไฟล์และ blob URL สำหรับเปิดดูในทะเบียนหนังสือ */
  const [incomingFile, setIncomingFile] = useState<{ name: string; url: string } | null>(null)
  /** TC-092 — วันส่งมอบจริงแยกจากวันที่มาบันทึก/อัปโหลด (คบ.12) เริ่มนับระยะคุ้มครองจากวันนี้เท่านั้น */
  const [handoverDate, setHandoverDate] = useState(todayIso())

  /** TC-091 — ส่งมอบจริงต้องมีฐานความยินยอมครบก่อนเสมอ (คบ.11 ลงนาม หรือความยินยอมใน คบ.5 กรณีเร่งด่วน) */
  const missingConsent = !caseItem.kb11Signed && !hasConsent(caseItem, 'kb5')

  const selectedStation = POLICE_STATIONS.find((station) => station.id === co.stationId || (!co.stationId && station.name === co.agency))
  const agency = selectedStation?.name || ''

  const handleIncomingFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const rejection = getAttachmentRejection(file)
    if (rejection) {
      showToast(rejection, 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = () => setIncomingFile({ name: file.name, url: String(reader.result) })
    reader.readAsDataURL(file)
    showToast('แนบไฟล์หนังสือตอบกลับแล้ว')
  }
  const channelLabel =
    OFFICIAL_LETTER_CHANNELS.find((c) => c.value === outgoing.channel)?.label || outgoing.channel

  /** ทุกปุ่มในแผงนี้เปลี่ยนสถานะแฟ้มหรือเขียนหนังสือเข้าทะเบียน จึงผ่านจอยืนยันทุกปุ่ม */
  const handleSendOutgoing = () => {
    if (!selectedStation) { setLetterError('กรุณาค้นหาและเลือกสถานีตำรวจที่ประสาน'); return }
    if (!letterDraft.subject.trim() || !letterDraft.body.trim() || !letterDraft.registryDate) { setLetterError('กรุณากรอกเรื่อง เนื้อหา และวันที่หนังสือประสาน'); return }
    if (!letterDraft.registryNo.trim()) {
      setLetterError('กรุณาระบุเลขที่หนังสือจากระบบสารบรรณ')
      return
    }
    setLetterError('')
    letterDialog.current?.close()
    setLetterOpen(false)
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกหนังสือประสานขาออก?',
      html: confirmBody(
        'บันทึกหนังสือประสานขอความร่วมมือคุ้มครองพยานเข้าทะเบียนหนังสือของวิธีนี้',
        [
          ['หน่วยงานปลายทาง', agency],
          ['เลขที่หนังสือ', letterDraft.registryNo.trim()],
          ['ลงวันที่', letterDraft.registryDate],
          ['ช่องทางนำส่ง', channelLabel],
          ['เลขติดตาม', outgoing.trackingNo.trim() || '-'],
        ],
        'บันทึกหนังสือประสานพร้อมฉบับที่นำส่ง และเปิดขั้นแนบหนังสือตอบรับจากสถานีตำรวจ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึกหนังสือขาออก',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) { setLetterOpen(true); return }
      addOfficialLetter(caseItem.no, {
        direction: 'outgoing',
        context: 'method4',
        methodNo: 4,
        subject: letterDraft.subject,
        draftSnapshot: { ...letterDraft },
        registryNo: letterDraft.registryNo.trim(),
        registryDate: letterDraft.registryDate,
        agency,
        channel: outgoing.channel as 'direct' | 'post' | 'official_other',
        trackingNo: outgoing.trackingNo.trim(),
        sentAt: new Date().toISOString(),
      })
      updateMethodTrack(caseItem.no, 4, { coordination: { ...co, agency, letterDraft, responseStatus: 'awaiting' }, wizardStep: 2 })
      setMethodStatus(caseItem.no, 4, 'preparing')
      showToast('บันทึกหนังสือประสานขาออกแล้ว')
    })
  }

  const handleAccept = () => {
    if (!letters.some((letter) => letter.direction === 'outgoing' && letter.sentAt)) { showToast('กรุณาจัดทำและบันทึกการนำส่งหนังสือประสานก่อน', 'warning'); return }
    if (!incomingFile) { showToast('กรุณาแนบหนังสือตอบรับจากสถานีตำรวจ', 'warning'); return }
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกหนังสือตอบรับดำเนินการ?',
      html: confirmBody(
        `บันทึกหนังสือตอบกลับขาเข้าจาก ${agency} ว่ารับดำเนินการคุ้มครอง`,
        [
          ['หน่วยงาน', agency],
          ['เลขที่หนังสือรับ', incoming.registryNo.trim() || '-'],
          ['วันที่รับ', incoming.registryDate],
          ['ผู้ติดต่อของหน่วยงาน', incoming.contactPerson.trim() || '-'],
          ['ไฟล์หนังสือตอบกลับ', incomingFile?.name || '-'],
        ],
        'เปิดหน้าระยะเวลาคุ้มครองในภาพรวมการคุ้มครอง'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเตรียมดำเนินการคุ้มครอง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      addOfficialLetter(caseItem.no, {
        direction: 'incoming',
        context: 'method4',
        methodNo: 4,
        subject: 'หนังสือตอบรับดำเนินการคุ้มครองพยาน',
        registryNo: incoming.registryNo.trim(),
        registryDate: incoming.registryDate,
        agency,
        contactPerson: incoming.contactPerson.trim(),
        documentName: incomingFile?.name,
        documentPreviewUrl: incomingFile?.url,
        receivedAt: new Date().toISOString(),
      })
      updateMethodTrack(caseItem.no, 4, { wizardStep: 3, coordination: { ...co,
        responseStatus: 'accepted',
        acceptedAt: new Date().toISOString(),
        replyEvidenceName: incomingFile.name,
        contactPerson: incoming.contactPerson.trim() || co.contactPerson,
      } })
      showToast('บันทึกหนังสือตอบรับแล้ว')
      void navigate({ to: '/protection-duration', search: { caseNo: caseItem.no } })
    })
  }

  const handleDecline = () => {
    if (!incoming.reason.trim()) {
      showToast('กรุณาระบุเหตุผลการปฏิเสธ', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'บันทึกหนังสือปฏิเสธของหน่วยงาน?',
      html: confirmBody(
        `บันทึกหนังสือปฏิเสธและเหตุผลจาก ${agency}`,
        [
          ['หน่วยงาน', agency],
          ['เลขที่หนังสือรับ', incoming.registryNo.trim() || '-'],
          ['วันที่รับ', incoming.registryDate],
          ['เหตุผลการปฏิเสธ', incoming.reason.trim()],
          ['ไฟล์หนังสือตอบกลับ', incomingFile?.name || '-'],
        ],
        'วิธีที่ 4 เปลี่ยนเป็น <strong>เริ่มไม่ได้</strong> และเปิดการ์ด <strong>หน่วยงานปฏิเสธ</strong> ให้เสนอหน่วยงานใหม่ผ่าน ผบช.ชั้นต้น → ผอ.สำนัก/กอง'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึกการปฏิเสธ',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      addOfficialLetter(caseItem.no, {
        direction: 'incoming',
        context: 'method4',
        methodNo: 4,
        subject: 'หนังสือปฏิเสธการรับดำเนินการ',
        registryNo: incoming.registryNo.trim(),
        registryDate: incoming.registryDate,
        agency,
        note: incoming.reason.trim(),
        documentName: incomingFile?.name,
        documentPreviewUrl: incomingFile?.url,
        receivedAt: new Date().toISOString(),
      })
      set({ responseStatus: 'declined', declinedReason: incoming.reason.trim() })
      setMethodStatus(caseItem.no, 4, 'blocked', { reason: `หน่วยงานปฏิเสธ: ${incoming.reason.trim()}` })
      showToast('บันทึกการปฏิเสธ — เสนอผู้มีอำนาจพิจารณาหน่วยงานใหม่ได้ที่การ์ดหน่วยงานปฏิเสธด้านล่าง')
    })
  }

  const handleCompleteHandover = () => {
    if (!method4ReplyRecorded(caseItem)) {
      showToast('กรุณาแนบและบันทึกหนังสือตอบรับจากสถานีตำรวจก่อน', 'warning')
      return
    }
    /** TC-091 — ห้ามส่งมอบจริงถ้ายังไม่มีฐานความยินยอม (คบ.11 หรือความยินยอม คบ.5) แม้ปุ่มจะถูกกดมาได้ทางอื่น */
    if (missingConsent) {
      showToast('ยังไม่มี คบ.11 ลงนามหรือความยินยอมใน คบ.5 — ส่งมอบจริงไม่ได้จนกว่าจะมีฐานความยินยอมครบ', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกการส่งมอบจริงและลงนาม คบ.12?',
      html: confirmBody(
        `ส่งมอบพยานให้ ${agency} ตามวิธีที่ 4 ของคำสั่งเดิม แล้วลงนามในแบบ คบ.12`,
        [
          ['หน่วยงานผู้รับ', agency],
          ['วันที่ส่งมอบจริง', handoverDate],
          ['วันเวลานัดส่งมอบ', co.handoverAppointmentAt || '-'],
          ['สถานที่ส่งมอบ', co.handoverPlace || '-'],
          ['ผู้ส่งมอบ', co.handoverBy || '-'],
          ['ผู้รับมอบ', co.handoverTo || '-'],
          ['ขอบเขตข้อมูลที่เปิดเผยได้', co.disclosureScope || '-'],
        ],
        'บันทึกวันส่งมอบและวันเริ่มปฏิบัติจริงของวิธีที่ 4 · <strong>คำสั่งยังอยู่กับ ป.ป.ท.</strong> ไม่ใช่การส่งมอบเมื่อครบเพดาน 6 เดือนในขั้นจัดทำเรื่องยุติ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่งมอบและลงนาม คบ.12',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      /**
       * TC-092 — วันส่งมอบจริงแยกจากวันที่มาบันทึก/อัปโหลดเอกสาร ระยะคุ้มครองต้องนับจากวันส่งมอบจริง
       * (เช่น ส่งมอบจริง 5 ก.ย. แต่มาบันทึกในระบบ 9 ก.ย. ต้องยังนับจาก 5 ก.ย.) — completeMethod4Handover
       * เก็บ handoverRecordedAt (วันที่บันทึก) แยกจาก handoverCompletedAt (วันส่งมอบจริงที่กรอกที่นี่) ให้แล้ว
       */
      completeMethod4Handover(caseItem.no, { handoverCompletedAt: handoverDate })
      showToast('บันทึกการส่งมอบจริงและลงนาม คบ.12 แล้ว')
    })
  }

  const [storedStep, setStep] = useWizardStep(caseItem.no, 4, track.wizardStep)
  // หน่วยงานและหนังสือขาออกอยู่ในขั้นเดียวกัน โดยคง index เดิมของข้อมูลที่บันทึกไว้
  const step = Math.max(1, storedStep)
  const sections = [
    <Card key="0842" title="สถานีตำรวจที่ประสาน" hint="เลือกสถานีตำรวจและระบุผู้ประสานงาน" action={
      <Button type="button" variant="primary" size="md" onClick={() => setLetterOpen(true)}>ทำหนังสือประสาน</Button>
    }>
      <PoliceStationPicker province={co.province || selectedStation?.province || ''} stationId={selectedStation?.id || ''}
        onProvinceChange={(province) => set({ province, stationId: '', agency: '', contactPerson: '', contactPosition: '', contactPhone: '' })}
        onStationChange={(stationId) => {
          const station = POLICE_STATIONS.find((item) => item.id === stationId)
          set({ stationId, province: station?.province || co.province || '', agency: station?.name || '', contactPerson: '', contactPosition: '', contactPhone: '' })
        }} />
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField label="ผู้ประสานงาน" value={co.contactPerson || ''} onChange={(contactPerson) => set({ contactPerson })} />
        <TextField label="ตำแหน่ง" value={co.contactPosition || ''} onChange={(contactPosition) => set({ contactPosition })} />
        <TextField label="เบอร์โทร" value={co.contactPhone || ''} onChange={(contactPhone) => set({ contactPhone })} type="tel" />
      </div>
    </Card>,
    <Card key="0843" title="หนังสือประสานและการนำส่ง">
      {letterError && <p role="alert" className="text-sm text-rose-700">{letterError}</p>}
      <CoordinationLetterComposer caseItem={caseItem} stationName={agency} draft={letterDraft} onChange={(letterDraft) => set({ letterDraft })} />
      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <label className="block"><span className="ws-label">ส่งหนังสือประสานโดย</span>
          <select aria-label="ส่งหนังสือประสานโดย" className="ws-input w-full" value={outgoing.channel} onChange={(e) => setOutgoing((draft) => ({ ...draft, channel: e.target.value }))}>
            <option value="direct">เจ้าหน้าที่ส่งมอบด้วยตนเอง</option><option value="post">ไปรษณีย์</option>
          </select>
        </label>
        {outgoing.channel === 'post' && <TextField label="เลขติดตามไปรษณีย์" value={outgoing.trackingNo} onChange={(trackingNo) => setOutgoing((draft) => ({ ...draft, trackingNo }))} />}
      </div>
      <Button type="button" variant="primary" size="md" onClick={handleSendOutgoing} data-testid="coordination-send-outgoing">ยืนยันนำส่งหนังสือประสาน</Button>
    </Card>,
    <Card key="0844" title="หนังสือตอบกลับขาเข้า" hint="ตอบรับ หรือปฏิเสธพร้อมเหตุผล">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField label="เลขที่หนังสือรับ" value={incoming.registryNo} onChange={(v) => setIncoming((p) => ({ ...p, registryNo: v }))} />
        <TextField label="วันที่รับ" value={incoming.registryDate} onChange={(v) => setIncoming((p) => ({ ...p, registryDate: v }))} type="date" />
        <TextField label="ผู้ติดต่อของหน่วยงาน" value={incoming.contactPerson} onChange={(v) => setIncoming((p) => ({ ...p, contactPerson: v }))} />
        <AreaField label="เหตุผล (กรณีปฏิเสธ)" value={incoming.reason} onChange={(v) => setIncoming((p) => ({ ...p, reason: v }))} rows={2} />
      </div>
      <div className="space-y-1.5">
        <span className="ws-label">หนังสือตอบรับจากสถานีตำรวจ *</span>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg bg-blue px-3.5 text-[0.88rem] font-semibold text-white transition hover:bg-blue-dark">
            <i className="fa-solid fa-cloud-arrow-up text-[0.8rem]" />
            {incomingFile ? 'เปลี่ยนไฟล์' : 'อัปโหลดหนังสือตอบกลับ'}
            <input
              type="file"
              accept={ATTACHMENT_ACCEPT}
              className="hidden"
              data-testid="coordination-incoming-file-input"
              onChange={handleIncomingFileUpload}
            />
          </label>
          {incomingFile && (
            <span className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-[0.8rem] font-semibold text-emerald-800">
              <i className="fa-solid fa-paperclip" />
              <a href={incomingFile.url} target="_blank" rel="noreferrer" className="underline">
                {incomingFile.name}
              </a>
              <button
                type="button"
                aria-label="นำไฟล์ออก"
                onClick={() => setIncomingFile(null)}
                className="ml-1 text-emerald-700 hover:text-rose-700"
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </span>
          )}
        </div>
        <p className="text-[0.75rem] text-slate-500">{ATTACHMENT_RULE_TEXT}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={handleAccept}
          data-testid="coordination-accept"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          เตรียมดำเนินการคุ้มครอง
        </Button>
        <Button
          type="button"
          onClick={handleDecline}
          data-testid="coordination-decline"
          className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
        >
          ปฏิเสธ
        </Button>
      </div>

      {/**
       * WIT0845 ครึ่งหลัง — "เสนอผู้มีอำนาจพิจารณาหน่วยงานหรือแนวทางใหม่"
       * ต้องเป็นงานจริงในคิว ไม่ใช่ข้อความแจ้งเตือนที่เด้งขึ้นมาแล้วหายไป
       */}
      {co.responseStatus === 'declined' && (
        <CoordinationDeclineCard
          caseItem={caseItem}
          declinedAgency={agency}
          declinedReason={co.declinedReason || ''}
        />
      )}
    </Card>,
    <Card key="0847" title="เตรียมการและส่งมอบจริง (คบ.12)" hint="นัดวัน เวลา สถานที่ ผู้ส่ง-ผู้รับ และขอบเขตข้อมูลที่เปิดเผยได้">
      <div className="rounded-xl border border-line bg-soft p-4" data-testid="protection-duration">
        <h3 className="font-bold text-navy">ระยะเวลาคุ้มครอง</h3>
        <p className="mt-2 text-ink">ระยะเวลาที่อนุมัติ <strong>{protectionMonths(caseItem) ? monthLabel(protectionMonths(caseItem)) : '—'}</strong></p>
        <p className="mt-1 text-sm text-muted">เริ่มนับจากวันที่ส่งมอบจริง</p>
        <div className="mt-3 max-w-md"><TextField label="วันที่ส่งมอบจริง" value={handoverDate} onChange={setHandoverDate} type="date" /></div>
      </div>
      {co.responseStatus !== 'accepted' && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-600" data-testid="handover-blocked-note">
          ยังไม่มีหนังสือตอบรับจากหน่วยงาน — กรอกไว้ล่วงหน้าได้ แต่ต้องย้อนไปบันทึกการตอบรับก่อนจึงจะส่งมอบจริงได้
        </div>
      )}
      {/** TC-091 — ส่งมอบจริงต้องมีฐานความยินยอมครบก่อนเสมอ (คบ.11 หรือความยินยอม คบ.5) */}
      {missingConsent && (
        <div
          className="rounded-xl border border-rose-300 bg-rose-50/70 p-3 text-[0.8rem] text-rose-900"
          data-testid="handover-missing-consent"
        >
          <i className="fa-solid fa-lock mr-1.5" />
          ยังส่งมอบจริงไม่ได้ — ขาดเอกสารฐานความยินยอม: {!caseItem.kb11Signed && <span>คบ.11 ยังไม่ลงนาม</span>}
          {!caseItem.kb11Signed && !hasConsent(caseItem, 'kb5') && ' · '}
          {!hasConsent(caseItem, 'kb5') && <span>ยังไม่มีความยินยอมใน คบ.5</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label="วันเวลานัดส่งมอบ"
          value={co.handoverAppointmentAt || ''}
          onChange={(v) => set({ handoverAppointmentAt: v })}
          type="datetime-local"
        />
        <TextField label="สถานที่ส่งมอบ" value={co.handoverPlace || ''} onChange={(v) => set({ handoverPlace: v })} />
        <TextField label="ผู้ส่งมอบ" value={co.handoverBy || ''} onChange={(v) => set({ handoverBy: v })} />
        <TextField label="ผู้รับมอบ" value={co.handoverTo || ''} onChange={(v) => set({ handoverTo: v })} />
        {/**
         * TC-092 — วันส่งมอบจริงแยกจากวันที่มาบันทึก/อัปโหลดเอกสาร ระยะคุ้มครองนับจากวันนี้เท่านั้น
         * (ส่งมอบจริง 5 ก.ย. แต่มาบันทึก/อัปโหลด คบ.12 วันที่ 9 ก.ย. ก็ยังต้องนับจาก 5 ก.ย.)
         */}
        <AreaField label="ขอบเขตข้อมูลที่เปิดเผยได้" value={co.disclosureScope || ''} onChange={(v) => set({ disclosureScope: v })} rows={2} />
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        {/**
         * แบบ คบ.12 ใบเดียวรับใช้สองเส้นทางที่ความหมายต่างกัน จึงต้องบอกบริบทไปด้วยเสมอ
         * context=method4 คือส่งมอบภายใต้วิธีที่ 4 ของคำสั่งเดิม ไม่ใช่ส่งต่อเมื่อครบเพดาน 6 เดือน (แท็บ 11C)
         */}
        <Link
          to="/form/$formId"
          params={{ formId: '12' }}
          search={{ caseNo: caseItem.no, context: 'method4' }}
          data-testid="open-kb12-method4"
          className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
        >
          เปิดแบบ คบ.12 (วิธีที่ 4)
        </Link>
        <Button
          type="button"
          onClick={handleCompleteHandover}
          /**
           * ยังไม่ตอบรับ (responseStatus !== 'accepted') ยังปล่อยให้กดได้เพื่อให้ handleCompleteHandover
           * เตือนด้วย toast ตามเดิม (TC-090) — ส่วนขาดฐานความยินยอม (missingConsent) เป็น hard block จริง
           * ที่ต้อง disable ปุ่มเสมอไม่ว่าจะตอบรับแล้วหรือยัง (TC-091)
           */
          disabled={missingConsent}
          data-testid="coordination-complete-handover"
          className="rounded-lg bg-blue px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
        >
          บันทึกส่งมอบจริงและลงนาม คบ.12
        </Button>
      </div>
      {co.handoverCompletedAt && (
        <StartButton
          caseNo={caseItem.no}
          method={4}
          label="หน่วยงานเริ่มปฏิบัติจริง · ACTIVE"
          hardBlockNotice={methodStartBlocker(caseItem, 4, track)}
          /**
           * WIT0848 / TC-092 — ระยะคุ้มครองต้องนับจากวันส่งมอบจริง ไม่ใช่วันที่มาบันทึกภายหลัง
           * จึงตั้งวันเริ่มจริงตั้งต้นจาก operationStartedAt ที่บันทึกไว้ตอนส่งมอบ
           */
          defaultStartedAt={(co.operationStartedAt || co.handoverCompletedAt || '').slice(0, 10) || undefined}
        />
      )}
    </Card>,
  ]

  return (
    <div className="space-y-5">
      {step > 1 && <Card title="ข้อมูลการประสานสถานีตำรวจ">
        <dl className="grid gap-3 sm:grid-cols-2" data-testid="coordination-summary">
          <div><dt className="ws-label">สถานีตำรวจที่ประสาน</dt><dd className="font-semibold text-navy">{agency || '—'}</dd></div>
          <div><dt className="ws-label">จังหวัด</dt><dd>{co.province || selectedStation?.province || '—'}</dd></div>
          <div><dt className="ws-label">ผู้ประสานงาน</dt><dd>{co.contactPerson || '—'}</dd></div>
          <div><dt className="ws-label">ตำแหน่ง / เบอร์โทร</dt><dd>{co.contactPosition || '—'} · {co.contactPhone || '—'}</dd></div>
          <div><dt className="ws-label">สถานะการประสาน</dt><dd>{co.responseStatus === 'accepted' ? 'ได้รับหนังสือตอบรับแล้ว' : co.responseStatus === 'declined' ? 'หน่วยงานปฏิเสธ' : 'รอหนังสือตอบรับ'}</dd></div>
        </dl>
        {coordinationOnly && <Link to="/protection" search={{}} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-4 py-2 font-semibold text-white hover:bg-blue">ไปภาพรวมการคุ้มครอง</Link>}
      </Card>}
      {step === 1 && sections[0]}
      {step !== 1 && !coordinationOnly && sections[step]}
      {createPortal(<dialog ref={letterDialog} aria-label="ทำหนังสือประสานสถานีตำรวจ" onCancel={() => setLetterOpen(false)}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-6xl overflow-y-auto rounded-xl bg-paper p-5 text-ink shadow-card backdrop:bg-[rgba(4,17,36,.52)]">
        <div className="mb-4 flex justify-end"><Button type="button" variant="secondary" size="md" onClick={() => setLetterOpen(false)}>ปิด</Button></div>
        {sections[1]}
      </dialog>, document.body)}

      {letters.length > 0 && (
        <Card title="ทะเบียนหนังสือของวิธีนี้" hint="รับ-ส่งผ่านระบบสารบรรณเดิมภายนอก E-CMIS">
          <ul className="space-y-1.5">
            {letters.map((l) => (
              <li key={l.id} className="rounded-lg border border-slate-200 bg-white p-2.5 text-[0.8rem] text-slate-600">
                <span className={`font-bold ${l.direction === 'outgoing' ? 'text-blue-800' : 'text-emerald-800'}`}>
                  {l.direction === 'outgoing' ? 'ขาออก' : 'ขาเข้า'}
                </span>{' '}
                · {l.subject} · เลขที่ {l.registryNo || '-'} ลงวันที่ {l.registryDate || '-'}
                {l.trackingNo ? ` · ติดตาม ${l.trackingNo}` : ''}
                {l.documentName && (
                  <>
                    {' · '}
                    <i className="fa-solid fa-paperclip mr-1" />
                    {l.documentPreviewUrl ? (
                      <a href={l.documentPreviewUrl} target="_blank" rel="noreferrer" className="font-semibold text-blue-800 underline">
                        {l.documentName}
                      </a>
                    ) : (
                      <span className="font-semibold">{l.documentName}</span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  )
}
