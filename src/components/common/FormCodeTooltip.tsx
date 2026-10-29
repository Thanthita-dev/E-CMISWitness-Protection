import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FORMS_CATALOG } from '../../lib/constants'
import { cn } from '../../lib/utils'

const TOOLTIP_W = 320
const GAP = 8
const EDGE = 8

interface FormCodeTooltipProps {
  /** เลขแบบใน FORMS_CATALOG (n) */
  formNo: number
  /** ป้ายรหัสแบบที่แสดงอยู่เดิม — ไม่ส่งมาจะแสดงรหัสเป็นข้อความธรรมดา */
  children?: React.ReactNode
  className?: string
}

/**
 * ป้ายรหัสแบบ คบ. พร้อมไอคอน (i) — ชี้/โฟกัส/แตะที่ป้ายหรือไอคอนเพื่อดูชื่อเต็มและคำอธิบายสั้นของแบบ
 * วาดผ่าน portal แบบ fixed เพื่อไม่ถูกตัดโดย container ที่ overflow (ตาราง/โมดัล)
 */
export const FormCodeTooltip: React.FC<FormCodeTooltipProps> = ({ formNo, children, className }) => {
  const meta = FORMS_CATALOG.find((f) => f.n === formNo)
  const tooltipId = useId()
  const anchorRef = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [pinned, setPinned] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const open = hovered || focused || pinned

  const place = useCallback(() => {
    const anchor = anchorRef.current
    const tip = tipRef.current
    if (!anchor || !tip) return
    const a = anchor.getBoundingClientRect()
    const h = tip.offsetHeight
    const w = tip.offsetWidth
    // วางเหนือป้ายถ้ามีที่ ไม่เช่นนั้นวางใต้ป้าย และไม่ให้ล้นขอบซ้าย/ขวา
    const above = a.top - GAP - h >= EDGE
    const top = above ? a.top - GAP - h : a.bottom + GAP
    const left = Math.min(Math.max(a.left, EDGE), window.innerWidth - w - EDGE)
    setPos({ left: Math.max(left, EDGE), top })
  }, [])

  useLayoutEffect(() => {
    if (open) place()
    else setPos(null)
  }, [open, place])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPinned(false)
        setHovered(false)
        setFocused(false)
      }
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setPinned(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, place])

  if (!meta) return <>{children}</>

  return (
    <span
      ref={anchorRef}
      data-testid="form-code-tooltip"
      className={cn('inline-flex shrink-0 items-center gap-1', className)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {children ?? <span className="font-bold text-blue">{meta.code}</span>}
      <button
        type="button"
        aria-label={`คำอธิบายแบบ ${meta.code}`}
        aria-describedby={open ? tooltipId : undefined}
        aria-expanded={open}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[0.8rem] text-blue-400 transition hover:bg-blue-soft hover:text-blue focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-[rgba(202,166,49,.45)]"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setPinned((v) => !v)
        }}
      >
        <i className="fa-solid fa-circle-info" aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={tooltipId}
            role="tooltip"
            className="pointer-events-none fixed z-[1000] rounded-xl border border-line bg-white p-3 text-left shadow-[0_8px_25px_rgba(8,43,80,.12)]"
            style={{
              width: `min(${TOOLTIP_W}px, calc(100vw - ${EDGE * 2}px))`,
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <p className="text-[0.8rem] font-semibold leading-snug text-navy">
              <span className="mr-1 font-bold text-blue">{meta.code}</span>
              {meta.t}
            </p>
            <p className="mt-1.5 text-[0.8rem] leading-relaxed text-slate-700">{meta.d}</p>
          </div>,
          document.body,
        )}
    </span>
  )
}
