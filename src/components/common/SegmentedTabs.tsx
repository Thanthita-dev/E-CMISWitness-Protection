import React from 'react'

export interface SegmentedTabItem {
  key: string
  label: string
  count?: number
  disabled?: boolean
  /** data-testid ของปุ่มแท็บ (ใช้กับ e2e) */
  testId?: string
  /** id ของปุ่มแท็บ */
  id?: string
  /** id ของ panel ที่แท็บนี้ควบคุม (aria-controls) */
  controls?: string
}

interface SegmentedTabsProps {
  items: SegmentedTabItem[]
  value: string
  onChange: (key: string) => void
  /** ชื่อของกลุ่มแท็บสำหรับโปรแกรมอ่านหน้าจอ */
  ariaLabel?: string
  className?: string
}

/** แถบแท็บเต็มความกว้าง (.admin-queue-tabs): แท็บที่เลือกพื้นน้ำเงิน; ใช้ลูกศรซ้าย/ขวา Home/End เลื่อนแท็บ */
export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({ items, value, onChange, ariaLabel = 'แท็บ', className = '' }) => {
  const refs = React.useRef<Record<string, HTMLButtonElement | null>>({})

  const onKeyDown = (e: React.KeyboardEvent) => {
    const enabled = items.filter((i) => !i.disabled)
    const idx = enabled.findIndex((i) => i.key === value)
    let next: number | null = null
    if (e.key === 'ArrowRight') next = (idx + 1) % enabled.length
    else if (e.key === 'ArrowLeft') next = (idx - 1 + enabled.length) % enabled.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = enabled.length - 1
    if (next === null || !enabled.length) return
    e.preventDefault()
    const target = enabled[next]
    onChange(target.key)
    refs.current[target.key]?.focus()
  }

  return (
    <div role="tablist" aria-label={ariaLabel} className={`ws-tabs ${className}`.trim()} onKeyDown={onKeyDown}>
      {items.map((item) => {
        const selected = item.key === value
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[item.key] = el
            }}
            type="button"
            role="tab"
            id={item.id}
            data-testid={item.testId}
            aria-controls={item.controls}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className="ws-tab"
          >
            {item.label}
            {item.count !== undefined && <span className="ws-tab-count">{item.count}</span>}
          </button>
        )
      })}
    </div>
  )
}
