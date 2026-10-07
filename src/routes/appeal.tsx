import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { StatCard, StatGrid } from '../components/common/StatCard'
import { Badge } from '../components/common/Badge'
import { useCaseStore } from '../store/useCaseStore'
import { AppealFolderStage } from '../types/case'
import { daysUntil, formatThaiDate } from '../lib/utils'
import { APPEAL_WINDOW_DAYS } from '../lib/constants'

/** WIT0914-WIT0919 — ขั้นของแฟ้มอุทธรณ์ที่แสดงในรายการ */
const FOLDER_STAGE_LABEL: Record<AppealFolderStage, string> = {
  received: 'รอตรวจความครบถ้วนและกรอบ 30 วัน',
  late_pending: 'รอ ผบช.ชั้นต้นรับเรื่องที่ยื่นเกินกำหนด',
  officer_opinion: 'รอความเห็นเจ้าหน้าที่ผู้รับผิดชอบ',
  supervisor: 'รอ ผบช.ชั้นต้นให้ความเห็น',
  director: 'รอ ผอ.สำนัก/กองลงนามเสนอ',
  deputy: 'รอรองเลขาธิการฯ กลั่นกรอง',
  secretary: 'รอเลขาธิการฯ ส่งเสนอคณะกรรมการ',
  agenda: 'รอบรรจุวาระ / คณะกรรมการวินิจฉัย',
  resolved: 'คณะกรรมการวินิจฉัยแล้ว',
}

export const Route = createFileRoute('/appeal')({
  component: AppealPage,
})

