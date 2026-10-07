import { Button } from "../common/Button"
import React, { useState, useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuthStore } from '../../store/useAuthStore'
import { useCaseStore } from '../../store/useCaseStore'
import { FORMS_CATALOG } from '../../lib/constants'

export const GlobalSearchModal: React.FC = () => {
  const { isGlobalSearchOpen, setGlobalSearchOpen } = useAuthStore()
  const cases = useCaseStore((state) => state.cases)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  // Keyboard shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setGlobalSearchOpen(!isGlobalSearchOpen)
      }
      if (e.key === 'Escape' && isGlobalSearchOpen) {
        setGlobalSearchOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGlobalSearchOpen, setGlobalSearchOpen])

  if (!isGlobalSearchOpen) return null

  const cleanQuery = query.trim().toLowerCase()

  const matchedCases = cases.filter(
    (c) =>
      c.no.toLowerCase().includes(cleanQuery) ||
      c.person.toLowerCase().includes(cleanQuery) ||
      (c.mainCaseNo && c.mainCaseNo.toLowerCase().includes(cleanQuery)) ||
      (c.mainCaseTitle && c.mainCaseTitle.toLowerCase().includes(cleanQuery))
  )

  const matchedForms = FORMS_CATALOG.filter(
    (f) => f.code.toLowerCase().includes(cleanQuery) || f.t.toLowerCase().includes(cleanQuery)
  )

  const handleSelectCase = (caseNo: string) => {
    setGlobalSearchOpen(false)
    setQuery('')
    navigate({ to: `/dossier/${caseNo}` })
  }

  const handleSelectForm = (formNo: number) => {
    setGlobalSearchOpen(false)
    setQuery('')
    navigate({ to: `/form/${formNo}` })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-[rgba(4,17,36,0.52)] p-4 pt-[min(5rem,8vh)]">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ค้นหาทั้งระบบ"
        className="ws-card flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden"
      >
        {/* Search input */}
        <div className="flex items-center border-b border-slate-200 px-4 py-3.5 bg-slate-50">
          <i className="fa-solid fa-magnifying-glass text-slate-400 text-lg mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาเลขคำร้อง (WP-...), ชื่อผู้ขอคุ้มครอง, สำนวนคดีหลัก (กบค...), หรือแบบ คบ...."
            className="min-h-[44px] w-full bg-transparent text-[0.88rem] text-ink placeholder:text-slate-400 focus:outline-none"
            autoFocus
          />
          <Button
            onClick={() => setGlobalSearchOpen(false)}
            className="ml-2 min-h-[44px] rounded-lg bg-[#edf2f6] px-3 text-[0.85rem] font-semibold text-navy hover:bg-slate-200"
          >
            ESC
          </Button>
        </div>

        {/* Results */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
          {/* Cases */}
          <div>
            <div className="mb-2 text-[0.8125rem] font-bold text-navy tracking-wider">
              แฟ้มคำร้อง ({matchedCases.length})
            </div>
            {matchedCases.length === 0 ? (
              <div className="text-[0.8125rem] text-muted py-2">ไม่พบคำร้องที่ตรงกับคำค้น</div>
            ) : (
              <div className="space-y-1.5">
                {matchedCases.map((c) => (
                  <Button
                    key={c.no}
                    onClick={() => handleSelectCase(c.no)}
                    className="flex w-full items-center justify-between rounded-lg border border-slate-200 p-2.5 text-left transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-blue text-[0.8125rem]">{c.no}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                          {c.form}
                        </span>
                        {c.urgent && (
                          <span className="rounded bg-danger-soft px-1.5 py-0.5 text-xs font-bold text-danger">
                            เร่งด่วน
                          </span>
                        )}
                      </div>
                      <div className="text-[0.8125rem] font-semibold text-ink mt-0.5">{c.person}</div>
                      {c.mainCaseNo && (
                        <div className="text-xs text-slate-500">
                          คดีหลัก: {c.mainCaseNo} - {c.mainCaseTitle}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="ws-status">
                        {c.status}
                      </span>
                      <div className="text-xs text-muted mt-1">{c.owner}</div>
                    </div>
                  </Button>
                ))}
              </div>
            )}
          </div>

          {/* Forms */}
          <div>
            <div className="mb-2 text-[0.8125rem] font-bold text-navy tracking-wider">
              แบบฟอร์ม คบ. ({matchedForms.length})
            </div>
            <div className="grid grid-cols-2 gap-2">
              {matchedForms.slice(0, 6).map((f) => (
                <Button
                  key={f.n}
                  onClick={() => handleSelectForm(f.n)}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left hover:border-blue-300 hover:bg-blue-50/50"
                >
                  <span className="rounded bg-blue-soft px-2 py-1 text-xs font-bold text-blue flex-shrink-0">
                    {f.code}
                  </span>
                  <span className="text-[0.8125rem] font-medium text-slate-700">{f.t}</span>
                </Button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
