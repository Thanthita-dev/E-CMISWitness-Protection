import React, { useState } from 'react'
import { Button } from '../common/Button'
import { CaseItem } from '../../types/case'
import { useCaseStore } from '../../store/useCaseStore'
import { useAuthStore } from '../../store/useAuthStore'
import { isCaseWorkerRole } from '../../lib/constants'
import { formatThaiDate } from '../../lib/utils'
import { confirmBody, showConfirmAlert, showToast } from '../../lib/swal'

/**
 * Sheet 09B · WIT0921 / WIT0922 — หนังสือแจ้งผลอุทธรณ์ (ไม่มีเลข คบ.)
 *
 * ผังกำหนดสามอย่างที่ต้องเกิดจริงหลังคณะกรรมการมีมติ: จัดทำหนังสือแจ้งผล ·
 * ส่งผ่านระบบสารบรรณเดิม · เก็บหลักฐานการรับ แล้วจึงถือว่าขั้นอุทธรณ์ปิดสมบูรณ์
 * เดิมระบบบันทึกได้แค่มติ จึงปิดขั้นอุทธรณ์ได้โดยไม่มีร่องรอยว่าแจ้งผลให้พยานแล้ว
 *
 * ใช้กับทั้งแขนงยืนคำสั่งเดิมและแขนงเปลี่ยนคำสั่ง เพราะผังให้แจ้งผลทั้งสองทาง
 */