function AppealPage() {
  const cases = useCaseStore((state) => state.cases)
  const appealCases = cases.filter((c) => c.stage === 'appeal' || c.no.startsWith('AP-'))
  const noticeCases = cases.filter((c) => !c.appealFiledAt && !c.nonApprovalClosedAt &&
    (c.activity7State === 'rejected' && (c.kb10Signed || c.resultNotices?.[10]?.original || c.deliveredAt) || c.kb17?.deliveredAt))
  const rows = [...appealCases, ...noticeCases.filter((c) => !appealCases.some((a) => a.no === c.no))]
  const inReview = appealCases.filter((c) => c.activity7State !== 'committee' || !c.appealFiledAt).length
  const atCommittee = appealCases.filter((c) => c.activity7State === 'committee').length
  const decided = appealCases.filter((c) => c.stage !== 'appeal').length
  /**
   * WIT0914 — คำอุทธรณ์ที่ยื่นเกินกรอบ 30 วัน ผังห้ามปัดตกอัตโนมัติ
   * จึงต้องเห็นได้จากรายการ พร้อมบอกว่ายังค้างอยู่ขั้นไหนของการรับเรื่อง
   */
  const lateAppeals = appealCases.filter(
    (c) => (c.appealFolder?.lateDays || 0) > 0 && c.appealFolder?.stage !== 'resolved'
  )

  /**
   * คดีที่ยังอยู่ในกรอบอุทธรณ์ 30 วัน (นับจากวันที่พยานได้รับหนังสือจริง)
   * ครอบคลุมทั้งอุทธรณ์คำสั่งไม่อนุมัติ (คบ.10) และอุทธรณ์คำสั่งยุติ (คบ.17 — WIT1146)
   * ตัวนับนี้วัด "สิทธิที่ยังเปิดอยู่" จึงไม่รวมเคสที่พ้นกำหนด — คนละเรื่องกับการปัดตกคำอุทธรณ์ที่ยื่นช้า
   */
  const appealWindowOpen = cases.filter((c) => {
    const eligible = c.activity7State === 'rejected' || Boolean(c.kb17?.deliveredAt)
    if (!eligible || !c.appealDueAt || c.appealFiledAt) return false
    /** WIT0909 — ปิดเรื่องไม่อนุมัติแล้ว สิทธิ/ช่องรับอุทธรณ์ปิดตาม */
    if (c.nonApprovalClosedAt) return false
    const left = daysUntil(c.appealDueAt)
    return left !== null && left >= 0
  })

  /** WIT0909 — เรื่องที่ปิดกระบวนการไม่อนุมัติแล้ว ไม่เปิดรับคำร้องอุทธรณ์ */
  const closedNonApproval = cases.filter((c) => c.nonApprovalClosedAt && !c.appealFiledAt)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · อุทธรณ์"
        title="ระบบการอุทธรณ์คำสั่งการคุ้มครองพยาน"
        description="รับคำอุทธรณ์คำสั่งไม่อนุมัติ (คบ.10) และคำสั่งยุติ (คบ.17) ตรวจสอบระยะเวลาอุทธรณ์ (ภายใน 30 วัน) แล้วเสนอคณะกรรมการ ป.ป.ท. วินิจฉัยชี้ขาด"
      />

      {/* KPI Stats */}
      <StatGrid>
        <StatCard label="เรื่องอุทธรณ์ทั้งหมด" value={appealCases.length} subtext="ปีงบประมาณ 2569" />
        <StatCard label="อยู่ระหว่างพิจารณา" value={inReview} subtext="ตรวจคำอุทธรณ์" variant="warning" />
        <StatCard label="ส่งคณะกรรมการแล้ว" value={atCommittee} subtext="รอมติชี้ขาด" />
        <StatCard
          label={`เปิดสิทธิอุทธรณ์ (${APPEAL_WINDOW_DAYS} วัน)`}
          value={appealWindowOpen.length}
          subtext={decided > 0 ? `วินิจฉัยเสร็จ ${decided} เรื่อง` : 'ยังไม่ยื่นอุทธรณ์'}
          variant="success"
        />
      </StatGrid>

      {closedNonApproval.length > 0 && (
        <div className="ws-callout space-y-1.5" data-testid="appeal-closed-notice">
          <div className="font-bold text-ink">
            <i className="fa-solid fa-lock mr-1.5" />
            ปิดเรื่องแล้ว — ไม่สามารถรับคำร้องอุทธรณ์ได้ ({closedNonApproval.length} เรื่อง)
          </div>
          <ul className="text-[0.88rem] text-ink space-y-0.5">
            {closedNonApproval.map((c) => (
              <li key={c.no}>
                <Link to="/dossier/$caseNo" params={{ caseNo: c.no }} className="font-bold text-navy hover:underline">
                  {c.no} · {c.person}
                </Link>{' '}
                — ปิดเมื่อ {c.nonApprovalClosedAt}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* WIT0914 — กลุ่มที่ยื่นเกินกรอบ 30 วัน: ต้องบันทึกเหตุผลและเสนอ ห้ามปัดตกอัตโนมัติ */}
      {lateAppeals.length > 0 && (
        <div className="rounded-lg border border-danger/30 border-l-4 border-l-danger bg-danger-soft px-[0.9rem] py-[0.8rem] space-y-2" data-testid="appeal-late-group">
          <div className="font-bold text-danger-dark">
            <i className="fa-solid fa-triangle-exclamation mr-1.5" />
            เกินกรอบ {APPEAL_WINDOW_DAYS} วัน — ต้องบันทึกเหตุผลความล่าช้าก่อนเสนอ ({lateAppeals.length} เรื่อง)
          </div>
          <p className="text-[0.88rem] leading-relaxed text-danger-dark">
            ระบบไม่ปัดตกคำอุทธรณ์ที่ยื่นช้าโดยอัตโนมัติ — ให้บันทึกเหตุผล จัดทำแฟ้มเสนอตามลำดับชั้น
            แล้วให้คณะกรรมการ ป.ป.ท. เป็นผู้ตัดสินว่าจะรับพิจารณาหรือไม่
          </p>
          <ul className="space-y-1.5">
            {lateAppeals.map((c) => (
              <li key={c.no} className="rounded-lg border border-line bg-white p-3 min-w-0">
                <Link to="/appeal-folder/$caseNo" params={{ caseNo: c.no }} className="font-bold text-danger-dark hover:underline">
                  {c.no} · {c.person}
                </Link>
                <div className="text-[0.8rem] text-muted">
                  ยื่นช้ากว่ากำหนด {c.appealFolder?.lateDays} วัน ·{' '}
                  {c.appealFolder ? FOLDER_STAGE_LABEL[c.appealFolder.stage] : '-'}
                </div>
                {c.appealFolder?.lateReason && (
                  <div className="text-[0.8rem] text-muted">เหตุผลความล่าช้า: {c.appealFolder.lateReason}</div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Appeal Cases List */}
      <div className="ws-card overflow-hidden">
        <div className="ws-section">
          <h2 className="!mb-0">รายการงานอุทธรณ์</h2>
        </div>

        <div className="ws-table-wrap">
          <table className="ws-table">
            <thead>
              <tr>
                <th>เลขคำร้อง / อุทธรณ์</th>
                <th>ผู้อุทธรณ์ (พยาน)</th>
                <th>คำสั่งเดิมที่อุทธรณ์</th>
                <th>SLA อุทธรณ์ (30 วัน)</th>
                <th>นิติกรผู้รับผิดชอบ</th>
                <th className="text-right">การดำเนินการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-muted">
                    ไม่พบคำอุทธรณ์ในระบบ
                  </td>
                </tr>
              ) : (
                rows.map((c) => (
                  <tr key={c.no} className="hover:bg-slate-50/70">
                    <td className="font-bold text-blue">
                      <Link to="/appeal-folder/$caseNo" params={{ caseNo: c.no }}>
                        {c.no}
                      </Link>
                    </td>

                    <td>
                      <strong className="block text-ink">{c.person}</strong>
                      <small className="text-[0.8rem] text-muted">สำนวน: {c.mainCaseNo || 'กบค. 089/2569'}</small>
                    </td>

                    <td>
                      <Badge variant="danger">{c.appealAgainst === 'kb17' || c.kb17?.deliveredAt ? 'คบ.17 คำสั่งยุติ' : 'คบ.10 ไม่อนุมัติ'}</Badge>
                    </td>

                    <td>
                      {(() => {
                        const left = daysUntil(c.appealDueAt)
                        if (!c.deliveredAt || left === null) {
                          return (
                            <Badge variant="default" icon="fa-hourglass-start">
                              ยังไม่เริ่มนับ (รอวันที่รับหนังสือ)
                            </Badge>
                          )
                        }
                        return left >= 0 ? (
                          <>
                            <Badge variant="warning" icon="fa-hourglass-half">
                              เหลือ {left} วัน (ภายในกำหนด)
                            </Badge>
                            <div className="text-[0.8rem] text-muted mt-0.5">
                              รับหนังสือ {formatThaiDate(c.deliveredAt)} · ครบ {formatThaiDate(c.appealDueAt)}
                            </div>
                          </>
                        ) : (
                          <Badge variant="danger" icon="fa-circle-xmark">
                            เกินกำหนด {Math.abs(left)} วัน
                          </Badge>
                        )
                      })()}
                    </td>

                    <td>
                      <strong className="block text-ink">{c.owner}</strong>
                      <small className="text-[0.8rem] text-muted">
                        {c.appealFolder ? FOLDER_STAGE_LABEL[c.appealFolder.stage] : c.deliveredAt || c.kb17?.deliveredAt ? 'รอรับคำอุทธรณ์' : 'รอพยานได้รับหนังสือ'}
                      </small>
                    </td>

                    <td className="text-right">
                      <Link
                        to="/appeal-folder/$caseNo"
                        params={{ caseNo: c.no }}
                        className="inline-flex min-h-[38px] items-center gap-[0.45rem] whitespace-nowrap rounded-lg bg-navy px-3 py-1.5 text-[0.85rem] font-semibold text-white transition hover:bg-blue"
                      >
                        <i className="fa-solid fa-folder-open text-xs" aria-hidden="true" />
                        {c.appealFiledAt ? 'เปิดแฟ้มอุทธรณ์' : 'รับคำอุทธรณ์'}
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
