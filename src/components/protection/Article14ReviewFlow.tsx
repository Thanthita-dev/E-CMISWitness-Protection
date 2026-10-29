import { ReferralCommitteeCard } from './ReferralCommitteeCard'
import { ensureReferralDocument } from '../../lib/referralDocuments'
import { Link } from '@tanstack/react-router'
import { isRightsReferral, requiresReferralCommittee } from '../../lib/referralDocumentIdentity'
import React, { useState } from 'react'
import { isReviewerFor } from '../../lib/protectionHandoff'
import { Button } from '../common/Button'
import { useCaseStore } from '../../store/useCaseStore'
import { CaseItem } from '../../types/case'
import { sarabanInTransit } from '../../lib/saraban'
import { ARTICLE14_REVIEW_CHAIN, article14Agency } from '../../lib/constants'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'
import { VoiceTextarea } from '../common/VoiceTextarea'

interface Article14ReviewFlowProps {
  caseItem: CaseItem
  role: string
  /** สิทธิ์ลงมือของเจ้าหน้าที่เจ้าของสำนวน — ใช้กับปุ่มส่งให้ผู้บังคับบัญชาชั้นต้น */
  canEdit?: boolean
  /** แสดงเป็นการ์ดท้ายแฟ้ม (มีหัวการ์ด) หรือเป็นส่วนหนึ่งของการ์ดหน้า 08C */
  variant?: 'footer' | 'inline'
}

/** มีอะไรให้แสดงในส่วนลำดับชั้นข้อ 14 ไหม — ใช้ซ่อนการ์ดท้ายแฟ้มเมื่อไม่เกี่ยว */
export const article14ReviewVisible = (caseItem: CaseItem): boolean => {
  const a14 = caseItem.article14
  if (!a14) return false
  if (['proposal_draft', 'committee_pending', 'letter_sent', 'committee_rejected'].includes(a14.step)) return true
  return ARTICLE14_REVIEW_CHAIN.some((c) => c.step === a14.step)
}

/**
 * ส่งต่อหน่วยงานอื่นตามข้อ 14 — ส่ง/พิจารณาตามลำดับชั้น
 * เจ้าหน้าที่ → ผบช.ชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ → ส่งคืนเจ้าหน้าที่บันทึกการนำส่ง/การได้รับหนังสือ
 * เสนอครั้งแรกและ Revision: เจ้าหน้าที่จัดทำหนังสือแจ้งกรมฯ ในแฟ้มก่อน แล้วจึงกดส่งให้ผู้บังคับบัญชาชั้นต้นเอง
 */
