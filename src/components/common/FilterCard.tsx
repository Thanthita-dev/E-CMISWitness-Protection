import React from 'react'

interface FilterCardProps {
  /** ช่องกรอง — ใช้ <div className="ws-field"><label htmlFor>…</label><control/></div> ต่อหนึ่งช่อง */
  children: React.ReactNode
  /** ปุ่มล้างตัวกรอง/ค้นหา วางเป็นช่องท้ายกริด ชิดล่าง */
  actions?: React.ReactNode
  className?: string
}

/** การ์ดตัวกรอง (.ws-filters + .ws-filter-grid): label อยู่เหนือ control ทุกช่อง, ลงคอลัมน์เดียวที่ ≤720px */
export const FilterCard: React.FC<FilterCardProps> = ({ children, actions, className = '' }) => (
  <section className={`ws-card mb-4 min-w-0 p-4 ${className}`.trim()}>
    <div className="ws-filter-grid">
      {children}
      {actions && <div className="ws-filter-actions">{actions}</div>}
    </div>
  </section>
)
