import React, { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import {
  PROTECTION_DURATION_OPTIONS,
  PROTECTION_MAX_DAYS,
  PROTECTION_DEFAULT_DAYS,
  EXTERNAL_TRANSFER_AGENCIES,
  TERMINATION_REASONS,
  isCaseWorkerRole,
} from '../../lib/constants'
import { formatThaiDate, daysUntil, daysElapsed, currentReportPeriod, thaiMonthName } from '../../lib/utils'
import { showToast } from '../../lib/swal'

interface ProtectionOperationsCardProps {
  caseItem: CaseItem
  onActionComplete?: () => void
}

type PanelKey = 'report' | 'event' | 'extension' | 'termination' | 'transfer' | 'withdrawal' | null

/**
 * ขั้นตอนที่ 6 (ปฏิบัติการและรายงานผล) และขั้นตอนที่ 7 (ขยายเวลา / ยุติ / ส่งต่อ / ถอนตัว)
 */
export const ProtectionOperationsCard: React.FC<ProtectionOperationsCardProps> = ({ caseItem, onActionComplete }) => {
  const { currentRole } = useAuthStore()
  const {
    addImportantEvent,
    addMonthlyReport,
    requestExtension,
    requestTermination,
    decideTermination,
    requestTransfer,
    completeTransfer,
    requestWithdrawal,
    decideWithdrawal,
  } = useCaseStore()

  const [panel, setPanel] = useState<PanelKey>(null)
  const [reportSummary, setReportSummary] = useState('')
  const [reportIncidents, setReportIncidents] = useState(0)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDetail, setEventDetail] = useState('')
  const [extDays, setExtDays] = useState(PROTECTION_DEFAULT_DAYS)
  const [extReason, setExtReason] = useState('')
  const [termReason, setTermReason] = useState(TERMINATION_REASONS[0])
  const [transferAgency, setTransferAgency] = useState(EXTERNAL_TRANSFER_AGENCIES[0])
  const [transferReason, setTransferReason] = useState(
    'ครบระยะเวลา 60 วันตามสิทธิ์ของ ป.ป.ท. แล้ว แต่สถานการณ์ภัยคุกคามยังรุนแรงเกินขอบเขตอำนาจ'
  )
  const [withdrawReason, setWithdrawReason] = useState('')

  const isOfficer = isCaseWorkerRole(currentRole)
  const isProtection = currentRole === 'protection' || currentRole === 'admin'
  const isSecretary = currentRole === 'secretary' || currentRole === 'admin'
  const isSupervisor = currentRole === 'supervisor' || currentRole === 'admin'
  const isDirector = currentRole === 'director' || currentRole === 'admin'

  const slaStarted = Boolean(caseItem.policeAckAt)
  const daysLeft = daysUntil(caseItem.protectionEndAt)
  const daysDone = daysElapsed(caseItem.actualStartedAt)
  const period = currentReportPeriod()
  const reportedThisPeriod = (caseItem.monthlyReports || []).some((r) => r.period === period)
  const pendingExtension = (caseItem.extensionRequests || []).find((r) => r.status === 'pending')
  const withdrawal = caseItem.withdrawalRequest
  const termination = caseItem.terminationRequest

  const togglePanel = (key: PanelKey) => setPanel((prev) => (prev === key ? null : key))
  const done = () => {
    setPanel(null)
    onActionComplete?.()
  }

  const hasPendingDecision = Boolean(
    pendingExtension || termination?.status === 'pending' || withdrawal?.status === 'pending' || caseItem.transferRequest?.status === 'pending'
  )

  if (!slaStarted && !hasPendingDecision) return null

  return (
    <section className="ws-card p-5 space-y-4">
      {/* SLA gate */}
      {slaStarted && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[0.8rem]">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
            <span className="block text-[0.8rem] text-emerald-700">เริ่มคุ้มครอง</span>
            <strong className="text-emerald-900">{formatThaiDate(caseItem.actualStartedAt)}</strong>
            <div className="text-[0.8rem] text-emerald-700 mt-0.5">คุ้มครองมาแล้ว {daysDone ?? 0} วัน</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <span className="block text-[0.8rem] text-muted">ครบกำหนด</span>
            <strong className="text-navy">{formatThaiDate(caseItem.protectionEndAt)}</strong>
            <div className="text-[0.8rem] text-muted mt-0.5">กรอบ {caseItem.protectionDays} วัน</div>
          </div>
          <div
            className={`rounded-xl border p-3 ${
              daysLeft !== null && daysLeft <= 15 ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
            }`}
          >
            <span className="block text-[0.8rem] text-muted">คงเหลือ</span>
            <strong className={daysLeft !== null && daysLeft <= 15 ? 'text-amber-800' : 'text-navy'}>
              {daysLeft === null ? '-' : daysLeft >= 0 ? `${daysLeft} วัน` : `เกินกำหนด ${Math.abs(daysLeft)} วัน`}
            </strong>
            <div className="text-[0.8rem] text-muted mt-0.5">สูงสุดครั้งละ {PROTECTION_MAX_DAYS} วัน</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <span className="block text-[0.8rem] text-muted">รายงาน คบ.13</span>
            <strong className={reportedThisPeriod ? 'text-emerald-700' : 'text-rose-700'}>
              {reportedThisPeriod ? 'ส่งงวดนี้แล้ว' : 'ยังไม่ส่งงวดนี้'}
            </strong>
            <div className="text-[0.8rem] text-muted mt-0.5">
              งวด {thaiMonthName(period)} · ส่งแล้ว {(caseItem.monthlyReports || []).length} งวด
            </div>
          </div>
        </div>
      )}

      {/* Pending decisions banners */}
      {pendingExtension && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-[0.8rem] space-y-2">
          <div className="font-bold text-blue-900">
            <i className="fa-solid fa-clock-rotate-left mr-1.5" />
            คำขอขยายระยะเวลา (คบ.14) — ยื่นตรงถึงเลขาธิการ ป.ป.ท.
          </div>
          <div className="text-blue-800">
            ขอขยาย {pendingExtension.durationDays} วัน · ยื่นโดย {pendingExtension.requestedBy} เมื่อ {pendingExtension.requestedAt}
          </div>
          <div className="text-slate-700">{pendingExtension.reason}</div>

          {isSecretary && (
            <div className="flex justify-end border-t border-blue-200 pt-2">
              <Link
                to="/protection-extension/$caseNo"
                params={{ caseNo: caseItem.no }}
                className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg bg-navy px-4 py-[0.68rem] text-[0.88rem] font-semibold text-white transition hover:bg-blue"
              >
                <i className="fa-solid fa-arrow-right-long text-[0.74rem]" />
                ไปพิจารณาที่หน้าขยายเวลา (คบ.14)
              </Link>
            </div>
          )}
        </div>
      )}

      {termination?.status === 'pending' && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-[0.8rem] space-y-2">
          <div className="font-bold text-navy">
            <i className="fa-solid fa-circle-stop mr-1.5" />
            คบ.7 คำร้องขอยุติการคุ้มครองพยาน — รอเลขาธิการ ป.ป.ท. ลงนาม
          </div>
          <div className="text-slate-700">{termination.reason}</div>
          {isSecretary && (
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-2">
              <Button
                type="button"
                onClick={() => {
                  decideTermination(caseItem.no, false, 'ยังไม่สมควรยุติ ให้คุ้มครองต่อเนื่อง')
                  showToast('ไม่อนุมัติการยุติ · คุ้มครองต่อเนื่อง')
                  done()
                }}
                variant="secondary"
                size="md"
              >
                ไม่อนุมัติยุติ
              </Button>
              <Button
                type="button"
                onClick={() => {
                  decideTermination(caseItem.no, true, 'ลงนามรับรองสั่งยุติการปฏิบัติงานคุ้มครองพยาน')
                  showToast('เลขาธิการ ป.ป.ท. ลงนามสั่งยุติการคุ้มครองแล้ว')
                  done()
                }}
                variant="primary"
                size="md"
              >
                ลงนามสั่งยุติ (คบ.7)
              </Button>
            </div>
          )}
        </div>
      )}

      {withdrawal?.status === 'pending' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-[0.8rem] space-y-2">
          <div className="font-bold text-amber-900">
            <i className="fa-solid fa-person-walking-arrow-right mr-1.5" />
            พยานขอถอนตัวจากการคุ้มครอง — บันทึกเป็น คบ.3 · รอ
            {withdrawal.approvalStage === 'supervisor' ? ' ผู้บังคับบัญชาชั้นต้น' : ' ผอ.สำนัก/กอง'} พิจารณา
          </div>
          <div className="text-slate-700">{withdrawal.reason}</div>

          {((withdrawal.approvalStage === 'supervisor' && isSupervisor) ||
            (withdrawal.approvalStage === 'director' && isDirector)) && (
            <div className="flex justify-end gap-2 border-t border-amber-200 pt-2">
              <Button
                type="button"
                onClick={() => {
                  decideWithdrawal(caseItem.no, withdrawal.approvalStage === 'supervisor' ? 'supervisor' : 'director', false, 'ไม่อนุมัติการถอนตัว ให้ชี้แจงพยานเพิ่มเติม')
                  showToast('ไม่อนุมัติการถอนตัว')
                  done()
                }}
                variant="secondary"
                size="md"
              >
                ไม่อนุมัติ
              </Button>
              <Button
                type="button"
                onClick={() => {
                  decideWithdrawal(caseItem.no, withdrawal.approvalStage === 'supervisor' ? 'supervisor' : 'director', true, 'เห็นชอบการถอนตัวตามความประสงค์ของพยาน')
                  showToast('บันทึกความเห็นชอบการถอนตัวแล้ว')
                  done()
                }}
                variant="primary"
                size="md"
              >
                เห็นชอบการถอนตัว
              </Button>
            </div>
          )}
        </div>
      )}

      {caseItem.transferRequest?.status === 'pending' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 text-[0.8rem] space-y-2">
          <div className="font-bold text-blue-900">
            <i className="fa-solid fa-right-left mr-1.5" />
            คบ.12 ส่งต่อ {caseItem.transferRequest.agency}
          </div>
          <div className="text-slate-700">{caseItem.transferRequest.reason}</div>
          {isOfficer && (
            <div className="flex justify-end border-t border-blue-200 pt-2">
              <Button
                type="button"
                onClick={() => {
                  completeTransfer(caseItem.no, 'บันทึกส่งมอบพยานและเอกสารทั้งหมดให้หน่วยงานผู้รับมอบเรียบร้อย')
                  showToast('บันทึกการส่งมอบพยานเรียบร้อยแล้ว')
                  done()
                }}
                variant="primary"
                size="md"
              >
                ยืนยันส่งมอบพยานแล้ว
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Monthly reports & events log */}
      {slaStarted && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 text-[0.8rem]">
          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-bold text-navy">รายงานผลประจำเดือน (คบ.13)</div>
              {/* เส้นทางเต็มของรอบรายงาน (WIT1004-WIT1013) อยู่ที่แท็บ 10 — ที่นี่แสดงผลย่อและสถานะลงนาม */}
              <Link
                to="/protection-monitor"
                search={{ caseNo: caseItem.no }}
                className="inline-flex min-h-[44px] items-center justify-center gap-[0.45rem] rounded-lg border border-[#9aabba] bg-white px-4 py-[0.68rem] text-[0.88rem] font-semibold text-navy transition hover:bg-slate-50"
              >
                <i className="fa-solid fa-arrow-right-long text-[0.74rem]" />
                ไปหน้ารายงานผลการคุ้มครอง
              </Link>
            </div>
            {(caseItem.monthlyReports || []).length === 0 ? (
              <div className="text-muted italic">ยังไม่มีรายงานประจำงวด</div>
            ) : (
              (caseItem.monthlyReports || []).map((r) => (
                <div key={r.id} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex justify-between font-semibold text-slate-800">
                    <span>งวด {thaiMonthName(r.period)}</span>
                    <span className="text-[0.8rem] text-muted">{r.submittedAt}</span>
                  </div>
                  <div className="text-slate-600 mt-0.5">{r.summary}</div>
                  <div className="text-[0.8rem] text-muted mt-0.5">
                    ผู้รายงาน: {r.submittedBy} · เหตุสำคัญ {r.incidentCount} ครั้ง
                  </div>
                  {/* WIT1006 / WIT1007 — ลงนามที่รายการแบบฟอร์ม คบ.13 ในแฟ้ม ที่นี่แสดงสถานะอย่างเดียว */}
                  <div className="text-[0.8rem] mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                    <span className={r.officerSignedAt ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                      {r.officerSignedAt ? `✓ เจ้าหน้าที่ลงนาม (${r.officerSignedBy})` : 'รอเจ้าหน้าที่ลงนาม'}
                    </span>
                    <span className={r.witnessSignedAt ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                      {r.witnessSignedAt ? `✓ พยานรับรอง (${r.witnessSignedBy})` : 'รอพยานลงนามรับรอง'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-2">
            <div className="font-bold text-navy">เหตุการณ์สำคัญระหว่างคุ้มครอง</div>
            {(caseItem.importantEvents || []).length === 0 ? (
              <div className="text-muted italic">ยังไม่มีเหตุการณ์สำคัญ</div>
            ) : (
              (caseItem.importantEvents || []).map((e) => (
                <div key={e.id} className="rounded-lg border border-rose-100 bg-rose-50/40 p-2.5">
                  <div className="flex justify-between font-semibold text-rose-900">
                    <span>{e.title}</span>
                    <span className="text-[0.8rem] text-muted">{e.date}</span>
                  </div>
                  <div className="text-slate-700 mt-0.5">{e.detail}</div>
                  <div className="text-[0.8rem] text-muted mt-0.5">รายงานโดย {e.reporter}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {slaStarted && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          {(isProtection || isOfficer) && (
            <>
              <Button
                type="button"
                onClick={() => togglePanel('report')}
                variant="secondary"
                size="md"
              >
                <i className="fa-solid fa-file-waveform" />
                ส่งรายงาน คบ.13
              </Button>
              <Button
                type="button"
                onClick={() => togglePanel('event')}
                variant="secondary"
                size="md"
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                <i className="fa-solid fa-triangle-exclamation" />
                รายงานเหตุสำคัญ
              </Button>
            </>
          )}

          {isOfficer && !pendingExtension && (
            <Button
              type="button"
              onClick={() => togglePanel('extension')}
              variant="secondary"
              size="md"
            >
              <i className="fa-solid fa-clock-rotate-left" />
              ขอขยายเวลา (คบ.14)
            </Button>
          )}

          {isOfficer && !termination && (
            <Button
              type="button"
              onClick={() => togglePanel('termination')}
              variant="secondary"
              size="md"
            >
              <i className="fa-solid fa-circle-stop" />
              ขอยุติการคุ้มครอง (คบ.7)
            </Button>
          )}

          {isOfficer && !caseItem.transferRequest && (
            <Button
              type="button"
              onClick={() => togglePanel('transfer')}
              variant="secondary"
              size="md"
            >
              <i className="fa-solid fa-right-left" />
              ส่งต่อหน่วยงานภายนอก (คบ.12)
            </Button>
          )}

          {(isOfficer || isProtection) && !withdrawal && (
            <Button
              type="button"
              onClick={() => togglePanel('withdrawal')}
              variant="secondary"
              size="md"
              className="border-amber-300 text-amber-800 hover:bg-amber-50"
            >
              <i className="fa-solid fa-person-walking-arrow-right" />
              พยานขอถอนตัว
            </Button>
          )}
        </div>
      )}

      {/* Panels */}
      {panel === 'report' && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-navy">รายงานผลการปฏิบัติงานประจำงวด {thaiMonthName(period)}</div>
          <textarea
            rows={3}
            value={reportSummary}
            onChange={(e) => setReportSummary(e.target.value)}
            placeholder="สรุปผลการปฏิบัติงานคุ้มครองในรอบเดือน..."
            className="ws-input w-full"
          />
          <div className="flex items-end justify-between gap-2">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">จำนวนเหตุสำคัญในงวด</label>
              <input
                type="number"
                min={0}
                value={reportIncidents}
                onChange={(e) => setReportIncidents(Number(e.target.value))}
                className="ws-input w-24"
              />
            </div>
            <Button
              type="button"
              onClick={() => {
                if (!reportSummary.trim()) return showToast('กรุณาระบุสรุปผลการปฏิบัติงาน')
                addMonthlyReport(caseItem.no, period, reportSummary, reportIncidents, caseItem.owner)
                showToast('ส่งรายงานผลประจำเดือน (คบ.13) เรียบร้อยแล้ว')
                setReportSummary('')
                done()
              }}
              variant="primary"
              size="md"
            >
              ส่งรายงานงวดนี้
            </Button>
          </div>
        </div>
      )}

      {panel === 'event' && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-rose-900">บันทึกเหตุการณ์สำคัญระหว่างการคุ้มครอง</div>
          <input
            value={eventTitle}
            onChange={(e) => setEventTitle(e.target.value)}
            placeholder="หัวข้อเหตุการณ์ เช่น พบบุคคลต้องสงสัยเฝ้าสังเกตการณ์"
            className="ws-input w-full"
          />
          <textarea
            rows={3}
            value={eventDetail}
            onChange={(e) => setEventDetail(e.target.value)}
            placeholder="รายละเอียดและการดำเนินการของชุดคุ้มครอง..."
            className="ws-input w-full"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                if (!eventTitle.trim()) return showToast('กรุณาระบุหัวข้อเหตุการณ์')
                addImportantEvent(caseItem.no, eventTitle, eventDetail, caseItem.owner)
                showToast('บันทึกเหตุการณ์สำคัญแล้ว')
                setEventTitle('')
                setEventDetail('')
                done()
              }}
              variant="danger"
              size="md"
            >
              บันทึกเหตุการณ์
            </Button>
          </div>
        </div>
      )}

      {panel === 'extension' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-blue-900">คบ.14 ขอขยายระยะเวลาการคุ้มครองพยาน</div>
          <p className="text-blue-800">
            ยื่นเสนอตรงไปยังเลขาธิการคณะกรรมการ ป.ป.ท. เพื่อลงนามอนุมัติโดยตรง (ไม่ต้องผ่าน ผอ.สำนัก/กอง)
          </p>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">ระยะเวลาที่ขอขยาย (สูงสุด {PROTECTION_MAX_DAYS} วัน)</label>
            <select
              value={extDays}
              onChange={(e) => setExtDays(Number(e.target.value))}
              className="ws-input"
            >
              {PROTECTION_DURATION_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {d} วัน
                </option>
              ))}
            </select>
          </div>
          <textarea
            rows={3}
            value={extReason}
            onChange={(e) => setExtReason(e.target.value)}
            placeholder="เหตุผล: ภัยคุกคามพยานยังไม่หมดไป..."
            className="ws-input w-full"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                if (!extReason.trim()) return showToast('กรุณาระบุเหตุผลในการขอขยายเวลา')
                requestExtension(caseItem.no, extDays, extReason)
                showToast('ยื่นคำขอขยายระยะเวลาถึงเลขาธิการ ป.ป.ท. แล้ว')
                setExtReason('')
                done()
              }}
              variant="primary"
              size="md"
            >
              ยื่นเสนอเลขาธิการ ป.ป.ท.
            </Button>
          </div>
        </div>
      )}

      {panel === 'termination' && (
        <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-navy">คบ.7 คำร้องขอยุติการคุ้มครองพยาน</div>
          <select
            value={termReason}
            onChange={(e) => setTermReason(e.target.value)}
            className="ws-input w-full"
          >
            {TERMINATION_REASONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                requestTermination(caseItem.no, termReason)
                showToast('เสนอ คบ.7 ให้เลขาธิการ ป.ป.ท. ลงนามสั่งยุติแล้ว')
                done()
              }}
              variant="primary"
              size="md"
            >
              เสนอเลขาธิการฯ ลงนามยุติ
            </Button>
          </div>
        </div>
      )}

      {panel === 'transfer' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-blue-900">คบ.12 ส่งต่อหน่วยงานภายนอก</div>
          <select
            value={transferAgency}
            onChange={(e) => setTransferAgency(e.target.value)}
            className="ws-input w-full"
          >
            {EXTERNAL_TRANSFER_AGENCIES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <textarea
            rows={3}
            value={transferReason}
            onChange={(e) => setTransferReason(e.target.value)}
            className="ws-input w-full"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                requestTransfer(caseItem.no, transferAgency, transferReason)
                showToast('จัดทำ คบ.12 ส่งต่อหน่วยงานภายนอกแล้ว')
                done()
              }}
              variant="primary"
              size="md"
            >
              จัดทำหนังสือส่งต่อ
            </Button>
          </div>
        </div>
      )}

      {panel === 'withdrawal' && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/60 p-4 space-y-2 text-[0.8rem]">
          <div className="font-bold text-amber-900">บันทึกคำร้องขอถอนตัวของพยาน (บันทึกในรูปแบบ คบ.3)</div>
          <p className="text-amber-800">
            เสนอชี้แจงและส่งต่อตามลำดับขั้นให้ผู้บังคับบัญชาชั้นต้นและ ผอ.สำนัก/กอง อนุมัติการถอนตัว
          </p>
          <textarea
            rows={3}
            value={withdrawReason}
            onChange={(e) => setWithdrawReason(e.target.value)}
            placeholder="เหตุผลของพยาน เช่น ไม่ต้องการให้จำกัดสิทธิ์ส่วนบุคคลเพิ่มขึ้น..."
            className="ws-input w-full"
          />
          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                if (!withdrawReason.trim()) return showToast('กรุณาระบุเหตุผลการถอนตัว')
                requestWithdrawal(caseItem.no, withdrawReason)
                showToast('บันทึกคำร้องขอถอนตัวและส่งตามลำดับขั้นแล้ว')
                setWithdrawReason('')
                done()
              }}
              variant="primary"
              size="md"
            >
              บันทึกและเสนอตามลำดับขั้น
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
