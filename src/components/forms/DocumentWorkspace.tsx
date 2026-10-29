import React, { useId } from 'react'

export type DocumentViewMode = 'document' | 'form'
export const DOCUMENT_MODE_LABELS: Record<DocumentViewMode, string> = { document: 'กรอกบนเอกสาร', form: 'กรอกผ่านแบบฟอร์ม' }

/** หัวหน้าเอกสารแบบกระชับ: ชื่อเอกสาร + เลขแฟ้ม/สถานะในบรรทัดเดียว และปุ่มด้านขวา (แบบเดียวกับหน้าเอกสารงานหมายจับ) */
export const DocumentPageHead: React.FC<{ title: React.ReactNode; meta?: React.ReactNode; status?: React.ReactNode; actions?: React.ReactNode }> = ({ title, meta, status, actions }) => (
  <header className="flex flex-wrap items-center justify-between gap-3">
    <div className="min-w-0">
      <h1 className="m-0 text-[clamp(1.25rem,1.1rem+0.4vw,1.5rem)] font-bold leading-snug text-navy">{title}</h1>
      {(meta || status) && (
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-muted">
          {meta}
          {status}
        </p>
      )}
    </div>
    {actions && <div className="flex flex-none flex-wrap gap-2">{actions}</div>}
  </header>
)

/** ปุ่มเลือกหน้าเอกสาร (หน้า 1 / หน้า 2 / …) ในแถบเครื่องมือ */
export const DocumentPageNav: React.FC<{ total: number; current: number; onChange: (page: number) => void }> = ({ total, current, onChange }) => (
  <nav aria-label="หน้าเอกสาร" className="flex flex-wrap gap-1.5">
    {Array.from({ length: total }, (_, index) => index + 1).map((page) => {
      const active = page === current
      return (
        <button
          key={page}
          type="button"
          aria-current={active ? 'page' : undefined}
          data-testid={`document-page-${page}`}
          onClick={() => onChange(page)}
          className={`flex min-h-[40px] items-center gap-2 rounded-md border px-2.5 py-1.5 text-[0.85rem] transition ${
            active ? 'border-[#9cb6d8] bg-blue-soft font-semibold text-navy' : 'border-transparent text-muted hover:bg-white'
          }`}
        >
          <span className={`grid h-6 w-6 flex-none place-items-center rounded-full border text-[0.75rem] ${active ? 'border-navy bg-navy text-white' : 'border-line'}`}>{page}</span>
          หน้า {page}
        </button>
      )
    })}
  </nav>
)

/** แถบดำเนินการล่างของหน้าเอกสาร — ติดล่างจอแต่อยู่ในลำดับหน้า จึงไม่ทับช่องสุดท้ายของเอกสาร */
export const DocumentActionBar: React.FC<{ back?: React.ReactNode; info?: React.ReactNode; children?: React.ReactNode }> = ({ back, info, children }) => (
  <footer
    aria-label="การดำเนินการกับเอกสาร"
    className="sticky bottom-0 z-[12] mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[#d6e0ea] bg-[#f4f6f8] px-3 py-2.5 shadow-[0_-4px_16px_rgba(20,40,70,0.06)]"
  >
    <div className="flex flex-wrap items-center gap-2">{back}</div>
    {info && <span className="text-[0.8rem] text-muted">{info}</span>}
    <div className="flex flex-wrap items-center gap-2">{children}</div>
  </footer>
)

/**
 * พื้นที่ทำงานเอกสาร — เริ่มที่ “กรอกบนเอกสาร” (กระดาษกึ่งกลางเต็มพื้นที่ทำงาน)
 * ตัวสลับโหมดจุดเดียว: กรอกบนเอกสาร | กรอกผ่านแบบฟอร์ม — ทั้งสองโหมดใช้ร่างชุดเดียวกัน
 * aside = แผงข้างกระดาษในโหมดกรอกบนเอกสาร (ลงนาม บันทึก รวมไฟล์ ทะเบียนสารบรรณ)
 */
export const DocumentWorkspace: React.FC<{
  mode: DocumentViewMode
  onModeChange?: (mode: DocumentViewMode) => void
  /** แบบกรอกด้านซ้ายในโหมดกรอกผ่านแบบฟอร์ม — ไม่ระบุ = ไม่มีตัวสลับโหมด */
  editor?: React.ReactNode
  aside?: React.ReactNode
  nav?: React.ReactNode
  status?: React.ReactNode
  tools?: React.ReactNode
  children: React.ReactNode
}> = ({ mode, onModeChange, editor, aside, nav, status, tools, children }) => {
  const panelId = useId()
  const formMode = mode === 'form' && Boolean(editor)
  return (
    <div className="min-w-0">
      <div role="toolbar" aria-label="เครื่องมือเอกสาร" className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-1.5">
        {nav && <div className="min-w-0 flex-auto">{nav}</div>}
        {editor && onModeChange && (
          <div role="radiogroup" aria-label="รูปแบบการกรอก" className="inline-flex rounded-lg border border-[#aebdca] bg-[#f4f7fa] p-0.5">
            {(['document', 'form'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                aria-controls={panelId}
                data-testid={`document-mode-${value}`}
                onClick={() => onModeChange(value)}
                className={`min-h-[36px] rounded-md px-3 py-1.5 text-[0.88rem] transition ${
                  mode === value ? 'bg-white font-semibold text-navy shadow-[0_1px_3px_rgba(20,40,70,0.18)]' : 'text-[#34465f]'
                }`}
              >
                {DOCUMENT_MODE_LABELS[value]}
              </button>
            ))}
          </div>
        )}
        {status && <span role="status" className="text-[0.8rem] text-muted">{status}</span>}
        {tools && <div className="ml-auto flex flex-wrap gap-2">{tools}</div>}
      </div>

      <div
        id={panelId}
        className={`grid grid-cols-1 items-start gap-4 ${
          formMode ? 'xl:grid-cols-[minmax(0,44fr)_minmax(0,56fr)]' : aside ? 'xl:grid-cols-[minmax(0,1fr)_380px]' : ''
        }`}
      >
        {formMode && <section aria-label="กรอกผ่านแบบฟอร์ม" className="min-w-0 space-y-4">{editor}</section>}
        <section
          aria-label={formMode ? 'ภาพเอกสาร' : 'เอกสาร (กรอกบนเอกสาร)'}
          className={formMode ? 'min-w-0 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto' : 'min-w-0'}
        >
          {children}
        </section>
        {!formMode && aside && <aside aria-label="งานของเอกสาร" className="grid min-w-0 content-start gap-3 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">{aside}</aside>}
      </div>
    </div>
  )
}
