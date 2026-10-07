import React from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { TERMINATION_TRIGGERS } from '../../lib/constants'
import { Kb15ReviewActions } from './Kb15ReviewActions'

interface Kb15ReviewModalProps {
  caseItem: CaseItem
  open: boolean
  onClose: () => void
}

/**
 * WIT1131-WIT1134 — ผู้บังคับบัญชาตรวจ คบ.15 จากแถวแบบฟอร์มในแฟ้ม
 *
 * เห็นชอบ = เสนอผู้มีอำนาจแล้วเด้งไปแท็บ 11D ต่อทันที
 * ส่งคืน  = เก็บฉบับเดิมไว้ เจ้าหน้าที่แก้เป็นเวอร์ชันใหม่โดยไม่แก้ทับ (WIT1133)
 *
 * เปิดจากแถวแบบฟอร์มในหน้าแฟ้ม (route อื่นจาก /termination/$caseNo) จึงยังต้องเป็น modal
 * แต่ตรรกะการตัดสินใจใช้ร่วมกับ Kb15Section ผ่าน Kb15ReviewActions
 */
export const Kb15ReviewModal: React.FC<Kb15ReviewModalProps> = ({ caseItem, open, onClose }) => {
  const navigate = useNavigate()

  if (!open) return null

  const kb15 = caseItem.kb15
  const trigger = caseItem.terminationTrigger

  const handleDone = (endorsed: boolean) => {
    onClose()
    if (endorsed) {
      navigate({ to: '/termination/$caseNo', params: { caseNo: caseItem.no } })
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(4,17,36,.52)] p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col ws-card overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line bg-soft px-5 py-3.5">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-navy-deep">
              <i className="fa-solid fa-clipboard-check text-blue" />
              <span>ตรวจ คบ.15 · รายงานการให้ความคุ้มครองสิ้นสุด</span>
            </div>
            <p className="mt-0.5 text-[0.8rem] text-muted">
              {caseItem.no} · {caseItem.person} — ตรวจเหตุผลและเอกสารประกอบ
            </p>
          </div>
          <Button onClick={onClose} aria-label="ปิด" className="rounded-lg p-1 text-muted hover:bg-slate-200 text-[0.8rem]">
            <i className="fa-solid fa-xmark text-sm" />
          </Button>
        </div>

        <div className="space-y-3 overflow-y-auto p-5">
          {/* ---------- WIT1130 — กฎที่ต้องเห็นตลอดเวลา ---------- */}
          <div className="ws-callout text-[0.85rem] leading-relaxed">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            <strong>ข้อควรทราบ:</strong> เห็นชอบ คบ.15 ยังไม่ทำให้การคุ้มครองสิ้นสุด ต้องรอคำสั่ง คบ.16 ที่ลงนามและถึงวันที่มีผล
          </div>

          {!kb15 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-[0.8rem] text-muted">
              ยังไม่มี คบ.15 ที่เสนอเข้ามาในแฟ้มนี้
            </div>
          ) : (
            <>
              <div className="space-y-1 rounded-lg border border-line bg-soft p-3 text-[0.8rem] text-slate-700">
                <div>
                  <strong>คบ.15 ฉบับที่ {kb15.version}</strong> · จัดทำโดย {kb15.createdBy} เมื่อ {kb15.createdAt}
                </div>
                <div>
                  <strong>เหตุเริ่มยุติ:</strong>{' '}
                  {TERMINATION_TRIGGERS.find((t) => t.value === kb15.trigger)?.label || kb15.trigger}
                  {kb15.triggerRef ? ` · อ้างอิง ${kb15.triggerRef}` : ''}
                </div>
                {(kb15.triggerDocumentName || trigger?.documentName) && (
                  <div className="text-muted">
                    <i className="fa-solid fa-paperclip mr-1" />
                    {kb15.triggerDocumentName || trigger?.documentName}
                  </div>
                )}
                {(kb15.previousVersions || []).length > 0 && (
                  <div className="text-muted">
                    เก็บฉบับเดิมไว้ {kb15.previousVersions?.length} ฉบับ — ไม่แก้ทับ
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-slate-200 p-3 text-[0.8rem] leading-relaxed text-slate-700">
                <span className="block font-bold text-slate-600">เหตุแห่งการยุติ</span>
                <p className="mt-1">{kb15.summary}</p>
                {kb15.evidenceNote && (
                  <>
                    <span className="mt-2 block font-bold text-slate-600">สรุปผลและหลักฐานประกอบ</span>
                    <p className="mt-1 whitespace-pre-line">{kb15.evidenceNote}</p>
                  </>
                )}
              </div>

              {kb15.status === 'submitted' && (
                <Kb15ReviewActions caseItem={caseItem} onDone={handleDone} className="space-y-2" />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
