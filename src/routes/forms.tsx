import React from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { PageHeader } from '../components/common/PageHeader'
import { FORMS_CATALOG } from '../lib/constants'
import { canOpenForm } from '../lib/permissions'
import { useAuthStore } from '../store/useAuthStore'

export const Route = createFileRoute('/forms')({
  component: FormsCatalogPage,
})

function FormsCatalogPage() {
  const { currentRole } = useAuthStore()

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="งานคุ้มครองพยาน · แบบฟอร์ม"
        title="แบบฟอร์มคุ้มครองพยาน (คบ.1 - คบ.14)"
        description="รวบรวมแบบฟอร์มราชการตามระเบียบสำนักงาน ป.ป.ท. ว่าด้วยการคุ้มครองพยาน พร้อมระบบกรอกข้อมูลและพิมพ์แบบเอกสาร A4"
      />

      {/* Grid of 14 Forms */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {FORMS_CATALOG.map((f) => (
          <div
            key={f.n}
            className="flex flex-col justify-between ws-card p-5 hover:border-navy hover:shadow-md transition group"
          >
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-14 items-center justify-center rounded-lg bg-blue-100 font-bold text-blue-800 text-xs">
                  {f.code}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  {f.pages ? `${f.pages} หน้า A4` : '1 หน้า'}
                </span>
              </div>

              <h3 className="text-base font-bold text-navy group-hover:text-blue transition leading-snug">
                {f.t}
              </h3>

              <p className="text-sm text-slate-600 leading-relaxed line-clamp-2">
                {f.d}
              </p>
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-end">
              {canOpenForm(currentRole) ? (
                <Link
                  to="/form/$formId"
                  params={{ formId: String(f.n) }}
                  search={{ from: 'forms' }}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-navy px-4 py-2.5 text-[0.9375rem] font-semibold text-white hover:bg-blue transition"
                >
                  <i className="fa-solid fa-pen-to-square text-xs" />
                  เปิดแบบฟอร์ม
                </Link>
              ) : (
                <span
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-slate-100 border border-slate-200 px-4 py-2.5 text-[0.9375rem] font-semibold text-slate-600 cursor-not-allowed"
                  title="ธุรการสำนัก/กองไม่มีสิทธิ์เปิดแบบฟอร์มนี้"
                >
                  <i className="fa-solid fa-pen-to-square text-xs" />
                  เปิดแบบฟอร์ม
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
