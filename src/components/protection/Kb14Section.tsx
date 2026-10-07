import { legacyMonthLabel, monthLabel, protectionMonths } from '../../lib/protectionMonths'
import React from 'react'
import { Link } from '@tanstack/react-router'
import { SectionCard } from './SectionCard'
import { CaseItem, ExtensionRequest } from '../../types/case'
import { deriveEpisode, summarizeEpisode } from '../../lib/episode'
import { formatThaiDate } from '../../lib/utils'
import { Kb14DecisionActions } from './Kb14DecisionActions'

const STATUS_LABEL: Record<ExtensionRequest['status'], string> = {
  submitted: 'รอผู้ตรวจตรวจเอกสาร',
  returned: 'ส่งคืนแก้ไข',
  pending: 'เสนอตามลำดับชั้น · รอผู้มีอำนาจอนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
}

/**
 * ขั้น 11B — ขยายระยะเวลาการคุ้มครอง (คบ.14) · WIT1112-WIT1123 และข้อห้าม WIT1150
 *
 * กฎที่หน้านี้บังคับ:
 *  - ยอดสะสม + ช่วงที่ขอขยาย ต้องไม่เกินเพดานรวม 6 เดือน (WIT1116)
 *  - ครบเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม ต้องกลับ 11A ไปแขนงข้อ 14 (WIT1150 / WIT1149)
 *  - แก้ไขคือสร้างเวอร์ชันใหม่ ห้ามแก้ทับฉบับเดิม (WIT1119)
 */
