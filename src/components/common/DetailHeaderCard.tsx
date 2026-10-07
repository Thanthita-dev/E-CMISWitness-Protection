import React from 'react'

interface DetailHeaderCardProps {
  /** บรรทัด kicker สีทอง เช่น "คำร้อง · ส่วนกลาง" */
  kicker?: React.ReactNode
  /** เลขอ้างอิงเป็นหัวเรื่องใหญ่ (h1) */
  refNo: React.ReactNode
  /** ชื่อเรื่อง/สรุปใต้เลขอ้างอิง */
  title?: React.ReactNode
  /** รายการ meta เช่น วันที่ เลขติดตาม */
  meta?: React.ReactNode[]
  /** สถานะ (มุมขวาบน) */
  status?: React.ReactNode
  /** ผู้รับผิดชอบ (ใต้สถานะ) */
  owner?: React.ReactNode
  actions?: React.ReactNode
}

/** การ์ดหัวหน้ารายละเอียด (.ws-case-head): kicker → เลขอ้างอิง → ชื่อเรื่อง → meta; ขวา = สถานะ + ผู้รับผิดชอบ */
export const DetailHeaderCard: React.FC<DetailHeaderCardProps> = ({ kicker, refNo, title, meta, status, owner, actions }) => (
  <section className="ws-card ws-case-head">
    <div className="min-w-0 flex-1">
      {kicker && <p className="ws-kicker">{kicker}</p>}
      <h1 className="my-[0.2rem] break-words text-[1.55rem] font-bold leading-tight text-navy">{refNo}</h1>
      {title && <p className="mb-2 mt-1 break-words text-[0.95rem] font-semibold text-ink">{title}</p>}
      {meta && meta.length > 0 && (
        <div className="ws-case-meta">
          {meta.map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      )}
    </div>
    {(status || owner || actions) && (
      <div className="flex min-w-0 flex-col items-start gap-1.5 sm:items-end sm:text-right">
        {status}
        {owner && <div className="text-[0.8rem] text-muted">{owner}</div>}
        {actions && <div className="ws-actions mt-1 sm:justify-end">{actions}</div>}
      </div>
    )}
  </section>
)
