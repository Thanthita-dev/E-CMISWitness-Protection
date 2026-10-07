import React, { useState } from 'react'
import { Button } from '../common/Button'
import { Badge } from '../common/Badge'
import { SignatureModal } from '../common/SignatureModal'
import { CaseItem, ProtectionMethodNo } from '../../types/case'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { useFormDraftStore } from '../../store/useFormDraftStore'
import {
  FAST_TRACK_RETURN_ISSUES,
  KB4_PROTECTION_METHOD_FIELD,
  PROTECTION_DEFAULT_DAYS,
  readRoutableProtectionMethods,
} from '../../lib/constants'
import { METHOD_LABELS } from '../../lib/episode'
import {
  fastTrackReviewItems,
  fastTrackStep,
  isFastTrackCase,
  mainPetitionNotice,
  readinessConfirmed,
  submitFastTrackGate,
  temporaryDurationCheck,
} from '../../lib/fastTrack'
import { isCaseWorkerRole } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

interface FastTrackCardProps {
  caseItem: CaseItem
}

const CardShell: React.FC<{ children: React.ReactNode; step: string }> = ({ children, step }) => (
  <section
    data-testid="fast-track-card"
    data-fast-track-step={step}
    className="ws-card border-l-4 border-l-gold p-5 space-y-4"
  >
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold-soft text-warning font-bold">
          <i className="fa-solid fa-bolt text-sm" />
        </div>
        <div>
          <h2 className="text-[1.1rem] font-bold leading-snug text-navy">เส้นทางเร่งด่วน — คบ.4 / คบ.5 และการคุ้มครองชั่วคราว</h2>
          <p className="text-[0.8rem] text-muted">
            เดินแยกจากคำร้องหลัก · ไม่ว่าผลชั่วคราวจะเป็นอย่างไร คำร้องหลักต้องเดินต่อเสมอ
          </p>
        </div>
      </div>
      <Badge variant="danger" icon="fa-bolt">
        Fast Track เร่งด่วน
      </Badge>
    </div>
    {children}
  </section>
)

const StatusNote: React.FC<{ tone: 'amber' | 'emerald' | 'slate'; title: string; children?: React.ReactNode }> = ({
  tone,
  title,
  children,
}) => {
  const palette =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
      : tone === 'amber'
        ? 'border-amber-200 bg-amber-50/70 text-amber-900'
        : 'border-slate-200 bg-white text-slate-700'
  return (
    <div className={`rounded-xl border p-3.5 text-[0.88rem] leading-relaxed ${palette}`}>
      <strong className="block mb-0.5">{title}</strong>
      {children}
    </div>
  )
}

/** หนีอักขระ HTML ก่อนใส่ลงจอยืนยัน — ข้อความเหล่านี้มาจากช่องกรอกของผู้ใช้ */
/**
 * Sheet 06 — เส้นทางเร่งด่วนทั้งเส้นในการ์ดเดียว (WIT0603 → WIT0614)
 *
 * การ์ดนี้เป็นทางเข้าเดียวของเรื่องคุ้มครองชั่วคราว จึงจงใจแสดงเฉพาะสิ่งที่ผู้ใช้คนนั้น
 * ทำได้ในขั้นปัจจุบัน — เจ้าหน้าที่เห็นขั้นจัดทำ/แก้ไข ผอ. เห็นขั้นตรวจและตัดสิน
 *
 * ประตูตามผัง
 *  WIT0606 ข้อมูลครบและพร้อมพิจารณา? → "ไม่ครบ" ไป WIT0607 · "ครบ" เปิดปุ่มของ WIT0609
 *  WIT0609 อนุมัติคุ้มครองชั่วคราว?  → "ไม่อนุมัติ" ไป WIT0610 · "อนุมัติ" ไป WIT0611
 */
