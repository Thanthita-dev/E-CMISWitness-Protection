import React from 'react'

interface PageHeaderProps {
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
  /** ข้อความ kicker สีทองเหนือหัวเรื่อง (.ws-kicker) — หน้ารายการของ ก4/ก5 ใช้แทน breadcrumb */
  eyebrow?: React.ReactNode
  /** breadcrumb เหนือหัวเรื่อง (เลือกใช้อย่างใดอย่างหนึ่งกับ eyebrow ตามหน้า) */
  breadcrumb?: React.ReactNode
}

/** หัวเรื่องหน้า (.ws-page-head): breadcrumb/eyebrow → h1 → คำอธิบาย และปุ่มงานหลักด้านขวา */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, description, actions, eyebrow, breadcrumb }) => {
  return (
    <header className="mb-4 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb}
        {eyebrow && <p className="ws-kicker">{eyebrow}</p>}
        <h1 className="my-[0.15rem] text-[clamp(1.55rem,2.4vw,2.25rem)] font-bold leading-tight text-navy">{title}</h1>
        {description && <p className="mt-1 text-[1rem] leading-relaxed text-muted">{description}</p>}
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2.5 sm:justify-end">{actions}</div>}
    </header>
  )
}
