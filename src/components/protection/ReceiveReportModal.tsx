import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem, MonthlyReport } from '../../types/case'
import { METHOD_LABELS } from '../../lib/episode'
import { RISK_LEVELS } from '../../lib/constants'
import { thaiMonthName } from '../../lib/utils'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { useCaseStore } from '../../store/useCaseStore'
import { compareKb13Methods } from '../../lib/kb13'

interface ReceiveReportModalProps {
  caseItem: CaseItem
  round: MonthlyReport
  open: boolean
  onClose: () => void
}

/**
 * WIT1008 — รับ คบ.13 ที่ลงนามแล้วและตรวจผลปฏิบัติเทียบวิธีที่อนุมัติ
 * WIT1009 — บันทึกสถานะล่าสุด ระดับความเสี่ยง ปัญหา และข้อเสนอรอบถัดไป (ทำต่อในโมดัลเดียวกันหลังตรวจรับแล้ว)
 *
 * เปิดจากปุ่ม "ตรวจรับรายงาน" ที่แถวรอบล่าสุดใน "รอบรายงานที่ผ่านมา" (รอบที่กำลังดำเนินการ)
 * แทนที่จะแปะการ์ดไว้กลางหน้าตลอด เพราะสองขั้นนี้ใช้ครั้งเดียวต่อรอบหลังลงนามครบสองช่อง
 */
