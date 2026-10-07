import React, { useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { ThaiDateHint } from '../common/ThaiDateHint'
import { SectionCard } from './SectionCard'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'
import { formatThaiDate, parseAnyDate } from '../../lib/utils'
import { showToast } from '../../lib/swal'

const todayIso = () => new Date().toISOString().slice(0, 10)

/**
 * ขั้น 11D (ส่วนแรก) — รับเรื่องจาก 11C พิจารณาอนุมัติ แล้วออกคำสั่งยุติ คบ.16
 * WIT1135-WIT1140
 *
 * ด่านที่ห้ามข้าม: WIT1136 ต้องมีผลพิจารณาก่อนจึงจะร่าง คบ.16 ได้
 * และ WIT1139 ห้ามเริ่มสถานะยุติก่อนมีคำสั่งที่ลงนาม
 */
export const Kb16Section: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const navigate = useNavigate()
  const { decideTerminationApproval, issueKb16, signKb16, recordOperationStopped } = useCaseStore()
  const kb16 = caseItem.kb16
  const approval = caseItem.terminationApproval

  const [form, setForm] = useState({
    orderNo: '',
    reason: caseItem.kb15?.summary || '',
    issuedAt: todayIso(),
    effectiveAt: todayIso(),
    backdatedReason: '',
  })
  const [stoppedAt, setStoppedAt] = useState(todayIso())
  const [decisionNote, setDecisionNote] = useState('')

  const isOfficer = ['officer', 'case_owner', 'admin'].includes(role)
  const isAuthority = ['secretary', 'director', 'admin'].includes(role)
  const endorsed = caseItem.kb15?.status === 'endorsed'

  if (!endorsed && !kb16) return null

  /** TC-149 — อนุญาตให้วันที่มีผลย้อนหลังก่อนวันออกคำสั่งได้ แต่ต้องบังคับระบุเหตุผลตามระเบียบ */
  const isBackdated = Boolean(form.issuedAt) && Boolean(form.effectiveAt) && form.effectiveAt < form.issuedAt

  /** ต้องกรอกครบทั้งสี่ช่องก่อน จึงจะเปิดแฟ้มคดีเพื่อให้เจ้าหน้าที่ ปปท. กรอก คบ.16 ต่อได้ */
  const draftReady =
    Boolean(form.orderNo.trim()) &&
    Boolean(form.reason.trim()) &&
    Boolean(form.issuedAt) &&
    Boolean(form.effectiveAt) &&
    (!isBackdated || Boolean(form.backdatedReason.trim()))

  const effective = parseAnyDate(kb16?.effectiveAt)
  const inForce = Boolean(kb16?.signedAt && effective && effective.getTime() <= Date.now())

  return (
    <SectionCard
      title="พิจารณาและออกคำสั่งยุติ (คบ.16)"
      hint="ห้ามเริ่มสถานะยุติก่อนมีคำสั่งที่ลงนาม และคำสั่งต้องถึงวันที่มีผลก่อน"
    >
      {/* ---------- WIT1135 — รับ คบ.7 / คบ.15 และความเห็นจาก 11C ---------- */}
      {caseItem.kb15 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] leading-relaxed text-slate-700">
          <strong className="text-navy-deep">เรื่องที่รับจากขั้นจัดทำเรื่องยุติ (คบ.15)</strong>
          <div className="mt-1">
            คบ.15 ฉบับที่ {caseItem.kb15.version} · {caseItem.kb15.summary}
          </div>
          {caseItem.terminationTrigger?.ref && <div>ต้นเรื่อง: {caseItem.terminationTrigger.ref}</div>}
          {/* TC-144 — เหตุยุติเสริมที่เกิดพร้อมกับเหตุหลัก ต้องเห็นต่อเนื่องมาถึงขั้นออกคำสั่ง คบ.16 ด้วย */}
          {(caseItem.terminationTrigger?.additionalReasons || []).length > 0 && (
            <div>
              เหตุยุติเสริม:{' '}
              {(caseItem.terminationTrigger?.additionalReasons || [])
                .map((r) => r.ref || r.source)
                .join(' · ')}
            </div>
          )}
          {caseItem.kb15.reviewNote && <div>ความเห็นผู้บังคับบัญชา: {caseItem.kb15.reviewNote}</div>}
        </div>
      )}

      {/* ---------- WIT1136 — ผู้มีอำนาจพิจารณาก่อน จึงจะร่าง คบ.16 ได้ ---------- */}
      {!approval && isAuthority && (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <span className="ws-label">อนุมัติให้ยุติหรือไม่</span>
          <input
            value={decisionNote}
            onChange={(e) => setDecisionNote(e.target.value)}
            placeholder="ความเห็นประกอบผลพิจารณา"
            className="ws-input w-full"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                decideTerminationApproval(caseItem.no, true, decisionNote || 'อนุมัติให้ยุติการคุ้มครองตามที่เสนอ')
                setDecisionNote('')
                showToast('อนุมัติให้ยุติ — จัดทำร่าง คบ.16 ได้')
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
            >
              อนุมัติให้ยุติ
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (!decisionNote.trim()) {
                  showToast('กรุณาระบุเหตุผลที่ไม่อนุมัติ', 'warning')
                  return
                }
                decideTerminationApproval(caseItem.no, false, decisionNote)
                setDecisionNote('')
                showToast('บันทึกไม่อนุมัติ — คุ้มครองต่อภายใต้คำสั่งเดิม')
              }}
              className="min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
            >
              ไม่อนุมัติ
            </Button>
          </div>
        </div>
      )}

      {/* ---------- WIT1137 — ไม่อนุมัติ: คุ้มครองต่อและกลับแท็บ 10 ---------- */}
      {approval && !approval.approved && (
        <div className="flex flex-wrap items-center gap-2 ws-callout text-[0.85rem] leading-relaxed">
          <span>
            <i className="fa-solid fa-rotate-left mr-1.5" />
            ไม่อนุมัติให้ยุติเมื่อ {approval.decidedAt} โดย {approval.decidedBy} · {approval.note}
          </span>
          <Link
            to="/protection-monitor"
            search={{ caseNo: caseItem.no }}
            className="rounded-lg border border-amber-300 bg-white px-4 py-1.5 text-[0.8rem] font-bold text-amber-800 hover:bg-amber-50 transition"
          >
            กลับไปรายงานผลการคุ้มครอง · คุ้มครองต่อภายใต้คำสั่งเดิม
          </Link>
        </div>
      )}

      {approval?.approved && !kb16 && (
        <p className="text-[0.8rem] text-emerald-700">
          <i className="fa-solid fa-circle-check mr-1" />
          อนุมัติให้ยุติเมื่อ {approval.decidedAt} โดย {approval.decidedBy} — จัดทำร่างคำสั่งได้
        </p>
      )}

      {/* ---------- WIT1138 — ร่าง คบ.16 ---------- */}
      {approval?.approved && !kb16 && isOfficer && (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              value={form.orderNo}
              onChange={(e) => setForm((p) => ({ ...p, orderNo: e.target.value }))}
              placeholder="คำสั่งที่"
              className="ws-input"
            />
            <label className="block">
              <span className="block text-[0.8rem] text-muted mb-1">วันที่ออกคำสั่ง</span>
              <input
                type="date"
                value={form.issuedAt}
                onChange={(e) => setForm((p) => ({ ...p, issuedAt: e.target.value }))}
                className="ws-input w-full"
              />
              <ThaiDateHint value={form.issuedAt} testId="kb16-issued-be" />
            </label>
            <label className="block">
              <span className="block text-[0.8rem] text-muted mb-1">วันที่คำสั่งมีผล</span>
              <input
                type="date"
                value={form.effectiveAt}
                onChange={(e) => setForm((p) => ({ ...p, effectiveAt: e.target.value }))}
                className="ws-input w-full"
              />
              <ThaiDateHint value={form.effectiveAt} testId="kb16-effective-be" />
            </label>
          </div>
          <input
            value={form.reason}
            onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
            placeholder="เหตุยุติตามคำสั่ง"
            className="ws-input w-full"
          />

          {/* ---------- TC-149 — วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง: อนุญาตแต่ต้องบังคับเหตุผล ---------- */}
          {isBackdated && (
            <div className="space-y-2 rounded-lg border border-rose-300 bg-rose-50/70 p-3">
              <p className="text-[0.8rem] font-bold text-rose-700">
                <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง — ต้องระบุเหตุผลตามระเบียบ
              </p>
              <textarea
                value={form.backdatedReason}
                onChange={(e) => setForm((p) => ({ ...p, backdatedReason: e.target.value }))}
                placeholder="ระบุเหตุผลที่วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง"
                rows={2}
                className="ws-input border w-full border-rose-300 focus:border-rose-500"
              />
            </div>
          )}

          <Button
            type="button"
            disabled={!draftReady}
            title={
              draftReady
                ? 'เปิดแฟ้มคดีและเพิ่มแบบ คบ.16 เข้าแฟ้ม'
                : isBackdated
                  ? 'กรุณาระบุเหตุผลที่วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง'
                  : 'กรุณากรอกคำสั่งที่ วันที่ออกคำสั่ง วันที่คำสั่งมีผล และเหตุยุติให้ครบก่อน'
            }
            onClick={() => {
              /* เพิ่ม คบ.16 เข้ารายการแบบฟอร์มในแฟ้ม (extraForms) แล้วพาไปหน้าแฟ้มคดีให้เจ้าหน้าที่ ปปท. กรอกต่อ */
              issueKb16(caseItem.no, {
                ...form,
                backdatedReason: isBackdated ? form.backdatedReason.trim() : undefined,
              })
              showToast('เพิ่มแบบ คบ.16 เข้าแฟ้มแล้ว — เปิดแฟ้มคดีเพื่อกรอกรายละเอียด')
              navigate({ to: '/dossier/$caseNo', params: { caseNo: caseItem.no } })
            }}
            className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-muted disabled:shadow-none disabled:hover:bg-slate-300"
          >
            <i className="fa-solid fa-folder-open mr-1.5" />
            เปิดแฟ้มคดี
          </Button>
        </div>
      )}

      {/* ---------- WIT1140 — สามวันที่ที่ต้องบันทึกแยกกัน ---------- */}
      {kb16 && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-2">
          <div>
            <strong>คำสั่งที่ {kb16.orderNo}</strong> — {kb16.reason}
          </div>
          {kb16.backdatedReason && (
            <div className="rounded-lg border border-rose-200 bg-rose-50/60 p-2 text-[0.8rem] text-rose-800">
              <i className="fa-solid fa-triangle-exclamation mr-1.5" />
              วันที่มีผลย้อนหลังก่อนวันออกคำสั่ง — เหตุผล: {kb16.backdatedReason}
            </div>
          )}
          <dl className="grid gap-2 sm:grid-cols-3">
            <div>
              <dt className="text-[0.8rem] text-muted">วันที่ออกคำสั่ง</dt>
              <dd className="font-bold text-navy-deep">{formatThaiDate(kb16.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[0.8rem] text-muted">วันที่มีผล</dt>
              <dd className="font-bold text-navy-deep">{formatThaiDate(kb16.effectiveAt)}</dd>
            </div>
            <div>
              <dt className="text-[0.8rem] text-muted">วันหยุดปฏิบัติจริง</dt>
              <dd className="font-bold text-navy-deep">
                {kb16.operationStoppedAt ? formatThaiDate(kb16.operationStoppedAt) : 'ยังไม่บันทึก'}
              </dd>
            </div>
          </dl>
          <div>
            {kb16.signedAt ? (
              <span className="font-bold text-emerald-700">
                ลงนามแล้วเมื่อ {kb16.signedAt} โดย {kb16.signedBy}
                {kb16.locked ? ' · ล็อกฉบับลงนาม' : ''}
                {!inForce && ' — ยังไม่ถึงวันที่มีผล การคุ้มครองยังดำเนินอยู่'}
              </span>
            ) : (
              <span className="font-bold text-amber-700">
                ยังไม่ลงนาม — การคุ้มครองยังไม่สิ้นสุด
              </span>
            )}
          </div>
        </div>
      )}

      {/* รอเจ้าหน้าที่กรอกแบบ คบ.16 ในแฟ้มแล้วกดส่งให้อนุมัติ ก่อนผู้มีอำนาจจึงจะลงนามได้ */}
      {kb16 && !kb16.signedAt && kb16.status !== 'submitted' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-600">
          <span>
            <i className="fa-solid fa-hourglass-half mr-1.5" />
            รอเจ้าหน้าที่กรอกแบบ คบ.16 ในแฟ้มแล้วกด “ส่งให้อนุมัติ” — ผู้มีอำนาจจึงจะลงนามได้
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

      {kb16?.status === 'submitted' && !kb16.signedAt && (
        <p className="text-[0.8rem] text-blue-700">
          <i className="fa-solid fa-paper-plane mr-1" />
          ส่งให้อนุมัติเมื่อ {kb16.submittedAt} โดย {kb16.submittedBy} — รอผู้มีอำนาจลงนาม
        </p>
      )}

      {/* ---------- WIT1139 — ลงนาม ---------- */}
      {kb16 && !kb16.signedAt && kb16.status === 'submitted' && isAuthority && (
        <Button
          type="button"
          onClick={() => {
            signKb16(caseItem.no)
            showToast('ลงนามคำสั่ง คบ.16 และล็อกฉบับลงนามแล้ว')
          }}
          className="rounded-lg bg-emerald-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
        >
          <i className="fa-solid fa-signature mr-1.5" />
          ลงนามคำสั่ง คบ.16
        </Button>
      )}

      {kb16?.signedAt && !kb16.operationStoppedAt && (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-200 pt-3">
          <label className="block w-44">
            <span className="block text-[0.8rem] text-muted mb-1">วันหยุดปฏิบัติจริง</span>
            <input
              type="date"
              value={stoppedAt}
              onChange={(e) => setStoppedAt(e.target.value)}
              className="ws-input w-full"
            />
            <ThaiDateHint value={stoppedAt} testId="kb16-stopped-be" />
          </label>
          <Button
            type="button"
            onClick={() => {
              recordOperationStopped(caseItem.no, stoppedAt)
              showToast('บันทึกวันหยุดปฏิบัติจริงแล้ว')
            }}
            className="min-h-[44px] rounded-lg border border-[#9aabba] bg-white px-4 py-2 text-[0.88rem] font-semibold text-navy hover:bg-slate-50 transition"
          >
            บันทึกวันหยุดปฏิบัติจริง
          </Button>
        </div>
      )}
    </SectionCard>
  )
}
