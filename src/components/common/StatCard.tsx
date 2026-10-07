import React from 'react'

interface StatCardProps {
  label: string
  value: string | number
  /** บรรทัดมุ่งเน้นตัวหนาใต้ตัวเลข (.ws-dc-title) */
  title?: string
  subtext?: string
  variant?: 'default' | 'warning' | 'danger' | 'success' | 'gold'
  onClick?: () => void
  /** การ์ดที่เลือกอยู่: พื้นน้ำเงินเข้ม ขอบทอง ตัวอักษรขาว */
  active?: boolean
}

/** การ์ดสรุปตัวเลข (.ws-dashboard-card): label → ตัวเลข → title → subtext; มี onClick จะเป็นปุ่มกรอง */
export const StatCard: React.FC<StatCardProps> = ({ label, value, title, subtext, variant = 'default', onClick, active }) => {
  const body = (
    <>
      <span className="ws-dc-label">{label}</span>
      <strong className="ws-dc-value">{value}</strong>
      {title && <b className="ws-dc-title">{title}</b>}
      {subtext && <small className="ws-dc-sub">{subtext}</small>}
    </>
  )
  const className = `ws-dashboard-card${active ? ' active' : ''}`
  if (!onClick) {
    return (
      <div className={className} data-variant={variant}>
        {body}
      </div>
    )
  }
  return (
    <button type="button" onClick={onClick} className={className} data-variant={variant} aria-pressed={active ?? false}>
      {body}
    </button>
  )
}

/** กริดการ์ดสรุป (.ws-dashboard): 4 คอลัมน์ → 2 คอลัมน์ ≤1200px → 1 คอลัมน์ ≤720px */
/** จำนวนคอลัมน์ตามจำนวนการ์ด — 5–6 ใบเรียงแถวเดียวบนจอกว้าง แทนการตก 4 + 2 */
export const StatGrid: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  const count = React.Children.toArray(children).filter(Boolean).length
  return (
    <div
      className={`ws-dashboard ${className}`.trim()}
      data-count={count}
      style={{ '--ws-dash-cols': Math.min(Math.max(count, 1), 6) } as React.CSSProperties}
    >
      {children}
    </div>
  )
}