export const FastTrackCard: React.FC<FastTrackCardProps> = ({ caseItem }) => {
  const { currentRole } = useAuthStore()
  const {
    submitFastTrackForDecision,
    confirmFastTrackReadiness,
    returnFastTrackForRework,
    approveTemporaryProtection,
    denyTemporaryProtection,
    acknowledgeKb5Order,
  } = useCaseStore()
  const { getDraft, signDocument, lockForm, signatures } = useFormDraftStore()

  const [submitNote, setSubmitNote] = useState('จัดทำ คบ.4 และร่างคำสั่ง คบ.5 พร้อมหลักฐานภัยคุกคามครบถ้วนแล้ว')
  /** WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวที่เสนอในร่าง คบ.5 · ต้องอยู่ในเพดานรวม 180 วันของ Episode เดียวกัน */
  const [durationDays, setDurationDays] = useState(String(caseItem.fastTrack?.temporaryDurationDays ?? PROTECTION_DEFAULT_DAYS))
  const [returnIssue, setReturnIssue] = useState(FAST_TRACK_RETURN_ISSUES[0].value)
  const [returnNote, setReturnNote] = useState('')
  const [decision, setDecision] = useState<'approve' | 'deny' | null>(null)
  const [opinion, setOpinion] = useState('เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ')
  const [orderNo, setOrderNo] = useState('')
  const [denyReason, setDenyReason] = useState('')
  const [signingWitness, setSigningWitness] = useState(false)
  const [signingDirector, setSigningDirector] = useState(false)

  if (!isFastTrackCase(caseItem)) return null

  const step = fastTrackStep(caseItem)
  const fastTrack = caseItem.fastTrack
  const isOfficer = isCaseWorkerRole(currentRole)
  const isDirector = currentRole === 'director' || currentRole === 'admin'
  /** วิธีที่ติ๊กไว้ในข้อ 4.2 ของ คบ.4 — เป็นค่าที่ส่งเข้าแฟ้มตอนกดเสนอ (WIT0603) */
  const draftMethods = readRoutableProtectionMethods(getDraft(4), KB4_PROTECTION_METHOD_FIELD) as ProtectionMethodNo[]
  const requestedDays = Number(durationDays) || 0
  const durationCheck = temporaryDurationCheck(caseItem, requestedDays)
  const gate = submitFastTrackGate(caseItem, draftMethods, requestedDays)
  const approvedMethods = fastTrack?.proposedMethods || []
  const mainNotice = mainPetitionNotice(caseItem)
  const directorSigned = Boolean(signatures['kb5-director']?.signed)

  const handleSubmit = () => {
    if (!gate.unlocked) {
      showToast(gate.reason || 'ยังส่งให้ ผอ. พิจารณาไม่ได้')
      return
    }
    const isRework = step === 'returned'
    showConfirmAlert({
      icon: 'question',
      title: isRework ? 'ส่งฉบับแก้ไขให้ ผอ. ตรวจใหม่?' : 'ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ.?',
      html: confirmBody(
        isRework
          ? 'ฉบับแก้ไขจะถูกส่งกลับขึ้น ผอ.สำนัก/กอง ตรวจใหม่โดยตรง'
          : 'แบบ คบ.4 พร้อมร่างคำสั่ง คบ.5 จะถูกเสนอตรงถึง ผอ.สำนัก/กอง',
        [
          ['วิธีคุ้มครองที่เสนอ', draftMethods.map((m) => `วิธีที่ ${m}`).join(' · ')],
          ['ระยะเวลาคุ้มครองชั่วคราวที่เสนอ', `${requestedDays} วัน (คงเหลือจากเพดานรวม ${durationCheck.remaining} วัน)`],
          ['ความเห็นประกอบ', submitNote.trim() || '-'],
        ],
        'แฟ้มย้ายไปอยู่กับ ผอ.สำนัก/กอง ทันที <strong>โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong> และจะแก้ไขเองไม่ได้จนกว่า ผอ. จะส่งกลับ'
      ),
      showCancelButton: true,
      confirmButtonText: isRework ? 'ยืนยันส่งตรวจใหม่' : 'ยืนยันส่งตรง ผอ.',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      submitFastTrackForDecision(caseItem.no, draftMethods, submitNote.trim() || undefined, {
        days: requestedDays,
      })
      showToast('ส่ง คบ.4 และร่าง คบ.5 ตรงถึง ผอ.สำนัก/กอง แล้ว — ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    })
  }

  /** WIT0606 แขนง "ครบ" — ยืนยันก่อน เพราะเป็นการเปิดประตูไปสู่จุดชี้ขาดที่ WIT0609 */
  const handleConfirmReadiness = () => {
    showConfirmAlert({
      icon: 'question',
      title: 'ยืนยันว่าข้อมูลครบและพร้อมพิจารณา?',
      html: confirmBody(
        'บันทึกผลการตรวจความครบถ้วนว่าเอกสารและหลักฐานครบถ้วนแล้ว',
        [
          ['วิธีคุ้มครองที่เสนอมา', approvedMethods.map((m) => `วิธีที่ ${m}`).join(' · ') || '-'],
          ['ระดับภัยที่ประเมินไว้', caseItem.risk],
        ],
        'เปิดปุ่ม <strong>อนุมัติ / ไม่อนุมัติการคุ้มครองชั่วคราว</strong> และบันทึกผู้ตรวจกับเวลาไว้ในแฟ้ม'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันข้อมูลครบ',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      confirmFastTrackReadiness(caseItem.no)
      showToast('บันทึกผลตรวจ: ข้อมูลครบและพร้อมพิจารณาแล้ว')
    })
  }

  const handleReturn = () => {
    if (!returnNote.trim()) {
      showToast('กรุณาระบุประเด็นและเหตุผลที่ต้องแก้ไข')
      return
    }
    const issue = FAST_TRACK_RETURN_ISSUES.find((i) => i.value === returnIssue)
    const issueLabel = issue?.label || 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5'
    showConfirmAlert({
      icon: 'warning',
      title: 'ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5?',
      html: confirmBody(
        'บันทึกเหตุผลและประเด็นแก้ไข แล้วตีกลับให้เจ้าหน้าที่ผู้รับผิดชอบ',
        [
          ['ประเด็นที่ต้องแก้ไข', issueLabel],
          ['ข้อสั่งการ', returnNote.trim()],
          ['ผู้รับงานต่อ', caseItem.assignedOfficer || '-'],
        ],
        'งานลงตรงถึงเจ้าหน้าที่ผู้รับผิดชอบ <strong>ไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong> · ผลตรวจ "ข้อมูลครบ" ของรอบนี้ถูกล้าง ต้องตรวจความครบถ้วนใหม่เมื่อได้ฉบับแก้ไข'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่งกลับแก้ไข',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      returnFastTrackForRework(caseItem.no, issueLabel, returnNote.trim())
      setReturnNote('')
      showToast('ส่งกลับให้เจ้าหน้าที่ผู้รับผิดชอบแก้ไขแล้ว — ไม่ผ่านผู้บังคับบัญชาชั้นต้น')
    })
  }

  const handleApprove = () => {
    if (!orderNo.trim()) {
      showToast('กรุณาระบุเลขที่คำสั่ง คบ.5')
      return
    }
    if (!directorSigned) {
      showToast('กรุณาลงลายมือชื่อในคำสั่ง คบ.5 ก่อนอนุมัติ')
      return
    }
    const signerName = signatures['kb5-director']?.signerName
    showConfirmAlert({
      icon: 'warning',
      title: 'อนุมัติคุ้มครองชั่วคราวและออกคำสั่ง คบ.5?',
      html: confirmBody(
        'จุดชี้ขาดของเส้นทางเร่งด่วน — อนุมัติแล้วคำสั่งจะมีผลทันที',
        [
          ['เลขที่คำสั่ง คบ.5', orderNo.trim()],
          ['ผู้ลงนาม', signerName || '-'],
          ['วิธีที่จะได้รับอนุมัติ', approvedMethods.map((m) => `วิธีที่ ${m}`).join(' · ') || '-'],
          ['ความเห็นข้อ 13 ของ คบ.4', opinion.trim() || '-'],
        ],
        '<strong>ล็อกฉบับคำสั่ง คบ.5 ที่ลงนามถาวร แก้ไขทับไม่ได้อีก</strong> · แฟ้มกลับไปที่เจ้าหน้าที่เพื่อแจ้งพยานรับทราบและลงนามยินยอม · คำร้องหลักยังเดินต่อควบคู่กัน'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันอนุมัติและออกคำสั่ง',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      approveTemporaryProtection(caseItem.no, {
        opinion: opinion.trim() || 'เห็นชอบให้คุ้มครองชั่วคราวตามที่เสนอ',
        orderNo: orderNo.trim(),
        signerName,
      })
      /** WIT0611 — ระบบล็อกฉบับที่ลงนามแล้ว ห้ามแก้ทับ เช่นเดียวกับ คบ.1 / คบ.3 / คบ.6 / คบ.8 */
      lockForm(5, signerName || 'ผู้อำนวยการสำนัก/กอง', 'ลงนามคำสั่ง คบ.5 แล้ว ห้ามแก้ไขทับฉบับลงนาม')
      setDecision(null)
      showToast('อนุมัติคุ้มครองชั่วคราวและลงนามคำสั่ง คบ.5 แล้ว')
    })
  }

  const handleDeny = () => {
    if (!denyReason.trim()) {
      showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติการคุ้มครองชั่วคราว')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'ไม่อนุมัติการคุ้มครองชั่วคราว?',
      html: confirmBody(
        'บันทึกผลไม่อนุมัติ <strong>เฉพาะการคุ้มครองชั่วคราว</strong> เท่านั้น',
        [
          ['เหตุผล', denyReason.trim()],
          ['ผู้รับงานต่อ', caseItem.assignedOfficer || '-'],
        ],
        'คำร้องหลัก <strong>ไม่ถูกปิด</strong> และ <strong>ไม่ออก คบ.10</strong> จึงยังไม่เกิดสิทธิอุทธรณ์ · แฟ้มกลับไปที่เจ้าหน้าที่เพื่อจัดทำ/เสนอ คบ.6 ที่หน้ากลั่นกรอง แล้วรอผลพิจารณาและคำสั่งตามปกติ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันไม่อนุมัติชั่วคราว',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      denyTemporaryProtection(caseItem.no, denyReason.trim())
      setDecision(null)
      showToast('บันทึกผลไม่อนุมัติชั่วคราวแล้ว — คำร้องหลักยังเดินต่อ ไม่ออก คบ.10')
    })
  }

  return (
    <CardShell step={step || 'drafting'}>
      {/* วิธีที่เสนอ/อนุมัติ — เห็นได้ทุกขั้น เพราะเป็นสาระของทั้ง sheet */}
      <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-[0.8rem]" data-testid="fast-track-methods">
        <strong className="block text-slate-700 mb-1">วิธีคุ้มครองที่เสนอในแบบ คบ.4</strong>
        {(step === 'drafting' || step === 'returned' ? draftMethods : approvedMethods).length === 0 ? (
          <span className="text-amber-700">
            ยังไม่ได้เลือกวิธี — เปิดแบบ คบ.4 แล้วติ๊กวิธีที่ 1–4 เลือกได้มากกว่าหนึ่งวิธี
          </span>
        ) : (
          <ul className="space-y-0.5 text-slate-700">
            {(step === 'drafting' || step === 'returned' ? draftMethods : approvedMethods).map((m) => (
              <li key={m}>☑ {METHOD_LABELS[m as ProtectionMethodNo] || `วิธีที่ ${m}`}</li>
            ))}
          </ul>
        )}
      </div>

      {/* WIT0607 — ประเด็นที่ ผอ. สั่งให้แก้ ค้างอยู่บนแฟ้มจนกว่าจะส่งฉบับแก้ไขขึ้นไปใหม่ */}
      {step === 'returned' && (
        <div data-testid="fast-track-return-banner">
          <StatusNote tone="amber" title="ผอ.สำนัก/กอง ส่งกลับแก้ไข คบ.4 / ร่าง คบ.5">
            <span className="block">ประเด็น: {fastTrack?.returnIssueLabel}</span>
            <span className="block">ข้อสั่งการ: {fastTrack?.returnNote}</span>
            <span className="block mt-1">
              แก้แล้ว <strong>ส่งกลับ ผอ. ตรวจใหม่โดยตรง ไม่ผ่านผู้บังคับบัญชาชั้นต้น</strong>
            </span>
          </StatusNote>
        </div>
      )}

      {/* WIT0603 → WIT0604 · และ WIT0608 รอบแก้ไข */}
      {isOfficer && (step === 'drafting' || step === 'returned') && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-[0.88rem] text-slate-600 leading-relaxed">
            จัดทำ คบ.4 พร้อมร่าง คบ.5 แล้วส่ง <strong>ตรงถึง ผอ.สำนัก/กอง</strong> โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น
            พร้อมแจ้งเตือนงานเร่งด่วน
          </p>
          {/*
            * WIT0603 — ช่วงเวลาคุ้มครองชั่วคราวต้องระบุตั้งแต่ขั้นร่าง
            * TEMPORARY กับ MAIN อยู่ Episode เดียวกัน ระยะเวลาที่เสนอจึงกินโควตาเดียวกับคำร้องหลัก
            * และต้องไม่ทำให้ยอดสะสมเกินเพดานรวม 180 วัน / 6 เดือน
            */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <label
              htmlFor="fast-track-duration-days"
              className="block text-[0.8rem] font-semibold text-slate-700"
            >
              ระยะเวลาคุ้มครองชั่วคราวที่เสนอในร่าง คบ.5 (วัน) <span className="text-rose-600">*</span>
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="fast-track-duration-days"
                type="number"
                min={1}
                value={durationDays}
                data-testid="fast-track-duration-days"
                onChange={(e) => setDurationDays(e.target.value)}
                className="ws-input w-32 text-ink"
              />
              <span className="text-[0.8rem] text-slate-600">
                คุ้มครองสะสมแล้ว {durationCheck.cumulative} วัน · คงเหลือจากเพดานรวม {durationCheck.remaining} วัน
              </span>
            </div>
            <p className="text-[0.88rem] leading-relaxed text-muted">
              ค่านี้คือช่วงเวลาที่ระบบใช้ตรวจเพดานรวม 180 วัน — ช่วงวันที่ในแบบ คบ.4 (ข้อ 2.2) และคำสั่ง คบ.5 ต้องระบุให้ตรงกับจำนวนวันนี้
            </p>
            {!durationCheck.allowed && (
              <p
                data-testid="fast-track-duration-warning"
                className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-[0.88rem] font-semibold leading-relaxed text-rose-800"
              >
                <i className="fa-solid fa-triangle-exclamation mr-1" />
                {durationCheck.reason}
              </p>
            )}
          </div>
          <textarea
            rows={2}
            value={submitNote}
            data-testid="fast-track-submit-note"
            onChange={(e) => setSubmitNote(e.target.value)}
            className="ws-input w-full text-ink"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!gate.unlocked && (
              <p className="text-[0.8rem] font-semibold text-amber-700">
                <i className="fa-solid fa-lock mr-1" />
                {gate.reason}
              </p>
            )}
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={!gate.unlocked}
              data-testid="fast-track-submit-button"
              variant="primary"
              size="lg"
            >
              <i className="fa-solid fa-bolt" />
              {step === 'returned' ? 'ส่งฉบับแก้ไขให้ ผอ. ตรวจใหม่' : 'ส่งตรง ผอ. พิจารณาคุ้มครองชั่วคราว'}
            </Button>
          </div>
        </div>
      )}

      {/* WIT0605 — ผอ. ตรวจ คบ.4 ร่าง คบ.5 หลักฐาน ระดับภัย และมาตรการคุ้มครองชั่วคราว */}
      {isDirector && step === 'director_review' && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <strong className="block text-[0.8rem] text-navy">รายการที่ต้องตรวจก่อนพิจารณา</strong>
          <div className="space-y-1.5 text-[0.8rem]" data-testid="fast-track-review-list">
            {fastTrackReviewItems(caseItem).map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-slate-700">
                <i
                  className={`fa-solid ${item.ok ? 'fa-circle-check text-emerald-600' : 'fa-circle-exclamation text-amber-500'}`}
                />
                <span>{item.label}</span>
              </div>
            ))}
          </div>

          {/* WIT0606 — ประตูด่านแรก: ข้อมูลครบและพร้อมพิจารณาหรือยัง */}
          {!readinessConfirmed(caseItem) ? (
            <div className="space-y-3 border-t border-slate-100 pt-3">
              <p className="text-[0.8rem] font-semibold text-navy">
                ข้อมูลครบและพร้อมพิจารณาหรือไม่?
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setDecision(decision === 'deny' ? null : 'deny')}
                  data-testid="fast-track-incomplete-button"
                  variant="secondary"
                  size="md"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  <i className="fa-solid fa-rotate-left" />
                  ไม่ครบ — ส่งกลับแก้ไข
                </Button>
                <Button
                  type="button"
                  onClick={handleConfirmReadiness}
                  data-testid="fast-track-ready-button"
                  variant="primary"
                  size="md"
                >
                  <i className="fa-solid fa-circle-check" />
                  ครบ — พร้อมพิจารณา
                </Button>
              </div>

              {/* WIT0607 — บันทึกเหตุผลและประเด็นแก้ไข ส่งกลับเจ้าหน้าที่ผู้รับผิดชอบ */}
              {decision === 'deny' && (
                <div className="space-y-2.5 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">ประเด็นที่ต้องแก้ไข *</label>
                    <select
                      value={returnIssue}
                      data-testid="fast-track-return-issue"
                      onChange={(e) => setReturnIssue(e.target.value)}
                      className="ws-input w-full text-ink"
                    >
                      {FAST_TRACK_RETURN_ISSUES.map((i) => (
                        <option key={i.value} value={i.value}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <textarea
                    rows={3}
                    value={returnNote}
                    data-testid="fast-track-return-note"
                    onChange={(e) => setReturnNote(e.target.value)}
                    placeholder="ระบุเหตุผลและสิ่งที่ต้องแก้ไขใน คบ.4 / ร่าง คบ.5 ..."
                    className="ws-input w-full text-ink"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleReturn}
                      data-testid="fast-track-return-confirm"
                      variant="danger"
                      size="md"
                    >
                      <i className="fa-solid fa-rotate-left" />
                      ยืนยันส่งกลับเจ้าหน้าที่ผู้รับผิดชอบ
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* WIT0609 — จุดชี้ขาด: อนุมัติคุ้มครองชั่วคราวหรือไม่ */
            <div className="space-y-3 border-t border-slate-100 pt-3" data-testid="fast-track-decision-panel">
              <p className="text-[0.8rem] font-semibold text-navy">อนุมัติคุ้มครองชั่วคราวหรือไม่?</p>
              <p className="text-[0.8rem] text-muted">
                ตรวจความครบถ้วนแล้วเมื่อ {fastTrack?.readinessCheckedAt} โดย {fastTrack?.readinessCheckedBy}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  onClick={() => setDecision(decision === 'deny' ? null : 'deny')}
                  data-testid="fast-track-deny-button"
                  variant="secondary"
                  size="md"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50"
                >
                  <i className="fa-solid fa-ban" />
                  ไม่อนุมัติคุ้มครองชั่วคราว
                </Button>
                <Button
                  type="button"
                  onClick={() => setDecision(decision === 'approve' ? null : 'approve')}
                  data-testid="fast-track-approve-button"
                  variant="primary"
                  size="md"
                >
                  <i className="fa-solid fa-file-signature" />
                  อนุมัติและลงนาม คบ.5
                </Button>
              </div>

              {/* WIT0611 — ความเห็นข้อ 13 ของ คบ.4 และลายมือชื่อในคำสั่ง คบ.5 */}
              {decision === 'approve' && (
                <div className="space-y-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
                      เลขที่คำสั่ง คบ.5 *
                    </label>
                    <input
                      type="text"
                      value={orderNo}
                      data-testid="kb5-order-no"
                      onChange={(e) => setOrderNo(e.target.value)}
                      placeholder="เช่น 045/2569"
                      className="ws-input w-full text-ink"
                    />
                  </div>
                  <div>
                    <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
                      ความเห็นข้อ 13 ของ คบ.4 *
                    </label>
                    <textarea
                      rows={3}
                      value={opinion}
                      data-testid="kb5-director-opinion"
                      onChange={(e) => setOpinion(e.target.value)}
                      className="ws-input w-full text-ink"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
                    <span className="text-[0.8rem] text-slate-600">
                      {directorSigned ? (
                        <span className="font-bold text-emerald-700">
                          ✓ ลงลายมือชื่อแล้ว — {signatures['kb5-director']?.signerName}
                        </span>
                      ) : (
                        'ยังไม่ได้ลงลายมือชื่อในคำสั่ง คบ.5'
                      )}
                    </span>
                    <Button
                      type="button"
                      onClick={() => setSigningDirector(true)}
                      data-testid="kb5-sign-button"
                      variant="secondary"
                      size="md"
                    >
                      <i className="fa-solid fa-pen-nib" />
                      {directorSigned ? 'ลงนามใหม่' : 'ลงลายมือชื่อคำสั่ง คบ.5'}
                    </Button>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleApprove}
                      data-testid="fast-track-approve-confirm"
                      variant="primary"
                      size="md"
                    >
                      <i className="fa-solid fa-check" />
                      ยืนยันอนุมัติและออกคำสั่ง คบ.5
                    </Button>
                  </div>
                </div>
              )}

              {/* WIT0610 — ไม่อนุมัติเฉพาะชั่วคราว ไม่ปิดคำร้องหลักและไม่ออก คบ.10 */}
              {decision === 'deny' && (
                <div className="space-y-2.5 rounded-lg border border-rose-200 bg-rose-50/50 p-3">
                  <p className="text-[0.88rem] leading-relaxed text-rose-900">
                    <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                    การไม่อนุมัติในขั้นนี้คือ <strong>ไม่อนุมัติเฉพาะการคุ้มครองชั่วคราว</strong> เท่านั้น —
                    คำร้องหลักไม่ปิด และ <strong>ไม่ออก คบ.10</strong> จึงยังไม่เกิดสิทธิอุทธรณ์
                  </p>
                  <textarea
                    rows={3}
                    value={denyReason}
                    data-testid="fast-track-deny-reason"
                    onChange={(e) => setDenyReason(e.target.value)}
                    placeholder="เหตุผลที่ยังไม่อนุมัติให้คุ้มครองชั่วคราว ..."
                    className="ws-input w-full text-ink"
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      onClick={handleDeny}
                      data-testid="fast-track-deny-confirm"
                      variant="danger"
                      size="md"
                    >
                      <i className="fa-solid fa-ban" />
                      ยืนยันไม่อนุมัติชั่วคราว (คำร้องหลักเดินต่อ)
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* รอ ผอ. พิจารณา — มุมมองของคนที่ไม่ใช่ผู้ตัดสิน */}
      {!isDirector && step === 'director_review' && (
        <StatusNote tone="amber" title="เสนอ ผอ.สำนัก/กอง พิจารณาแล้ว">
          ส่งตรงถึง ผอ. โดยไม่ผ่านผู้บังคับบัญชาชั้นต้น เมื่อ {fastTrack?.submittedAt} — รอผลการพิจารณาคุ้มครองชั่วคราว
        </StatusNote>
      )}

      {/* WIT0612 — พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอม */}
      {step === 'approved' && (
        <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4" data-testid="fast-track-ack-panel">
          <StatusNote tone="emerald" title={`อนุมัติคุ้มครองชั่วคราวแล้ว — คำสั่ง คบ.5 ที่ ${fastTrack?.kb5OrderNo}`}>
            <span className="block">ลงนามโดย {fastTrack?.kb5SignedBy} เมื่อ {fastTrack?.kb5SignedAt}</span>
            <span className="block">ความเห็นข้อ 13 ของ คบ.4: {fastTrack?.directorOpinion}</span>
            <span className="block mt-1">ฉบับลงนามถูกล็อกแล้ว — แก้ไขทับไม่ได้</span>
          </StatusNote>
          <p className="text-[0.88rem] text-slate-600 leading-relaxed">
            พยานรับทราบคำสั่ง คบ.5 และลงนามยินยอมรับการคุ้มครองชั่วคราว
            (ความยินยอมอ้างอิง คบ.5 ใช้แทน คบ.11 ของเส้นทางปกติ)
          </p>
          {(isOfficer || currentRole === 'admin') && (
            <div className="flex justify-end">
              <Button
                type="button"
                onClick={() => setSigningWitness(true)}
                data-testid="kb5-witness-ack-button"
                variant="primary"
                size="md"
              >
                <i className="fa-solid fa-file-signature" />
                พยานลงนามยินยอมรับการคุ้มครองชั่วคราว
              </Button>
            </div>
          )}
        </div>
      )}

      {/* WIT0613 — คำสั่ง คบ.5 พร้อมดำเนินการ ส่งวิธีที่อนุมัติไปแท็บ 08 */}
      {step === 'active' && (
        <StatusNote tone="emerald" title="คำสั่ง คบ.5 พร้อมดำเนินการ">
          <span className="block">
            พยานลงนามยินยอมเมื่อ {fastTrack?.witnessAckAt} — ส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติที่หน้าดำเนินการตามวิธีคุ้มครองแล้ว
          </span>
          <span className="block">
            ระยะเวลาคุ้มครองช่วงชั่วคราวเริ่มนับเมื่อวิธีแรกเริ่มปฏิบัติจริง และนับต่อเนื่องเมื่อเปลี่ยนเป็นช่วงคำร้องหลัก
          </span>
        </StatusNote>
      )}

      {/* WIT0610 — ผลไม่อนุมัติชั่วคราว */}
      {step === 'denied' && (
        <StatusNote tone="amber" title="ไม่อนุมัติการคุ้มครองชั่วคราว">
          <span className="block">เหตุผล: {caseItem.temporaryDeniedReason}</span>
          <span className="block">บันทึกเมื่อ {caseItem.temporaryDeniedAt}</span>
        </StatusNote>
      )}

      {/* WIT0614 — คำร้องหลักยังเดินต่อเสมอ */}
      {mainNotice && (
        <div data-testid="fast-track-main-petition-notice">
          <StatusNote tone="slate" title="คำร้องหลักยังเดินต่อ">
            {mainNotice}
          </StatusNote>
        </div>
      )}

      {signingDirector && (
        <SignatureModal
          isOpen
          title="ลงลายมือชื่อในคำสั่งคุ้มครองชั่วคราว (คบ.5)"
          signerRole="ผู้อำนวยการสำนัก/กอง/ศูนย์"
          defaultSignerName={caseItem.owner}
          onClose={() => setSigningDirector(false)}
          onConfirm={(name, img) => {
            signDocument('kb5-director', name, img)
            setSigningDirector(false)
            showToast('บันทึกลายมือชื่อในคำสั่ง คบ.5 แล้ว — กดยืนยันอนุมัติเพื่อออกคำสั่ง')
          }}
        />
      )}

      {signingWitness && (
        <SignatureModal
          isOpen
          title="ลงลายมือชื่อยินยอมรับการคุ้มครองชั่วคราว (คบ.5)"
          signerRole="พยานผู้รับการคุ้มครอง"
          defaultSignerName={caseItem.person}
          onClose={() => setSigningWitness(false)}
          onConfirm={(name, img) => {
            signDocument('kb5-witness', name, img)
            acknowledgeKb5Order(caseItem.no, name)
            setSigningWitness(false)
            showToast('พยานลงนามยินยอมแล้ว — ส่งวิธีที่อนุมัติไปเปิดเส้นทางปฏิบัติที่หน้าดำเนินการตามวิธีคุ้มครอง')
          }}
        />
      )}
    </CardShell>
  )
}