export const Kb14Section: React.FC<{ caseItem: CaseItem; role: string }> = ({ caseItem, role }) => {
  const episode = caseItem.episode || deriveEpisode(caseItem)
  const summary = summarizeEpisode(episode)

  /** WIT1113 — คำสั่งที่ใช้อยู่ ณ ปัจจุบัน = orderRef ของ Phase ล่าสุดใน Episode */
  const currentOrderRef = episode?.phases[episode.phases.length - 1]?.orderRef || 'คบ.8/คบ.11'

  const requests = caseItem.extensionRequests || []
  const latest = requests[requests.length - 1]

  return (
    <SectionCard
      title="ระยะเวลาและเหตุผลที่ขอ"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-semibold text-navy">คบ.14 · หนังสือขยายระยะเวลาการคุ้มครองพยาน</span>
        <Link to="/form/$formId" params={{ formId: '14' }} search={{ caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg bg-navy px-5 py-2 font-semibold text-white">เปิดแบบฟอร์ม คบ.14</Link>
      </div>
      <p className="mb-4 text-[0.8rem] text-muted">ผู้บังคับบัญชาชั้นต้น → ผอ.กอง → รองเลขาธิการ → เลขาธิการ → เจ้าของสำนวน</p>
      {/* ---------- WIT1113 — ฐานตัดสินใจ: คำสั่งปัจจุบัน วันเริ่มจริง วันสิ้นสุด สะสม คงเหลือ ---------- */}
      <dl className="grid gap-2 rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 sm:grid-cols-4">
        <div>
          <dt className="text-muted">คำสั่งปัจจุบัน</dt>
          <dd className="font-bold text-navy-deep">{currentOrderRef}</dd>
        </div>
        <div>
          <dt className="text-muted">วันเริ่มจริง</dt>
          <dd className="font-bold text-navy-deep">{formatThaiDate(summary.startedAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">วันสิ้นสุดตามคำสั่ง</dt>
          <dd className="font-bold text-navy-deep">{formatThaiDate(caseItem.protectionEndAt)}</dd>
        </div>
        <div>
          <dt className="text-muted">สะสม / คงเหลือ</dt>
          <dd className="font-bold text-navy-deep">
            {Number((summary.cumulative / summary.cap * 6).toFixed(1))} / {Number((summary.remaining / summary.cap * 6).toFixed(1))} เดือน
            <span className="font-normal text-muted"> (สูงสุด 6 เดือน)</span>
          </dd>
        </div>
      </dl>

      {/* ---------- WIT1150 — ถึงเพดานแล้วห้ามจัดทำ คบ.14 เพิ่ม กลับ 11A แขนง WIT1149 ---------- */}
      {summary.atCap ? (
        <div className="space-y-2 rounded-lg border border-rose-300 bg-rose-50/70 p-3 text-[0.8rem] text-rose-900">
          <div>
            <i className="fa-solid fa-ban mr-1.5" />
            <strong>ครบ 6 เดือนแล้ว</strong> ห้ามจัดทำ คบ.14 เพิ่ม
            และห้ามย้อนหลังวัน
          </div>
          <Link
            to="/article14"
            search={{ caseNo: caseItem.no }}
            className="inline-block min-h-[44px] rounded-lg border border-rose-300 bg-white px-4 py-2 text-[0.88rem] font-semibold text-rose-700 hover:bg-rose-50 transition"
          >
            ส่งต่อกรมคุ้มครองสิทธิฯ
          </Link>
        </div>
      ) : null}

      {/* ---------- สถานะ คบ.14 ฉบับล่าสุด ---------- */}
      {latest && (
        <div className="rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700 space-y-1">
          <div>
            <strong>คบ.14 ฉบับที่ {latest.version || 1}</strong> · ขอขยาย {latest.durationMonths ? monthLabel(latest.durationMonths) : legacyMonthLabel(latest.durationDays)}
            {latest.periodFrom ? ` (${formatThaiDate(latest.periodFrom)} — ${formatThaiDate(latest.periodTo)})` : ''}
            {latest.locked && <span className="ml-1.5 text-emerald-700 font-bold">· ล็อกฉบับลงนาม</span>}
          </div>
          <div>เหตุผล: {latest.reason}</div>
          {!!latest.gapDays && (
            <div className="ws-callout text-[0.85rem] leading-relaxed">
              การคุ้มครองขาดช่วง {latest.gapDays} วัน · เหตุผล: {latest.gapReason || '-'}
            </div>
          )}
          {(latest.attachments || []).length > 0 && (
            <div className="text-[0.8rem] text-muted">แนบ: {(latest.attachments || []).join(' · ')}</div>
          )}
          <div>
            สถานะ: {STATUS_LABEL[latest.status]}
            {latest.reviewNote ? ` · ${latest.reviewNote}` : ''}
            {latest.decisionNote ? ` · ${latest.decisionNote}` : ''}
          </div>
          {(latest.previousVersions || []).length > 0 && (
            <div className="text-[0.8rem] text-muted">
              เก็บฉบับเดิมไว้ {latest.previousVersions?.length} ฉบับ — ไม่แก้ทับ
            </div>
          )}
          {/* WIT1123 — ไม่อนุมัติ: คงคำสั่งเดิมถึงวันสิ้นสุด แล้วจึงไป 11C */}
          {latest.status === 'rejected' && (
            <div className="ws-callout text-[0.85rem] leading-relaxed">
              คงคำสั่งเดิมถึงวันสิ้นสุด {formatThaiDate(caseItem.protectionEndAt)} เมื่อถึงกำหนดให้ไป
              <Link to="/termination/$caseNo" params={{ caseNo: caseItem.no }} className="ml-1 font-bold underline">
                หน้าจัดทำเรื่องยุติ (คบ.15)
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ---------- WIT1117-WIT1123 — ผู้ตรวจตรวจเอกสาร / ผู้มีอำนาจพิจารณา ---------- */}
      {latest && (latest.status === 'submitted' || latest.status === 'pending') && (
        <Kb14DecisionActions caseItem={caseItem} proposal={latest} role={role} />
      )}

      {/* ---------- WIT1122 — อนุมัติแล้ว กลับแท็บ 10 ---------- */}
      {latest?.status === 'approved' && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50/70 p-3 text-[0.8rem] text-emerald-900">
          <span>
            <i className="fa-solid fa-circle-check mr-1.5" />
            อนุมัติขยายเวลา {latest.durationMonths ? monthLabel(latest.durationMonths) : legacyMonthLabel(latest.durationDays)}แล้ว · คุ้มครองถึง {formatThaiDate(caseItem.protectionEndAt)}
          </span>
          <Link
            to="/protection-monitor"
            search={{ caseNo: caseItem.no }}
            className="rounded-lg border border-emerald-300 bg-white px-4 py-1.5 text-[0.8rem] font-bold text-emerald-800 hover:bg-emerald-50 transition"
          >
            กลับไปรายงานผลการคุ้มครอง · กำหนดรอบ คบ.13 ถัดไป
          </Link>
        </div>
      )}
    </SectionCard>
  )
}
