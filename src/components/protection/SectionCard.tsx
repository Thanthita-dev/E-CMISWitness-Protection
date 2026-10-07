import React from 'react'

/**
 * กรอบการ์ดมาตรฐานของขั้น 11A-11D — เดิมประกาศซ้ำอยู่ใน termination.tsx และ ReviewSection.tsx
 * แยกออกมาเพื่อให้ทุก section ของ 11B/11C/11D หน้าตาเดียวกันโดยไม่ต้องลอกโค้ด
 */
export const SectionCard: React.FC<{
  title: string
  hint?: string
  /** ป้ายมุมขวาบน เช่น รหัสขั้นตอนตามผัง (WIT1114-WIT1116) */
  badge?: React.ReactNode
  children: React.ReactNode
}> = ({ title, hint, badge, children }) => (
  <div className="ws-card p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <h4 className="text-[1.05rem] font-bold text-navy">{title}</h4>
        {hint && <p className="text-[0.8rem] text-muted mt-0.5">{hint}</p>}
      </div>
      {badge && (
        <span className="rounded-full border border-line bg-soft px-2.5 py-1 text-[0.74rem] font-semibold text-muted">
          {badge}
        </span>
      )}
    </div>
    {children}
  </div>
)