export const AppealNoticeCard: React.FC<{ caseItem: CaseItem }> = ({ caseItem }) => {
  const { recordAppealNotice } = useCaseStore()
  const { currentRole } = useAuthStore()

  const resolution = caseItem.appealResolution
  const [form, setForm] = useState({
    documentName: '',
    registryNo: '',
    sentAt: new Date().toISOString().slice(0, 10),
    deliveredAt: new Date().toISOString().slice(0, 10),
    recipient: caseItem.person,
    ackDocument: '',
  })

  if (!resolution) return null

  const recorded = Boolean(resolution.noticeRecordedAt)
  const uphold = resolution.outcome === 'uphold'
  const canRecord = isCaseWorkerRole(currentRole)

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }))

  const handleSubmit = () => {
    if (!form.documentName.trim() || !form.registryNo.trim() || !form.recipient.trim()) {
      showToast('กรุณาระบุชื่อหนังสือ เลขทะเบียนส่ง และผู้รับหนังสือ', 'warning')
      return
    }
    showConfirmAlert({
      icon: 'question',
      title: 'บันทึกหนังสือแจ้งผลอุทธรณ์และหลักฐานการรับ?',
      html: confirmBody(
        `${uphold ? 'ยืนคำสั่งเดิม' : 'เปลี่ยนคำสั่ง'} — หนังสือแจ้งผลอุทธรณ์ส่งผ่านระบบสารบรรณเดิม (ไม่มีเลข คบ.)`,
        [
          ['มติคณะกรรมการ', `${resolution.resolutionNo} · ${uphold ? 'ยืนคำสั่งเดิม' : 'เปลี่ยนแปลงคำสั่ง'}`],
          ['ชื่อหนังสือแจ้งผล', form.documentName.trim()],
          ['เลขทะเบียนส่ง (สารบรรณ)', form.registryNo.trim()],
          ['วันที่ส่ง / วันที่พยานได้รับ', `${formatThaiDate(form.sentAt)} → ${formatThaiDate(form.deliveredAt)}`],
          ['ผู้รับหนังสือ', form.recipient.trim()],
          ['หลักฐานการรับ', form.ackDocument.trim() || '-'],
        ],
        uphold
          ? 'แฟ้มมี<strong>ร่องรอยว่าแจ้งผลถึงพยานแล้ว</strong> และ<strong>ปิดขั้นอุทธรณ์</strong>สมบูรณ์ — คำวินิจฉัยของคณะกรรมการเป็นที่สุด'
          : 'แฟ้มมี<strong>ร่องรอยว่าแจ้งผลถึงพยานแล้ว</strong> แล้วเดินต่อไป<strong>จัดทำ คบ.6 รุ่นใหม่ตามมติอุทธรณ์</strong> — ไม่สร้าง คบ.1 ใหม่'
      ),
      showCancelButton: true,
      confirmButtonText: 'ยืนยันบันทึกหนังสือแจ้งผล',
      cancelButtonText: 'ยกเลิก',
    }).then((res) => {
      if (!res.isConfirmed) return
      recordAppealNotice(caseItem.no, {
        documentName: form.documentName.trim(),
        registryNo: form.registryNo.trim(),
        sentAt: form.sentAt,
        deliveredAt: form.deliveredAt,
        recipient: form.recipient.trim(),
        ackDocument: form.ackDocument.trim() || undefined,
      })
      showToast('บันทึกหนังสือแจ้งผลอุทธรณ์และหลักฐานการรับแล้ว')
    })
  }

  return (
    <div className="ws-card p-5 space-y-3" data-testid="appeal-notice-card">
      <h3 className="ws-section-title !mb-0 border-b border-line pb-2">
        หนังสือแจ้งผลอุทธรณ์ (ไม่มีเลข คบ.) · {uphold ? 'ยืนคำสั่งเดิม' : 'เปลี่ยนคำสั่ง'}
      </h3>

      {recorded ? (
        <div className="rounded-lg border border-success/30 bg-success-soft p-3 text-[0.88rem] text-success-dark" data-testid="appeal-notice-done">
          <strong className="block">
            <i className="fa-solid fa-circle-check mr-1.5" />
            แจ้งผลอุทธรณ์ให้พยานแล้ว — {resolution.noticeDocumentName}
          </strong>
          <div className="mt-1">
            ทะเบียนส่งที่ {resolution.noticeRegistryNo} · ส่ง {formatThaiDate(resolution.noticeSentAt)} · พยานได้รับ{' '}
            {formatThaiDate(resolution.noticeDeliveredAt)}
          </div>
          <div>
            ผู้รับ: {resolution.noticeRecipient}
            {resolution.noticeAckDocument ? ` · หลักฐานการรับ: ${resolution.noticeAckDocument}` : ''}
          </div>
          <div className="text-[0.8rem]">
            บันทึกโดย {resolution.noticeRecordedBy} · {resolution.noticeRecordedAt}
          </div>
        </div>
      ) : canRecord ? (
        <div className="space-y-2" data-testid="appeal-notice-form">
          <p className="text-[0.88rem] text-muted">
            จัดทำหนังสือแจ้งผล ส่งผ่านระบบสารบรรณเดิม แล้วเก็บหลักฐานการรับของพยาน — ครบสามอย่างจึงถือว่าขั้นอุทธรณ์ปิดสมบูรณ์
          </p>
          <div className="ws-grid-2">
            <label className="ws-field">
              <span className="ws-label">ชื่อหนังสือแจ้งผลอุทธรณ์ *</span>
              <input
                value={form.documentName}
                onChange={set('documentName')}
                placeholder={`หนังสือแจ้งผลอุทธรณ์_${caseItem.person}.pdf`}
                data-testid="appeal-notice-document"
                className="ws-input"
              />
            </label>
            <label className="ws-field">
              <span className="ws-label">เลขทะเบียนส่ง (สารบรรณเดิม) *</span>
              <input
                value={form.registryNo}
                onChange={set('registryNo')}
                placeholder="ปปท 0007/1234"
                data-testid="appeal-notice-registry"
                className="ws-input"
              />
            </label>
            <label className="ws-field">
              <span className="ws-label">วันที่ส่งออก</span>
              <input
                type="date"
                value={form.sentAt}
                onChange={set('sentAt')}
                data-testid="appeal-notice-sent"
                className="ws-input"
              />
            </label>
            <label className="ws-field">
              <span className="ws-label">วันที่พยานได้รับ</span>
              <input
                type="date"
                value={form.deliveredAt}
                onChange={set('deliveredAt')}
                data-testid="appeal-notice-delivered"
                className="ws-input"
              />
            </label>
            <label className="ws-field">
              <span className="ws-label">ผู้รับหนังสือ *</span>
              <input
                value={form.recipient}
                onChange={set('recipient')}
                data-testid="appeal-notice-recipient"
                className="ws-input"
              />
            </label>
            <label className="ws-field">
              <span className="ws-label">หลักฐานการรับ</span>
              <input
                value={form.ackDocument}
                onChange={set('ackDocument')}
                placeholder="ใบตอบรับไปรษณีย์ (EMS) / ใบรับเอกสาร"
                data-testid="appeal-notice-ack"
                className="ws-input"
              />
            </label>
          </div>
          <div className="ws-actions justify-end">
            <Button
              type="button"
              onClick={handleSubmit}
              data-testid="appeal-notice-submit"
              variant="primary"
              size="md"
            >
              บันทึกหนังสือแจ้งผลและหลักฐานการรับ
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-[0.88rem] text-muted">
          รอเจ้าหน้าที่ผู้รับผิดชอบจัดทำหนังสือแจ้งผลอุทธรณ์ ส่งผ่านสารบรรณ และเก็บหลักฐานการรับ
        </p>
      )}
    </div>
  )
}
