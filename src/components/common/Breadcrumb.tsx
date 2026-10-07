import React from 'react'
import { Link } from '@tanstack/react-router'

interface BreadcrumbProps {
  /** params ใช้กับเส้นทางที่มีพารามิเตอร์ เช่น /protection-review/$caseNo */
  items: Array<{ label: string; to?: string; params?: Record<string, string> }>
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items }) => {
  return (
    <nav aria-label="เส้นทางหน้า" className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5 text-[0.8rem] font-medium text-muted">
      <Link to="/registry" className="hover:text-blue transition">
        กิจกรรมที่ 6 ระบบคุ้มครองพยาน
      </Link>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <i className="fa-solid fa-chevron-right text-[0.65rem] text-slate-400" aria-hidden="true" />
          {item.to ? (
            <Link to={item.to} params={item.params as never} className="hover:text-blue transition">
              {item.label}
            </Link>
          ) : (
            <span className="text-ink font-semibold">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  )
}
