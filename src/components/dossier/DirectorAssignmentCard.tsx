import React, { useMemo, useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { ECMIS_USER_DIRECTORY } from '../../lib/constants'
import { showToast } from '../../lib/swal'

interface DirectorAssignmentCardProps {
  caseItem: CaseItem
}

/**
 * ขั้นตอนที่ 2 — การมอบหมายและจัดสรรผู้รับผิดชอบ
 * ผอ.สำนัก/กอง เห็นแฟ้มที่ธุรการส่งมา แล้วจัดสรรเจ้าของสำนวน
 * (โดยทั่วไปมอบให้เจ้าหน้าที่ที่เป็นเจ้าของสำนวนคดีเดิมที่เชื่อมโยงไว้)
 *
 * กรณีเชื่อมโยงเลขสำนวนหลักไม่ได้ ยัง "ต้องมอบหมายต่อ" ห้ามปัดตกด้วยเหตุนี้
 * (flow WIT0215 / NOTE03_CASE) — บันทึกเหตุผลไว้แล้วเดินเรื่องตามปกติ
 */
export const DirectorAssignmentCard: React.FC<DirectorAssignmentCardProps> = ({ caseItem }) => {
  const { currentRole } = useAuthStore()
  const { assignOfficer } = useCaseStore()

  const officers = useMemo(
    () => ECMIS_USER_DIRECTORY.filter((u) => (u.roles.includes('officer') || u.roles.includes('case_owner')) && u.active),
    []
  )

  /**
   * เจ้าของสำนวนคดีเดิมที่บันทึกไว้ตอนเชื่อมโยงคดีหลัก — ระบบแนะนำให้มอบหมายคนนี้เพื่อความต่อเนื่องของคดี
   * เป็นเพียงคำแนะนำ ผอ.สำนัก/กอง ยังมอบหมายให้ผู้อื่นได้ และค่าที่บันทึกไว้ในแฟ้มไม่เปลี่ยนตามการมอบหมาย
   * อาจไม่พบผู้ใช้ที่ตรงกันเมื่อเจ้าของสำนวนคดีหลักอยู่นอกทะเบียนผู้ใช้งานคุ้มครองพยาน
   */
  const suggestedOfficer = useMemo(() => {
    if (caseItem.mainCaseLeadOfficerUserId) {
      return officers.find((o) => o.id === caseItem.mainCaseLeadOfficerUserId) || null
    }
    if (caseItem.mainCaseLeadOfficer) {
      return officers.find((o) => o.name === caseItem.mainCaseLeadOfficer) || null
    }
    return null
  }, [caseItem.mainCaseLeadOfficerUserId, caseItem.mainCaseLeadOfficer, officers])

  const [officerId, setOfficerId] = useState(suggestedOfficer?.id || officers[0]?.id || '')
  const [isEditingOfficer, setIsEditingOfficer] = useState(false)

  const isDirector = currentRole === 'director' || currentRole === 'admin'
  const isAssigned = Boolean(caseItem.assignedOfficerUserId)

  const handleAssign = () => {
    if (!officerId) {
      showToast('กรุณาเลือกเจ้าหน้าที่เจ้าของสำนวน')
      return
    }
    const wasEditing = isEditingOfficer
    assignOfficer(caseItem.no, officerId)
    setIsEditingOfficer(false)
    showToast(wasEditing ? 'เปลี่ยนเจ้าของสำนวนเรียบร้อยแล้ว' : 'มอบหมายเจ้าของสำนวนเรียบร้อยแล้ว')
  }

  return (
    <section className="ws-card border-l-4 border-l-gold p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-amber-100 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gold-dark text-white">
            <i className="fa-solid fa-user-check text-base" />
          </div>
          <div>
            <h2 className="text-[1.1rem] font-bold leading-snug text-navy">ขั้นที่ 2 · มอบหมายและจัดสรรผู้รับผิดชอบ</h2>
            <p className="text-[0.8rem] text-muted">
              ผอ.สำนัก/กอง จัดสรรเจ้าของสำนวน — ไม่พบเลขคดีหลักก็ต้องมอบหมายต่อ ห้ามปัดตก
            </p>
          </div>
        </div>

        <span
          className={`rounded-full px-3 py-1 text-[0.8rem] font-semibold ${
            isAssigned ? 'bg-success-soft text-success' : 'bg-gold-soft text-gold-dark'
          }`}
        >
          {isAssigned ? `มอบหมายแล้ว: ${caseItem.assignedOfficer}` : 'รอมอบหมายเจ้าของสำนวน'}
        </span>
      </div>

      {caseItem.mainCaseNotFound && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 text-[0.88rem] text-rose-800 leading-relaxed">
          <strong className="block text-rose-900 mb-0.5">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            ยังไม่ได้เชื่อมโยงเลขสำนวนหลัก
          </strong>
          คำร้องนี้ยังไม่มีเลขสำนวนคดีจากกิจกรรมที่ 4/5 — ให้บันทึกเหตุผลไว้แล้ว
          <strong> มอบหมายเจ้าของสำนวนต่อตามปกติ ห้ามปัดตกคำร้องด้วยเหตุนี้</strong>{' '}
          แล้วติดตามเชื่อมโยงเลขสำนวนภายหลัง
        </div>
      )}

      {!caseItem.mainCaseNotFound && !caseItem.linkedMainCaseId && !isAssigned && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-[0.88rem] text-slate-700 leading-relaxed">
          <i className="fa-solid fa-circle-info mr-1.5" />
          ยังไม่ได้เชื่อมโยงคดีหลัก — เจ้าของสำนวนที่ได้รับมอบหมายจะเป็นผู้เชื่อมโยงเลขสำนวนจากกิจกรรมที่ 4/5
        </div>
      )}

      {isAssigned && !isEditingOfficer ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-[0.8rem] space-y-2">
          <div className="font-bold text-emerald-900">เจ้าของสำนวน: {caseItem.assignedOfficer}</div>
          <div className="text-emerald-800">
            มอบหมายเมื่อ {caseItem.assignedAt} โดย {caseItem.assignedBy}
          </div>
          {isDirector && (
            <div className="pt-1">
              <Button
                type="button"
                onClick={() => {
                  setOfficerId(caseItem.assignedOfficerUserId || suggestedOfficer?.id || officers[0]?.id || '')
                  setIsEditingOfficer(true)
                }}
                variant="secondary"
                size="md"
              >
                <i className="fa-solid fa-rotate" />
                เปลี่ยนเจ้าของสำนวน
              </Button>
            </div>
          )}
        </div>
      ) : isDirector ? (
        <div className="space-y-3">
          {isEditingOfficer && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-[0.8rem] text-amber-900">
              <i className="fa-solid fa-rotate mr-1.5" />
              กำลังเปลี่ยนเจ้าของสำนวนจาก <strong>{caseItem.assignedOfficer}</strong>
            </div>
          )}

          <>
              {suggestedOfficer && !isEditingOfficer && (
                <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-[0.8rem] text-blue-900">
                  <i className="fa-solid fa-lightbulb mr-1.5 text-blue" />
                  ระบบแนะนำ <strong>{suggestedOfficer.name}</strong> — เป็นเจ้าของสำนวนคดีเดิม{' '}
                  {caseItem.mainCaseNo} ที่เชื่อมโยงไว้ เพื่อความต่อเนื่องของคดี
                </div>
              )}

              <div>
                <label className="block text-[0.8rem] font-semibold text-slate-700 mb-1">เลือกเจ้าหน้าที่เจ้าของสำนวน *</label>
                <select
                  value={officerId}
                  onChange={(e) => setOfficerId(e.target.value)}
                  className="ws-input w-full text-ink"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name} — {o.position} ({o.unit})
                      {suggestedOfficer?.id === o.id ? ' · เจ้าของสำนวนคดีเดิม' : ''}
                    </option>
                  ))}
                </select>
              </div>
          </>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-amber-100">
            {isEditingOfficer && (
              <Button
                type="button"
                onClick={() => setIsEditingOfficer(false)}
                variant="secondary"
                size="md"
              >
                <i className="fa-solid fa-xmark" />
                ยกเลิก
              </Button>
            )}

            <Button
              type="button"
              onClick={handleAssign}
              variant="primary"
              size="md"
            >
              <i className="fa-solid fa-user-check" />
              {isEditingOfficer ? 'ยืนยันเปลี่ยนเจ้าของสำนวน' : 'มอบหมายเจ้าของสำนวน'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-[0.8rem] text-muted">
          แฟ้มนี้อยู่ระหว่างรอ ผอ.สำนัก/กอง จัดสรรเจ้าของสำนวน (เข้าสู่ระบบด้วยบทบาท ผอ.สำนัก/กอง เพื่อดำเนินการ)
        </div>
      )}
    </section>
  )
}