export const ReceiveReportModal: React.FC<ReceiveReportModalProps> = ({ caseItem, round, open, onClose }) => {
  const { receiveKb13Round, recordKb13Status, lockKb13Round } = useCaseStore()
  const fullySigned = Boolean(round.officerSignedAt && round.witnessSignedAt)
  const approved = caseItem.approvedMethods || []
  /** เทียบเฉพาะวิธีที่อนุมัติและเริ่มปฏิบัติจริงแล้ว — วิธีที่อนุมัติแต่ยังไม่ถึงคิวเริ่ม (pending/preparing) ไม่ถือว่าผิดปกติ */
  const startedApproved = approved.filter((m) => {
    const track = caseItem.methodTracks?.find((t) => t.method === m)
    return !track || track.status === 'active' || track.status === 'ended' || Boolean(track.startedAt)
  })
  const methodMismatch = compareKb13Methods(startedApproved, round.methods)

  const [riskLevel, setRiskLevel] = useState<CaseItem['risk']>(round.riskLevel || caseItem.risk)
  const [issues, setIssues] = useState(round.issues || '')
  const [nextProposal, setNextProposal] = useState(round.nextProposal || '')
  /** ประเด็นความไม่สอดคล้องที่ต้องบันทึกก่อนตรวจรับได้ เมื่อวิธีที่รายงานไม่ตรงกับวิธีที่ได้รับอนุมัติ (WIT1008) */
  const [mismatchIssue, setMismatchIssue] = useState(round.issues || '')

  if (!open) return null

  const statusRecorded = Boolean(round.nextProposal)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col ws-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-deep">
              <i className="fa-solid fa-inbox text-blue" />
              <span>ตรวจรับรายงานและบันทึกสถานะ</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              เทียบผลที่รายงานกับวิธีที่ได้รับอนุมัติ แล้วบันทึกสถานะล่าสุด
            </p>
          </div>
          <Button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted hover:bg-slate-200 text-[0.8rem]">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="space-y-4 overflow-y-auto p-5">
          {/* ---------- WIT1008 — รับรายงานและตรวจผลปฏิบัติ ---------- */}
          <section className="space-y-2">
            <strong className="block text-[0.8rem] text-navy-deep">รับรายงานและตรวจผลปฏิบัติ</strong>
            <p className="text-[0.8rem] text-slate-600">
              วิธีที่ได้รับอนุมัติ: {approved.length > 0 ? approved.map((m) => METHOD_LABELS[m]).join(' · ') : '-'}
            </p>
            <p className="text-[0.8rem] text-slate-600">
              วิธีที่รายงานว่าปฏิบัติจริง:{' '}
              {round.methods?.length ? round.methods.map((m) => METHOD_LABELS[m]).join(' · ') : '-'}
            </p>

            {round.reviewedAt ? (
              <p className="text-[0.8rem] font-semibold text-emerald-700">
                <i className="fa-solid fa-check mr-1.5" />
                ตรวจรับแล้วโดย {round.reviewedBy} — {round.reviewedAt}
              </p>
            ) : (
              <>
                {!methodMismatch.matches && (
                  <div className="space-y-2 rounded-xl border border-rose-300 bg-rose-50/80 p-3">
                    <p className="text-[0.8rem] font-semibold leading-relaxed text-rose-900">
                      <i className="fa-solid fa-triangle-exclamation mr-1.5" />
                      ผลปฏิบัติไม่สอดคล้องกับวิธีที่ได้รับอนุมัติ — ไม่ตรงตามที่อนุมัติ
                    </p>
                    <ul className="space-y-1 text-[0.8rem] leading-relaxed text-rose-800">
                      {methodMismatch.extra.map((m) => (
                        <li key={`extra-${m}`}>
                          <i className="fa-solid fa-circle-exclamation mr-1.5" />
                          ปฏิบัติ{METHOD_LABELS[m]} ซึ่งไม่ได้รับอนุมัติ
                        </li>
                      ))}
                      {methodMismatch.missing.map((m) => (
                        <li key={`missing-${m}`}>
                          <i className="fa-solid fa-circle-exclamation mr-1.5" />
                          ได้รับอนุมัติ{METHOD_LABELS[m]} แต่ไม่ได้ปฏิบัติ/ไม่ได้รายงานในรอบนี้
                        </li>
                      ))}
                    </ul>
                    <label className="block">
                      <span className="block text-[0.8rem] font-bold text-rose-900 mb-1">
                        บันทึกประเด็น/เหตุสำคัญเพื่อเสนอทบทวนหรือขออนุมัติเปลี่ยนวิธี (จำเป็น)
                      </span>
                      <textarea
                        rows={2}
                        value={mismatchIssue}
                        onChange={(e) => setMismatchIssue(e.target.value)}
                        className="ws-input border w-full border-rose-300 focus:border-rose-500"
                      />
                    </label>
                  </div>
                )}
                <Button
                  type="button"
                  disabled={!fullySigned || (!methodMismatch.matches && !mismatchIssue.trim())}
                  onClick={() => {
                    receiveKb13Round(
                      caseItem.no,
                      round.id,
                      undefined,
                      !methodMismatch.matches ? mismatchIssue.trim() : undefined
                    )
                    setIssues((prev) => prev || mismatchIssue.trim())
                    showToast('รับ คบ.13 ที่ลงนามแล้วและตรวจผลปฏิบัติแล้ว')
                  }}
                  className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className="fa-solid fa-inbox mr-1.5" />
                  {fullySigned ? 'รับรายงานและตรวจผล' : 'รอลงนามครบทั้งสองช่องก่อน'}
                </Button>
              </>
            )}
          </section>

          {/* ---------- WIT1009 — บันทึกสถานะล่าสุด ---------- */}
          <section className="space-y-2 border-t border-slate-100 pt-4">
            <strong className="block text-[0.8rem] text-navy-deep">บันทึกสถานะล่าสุด</strong>

            {!round.reviewedAt ? (
              <p className="text-[0.8rem] text-muted">ตรวจรับรายงานก่อนจึงจะบันทึกสถานะได้</p>
            ) : statusRecorded ? (
              <p className="text-[0.8rem] font-semibold text-emerald-700">
                <i className="fa-solid fa-check mr-1.5" />
                บันทึกสถานะล่าสุดแล้ว — ความเสี่ยง {round.riskLevel || '-'}
              </p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <span className="block text-[0.8rem] font-bold text-slate-700">ระดับความเสี่ยงล่าสุด</span>
                  <div className="flex flex-wrap gap-2">
                    {RISK_LEVELS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRiskLevel(r)}
                        className={`rounded-lg border px-3 py-1.5 text-[0.8rem] font-semibold transition ${
                          riskLevel === r
                            ? 'border-blue bg-blue/10 text-blue-dark'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block">
                  <span className="ws-label">ปัญหา/อุปสรรคที่พบ</span>
                  <textarea
                    rows={2}
                    value={issues}
                    onChange={(e) => setIssues(e.target.value)}
                    className="ws-input w-full"
                  />
                </label>

                <label className="block">
                  <span className="ws-label">ข้อเสนอสำหรับรอบถัดไป</span>
                  <textarea
                    rows={2}
                    value={nextProposal}
                    onChange={(e) => setNextProposal(e.target.value)}
                    className="ws-input w-full"
                  />
                </label>

                <Button
                  type="button"
                  disabled={!nextProposal}
                  onClick={() => {
                    recordKb13Status(caseItem.no, round.id, { riskLevel, issues, nextProposal })
                    showToast('บันทึกสถานะล่าสุดของรอบรายงานแล้ว')
                  }}
                  className="rounded-lg bg-blue px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-blue-dark transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <i className="fa-solid fa-clipboard-check mr-1.5" />
                  บันทึกสถานะล่าสุด
                </Button>
              </>
            )}
          </section>

          {/* ---------- WIT1010 — ปิดรอบรายงาน ---------- */}
          <section className="space-y-2 border-t border-slate-100 pt-4">
            <strong className="block text-[0.8rem] text-navy-deep">ปิดรอบรายงาน</strong>

            {!statusRecorded ? (
              <p className="text-[0.8rem] text-muted">บันทึกสถานะล่าสุดก่อนจึงจะปิดรอบได้</p>
            ) : (
              <>
                <p className="text-[0.8rem] text-muted">
                  ล็อกแล้วรอบนี้จะแก้ไขไม่ได้อีก และระบบจะเปิดให้เลือกขั้นตอนถัดไป (กำหนดรอบถัดไปหรือส่งทบทวน)
                </p>
                <Button
                  type="button"
                  onClick={() => {
                    showConfirmAlert({
                      icon: 'question',
                      title: 'ยืนยันล็อกเป็นรอบรายงานใหม่?',
                      text: `เก็บ คบ.13 งวด ${thaiMonthName(round.period)} เป็นรอบรายงานใหม่ ล็อกฉบับลงนาม และแก้ไขไม่ได้อีก`,
                      showCancelButton: true,
                      confirmButtonText: 'ยืนยัน',
                      cancelButtonText: 'ยกเลิก',
                    }).then((res) => {
                      if (!res.isConfirmed) return
                      lockKb13Round(caseItem.no, round.id)
                      showToast('ล็อกรอบรายงาน คบ.13 แล้ว')
                      onClose()
                    })
                  }}
                  className="rounded-lg bg-emerald-600 px-5 py-2 text-[0.8rem] font-bold text-white hover:bg-emerald-700 transition"
                >
                  <i className="fa-solid fa-lock mr-1.5" />
                  ล็อกเป็นรอบรายงานใหม่
                </Button>
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}