export const Article14ReviewFlow: React.FC<Article14ReviewFlowProps> = ({ caseItem, role, canEdit = true, variant = 'inline' }) => {
  const openArticle14 = useCaseStore((s) => s.openArticle14)
  const submitArticle14 = useCaseStore((s) => s.submitArticle14)
  const reviewArticle14 = useCaseStore((s) => s.reviewArticle14)
  const [note, setNote] = useState('')
  const a14 = caseItem.article14
  if (!a14 || !article14ReviewVisible(caseItem)) return null

  const currentIndex = ARTICLE14_REVIEW_CHAIN.findIndex((c) => c.step === a14.step)
  const current = ARTICLE14_REVIEW_CHAIN[currentIndex]
  const next = ARTICLE14_REVIEW_CHAIN[currentIndex + 1]
  const isOfficer = ['officer', 'case_owner', 'got_officer', 'admin'].includes(role)
  /** ชุดนำส่งค้างที่ธุรการ — ผู้รับปลายทางยังดำเนินการไม่ได้ */
  const inTransit = sarabanInTransit(caseItem, 'article14')
  const canSubmit = !inTransit && a14.step === 'proposal_draft' && isOfficer && canEdit
  const canReview = Boolean(!inTransit && current && (current.level === 'supervisor' || current.level === 'director' ? isReviewerFor(role, current.level, caseItem) : current.roles.includes(role)))
  /** เสนอก่อนครบ 6 เดือน — ปลายสายคือส่งคณะกรรมการ ไม่ใช่ส่งหนังสือถึงกรม */
  const early = requiresReferralCommittee(caseItem)
  const endLabel = early ? 'ส่งฝ่ายเลขานุการคณะกรรมการ' : `ส่งคืนเจ้าหน้าที่ดำเนินการส่ง${article14Agency(caseItem).short}`

  const handleSubmit = async () => {
    const res = await showConfirmAlert({
      icon: 'question',
      title: 'ส่งให้ผู้บังคับบัญชาชั้นต้น?',
      html: confirmBody(
        `เรื่องส่งต่อ${article14Agency(caseItem).short} ของแฟ้ม ${caseItem.no}`,
        [
          [`หนังสือแจ้ง${article14Agency(caseItem).short}`, `ฉบับที่ ${a14.letterVersion || '-'}`],
          ['เหตุภัย', a14.threatSummary || '-'],
        ],
        'ผู้บังคับบัญชาชั้นต้น → ผอ.สำนัก/กอง → รองเลขาธิการ → เลขาธิการ'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่ง',
      cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    if (!a14.revisionPreparedAt) {
      openArticle14(caseItem.no, {
        threatSummary: a14.threatSummary,
        riskAssessment: a14.riskAssessment,
        targetAgencyType: a14.targetAgencyType,
      })
    }
    if (isRightsReferral(caseItem)) {
      ensureReferralDocument(caseItem.no, 'chairman-signature')
      ensureReferralDocument(caseItem.no, 'rights-assistance-letter')
    }
    submitArticle14(caseItem.no)
    showToast(`ส่งเรื่องพร้อมหนังสือแจ้ง${article14Agency(caseItem).short} ฉบับที่ ${useCaseStore.getState().getCase(caseItem.no)?.article14?.letterVersion} ให้ผู้บังคับบัญชาชั้นต้นพิจารณาแล้ว`)
  }

  const handleEndorse = async () => {
    if (!current) return
    const res = await showConfirmAlert({
      icon: 'question',
      title: next ? `ยืนยันเห็นชอบและเสนอ${next.label}` : `ยืนยันเห็นชอบส่งต่อ${article14Agency(caseItem).short}`,
      text: next
        ? 'บันทึกความเห็นประกอบและส่งเรื่องขึ้นตามลำดับชั้น'
        : early
          ? `เรื่องนี้ต้องผ่านมติคณะกรรมการ — บันทึกความเห็นและส่งให้ฝ่ายเลขานุการคณะกรรมการพิจารณาก่อนส่ง${article14Agency(caseItem).short}`
          : `บันทึกความเห็นและส่งคืนเจ้าหน้าที่ เพื่อบันทึกการนำส่งหนังสือถึง${article14Agency(caseItem).short}และบันทึกการได้รับหนังสือตอบรับ`,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันเห็นชอบ',
      cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    reviewArticle14(caseItem.no, current.level, true, note.trim() || 'เห็นชอบ')
    setNote('')
    showToast(next ? `บันทึกความเห็นและเสนอ${next.label}แล้ว` : early ? 'เลขาธิการเห็นชอบแล้ว — ส่งเรื่องเข้าคิวฝ่ายเลขานุการคณะกรรมการ' : 'เลขาธิการเห็นชอบแล้ว — ส่งคืนเจ้าหน้าที่ดำเนินการส่งหนังสือถึงกรม')
  }

  const handleReturn = async () => {
    if (!current) return
    if (!note.trim()) {
      showToast('กรุณาระบุเหตุผลที่ส่งคืนแก้ไข')
      return
    }
    const res = await showConfirmAlert({
      icon: 'question',
      title: 'ยืนยันส่งคืนแก้ไข',
      text: note,
      showCancelButton: true,
      confirmButtonText: 'ยืนยันส่งคืน',
      cancelButtonText: 'ยกเลิก',
    })
    if (!res.isConfirmed) return
    reviewArticle14(caseItem.no, current.level, false, note.trim())
    setNote('')
    showToast('ส่งคืนแก้ไขและบันทึก Revision แล้ว')
  }

  const body = (
    <>
      {a14.step === 'committee_pending' && isRightsReferral(caseItem) && <ReferralCommitteeCard caseItem={caseItem} />}
      {variant === 'footer' && a14.step === 'committee_pending' && !isRightsReferral(caseItem) && <Link to="/article14" search={{ caseNo: caseItem.no }}>เปิดเรื่องเสนอคณะกรรมการ / บันทึกมติ</Link>}
      {['secretary', 'admin'].includes(role) && ['secretary_review', 'committee_pending'].includes(a14.step) && isRightsReferral(caseItem) && !a14.secretarySignature && !inTransit && (
        <Link to="/forms" search={{ additional: 'chairman-signature', caseNo: caseItem.no }} className="inline-flex min-h-[44px] items-center rounded-lg border border-line px-4 py-2 font-semibold text-navy">ลงนามบันทึกเสนอประธานกรรมการ</Link>
      )}
      {a14.committeeResolutionNo && <p className="text-sm">มติที่ {a14.committeeResolutionNo} · {a14.committeeApproved ? 'อนุมัติส่งต่อกรมคุ้มครองสิทธิฯ' : 'ไม่อนุมัติส่งต่อ'} · {a14.committeeNote}</p>}
      {inTransit && (
        <p className="text-[0.8rem] text-muted" data-testid="article14-in-transit">
          <i className="fa-solid fa-route mr-1" aria-hidden="true" />
          อยู่ระหว่างธุรการลงทะเบียนนำส่ง — ผู้รับดำเนินการต่อได้เมื่อธุรการลงเลขรับครบ
        </p>
      )}

      {canSubmit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={handleSubmit}
            data-testid="article14-submit-review"
          >
            <i className="fa-solid fa-paper-plane text-xs" aria-hidden="true" />
            ส่งให้ผู้บังคับบัญชาชั้นต้น
          </Button>
        </div>
      )}

      {canReview && current && (
        <div className="space-y-2">
          <label className="block">
            <span className="ws-label mb-1 block">ความเห็นของ{current.label}</span>
            <VoiceTextarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ความเห็นประกอบ / เหตุผลที่ส่งคืนแก้ไข"
              className="ws-input w-full"
            />
          </label>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              data-testid="article14-return-button"
              onClick={handleReturn}
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
            >
              ส่งคืนแก้ไข
            </Button>
            <Button type="button" variant="primary" size="md" data-testid="article14-endorse-button" disabled={current.level === 'secretary' && isRightsReferral(caseItem) && !a14.secretarySignature} onClick={handleEndorse}>
              <i className="fa-solid fa-paper-plane text-xs" aria-hidden="true" />
              {next ? `เห็นชอบ · ส่ง${next.label}` : `เห็นชอบ · ${endLabel}`}
            </Button>
          </div>
        </div>
      )}
    </>
  )

  if (variant === 'inline') {
    return (
      <div className="space-y-3 border-t border-slate-200 pt-3" data-testid="article14-review-flow">
        <div className="text-sm font-bold text-navy">พิจารณาตามลำดับชั้น</div>
        {body}
      </div>
    )
  }

  return (
    <section className="ws-card space-y-4 p-5" data-testid="article14-review-footer">
      <div className="flex items-center gap-2.5 border-b border-line pb-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-soft font-bold text-blue">
          <i className="fa-solid fa-building-columns text-sm" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[1.1rem] font-bold leading-snug text-navy">ส่งต่อ{article14Agency(caseItem).name}</h2>
        </div>
      </div>
      {body}
    </section>
  )
}
