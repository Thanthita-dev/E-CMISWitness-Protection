import { Button } from "../common/Button"
import React, { useState } from 'react'
import { CaseItem } from '../../types/case'
import { MAIN_CASE_NOT_FOUND_REASONS, MAIN_CASE_OPTIONS } from '../../lib/constants'
import { useCaseStore } from '../../store/useCaseStore'
import { showToast, showConfirmAlert } from '../../lib/swal'
import { ECMIS_USER_DIRECTORY } from '../../lib/constants'
import { canLinkMainCase, isCaseClosed } from '../../lib/permissions'
import { useAuthStore } from '../../store/useAuthStore'

interface MainCaseLinkCardProps {
  caseItem: CaseItem
}

export const MainCaseLinkCard: React.FC<MainCaseLinkCardProps> = ({ caseItem }) => {
  const { linkMainCase, unlinkMainCase, markMainCaseNotFound } = useCaseStore()
  const { currentRole, currentOfficerUserId } = useAuthStore()
  /** ผู้เชื่อมโยงได้คือเจ้าของสำนวนที่ได้รับมอบหมาย หรือเจ้าหน้าที่ที่รับคำร้องเอง — คนอื่นดูอย่างเดียว */
  const canLink = canLinkMainCase(currentRole, caseItem, currentOfficerUserId)
  const actorName = ECMIS_USER_DIRECTORY.find((u) => u.id === currentOfficerUserId)?.name
  const [selectedCaseId, setSelectedCaseId] = useState(MAIN_CASE_OPTIONS[0].id)
  const [relationNote, setRelationNote] = useState('ภัยคุกคามเกิดจากการให้ถ้อยคำเป็นพยานในสำนวนคดีหลักนี้')
  const [searchQuery, setSearchQuery] = useState('')
  /** WIT0215 — ต้องเลือกเหตุผลที่เชื่อมโยงไม่ได้ก่อน จึงจะบันทึกสถานะ "ไม่พบคดี" ได้ */
  const [notFoundReason, setNotFoundReason] = useState('')

  const isLinked = Boolean(caseItem.linkedMainCaseId)
  const isNotFound = Boolean(caseItem.mainCaseNotFound)
  /** WIT1148 — แฟ้มปิดงานคุ้มครองแล้ว: ดูคดีหลักที่เชื่อมโยงไว้ได้ แต่แก้ไข/ยกเลิก/เชื่อมโยงใหม่ไม่ได้ */
  const closed = isCaseClosed(caseItem)

  const filteredOptions = MAIN_CASE_OPTIONS.filter(
    (opt) =>
      opt.no.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.accused.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleConfirmLink = () => {
    linkMainCase(caseItem.no, selectedCaseId, relationNote, actorName)
    showToast('เชื่อมโยงคดีหลักและประเมินภัยเรียบร้อยแล้ว')
  }

  const handleNotFound = () => {
    if (!notFoundReason) {
      showToast('กรุณาเลือกเหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ก่อน', 'error')
      return
    }
    showConfirmAlert({
      icon: 'warning',
      title: 'ยืนยันระบุสถานะ "ไม่พบคดี"?',
      text: `เหตุผล: ${notFoundReason} — ระบบจะบันทึกเหตุผลไว้ในแฟ้มและรับเรื่องต่อ เสนอ ผอ.สำนัก/กอง มอบหมายตามปกติ ระเบียบห้ามปัดตกคำร้องด้วยเหตุนี้`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันไม่พบคดี',
      cancelButtonText: 'ค้นหาต่อ',
    }).then((res) => {
      if (res.isConfirmed) {
        markMainCaseNotFound(caseItem.no, notFoundReason, actorName)
        showToast('บันทึกเหตุผลและสถานะ "ไม่พบคดี" แล้ว — คำร้องยังเดินต่อตามปกติ')
      }
    })
  }

  const handleUnlink = () => {
    showConfirmAlert({
      icon: 'warning',
      title: 'ยืนยันยกเลิกการเชื่อมโยงคดีหลัก?',
      text: 'การยกเลิกจะทำให้ข้อมูลคดีหลักและผลประเมินความสอดคล้องถูกนำออกจากแฟ้ม',
      confirmButtonText: 'ยืนยันยกเลิก',
      cancelButtonText: 'ปิด',
    }).then((res) => {
      if (res.isConfirmed) {
        unlinkMainCase(caseItem.no)
        showToast('ยกเลิกการเชื่อมโยงแล้ว')
      }
    })
  }

  return (
    <section className="ws-card p-5 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-700 font-bold">
            <i className="fa-solid fa-link text-sm" />
          </div>
          <div>
            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">คดีหลักและการประเมินภัย (Main Case Linkage)</h2>
            <p className="text-[0.8rem] text-muted">เชื่อมโยงเลขสำนวนของ กบค. / PCMS เพื่อยืนยันความเกี่ยวข้อง</p>
          </div>
        </div>

        {isLinked && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-[0.8rem] font-semibold text-success border border-emerald-200">
            <i className="fa-solid fa-circle-check text-[0.74rem]" />
            เชื่อมโยงแล้ว
          </span>
        )}
      </div>

      {isNotFound && !isLinked && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-rose-900">
            <i className="fa-solid fa-circle-xmark" />
            ไม่พบคดีหลักในระบบ (กิจกรรมที่ 4 / 5)
          </div>
          <p className="text-[0.88rem] text-rose-800 leading-relaxed">
            บันทึกเหตุผลไว้แล้วและรับเรื่องต่อตามระเบียบ — ติดตามเชื่อมโยงเลขสำนวนหลักภายหลังได้จากการ์ดนี้
          </p>
          {caseItem.mainCaseNotFoundReason && (
            <div
              data-testid="main-case-not-found-reason"
              className="rounded-lg bg-white p-2.5 border border-rose-200/70 text-[0.8rem] space-y-0.5"
            >
              <div className="text-muted font-semibold">เหตุผลที่เชื่อมโยงไม่ได้:</div>
              <div className="text-ink">{caseItem.mainCaseNotFoundReason}</div>
            </div>
          )}
        </div>
      )}

      {isLinked ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-bold text-emerald-900 flex items-center gap-2">
                <span>{caseItem.mainCaseNo}</span>
                <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[0.8rem] font-semibold text-emerald-900">
                  ตรงกัน {caseItem.mainCaseScore || '100%'}
                </span>
              </div>
              <p className="text-[0.8rem] text-emerald-800 mt-1 font-medium">{caseItem.mainCaseTitle}</p>
            </div>
            {!closed && canLink && (
              <Button
                type="button"
                onClick={handleUnlink}
                variant="secondary"
                size="md"
                className="border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                แก้ไข / ยกเลิกเชื่อมโยง
              </Button>
            )}
          </div>

          <div className="rounded-lg bg-white p-3 border border-emerald-200/60 text-[0.8rem] space-y-1">
            <div className="text-muted font-semibold">เหตุผลความเกี่ยวพัน:</div>
            <div className="text-ink">{caseItem.mainCaseRelation || 'พยานเป็นผู้ให้ถ้อยคำในสำนวนคดีหลัก'}</div>
          </div>
        </div>
      ) : closed ? (
        <p data-testid="main-case-link-locked" className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.8rem] text-slate-600">
          <i className="fa-solid fa-lock mr-1.5" />
          แฟ้มปิดงานคุ้มครองแล้ว — เชื่อมโยง/แก้ไขคดีหลักไม่ได้
        </p>
      ) : !canLink ? (
        <p data-testid="main-case-link-readonly" className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.8rem] text-slate-600">
          <i className="fa-solid fa-circle-info mr-1.5" />
          {isNotFound
            ? 'เจ้าของสำนวนที่ได้รับมอบหมายติดตามเชื่อมโยงเลขสำนวนหลักภายหลัง'
            : 'ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมาย หรือเจ้าหน้าที่ที่รับคำร้องเอง เป็นผู้เชื่อมโยง'}
        </p>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">
              ค้นหาเลขสำนวน กบค. / ชื่อผู้ถูกกล่าวหา / ชื่อคดี
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="เช่น กบค. 001/2569 หรือชื่อโครงการ..."
                className="ws-input w-full text-ink"
              />
            </div>
          </div>

          {/* Options list */}
          <div className="space-y-2">
            {filteredOptions.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-start gap-3 rounded-xl border p-3.5 cursor-pointer transition ${
                  selectedCaseId === opt.id
                    ? 'border-blue-500 bg-blue-50/60 ring-2 ring-blue-500/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <input
                  type="radio"
                  name="mainCaseSelect"
                  checked={selectedCaseId === opt.id}
                  onChange={() => setSelectedCaseId(opt.id)}
                  className="mt-1 text-blue focus:ring-blue"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <strong className="text-[0.8rem] font-semibold text-navy">{opt.no}</strong>
                    <span className="rounded bg-emerald-100 px-2 py-0.5 text-[0.8rem] font-semibold text-emerald-800">
                      ตรงกัน {opt.matchScore}%
                    </span>
                  </div>
                  <div className="text-[0.8rem] text-slate-700 font-medium mt-0.5">{opt.title}</div>
                  <div className="text-[0.8rem] text-muted mt-0.5">
                    ผู้ถูกกล่าวหา: {opt.accused} | เจ้าของสำนวน: {opt.leadOfficer} ({opt.agency})
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div>
            <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เหตุผลความเกี่ยวพัน *</label>
            <textarea
              rows={2}
              value={relationNote}
              onChange={(e) => setRelationNote(e.target.value)}
              className="ws-input w-full text-ink"
              placeholder="ระบุเหตุผลความเกี่ยวพันระหว่างพยานกับสำนวนคดีหลัก..."
            />
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/40 p-3 space-y-1.5">
            <label className="block text-[0.8rem] font-semibold text-rose-900" htmlFor="main-case-not-found-reason-select">
              เหตุผลที่เชื่อมโยงเลขสำนวนหลักไม่ได้ * <span className="font-normal">(บังคับเลือกก่อนกด "ค้นไม่พบ")</span>
            </label>
            <select
              id="main-case-not-found-reason-select"
              data-testid="main-case-not-found-reason-select"
              value={notFoundReason}
              onChange={(e) => setNotFoundReason(e.target.value)}
              className="ws-input w-full text-ink"
            >
              <option value="">— เลือกเหตุผล —</option>
              {MAIN_CASE_NOT_FOUND_REASONS.map((reason) => (
                <option key={reason} value={reason}>
                  {reason}
                </option>
              ))}
            </select>
            <p className="text-[0.8rem] text-rose-800">
              บันทึกเหตุผลแล้วคำร้องยังเดินต่อตามปกติ ระเบียบห้ามปัดตกคำร้องเพราะยังไม่มีเลขสำนวนหลัก
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Button
              type="button"
              onClick={handleNotFound}
              data-testid="main-case-not-found-button"
              variant="secondary"
              size="md"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              <i className="fa-solid fa-magnifying-glass-minus" />
              ค้นไม่พบ — ระบุสถานะ "ไม่พบคดี"
            </Button>
            <Button
              type="button"
              onClick={handleConfirmLink}
              variant="primary"
              size="md"
            >
              <i className="fa-solid fa-check" />
              ยืนยันเชื่อมโยงคดี
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}
