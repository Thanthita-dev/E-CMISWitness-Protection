import React from 'react'
import { Link } from '@tanstack/react-router'

interface BackLinkProps {
  to: string
  /** params ของเส้นทางที่มีพารามิเตอร์ เช่น { caseNo } */
  params?: Record<string, string>
  search?: Record<string, unknown>
  className?: string
  children?: React.ReactNode
}

/** ปุ่มลิงก์ outline "กลับรายการ…" บนสุดของหน้ารายละเอียด — ส่ง to/params/search เหมือน <Link> */
export const BackLink: React.FC<BackLinkProps> = ({ children, className = '', ...props }) => (
  <Link {...(props as { to: "/" })} className={`ws-backlink ${className}`.trim()}>
    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
    {children ?? 'กลับรายการ'}
  </Link>
)
