import React, { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'
import { APPEAL_WINDOW_DAYS } from '../../lib/constants'
import { daysUntil, formatThaiDate } from '../../lib/utils'
import { evaluateCloseGuard } from '../../lib/terminationProgress'
import { showToast } from '../../lib/swal'
import { AppealIntakeForm } from '../appeal/AppealIntakeForm'
import { AppealIntakeInput } from '../../store/useCaseStore'

const todayIso = () => new Date().toISOString().slice(0, 10)

const DELIVERY_CHANNELS = [
  { value: 'registered_mail', label: 'ไปรษณีย์ลงทะเบียนตอบรับ' },
  { value: 'in_person', label: 'ส่งมอบด้วยตนเอง' },
  { value: 'posting', label: 'ปิดประกาศ' },
  { value: 'other', label: 'อื่น ๆ' },
]

/**
 * ขั้น 11D (ส่วนหลัง) — แจ้งคำสั่งยุติ (คบ.17) อุทธรณ์ และปิดงาน · WIT1141-WIT1148
 *
 * คบ.17 ออกเลขและนำส่งผ่านระบบสารบรรณเดิมภายนอก E-CMIS (WIT1142)
 * กรอบอุทธรณ์เริ่มนับจากวันที่พยานได้รับจริงเท่านั้น ไม่ใช่วันที่ส่ง (WIT1145)
 *
 * TC-153 — ถ้าพยานไม่รับ/ติดต่อไม่ได้ ระบบต้องเก็บหลักฐานการนำส่งทุกครั้ง (deliveryAttempts)
 * และห้ามเริ่มนับกรอบอุทธรณ์จนกว่าจะมีวันรับจริง หรือเจ้าหน้าที่บันทึกว่าถือว่าได้รับตามระเบียบ
 * (หลังนำส่งไม่สำเร็จอย่างน้อย 1 ครั้ง) — TC-151 ผูกปุ่มปิดงานกับเงื่อนไขเดียวกันนี้
 */
export const Kb17Section: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const navigate = useNavigate()
  const {
    draftKb17,
    signKb17,
    dispatchKb17,
    recordKb17Delivery,
    recordKb17DeliveryAttempt,
    recordKb17DeemedReceipt,
    attachKb17Sent,
    openKb17Appeal,
    closeProtectionCase,
  } = useCaseStore()
  const kb17 = caseItem.kb17

  const [form, setForm] = useState({
    documentName: 'คบ17_แจ้งคำสั่งยุติ.pdf',
    registryNo: '',
    registryDate: todayIso(),
  })
  const [sentDoc, setSentDoc] = useState('คบ17_ฉบับส่ง_ลงเลขแล้ว.pdf')
  const [deliveredAt, setDeliveredAt] = useState(todayIso())
  const [attemptForm, setAttemptForm] = useState({
    channel: DELIVERY_CHANNELS[0].value,
    attemptedAt: todayIso(),
    note: '',
    evidence: '',
  })
  const [deemedAt, setDeemedAt] = useState(todayIso())

  if (!caseItem.kb16?.signedAt) return null

  const isAuthority = ['secretary', 'director', 'admin'].includes(role)
  /** WIT1141 — ยังไม่มีร่าง คบ.17 ในแฟ้ม: กรอกชื่อไฟล์หนังสือแล้วเปิดแฟ้มไปกรอกแบบต่อ */
  const draftReady = Boolean(form.documentName.trim())
  /** WIT1142 — ออกเลขสารบรรณได้ต่อเมื่อลงนามแล้ว และต้องมีเลขที่กับวันที่ครบ */
  const dispatchReady = Boolean(form.registryNo.trim()) && Boolean(form.registryDate)

  const daysLeft = kb17?.appealDueAt ? daysUntil(kb17.appealDueAt) : null
  const windowClosed = daysLeft !== null && daysLeft < 0
  const closed = Boolean(caseItem.closedAt) && caseItem.stage === 'terminated'
  const appealOpened = caseItem.stage === 'appeal' && caseItem.appealAgainst === 'kb17'
  const attempts = kb17?.deliveryAttempts || []
  const hasFailedAttempt = attempts.some((a) => a.result === 'failed')
  /** TC-151/TC-153 — เงื่อนไขปิดงานเดียวกับที่บังคับใน closeProtectionCase ของ store */
  const closeGuard = evaluateCloseGuard(caseItem)

  return (
    <SectionCard
      title="แจ้งคำสั่งยุติ (คบ.17) อุทธรณ์ และปิดงาน"
      hint={`ออกเลขและนำส่งผ่านระบบสารบรรณเดิม · เริ่มนับสิทธิอุทธรณ์ ${APPEAL_WINDOW_DAYS} วันจากวันที่พยานได้รับจริง`}
    >
      {/* ---------- WIT1141 — เปิดร่าง คบ.17 เข้าแฟ้มให้เจ้าหน้าที่กรอก ---------- */}
      {!kb17?.status && !kb17?.dispatchedAt && (
        <div className="space-y-2">
          <p className="text-[0.8rem] text-muted">
            จัดทำ คบ.17 แจ้งคำสั่งยุติและสิทธิอุทธรณ์ · เปิดแฟ้มเพื่อกรอกแบบ คบ.17 แล้วเสนอเลขาธิการ ป.ป.ท.
            ลงนาม ก่อนออกเลขและนำส่งผ่านสารบรรณเดิม
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={form.documentName}
              onChange={(e) => setForm((p) => ({ ...p, documentName: e.target.value }))}
              placeholder="ชื่อไฟล์หนังสือ"
              className="ws-input min-w-[240px] flex-1"
            />
          </div>
          <Button
            type="button"
            disabled={!draftReady}
            title={draftReady ? 'เปิดแฟ้มคดีและเพิ่มแบบ คบ.17 เข้าแฟ้ม' : 'กรุณาระบุชื่อไฟล์หนังสือก่อน'}
            onClick={() => {
              draftKb17(caseItem.no, { documentName: form.documentName.trim() })
              showToast('เพิ่มแบบ คบ.17 เข้าแฟ้มแล้ว — เปิดแฟ้มคดีเพื่อกรอกรายละเอียด')
              navigate({ to: '/dossier/$caseNo', params: { caseNo: caseItem.no } })
            }}
            className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-muted disabled:shadow-none disabled:hover:bg-slate-300"
          >
            <i className="fa-solid fa-folder-open mr-1.5" />
            เปิดแฟ้มคดี
          </Button>
        </div>
      )}

      {/* รอเจ้าหน้าที่กรอกแบบในแฟ้มแล้วกดส่งให้ลงนาม */}
      {kb17?.status === 'draft' && !kb17.signedAt && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-600">
          <span>
            <i className="fa-solid fa-hourglass-half mr-1.5" />
            รอเจ้าหน้าที่กรอกแบบ คบ.17 ในแฟ้มแล้วกด “ส่งให้ลงนาม” — เลขาธิการ ป.ป.ท. จึงจะลงนามได้
          </span>
          <Link
            to="/dossier/$caseNo"
            params={{ caseNo: caseItem.no }}
            className="min-h-[38px] rounded-lg border border-[#9aabba] bg-white px-3 py-1.5 text-[0.85rem] font-semibold text-navy hover:bg-slate-50 transition"
          >
            <i className="fa-solid fa-folder-open mr-1.5" />
            เปิดแฟ้มคดี
          </Link>
        </div>
      )}

      {/* เสนอลงนามแล้ว — เลขาธิการ ป.ป.ท. ลงนามที่นี่ */}
      {kb17?.status === 'submitted' && !kb17.signedAt && (
        <div className="space-y-2">
          <p className="text-[0.8rem] text-blue-700">
            <i className="fa-solid fa-paper-plane mr-1" />
            ส่งให้ลงนามเมื่อ {kb17.submittedAt} โดย {kb17.submittedBy} — รอเลขาธิการ ป.ป.ท. ลงนาม
          </p>
          {isAuthority && (
            <Button
              type="button"
              onClick={() => {
                signKb17(caseItem.no)
                showToast('เลขาธิการ ป.ป.ท. ลงนาม คบ.17 แล้ว — ออกเลขและนำส่งได้')
              }}
              className="rounded-lg bg-emerald-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              <i className="fa-solid fa-signature mr-1.5" />
              ลงนาม คบ.17
            </Button>
          )}
        </div>
      )}

      {/* ---------- WIT1142 — ลงนามแล้ว จึงออกเลขและนำส่งผ่านสารบรรณเดิม ---------- */}
      {kb17?.signedAt && !kb17.dispatchedAt && (
        <div className="space-y-2">
          <p className="text-[0.8rem] text-emerald-700">
            <i className="fa-solid fa-circle-check mr-1" />
            ลงนามแล้วเมื่อ {kb17.signedAt} โดย {kb17.signedBy} · ล็อกฉบับลงนาม — ออกเลขและส่งผ่านระบบสารบรรณเดิม
            (ภายนอก E-CMIS)
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={form.registryNo}
              onChange={(e) => setForm((p) => ({ ...p, registryNo: e.target.value }))}
              placeholder="เลขที่หนังสือ (สารบรรณเดิม)"
              className="ws-input"
            />
            <div>
              <input
                type="date"
                value={form.registryDate}
                onChange={(e) => setForm((p) => ({ ...p, registryDate: e.target.value }))}
                className="ws-input w-full"
              />
              <ThaiDateHint value={form.registryDate} testId="kb17-registry-be" />
            </div>
          </div>
          <Button
            type="button"
            disabled={!dispatchReady}
            title={dispatchReady ? 'บันทึกเลขสารบรรณและนำส่ง คบ.17' : 'กรุณาระบุเลขที่หนังสือและวันที่จากระบบสารบรรณก่อน'}
            onClick={() => {
              dispatchKb17(caseItem.no, {
                documentName: kb17.documentName || form.documentName,
                registryNo: form.registryNo.trim(),
                registryDate: form.registryDate,
              })
              showToast('ออกเลขและนำส่ง คบ.17 แล้ว')
            }}
            className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-muted disabled:shadow-none disabled:hover:bg-slate-300"
          >
            ออกเลขและนำส่ง คบ.17
          </Button>
        </div>
      )}

      {/* ---------- WIT1143 — บันทึกเลข/วันที่ส่ง และอัปโหลดฉบับส่งเข้าแฟ้ม ---------- */}
      {kb17?.dispatchedAt && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-2">
          <div>
            <strong>คบ.17 เลขที่ {kb17.registryNo}</strong> ลงวันที่ {formatThaiDate(kb17.registryDate)} · นำส่งเมื่อ{' '}
            {kb17.dispatchedAt}
          </div>
          {kb17.sentDocumentName ? (
            <div className="text-[0.8rem] text-muted">
              <i className="fa-solid fa-paperclip mr-1" />
              {kb17.sentDocumentName} — อัปโหลดฉบับส่งเข้ากับแฟ้มแล้ว
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2">
              <input
                value={sentDoc}
                onChange={(e) => setSentDoc(e.target.value)}
                placeholder="ชื่อไฟล์ คบ.17 ฉบับที่ส่งจริง"
                className="ws-input flex-1 min-w-[200px]"
              />
              <Button
                type="button"
                onClick={() => {
                  if (!sentDoc.trim()) {
                    showToast('กรุณาระบุชื่อไฟล์ฉบับส่ง', 'warning')
                    return
                  }
                  attachKb17Sent(caseItem.no, sentDoc)
                  showToast('อัปโหลด คบ.17 ฉบับส่งเข้ากับแฟ้มแล้ว')
                }}
                className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
              >
                อัปโหลดฉบับส่งเข้าแฟ้ม
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ---------- WIT1144 / WIT1145 — พยานรับจริง แล้วเริ่มนับอุทธรณ์ ---------- */}
      {kb17?.dispatchedAt && !kb17.deliveredAt && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-44">
              <span className="block text-[0.8rem] text-muted mb-1">วันที่พยานได้รับจริง</span>
              <input
                type="date"
                value={deliveredAt}
                onChange={(e) => setDeliveredAt(e.target.value)}
                className="ws-input w-full"
              />
              <ThaiDateHint value={deliveredAt} testId="kb17-delivered-be" />
            </label>
            <Button
              type="button"
              onClick={() => {
                recordKb17Delivery(caseItem.no, new Date(deliveredAt).toISOString(), 'ใบตอบรับการนำส่ง')
                showToast(`บันทึกวันที่รับจริง — เริ่มนับอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน`)
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              บันทึกวันที่พยานได้รับ
            </Button>
          </div>

          {/* ---------- TC-153 — บันทึกผลความพยายามนำส่งแต่ละครั้ง (กรณีพยานไม่รับ/ติดต่อไม่ได้) ---------- */}
          <div className="space-y-2 rounded-lg border border-slate-200 p-3">
            <span className="ws-label">
              บันทึกผลการนำส่งแต่ละครั้ง (กรณีติดต่อไม่ได้/พยานไม่รับ)
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              <select
                value={attemptForm.channel}
                onChange={(e) => setAttemptForm((p) => ({ ...p, channel: e.target.value }))}
                className="ws-input"
              >
                {DELIVERY_CHANNELS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <div>
                <input
                  type="date"
                  value={attemptForm.attemptedAt}
                  onChange={(e) => setAttemptForm((p) => ({ ...p, attemptedAt: e.target.value }))}
                  className="ws-input w-full"
                />
                <ThaiDateHint value={attemptForm.attemptedAt} testId="kb17-attempt-be" />
              </div>
              <input
                value={attemptForm.evidence}
                onChange={(e) => setAttemptForm((p) => ({ ...p, evidence: e.target.value }))}
                placeholder="ชื่อไฟล์หลักฐาน (ถ้ามี)"
                className="ws-input"
              />
            </div>
            <input
              value={attemptForm.note}
              onChange={(e) => setAttemptForm((p) => ({ ...p, note: e.target.value }))}
              placeholder="หมายเหตุ (เช่น ติดต่อไม่ได้ ไม่มีผู้รับ)"
              className="ws-input w-full"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  recordKb17DeliveryAttempt(caseItem.no, {
                    channel: DELIVERY_CHANNELS.find((c) => c.value === attemptForm.channel)?.label || attemptForm.channel,
                    attemptedAt: new Date(attemptForm.attemptedAt).toISOString(),
                    result: 'failed',
                    note: attemptForm.note || undefined,
                    evidence: attemptForm.evidence || undefined,
                  })
                  showToast('บันทึกผลการส่งไม่สำเร็จแล้ว — เก็บเป็นหลักฐานในแฟ้ม ยังไม่เริ่มนับกรอบอุทธรณ์')
                }}
                className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
              >
                บันทึกผลการส่งไม่สำเร็จ
              </Button>
              <Button
                type="button"
                onClick={() => {
                  recordKb17DeliveryAttempt(caseItem.no, {
                    channel: DELIVERY_CHANNELS.find((c) => c.value === attemptForm.channel)?.label || attemptForm.channel,
                    attemptedAt: new Date(attemptForm.attemptedAt).toISOString(),
                    result: 'success',
                    note: attemptForm.note || undefined,
                    evidence: attemptForm.evidence || undefined,
                  })
                  showToast(`บันทึกผลการส่งสำเร็จ — เริ่มนับอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน`)
                }}
                className="rounded-lg border border-emerald-300 bg-white px-4 py-2 text-[0.8rem] font-bold text-emerald-700 hover:bg-emerald-50 transition"
              >
                บันทึกผลการส่งสำเร็จ
              </Button>
            </div>
          </div>

          {attempts.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-[0.8rem]">
                <thead className="bg-slate-50 text-muted">
                  <tr>
                    <th className="px-2 py-1.5 text-left">ครั้งที่</th>
                    <th className="px-2 py-1.5 text-left">ช่องทาง</th>
                    <th className="px-2 py-1.5 text-left">วันที่ส่ง</th>
                    <th className="px-2 py-1.5 text-left">ผล</th>
                    <th className="px-2 py-1.5 text-left">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {attempts.map((a) => (
                    <tr key={a.attemptNo} className="border-t border-slate-100">
                      <td className="px-2 py-1.5">{a.attemptNo}</td>
                      <td className="px-2 py-1.5">{a.channel}</td>
                      <td className="px-2 py-1.5">{formatThaiDate(a.attemptedAt)}</td>
                      <td className={`px-2 py-1.5 font-bold ${a.result === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                        {a.result === 'success' ? 'สำเร็จ' : 'ไม่สำเร็จ'}
                      </td>
                      <td className="px-2 py-1.5 text-muted">{a.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ---------- TC-153 — หลังนำส่งไม่สำเร็จอย่างน้อย 1 ครั้ง บันทึกวันที่ถือว่าได้รับตามระเบียบ ---------- */}
          {hasFailedAttempt && (
            <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50/70 p-3">
              <span className="block text-[0.8rem] font-bold text-amber-800">
                แจ้งโดยวิธีตามระเบียบ (ปิดประกาศ/ไปรษณีย์ลงทะเบียนตอบรับ)
              </span>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block w-44">
                  <span className="block text-[0.8rem] text-muted mb-1">วันที่ถือว่าได้รับ</span>
                  <input
                    type="date"
                    value={deemedAt}
                    onChange={(e) => setDeemedAt(e.target.value)}
                    className="ws-input w-full"
                  />
                  <ThaiDateHint value={deemedAt} testId="kb17-deemed-be" />
                </label>
                <Button
                  type="button"
                  onClick={() => {
                    recordKb17DeemedReceipt(
                      caseItem.no,
                      new Date(deemedAt).toISOString(),
                      'แจ้งโดยวิธีตามระเบียบ (ปิดประกาศ/ไปรษณีย์ลงทะเบียนตอบรับ)'
                    )
                    showToast(`บันทึกวันที่ถือว่าได้รับตามระเบียบแล้ว — เริ่มนับอุทธรณ์ ${APPEAL_WINDOW_DAYS} วัน`)
                  }}
                  className="min-h-[44px] rounded-lg bg-amber-600 px-4 py-2 text-[0.88rem] font-semibold text-white hover:bg-amber-700 transition"
                >
                  บันทึกวันที่ถือว่าได้รับตามระเบียบ
                </Button>
              </div>
            </div>
          )}

          <p className="text-[0.8rem] font-bold text-muted">
            <i className="fa-solid fa-hourglass mr-1.5" />
            ยังไม่เริ่มนับกรอบอุทธรณ์
          </p>

          <div className="flex justify-end">
            <Button
              type="button"
              disabled
              title="ยังไม่เริ่มนับกรอบอุทธรณ์ — ต้องมีวันที่พยานได้รับจริงหรือวันที่ถือว่าได้รับตามระเบียบก่อน"
              className="rounded-lg bg-navy-deep px-4 py-1.5 text-[0.8rem] font-bold text-white opacity-60 transition disabled:cursor-not-allowed"
            >
              ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน
            </Button>
          </div>
        </div>
      )}

      {/* ---------- WIT1146 / WIT1147 / WIT1148 — มีอุทธรณ์ภายในกำหนดหรือไม่ ---------- */}
      {kb17?.deliveredAt && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-2">
          <div>
            พยานได้รับ คบ.17 เมื่อ {formatThaiDate(kb17.deliveredAt)}
            {kb17.deliveryMethod === 'deemed' ? ' (ถือว่าได้รับตามระเบียบ)' : ''} · ครบกำหนดอุทธรณ์{' '}
            {formatThaiDate(kb17.appealDueAt)}
            {daysLeft !== null && (daysLeft >= 0 ? ` (เหลือ ${daysLeft} วัน)` : ' (พ้นกำหนดแล้ว)')}
          </div>

          {appealOpened ? (
            <div className="flex flex-wrap items-center gap-2 ws-callout text-[0.85rem] leading-relaxed">
              <span>
                <i className="fa-solid fa-scale-balanced mr-1.5" />
                รับคำอุทธรณ์แล้ว ผูกกับ คบ.17 เลขที่ {kb17.registryNo} และหลักฐานการรับ · ไม่สร้าง คบ.1 ใหม่
              </span>
              <Link
                to="/appeal"
                className="rounded-lg border border-amber-300 bg-white px-3 py-1 font-bold text-amber-800 hover:bg-amber-50 transition"
              >
                ไปหน้าอุทธรณ์
              </Link>
            </div>
          ) : closed ? (
            <div className="rounded-lg border border-emerald-300 bg-emerald-50/70 p-2.5 text-[0.8rem] text-emerald-900">
              <i className="fa-solid fa-lock mr-1.5" />
              ปิดงานคุ้มครองแล้วเมื่อ {formatThaiDate(caseItem.closedAt)} · เอกสารฉบับลงนามถูกล็อก และคง
              Audit Trail ไว้ในแฟ้ม
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              {!windowClosed && (
                <AppealIntakeForm
                  caseItem={caseItem}
                  submitLabel="มีอุทธรณ์ภายในกำหนด"
                  onSubmit={(reason: string, intake: AppealIntakeInput) => {
                    openKb17Appeal(caseItem.no, reason, intake)
                    showToast('รับคำอุทธรณ์คำสั่งยุติ — ผูกกับ คบ.17 เดิมแล้ว')
                  }}
                />
              )}

              {/* ---------- TC-151 — ปุ่มปิดงานผูกกับเงื่อนไข evaluateCloseGuard เดียวกับที่บังคับในสโตร์ ---------- */}
              {!closeGuard.allowed && (
                <p className="text-[0.8rem] font-bold text-rose-700">
                  <i className="fa-solid fa-circle-info mr-1.5" />
                  {closeGuard.reasons.join(' · ')}
                </p>
              )}
              <div className="flex justify-end pt-1">
                <Button
                  type="button"
                  disabled={!closeGuard.allowed}
                  title={closeGuard.allowed ? 'ปิดงานคุ้มครองพยาน' : closeGuard.reasons.join(' · ')}
                  onClick={() => {
                    closeProtectionCase(caseItem.no, windowClosed ? 'พ้นกำหนดอุทธรณ์' : 'ไม่มีอุทธรณ์')
                    showToast('ปิดงานคุ้มครองและล็อกเอกสารลงนามแล้ว')
                  }}
                  className="rounded-lg bg-navy-deep px-4 py-1.5 text-[0.8rem] font-bold text-white hover:opacity-90 transition disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:opacity-40"
                >
                  ไม่มีอุทธรณ์ / พ้นกำหนด — ปิดงาน
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SectionCard>
  )
}
