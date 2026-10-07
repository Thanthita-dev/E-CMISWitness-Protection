import React from 'react'
import { Link, Outlet, useRouterState } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { canAccessRoute } from '../../lib/permissions'
import { ROLE_NAMES } from '../../lib/constants'

/**
 * กันการเข้าถึงเส้นทางที่ไม่ตรงกับบทบาท — ครอบคลุมกรณีพิมพ์ URL ตรง
 * ไม่ redirect อัตโนมัติ เพื่อให้ผู้ใช้เห็นชัดว่าถูกปฏิเสธเพราะบทบาทใด
 */
export const RouteGuard: React.FC = () => {
  const currentRole = useAuthStore((state) => state.currentRole)
  const pathname = useRouterState({ select: (s) => s.location.pathname })

  if (canAccessRoute(currentRole, pathname)) {
    return <Outlet />
  }

  return (
    <div className="mx-auto max-w-lg ws-card p-8 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
        <i className="fa-solid fa-lock text-xl" />
      </div>
      <h2 className="text-base font-bold text-navy-deep">ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-slate-600">
        บทบาท <strong>{ROLE_NAMES[currentRole]}</strong> ไม่มีหน้าที่ในหน้า{' '}
        <code className="rounded bg-white px-1.5 py-0.5 text-xs text-slate-700">{pathname}</code>
        <br />
        หากต้องการเข้าถึง กรุณาสลับบทบาทที่แถบด้านบนขวา
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link
          to="/queue/$role"
          params={{ role: currentRole }}
          className="flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.9375rem] font-semibold text-white transition hover:bg-blue"
        >
          <i className="fa-solid fa-inbox" />
          ไปที่คิวงานของฉัน
        </Link>
        <Link
          to="/registry"
          className="flex min-h-[44px] items-center gap-2 rounded-lg border border-[#9aabba] bg-white px-4 py-2.5 text-[0.9375rem] font-semibold text-navy transition hover:bg-slate-50"
        >
          <i className="fa-solid fa-clipboard-list" />
          ทะเบียนคำร้อง
        </Link>
      </div>
    </div>
  )
}
